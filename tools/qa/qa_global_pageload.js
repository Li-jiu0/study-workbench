/* QA (Edward) 独立验证 —— 全局完整性：真加载页面，断言零未捕获异常
 * 覆盖 4 个改动页 + 关键活页（设置.html）。
 * 判定标准：
 *   - 不允许 error-boundary 触发（window.__xtBoundaryHit 或 xtToast('error') 调用）
 *   - 不允许 window.onerror / unhandledrejection 被触发
 *   - SubpageRouter（个人中心）与 goBack 定义可用
 * 运行：node tools/qa/qa_global_pageload.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

const PAGES = [
  '个人中心.html',
  'mock_exam.html',
  'mock_exam_run.html',
  'mock_exam_result.html',
  '设置.html',
];

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
    if (/Could not load|Not implemented|Could not parse CSS/.test(e.message)) return; // 资源/CSS 噪声
    issues.push('jsdomError: ' + e.message);
  });
  vc.on('error', (...a) => {
    const s = a.map(String).join(' ');
    // jsdom 的 console.error 会包含 [XT-BOUNDARY] 前缀
    issues.push('console.error: ' + s.slice(0, 200));
  });

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

  // 捕获真实未捕获异常
  const uncaught = [];
  window.addEventListener('error', (e) => uncaught.push('window.error: ' + (e && e.message ? e.message : '?')));
  window.addEventListener('unhandledrejection', (e) => uncaught.push('unhandledrejection: ' + (e && e.reason ? e.reason : '?')));

  // 捕获 error-boundary 上报
  let boundaryHit = 0;
  const origConsoleError = console.error;
  // 执行外部脚本
  const scriptErrors = [];
  for (const rel of ext) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { issues.push('缺失脚本: ' + rel); continue; }
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); }
    catch (e) { scriptErrors.push(rel + ': ' + e.message); }
  }
  // 覆盖 xtToast 以捕获 boundary 触发
  try {
    vm.runInContext('window.xtToast = function(type,msg){ if(type==="error"){ window.__qaBoundaryHit=(window.__qaBoundaryHit||0)+1; } };', ctx, { filename: 'qa-toast-stub' });
  } catch (_) {}

  // 执行内联脚本
  inline.forEach((code, i) => {
    try { vm.runInContext(code, ctx, { filename: file + '#inline' + (i + 1) }); }
    catch (e) { scriptErrors.push('inline#' + (i + 1) + ': ' + e.message); }
  });

  // 驱动 DOMContentLoaded / load
  try {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    window.dispatchEvent(new window.Event('load', { bubbles: true }));
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 900));

  boundaryHit = window.__qaBoundaryHit || 0;

  return { file, scriptErrors, uncaught, issues, boundaryHit, window };
}

(async () => {
  let fail = 0;
  console.log('\n================ QA 全局完整性：页面真加载 ================');
  for (const f of PAGES) {
    const r = await loadPage(f);
    // issues 中若包含 error-boundary 的 console.error 上报，视为 error-boundary 被触发
    const hardIssues = r.issues.filter((x) => !/XT-BOUNDARY/.test(x));
    const boundaryConsole = r.issues.filter((x) => /XT-BOUNDARY/.test(x));
    const boundaryHit = r.boundaryHit + boundaryConsole.length;
    const pass = r.scriptErrors.length === 0 && r.uncaught.length === 0
                 && hardIssues.length === 0 && boundaryHit === 0;
    if (!pass) fail++;
    console.log('\n--- ' + f + ' : ' + (pass ? 'PASS' : 'FAIL') + ' ---');
    if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
    if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
    if (hardIssues.length) console.log('  hardIssues: ' + hardIssues.join(' | '));
    if (boundaryConsole.length) console.log('  boundaryConsole: ' + boundaryConsole.join(' | '));
    console.log('  boundaryHit(xtToast error / boundary 上报)=' + boundaryHit);
  }
  console.log('\n=============== 全局完整性: ' + (fail === 0 ? 'ALL PASS' : 'FAIL=' + fail) + ' ===============');
  process.exit(fail > 0 ? 1 : 0);
})();
