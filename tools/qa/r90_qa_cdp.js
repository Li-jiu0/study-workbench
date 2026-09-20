/* r90_qa_cdp.js — R90 QA 真实 Chrome 布局验证（CDP 直连，无 puppeteer）
 *
 * 独立性声明：由 R90 QA 独立编写（参考 CDP 协议用法，未复用 r89 脚本逻辑）。
 *
 * 用法: node r90_qa_cdp.js <fileUrl> <width> <height> <probeFile> [preloadFile]
 *   probeFile   : 在页面内 eval 的 JS 表达式文件，须 return 一个 JSON 可序列化值
 *   preloadFile : 可选，页面加载前注入的脚本（如登录态种子）
 * 输出: JSON 到 stdout
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9700 + Math.floor(Math.random() * 400);

const [, , target, W, H, probeFile, preloadFile] = process.argv;
const width = parseInt(W, 10), height = parseInt(H, 10);
const userDataDir = path.join(os.tmpdir(), 'r90qa_' + process.pid + '_' + Date.now());
const profile = path.join(userDataDir, 'Default');
fs.mkdirSync(profile, { recursive: true });

const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking',
  '--allow-file-access-from-files',
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
      let s = ''; r.on('data', c => s += c); r.on('end', () => res(s));
    }).on('error', rej);
  });
}

async function waitForDebugger() {
  for (let i = 0; i < 120; i++) {
    try {
      const v = JSON.parse(await httpGet('/json/version'));
      if (v.webSocketDebuggerUrl) return v.webSocketDebuggerUrl;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('debugger not ready; stderr=' + stderrBuf.slice(0, 1500));
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const evHandlers = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) {
        evHandlers.forEach(h => { try { h(m); } catch (e) { } });
      }
    };
    ws.onerror = e => reject(new Error('ws error ' + (e && e.message)));
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const mid = ++id; pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
        });
      },
      on(fn) { evHandlers.push(fn); },
      close() { try { ws.close(); } catch (e) { } }
    });
  });
}

(async function main() {
  let out = { ok: false };
  let client = null;
  try {
    const wsUrl = await waitForDebugger();
    // 取一个 page target
    const targets = JSON.parse(await httpGet('/json/list'));
    const page = targets.find(t => t.type === 'page');
    if (!page) { throw new Error('no page target'); }
    client = await cdp(page.webSocketDebuggerUrl);
    const send = client.send.bind(client);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: width, height: height, deviceScaleFactor: 1, mobile: false
    });

    if (preloadFile && fs.existsSync(preloadFile)) {
      const src = fs.readFileSync(preloadFile, 'utf8');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    }

    const loaded = new Promise(res => {
      client.on(m => { if (m.method === 'Page.loadEventFired') res(); });
      setTimeout(res, 8000);
    });
    await send('Page.navigate', { url: target });
    await loaded;
    await new Promise(r => setTimeout(r, 900));

    const probeSrc = fs.readFileSync(probeFile, 'utf8');
    const r = await send('Runtime.evaluate', {
      expression: '(function(){ ' + probeSrc + ' })()',
      returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      out = { ok: false, exception: JSON.stringify(r.exceptionDetails).slice(0, 3000) };
    } else {
      out = { ok: true, value: r.result && r.result.value, viewport: { w: width, h: height } };
    }
  } catch (e) {
    out = { ok: false, error: String(e && e.message || e), stderr: stderrBuf.slice(0, 800) };
  } finally {
    try { if (client) client.close(); } catch (e) { }
    try { chrome.kill(); } catch (e) { }
  }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
