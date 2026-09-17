package com.study.workbench;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 星途 · 安卓壳 —— 后台消息轮询前台服务（R73 需求18-①）
 * ===============================================================
 * 问题：WebView 退到后台 / 界面销毁后，页面 JS（assets/notify.js 的 8s 轮询）
 *       完全停摆，于是「退出软件后对方发来消息不再弹横幅」。
 *
 * 方案（无 FCM 的自建服务端场景下唯一近实时方案）：
 *   · 前台服务（Foreground Service）让进程常驻，系统通知栏常驻一条低优先级保活通知；
 *   · 服务在原生侧（不依赖 WebView）定时 HTTP GET {base}/api/chat/unread
 *     （base/token 由 MainActivity 经 AndroidBridge.setNotifyConfig 写入 SharedPreferences）；
 *   · 未读数上升 → 弹系统通知横幅（点击回到 MainActivity）。
 *
 * 边界：
 *   · App 在前台时页面 JS 自己会弹（AndroidBridge.notify），本服务只更新基线、不弹，避免重复；
 *   · 「彻底划掉后台 / 被系统回收」后重新拉起依赖 START_STICKY，真机 ROM 差异较大，
 *     必要时引导用户加入电池优化白名单（AndroidBridge.requestIgnoreBatteryOptimizations）；
 *   · 本服务只读未读数，不修改任何后端状态。
 */
public class MsgPollService extends Service {

    /** 供 MainActivity 写入/读取的配置（同进程 SharedPreferences）。 */
    public static final String PREFS = "xt_notify_prefs";
    public static final String KEY_BASE = "api_base";
    public static final String KEY_TOKEN = "token";

    /** MainActivity 前台状态：前台时页面 JS 会自己弹通知，本服务不重复弹。 */
    public static volatile boolean appForeground = false;

    private static final String ALIVE_CHANNEL_ID = "xt_keepalive";
    private static final String MSG_CHANNEL_ID = "xt_msg";
    private static final int ALIVE_NOTIFY_ID = 102;
    private static final int MSG_NOTIFY_ID = 101;
    private static final long POLL_MS = 15000L;       // 15s 一轮
    private static final long START_DELAY_MS = 3000L; // 启动后先等 3s（等配置写入 / token 就位）

    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile boolean running = false;
    private Thread worker = null;
    /** 上次已知未读总数；-1 = 尚未建立基线（首轮只建基线不弹）。 */
    private long lastTotal = -1L;
    private volatile String lastPeerName = "";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try { startForeground(ALIVE_NOTIFY_ID, buildAliveNotification()); }
        catch (Throwable e) { /* 前台通知失败：服务仍尝试运行 */ }
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
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* ---------------- 轮询主循环 ---------------- */

    private void pollLoop() {
        sleep(START_DELAY_MS);
        while (running) {
            try { pollOnce(); } catch (Throwable e) { /* 单轮失败不影响后续 */ }
            sleep(POLL_MS);
        }
    }

    private void pollOnce() {
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String base = sp.getString(KEY_BASE, "");
        String token = sp.getString(KEY_TOKEN, "");
        if (base == null) base = "";
        if (token == null) token = "";
        if (token.isEmpty()) { lastTotal = -1L; return; }   // 未登录：不做任何事
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        String url = base + "/api/chat/unread";

        String body = httpGet(url, token);
        if (body == null) return;                            // 网络失败：保持状态，下轮再试

        long total = extractTotal(body);
        if (total < 0) return;                               // 解析失败：保持状态
        String peer = extractFirstPeer(body);

        if (lastTotal < 0) {                                 // 首轮只建基线
            lastTotal = total;
            lastPeerName = peer;
            return;
        }
        boolean grew = total > lastTotal;
        long delta = total - lastTotal;
        lastTotal = total;
        if (peer != null && !peer.isEmpty()) lastPeerName = peer;
        if (!grew) return;
        if (appForeground) return;                           // 前台由页面 JS 弹，避免重复
        notifyMessage(lastPeerName, delta, total);
    }

    /* ---------------- 网络 ---------------- */

    private String httpGet(String url, String token) {
        HttpURLConnection conn = null;
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

    /* ---------------- 极简 JSON 取值（不引第三方库） ---------------- */

    /** 取顶层 "total" 的整数值；找不到返回 -1。 */
    private long extractTotal(String body) {
        try {
            int i = body.indexOf("\"total\"");
            if (i < 0) return -1;
            int c = body.indexOf(':', i);
            if (c < 0) return -1;
            int j = c + 1;
            while (j < body.length() && (body.charAt(j) == ' ' || body.charAt(j) == '\t')) j++;
            int k = j;
            while (k < body.length() && Character.isDigit(body.charAt(k))) k++;
            if (k == j) return -1;
            return Long.parseLong(body.substring(j, k));
        } catch (Throwable e) { return -1; }
    }

    /** 取第一个会话项的昵称（"items" 之后第一个 "nickname":"xxx"）；无则空串。 */
    private String extractFirstPeer(String body) {
        try {
            int items = body.indexOf("\"items\"");
            int from = items >= 0 ? items : 0;
            int i = body.indexOf("\"nickname\"", from);
            if (i < 0) return "";
            int c = body.indexOf(':', i);
            if (c < 0) return "";
            int q1 = body.indexOf('"', c + 1);
            if (q1 < 0) return "";
            int q2 = body.indexOf('"', q1 + 1);
            if (q2 < 0) return "";
            return body.substring(q1 + 1, q2);
        } catch (Throwable e) { return ""; }
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
                nm.createNotificationChannel(c);
            }
            if (nm.getNotificationChannel(MSG_CHANNEL_ID) == null) {
                NotificationChannel c2 = new NotificationChannel(MSG_CHANNEL_ID, "消息通知", NotificationManager.IMPORTANCE_HIGH);
                c2.setDescription("星途 · 收到新消息时弹出横幅提醒");
                nm.createNotificationChannel(c2);
            }
        } catch (Throwable e) { /* 渠道创建失败：静默 */ }
    }

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
        b.setContentTitle("星途正在运行");
        b.setContentText("随时接收新消息");
        b.setOngoing(true);
        b.setContentIntent(pi);
        return b.build();
    }

    private void notifyMessage(final String peer, final long delta, final long total) {
        ui.post(new Runnable() {
            @Override public void run() {
                try {
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm == null) return;
                    Intent open = new Intent(MsgPollService.this, MainActivity.class);
                    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;
                    PendingIntent pi = PendingIntent.getActivity(MsgPollService.this, 0, open, piFlags);
                    Notification.Builder b;
                    if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(MsgPollService.this, MSG_CHANNEL_ID);
                    else b = new Notification.Builder(MsgPollService.this);
                    b.setSmallIcon(R.drawable.ic_launcher);
                    String name = (peer == null || peer.isEmpty()) ? "" : peer;
                    b.setContentTitle(name.isEmpty() ? "收到新消息" : (name + " 发来新消息"));
                    b.setContentText("共 " + total + " 条未读（新增 " + delta + " 条）");
                    b.setAutoCancel(true);
                    b.setContentIntent(pi);
                    nm.notify(MSG_NOTIFY_ID, b.build());
                } catch (Throwable e) { /* 通知失败：静默 */ }
            }
        });
    }

    private void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
