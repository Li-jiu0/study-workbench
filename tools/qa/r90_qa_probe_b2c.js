/* r90_qa_probe_b2c.js — 块2 终测：进入会话后量输入栏 + 真实因果对比 + openPicker 兼容性 + 监听器泄漏 */
var R = { vp: { w: innerWidth, h: innerHeight } };
function rect(el) {
  var r = el.getBoundingClientRect();
  return { x: +r.x.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), left: +r.left.toFixed(1) };
}

/* ---------- 1. 进入移动态并打开一个会话，使 .im-composer 真正布局 ---------- */
document.body.classList.add('im-mobile');
var chatEl = document.querySelector('.im-chat');
if (chatEl) { chatEl.style.display = 'flex'; }
var sideEl = document.querySelector('.im-side');
if (sideEl) { sideEl.style.display = 'none'; }
// 触发打开会话
try {
  var cvt = document.querySelector('#imConv');
  if (cvt) { cvt.style.display = 'flex'; }
  var emp = document.querySelector('#imEmpty');
  if (emp) { emp.style.display = 'none'; }
} catch (e) { }
R.chatVisible = chatEl ? getComputedStyle(chatEl).display : null;

/* ---------- 2. 量输入栏溢出 ---------- */
var comp = document.querySelector('.im-composer');
R.composer = null;
if (comp) {
  var cr = comp.getBoundingClientRect();
  var cs = getComputedStyle(comp);
  var kids = [];
  for (var i = 0; i < comp.children.length; i++) {
    var k = comp.children[i];
    var kcs = getComputedStyle(k);
    if (kcs.display === 'none') { continue; }
    kids.push({
      i: i, tag: k.tagName, id: k.id || '', cls: (k.className || '').toString().slice(0, 60),
      title: k.getAttribute('title') || '', rect: rect(k), flexShrink: kcs.flexShrink
    });
  }
  R.composer = {
    rect: rect(comp), scrollWidth: comp.scrollWidth, clientWidth: comp.clientWidth,
    overflowX: comp.scrollWidth - comp.clientWidth,
    display: cs.display, flexWrap: cs.flexWrap, gap: cs.gap, padding: cs.padding,
    visibleChildren: kids,
    beyondRight: kids.filter(function (k) { return k.rect.right > cr.right + 0.6; }).map(function (k) { return k.id || k.cls || k.tag; }),
    anyZeroWidth: kids.filter(function (k) { return k.rect.w === 0; }).map(function (k) { return k.id || k.cls; })
  };
}
/* #imLocBtn 的具体量测 */
var lb = document.getElementById('imLocBtn');
R.imLocBtn = lb ? {
  rect: rect(lb), visible: lb.getBoundingClientRect().width > 0,
  title: lb.getAttribute('title'), onclick: lb.getAttribute('onclick'),
  cls: lb.className,
} : null;
/* 图标排列顺序（DOM 顺序 + x 坐标），判断是否「紧邻所在位置语义入口」 */
R.iconRow = [];
if (comp) {
  var btns = comp.querySelectorAll('.im-icon, .im-send');
  for (var b = 0; b < btns.length; b++) {
    R.iconRow.push({ id: btns[b].id || '(无id)', title: btns[b].getAttribute('title') || '',
      x: +btns[b].getBoundingClientRect().x.toFixed(1), w: +btns[b].getBoundingClientRect().width.toFixed(1) });
  }
}


/* ---------- 3. 点击 #imLocBtn 是否真触发 imPlusPickLocation ---------- */
R.locClick = {};
try {
  var navs = [];
  // 记录 location 赋值（file:// 下 location.href 赋值会真跳，故拦截）
  var realAssign = null;
  var opened = false;
  // 用 XT_LOC_PICK.openPicker 是否被调用来判定
  var origOpen = window.XT_LOC_PICK && window.XT_LOC_PICK.openPicker;
  var called = false;
  if (window.XT_LOC_PICK && typeof origOpen === 'function') {
    window.XT_LOC_PICK.openPicker = function (opts, cb) { called = true; R.locClick.passedOpts = JSON.parse(JSON.stringify(opts || {})); return origOpen.call(window.XT_LOC_PICK, opts, cb); };
  }
  var imFnExists = typeof window.imPlusPickLocation === 'function';
  R.locClick.imPlusPickLocationExists = imFnExists;
  if (lb && imFnExists) {
    lb.click();
    R.locClick.openPickerCalled = called;
  }
  R.locClick.xtlpAppeared = !!document.querySelector('.xtlp');
  // 还原
  if (window.XT_LOC_PICK && origOpen) { window.XT_LOC_PICK.openPicker = origOpen; }
} catch (e) { R.locClick.err = String(e && e.message || e).slice(0, 300); }

