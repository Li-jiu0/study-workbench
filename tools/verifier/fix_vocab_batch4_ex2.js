/**
 * 修复批次四 vocab-cet4-ext.json 中 19 条 example2 与 example 完全相同的「零增量」条目。
 * 逐行精确替换各自行的 example2 值，保持紧凑格式（一行一词）与其余内容不变。
 * 用法：node tools/verifier/fix_vocab_batch4_ex2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = path.join(ROOT, 'assets', 'data', 'vocab-cet4-ext.json');

// 19 条：word -> 与 example 不同语境的新 example2
const FIX = {
  identify: 'Scientists identified a new species of frog in the forest.',
  influence: 'Climate change strongly influences the crops farmers can grow.',
  injure: 'He injured his knee while climbing over the wall.',
  invent: 'She invented a clever way to save water at home.',
  manner: 'She answered every question in a confident manner.',
  method: 'Scientists are testing a new method to treat the disease.',
  mirror: 'The calm lake mirrored the mountains behind it.',
  native: 'These plants are native to the south of China.',
  negotiate: 'The two countries agreed to negotiate a peace deal.',
  obey: 'The dog has learned to obey simple commands.',
  obvious: 'It is obvious that he is not telling the truth.',
  unable: 'She was unable to hide her disappointment.',
  universal: 'The right to education is a universal value.',
  vary: 'The weather here varies greatly from day to day.',
  violence: 'The police are working to reduce violence in the city.',
  quartz: 'Quartz is one of the most common minerals on Earth.',
  resemble: 'The little house resembles a castle from a fairy tale.',
  transit: 'We passed through the city in transit to the coast.',
  parent: 'My parents met when they were at university.'
};

const raw = fs.readFileSync(FILE, 'utf8');
const lines = raw.split('\n');
let applied = 0;
const appliedSet = {};
const EX2 = /("example2"\s*:\s*)"((?:[^"\\]|\\.)*)"/;
lines.forEach(function (ln, i) {
  const m = /"word"\s*:\s*"([^"]*)"/.exec(ln);
  if (!m) return;
  const w = m[1];
  if (FIX[w] === undefined) return;
  const nv = FIX[w].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const before = ln;
  lines[i] = ln.replace(EX2, '$1"' + nv + '"');
  if (lines[i] !== before) { applied++; appliedSet[w] = 1; }
});
const missing = Object.keys(FIX).filter(function (w) { return !appliedSet[w]; });
if (missing.length) { console.error('未命中：' + missing.join(',')); process.exit(1); }

fs.writeFileSync(FILE, lines.join('\n'), 'utf8');
console.log('applied=' + applied);

// 复核：重新解析，identical 应为 0，且字段/条数不变
const ext = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const same = ext.words.filter(function (w) { return String(w.example).trim() === String(w.example2).trim(); });
console.log('words=' + ext.words.length + '  identical_after=' + same.length);
// 跨词重复句扫描（复制粘贴嫌疑）
const byEx = {}, byEx2 = {};
const dupEx = [], dupEx2 = [];
ext.words.forEach(function (w) {
  if (byEx[w.example]) dupEx.push(w.word + '<->' + byEx[w.example]); else byEx[w.example] = w.word;
  if (byEx2[w.example2]) dupEx2.push(w.word + '<->' + byEx2[w.example2]); else byEx2[w.example2] = w.word;
});
console.log('cross_word_dup_example=' + dupEx.length + (dupEx.length ? ' :: ' + dupEx.slice(0, 10).join(' | ') : ''));
console.log('cross_word_dup_example2=' + dupEx2.length + (dupEx2.length ? ' :: ' + dupEx2.slice(0, 10).join(' | ') : ''));
