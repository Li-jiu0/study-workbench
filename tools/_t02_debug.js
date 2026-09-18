const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));
const BASE = 'D:/下载的文件/学习工作台';
function load(win, f) { win.eval(fs.readFileSync(path.join(BASE, f), 'utf8')); }
(async function () {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const calls = [];
  Object.defineProperty(win, 'fetch', { value: function (url, opts) { calls.push(String(url)); return Promise.reject(new Error('x')); }, configurable: true, writable: true });
  load(win, 'assets/ai-config.js');
  load(win, 'assets/ai-cap-registry.js');
  ['assets/ai-cap-audio.js', 'assets/ai-cap-embed.js', 'assets/ai-cap-image.js', 'assets/ai-cap-vision.js', 'assets/ai-cap-translate.js', 'assets/ai-cap-video.js', 'assets/ai-cap-3d.js'].forEach(f => load(win, f));
  load(win, 'assets/ai-service.js');
  const m = win.AI_SERVICE.findModel('glm-4v-flash');
  console.log('findModel(glm-4v-flash) =', JSON.stringify(m));
  const cap = win.XT_AI_CAPS.byType('image');
  console.log('byType(image).key =', cap && cap.key, ' typeof probe =', typeof (cap && cap.probe));
  const r = await win.aiHealthCheck('glm-4v-flash', { apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'sk-x' });
  console.log('result =', JSON.stringify(r));
  console.log('fetch calls =', JSON.stringify(calls));
})();
