/* assets/error-boundary.js — P0-B T04-00 全局错误兜底
 * 行为：window.onerror + onunhandledrejection → console.error + xtToast(error)
 * 原则：不阻断学习流（不跳白屏、不弹大模态）
 * 模式：开发模式 toast 可见；生产模式（window.__XT_PROD__ = true）仅 console
 * --------------------------------------------------------------------
 * 依赖：assets/xt-toast.js（window.xtToast 在 boundary 内惰性调用）
 * 设计：监听挂全局；如 xtToast 还未注入，降级到只 console.log 不崩
 */
(function () {
  'use strict';
  if (window.errorBoundary) {
    return;  // 防重复注入
  }

  function isProd() {
    return !!window.__XT_PROD__;
  }

  // 【R3b-A / B3】把前端错误经原生桥追加写入 logs/js-YYYYMMDD.log（与原生崩溃同目录）。
  //   契约：AndroidBridge.logJsError(kind, detail)；桥未注入（浏览器直接打开 file://）时静默跳过。
  //   自带异常兜底 + 去重限流（同一 msg 10s 内只落盘一次），避免死循环错误把日志打爆。
  var _lastPersist = {};
  function persist(kind, detail) {
    try {
      if (!window.AndroidBridge || typeof AndroidBridge.logJsError !== 'function') {
        return;
      }
      var key = String(kind) + '|' + String(detail).slice(0, 80);
      var now = Date.now();
      if (_lastPersist[key] && (now - _lastPersist[key]) < 10000) {
        return; // 限流：同一条错误 10s 内只记一次
      }
      _lastPersist[key] = now;
      // 记录页面 URL + 最近操作（最近一次点击的元素描述），便于真机定位
      var pageUrl = (typeof location !== 'undefined' && location.href) ? location.href : '';
      var lastOp = window.__xtLastOp || '';
      AndroidBridge.logJsError(
        String(kind),
        String(detail) + '\n  page=' + pageUrl + '\n  lastOp=' + lastOp
      );
    } catch (_) {
      /* 落盘失败绝不影响页面 */
    }
  }

  function report(msg, src, kind) {
    try {
      // console.error 必走（生产也走，便于排查）
      if (typeof console !== 'undefined' && console.error) {
        console.error('[XT-BOUNDARY]', msg || '未知错误', src || '');
      }
      // 【R9 2026-09-21】前端统一日志缓存（XTLog，供 日志.html 查看/检索/导出/上报）
      try { if (window.XTLog && window.XTLog.error) window.XTLog.error('boundary', msg || '未知错误', (src || '') + (kind ? (' kind=' + kind) : '')); } catch (_lg) { }
      // 【R3b-A / B3】无论开发/生产模式，都落盘到原生日志（自用包排查用）
      persist(kind || 'error', (msg || '') + (src ? (' @ ' + src) : ''));
      // 生产模式：仅 console（PRD §6.5）
      if (isProd()) {
        return;
      }
      // 开发模式：调 xtToast；如未注入，忽略（不二次崩）
      if (typeof window.xtToast === 'function') {
        window.xtToast('error', '页面出了一点问题，已记录');
      }
    } catch (_) {
      /* 兜底链不二次崩 */
    }
  }

  function bind() {
    // 【R3b-A / B3】记录最近一次用户操作（供错误日志附加上下文）
    try {
      document.addEventListener('click', function (ev) {
        try {
          var t = ev && ev.target;
          var tag = (t && t.tagName) ? t.tagName.toLowerCase() : '?';
          var id = (t && t.id) ? ('#' + t.id) : '';
          var cls = (t && t.className && typeof t.className === 'string')
                    ? ('.' + t.className.split(/\s+/)[0]) : '';
          window.__xtLastOp = tag + id + cls + ' @ ' + (new Date()).toISOString();
        } catch (_) { /* 忽略 */ }
      }, true);
    } catch (_) { /* 非浏览器环境：忽略 */ }

    window.addEventListener('error', function (e) {
      var src = (e && e.filename ? e.filename : '') +
                (e && e.lineno ? ':' + e.lineno : '') +
                (e && e.colno ? ':' + e.colno : '');
      report(e && e.message ? e.message : '未知错误', src, 'window.onerror');
    });

    window.addEventListener('unhandledrejection', function (e) {
      var reason = e && e.reason;
      var msg;
      if (reason) {
        msg = reason.message ? reason.message : String(reason);
      } else {
        msg = '异步错误';
      }
      report(msg, '', 'unhandledrejection');
    });
  }

  // 暴露手动上报接口（业务脚本可显式调用）
  window.errorBoundary = {
    init: bind,
    report: report
  };

  function start() {
    bind();
    if (typeof console !== 'undefined' && console.log) {
      console.log('[XT-BOUNDARY] ready, mode=' + (isProd() ? 'prod' : 'dev'));
    }
  }

  // 自动挂载：DOMContentLoaded 后再绑（保证监听不丢早期 error 也能接受）
  if (typeof document === 'undefined') {
    // 非浏览器环境（如纯 Node 测试）：不绑
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
