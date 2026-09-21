/* r89_qa_cdp.js — 真实 Chrome headless 布局验证（CDP 直连，无 puppeteer）
 * 用法: node r89_qa_cdp.js <targetUrlOrFile> <width> <height> <scriptFile>
 * 输出 JSON 到 stdout。
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 500);

const [, , target, W, H, scriptFile] = process.argv;
const width = parseInt(W, 10), height = parseInt(H, 10);
const userDataDir = path.join(os.tmpdir(), 'r89qa_' + process.pid + '_' + Date.now());

const profile = path.join(userDataDir, 'Default');
fs.mkdirSync(profile, { recursive: true });
// 预置 localStorage：Chrome 需要 leveldb，太复杂；改用 Page.addScriptToEvaluateOnNewDocument 注入。

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--allow-file-access-from-files',
  '--hide-scrollbars=false',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + userDataDir,
  '--window-size=' + width + ',' + height,
  'about:blank'
];

const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderrBuf = '';
chrome.stderr.on('data', d => { stderrBuf += d.toString(); });

function httpGet(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let s = '';
      r.on('data', c => s += c);
      r.on('end', () => res(s));
    }).on('error', rej);
  });
}

async function waitForDebugger() {
  for (let i = 0; i < 100; i++) {
    try {
      const v = JSON.parse(await httpGet('/json/version'));
      if (v.webSocketDebuggerUrl) return v.webSocketDebuggerUrl;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('debugger not ready; stderr=' + stderrBuf.slice(0, 2000));
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else res(m.result);
      } else if (m.method) events.push(m);
    };
    ws.onerror = e => reject(new Error('ws error'));
    ws.onopen = () => resolve({
      send(method, params, sid) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          const msg = { id: mid, method, params: params || {} };
          if (sid) msg.sessionId = sid;
          ws.send(JSON.stringify(msg));
        });
      },
      events,
      close() { ws.close(); }
    });
  });
}

(async () => {
  const out = { url: target, viewport: { width, height }, ok: false };
  let c;
  try {
    const wsUrl = await waitForDebugger();
    c = await cdp(wsUrl);

    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => c.send(m, p, sessionId);

    await S('Page.enable');
    await S('Runtime.enable');

    await S('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: true
    });

    const preload = fs.readFileSync(path.join(__dirname, 'r89_qa_preload.js'), 'utf8');
    await S('Page.addScriptToEvaluateOnNewDocument', { source: preload });

    const loadP = new Promise(res => {
      const t = setInterval(() => {
        const ev = c.events.find(e => e.method === 'Page.loadEventFired');
        if (ev) { clearInterval(t); res(); }
      }, 50);
      setTimeout(() => { clearInterval(t); res(); }, 15000);
    });

    await S('Page.navigate', { url: target });
    await loadP;
    await new Promise(r => setTimeout(r, 900));

    let script = fs.readFileSync(scriptFile, 'utf8');
    const rv = await S('Runtime.evaluate', {
      expression: script, returnByValue: true, awaitPromise: true
    });
    if (rv.exceptionDetails) {
      out.exception = JSON.stringify(rv.exceptionDetails).slice(0, 3000);
    } else {
      out.result = rv.result.value;
      out.ok = true;
    }
  } catch (e) {
    out.error = String(e && e.stack || e).slice(0, 3000);
    out.chromeStderr = stderrBuf.slice(0, 2000);
  } finally {
    try { if (c) c.close(); } catch (e) { }
    try { chrome.kill(); } catch (e) { }
  }
  fs.writeFileSync(path.join(__dirname, 'r89_qa_cdp_out.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})();
