/* R11d 额度耗尽模型自动隐藏 —— jsdom 行为级验证（真跑，不读代码）
 * ------------------------------------------------------------------
 * 被测对象：AI.html + assets/ai-config.js + assets/ai-page.js（真实文件，真实逻辑）
 * 验证目标：GET /api/ai/usage 返回某模型 exhausted:true 时，该模型在 AI 页模型
 *           选择面板的渲染列表中被自动隐藏；额度数据缺失 / 游客脱敏 / 请求失败
 *           一律 fail-open（照常显示，绝不误伤）。
 *
 * 用例：
 *   A（核心） exhausted 模型被隐藏，未耗尽模型照常显示
 *   B（fail-open） 游客口径 models:{} → 所有模型照常显示
 *   C（网络失败） fetch reject → 不抛异常、列表照常渲染（fail-open）
 *   D（去抖/防环） 连续多次 refresh 只触发 1 次 fetch；回调渲染次数有上限（不成环）
 *
 * 运行：node tools/verifier/verify_r11d_quota_hide.js   （cwd 任意）
 * 输出：每个断言一行 PASS/FAIL，末尾 TOTAL_FAIL = N
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'AI.html');
const ASSETS = path.join(ROOT, 'assets');

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function readAsset(n) { return fs.readFileSync(path.join(ASSETS, n), 'utf8'); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

/* 项目金标准：localStorage 必须用 Object.defineProperty 垫（直接赋值在 jsdom 里不生效） */
function localStorageShim(win) {
  const store = {};
  try {
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function (k, v) { store[k] = String(v); },
        removeItem: function (k) { delete store[k]; },
        clear: function () { for (const k in store) { if (Object.prototype.hasOwnProperty.call(store, k)) delete store[k]; } },
        key: function (i) { return Object.keys(store)[i] || null; },
        get length() { return Object.keys(store).length; }
      }
    });
  } catch (e) { /* ignore */ }
}

/* 构造一个加载了真实 AI 页的 jsdom 环境；fetchImpl(url, init) 控制 /api/ai/usage 行为 */
async function buildPage(fetchImpl) {
  const html = fs.readFileSync(HTML, 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { errors.push('jsdomError: ' + ((e && (e.detail || e.message)) || e)); });
  vc.on('error', function () { errors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); });

  const dom = new JSDOM(html, {
    url: 'file://' + HTML.replace(/\\/g, '/'),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  const doc = win.document;
  localStorageShim(win);

  /* 后端地址（api.js 里的取值口径：file 场景为服务端绝对地址） */
  win.API_BASE = 'http://110.42.134.62:8000';

  /* 最小桩：只补齐本页 init 会碰到的宿主全局，不注入任何被测逻辑 */
  win.xtToast = function () {};
  win.showToast = function () {};
  win.navigateTo = function () {};
  win.recordStudy = function () {};
  win.CURRENT_USER = { id: 1, username: 'verifier', nickname: '验证号' };
  win.apiGetToken = function () { return 'tok'; };
  win.matchMedia = win.matchMedia || function (q) {
    return { matches: false, media: q, addListener: function () {}, removeListener: function () {},
      addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } };
  };
  if (!win.requestAnimationFrame) win.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };

  /* fetch 监控：记录调用次数与 URL/参数 */
  const fetchCalls = [];
  win.fetch = function (url, init) {
    fetchCalls.push({ url: String(url), init: init });
    return fetchImpl(String(url), init);
  };

  /* 强制 readyState=loading，使 ai-page.js 走「注册 DOMContentLoaded」分支，
     从而让我们能在 init 之前装好全部桩与监控，再确定性地触发 init。 */
  let rs = 'loading';
  try { Object.defineProperty(doc, 'readyState', { configurable: true, get: function () { return rs; } }); } catch (e) { errors.push('readyState shim failed: ' + e.message); }

  /* 真实脚本按 AI.html 的依赖顺序注入（config.js→api.js→ai-config.js→ai-page.js；
     config.js/api.js 的产物是 STUDY_API_BASE / API_BASE，本用例已显式设定 API_BASE，
     故只需 ai-config.js 提供 AI_CONFIG，再注入 ai-page.js 本体） */
  win.eval(readAsset('ai-config.js'));
  win.eval(readAsset('ai-page.js'));

  /* 渲染计数：给 #aiModelList 装 innerHTML setter 钩子。
     ai-page.js 的 renderModelList() 唯一动作是 list.innerHTML='' → 可精确计次。 */
  const list = doc.getElementById('aiModelList');
  let renderTicks = 0;
  try {
    const d = Object.getOwnPropertyDescriptor(win.Element.prototype, 'innerHTML');
    Object.defineProperty(list, 'innerHTML', {
      configurable: true,
      get: function () { return d.get.call(this); },
      set: function (v) { renderTicks++; d.set.call(this, v); }
    });
  } catch (e) { errors.push('innerHTML hook failed: ' + e.message); }

  /* 触发 init（若上面未装钩子就 init 会漏计，故先装钩子再派发） */
  rs = 'complete';
  try { doc.dispatchEvent(new win.Event('DOMContentLoaded')); }
  catch (e) { errors.push('DOMContentLoaded dispatch threw: ' + e.message); }

  /* 便捷操作 */
  function openPanel() {
    const b = doc.getElementById('aiModelBtn');
    const p = doc.getElementById('aiModelPanel');
    if (!p.classList.contains('open')) b.click();   // 已开时点击会关，故仅在关闭态点开
  }
  function forceClose() {
    const p = doc.getElementById('aiModelPanel');
    if (p.classList.contains('open')) doc.getElementById('aiModelBtn').click();
  }
  function renderedIds() {
    return Array.prototype.map.call(list.querySelectorAll('.ai-mp-row'), function (r) { return r.getAttribute('data-id'); });
  }
  function panelOpen() { return doc.getElementById('aiModelPanel').classList.contains('open'); }
  function apiCalls() { return fetchCalls.filter(function (c) { return /\/api\/ai\/usage$/.test(c.url); }); }

  return {
    dom: dom, win: win, doc: doc, list: list,
    errors: errors, fetchCalls: fetchCalls,
    openPanel: openPanel, forceClose: forceClose, renderedIds: renderedIds,
    panelOpen: panelOpen, apiCalls: apiCalls,
    get renderTicks() { return renderTicks; }
  };
}

