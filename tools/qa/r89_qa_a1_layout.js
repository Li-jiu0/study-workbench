/* A1 真实布局：打开真实会话 -> 点 + -> 量 .im-plus-menu */
(function () {
  var R = { steps: [] };
  function log(k, v) { R.steps.push(k + ' = ' + JSON.stringify(v)); }
  function cs(el, p) { return el ? getComputedStyle(el).getPropertyValue(p) : null; }

  // 打开会话（真实入口）
  if (typeof window.imOpenChat === 'function') {
    window.imOpenChat('qa_f1');
  } else { log('imOpenChat', 'MISSING'); }

  var conv = document.querySelector('#imConv');
  var chat = document.querySelector('#imChat');
  R.convDisplay = conv ? cs(conv, 'display') : null;
  R.chatDisplay = chat ? cs(chat, 'display') : null;

  var m = document.querySelector('#imPlusMenu');
  var btn = document.querySelector('#imPlusBtn');

  function snap(label) {
    var o = { label: label };
    if (!m) { o.found = false; return o; }
    var rc = m.getBoundingClientRect();
    o.open = m.classList.contains('open');
    o.rect = { top: Math.round(rc.top), bottom: Math.round(rc.bottom), left: Math.round(rc.left), right: Math.round(rc.right), w: Math.round(rc.width), h: Math.round(rc.height) };
    o.maxHeight = cs(m, 'max-height');
    o.overflowY = cs(m, 'overflow-y');
    o.position = cs(m, 'position');
    o.scrollHeight = m.scrollHeight;
    o.clientHeight = m.clientHeight;
    o.offsetHeight = m.offsetHeight;
    o.top_ge_0 = rc.top >= -0.5;
    o.bottom_le_vh = rc.bottom <= innerHeight + 0.5;
    o.fullyInViewport = o.top_ge_0 && o.bottom_le_vh;
    o.isScrollable = m.scrollHeight > m.clientHeight + 1;
    // 最后一个菜单项的可见性
    var items = m.querySelectorAll('.im-plus-item');
    o.itemCount = items.length;
    if (items.length) {
      var lr = items[items.length - 1].getBoundingClientRect();
      o.lastItemRect = { top: Math.round(lr.top), bottom: Math.round(lr.bottom) };
      o.lastItemVisible = lr.top >= -0.5 && lr.bottom <= innerHeight + 0.5;
    }
    return o;
  }

  R.closed = snap('closed');
  if (btn) {
    btn.click();
    R.opened = snap('opened');
    // 真滚菜单
    var b4 = m.scrollTop; m.scrollTop = 500;
    R.menuScrollTopAfterSet = m.scrollTop;
    R.menuScrollWorks = m.scrollTop > b4;
    R.openedAfterScroll = snap('opened-after-scroll');
    btn.click();
    R.closedAgain = snap('closed-again');
    // 回归：mask 是否同步开关
    R.maskPresent = !!document.querySelector('#imPlusMask');
    R.maskClassWhenClosed = document.querySelector('#imPlusMask') ? document.querySelector('#imPlusMask').className : null;
    btn.click();
    R.maskClassWhenOpen = document.querySelector('#imPlusMask') ? document.querySelector('#imPlusMask').className : null;
    R.secondOpen = snap('second-open');
    // ESC 关闭
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    R.afterEsc = snap('after-esc');
  } else { log('btn', 'MISSING'); }

  // 定位 sheet 规则
  R.locSheetRule = (function () {
    var st = document.querySelector('#imPlusCss');
    if (!st) return null;
    try {
      var rules = st.sheet.cssRules, out = null;
      for (var i = 0; i < rules.length; i++) {
        var t = rules[i].cssText || '';
        if (t.indexOf('.im-loc-sheet-body') === 0) out = t;
      }
      return out;
    } catch (e) { return 'ERR:' + e.message; }
  })();
  return R;
})();
