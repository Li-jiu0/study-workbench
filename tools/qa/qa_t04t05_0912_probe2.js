/* qa_t04t05_0912_probe2.js —— 细节勘察：裸 assets 引用 / 注入脚本位置 / emoji 残留 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.resolve('D:/下载的文件/学习工作台');

const EXCL = (b) => b === 'settings.html' || /^settings_.*\.html$/.test(b) || /^profile.*\.html$/.test(b) || b === '设置_旧版.html';
const formal = fs.readdirSync(R).filter(f => /\.html?$/i.test(f) && !EXCL(f));

console.log('=== 裸 assets 引用（无 ?v=）上下文 ===');
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const lines = s.split(/\r?\n/);
  lines.forEach((ln, i) => {
    const m = ln.match(/assets\/[A-Za-z0-9_\-.]+\.(?:js|css)(?!\?v=)/g);
    if (m) console.log(f + ':' + (i + 1) + '  [' + m.join(',') + ']  ' + ln.trim().slice(0, 200));
  });
}

console.log('\n=== icon-map.js 注入位置 ===');
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const lines = s.split(/\r?\n/);
  lines.forEach((ln, i) => {
    if (ln.includes('icon-map.js')) console.log(f + ':' + (i + 1) + '  ' + ln.trim().slice(0, 200));
  });
}

console.log('\n=== 侧栏 nav-item 区块样例（学习工作台.html）===');
{
  const s = fs.readFileSync(path.join(R, '学习工作台.html'), 'utf8');
  const i = s.indexOf('sidebar');
  console.log(s.slice(Math.max(0, i - 300), i + 2200));
}
