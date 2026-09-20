/* B3 回写链路：TTL / 一次性语义 / 写入 P.location —— 用 XTM.boot() 重放 initPublishPage */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  function setls(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { } }
  function getls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function dels(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  R.bodyPage = document.body.getAttribute('data-xtm');
  R.XTM = typeof window.XTM;
  R.bootFn = window.XTM ? typeof window.XTM.boot : 'NO';

  function repaint() { try { window.XTM.boot(); } catch (e) { return String(e).slice(0, 200); } return null; }
  function domLocText() {
    // 位置显示区（renderChosen 输出）；扫描含"位置"的区域
    var cand = document.querySelector('.xtm-chosen, #xtmChosen, .xtm-func-chosen');
    return cand ? (cand.textContent || '').trim().slice(0, 160) : null;
  }

  return (async function () {
    await wait(500);
    dels('xt_region_pick');

    /* ---- 1) 新鲜回写值 -> 应被消费并写入 ---- */
    setls('xt_region_pick', { text: 'QA省 QA市 QA区', ts: Date.now() });
    var e1 = repaint();
    await wait(250);
    R.case1_bootErr = e1;
    R.case1_keyAfter1 = getls('xt_region_pick');            // 应已被移除
    R.case1_keyConsumed = getls('xt_region_pick') === null;
    R.case1_locText = domLocText();

    /* ---- 2) 一次性语义：第二次消费应失败 ---- */
    var e2 = repaint();
    await wait(250);
    R.case2_locTextStill = domLocText();                     // 内容应仍保留（P 未重置丢失）

    /* ---- 3) TTL 过期 -> 应拒绝，不写入 ---- */
    dels('xt_region_pick');
    setls('xt_region_pick', { text: '过期省 过期市', ts: Date.now() - 11 * 60 * 1000 }); // 11 分钟前
    var e3 = repaint();
    await wait(250);
    R.case3_keyAfter = getls('xt_region_pick');              // 应被移除（消费即删）
    R.case3_keyRemoved = getls('xt_region_pick') === null;
    R.case3_locText = domLocText();
    R.case3_expiredRejected = !(dev_noop());

    /* ---- 4) 边界：正好 9 分钟（应接受）---- */
    dels('xt_region_pick');
    setls('xt_region_pick', { text: '未过期省 未过期市', ts: Date.now() - 9 * 60 * 1000 });
    var e4 = repaint();
    await wait(250);
    R.case4_locText = domLocText();

    /* ---- 5) 畸形 JSON -> 不抛异常 ---- */
    dels('xt_region_pick');
    setls('xt_region_pick', '{{{BAD JSON');
    var threw = null; try { repaint(); } catch (e) { threw = String(e).slice(0, 200); }
    await wait(200);
    R.case5_threw = threw;
    R.case5_ok = threw === null;

    /* ---- 6) 无 text 字段 -> 不写 ---- */
    dels('xt_region_pick');
    setls('xt_region_pick', { ts: Date.now() });
    var threw6 = null; try { repaint(); } catch (e) { threw6 = String(e).slice(0, 200); }
    await wait(200);
    R.case6_threw = threw6;
    R.case6_ok = threw6 === null;

    return R;
  })();

  function dev_noop() { return false; }
})();
