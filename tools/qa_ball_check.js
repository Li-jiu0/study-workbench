/* 临时自检脚本：加载首页，输出运行时错误 + 机器人球 / 留言板 / 卡片状态
   用法：
     node tools/qa_ball_check.js                 -> 加载 http://110.42.134.62/学习工作台.html（线上）
     node tools/qa_ball_check.js local           -> 起本地静态服务，加载磁盘上的 学习工作台.html（读取已修改的 app.js）
*/
const path = require('path');
const http = require('http');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom');

const useLocal = process.argv[2] === 'local';
const ROOT = 'D:/下载的文件/学习工作台';
const LOCAL_PAGE = '/学习工作台.html';
const REMOTE_URL = 'http://110.42.134.62/学习工作台.html';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p;
      try { p = decodeURIComponent(req.url.split('?')[0].split('#')[0]); } catch (e) { p = req.url; }
      const file = path.join(ROOT, p);
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const OUT = path.join(__dirname, '_ball_check_out.txt');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('[jsdomError] ' + (e && e.message) + ' || ' + (e && e.detail && e.detail.stack ? String(e.detail.stack).split('\n').slice(0, 6).join(' <- ') : '')));
vc.on('error', (...a) => errors.push('[console.error] ' + a.map(String).join(' ').slice(0, 400)));

const opts = {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.fetch = () => Promise.reject(new Error('fetch-stub'));   // 模拟后端不可用
    win.TextDecoder = win.TextDecoder || require('util').TextDecoder;
    win.TextEncoder = win.TextEncoder || require('util').TextEncoder;
    win.AbortController = win.AbortController || function () { this.signal = {}; this.abort = function () {}; };
    if (!win.crypto) win.crypto = {};
    if (!win.crypto.randomUUID) win.crypto.randomUUID = () => 'uuid-' + Math.random().toString(16).slice(2);
    win.addEventListener('error', ev => {
      errors.push('[window.error] ' + (ev.message || ev) + ' @' + (ev.filename || '') + ':' + (ev.lineno || ''));
    });
  }
};

function run() {
  return useLocal
    ? startServer().then(srv => {
      const port = srv.address().port;
      return JSDOM.fromURL('http://127.0.0.1:' + port + encodeURI(LOCAL_PAGE), opts)
        .then(dom => ({ dom: dom, srv: srv, url: 'http://127.0.0.1:' + port + LOCAL_PAGE }));
    })
    : JSDOM.fromURL(REMOTE_URL, opts).then(dom => ({ dom: dom, srv: null, url: REMOTE_URL }));
}

run().then(async res => {
  const srv = res.srv, url = res.url, dom = res.dom;
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 12000));
  const out = [];
  out.push('=== URL: ' + url + (useLocal ? '  (本地静态服务，读取磁盘上已修改的 app.js)' : '  (线上服务器版本)'));
  const fab = doc.getElementById('aiFab');
  out.push('aiFab exists: ' + !!fab);
  if (fab) out.push('  inline style: left=' + (fab.style.left || '(empty)') + ' top=' + (fab.style.top || '(empty)') + ' bottom=' + (fab.style.bottom || '(empty)'));
  out.push('window.initAiFabDrag: ' + (typeof win.initAiFabDrag));
  out.push('window.restoreAiFabPos: ' + (typeof win.restoreAiFabPos));
  out.push('toggleAiPanel: ' + (typeof win.toggleAiPanel));
  out.push('renderBoard: ' + (typeof win.renderBoard));
  out.push('api: ' + (typeof win.api));

  out.push('--- 交互模拟 ---');
  if (fab) {
    // 点击打开面板（干净状态下的一次点击）
    try {
      const pnl0 = doc.getElementById('aiPanel');
      if (pnl0) pnl0.classList.remove('open');
      fab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      const pnl = doc.getElementById('aiPanel');
      out.push('  click-open -> aiPanel.open=' + (pnl ? pnl.classList.contains('open') : '(no panel)'));
      fab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      out.push('  click-again -> aiPanel.open=' + (pnl ? pnl.classList.contains('open') : '(no panel)'));
    } catch (e) { out.push('  click-open ERR ' + e.message); }
    // mouse 拖拽
    try {
      fab.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 400, button: 0 }));
      fab.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 330, button: 0 }));
      win.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
      out.push('  mouse-drag -> left=' + (fab.style.left || '(empty)') + ' top=' + (fab.style.top || '(empty)'));
    } catch (e) { out.push('  mouse-drag ERR ' + e.message); }
    // touch 拖拽
    try {
      const mk = (type, x, y) => {
        const ev = new win.Event(type, { bubbles: true, cancelable: true });
        ev.touches = [{ clientX: x, clientY: y }];
        return ev;
      };
      fab.dispatchEvent(mk('touchstart', 100, 500));
      fab.dispatchEvent(mk('touchmove', 60, 440));
      fab.dispatchEvent(mk('touchend', 60, 440));
      out.push('  touch-drag -> left=' + (fab.style.left || '(empty)') + ' top=' + (fab.style.top || '(empty)'));
    } catch (e) { out.push('  touch-drag ERR ' + e.message); }
    await new Promise(r => setTimeout(r, 700));
    try {
      fab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      const pnl = doc.getElementById('aiPanel');
      out.push('  click-after-drag(>600ms) -> aiPanel.open=' + (pnl ? pnl.classList.contains('open') : '(no panel)'));
    } catch (e) { out.push('  click-after-drag ERR ' + e.message); }
  }

  const bl = doc.getElementById('boardList');
  out.push('boardList exists: ' + !!bl + ' textLen=' + (bl ? (bl.textContent || '').trim().length : -1));
  if (bl) out.push('  boardList text: ' + JSON.stringify((bl.textContent || '').trim().slice(0, 160)));
  const hq = doc.getElementById('homeQuickNav');
  out.push('homeQuickNav(功能中心/更多功能卡片): ' + (hq ? ('len=' + (hq.textContent || '').trim().length + ' items=' + hq.querySelectorAll('a.hq-it').length) : '(缺失)'));
  out.push('[class*=card] count: ' + doc.querySelectorAll('[class*=card]').length);
  out.push('[class*=bottom-more-item] count: ' + doc.querySelectorAll('[class*=bottom-more-item]').length);
  out.push('--- runtime errors (' + errors.length + ') ---');
  errors.slice(0, 40).forEach((e, i) => out.push((i + 1) + '. ' + e.slice(0, 400)));
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('written');
  win.close();
  if (srv) { try { srv.close(); } catch (e) { /* 忽略 */ } }
  // force exit: 页面里可能有轮询定时器
  setTimeout(function () { process.exit(0); }, 100);
}).catch(e => {
  fs.writeFileSync(OUT, 'FATAL: ' + e.message + '\n' + e.stack, 'utf8');
  console.log('fatal written');
  setTimeout(function () { process.exit(1); }, 100);
});
