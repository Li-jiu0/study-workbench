package com.study.workbench;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * 星途 · 安卓壳 —— 后台消息轮询前台服务（R73 需求18-①，R105 全面升级）
 * ===============================================================
 * R73 版本：15s 固定间隔轮询 /api/chat/unread（total 增长即弹横幅）。
 * R105 升级（本期）：
 *   1. 前台服务 + 常驻低优先级保活通知「星途正在守护消息」（id 固定，不发声不振动）；
 *   2. 轮询节奏：亮屏 60s/次、灭屏 120s/次（PollLogic；PowerManager + SCREEN_ON/OFF 广播，
 *      Handler/后台线程实现，不引第三方库）；
 *   3. 轮询接口升级为 GET /api/chat/unread-summary（后端线契约，见 PollLogic）：
 *      {"ok":true,"items":[{"id":123,"type":"peer","name":"昵称","unread":2,
 *       "last":{"preview":"…","sender":"…","time":1726700000000}}]}
 *      仅含 unread>0 条目、time 降序、最多 20 条，type 取 "peer"|"group"；
 *   4. 通知去重：比对上次快照（PollLogic.diffSnapshots），按条目 id + last.time
 *      判新，title=会话名（群聊时 text 前缀发送人），text=内容预览；
 *   5. 点击通知 → 携 extras（xt_open_conversation/xt_msg_type/xt_msg_id/xt_msg_name）
 *      打开 MainActivity → 转发 WebView 直达会话（最终注入调用见 MainActivity TODO）；
 *   6. 仅已登录轮询（token 非空）；token 失效（HTTP 401）自动停止；
 *   7. 设置页开关（MainActivity 桥 setMsgNotify → KEY_ENABLED）：关=停止轮询+取消通知，
 *      开=恢复；开机由 BootReceiver 按开关+登录态拉起；
 *   8. Android 13+ 未授予 POST_NOTIFICATIONS：服务照常运行，只是不弹横幅，绝不崩溃。
 *
 * 边界：
 *   · App 在前台时页面 JS 自己会弹（AndroidBridge.notify），本服务只更新快照不弹，避免重复；
 *   · 「彻底划掉后台 / 被系统回收」后重新拉起依赖 START_STICKY，真机 ROM 差异较大，
 *     已配套 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS（MainActivity 桥有引导）；
 *   · 本服务只读未读摘要，不修改任何后端状态。
 */
public class MsgPollService extends Service {

    /** 供 MainActivity / BootReceiver 写入读取的配置（同进程 SharedPreferences）。 */
    public static final String PREFS = "xt_notify_prefs";
    public static final String KEY_BASE = "api_base";
    public static final String KEY_TOKEN = "token";
    /** R105：设置页消息通知开关（缺省 true，保持 R73 行为兼容）。 */
    public static final String KEY_ENABLED = "notify_enabled";

    /** MainActivity 前台状态：前台时页面 JS 会自己弹通知，本服务不重复弹。 */
    public static volatile boolean appForeground = false;

    /** 【需求C】轮询线程存活静态标志：onStartCommand 起线程时置 true、onDestroy/cleanupAndStop 置 false。
     *  供 PollKeepAliveJobService.onStartJob 自检「服务是否还在跑」（静态可读，JobService 无实例引用）。 */
    public static volatile boolean sRunning = false;

