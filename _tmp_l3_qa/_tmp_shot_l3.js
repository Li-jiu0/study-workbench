'use strict';
/* L3 真浏览器截图 + 几何量测（Chrome headless + CDP，内置 http 静态服务） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = 'D:\\下载的文件\\学习工作台';
const OUT = path.join(ROOT, '_tmp_shots');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\ATM\\AppData\\Local\\Temp\\xt_l3_chrome';
const SRV_PORT = 8899;
const DBG_PORT = 9333;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------- static server ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/AI.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, function (err, buf) {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

function getJson(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function (r) {
      let b = '';
      r.on('data', function (d) { b += d; });
      r.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function putJson(url) {
  return new Promise(function (resolve, reject) {
    const req = http.request(url, { method: 'PUT' }, function (r) {
      let b = '';
      r.on('data', function (d) { b += d; });
      r.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

/* ---------- CDP ---------- */
function Cdp(ws) {
  this.ws = ws; this.id = 0; this.pending = {}; this.events = [];
  const self = this;
  ws.addEventListener('message', function (ev) {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && self.pending[m.id]) { const p = self.pending[m.id]; delete self.pending[m.id]; if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result); }
    else self.events.push(m);
  });
}
Cdp.prototype.send = function (method, params) {
  const self = this; const id = ++this.id;
  return new Promise(function (res, rej) { self.pending[id] = { res: res, rej: rej }; self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); });
};
Cdp.prototype.eval = async function (expr) {
  const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  return r.result.value;
};

const FAKE_MSGS =
  'var m=document.getElementById("aiMessages");' +
  'm.innerHTML=\'<div class="ai-msg ai-msg-user"><div class="ai-bubble">这道资料分析题，增长率怎么算最快？</div><div class="ai-avatar ai-avatar-user">我</div></div>\'' +
  '+\'<div class="ai-msg ai-msg-ai"><div class="ai-avatar ai-avatar-ai">✦</div><div class="ai-bubble"><div class="ai-md"><p>先定位基期与现期，再用「增长率＝（现期－基期）÷ 基期」。资料分析里优先用估算与截位，能省一半时间。</p></div></div></div>\';' +
  'document.getElementById("aiChat").classList.add("in-conversation");' +
  'var ib=document.getElementById("aiInputBox");document.getElementById("aiDockInputSlot").appendChild(ib);';

const PROBE =
  '(function(){' +
  'function R(id){var e=document.getElementById(id);if(!e)return null;var r=e.getBoundingClientRect();return {id:id,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};}' +
  'function C(id){var e=document.getElementById(id);if(!e)return null;var s=window.getComputedStyle(e);return {display:s.display,zIndex:s.zIndex,position:s.position,background:s.backgroundColor,borderTopColor:s.borderTopColor,borderTopWidth:s.borderTopWidth,borderRadius:s.borderTopLeftRadius,boxShadow:s.boxShadow,opacity:s.opacity};}' +
  'var wrapW=document.querySelector(".ai-input-wrap");var wsl=document.getElementById("aiWelcomeInputSlot");var dsl=document.getElementById("aiDockInputSlot");' +
  'return {' +
  'viewport:{w:window.innerWidth,h:window.innerHeight},' +
  'box:R("aiInputBox"), boxStyle:C("aiInputBox"),' +
  'welcomeWrap: wsl? {w:Math.round(wsl.getBoundingClientRect().width)} : null,' +
  'dockWrap: dsl? {w:Math.round(dsl.getBoundingClientRect().width)} : null,' +
  'panel:R("aiModelPanel"), panelStyle:C("aiModelPanel"),' +
  'overlay:C("aiSidebarOverlay"),' +
  'history:C("aiHistory"),' +
  'historyTransform:(function(){var e=document.getElementById("aiHistory");return e?window.getComputedStyle(e).transform:null;})(),' +
  'historyOpen:(function(){var e=document.getElementById("aiHistory");return e?e.className:null;})(),' +
  'inConversation:(function(){var e=document.getElementById("aiChat");return e?e.className:null;})(),' +
  'boxHasFocusClass:(function(){var e=document.getElementById("aiInputBox");return e?e.className:null;})(),' +
  'sidebarModelLabel: (function(){var b=document.getElementById("aiModelInfoBtn");var l=b?b.querySelector(".ai-foot-label"):null;return l?l.textContent:null;})(),' +
  'inputModelLabel: (function(){var e=document.getElementById("aiModelLabel");return e?e.textContent:null;})(),' +
  'sidebarTitle: (function(){var b=document.getElementById("aiModelInfoBtn");return b?b.getAttribute("title"):null;})()' +
  '};})()';

async function shot(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  return name + '.png';
}

async function newPage(url) {
  const t = await putJson('http://127.0.0.1:' + DBG_PORT + '/json/new?' + encodeURIComponent(url));
  if (!t || !t.webSocketDebuggerUrl) throw new Error('no target');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(function (res, rej) { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  return { cdp: cdp, ws: ws, id: t.id };
}

async function setViewport(cdp, w, h, mobile) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile });
}

