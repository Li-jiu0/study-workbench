/* QA 冒烟（E1 图标全站升级）——jsdom 真加载 + 静态源码断言（node 视角，写日志到文件）
 * 覆盖：E1 批次实际修改的 15 个页面（学习工作台.html 零替换未改动，不在列）
 * 断言（每页）：
 *   A. 静态源码：0 个 ?v=20260913g 残留；损伤 pattern \?v=20260913h"[^>\s] 0 命中；
 *      4 类容器中不再出现「本批已映射」的 emoji；data-icon span 数量 > 0
 *   B. jsdom 加载：0 scriptErrors / 0 uncaught / 0 jsdomError / boundaryHit=0
 *   C. DOM：countdownModal 全套完整；[data-icon] 元素 ≥5 且 icon-map autoRender 后至少 1 个渲染出 SVG
 * 运行：node tools/qa/qa_e1_icon_smoke.js  （结果同步写入 tools/qa/e1_smoke_log.txt）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

const PAGES = [
  'blog_wechat.html', 'PPT案例拆解.html', 'PPT版式库.html', 'PPT训练.html',
  '万能金句库.html', '动态.html', '商务礼仪.html', '商务礼仪面试.html',
  '四级词汇.html', '场景话术库.html', '更多.html', '私聊.html',
  '面试题库.html', '错题本.html', '行测刷题.html',
];

// E1 已映射的 emoji（迁移脚本同表；这些必须已从 4 类容器中消失）
const MAPPED = ['🏠', '💬', '👤', '🧰', '☰', '📊', '📒', '📚', '⚙\uFE0F', 'ℹ\uFE0F', '🎙\uFE0F',
  '📖', '🔍', '🔎', '📝', '✏\uFE0F', '👥', '🌏', '✅', '🔥', '⏱\uFE0F', '🕒', '📋', '🔒',
  '⭐', '🏆', '🎧', '🗑\uFE0F'];
const RE_CONTAINER = /<div class="(?:bn-icon|bm-icon|mpc-icon)"[^>]*>([^<>]+)<\/div>|<span class="title-icon"[^>]*>([^<>]+)<\/span>/g;

function staticChecks(html) {
  const fail = [];
  const gLeft = (html.match(/\?v=20260913g/g) || []).length;
  if (gLeft > 0) fail.push('v=g残留x' + gLeft);
  const dmg = (html.match(/\?v=20260913h"[^>\s]/g) || []).length;
  if (dmg > 0) fail.push('损伤pattern命中x' + dmg + ': ' + (html.match(/\?v=20260913h"[^>\s]/g) || []).join(''));
  let m;
  const leftEmoji = [];
  RE_CONTAINER.lastIndex = 0;
  while ((m = RE_CONTAINER.exec(html))) {
    const inner = ((m[1] || m[2]) || '').trim();
    if (MAPPED.indexOf(inner) !== -1) leftEmoji.push(inner);
  }
  if (leftEmoji.length) fail.push('已映射emoji残留x' + leftEmoji.length + ': ' + leftEmoji.slice(0, 5).join(','));
  const iconCount = (html.match(/data-icon="/g) || []).length;
  if (iconCount === 0) fail.push('无 data-icon');
  return { fail, iconCount };
}

function extractScripts(html) {
  const ext = [];
  const inline = [];
  const reExt = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = reExt.exec(html))) ext.push(m[1].split('?')[0]);
  const reIn = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = reIn.exec(html))) inline.push(m[1]);
  return { ext, inline };
}

async function loadPage(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const stat = staticChecks(html);
  const { ext, inline } = extractScripts(html);

  const issues = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (/Could not load|Not implemented|Could not parse CSS/.test(e.message)) return;
    issues.push('jsdomError: ' + e.message);
  });
  vc.on('error', (...a) => issues.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));

  const dom = new JSDOM(html, {
    url: 'https://example.test/' + encodeURIComponent(file),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() }));
      // jsdom 不实现 fetch：真实浏览器必有，补 stub 以免误报「fetch is not defined」
      if (typeof window.fetch !== 'function') {
        window.fetch = function () { return Promise.reject(new Error('qa-stub-offline')); };
      }
    },
  });
  const { window } = dom;
  const ctx = dom.getInternalVMContext();

  const uncaught = [];
  window.addEventListener('error', (e) => uncaught.push('window.error: ' + (e && e.message ? e.message : '?')));
  window.addEventListener('unhandledrejection', (e) => uncaught.push('unhandledrejection: ' + (e && e.reason ? e.reason : '?')));

  const scriptErrors = [];
  for (const rel of ext) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { issues.push('缺失脚本: ' + rel); continue; }
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); }
    catch (e) { scriptErrors.push(rel + ': ' + e.message); }
  }
  try {
    vm.runInContext('window.xtToast = function(type){ if(type==="error"){ window.__qaBoundaryHit=(window.__qaBoundaryHit||0)+1; } };', ctx, { filename: 'qa-toast-stub' });
  } catch (_) {}

  inline.forEach((code, i) => {
    try { vm.runInContext(code, ctx, { filename: file + '#inline' + (i + 1) }); }
    catch (e) { scriptErrors.push('inline#' + (i + 1) + ': ' + e.message); }
  });

  try {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    window.dispatchEvent(new window.Event('load', { bubbles: true }));
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 900));

  const doc = window.document;
  const dataIcons = Array.from(doc.querySelectorAll('[data-icon]'));
  const svgRendered = dataIcons.filter((el) => el.querySelector('svg')).length;
  const cdOk = !!doc.getElementById('countdownModal') && !!doc.getElementById('cdName') && !!doc.getElementById('cdDate');

  const checks = [
    ['静态: 无v=g残留/无损伤/已映射emoji清零/data-icon>0', stat.fail.length === 0],
    ['jsdom: 0 scriptErrors/0 uncaught/0 issues', scriptErrors.length === 0 && uncaught.length === 0 && issues.length === 0],
    ['boundaryHit=0', (window.__qaBoundaryHit || 0) === 0],
    ['countdownModal 全套完整', cdOk],
    ['[data-icon] 元素≥5 且 SVG 已渲染', dataIcons.length >= 5 && svgRendered >= 1],
  ];
  return { file, checks, stat, scriptErrors, uncaught, issues, dataIcons: dataIcons.length, svgRendered };
}

(async () => {
  const out = [];
  let fail = 0;
  out.push('=========== QA 冒烟：E1 图标全站升级（' + PAGES.length + ' 页） ===========');
  for (const f of PAGES) {
    let r;
    try { r = await loadPage(f); }
    catch (e) { out.push('--- ' + f + ' : 异常 ' + e.message + ' ---'); fail++; continue; }
    const bad = r.checks.filter(([, ok]) => !ok);
    if (bad.length) fail++;
    out.push('\n--- ' + f + ' : ' + (bad.length ? 'FAIL' : 'PASS') + ' ---  [data-icon]=' + r.dataIcons + ' svgRendered=' + r.svgRendered);
    for (const [label, ok] of r.checks) out.push('  [' + (ok ? 'OK' : 'XX') + '] ' + label);
    if (r.stat.fail.length) out.push('  静态明细: ' + r.stat.fail.join(' | '));
    if (r.scriptErrors.length) out.push('  scriptErrors: ' + r.scriptErrors.join(' | '));
    if (r.uncaught.length) out.push('  uncaught: ' + r.uncaught.join(' | '));
    if (r.issues.length) out.push('  issues: ' + r.issues.join(' | '));
  }
  out.push('\n=========== E1 冒烟: ' + (fail === 0 ? 'ALL PASS' : 'FAIL=' + fail) + ' ===========');
  fs.writeFileSync(path.join(__dirname, 'e1_smoke_log.txt'), out.join('\n'), 'utf8');
  process.exit(fail > 0 ? 1 : 0);
})();
