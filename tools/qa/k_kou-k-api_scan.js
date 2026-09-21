/* 全文件 emoji 残留扫描（判定用） */
const fs = require('fs');
const src = fs.readFileSync('D:/下载的文件/学习工作台/assets/api.js', 'utf8');
const lines = src.split('\n');
const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2B50}\u{2B06}]/u;
let n = 0;
lines.forEach((l, i) => {
  if (re.test(l)) { n++; console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 150)); }
});
console.log('TOTAL=' + n);
