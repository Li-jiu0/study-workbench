/* R90-A 断言 v2：任务一（朋友圈位置→整页跳转 + 回写）/ 任务二（文案精简 + 清空折叠）。
 * 运行：NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r90a_assert.js
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

/* ================= 静态：任务二文案 ================= */
console.log('\n[静态] 任务二 文案');
var au = read('assets/xt-aiusage.js');
ok('旧L856「账号级共享额度，非本机」0 命中', au.indexOf('账号级共享额度，非本机') === -1);
ok('旧L861「本机记录 × 服务端累计 · 按今日次数 / 最近时间 / 名称排序」0 命中', au.indexOf('本机记录 × 服务端累计 · 按今日次数 / 最近时间 / 名称排序') === -1);
ok('旧L891「逐模型一行，不聚合；排序 / 高亮 / 筛选一律以「剩余可用量」为准（A 口径）」0 命中', au.indexOf('逐模型一行，不聚合；排序 / 高亮 / 筛选一律以「剩余可用量」为准（A 口径）') === -1);
ok('旧L892「排序方式（剩余可用量口径）」0 命中', au.indexOf('排序方式（剩余可用量口径）') === -1);
ok('旧L900「筛选（按剩余可用量）」0 命中', au.indexOf('筛选（按剩余可用量）') === -1);
ok('新「排序方式」存在', au.indexOf('<span>排序方式</span>') !== -1);
ok('新「筛选」存在', au.indexOf('<span>筛选</span>') !== -1);
ok('保留「按模型累计（服务端）」', au.indexOf('<span>按模型累计（服务端）</span>') !== -1);
ok('保留「双口径对照」', au.indexOf('<span>双口径对照</span>') !== -1);
ok('保留「按模型单独列出」', au.indexOf('<span>按模型单独列出</span>') !== -1);
ok('清空折叠标题 UsageClearHead 存在', au.indexOf('UsageClearHead') !== -1);
ok('bindClearFold 已实现', au.indexOf('function bindClearFold') !== -1);
ok('bindClearFold 已接线', au.indexOf('bindClearFold();') !== -1);

/* ================= 静态：任务一 跳转顺序 ================= */
console.log('\n[静态] 任务一 跳转顺序');
var mo = read('assets/xt-moments.js');
var s1 = mo.indexOf('function xtmPickLocation()');
var s2 = mo.indexOf('function xtmOpenRegionPage()');
var body = mo.slice(s1, s2);
var iNav = body.indexOf('xtmOpenRegionPage()');
var iPick = body.indexOf('openPicker');
ok('xtmPickLocation 内「跳整页」在「openPicker」之前', iNav !== -1 && iPick !== -1 && iNav < iPick, 'nav=' + iNav + ' pick=' + iPick);

/* ================= 任务一 jsdom ================= */
console.log('\n[jsdom] 任务一 行为');
function bootMoments(regionRaw) {
  var html = read('朋友圈发布.html').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  var dom = new JSDOM(html, { url: 'https://local.test/%E6%9C%8B%E5%8F%8B%E5%9C%88%E5%8F%91%E5%B8%83.html', runScripts: 'outside-only', pretendToBeVisual: true });
  var win = dom.window;
  if (regionRaw !== undefined) { try { win.localStorage.setItem('xt_region_pick', regionRaw); } catch (e) {} }
  var ctx = dom.getInternalVMContext();
  // 最小 stub：避免 IIFE 早期因缺 window.* 抛错
  ctx.console = console;
  try { vm.runInContext(mo, ctx, { filename: 'xt-moments.js' }); } catch (e) { console.log('   (moments load warn: ' + e.message + ')'); }
  // 触发 boot（body data-xtm=publish）
  try { if (win.XTM && typeof win.XTM.boot === 'function') win.XTM.boot(); } catch (e) { console.log('   (boot warn: ' + e.message + ')'); }
  return dom;
}

