# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 在 saveFile 方法结束后、}, "AndroidBridge"); 之前加 fetchUrl 方法
old_end = """                    os.close();
                    toast("已保存:" + out.getAbsolutePath());
                } catch (final Exception e) {
                    toast("保存失败:" + e.getMessage());
                }
            }
        }, "AndroidBridge");"""

new_end = """                    os.close();
                    toast("已保存:" + out.getAbsolutePath());
                } catch (final Exception e) {
                    toast("保存失败:" + e.getMessage());
                }
            }

            /** 原生网络请求：绕过 WebView CORS 限制，供时政热点等模块获取外部 API 数据。 */
            @JavascriptInterface
            public String fetchUrl(final String url) {
                if (url == null || url.trim().isEmpty()) return "";
                java.net.HttpURLConnection conn = null;
                try {
                    java.net.URL u = new java.net.URL(url.trim());
                    conn = (java.net.HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 15) StudyWorkbench/1.0");
                    conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
                    int code = conn.getResponseCode();
                    java.io.InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                    if (is == null) return "";
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
                    is.close();
                    return new String(bos.toByteArray(), "UTF-8");
                } catch (final Exception e) {
                    return "";
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }, "AndroidBridge");"""

if old_end in src:
    src = src.replace(old_end, new_end, 1)
    print('FIXED: MainActivity.java 加 fetchUrl 方法')
else:
    print('SKIP: pattern not found, trying alternative...')
    # 尝试只匹配 }, "AndroidBridge");
    if '}, "AndroidBridge");' in src:
        # 在第一个 }, "AndroidBridge"); 前面插入
        idx = src.index('}, "AndroidBridge");')
        fetch_method = """
            /** 原生网络请求：绕过 WebView CORS 限制。 */
            @JavascriptInterface
            public String fetchUrl(final String url) {
                if (url == null || url.trim().isEmpty()) return "";
                java.net.HttpURLConnection conn = null;
                try {
                    java.net.URL u = new java.net.URL(url.trim());
                    conn = (java.net.HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 15) StudyWorkbench/1.0");
                    conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
                    int code = conn.getResponseCode();
                    java.io.InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                    if (is == null) return "";
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
                    is.close();
                    return new String(bos.toByteArray(), "UTF-8");
                } catch (final Exception e) {
                    return "";
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
"""
        src = src[:idx] + fetch_method + src[idx:]
        print('FIXED: 用替代方式插入 fetchUrl')
    else:
        print('ERROR: 找不到 AndroidBridge 结束标记')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: MainActivity.java saved')
