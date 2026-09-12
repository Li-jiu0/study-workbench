/**
 * tools/qa/ed_t05_smoke_0912.js —— 批次五 T05 · jsdom 冒烟（寇豆码 / engineer，2026-09-12）
 *
 * 目的（主理人自检第 5 项）：T04 铺完图标 + T05 bump 完版本号之后，
 * 关键页面在真实 DOM 环境里加载必须「零未捕获异常」，且侧栏图标全部渲染成 SVG。
 *
 * 覆盖 10 个关键页（含 CRLF / LF 两种行尾、单行 nav / 多行 nav 两种写法）：
 *   学习工作台.html / 设置.html / 个人中心.html / 工具.html / 更多.html
 *   私聊.html / 动态.html / blog_wechat.html / 错题本.html / 四级备考.html
 *
 * 断言：
 *   A. 页面加载后 window.LUCIDE_ICONS 存在且 ≥14 个 key（icon-map.js 跑起来了）
 *   B. 侧栏每个 .nav-icon 内都注入了 svg（数量相等）
 *   C. 每个 svg 含 viewBox="0 0 24 24" + stroke="currentColor" + fill="none"
 *   D. .nav-icon 的 textContent 为空（emoji 已被替换，非语义 emoji 残留）
 *   E. 零未捕获异常（jsdomError / window error / unhandledRejection）
 *
 * 运行：node tools/qa/ed_t05_smoke_0912.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 * 退出码：0 = 全通过；1 = 有失败；2 = 崩溃
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM, VirtualConsole } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
const QA_PORT = 8143;

const PAGES = [
  '学习工作台.html', '设置.html', '个人中心.html', '工具.html', '更多.html',
  '私聊.html', '动态.html', 'blog_wechat.html', '错题本.html', '四级备考.html'
];

/** 离线环境下必然出现的噪音（无后端 / jsdom 无 fetch），不计入「未捕获异常」 */
const BENIGN = [
  /fetch not available in jsdom test/i,
  /Failed to load resource/i,
  /Not implemented: navigation/i,
  /Could not parse CSS/i
];

let pass = 0;
let fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label + (detail ? '  -> ' + detail : '')); }
  else {
    fail++; FAILS.push(label + (detail ? ' | ' + detail : ''));
    console.log('  FAIL  ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : ''));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found: ' + req.url); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

function loadPage(file, wait) {
  // 剥掉缓存版本号：本地静态服务按 '?' 截断，同时也验证「去掉 token 也能跑」
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/(\?|&)v=202\d{5}[a-z]/g, '');
  return new Promise((resolve) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push('[jsdomError] ' + (e && (e.message || e))));
    vc.on('error', (e) => errors.push('[console.error] ' + (e && (e.message || e))));
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:' + QA_PORT + '/' + encodeURIComponent(file),
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) {
        if (window.Element && window.Element.prototype &&
            typeof window.Element.prototype.scrollTo !== 'function') {
          window.Element.prototype.scrollTo = function () {};
        }
        if (!window.localStorage) {
          const mem = {};
          window.localStorage = {
            getItem: (k) => (k in mem ? mem[k] : null),
            setItem: (k, v) => { mem[k] = String(v); },
            removeItem: (k) => { delete mem[k]; },
            clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); }
          };
        }
        if (!window.fetch) {
          window.fetch = function () {
            return Promise.reject(new TypeError('fetch not available in jsdom test'));
          };
        }
      }
    });
    dom.window.addEventListener('error', (e) => {
      errors.push('[window.error] ' + (e && (e.message || e.type)));
    });
    dom.window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      errors.push('[unhandledRejection] ' + (r && (r.message || r) || e));
    });
    setTimeout(() => resolve({ dom, w: dom.window, d: dom.window.document, errors }), wait || 4000);
  });
}

(async function main() {
  await new Promise((res) => server.listen(QA_PORT, '127.0.0.1', res));
  await sleep(200);

  console.log('批次五 T05 · jsdom 冒烟（零未捕获异常 + 侧栏 SVG 全渲染）');
  console.log('覆盖 ' + PAGES.length + ' 个关键页\n');

  const benignHits = [];
  for (const file of PAGES) {
    console.log('----- ' + file + ' -----');
    const r = await loadPage(file, 4000);
    const { w, d } = r;

    // A. icon-map.js 已执行
    const icons = w.LUCIDE_ICONS || {};
    check('[' + file + '] window.LUCIDE_ICONS 已加载且 ≥14 个 key',
      Object.keys(icons).length >= 14, '实际=' + Object.keys(icons).length);

    // B. 每个 .nav-icon 内都有 svg
    const navIcons = Array.from(d.querySelectorAll('.nav-icon'));
    let svgTotal = 0;
    navIcons.forEach((n) => { svgTotal += n.querySelectorAll('svg').length; });
    check('[' + file + '] 侧栏 .nav-icon 数 ' + navIcons.length + ' 与其中 svg 总数相等',
      navIcons.length > 0 && svgTotal === navIcons.length,
      'nav-icon=' + navIcons.length + ' svg=' + svgTotal);

    // C. svg 标准属性
    const bad = [];
    navIcons.forEach((n) => {
      const s = n.querySelector('svg');
      if (!s) { bad.push('(无 svg)'); return; }
      if (s.getAttribute('viewBox') !== '0 0 24 24') bad.push('viewBox=' + s.getAttribute('viewBox'));
      else if (s.getAttribute('stroke') !== 'currentColor') bad.push('stroke=' + s.getAttribute('stroke'));
      else if (s.getAttribute('fill') !== 'none') bad.push('fill=' + s.getAttribute('fill'));
    });
    check('[' + file + '] 所有 nav-icon svg 含 viewBox/stroke=currentColor/fill=none',
      bad.length === 0, bad.slice(0, 3).join(' | '));

    // D. nav-icon 文本为空（emoji 已替换）
    const leftover = navIcons.filter((n) => (n.textContent || '').trim().length > 0);
    check('[' + file + '] 所有 .nav-icon textContent 为空（emoji 已清空）',
      leftover.length === 0,
      leftover.length ? leftover.slice(0, 2).map((n) => n.outerHTML.slice(0, 60)).join(' | ') : '');

    // E. 零未捕获异常（过滤离线环境噪音）
    const real = r.errors.filter((e) => !BENIGN.some((re) => re.test(e)));
    r.errors.filter((e) => BENIGN.some((re) => re.test(e))).forEach((e) => benignHits.push(file + ': ' + e));
    check('[' + file + '] 零未捕获异常', real.length === 0,
      real.length ? real.slice(0, 3).join(' || ') : '');

    console.log('');
  }

  console.log('===== 汇总 =====');
  console.log('通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项');
  if (FAILS.length) { console.log('失败清单：'); FAILS.forEach((f) => console.log('  - ' + f)); }
  console.log('\n离线环境已知噪音（不计失败）' + benignHits.length + ' 条：');
  [...new Set(benignHits.map((b) => b.split(': ')[1]))].slice(0, 6)
    .forEach((b) => console.log('  - ' + b));

  fs.writeFileSync(path.join(__dirname, '_t05_smoke.txt'),
    '通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项\n' +
    (FAILS.length ? '失败清单：\n' + FAILS.map((f) => '  - ' + f).join('\n') : '无失败项 ✅') +
    '\n离线噪音 ' + benignHits.length + ' 条（不计失败）\n', 'utf8');

  server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.log('CRASH: ' + (e && (e.stack || e.message || e)));
  try { server.close(); } catch (_) { /* noop */ }
  process.exit(2);
});
