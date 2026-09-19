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
 *   2. 轮询节奏：亮屏 60s/次、灭屏 300s/次（PowerManager + SCREEN_ON/OFF 广播，
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

    private static final String ALIVE_CHANNEL_ID = "xt_keepalive";
    private static final String MSG_CHANNEL_ID = "xt_msg";
    /** 保活常驻通知 id（固定，同 id 重复 post 只更新不堆叠）。MainActivity 取消时也要用。 */
    public static final int ALIVE_NOTIFY_ID = 102;
    /** 新消息横幅通知 id（固定：后一条覆盖前一条，避免横幅刷屏）。 */
    public static final int MSG_NOTIFY_ID = 101;
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
    /** 是否已建立基线快照（首轮只建基线不弹；token 失效/登出时复位）。 */
    private boolean baselineReady = false;
    /** 最近一次 HTTP 状态码（httpGet 写、pollOnce 读，均在轮询线程，无需并发保护）。 */
    private int lastHttpStatus = 0;
    private BroadcastReceiver screenReceiver = null;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels();
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
                nm.createNotificationChannel(c2);
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
                    nm.notify(MSG_NOTIFY_ID, b.build()); // 固定 id：后一条覆盖前一条，不刷屏
                } catch (Throwable e) { /* 通知失败：静默 */ }
            }
        });
    }

    /** 清理：取消本服务全部通知 + 停止前台 + stopSelf。 */
    private void cleanupAndStop() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(MSG_NOTIFY_ID);
                nm.cancel(ALIVE_NOTIFY_ID);
            }
        } catch (Throwable e) { /* 静默 */ }
        try { stopForeground(true); } catch (Throwable e) { /* 静默 */ }
        try { stopSelf(); } catch (Throwable e) { /* 静默 */ }
        running = false;
    }

    private void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
