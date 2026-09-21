const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const FILES = ['PPT训练.html', '个人中心.html', '动态.html'];
const AI_NAV = '<div class="nav-item" onclick="location.href=\'AI.html\'">';
const inline = ' <div class="nav-item" onclick="location.href=\'AI.html\'"> <span class="nav-icon" data-icon="sparkles"></span><span>AI</span> </div> ';
const out = [];
for (const name of FILES) {
  const file = path.join(ROOT, name);
  let src = fs.readFileSync(file, 'utf8');
  // 1) 删除误插到 <nav class="sidebar"> 之外的多行块
  const mis = new RegExp('\\n?[ \\t]*' + AI_NAV.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,160}?<\\/div>[ \\t]*\\n?');
  let removed = 0;
  // 只删除位于 nav-list 之前的那一处
  const nl = src.indexOf('<div class="nav-list"');
  const head = src.slice(0, nl);
  const mRE = new RegExp('\\n?[ \\t]*' + AI_NAV.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,200}?<\\/div>[ \\t]*\\n?', 'g');
  const newHead = head.replace(mRE, function (mm) { removed++; return '\n'; });
  if (removed !== 1) { out.push(name + ' !! remove count=' + removed); continue; }
  src = newHead + src.slice(nl);
  // 2) 在 nav-list 之后第一个 nav-section 标签前内联插入
  const nl2 = src.indexOf('<div class="nav-list"');
  const secRel = src.slice(nl2, nl2 + 4000).indexOf('<div class="nav-section"');
  if (secRel < 0) { out.push(name + ' !! nav-section not found'); continue; }
  const pos = nl2 + secRel;
  src = src.slice(0, pos) + inline + src.slice(pos);
  fs.writeFileSync(file, src, 'utf8');
  out.push(name + ' fixed');
}
fs.writeFileSync(path.join(ROOT, 'tools/qa/_nav_fix2_report.txt'), out.join('\n'), 'utf8');
console.log(out.join(' | '));
