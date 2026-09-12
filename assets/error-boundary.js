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

  function report(msg, src) {
    try {
      // console.error 必走（生产也走，便于排查）
      if (typeof console !== 'undefined' && console.error) {
        console.error('[XT-BOUNDARY]', msg || '未知错误', src || '');
      }
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
    window.addEventListener('error', function (e) {
      var src = (e && e.filename ? e.filename : '') +
                (e && e.lineno ? ':' + e.lineno : '');
      report(e && e.message ? e.message : '未知错误', src);
    });

    window.addEventListener('unhandledrejection', function (e) {
      var reason = e && e.reason;
      var msg;
      if (reason) {
        msg = reason.message ? reason.message : String(reason);
      } else {
        msg = '异步错误';
      }
      report(msg);
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
