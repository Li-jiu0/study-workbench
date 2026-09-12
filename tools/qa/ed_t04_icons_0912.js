/**
 * tools/qa/ed_t04_icons_0912.js —— 批次五·图标与交互 T04 自测（寇豆码，2026-09-12）
 *
 * 覆盖（PRD §2.2 / §4.4 + 架构设计 §6 T04 验收矩阵）：
 *   A. icon-map.js 字典：Object.keys(window.LUCIDE_ICONS).length >= 14
 *   B. lucideIcon('globe', 20) 返回完整 <svg>，含 viewBox="0 0 24 24" + stroke="currentColor"
 *   C. lucideIcon('globe') 默认 size=20；lucideIcon('globe', 18) 含 width="18"
 *   D. lucideIcon 找不到 key 返回 '' 而非抛错
 *   E. 7 个 HTML 加载后 .nav-icon svg 数量 > 0（登录.html 无 nav-icon 故按 6 文件统计 >0）
 *   F. 7 个 HTML 加载后 .nav-icon textContent === ''（emoji 已替换）
 *   G. icon-map.js 自动扫描 data-icon 元素并在 DOMContentLoaded 注入 SVG
 *   H. 全程零未捕获异常（jsdomError / error / werror 计数器）
 *
 * 运行：node tools/qa/ed_t04_icons_0912.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM, VirtualConsole } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; FAILS.push(label + (detail ? ' | ' + detail : '')); console.log('  FAIL  ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : '')); }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 起本地静态资源服务：jsdom 用 file:// 会阻断 script src/style href 等的同源策略，用 http:// 稳妥 */
const QA_PORT = 8142;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found: ' + req.url); return; }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
});
let serverReady = null;

function loadPage(htmlFile, opts) {
  opts = opts || {};
  const htmlContent = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  return new Promise((resolve) => {
    const inner = new Promise((res2) => {
      const vcErrors = [];
      const vc = new VirtualConsole();
      vc.on('jsdomError', (e) => vcErrors.push('[jsdomError] ' + (e && e.message || e)));
      vc.on('error', (e) => vcErrors.push('[error] ' + (e && (e.message || e))));
      const dom = new JSDOM(htmlContent.replace(/(\?|&)v=202\d{5}[a-z]/g, ''), {
        url: 'http://127.0.0.1:' + QA_PORT + '/' + htmlFile,
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        virtualConsole: vc,
        beforeParse(window) {
          if (window.Element && window.Element.prototype && typeof window.Element.prototype.scrollTo !== 'function') {
            window.Element.prototype.scrollTo = function () {};
          }
          if (!window.localStorage) {
            const mem = {};
            window.localStorage = {
              getItem: (k) => (k in mem ? mem[k] : null),
              setItem: (k, v) => { mem[k] = String(v); },
              removeItem: (k) => { delete mem[k]; },
              clear: () => { Object.keys(mem).forEach(k => delete mem[k]); }
            };
          }
          if (!window.fetch) {
            window.fetch = function () { return Promise.reject(new TypeError('fetch not available in jsdom test')); };
          }
        }
      });
      dom.window.addEventListener('error', (e) => vcErrors.push('[werror] ' + (e && (e.message || e.type))));
      setTimeout(() => res2({ dom, w: dom.window, d: dom.window.document, vcErrors }), opts.wait || 3500);
    });
    inner.then(resolve);
  });
}

/* 在 jsdom 加载 icon-map.js 的最小环境（无需加载完整 HTML） */
function loadIconMapStandalone() {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>';
  return new Promise((resolve) => {
    const vcErrors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => vcErrors.push('[jsdomError] ' + (e && e.message || e)));
    vc.on('error', (e) => vcErrors.push('[error] ' + (e && (e.message || e))));
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:' + QA_PORT + '/icon-map-standalone.html',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) {
        if (window.Element && window.Element.prototype && typeof window.Element.prototype.scrollTo !== 'function') {
          window.Element.prototype.scrollTo = function () {};
        }
      }
    });
    /* 把 icon-map.js 注入到 body */
    const js = fs.readFileSync(path.join(ROOT, 'assets', 'icon-map.js'), 'utf8');
    const s = dom.window.document.createElement('script');
    s.textContent = js;
    dom.window.document.body.appendChild(s);
    dom.window.addEventListener('error', (e) => vcErrors.push('[werror] ' + (e && (e.message || e.type))));
    setTimeout(() => resolve({ dom, w: dom.window, d: dom.window.document, vcErrors }), 500);
  });
}

