// 对比：用「改前备份」与「改后现状」跑同样的 r66 关键断言，判定失败是否为本改引入
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));
const BASE = 'D:/下载的文件/学习工作台';
const SERVICE = process.argv[2] || 'assets/ai-service.js';

(function () {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  Object.defineProperty(win, 'fetch', { value: undefined, configurable: true });
  const src = fs.readFileSync(path.join(BASE, 'assets/ai-config.js'), 'utf8');
  win.eval(src);
  win.eval(fs.readFileSync(path.join(BASE, SERVICE), 'utf8'));

  const PK = (function () { const re = /apiKey:\s*"([^"]+)"/g; const a = []; let m; while ((m = re.exec(src)) !== null) a.push(m[1]); return a; })();
  const r = {};
  r.serviceFile = SERVICE;
  r.findModel_glm47flash = win.AI_SERVICE.findModel('glm-4.7-flash') ? 'FOUND' : 'null';
  r.findModel_glm47 = win.AI_SERVICE.findModel('glm-4.7') ? 'FOUND' : 'null';
  // 平台密钥清洗
  const dirty = { disabled: {}, order: [], overrides: { 'glm-4.7-flash': { apiKey: PK[0], model: 'glm-4.7-flash' } }, catModels: {}, categories: [], health: {}, stars: {} };
  win.localStorage.setItem('ai_model_settings', JSON.stringify(dirty));
  const s1 = win.aiGetModelSettings();
  const e1 = s1.overrides['glm-4.7-flash'];
  r.keyStripped = !(e1 && e1.apiKey === PK[0]);
  fs.appendFileSync(path.join(BASE, 'tools/_t02_precheck_out.txt'), JSON.stringify(r) + '\n', 'utf8');
})();