(async function main() {
  const report = [];
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  await new Promise(function (r) { server.listen(SRV_PORT, '127.0.0.1', r); });
  report.push('server up on ' + SRV_PORT);

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + DBG_PORT, '--user-data-dir=' + PROFILE,
    '--allow-file-access-from-files', '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60; i++) {
    try { ver = await getJson('http://127.0.0.1:' + DBG_PORT + '/json/version'); break; } catch (e) { await sleep(400); }
  }
  if (!ver) { report.push('CHROME_START_FAIL'); fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2)); server.close(); chrome.kill(); return; }
  report.push('chrome ' + ver.Browser);

  const OLD_CSS =
    '.ai-input-box{background:var(--ai-bg) !important;border:1px solid transparent !important;box-shadow:none !important;}' +
    '.ai-input-box.focus{background:var(--ai-card) !important;border-color:rgba(0,0,0,.06) !important;box-shadow:0 2px 12px rgba(0,0,0,.06) !important;}' +
    '.ai-chip{background:var(--ai-card) !important;}.ai-model-btn{background:var(--ai-card) !important;}';

  const scenarios = [
    { name: '1280-welcome', w: 1280, h: 860, mobile: false, setup: '' },
    { name: '1280-conv', w: 1280, h: 860, mobile: false, setup: FAKE_MSGS },
    { name: '1280-focus', w: 1280, h: 860, mobile: false, setup: FAKE_MSGS + 'document.getElementById("aiInputBox").classList.add("focus");' },
    { name: '1280-sidebar-model', w: 1280, h: 860, mobile: false, setup: FAKE_MSGS + 'document.getElementById("aiModelInfoBtn").click();' },
    { name: '375-welcome', w: 375, h: 812, mobile: true, setup: '' },
    { name: '375-conv', w: 375, h: 812, mobile: true, setup: FAKE_MSGS },
    { name: '375-focus', w: 375, h: 812, mobile: true, setup: FAKE_MSGS + 'document.getElementById("aiInputBox").classList.add("focus");' },
    { name: '375-drawer', w: 375, h: 812, mobile: true, setup: 'document.getElementById("aiMenuBtn").click();' },
    { name: '375-drawer-model', w: 375, h: 812, mobile: true, setup: 'document.getElementById("aiMenuBtn").click();document.getElementById("aiModelInfoBtn").click();' },
    { name: 'BEFORE-1280-welcome', w: 1280, h: 860, mobile: false, css: OLD_CSS, setup: '' },
    { name: 'SELECT-1280', w: 1280, h: 860, mobile: false, setup: FAKE_MSGS + 'document.getElementById("aiModelInfoBtn").click();document.querySelectorAll("#aiModelList .ai-mp-row")[2].click();' },
    { name: 'SELECT-375', w: 375, h: 812, mobile: true, setup: 'document.getElementById("aiMenuBtn").click();document.getElementById("aiModelInfoBtn").click();document.querySelectorAll("#aiModelList .ai-mp-row")[2].click();var u=document.querySelector("#aiMpDetail .ai-mp-d-use");if(u)u.click();' },
    { name: 'BEFORE-1280-after-send', w: 1280, h: 860, mobile: false, css: OLD_CSS, setup: FAKE_MSGS + 'document.getElementById("aiInputBox").classList.add("focus");' },
    { name: 'BEFORE-375-welcome', w: 375, h: 812, mobile: true, css: OLD_CSS, setup: '' },
    { name: 'BEFORE-375-after-send', w: 375, h: 812, mobile: true, css: OLD_CSS, setup: FAKE_MSGS + 'document.getElementById("aiInputBox").classList.add("focus");' }
  ];

  for (const sc of scenarios) {
    const pg = await newPage('about:blank');
    const cdp = pg.cdp;
    await setViewport(cdp, sc.w, sc.h, sc.mobile);
    // 1) 先落到同源页面（登录页不引用 app.js，不会被门禁踢走），写入登录态
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + SRV_PORT + '/%E7%99%BB%E5%BD%95.html' });
    await sleep(900);
    await cdp.eval('(function(){' +
      'localStorage.setItem("study_workbench_auth", JSON.stringify({account:"练手", loginAt: Date.now()}));' +
      'localStorage.setItem("study_workbench_last_account", "练手");' +
      'localStorage.setItem("study_workbench_user", JSON.stringify({nickname:"同学", username:"练手"}));' +
      'return localStorage.getItem("study_workbench_auth");})()');
    // 2) 再进 AI 页
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + SRV_PORT + '/AI.html' });
    await sleep(2400);
    const errs = [];
    // 收集异常
    for (const e of cdp.events) {
      if (e.method === 'Runtime.exceptionThrown') errs.push(String(e.params.exceptionDetails && e.params.exceptionDetails.text) + ' ' + String(e.params.exceptionDetails && e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description));
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') errs.push('log:' + String(e.params.entry.text) + ' @' + String(e.params.entry.url || ''));
    }
    if (sc.css) { await cdp.eval('(function(){var s=document.createElement("style");s.textContent=' + JSON.stringify(sc.css) + ';document.head.appendChild(s);return 1;})()'); await sleep(200); }
    if (sc.setup) { await cdp.eval('(function(){' + sc.setup + '})()'); await sleep(700); }
    const probe = await cdp.eval(PROBE);
    await shot(cdp, sc.name);
    report.push({ scenario: sc.name, file: sc.name + '.png', errors: errs.slice(0, 6), probe: probe });
    // 关闭标签
    try { const rq = http.get('http://127.0.0.1:' + DBG_PORT + '/json/close/' + pg.id, function () { }); rq.on('error', function () { }); } catch (e) { }
    pg.ws.close();
    await sleep(200);
  }

  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
  server.close();
  try { chrome.kill(); } catch (e) { }
  setTimeout(function () { process.exit(0); }, 500);
})().catch(function (e) {
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify({ fatal: String(e && e.stack || e) }, null, 2));
  server.close();
  setTimeout(function () { process.exit(1); }, 300);
});
