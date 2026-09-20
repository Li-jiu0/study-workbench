package com.study.workbench;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.widget.FrameLayout;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 学习工作台 · 安卓单机版 WebView 壳（file:// 加载）
 * ---------------------------------------------------------------
 * 采用经典的 file:///android_asset 方式加载打包在 assets/ 里的页面，
 * 不依赖 androidx.webkit（WebViewAssetLoader 虚拟 https 域在部分机型/版本上
 * 会导致"静态文本 / 闪退"，已回归 file:// 稳定方案）。
 *
 * 数据存放在 WebView 的 localStorage（应用私有目录，卸载即清除）。
 *
 * - setDomStorageEnabled(true)：localStorage 必需（业务数据 key: study_workbench_data）。
 * - setAllowFileAccessFromFileURLs / setAllowUniversalAccessFromFileURLs：
 *   允许 file:///android_asset 页面内部跳转与跨页；后者预留将来连局域网后端。
 * - setMixedContentMode(COMPATIBILITY)：https 页面可访问 http 后端(预留)，单机无后端立即降级。
 * - onShowFileChooser：支持头像上传 / 插图选择（<input type="file">）。
 * - 【原生桥】AndroidBridge.saveFile：页面"导出 JSON / Markdown"落盘(WebView 不接管下载)。
 * - 【原生桥】AndroidTTS：网页发音走系统 TextToSpeech。
 *   v1.7 加固：默认引擎初始化失败（部分机型默认引擎缺失/被禁）时，自动枚举本机
 *   全部 TTS 引擎逐个尝试绑定；状态经 evaluateJavascript 推送给页面
 *   （window.__nativeTtsStatus），全部失败时页面给出系统设置指引。
 * - 返回键：网页历史可后退则后退，否则退出应用。
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE_CHOOSER = 1001;
    private WebView web;
    // 【R-黑边】最近一次下发到前端的状态栏高度（px）；-1 = 尚未取到（用于页面加载完成后补发与变更去抖）
    private int lastStatusBarTopPx = -1;
    private ValueCallback<Uri[]> filePathCallback;

    // ---- 【R103 需求1】H5 getUserMedia 麦克风授权：暂存的 WebView 权限请求 ----
    private android.webkit.PermissionRequest pendingWebPermissionRequest = null;
    // ---- 【R103 需求3】WebView H5 视频全屏：全屏自定义视图及其回调 ----
    private View customView = null;
    private WebChromeClient.CustomViewCallback customViewCallback = null;

    // ---- 原生消息通知（R72 需求5：收到消息弹系统横幅）----
    private static final String NOTIFY_CHANNEL_ID = "xt_msg";
    private static final int NOTIFY_ID = 101;
    private static final int REQ_NOTIFY_PERM = 2003;
    private static final int REQ_LOCATION_PERM = 2004;

    // ---- 【应用内更新下载】R101：系统 DownloadManager 后台下载 APK + 完成广播自动弹安装 ----
    private BroadcastReceiver apkDoneReceiver = null;
    private volatile String pendingNotifyTitle = null;
    private volatile String pendingNotifyText = null;
    private volatile String xtAndroidJs = null;   // R73：桥接胶水 assets/xt-android.js 内容缓存（注入前读一次）

    // ---- 【批5/R104e】实时位置共享：供 LocationShareService 回调 JS + 前台性判断 ----
    /** 当前 Activity 弱引用（避免静态持有造成内存泄漏）；Service 经此把定位推给页面。 */
    private static volatile java.lang.ref.WeakReference<MainActivity> sInstanceRef = null;
    /** 窗口是否获得焦点（由 onWindowFocusChanged 维护）。占位「可见前台」即用户可交互状态，
     *  用于「必须由可见 Activity 发起位置共享」的前台性判断（Android 11+ 后台启动前台服务会被拒）。 */
    private volatile boolean uiForeground = false;

    // ---- 原生 TTS（朗读发音）----
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile String ttsInfo = "初始化中";   // 人类可读的诊断信息，推送给页面
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final List<String> ttsFallbackEngines = new ArrayList<String>(); // 待尝试的本机引擎包名
    private final List<String> ttsAttemptedEngines = new ArrayList<String>(); // 已尝试过的引擎包名（避免重复尝试壳引擎）
    private int ttsAttempt = 0;                     // 已尝试绑定的次数（诊断用）
    private int ttsGen = 0;                         // 绑定代数：每次发起绑定 +1，用于丢弃过期回调
    private int ttsHandledGen = 0;                  // 已出结果的最新代数（防看门狗与回调重复处理）

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 【批5/R104e】登记当前实例弱引用，供 LocationShareService 回调 window.__onLocationUpdate
        sInstanceRef = new java.lang.ref.WeakReference<MainActivity>(this);

        // 【R103 需求2】状态栏沉浸式：状态栏背景与 App 顶部浅色同色 + API23+ 深色图标（见 applyImmersiveStatusBar）
        applyImmersiveStatusBar();

        web = new WebView(this);
        setContentView(web);
        // 【R-黑边】把系统状态栏高度实时注入前端 CSS 变量 --xt-satop
        //   （老内核 WebView 不认 env(safe-area-inset-*)，viewport-fit=cover 后内容会顶进状态栏，
        //    需要 .topbar 自己垫上状态栏高度才不会互相遮挡）。全程 try/catch，失败不影响启动。
        installStatusBarInsetBridge();

        // 【原生 TTS】先试系统默认引擎，失败自动切换本机其他引擎（见 initTts/nextEngineOrGiveUp）
        initTts();
        // R73-18①：启动即申请一次通知权限（退后台新消息横幅必需；拒绝也不影响其它功能）
        maybeRequestNotifyPermission();
        // 【定位】R96：启动即申请一次定位权限（WebView geolocation 依赖系统定位权限）。
        //   Android 6.0+ ACCESS_FINE/COARSE_LOCATION 属危险权限，仅在 Manifest 声明不够，
        //   必须运行时申请；拒绝也不影响其它功能（页面侧会降级为手动填写地区）。
        maybeRequestLocationPermission();
        // 【应用内更新下载】R101：注册 DownloadManager 下载完成广播（Context 级，
        //   不依赖 WebView 页面存活 —— 用户退出检测更新页/切后台，下载完成仍能自动弹安装）。
        registerApkDoneReceiver();
        // 【更新包自动清理】检测到覆盖安装成功（versionCode 变大）后，静默清扫
        //   公共 Download 目录里本 App 之前下载、版本不高于当前已装版本的旧 APK。
        checkInstalledVersionAndCleanupApks();
        // 【R105】App 启动时按本地开关+登录态恢复消息轮询前台服务（前端 setNotifyConfig 亦会触发，双保险）
        ensureMsgPollService();
        // 【需求C】首启自动引导一次电池优化白名单（系统弹窗由用户确认，不强制；仅弹一次，落盘标记）
        maybeGuideBatteryOnce();
        // 【需求C】注册 15 分钟周期的轮询保活 Job（进程被杀/划卡后自拉 MsgPollService；幂等：同 JOB_ID 覆盖）
        PollKeepAliveJobService.scheduleKeepAlive(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);            // 全站逻辑为原生 JS
        s.setDomStorageEnabled(true);            // localStorage 数据持久化（必须）
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);              // file:///android_asset 本地页面
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);  // file:// 页面内相对引用 css/js/html
        s.setAllowUniversalAccessFromFileURLs(true); // 预留：将来连局域网后端 fetch
        s.setLoadsImagesAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportZoom(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // https 页面下允许访问 http://localhost:8000(登录页探测后端/将来连局域网后端)，单机无后端时立即失败并降级本地
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // 【定位】R96：WebView 默认【禁止】geolocation（navigator.geolocation 会立刻拿到
        //   PERMISSION_DENIED，页面侧表现为「定位权限被拒绝 / 定位服务无法启动」）。
        //   必须显式 setGeolocationEnabled(true)，并配合 WebChromeClient.onGeolocationPermissionsShowPrompt
        //   授予来源站点权限，二者缺一不可。数据存放在 WebView localStorage，无需额外存储权限。
        s.setGeolocationEnabled(true);

        // R73-20B（需求20-B「文字显示」）：刻意【不调用】WebSettings.setTextZoom()。
        //   Chromium 明确：未调用 setTextZoom 时，WebView 等价于 setTextZoom(android_font_scale_factor)，
        //   即【跟随系统字体缩放】（系统大字 1.3× → 页面文字同步放大 1.3×，断言 A13）。
        //   若在此写死 setTextZoom(100) 反而会禁用系统字号跟随、破坏无障碍大字模式 —— 故保持默认跟随系统。
        //   页面侧须自行保证 1.3× 下不截断 / 不串行（属任务八及各页归属线）。
        // 刘海 / 挖孔屏：显式声明「内容不进入摄像头区域」（API 28+），保证顶部栏不被遮挡。
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                android.view.WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode =
                        android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;
                getWindow().setAttributes(lp);
            } catch (Throwable e) { /* 设置失败：沿用系统默认（非全屏窗默认亦不进入挖孔区） */ }
        }

        // 【原生桥】必须在 loadUrl 之前注入，确保页面 JS 执行时 window.AndroidBridge / AndroidTTS 已存在
        // （若在 loadUrl 之后注入，部分 WebView 版本当前页拿不到对象，isNativeApp() 误判为 false，
        //  进而走到 speechSynthesis 静默失败路径——表现为"点发音没反应、没声音也没提示"）。
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void saveFile(final String name, final String text, final String mime) {
                try {
                    String safe = (name == null || name.trim().isEmpty()) ? "export.txt" : name.trim();
                    safe = safe.replaceAll("[\\\\/:*?\"<>|]", "_");
                    java.io.File dir = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) dir = getFilesDir();
                    final java.io.File out = new java.io.File(dir, safe);
                    java.io.FileOutputStream os = new java.io.FileOutputStream(out);
                    os.write((text == null ? "" : text).getBytes("UTF-8"));
                    os.close();
                    toast("已保存:" + out.getAbsolutePath());
                } catch (final Exception e) {
                    toast("保存失败:" + e.getMessage());
                }
            }

            /** 原生网络请求：绕过 WebView CORS 限制，供时政热点等模块获取外部 API 数据。 */
            @JavascriptInterface
            public String fetchUrl(final String url) {
                if (url == null || url.trim().isEmpty()) return "__ERROR__: empty url";
                java.net.HttpURLConnection conn = null;
                try {
                    java.net.URL u = new java.net.URL(url.trim());
                    conn = (java.net.HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    // 用真实 Chrome Android UA，避免被 Cloudflare 等 WAF 拦截
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                    conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
                    conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
                    conn.setRequestProperty("Accept-Encoding", "identity");
                    int code = conn.getResponseCode();
                    java.io.InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                    if (is == null) return "__ERROR__: HTTP " + code + " no body";
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
                    is.close();
                    String body = new String(bos.toByteArray(), "UTF-8");
                    if (code < 200 || code >= 300) {
                        return "__ERROR__: HTTP " + code + " " + (body.length() > 200 ? body.substring(0, 200) : body);
                    }
                    return body;
                } catch (final Exception e) {
                    return "__ERROR__: " + e.getClass().getSimpleName() + " " + e.getMessage();
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
            /** 【R72 需求5】系统级消息通知横幅：WebView 入站消息 → 原生 Notification。
             *  前端契约（assets/notify.js / app.js 调用）：notify(String title, String text)。
             *  任何异常都不得影响 WebView，故全程 try/catch。 */
            @JavascriptInterface
            public void notify(final String title, final String text) {
                try {
                    showNotify(title, text);
                } catch (Throwable e) { /* 通知失败绝不影响页面 */ }
            }

            /** 【R73-18①】把「后端地址 + 登录 token」交给 MsgPollService，
             *  由它在原生侧轮询未读消息（WebView 退后台后 JS 停摆，只能原生轮询）。
             *  前端契约：AndroidBridge.setNotifyConfig(base, token)；token 为空则停服。
             *  任何异常都不得影响 WebView，故全程 try/catch。 */
            @JavascriptInterface
            public void setNotifyConfig(final String base, final String token) {
                try {
                    final String b = (base == null) ? "" : base.trim();
                    final String tk = (token == null) ? "" : token.trim();
                    android.content.SharedPreferences sp = getSharedPreferences(
                            MsgPollService.PREFS, android.content.Context.MODE_PRIVATE);
                    sp.edit().putString(MsgPollService.KEY_BASE, b)
                             .putString(MsgPollService.KEY_TOKEN, tk).apply();
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                Intent svc = new Intent(MainActivity.this, MsgPollService.class);
                                if (tk.isEmpty()) {
                                    stopService(svc);
                                } else if (Build.VERSION.SDK_INT >= 26) {
                                    startForegroundService(svc);
                                } else {
                                    startService(svc);
                                }
                            } catch (Throwable e) { /* 启停服务失败：静默，不影响网页 */ }
                        }
                    });
                } catch (Throwable e) { /* 配置写入失败：静默 */ }
            }

            /** 【R73-18①】引导用户把本应用加入电池优化白名单（可选，降低被系统冻结概率）。
             *  【需求C】实现抽到 MainActivity.openBatteryOptimizationRequest()：桥与首启自动引导共用。 */
            @JavascriptInterface
            public void requestIgnoreBatteryOptimizations() {
                runOnUiThread(new Runnable() {
                    @Override public void run() { openBatteryOptimizationRequest(); }
                });
            }
            /** 【R101】App 内下载更新包 —— 交给系统 DownloadManager 后台下载（退出页面不中断），完成后自动弹安装。
             *  前端契约：AndroidBridge.downloadApk(url, fileName)；fileName 可为空（原生兜底推断）。 */
            @JavascriptInterface
            public void downloadApk(final String url, final String fileName) {
                try {
                    final String u = (url == null) ? "" : url.trim();
                    if (u.isEmpty()) { toast("下载地址为空"); return; }
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            // 与 WebView DownloadListener 共用同一实现（enqueueApkDownload）
                            enqueueApkDownload(u, fileName, null);
                        }
                    });
                } catch (Throwable e) { /* 下载失败不影响页面其它功能 */ }
            }

            /** 【R103 需求2·动态版】页面注入脚本回调：按页面真实顶部色动态设置状态栏。
             *  cssColor 支持 "#RRGGBB" / "#RGB" / "rgb(r,g,b)" / "rgba(r,g,b,a)"；
             *  sRGB 相对亮度 > 0.6 视为浅色底 → 深色图标；否则浅色图标；解析失败静默返回，绝不影响页面。 */
            @JavascriptInterface
            public void applyStatusBar(final String cssColor) {
                try {
                    final int color = parseCssColor(cssColor);
                    if (color == Integer.MIN_VALUE) return; // 解析失败：静默
                    runOnUiThread(new Runnable() {
                        @Override public void run() { applyStatusBarColor(color); }
                    });
                } catch (Throwable e) { /* 状态栏设置失败绝不影响页面 */ }
            }

            /** 【R105】设置页消息通知开关：true=启动前台轮询服务，false=停止服务并取消通知。
             *  前端契约：XTAppBridge.setMsgNotify(enabled)；开关状态落盘 xt_notify_prefs/notify_enabled，
             *  重启/开机后按此恢复（BootReceiver / ensureMsgPollService）。 */
            @JavascriptInterface
            public void setMsgNotify(final boolean enabled) {
                try {
                    android.content.SharedPreferences sp = getSharedPreferences(
                            MsgPollService.PREFS, android.content.Context.MODE_PRIVATE);
                    sp.edit().putBoolean(MsgPollService.KEY_ENABLED, enabled).apply();
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                Intent svc = new Intent(MainActivity.this, MsgPollService.class);
                                if (enabled) {
                                    if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc);
                                    else startService(svc);
                                } else {
                                    stopService(svc);
                                    cancelPollNotifications();
                                }
                            } catch (Throwable e) { /* 启停失败：静默，不影响网页 */ }
                        }
                    });
                } catch (Throwable e) { /* 写配置失败：静默 */ }
            }

            /** 【需求C】查询系统通知权限是否已授予（Android 13 / API 33+ 才有运行时通知权限）。
             *  前端契约：XTAppBridge.isNotifyGranted() → boolean（设置页渲染「去开启系统通知」引导行）。
             *  API<33 恒 true（通知随安装授予，无运行时开关）；查询异常也按 true 处理，避免误引导。 */
            @JavascriptInterface
            public boolean isNotifyGranted() {
                try {
                    if (Build.VERSION.SDK_INT < 33) return true;
                    return checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                            == android.content.pm.PackageManager.PERMISSION_GRANTED;
                } catch (Throwable e) {
                    return true;
                }
            }

            /** 【需求C】跳转系统「应用通知」设置页（权限被拒后的引导闭环，与拒绝分支共用同一实现）。 */
            @JavascriptInterface
            public void openNotifySettings() {
                runOnUiThread(new Runnable() {
                    @Override public void run() { openAppNotificationSettings(); }
                });
            }

            /** 【需求1·图片保存】下载图片并写入系统相册（同步网络 IO，照 fetchUrl 的线程与错误约定）。
             *  前端契约：AndroidBridge.saveImageToGallery(url, filename) →
             *  'ok' / '__ERROR__:...' / '__UNSUPPORTED__'（img-viewer.js xtSaveImage 按前缀分流降级）。
             *  流程：HttpURLConnection 下载（Content-Type 须为 image/*、≤20MB）→ 解码 Bitmap →
             *  Android 10+（API29+）走 MediaStore.Images 写 Pictures/星途（RELATIVE_PATH，免存储权限）；
             *  API<29 写 getExternalFilesDir(Pictures) 应用专属目录（零权限，相册不可见为设计内降级）。
             *  Manifest 本期不加任何权限。文件名清洗照 saveFile；日志不打印 URL 之外的任何用户内容。 */
            @JavascriptInterface
            public String saveImageToGallery(final String url, final String filename) {
                if (url == null || url.trim().isEmpty()) return "__ERROR__: empty url";
                // 文件名清洗照 saveFile：非法字符换下划线；缺省用时间戳兜底
                String safe = (filename == null) ? "" : filename.trim();
                safe = safe.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (safe.isEmpty()) safe = "xt_" + System.currentTimeMillis() + ".png";
                java.net.HttpURLConnection conn = null;
                try {
                    java.net.URL u = new java.net.URL(url.trim());
                    conn = (java.net.HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(20000);
                    // 与 fetchUrl 同款 Chrome UA，避免被 WAF 拦截
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                    int code = conn.getResponseCode();
                    if (code < 200 || code >= 300) return "__ERROR__: HTTP " + code;
                    String ctype = conn.getContentType();
                    if (ctype == null || !ctype.toLowerCase(Locale.US).startsWith("image/")) {
                        return "__ERROR__: not an image";
                    }
                    // 流式读取 + 边读边限体积（20MB 上限，防超大图打爆内存）
                    java.io.InputStream is = conn.getInputStream();
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    long total = 0L;
                    final long MAX_BYTES = 20L * 1024 * 1024;
                    while ((n = is.read(buf)) != -1) {
                        total += n;
                        if (total > MAX_BYTES) {
                            is.close();
                            return "__ERROR__: image too large";
                        }
                        bos.write(buf, 0, n);
                    }
                    is.close();
                    byte[] data = bos.toByteArray();
                    // 先解码边界拿宽高/真实 MIME（校验确实是可解码图片），再整图解码
                    android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
                    opts.inJustDecodeBounds = true;
                    android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length, opts);
                    if (opts.outWidth <= 0 || opts.outHeight <= 0) return "__ERROR__: decode failed";
                    String mime = (opts.outMimeType == null || opts.outMimeType.trim().isEmpty())
                            ? ctype : opts.outMimeType.trim();
                    android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length);
                    if (bmp == null) return "__ERROR__: decode failed";
                    String saved;
                    if (Build.VERSION.SDK_INT >= 29) {
                        saved = writeImageToMediaStore(bmp, safe, mime);
                    } else {
                        saved = writeImageToAppPictures(bmp, safe);
                    }
                    bmp.recycle();
                    return (saved == null) ? "__ERROR__: save failed" : "ok";
                } catch (final Exception e) {
                    return "__ERROR__: " + e.getClass().getSimpleName() + " " + e.getMessage();
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }

            /** 【R105】设备信息桥：返回 JSON 字符串（零第三方依赖用 org.json）。
             *  前端契约：XTAppBridge.getDeviceInfo() →
             *  {"brand":"…","model":"…","osVersion":"…","appVersion":"…","androidId":"…",
             *   "screenWidth":1080,"screenHeight":2340,"language":"zh-CN"}
             *  任何字段取不到时留空/留 0，绝不抛异常影响页面。 */
            @JavascriptInterface
            public String getDeviceInfo() {
                try {
                    String appVersion = "";
                    try {
                        android.content.pm.PackageManager pm = getPackageManager();
                        if (pm != null) {
                            android.content.pm.PackageInfo pi = pm.getPackageInfo(getPackageName(), 0);
                            if (pi != null && pi.versionName != null) appVersion = pi.versionName;
                        }
                    } catch (Throwable e1) { /* 版本号取不到：留空 */ }
                    String androidId = "";
                    try {
                        androidId = android.provider.Settings.Secure.getString(
                                getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
                    } catch (Throwable e2) { /* ANDROID_ID 取不到：留空 */ }
                    int sw = 0;
                    int sh = 0;
                    try {
                        android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
                        sw = dm.widthPixels;
                        sh = dm.heightPixels;
                    } catch (Throwable e3) { /* 屏幕尺寸取不到：留 0 */ }
                    org.json.JSONObject o = new org.json.JSONObject();
                    o.put("brand", Build.BRAND == null ? "" : Build.BRAND);
                    o.put("model", Build.MODEL == null ? "" : Build.MODEL);
                    o.put("osVersion", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
                    o.put("appVersion", appVersion);
                    o.put("androidId", androidId == null ? "" : androidId);
                    o.put("screenWidth", sw);
                    o.put("screenHeight", sh);
                    o.put("language", Locale.getDefault().toString());
                    return o.toString();
                } catch (Throwable e) {
                    return "{}";
                }
            }

            /** 【R106】原生录音桥（预埋，随下次 APK 生效）：开始录音。
             *  前端契约：window.XTAppBridge.startVoiceRecord()（别名脚本转发到本方法）。
             *  权限未授予时先申请(REQ 2002)，授权回调里再启动；结果经 window.__onVoiceRecord(json) 回传，
             *  异常一律 ok:false，绝不抛进 WebView。 */
            @JavascriptInterface
            public void startVoiceRecord() {
                runOnUiThread(new Runnable() {
                    @Override public void run() { startVoiceRecordInternal(); }
                });
            }

            /** 【R106】原生录音桥：停止录音并把结果（base64 dataUrl）回传网页。 */
            @JavascriptInterface
            public void stopVoiceRecord() {
                runOnUiThread(new Runnable() {
                    @Override public void run() { stopVoiceRecordInternal(); }
                });
            }

            /** 【批5/R104e】实时位置共享：启动 location 前台服务（原生直接上报 /api/live/tick，
             *  不依赖后台 JS）。前端契约：window.XTAppBridge.startLocationShare(shareId) → boolean。
             *  返回 true=已请求启动；false=参数非法 / 未登录 / 非前台 / 启动异常
             *  （前端据此决定走原生路还是纯 JS 降级）。
             *  前台性：本桥只会被可见 WebView 的 JS 唤起，仍显式用 uiForeground 把关，
             *  非前台不硬起（Android 11+ 后台启动前台服务会抛 ForegroundServiceStartNotAllowedException）。 */
            @JavascriptInterface
            public boolean startLocationShare(final String shareId) {
                try {
                    final String sid = (shareId == null) ? "" : shareId.trim();
                    if (sid.isEmpty()) return false;                       // 参数非法
                    if (!uiForeground) return false;                       // 非前台：不硬起
                    android.content.SharedPreferences sp = getSharedPreferences(
                            MsgPollService.PREFS, android.content.Context.MODE_PRIVATE);
                    String token = sp.getString(MsgPollService.KEY_TOKEN, "");
                    if (token == null || token.trim().isEmpty()) return false; // 未登录：无法上报
                    final Intent svc = new Intent(MainActivity.this, LocationShareService.class);
                    svc.putExtra(LocationShareService.EXTRA_SHARE_ID, sid);
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc);
                                else startService(svc);
                            } catch (Throwable e) { toast("位置共享启动失败，已降级"); }
                        }
                    });
                    return true;
                } catch (Throwable e) {
                    return false;
                }
            }

            /** 【批5/R104e】停止实时位置共享：发 stopService 意图（幂等，服务未运行也不报错）。
             *  前端契约：window.XTAppBridge.stopLocationShare() → boolean（true=已请求停止）。 */
            @JavascriptInterface
            public boolean stopLocationShare() {
                try {
                    final Intent svc = new Intent(MainActivity.this, LocationShareService.class);
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try { stopService(svc); } catch (Throwable e) { /* 静默 */ }
                        }
                    });
                    return true;
                } catch (Throwable e) {
                    return false;
                }
            }
        }, "AndroidBridge");

        // 【原生桥】AndroidTTS：网页发音走系统 TextToSpeech。
        // 注意：TextToSpeech.speak/stop 必须在主线程执行，而 JavascriptInterface 回调线程
        // 不保证是主线程，故用 runOnUiThread 投递（ttsReady 为 volatile，任何线程可安全读）。
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean speak(final String text, final String lang, final double rate, final String utteranceId) {
                if (tts == null || !ttsReady) return false;
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try {
                            Locale loc = (lang == null || lang.trim().isEmpty())
                                    ? Locale.US : Locale.forLanguageTag(lang.trim());
                            int r = tts.setLanguage(loc);
                            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                                tts.setLanguage(Locale.US); // 目标语言缺数据时退回英文
                            }
                            tts.setSpeechRate((float) Math.max(0.3, Math.min(3.0, rate > 0 ? rate : 0.9)));
                            String uid = (utteranceId == null || utteranceId.isEmpty())
                                    ? "tts" + System.currentTimeMillis() : utteranceId;
                            tts.speak(text == null ? "" : text, TextToSpeech.QUEUE_FLUSH, null, uid);
                        } catch (Exception e) { /* 朗读失败：前端已有回调链可感知 */ }
                    }
                });
                return true;
            }

            @JavascriptInterface
            public void stop() {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try { if (tts != null) tts.stop(); } catch (Exception e) { }
                    }
                });
            }

            @JavascriptInterface
            public boolean isReady() {
                return tts != null && ttsReady;
            }

            @JavascriptInterface
            public String diag() {
                return ttsInfo;
            }

            /** 跳转系统「文字转语音输出」设置页（用户在 App 内即可直达，无需自己找路径） */
            @JavascriptInterface
            public void openTtsSettings() {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try {
                            startActivity(new Intent("com.android.settings.TTS_SETTINGS_ACTIVITY"));
                        } catch (Exception e1) {
                            try {
                                startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS));
                            } catch (Exception e2) {
                                toast("请手动打开 系统设置→文字转语音");
                            }
                        }
                    }
                });
            }

            /** 重新初始化语音引擎（用户在系统设置修好引擎后回到 App，点发音即自动重连） */
            @JavascriptInterface
            public void reinit() {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { }
                        tts = null;
                        ttsReady = false;
                        ttsFallbackEngines.clear();
                        ttsAttemptedEngines.clear();
                        ttsHandledGen = ttsGen; // 作废所有在途回调
                        initTts();
                    }
                });
            }

            /** 原生网络 TTS：有道发音接口下载 mp3 → MediaPlayer 播放。
             *  不依赖系统 TTS 引擎，也不依赖 WebView Audio（红米等 ROM 的 file:// 页面 JS Audio
             *  播网络音频失败）。播完回调 window.__netTtsDone(id)；失败回调 window.__netTtsError(id,msg)。 */
            @JavascriptInterface
            public boolean netTts(final String text, final String lang, final double rate, final String utteranceId) {
                if (text == null || text.trim().isEmpty()) return false;
                final String t = (text.trim().length() > 150) ? text.trim().substring(0, 150) : text.trim();
                final String uid = (utteranceId == null || utteranceId.isEmpty())
                        ? "ntts" + System.currentTimeMillis() : utteranceId;
                new Thread(new Runnable() {
                    @Override public void run() {
                        java.io.File audio = null;
                        // 先编码文本（URLEncoder.encode 抛出受检异常，必须在 try 内）
                        final String enc;
                        try { enc = java.net.URLEncoder.encode(t, "UTF-8"); }
                        catch (java.io.UnsupportedEncodingException e) { notifyNetTtsError(uid, "编码失败"); return; }
                        // 多 TTS 接口降级：有道美式 → 百度翻译 → 有道英式
                        String[][] sources = {
                            {"https://dict.youdao.com/dictvoice?audio=" + enc + "&type=2", "https://dict.youdao.com/"},
                            {"https://fanyi.baidu.com/gettts?lan=en&text=" + enc + "&spd=3&source=web", "https://fanyi.baidu.com/"},
                            {"https://dict.youdao.com/dictvoice?audio=" + enc + "&type=1", "https://dict.youdao.com/"}
                        };
                        String lastErr = "所有TTS接口均失败";
                        boolean fetched = false;
                        for (int si = 0; si < sources.length && !fetched; si++) {
                            java.net.HttpURLConnection conn = null;
                            try {
                                conn = (java.net.HttpURLConnection) new java.net.URL(sources[si][0]).openConnection();
                                conn.setConnectTimeout(10000);
                                conn.setReadTimeout(15000);
                                conn.setInstanceFollowRedirects(true);
                                // 纯英文 UA + 完整请求头，避免被 WAF 拦截返回 500
                                conn.setRequestProperty("User-Agent",
                                        "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                                conn.setRequestProperty("Accept", "audio/mpeg,audio/*,*/*");
                                conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
                                conn.setRequestProperty("Referer", sources[si][1]);
                                int code = conn.getResponseCode();
                                if (code != 200) {
                                    lastErr = "接口" + (si + 1) + "返回 " + code;
                                    conn.disconnect();
                                    continue;
                                }
                                java.io.InputStream in = conn.getInputStream();
                                audio = java.io.File.createTempFile("tts", ".mp3", getCacheDir());
                                java.io.FileOutputStream fos = new java.io.FileOutputStream(audio);
                                byte[] buf = new byte[8192];
                                int n;
                                while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
                                fos.close();
                                in.close();
                                conn.disconnect();
                                // 验证下载的文件不是空的或 HTML 错误页
                                if (audio.length() < 100) {
                                    lastErr = "接口" + (si + 1) + "返回内容过小(" + audio.length() + "字节)";
                                    audio.delete();
                                    audio = null;
                                    continue;
                                }
                                fetched = true;
                            } catch (final Exception e) {
                                lastErr = "接口" + (si + 1) + ":" + e.getClass().getSimpleName();
                                if (conn != null) try { conn.disconnect(); } catch (Exception ex) { }
                                if (audio != null) { audio.delete(); audio = null; }
                            }
                        }
                        if (!fetched) {
                            notifyNetTtsError(uid, lastErr);
                            return;
                        }
                        final java.io.File f = audio;
                        runOnUiThread(new Runnable() {
                            @Override public void run() {
                                try {
                                    if (netPlayer != null) {
                                        try { netPlayer.release(); } catch (Exception e) { }
                                        netPlayer = null;
                                    }
                                    netPlayer = new android.media.MediaPlayer();
                                    netPlayer.setDataSource(f.getAbsolutePath());
                                    netPlayer.setOnPreparedListener(new android.media.MediaPlayer.OnPreparedListener() {
                                        @Override public void onPrepared(android.media.MediaPlayer mp) {
                                            try {
                                                // 慢速：PlaybackParams 需 API 23+（用户 Android 15 可用）
                                                if (rate > 0 && Math.abs(rate - 1.0) > 0.01
                                                        && android.os.Build.VERSION.SDK_INT >= 23) {
                                                    mp.setPlaybackParams(new android.media.PlaybackParams()
                                                            .setSpeed((float) Math.max(0.3, Math.min(2.0, rate))));
                                                }
                                                mp.start();
                                            } catch (Exception e) {
                                                notifyNetTtsError(uid, "播放失败");
                                            }
                                        }
                                    });
                                    netPlayer.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() {
                                        @Override public void onCompletion(android.media.MediaPlayer mp) { notifyNetTtsDone(uid); }
                                    });
                                    netPlayer.setOnErrorListener(new android.media.MediaPlayer.OnErrorListener() {
                                        @Override public boolean onError(android.media.MediaPlayer mp, int what, int extra) {
                                            notifyNetTtsError(uid, "播放失败");
                                            return true;
                                        }
                                    });
                                    netPlayer.prepare();
                                } catch (Exception e) {
                                    notifyNetTtsError(uid, "播放器错误");
                                }
                            }
                        });
                    }
                }).start();
                return true;
            }

            /** 原生语音识别（跟读/语音输入）：走系统 SpeechRecognizer（WebView 无 Web Speech API）。
             *  结果回调 window.__recResult(id,text)；错误回调 window.__recError(id,code)。
             *  首次调用会请求麦克风权限并返回 false，授权后再点一次即可识别。 */
            @JavascriptInterface
            public boolean startRecognition(final String lang, final String requestId) {
                if (!recPermissionGranted) {
                    runOnUiThread(new Runnable() {
                        @Override public void run() { requestRecPermission(); }
                    });
                    return false;
                }
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try {
                            if (!android.speech.SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                                notifyRecError(requestId, "unavailable");
                                return;
                            }
                            if (sr != null) {
                                try { sr.cancel(); sr.destroy(); } catch (Exception e) { }
                                sr = null;
                            }
                            sr = android.speech.SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                            final String rid = (requestId == null || requestId.isEmpty())
                                    ? "rec" + System.currentTimeMillis() : requestId;
                            sr.setRecognitionListener(new android.speech.RecognitionListener() {
                                @Override public void onReadyForSpeech(android.os.Bundle params) { }
                                @Override public void onBeginningOfSpeech() { }
                                @Override public void onRmsChanged(float rmsdB) { }
                                @Override public void onBufferReceived(byte[] buffer) { }
                                @Override public void onEndOfSpeech() { }
                                @Override public void onError(int error) {
                                    String code = "error_" + error;
                                    if (error == android.speech.SpeechRecognizer.ERROR_NO_MATCH) code = "no_match";
                                    else if (error == android.speech.SpeechRecognizer.ERROR_SPEECH_TIMEOUT) code = "no_speech";
                                    else if (error == android.speech.SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) code = "not_allowed";
                                    else if (error == android.speech.SpeechRecognizer.ERROR_CLIENT
                                            || error == android.speech.SpeechRecognizer.ERROR_RECOGNIZER_BUSY) code = "unavailable";
                                    notifyRecError(rid, code);
                                }
                                @Override public void onResults(android.os.Bundle results) {
                                    java.util.ArrayList<String> r = results.getStringArrayList(
                                            android.speech.SpeechRecognizer.RESULTS_RECOGNITION);
                                    String best = (r != null && !r.isEmpty()) ? r.get(0) : "";
                                    notifyRecResult(rid, best);
                                }
                                @Override public void onPartialResults(android.os.Bundle partialResults) { }
                                @Override public void onEvent(int eventType, android.os.Bundle params) { }
                            });
                            android.content.Intent i = new android.content.Intent(
                                    android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                            i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                                    android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                            i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE,
                                    (lang == null || lang.isEmpty()) ? "en-US" : lang);
                            i.putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                            sr.startListening(i);
                        } catch (Exception e) {
                            notifyRecError(requestId, "exception");
                        }
                    }
                });
                return true;
            }

            /** 停止语音识别 */
            @JavascriptInterface
            public void stopRecognition() {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try { if (sr != null) sr.cancel(); } catch (Exception e) { }
                    }
                });
            }
        }, "AndroidTTS");

        // 经典 file:// 加载：入口页(asset 根目录的学习工作台.html；未登录会自动跳 登录.html)
        // 中文文件名用 Uri.encode 保证 Android WebView 能正确定位到 asset 文件。
        // R73：自定义 WebViewClient，在每个页面 onPageFinished 注入壳桥接胶水
        // assets/xt-android.js（避免改动任何 html 页面 —— 页面归属其它线路）。
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectXtAndroid(view);
                // 【R105】注入 XTAppBridge 别名脚本（前端统一桥名，feature-detect 不覆盖已有）
                injectXtAppBridge(view);
                // 【R103 需求2·动态版】注入自包含脚本：动态取页面真实顶部色设置状态栏
                injectStatusBarColor(view);
                // 【R-黑边】补发状态栏高度 CSS 变量：新文档的 documentElement 已丢掉 style，需重设
                injectStatusBarInset(view);
                // 【R105】页面加载完成：标记就绪，并补发冷启动时早于本回调的待处理深链
                //   （onCreate 里 handleOpenIntent 那次调用会因 webPageReady=false 直接返回，属预期）
                webPageReady = true;
                if (pendingDeepLinkJson != null) forwardPendingDeepLink();
            }
        });
        web.loadUrl("file:///android_asset/" + Uri.encode("学习工作台.html"));
        // 【R105】通知点击冷启动：识别深链 extras（热启动走 onNewIntent）
        handleOpenIntent(getIntent());

        // alert/confirm/prompt 由默认实现弹出；此处扩展文件选择器（头像/插图上传）
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String mime = "*/*";
                boolean isAudio = false;
                String[] accept = params.getAcceptTypes();
                if (accept != null && accept.length > 0 && accept[0] != null) {
                    if (accept[0].contains("image")) {
                        mime = "image/*";
                    } else if (accept[0].contains("audio")) {
                        // 【R106】网页 <input type="file" accept="audio/*" capture>（L3 降级录音入口）：
                        //  旧实现只识别 image，audio 会退化为普通文件选择器、调不起系统录音机 —— 故单列分支。
                        mime = "audio/*";
                        isAudio = true;
                    }
                }
                intent.setType(mime);
                Intent chooser = Intent.createChooser(intent, isAudio ? "录音或选择音频" : "选择文件");
                if (isAudio) {
                    // 附带「系统录音机」初始 intent：用户可直接录音，而非只能在文件里挑音频
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,
                            new Intent[] { new Intent(android.provider.MediaStore.Audio.Media.RECORD_SOUND_ACTION) });
                }
                try {
                    startActivityForResult(chooser, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }

            /** 【定位】R96：WebView geolocation 权限回调。
             *  WebView 默认拒绝 navigator.geolocation 请求（页面会立刻拿到 PERMISSION_DENIED），
             *  必须在此回调里显式授予，否则「定位服务无法启动」。
             *  retain=false：不长期记住授权（用户/系统可随时在设置里收回）。
             *  真正的系统级弹窗由 Android 在运行时权限已授予后自行处理。 */
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    android.webkit.GeolocationPermissions.Callback callback) {
                try {
                    callback.invoke(origin, true, false);
                } catch (Throwable t) {
                    // 授权失败不得影响 WebView；交由页面侧降级为手动填写
                    callback.invoke(origin, false, false);
                }
            }

            /** 【R103 需求1】H5 getUserMedia 麦克风授权。
             *  WebView 对 getUserMedia 的权限请求默认直接 deny（页面表现为「无法访问麦克风 / 录音」），
             *  必须在此回调显式处理：
             *   · 仅授予 RESOURCE_AUDIO_CAPTURE（麦克风）；摄像头等其余资源一律 deny；
             *   · 宿主(本 App)已持有 RECORD_AUDIO 运行时权限 → 立即 grant；
             *   · 尚未授权 → 暂存该请求，先走运行时权限申请，结果回来后 grant / deny。 */
            @Override
            public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                if (request == null) return;
                try {
                    String[] res = request.getResources();
                    boolean wantsAudio = false;
                    if (res != null) {
                        for (String r : res) {
                            if (android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                                wantsAudio = true;
                                break;
                            }
                        }
                    }
                    if (!wantsAudio) {          // 非麦克风资源：本项目不需要，明确拒绝
                        request.deny();
                        return;
                    }
                    if (hasAudioRuntimePermission()) {
                        grantWebAudio(request);  // 宿主已授权：直接授予
                    } else {
                        pendingWebPermissionRequest = request; // 暂存，运行时申请后再回填
                        requestRecPermission();                // 复用 RECORD_AUDIO 运行时申请(REQ 2002)
                    }
                } catch (Throwable t) {
                    try { request.deny(); } catch (Throwable e2) { }
                }
            }

            /** 【R103 需求3】进入 H5 视频全屏（<video> 全屏 / WebView 全屏 API）。 */
            @Override
            public void onShowCustomView(View view, WebChromeClient.CustomViewCallback callback) {
                showCustomView(view, callback);
            }

            /** 【R103 需求3】退出 H5 视频全屏。 */
            @Override
            public void onHideCustomView() {
                hideCustomView();
            }
        });

        // 【应用内更新下载】R101（P0 根因修复）：安卓 WebView 里 a[download] / window.open(.apk)
        //   【不会自动保存】，只会触发本回调 —— 此前未注册 DownloadListener，保存请求被静默丢弃，
        //   表现为"进度 100% 显示下载完成，但手机上找不到安装包"。现统一交给系统 DownloadManager
        //   后台下载（与 AndroidBridge.downloadApk 同一实现 enqueueApkDownload），落盘公共 Download 目录。
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent,
                    String contentDisposition, String mimetype, long contentLength) {
                // 文件名优先按 URL/响应头推断（URLUtil.guessFileName 会把 %E6%98%9F… 百分号编码
                // 解码成中文文件名，如 星途-1.25.apk），推断不出由 enqueueApkDownload 内部兜底
                String name = null;
                try { name = URLUtil.guessFileName(url, contentDisposition, mimetype); }
                catch (Throwable t) { name = null; }
                enqueueApkDownload(url, name, mimetype);
            }
        });
    }

    /* ================= 原生 TTS 初始化 / 引擎兜底（v1.8：看门狗 + 引擎轮换） ================= */

    /** 初始化系统默认语音引擎；无回调(壳引擎挂起)或失败时自动枚举本机其他引擎逐个尝试 */
    private void initTts() {
        ttsAttempt++;
        ttsGen++;
        ttsInfo = "初始化中(" + ttsAttempt + ")";
        final int gen = ttsGen;
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override public void onInit(int status) { onTtsInitResult(gen, status, "系统默认"); }
        });
        attachTtsListener(tts);
        scheduleWatchdog(gen, "系统默认");
        notifyTtsStatus(); // 立即推送"初始化中"状态，让前端不再一直显示空白
    }

    /** 显式绑定指定包名的语音引擎再试 */
    private void tryEngine(final String pkg) {
        ttsAttempt++;
        ttsGen++;
        ttsInfo = "尝试引擎" + ttsAttempt + ":" + pkg;
        if (!ttsAttemptedEngines.contains(pkg)) ttsAttemptedEngines.add(pkg);
        final int gen = ttsGen;
        try {
            tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
                @Override public void onInit(int status) { onTtsInitResult(gen, status, pkg); }
            }, pkg);
            attachTtsListener(tts);
            scheduleWatchdog(gen, pkg);
            notifyTtsStatus(); // 立即推送"正在尝试某引擎"状态
        } catch (Exception e) {
            ttsInfo = "引擎无法绑定:" + pkg;
            tts = null;
            nextEngineOrGiveUp();
            notifyTtsStatus();
        }
    }

    /** 引擎初始化回调（成功则就绪并选默认英文；失败则继续换下一个引擎）。过期代数的回调直接丢弃 */
    private void onTtsInitResult(int gen, int status, String which) {
        if (gen != ttsGen || gen == ttsHandledGen) return; // 过期回调
        ttsHandledGen = gen;
        if (status == TextToSpeech.SUCCESS && tts != null) {
            ttsReady = true;
            ttsInfo = "ok:" + which;
            try { tts.setLanguage(Locale.US); } catch (Exception e) { }
            notifyTtsStatus();
            return;
        }
        ttsReady = false;
        ttsInfo = "引擎失败(" + status + "):" + which;
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { }
        tts = null;
        nextEngineOrGiveUp();
        notifyTtsStatus();
    }

    /** 看门狗：部分"壳引擎"绑定后永远不回调 → 4 秒无结果即判失败，换下一个引擎 */
    private void scheduleWatchdog(final int gen, final String which) {
        uiHandler.postDelayed(new Runnable() {
            @Override public void run() {
                if (ttsReady || gen != ttsGen || gen == ttsHandledGen) return;
                ttsHandledGen = gen;
                ttsInfo = "引擎无响应:" + which;
                try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception e) { }
                tts = null;
                nextEngineOrGiveUp();
                notifyTtsStatus();
            }
        }, 4000);
    }

    /** 默认引擎失败后：枚举本机全部 TTS 引擎，逐个延迟尝试（错开 1.2s 避免绑定竞态）；已尝试过的引擎跳过 */
    private void nextEngineOrGiveUp() {
        if (ttsFallbackEngines.isEmpty()) {
            try {
                Intent qi = new Intent("android.intent.action.TTS_SERVICE");
                List<ResolveInfo> rs = getPackageManager().queryIntentServices(qi, 0);
                for (ResolveInfo r : rs) {
                    if (r != null && r.serviceInfo != null && r.serviceInfo.packageName != null
                            && !ttsFallbackEngines.contains(r.serviceInfo.packageName)
                            && !ttsAttemptedEngines.contains(r.serviceInfo.packageName)) {
                        ttsFallbackEngines.add(r.serviceInfo.packageName);
                    }
                }
            } catch (Exception e) { }
        }
        if (!ttsFallbackEngines.isEmpty()) {
            final String pkg = ttsFallbackEngines.remove(0);
            uiHandler.postDelayed(new Runnable() {
                @Override public void run() { if (!ttsReady) tryEngine(pkg); }
            }, 1200);
        } else {
            ttsInfo = "本机无可用语音引擎：系统设置搜索「文字转语音」选择或安装引擎";
            notifyTtsStatus();
        }
    }

    /** 每个 TextToSpeech 实例都要单独挂播报监听（播完回调网页继续流程） */
    private void attachTtsListener(TextToSpeech t) {
        if (t == null) return;
        t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) { }
            @Override public void onDone(String utteranceId) { notifyTtsDone(utteranceId); }
            @Override public void onError(String utteranceId) { notifyTtsDone(utteranceId); }
            @Override public void onStop(String utteranceId, boolean interrupted) { notifyTtsDone(utteranceId); }
        });
    }

    // ---- 原生网络 TTS（v1.13：MediaPlayer 播放有道 mp3，绕开 WebView Audio 限制）----
    private android.media.MediaPlayer netPlayer = null;
    // ---- 原生语音识别（v1.13：系统 SpeechRecognizer，WebView 无 Web Speech API）----
    private android.speech.SpeechRecognizer sr = null;
    private volatile boolean recPermissionGranted = false;

    // ---- 【R106】原生录音桥（预埋，随下次 APK 生效）：MediaRecorder → MPEG_4 + AAC(.m4a) ----
    private android.media.MediaRecorder voiceRecorder = null;   // 当前录音器
    private java.io.File voiceRecFile = null;                   // 当前录音落盘文件（缓存目录）
    private volatile boolean voiceRecording = false;            // 是否正在录音
    private volatile boolean voiceStartPending = false;         // 权限申请中，授权后自动启动
    private volatile long voiceRecordStartMs = 0L;              // 录音起始时间戳（算时长）
    private static final long VOICE_MAX_MS = 60000L;            // 60 秒硬上限
    private final Handler voiceStopHandler = new Handler(Looper.getMainLooper());
    private final Runnable voiceStopTask = new Runnable() {
        @Override public void run() { stopVoiceRecordInternal(); }
    };

    /** 引擎状态变化 → 推送给页面 window.__nativeTtsStatus(ok, info) */
    private void notifyTtsStatus() {
        uiHandler.post(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String info = (ttsInfo == null ? "" : ttsInfo.replace("'", "")).trim();
                String js = "window.__nativeTtsStatus&&window.__nativeTtsStatus(" + ttsReady + ",'" + info + "')";
                try { web.evaluateJavascript(js, null); } catch (Exception e) { }
            }
        });
    }

    /* ================= R73：壳桥接胶水注入（不改任何 html 页面） ================= */

    /** 把 assets/xt-android.js 注入当前页面（读文件放子线程，evaluateJavascript 回主线程）。 */
    private void injectXtAndroid(final WebView view) {
        if (view == null) return;
        final String cached = xtAndroidJs;
        if (cached != null) {
            if (!cached.isEmpty()) {
                uiHandler.post(new Runnable() {
                    @Override public void run() { evalJs(view, cached); }
                });
            }
            return;
        }
        new Thread(new Runnable() {
            @Override public void run() {
                final String js = readAssetText("assets/xt-android.js");
                xtAndroidJs = (js == null ? "" : js);
                if (!xtAndroidJs.isEmpty()) {
                    uiHandler.post(new Runnable() {
                        @Override public void run() { evalJs(view, xtAndroidJs); }
                    });
                }
            }
        }).start();
    }

    private void evalJs(WebView view, String js) {
        try { view.evaluateJavascript(js, null); } catch (Throwable e) { /* 注入失败：静默 */ }
    }

    /* ================= 【R105】XTAppBridge 别名注入 ================= */

    /** 【R105】bootstrap JS：把前端统一桥名 window.XTAppBridge 挂到既有 AndroidBridge 上
     *  （历史桥名为 AndroidBridge，前端契约统一为 XTAppBridge，故在此做别名而非改桥名）。
     *  ES5 自包含；feature-detect：已存在则不覆盖；异常绝不影响页面。 */
    private static final String XT_APP_BRIDGE_SCRIPT =
            "(function(){try{"
            + "if(!window.AndroidBridge)return;"
            + "if(window.XTAppBridge)return;"
            + "window.XTAppBridge={"
            + "getDeviceInfo:function(){try{return AndroidBridge.getDeviceInfo()||'{}';}catch(e){return '{}';}},"
            + "setMsgNotify:function(enabled){try{AndroidBridge.setMsgNotify(!!enabled);}catch(e){}},"
            + "startVoiceRecord:function(){try{AndroidBridge.startVoiceRecord();}catch(e){}},"
            + "stopVoiceRecord:function(){try{AndroidBridge.stopVoiceRecord();}catch(e){}},"
            + "startLocationShare:function(sid){try{return !!(AndroidBridge.startLocationShare&&AndroidBridge.startLocationShare(String(sid==null?'':sid)));}catch(e){return false;}},"
            + "stopLocationShare:function(){try{return !!(AndroidBridge.stopLocationShare&&AndroidBridge.stopLocationShare());}catch(e){return false;}}"
            + "};"
            + "}catch(e){}})();";

    /** 【R105】在每个页面 onPageFinished 注入 XTAppBridge 别名脚本（先于 xt-android.js 胶水）。 */
    private void injectXtAppBridge(final WebView view) {
        if (view == null) return;
        uiHandler.post(new Runnable() {
            @Override public void run() { evalJs(view, XT_APP_BRIDGE_SCRIPT); }
        });
    }

    /** 读取 assets 下的文本资源（UTF-8）；失败返回 null。 */
    private String readAssetText(String name) {
        InputStream in = null;
        try {
            in = getAssets().open(name);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), "UTF-8");
        } catch (Throwable e) {
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (Exception e) { } }
        }
    }

    /* ================= 通用 ================= */

    private void toast(final String s) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                android.widget.Toast.makeText(MainActivity.this, s, android.widget.Toast.LENGTH_LONG).show();
            }
        });
    }

    /* ================= 【应用内更新下载】R101：DownloadManager 后台下载 + 完成自动弹安装 ================= */

    /** 统一下载入口：交给系统 DownloadManager 后台下载（退出检测更新页面 / 切后台 / 关屏均不中断），
     *  落盘 /storage/emulated/0/Download/，下载完成后由 apkDoneReceiver 自动弹安装界面。
     *  两条入口共用本实现：
     *    ① AndroidBridge.downloadApk(url, fileName) —— 页面 JS 主动调用（走系统下载，摆脱页面生命周期）
     *    ② WebView DownloadListener —— 页面 a[download] / window.open(.apk) 的兜底路径
     *  任何失败都兜底为浏览器打开该 URL，绝不影响其它功能。 */
    private void enqueueApkDownload(final String url, final String fileName, final String mimetype) {
        try {
            // 1. 确定文件名：优先调用方指定 → URLUtil.guessFileName（对 URL 百分号编码解码，
            //    %E6%98%9F%E9%80%94-1.25.apk → 星途-1.25.apk）→ 最终兜底 xingtu-update.apk
            String name = (fileName == null || fileName.trim().isEmpty()) ? null : fileName.trim();
            if (name == null) {
                try {
                    name = URLUtil.guessFileName(url, null, "application/vnd.android.package-archive");
                } catch (Throwable t) { name = null; }
            }
            if (name == null || name.trim().isEmpty()) name = "xingtu-update.apk";
            // 防路径穿越/非法文件名：DownloadManager 目标只接受纯文件名，去掉路径分隔符与保留字符
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (name.startsWith(".")) name = "xingtu-update.apk";

            // 2. 构造下载请求：公共 Download 目录 + 通知栏可见 + 流量/漫游均允许（更新场景优先保证成功）
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            req.setMimeType((mimetype == null || mimetype.trim().isEmpty())
                    ? "application/vnd.android.package-archive" : mimetype.trim());
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setVisibleInDownloadsUi(true);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);

            // 3. 入队系统下载服务
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) throw new IllegalStateException("DownloadManager 不可用");
            dm.enqueue(req);
            toast("正在下载安装包，可在通知栏查看进度");
        } catch (Throwable t) {
            // DownloadManager 不可用 / 入队失败：兜底用系统浏览器打开该 URL
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Throwable t2) {
                toast("无法启动下载，请稍后重试");
            }
        }
    }

    /** 注册下载完成广播（onCreate 注册 / onDestroy 注销）。
     *  BroadcastReceiver 是 Context 级注册，不依赖 WebView 页面 ——
     *  用户退出「检测更新」页、甚至 App 退到后台，下载完成仍会自动弹安装。 */
    private void registerApkDoneReceiver() {
        try {
            if (apkDoneReceiver != null) return;
            apkDoneReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                    if (id < 0) return;
                    try {
                        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        Uri uri = (dm == null) ? null : dm.getUriForDownloadedFile(id);
                        if (uri == null) return; // 下载失败/被取消：系统通知栏已提示，静默即可
                        installApk(uri);
                    } catch (Throwable t) {
                        toast("下载完成但无法自动安装，请到 Download 目录手动点击安装包");
                    }
                }
            };
            registerReceiver(apkDoneReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        } catch (Throwable e) { /* 注册失败：仅失去"自动弹安装"，下载本身不受影响 */ }
    }

    /** 弹系统安装界面（ACTION_VIEW + APK MIME）。
     *  Android 7+（N）对 file:// 跨进程读会抛 FileUriExposedException，须经 content://
     *  授权读取 —— 用自写 ApkFileProvider（零 androidx/support 依赖，仅开放 Download 目录 .apk）；
     *  DownloadManager 返回的本来就是 content://（N+）时直接使用。
     *  覆盖更新安装（同包名同签名，versionCode 递增）系统直接允许，无需"未知来源"授权；
     *  任何异常兜底 Toast 提示手动安装。 */
    private void installApk(Uri uri) {
        try {
            Uri target = uri;
            if (Build.VERSION.SDK_INT >= 24 && "file".equals(uri.getScheme())) {
                target = ApkFileProvider.uriFor(new java.io.File(uri.getPath()));
            }
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(target, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Throwable t) {
            toast("无法自动弹出安装界面，请到 Download 目录手动点击安装包");
        }
    }

    /* ================= 【更新包自动清理】安装成功后删除 Download 目录旧 APK ================= */

    /** 启动时比对 versionCode 指纹，判断是否刚完成过一次覆盖安装：
     *  · 无存储值（首装）→ 只记录当前值，不清理；
     *  · 存储值 < 当前值 → 用户刚完成覆盖安装 → 清扫旧包后更新记录；
     *  · 相等 → 顺带做一次轻量清扫（兜底上次清理失败 / 广播丢失的遗留文件）；
     *  · 存储值 > 当前值（回滚降级，理论罕见）→ 只更新记录，不动任何文件。
     *  全程 try/catch(Throwable)，失败静默，下次启动再试，绝不影响主流程。 */
    private void checkInstalledVersionAndCleanupApks() {
        try {
            int code = 0;
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                if (pi != null) code = pi.versionCode;
            } catch (Throwable t) { code = 0; }
            if (code <= 0) return;
            android.content.SharedPreferences sp = getSharedPreferences(
                    "apk_update", android.content.Context.MODE_PRIVATE);
            int last = sp.getInt("last_seen_version_code", 0);
            if (last > 0 && last <= code) {
                cleanupOldApks();
            }
            sp.edit().putInt("last_seen_version_code", code).apply();
        } catch (Throwable t) { /* 指纹读写/清理失败：静默，下次启动再试 */ }
    }

    /** 静默清扫「本 App 之前经 DownloadManager 下载、版本不高于当前已装版本」的 APK。
     *  主路径：DownloadManager.Query 只查 STATUS_SUCCESSFUL 记录 —— 记录是本 App 自己
     *  入队的，dm.remove(id) 合法且会连文件一起删（API29+ scoped storage 下同样有效）；
     *  兜底路径：直接扫公共 Download 目录，按命名规则命中本 App 的 .apk 后用 File API 删
     *  （API<29 或 DownloadManager 查不到记录的遗留文件；API29+ 删不掉会被吞掉，下次再试）。
     *  零 Toast、零日志，全静默；任何单条失败吞掉继续。 */
    private void cleanupOldApks() {
        try {
            int curVer = parseApkVersionToNumber(getSelfVersionName());
            if (curVer < 0) return; // 取不到当前版本号：不清理（避免误删更高版本的待装包）

            // ---- 主路径：遍历 DownloadManager 成功记录 ----
            try {
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    java.util.List<Long> removeIds = new ArrayList<Long>();
                    DownloadManager.Query q = new DownloadManager.Query()
                            .setFilterByStatus(DownloadManager.STATUS_SUCCESSFUL);
                    android.database.Cursor c = null;
                    try {
                        c = dm.query(q);
                        if (c != null) {
                            while (c.moveToNext()) {
                                try {
                                    long id = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_ID));
                                    String title = c.getString(c.getColumnIndex(DownloadManager.COLUMN_TITLE));
                                    if (!isOwnApkTitle(title)) continue;
                                    int v = parseApkVersionToNumber(title);
                                    if (v <= curVer) removeIds.add(id); // 版本 ≤ 当前已装 → 删；> 当前 → 保留（可能正要装）
                                } catch (Throwable t) { /* 单条失败不影响其余 */ }
                            }
                        }
                    } finally {
                        try { if (c != null) c.close(); } catch (Throwable t) { }
                    }
                    for (int i = 0; i < removeIds.size(); i++) {
                        try { dm.remove(removeIds.get(i)); } catch (Throwable t) { /* 删不掉下次再试 */ }
                    }
                }
            } catch (Throwable t) { /* 主路径失败：走兜底 */ }

            // ---- 兜底路径：扫公共 Download 目录 ----
            try {
                java.io.File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                java.io.File[] files = (dir == null) ? null : dir.listFiles();
                if (files != null) {
                    for (int i = 0; i < files.length; i++) {
                        try {
                            java.io.File f = files[i];
                            if (f == null || !f.isFile()) continue;
                            if (!isOwnApkTitle(f.getName())) continue;
                            int v = parseApkVersionToNumber(f.getName());
                            if (v <= curVer) f.delete();
                        } catch (Throwable t) { /* 单个文件失败不影响其余 */ }
                    }
                }
            } catch (Throwable t) { /* 兜底失败：留待下次 */ }
        } catch (Throwable t) { /* 整体兜底：绝不抛错影响主流程 */ }
    }

    /** 判断文件/下载标题是否是本 App 的更新包：以 ".apk" 结尾（忽略大小写）
     *  且 包含「星途」或「xingtu」（不区分大小写，兜底名 xingtu-update.apk 同样命中）。 */
    private static boolean isOwnApkTitle(String title) {
        if (title == null) return false;
        String s = title.trim().toLowerCase(Locale.US);
        if (!s.endsWith(".apk")) return false;
        return title.contains("星途") || s.contains("xingtu");
    }

    /** 从文件名/标题里抽取数字版本并换算成可比较整数：
     *  "星途-1.25.apk" → 12500、"1.3.1" → 10301（主版本*10000 + 次版本*100 + 修订号，
     *  保证 "1.3" 与 "1.25"、"1.2.10" 这类不同位数版本可正确比大小）。
     *  抽不到数字版本（如 xingtu-update.apk）或解析异常 → 返回 -1，由调用方视为待清理。 */
    private static int parseApkVersionToNumber(String s) {
        if (s == null) return -1;
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("(\\d+(?:\\.\\d+)+)").matcher(s);
            if (!m.find()) return -1;
            String[] parts = m.group(1).split("\\.");
            int major = Integer.parseInt(parts[0]);
            int minor = (parts.length > 1) ? Integer.parseInt(parts[1]) : 0;
            int patch = (parts.length > 2) ? Integer.parseInt(parts[2]) : 0;
            return major * 10000 + minor * 100 + patch;
        } catch (Throwable t) {
            return -1;
        }
    }

    /** 当前已装版本号字符串（versionName，如 "1.25"）；取不到返回 null。 */
    private String getSelfVersionName() {
        try {
            android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (pi != null && pi.versionName != null) return pi.versionName;
        } catch (Throwable t) { }
        return null;
    }

    /* ================= 【R103 需求2】状态栏沉浸式（状态栏背景 = App 顶部浅色） ================= */

    /** 【R103 需求2】状态栏沉浸式：状态栏背景与 App 顶部实际浅色同色，消除顶部黑边。
     *  实测顶部色值：手机窄屏(<=768px)侧栏隐藏，页面最顶部为主结构
     *  <header class="topbar">，其背景为 var(--card)；浅色主题下 --card=#FFFFFF
     *  （见 assets/common.css 的 .topbar{background:var(--card)} 与 :root{--card:#FFFFFF}）。
     *  · API 23+：状态栏取顶部浅色(#FFFFFF) + 深色图标(SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) → 无缝沉浸；
     *  · API 21-22：不支持深色状态栏图标，白底会使浅色图标不可见，故兜底为品牌蓝(#5B8DEF)，
     *    白色图标清晰可辨且不留黑边；
     *  · setStatusBarColor 生效前提：窗口带 FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS 且未使用半透明状态栏标志。 */
    private void applyImmersiveStatusBar() {
        try {
            final int colorTopBar = 0xFFFFFFFF;   // #FFFFFF = .topbar 背景(var(--card)) 浅色值
            final int colorFallback = 0xFF5B8DEF; // #5B8DEF = 品牌主色(API21-22 兜底)
            Window window = getWindow();
            if (window == null) return;
            if (Build.VERSION.SDK_INT >= 21) {
                window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                // 【R-黑边】打孔/刘海屏：允许内容铺到状态栏与挖孔区后面（API28+），API30+ 再关掉系统给 decor 的强制留白
                applyCutoutMode(window);
                applyNonDecorFits(window);
                if (Build.VERSION.SDK_INT >= 23) {
                    window.setStatusBarColor(0x00000000); window.getDecorView().setSystemUiVisibility(window.getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN); // edge-to-edge：状态栏透明(0x00000000=Color.TRANSPARENT) + 内容铺满其下，由 .topbar 背景透出实现无缝顶栏
                    View decor = window.getDecorView();
                    decor.setSystemUiVisibility(
                            decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                    // 【R-黑边】API30+ 用 WindowInsetsController 再设一次深色图标（原生等价写法，与上面 flags 二选一生效，互不冲突）
                    applyLightStatusBarsAppearance(window, true);
                } else {
                    window.setStatusBarColor(colorFallback); window.getDecorView().setSystemUiVisibility(window.getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN); // API21-22 兜底：品牌蓝 + 同样铺满状态栏(edge-to-edge)
                }
            }
        } catch (Throwable e) { /* 设置失败：沿用系统默认，不影响功能 */ }
    }

    /** 【R103 需求2·动态版】注入自包含 ES5 脚本：读取页面真实顶部背景色并回调原生桥设置状态栏。
     *  取色优先级：.topbar → .page-head → header → body；透明/无效回退 #FFFFFF；
     *  立即执行一次，并用 MutationObserver 监听 body/html 的 class/style（覆盖暗色切换），变化时防抖 120ms 重算；
     *  全程 try/catch，脚本异常绝不影响页面；不引入轮询定时器、不改任何页面文件（仅原生侧注入）。 */
    private void injectStatusBarColor(final WebView view) {
        if (view == null) return;
        uiHandler.post(new Runnable() {
            @Override public void run() { evalJs(view, STATUS_BAR_SCRIPT); }
        });
    }

    /** 状态栏取色脚本（ES5，自包含；仅在原生侧注入，页面文件零改动）。 */
    private static final String STATUS_BAR_SCRIPT =
            "(function(){try{"
            + "if(!window.AndroidBridge||typeof AndroidBridge.applyStatusBar!=='function')return;"
            + "var last='';var timer=null;"
            + "function norm(c){"
            + "if(!c)return null;"
            + "var s=(''+c).replace(/\\s+/g,'').toLowerCase();"
            + "if(s==='transparent'||s==='rgba(0,0,0,0)')return null;"
            + "if(s.charAt(0)==='#'){"
            + "if(s.length===4){s='#'+s.charAt(1)+s.charAt(1)+s.charAt(2)+s.charAt(2)+s.charAt(3)+s.charAt(3);}"
            + "return (s.length===7)?s:null;}"
            + "var m=s.match(/^rgba?\\(([^)]+)\\)$/);"
            + "if(m){var p=m[1].split(',');if(p.length<3)return null;"
            + "var a=(p.length>3)?parseFloat(p[3]):1;if(isNaN(a))a=1;if(a<=0.01)return null;"
            + "var r=parseInt(p[0],10),g=parseInt(p[1],10),b=parseInt(p[2],10);"
            + "if(isNaN(r)||isNaN(g)||isNaN(b))return null;"
            + "function h(x){x=Math.max(0,Math.min(255,Math.round(x))).toString(16);return (x.length<2)?('0'+x):x;}"
            + "return '#'+h(r)+h(g)+h(b);}"
            + "return null;}"
            + "function topColor(){"
            + "var sel=['.topbar','.page-head','header','body'];"
            + "for(var i=0;i<sel.length;i++){var el=document.querySelector(sel[i]);if(!el)continue;"
            + "var st=window.getComputedStyle(el);if(!st)continue;"
            + "var c=norm(st.backgroundColor);if(c)return c;}"
            + "return '#FFFFFF';}"
            + "function apply(){try{var c=topColor();if(c===last)return;last=c;AndroidBridge.applyStatusBar(c);}catch(e){}}"
            + "function schedule(){if(timer){clearTimeout(timer);}timer=setTimeout(apply,120);}"
            + "apply();"
            + "try{setTimeout(apply,400);}catch(e0){}"
            + "try{"
            + "if(typeof MutationObserver!=='undefined'){"
            + "var obs=new MutationObserver(schedule);"
            + "if(document.body){obs.observe(document.body,{attributes:true,attributeFilter:['class','style']});}"
            + "if(document.documentElement){obs.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});}"
            + "}"
            + "}catch(e2){}"
            + "}catch(e3){}})();";

    /** 解析 CSS 颜色为 ARGB int；失败返回哨兵 Integer.MIN_VALUE。支持 #RGB/#RRGGBB/rgb()/rgba()。 */
    private static int parseCssColor(final String css) {
        if (css == null) return Integer.MIN_VALUE;
        final String s = css.trim().toLowerCase(Locale.US).replace(" ", "");
        try {
            if (s.startsWith("#")) {
                String hex = s.substring(1);
                if (hex.length() == 3) {
                    hex = "" + hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1)
                            + hex.charAt(2) + hex.charAt(2);
                }
                if (hex.length() != 6) return Integer.MIN_VALUE;
                final int r = Integer.parseInt(hex.substring(0, 2), 16);
                final int g = Integer.parseInt(hex.substring(2, 4), 16);
                final int b = Integer.parseInt(hex.substring(4, 6), 16);
                return 0xFF000000 | (r << 16) | (g << 8) | b;
            }
            if (s.startsWith("rgb")) {
                final int lp = s.indexOf('(');
                final int rp = s.indexOf(')');
                if (lp < 0 || rp <= lp) return Integer.MIN_VALUE;
                final String[] p = s.substring(lp + 1, rp).split(",");
                if (p.length < 3) return Integer.MIN_VALUE;
                if (p.length >= 4 && Float.parseFloat(p[3]) <= 0.01f) return Integer.MIN_VALUE;
                final int r = clamp255(Math.round(Float.parseFloat(p[0])));
                final int g = clamp255(Math.round(Float.parseFloat(p[1])));
                final int b = clamp255(Math.round(Float.parseFloat(p[2])));
                return 0xFF000000 | (r << 16) | (g << 8) | b;
            }
        } catch (Throwable e) { return Integer.MIN_VALUE; }
        return Integer.MIN_VALUE;
    }

    private static int clamp255(final int v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

    /** sRGB 相对亮度（0~1）：> 0.6 视为浅色底 → 需深色图标。 */
    private static double relativeLuminance(final int color) {
        final double r = ((color >> 16) & 0xFF) / 255.0;
        final double g = ((color >> 8) & 0xFF) / 255.0;
        final double b = (color & 0xFF) / 255.0;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    /** 按真实顶部色应用状态栏（API23+ 动态图标明暗；API21-22 品牌蓝兜底）。 */
    private void applyStatusBarColor(final int color) {
        try {
            final Window window = getWindow();
            if (window == null) return;
            if (Build.VERSION.SDK_INT >= 21) {
                window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                // 【R-黑边】动态版同样要开 cutout 铺满 + API30 关 decor 留白（否则切页后黑边复现）
                applyCutoutMode(window);
                applyNonDecorFits(window);
                if (Build.VERSION.SDK_INT >= 23) {
                    window.setStatusBarColor(0x00000000); window.getDecorView().setSystemUiVisibility(window.getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN); // 透明状态栏(edge-to-edge)，图标明暗交由下方 luminance 分支
                    final View decor = window.getDecorView();
                    int vis = decor.getSystemUiVisibility();
                    final boolean lightIcons = relativeLuminance(color) > 0.6;
                    if (lightIcons) {
                        vis |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;  // 浅色底 → 深色图标
                    } else {
                        vis &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; // 深色底 → 浅色图标
                    }
                    decor.setSystemUiVisibility(vis);
                    // 【R-黑边】API30+ 原生等价写法（getInsetsController），取不到时静默跳过
                    applyLightStatusBarsAppearance(window, lightIcons);
                } else {
                    window.setStatusBarColor(0xFF5B8DEF); window.getDecorView().setSystemUiVisibility(window.getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN); // API21-22 兜底：品牌蓝 + 铺满状态栏(edge-to-edge)
                }
            }
        } catch (Throwable e) { /* 设置失败：静默 */ }
    }

    /* ================= 【R-黑边】打孔屏铺满 + 状态栏高度注入前端 ================= */

    /** 【R-黑边】API28+：允许窗口内容延伸到打孔/刘海区域（SHORT_EDGES）。
     *  缺这步时，即使状态栏已透明 + SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN，打孔屏（新安卓）
     *  仍把 WebView 视口压在状态栏下方 → 顶部一条纯黑不透明条（真机复现的根因）。
     *  注意：WindowManager.LayoutParams.layoutInDisplayCutoutMode 字段 API28 才有，
     *  常量值 SHORT_EDGES=1 会在编译期被 javac 内联（-source 8 亦可编译），
     *  运行期再用 SDK_INT 判级兜底 + try/catch，API21-27 不进此分支、行为不变。 */
    private void applyCutoutMode(final Window window) {
        try {
            if (Build.VERSION.SDK_INT < 28) return;
            final android.view.WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        } catch (Throwable e) { /* 设置失败：沿用系统默认，不影响功能 */ }
    }

    /** 【R-黑边】API30+：等价 androidx WindowCompat.setDecorFitsSystemWindows(false) 的纯原生写法（零 androidx 依赖）。
     *  API<30 不动 —— 维持既有 systemUiVisibility 的 LAYOUT_STABLE|LAYOUT_FULLSCREEN 分支，避免老设备回归。 */
    private void applyNonDecorFits(final Window window) {
        try {
            if (Build.VERSION.SDK_INT < 30) return;
            window.setDecorFitsSystemWindows(false);
        } catch (Throwable e) { /* 设置失败：沿用系统默认，不影响功能 */ }
    }

    /** 【R-黑边】API30+：用 WindowInsetsController 设置状态栏图标明暗（等价 SYSTEM_UI_FLAG_LIGHT_STATUS_BAR）。
     *  与上面 flags 双保险；controller 取不到（部分 ROM）时静默跳过，不影响老分支。 */
    private void applyLightStatusBarsAppearance(final Window window, final boolean lightIcons) {
        try {
            if (Build.VERSION.SDK_INT < 30) return;
            final android.view.WindowInsetsController c = window.getInsetsController();
            if (c == null) return;
            final int appearance = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS;
            c.setSystemBarsAppearance(lightIcons ? appearance : 0, appearance);
        } catch (Throwable e) { /* 静默 */ }
    }

    /** 【R-黑边】把系统状态栏高度实时注入前端 CSS 变量 --xt-satop。
     *  背景：老内核 WebView 不支持 env(safe-area-inset-*)，而 viewport-fit=cover 后页面内容
     *  会顶进状态栏；.topbar 用 var(--xt-satop, env(...)) 自己垫高，状态栏区域才能露出顶栏底色。
     *  实现：decorView.setOnApplyWindowInsetsListener → 回调里取状态栏 top(px) → 换算 dp(px/density)
     *  → evaluateJavascript 设 documentElement 的 --xt-satop。px 变化才下发（天然去抖）。
     *  API21-29 走 getSystemWindowInsetTop()，API30+ 走 getInsets(Type.statusBars())。
     *  全程 try/catch，任何异常都不影响页面渲染与应用启动。 */
    private void installStatusBarInsetBridge() {
        try {
            final Window window = getWindow();
            if (window == null) return;
            final View decor = window.getDecorView();
            if (decor == null) return;
            decor.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public android.view.WindowInsets onApplyWindowInsets(View v, android.view.WindowInsets insets) {
                    try {
                        int top = 0;
                        if (Build.VERSION.SDK_INT >= 30) {
                            final android.graphics.Insets sb =
                                    insets.getInsets(android.view.WindowInsets.Type.statusBars());
                            top = (sb == null) ? 0 : sb.top;
                        } else {
                            top = insets.getSystemWindowInsetTop();
                        }
                        if (top >= 0 && top != lastStatusBarTopPx) {
                            lastStatusBarTopPx = top;
                            // 密度现场取，避免分屏/显示器切换后 density 变化导致换算失真
                            pushStatusBarInsetToWeb(top, getResources().getDisplayMetrics().density);
                        }
                    } catch (Throwable t1) { /* 单次取 inset 失败不影响布局分发 */ }
                    return insets; // 不消费，按原样继续分发给子 View（WebView）
                }
            });
            // 主动触发一次分发（部分机型挂完 listener 不主动回调）
            try { decor.requestApplyInsets(); } catch (Throwable t3) { /* API19 以下无此方法，静默 */ }
        } catch (Throwable e) { /* 不影响启动 */ }
    }

    /** 【R-黑边】把 px 高度换算成 dp 并注入前端。Float.toString 恒用 '.' 小数点，与 Locale 无关，
     *  避免阿拉伯语等 locale 下生成 '24,0px' 这种非法 CSS 值。 */
    private void pushStatusBarInsetToWeb(final int topPx, final float density) {
        final WebView w = web;
        if (w == null) return;
        final float dp = (density > 0f) ? (topPx / density) : 0f;
        final String js = "(function(){try{document.documentElement.style.setProperty('--xt-satop','" + dp + "px');}catch(e){}})();";
        uiHandler.post(new Runnable() { @Override public void run() { evalJs(w, js); } });
    }

    /** 【R-黑边】onPageFinished 后补发一次：新文档的 documentElement 已丢掉 style，需重新设值。 */
    private void injectStatusBarInset(final WebView view) {
        if (view == null) return;
        if (lastStatusBarTopPx < 0) return;
        uiHandler.post(new Runnable() {
            @Override public void run() {
                try {
                    pushStatusBarInsetToWeb(lastStatusBarTopPx, getResources().getDisplayMetrics().density);
                } catch (Throwable t) { /* 静默 */ }
            }
        });
    }

    /* ================= 【R103 需求3】WebView H5 视频全屏 ================= */

    /** 进入全屏：把 H5 视频的自定义视图铺满 Activity 顶层 DecorView，并隐藏 WebView。
     *  由 WebChromeClient.onShowCustomView 触发；已有全屏视图时拒绝新请求（避免叠加）。 */
    private void showCustomView(final View view, final WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        try {
            View decor = getWindow().getDecorView();
            if (!(decor instanceof FrameLayout)) {
                // 极端机型 DecorView 非 FrameLayout：无法承载，直接回退
                if (callback != null) callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT);
            ((FrameLayout) decor).addView(view, lp);
            if (web != null) web.setVisibility(View.GONE);
            // 全屏视频：连同隐藏系统状态栏，画面真正铺满（退出时由 hideCustomView 恢复）
            decor.setSystemUiVisibility(decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_FULLSCREEN);
        } catch (Throwable t) {
            // 全屏失败：回滚并通知 WebView
            try {
                View decor = getWindow().getDecorView();
                if (decor instanceof FrameLayout && view != null) ((FrameLayout) decor).removeView(view);
            } catch (Throwable e2) { }
            customView = null;
            customViewCallback = null;
            if (web != null) web.setVisibility(View.VISIBLE);
            if (callback != null) callback.onCustomViewHidden();
        }
    }

    /** 退出全屏：移除自定义视图、恢复 WebView 显示，并重新应用状态栏（顶部浅色）。 */
    private void hideCustomView() {
        if (customView == null) return;
        try {
            View decor = getWindow().getDecorView();
            if (decor instanceof FrameLayout) ((FrameLayout) decor).removeView(customView);
        } catch (Throwable t) { /* 移除失败：忽略 */ }
        customView = null;
        if (web != null) web.setVisibility(View.VISIBLE);
        if (customViewCallback != null) {
            try { customViewCallback.onCustomViewHidden(); } catch (Throwable t) { }
            customViewCallback = null;
        }
        // 取消「全屏隐藏状态栏」，再重新应用沉浸式状态栏（顶部浅色）
        try {
            View dv = getWindow().getDecorView();
            dv.setSystemUiVisibility(dv.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_FULLSCREEN);
        } catch (Throwable te) { }
        applyImmersiveStatusBar(); // 退出全屏后恢复状态栏顶部浅色
    }

    /* ================= 【R103 需求1】H5 getUserMedia 麦克风授权辅助 ================= */

    /** 宿主是否已持有麦克风运行时权限（API23 以下安装即授予，视为已持有）。 */
    private boolean hasAudioRuntimePermission() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                   == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    /** 授予 WebView 麦克风资源（仅 AUDIO_CAPTURE）。 */
    private void grantWebAudio(final android.webkit.PermissionRequest request) {
        try {
            request.grant(new String[] { android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE });
        } catch (Throwable t) { /* 授予失败：静默，页面侧自行降级 */ }
    }

    /** 【R103 需求1·补】跳转本应用「应用详情」设置页，方便用户手动开启麦克风权限。
     *  个别定制 ROM 无法直达详情页时退回系统设置首页；仍失败则保留已弹出的文字指引。 */
    private void openAppSettings() {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Throwable e) {
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS));
            } catch (Throwable e2) { /* 跳不过去：前面 Toast 已给出文字指引 */ }
        }
    }

    /* ================= 原生消息通知（R72 需求5） ================= */

    /** 创建通知渠道（API 26+ 必须；已存在则跳过，创建失败不影响其它功能） */
    private void ensureNotifyChannel() {
        try {
            if (Build.VERSION.SDK_INT < 26) return;
            NotificationManager nm = (NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(NOTIFY_CHANNEL_ID) != null) return;
            NotificationChannel ch = new NotificationChannel(NOTIFY_CHANNEL_ID, "消息通知", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("星途 · 收到新消息时弹出横幅提醒");
            nm.createNotificationChannel(ch);
        } catch (Throwable e) { /* 渠道创建失败：静默 */ }
    }

    /** 弹一条原生通知横幅；title 空则用「星途」，text 截断 100 字。
     *  API 33+ 未授权时先申请（本次不弹），授权后在 onRequestPermissionsResult 补弹。 */
    private void showNotify(final String title, final String text) {
        final String t = (title == null || title.trim().isEmpty()) ? "星途" : title.trim();
        String body = (text == null) ? "" : text;
        if (body.length() > 100) body = body.substring(0, 100);
        final String b = body;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    ensureNotifyChannel();
                    if (Build.VERSION.SDK_INT >= 33
                            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        // 未授权：记下待弹内容，授权后补弹
                        pendingNotifyTitle = t;
                        pendingNotifyText = b;
                        requestNotifyPermission();
                        return;
                    }
                    NotificationManager nm = (NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
                    if (nm == null) return;
                    Intent open = new Intent(MainActivity.this, MainActivity.class);
                    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;
                    PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 0, open, piFlags);
                    Notification.Builder builder;
                    if (Build.VERSION.SDK_INT >= 26) {
                        builder = new Notification.Builder(MainActivity.this, NOTIFY_CHANNEL_ID);
                    } else {
                        builder = new Notification.Builder(MainActivity.this);
                    }
                    builder.setSmallIcon(R.drawable.ic_launcher);
                    builder.setContentTitle(t);
                    if (b.length() > 0) builder.setContentText(b);
                    builder.setAutoCancel(true);
                    builder.setContentIntent(pi);
                    nm.notify(NOTIFY_ID, builder.build());
                } catch (Throwable e) { /* 通知失败绝不影响 WebView */ }
            }
        });
    }

    /** 申请通知权限（仅 API 33+ 需要），授权结果在 onRequestPermissionsResult 处理 */
    private void requestNotifyPermission() {
        try {
            if (Build.VERSION.SDK_INT < 33) return;
            requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIFY_PERM);
        } catch (Throwable e) { /* 申请失败：静默 */ }
    }

    /** R73-18①：启动时即申请通知权限（未授权则退后台的新消息横幅不会显示）。 */
    private void maybeRequestNotifyPermission() {
        try {
            if (Build.VERSION.SDK_INT < 33) return;
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIFY_PERM);
        } catch (Throwable e) { /* 静默 */ }
    }

    /* ================= 【需求C】通知权限引导闭环 + 电池优化首启引导 ================= */

    private static final String KEY_BATTERY_GUIDED = "battery_guide_done";

    /** 跳系统「应用通知」设置页（onRequestPermissionsResult 拒绝分支与 openNotifySettings 桥共用）。
     *  EXTRA_APP_PACKAGE 需 API 26，低版本上 extra 无效但跳应用设置列表仍可用；全兜底 try/catch。 */
    private void openAppNotificationSettings() {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(i);
        } catch (Throwable e) {
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_SETTINGS));
            } catch (Throwable e2) {
                toast("请在 系统设置→应用→星途→通知 中开启通知");
            }
        }
    }

    /** 【需求C】首启自动引导一次电池优化白名单（复用既有 requestIgnoreBatteryOptimizations 桥逻辑）。
     *  仅弹一次：标记落盘 xt_notify_prefs/battery_guide_done；系统弹窗由用户确认，不强制。 */
    private void maybeGuideBatteryOnce() {
        try {
            android.content.SharedPreferences sp = getSharedPreferences(
                    MsgPollService.PREFS, android.content.Context.MODE_PRIVATE);
            if (sp.getBoolean(KEY_BATTERY_GUIDED, false)) return;
            sp.edit().putBoolean(KEY_BATTERY_GUIDED, true).apply();
            openBatteryOptimizationRequest();   // onCreate 在主线程，直接调用（桥内经 runOnUiThread）
        } catch (Throwable e) { /* 引导失败：静默，不影响启动 */ }
    }

    /** 【需求C】发起电池优化白名单请求（原 requestIgnoreBatteryOptimizations 桥的实现，供桥与首启共用）。 */
    private void openBatteryOptimizationRequest() {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent(
                        android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else {
                toast("当前系统无需手动设置电池优化");
            }
        } catch (Throwable e) {
            try {
                startActivity(new Intent(
                        android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Throwable e2) {
                toast("请在 系统设置→电池 中允许本应用后台运行");
            }
        }
    }

    /* ================= 【需求1·图片保存】相册写入（API 分支） ================= */

    /** API29+：MediaStore.Images 写公共 Pictures/星途（RELATIVE_PATH，免存储权限）。
     *  返回 content:// URI，失败返回 null（调用方统一映射 __ERROR__）。 */
    private String writeImageToMediaStore(android.graphics.Bitmap bmp, String fileName, String mimeType) {
        try {
            android.content.ContentResolver cr = getContentResolver();
            String mime = (mimeType == null || mimeType.trim().isEmpty()) ? "image/png" : mimeType.trim();
            android.content.ContentValues cv = new android.content.ContentValues();
            cv.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, fileName);
            cv.put(android.provider.MediaStore.Images.Media.MIME_TYPE, mime);
            cv.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_PICTURES + "/星途");
            Uri uri = cr.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) return null;
            java.io.OutputStream os = cr.openOutputStream(uri);
            if (os == null) return null;
            // JPEG 源图用 JPEG 编码保持格式一致；其余（png/webp 等）一律 PNG 兜底
            android.graphics.Bitmap.CompressFormat fmt =
                    mime.contains("jpeg") || mime.contains("jpg")
                            ? android.graphics.Bitmap.CompressFormat.JPEG
                            : android.graphics.Bitmap.CompressFormat.PNG;
            boolean ok = bmp.compress(fmt, 100, os);
            os.close();
            if (!ok) {
                // 写入失败：清掉半截记录，不留脏条目
                try { cr.delete(uri, null, null); } catch (Throwable t) { /* 静默 */ }
                return null;
            }
            return uri.toString();
        } catch (Throwable e) {
            return null;
        }
    }

    /** API<29：写应用专属 Pictures 目录（getExternalFilesDir，零权限；相册不可见为设计内降级）。
     *  成功后 toast 告知实际保存路径。返回绝对路径，失败返回 null。 */
    private String writeImageToAppPictures(android.graphics.Bitmap bmp, String fileName) {
        java.io.FileOutputStream fos = null;
        try {
            java.io.File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (dir == null) return null;
            if (!dir.exists()) dir.mkdirs();
            java.io.File out = new java.io.File(dir, fileName);
            if (out.exists()) {
                // 简单防覆盖：同名追加时间戳
                int dot = fileName.lastIndexOf('.');
                String stem = (dot > 0) ? fileName.substring(0, dot) : fileName;
                String ext = (dot > 0) ? fileName.substring(dot) : "";
                out = new java.io.File(dir, stem + "_" + System.currentTimeMillis() + ext);
            }
            fos = new java.io.FileOutputStream(out);
            bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, fos);
            fos.close();
            fos = null;
            toast("已保存到应用图片目录: " + out.getAbsolutePath());
            return out.getAbsolutePath();
        } catch (Throwable e) {
            return null;
        } finally {
            if (fos != null) { try { fos.close(); } catch (Throwable t) { /* 静默 */ } }
        }
    }

    /* ================= 【定位】R96：WebView geolocation 所需的运行时权限 ================= */

    /** R96：启动时申请定位权限（WebView geolocation 依赖系统定位权限）。
     *  Android 6.0(API 23)+ ACCESS_FINE/COARSE_LOCATION 为危险权限，必须运行时申请。
     *  已授予则直接跳过；拒绝也不影响其它功能（页面侧降级为手动填写地区）。 */
    private void maybeRequestLocationPermission() {
        try {
            if (Build.VERSION.SDK_INT < 23) return; // 6.0 以下安装即授予，无需运行时申请
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            if (checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            requestPermissions(new String[] {
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION
            }, REQ_LOCATION_PERM);
        } catch (Throwable e) { /* 申请失败：静默，不得影响其它功能 */ }
    }

    // 原生 TTS 播放完成 → 回调网页 window.__nativeTtsDone(utteranceId)，让依赖 onend 的流程继续
    private void notifyTtsDone(final String utteranceId) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web != null) {
                    String js = "window.__nativeTtsDone&&window.__nativeTtsDone('" + utteranceId + "')";
                    web.evaluateJavascript(js, null);
                }
            }
        });
    }

    /* ================= 原生网络 TTS / 原生语音识别 回调 + 权限（v1.13） ================= */

    private void notifyNetTtsDone(final String uid) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String js = "window.__netTtsDone&&window.__netTtsDone('" + uid + "')";
                try { web.evaluateJavascript(js, null); } catch (Exception e) { }
            }
        });
    }

    private void notifyNetTtsError(final String uid, final String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String m = (msg == null ? "" : msg).replace("'", "").replace("\"", "");
                String js = "window.__netTtsError&&window.__netTtsError('" + uid + "','" + m + "')";
                try { web.evaluateJavascript(js, null); } catch (Exception e) { }
            }
        });
    }

    private void notifyRecResult(final String rid, final String text) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String safe = (text == null ? "" : text).replace("'", "\\'").replace("\"", "\\\"");
                String js = "window.__recResult&&window.__recResult('" + rid + "','" + safe + "')";
                try { web.evaluateJavascript(js, null); } catch (Exception e) { }
            }
        });
    }

    private void notifyRecError(final String rid, final String code) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String js = "window.__recError&&window.__recError('" + rid + "','" + code + "')";
                try { web.evaluateJavascript(js, null); } catch (Exception e) { }
            }
        });
    }

    /* ================= 【R106】原生录音桥（预埋，随下次 APK 生效） ================= */

    /** 【R106】开始录音（主线程调用）。权限未授予时先申请(REQ 2002)，授权回调里再启动；
     *  被拒回传 ok:false/denied；任何异常一律 ok:false，绝不抛进 WebView。 */
    private void startVoiceRecordInternal() {
        try {
            if (voiceRecording || voiceStartPending) return;
            if (!hasAudioRuntimePermission()) {
                voiceStartPending = true;
                requestRecPermission();   // 复用既有 RECORD_AUDIO 运行时申请
                return;
            }
            beginVoiceRecorder();
        } catch (Throwable t) {
            voiceStartPending = false;
            notifyVoiceRecord("{\"ok\":false,\"err\":\"start_failed\"}");
        }
    }

    /** 【R106】创建并启动 MediaRecorder：MPEG_4 + AAC → m4a（命中后端魔数白名单），
     *  落 getCacheDir()/voice_rec.m4a，60 秒硬上限。 */
    private void beginVoiceRecorder() {
        try {
            if (voiceRecording) return;
            if (voiceRecorder != null) {
                try { voiceRecorder.release(); } catch (Throwable t) { }
                voiceRecorder = null;
            }
            java.io.File out = new java.io.File(getCacheDir(), "voice_rec.m4a");
            voiceRecFile = out;
            android.media.MediaRecorder r = new android.media.MediaRecorder();
            r.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);
            try { r.setAudioEncodingBitRate(64000); } catch (Throwable t) { }
            try { r.setAudioSamplingRate(44100); } catch (Throwable t) { }
            r.setOutputFile(out.getAbsolutePath());
            r.prepare();
            r.start();
            voiceRecorder = r;
            voiceRecording = true;
            voiceRecordStartMs = System.currentTimeMillis();
            try {
                voiceStopHandler.removeCallbacks(voiceStopTask);
                voiceStopHandler.postDelayed(voiceStopTask, VOICE_MAX_MS);
            } catch (Throwable t) { /* 定时失败：仅失去自动上限，手动停止仍可用 */ }
        } catch (Throwable t) {
            try { if (voiceRecorder != null) voiceRecorder.release(); } catch (Throwable e2) { }
            voiceRecorder = null;
            voiceRecording = false;
            notifyVoiceRecord("{\"ok\":false,\"err\":\"recorder_init\"}");
        }
    }

    /** 【R106】停止录音：读文件转 base64 后经 window.__onVoiceRecord 回传（子线程读盘，避免卡 UI）。
     *  未在录音时回传 ok:false/not_recording；任何异常一律 ok:false，绝不抛进 WebView。 */
    private void stopVoiceRecordInternal() {
        try { voiceStopHandler.removeCallbacks(voiceStopTask); } catch (Throwable t) { }
        if (!voiceRecording || voiceRecorder == null) {
            voiceRecording = false;
            notifyVoiceRecord("{\"ok\":false,\"err\":\"not_recording\"}");
            return;
        }
        int dur = 1;
        try { dur = (int) Math.max(1L, Math.round((System.currentTimeMillis() - voiceRecordStartMs) / 1000.0)); }
        catch (Throwable t) { dur = 1; }
        final java.io.File file = voiceRecFile;
        final int durationSec = dur;
        try {
            voiceRecorder.stop();
        } catch (Throwable t) {
            try { voiceRecorder.release(); } catch (Throwable e2) { }
            voiceRecorder = null;
            voiceRecording = false;
            if (file != null) { try { file.delete(); } catch (Throwable e3) { } }
            notifyVoiceRecord("{\"ok\":false,\"err\":\"stop_failed\"}");
            return;
        }
        try { voiceRecorder.release(); } catch (Throwable t) { }
        voiceRecorder = null;
        voiceRecording = false;
        new Thread(new Runnable() {
            @Override public void run() {
                java.io.FileInputStream in = null;
                try {
                    if (file == null || !file.exists() || file.length() <= 0) {
                        notifyVoiceRecord("{\"ok\":false,\"err\":\"empty\"}");
                        return;
                    }
                    in = new java.io.FileInputStream(file);
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                    in.close();
                    in = null;
                    String b64 = android.util.Base64.encodeToString(
                            bos.toByteArray(), android.util.Base64.NO_WRAP);
                    notifyVoiceRecord("{\"ok\":true,\"dataUrl\":\"data:audio/mp4;base64," + b64
                            + "\",\"durationSec\":" + durationSec + "}");
                } catch (Throwable t) {
                    notifyVoiceRecord("{\"ok\":false,\"err\":\"read_failed\"}");
                } finally {
                    if (in != null) { try { in.close(); } catch (Throwable e) { } }
                    if (file != null) { try { file.delete(); } catch (Throwable e) { } }
                }
            }
        }).start();
    }

    /** 【R106】把录音结果 JSON 回传网页：window.__onVoiceRecord(jsonStr)。jsonStr 由本类构造
     *  （仅含 base64/数字/固定词），仍做一次转义保险；异常静默，绝不影响页面。 */
    private void notifyVoiceRecord(final String jsonStr) {
        uiHandler.post(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String s = (jsonStr == null) ? "{\"ok\":false,\"err\":\"null\"}" : jsonStr;
                s = s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "").replace("\r", "");
                String js = "window.__onVoiceRecord&&window.__onVoiceRecord('" + s + "')";
                try { web.evaluateJavascript(js, null); } catch (Throwable t) { }
            }
        });
    }

    /** 请求麦克风权限（Android 6.0+ 运行时权限）；授权结果记入 recPermissionGranted */
    private void requestRecPermission() {
        if (android.os.Build.VERSION.SDK_INT < 23) {
            recPermissionGranted = true;
            return;
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            recPermissionGranted = true;
            return;
        }
        requestPermissions(new String[] { android.Manifest.permission.RECORD_AUDIO }, 2002);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == 2002) {
            recPermissionGranted = (grantResults != null && grantResults.length > 0
                    && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED);
            // 【R103 需求1】若该申请由 H5 getUserMedia(onPermissionRequest) 触发：结果回来后回填 grant/deny
            android.webkit.PermissionRequest wp = pendingWebPermissionRequest;
            pendingWebPermissionRequest = null;
            if (wp != null) {
                if (recPermissionGranted) grantWebAudio(wp);
                else { try { wp.deny(); } catch (Throwable t) { } }
            }
            // 【R106】若本次申请由原生录音桥(startVoiceRecordInternal)触发：授权则启动录音，被拒则回传失败
            if (voiceStartPending) {
                voiceStartPending = false;
                if (recPermissionGranted) startVoiceRecordInternal();
                else notifyVoiceRecord("{\"ok\":false,\"err\":\"denied\"}");
            }
            if (!recPermissionGranted) {
                notifyRecError("perm", "not_allowed");
                // 【R103 需求1·补】永久拒绝（用户勾选过"不再询问"）→ requestPermissions 会立即回 denied
                // 且不再弹框，只能明确引导用户去系统设置手动开启麦克风。
                try {
                    if (Build.VERSION.SDK_INT >= 23
                            && !shouldShowRequestPermissionRationale(android.Manifest.permission.RECORD_AUDIO)) {
                        toast("麦克风权限已被拒绝，请在 系统设置 → 应用 → 星途 → 权限 中开启麦克风");
                        openAppSettings(); // 可选取跳应用详情页；跳不过去只保留上面的 Toast
                    }
                } catch (Throwable t) { /* 引导失败：不影响其它功能 */ }
            }
        } else if (requestCode == REQ_NOTIFY_PERM) {
            boolean granted = (grantResults != null && grantResults.length > 0
                    && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED);
            if (granted) { // 授权成功：补弹此前被拦下的通知
                String pt = pendingNotifyTitle;
                String pb = pendingNotifyText;
                pendingNotifyTitle = null;
                pendingNotifyText = null;
                if (pt != null) showNotify(pt, pb);
            } else {
                // 【需求C】拒绝分支补引导闭环（对齐定位权限分支的既有做法）：
                // toast 告知后果 + 跳系统「应用通知」设置页，用户开启后无需重启 App 即可收到横幅。
                toast("未开启通知权限，收不到新消息横幅，可在系统设置中开启");
                openAppNotificationSettings();
            }
        } else if (requestCode == REQ_LOCATION_PERM) {
            // R96：定位权限结果。拒绝也不影响其它功能；WebView 侧会降级为「无法自动定位」，
            // 页面 xt-region.js 的 locate() 返回失败后引导用户手动选择地区。
            boolean granted = (grantResults != null && grantResults.length > 0
                    && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED);
            if (!granted) {
                toast("未授予定位权限，可在 系统设置→应用→星途→权限 中开启；此前仍可手动选择地区");
            }
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{ data.getData() };
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    // 返回键：H5 视频全屏 → 先退全屏；否则网页内后退 → 退出应用
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // 【R103 需求3】全屏视频中：返回键先退出全屏
            if (customView != null) {
                hideCustomView();
                return true;
            }
            if (web != null && web.canGoBack()) {
                web.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    // R73-18①：前台/后台状态 → 供 MsgPollService 判断是否由自己弹通知（前台交给 JS，避免重复）
    @Override
    protected void onResume() {
        super.onResume();
        MsgPollService.appForeground = true;
    }

    @Override
    protected void onPause() {
        super.onPause();
        MsgPollService.appForeground = false;
    }

    /** 【批5/R104e】窗口焦点变化 → 维护 uiForeground（对 onResume/onPause 零改动）。
     *  仅用于「必须由可见 Activity 发起位置共享」的前台性把关。 */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        uiForeground = hasFocus;
    }

    /** 【批5/R104e】把一次定位推给页面：window.__onLocationUpdate(JSON字符串)。
     *  由 LocationShareService 在每次定位时调用；JSON 用 JSONObject.quote 转义
     *  （照 notifyRecResult 的注入范式，参数为字符串）。无实例/无 WebView 时静默忽略。 */
    public static void pushLocationUpdate(final String json) {
        final MainActivity a = (sInstanceRef == null) ? null : sInstanceRef.get();
        if (a == null) return;
        a.uiHandler.post(new Runnable() {
            @Override public void run() {
                if (a.web == null) return;
                String payload = (json == null) ? "{}" : json;
                String quoted;
                try { quoted = org.json.JSONObject.quote(payload); }
                catch (Throwable e) { quoted = "\"\""; }
                String js = "window.__onLocationUpdate&&window.__onLocationUpdate(" + quoted + ")";
                try { a.web.evaluateJavascript(js, null); } catch (Throwable e) { /* 静默 */ }
            }
        });
    }

    /** 【R105】通知点击热启动：MainActivity 已在栈顶时系统走 onNewIntent
     *  （Manifest 已声明 launchMode=singleTop）。 */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOpenIntent(intent);
    }

    /* ================= 【R105】通知点击深链 + 服务恢复 + 通知清理 ================= */

    /** 【R105】暂存的深链参数 JSON（等前端会话选中契约确认后由最终注入调用消费）。 */
    private volatile String pendingDeepLinkJson = null;

    /** 【R105】WebView 页面是否已加载完成（onPageFinished 置 true）。用于处理
     *  「冷启动时 handleOpenIntent 早于页面加载完成」的竞态：页面未就绪则保留 pending，
     *  待 onPageFinished 末尾再补发一次。 */
    private volatile boolean webPageReady = false;

    /** 【R105】App 冷启动（onCreate）与热启动（onNewIntent）统一走这里：
     *  识别 MsgPollService 通知点击带来的 extras
     *  （xt_open_conversation / xt_msg_id / xt_msg_type / xt_msg_name），组装 JSON 暂存。 */
    private void handleOpenIntent(final Intent intent) {
        try {
            if (intent == null || !intent.getBooleanExtra("xt_open_conversation", false)) return;
            final String type = intent.getStringExtra("xt_msg_type");
            final String name = intent.getStringExtra("xt_msg_name");
            final long id = intent.getLongExtra("xt_msg_id", -1L);
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("type", type == null ? "" : type);
            o.put("name", name == null ? "" : name);
            o.put("id", id);
            pendingDeepLinkJson = o.toString();
            forwardPendingDeepLink();
        } catch (Throwable e) { /* 深链解析失败：不影响正常打开 */ }
    }

    /** 【R105】把暂存深链转发给 WebView 前端，直达对应会话（契约见 _r105_deeplink_contract.txt）。
     *  前端唯一入口 window.gotoChatWith(peerId, name, avatar)（assets/app.js 已导出）：
     *   · peerId>0 → 打开该用户私聊（页内已有 imOpenChatWithUser 则直接开会话，
     *     否则走 ?uid=&name= 站内深链）；· peerId=0 → 回落 gotoChat() 打开聊天列表。
     *  群/系统类通知本批只做降级（pid=0 → 打开聊天列表），按群直达需前端另开契约，不在本批范围。
     *  竞态：页面未就绪(webPageReady=false)时保留 pending，onPageFinished 末尾再调一次。
     *  name 必须经 org.json.JSONObject.quote() 转义（通知标题可能含引号），禁止裸拼接。 */
    private void forwardPendingDeepLink() {
        final String json = pendingDeepLinkJson;
        if (json == null) return;
        if (!webPageReady) return;                 // 页面没就绪 → 保留 pending，onPageFinished 末尾再调
        if (web == null) return;
        pendingDeepLinkJson = null;                // 先清后注入，防重入重复跳转
        long pid = 0L;
        String name = "";
        try {
            org.json.JSONObject o = new org.json.JSONObject(json);
            String type = o.optString("type", "");
            name = o.optString("name", "");
            long id = o.optLong("id", 0L);
            // 仅 peer 类型直达用户会话；群/系统类本批降级为打开聊天列表(pid=0)
            pid = ("peer".equals(type) || type == null || type.isEmpty()) ? id : 0L;
            if (pid < 0) pid = 0L;
        } catch (Throwable t) {
            pid = 0L;                              // 解析失败：降级为打开聊天列表，绝不中断开 App
        }
        final long fpid = pid;
        final String fname = (name == null) ? "" : name;
        uiHandler.post(new Runnable() {
            @Override public void run() {
                try {
                    if (web == null) return;
                    // 走 evaluateJavascript；name 经 JSONObject.quote 转义防注入；
                    // 无 gotoChatWith 时回落站内深链 私聊.html?uid=，整体 try/catch 静默。
                    String js = "javascript:try{if(window.gotoChatWith){window.gotoChatWith("
                            + fpid + "," + org.json.JSONObject.quote(fname) + ","
                            + "\"\");}else{location.href='私聊.html?uid=" + fpid + "';}}catch(e){}";
                    web.evaluateJavascript(js, null);
                } catch (Throwable t) { /* 静默：深链失败不能影响开 App */ }
            }
        });
    }

    /** 【R105】App 启动时按本地开关+登录态恢复前台轮询服务（前端 setNotifyConfig 也会触发，双保险）。 */
    private void ensureMsgPollService() {
        try {
            android.content.SharedPreferences sp = getSharedPreferences(
                    MsgPollService.PREFS, android.content.Context.MODE_PRIVATE);
            boolean enabled = sp.getBoolean(MsgPollService.KEY_ENABLED, true);
            String token = sp.getString(MsgPollService.KEY_TOKEN, "");
            if (!enabled || token == null || token.trim().isEmpty()) return;
            Intent svc = new Intent(this, MsgPollService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc);
            else startService(svc);
        } catch (Throwable e) { /* 恢复失败：静默 */ }
    }

    /** 【R105】取消原生侧消息轮询产生的全部通知（设置页关开关时调用）。 */
    private void cancelPollNotifications() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            nm.cancel(MsgPollService.MSG_NOTIFY_ID);
            nm.cancel(MsgPollService.ALIVE_NOTIFY_ID);
        } catch (Throwable e) { /* 静默 */ }
    }

    @Override
    protected void onDestroy() {
        // 【需求C】Activity 销毁后进程若仍存活（onPause 已置 false，此处兜底）：
        // 防 MsgPollService 误判「用户在前台」而不弹横幅。
        MsgPollService.appForeground = false;
        // 【R101】注销下载完成广播（与 onCreate 的 registerApkDoneReceiver 配对）
        if (apkDoneReceiver != null) {
            try { unregisterReceiver(apkDoneReceiver); } catch (Exception e) { }
            apkDoneReceiver = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception e) { }
            tts = null;
        }
        super.onDestroy();
    }
}
