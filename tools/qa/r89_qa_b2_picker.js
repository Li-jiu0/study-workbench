/* B2：真实调用 window.XT_LOC_PICK.openPicker 验证 .xtlp-body / .xtlp-list 弹性布局与滚动 */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  R.XT_LOC_PICK = typeof window.XT_LOC_PICK;
  R.openPicker = window.XT_LOC_PICK ? typeof window.XT_LOC_PICK.openPicker : 'NO';
  R.XT_REGION = typeof window.XT_REGION;
  if (!window.XT_LOC_PICK || typeof window.XT_LOC_PICK.openPicker !== 'function') { R.fatal = 'openPicker missing'; return R; }

  // 监听器泄漏检测
  var resizeAdds = 0, resizeRemoves = 0;
  var origAdd = window.addEventListener, origRem = window.removeEventListener;
  window.addEventListener = function (t, f, o) { if (t === 'resize') resizeAdds++; return origAdd.call(this, t, f, o); };
  window.removeEventListener = function (t, f, o) { if (t === 'resize') resizeRemoves++; return origRem.call(this, t, f, o); };
  var docAdds = 0, docRems = 0;
  var dOrigAdd = document.addEventListener, dOrigRem = document.removeEventListener;
  document.addEventListener = function (t, f, o) { if (t === 'keydown') docAdds++; return dOrigAdd.call(this, t, f, o); };
  document.removeEventListener = function (t, f, o) { if (t === 'keydown') docRems++; return dOrigRem.call(this, t, f, o); };

  // ---- 真实调用 openPicker（模拟私聊.html 的调用方）----
  var calls = [], errs = [];
  function tryOpen(opts, label) {
    try {
      window.XT_LOC_PICK.openPicker(opts, function (v) { calls.push({ label: label, val: v }); });
      return true;
    } catch (e) { errs.push(label + ':' + String(e).slice(0, 160)); return false; }
  }
  R.callNoArgs = tryOpen(undefined, 'noargs');            // 不传参
  R.callPartial = tryOpen({ title: 'QA部分参数' }, 'partial'); // 部分参数
  R.callFull = tryOpen({ title: 'QA全参', confirmText: '就这里', current: '广东省 广州市' }, 'full'); // 全参

  // 量最后一个 picker（DOM 里可能并存多个）
  var roots = document.querySelectorAll('.xtlp');
  R.rootCount = roots.length;
  var root = roots[roots.length - 1];
  R.rootId = root ? root.id : null;
  R.rootDisplay = root ? getComputedStyle(root).display : null;

  var body = root ? root.querySelector('.xtlp-body') : null;
  var list = root ? root.querySelector('.xtlp-list') : null;
  var foot = root ? root.querySelector('.xtlp-foot') : null;

  R.bodyExists = !!body;
  R.bodyIsDirectChildOfRoot = !!(body && body.parentNode === root);
  if (body) {
    var bcs = getComputedStyle(body);
    R.bodyComputed = { position: bcs.position, display: bcs.display, flexDirection: bcs.flexDirection, inset: bcs.top + '/' + bcs.right + '/' + bcs.bottom + '/' + bcs.left };
  }
  R.listExists = !!list;
  if (list) {
    var lcs = getComputedStyle(list);
    R.listComputed = { flexGrow: lcs.flexGrow, flexShrink: lcs.flexShrink, flexBasis: lcs.flexBasis, minHeight: lcs.minHeight, overflowY: lcs.overflowY, maxHeight: lcs.maxHeight };
    R.listRuleHasMinHeightZero = /min-height\s*:\s*0/.test(lcs.minHeight) || lcs.minHeight === '0px';
    var lr = list.getBoundingClientRect();
    R.listRect = { top: Math.round(lr.top), bottom: Math.round(lr.bottom), h: Math.round(lr.height), w: Math.round(lr.width) };
    R.listScrollH = list.scrollHeight; R.listClientH = list.clientHeight;
    R.listScrollable = list.scrollHeight > list.clientHeight + 1;
    R.listItemCount = list.querySelectorAll('.xtlp-item').length;
    // 真实滚动列表
    var b4 = list.scrollTop; list.scrollTop = 9999;
    R.listScrollTopAfter = list.scrollTop;
    R.listScrollActuallyWorks = list.scrollTop > b4;
    R.listBottomInViewport = lr.bottom <= innerHeight + 0.5;
    R.listTop_ge_0 = lr.top >= -0.5;
    R.listFullyInViewport = R.listTop_ge_0 && R.listBottomInViewport && lr.top >= 0 && lr.bottom <= innerHeight;
  }
  if (foot) { var fr = foot.getBoundingClientRect(); R.footRect = { top: Math.round(fr.top), bottom: Math.round(fr.bottom) }; R.footVisible = fr.bottom <= innerHeight + 0.5; }

  // 交互：选一项 -> ok 生效
  if (list) {
    var firstItem = list.querySelector('.xtlp-item');
    if (firstItem) {
      firstItem.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
      var okBtn = root.querySelector('.xtlp-ok');
      R.afterPick_okDisabled = okBtn ? okBtn.hasAttribute('disabled') : null;
      R.afterPick_curline = (root.querySelector('.xtlp-curline') || {}).textContent;
      if (okBtn) okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
      R.afterOk_rootRemoved = !document.getElementById(R.rootId);
    }
  }

  // 泄漏计数（3 次 open+close）
  R.errs = errs;
  R.resizeAdds = resizeAdds; R.resizeRemoves = resizeRemoves;
  R.keydownAdds = docAdds; R.keydownRems = docRems;
  return R;
})();
