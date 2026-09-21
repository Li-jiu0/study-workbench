/* QA 冒烟（B3+B4 功能删减）——jsdom 快速加载验证
 * 覆盖：高情商表达.html（B3 删情景问答题卡）、工具.html（B4 删两个重复入口卡）
 * 断言：
 *   1. 两页加载零未捕获异常 / 零脚本错误 / 零 error-boundary 触发
 *   2. 高情商表达页：情景问答题卡（P0-11）已不存在；万能金句库 / 场景话术库 / 统计卡仍在
 *   3. 工具页：万能金句库.html / 场景话术库.html 两个入口已删；其余 5 个入口仍在
 *   4. data-icon 图标体系在两页均可渲染出 SVG（icon-map.js 注册表命中）
 * 运行：node tools/qa/qa_b3_b4_smoke.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

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
  // error-boundary 命中探针
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

  return {
    file,
    doc: window.document,
    scriptErrors,
    uncaught,
    issues,
    boundaryHit: window.__qaBoundaryHit || 0,
  };
}

(async () => {
  let fail = 0;
  const results = [];
  console.log('\n=========== QA 冒烟：B3 高情商表达 / B4 工具 ===========');

  // ---------- B3 高情商表达.html ----------
  {
    const r = await loadPage('高情商表达.html');
    const checks = [];
    const text = r.doc.body.textContent || '';
    checks.push(['无未捕获异常', r.uncaught.length === 0 && r.scriptErrors.length === 0 && r.issues.length === 0 && r.boundaryHit === 0]);
    checks.push(['情景问答题卡已删除（DOM 无「情景选择实战」）', text.indexOf('情景选择实战') === -1]);
    checks.push(['情景答题容器 eqQuizCard 已删除', !r.doc.getElementById('eqQuizCard')]);
    checks.push(['AI点评容器 eqAiBox 已删除', !r.doc.getElementById('eqAiBox')]);
    checks.push(['万能金句库仍存在', text.indexOf('万能金句库') !== -1]);
    checks.push(['场景话术库仍存在', text.indexOf('场景话术库') !== -1]);
    checks.push(['统计卡容器 eqStatsCard 仍存在', !!r.doc.getElementById('eqStatsCard')]);
    checks.push(['角色扮演训练页仍存在', !!r.doc.getElementById('page-roleplay-demo')]);
    checks.push(['countdownModal 全套 DOM 完整', !!r.doc.getElementById('countdownModal') && !!r.doc.getElementById('cdName') && !!r.doc.getElementById('cdDate')]);
    const penIcon = r.doc.querySelector('.feature-icon[data-icon="pen"]');
    checks.push(['data-icon 图标渲染出 SVG（pen）', !!penIcon && penIcon.querySelector('svg') !== null]);
    results.push({ name: 'B3 高情商表达.html', checks, raw: r });
  }

  // ---------- B4 工具.html ----------
  {
    const r = await loadPage('工具.html');
    const checks = [];
    const cards = Array.from(r.doc.querySelectorAll('.morepage-list .morepage-card'));
    const titles = cards.map((c) => (c.querySelector('.mpc-title') || {}).textContent || '');
    checks.push(['无未捕获异常', r.uncaught.length === 0 && r.scriptErrors.length === 0 && r.issues.length === 0 && r.boundaryHit === 0]);
    checks.push(['「万能金句」入口已删', titles.indexOf('万能金句') === -1 && !r.doc.querySelector('.morepage-card[onclick*="万能金句库.html"]')]);
    checks.push(['「场景话术」入口已删', titles.indexOf('场景话术') === -1 && !r.doc.querySelector('.morepage-card[onclick*="场景话术库.html"]')]);
    checks.push(['导入题库入口仍在', titles.indexOf('导入题库') !== -1]);
    checks.push(['PPT版式入口仍在', titles.indexOf('PPT版式') !== -1]);
    checks.push(['AI面试入口仍在', titles.indexOf('AI面试') !== -1]);
    checks.push(['四级经验入口仍在', titles.indexOf('四级经验') !== -1]);
    checks.push(['穿越英语入口仍在', titles.indexOf('穿越英语') !== -1]);
    const inboxIcon = r.doc.querySelector('.mpc-icon[data-icon="inbox"]');
    checks.push(['data-icon 图标渲染出 SVG（inbox）', !!inboxIcon && inboxIcon.querySelector('svg') !== null]);
    checks.push(['countdownModal 全套 DOM 完整', !!r.doc.getElementById('countdownModal') && !!r.doc.getElementById('cdName') && !!r.doc.getElementById('cdDate')]);
    results.push({ name: 'B4 工具.html', checks, raw: r });
  }

  for (const res of results) {
    const bad = res.checks.filter(([, ok]) => !ok);
    if (bad.length) fail++;
    console.log('\n--- ' + res.name + ' : ' + (bad.length ? 'FAIL' : 'PASS') + ' ---');
    for (const [label, ok] of res.checks) console.log('  [' + (ok ? 'OK' : 'XX') + '] ' + label);
    const r = res.raw;
    if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
    if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
    if (r.issues.length) console.log('  issues: ' + r.issues.join(' | '));
    console.log('  boundaryHit=' + r.boundaryHit);
  }

  console.log('\n=========== B3+B4 冒烟: ' + (fail === 0 ? 'ALL PASS' : 'FAIL=' + fail) + ' ===========');
  process.exit(fail > 0 ? 1 : 0);
})();
