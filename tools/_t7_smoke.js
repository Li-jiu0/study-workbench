// 任务七本地冒烟：起一个 127.0.0.1 静态服务，用 jsdom 加载本地（非远端）页面，
// 检查首页 AI 卡片与 关于.html 的运行时表现。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/学习工作台.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

const TARGETS = [
  { page: '学习工作台.html', keys: ['小助手', '全能学习助手', '暖心学伴', '已接入 AI'] },
  { page: '关于.html', keys: ['关于', '星途', 'v2.2', '免责'] },
];

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + server.address().port;
  const out = [];
  for (const t of TARGETS) {
    const vc = new VirtualConsole();
    const logs = [];
    vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
    vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 200)));
    const url = new URL('/' + encodeURIComponent(t.page), ORIGIN).href;
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, t.page), 'utf8'), {
      url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    });
    const w = dom.window;
    await new Promise(r => setTimeout(r, 2500));
    out.push('===== ' + t.page + ' =====');
    out.push('typeof callAI = ' + typeof w.callAI + ' | typeof AI_CONFIG = ' + typeof w.AI_CONFIG);
    out.push('typeof showAbout = ' + typeof w.showAbout + ' | typeof showAboutDialog = ' + typeof w.showAboutDialog);
    if (typeof w.AI_PARTNERS !== 'undefined') {
      out.push('AI_PARTNERS = ' + JSON.stringify((w.AI_PARTNERS || []).map(p => p.id + '/' + p.name + '/' + p.tag)));
    }
    const bar = w.document.getElementById('aiPartnerBar');
    out.push('#aiPartnerBar = ' + (bar ? JSON.stringify((bar.textContent || '').replace(/\s+/g, ' ').trim()) : '(null)'));
    const qb = w.document.getElementById('aiQuickBar');
    out.push('#aiQuickBar 按钮数 = ' + (qb ? qb.querySelectorAll('button').length : '(null)') +
      (qb ? ' => ' + Array.prototype.map.call(qb.querySelectorAll('button'), b => b.textContent).join(' | ') : ''));
    out.push('#aiSubtitle = ' + (w.document.getElementById('aiSubtitle') || {}).textContent);
    out.push('#aiModeBadge = ' + (w.document.getElementById('aiModeBadge') || {}).textContent);
    for (const k of t.keys) {
      out.push('  key「' + k + '」 静态=' + (fs.readFileSync(path.join(ROOT, t.page), 'utf8').indexOf(k) >= 0) +
        ' 运行时=' + ((w.document.body.textContent || '').indexOf(k) >= 0));
    }
    out.push('  共用DOM: countdownModal=' + !!w.document.getElementById('countdownModal') +
      ' toast=' + !!w.document.getElementById('toast') +
      ' aiFab=' + !!w.document.getElementById('aiFab') +
      ' aiPanel=' + !!w.document.getElementById('aiPanel') +
      ' morePanel=' + !!w.document.getElementById('morePanel') +
      ' toolsPanel=' + !!w.document.getElementById('toolsPanel') +
      ' .more-overlay=' + w.document.querySelectorAll('.more-overlay').length);
    out.push('  运行时错误: ' + (logs.filter(l => l.indexOf('Not implemented') < 0).slice(0, 8).join(' ;; ') || '(无)'));
    out.push('');
    dom.window.close();
  }
  out.push('---- 关于.html 底部导航顺序 ----');
  const ab = fs.readFileSync(path.join(ROOT, '关于.html'), 'utf8');
  const labs = (ab.match(/bn-label">([^<]+)</g) || []).map(s => s.replace(/bn-label">/, '').replace('<', ''));
  out.push(labs.join(' → '));
  fs.writeFileSync('C:\\Users\\ATM\\_t7_smoke_out.txt', out.join('\n'), 'utf8');
  console.log('DONE');
  server.close();
  process.exit(0);
})();
