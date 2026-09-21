/* B3：xtmPickLocation 三级降级（甲/乙/丙）+ 回写链路 + 双按钮 */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setls(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { } }
  function dels(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function fire(el) { if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  R.locBtnFound = !!document.querySelector('#xtmLocBtn');
  R.atBtnFound = !!document.querySelector('#xtmAtBtn');
  R.XT_LOC_PICK = typeof window.XT_LOC_PICK;
  R.hasInputSheet = typeof window.inputSheet;
  R.xtmNavHookInit = typeof window.xtmNavHook;

  // 记录 toast
  var toasts = [];
  var ot = window.toast, osh = window.showToast;
  window.toast = function (m) { toasts.push(String(m).slice(0, 200)); try { if (ot) ot.apply(this, arguments); } catch (e) { } };
  window.showToast = window.toast;

  function navCount() { return (window.__QA_NAV || []).length; }
  function navLast() { var a = window.__QA_NAV || []; return a.length ? a[a.length - 1] : null; }
  function sheetPresent() { return document.querySelectorAll('.xtm-sheet, .xtm-input-sheet').length; }

  return (async function () {
    await wait(500);
    var LP = window.XT_LOC_PICK;

    /* ---- 场景甲：XT_LOC_PICK 存在 -> 走 openPicker（不跳转）---- */
    var nA0 = navCount();
    var pickerBefore = document.querySelectorAll('.xtlp').length;
    fire(document.querySelector('#xtmAtBtn'));
    await wait(350);
    R.A_openPickerShown = document.querySelectorAll('.xtlp').length > pickerBefore;
    R.A_navNotCalled = navCount() === nA0;
    R.A_lastNav = navLast();
    // 关掉
    var back = document.querySelector('.xtlp-back, .xtlp-cancel');
    if (back) fire(back);
    await wait(250);
    R.A_closed = document.querySelectorAll('.xtlp').length === 0;

    /* ---- 场景乙：XT_LOC_PICK 不存在 -> 跳转整页 ---- */
    window.XT_LOC_PICK = undefined;
    try { delete window.XT_LOC_PICK; } catch (e) { }
    var nB0 = navCount();
    fire(document.querySelector('#xtmLocBtn'));
    await wait(350);
    R.B_navCalled = navCount() > nB0;
    R.B_lastNav = navLast();
    R.B_urlHasRegionPage = (navLast() || '').indexOf('地区选择.html') >= 0;
    R.B_urlHasCur = (navLast() || '').indexOf('cur=') >= 0;
    R.B_urlHasBack = (navLast() || '').indexOf('back=') >= 0;

    /* ---- 场景丙：XT_LOC_PICK 不存在 + xtmNavHook 抛异常 -> 必须不抛 + toast + 降级 sheet ---- */
    var sheetB0 = sheetPresent();
    window.xtmNavHook = function () { throw new Error('QA_NAV_FAIL'); };
    window.xtpNavHook = function () { throw new Error('QA_NAV_FAIL'); };
    var tB0 = toasts.length;
    var threw = null;
    try { fire(document.querySelector('#xtmLocBtn')); } catch (e) { threw = String(e).slice(0, 200); }
    await wait(450);
    R.C_threw = threw;
    R.C_noThrow = threw === null;
    R.C_toastAdded = toasts.length > tB0;
    R.C_toastMsgs = toasts.slice(tB0);
    R.C_sheetShown = sheetPresent() > sheetB0;
    R.C_sheetCount = sheetPresent();

    /* ---- 回写链路 ---- */
    // 恢复 hook（吞掉导航）
    window.xtmNavHook = function (u) { (window.__QA_NAV = window.__QA_NAV || []).push(u); return true; };
    window.xtpNavHook = window.xtmNavHook;

    // 关掉残留 sheet
    var sx = document.querySelector('.xtm-sheet .xtm-sheet-cancel, .xtm-sheet [data-act=cancel]');
    if (sx) fire(sx);
    await wait(200);

    // 写入一次性回写值（新鲜）
    var P0 = window.P ? JSON.parse(JSON.stringify(window.P)) : null;
    setls('xt_region_pick', { text: 'QA省 QA市 QA区', ts: Date.now() });
    R.D_keyWritten = ls('xt_region_pick');
    // 触发消费：重新加载页面不便，直接调用导出 API（若存在）
    R.D_takeFn = typeof window.xtmTakeRegionPick;
    R.D_applyFn = typeof window.xtmApplyLocation;
    return R;
  })();
})();
