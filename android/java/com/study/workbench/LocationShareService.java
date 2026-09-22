package com.study.workbench;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 星途 · 安卓壳 —— 实时位置共享前台服务（批5 / R104e）
 * ===============================================================
 * 用户口径「后台也持续共享」：App 切后台 / 熄屏后，位置必须继续上报。
 * 走【独立 location 前台服务】+【原生直接 POST】，不依赖 WebView JS 定时器
 * （后台 JS 会被系统冻结，只能由原生侧持续上报）。
 *
 * 为什么新建本服务而不是复用 MsgPollService：
 *   MsgPollService 的 foregroundServiceType="dataSync"，语义为「消息轮询」；
 *   把 location 塞进同一服务要写 "dataSync|location" 且 onStartCommand 须带
 *   FOREGROUND_SERVICE_TYPE_LOCATION，一个服务承担两套生命周期 → 语义/权限混乱。
 *   故新建独立服务（lead 决策）。
 *
 * 契约（见 _r104e_contract.txt §3 / §5）：
 *   · POST /api/live/tick  body {"shareId":..,"lat":..,"lng":..,"acc":..,"coord":"gcj02"} → {ok}
 *   · 上报节流：位移 > 30m 或 距上次上报 ≥ 15s 才发一次；首次定位立刻上报
 *   · 共享期间持 PARTIAL_WAKE_LOCK；401/403 自动停服；网络异常不停服但指数退避
 *   · 定位参数：minTime=5000ms（GPS）/ 15000ms（网络）、minDistance=0f
 *   · provider：**同时监听 GPS_PROVIDER 与 NETWORK_PROVIDER**，在 onLocationChanged 里
 *     按 accuracy + 新鲜度取最优（带滞回，防 GPS/网络来回抖）；由可见 Activity 点按发起，
 *     【不申请】ACCESS_BACKGROUND_LOCATION
 *
 * 🔴 坐标口径（本服务是全链路唯一的坐标转换点）：
 *   · 安卓 LocationManager（GPS / 网络）返回的是 **WGS-84** 原始坐标，而本 App 的底图
 *     （腾讯 GCJ-02 瓦片）与导航（高德 coordinate=gaode）都按 GCJ-02 解释，不转换会在国内
 *     产生几十~几百米的系统性固定偏移；故本服务在 onLocationChanged 里借
 *     CoordTransform 把 WGS-84 **转一次**成 GCJ-02；
 *   · 下游（doTick / buildTickBody / pushToJs / 服务端 / 所有渲染端）一律只处理 GCJ-02，
 *     **绝不在下游再转**（防双重偏移）；tick body 带 coord:"gcj02" 显式声明口径。
 *
 * 隐私 / 安全：
 *   · base / token 一律从既有 SharedPreferences（xt_notify_prefs 的 api_base / token）读取，绝不硬编码；
 *   · 日志【严禁】打印 lat/lng 明文，只打印「已上报 seq=N」这类不含坐标的进度；
 *   · 坐标流仅走内存 + 网络，绝不落库。
 */
public class LocationShareService extends Service implements LocationListener {

    private static final String TAG = "XT.LocShare";

    /** 复用 MsgPollService 的配置域（api_base / token 同源）。 */
    private static final String PREFS = MsgPollService.PREFS;      // "xt_notify_prefs"
    private static final String KEY_BASE = MsgPollService.KEY_BASE; // "api_base"
    private static final String KEY_TOKEN = MsgPollService.KEY_TOKEN; // "token"
    /** 本服务私有：持久化当前 shareId（START_STICKY 重投递 intent==null 时回读）。 */
    private static final String KEY_SHARE_ID = "loc_share_id";

    /** Intent extra：传入本次共享的 shareId。 */
    public static final String EXTRA_SHARE_ID = "xt_locshare_id";
    /** 通知「结束共享」动作：点击后停服。 */
    public static final String ACTION_STOP = "com.study.workbench.action.STOP_LOCSHARE";

    private static final String CHANNEL_ID = "xt_locshare";
    /** 常驻通知 id（固定，重复 post 只更新不堆叠）。 */
    private static final int NOTIFY_ID = 103;

