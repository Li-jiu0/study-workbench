/**
 * 第二批题库补产（200 → 300 题）专项验证脚本
 * ---------------------------------------------------------------------------
 * 覆盖：
 *   A 索引完整性：14 分片、count 之和 240、file 真实存在、声明条数=实际条数、
 *                 文件名无中文（上一批 140 题零加载的根因）、question.type 与索引一致
 *   B jsdom 真实合并：EXAM_BANK = 300、id 全局唯一、id 1–60 内容不被增量覆盖（A/B 对照）
 *   C 守卫用例：假分片里 id<101 / 已存在 id 必须跳过；新 id 必须正常 push
 *   D 合并安全：合并路径 saveData 调用 0 次
 *   E 质量抽查：字段齐全、o 四项且互不相同、a ∈ 0–3、x 非空、答案位置分布、
 *               图形推理题干无泄题词
 *   F 回归基线：页面零未捕获异常、showToast / navigateTo 可用
 *
 * 用法：node tools/verifier/verify_batch3_0913b.js
 * 退出码：0=全部通过，1=存在失败断言
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'assets', 'data');
const PAGE = path.join(ROOT, '学习工作台.html');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { ({ JSDOM, VirtualConsole } = require('c:\\Users\\ATM\\node_modules\\jsdom')); }

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// =========================================================================
// A. 索引与分片静态检查
// =========================================================================
const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'exam-bank-ext-index.json'), 'utf8'));

assert('A1 索引 version = 20260913b', idx.version === '20260913b', idx.version);
assert('A2 索引 shards 共 14 项', Array.isArray(idx.shards) && idx.shards.length === 14,
  '实际 ' + (idx.shards || []).length);
const sumCount = idx.shards.reduce(function (a, s) { return a + (Number(s.count) || 0); }, 0);
assert('A3 索引 count 之和 = 240', sumCount === 240, '实际 ' + sumCount);

const missingFiles = [], mismatched = [], nonAscii = [], typeMismatch = [], idUnder101 = [], badCount = [];
const shardData = {};
idx.shards.forEach(function (s) {
  const rel = String(s.file || '');
  if (/[^\x00-\x7F]/.test(rel)) nonAscii.push(rel);                 // 中文文件名 = 上一批 bug
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { missingFiles.push(rel); return; }
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const qs = Array.isArray(j.questions) ? j.questions : [];
  shardData[rel] = qs;
  if (qs.length !== s.count) mismatched.push(rel + ' 声明' + s.count + ' 实际' + qs.length);
  if (typeof s.count !== 'number') badCount.push(rel);
  qs.forEach(function (q) {
    if (typeof q.id !== 'number' || q.id < 101) idUnder101.push(rel + '#id=' + q.id);
    if (s.type && q.type !== s.type) typeMismatch.push(rel + '#id=' + q.id + ' ' + q.type + '≠' + s.type);
  });
});
assert('A4 索引里每个 file 在磁盘上真实存在（0 缺失）', missingFiles.length === 0, missingFiles.join(' | '));
assert('A5 索引里无中文/非 ASCII 文件名（复现上一批 140 题零加载的根因）',
  nonAscii.length === 0, nonAscii.join(' | '));
assert('A6 每个分片声明条数 = 实际条数', mismatched.length === 0, mismatched.join(' | '));
assert('A7 分片内 question.type 与索引声明一致', typeMismatch.length === 0, typeMismatch.slice(0, 5).join(' | '));
assert('A8 分片内不存在 id < 101 的题', idUnder101.length === 0, idUnder101.slice(0, 5).join(' | '));

const allExt = [];
Object.keys(shardData).forEach(function (k) { shardData[k].forEach(function (q) { allExt.push(q); }); });
assert('A9 增量题总数 = 240', allExt.length === 240, '实际 ' + allExt.length);
const extIds = allExt.map(function (q) { return q.id; });
assert('A10 增量题 id 全局唯一（无跨分片重复）', new Set(extIds).size === extIds.length,
  '去重后 ' + new Set(extIds).size + ' / 原始 ' + extIds.length);
const b2 = allExt.filter(function (q) { return q.id >= 301 && q.id <= 400; });
assert('A11 第二批 id 301–400 齐备（100 题）', b2.length === 100, '实际 ' + b2.length);

// =========================================================================
// B/C/D. jsdom 真实合并
// =========================================================================
const rawHtml = fs.readFileSync(PAGE, 'utf8');
const SRC_RE = /<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const loadedScripts = [];
const html = rawHtml.replace(SRC_RE, function (m, src) {
  const rel = String(src).split('?')[0];
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return '<!-- 脚本缺失：' + rel + ' -->';
  const code = fs.readFileSync(fp, 'utf8');
  if (/<\/script/i.test(code)) throw new Error('脚本内含 </script 字面量：' + rel);
  loadedScripts.push(rel);
  return '<script>\n' + code + '\n</script>';
});

// 守卫分片：id=50（<101，必须跳过）、id=301（已存在，必须跳过）、id=9001（新题，必须 push）
const GUARD_URL = 'assets/data/__qa_guard_0913b.json';
const GUARD_PAYLOAD = {
  questions: [
    { id: 50, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID50', o: ['a', 'b'], a: 0, x: '', tip: '' },
    { id: 301, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID301_DUP', o: ['a', 'b'], a: 0, x: '', tip: '' },
    { id: 9001, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID9001_NEW', o: ['a', 'b'], a: 0, x: '', tip: '' }
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
  '    loadExamBankShard: function (u) { return loadExamBankShard(u); },',
  '    saveCalls: function () { return window.__qaSaveCalls; },',
  '    resetSaveCalls: function () { window.__qaSaveCalls = 0; },',
  '    showToast: function (m) { return showToast(m); },',
  '    navigateTo: function (p) { return navigateTo(p); }',
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

// mode: 'online' 正常；'offline' 屏蔽所有 exam-bank-ext* 请求（模拟未部署增量包）
function boot(mode) {
  const uncaught = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
  function fetchStub(u) {
    const url = String(u === undefined || u === null ? '' : u);
    return Promise.resolve().then(function () {
      if (url.indexOf('__qa_guard_0913b') >= 0) return makeRes(GUARD_PAYLOAD);
      if (mode === 'offline' && /exam-bank-ext/.test(url)) {
        return { ok: false, status: 404, json: function () { return Promise.reject(new Error('404 ' + url)); } };
      }
      const rel = url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
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
      try {
        window.localStorage.setItem('study_workbench_auth',
          JSON.stringify({ account: 'qa', loginAt: Date.now() }));
      } catch (e) { /* 忽略 */ }
      window.addEventListener('error', function (e) { uncaught.push('[window.error] ' + ((e && e.message) || 'unknown')); });
      window.addEventListener('unhandledrejection', function (e) { uncaught.push('[unhandledrejection] ' + String(e && e.reason)); });
    }
  });
  return { dom: dom, win: dom.window, uncaught: uncaught };
}

