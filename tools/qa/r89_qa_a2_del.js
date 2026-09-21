/* A2 补充：① d7 筛选是否对真实数据正确 ② 单删链路是否被"筛选卡死"阻塞 */
(function () {
  var R = {};
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function q(s) { var b = document.querySelector('#xtpChatBody'); return b ? b.querySelector(s) : null; }
  function qa(s) { var b = document.querySelector('#xtpChatBody'); return b ? b.querySelectorAll(s) : []; }
  function fire(el) { if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  try { window.xtpOpenView('chat'); } catch (e) { R.openErr = String(e).slice(0, 200); }
  return (async function () {
    await wait(400);
    R.cardsInitial = qa('.xtp-li.xtp-m5-card').length;
    // 检查时间戳：数据 ts 是 2025-09-16，今天 2026-09-18
    R.rawTs = (function () { try { var a = JSON.parse(ls('ai_chat_history') || '[]'); return a.map(function (s) { return { id: s.id, updatedAt: s.updatedAt, d: new Date(s.updatedAt).toISOString().slice(0, 10) }; }); } catch (e) { return 'ERR'; } })();
    R.today = new Date().toISOString().slice(0, 10);

    // 不筛选，直接单删第 1 张卡
    var del = q('.xtpM5Del');
    R.delFound = !!del;
    R.delId = del ? del.getAttribute('data-id') : null;
    var b4 = 0; try { b4 = JSON.parse(ls('ai_chat_history') || '[]').length; } catch (e) { }
    if (del) fire(del);
    await wait(300);
    var ok = document.querySelector('#xtpConfirmOk');
    R.confirmShown = !!ok;
    R.confirmMsg = (document.querySelector('.xtp-modal-tip') || {}).textContent || null;
    if (ok) fire(ok);
    await wait(400);
    var af = 0; try { af = JSON.parse(ls('ai_chat_history') || '[]').length; } catch (e) { }
    R.before = b4; R.after = af; R.deletedOne = (b4 - af) === 1;
    R.cardsAfterDel = qa('.xtp-li.xtp-m5-card').length;

    // scrollable 检查（列表容器是否有滚动）
    var list = q('.xtp-list');
    if (list) { R.listScrollH = list.scrollHeight; R.listClientH = list.clientHeight; R.listOverflowY = getComputedStyle(list).overflowY; }

    // 三级降级缝在 profile 页是否存在
    R.xtpNavHook = typeof window.xtpNavHook;
    return R;
  })();
})();
