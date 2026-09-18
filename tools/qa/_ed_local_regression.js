// QA(Edward) 本地全站回归：多页加载 + 底部导航「互动广场」跳转目标 + 悬浮球点击/拖动
// 全程只读本地文件，不打线上
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const PORT = 8733;
const OUT = 'C:\\Users\\ATM\\_ed_local_regression.txt';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/学习工作台.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

const out = []; const P = s => out.push(s);

async function load(target, wait) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on('jsdomError', e => logs.push('ERR: ' + (e && e.message ? String(e.message).split('\n')[0].slice(0, 200) : e)));
  vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 200)));
  const url = 'http://127.0.0.1:' + PORT + '/' + encodeURIComponent(target);
  const html = await new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = () => Promise.reject(new Error('QA_BLOCKED'));
      if (!w.crypto) w.crypto = {};
      if (!w.crypto.randomUUID) w.crypto.randomUUID = () => require('crypto').randomUUID();
    }
  });
  await new Promise(r => setTimeout(r, wait || 2200));
  return { dom, w: dom.window, logs, html };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  // ---------- A. 多页加载 ----------
  const pages = ['学习工作台.html', '社区.html', '英语.html', '行测.html', '表达.html', '面测.html', '演示.html',
    '更多.html', '学途.html', '工具.html', '个人中心.html', '设置.html',
    '行测刷题.html', '商务礼仪.html', '四级词汇.html', '面试题库.html', 'blog_wechat.html'];
  P('=== A. 本地多页加载 ===');
  for (const pg of pages) {
    try {
      const { w, logs } = await load(pg);
      const real = logs.filter(l => !/Not implemented: navigation/i.test(l));
      const bodyLen = w.document.body ? (w.document.body.textContent || '').length : -1;
      P('  ' + pg.padEnd(16) + ' bodyLen=' + String(bodyLen).padStart(6)
        + '  navigateTo=' + typeof w.navigateTo
        + '  [onclick]=' + w.document.querySelectorAll('[onclick]').length
        + '  错误=' + real.length + (real.length ? '  << ' + real[0].slice(0, 120) : ''));
    } catch (e) { P('  ' + pg + '  EXC ' + e.message); }
  }
  P('');

  // ---------- B. 底部导航「互动广场」跳转目标 ----------
  P('=== B. 底部导航「互动广场」条目跳转目标 ===');
  for (const pg of ['学习工作台.html', '社区.html', '更多.html', '设置.html', '演示.html']) {
    try {
      const { w } = await load(pg);
      const items = w.document.querySelectorAll('.bottom-more-item, .bm-label');
      let hit = 0;
      items.forEach(n => {
        const t = (n.textContent || '').trim();
        if (t === '互动广场' || t.indexOf('互动广场') >= 0) {
          hit++;
          const host = n.closest('[onclick]') || n.parentElement;
          P('    ' + pg + ' -> onclick=' + (host ? host.getAttribute('onclick') : '-'));
        }
      });
      if (!hit) P('    ' + pg + ' -> 未找到「互动广场」条目');
      // gotoBlogMine 实际行为
      if (typeof w.gotoBlogMine === 'function') {
        P('    ' + pg + ' gotoBlogMine 存在');
      }
    } catch (e) { P('    ' + pg + ' EXC ' + e.message); }
  }
  P('');

  // ---------- C. 悬浮球 ----------
  P('=== C. 悬浮球（本地 学习工作台.html）===');
  {
    const { w, logs } = await load('学习工作台.html', 3000);
    const sels = ['#aiFab', '#ai-fab', '.ai-fab', '#aiBall', '[id*=fab]', '[class*=fab]'];
    let ball = null, used = '';
    for (const s of sels) { try { const el = w.document.querySelector(s); if (el) { ball = el; used = s; break; } } catch (e) { } }
    P('  悬浮球: ' + (ball ? '找到 (' + used + ') id=' + ball.id + ' class=' + ball.className : '未找到'));
    if (ball) {
      const before = (ball.style.left || '') + ',' + (ball.style.top || '');
      ball.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
      w.document.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 140, clientY: 160 }));
      w.document.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, clientX: 140, clientY: 160 }));
      await new Promise(r => setTimeout(r, 300));
      const after = (ball.style.left || '') + ',' + (ball.style.top || '');
      P('  拖动位移: "' + before + '" -> "' + after + '"  ' + (before !== after ? '✅有变化' : '❌无变化'));
      // 点击
      let clickErr = null;
      try {
        ball.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 800));
      } catch (e) { clickErr = e.message; }
      P('  点击异常 = ' + (clickErr || '无'));
      const panel = w.document.querySelector('#aiPanel, #ai-panel, .ai-panel, [id*=aiPanel]');
      P('  AI 面板: ' + (panel ? '存在 id=' + panel.id + ' class=' + panel.className : '未找到'));
    }
    const real = logs.filter(l => !/Not implemented: navigation/i.test(l));
    P('  运行时错误 = ' + real.length);
    real.slice(0, 6).forEach(e => P('    ' + e));
  }

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  server.close();
  process.exit(0);
})();
