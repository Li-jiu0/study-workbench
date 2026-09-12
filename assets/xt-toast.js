/* assets/xt-toast.js — P0-B T04-00 轻量 Toast
 * 接口：window.xtToast(state, msg, opts?) — state: success / error / warning / info
 * 行为：同一时刻最多 1 条；1.6s 自动消失；DOM 追加到 body 末
 * 禁：大弹窗 / alert / confirm（PRD §7.12）
 * --------------------------------------------------------------------
 * 依赖：assets/common.css 内的 .xt-toast / .xt-toast-success 等样式
 */
(function () {
  'use strict';
  if (window.xtToast) {
    return;  // 防重复注入
  }

  var currentEl = null;
  var hideTimer = null;

  function hide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (currentEl && currentEl.parentNode) {
      currentEl.parentNode.removeChild(currentEl);
    }
    currentEl = null;
  }

  function show(state, msg, opts) {
    hide();
    var el = document.createElement('div');
    var s = state || 'info';
    // 仅允许 4 个状态值；其他值降级为 info
    if (s !== 'success' && s !== 'error' && s !== 'warning' && s !== 'info') {
      s = 'info';
    }
    el.className = 'xt-toast xt-toast-' + s;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = msg == null ? '' : String(msg);
    document.body.appendChild(el);
    currentEl = el;
    var duration = (opts && typeof opts.duration === 'number' && opts.duration > 0) ? opts.duration : 1600;
    hideTimer = setTimeout(hide, duration);
  }

  // 暴露全局
  window.xtToast = show;

  // 调试日志（开发模式可见；生产模式可忽略）
  if (typeof console !== 'undefined' && console.log) {
    console.log('[XT-TOAST] ready');
  }
})();
