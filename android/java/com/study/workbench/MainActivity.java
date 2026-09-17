package com.study.workbench;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

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

    // ---- 原生消息通知（R72 需求5：收到消息弹系统横幅）----
    private static final String NOTIFY_CHANNEL_ID = "xt_msg";
    private static final int NOTIFY_ID = 101;
    private static final int REQ_NOTIFY_PERM = 2003;
    private volatile String pendingNotifyTitle = null;
    private volatile String pendingNotifyText = null;

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

        web = new WebView(this);
        setContentView(web);

        // 【原生 TTS】先试系统默认引擎，失败自动切换本机其他引擎（见 initTts/nextEngineOrGiveUp）
        initTts();

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
        web.setWebViewClient(new WebViewClient());
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

    /* ================= 通用 ================= */

    private void toast(final String s) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                android.widget.Toast.makeText(MainActivity.this, s, android.widget.Toast.LENGTH_LONG).show();
            }
        });
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
            if (!recPermissionGranted) {
                notifyRecError("perm", "not_allowed");
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

    // 返回键：网页内后退 → 退出应用
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
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