// 1) 跳转
var dom1 = bootMoments();
var win1 = dom1.window;
var navCalls = [];
win1.xtmNavHook = function (u) { navCalls.push(u); };
var doc1 = win1.document;
var locBtn = doc1.getElementById('xtmLocBtn');
var atBtn = doc1.getElementById('xtmAtBtn');
ok('#xtmLocBtn 存在', !!locBtn);
ok('#xtmAtBtn 存在', !!atBtn);
if (locBtn && locBtn.onclick) { try { locBtn.onclick(); } catch (e) { ok('locBtn click 无异常', false, String(e)); } }
ok('locBtn 发起整页跳转 URL 含 地区选择.html', navCalls.length > 0 && navCalls[0].indexOf('地区选择.html') !== -1, JSON.stringify(navCalls));
ok('跳转 URL back= 解码后含 朋友圈发布.html', navCalls.length > 0 && navCalls[0].indexOf('back=') !== -1 && decodeURIComponent(navCalls[0]).indexOf('朋友圈发布.html') !== -1, navCalls.length ? decodeURIComponent(navCalls[0]) : '');
ok('跳转 URL 含 cur=', navCalls.length > 0 && navCalls[0].indexOf('cur=') !== -1, navCalls.length ? navCalls[0] : '');
navCalls.length = 0;
if (atBtn && atBtn.onclick) { try { atBtn.onclick(); } catch (e) { ok('atBtn click 无异常', false, String(e)); } }
ok('atBtn 也发起整页跳转', navCalls.length > 0 && navCalls[0].indexOf('地区选择.html') !== -1, JSON.stringify(navCalls));

// 2) 回写：新鲜值 → 显示区 + key 删除
var dom2 = bootMoments(JSON.stringify({ text: '北京市·海淀区', ts: Date.now() }));
var win2 = dom2.window;
var ch2 = win2.document.getElementById('xtmChosen');
ok('新鲜回写值写入 #xtmChosen', ch2 && ch2.textContent.indexOf('北京市·海淀区') !== -1, ch2 ? ch2.textContent : 'no el');
ok('一次性：消费后 key 被删', win2.localStorage.getItem('xt_region_pick') === null);

// 3) TTL 过期
var dom3 = bootMoments(JSON.stringify({ text: '过期城市', ts: Date.now() - 11 * 60 * 1000 }));
var ch3 = dom3.window.document.getElementById('xtmChosen');
ok('TTL 过期不写入显示区', ch3 && ch3.textContent.indexOf('过期城市') === -1, ch3 ? ch3.textContent : 'no el');

// 4) 畸形 JSON 不抛
var threw = false;
try { bootMoments('{bad json'); } catch (e) { threw = true; }
ok('畸形 JSON 不抛异常', !threw);

// 5) 选中态：回写后 #xtmLocBtn 应带 on 类
var dom5 = bootMoments(JSON.stringify({ text: '上海市', ts: Date.now() }));
var locBtn5 = dom5.window.document.getElementById('xtmLocBtn');
ok('回写后 #xtmLocBtn 带 on 选中态', locBtn5 && String(locBtn5.className).indexOf('on') !== -1, locBtn5 ? locBtn5.className : 'null');