    /** 定位请求间隔（真正的上报节流在 onLocationChanged 里做，这里只决定回调频率）。 */
    private static final long MIN_TIME_MS = 5000L;
    private static final float MIN_DISTANCE_M = 0f;

    /** 上报节流：位移 > 30m。 */
    private static final float THROTTLE_DISTANCE_M = 30f;
    /** 上报节流：距上次上报 ≥ 15s。 */
    private static final long THROTTLE_INTERVAL_MS = 15000L;

    /** 融合用：一个 fix 超过该年龄即视为过期，不参与「最优」评选。 */
    private static final long FIX_MAX_AGE_MS = 30000L;
    /** 融合用：切换 provider 的滞回系数 —— 候选精度要比当前最优好 30% 以上才切换，防止 GPS/网络来回抖。 */
    private static final double SWITCH_BETTER_RATIO = 1.3;
    /** NETWORK_PROVIDER 的请求间隔（比 GPS 稀疏，减少无谓回调）。 */
    private static final long NET_MIN_TIME_MS = 15000L;

    /** 指数退避上限（弱网下最多 60s 重试一次）。 */
    private static final long BACKOFF_MAX_MS = 60000L;

    private static final String UA =
            "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    private final Handler ui = new Handler(Looper.getMainLooper());

    private LocationManager lm = null;
    private PowerManager.WakeLock wakeLock = null;
    private ExecutorService executor = null;

    private volatile boolean running = false;
    private volatile String shareId = null;
    /** 已挂载 provider 的描述串（如 "gps+network"），仅用于日志。 */
    private volatile String activeProvider = null;

    /** 各 provider 最近一次原始（WGS-84）fix。 */
    private volatile Location gpsFix = null;
    private volatile Location netFix = null;
    /** 当前选用的最优 fix（滞回基准）。 */
    private volatile Location bestFix = null;
    /** 上次上报的 GCJ-02 坐标（节流基准，与上报同一坐标系）。null = 尚未上报。 */
    private volatile Double lastGcjLat = null;
    private volatile Double lastGcjLng = null;

    /** 上次成功上报的时间戳（节流用）。仅主线程/网络回调读写，volatile 保证可见性。 */
    private volatile long lastReportMs = 0L;

    /** 连续网络失败次数（指数退避），成功即归零。 */
    private volatile int failStreak = 0;
    /** 退避窗口：早于该时刻不发 tick。 */
    private volatile long nextAttemptMs = 0L;
    /** 已上报序号（仅用于不含坐标的观测日志）。 */
    private volatile int seq = 0;

