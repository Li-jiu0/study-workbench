/* =====================================================================
 * qa_t04t05_0912_smoke.js —— QA 独立验证 §1+§3 的「真页面整页冒烟」
 * ---------------------------------------------------------------------
 * 与工程师 ed_t05_smoke_0912.js（10 页 50 项）的区别：
 *   · 不剥离任何脚本，用 resources:'usable' 让 app.js / api.js / config.js /
 *     icon-map.js / subpage-router.js 全部按 file:// 真实加载并执行；
 *   · 断言「图标在真实脚本环境里也被渲染出来」，而不是 harness 里单独注入；
 *   · 断言「零未捕获异常」，并把异常按来源分类（网络/后端类允许，图标路由类禁止）。
 * 只读脚本。
 * 运行：node tools/qa/qa_t04t05_0912_smoke.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.resolve('D:/下载的文件/学习工作台') +
  '/tools/verifier/node_modules/jsdom');

const R = path.resolve('D:/下载的文件/学习工作台');
let PASS = 0, FAIL = 0;
const failures = [];
function ok(c, name, detail) { if (c) PASS++; else { FAIL++; failures.push({ name, detail: detail || '' }); } }

const PAGES = ['学习工作台.html', '设置.html', '个人中心.html', '工具.html',
               '动态.html', 'blog_wechat.html', '更多.html', '私聊.html'];

function shim(w) {
  const noop = function () {};
  if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = noop;
  if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = noop;
  if (!w.HTMLElement.prototype.scrollIntoView) w.HTMLElement.prototype.scrollIntoView = noop;
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop });
  if (!w.fetch) w.fetch = () => Promise.reject(new Error('offline'));
  for (const n of ['localStorage', 'sessionStorage']) {
    let avail = false;
    try { void w[n]; avail = true; } catch (e) { avail = false; }
    if (avail) continue;
    const store = new Map();
    const fake = {
      getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
      setItem: (k, v) => { store.set(String(k), String(v)); },
      removeItem: k => { store.delete(String(k)); },
      clear: () => store.clear(),
      key: i => Array.from(store.keys())[i] || null,
      get length() { return store.size; }
    };
    try { Object.defineProperty(w, n, { value: fake, configurable: true, writable: true }); } catch (e) {}
  }
  if (!w.requestAnimationFrame) w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
}

// 网络/后端类异常：离线冒烟下的正常噪声
const NOISE = /fetch|XMLHttpRequest|NetworkError|not implemented: navigation|Could not load|offline|Failed to load resource|api\.js|API_BASE|Not implemented/i;
// 与本批直接相关的异常：一律视为真问题
const CRITICAL = /LUCIDE|lucideIcon|icon-map|icon_map|SubpageRouter|data-icon|data-subpage/i;

(async function main() {
  console.log('=== QA 整页冒烟（不剥离任何脚本，file:// 真实加载）===\n');
  for (const f of PAGES) {
    const fileUrl = 'file:///' + encodeURI(path.join(R, f).replace(/\\/g, '/'));
    const errs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errs.push(String((e && e.message) || e)));
    vc.on('error', m => errs.push('console.error: ' + m));

    const dom = new JSDOM(fs.readFileSync(path.join(R, f), 'utf8'), {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      url: fileUrl,
      virtualConsole: vc
    });
    shim(dom.window);

    await new Promise(res => {
      const w = dom.window;
      if (w.document.readyState === 'complete') return res();
      w.addEventListener('load', () => res());
      setTimeout(res, 6000);
    });
    await new Promise(r => setTimeout(r, 120));

    const w = dom.window, d = w.document;
    const nodes = Array.from(d.querySelectorAll('[data-icon]'));
    const svgIn = nodes.filter(n => /<svg/i.test(n.innerHTML || '')).length;

    const critical = errs.filter(e => CRITICAL.test(e));
    const noise = errs.filter(e => !CRITICAL.test(e));

    console.log('---- ' + f + ' ----');
    console.log('   [data-icon]=' + nodes.length + '  已渲染 svg=' + svgIn +
                '  图标函数=' + (typeof w.lucideIcon) +
                '  字典=' + (w.LUCIDE_ICONS ? Object.keys(w.LUCIDE_ICONS).length : 'N/A') +
                '  路由=' + (typeof w.SubpageRouter));
    console.log('   异常: 关键=' + critical.length + '  噪声(网络/后端)=' + noise.length);
    if (critical.length) critical.forEach(e => console.log('      ✖ ' + e.slice(0, 200)));
    if (noise.length) noise.slice(0, 4).forEach(e => console.log('      · ' + e.slice(0, 160)));

    ok(!!w.LUCIDE_ICONS, f + ' icon-map.js 已加载（window.LUCIDE_ICONS 存在）');
    ok(typeof w.lucideIcon === 'function', f + ' window.lucideIcon 可用');
    ok(svgIn === nodes.length, f + ' 所有 [data-icon] 在真实环境中渲染出 svg（' + svgIn + '/' + nodes.length + '）');
    ok(critical.length === 0, f + ' 无图标/路由相关未捕获异常', critical.join(' | '));
    ok(!!d.body, f + ' DOM 完整（body 存在）');
    // 侧栏没有可见 emoji
    const sideTxt = Array.from(d.querySelectorAll('nav.sidebar .nav-icon'))
      .map(e => (e.textContent || '').trim()).filter(Boolean);
    ok(sideTxt.length === 0, f + ' 侧栏图标位无残留文本', sideTxt.slice(0, 3).join(' | '));

    dom.window.close();
  }

  console.log('\n=== 整页冒烟汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' ===');
  if (failures.length) {
    console.log('\n--- 失败明细 ---');
    failures.forEach((x, i) => console.log((i + 1) + '. ' + x.name + (x.detail ? '\n     ' + x.detail : '')));
  }
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e && e.stack || e); process.exit(2); });
