/* 深挖 .im-plus-menu 为何 0x0 */
(function () {
  var R = {};
  var m = document.querySelector('#imPlusMenu');
  R.exists = !!m;
  if (!m) return R;
  var cs = getComputedStyle(m);
  R.cls = m.className;
  R.inlineStyle = m.getAttribute('style');
  R.parent = m.parentNode ? m.parentNode.tagName + '.' + m.parentNode.className : null;
  R.childrenCount = m.children.length;
  R.outerHTMLHead = m.outerHTML.slice(0, 400);

  // 哪个规则给了它 display
  function matched(el) {
    var props = ['display', 'position', 'max-height', 'overflow-y', 'visibility', 'content-visibility'];
    var out = {};
    props.forEach(function (p) { out[p] = getComputedStyle(el).getPropertyValue(p); });
    return out;
  }
  R.beforeClick = matched(m);

  // 是否被祖先隐藏
  var anc = [], n = m;
  while (n) {
    var c = getComputedStyle(n);
    if (c.display === 'none' || c.visibility === 'hidden' || c.contentVisibility === 'hidden' || c.getPropertyValue('content-visibility') === 'hidden') {
      anc.push({ tag: n.tagName, id: n.id, cls: (n.className || '').toString().slice(0, 50), display: c.display, visibility: c.visibility });
    }
    n = n.parentElement;
  }
  R.hiddenAncestors = anc;

  // 祖先链
  var chain = [], p = m;
  while (p && p.tagName !== 'HTML') { chain.unshift(p.tagName + (p.id ? '#' + p.id : '') + (p.className ? '.' + p.className.toString().trim().split(/\s+/).join('.') : '')); p = p.parentElement; }
  R.chain = chain;

  // 点击打开
  var btn = document.querySelector('#imPlusBtn');
  if (btn) btn.click();
  R.afterClick = matched(m);
  R.afterClick_cls = m.className;
  var rc = m.getBoundingClientRect();
  R.afterClick_rect = { top: Math.round(rc.top), bottom: Math.round(rc.bottom), w: Math.round(rc.width), h: Math.round(rc.height) };
  R.afterClick_scrollH = m.scrollHeight;
  R.afterClick_clientH = m.clientHeight;
  R.afterClick_offsetH = m.offsetHeight;

  // 若 0x0，强制显示看是否只是 CSS 问题
  return R;
})();
