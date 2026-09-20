// QA: 对比 _backup_0913b（原始）与当前分片，列出所有发生变化的题及新旧解析
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'assets', 'data');
const BACKUP = path.join(__dirname, '_backup_0913b');

const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'exam-bank-ext-index.json'), 'utf8'));
let changedX = 0, changedA = 0, changedO = 0, totalChanged = 0;
const rows = [];

idx.shards.forEach(function (s) {
  const bakPath = path.join(BACKUP, path.basename(s.file));
  if (!fs.existsSync(bakPath)) { console.log('!! 缺备份：' + s.file); return; }
  const oldQ = JSON.parse(fs.readFileSync(bakPath, 'utf8')).questions;
  const newQ = JSON.parse(fs.readFileSync(path.join(ROOT, s.file), 'utf8')).questions;
  const oldMap = {};
  oldQ.forEach(function (q) { oldMap[q.id] = q; });
  newQ.forEach(function (nq) {
    const oq = oldMap[nq.id];
    if (!oq) return;
    const aDiff = oq.a !== nq.a;
    const oDiff = JSON.stringify(oq.o) !== JSON.stringify(nq.o);
    const xDiff = oq.x !== nq.x;
    if (!aDiff && !oDiff && !xDiff) return;
    totalChanged++;
    if (aDiff) changedA++;
    if (oDiff) changedO++;
    if (xDiff) { changedX++; rows.push({ id: nq.id, type: nq.type, file: s.file, oldX: oq.x, newX: nq.x, oldA: oq.a, newA: nq.a }); }
  });
});

console.log('变化的题数：' + totalChanged + ' | a 变化：' + changedA + ' | o 变化：' + changedO + ' | x 变化：' + changedX);
console.log('\n=== 解析文本被改写的题（需人工确认字母置换正确）===');
rows.forEach(function (r) {
  console.log('---');
  console.log('id=' + r.id + ' [' + r.type + '] ' + r.file.replace('assets/data/', '') +
    '  a: ' + r.oldA + '→' + r.newA);
  console.log('  旧x: ' + r.oldX);
  console.log('  新x: ' + r.newX);
});