    private static final String ALIVE_CHANNEL_ID = "xt_keepalive";
    /** 【需求C】消息渠道 id 由 xt_msg 改 xt_msg_v2：渠道设置跨安装保留且程序无法升级 importance，
     *  设备上若残留过旧版创建的低 importance 渠道（或被用户手动关了横幅），代码永远无法修正 ——
     *  换新渠道 id 一次性绕开历史状态，强制 IMPORTANCE_HIGH（旧 xt_msg 遗留不动，任其自然闲置）。 */
    private static final String MSG_CHANNEL_ID = "xt_msg_v2";
    /** 【R3-L3】对外暴露的消息渠道 id（MainActivity 跳渠道设置页 EXTRA_CHANNEL_ID 需要）。 */
    public static final String PUBLIC_MSG_CHANNEL_ID = MSG_CHANNEL_ID;
    /** 保活常驻通知 id（固定，同 id 重复 post 只更新不堆叠）。MainActivity 取消时也要用。 */
    public static final int ALIVE_NOTIFY_ID = 102;
    /**
     * 【R3-L3】新消息横幅通知 id 基址（不再用固定单值 101）。
     * -----------------------------------------------------------------
     * 背景：Android 更新一条「已存在」的通知时，默认不再重复弹 heads-up 横幅；
     * 旧实现所有会话共用固定 id=101，导致「A 会话弹过一次后，B 会话新消息只静默更新、不弹顶」。
     * 策略：按会话 id 派生通知 id —— 同一会话的连续消息仍复用同一 id（后浪覆盖前浪，
     * 不刷屏，符合 IM 习惯），不同会话各自独立 id（各自一条、各自弹横幅）。
     * 占用核对（同包名空间内，见全文 .notify( 调用）：
     *   · MainActivity.NOTIFY_ID           = 101（前台 JS 弹条，非本服务）
     *   · MsgPollService.ALIVE_NOTIFY_ID   = 102（保活常驻）
     *   · LocationShareService.NOTIFY_ID   = 103（位置共享前台）
     *   · 本服务派生区间 [100000, 199999]，与上述 101/102/103 及彼此的 job id(20031) 完全不重叠。
     */
    public static final int MSG_NOTIFY_ID_BASE = 100000;
    /** 派生步长上限：convId 取模后落入 [0,99999]，保证基址区间不越界。 */
    private static final int MSG_NOTIFY_ID_MOD = 100000;

    /**
     * 【向后兼容】旧常量保留为「基址」，供 MainActivity.cancelPollNotifications 等引用；
     * 语义已由「固定单实例 id」升级为「派生区间基址」。派生见 msgNotifyIdFor()。
     */
    public static final int MSG_NOTIFY_ID = MSG_NOTIFY_ID_BASE;

    /** 由会话 id 派生通知 id：不同会话独立、同会话稳定复用（保证后浪覆盖前浪不刷屏）。
     *  结果恒落入 [MSG_NOTIFY_ID_BASE, MSG_NOTIFY_ID_BASE+99999]，不越界、不撞既有 101/102/103。
     *  convId 为负或极端值（Long.MIN_VALUE）时，用 floorMod 保证取模非负。 */
    public static int msgNotifyIdFor(long convId) {
        int mod = (int) Math.floorMod(convId, (long) MSG_NOTIFY_ID_MOD);
        return MSG_NOTIFY_ID_BASE + mod;
    }
    /** 启动后先等 3s（等配置写入 / token 就位）。 */
    private static final long START_DELAY_MS = 3000L;

    private final Handler ui = new Handler(Looper.getMainLooper());
    /** 轮询节奏锁：灭/亮屏切换时立即唤醒等待中的轮询线程应用新间隔。 */
    private final Object pollLock = new Object();
    private volatile boolean running = false;
    private volatile boolean screenOn = true;
    private volatile boolean tokenInvalid = false;
    private Thread worker = null;
    /** 上次快照（会话 id → last.time）。只允许轮询线程访问，无需加锁。 */
    private final HashMap<Long, Long> snapshot = new HashMap<Long, Long>();
    /** 【R3-L3】已弹过横幅的会话 id 集合（派生通知 id 用），用于 cleanup 时精确取消全部派生通知。
     *  静态：即使服务已销毁、MainActivity 也要能按此集合取消（设置页关开关场景）。
     *  跨线程访问（轮询线程写、UI 线程读），用 synchronizedSet 保证安全。 */
    private static final java.util.Set<Long> notifiedConvIds =
            java.util.Collections.synchronizedSet(new java.util.HashSet<Long>());

