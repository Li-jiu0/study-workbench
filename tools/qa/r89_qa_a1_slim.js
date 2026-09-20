/* A1 终版：等过渡结束再量，三档视口通用 */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  ['imChat', 'imConv', 'imEmpty'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = (id === 'imConv') ? 'flex' : (id === 'imEmpty' ? 'none' : 'flex');
  });
  var m = document.querySelector('#imPlusMenu'), btn = document.querySelector('#imPlusBtn'), mask = document.querySelector('#imPlusMask');
  function fire(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
  function cs(p) { return getComputedStyle(m).getPropertyValue(p); }
  function rect() { var r = m.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; }

  R.rules = (function () {
    var st = document.querySelector('#imPlusCss');
    if (!st || !st.sheet) return 'NO_SHEET';
    var out = [];
    for (var i = 0; i < st.sheet.cssRules.length; i++) {
      var t = st.sheet.cssRules[i].cssText;
      if (t.indexOf('.im-plus-menu') === 0 || t.indexOf('@media (max-height') === 0 || t.indexOf('.im-loc-sheet-body') === 0) out.push(t.slice(0, 260));
    }
    return out;
  })();

  fire(btn);
  var o = { openCls: m.className, maskCls: mask ? mask.className : null };
  return new Promise(function (res) {
    setTimeout(function () {
      o.maxHeight = cs('max-height');
      o.overflowY = cs('overflow-y');
      o.transform = getComputedStyle(m).transform;
      o.position = cs('position');
      o.r = rect();
      o.offsetH = m.offsetHeight; o.scrollH = m.scrollHeight; o.clientH = m.clientHeight;
      o.top_ge_0 = o.r.top >= -0.5;
      o.bottom_le_vh = o.r.bottom <= innerHeight + 0.5;
      o.fullyInViewport = o.top_ge_0 && o.bottom_le_vh;
      o.scrollable = m.scrollHeight > m.clientHeight + 1;
      var items = m.querySelectorAll('.im-plus-item');
      o.itemCount = items.length;
      if (items.length) { var lr = items[items.length - 1].getBoundingClientRect(); o.lastItemBottom = Math.round(lr.bottom); o.lastItemVisible = lr.top >= -0.5 && lr.bottom <= innerHeight + 0.5; }
      var b4 = m.scrollTop; m.scrollTop = 999; o.menuScrollWorks = m.scrollTop > b4;
      fire(btn);
      o.closedCls = m.className; o.maskClosedCls = mask ? mask.className : null;
      fire(btn);
      o.reopenedCls = m.className;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      o.afterEscCls = m.className;
      R.play = o;
      res(R);
    }, 450);
  });
})();
