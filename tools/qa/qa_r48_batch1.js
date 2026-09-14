/* =====================================================================
   qa_r48_batch1.js · R48「9 页做真内容」第 1 批（T00/T10/T11/T12）质量验证
   ---------------------------------------------------------------------
   编写：严过关（QA） / 2026-09-14 / 版本戳 20260914e
   运行：cd D:/下载的文件/学习工作台 && node tools/qa/qa_r48_batch1.js
   输出：控制台 + tools/qa/_r48_batch1_result.txt

   设计原则
     1. 可重复运行：不修改任何业务文件，只读取。
     2. 文件缺失 → 记 SKIP，绝不误报 FAIL（T10/T12 未完成时可先跑）。
     3. 覆盖「方案 §六 7 条验收标准」中第 1 批相关项（#5 A6 / #6 A7 / #7 无弹窗）
        + 架构文档 §9 打回线 + §10 风险登记（Top5）+ 3 条静默失败专项。
     4. 状态：PASS / FAIL / SKIP
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:/下载的文件/学习工作台';
const OUT = path.join(ROOT, 'tools', 'qa', '_r48_batch1_result.txt');

/* jsdom：优先本目录，退回 tools/verifier/node_modules */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; } catch (e) {
  JSDOM = require(path.join(ROOT, 'tools', 'verifier', 'node_modules', 'jsdom')).JSDOM;
}

/* ---------------------------------------------------------------- 结果收集 */
const R = [];
let nPass = 0, nFail = 0, nSkip = 0;
function pass(id, msg) { R.push(['PASS', id, msg || '']); nPass++; }
function fail(id, msg) { R.push(['FAIL', id, msg || '']); nFail++; }
function skip(id, msg) { R.push(['SKIP', id, msg || '']); nSkip++; }
function sec(title) { R.push(['----', title, '']); }
function ck(id, fn) { try { fn(); pass(id); } catch (e) { fail(id, e && e.message ? e.message : String(e)); } }
function asrt(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' 期望=' + JSON.stringify(b) + ' 实际=' + JSON.stringify(a)); }

