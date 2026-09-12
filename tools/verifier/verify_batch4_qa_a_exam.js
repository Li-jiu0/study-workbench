/**
 * 批次四 QA 独立验证 · A. 统一题库入口（消除双源）证伪脚本
 * ---------------------------------------------------------------------------
 * 独立于工程师自跑脚本，用新眼睛构造边界用例证伪：
 *   A1 jsdom 真实加载：合并后 EXAM_BANK 总数 = 300，id 全局唯一
 *   A2 逐题比对：
 *        · id 1–10 / 41–44 与磁盘 exam-bank.json 逐字段一致（覆盖层）
 *        · 其余 id 1–60 与「离线基线（屏蔽所有 JSON 只留内置）」逐字段一致
 *   A3 覆盖能力保留：假覆盖层含 id=5(<101) 必须真覆盖内置；id=9999 必须追加
 *   A4 守卫仍生效：增量分片里 id=50(<101)/已存在 id 跳过；全新 id 9001 正常 push
 *   A5 不写盘：触发 loadExamBankExt() 后 saveData 调用 0 次
 *   A6 索引健壮性：每个 file 真实存在 / legacy 指向存在 / count 之和 = 240 / 无中文文件名
 *   A7 旧独立 fetch 块删除后 exam-bank.json 仍被请求（无「数据彻底不加载」回归）
 *
 * 用法：node tools/verifier/verify_batch4_qa_a_exam.js
 * 退出码：0=全部通过；1=有失败断言。结果同时写入同目录 _qa_a_out.txt
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'assets', 'data');
const PAGE = path.join(ROOT, '学习工作台.html');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { ({ JSDOM, VirtualConsole } = require('c:/Users/ATM/node_modules/jsdom')); }

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
const L = [];
function log(s) { L.push(s); }

// =========================================================================
// A6. 索引健壮性（静态检查）
// =========================================================================
const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'exam-bank-ext-index.json'), 'utf8'));

const missingFiles = [], nonAscii = [], countMismatch = [];
let sumCount = 0;
(idx.shards || []).forEach(function (s) {
  const rel = String(s.file || '');
  sumCount += Number(s.count) || 0;
  if (/[^\x00-\x7F]/.test(rel)) nonAscii.push(rel);
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { missingFiles.push(rel); return; }
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const n = Array.isArray(j.questions) ? j.questions.length : -1;
  if (n !== s.count) countMismatch.push(rel + ' 声明' + s.count + ' 实际' + n);
});
assert('A6-a 索引每个 shard.file 在磁盘真实存在', missingFiles.length === 0, missingFiles.join(' | '));
assert('A6-b 索引无中文/非 ASCII 文件名', nonAscii.length === 0, nonAscii.join(' | '));
assert('A6-c 索引 shards count 之和 = 240', sumCount === 240, '实际 ' + sumCount);
assert('A6-d 每个分片声明条数 = 实际条数', countMismatch.length === 0, countMismatch.join(' | '));

// legacy 字段指向的文件必须存在
const legacyFile = (idx.legacy && typeof idx.legacy === 'object') ? idx.legacy.file : idx.legacy;
assert('A6-e 索引 legacy 字段存在且指向磁盘真实文件',
  typeof legacyFile === 'string' && fs.existsSync(path.join(ROOT, legacyFile)),
  'legacy=' + String(legacyFile));

// 磁盘上 exam-bank.json 的 id 集合（覆盖层）
const legacyJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/exam-bank.json'), 'utf8'));
const legacyQs = Array.isArray(legacyJson.questions) ? legacyJson.questions : [];
const legacyIds = new Set(legacyQs.map(function (q) { return q.id; }));
assert('A6-f exam-bank.json 覆盖层 id = {1–10, 41–44}（14 题）',
  legacyQs.length === 14 && [1,2,3,4,5,6,7,8,9,10,41,42,43,44].every(function (i) { return legacyIds.has(i); }),
  '实际 ' + legacyQs.length + ' 题，ids=' + Array.from(legacyIds).join(','));

// =========================================================================
// jsdom 装配
// =========================================================================
const rawHtml = fs.readFileSync(PAGE, 'utf8');
const SRC_RE = /<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const html = rawHtml.replace(SRC_RE, function (m, src) {
  const rel = String(src).split('?')[0];
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return '<!-- 脚本缺失：' + rel + ' -->';
  const code = fs.readFileSync(fp, 'utf8');
  return '<script>\n' + code + '\n</script>';
});

// 假覆盖层（override 模式）：id=5 改写内置 + id=9999 全新追加
const FAKE_OVERRIDE_URL = 'assets/data/__qa_fake_override.json';
const FAKE_OVERRIDE = {
  questions: [
    { id: 5, type: 'QA', sub: 'override', diff: 1, q: 'OVERRIDE_MARKER_ID5', o: ['x', 'y', 'z', 'w'], a: 3, x: 'qa', tip: 'qa' },
    { id: 9999, type: 'QA', sub: 'override', diff: 1, q: 'OVERRIDE_MARKER_ID9999_NEW', o: ['x', 'y', 'z', 'w'], a: 0, x: 'qa', tip: 'qa' }
  ]
};
// 守卫分片（增量模式）：id=50(<101) 跳过、id=301(已存在) 跳过、id=9001(全新) push
const GUARD_URL = 'assets/data/__qa_guard_b4.json';
const GUARD_PAYLOAD = {
  questions: [
    { id: 50, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID50', o: ['a', 'b', 'c', 'd'], a: 0, x: 'qa', tip: 'qa' },
    { id: 301, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID301_DUP', o: ['a', 'b', 'c', 'd'], a: 0, x: 'qa', tip: 'qa' },
    { id: 9001, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID9001_NEW', o: ['a', 'b', 'c', 'd'], a: 0, x: 'qa', tip: 'qa' }
  ]
};

const PROBE = [
  '<script>',
  '(function () {',
  '  window.__qaSaveCalls = 0;',
  '  var __origSaveData = (typeof saveData === "function") ? saveData : function () {};',
  '  try { saveData = function () { window.__qaSaveCalls++; return __origSaveData.apply(null, arguments); }; } catch (e) {}',
  '  window.__QA = {',
  '    bank: function () { return EXAM_BANK; },',
  '    bankLen: function () { return EXAM_BANK.length; },',
  '    loadExamBankExt: function () { return loadExamBankExt(); },',
  '    loadExamBankShard: function (u, ov) { return loadExamBankShard(u, ov); },',
  '    saveCalls: function () { return window.__qaSaveCalls; },',
  '    resetSaveCalls: function () { window.__qaSaveCalls = 0; }',
  '  };',
  '})();',
  '</script>'
].join('\n');

function makeRes(obj) {
  return {
    ok: true, status: 200,
    json: function () { return Promise.resolve(obj); },
    text: function () { return Promise.resolve(JSON.stringify(obj)); }
  };
}

// mode: 'online' 正常；'offline' 屏蔽所有 JSON 请求（含 exam-bank.json / 分片）→ 只留内置 60
function boot(mode) {
  const uncaught = [], fetched = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
  function fetchStub(u) {
    const url = String(u === undefined || u === null ? '' : u);
    fetched.push(url.split('?')[0]);
    return Promise.resolve().then(function () {
      if (url.indexOf('__qa_fake_override') >= 0) return makeRes(FAKE_OVERRIDE);
      if (url.indexOf('__qa_guard_b4') >= 0) return makeRes(GUARD_PAYLOAD);
      const rel = url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
      if (mode === 'offline') {
        return { ok: false, status: 404, json: function () { return Promise.reject(new Error('offline 404 ' + rel)); } };
      }
      const fp = path.join(ROOT, rel);
      if (fp.indexOf(ROOT) !== 0 || !fs.existsSync(fp)) {
        return { ok: false, status: 404, json: function () { return Promise.reject(new Error('404 ' + rel)); } };
      }
      return makeRes(JSON.parse(fs.readFileSync(fp, 'utf8')));
    });
  }
  const dom = new JSDOM(html.indexOf('</body>') >= 0 ? html.replace(/<\/body>/i, PROBE + '\n</body>') : html + PROBE, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse: function (window) {
      window.fetch = fetchStub;
      try { window.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() })); } catch (e) {}
      window.addEventListener('error', function (e) { uncaught.push('[window.error] ' + ((e && e.message) || 'unknown')); });
      window.addEventListener('unhandledrejection', function (e) { uncaught.push('[unhandledrejection] ' + String(e && e.reason)); });
    }
  });
  return { dom: dom, win: dom.window, uncaught: uncaught, fetched: fetched };
}

function finalize() {
  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });
  log('');
  log('============================================================');
  log('批次四 QA 独立验证 · A. 统一题库入口（消除双源）');
  log('项目根：' + ROOT);
  log('============================================================');
  results.forEach(function (r, i) {
    log((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name + (r.ok ? '' : '   →   ' + r.detail));
  });
  log('============================================================');
  log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  log('============================================================');
  const txt = L.join('\n');
  try { fs.writeFileSync(path.join(__dirname, '_qa_a_out.txt'), txt + '\n', 'utf8'); } catch (e) {}
  console.log(txt);
  process.exit(failed.length === 0 ? 0 : 1);
}

(async function main() {
  // ---- 离线基线：屏蔽所有 JSON，只留内置 60 ----
  const off = boot('offline');
  await sleep(600);
  const offQA = off.win.__QA;
  const baseline = {};
  if (offQA) offQA.bank().forEach(function (q) { baseline[q.id] = JSON.parse(JSON.stringify(q)); });
  const baselineLen = offQA ? offQA.bankLen() : -1;
  off.dom.window.close();

  // ---- 在线：真实加载 legacy 覆盖层 + 14 分片 ----
  const on = boot('online');
  await sleep(1000);
  const QA = on.win.__QA;
  assert('A0 探针注入成功（页面脚本整体可执行）', !!QA, QA ? '' : 'window.__QA 未定义');
  if (!QA) { finalize(); return; }

  const bank = QA.bank();
  assert('A1-a 合并后 EXAM_BANK 总数 = 300（内置 60 + 增量 240）', QA.bankLen() === 300, '实际 ' + QA.bankLen());
  const allIds = bank.map(function (q) { return q.id; });
  assert('A1-b 合并后 id 全局唯一（无重复）', new Set(allIds).size === allIds.length,
    '去重 ' + new Set(allIds).size + ' / 原始 ' + allIds.length);

  // ---- A2 逐题比对 ----
  const byId = {};
  bank.forEach(function (q) { if (byId[q.id] === undefined) byId[q.id] = q; });
  const OVERRIDE = new Set([1,2,3,4,5,6,7,8,9,10,41,42,43,44]);
  const FILE_MAP = {};
  legacyQs.forEach(function (q) { FILE_MAP[q.id] = q; });

  // A2-a: 覆盖层 id 1–10/41–44 与磁盘 exam-bank.json 逐字段一致
  const a2a = [];
  OVERRIDE.forEach(function (id) {
    const cur = byId[id], src = FILE_MAP[id];
    if (!cur) { a2a.push('id=' + id + ' 丢失'); return; }
    ['q', 'a'].forEach(function (f) {
      if (cur[f] !== src[f]) a2a.push('id=' + id + '.' + f + ' 不一致');
    });
    if (JSON.stringify(cur.o) !== JSON.stringify(src.o)) a2a.push('id=' + id + '.o 不一致');
    if (cur.type !== src.type) a2a.push('id=' + id + '.type 不一致');
  });
  assert('A2-a 覆盖层 id 1–10/41–44 与磁盘 exam-bank.json 逐字段一致（q/a/o/type）',
    a2a.length === 0, a2a.slice(0, 6).join(' | '));

  // A2-b: 其余 id 1–60（非覆盖）与离线内置基线逐字段一致
  const a2b = [];
  for (let i = 1; i <= 60; i++) {
    if (OVERRIDE.has(i)) continue;
    if (!baseline[i]) { a2b.push('基线缺 id=' + i); continue; }
    const cur = byId[i];
    if (!cur) { a2b.push('合并后缺 id=' + i); continue; }
    ['q', 'a', 'type', 'sub'].forEach(function (f) {
      if (cur[f] !== baseline[i][f]) a2b.push('id=' + i + '.' + f + ' 被改写');
    });
    if (JSON.stringify(cur.o) !== JSON.stringify(baseline[i].o)) a2b.push('id=' + i + '.o 被改写');
  }
  assert('A2-b 非覆盖 id 1–60 与离线内置基线逐字段一致（' + Object.keys(baseline).length + ' 题可比）',
    Object.keys(baseline).length === 60 && a2b.length === 0, a2b.slice(0, 6).join(' | '));
  assert('A2-c 离线基线本身 = 60 题（屏蔽所有 JSON 后仅剩内置兜底）', baselineLen === 60, '实际 ' + baselineLen);

  // ---- A3 覆盖能力保留 ----
  const before3 = QA.bankLen();
  QA.loadExamBankShard(FAKE_OVERRIDE_URL, true);
  await sleep(350);
  const q5 = bank.filter(function (q) { return q.id === 5; })[0] || {};
  const q9999 = bank.filter(function (q) { return q.id === 9999; })[0] || {};
  assert('A3-a 假覆盖层 id=5(<101) 确实覆盖了内置题（覆盖能力保留）',
    q5.q === 'OVERRIDE_MARKER_ID5', 'q=' + String(q5.q).slice(0, 40));
  assert('A3-b 假覆盖层全新 id=9999 追加成功', q9999.q === 'OVERRIDE_MARKER_ID9999_NEW',
    'q=' + String(q9999.q).slice(0, 40));
  assert('A3-c 覆盖 1 题 + 追加 1 题后总数 = ' + (before3 + 1), QA.bankLen() === before3 + 1,
    '实际 ' + QA.bankLen() + '（覆盖前 ' + before3 + '）');

  // ---- A4 守卫仍生效（增量模式）----
  const before4 = QA.bankLen();
  QA.loadExamBankShard(GUARD_URL);          // allowOverride 省略 = false
  await sleep(350);
  const g50 = bank.filter(function (q) { return q.id === 50; })[0] || {};
  const g301 = bank.filter(function (q) { return q.id === 301; })[0] || {};
  const g9001 = bank.filter(function (q) { return q.id === 9001; })[0] || {};
  assert('A4-a 增量分片 id=50(<101) 被跳过，未覆盖内置', g50.q !== 'GUARD_MARKER_ID50',
    'q=' + String(g50.q).slice(0, 40));
  assert('A4-b 增量分片已存在 id=301 被跳过（只 push 不覆盖）', g301.q !== 'GUARD_MARKER_ID301_DUP',
    'q=' + String(g301.q).slice(0, 40));
  assert('A4-c 增量分片全新 id=9001 正常追加（push 通路有效）', g9001.q === 'GUARD_MARKER_ID9001_NEW',
    'q=' + String(g9001.q).slice(0, 40));
  assert('A4-d 守卫分片仅净增 1 题（50/301 跳过、9001 追加）', QA.bankLen() === before4 + 1,
    '实际 ' + QA.bankLen() + '（加载前 ' + before4 + '）');

  // ---- A5 不写盘 ----
  QA.resetSaveCalls();
  QA.loadExamBankExt();
  await sleep(450);
  assert('A5 合并路径 saveData 调用 0 次（用户进度零改动）', QA.saveCalls() === 0,
    'saveData 被调用 ' + QA.saveCalls() + ' 次');

  // ---- A7 exam-bank.json 仍被请求 ----
  const touchedLegacy = on.fetched.some(function (u) { return /assets\/data\/exam-bank\.json$/.test(u); });
  assert('A7 旧独立 fetch 块删除后 exam-bank.json 仍被请求（legacy 声明生效，无数据不加载回归）',
    touchedLegacy, '实际请求过的 JSON：' + on.fetched.filter(function (u) { return /\.json$/.test(u); }).join(', '));

  // ---- 未捕获异常 ----
  assert('A8 加载与合并期间零未捕获异常', on.uncaught.length === 0, on.uncaught.slice(0, 5).join(' || '));

  try { on.dom.window.close(); } catch (e) {}
  finalize();
})().catch(function (e) {
  results.push({ name: '脚本自身运行异常', ok: false, detail: (e && e.stack) || String(e) });
  finalize();
});