/* ---------- 4. openPicker 向后兼容 ---------- */
R.compat = {};
var lyr = document.querySelector('.xtlp');
function closeLayer() {
  var l = document.querySelector('.xtlp');
  if (l && l.parentNode) { l.parentNode.removeChild(l); }
}
try {
  // 情形 a：不传参
  if (lyr) closeLayer();
  var r1 = null, e1 = '';
  try { window.XT_LOC_PICK.openPicker(); r1 = !!document.querySelector('.xtlp'); } catch (ex) { e1 = String(ex.message || ex); }
  R.compat.noArgs = { opened: r1, err: e1 };
  R.compat.noArgs_title = (function () { var t = document.querySelector('.xtlp-title'); return t ? t.textContent : null; })();
  closeLayer();

  // 情形 b：只传 title（字符串）
  var r2 = null, e2 = '';
  try { window.XT_LOC_PICK.openPicker('R90只传title'); r2 = !!document.querySelector('.xtlp'); } catch (ex) { e2 = String(ex.message || ex); }
  R.compat.titleOnly = { opened: r2, err: e2, title: (function () { var t = document.querySelector('.xtlp-title'); return t ? t.textContent : null; })() };
  closeLayer();

  // 情形 c：全参 (opts, cb)
  var r3 = null, e3 = '', cbTok = false;
  try {
    window.XT_LOC_PICK.openPicker({ title: 'R90全参' }, function () { cbTok = true; });
    r3 = !!document.querySelector('.xtlp');
  } catch (ex) { e3 = String(ex.message || ex); }
  R.compat.fullArgs = { opened: r3, err: e3, cbReceived: cbTok,
    title: (function () { var t = document.querySelector('.xtlp-title'); return t ? t.textContent : null; })(),
    okBtnText: (function () { var t = document.querySelector('.xtlp-ok'); return t ? t.textContent : null; })() };
  R.compat.signature = String(window.XT_LOC_PICK.openPicker).slice(0, 220);
} catch (e) { R.compat.err = String(e && e.message || e).slice(0, 300); }

/* ---------- 5. 监听器泄漏：连续 open→关 4 轮 ---------- */
R.leak = {};
try {
  // 无法直接数 window 上的 resize 监听器；改用 CDP 不可用时的替代：
  // 用 getEventListeners 不可用（非 DevTools 上下文）。改为「间接法」：
  // 连续开关 4 次，检查 (a) 每次都能正常打开，(b) 关闭后 DOM 无残留 .xtlp，
  // (c) window.resize 触发后不抛异常且 .xtlp 仍在（若列表被堆积会有多个 .xtlp）。
  var rounds = [];
  for (var r = 0; r < 4; r++) {
    closeLayer();
    window.XT_LOC_PICK.openPicker({ title: 'R90轮' + r }, function () { });
    var cnt = document.querySelectorAll('.xtlp').length;
    // ESC 关闭
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    } catch (e) { }
    var after = document.querySelectorAll('.xtlp').length;
    rounds.push({ round: r, openedCount: cnt, afterEscCount: after });
    closeLayer();
  }
  R.leak.rounds = rounds;
  R.leak.duplicateLayerBug = rounds.some(function (x) { return x.openedCount > 1; });
  R.leak.escWorks = rounds.filter(function (x) { return x.afterEscCount === 0; }).length + '/4';
} catch (e) { R.leak.err = String(e && e.message || e).slice(0, 300); }

/* ---------- 6. 结构不变量（上轮修复不被回退） ---------- */
closeLayer();
window.XT_LOC_PICK.openPicker({ title: 'R90结构' }, function () { });
var L = document.querySelector('.xtlp');
R.struct = {};
if (L) {
  var lcs = getComputedStyle(L);
  var b = L.querySelector('.xtlp-body');
  var bcs = b ? getComputedStyle(b) : null;
  R.struct.layer = { position: lcs.position, inset: lcs.inset, top: lcs.top, right: lcs.right, bottom: lcs.bottom, left: lcs.left, zIndex: lcs.zIndex, overflow: lcs.overflow };
  R.struct.body = bcs ? { position: bcs.position, inset: bcs.inset, display: bcs.display, flexDirection: bcs.flexDirection } : null;
  R.struct.bodyIsDirectChildOfRoot = b ? (b.parentNode === L) : null;
  // 中间无样式 div 包裹
  R.struct.bodyChildCount = b ? b.children.length : null;
  R.struct.noExtraWrapper = b ? Array.prototype.slice.call(b.children).filter(function (c) {
    return c.tagName === 'DIV' && !c.className;
  }).length === 0 : null;
  var lst = L.querySelector('.xtlp-list');
  R.struct.list = lst ? { flex: getComputedStyle(lst).flex, overflowY: getComputedStyle(lst).overflowY,
    minHeight: getComputedStyle(lst).minHeight, maxHeight: getComputedStyle(lst).maxHeight,
    clientH: lst.clientHeight, scrollH: lst.scrollHeight } : null;
}

