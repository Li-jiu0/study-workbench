/* assets/xt-toast.js — P0-B T04-00 轻量 Toast
 * 接口：window.xtToast(state, msg, opts?) — state: success / error / warning / info
 * 行为：同一时刻最多 1 条；1.6s 自动消失；DOM 追加到 body 末
 * 禁：大弹窗 / alert / confirm（PRD §7.12）
 * --------------------------------------------------------------------
 * R4-A 扩展（C2 收口，各页 toast 内联实现统一转调本模块）：
 *   opts.position: 'top'(默认) | 'bottom' —— 底部时追加 .xt-toast-bottom 类走底部定位
 *   opts.offset:   number(px) —— 覆盖默认 top/bottom 偏移，供 bottom:74/80/96px 这类页面对齐
 *   接口向后兼容：xtToast(state, msg) 两参调用行为不变。
 *   默认时长保持 1600ms 不动（改默认会波及已用 xtToast 的页＝回归风险）；
 *   各页转调时自行传 { duration: 2500 } 对齐原内联时长。
 *   层级：.xt-toast 的 z-index 见 common.css（已提到高于各页遮罩）。
 * --------------------------------------------------------------------
 * 依赖：assets/common.css 内的 .xt-toast / .xt-toast-success / .xt-toast-bottom 等样式
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
    var o = opts || {};
    var el = document.createElement('div');
    var s = state || 'info';
    // 仅允许 4 个状态值；其他值降级为 info
    if (s !== 'success' && s !== 'error' && s !== 'warning' && s !== 'info') {
      s = 'info';
    }
    var cls = 'xt-toast xt-toast-' + s;
    // R4-A：底部定位（类名切换，默认 top 不加类，保持既有默认外观不变）
    var isBottom = (o.position === 'bottom');
    if (isBottom) {
      cls += ' xt-toast-bottom';
    }
    el.className = cls;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    // R4-A：可选自定义偏移（top / bottom 各自生效），无则用 CSS 默认
    if (typeof o.offset === 'number' && o.offset >= 0) {
      if (isBottom) {
        el.style.bottom = o.offset + 'px';
      } else {
        el.style.top = o.offset + 'px';
      }
    }
    el.textContent = msg == null ? '' : String(msg);
    document.body.appendChild(el);
    currentEl = el;
    var duration = (o.duration && typeof o.duration === 'number' && o.duration > 0) ? o.duration : 1600;
    hideTimer = setTimeout(hide, duration);
  }

  // 暴露全局
  window.xtToast = show;

  // 调试日志（开发模式可见；生产模式可忽略）
  if (typeof console !== 'undefined' && console.log) {
    console.log('[XT-TOAST] ready');
  }
})();
