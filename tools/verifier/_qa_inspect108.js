// QA: 复核 id=108 / 103 / 109 / 115 / 155 / 178 的原始与当前状态
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const BACKUP = path.join(__dirname, '_backup_0913b');
const IDS = [103, 108, 109, 115, 155, 178, 301];
const FILES = ['exam-bank-ext-figure.json', 'exam-bank-ext-logic.json', 'exam-bank-ext-verbal.json',
  'exam-bank-ext-2-figure.json', 'exam-bank-ext-2-define.json', 'exam-bank-ext-2-analogy.json',
  'exam-bank-ext-2-logic.json', 'exam-bank-ext-2-verbal.json', 'exam-bank-ext-quant.json',
  'exam-bank-ext-data.json', 'exam-bank-ext-define.json', 'exam-bank-ext-analogy.json',
  'exam-bank-ext-2-quant.json', 'exam-bank-ext-2-data.json'];

function targetIndex(id) { return (id * 3 + 1) % 4; }
const L = ['A', 'B', 'C', 'D'];

FILES.forEach(function (f) {
  const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', f), 'utf8')).questions;
  const bakPath = path.join(BACKUP, f);
  const old = fs.existsSync(bakPath)
    ? JSON.parse(fs.readFileSync(bakPath, 'utf8')).questions : [];
  const oldMap = {};
  old.forEach(function (q) { oldMap[q.id] = q; });
  cur.forEach(function (q) {
    if (IDS.indexOf(q.id) < 0) return;
    const o = oldMap[q.id];
    console.log('=== id=' + q.id + '  ' + f + '  [' + q.type + '/' + q.sub + ']');
    console.log('  q: ' + q.q);
    console.log('  旧 a=' + (o ? o.a : '?') + '(' + (o ? L[o.a] : '?') + ')  o=' + (o ? JSON.stringify(o.o) : '?'));
    console.log('  新 a=' + q.a + '(' + L[q.a] + ')  o=' + JSON.stringify(q.o));
    console.log('  targetIndex(id)=' + targetIndex(q.id) + '(' + L[targetIndex(q.id)] + ')');
    console.log('  旧 x: ' + (o ? o.x : '?'));
    console.log('  新 x: ' + q.x);
    console.log('');
  });
});
