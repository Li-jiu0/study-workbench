// QA(Edward) 本地悬浮球验证（与 ball_verify.js 同款 touch 事件序列，但读本地文件）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const PORT = 8734;
const OUT = 'C:\\Users\\ATM\\_ed_local_ball.txt';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/学习工作台.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});
const out = []; const P = s => out.push(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const logs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => logs.push('ERR: ' + (e && e.message ? String(e.message).split('\n')[0].slice(0, 200) : e)));
  vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 200)));
  const url = 'http://127.0.0.1:' + PORT + '/' + encodeURIComponent('学习工作台.html');
  const html = await new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = () => Promise.reject(new Error('QA_BLOCKED'));
      if (!w.crypto) w.crypto = {};
      if (!w.crypto.randomUUID) w.crypto.randomUUID = () => require('crypto').randomUUID();
    }
  });
  const w = dom.window;
  await sleep(4000);

  P('typeof callAI=' + typeof w.callAI + '   typeof navigateTo=' + typeof w.navigateTo);
  const sels = ['#aiFab', '#ai-fab', '.ai-fab', '#aiBall', '[id*=fab]', '[class*=fab]'];
  let ball = null, used = '';
  for (const s of sels) { try { const el = w.document.querySelector(s); if (el) { ball = el; used = s; break; } } catch (e) { } }
  P('悬浮球: ' + (ball ? '找到 (' + used + ') id=' + ball.id + ' class=' + ball.className : '未找到'));
  if (ball) {
    const before = w.getComputedStyle(ball).visibility + '|' + (ball.style.display || '');
    ball.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(1200);
    const after = w.getComputedStyle(ball).visibility + '|' + (ball.style.display || '');
    P('点击前后样式: ' + before + '  ->  ' + after);

    const mk = (type, x, y) => {
      const t = { identifier: 1, target: ball, clientX: x, clientY: y, pageX: x, pageY: y };
      const ev = new w.Event(type, { bubbles: true, cancelable: true });
      ev.touches = type === 'touchend' ? [] : [t];
      ev.changedTouches = [t];
      ev.targetTouches = type === 'touchend' ? [] : [t];
      return ev;
    };
    const pos0 = (ball.style.left || '') + ',' + (ball.style.top || '');
    ball.dispatchEvent(mk('touchstart', 300, 600));
    ball.dispatchEvent(mk('touchmove', 220, 480));
    ball.dispatchEvent(mk('touchend', 220, 480));
    await sleep(600);
    const pos1 = (ball.style.left || '') + ',' + (ball.style.top || '');
    P('拖动位移: ' + pos0 + '  ->  ' + pos1 + (pos0 !== pos1 ? '  ✅位置有变化' : '  ⚠️位置未变'));
  }
  const body = (w.document.body.textContent || '').replace(/\s+/g, ' ');
  P('[class*=card] 数量=' + w.document.querySelectorAll('[class*=card]').length);
  P('body 文本长度=' + body.length);
  P('首页是否含 6 个新卡名: ' + ['社区', '英语', '行测', '表达', '面测', '演示'].map(k => k + '=' + (body.indexOf(k) >= 0)).join(' '));
  P('旧卡名是否残留: ' + ['学习博客', '四级备考', '央国企笔试', '高情商表达', '商务礼仪面试', 'PPT训练'].map(k => k + '=' + (body.indexOf(k) >= 0)).join(' '));
  const real = logs.filter(l => !/Not implemented: navigation/i.test(l));
  P('运行时错误 = ' + real.length);
  real.slice(0, 6).forEach(e => P('  ' + e));

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  server.close();
  process.exit(0);
})();
