const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const FILES = [
  'PPT案例拆解.html','PPT版式库.html','PPT训练.html','blog_wechat.html','万能金句库.html',
  '个人中心.html','企业定向库.html','动态.html','商务礼仪.html','商务礼仪面试.html',
  '四级备考.html','四级词汇.html','场景话术库.html','央国企笔试.html','学习博客.html',
  '学习工作台.html','工具.html','时政热点.html','申论刷题.html','管理员.html',
  '行测刷题.html','设置.html','错题本.html','面试题库.html','高情商表达.html'
];
const AI_NAV = '<div class="nav-item" onclick="location.href=\'AI.html\'">';
const out = [];
let bad = 0;
for (const name of FILES) {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
  const aiPos = src.indexOf(AI_NAV);
  const nl = src.indexOf('<div class="nav-list"');
  const navOpen = src.indexOf('<nav class="sidebar"');
  const secAfter = src.indexOf('class="nav-section"', nl);
  const ok = aiPos > nl && aiPos > navOpen && aiPos < secAfter && (secAfter - aiPos) < 200;
  if (!ok) bad++;
  out.push([name, 'ai@' + aiPos, 'navlist@' + nl, 'navOpen@' + navOpen, 'sec@' + secAfter, 'gap=' + (secAfter - aiPos), ok ? 'OK' : '<<< MISPLACED'].join('  '));
}
out.push('---- 错位=' + bad);
fs.writeFileSync(path.join(ROOT, 'tools/qa/_nav_verify3.txt'), out.join('\n'), 'utf8');
console.log('bad=' + bad);
