# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\assets\hotnews.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 1. 在 esc/toast 函数后加 nativeFetch 辅助函数
old_helper = """  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') { showToast(m); return; } if (typeof alert === 'function') alert(m); }"""

new_helper = """  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') { showToast(m); return; } if (typeof alert === 'function') alert(m); }

  // 统一网络请求：APK 环境用原生层 fetchUrl 绕过 CORS，浏览器环境用 fetch
  function nativeFetch(url) {
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

if old_helper in src:
    src = src.replace(old_helper, new_helper, 1)
    print('FIXED: 加 nativeFetch 辅助函数')
else:
    print('SKIP: helper pattern not found')

# 2. 把 SOURCES 里所有 fetch(url, { cache: 'no-store' }) 改成 nativeFetch(url)
count = src.count("fetch('https://")
src = src.replace("fetch('https://", "nativeFetch('https://")
print('FIXED: 替换了', count, '处 fetch 为 nativeFetch')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: hotnews.js saved')
