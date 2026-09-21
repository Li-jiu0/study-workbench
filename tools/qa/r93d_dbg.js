/* R93-4 debug: dump aiMessages after legacy row click */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'D:/下载的文件/学习工作台';
const OUT = [];
const OLD_VID_URL = 'https://ark-content-generation.tos-cn-beijing.volces.com/old-999.mp4?X-Tos-Expires=123';
let html = fs.readFileSync(path.join(ROOT, 'AI.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/AI.html', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window; const doc = w.document;
w.fetch = function () { return new Promise(function () {}); };
w.alert = function () {}; w.confirm = function () { return false; };
w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'));
w.localStorage.setItem('ai_chat_history', JSON.stringify([
  { id: 'legacy-1', title: '旧视频会话', updated: 1, messages: [
    { role: 'user', content: '生成一只跑动的猫' },
    { role: 'ai', content: '🎬 视频已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + OLD_VID_URL }
  ]}
]));
w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));
setTimeout(function () {
  try {
    const rows = doc.querySelectorAll('.ai-hist-item-row');
    OUT.push('rows=' + rows.length);
    for (let i = 0; i < rows.length; i++) { OUT.push('row' + i + ' text=' + rows[i].textContent.slice(0, 40)); }
    if (rows.length) { rows[0].click(); }
    const lm = doc.getElementById('aiMessages');
    OUT.push('--- aiMessages.innerHTML after click ---');
    OUT.push(lm ? lm.innerHTML : 'NO #aiMessages');
  } catch (e) { OUT.push('EXC ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93d_dbg.txt'), OUT.join('\n'), 'utf8');
}, 400);
