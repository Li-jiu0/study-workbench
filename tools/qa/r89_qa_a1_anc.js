/* 精确定位 .im-plus-menu 为何 0x0 且 fixed 失效 */
(function () {
  var R = {};
  if (typeof window.imOpenChat === 'function') { try { window.imOpenChat('qa_f1'); } catch (e) { R.openErr = String(e).slice(0, 150); } }
  var m = document.querySelector('#imPlusMenu');
  R.exists = !!m;
  if (!m) return R;

  // 打开
  document.querySelector('#imPlusBtn').click();
  R.cls = m.className;
  R.rect = (function (r) { return [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.width), Math.round(r.height)]; })(m.getBoundingClientRect());

  // 逐个祖先：display / content-visibility / 是否含 fixed 元素
  var chain = [], n = m;
  while (n && n.nodeType === 1) {
    var c = getComputedStyle(n);
    chain.push({
      node: n.tagName + (n.id ? '#' + n.id : '') + (n.className ? '.' + String(n.className).trim().split(/\s+/).join('.') : ''),
      display: c.display,
      contentVisibility: c.getPropertyValue('content-visibility'),
      contain: c.getPropertyValue('contain'),
      willChange: c.getPropertyValue('will-change'),
      transform: c.transform === 'none' ? 'none' : 'TRANSFORM!',
      filter: c.filter,
      perspective: c.perspective,
      backdropFilter: c.getPropertyValue('backdrop-filter'),
      overflow: c.overflow
    });
    n = n.parentElement;
  }
  R.chain = chain;

  // 深度：元素在 #imConv 内？
  R.inImConv = !!(m.closest && m.closest('#imConv'));
  R.offsetParent = m.offsetParent ? (m.offsetParent.tagName + (m.offsetParent.id ? '#' + m.offsetParent.id : '')) : null;

  // 关键实验：把菜单临时挂到 body 上看是否恢复尺寸（判断是祖先裁剪还是自身问题）
  var parent = m.parentNode;
  return R;
})();
