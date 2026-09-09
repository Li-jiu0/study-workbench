# -*- coding: utf-8 -*-
import io, os

# ===== 1. 修改 MainActivity.java 的 fetchUrl =====
p = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

old_fetch = """            @JavascriptInterface
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
            }"""

new_fetch = """            @JavascriptInterface
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
            }"""

if old_fetch in src:
    src = src.replace(old_fetch, new_fetch, 1)
    print('FIXED: MainActivity fetchUrl 换真实UA + 错误回显')
else:
    print('SKIP: fetchUrl pattern not found')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('DONE: MainActivity.java saved')

# ===== 2. 修改 hotnews.js 的 nativeFetch，处理 __ERROR__ 和解析失败回显 =====
p2 = r'D:\下载的文件\学习工作台\assets\hotnews.js'
with io.open(p2, encoding='utf-8') as f:
    src2 = f.read()

old_native = """  function nativeFetch(url) {
    if (window.AndroidBridge && typeof window.AndroidBridge.fetchUrl === 'function') {
      try {
        var text = window.AndroidBridge.fetchUrl(url);
        if (text && text.length > 0) {
          return Promise.resolve({
            ok: true, status: 200,
            json: function () { try { return Promise.resolve(JSON.parse(text)); } catch (e) { return Promise.reject(e); } },
            text: function () { return Promise.resolve(text); }
          });
        }
      } catch (e) { /* 原生请求失败，降级到浏览器 fetch */ }
    }
    return fetch(url, { cache: 'no-store' });
  }"""

new_native = """  function nativeFetch(url) {
    if (window.AndroidBridge && typeof window.AndroidBridge.fetchUrl === 'function') {
      try {
        var text = window.AndroidBridge.fetchUrl(url);
        if (text && text.length > 0) {
          // 原生层错误回显
          if (text.indexOf('__ERROR__:') === 0) {
            return Promise.reject(new Error(text.substring(10)));
          }
          return Promise.resolve({
            ok: true, status: 200,
            json: function () {
              try {
                return Promise.resolve(JSON.parse(text));
              } catch (e) {
                // 解析失败时回显前 200 字符，方便排查
                var preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
                return Promise.reject(new Error('JSON解析失败，返回内容: ' + preview));
              }
            },
            text: function () { return Promise.resolve(text); }
          });
        }
      } catch (e) { /* 原生请求失败，降级到浏览器 fetch */ }
    }
    return fetch(url, { cache: 'no-store' });
  }"""

if old_native in src2:
    src2 = src2.replace(old_native, new_native, 1)
    print('FIXED: hotnews nativeFetch 错误回显')
else:
    print('SKIP: nativeFetch pattern not found')

with io.open(p2, 'w', encoding='utf-8') as f:
    f.write(src2)
print('DONE: hotnews.js saved')
