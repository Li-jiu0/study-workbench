
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlPath = process.argv[2];
const html = fs.readFileSync(htmlPath, 'utf8');

const events = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { events.push('JSDOM_ERR:' + (e && e.message)); });
vc.on('error', (...a) => { events.push('CONSOLE_ERR:' + a.join(' ')); });

// 关键：file:// 语义。jsdom 默认 url 为 about:blank；用 file URL 让 location.protocol==='file:'
const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

// 拦截资源加载：本地 script 读文件，fetch 记录
const resources = new (require('jsdom').ResourceLoader)();
const realFetchScripts = [];
resources.fetch = function(url, options) {
  // url 可能是 file:///... 形式
  let p = url.replace('file:///', '');
  try { p = decodeURIComponent(p); } catch(e) {}
  if (fs.existsSync(p)) {
    return Promise.resolve(Buffer.from(fs.readFileSync(p)));
  }
  return Promise.resolve(Buffer.from(''));
};

const dom = new JSDOM(html, {
  url: fileUrl,
  runScripts: 'dangerously',
  resources: resources,
  virtualConsole: vc,
  pretendToBeVisual: true,
  beforeParse(window) {
    // 记录脚本执行顺序：hook defineProperty 不现实；改记录 getApiBase 取值时机通过 fetch
    window.__order = [];
    // 记录 fetch 请求
    window.fetch = function(u, o) {
      window.__order.push('FETCH:' + u + '|base=' + (window.STUDY_API_BASE===undefined?'undef':JSON.stringify(window.STUDY_API_BASE)) + '|getApiBase=' + (typeof window.getApiBase==='function'? window.getApiBase() : 'no-fn'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({version:'1.24', versionCode:1, apkUrl:'', apkReady:false, notes:[]}) });
    };
    window.XMLHttpRequest = function(){ this.open=function(){}; this.send=function(){}; this.setRequestHeader=function(){}; };
    window.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){} };
  }
});

// 等 DOMContentLoaded + 微任务
setTimeout(() => {
  const w = dom.window;
  const out = {
    protocol: w.location.protocol,
    STUDY_API_BASE: w.STUDY_API_BASE,
    STUDY_API_SERVER: w.STUDY_API_SERVER,
    has_getApiBase: typeof w.getApiBase,
    has_XTUpdate: typeof w.XTUpdate,
    CURRENT_VERSION: w.XTUpdate ? w.XTUpdate.CURRENT_VERSION : null,
    fetch_order: w.__order,
    desc: (function(){ var e=w.document.getElementById('xtUpdateDesc'); return e?e.textContent:null; })(),
    events: events
  };
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
  process.exit(0);
}, 1500);
