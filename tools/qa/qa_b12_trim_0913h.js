/* QA B1+B2 删减验证（2026-09-13h）—— 真加载页面，断言零未捕获异常 + 删减/保留断言
 * 覆盖：四级备考.html（删「写作提升」）、央国企笔试.html（删「数量关系/判断推理/资料分析」+「题型正确率」）
 * 运行：node tools/qa/qa_b12_trim_0913h.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

const PAGES = ['四级备考.html', '央国企笔试.html'];

// 各页断言：absent = 删减后必须消失的字样；present = 保留模块必须存在的 DOM 钩子
const ASSERTS = {
  '四级备考.html': {
    absent: ['写作提升', 'cet-write'],
    present: ['词汇打卡', '听力训练', '阅读理解', '翻译专项', '真题模考', '考试指南', '情景式口语', 'countdownModal', 'cetStatsCard', 'cetSprintCard'],
  },
  '央国企笔试.html': {
    absent: ['数量关系', 'exam-quant', 'exam-deduce', 'exam-data', '题型正确率', 'typeAcc'],
    present: ['行测刷题', '综合知识', '企业定向库', '时政热点', '真题模考', '考试指南', '话题表达训练', 'countdownModal', 'examStatsCard'],
  },
};

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
    vm.runInContext('window.xtToast = function(type,msg){ if(type==="error"){ window.__qaBoundaryHit=(window.__qaBoundaryHit||0)+1; } };', ctx, { filename: 'qa-toast-stub' });
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

  const boundaryHit = window.__qaBoundaryHit || 0;
  const doc = window.document;

  // ---- 删减/保留断言（DOM 真实查询）----
  const assert = ASSERTS[file] || { absent: [], present: [] };
  const domFail = [];
  for (const t of assert.absent) {
    if (html.includes(t) || doc.body.innerHTML.includes(t)) domFail.push('仍存在(应删): ' + t);
  }
  for (const t of assert.present) {
    const byId = doc.getElementById(t);
    if (!byId && !doc.body.innerHTML.includes(t)) domFail.push('缺失(应保留): ' + t);
  }
  // 图标体系断言：data-icon span 存在且无空渲染（icon-map 应已把 span 填充为 svg）
  const iconSpans = doc.querySelectorAll('[data-icon]');
  const emptyIcons = [];
  for (const el of iconSpans) {
    if (!el.innerHTML.trim()) emptyIcons.push(el.getAttribute('data-icon'));
  }
  // 红线断言：countdownModal 全套存在 + 无 history.back
  const cd = doc.getElementById('countdownModal');
  const cdOk = !!(cd && doc.getElementById('cdName') && doc.getElementById('cdDate') && doc.getElementById('cdColorPicker'));
  const hasHistoryBack = /history\.back\s*\(/.test(html);

  return { file, scriptErrors, uncaught, issues, boundaryHit, domFail, emptyIcons, cdOk, hasHistoryBack, iconCount: iconSpans.length };
}

(async () => {
  let fail = 0;
  console.log('\n========= QA B1+B2 删减验证（20260913h） =========');
  for (const f of PAGES) {
    const r = await loadPage(f);
    const hardIssues = r.issues.filter((x) => !/XT-BOUNDARY/.test(x));
    const boundaryConsole = r.issues.filter((x) => /XT-BOUNDARY/.test(x));
    const boundaryHit = r.boundaryHit + boundaryConsole.length;
    const pass = r.scriptErrors.length === 0 && r.uncaught.length === 0 && hardIssues.length === 0
      && boundaryHit === 0 && r.domFail.length === 0 && r.emptyIcons.length === 0
      && r.cdOk && !r.hasHistoryBack;
    if (!pass) fail++;
    console.log('\n--- ' + f + ' : ' + (pass ? 'PASS' : 'FAIL') + ' ---');
    console.log('  data-icon spans: ' + r.iconCount + ', 空渲染: ' + (r.emptyIcons.length ? r.emptyIcons.join(',') : '无'));
    console.log('  countdownModal 全套: ' + (r.cdOk ? 'OK' : 'MISSING'));
    console.log('  history.back: ' + (r.hasHistoryBack ? '存在(违规)' : '无'));
    if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
    if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
    if (hardIssues.length) console.log('  hardIssues: ' + hardIssues.join(' | '));
    if (r.domFail.length) console.log('  domFail: ' + r.domFail.join(' | '));
    if (boundaryConsole.length) console.log('  boundaryConsole: ' + boundaryConsole.join(' | '));
  }
  console.log('\n========= B1+B2 删减验证: ' + (fail === 0 ? 'ALL PASS' : 'FAIL=' + fail) + ' =========');
  process.exit(fail > 0 ? 1 : 0);
})();
