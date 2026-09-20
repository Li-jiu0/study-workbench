/* 量 .xtlp-list 上方/下方真实开销，供 r89b 定 maxH 常量 */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  var LP = window.XT_LOC_PICK;
  if (!LP || typeof LP.openPicker !== 'function') { R.fatal = 'no openPicker'; return R; }

  function fire(el) { if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rc(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; }

  return (async function () {
    LP.openPicker({ title: 'QA量尺', confirmText: '确定' }, function () { });
    await wait: 0;  // placeholder
  })();
})();
