// QA(Edward) 深度检查：首页功能中心 DOM 链接 / 更多页卡片 / recentMap 命中 / 更多页语法错误定位
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const PORT = 8732;
const OUT = 'C:\\Users\\ATM\\_ed_deep_check.txt';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/学习工作台.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

const out = []; const P = s => out.push(s);

async function load(target) {
  const vc = new VirtualConsole();
  const logs = [];
  vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ').slice(0, 400) : e)));
  vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));
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
  await new Promise(r => setTimeout(r, 2500));
  return { dom, w: dom.window, logs, html };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  // ---------- 1) 首页功能中心 ----------
  {
    const { w, logs } = await load('学习工作台.html');
    const nav = w.document.getElementById('homeQuickNav');
    P('=== 1) 首页 #homeQuickNav ===');
    P('  存在 = ' + !!nav);
    if (nav) {
      const as = nav.querySelectorAll('a.hq-it');
      P('  a.hq-it 数量 = ' + as.length);
      as.forEach(a => {
        P('    href=' + (a.getAttribute('href') || '') + '  text=' + (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
      });
      P('  --- 整个 nav 文本 ---');
      P('  ' + (nav.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500));
    }
    // 倒计时
    const row = w.document.getElementById('countdownRow');
    P('');
    P('=== 2) 首页 #countdownRow ===');
    P('  存在 = ' + !!row + '  子元素数=' + (row ? row.children.length : 0));
    if (row) {
      row.querySelectorAll('.countdown-card').forEach((c, i) => {
        P('  card#' + i + ' class="' + c.getAttribute('class') + '"');
        P('    name=' + ((c.querySelector('.countdown-name') || {}).textContent || '-')
          + '  days=' + ((c.querySelector('.countdown-days') || {}).textContent || '-')
          + '  date=' + ((c.querySelector('.countdown-date') || {}).textContent || '-'));
      });
      const add = row.querySelector('.countdown-add');
      P('  .countdown-add 存在=' + !!add + ' 文本=' + (add ? add.textContent.replace(/\s+/g, ' ').trim() : '-'));
      P('  .countdown-add onclick=' + (add ? add.getAttribute('onclick') : '-'));
      P('  typeof openCountdownModal = ' + typeof w.openCountdownModal);
    }
    P('  首页运行时错误 = ' + logs.filter(l => !/navigation/i.test(l)).length);
    P('');
  }

  // ---------- 3) recentMap 命中模拟 ----------
  {
    const { w } = await load('学习工作台.html');
    P('=== 3) recentMap → HOME_DEF 命中模拟 ===');
    try {
      const homeDef = w.HOME_DEF || w.eval('HOME_DEF');
      const recentMap = { '社区.html': 'blog', '私聊.html': 'chat', '行测刷题.html': 'exam', '面试题库.html': 'iv', '四级词汇.html': 'cet', '英语.html': 'cet', '设置.html': 'settings', '个人中心.html': 'settings' };
      P('  HOME_DEF = ' + JSON.stringify(homeDef.map(d => d.k)));
      Object.keys(recentMap).forEach(n => {
        const def = homeDef.find(d => d.k === recentMap[n]);
        P('  ' + n + ' -> recentMap=' + recentMap[n] + ' -> HOME_DEF命中=' + (def ? ('YES (k=' + def.k + ', t=' + def.t + ', url=' + def.url + ')') : 'NO  <<< 死条目'));
      });
    } catch (e) { P('  EXC ' + e.message); }
  }
  P('');

  // ---------- 4) 更多页 互动广场 卡片 ----------
  {
    const { w, html, logs } = await load('更多.html');
    P('=== 4) 更多.html 互动广场卡片 ===');
    const nodes = w.document.querySelectorAll('.mpc-title, .bm-label');
    let found = 0;
    nodes.forEach(n => {
      if ((n.textContent || '').indexOf('互动广场') >= 0) {
        found++;
        const host = n.closest('[onclick]') || n.parentElement;
        P('  命中: onclick=' + (host ? host.getAttribute('onclick') : '-') + '  标签=' + (host ? host.tagName : '-'));
      }
    });
    P('  静态HTML里 gotoBlogMine 出现次数 = ' + (html.match(/gotoBlogMine/g) || []).length);
    P('  typeof gotoBlogMine = ' + typeof w.gotoBlogMine);
    P('');
    P('=== 5) 更多.html 语法错误定位 ===');
    logs.filter(l => !/navigation/i.test(l)).forEach(l => P('  ' + l));
    // 列出所有 script src
    P('  --- 更多.html 脚本清单 ---');
    w.document.querySelectorAll('script[src]').forEach(s => P('    src=' + s.getAttribute('src')));
    P('  内联 script 块数 = ' + w.document.querySelectorAll('script:not([src])').length);
    w.document.querySelectorAll('script:not([src])').forEach((s, i) => {
      const t = (s.textContent || '').trim();
      P('    内联#' + i + ' 长度=' + t.length + ' 首40字符=' + t.slice(0, 40).replace(/\s+/g, ' '));
    });
  }

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  server.close();
  process.exit(0);
})();
