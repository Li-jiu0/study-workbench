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

        // 【R103 需求2】状态栏沉浸式：状态栏背景与 App 顶部浅色同色 + API23+ 深色图标（见 applyImmersiveStatusBar）
        applyImmersiveStatusBar();

        web = new WebView(this);
        setContentView(web);

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

            /** 【R73-18①】引导用户把本应用加入电池优化白名单（可选，降低被系统冻结概率）。 */
            @JavascriptInterface
            public void requestIgnoreBatteryOptimizations() {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
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
                // 【R103 需求2·动态版】注入自包含脚本：动态取页面真实顶部色设置状态栏
                injectStatusBarColor(view);
            }
        });
        web.loadUrl("file:///android_asset/" + Uri.encode("学习工作台.html"));

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
                String[] accept = params.getAcceptTypes();
                if (accept != null && accept.length > 0 && accept[0] != null
                        && accept[0].contains("image")) {
                    mime = "image/*";
                }
                intent.setType(mime);
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择文件"), REQ_FILE_CHOOSER);
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
                if (Build.VERSION.SDK_INT >= 23) {
                    window.setStatusBarColor(colorTopBar);
                    View decor = window.getDecorView();
                    decor.setSystemUiVisibility(
                            decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                } else {
                    window.setStatusBarColor(colorFallback);
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
                if (Build.VERSION.SDK_INT >= 23) {
                    window.setStatusBarColor(color);
                    final View decor = window.getDecorView();
                    int vis = decor.getSystemUiVisibility();
                    if (relativeLuminance(color) > 0.6) {
                        vis |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;  // 浅色底 → 深色图标
                    } else {
                        vis &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; // 深色底 → 浅色图标
                    }
                    decor.setSystemUiVisibility(vis);
                } else {
                    window.setStatusBarColor(0xFF5B8DEF); // API21-22：不支持深色图标，品牌蓝兜底
                }
            }
        } catch (Throwable e) { /* 设置失败：静默 */ }
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

    @Override
    protected void onDestroy() {
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