/* 断言「无未捕获异常」（忽略与我们无关的 debug 噪音） */
function noUncaught(name, errors) {
  const bad = errors.filter(function (e) { return /jsdomError/.test(e); });
  assert(name, bad.length === 0, bad.join(' | '));
}

(async function main() {
  console.log('=== R11d 额度耗尽模型自动隐藏 · jsdom 行为级验证 ===');

  /* ============================ 用例 A（核心） ============================ */
  console.log('\n[用例A] exhausted 模型被隐藏，未耗尽模型照常显示');
  {
    const usagePayload = {
      ok: true, serverTime: 'x',
      models: {
        'ark-v4-pro': { used: 500000, freeQuota: 500000, quotaType: 'free', remaining: 0,
          percent: 100, status: 'exhausted', exhausted: true, expireAt: 'x', expired: false, calls: 0, failCalls: 0, updatedAt: 'x' }
      }
    };
    const p = await buildPage(function () {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(usagePayload); } });
    });
    await tick(30);                 // 等 init 的 fetch + 回调渲染落定
    p.openPanel();                  // 触发模型面板（openModelPanel → refreshQuotaSnap(renderModelList)）
    await tick(20);
    const ids = p.renderedIds();

    assert('A1 面板已打开（openModelPanel 生效）', p.panelOpen() === true);
    assert('A2 额度接口 /api/ai/usage 被请求', p.apiCalls().length >= 1,
      'calls=' + JSON.stringify(p.fetchCalls.map(function (c) { return c.url; })));
    assert('A3 未耗尽模型 ark-v4-flash 仍在渲染列表中', ids.indexOf('ark-v4-flash') !== -1, 'ids=' + ids.join(','));
    assert('A4 已耗尽模型 ark-v4-pro 不在渲染列表中（自动隐藏）', ids.indexOf('ark-v4-pro') === -1,
      'ids=' + ids.join(','));
    assert('A5 列表非空（隐藏只针对 exhausted，未连带清空）', ids.length > 5, 'count=' + ids.length);
    noUncaught('A6 无未捕获异常', p.errors);
    p.dom.window.close();
  }

  /* ============================ 用例 B（fail-open：游客脱敏） ============================ */
  console.log('\n[用例B] 游客口径 models:{} → 所有模型照常显示（fail-open）');
  {
    const payload = { ok: true, serverTime: 'x', models: {} };
    const p = await buildPage(function () {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(payload); } });
    });
    await tick(30);
    p.openPanel();
    await tick(20);
    const ids = p.renderedIds();

    assert('B1 models:{} 时 ark-v4-pro 照常显示（无误隐藏）', ids.indexOf('ark-v4-pro') !== -1, 'ids=' + ids.join(','));
    assert('B2 models:{} 时 ark-v4-flash 照常显示', ids.indexOf('ark-v4-flash') !== -1, 'ids=' + ids.join(','));
    assert('B3 全量模型均在（无任何模型被误隐藏）', ids.length > 5, 'count=' + ids.length);
    noUncaught('B4 无未捕获异常', p.errors);
    p.dom.window.close();
  }

  /* ---- 用例 B2（对照/判别力）：同一模型 exhausted:false 时必须照常显示 ----
     与用例 A 构成唯一变量对照：同一 id、仅 exhausted 由 true 变 false，
     一个隐藏、一个显示 → 证明隐藏确由该字段驱动，而非其它过滤误伤。 */
  console.log('\n[用例B2-对照] 同一模型 exhausted:false → 必须照常显示（与 A 唯一变量对照）');
  {
    const payload = { ok: true, serverTime: 'x', models: { 'ark-v4-pro': { used: 0, freeQuota: 500000, status: 'ok', exhausted: false } } };
    const p = await buildPage(function () {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(payload); } });
    });
    await tick(30);
    p.openPanel();
    await tick(20);
    const ids = p.renderedIds();
    assert('B2-1 exhausted:false 的 ark-v4-pro 照常显示（对照 A4 的隐藏）', ids.indexOf('ark-v4-pro') !== -1, 'ids=' + ids.join(','));
    noUncaught('B2-2 无未捕获异常', p.errors);
    p.dom.window.close();
  }

  /* ============================ 用例 C（网络失败） ============================ */
  console.log('\n[用例C] 额度接口 reject（断网/file://）→ 不抛异常、列表照常渲染');
  {
    const p = await buildPage(function () {
      return Promise.reject(new Error('network down (simulated)'));
    });
    await tick(30);
    p.openPanel();
    await tick(20);
    const ids = p.renderedIds();

    assert('C1 面板仍能打开（额度接口挂掉不阻断交互）', p.panelOpen() === true);
    assert('C2 列表照常渲染（fail-open，不空白）', ids.length > 5, 'count=' + ids.length);
    assert('C3 网络失败时 ark-v4-pro 照常显示（不误隐藏）', ids.indexOf('ark-v4-pro') !== -1, 'ids=' + ids.join(','));
    noUncaught('C4 请求失败全程无未捕获异常', p.errors);
    p.dom.window.close();
  }

  /* ============================ 用例 D（去抖 / 防渲染环） ============================ */
  console.log('\n[用例D] 连续多次 refresh 只触发 1 次 fetch；渲染次数有上限（TTL/inflight 去抖，不成环）');
  {
    let resolveFetch = null;
    const pending = new Promise(function (res) { resolveFetch = res; });
    const p = await buildPage(function () {
      if (!resolveFetch) { /* 之后所有调用共用同一个可控 promise，模拟「在飞行中」 */ }
      return pending;
    });
    await tick(10);

    /* init 已触发第 1 次 fetch（处于 pending）→ 之后每次 openModelPanel 都调用 refreshQuotaSnap，
       但 inflight/TTL 去抖应拦住，不再新增 fetch。 */
    const afterInitCalls = p.apiCalls().length;
    assert('D1 初始化触发且仅触发 1 次额度请求', afterInitCalls === 1, 'calls=' + afterInitCalls);

    /* 多轮开/关：每次「打开」都会跑一遍 refreshQuotaSnap + renderModelList */
    for (let k = 0; k < 3; k++) { p.forceClose(); p.openPanel(); }
    await tick(20);
    const duringInflight = p.apiCalls().length;
    assert('D2 请求在飞行中时重复打开不再新增 fetch（inflight 去重）', duringInflight === 1, 'calls=' + duringInflight);

    /* 放行首个请求 → 回调渲染一次 */
    resolveFetch({ ok: true, json: function () { return Promise.resolve({ ok: true, models: {} }); } });
    await tick(30);
    const ticksAfterResolve = p.renderTicks;

    /* 快照已就绪且 TTL(60s) 未过期 → 再打开也不应重新 fetch（TTL 去抖 / 防循环） */
    for (let k = 0; k < 3; k++) { p.forceClose(); p.openPanel(); }
    await tick(20);
    const endCalls = p.apiCalls().length;
    assert('D3 快照就绪后（TTL 内）重复打开不再新增 fetch（TTL 去抖）', endCalls === 1, 'calls=' + endCalls);
    assert('D4 未出现「渲染→拉取→回调再渲染」循环（渲染次数有上限）', p.renderTicks <= 12, 'renderTicks=' + p.renderTicks + ' (afterResolve=' + ticksAfterResolve + ')');
    noUncaught('D5 去抖场景无未捕获异常', p.errors);
    p.dom.window.close();
  }

  console.log('\nRESULT: pass=' + pass + ' fail=' + fail);
  console.log('TOTAL_FAIL = ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('HARNESS ERROR', (e && e.stack) || e); console.log('TOTAL_FAIL = ' + (fail + 1)); process.exit(2); });
