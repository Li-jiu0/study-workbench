// QA(Edward) 独立页面加载体检 —— 用【本地文件】起 http 服务，绝不打线上（线上还是旧版）
// 用法: node tools/qa/_ed_local_page_check.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const PORT = 8731;
const OUT = 'C:\\Users\\ATM\\_ed_page_check.txt';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/' || p === '') p = '/学习工作台.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + p);
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

const out = [];
const P = s => out.push(s);

async function check(target, keys) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? String(e.message).split('\n')[0].slice(0, 220) : e)));
  vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 220)));

  const url = 'http://127.0.0.1:' + PORT + '/' + encodeURIComponent(target);
  let html;
  try {
    html = await new Promise((resolve, reject) => {
      http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve(b)); }).on('error', reject);
    });
  } catch (e) { P('  FETCH_FAIL ' + e.message); return; }

  const dom = new JSDOM(html, {
    url: url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // 掐断一切外网请求（避免打到生产后端），走离线降级路径
      window.fetch = () => Promise.reject(new Error('QA_BLOCKED_OFFLINE'));
      if (!window.crypto) window.crypto = {};
      if (!window.crypto.randomUUID) window.crypto.randomUUID = () => require('crypto').randomUUID();
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 2500));

  P('---- ' + target + ' ----');
  P('  html bytes = ' + html.length);
  P('  body.textContent len = ' + (w.document.body ? (w.document.body.textContent || '').length : 'NO_BODY'));
  P('  title = ' + (w.document.title || ''));
  // 关键内容
  for (const k of keys) {
    const live = (w.document.body ? (w.document.body.textContent || '') : '').indexOf(k) >= 0;
    P('  KEY[' + k + '] 运行时DOM=' + live);
  }
  // 卡片统计
  P('  .card=' + w.document.querySelectorAll('.card').length
    + '  [class*=card]=' + w.document.querySelectorAll('[class*=card]').length
    + '  button=' + w.document.querySelectorAll('button').length
    + '  script=' + w.document.querySelectorAll('script').length);
  // 404 资源
  const errs = logs.filter(l => /404|Failed to load|Not found/i.test(l));
  P('  资源404类错误 = ' + errs.length);
  errs.slice(0, 5).forEach(e => P('     ' + e));
  // 运行时错误（排除 jsdom 导航限制）
  const real = logs.filter(l => !/Not implemented: navigation/i.test(l));
  P('  运行时错误 = ' + real.length);
  real.slice(0, 8).forEach(e => P('     ' + e));
  try { dom.window.close(); } catch (e) { }
  P('');
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  P('本地静态服务已启动 http://127.0.0.1:' + PORT + '  根目录=' + ROOT);
  P('');

  const pages = [
    ['社区.html', ['互动广场', '发贴', '笔记']],
    ['英语.html', ['词汇', '听力', '阅读']],
    ['行测.html', ['行测', '刷题']],
    ['表达.html', ['场景', '话术']],
    ['面测.html', ['面试', '礼仪']],
    ['演示.html', ['PPT', '版式']],
    ['学习工作台.html', ['社区', '英语', '行测', '表达', '面测', '演示', '倒计时', '添加倒计时']],
    ['更多.html', ['互动广场', '我的发贴']],
    ['学途.html', ['笔记广场']]
  ];
  for (const [p, k] of pages) {
    try { await check(p, k); } catch (e) { P('---- ' + p + ' ---- EXCEPTION ' + e.message); }
  }

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  server.close();
  process.exit(0);
})();