    /* ================= 生命周期 ================= */

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 「结束共享」动作：幂等收尾
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopEverything();
            return START_NOT_STICKY;
        }

        // 先进入前台（Android 8+ startForegroundService 须在数秒内 startForeground）
        startForegroundCompat(buildNotification());

        // 解析 shareId：优先 Intent extra；START_STICKY 重投递时 intent 可能为 null → 回读持久化值
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String sid = (intent == null) ? null : intent.getStringExtra(EXTRA_SHARE_ID);
        if (sid == null || sid.trim().isEmpty()) {
            sid = sp.getString(KEY_SHARE_ID, "");
        }
        if (sid == null || sid.trim().isEmpty()) {
            // 读不到 shareId：无法上报，直接停（不空跑）
            stopEverything();
            return START_NOT_STICKY;
        }
        shareId = sid.trim();
        try { sp.edit().putString(KEY_SHARE_ID, shareId).apply(); } catch (Throwable e) { /* 落盘失败：本次仍可上报 */ }

        if (!running) {
            running = true;
            acquireWakeLock();
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (!hasLocationPermission() || lm == null || !attachProviders()) {
                Log.w(TAG, "无可用定位（权限未授予或定位总开关关闭），停止共享");
                stopEverything();
                return START_NOT_STICKY;
            }
            Log.i(TAG, "位置共享已启动");
        }
        // START_STICKY：被系统回收后尝试重启（重启 intent==null 时回读 shareId）
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        try { if (lm != null) lm.removeUpdates(this); } catch (Throwable e) { /* 静默 */ }
        lm = null;
        releaseWakeLock();
        try { if (executor != null) executor.shutdownNow(); } catch (Throwable e) { /* 静默 */ }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /* ================= 定位 ================= */

    /** 同时挂载 GPS 与 NETWORK（能挂几个挂几个）；返回是否至少挂上一个。 */
    private boolean attachProviders() {
        if (lm == null) return false;
        try { lm.removeUpdates(this); } catch (Throwable e) { /* 未注册：忽略 */ }
        StringBuilder ok = new StringBuilder();
        // GPS 需要 FINE 权限
        if (hasFinePermission() && isEnabled(LocationManager.GPS_PROVIDER)) {
            if (requestOne(LocationManager.GPS_PROVIDER, MIN_TIME_MS)) ok.append("gps");
        }
        // 网络定位 COARSE 即可
        if (hasCoarseOrFinePermission() && isEnabled(LocationManager.NETWORK_PROVIDER)) {
            if (requestOne(LocationManager.NETWORK_PROVIDER, NET_MIN_TIME_MS)) {
                if (ok.length() > 0) ok.append("+");
                ok.append("network");
            }
        }
        activeProvider = (ok.length() == 0) ? null : ok.toString();
        if (activeProvider != null) Log.i(TAG, "定位监听已挂载：" + activeProvider);
        return activeProvider != null;
    }

    /** 挂载单个 provider；失败返回 false。日志【只打 provider 名与异常类名，不打坐标】。 */
    private boolean requestOne(String provider, long minTimeMs) {
        try {
            lm.requestLocationUpdates(provider, minTimeMs, MIN_DISTANCE_M, this, Looper.getMainLooper());
            return true;
        } catch (Throwable e) {
            Log.w(TAG, "requestLocationUpdates 失败 provider=" + provider
                    + " : " + e.getClass().getSimpleName());
            return false;
        }
    }

    /** 该 provider 是否启用（异常视为不可用）。 */
    private boolean isEnabled(String provider) {
        try {
            return lm != null && lm.isProviderEnabled(provider);
        } catch (Throwable e) {
            return false;
        }
    }

    /** 是否持有精准定位（FINE）权限；API<23 视为已授予。 */
    private boolean hasFinePermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        try {
            return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Throwable e) {
            return false;
        }
    }

    /** 是否持有粗略或精准定位（COARSE 或 FINE）权限；API<23 视为已授予。 */
    private boolean hasCoarseOrFinePermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        try {
            return checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Throwable e) {
            return false;
        }
    }

    /**
     * 任一定位权限是否已授予（== hasCoarseOrFinePermission）。
     * 保留此方法作为 onStartCommand 的总入口守卫，语义与旧实现完全等价。
     */
    private boolean hasLocationPermission() {
        return hasCoarseOrFinePermission();
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;
        // 1) 记录各 provider 的原始（WGS-84）fix
        String p = location.getProvider();
        if (LocationManager.GPS_PROVIDER.equals(p)) gpsFix = location;
        else if (LocationManager.NETWORK_PROVIDER.equals(p)) netFix = location;

        // 2) 融合出最优 fix
        Location best = pickBestFix();
        if (best == null) return;

        // 3) 🔴 全工程唯一一次坐标系转换：WGS-84 → GCJ-02。
        //    下游（doTick / buildTickBody / pushToJs / 服务端 / 渲染端）一律只处理 GCJ-02，绝不再转。
        double[] gcj = CoordTransform.wgs84ToGcj02(best.getLatitude(), best.getLongitude());
        double lat = gcj[0], lng = gcj[1];

        // 4) 推 H5（每次定位都推，不受节流约束） + 上报服务端（走节流）
        pushToJs(lat, lng, best.getAccuracy(), best.getTime());
        maybeReport(lat, lng, best.getAccuracy());
    }

    /**
     * 融合出当前最优 fix：新鲜度过滤 + accuracy 择优 + 滞回；无新鲜候选时用最新的兜底。
     * 规则：① 只在新信号（age ≤ FIX_MAX_AGE_MS）里评优；② accuracy 最小者胜（<=0/NaN 视为不可信）；
     *      ③ 滞回：bestFix 仍新鲜且候选不明显更优（cand*1.3 > best）则保留 bestFix；
     *      ④ 无新鲜候选时返回 getTime() 最新者兜底，绝不返回 null 让上报停摆。
     */
    private Location pickBestFix() {
        Location g = isFresh(gpsFix) ? gpsFix : null;
        Location n = isFresh(netFix) ? netFix : null;
        Location candidate = betterOf(g, n);

        if (candidate == null) {
            // ④ 无任何新鲜候选：用最新的那个兜底（允许稍旧的 fix，但不让上报停摆）
            Location newest = newerOf(gpsFix, netFix);
            if (newest == null) return null;
            bestFix = newest;
            return bestFix;
        }

        // ③ 滞回：若当前 bestFix 仍新鲜，且候选不见得明显更好 → 保留 bestFix，不切换
        if (isFresh(bestFix)) {
            if (acc(candidate) * SWITCH_BETTER_RATIO > acc(bestFix)) {
                return bestFix;
            }
        }
        bestFix = candidate;
        return bestFix;
    }

    /** fix 是否新鲜（时间有效且未超过 FIX_MAX_AGE_MS）。 */
    private static boolean isFresh(Location fix) {
        if (fix == null) return false;
        long t = fix.getTime();
        if (t <= 0L) return false;
        return (System.currentTimeMillis() - t) <= FIX_MAX_AGE_MS;
    }

    /** accuracy 归一化为「越小越好」；<=0 或 NaN 视为不可信（Float.MAX_VALUE）。 */
    private static double acc(Location fix) {
        if (fix == null) return Float.MAX_VALUE;
        float a = fix.getAccuracy();
        if (Float.isNaN(a) || a <= 0f) return Float.MAX_VALUE;
        return a;
    }

    /** 取 accuracy 更优者（不可信视为最差）。 */
    private static Location betterOf(Location a, Location b) {
        if (a == null) return b;
        if (b == null) return a;
        return (acc(a) <= acc(b)) ? a : b;
    }

    /** 取时间更新者（兜底用，允许较旧 fix）。 */
    private static Location newerOf(Location a, Location b) {
        if (a == null) return b;
        if (b == null) return a;
        return (a.getTime() >= b.getTime()) ? a : b;
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) { /* 兼容旧 API：无需处理 */ }

    @Override
    public void onProviderEnabled(String provider) {
        Log.i(TAG, "定位 provider 已启用，重新挂载");
        if (running) attachProviders();
    }

    @Override
    public void onProviderDisabled(String provider) {
        Log.w(TAG, "定位 provider 被禁用：" + provider);
        // 重新挂载仍可用的 provider；两个都挂不上才停服（定位总开关被关）
        if (running && !attachProviders()) {
            Log.w(TAG, "已无可用定位 provider，停止共享");
            stopEverything();
        }
    }

    /* ================= 上报节流 + 网络 ================= */

    /**
     * 节流：位移 > 30m 或 距上次上报 ≥ 15s 才发 tick；首次定位立刻上报。
     * 🔴 入参 (lat,lng) 已是 GCJ-02，禁止在此再做坐标转换。
     */
    private void maybeReport(double lat, double lng, float acc) {
        if (!running) return;
        long now = System.currentTimeMillis();
        boolean first = (lastGcjLat == null || lastGcjLng == null);
        boolean farEnough = false;
        if (!first) {
            try {
                float[] out = new float[1];
                Location.distanceBetween(
                        lastGcjLat.doubleValue(), lastGcjLng.doubleValue(),
                        lat, lng, out);
                farEnough = out[0] > THROTTLE_DISTANCE_M;
            } catch (Throwable e) { farEnough = false; }
        }
        boolean timeEnough = (now - lastReportMs) >= THROTTLE_INTERVAL_MS;
        if (!(first || farEnough || timeEnough)) return;   // 未达节流门槛：不发
        if (now < nextAttemptMs) return;                    // 退避窗口内：不发（防止弱网疯狂重试）

        final String sid = shareId;
        if (sid == null) return;

        // 乐观更新节流基准（GCJ-02 坐标系内，按「尝试」节奏节流；失败由退避窗口兜底）
        lastGcjLat = lat;
        lastGcjLng = lng;
        lastReportMs = now;

        final double flat = lat;
        final double flng = lng;
        final float facc = acc;
        try {
            executor.execute(new Runnable() {
                @Override public void run() { doTick(sid, flat, flng, facc); }
            });
        } catch (Throwable e) { /* 线程池已关：忽略 */ }
    }

    /**
     * 子线程：POST /api/live/tick（字段名逐字照契约 §3）。
     * 🔴 入参 (lat,lng) 已是 GCJ-02，禁止在此再做坐标转换。
     */
    private void doTick(final String sid, final double lat, final double lng, final float acc) {
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String base = sp.getString(KEY_BASE, "");
        String token = sp.getString(KEY_TOKEN, "");
        if (base == null) base = "";
        if (token == null) token = "";
        if (base.trim().isEmpty() || token.trim().isEmpty()) {
            // 无 base/token：等同鉴权失效，自动停服
            Log.w(TAG, "缺少 base/token，停止共享");
            postStop();
            return;
        }
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        final String url = base + "/api/live/tick";

        HttpURLConnection conn = null;
        int code = 0;
        try {
            byte[] payload = buildTickBody(sid, lat, lng, acc).getBytes("UTF-8");
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
            conn.setRequestProperty("User-Agent", UA);
            OutputStream os = conn.getOutputStream();
            os.write(payload);
            os.flush();
            os.close();
            code = conn.getResponseCode();
        } catch (Throwable e) {
            onTickNetworkFailure();
            return;
        } finally {
            if (conn != null) { try { conn.disconnect(); } catch (Throwable e) { /* 静默 */ } }
        }

        if (code == 401 || code == 403) {
            Log.w(TAG, "tick 鉴权失败 HTTP " + code + "，自动停止共享");
            postStop();
            return;
        }
        if (code >= 200 && code < 300) {
            onTickSuccess();
        } else {
            onTickNetworkFailure();
        }
    }

    /**
     * body 用 org.json 构造，保证 shareId 转义与字段名精确（shareId / lat / lng / acc / coord）。
     * 🔴 入参 (lat,lng) 已是 GCJ-02，禁止在此再做坐标转换。
     *
     * acc：定位精度（米），供服务端下发到前端画「精度圈」与抑制低精度首点拉镜头。
     * coord：口径标记 "gcj02"。服务端对**没带该标记的旧客户端**按 WGS-84 兜底归一化，
     *        带了就原样存。两个字段【都必须带】。
     */
    private String buildTickBody(String sid, double lat, double lng, float acc) {
        try {
            JSONObject o = new JSONObject();
            o.put("shareId", sid);
            o.put("lat", lat);
            o.put("lng", lng);
            o.put("acc", (double) acc);
            o.put("coord", "gcj02");
            return o.toString();
        } catch (Throwable e) {
            return "{\"shareId\":\"" + escapeJson(sid) + "\",\"lat\":" + lat + ",\"lng\":" + lng
                    + ",\"acc\":" + acc + ",\"coord\":\"gcj02\"}";
        }
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.toString();
    }

    private void onTickSuccess() {
        failStreak = 0;
        nextAttemptMs = 0L;
        seq++;
        // 观测点：仅打印序号，【不含坐标明文】（真机 logcat 过滤 tag 即可证明后台持续上报）
        Log.i(TAG, "已上报 seq=" + seq);
    }

    private void onTickNetworkFailure() {
        failStreak++;
        long backoff = backoffFor(failStreak);
        nextAttemptMs = System.currentTimeMillis() + backoff;
        Log.w(TAG, "上报失败（网络），退避 " + (backoff / 1000) + "s 后重试");
    }

    /** 指数退避：5s,10s,20s,40s,60s,60s…（上限 60s）。 */
    private static long backoffFor(int streak) {
        long v = 5000L;
        for (int i = 1; i < streak && v < BACKOFF_MAX_MS; i++) v *= 2;
        return Math.min(v, BACKOFF_MAX_MS);
    }

    private void postStop() {
        ui.post(new Runnable() {
            @Override public void run() { stopEverything(); }
        });
    }

    /* ================= JS 回调（前台可见时） ================= */

    /**
     * 每次定位都推 window.__onLocationUpdate(JSON字符串)；JSON 用 JSONObject.quote 转义（见 MainActivity）。
     * 🔴 入参 (lat,lng) 已是 GCJ-02，禁止在此再做坐标转换；payload 字段名保持 lat/lng/acc/t 不变。
     */
    private void pushToJs(double lat, double lng, float acc, long t) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", lat);
            o.put("lng", lng);
            o.put("acc", (double) acc);
            o.put("t", t);
            MainActivity.pushLocationUpdate(o.toString());
        } catch (Throwable e) { /* 回调失败：不影响上报 */ }
    }

    /* ================= 前台通知 ================= */

    private void startForegroundCompat(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                // 三参重载（API29+）：显式声明 location 类型（Android 14 起强制）
                startForeground(NOTIFY_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                // API<29（minSdkVersion=21）：回落两参重载
                startForeground(NOTIFY_ID, n);
            }
        } catch (Throwable e) {
            try { startForeground(NOTIFY_ID, n); } catch (Throwable e2) { /* 静默 */ }
        }
    }

    private void ensureChannel() {
        try {
            if (Build.VERSION.SDK_INT < 26) return;
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel c = new NotificationChannel(
                        CHANNEL_ID, "位置共享", NotificationManager.IMPORTANCE_MIN);
                c.setDescription("共享实时位置期间在后台持续上报，结束后自动消失");
                c.setShowBadge(false);
                c.setSound(null, null);
                c.enableVibration(false);
                nm.createNotificationChannel(c);
            }
        } catch (Throwable e) { /* 渠道创建失败：静默 */ }
    }

    /** 常驻通知「正在共享位置」+「结束共享」动作 PendingIntent（可选，能加就加）。 */
    private Notification buildNotification() {
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(this, 0, open, piFlags);

        Intent stop = new Intent(this, LocationShareService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, piFlags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, CHANNEL_ID);
        else b = new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_launcher);
        b.setContentTitle("正在共享位置");
        b.setContentText("实时位置共享中，点击可返回应用");
        b.setOngoing(true);
        b.setContentIntent(contentPi);
        try { b.addAction(R.drawable.ic_launcher, "结束共享", stopPi); } catch (Throwable e) { /* 动作失败：不影响通知 */ }
        return b.build();
    }

    /* ================= 唤醒锁 ================= */

    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "xt:locshare");
            wakeLock.setReferenceCounted(false); // 非引用计数：release 一次即彻底释放，防泄漏
            wakeLock.acquire();
            Log.i(TAG, "已持 PARTIAL_WAKE_LOCK");
        } catch (Throwable e) {
            wakeLock = null;
            Log.w(TAG, "获取 wakelock 失败：" + e.getClass().getSimpleName());
        }
    }

    private void releaseWakeLock() {
        // try/finally 等价兜底：无论正常收尾还是异常路径，务必释放，绝不泄漏
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Throwable e) { /* 静默 */ } finally {
            wakeLock = null;
        }
    }

    /* ================= 收尾（幂等） ================= */

    /** removeUpdates + 释放 wakelock + stopForeground(true) + stopSelf（幂等，重复调用不崩）。 */
    private void stopEverything() {
        running = false;
        try { if (lm != null) lm.removeUpdates(this); } catch (Throwable e) { /* 静默 */ }
        lm = null;
        activeProvider = null;
        lastGcjLat = null;
        lastGcjLng = null;
        gpsFix = null;
        netFix = null;
        bestFix = null;
        releaseWakeLock();
        try { if (executor != null) executor.shutdownNow(); } catch (Throwable e) { /* 静默 */ }
        try { stopForeground(true); } catch (Throwable e) { /* 静默 */ }
        try { stopSelf(); } catch (Throwable e) { /* 静默 */ }
        Log.i(TAG, "位置共享已结束");
    }
}
