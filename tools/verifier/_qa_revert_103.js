// 回退 id=103 / 109 / 115 到最初原始版本（team-lead 判定：选项文本本身是字母 A/B/C/D，
// 重排会造成「按钮标签 C + 选项文本 B」的观感错位，为 3 题均衡度牺牲可读性不划算）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const BACKUP = path.join(__dirname, '_backup_0913b');
const FILE = 'exam-bank-ext-figure.json';
const IDS = [103, 109, 115];
const L = ['A', 'B', 'C', 'D'];

const curPath = path.join(ROOT, 'assets', 'data', FILE);
const bakPath = path.join(BACKUP, FILE);
const cur = JSON.parse(fs.readFileSync(curPath, 'utf8'));
const bak = JSON.parse(fs.readFileSync(bakPath, 'utf8'));

const bakMap = {};
bak.questions.forEach(function (q) { bakMap[q.id] = q; });

let restored = 0;
cur.questions = cur.questions.map(function (q) {
  if (IDS.indexOf(q.id) < 0) return q;
  const o = bakMap[q.id];
  if (!o) { console.log('!! 备份中找不到 id=' + q.id); return q; }
  console.log('回退 id=' + q.id + '  a: ' + q.a + '(' + L[q.a] + ') → ' + o.a + '(' + L[o.a] + ')');
  console.log('   o: ' + JSON.stringify(q.o) + ' → ' + JSON.stringify(o.o));
  console.log('   x: ' + q.x + ' → ' + o.x);
  restored++;
  return o;
});

fs.writeFileSync(curPath, JSON.stringify(cur, null, 2) + '\n', 'utf8');
console.log('\n已回退 ' + restored + ' 题，' + FILE + ' 已落盘');

// 回退后的分布（顺带输出，便于一次性回传）
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'exam-bank-ext-index.json'), 'utf8'));
const inc = [0, 0, 0, 0];
const per = {};
idx.shards.forEach(function (s) {
  const f = path.basename(s.file);
  const d = [0, 0, 0, 0];
  JSON.parse(fs.readFileSync(path.join(ROOT, s.file), 'utf8')).questions.forEach(function (q) {
    if (Number.isInteger(q.a) && q.a >= 0 && q.a < 4) { d[q.a]++; inc[q.a]++; }
  });
  per[f] = d;
});
console.log('\n=== 回退后答案分布 A/B/C/D ===');
Object.keys(per).forEach(function (f) {
  console.log('  ' + f.padEnd(34) + ' A=' + per[f][0] + ' B=' + per[f][1] + ' C=' + per[f][2] + ' D=' + per[f][3]);
});
console.log('  增量合计'.padEnd(36) + ' A=' + inc[0] + ' B=' + inc[1] + ' C=' + inc[2] + ' D=' + inc[3] +
  '  (共 ' + (inc[0] + inc[1] + inc[2] + inc[3]) + ')');
