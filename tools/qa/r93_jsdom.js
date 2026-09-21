/* R93-1 jsdom 端到端验证：功能分类「梯子」组 + 排序弹窗梯子筛选。
 * 加载真实 ai-config.js（只读）+ 改后的 ai-settings.js，断言：
 *  1) 功能分类 Tab 出现「梯子」组，计数与按 provider 推导的需代理模型数一致
 *  2) 每个 OpenRouter/Gemini 模型出现在梯子组，国内模型（ark 等）不出现
 *  3) 排序弹窗分类下拉出现「梯子」optgroup（value=proxy）
 *  4) 选梯子 -> 按功能分类排序：需代理模型整体排最前，lastSort.catKey==='proxy'
 *  5) 默认（未选分类）列表不受影响
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const OUT = [];
let failed = 0;
function A(name, cond) {
  OUT.push((cond ? 'PASS' : 'FAIL') + ' ' + name);
  if (!cond) { failed++; }
}
function I(msg) { OUT.push('INFO ' + msg); }

let html = fs.readFileSync(path.join(ROOT, 'ai-settings.html'), 'utf8');
html = html.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, {
  url: 'http://localhost/ai-settings.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const w = dom.window;
w.fetch = function () { return new Promise(function () {}); }; // 健康探测悬置
w.alert = function () {};
w.confirm = function () { return false; };
w.scrollTo = function () {};

w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-settings.js'), 'utf8'));

setTimeout(function () {
  try {
    const doc = w.document;

    /* ---- 默认（models Tab）不受影响 ---- */
    const modelsHost = doc.getElementById('setModelList');
    I('models host exists=' + !!modelsHost);

    /* ---- 1/2. 功能分类 Tab：梯子组 ---- */
    if (w.xtAiSettings && typeof w.xtAiSettings.switchTab === 'function') {
      w.xtAiSettings.switchTab('func');
    }
    const host = doc.getElementById('setFuncList');
    const htmlF = host ? host.innerHTML : '';
    A('func tab rendered non-empty', htmlF.length > 100);
    A('ladder group header present', htmlF.indexOf('xt-set-group-h">梯子<') !== -1);

    // 提取梯子组块（到下一个组头或说明文案为止）
    const gi = htmlF.indexOf('xt-set-group-h">梯子');
    let block = '';
    if (gi >= 0) {
      let end = htmlF.length;
      const ni = htmlF.indexOf('<div class="xt-set-note">', gi);
      const ci = htmlF.indexOf('xt-set-group-h">自定义', gi);
      if (ni >= 0) { end = Math.min(end, ni); }
      if (ci >= 0) { end = Math.min(end, ci); }
      block = htmlF.slice(gi, end);
    }
    A('ladder block extracted', block.length > 0);

    // 用运行时配置独立推导期望集合（与实现同口径：needProxy||needVPN）
    const cfgW = w.AI_CONFIG || {};
    const provs = cfgW.providers || {};
    const all = (cfgW.builtinModels || []).slice();
    const expected = all.filter(function (m) {
      const p = m && m.provider && provs[m.provider];
      return !!(p && (p.needProxy === true || p.needVPN === true));
    });
    I('expected proxy count=' + expected.length + ' ids=' + expected.map(function (m) { return m.id; }).join(','));
    A('expected proxy models > 0', expected.length > 0);

    const cntM = block.match(/xt-set-group-count">(\d+)</);
    A('ladder group count matches expected', !!cntM && parseInt(cntM[1], 10) === expected.length);

    // 显示名推导：modelDetails[id].name > model.name > id（与 displayName 兜底一致）
    function dispOf(m) {
      const d = (cfgW.modelDetails || {})[m.id] || {};
      return d.name || m.name || m.id;
    }
    for (let i = 0; i < expected.length; i++) {
      A('ladder contains ' + dispOf(expected[i]), block.indexOf(dispOf(expected[i])) !== -1);
    }
    // 每个梯子模型带「需梯子」角标
    A('ladder block has vpn badge', block.indexOf('xt-set-badge-vpn') !== -1);
    A('ladder block mentions platform name (OpenRouter/Gemini)',
      block.indexOf('OpenRouter') !== -1 || block.indexOf('Gemini') !== -1);

    // 国内模型不得出现在梯子组
    const domestic = all.filter(function (m) {
      const p = m && m.provider && provs[m.provider];
      return !(p && (p.needProxy === true || p.needVPN === true));
    });
    let domesticLeak = 0;
    for (let j = 0; j < domestic.length; j++) {
      const dn = dispOf(domestic[j]);
      if (dn && block.indexOf(dn) !== -1 && expected.every(function (e) { return dispOf(e) !== dn; })) {
        domesticLeak++;
        I('LEAK domestic model in ladder: ' + domestic[j].id + ' / ' + dn);
      }
    }
    A('no domestic model leaked into ladder group', domesticLeak === 0);

    /* ---- 3. 排序弹窗分类下拉 ---- */
    const opener = doc.getElementById('setRestoreDefault');
    A('sort modal opener exists', !!opener);
    if (opener) { opener.click(); }
    const sel = doc.getElementById('setSortCatInner');
    A('sort cat select exists', !!sel);
    const selHtml = sel ? sel.innerHTML : '';
    A('sort select has ladder optgroup', selHtml.indexOf('optgroup label="梯子"') !== -1);
    A('sort select has option value=proxy', selHtml.indexOf('value="proxy"') !== -1);
    A('sort select still has builtin optgroups', selHtml.indexOf('optgroup') !== -1 && selHtml.indexOf('文本') !== -1);

    /* ---- 4. 选梯子 -> 按功能分类排序 ---- */
    if (sel) { sel.value = 'proxy'; }
    const catBtn = doc.querySelector('[data-sort-act="cat"]');
    A('cat act button exists', !!catBtn);
    if (catBtn) { catBtn.click(); }
    const state = w.xtAiSettings.getState();
    A('lastSort.catKey === proxy', !!(state.lastSort && state.lastSort.catKey === 'proxy'));
    const order = state.order || [];
    const pset = {};
    for (let e = 0; e < expected.length; e++) { pset[expected[e].id] = true; }
    let k = 0;
    while (k < order.length && pset[order[k]]) { k++; }
    I('leading proxy run length=' + k + ' / expected=' + expected.length);
    A('proxy models sorted to front as one run', k === expected.length);
    // 梯子组之后的模型全部不是需代理模型
    let tailLeak = 0;
    for (let t = k; t < order.length; t++) { if (pset[order[t]]) { tailLeak++; } }
    A('no proxy model left behind in tail', tailLeak === 0);
    A('order still contains all models (no data loss)', order.length === all.length);

    /* ---- 5. 分类筛选横幅「显示全部」按钮（R88-M1 遗留修复验证） ---- */
    const clearBtn = doc.querySelector('[data-sort-act="catclear"]');
    A('catclear banner button exists after filter', !!clearBtn);
    if (clearBtn) { clearBtn.click(); }
    const state2 = w.xtAiSettings.getState();
    A('catclear resets catKey', !state2.lastSort || !state2.lastSort.catKey);
    const modelsHtml2 = modelsHost ? modelsHost.innerHTML : '';
    A('models list restored (no catfilter banner)', modelsHtml2.indexOf('xt-set-catfilter') === -1);
  } catch (e) {
    OUT.push('EXCEPTION ' + (e && e.stack ? e.stack : String(e)));
    failed++;
  }
  OUT.push('SUMMARY failed=' + failed);
  fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93_jsdom.txt'), OUT.join('\n'), 'utf8');
}, 400);
