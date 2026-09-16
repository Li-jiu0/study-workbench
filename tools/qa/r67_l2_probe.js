// 探针：确认 jsdom 外部执行下 ai-page.js 的 init 是否运行
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, 'AI.html'), 'utf8');
const srcs = ['assets/ai-config.js', 'assets/ai-presets.js', 'assets/ai-service.js', 'assets/ai-page.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/AI.html', pretendToBeVisual: true });
const w = dom.window, doc = w.document;
w.fetch = function () { return Promise.reject(new Error('x')); };
console.log('readyState before eval =', doc.readyState);
try { srcs.forEach(s => w.eval(s)); console.log('eval all OK'); } catch (e) { console.log('EVAL THROW:', e.message); }
console.log('readyState after eval =', doc.readyState);
console.log('setMemoryList exists =', !!doc.getElementById('setMemoryList'));
console.log('aiCtxUsage text =', JSON.stringify(doc.getElementById('aiCtxUsage').textContent));
console.log('aiCtxUsage title =', JSON.stringify(doc.getElementById('aiCtxUsage').getAttribute('title')));
// 手动补发 DOMContentLoaded，看 init 是否补跑
doc.dispatchEvent(new w.Event('DOMContentLoaded'));
console.log('after manual DOMContentLoaded: setMemoryList =', !!doc.getElementById('setMemoryList'));
doc.getElementById('aiInput').value = '中'.repeat(455);
doc.getElementById('aiInput').dispatchEvent(new w.Event('input', { bubbles: true }));
console.log('after input: aiCtxUsage text =', JSON.stringify(doc.getElementById('aiCtxUsage').textContent));
