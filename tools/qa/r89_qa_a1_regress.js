/* A1 关键回归：imTogglePlusMenu / imOpenPlusMenu / imClosePlusMenu 开关行为未变 */
(function () {
  var R = {};
  var m = document.querySelector('#imPlusMenu');
  var mask = document.querySelector('#imPlusMask');
  function cls() { return m ? m.className : 'NO_MENU'; }
  function mcls() { return mask ? mask.className : 'NO_MASK'; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // 让面板在其渲染树中可见（否则 0x0 但不影响 class 断言）
  ['imChat', 'imConv', 'imEmpty'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = (id === 'imConv') ? 'flex' : (id === 'imEmpty' ? 'none' : 'flex');
  });

  R.fnToggle = typeof window.imTogglePlusMenu;
  R.fnOpen = typeof window.imOpenPlusMenu;
  R.fnClose = typeof window.imClosePlusMenu;

  R.s0_initial = cls(); R.s0_mask = mcls();

  window.imOpenPlusMenu();
  R.s1_open = cls(); R.s1_mask = mcls();

  window.imOpenPlusMenu();           // 幂等：再次 open 应仍为 open
  R.s2_openAgain = cls();

  window.imClosePlusMenu();
  R.s3_close = cls(); R.s3_mask = mcls();

  window.imClosePlusMenu();          // 幂等：再次 close
  R.s4_closeAgain = cls();

  window.imTogglePlusMenu();
  R.s5_toggleOpen = cls(); R.s5_mask = mcls();

  window.imTogglePlusMenu();
  R.s6_toggleClose = cls(); R.s6_mask = mcls();

  // 点遮罩关闭
  window.imOpenPlusMenu();
  var msk = document.querySelector('#imPlusMask');
  R.s7_beforeMaskClick = cls();
  if (msk) msk.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
  R.s8_afterMaskClick = cls(); R.s8_mask = mcls();

  // 真按钮点击
  var btn = document.querySelector('#imPlusBtn');
  R.s9_btnExists = !!btn;
  if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
  R.s9_afterBtn = cls();
  if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
  R.s10_afterBtn2 = cls();

  R.exportedGlobals = ['imOpenPlusMenu', 'imClosePlusMenu', 'imTogglePlusMenu', 'imUploadFile', 'imUploadEndpoints']
    .map(function (k) { return k + '=' + typeof window[k]; });
  return Promise.resolve(R);
})();