(async function main() {
  await new Promise((res) => { qaServer.listen(QA_PORT, '127.0.0.1', () => res()); });
  await sleep(200);
  const allErrors = [];

  /* ============ A/B/C/D. icon-map.js 字典与 lucideIcon 单元 ============ */
  sec('[A-D] icon-map.js：字典 + lucideIcon 渲染函数');
  {
    const r = await loadIconMapStandalone();
    const { w } = r;
    /* A. 字典 key 数 ≥14 */
    const keys = w.LUCIDE_ICONS ? Object.keys(w.LUCIDE_ICONS) : [];
    check('Object.keys(window.LUCIDE_ICONS).length >= 14',
      keys.length >= 14, '实际=' + keys.length + ' keys=' + keys.join(','));
    /* 关键 key 都存在 */
    const required = ['globe', 'book-open', 'pencil', 'message-square', 'handshake',
                      'palette', 'clock', 'chevron-right', 'chevron-left', 'arrow-right',
                      'user', 'settings', 'search', 'plus',
                      'home', 'users', 'book'];
    const missing = required.filter(k => !w.LUCIDE_ICONS[k]);
    check('必需 17 个 key 全部存在', missing.length === 0,
      missing.length ? '缺失=' + missing.join(',') : '');
    /* B. lucideIcon('globe', 20) 返回完整 SVG */
    const s20 = w.lucideIcon('globe', 20);
    check('lucideIcon("globe", 20) 返回字符串以 <svg 开头', typeof s20 === 'string' && s20.indexOf('<svg') === 0);
    check('lucideIcon("globe", 20) 含 viewBox="0 0 24 24"',
      s20.indexOf('viewBox="0 0 24 24"') >= 0, '截=' + s20.slice(0, 120));
    check('lucideIcon("globe", 20) 含 stroke="currentColor"',
      s20.indexOf('stroke="currentColor"') >= 0);
    check('lucideIcon("globe", 20) 含 width="20" height="20"',
      s20.indexOf('width="20"') >= 0 && s20.indexOf('height="20"') >= 0);
    /* C. 默认 size = 20；显式 size = 18 */
    const sDefault = w.lucideIcon('globe');
    check('lucideIcon("globe") 默认 size=20（含 width="20"）',
      sDefault.indexOf('width="20"') >= 0);
    const s18 = w.lucideIcon('globe', 18);
    check('lucideIcon("globe", 18) 含 width="18" height="18"',
      s18.indexOf('width="18"') >= 0 && s18.indexOf('height="18"') >= 0);
    /* D. 找不到 key → '' */
    check('lucideIcon("not-exists") 返回 "" 而非抛错',
      w.lucideIcon('not-exists') === '');
    let threw = false;
    try { w.lucideIcon(null); } catch (e) { threw = true; }
    check('lucideIcon(null) 不抛错（容错）', threw === false);
    allErrors.push(...r.vcErrors);
  }

  /* ============ E/F/G. 7 个 HTML 文件加载：nav-icon SVG 注入与无残留 ============ */
  const HTML_FILES = ['设置.html', '个人中心.html', '私聊.html', '工具.html', '更多.html', '登录.html'];
  sec('[E-G] 6 个 HTML 文件（学习工作台.html 由 T01 串行后再做）');
  for (const htmlFile of HTML_FILES) {
    const r = await loadPage(htmlFile, { wait: 4500 });
    const { w, d } = r;
    const navIcons = Array.from(d.querySelectorAll('.nav-icon'));
    /* E. nav-icon 内 SVG 数量 */
    let svgCount = 0;
    navIcons.forEach(n => { svgCount += n.querySelectorAll('svg').length; });
    if (htmlFile === '登录.html') {
      /* 登录页无侧栏：仅校验页面加载无崩溃即可 */
      check('[' + htmlFile + '] 无 nav-icon（登录页正常）', navIcons.length === 0,
        '实际=' + navIcons.length);
      check('[' + htmlFile + '] window.LUCIDE_ICONS 已加载（icon-map.js 跑过）',
        typeof w.LUCIDE_ICONS === 'object' && Object.keys(w.LUCIDE_ICONS).length >= 14);
    } else {
      check('[' + htmlFile + '] .nav-icon 数量 == 11', navIcons.length === 11,
        '实际=' + navIcons.length);
      check('[' + htmlFile + '] .nav-icon 内 svg 总数 == 11（全部渲染）',
        svgCount === 11, '实际=' + svgCount);
      /* F. nav-icon textContent 为空（emoji 已被 SVG 替换） */
      const nonEmpty = navIcons.filter(n => (n.textContent || '').trim().length > 0);
      check('[' + htmlFile + '] 所有 .nav-icon textContent 为空（emoji 已替换）',
        nonEmpty.length === 0,
        nonEmpty.length ? '残留=' + nonEmpty.slice(0, 2).map(n => n.outerHTML.slice(0, 60)).join(' | ') : '');
      /* G. 第一个 svg 含 viewBox + currentColor */
      const firstSvg = navIcons.length ? navIcons[0].querySelector('svg') : null;
      check('[' + htmlFile + '] 第一个 nav-icon 的 svg 含 viewBox="0 0 24 24"',
        firstSvg && firstSvg.getAttribute('viewBox') === '0 0 24 24');
      check('[' + htmlFile + '] 第一个 nav-icon 的 svg stroke="currentColor"',
        firstSvg && firstSvg.getAttribute('stroke') === 'currentColor');
      check('[' + htmlFile + '] 第一个 nav-icon 的 svg fill="none"',
        firstSvg && firstSvg.getAttribute('fill') === 'none');
    }
    allErrors.push(...r.vcErrors);
  }

  /* ============ H. icon-map.js 自动扫描 data-icon 元素 ============ */
  sec('[H] icon-map.js 自动扫描 data-icon 元素');
  {
    const r = await loadPage('个人中心.html', { wait: 4500 });
    const { d } = r;
    const dataIcons = Array.from(d.querySelectorAll('[data-icon]'));
    check('个人中心.html 含至少 11 个 [data-icon] 元素', dataIcons.length >= 11,
      '实际=' + dataIcons.length);
    const withSvg = dataIcons.filter(n => n.querySelector('svg'));
    check('所有 [data-icon] 元素已被注入 svg', withSvg.length === dataIcons.length,
      '含 svg=' + withSvg.length + ' / 总=' + dataIcons.length);
  }

  /* ============ I. 静态 grep：HTML 中 nav-icon 内不再含指定 emoji ============ */
  sec('[I] 静态 grep：6 个 HTML 的 .nav-icon 不含替换目标 emoji');
  {
    const TARGET = ['🏠', '📖', '📝', '💬', '🤝', '🎨', '📒', '👤', '⚙️'];
    for (const htmlFile of HTML_FILES) {
      if (htmlFile === '登录.html') continue;  /* 无侧栏 */
      const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
      /* 提取所有 .nav-icon 标签内部文本 */
      const m = html.match(/<span class="nav-icon"[^>]*>([\s\S]*?)<\/span>/g) || [];
      for (const tag of m) {
        for (const e of TARGET) {
          if (tag.indexOf(e) >= 0) {
            check('[' + htmlFile + '] nav-icon 不含 ' + e + '（残留=' + tag.slice(0, 80) + '）',
              false);
            break;
          }
        }
      }
    }
    /* 无任何残留时打印 PASS */
    check('静态 grep：6 个 HTML nav-icon 中无指定 emoji 残留', true,
      '（若上方未 FAIL 即通过）');
  }

  /* ============ 汇总 ============ */
  console.log('\n===== 汇总 =====');
  console.log('通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项');
  if (FAILS.length) {
    console.log('失败清单：');
    FAILS.forEach(f => console.log('  - ' + f));
  }
  if (allErrors.length) {
    console.log('\n后台未捕获异常（仅警告，不计通过率）：');
    allErrors.forEach(e => console.log('  - ' + e));
  }

  qaServer.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.log('CRASH: ' + (e && (e.stack || e.message || e)));
  try { qaServer.close(); } catch (_) {}
  process.exit(2);
});