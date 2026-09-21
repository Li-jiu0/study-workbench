// QA: dump batch-2 (id 301-400) questions for human review + structural pre-check
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'assets', 'data');

const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'exam-bank-ext-index.json'), 'utf8'));
console.log('index version =', idx.version, '| shards =', idx.shards.length);

let all = [];
const lines = [];
idx.shards.forEach(function (s) {
  const fp = path.join(ROOT, s.file);
  const exists = fs.existsSync(fp);
  let n = -1;
  if (exists) {
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    n = j.questions.length;
    j.questions.forEach(function (q) { q.__src = s.file; q.__declType = s.type; all.push(q); });
  }
  console.log('  ' + (exists ? 'OK ' : 'MISSING ') + s.file + '  declared=' + s.count + ' actual=' + n +
    (exists && n !== s.count ? '   <<< MISMATCH' : ''));
});
console.log('total questions across shards =', all.length);
console.log('sum of declared counts =', idx.shards.reduce(function (a, s) { return a + s.count; }, 0));

// id ranges per shard
console.log('\n--- per-shard id range ---');
idx.shards.forEach(function (s) {
  const qs = all.filter(function (q) { return q.__src === s.file; });
  const ids = qs.map(function (q) { return q.id; }).sort(function (a, b) { return a - b; });
  const types = Array.from(new Set(qs.map(function (q) { return q.type; })));
  console.log('  ' + s.file.replace('assets/data/', '') + ' [' + Math.min.apply(null, ids) + '..' +
    Math.max.apply(null, ids) + '] n=' + ids.length + ' types=' + types.join('/') +
    ' (declared ' + s.declType + ')');
});

// duplicate ids
const byId = {};
all.forEach(function (q) { (byId[q.id] = byId[q.id] || []).push(q.__src); });
const dups = Object.keys(byId).filter(function (k) { return byId[k].length > 1; });
console.log('\nduplicate ids across shards:', dups.length ? dups.join(',') : 'none');

const ids = all.map(function (q) { return q.id; }).sort(function (a, b) { return a - b; });
console.log('id min=' + ids[0] + ' max=' + ids[ids.length - 1] + ' count=' + ids.length);
const missing = [];
for (let i = 101; i <= 400; i++) if (ids.indexOf(i) < 0) missing.push(i);
console.log('missing ids in 101..400:', missing.length ? missing.join(',') : 'none');
console.log('ids < 101:', ids.filter(function (i) { return i < 101; }).join(',') || 'none');

// ---- structural validation of every question ----
const problems = [];
all.forEach(function (q) {
  const p = [];
  if (!q.q || !String(q.q).trim()) p.push('q 空');
  if (!Array.isArray(q.o) || q.o.length !== 4) p.push('o 非4项(' + (Array.isArray(q.o) ? q.o.length : typeof q.o) + ')');
  if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) p.push('a 非法(' + q.a + ')');
  if (!q.x || !String(q.x).trim()) p.push('x 空');
  if (!q.tip || !String(q.tip).trim()) p.push('tip 空');
  if (!q.type) p.push('type 空');
  if (q.__declType && q.type !== q.__declType) p.push('type 与索引声明不符(' + q.type + ' vs ' + q.__declType + ')');
  if (Array.isArray(q.o)) {
    const nonStr = q.o.filter(function (s) { return typeof s !== 'string' || !s.trim(); });
    if (nonStr.length) p.push('o 含空/非字符串项');
    if (new Set(q.o).size !== q.o.length) p.push('o 选项重复');
  }
  if (p.length) problems.push({ id: q.id, src: q.__src, issues: p });
});
console.log('\n=== 结构性问题（全量 ' + all.length + ' 题）===');
if (!problems.length) console.log('  无');
problems.forEach(function (p) { console.log('  id=' + p.id + ' [' + p.src.replace('assets/data/', '') + '] ' + p.issues.join('; ')); });

// ---- x/a consistency heuristic: does x mention the correct option text? ----
console.log('\n=== x 与 a 一致性（解析是否指向正确选项）===');
const noRef = [];
all.forEach(function (q) {
  if (!Array.isArray(q.o) || !Number.isInteger(q.a)) return;
  const ans = String(q.o[q.a]);
  const x = String(q.x);
  // 归一化：去掉空白与常见括号
  const norm = function (s) { return String(s).replace(/\s+/g, '').replace(/[（）()]/g, ''); };
  const nx = norm(x);
  const na = norm(ans);
  let hit = nx.indexOf(na) >= 0;
  // 二次机会：解析里出现 「选X」/「选 X」/「答案X」 且 X 与 a 对应
  const letters = ['A', 'B', 'C', 'D'];
  const m = nx.match(/(?:答案|选|应选|故选|故选定)([ABCD])/);
  const letterHit = m ? (letters.indexOf(m[1]) === q.a) : false;
  if (!hit && !letterHit) noRef.push({ id: q.id, type: q.type, a: q.a, ans: ans, x: x.slice(0, 120) });
});
console.log('解析中未出现正确选项文本、也未出现匹配字母的题：' + noRef.length + ' / ' + all.length);
noRef.forEach(function (r) {
  console.log('  id=' + r.id + ' [' + r.type + '] a=' + r.a + ' 正确项="' + r.ans + '"');
  console.log('     x: ' + r.x);
});

// ---- dump batch-2 (301-400) for manual review ----
const b2 = all.filter(function (q) { return q.id >= 301 && q.id <= 400; }).sort(function (a, b) { return a.id - b.id; });
console.log('\n=== 第二批（301-400）共 ' + b2.length + ' 题全文 ===');
b2.forEach(function (q) {
  console.log('---');
  console.log('id=' + q.id + ' [' + q.type + (q.sub ? '/' + q.sub : '') + '] diff=' + q.diff);
  console.log('q: ' + q.q);
  console.log('o: ' + JSON.stringify(q.o));
  console.log('a: ' + q.a + '  => ' + q.o[q.a]);
  console.log('x: ' + q.x);
  console.log('tip: ' + q.tip);
});
