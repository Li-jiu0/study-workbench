/* R90-2 断言：排序改下拉 + 筛选改收放 + 折叠/CSS。jsdom。
 * 运行：NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r90b_assert.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var { JSDOM } = require('jsdom');

var ROOT = path.resolve(__dirname, '..', '..');
var pass = 0, fail = 0, failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (extra ? (' :: ' + extra) : '')); console.log('  FAIL  ' + name + (extra ? (' :: ' + extra) : '')); }
}
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

/* ---------- static ---------- */
console.log('\n[静态] R90-2');
var au = read('assets/xt-aiusage.js');
var asjs = read('assets/ai-settings.js');
var hs = read('ai-settings.html');
ok('禁用串 数据仅保存在本机浏览器 = 0', au.indexOf('数据仅保存在本机浏览器') === -1);
ok('禁用串 配额口径说明 = 0', au.indexOf('配额口径说明') === -1);
ok('禁用串 OpenRouter / Gemini 需自备网络 = 0', asjs.indexOf('OpenRouter / Gemini 需自备网络') === -1);
ok('禁用串 见底部说明 = 0', au.indexOf('见底部说明') === -1);
ok('UsageSortSel 存在', au.indexOf('UsageSortSel') !== -1);
ok('UsageQuotaFilterToggle 存在', au.indexOf('UsageQuotaFilterToggle') !== -1);
ok('旧 UsageSortBar 容器已移除', au.indexOf('id="UsageSortBar"') === -1);
ok('bindChips UsageSortBar 已移除', au.indexOf('bindChips("UsageSortBar"') === -1);
ok('bindQuotaFilterFold 已定义+接线', au.indexOf('function bindQuotaFilterFold') !== -1 && au.indexOf('bindQuotaFilterFold();') !== -1);
ok('#UsageQuotaFilterBar 保留', au.indexOf('id="UsageQuotaFilterBar"') !== -1);
ok('4 个 data-quota-filter 保留', au.indexOf('data-quota-filter="all"') !== -1 && au.indexOf('data-quota-filter="exhausted"') !== -1 && au.indexOf('data-quota-filter="low"') !== -1 && au.indexOf('data-quota-filter="unknown"') !== -1);
ok('#UsageQuotaSortBar 未动', au.indexOf('id="UsageQuotaSortBar"') !== -1);
ok('代理区 标题保留', asjs.indexOf('海外平台代理访问') !== -1);
ok('代理区 select 保留', asjs.indexOf('id="setProxyMode"') !== -1);
ok('代理区 relay/保存/测试/状态保留', asjs.indexOf('setProxyRelay') !== -1 && asjs.indexOf('setProxySave') !== -1 && asjs.indexOf('setProxyTest') !== -1 && asjs.indexOf('setProxyStatus') !== -1);
ok('CSS .xt-us-select 已加', hs.indexOf('.xt-us-select{') !== -1);
ok('CSS .xt-us-foldrow 已加', hs.indexOf('.xt-us-foldrow{') !== -1);
ok('CSS .xt-us-foldbody.open 已加', hs.indexOf('.xt-us-foldbody.open') !== -1);
ok('CSS .xt-us-footnote{display:none;} 兜底已加', hs.indexOf('.xt-us-footnote{display:none;}') !== -1);

