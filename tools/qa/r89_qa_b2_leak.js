/* B2 监听器泄漏：连续 open+close 3 轮，比较"净增长"（消除既有监听器偏差） */
(function () {
  var R = {};
  var LP = window.XT_LOC_PICK;
  if (!LP || typeof LP.openPicker !== 'function') { R.fatal = 'no openPicker'; return R; }

  // 让 finish() 真正执行（ESC）
  function esc() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var cycles = [];
  return (async function () {
    for (var i = 0; i < 4; i++) {
      var before = document.querySelectorAll('.xtlp').length;
      LP.openPicker({ title: 'QA泄漏测试' + i }, function () { });
      await wait(150);
      var after = document.querySelectorAll('.xtlp').length;
      esc();
      await wait(200);
      var closed = document.querySelectorAll('.xtlp').length;
      cycles.push({ i: i, before: before, afterOpen: after, afterEsc: closed, delta: after - before, leaked: closed - before });
    }
    R.cycles = cycles;
    R.noLeakAcrossCycles = cycles.every(function (c) { return c.delta === 1 && c.leaked === 0; });
    R.finalPickerCount = document.querySelectorAll('.xtlp').length;

    // 再验证：连续 open 不开新页时，resize 重算不重复叠加（用 style.maxHeight 是否被覆盖而非累加）
    LP.openPicker({ title: 'QA-resize' }, function () { });
    await wait(150);
    var l = document.querySelector('.xtlp-list');
    R.listMaxH1 = l ? l.style.maxHeight : null;
    window.dispatchEvent(new Event('resize'));
    await wait(120);
    R.listMaxH2 = l ? l.style.maxHeight : null;
    R.resizeIdempotent = R.listMaxH1 === R.listMaxH2;
    esc();
    await wait(200);
    R.finalAfterAll = document.querySelectorAll('.xtlp').length;
    return R;
  })();
})();