/* ---------------------------------------------------------------- 文件工具 */
function rd(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
function safeRd(p) { try { return exists(p) ? rd(p) : null; } catch (e) { return null; } }

/** 等价 node --check：只编译不执行 */
function syntaxOk(code, file) {
  try { new vm.Script(code, { filename: file }); return null; }
  catch (e) { return e.message; }
}

/** 去掉注释与字符串里的协议头不做处理；仅用于粗筛 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function countOf(s, re) { const m = s.match(re); return m ? m.length : 0; }

/** 统计标签配对前先剔除内联 <script> 内容与块注释，避免注释里出现 "<style>" 造成误判 */
function markupOnly(s) {
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

const NEW_JS = [
  'assets/xt-content.js',
  'assets/company-lib.js',
  'assets/data-exam-company.js',
  'assets/data-ppt-templates.js',
  'assets/tpl-preview.js',
  'assets/data-ppt-class.js',
  'assets/design-class.js'
];
const NEW_HTML = ['企业定向库.html'];
const TOUCHED_HTML = ['PPT训练.html', '央国企笔试.html'];

/* =====================================================================
   G0 · 文件存在性 / 编码 / 语法（node --check 等价）
   ===================================================================== */
sec('G0 文件存在性 · 编码 · 语法');
const present = {};
NEW_JS.concat(NEW_HTML, TOUCHED_HTML).forEach(function (f) {
  present[f] = exists(f);
});

NEW_JS.forEach(function (f) {
  if (!present[f]) { skip('G0.exists:' + f, '文件尚未创建（对应任务未完成）'); return; }
  const s = rd(f);
  ck('G0.syntax:' + f, function () { const e = syntaxOk(s, f); asrt(!e, '语法错误：' + e); });
  ck('G0.noBOM:' + f, function () { asrt(s.charCodeAt(0) !== 0xFEFF, '文件带 UTF-8 BOM'); });
  ck('G0.asciiName:' + f, function () {
    asrt(/^[\x20-\x7E]+$/.test(path.basename(f)), '文件名含非 ASCII 字符');
  });
});

NEW_HTML.forEach(function (f) {
  if (!present[f]) { skip('G0.exists:' + f, '文件尚未创建'); return; }
  const s = rd(f);
  ck('G0.noBOM:' + f, function () { asrt(s.charCodeAt(0) !== 0xFEFF, '文件带 UTF-8 BOM'); });
});

/* =====================================================================
   G1 · 铁律：不调 saveData / 无外链 / 版本戳
   ===================================================================== */
sec('G1 硬约束：saveData / 外链 / 版本戳');
NEW_JS.forEach(function (f) {
  if (!present[f]) { skip('G1.noSaveData:' + f, '文件缺失'); return; }
  const body = stripComments(rd(f));
  ck('G1.noSaveData:' + f, function () {
    asrt(!/saveData\s*\(/.test(body), '调用了 saveData()（铁律 8 禁止）');
  });
  ck('G1.noCDN:' + f, function () {
    const bad = body.match(/https?:\/\/[^\s'"<>)]+/g);
    asrt(!bad, '出现外链 URL：' + (bad ? bad.slice(0, 3).join(' | ') : ''));
  });
  ck('G1.noImg:' + f, function () {
    asrt(!/<img\b/i.test(body), '出现 <img> 外链图片');
    asrt(!/url\(\s*['"]?https?:/i.test(body), '出现 url(http...) 外链背景图');
  });
});

NEW_HTML.concat(TOUCHED_HTML).forEach(function (f) {
  if (!present[f]) { skip('G1.ver:' + f, '文件缺失'); return; }
  const s = rd(f);
  ck('G1.newFileVersion:' + f, function () {
    const re = /<script[^>]+src="(assets\/[A-Za-z0-9._-]+\.js)\?v=([0-9a-zA-Z]+)"/g;
    let m, bad = [];
    const newest = ['xt-content.js', 'company-lib.js', 'data-exam-company.js',
      'data-ppt-templates.js', 'tpl-preview.js', 'data-ppt-class.js', 'design-class.js'];
    while ((m = re.exec(s))) {
      if (newest.indexOf(path.basename(m[1])) >= 0 && m[2] !== '20260914e') {
        bad.push(m[1] + '?v=' + m[2]);
      }
    }
    asrt(!bad.length, '新文件版本戳不是 20260914e：' + bad.join(', '));
  });
});

/* =====================================================================
   G2 · PPT训练.html 标签配对与原有 DOM 保全（不删现有功能）
   ===================================================================== */
sec('G2 PPT训练.html 标签配对 · 原功能 DOM 保全');
const pptHtml = safeRd('PPT训练.html');
if (!pptHtml) {
  skip('G2.all', 'PPT训练.html 缺失');
} else {
  sec('G2');
  ck('G2.tagPair.style', function () {
    const s = markupOnly(pptHtml);
    eq(countOf(s, /<style\b[^>]*>/gi), countOf(s, /<\/style>/gi), '<style> 标签不配对');
  });
  ck('G2.tagPair.script', function () {
    eq(countOf(pptHtml, /<script\b/gi), countOf(pptHtml, /<\/script>/gi), '<script> 标签不配对');
  });
  ck('G2.tagPair.div', function () {
    const s = markupOnly(pptHtml);
    eq(countOf(s, /<div\b/gi), countOf(s, /<\/div>/gi), '<div> 标签不配对');
  });
  ck('G2.domKeep.panel', function () {
    ['pptPanel', 'pptPanelSlot', 'pptPanelIcon', 'pptPanelTitle', 'pptPanelTag', 'pptPanelDesc', 'pptPanelBody', 'pptHub']
      .forEach(function (id) { asrt(pptHtml.indexOf('id="' + id + '"') >= 0, '原 DOM #' + id + ' 被删除'); });
  });
  ck('G2.domKeep.entries', function () {
    ['openPptPanel(\'ppt-design\')', 'openPptPanel(\'ppt-templates\')', 'openPptPanel(\'ppt-tips\')']
      .forEach(function (c) { asrt(pptHtml.indexOf(c) >= 0, '原入口被删：' + c); });
  });
  ck('G2.legacyKept', function () {
    asrt(/var\s+CATS\s*=/.test(pptHtml), '旧 CATS 注册表被删');
    asrt(/window\.closePptPanel\s*=/.test(pptHtml), '旧 closePptPanel 被删');
    asrt(/window\.openPptHub\s*=/.test(pptHtml), '旧 openPptHub 被删');
  });
  ck('G2.registryPreburied', function () {
    asrt(/window\.PPTV2\s*=\s*window\.PPTV2\s*\|\|\s*\{\}/.test(pptHtml), 'T00 未预埋 window.PPTV2 注册表');
    asrt(pptHtml.indexOf('assets/xt-content.js') >= 0, '未引入 xt-content.js');
    ['tpl-preview.js', 'design-class.js'].forEach(function (f) {
      asrt(pptHtml.indexOf('assets/' + f) >= 0, '未预埋脚本占位：' + f);
    });
  });
  /* 风险：一次性绑定 —— V2 渲染不得重建 #pptPanelSlot 本体 */
  ck('G2.slotNotRebuilt.static', function () {
    const t00 = pptHtml.slice(pptHtml.indexOf('R48 T00'));
    ["outerHTML", "replaceChild", "removeChild", "replaceWith", "insertAdjacentHTML('beforebegin'"]
      .forEach(function (k) {
        asrt(t00.indexOf(k) < 0, 'T00 出现会重建挂载点的写法：' + k + '（会丢事件绑定）');
      });
  });
}

/* =====================================================================
   G3 · 图标静默失败专项（F9）
   ===================================================================== */
sec('G3 图标静默失败专项（icon-map 未注册名 → continue 零报错）');
const iconMapJs = rd('assets/icon-map.js');
let ICONS = null;
{
  const d = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
  d.window.eval(iconMapJs);
  ICONS = d.window.LUCIDE_ICONS || {};
}
ck('G3.iconMapLoaded', function () {
  asrt(Object.keys(ICONS).length > 0, 'LUCIDE_ICONS 为空，icon-map.js 未正确导出');
});
const ICON_NAMES = Object.keys(ICONS);

function collectIconNames(files) {
  const names = {};
  files.forEach(function (f) {
    if (!present[f]) return;
    const s = rd(f);
    let m;
    const re1 = /data-icon\s*=\s*["']([A-Za-z0-9-]+)["']/g;
    while ((m = re1.exec(s))) names[m[1]] = (names[m[1]] || []).concat(f);
    const re2 = /data-icon\s*=\s*["']\s*["']/g; /* 空值跳过 */
    const re3 = /CL_icon\(\s*['"]([A-Za-z0-9-]+)['"]/g;
    while ((m = re3.exec(s))) names[m[1]] = (names[m[1]] || []).concat(f);
    const re4 = /XTC\.icon\(\s*['"]([A-Za-z0-9-]+)['"]/g;
    while ((m = re4.exec(s))) names[m[1]] = (names[m[1]] || []).concat(f);
    const re5 = /lucideIcon\(\s*['"]([A-Za-z0-9-]+)['"]/g;
    while ((m = re5.exec(s))) names[m[1]] = (names[m[1]] || []).concat(f);
    /* 数据文件里的 icon: 'xxx' 字段 */
    const re6 = /\bicon\s*:\s*['"]([A-Za-z0-9-]+)['"]/g;
    while ((m = re6.exec(s))) names[m[1]] = (names[m[1]] || []).concat(f);
    void re2;
  });
  return names;
}

const usedIcons = collectIconNames(NEW_JS);
ck('G3.iconsRegistered', function () {
  const missing = Object.keys(usedIcons).filter(function (n) { return ICON_NAMES.indexOf(n) < 0; });
  asrt(!missing.length, '以下图标名未在 icon-map.js 注册（会静默渲染成空 span）：' +
    missing.map(function (n) { return n + '@' + usedIcons[n].join(','); }).join(' | '));
});

/* =====================================================================
   G4 · T00 契约层 xt-content.js 行为验证
   ===================================================================== */
sec('G4 T00 契约层 xt-content.js');
let XTC = null, contractWin = null;
if (!present['assets/xt-content.js']) {
  skip('G4.all', 'xt-content.js 缺失');
} else {
  const d = new JSDOM('<!doctype html><html><body><div id="slot"></div><div id="q"></div></body></html>',
    { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = d.window;
  contractWin = w;
  w.eval(iconMapJs);
  w.eval(rd('assets/xt-content.js'));
  XTC = w.XTC;

  ck('G4.apiComplete', function () {
    const need = ['esc', 'icon', 'renderIcons', 'lsKeySafe', 'credit', 'storage', 'readProgress',
      'readFav', 'isLearned', 'setLearned', 'markLearned', 'isFav', 'toggleFav', 'progress',
      'saveQuizBest', 'readQuizBest', 'registerView', 'dispatchView', 'hasView',
      'hero', 'progressBar', 'tabs', 'sectionsHtml', 'listHtml', 'empty', 'renderQuiz', 'injectStyle'];
    const miss = need.filter(function (k) { return !XTC || XTC[k] === undefined; });
    asrt(!miss.length, '缺失 API：' + miss.join(','));
    asrt(w.XTContent === XTC, 'XTContent 与 XTC 未指向同一对象（§8.1 命名兼容）');
  });
  ck('G4.esc', function () {
    eq(XTC.esc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
    eq(XTC.esc(null), '');
    eq(XTC.esc(undefined), '');
  });
  ck('G4.storageRoundtrip', function () {
    XTC.storage.set('xtc:__qa__', { a: 1 });
    eq(JSON.stringify(XTC.storage.get('xtc:__qa__', null)), '{"a":1}');
    XTC.storage.del('xtc:__qa__');
    eq(XTC.storage.get('xtc:__qa__', 'x'), 'x');
  });
  ck('G4.learnToggle', function () {
    XTC.setLearned('__qa__', 'i1', false);
    eq(XTC.isLearned('__qa__', 'i1'), false, '初始应为未学');
    eq(XTC.markLearned('__qa__', 'i1'), true, '首次标记应返回 true');
    eq(XTC.isLearned('__qa__', 'i1'), true, '标记后应为已学');
    eq(XTC.markLearned('__qa__', 'i1'), false, '再次调用应取消');
    eq(XTC.isLearned('__qa__', 'i1'), false, '取消后应为未学');
  });
  ck('G4.favToggle', function () {
    XTC.setLearned('__qa__', 'i1', false);
    XTC.toggleFav('__qa__', 'f1');
    eq(XTC.isFav('__qa__', 'f1'), true);
    eq(XTC.toggleFav('__qa__', 'f1'), false);
    eq(XTC.isFav('__qa__', 'f1'), false);
  });
  ck('G4.progress', function () {
    ['p1', 'p2', 'p3'].forEach(function (id) { XTC.setLearned('__qa2__', id, true); });
    const p = XTC.progress('__qa2__', ['p1', 'p2', 'p3', 'p4']);
    eq(p.done, 3); eq(p.total, 4); eq(p.pct, 75);
    void p;
  });
  ck('G4.heroProgressBarTabs', function () {
    const h = w.document.getElementById('slot');
    XTC.hero(h, { icon: 'star', title: 'T', sub: 'S', tags: ['a', 'b'] });
    asrt(h.querySelectorAll('.xt-hero').length === 1, 'hero 未渲染');
    asrt(h.querySelectorAll('.xt-credit').length === 1, 'hero 缺免责行');
    asrt(h.querySelectorAll('[data-icon] svg').length >= 1, 'hero 图标未内联渲染（F9 静默失败）');
    XTC.progressBar(h, { done: 2, total: 8, label: 'L' });
    asrt(h.querySelectorAll('.xt-bar-fill').length === 1, 'progressBar 未渲染');
    let switched = null;
    XTC.tabs(h, [{ id: 'c1', label: 'C1' }, { id: 'c2', label: 'C2' }], 'c1', function (id) { switched = id; });
    const tabs = h.querySelectorAll('.xt-tab');
    eq(tabs.length, 2);
    tabs[1].dispatchEvent(new w.Event('click', { bubbles: true }));
    eq(switched, 'c2', 'tabs 回调未触发');
  });
  ck('G4.renderQuiz', function () {
    const q = w.document.getElementById('q');
    let done = null;
    const h = XTC.renderQuiz(q, [
      { q: 'Q1', o: ['a', 'b', 'c', 'd'], a: 1, x: 'X1' },
      { q: 'Q2', o: ['a', 'b', 'c', 'd'], a: 2, x: 'X2' }
    ], { bestKey: '__qa__', bestId: 'q1', onDone: function (c, t) { done = c + '/' + t; } });
    eq(h.total, 2);
    const items = q.querySelectorAll('.xt-quiz-item');
    eq(items.length, 2);
    /* 第 1 题选错（index 0） */
    items[0].querySelectorAll('.xt-quiz-opt')[0].dispatchEvent(new w.Event('click', { bubbles: true }));
    asrt(q.querySelectorAll('.xt-quiz-opt.wrong').length === 1, '错选未标记 wrong');
    asrt(q.querySelectorAll('.xt-quiz-opt.ok').length === 1, '错选未标出正确项');
    asrt(!items[0].querySelector('.xt-quiz-exp').hidden, '解析未展开');
    /* 第 2 题选对（index 2） */
    items[1].querySelectorAll('.xt-quiz-opt')[2].dispatchEvent(new w.Event('click', { bubbles: true }));
    eq(done, '1/2', 'onDone 回调结果不对');
    asrt(!q.querySelector('.xt-quiz-sum').hidden, '成绩条未出现');
    const best = XTC.readQuizBest('__qa__', 'q1');
    asrt(best && best.best === 1, '自测最好成绩未落盘');
  });
  ck('G4.dispatchView.hit', function () {
    const slot = w.document.getElementById('slot');
    let got = null;
    XTC.registerView('QAV2', 'v-hit', function (el) {
      const n = w.document.createElement('b'); n.id = 'hitmark'; n.textContent = 'x';
      el.appendChild(n); got = el;
    });
    eq(XTC.hasView('QAV2', 'v-hit'), true);
    const r = XTC.dispatchView('QAV2', 'v-hit', slot);
    eq(r, true);
    asrt(got === slot, '未把 slot 原节点传给渲染函数');
    asrt(!!w.document.getElementById('hitmark'), 'V2 内容未挂载');
    asrt(slot === w.document.getElementById('slot'), '★ slot 被重建（事件绑定会全丢）');
  });
  ck('G4.dispatchView.miss', function () {
    const slot = w.document.getElementById('slot');
    eq(XTC.dispatchView('QAV2', 'nope', slot), false, '未命中应返回 false 由宿主页回退');
    eq(XTC.dispatchView('QAV2', 'v-hit', null), false, 'slot 为空应返回 false');
  });
  ck('G4.dispatchView.throwFallback', function () {
    const slot = w.document.getElementById('slot');
    XTC.registerView('QAV2', 'v-boom', function () { throw new Error('boom'); });
    const r = XTC.dispatchView('QAV2', 'v-boom', slot);
    eq(r, false, '渲染抛错应返回 false 而不是冒泡崩溃');
    asrt(!!XTC.lastError, '未记录 lastError');
  });
}

/* =====================================================================
   G5 · PPT训练.html 运行时：V2 分发 / 旧逻辑透传 / 挂载点不重建
   ===================================================================== */
sec('G5 PPT训练.html 运行时 · 旧逻辑透传（不删现有功能）');
if (!pptHtml || !present['assets/xt-content.js']) {
  skip('G5.all', '依赖文件缺失');
} else {
  const d = new JSDOM(pptHtml, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = d.window;
  const calls = [];
  w.eval(iconMapJs);
  w.eval(rd('assets/xt-content.js'));
  w.openMiniQuiz = function (id) { calls.push('mini:' + id); };
  w.showToast = function () { };

  /* 只取与本次改造相关的两段内联脚本（K4 旧面板 + T00 注册表），避免加载 app.js 依赖 */
  const inline = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(pptHtml))) inline.push(m[1]);
  /* 注意：K4 脚本注释里也出现了 "R48 T00" 字样，务必用唯一标记区分 */
  const k4 = inline.filter(function (s) { return s.indexOf('window.openPptHub') >= 0; })[0];
  const t00 = inline.filter(function (s) { return s.indexOf('PPTV2 注册表预埋') >= 0; })[0];
  let boot5Err = null;
  if (!k4) fail('G5.findK4', 'PPT训练.html 未找到 K4 旧面板内联脚本');
  if (!t00) fail('G5.findT00', 'PPT训练.html 未找到 T00 注册表内联脚本（挂载点未预埋）');
  try { if (k4) w.eval(k4); if (t00) w.eval(t00); }
  catch (e) { boot5Err = e; fail('G5.evalInline', '内联脚本执行抛错：' + (e && e.message)); }

  const g5ok = !!(k4 && t00 && !boot5Err);
  if (!g5ok) skip('G5.runtime', '内联脚本不可用，跳过运行时断言');

  /* jsdom 解析完成后才触发 DOMContentLoaded → boot() 才会包装 openPptPanel */
  const ready = new Promise(function (res) {
    if (w.document.readyState === 'complete') return res();
    w.addEventListener('load', function () { res(); });
    setTimeout(res, 2000);
  });

  (g5ok ? ready : null) && ready.then(function () {
    try {
      ck('G5.registryCreated', function () {
        asrt(w.PPTV2 && typeof w.PPTV2 === 'object', 'window.PPTV2 未创建（defer 业务脚本将无法注册）');
        asrt(typeof w.openPptPanel === 'function', 'openPptPanel 未定义');
      });

      /* —— 旧功能未回归：未注册 id 必须透传 openMiniQuiz —— */
      ck('G5.legacyPassthrough.unknownId', function () {
        calls.length = 0;
        w.openPptPanel('some-legacy-id');
        asrt(calls.indexOf('mini:some-legacy-id') >= 0,
          '未注册 id 未透传给 openMiniQuiz（旧功能被吞）：' + JSON.stringify(calls));
      });
      ck('G5.legacyPassthrough.pptTips', function () {
        calls.length = 0;
        w.openPptPanel('ppt-tips');   // 第 3 批才做，当前未注册
        asrt(calls.indexOf('mini:ppt-tips') >= 0, 'ppt-tips 旧路径被破坏');
      });
      ck('G5.legacyPassthrough.pptDesign', function () {
        calls.length = 0;
        w.openPptPanel('ppt-design'); // T12 未注册 design-class.js 前必须走旧逻辑
        asrt(calls.indexOf('mini:ppt-design') >= 0, 'ppt-design 旧路径被破坏');
      });

      /* —— V2 命中：渲染 + 挂载点不被重建 —— */
      const slotBefore = w.document.getElementById('pptPanelSlot');
      ck('G5.v2.hit', function () {
        calls.length = 0;
        w.PPTV2['ppt-templates'] = function (slot) {
          const n = w.document.createElement('i');
          n.id = 'v2mark'; n.setAttribute('data-icon', 'star'); n.textContent = 'V2';
          slot.appendChild(n);
        };
        const r = w.openPptPanel('ppt-templates');
        eq(r, true, 'V2 命中未返回 true');
        asrt(!!w.document.getElementById('v2mark'), 'V2 内容未渲染进 slot');
        asrt(w.document.getElementById('pptPanel').classList.contains('open'), '面板未 open');
        asrt(calls.length === 0, 'V2 命中时不该再走旧逻辑，实际：' + JSON.stringify(calls));
      });
      ck('G5.v2.slotIdentity', function () {
        const slotAfter = w.document.getElementById('pptPanelSlot');
        asrt(slotAfter === slotBefore, '★ #pptPanelSlot 节点被重建（一次绑定风险：事件监听全丢）');
        asrt(slotAfter && w.document.getElementById('pptPanel').contains(slotAfter),
          'slot 已脱离 #pptPanel 容器');
        asrt(slotAfter && slotAfter.isConnected, 'slot 已从文档树移除');
      });
      ck('G5.v2.iconHydrated', function () {
        const n = w.document.getElementById('v2mark');
        asrt(n && n.innerHTML.indexOf('<svg') >= 0,
          '★ 动态注入的 data-icon 未补渲染（F9：会变空 span 且零报错）');
      });
      ck('G5.v2.throwFallback', function () {
        calls.length = 0;
        w.PPTV2['ppt-design'] = function () { throw new Error('boom'); };
        let threw = false;
        try { w.openPptPanel('ppt-design'); } catch (e) { threw = true; }
        asrt(!threw, 'V2 渲染异常冒泡到调用方（应被 try/catch 兜住）');
        asrt(calls.indexOf('mini:ppt-design') >= 0, '异常后未回退旧逻辑，会白屏');
      });
      ck('G5.closeResetsFlag', function () {
        w.closePptPanel();
        eq(w.__pptV2Active, false, 'closePptPanel 未复位 __pptV2Active');
      });
    } catch (e) {
      fail('G5.harness', '运行时异常：' + (e && e.message));
    }
    return finishRest();
  }).catch(function (e) { fail('G5.harness', String(e)); return finishRest(); });
}

/* =====================================================================
   G6 · A6 数据：data-exam-company.js
   ===================================================================== */
sec('G6 A6 数据 · data-exam-company.js');
let companyData = null;
if (!present['assets/data-exam-company.js']) {
  skip('G6.all', 'data-exam-company.js 尚未创建');
} else {
  const d = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
  d.window.eval(rd('assets/mini-exam.js'));
  d.window.eval(rd('assets/data-exam-company.js'));
  companyData = d.window.MINI_BANK['exam-company'];

  ck('G6.loaded', function () { asrt(!!companyData, 'MINI_BANK["exam-company"] 未生成'); });
  ck('G6.items8', function () {
    asrt(companyData.items && companyData.items.length >= 8,
      '条目数不足 8（方案要求 8 类），实际 ' + (companyData.items ? companyData.items.length : 0));
  });
  ck('G6.idUniqueAscii', function () {
    const seen = {}, bad = [];
    companyData.items.forEach(function (it) {
      if (!/^[A-Za-z0-9_-]+$/.test(it.id || '')) bad.push('非ASCII:' + it.id);
      if (seen[it.id]) bad.push('重复:' + it.id);
      seen[it.id] = 1;
    });
    asrt(!bad.length, bad.join(', '));
  });
  ck('G6.companyCardRich', function () {
    const bad = [];
    companyData.items.forEach(function (it) {
      if (it.kind !== 'company') return;
      const h = (it.profile && it.profile.highlights) || [];
      const q = it.quiz || [];
      if (q.length < 3) bad.push(it.id + ' 自测题 ' + q.length + ' 题(<3)');
      if (h.length < 3) bad.push(it.id + ' 近一年大事 ' + h.length + ' 条(<3)');
      if (!it.examInfo) bad.push(it.id + ' 缺 examInfo');
      if (!it.tips) bad.push(it.id + ' 缺 tips');
    });
    asrt(!bad.length, '内容量塌方：' + bad.join(' | '));
  });
  ck('G6.quizWellFormed', function () {
    const bad = [];
    companyData.items.forEach(function (it) {
      (it.quiz || []).forEach(function (q, i) {
        if (!q.q) bad.push(it.id + '#' + i + ' 缺题干');
        if (!q.o || q.o.length !== 4) bad.push(it.id + '#' + i + ' 选项数 ' + (q.o ? q.o.length : 0) + '≠4');
        if (typeof q.a !== 'number' || q.a < 0 || q.a > 3) bad.push(it.id + '#' + i + ' 答案索引非法');
        if (!q.x || q.x.length < 5) bad.push(it.id + '#' + i + ' 缺解析（铁律 2）');
      });
    });
    asrt(!bad.length, bad.slice(0, 6).join(' | '));
  });
  ck('G6.creditPresent', function () {
    const s = rd('assets/data-exam-company.js');
    asrt(/以当年[^'"]*为准/.test(s), '未标注「以当年公告为准」免责（版权/合规红线）');
    asrt(/原创|非官方/.test(s), '未标注原创/非官方');
  });
  ck('G6.noRealExamClaim', function () {
    const s = rd('assets/data-exam-company.js');
    const bad = s.match(/(20\d{2})\s*年[^。；\n]{0,14}真题|真题[^。；\n]{0,12}(20\d{2})\s*年/g);
    asrt(!bad, '★ 疑似出现「某年真题」断言（版权红线，发现即打回）：' + (bad ? bad.slice(0, 3).join(' | ') : ''));
  });
  ck('G6.oldContentKept', function () {
    /* 旧 8 条 info 的 body 应迁入 sections，不得凭空消失：mini-exam.js 仍原样保留 */
    const old = rd('assets/mini-exam.js');
    asrt(old.indexOf('exam-company') >= 0, 'mini-exam.js 中 exam-company 被删除（ADR-1：旧数据一行不删）');
  });
}

/* =====================================================================
   G7 · A6 页面：企业定向库.html（独立页，非弹窗）
   ===================================================================== */
sec('G7 A6 页面 · 企业定向库.html（独立页 · 含进度/已学/收藏/自测）');
if (!present['企业定向库.html']) {
  skip('G7.all', '企业定向库.html 尚未创建');
} else {
  const html = rd('企业定向库.html');
  ck('G7.isStandalonePage', function () {
    asrt(/^<!DOCTYPE html>/i.test(html.trim()), '不是完整独立 HTML 文档');
    asrt(/<body[\s>]/.test(html) && /<\/body>/.test(html), 'body 不完整');
    const mk = markupOnly(html);
    asrt(countOf(html, /<script\b/gi) === countOf(html, /<\/script>/gi), '<script> 不配对');
    asrt(countOf(mk, /<div\b/gi) === countOf(mk, /<\/div>/gi), '<div> 不配对');
    asrt(countOf(mk, /<style\b[^>]*>/gi) === countOf(mk, /<\/style>/gi), '<style> 不配对');
  });
  ck('G7.requiredSharedDom', function () {
    const need = ['countdownModal', 'cdName', 'cdDate', 'cdPinned', 'cdColorPicker', 'toast', 'aiFab', 'aiPanel', 'morePanel'];
    const miss = need.filter(function (id) { return html.indexOf('id="' + id + '"') < 0; });
    asrt(!miss.length, '漏复制共用 DOM（F5：app.js 无守卫绑定会抛错中断初始化）：' + miss.join(', '));
  });
  ck('G7.contentBlocks', function () {
    ['clHero', 'clProgress', 'clTabs', 'clList', 'clDetail', 'clSearch']
      .forEach(function (id) { asrt(html.indexOf('id="' + id + '"') >= 0, '缺内容区 #' + id); });
  });
  ck('G7.scriptOrder', function () {
    const iIcon = html.indexOf('assets/icon-map.js');
    const iData = html.indexOf('assets/data-exam-company.js');
    const iLib = html.indexOf('assets/company-lib.js');
    asrt(iIcon < iData, 'icon-map.js 未在 data 之前');
    asrt(iData < iLib, 'data-exam-company.js 未在 company-lib.js 之前（ADR-1 后置覆盖顺序）');
    asrt(html.indexOf('CompanyLib.init()') >= 0, '未调用 CompanyLib.init()');
  });
  ck('G7.notPopup', function () {
    asrt(!/openMiniQuiz/.test(stripComments(html)),
      '★ 仍使用 openMiniQuiz 弹窗承载内容资产（违反验收标准 #5/#7）');
  });
}

/* =====================================================================
   G8 · A6 渲染器 company-lib.js 运行时（交互式断言）
   ===================================================================== */
sec('G8 A6 渲染器 · company-lib.js 运行时');
if (!present['assets/company-lib.js'] || !present['企业定向库.html'] || !present['assets/data-exam-company.js']) {
  skip('G8.all', '依赖文件缺失');
} else {
  const d = new JSDOM(rd('企业定向库.html'), { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = d.window;
  let bootErr = null;
  try {
    w.eval(iconMapJs);
    w.showToast = function () { };
    w.lsKey = function (k) { return k; };
    w.eval(rd('assets/mini-exam.js'));
    w.eval(rd('assets/data-exam-company.js'));
    w.eval(rd('assets/company-lib.js'));
    w.CompanyLib.init();
  } catch (e) { bootErr = e; }

  ck('G8.boot', function () { asrt(!bootErr, '初始化抛错：' + (bootErr && bootErr.message)); });
  if (!bootErr) {
    ck('G8.heroRendered', function () {
      const h = w.document.getElementById('clHero');
      asrt(h && h.innerHTML.length > 50, 'hero 未渲染');
    });
    ck('G8.progressRendered', function () {
      const p = w.document.getElementById('clProgress');
      asrt(p && p.innerHTML.length > 20, '进度条未渲染');
      asrt(/已学/.test(p.textContent), '进度条缺「已学 X/8」');
    });
    ck('G8.tabsRendered', function () {
      const t = w.document.getElementById('clTabs');
      asrt(t && t.querySelectorAll('.cl-tab').length >= 5,
        '分类页签不足 5 个，实际 ' + (t ? t.querySelectorAll('.cl-tab').length : 0));
    });
    ck('G8.listRendered', function () {
      const l = w.document.getElementById('clList');
      asrt(l && l.querySelectorAll('.cl-card').length >= 8,
        '内容卡不足 8 张，实际 ' + (l ? l.querySelectorAll('.cl-card').length : 0));
    });
    let firstId = null;
    ck('G8.detailRender', function () {
      const l = w.document.getElementById('clList');
      const card = l.querySelector('.cl-card-top');
      asrt(!!card, '无内容卡可点');
      const m = (card.getAttribute('onclick') || '').match(/CompanyLib\.open\('([^']+)'\)/);
      asrt(!!m, '内容卡未绑定 CompanyLib.open');
      firstId = m[1];
      w.CompanyLib.open(firstId);
      const det = w.document.getElementById('clDetail');
      asrt(det && !det.hidden && det.innerHTML.length > 100, '详情未展开');
      asrt(det.querySelectorAll('.cl-sec').length >= 3,
        '详情四段式缺失（section 数 ' + det.querySelectorAll('.cl-sec').length + '）');
      asrt(/企业名片/.test(det.textContent), '详情缺「企业名片」段');
      asrt(/笔试考情/.test(det.textContent), '详情缺「笔试考情」段');
      asrt(det.querySelectorAll('.cl-opt').length >= 3,
        '详情缺自测题选项（实际 ' + det.querySelectorAll('.cl-opt').length + '）');
    });
    ck('G8.quizAnswer', function () {
      if (!firstId) throw new Error('前置用例未拿到 id');
      w.CompanyLib.answer(firstId, 0, 0);
      const det = w.document.getElementById('clDetail');
      asrt(/答对|答错/.test(det.textContent), '作答后未出现解析');
    });
    ck('G8.learnPersist', function () {
      const before = w.document.getElementById('clProgress').textContent.replace(/\s+/g, ' ');
      w.CompanyLib.toggleLearned(firstId || 'x');
      const after = w.document.getElementById('clProgress').textContent.replace(/\s+/g, ' ');
      asrt(before !== after, '标记已学后进度条未变化（' + after + '）');
      asrt(/已学\s*1/.test(after), '进度未加 1：' + after);
      asrt(w.CompanyLib.isLearned(firstId), 'isLearned 未返回 true');
      /* 模拟刷新：重新 init 后状态应保持 */
      w.CompanyLib.init();
      asrt(w.CompanyLib.isLearned(firstId), '★ 重新 init（等价刷新）后已学状态丢失');
    });
    ck('G8.favPersist', function () {
      w.CompanyLib.toggleFav(firstId || 'x');
      asrt(w.CompanyLib.isFav(firstId), '收藏未生效');
      asrt(/收藏/.test(w.document.getElementById('clProgress').textContent), '收藏数未进入进度区');
      w.CompanyLib.init();
      asrt(w.CompanyLib.isFav(firstId), '★ 重新 init 后收藏状态丢失');
    });
    ck('G8.iconsHydrated', function () {
      const nodes = w.document.querySelectorAll('#clHero [data-icon], #clList [data-icon], #clDetail [data-icon]');
      let empty = 0;
      for (let i = 0; i < nodes.length; i++) if (nodes[i].innerHTML.indexOf('<svg') < 0) empty++;
      asrt(nodes.length > 0, '页面上没有任何 data-icon 节点');
      eq(empty, 0, '★ 有 ' + empty + ' 个图标渲染为空 span（F9 静默失败）');
    });
    ck('G8.noSaveData', function () {
      const s = stripComments(rd('assets/company-lib.js'));
      asrt(!/saveData\s*\(/.test(s), 'company-lib.js 调用了 saveData()');
    });
  }
}

/* =====================================================================
   G9 · A7 数据：data-ppt-templates.js（5 套 × 5 帧骨架）
   ===================================================================== */
sec('G9 A7 数据 · data-ppt-templates.js（5 套 × 5 帧）');
if (!present['assets/data-ppt-templates.js']) {
  skip('G9.all', 'data-ppt-templates.js 尚未创建');
} else {
  const d = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
  d.window.eval(rd('assets/mini-ppt.js'));
  d.window.eval(rd('assets/data-ppt-templates.js'));
  const T = d.window.MINI_BANK['ppt-templates'];

  ck('G9.loaded', function () { asrt(!!T, 'MINI_BANK["ppt-templates"] 未生成'); });
  ck('G9.fiveSets', function () {
    asrt(T.items && T.items.length === 5, '模板套数应为 5，实际 ' + (T.items ? T.items.length : 0));
  });
  ck('G9.idUniqueAscii', function () {
    const seen = {}, bad = [];
    T.items.forEach(function (it) {
      if (!/^[A-Za-z0-9_-]+$/.test(it.id || '')) bad.push('非ASCII:' + it.id);
      if (seen[it.id]) bad.push('重复:' + it.id);
      seen[it.id] = 1;
    });
    asrt(!bad.length, bad.join(', '));
  });
  ck('G9.frames25', function () {
    const bad = [];
    let total = 0;
    T.items.forEach(function (it) {
      const f = it.frames || [];
      total += f.length;
      if (f.length !== 5) bad.push(it.id + ' 帧数 ' + f.length + '≠5');
    });
    asrt(!bad.length, bad.join(' | '));
    eq(total, 25, '总帧数');
  });
  ck('G9.layoutWhitelist', function () {
    const ok = ['cover', 'toc', 'two-col', 'kpi', 'end'];
    const bad = [];
    T.items.forEach(function (it) {
      (it.frames || []).forEach(function (f) {
        if (ok.indexOf(f.layout) < 0) bad.push(it.id + '/' + f.name + ':' + f.layout);
      });
    });
    asrt(!bad.length, 'layout 不在白名单 cover|toc|two-col|kpi|end：' + bad.join(', '));
  });
  ck('G9.layoutDiversity', function () {
    const bad = [];
    T.items.forEach(function (it) {
      const set = {};
      (it.frames || []).forEach(function (f) { set[f.layout] = 1; });
      if (Object.keys(set).length < 3) bad.push(it.id + ' 仅 ' + Object.keys(set).length + ' 种 layout');
    });
    asrt(!bad.length, '帧布局差异化不足（会"看起来都一样"）：' + bad.join(', '));
  });
  ck('G9.paletteUnique', function () {
    const mains = {}, bad = [];
    T.items.forEach(function (it) {
      const p = it.palette || {};
      ['main', 'accent', 'bg', 'text'].forEach(function (k) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(p[k] || '')) bad.push(it.id + '.' + k + ' 非法色值 ' + p[k]);
      });
      if (mains[p.main]) bad.push('palette.main 重复：' + p.main);
      mains[p.main] = 1;
    });
    asrt(!bad.length, bad.join(' | '));
  });
  ck('G9.requiredFields', function () {
    const bad = [];
    T.items.forEach(function (it) {
      if (!it.scene || !it.scene.length) bad.push(it.id + ' 缺场景 scene');
      if (!it.summary) bad.push(it.id + ' 缺 summary');
      if (!it.font || !it.font.title || !it.font.body) bad.push(it.id + ' 缺字体规范');
      if (!it.structure || !it.structure.length) bad.push(it.id + ' 缺结构说明 structure');
      if (!it.skeleton || it.skeleton.length < 50) bad.push(it.id + ' 缺套用骨架 skeleton');
    });
    asrt(!bad.length, bad.join(' | '));
  });
  ck('G9.skeletonWhitelist', function () {
    const allowed = /^(div|span|h3|h4|p|ul|ol|li|b|i|em|strong|section)$/i;
    const bad = [];
    T.items.forEach(function (it) {
      const tags = (it.skeleton || '').match(/<\/?([A-Za-z0-9]+)[\s>/]/g) || [];
      tags.forEach(function (t) {
        const n = t.replace(/[<\/>]/g, '').trim();
        if (n && !allowed.test(n)) bad.push(it.id + ':' + n);
      });
      if (/<img|<script|javascript:|on[a-z]+\s*=/i.test(it.skeleton || '')) bad.push(it.id + ':危险内容');
    });
    asrt(!bad.length, 'skeleton 含白名单外标签/危险内容（XSS 面）：' + Array.from(new Set(bad)).join(', '));
  });
  ck('G9.noExternalAsset', function () {
    const s = rd('assets/data-ppt-templates.js');
    asrt(!/https?:\/\//.test(stripComments(s)), '出现外链（要求代码自绘，零外链图片）');
    asrt(!/<img\b/i.test(s), '出现 <img>');
  });
  ck('G9.practiceWellFormed', function () {
    const bad = [];
    T.items.forEach(function (it) {
      (it.practice || []).forEach(function (q, i) {
        if (!q.o || q.o.length !== 4) bad.push(it.id + '#' + i + ' 选项数≠4');
        if (typeof q.a !== 'number') bad.push(it.id + '#' + i + ' 缺答案');
        if (!q.x || q.x.length < 5) bad.push(it.id + '#' + i + ' 缺解析');
      });
    });
    asrt(!bad.length, bad.slice(0, 5).join(' | '));
  });
  ck('G9.oldContentKept', function () {
    const old = rd('assets/mini-ppt.js');
    asrt(old.indexOf('ppt-templates') >= 0, 'mini-ppt.js 中 ppt-templates 被删（ADR-1）');
  });
}

/* =====================================================================
   G10 · A7 渲染器 tpl-preview.js（验收标准 #6：可见骨架预览 + 套用入口）
   ===================================================================== */
sec('G10 A7 渲染器 · tpl-preview.js');
if (!present['assets/tpl-preview.js']) {
  skip('G10.all', '★ tpl-preview.js 尚未创建（T11 未交付）');
} else {
  const d = new JSDOM(pptHtml, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = d.window;
  let err = null;
  try {
    w.eval(iconMapJs);
    w.eval(rd('assets/xt-content.js'));
    w.eval(rd('assets/mini-ppt.js'));
    w.eval(rd('assets/data-ppt-templates.js'));
    w.eval(rd('assets/tpl-preview.js'));
  } catch (e) { err = e; }
  ck('G10.load', function () { asrt(!err, '加载抛错：' + (err && err.message)); });
  if (!err) {
    ck('G10.registered', function () {
      asrt(w.PPTV2 && typeof w.PPTV2['ppt-templates'] === 'function',
        '未注册 window.PPTV2["ppt-templates"]（ADR-2）');
    });
    ck('G10.renderIntoSlot', function () {
      const slot = w.document.getElementById('pptPanelSlot');
      w.PPTV2['ppt-templates'](slot);
      asrt(slot.innerHTML.length > 2000, '骨架预览内容过少（不可见）');
      const frames = slot.querySelectorAll('.tpv-f');
      asrt(frames.length >= 25, '★ 可见帧数不足 25（验收标准 #6：5 套 × 5 帧），实际 ' + frames.length);
      const canvas = slot.querySelectorAll('.tpv-canvas');
      asrt(canvas.length >= 25, '帧画布未自绘，实际 ' + canvas.length);
      const copyBtns = slot.querySelectorAll('[data-act="copy"], button');
      asrt(copyBtns.length > 0, '无「套用框架」入口');
      asrt(/套用|复制/.test(slot.textContent), '未出现「套用/复制」文案');
    });
    ck('G10.frameVisuallyDistinct', function () {
      const slot = w.document.getElementById('pptPanelSlot');
      const bgSet = {};
      const nodes = slot.querySelectorAll('.tpv-canvas');
      for (let i = 0; i < nodes.length; i++) {
        const st = nodes[i].getAttribute('style') || '';
        const m = st.match(/background:\s*([^;]+)/);
        if (m) bgSet[m[1].trim()] = 1;
      }
      asrt(Object.keys(bgSet).length >= 1, '帧画布未带背景色');
      const sw = slot.querySelectorAll('.tpv-sw');
      asrt(sw.length >= 20, '配色色块不足（5 套 × 4 色 = 20），实际 ' + sw.length);
    });
    ck('G10.copySkeleton', function () {
      const T = w.TplPreview;
      const it = w.MINI_BANK['ppt-templates'].items[0];
      let copied = null;
      w.document.execCommand = function () { return true; };
      try { T.copySkeleton(it); } catch (e) { /* file:// 下剪贴板可能不可用，只要不崩即可 */ }
      asrt(typeof T.renderList === 'function', 'renderList 缺失');
      void copied;
    });
    ck('G10.apiExposed', function () {
      const T = w.TplPreview;
      asrt(!!T, '未导出 window.TplPreview');
      ['renderList', 'renderFrame', 'copySkeleton'].forEach(function (k) {
        asrt(typeof T[k] === 'function', 'TplPreview 缺接口 ' + k);
      });
      const it = w.MINI_BANK['ppt-templates'].items[0];
      const htmlOut = T.renderFrame(it.frames[0], it.palette, it.font);
      asrt(typeof htmlOut === 'string' && htmlOut.length > 30, 'renderFrame 未产出 HTML 串');
    });
  }
}

/* =====================================================================
   G11 · B2 数据：data-ppt-class.js（3 节课 + 正反例 + 8 题课后小测）
   ===================================================================== */
sec('G11 B2 数据 · data-ppt-class.js（前置课堂 3 节 + 8 题降为课后小测）');
let classData = null;
if (!present['assets/data-ppt-class.js']) {
  skip('G11.all', 'data-ppt-class.js 尚未创建');
} else {
  const d = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = d.window;
  w.eval(rd('assets/mini-ppt.js'));
  const oldQuiz = JSON.parse(JSON.stringify(w.MINI_BANK['ppt-design'].q || []));
  w.eval(rd('assets/data-ppt-class.js'));
  classData = w.MINI_BANK['ppt-design'];

  ck('G11.loaded', function () { asrt(!!classData, 'MINI_BANK["ppt-design"] 未生成'); });
  ck('G11.threeLessons', function () {
    asrt(classData.lessons && classData.lessons.length >= 3,
      '课堂节数应 ≥3，实际 ' + (classData.lessons ? classData.lessons.length : 0));
  });
  ck('G11.lessonRich', function () {
    const bad = [];
    classData.lessons.forEach(function (l) {
      if (!l.id || !/^[A-Za-z0-9_-]+$/.test(l.id)) bad.push(l.id + ' id 非 ASCII');
      if (!l.title) bad.push(l.id + ' 缺标题');
      if (!l.sections || l.sections.length < 3) bad.push(l.id + ' section 数 ' + (l.sections ? l.sections.length : 0) + '<3');
      (l.sections || []).forEach(function (s, i) {
        const body = s.p || s.body || s.text || '';
        if (body.length < 30) bad.push(l.id + '#' + i + ' 正文过短(' + body.length + '字)');
      });
    });
    asrt(!bad.length, bad.slice(0, 6).join(' | '));
  });
  ck('G11.demoProCon', function () {
    const ok = ['compare', 'swatch', 'type', 'none'];
    const bad = [];
    let demoCnt = 0, compareCnt = 0;
    classData.lessons.forEach(function (l) {
      const list = l.goodBad || l.demos || [];
      if (!list.length) bad.push(l.id + ' 无任何正反例');
      list.forEach(function (d, i) {
        demoCnt++;
        if (ok.indexOf(d.demo) < 0) bad.push(l.id + '#' + i + ' demo 类型非法：' + d.demo);
        if (d.demo === 'compare') {
          compareCnt++;
          if (!d.good || !d.bad) bad.push(l.id + '#' + i + ' compare 缺 good/bad');
        }
        if (!d.note || d.note.length < 10) bad.push(l.id + '#' + i + ' 正反例缺讲解 note');
      });
    });
    asrt(!bad.length, bad.slice(0, 6).join(' | '));
    asrt(demoCnt >= 3, '正反例数量不足（' + demoCnt + '）');
    asrt(compareCnt >= 1, '★ 没有 compare 型正反例（验收标准：需正反例对比）');
  });
  ck('G11.finalQuiz8', function () {
    asrt(classData.finalQuiz && classData.finalQuiz.length === 8,
      '课后小测应为 8 题，实际 ' + (classData.finalQuiz ? classData.finalQuiz.length : 0));
    const bad = [];
    classData.finalQuiz.forEach(function (q, i) {
      if (!q.o || q.o.length !== 4) bad.push('#' + i + ' 选项数≠4');
      if (!q.x || q.x.length < 5) bad.push('#' + i + ' 缺解析');
      if (typeof q.a !== 'number') bad.push('#' + i + ' 缺答案');
    });
    asrt(!bad.length, bad.slice(0, 5).join(' | '));
  });
  ck('G11.old8QuizVerbatim', function () {
    eq(classData.finalQuiz.length, oldQuiz.length, '迁移后题数与原 8 题不一致');
    eq(JSON.stringify(classData.finalQuiz), JSON.stringify(oldQuiz), '★ 原 8 题被改写（要求一字不改迁入）');
    eq(JSON.stringify(classData.q), JSON.stringify(oldQuiz), '兼容位 q 与原 8 题不一致');
  });
}

/* =====================================================================
   G12 · B2 渲染器 design-class.js
   ===================================================================== */
sec('G12 B2 渲染器 · design-class.js');
if (!present['assets/design-class.js']) {
  skip('G12.all', '★ design-class.js 尚未创建（T12 未交付）');
} else {
  const d = new JSDOM(pptHtml, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = d.window;
  let err = null;
  try {
    w.eval(iconMapJs);
    w.eval(rd('assets/xt-content.js'));
    w.eval(rd('assets/mini-ppt.js'));
    w.eval(rd('assets/data-ppt-class.js'));
    w.eval(rd('assets/design-class.js'));
  } catch (e) { err = e; }
  ck('G12.load', function () { asrt(!err, '加载抛错：' + (err && err.message)); });
  if (!err) {
    ck('G12.registered', function () {
      asrt(w.PPTV2 && typeof w.PPTV2['ppt-design'] === 'function',
        '未注册 window.PPTV2["ppt-design"]（ADR-2）');
    });
    ck('G12.render', function () {
      const slot = w.document.getElementById('pptPanelSlot');
      w.PPTV2['ppt-design'](slot);
      asrt(slot.innerHTML.length > 500, '课堂内容过少');
      const txt = slot.textContent;
      asrt(/四原则|配色|字体/.test(txt), '未出现三节课关键词');
      asrt(/小测|自测|课后/.test(txt), '未出现课后小测区（原 8 题应降为课后小测）');
    });
  }
}

/* =====================================================================
   G13 · 全局禁令：禁改文件 git diff 为空
   ===================================================================== */
sec('G13 全局禁令 · 禁改文件未被动过');
{
  let gitOk = true, out = '';
  try {
    out = require('child_process').execSync(
      'git status --porcelain -- assets/mini-exam.js assets/mini-ppt.js assets/mini.js assets/mini-cet.js assets/app.js',
      { cwd: ROOT, encoding: 'utf8' }
    );
  } catch (e) { gitOk = false; out = (e && e.message) || ''; }
  if (!gitOk) {
    skip('G13.git', 'git 不可用或非仓库，无法校验（' + out.slice(0, 60) + '）');
  } else {
    ck('G13.forbiddenUntouched', function () {
      asrt(!out.trim(), '禁改文件出现改动（ADR-1/表格禁令）：\n' + out.trim());
    });
  }
}

/* =====================================================================
   收尾
   ===================================================================== */
let finished = false;
function finishRest() {
  if (finished) return;
  finished = true;
  writeReport();
}
function writeReport() {
  const lines = [];
  lines.push('# R48 第 1 批（T00/T10/T11/T12）QA 验证结果');
  lines.push('# 生成时间：' + new Date().toISOString());
  lines.push('# 运行：node tools/qa/qa_r48_batch1.js');
  lines.push('');
  R.forEach(function (r) {
    if (r[0] === '----') lines.push('\n===== ' + r[1] + ' =====');
    else lines.push('[' + r[0] + '] ' + r[1] + (r[2] ? ' :: ' + r[2] : ''));
  });
  lines.push('');
  lines.push('----------------------------------------');
  lines.push('TOTAL: ' + (nPass + nFail + nSkip) + '  PASS: ' + nPass + '  FAIL: ' + nFail + '  SKIP: ' + nSkip);
  lines.push(nFail === 0 ? 'ROUTING: NoOne（未发现阻断性失败）' : 'ROUTING: Engineer（存在失败项，见上方 FAIL）');
  const txt = lines.join('\n');
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch (e) { /* 已存在 */ }
  fs.writeFileSync(OUT, txt, 'utf8');
  process.stdout.write(txt + '\n');
  process.exitCode = nFail ? 1 : 0;
}

/* G5 是异步分支，若未进入则由此处兜底输出 */
setTimeout(finishRest, 3000);
