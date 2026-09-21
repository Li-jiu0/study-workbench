# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 替换 netTts 方法里的网络请求部分（第 240-264 行）
old_request = """                        try {
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
                        }"""

new_request = """                        // 多 TTS 接口降级：有道美式 → 百度翻译 → 有道英式
                        String[][] sources = {
                            {"https://dict.youdao.com/dictvoice?audio=" + java.net.URLEncoder.encode(t, "UTF-8") + "&type=2", "https://dict.youdao.com/"},
                            {"https://fanyi.baidu.com/gettts?lan=en&text=" + java.net.URLEncoder.encode(t, "UTF-8") + "&spd=3&source=web", "https://fanyi.baidu.com/"},
                            {"https://dict.youdao.com/dictvoice?audio=" + java.net.URLEncoder.encode(t, "UTF-8") + "&type=1", "https://dict.youdao.com/"}
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
                        }"""

if old_request in src:
    src = src.replace(old_request, new_request, 1)
    print('FIXED: netTts 多接口降级 + 完整请求头')
else:
    print('SKIP: old_request pattern not found')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: MainActivity.java saved')
