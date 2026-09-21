package com.study.workbench;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * 星途 · 开机自启接收器（R105）
 * =================================================
 * 收到系统 BOOT_COMPLETED 后：若消息通知开关为开（KEY_ENABLED）且本地留有
 * 登录 token（KEY_TOKEN），则拉起 MsgPollService 前台服务，继续后台守护消息。
 *
 * 说明：
 *  · 开关与 token 都在 SharedPreferences（xt_notify_prefs）里持久化，重启不丢；
 *  · Android 8.0+ 必须用 startForegroundService，且前台服务须在启动后调用
 *    startForeground（MsgPollService.onStartCommand 已做）；
 *  · Manifest 需声明 RECEIVE_BOOT_COMPLETED 权限与本 receiver（R105 已加）；
 *  · 任何异常都静默 —— 开机自启失败不影响用户手动打开 App（onCreate 的
 *    ensureMsgPollService 会再按开关+登录态恢复）。
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(final Context context, final Intent intent) {
        try {
            if (context == null || intent == null) return;
            if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
            final SharedPreferences sp = context.getSharedPreferences(
                    MsgPollService.PREFS, Context.MODE_PRIVATE);
            final boolean enabled = sp.getBoolean(MsgPollService.KEY_ENABLED, true);
            final String token = sp.getString(MsgPollService.KEY_TOKEN, "");
            if (!enabled || token == null || token.trim().isEmpty()) return; // 未开/未登录：不拉起
            final Intent svc = new Intent(context, MsgPollService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
        } catch (Throwable e) { /* 自启失败：静默 */ }
    }
}