/* ================= 任务二 jsdom ================= */
console.log('\n[jsdom] 任务二 行为');
function bootAI() {
  var html = read('ai-settings.html').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  var dom = new JSDOM(html, { url: 'https://local.test/ai-settings.html', runScripts: 'outside-only', pretendToBeVisual: true });
  var win = dom.window;
  // 注入统计底座 stub，使 bindClear 能通过 store() 就绪检查
  win.XT_AI_USAGE = {
    clear: function () { win.__cleared = (win.__cleared || 0) + 1; return true; },
    records: function () { return []; },
    summarize: function () { return { calls: 0, total: 0, inTok: 0, outTok: 0, fail: 0, rows: [], lastTs: 0 }; },
    kindTotals: function () { return { images: 0, chars: 0, seconds: 0 }; },
    rowsByKind: function () { return []; },
    formatNum: function (n) { return String(n); },
    formatTime: function () { return "—"; },
    formatSeconds: function (n) { return String(n); }
  };
  // 让 About 面板呈 active 且存在 tab 按钮，促使 scheduleRender→renderAll→mount
  var panel = win.document.getElementById('setPanelAbout');
  if (panel) panel.className = (panel.className || '') + ' active';
  if (!win.document.getElementById('setTabAbout')) {
    var b = win.document.createElement('button'); b.id = 'setTabAbout'; win.document.body.appendChild(b);
  }
  var ctx = dom.getInternalVMContext();
  ctx.console = console;
  try { vm.runInContext(au, ctx, { filename: 'xt-aiusage.js' }); } catch (e) { console.log('   (aiusage load warn: ' + e.message + ')'); }
  // 手动再触发一次 tab click 以渲染（setTimeout(0) 合并）
  var tab = win.document.getElementById('setTabAbout');
  if (tab) { try { tab.dispatchEvent(new win.Event('click', { bubbles: true })); } catch (e) {} }
  return dom;
}
var domAI = bootAI();
// scheduleRender 走 setTimeout(0)：用异步等待事件循环再断言
var wAI, d, clearRow;
function afterTick(fn) { setTimeout(fn, 40); }
function runAI() {
var d0 = domAI.window.document;
wAI = domAI.window;
d = wAI.document;
clearRow = d.getElementById('UsageClearRow');
var clearHead = d.getElementById('UsageClearHead');
var clearBtn = d.getElementById('UsageClearBtn');
var clearTxt = d.getElementById('UsageClearTxt');
ok('skeleton 已挂载（#UsageClearRow）', !!clearRow);
ok('#UsageClearHead 存在', !!clearHead);
ok('#UsageClearBtn 存在', !!clearBtn);
ok('#UsageClearTxt 存在', !!clearTxt);
if (clearRow) {
  ok('#UsageClearRow 默认收起（无 open 类）', String(clearRow.className).indexOf('open') === -1, clearRow.className);
}
if (clearHead && clearRow) {
  clearHead.dispatchEvent(new wAI.Event('click', { bubbles: true }));
  ok('点标题展开（含 open 类）', String(clearRow.className).indexOf('open') !== -1, clearRow.className);
  clearHead.dispatchEvent(new wAI.Event('click', { bubbles: true }));
  ok('再点收起（无 open 类）', String(clearRow.className).indexOf('open') === -1, clearRow.className);
}
// 防误触：点一次 clearBtn 应进入确认态而非直接清空
if (clearBtn && clearTxt) {
  var before = clearTxt.textContent;
  var clearedBefore = wAI.__cleared || 0;
  clearBtn.dispatchEvent(new wAI.Event('click', { bubbles: true }));
  var after = clearTxt.textContent;
  var clearedAfter1 = wAI.__cleared || 0;
  ok('点一次清空按钮进入确认态（防误触，未直接清空）', clearedAfter1 === clearedBefore && after !== before && (after.indexOf('再点') !== -1 || after.indexOf('确认') !== -1), 'before=' + before + ' after=' + after + ' cleared=' + clearedAfter1);
  // 再点一次才真正清空
  clearBtn.dispatchEvent(new wAI.Event('click', { bubbles: true }));
  ok('进入确认态后二次点击真正清空', (wAI.__cleared || 0) === clearedBefore + 1, 'cleared=' + (wAI.__cleared || 0));
}
// skeleton 结构闭合：统计 div 配对（借用已挂载 DOM 的 innerHTML）
if (clearRow) {
  var root = d.getElementById('setUsageRoot');
  if (root) {
    var h = root.innerHTML;
    var openDiv = (h.match(/<div\b/g) || []).length;
    var closeDiv = (h.match(/<\/div>/g) || []).length;
    ok('skeleton HTML <div> 配对闭合', openDiv === closeDiv, 'open=' + openDiv + ' close=' + closeDiv);
  }
}
}

afterTick(function () {
  runAI();
  console.log('\n==== R90-A 断言结果：PASS ' + pass + ' / TOTAL ' + (pass + fail) + ' ====');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
  process.exit(fail ? 1 : 0);
});