    /** 【R3-L3】进程内取消本服务全部派生消息通知 + 保活通知（供 MainActivity 设置页关开关复用）。
     *  不依赖服务实例存活；无集合内容时也兜底 cancel 基址槽位。 */
    public static void cancelAllMsgNotifications(Context ctx) {
        if (ctx == null) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            java.util.List<Long> convs;
            synchronized (notifiedConvIds) { convs = new ArrayList<Long>(notifiedConvIds); }
            for (Long c : convs) {
                if (c != null) nm.cancel(msgNotifyIdFor(c.longValue()));
            }
            notifiedConvIds.clear();
            nm.cancel(MSG_NOTIFY_ID_BASE);  // 兜底基址槽位
            nm.cancel(ALIVE_NOTIFY_ID);
        } catch (Throwable e) { /* 静默 */ }
    }
    /** 【R6-双弹窗 2026-09-20】仅取消派生「消息通知」，不动保活常驻通知（ALIVE_NOTIFY_ID）。
     *  场景：App 回前台（MainActivity.onResume）——后台期间弹出的系统横幅若不清掉，
     *  会与页面 JS 的应用内横幅同屏重叠（用户实测双弹窗）。前台服务仍在跑，
     *  保活通知必须保留，故不能用 cancelAllMsgNotifications（它会连保活一起清）。 */
    public static void cancelMessageNotificationsOnly(Context ctx) {
        if (ctx == null) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            java.util.List<Long> convs;
            synchronized (notifiedConvIds) { convs = new ArrayList<Long>(notifiedConvIds); }
            for (Long c : convs) {
                if (c != null) nm.cancel(msgNotifyIdFor(c.longValue()));
            }
            notifiedConvIds.clear();
            nm.cancel(MSG_NOTIFY_ID_BASE);  // 兜底基址槽位
        } catch (Throwable e) { /* 静默 */ }
    }

    /** 是否已建立基线快照（首轮只建基线不弹；token 失效/登出时复位）。 */
    private boolean baselineReady = false;
    /** 最近一次 HTTP 状态码（httpGet 写、pollOnce 读，均在轮询线程，无需并发保护）。 */
    private int lastHttpStatus = 0;
    private BroadcastReceiver screenReceiver = null;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels();
        // 【需求C】调度/刷新 15 分钟周期保活 Job（幂等：同 JOB_ID 覆盖；MainActivity.onCreate 也会调，双保险）
        PollKeepAliveJobService.scheduleKeepAlive(this);
        // 初始屏幕状态：无 PowerManager（极端 ROM）按亮屏处理，间隔取小值保实时
        boolean interactive = true;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) interactive = pm.isInteractive();
        } catch (Throwable e) { /* 取不到按亮屏处理 */ }
        screenOn = interactive;
        registerScreenReceiver();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        tokenInvalid = false; // setNotifyConfig 重新登录后再次拉起时复位
        try { startForeground(ALIVE_NOTIFY_ID, buildAliveNotification()); }
        catch (Throwable e) { /* 前台通知失败：服务仍尝试运行 */ }
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean(KEY_ENABLED, true)) {
            // 开关为关：清理通知并停止（设置页关闭时通常已 stopService，这里是双保险）
            cleanupAndStop();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            sRunning = true;   // 【需求C】同步静态存活标志（JobService 自检用）
            worker = new Thread(new Runnable() {
                @Override public void run() { pollLoop(); }
            }, "xt-msg-poll");
            worker.setDaemon(true);
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        sRunning = false;      // 【需求C】同步静态存活标志
        worker = null;
        unregisterScreenReceiver();
        wakePoller();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* ---------------- 亮/灭屏监听（动态注册，系统不允许静态注册） ---------------- */

    private void registerScreenReceiver() {
        if (screenReceiver != null) return;
        try {
            screenReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    String action = intent == null ? null : intent.getAction();
                    if (Intent.ACTION_SCREEN_ON.equals(action)) screenOn = true;
                    else if (Intent.ACTION_SCREEN_OFF.equals(action)) screenOn = false;
                    else return;
                    wakePoller(); // 立即唤醒：应用新的轮询间隔
                }
            };
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_SCREEN_ON);
            f.addAction(Intent.ACTION_SCREEN_OFF);
            registerReceiver(screenReceiver, f);
        } catch (Throwable e) {
            screenReceiver = null; // 注册失败：沿用初始屏幕状态，服务照常轮询
        }
    }

    private void unregisterScreenReceiver() {
        if (screenReceiver == null) return;
        try { unregisterReceiver(screenReceiver); } catch (Throwable e) { /* 静默 */ }
        screenReceiver = null;
    }

    private void wakePoller() {
        try {
            synchronized (pollLock) { pollLock.notifyAll(); }
        } catch (Throwable e) { /* 静默 */ }
    }

    /* ---------------- 轮询主循环（后台线程） ---------------- */

    private void pollLoop() {
        sleep(START_DELAY_MS);
        while (running && !tokenInvalid) {
            try { pollOnce(); } catch (Throwable e) { /* 单轮失败不影响后续 */ }
            if (!running || tokenInvalid) break;
            final long interval = PollLogic.intervalFor(screenOn);
            synchronized (pollLock) {
                try { pollLock.wait(interval); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
        }
        if (tokenInvalid) {
            ui.post(new Runnable() {
                @Override public void run() { cleanupAndStop(); }
            });
        }
    }

    private void pollOnce() {
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String base = sp.getString(KEY_BASE, "");
        String token = sp.getString(KEY_TOKEN, "");
        boolean enabled = sp.getBoolean(KEY_ENABLED, true);
        if (base == null) base = "";
        if (token == null) token = "";
        if (!PollLogic.shouldPoll(token, enabled)) {
            // 未登录或开关关：清快照（重新登录后首轮重建基线），不轮询
            snapshot.clear();
            baselineReady = false;
            if (!enabled) cleanupAndStop();
            return;
        }
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        String url = base + "/api/chat/unread-summary";

        String body = httpGet(url, token);
        int status = PollLogic.onHttpStatus(lastHttpStatus);
        if (status == PollLogic.HTTP_STOP_TOKEN_INVALID) {
            // token 失效：自动停（等前端重新登录 setNotifyConfig 后再由 MainActivity 拉起）
            tokenInvalid = true;
            snapshot.clear();
            baselineReady = false;
            return;
        }
        if (body == null) return; // 网络失败/非 200：保持快照，下轮再试
        if (!parseAndNotify(body)) return; // 解析失败：保持快照
    }

    /* ---------------- 网络 ---------------- */

    /** GET 请求；返回响应体，网络失败返回 null；HTTP 状态码写入 lastHttpStatus。 */
    private String httpGet(String url, String token) {
        HttpURLConnection conn = null;
        lastHttpStatus = 0;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
            conn.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
            int code = conn.getResponseCode();
            lastHttpStatus = code;
            if (code != 200) return null;
            InputStream in = conn.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            return new String(bos.toByteArray(), "UTF-8");
        } catch (Throwable e) {
            return null;
        } finally {
            if (conn != null) { try { conn.disconnect(); } catch (Throwable e) { } }
        }
    }

    /* ---------------- 响应解析 + 通知决策（JSON 用 org.json，零第三方依赖） ---------------- */

    /**
     * 解析 unread-summary 响应 → 与快照比对 → 弹需要的通知。
     * @return true=解析成功（快照已更新）；false=响应结构异常（快照不动）。
     */
    private boolean parseAndNotify(String body) {
        List<long[]> idTimeList = new ArrayList<long[]>();      // 每项 {id, time}
        List<String[]> metaList = new ArrayList<String[]>();    // 每项 {type, name, preview, sender}
        try {
            JSONObject root = new JSONObject(body);
            if (!root.optBoolean("ok", false)) return false;
            JSONArray items = root.optJSONArray("items");
            if (items == null) return false;
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null) continue;
                long id = it.optLong("id", -1L);
                if (id < 0) continue;
                JSONObject last = it.optJSONObject("last");
                long time = (last == null) ? 0L : last.optLong("time", 0L);
                String type = it.optString("type", "peer");
                String name = it.optString("name", "");
                String preview = (last == null) ? "" : last.optString("preview", "");
                String sender = (last == null) ? "" : last.optString("sender", "");
                idTimeList.add(new long[] { id, time });
                metaList.add(new String[] { type, name, preview, sender });
            }
        } catch (Throwable e) {
            return false; // 非法 JSON：快照不动，下轮再试
        }

        // 去重决策（纯逻辑在 PollLogic，可单测）
        List<Integer> hits = PollLogic.diffSnapshots(snapshot, idTimeList, !baselineReady);
        baselineReady = true;

        if (appForeground) return true; // 前台由页面 JS 弹，快照已更新即可，避免重复
        for (Integer idx : hits) {
            int i = idx.intValue();
            String[] meta = metaList.get(i);
            notifyMessage(idTimeList.get(i)[0], meta[0], meta[1], meta[2], meta[3]);
        }
        return true;
    }

    /* ---------------- 通知 ---------------- */

    private void ensureChannels() {
        try {
            if (Build.VERSION.SDK_INT < 26) return;
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(ALIVE_CHANNEL_ID) == null) {
                NotificationChannel c = new NotificationChannel(ALIVE_CHANNEL_ID, "后台保活", NotificationManager.IMPORTANCE_MIN);
                c.setDescription("星途在后台保持运行，以便及时收到新消息通知");
                c.setShowBadge(false);
                c.setSound(null, null);
                c.enableVibration(false);
                nm.createNotificationChannel(c);
            }
            if (nm.getNotificationChannel(MSG_CHANNEL_ID) == null) {
                NotificationChannel c2 = new NotificationChannel(MSG_CHANNEL_ID, "消息通知", NotificationManager.IMPORTANCE_HIGH);
                c2.setDescription("星途 · 收到新消息时弹出横幅提醒");
                // 【R3-L3】显式开启振动 + 系统默认铃声：渠道 importance 已达 HIGH 一般会弹横幅，
                // 但不少国产 ROM 把「无声/无振动渠道」判定为静默、不弹 heads-up。
                // 显式声明为「有声音 + 会振动」的提醒型渠道，尽量对齐微信的横幅行为。
                // 注：渠道一经创建、其设置由系统/用户固化，改代码不会升级既有渠道；
                // 渠道若被用户手动关闭横幅/降级，App 无法用代码提回，只能引导用户手动开（MainActivity 已补引导）。
                c2.enableVibration(true);
                c2.setVibrationPattern(new long[] { 0L, 200L, 100L, 200L }); // 短促两下，不刺耳
                c2.setSound(android.media.RingtoneManager.getDefaultUri(
                        android.media.RingtoneManager.TYPE_NOTIFICATION), null);
                c2.setShowBadge(true);
                nm.createNotificationChannel(c2);
            } else {
                // 【需求C】渠道自检：渠道设置跨安装保留且程序无法升级 importance ——
                // 若该渠道 importance 低于 HIGH（历史遗留/被用户手动降级），打观测日志
                // （只打 id 与 importance 等级，不含任何坐标/消息内容）。
                NotificationChannel cur = nm.getNotificationChannel(MSG_CHANNEL_ID);
                if (cur != null && cur.getImportance() < NotificationManager.IMPORTANCE_HIGH) {
                    android.util.Log.w("MsgPollService",
                            "notify channel importance degraded: " + MSG_CHANNEL_ID
                                    + " importance=" + cur.getImportance());
                }
            }
        } catch (Throwable e) { /* 渠道创建失败：静默 */ }
    }

    /** 常驻低优先级保活通知（id 固定，不发声不振动）。 */
    private Notification buildAliveNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, ALIVE_CHANNEL_ID);
        else b = new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_launcher);
        b.setContentTitle("星途正在守护消息");
        b.setContentText("后台低频同步新消息，点击进入");
        b.setOngoing(true);
        b.setContentIntent(pi);
        return b.build();
    }

    /**
     * 弹新消息横幅。title=会话名（对方昵称/群名）；
     * text=内容预览（群聊且有发送人时前缀「发送人：」，与后端契约字段对齐）。
     * 点击携 extras 打开 MainActivity（深链转发见 MainActivity.handleOpenIntent）。
     * Android 13+ 未授予 POST_NOTIFICATIONS：直接跳过，不崩溃、不影响服务。
     */
    private void notifyMessage(final long convId, final String type,
                               final String name, final String preview, final String sender) {
        ui.post(new Runnable() {
            @Override public void run() {
                try {
                    if (Build.VERSION.SDK_INT >= 33
                            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        return; // 无通知权限：服务照常跑，只是不弹横幅
                    }
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm == null) return;

                    // 深链 extras：点击通知 → MainActivity（onCreate/onNewIntent 统一处理）
                    Intent open = new Intent(MsgPollService.this, MainActivity.class);
                    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    open.putExtra("xt_open_conversation", true);
                    open.putExtra("xt_msg_id", convId);
                    open.putExtra("xt_msg_type", type == null ? "" : type);
                    open.putExtra("xt_msg_name", name == null ? "" : name);
                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;
                    // requestCode 用会话 id：不同会话的 PendingIntent 互不覆盖
                    PendingIntent pi = PendingIntent.getActivity(
                            MsgPollService.this, (int) convId, open, piFlags);

                    Notification.Builder b;
                    if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(MsgPollService.this, MSG_CHANNEL_ID);
                    else b = new Notification.Builder(MsgPollService.this);
                    b.setSmallIcon(R.drawable.ic_launcher);
                    String n = (name == null || name.isEmpty()) ? "新消息" : name;
                    b.setContentTitle(n);
                    boolean isGroup = "group".equals(type);
                    String text;
                    if (isGroup && sender != null && !sender.isEmpty()) {
                        text = sender + "：" + (preview == null ? "" : preview);
                    } else {
                        text = (preview == null || preview.isEmpty()) ? "收到新消息" : preview;
                    }
                    b.setContentText(text);
                    b.setAutoCancel(true);
                    b.setContentIntent(pi);
                    // 【R3-L3】补消息类语义 + 高优先级：系统据此优先以 heads-up 横幅呈现；
                    // PRIORITY_HIGH 主要对 Android 7.x 及以下/部分国产 ROM 生效（8.0+ 以渠道 importance 为准）。
                    b.setCategory(Notification.CATEGORY_MESSAGE);
                    b.setPriority(Notification.PRIORITY_HIGH);
                    // 【R3-L3】8.0 以下无渠道，直接把「默认铃声 + 振动」挂到 Builder 上（8.0+ 由渠道控制）。
                    if (Build.VERSION.SDK_INT < 26) {
                        b.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
                    }
                    // 【R3-L3】按会话派生 id：不同会话各自一条、各自弹横幅；
                    // 同会话复用同 id → 后一条覆盖前一条，不刷屏（符合 IM 习惯）。
                    notifiedConvIds.add(Long.valueOf(convId)); // 记下，cleanup 时按派生 id 精确取消
                    nm.notify(msgNotifyIdFor(convId), b.build());
                } catch (Throwable e) { /* 通知失败：静默 */ }
            }
        });
    }

    /** 清理：取消本服务全部通知 + 停止前台 + stopSelf。
     *  【R3-L3】消息横幅已按会话派生 id，故逐个 cancel 本服务弹过的会话通知；
     *  另兜底 cancel 基址槽位，防止任何历史遗留。 */
    private void cleanupAndStop() {
        cancelAllMsgNotifications(this); // 【R3-L3】统一走静态方法（派生 id 精确取消 + 兜底）
        try { stopForeground(true); } catch (Throwable e) { /* 静默 */ }
        try { stopSelf(); } catch (Throwable e) { /* 静默 */ }
        running = false;
        sRunning = false;   // 【需求C】同步静态存活标志
    }

    private void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
