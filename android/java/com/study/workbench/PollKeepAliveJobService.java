package com.study.workbench;

import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * 星途 · 消息轮询拉活兜底 JobService（需求C，治「进程被杀 / 最近任务划掉后 START_STICKY 恢复不可靠」）
 * ===============================================================
 * 零第三方依赖（android.app.job.* 系统 API）：
 *   · 每 15 分钟周期调度一次（系统对周期 Job 的最低间隔即 15min，API24+）；
 *   · setPersisted(true)：重启后调度保留（依赖 RECEIVE_BOOT_COMPLETED，Manifest 已声明）；
 *   · onStartJob 自检：开关开 + 已登录 + MsgPollService 未在跑（静态标志 sRunning）
 *     → startForegroundService 拉起（BootReceiver 同款判定）；
 *   · 自检工作在 onStartJob 内同步完成（SharedPreferences 读 + startService，均毫秒级），
 *     完成即 jobFinished，不持有 wake lock 不阻塞系统。
 *
 * 调度点（幂等，同 JOB_ID 重复 schedule 即覆盖）：
 *   · MainActivity.onCreate（App 启动）；
 *   · MsgPollService.onCreate（服务每次拉起）。
 *
 * 任何异常都静默 —— 兜底拉活失败不影响主流程（START_STICKY / BootReceiver / 前端双保险仍在）。
 */
public class PollKeepAliveJobService extends JobService {

    /** 保活 Job id（固定；更新同 id Job 即覆盖，天然幂等）。 */
    public static final int JOB_ID = 20031;
    /** 周期：15 分钟（API24+ 系统最低周期；API21-23 无下限，取同值保持行为一致）。 */
    private static final long PERIODIC_MS = 15L * 60 * 1000;

    @Override
    public boolean onStartJob(final JobParameters params) {
        try {
            SharedPreferences sp = getSharedPreferences(
                    MsgPollService.PREFS, Context.MODE_PRIVATE);
            boolean enabled = sp.getBoolean(MsgPollService.KEY_ENABLED, true);
            String token = sp.getString(MsgPollService.KEY_TOKEN, "");
            if (enabled && token != null && !token.trim().isEmpty()
                    && !MsgPollService.sRunning) {
                // 服务未在跑（进程存活但服务被杀/被 stop）：拉起前台服务
                Intent svc = new Intent(this, MsgPollService.class);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc);
                else startService(svc);
            }
        } catch (Throwable e) { /* 拉活失败：静默，等下个周期再试 */ }
        try { jobFinished(params, false); } catch (Throwable e) { /* 静默 */ }
        return true;   // 工作已同步完成（jobFinished 已调），返回值不再有意义
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // 约束（网络/充电等）未设置，系统一般不会中途取消；返回 false 表示不重试本次
        return false;
    }

    /** 注册/刷新保活 Job（15min 周期 + setPersisted 重启保留）。任何异常静默。
     *  幂等：同 JOB_ID 重复 schedule 即覆盖，MainActivity 与 MsgPollService 可放心双保险。 */
    public static void scheduleKeepAlive(Context context) {
        try {
            if (context == null) return;
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            android.app.job.JobInfo info = new android.app.job.JobInfo.Builder(
                    JOB_ID, new ComponentName(context, PollKeepAliveJobService.class))
                    .setPeriodic(PERIODIC_MS)
                    .setPersisted(true)
                    .build();
            js.schedule(info);
        } catch (Throwable e) { /* 调度失败：静默，不影响主流程 */ }
    }
}