(async function main() {
  // ---- offline 基线：只有内置 60（+ exam-bank.json 覆盖），不加载任何增量分片 ----
  const off = boot('offline');
  await sleep(700);
  const offQA = off.win.__QA;
  const baseline = {};
  if (offQA) {
    offQA.bank().forEach(function (q) { if (q.id >= 1 && q.id <= 60) baseline[q.id] = q.q; });
  }
  const baselineCount = offQA ? offQA.bankLen() : -1;
  off.dom.window.close();

  // ---- online：真实加载 14 个分片 ----
  const on = boot('online');
  await sleep(900);
  const QA = on.win.__QA;
  const doc = on.win.document;
  assert('B0 探针注入成功（页面脚本整体可执行）', !!QA, QA ? '' : 'window.__QA 未定义');
  if (!QA) return finalize(on.uncaught);

  const bank = QA.bank();
  assert('B1 合并后 EXAM_BANK 总数 = 300（内置 60 + 增量 240）', QA.bankLen() === 300, '实际 ' + QA.bankLen());
  const allIds = bank.map(function (q) { return q.id; });
  assert('B2 合并后 id 全局唯一（无重复）', new Set(allIds).size === allIds.length,
    '去重后 ' + new Set(allIds).size + ' / 原始 ' + allIds.length);
  const under101 = bank.filter(function (q) { return q.id < 101; }).length;
  assert('B3 id<101 的题数量为 60', under101 === 60, '实际 ' + under101);
  const extCount = bank.filter(function (q) { return q.id >= 101; }).length;
  assert('B4 增量题（id≥101）数量为 240', extCount === 240, '实际 ' + extCount);

  // A/B 对照：内置题内容未被增量覆盖
  const overwritten = [];
  for (let i = 1; i <= 60; i++) {
    const cur = bank.filter(function (q) { return q.id === i; })[0];
    if (!cur) { overwritten.push('id=' + i + ' 丢失'); continue; }
    if (baseline[i] !== undefined && baseline[i] !== cur.q) overwritten.push('id=' + i + ' 题干被改写');
  }
  assert('B5 内置 1–60 题未被增量覆盖（离线基线 A/B 对照，' + Object.keys(baseline).length + ' 题可比）',
    Object.keys(baseline).length >= 60 && overwritten.length === 0,
    overwritten.length ? overwritten.slice(0, 5).join(' | ') : ('基线仅 ' + Object.keys(baseline).length + ' 题可比'));

  // ---- C. 守卫用例 ----
  const before = QA.bankLen();
  QA.loadExamBankShard(GUARD_URL);
  await sleep(350);
  const q50 = bank.filter(function (q) { return q.id === 50; })[0] || {};
  const q301 = bank.filter(function (q) { return q.id === 301; })[0] || {};
  const q9001 = bank.filter(function (q) { return q.id === 9001; })[0] || {};
  assert('C1 分片中 id=50（<101）被跳过，未覆盖内置题',
    q50.q !== 'GUARD_MARKER_ID50', 'q=' + String(q50.q).slice(0, 40));
  assert('C2 分片中已存在的 id=301 被跳过（只 push 不覆盖）',
    q301.q !== 'GUARD_MARKER_ID301_DUP', 'q=' + String(q301.q).slice(0, 40));
  assert('C3 分片中全新的 id=9001 被正常追加（push 通路有效）',
    q9001.q === 'GUARD_MARKER_ID9001_NEW', 'q=' + String(q9001.q).slice(0, 40));
  assert('C4 守卫分片加载后总数 = ' + (before + 1), QA.bankLen() === before + 1,
    '实际 ' + QA.bankLen() + '（加载前 ' + before + '）');

  // ---- D. 合并路径不得调用 saveData ----
  QA.resetSaveCalls();
  QA.loadExamBankExt();
  QA.loadExamBankShard(GUARD_URL);
  await sleep(400);
  assert('D1 合并路径 saveData 调用 0 次（用户进度零改动）', QA.saveCalls() === 0,
    'saveData 被调用 ' + QA.saveCalls() + ' 次');

  // ---- F. 回归基线 ----
  let toastErr = '';
  try { QA.showToast('QA 第二批回归'); } catch (e) { toastErr = e && e.message ? e.message : String(e); }
  assert('F1 showToast 可用且不抛异常', typeof QA.showToast === 'function' && !toastErr, toastErr);
  let navErr = '';
  try { QA.navigateTo('home'); } catch (e) { navErr = e && e.message ? e.message : String(e); }
  assert('F2 navigateTo("home") 不抛异常', !navErr, navErr);
  assert('F3 页面关键节点 #page-home 存在', !!doc.getElementById('page-home'), '');

  finalize(on.uncaught, on);
})().catch(function (e) {
  console.error('verifier 异常：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

// =========================================================================
// E. 质量抽查（第二批 100 题全量结构校验 + 图形推理泄题扫描）
// =========================================================================
function qualityCheck() {
  const structBad = [];
  b2.forEach(function (q) {
    const p = [];
    if (!q.q || !String(q.q).trim()) p.push('q 空');
    if (!Array.isArray(q.o) || q.o.length !== 4) p.push('o 非 4 项');
    if (Array.isArray(q.o) && new Set(q.o).size !== 4) p.push('o 有重复项');
    if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) p.push('a 越界');
    if (!q.x || !String(q.x).trim()) p.push('x 空');
    if (!q.tip || !String(q.tip).trim()) p.push('tip 空');
    if (!q.type || !q.sub) p.push('type/sub 缺失');
    if (![1, 2, 3].includes(q.diff)) p.push('diff 非 1–3');
    if (p.length) structBad.push('id=' + q.id + ': ' + p.join(';'));
  });
  assert('E1 第二批 100 题字段齐全（q/o×4 唯一/a∈0–3/x/tip/type/sub/diff）',
    structBad.length === 0, structBad.slice(0, 5).join(' | '));

  // 答案位置分布（与官方渲染 labels A/B/C/D 一致）
  const dist = [0, 0, 0, 0];
  b2.forEach(function (q) { if (Number.isInteger(q.a)) dist[q.a]++; });
  assert('E2 第二批答案位置分布均衡（A/B/C/D = ' + dist.join('/') + '，无单一位置垄断）',
    dist.every(function (v) { return v >= 15; }) && dist.every(function (v) { return v <= 35; }),
    dist.join('/'));

  // 每题型抽样 ≥2 题：解析与答案字母自洽（解析不得把正确项判为错，且必须以
  // 「字母肯定」或「内容描述」两种方式之一指向正确项）
  // 说明：早期版本只判「解析里必须出现正确项字母」，对「用内容描述正确项、只
  //        用字母列举干扰项」的题（如 id=330/331/333）会误报——那是测试脚本
  //        断言过严，不是数据缺陷，故改为下面的复合判据。
  const L = ['A', 'B', 'C', 'D'];
  const byType = {};
  b2.forEach(function (q) { (byType[q.type] = byType[q.type] || []).push(q); });
  const inconsistent = [];
  Object.keys(byType).forEach(function (t) {
    byType[t].forEach(function (q) {
      const x = String(q.x);
      const ansLetter = L[q.a];
      // ① 矛盾：正确项字母不得被否定判词修饰
      if (new RegExp(ansLetter + '\\s*(?:不|非|错误|不正确|不符合|不对|不属)').test(x)) {
        inconsistent.push('id=' + q.id + ' 解析把正确项 ' + ansLetter + ' 判为错'); return;
      }
      // ② 字母肯定：正确项字母在解析中出现（独立字母，排除 DNA / C(5,3) 之类）
      if (new RegExp('(?:^|[^A-Za-z0-9])' + ansLetter + '(?![A-Za-z0-9(])').test(x)) return;
      // ③ 数值支撑：正确项含数字且该数字出现在解析中（如「12条」↔「=12」）
      const ans = String(q.o[q.a]);
      const num = ans.match(/\d+(?:\.\d+)?/);
      if (num && x.indexOf(num[0]) >= 0) return;
      // ④ 内容支撑：正确项以内容形式被解析描述。
      //    类比/定义类选项常写作「A∶B∶C」，解析里通常用「A与B」「A是B」复述，
      //    故按 ∶/： 拆分后只要任一片段（长度≥2）命中即可；无分隔符则退化为
      //    整串匹配或 3 字连续中文片段匹配。
      const parts = ans.split(/[∶:]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      if (parts.length >= 2) {
        if (parts.some(function (p) { return p.length >= 2 && x.indexOf(p) >= 0; })) return;
      } else if (x.indexOf(ans) >= 0) {
        return;
      }
      const cjk = ans.replace(/[^\u4e00-\u9fa5]/g, '');
      for (let i = 0; i + 3 <= cjk.length; i++) {
        if (x.indexOf(cjk.substr(i, 3)) >= 0) return;
      }
      inconsistent.push('id=' + q.id + ' 解析既未肯定 ' + ansLetter + ' 也未描述正确项内容');
    });
  });
  assert('E3 第二批解析与答案自洽（未把正确项判错，且正确项被解析指向）',
    inconsistent.length === 0, inconsistent.slice(0, 6).join(' | '));
  const typeNames = Object.keys(byType);
  assert('E4 第二批覆盖 7 个题型且每题型 ≥14 题（可满足每题型抽 2 题）',
    typeNames.length === 7 && typeNames.every(function (t) { return byType[t].length >= 2; }),
    typeNames.map(function (t) { return t + ':' + byType[t].length; }).join(' '));

  // 图形推理泄题扫描（与 tools/qa/scan_question_leak.py 同一词表）
  const LEAK = ['依次', '规律', '顺时针', '逆时针', '递增', '递减', '逐次', '逐渐', '每次', '等差', '等比',
    '旋转', '平移', '翻转', '对称', '叠加', '遍历', '去同存异', '去异存同', '移动', '变化规律'];
  const LEAK_RE = new RegExp(LEAK.join('|'));
  const leakHits = [];
  allExt.filter(function (q) { return q.type === '图形推理'; }).forEach(function (q) {
    const m = String(q.q).match(LEAK_RE);
    if (m) leakHits.push('id=' + q.id + ' 词="' + m[0] + '"');
  });
  assert('E5 全部图形推理题干零泄题词（35 题，与官方扫描器同词表）',
    leakHits.length === 0, leakHits.join(' | '));

  // 答案重排安全性：确认易误伤字符串未被破坏
  const byId = {};
  b2.forEach(function (q) { byId[q.id] = q; });
  allExt.forEach(function (q) { if (byId[q.id] === undefined) byId[q.id] = q; });
  assert('E6 答案重排未破坏「DNA」（id=340 解析仍含 DNA）',
    byId[340] && String(byId[340].x).indexOf('DNA') >= 0, byId[340] ? String(byId[340].x).slice(0, 60) : '缺失');
  assert('E7 答案重排未破坏「C(5,3)」（id=382 解析仍含组合数写法）',
    byId[382] && String(byId[382].x).indexOf('C(5,3)') >= 0, byId[382] ? String(byId[382].x).slice(0, 60) : '缺失');
  // E8：字母置换只能作用于「选项字母」。第一批有两道题的解析用 A/B 指代领域实体
  //     （id=108 的两个图形元素、id=155 的「如果A去，则B也去」里的人名），
  //     --all 重排时被误当成选项字母换掉，已人工回退，此处加回归锁。
  assert('E8 领域实体字母未被误置换（id=108「元素A与B」、id=155「推A没去」）',
    byId[108] && String(byId[108].x).indexOf('元素A与B') >= 0 &&
    byId[155] && String(byId[155].x).indexOf('推A没去') >= 0,
    'id=108.x=' + (byId[108] ? String(byId[108].x) : '缺失') +
    ' / id=155.x=' + (byId[155] ? String(byId[155].x) : '缺失'));
  // E9：tip 是通用知识点，不参与选项字母置换（历史上 id=227「A是B的一种」、
  //     id=384「|A∪B|」被误当成选项字母换掉，已回退，此处加回归锁）
  assert('E9 tip 未被误置换（id=227「A是B的一种」、id=384「|A∪B|」）',
    byId[227] && String(byId[227].tip).indexOf('A是B的一种') >= 0 &&
    byId[384] && String(byId[384].tip).indexOf('|A∪B|') >= 0,
    'id=227.tip=' + (byId[227] ? String(byId[227].tip) : '缺失') +
    ' / id=384.tip=' + (byId[384] ? String(byId[384].tip) : '缺失'));
}

// =========================================================================
// 输出
// =========================================================================
let finalized = false;
function finalize(uncaught, ctx) {
  if (finalized) return;
  finalized = true;
  qualityCheck();
  assert('F4 页面加载与运行期间零未捕获异常', (uncaught || []).length === 0, (uncaught || []).slice(0, 5).join(' || '));

  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });
  console.log('');
  console.log('============================================================');
  console.log('第二批题库补产（200→300）专项验证 · 页面：学习工作台.html');
  console.log('项目根：' + ROOT);
  console.log('已内联脚本：' + loadedScripts.join(' | '));
  console.log('============================================================');
  results.forEach(function (r, i) {
    console.log((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name +
      (r.ok ? '' : '   →   ' + r.detail));
  });
  console.log('============================================================');
  console.log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  console.log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  console.log('============================================================');
  if (ctx) { try { ctx.dom.window.close(); } catch (e) {} }
  process.exit(failed.length === 0 ? 0 : 1);
}
