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
const out = [];
let bad = 0;
for (const name of FILES) {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
  const aiBlocks = src.match(/<div class="bottom-nav-item"[^>]*AI\.html'[^>]*>.*?<\/div>\s*<\/div>/g) || [];
  const navBlocks = src.match(/<div class="nav-item" onclick="location\.href='AI\.html'">[\s\S]{0,160}?<\/div>/g) || [];
  const s1 = aiBlocks.length === 1 && /sparkles/.test(aiBlocks[0]);
  const s2 = navBlocks.length === 1 && /sparkles/.test(navBlocks[0]) && /<span>AI<\/span>/.test(navBlocks[0]);
  const empty = /class="bn-icon"><\/div>/.test(src);
  const ok = s1 && s2 && !empty;
  if (!ok) bad++;
  out.push([name, 'bnAI=' + aiBlocks.length + '/sparkles=' + s1, 'navAI=' + navBlocks.length + '/ok=' + s2, 'emptyIcon=' + empty, ok ? 'OK' : '<<< CHECK'].join('  '));
  if (!ok) { out.push('BN>> ' + (aiBlocks[0] || 'none')); out.push('NAV>> ' + (navBlocks[0] || 'none')); }
}
out.push('---- 异常=' + bad);
fs.writeFileSync(path.join(ROOT, 'tools/qa/_nav_verify2.txt'), out.join('\n'), 'utf8');
console.log('bad=' + bad);
