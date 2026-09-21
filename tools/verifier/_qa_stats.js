// QA: answer-key distribution + leak-word scan per shard
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'assets', 'data');
const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'exam-bank-ext-index.json'), 'utf8'));

function load(s) { return JSON.parse(fs.readFileSync(path.join(ROOT, s.file), 'utf8')).questions; }

console.log('=== 答案 a 分布（0=A 1=B 2=C 3=D）===');
idx.shards.forEach(function (s) {
  const qs = load(s);
  const d = [0, 0, 0, 0];
  qs.forEach(function (q) { if (Number.isInteger(q.a) && q.a >= 0 && q.a < 4) d[q.a]++; });
  console.log('  ' + s.file.replace('assets/data/', '').padEnd(34) + ' n=' + qs.length +
    '  A=' + d[0] + ' B=' + d[1] + ' C=' + d[2] + ' D=' + d[3]);
});

// 内置 60 题（app.js）的 a 分布
const appSrc = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
const start = appSrc.indexOf('const EXAM_BANK = [');
const end = appSrc.indexOf('\n];', start);
const bankSrc = appSrc.slice(start, end);
const as = (bankSrc.match(/\ba:\s*(\d)/g) || []).map(function (m) { return Number(m.replace(/\D/g, '')); });
const bd = [0, 0, 0, 0];
as.forEach(function (a) { if (a >= 0 && a < 4) bd[a]++; });
console.log('  内置 EXAM_BANK(60)'.padEnd(38) + ' n=' + as.length + '  A=' + bd[0] + ' B=' + bd[1] + ' C=' + bd[2] + ' D=' + bd[3]);

// 合计
const tot = [0, 0, 0, 0];
idx.shards.forEach(function (s) {
  load(s).forEach(function (q) { if (Number.isInteger(q.a) && q.a >= 0 && q.a < 4) tot[q.a]++; });
});
tot.forEach(function (v, i) { });
console.log('  增量合计'.padEnd(36) + ' n=' + (tot[0] + tot[1] + tot[2] + tot[3]) +
  '  A=' + tot[0] + ' B=' + tot[1] + ' C=' + tot[2] + ' D=' + tot[3]);
console.log('  全站合计(内置+增量)'.padEnd(35) + '  A=' + (bd[0] + tot[0]) + ' B=' + (bd[1] + tot[1]) +
  ' C=' + (bd[2] + tot[2]) + ' D=' + (bd[3] + tot[3]));

// ---- 图形推理泄题词扫描（与官方扫描器同词表，另加第二批要求词）----
const LEAK = ["依次", "规律", "顺时针", "逆时针", "递增", "递减", "逐次", "逐渐", "每次",
  "等差", "等比", "旋转", "平移", "翻转", "对称", "叠加", "遍历", "去同存异", "去异存同",
  "移动", "变化规律", "周期", "循环", "序列", "递变", "递增", "减少", "增加", "重复"];
const LEAK_RE = new RegExp(LEAK.join('|'));
console.log('\n=== 图形推理题干泄题词扫描（拡充词表）===');
let leakTotal = 0;
[idx].forEach(function () { });
idx.shards.forEach(function (s) {
  const qs = load(s).filter(function (q) { return q.type === '图形推理'; });
  qs.forEach(function (q) {
    const m = String(q.q).match(LEAK_RE);
    if (m) { leakTotal++; console.log('  [命中] ' + s.file.replace('assets/data/', '') + ' id=' + q.id + ' 词="' + m[0] + '" q=' + q.q); }
  });
});
console.log('  图形推理题干命中数：' + leakTotal);

// 所有题型题干也扫一遍（信息性，非判定）
console.log('\n=== 非图形推理题干命中「递减/递增/规律」等（信息性）===');
idx.shards.forEach(function (s) {
  load(s).filter(function (q) { return q.type !== '图形推理'; }).forEach(function (q) {
    const m = String(q.q).match(LEAK_RE);
    if (m) console.log('  ' + s.file.replace('assets/data/', '') + ' id=' + q.id + ' [' + q.type + '] 词="' + m[0] + '" q=' + String(q.q).slice(0, 60));
  });
});
