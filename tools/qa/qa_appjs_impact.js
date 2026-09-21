/* QA (Edward) —— 影响评估：app.js L1392 在无 #countdownModal 页面抛错的影响面
 * 目的：判定该 pre-existing 抛错是否影响模考页核心功能（找卷/渲染/返回）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

function extract(html) {
  const ext = [];
  const inline = [];
  let m;
  const reExt = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((m = reExt.exec(html))) ext.push(m[1].split('?')[0]);
  const reIn = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = reIn.exec(html))) inline.push(m[1]);
  return { ext, inline };
}

async function probe(file, wantSelectors) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const { ext, inline } = extract(html);
  const vc = new VirtualConsole();
  const boundary = [];
  vc.on('error', (...a) => { const s = a.map(String).join(' '); if (/XT-BOUNDARY/.test(s)) boundary.push(s.slice(0, 120)); });
  const dom = new JSDOM(html, {
    url: 'https://example.test/' + encodeURIComponent(file),
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa' })); },
  });
  const { window } = dom;
  const ctx = dom.getInternalVMContext();
  const scriptErrors = [];
  for (const rel of ext) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); }
    catch (e) { scriptErrors.push(rel + ': ' + e.message); }
  }
  inline.forEach((code, i) => { try { vm.runInContext(code, ctx, { filename: file + '#' + i }); } catch (e) { scriptErrors.push('inline' + i + ': ' + e.message); } });
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  window.dispatchEvent(new window.Event('load', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));

  const avail = {};
  ['lsKey', 'countdownDays', 'MockEngine', 'MockResult', 'MOCK_PAPERS_DATA', 'goBack'].forEach((n) => {
    const v = window[n];
    avail[n] = (typeof v !== 'undefined' && v !== null) ? (typeof v) : '(undefined)';
  });
  const els = {};
  (wantSelectors || []).forEach((s) => { els[s] = !!window.document.querySelector(s); });

  return { file, scriptErrors, boundary, avail, els };
}

(async () => {
  console.log('\n======== QA 影响评估：app.js L1392 pre-existing 抛错 ========');
  const r1 = await probe('mock_exam.html', ['#paperGrid', '.xt-page-back']);
  const r2 = await probe('mock_exam_run.html', ['#qArea', '.mock-topbar']);
  const r3 = await probe('mock_exam_result.html', ['#mainContent', '.xt-page-back']);

  [r1, r2, r3].forEach((r) => {
    console.log('\n--- ' + r.file + ' ---');
    console.log('  scriptErrors: ' + (r.scriptErrors.length ? r.scriptErrors.join(' | ') : '(none)'));
    console.log('  error-boundary 上报: ' + (r.boundary.length ? r.boundary.join(' | ') : '(none)'));
    console.log('  关键全局可用性: ' + JSON.stringify(r.avail));
    console.log('  关键 DOM 存在: ' + JSON.stringify(r.els));
  });
})();
