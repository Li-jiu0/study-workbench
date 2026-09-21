/* A2 终版：M5 面板真实渲染 / 搜索 / 筛选 / 单删 / 清空全部 / 文案断言 */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function cnt() { try { return JSON.parse(ls('ai_chat_history') || '[]').length; } catch (e) { return -1; } }
  function q(s) { var b = document.querySelector('#xtpChatBody'); return b ? b.querySelector(s) : null; }
  function qa(s) { var b = document.querySelector('#xtpChatBody'); return b ? b.querySelectorAll(s) : []; }
  function fire(el, t) { if (!el) return false; el.dispatchEvent(new MouseEvent(t || 'click', { bubbles: true, cancelable: true, view: window })); return true; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  R.beforeCount = cnt();
  try { window.xtpOpenView('chat'); } catch (e) { R.openErr = String(e).slice(0, 250); }
  var box = document.querySelector('#xtpChatBody');
  if (!box) { R.fatal = 'xtpChatBody missing'; return R; }

  return (async function () {
    await wait(400);
    // S1 首次渲染
    R.s1_cards = qa('.xtp-li.xtp-m5-card').length;
    R.s1_srvnote = qa('.xtp-m5-srvnote').length;
    R.s1_goAiBtn = !!q('#xtpM5GoAi');
    R.s1_kw = !!q('#xtpM5Kw');
    R.s1_range = !!q('#xtpM5Range');
    R.s1_tag = !!q('#xtpM5Tag');
    R.s1_clearAll = !!q('#xtpM5ClearAll');
    R.s1_sub = (q('.xtp-chat-sub') || {}).textContent || null;
    R.s1_txt = (box.innerText || '').slice(0, 400);
    R.s1_oldMisleading = R.s1_txt.indexOf('暂无本机 AI 对话记录') >= 0;

    // S2 搜索（走真实 input 事件 + 200ms 防抖）
    var kw = q('#xtpM5Kw');
    if (kw) { kw.value = 'QA会话乙'; kw.dispatchEvent(new Event('input', { bubbles: true })); }
    await wait(500);
    R.s2_afterSearch_cards = qa('.xtp-li.xtp-m5-card').length;
    R.s2_kwVal = (q('#xtpM5Kw') || {}).value;
    R.s2_clearBtn = !!q('#xtpM5Clear');
    R.s2_sub = (q('.xtp-chat-sub') || {}).textContent || null;

    // S3 筛选下拉（验证闭包未串扰：搜索框的值应保持、下拉 change 生效）
    var rg = q('#xtpM5Range');
    R.s3_rangeFound = !!rg;
    if (rg) { rg.value = 'd7'; rg.dispatchEvent(new Event('change', { bubbles: true })); }
    await wait(400);
    R.s3_kwVal = (q('#xtpM5Kw') || {}).value;         // 搜索词是否被清掉（串扰证据）
    R.s3_rangeVal = (q('#xtpM5Range') || {}).value;
    R.s3_cards = qa('.xtp-li.xtp-m5-card').length;

    // S4 点清空搜索按钮
    var cl = q('#xtpM5Clear');
    if (cl) fire(cl);
    await wait(400);
    R.s4_kwVal = (q('#xtpM5Kw') || {}).value;
    R.s4_cards = qa('.xtp-li.xtp-m5-card').length;

    // S5 单删一条（第 1 张卡的 del 按钮）
    var before5 = cnt();
    var del = q('.xtpM5Del');
    R.s5_delBtnFound = !!del;
    if (del) fire(del);
    await wait(300);
    var okBtn = document.querySelector('#xtpConfirmOk');
    R.s5_confirmShown = !!okBtn;
    R.s5_confirmMsg = okBtn ? (document.querySelector('.xtp-modal-tip') || {}).textContent : null;
    if (okBtn) fire(okBtn);
    await wait(400);
    R.s5_before = before5; R.s5_after = cnt();
    R.s5_deletedOne = (before5 - cnt()) === 1;

    // S6 清空全部（验证 confirm 文案 + toast + localStorage）
    var cap = { toast: [], confirmMsg: null, confirmTitle: null };
    var ot = window.toast, osh = window.showToast;
    window.toast = function (m) { cap.toast.push(String(m).slice(0, 300)); try { if (ot) ot.apply(this, arguments); } catch (e) { } };
    window.showToast = window.toast;
    // 也 hook openModal 抓真原文
    var ca = q('#xtpM5ClearAll');
    R.s6_clearAllFound = !!ca;
    if (ca) fire(ca);
    await wait(300);
    cap.confirmTitle = (document.querySelector('.xtp-modal-title') || {}).textContent || null;
    cap.confirmMsg = (document.querySelector('.xtp-modal-tip') || {}).textContent || null;
    var ok2 = document.querySelector('#xtpConfirmOk');
    R.s6_okFound = !!ok2;
    if (ok2) fire(ok2);
    await wait(500);

    R.s6_confirmTitle = cap.confirmTitle;
    R.s6_confirmMsg = cap.confirmMsg;
    R.s6_confirmMentionsServer = (cap.confirmMsg || '').indexOf('服务端记录不受影响') >= 0;
    R.s6_toast = cap.toast;
    R.s6_toastMentionsServer = cap.toast.join('|').indexOf('服务端记录仍保留') >= 0;
    R.s6_afterCount = cnt();
    R.s6_historyEmpty = (ls('ai_chat_history') === null || ls('ai_chat_history') === '[]');
    R.s6_metaKeyHandled = 'xt_ai_chat_meta_v1 exists=' + (ls('xt_ai_chat_meta_v1') !== null) + ' val=' + String(ls('xt_ai_chat_meta_v1')).slice(0, 40);
    R.s6_cardsAfter = qa('.xtp-li.xtp-m5-card').length;
    R.s6_emptyTip = (q('.xtp-empty') || {}).textContent || null;
    R.s6_txtAfter = (document.querySelector('#xtpChatBody') || {}).innerText || '';
    R.s6_oldMisleadingAfter = R.s6_txtAfter.indexOf('暂无本机 AI 对话记录') >= 0;
    return R;
  })();
})();
