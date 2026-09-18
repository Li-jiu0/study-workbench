const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const files = ['PPT案例拆解.html','PPT版式库.html','PPT训练.html','blog_wechat.html','万能金句库.html','个人中心.html','企业定向库.html','动态.html','商务礼仪.html','商务礼仪面试.html','四级备考.html','四级词汇.html','场景话术库.html','央国企笔试.html','学习博客.html','学习工作台.html','工具.html','时政热点.html','申论刷题.html','管理员.html','行测刷题.html','设置.html','错题本.html','面试题库.html','高情商表达.html'];
const out = [];
for (const name of files) {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
  const i = src.indexOf('<nav class="sidebar"');
  if (i < 0) { out.push('===== ' + name + ' NO SIDEBAR'); continue; }
  const seg = src.slice(i, i + 1800);
  out.push('===== ' + name + ' =====');
  out.push(seg.split('\n').slice(0, 26).join('\n'));
  out.push('');
}
fs.writeFileSync(path.join(ROOT, 'tools/qa/_sidebar_head.txt'), out.join('\n'), 'utf8');
console.log('ok');
