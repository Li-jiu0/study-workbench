// QA: 比较 tip 字段的原始与当前值，确认第 7 处字母改写落在 tip 且正确
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const BACKUP = path.join(__dirname, '_backup_0913b');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'exam-bank-ext-index.json'), 'utf8'));

idx.shards.forEach(function (s) {
  const bakPath = path.join(BACKUP, path.basename(s.file));
  if (!fs.existsSync(bakPath)) return;
  const oldQ = JSON.parse(fs.readFileSync(bakPath, 'utf8')).questions;
  const newQ = JSON.parse(fs.readFileSync(path.join(ROOT, s.file), 'utf8')).questions;
  const oldMap = {};
  oldQ.forEach(function (q) { oldMap[q.id] = q; });
  newQ.forEach(function (nq) {
    const oq = oldMap[nq.id];
    if (!oq) return;
    if (String(oq.tip) === String(nq.tip)) return;
    console.log('id=' + nq.id + ' [' + nq.type + '] ' + s.file.replace('assets/data/', '') +
      '  a: ' + oq.a + '→' + nq.a);
    console.log('  旧tip: ' + oq.tip);
    console.log('  新tip: ' + nq.tip);
  });
});
