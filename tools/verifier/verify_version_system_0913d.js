/**
 * 批次五 T04（2026-09）：版本体系 0913d 回归验证（jsdom 真跑）
 * ---------------------------------------------------------------------------
 * 覆盖（真跑，不只静态扫）：
 *   A1  voiceplayer.js 真跑（jsdom IIFE 执行）→ fetch 收到底带 ?v= 的 listening 路径
 *   A2  app.js 真跑 → fetch 收到 EXAM_BANK_LEGACY / EXAM_BANK_EXT_INDEX / VOCAB_EXT_INDEX 三处均带 ?v=
 *   A3  vocab 索引 JSON 每个 shards[].file 都带 ?v=
 *   A4  exam  索引 JSON 的 legacy.file 与每个 shards[].file 都带 ?v=
 *   B1  HTML ?v= 取值 ⊆ {20260913g, 20260913a}（5 个不加载 app.js 的页面保留 a）
 *   B2  无损坏签名（?v= 到闭合引号之间恰好是版本号）
 *   C1  注释/正文里的提及（第①步 COMMENTED/prose）未被误加 ?v=（按行比对 5 条）
 *   C2  全站资源外链仍为 0
 *
 * 用法：node tools/verifier/verify_version_system_0913d.js
 * 依赖：jsdom（NODE_PATH=C:\Users\ATM\node_modules）
 * 退出码：0=全部通过，1=存在失败断言
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const VER = '20260913g';
const PREV = '20260913a';
const KEEP_OLD = ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html', '好友申请.html', '登录.html'];

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}

// ---------------------------------------------------------------------------
// jsdom 真跑辅助：加载一个脚本文件，录制其运行时 fetch 的 URL
// ---------------------------------------------------------------------------
let JSDOM = null;
let jsdomErr = null;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  jsdomErr = e;
}

function makeWindow() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
    { runScripts: 'outside-only', url: 'http://localhost/' });
  const win = dom.window;
  // 最小 shim：避免 app.js/voiceplayer.js 因环境 API 缺失提前抛错
  win.matchMedia = win.matchMedia || function () {
    return { matches: false, addListener: function () { }, removeListener: function () { }, addEventListener: function () { } };
  };
  if (!win.speechSynthesis) {
    win.speechSynthesis = { speak: function () { }, cancel: function () { }, getVoices: function () { return []; } };
  }
  win.SpeechSynthesisUtterance = win.SpeechSynthesisUtterance || function () { };
  win.alert = function () { };
  win.scrollTo = function () { };
  return win;
}

function runScript(rel) {
  const win = makeWindow();
  const calls = [];
  win.fetch = function (u) {
    calls.push(String(u));
    return Promise.resolve({ ok: false, json: function () { return Promise.resolve(null); } });
  };
  let err = null;
  try {
    win.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (e) {
    err = e;
  }
  return { calls: calls, err: err };
}

// ---------------------------------------------------------------------------
// A1  voiceplayer.js 真跑
// ---------------------------------------------------------------------------
if (!JSDOM) {
  assert('A0 jsdom 可用（可用于真跑）', false, 'jsdom 载入失败：' + (jsdomErr && jsdomErr.message));
} else {
  assert('A0 jsdom 可用（可用于真跑）', true, '');
}

let vpCalls = [];
if (JSDOM) {
  const vp = runScript('assets/voiceplayer.js');
  vpCalls = vp.calls;
  const hit = vpCalls.filter(function (u) { return /^assets\/data\/listening-ext\.json\?v=/.test(u); });
  assert('A1 voiceplayer.js 真跑 fetch 到带 ?v= 的 listening 路径',
    hit.length === 1 && hit[0] === 'assets/data/listening-ext.json?v=' + VER,
    'err=' + (vp.err ? vp.err.message : '无') + ' ; calls=[' + vpCalls.join(', ') + ']');
}

// ---------------------------------------------------------------------------
// A2  app.js 真跑
// ---------------------------------------------------------------------------
if (JSDOM) {
  const app = runScript('assets/app.js');
  const need = [
    ['EXAM_BANK_LEGACY', 'assets/data/exam-bank.json?v=' + VER],
    ['EXAM_BANK_EXT_INDEX', 'assets/data/exam-bank-ext-index.json?v=' + VER],
    ['VOCAB_EXT_INDEX', 'assets/data/vocab-cet4-ext-index.json?v=' + VER],
  ];
  const missing = need.filter(function (n) { return app.calls.indexOf(n[1]) < 0; });
  assert('A2 app.js 真跑 fetch 到 3 处数据索引/覆盖层（均带 ?v=）', missing.length === 0,
    'err=' + (app.err ? app.err.message : '无') +
    ' ; missing=[' + missing.map(function (m) { return m[0]; }).join(', ') + ']' +
    ' ; calls=[' + app.calls.join(', ') + ']');
}

// ---------------------------------------------------------------------------
// A3 / A4  索引 JSON 的 file 字段
// ---------------------------------------------------------------------------
function readJson(rel) {
  try {
    return { j: JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')), err: null };
  } catch (e) {
    return { j: null, err: e };
  }
}

(function () {
  const r = readJson('assets/data/vocab-cet4-ext-index.json');
  if (r.err) { assert('A3 vocab 索引 JSON 可解析', false, r.err.message); return; }
  const files = (r.j.shards || []).map(function (s) { return s.file; });
  const bad = files.filter(function (f) { return !/\?v=/.test(f); });
  assert('A3 vocab 索引 8 条 shards[].file 均带 ?v=',
    files.length === 8 && bad.length === 0,
    'files=' + files.length + ' ; 未带=' + bad.join(','));
})();

(function () {
  const r = readJson('assets/data/exam-bank-ext-index.json');
  if (r.err) { assert('A4 exam 索引 JSON 可解析', false, r.err.message); return; }
  const files = [];
  if (r.j.legacy && r.j.legacy.file) files.push(r.j.legacy.file);
  (r.j.shards || []).forEach(function (s) { files.push(s.file); });
  const bad = files.filter(function (f) { return !/\?v=/.test(f); });
  assert('A4 exam 索引 legacy.file + 14 条 shards[].file 均带 ?v=',
    files.length === 15 && bad.length === 0,
    'files=' + files.length + ' ; 未带=' + bad.join(','));
})();

// ---------------------------------------------------------------------------
// B1 / B2  HTML ?v= 取值 & 损坏签名
// ---------------------------------------------------------------------------
const pages = fs.readdirSync(ROOT).filter(function (f) { return f.toLowerCase().endsWith('.html'); }).sort();
const pageTokens = {};
pages.forEach(function (p) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const toks = [];
  const re = /\?v=([^"'\s>]*)(["'\s>])/g;
  let m;
  while ((m = re.exec(html)) !== null) toks.push(m[1]);
  pageTokens[p] = Array.from(new Set(toks));
});
const illegal = Object.keys(pageTokens).filter(function (p) {
  return pageTokens[p].some(function (t) { return t !== VER && t !== PREV; });
});
assert('B1 HTML ?v= 取值 ⊆ {' + VER + ', ' + PREV + '}', illegal.length === 0,
  illegal.map(function (p) { return p + '=' + pageTokens[p].join('|'); }).join(' ; '));

const corrupt = [];
Object.keys(pageTokens).forEach(function (p) {
  pageTokens[p].forEach(function (t) { if (t !== VER && t !== PREV) corrupt.push(p + ' token="' + t + '"'); });
});
assert('B2 无损坏签名（?v= 到引号之间恰好是版本号）', corrupt.length === 0, corrupt.join(' | '));

// ---------------------------------------------------------------------------
// C1  注释/正文提及未被误改（按行比对 5 条）
// ---------------------------------------------------------------------------
const samples = [
  { file: '学习工作台.html', line: 78, must: 'assets/app.js' },       // HTML 注释
  { file: 'assets/app.js', line: 370, must: 'exam-bank.json' },        // JS 块注释
  { file: '设置.html', line: 1268, must: 'assets/config.js' },         // JS 块注释
  { file: 'mock_exam.html', line: 292, must: 'data/mock-papers.js' },  // 错误提示正文
  { file: '设置.html', line: 1238, must: 'assets/api.js' },            // 错误提示正文
];
const c1bad = [];
samples.forEach(function (s) {
  let lines;
  try { lines = fs.readFileSync(path.join(ROOT, s.file), 'utf8').split(/\r?\n/); }
  catch (e) { c1bad.push(s.file + ' 读取失败'); return; }
  const ln = lines[s.line - 1];
  if (ln === undefined) { c1bad.push(s.file + ':' + s.line + ' 行不存在'); return; }
  if (ln.indexOf(s.must) < 0) { c1bad.push(s.file + ':' + s.line + ' 丢失 "' + s.must + '"'); return; }
  // 关键：该提及处不得被加入 ?v=
  if (ln.indexOf(s.must + '?v=') >= 0) c1bad.push(s.file + ':' + s.line + ' 被误加 ?v=');
});
assert('C1 注释/正文里的 5 条提及未被误加 ?v=（按行比对）', c1bad.length === 0, c1bad.join(' | '));

// ---------------------------------------------------------------------------
// C2  全站资源外链仍为 0
// ---------------------------------------------------------------------------
const extHits = [];
pages.forEach(function (p) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const re = /<(script|link|img|source|audio|video)\b[^>]*?\b(?:src|href)\s*=\s*(["'])((?:https?:)?\/\/[^"']*)\2/gi;
  let m;
  while ((m = re.exec(html)) !== null) extHits.push(p + ' → ' + m[3]);
});
assert('C2 全站资源外链为 0（script/link/img/media 的 src|href 无 http(s):// 或 //）',
  extHits.length === 0, extHits.slice(0, 5).join(' | '));

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
const pass = results.filter(function (r) { return r.ok; }).length;
const failed = results.filter(function (r) { return !r.ok; });
const lines = [];
lines.push('============================================================');
lines.push('批次五 T04 版本体系 0913d 回归（jsdom 真跑）');
lines.push('项目根：' + ROOT);
lines.push('============================================================');
results.forEach(function (r, i) {
  lines.push((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name +
    (r.ok ? '' : '   →   ' + r.detail));
});
lines.push('------------------------------------------------------------');
lines.push('voiceplayer.js 运行时 fetch: [' + vpCalls.join(', ') + ']');
lines.push('============================================================');
lines.push('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
lines.push('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
const txt = lines.join('\n');
console.log(txt);
try {
  fs.mkdirSync(path.join(ROOT, 'tools', 'qa'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', '_verify_version_system_0913d.txt'), txt + '\n', 'utf8');
} catch (e) { /* 忽略 */ }
process.exit(failed.length === 0 ? 0 : 1);