/* ---------- jsdom behavior ---------- */
console.log('\n[jsdom] 行为');
function bootAI() {
  var html = read('ai-settings.html').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  var dom = new JSDOM(html, { url: 'https://local.test/ai-settings.html', runScripts: 'outside-only', pretendToBeVisual: true });
  var win = dom.window;
  win.XT_AI_USAGE = {
    clear: function () { return true; },
    list: function () { return [{ model: 'm1', tokens: 10, ts: Date.now(), kind: 'text' }]; },
    summarize: function () { return { calls: 1, total: 10, inTok: 5, outTok: 5, fail: 0, rows: [{ model: 'm1', total: 10, calls: 1 }], lastTs: Date.now() }; },
    kindTotals: function () { return { images: 0, chars: 0, seconds: 0 }; },
    rowsByKind: function () { return []; },
    formatNum: function (n) { return String(n); },
    formatTime: function () { return '—'; },
    formatSeconds: function (n) { return String(n); }
  };
  var panel = win.document.getElementById('setPanelAbout');
  if (panel) panel.className = (panel.className || '') + ' active';
  if (!win.document.getElementById('setTabAbout')) {
    var b = win.document.createElement('button'); b.id = 'setTabAbout'; win.document.body.appendChild(b);
  }
  var ctx = dom.getInternalVMContext();
  ctx.console = console;
  try { vm.runInContext(au, ctx, { filename: 'xt-aiusage.js' }); } catch (e) { console.log('   (load warn: ' + e.message + ')'); }
  var tab = win.document.getElementById('setTabAbout');
  if (tab) { try { tab.dispatchEvent(new win.Event('click', { bubbles: true })); } catch (e) {} }
  return dom;
}
var domAI = bootAI();
setTimeout(function () {
  var w = domAI.window, d = w.document;
  var sel = d.getElementById('UsageSortSel');
  var tog = d.getElementById('UsageQuotaFilterToggle');
  var fold = d.getElementById('UsageQuotaFilterFold');
  var cur = d.getElementById('UsageQuotaFilterCur');
  ok('skeleton 挂载：#UsageSortSel 存在', !!sel);
  ok('#UsageQuotaFilterToggle 存在', !!tog);
  ok('#UsageQuotaFilterFold 存在', !!fold);
  ok('#UsageQuotaFilterCur 存在', !!cur);
  if (sel) {
    ok('select 默认值 = tokens', sel.value === 'tokens', 'value=' + sel.value);
    var opts = sel.getElementsByTagName('option');
    ok('select 有 6 个 option', opts.length === 6, 'n=' + opts.length);
    var vals = []; for (var i = 0; i < opts.length; i++) vals.push(opts[i].value);
    ok('option 值集合完整(tokens/count/in/out/name/time)', vals.join(',') === 'tokens,count,in,out,name,time', vals.join(','));
    // 切到 time → 应触发 change 且回填仍为 time
    sel.value = 'time';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    ok('切换 select 后回填值 = time', sel.value === 'time', 'value=' + sel.value);
  }
  if (tog && fold) {
    ok('筛选折叠默认收起(无 open)', String(tog.className).indexOf('open') === -1 && String(fold.className).indexOf('open') === -1, tog.className + ' | ' + fold.className);
    tog.dispatchEvent(new w.Event('click', { bubbles: true }));
    ok('点筛选标题后展开(tog/fold 均 open)', String(tog.className).indexOf('open') !== -1 && String(fold.className).indexOf('open') !== -1, tog.className + ' | ' + fold.className);
    ok('aria-expanded=true', tog.getAttribute('aria-expanded') === 'true', tog.getAttribute('aria-expanded'));
    tog.dispatchEvent(new w.Event('click', { bubbles: true }));
    ok('再点收起(tog/fold 均无 open)', String(tog.className).indexOf('open') === -1 && String(fold.className).indexOf('open') === -1, tog.className + ' | ' + fold.className);
  }
  if (cur) {
    ok('当前筛选值文案已回填(非空)', !!cur.textContent, 'cur=' + JSON.stringify(cur.textContent));
  }
  // 危险操作折叠仍独立存在
  var crow = d.getElementById('UsageClearRow');
  var chead = d.getElementById('UsageClearHead');
  ok('危险操作折叠仍在且默认收起', !!crow && !!chead && String(crow.className).indexOf('open') === -1);

  console.log('\n==== R90-2 断言结果：PASS ' + pass + ' / TOTAL ' + (pass + fail) + ' ====');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
  process.exit(fail ? 1 : 0);
}, 60);