/* ---------- 7. ★真实因果对比：临时移除矮屏 @media 规则，看是否仍在视口内 ---------- */
R.causalReal = {};
try {
  var lyrNow = document.querySelector('.xtlp');
  var foot0 = lyrNow.querySelector('.xtlp-foot');
  var map0 = lyrNow.querySelector('.xtlp-map');
  var lst0 = lyrNow.querySelector('.xtlp-list');
  R.causalReal.fixedState = {
    footBottom: +foot0.getBoundingClientRect().bottom.toFixed(1),
    innerHeight: innerHeight,
    overflowPx: +(foot0.getBoundingClientRect().bottom - innerHeight).toFixed(1),
    mapH: +map0.getBoundingClientRect().height.toFixed(1),
    listClientH: lst0.clientHeight,
    listMinH: getComputedStyle(lst0).minHeight,
    listFlexShrink: getComputedStyle(lst0).flexShrink,
    mapFlexShrink: getComputedStyle(map0).flexShrink
  };
  // 找到含 .xtlp 的 media 规则并整体失效
  var disabledConds = [];
  for (var si = 0; si < document.styleSheets.length; si++) {
    var sh = document.styleSheets[si];
    var rules; try { rules = sh.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (rule.type !== 4) { continue; }
      var hasXtlp = false;
      for (var ii = 0; ii < rule.cssRules.length; ii++) {
        if ((rule.cssRules[ii].cssText || '').indexOf('.xtlp') >= 0) { hasXtlp = true; break; }
      }
      if (!hasXtlp) { continue; }
      var cond = rule.conditionText || (rule.media && rule.media.mediaText) || '';
      var m = /max-height:\s*(\d+)px/.exec(cond);
      if (m && innerHeight <= parseInt(m[1], 10)) {
        try {
          rule.media.mediaText = 'screen and (min-height:99999px)'; // 使其不匹配
          disabledConds.push(cond);
        } catch (e) { R.causalReal.disableErr = String(e && e.message || e).slice(0, 200); }
      }
    }
  }
  R.causalReal.disabledConds = disabledConds;
  // 重测（强制 reflow）
  void document.body.offsetHeight;
  var foot1 = lyrNow.querySelector('.xtlp-foot');
  var map1 = lyrNow.querySelector('.xtlp-map');
  var lst1 = lyrNow.querySelector('.xtlp-list');
  R.causalReal.unfixedState = {
    footBottom: +foot1.getBoundingClientRect().bottom.toFixed(1),
    overflowPx: +(foot1.getBoundingClientRect().bottom - innerHeight).toFixed(1),
    footOverflowing: foot1.getBoundingClientRect().bottom > innerHeight + 0.5,
    mapH: +map1.getBoundingClientRect().height.toFixed(1),
    listClientH: lst1.clientHeight,
    listMinH: getComputedStyle(lst1).minHeight,
    listFlexShrink: getComputedStyle(lst1).flexShrink,
    mapFlexShrink: getComputedStyle(map1).flexShrink,
    headH: +(L.querySelector('.xtlp-head').getBoundingClientRect().height).toFixed(1),
    footH: +(foot1.getBoundingClientRect().height).toFixed(1)
  };
  R.causalReal.verdict = {
    fixedFootInView: R.causalReal.fixedState.overflowPx <= 0.5,
    unfixedFootInView: !R.causalReal.unfixedState.footOverflowing,
    fixIsNecessary: R.causalReal.unfixedState.footOverflowing === true ? 'YES(无修复会溢出)' : 'NO(无修复也不溢出)'
  };
  // 关键：把 map 的 flex-shrink 设为 0，看是否挤出 foot
  if (map1) {
    map1.style.flexShrink = '0';
    void document.body.offsetHeight;
    R.causalReal.withMapNoShrink = {
      footBottom: +foot1.getBoundingClientRect().bottom.toFixed(1),
      overflowPx: +(foot1.getBoundingClientRect().bottom - innerHeight).toFixed(1),
      footOverflowing: foot1.getBoundingClientRect().bottom > innerHeight + 0.5,
      mapH: +map1.getBoundingClientRect().height.toFixed(1)
    };
    map1.style.flexShrink = '';
  }
} catch (e) { R.causalReal.err = String(e && e.message || e).slice(0, 400); }

return R;
