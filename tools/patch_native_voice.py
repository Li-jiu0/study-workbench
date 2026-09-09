# -*- coding: utf-8 -*-
"""v1.13 原生语音能力补丁：
1) 原生网络 TTS：netTts() 桥 —— 有道发音接口下载 mp3 → MediaPlayer 播放（绕开 WebView Audio 限制）
2) 原生语音识别：startRecognition()/stopRecognition() 桥 —— 系统 SpeechRecognizer（WebView 无 Web Speech API）
3) RECORD_AUDIO 运行时权限请求
全部使用全限定类名，不动 import 列表。
"""
import io

path = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ---------- 1) 字段声明（加到 notifyTtsStatus 方法之前） ----------
old_field = """    /** 引擎状态变化 → 推送给页面 window.__nativeTtsStatus(ok, info) */"""
new_field = """    // ---- 原生网络 TTS（v1.13：MediaPlayer 播放有道 mp3，绕开 WebView Audio 限制）----
    private android.media.MediaPlayer netPlayer = null;
    // ---- 原生语音识别（v1.13：系统 SpeechRecognizer，WebView 无 Web Speech API）----
    private android.speech.SpeechRecognizer sr = null;
    private volatile boolean recPermissionGranted = false;

    /** 引擎状态变化 → 推送给页面 window.__nativeTtsStatus(ok, info) */"""
assert old_field in src, 'field anchor not found'
src = src.replace(old_field, new_field, 1)

# ---------- 2) AndroidTTS 桥内新增方法（reinit 方法之后、桥对象结束之前） ----------
old_bridge = """            /** 重新初始化语音引擎（用户在系统设置修好引擎后回到 App，点发音即自动重连） */
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
        }, "AndroidTTS");"""
new_bridge = """            /** 重新初始化语音引擎（用户在系统设置修好引擎后回到 App，点发音即自动重连） */
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
                        try {
                            String urlStr = "https://dict.youdao.com/dictvoice?audio="
                                    + java.net.URLEncoder.encode(t, "UTF-8") + "&type=2";
                            java.net.HttpURLConnection conn = (java.net.HttpURLConnection)
                                    new java.net.URL(urlStr).openConnection();
                            conn.setConnectTimeout(10000);
                            conn.setReadTimeout(15000);
                            conn.setRequestProperty("User-Agent",
                                    "Mozilla/5.0 (Linux; Android 15; 学习工作台) AppleWebKit/537.36");
                            conn.setInstanceFollowRedirects(true);
                            int code = conn.getResponseCode();
                            if (code != 200) {
                                conn.disconnect();
                                notifyNetTtsError(uid, "服务器返回 " + code);
                                return;
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
                        } catch (final Exception e) {
                            notifyNetTtsError(uid, "网络失败");
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
        }, "AndroidTTS");"""
assert old_bridge in src, 'bridge anchor not found'
src = src.replace(old_bridge, new_bridge, 1)

# ---------- 3) 类级别回调 + 权限方法（加到 onActivityResult 之前） ----------
old_ar = """    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {"""
new_ar = """    /* ================= 原生网络 TTS / 原生语音识别 回调 + 权限（v1.13） ================= */

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
                String m = (msg == null ? "" : msg).replace("'", "").replace("\\"", "");
                String js = "window.__netTtsError&&window.__netTtsError('" + uid + "','" + m + "')";
                try { web.evaluateJavascript(js, null); } catch (Exception e) { }
            }
        });
    }

    private void notifyRecResult(final String rid, final String text) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                String safe = (text == null ? "" : text).replace("'", "\\\\'").replace("\\"", "\\\\\\"");
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
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {"""
assert old_ar in src, 'onActivityResult anchor not found'
src = src.replace(old_ar, new_ar, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: MainActivity.java patched, size =', len(src))
