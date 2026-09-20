// QA: 汇总各验证脚本输出的关键结论行
'use strict';
const fs = require('fs');
const path = require('path');
const D = __dirname;
const files = {
  '第二批专项 verify_batch3_0913b.js': '_qa_verify_b2_out.txt',
  '同事回归 verify_batch3_0913_p0p1.js': '_qa_verify_p0p1_out.txt',
  '版本扫描 verify_versions_0913b.js': '_qa_verify_ver_out.txt'
};
Object.keys(files).forEach(function (k) {
  const t = fs.readFileSync(path.join(D, files[k]), 'utf8');
  const sum = (t.match(/合计 .*/) || ['?'])[0];
  const res = (t.match(/结论：.*/) || ['?'])[0];
  const fails = t.split(/\r?\n/).filter(function (l) { return /\[FAIL\]/.test(l); });
  console.log(k);
  console.log('   ' + sum + ' / ' + res);
  if (fails.length) fails.forEach(function (f) { console.log('   ' + f.trim()); });
  console.log('');
});
const leak = fs.readFileSync(path.join(D, '_qa_leak_out.txt'), 'utf8');
console.log('泄题扫描:' + (leak.match(/结果：.*/) || ['?'])[0]);
const st = fs.readFileSync(path.join(D, '_qa_stats_out.txt'), 'utf8').split(/\r?\n/);
st.filter(function (l) { return /增量合计|全站合计/.test(l); }).forEach(function (l) { console.log(l); });
const df = fs.readFileSync(path.join(D, '_qa_diff_out.txt'), 'utf8').split(/\r?\n/)[0];
console.log('DIFF: ' + df);
