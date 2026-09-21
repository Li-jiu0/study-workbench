/* QA C2+C3 重构验证（2026-09-13h）—— 真加载页面，断言零未捕获异常 + 重构断言
 * 覆盖：学习博客.html（C2 广场页重构：删说明卡+主导航提级+图标 data-icon）
 *       设置.html（C3 菜单提级：reading/voice/help 三个一级路由可达）
 * 运行：node tools/qa/qa_c23_0913h.js
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

  return { file, html, scriptErrors, uncaught, issues, boundaryHit: window.__qaBoundaryHit || 0, window };
}

(async () => {
  let fail = 0;
  console.log('\n========= QA C2+C3 重构验证（20260913h） =========');

  // ---------- C2 学习博客.html ----------
  {
    const r = await loadPage('学习博客.html');
    const doc = r.window.document;
    const domFail = [];
    // 删除断言：说明卡字样 0 命中
    if (r.html.includes('写发贴 · 分类标签 · 草稿归档 · 数据本地保存')) domFail.push('说明卡字样仍在(应删)');
    if (doc.querySelector('#page-blog .module-hero')) domFail.push('page-blog 内 module-hero 仍在(应删)');
    // 主导航断言：四项 tab 存在
    for (const id of ['blogTabList', 'blogTabMine', 'blogTabEdit', 'blogTabStats']) {
      if (!doc.getElementById(id)) domFail.push('主导航缺失: ' + id);
    }
    // 保留视图断言
    for (const id of ['blogViewList', 'blogViewMine', 'blogViewEdit', 'blogViewStats', 'blogGrid', 'countdownModal']) {
      if (!doc.getElementById(id)) domFail.push('缺失(应保留): ' + id);
    }
    // 图标断言：data-icon span 全部非空渲染
    const icons = doc.querySelectorAll('[data-icon]');
    const empty = [];
    for (const el of icons) if (!el.innerHTML.trim()) empty.push(el.getAttribute('data-icon'));

    const hardIssues = r.issues.filter((x) => !/XT-BOUNDARY/.test(x));
    const boundaryConsole = r.issues.filter((x) => /XT-BOUNDARY/.test(x));
    const pass = r.scriptErrors.length === 0 && r.uncaught.length === 0 && hardIssues.length === 0
      && (r.boundaryHit + boundaryConsole.length) === 0 && domFail.length === 0 && empty.length === 0;
    if (!pass) fail++;
    console.log('\n--- C2 学习博客.html : ' + (pass ? 'PASS' : 'FAIL') + ' ---');
    console.log('  data-icon spans: ' + icons.length + ', 空渲染: ' + (empty.length ? empty.join(',') : '无'));
    if (domFail.length) console.log('  domFail: ' + domFail.join(' | '));
    if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
    if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
    if (hardIssues.length) console.log('  hardIssues: ' + hardIssues.join(' | '));
  }

  // ---------- C3 设置.html ----------
  {
    const r = await loadPage('设置.html');
    const doc = r.window.document;
    const domFail = [];
    // 一级菜单断言：三个新入口存在
    const entries = { reading: '阅读与界面', voice: '语音与朗读', help: '帮助与反馈' };
    const groupCards = Array.from(doc.querySelectorAll('.subpage-group-card'));
    for (const [key, label] of Object.entries(entries)) {
      const hit = groupCards.find((c) => (c.getAttribute('onclick') || '').includes("navigate('" + key + "')"));
      if (!hit) domFail.push('一级菜单入口缺失: ' + key);
      else if (!hit.textContent.includes(label)) domFail.push('入口文案异常: ' + key);
    }
    // 提级 section 断言 + 路由可达断言
    for (const key of Object.keys(entries)) {
      const sec = doc.querySelector('section[data-subpage="' + key + '"]');
      if (!sec) { domFail.push('section 缺失: ' + key); continue; }
      try {
        if (typeof r.window.SubpageRouter !== 'undefined' && r.window.SubpageRouter.navigate) {
          r.window.SubpageRouter.navigate(key);
          await new Promise((res) => setTimeout(res, 150)); // jsdom 的 hashchange 异步触发
          // 路由器用 style.display 控制可见性：目标 section 应显示，其余 section 应隐藏
          const allSecs = Array.from(doc.querySelectorAll('section[data-subpage]'));
          const targetShown = sec.style.display !== 'none';
          const othersHidden = allSecs.every((s) => s === sec || s.style.display === 'none');
          if (!targetShown) domFail.push('路由 ' + key + ' 目标 section 未显示（style.display 判定）');
          if (!othersHidden) domFail.push('路由 ' + key + ' 其他 section 未隐藏');
        } else {
          domFail.push('SubpageRouter 不可用');
        }
      } catch (e) {
        domFail.push('路由 ' + key + ' 异常: ' + e.message);
      }
    }
    // 图标断言
    const icons = doc.querySelectorAll('[data-icon]');
    const empty = [];
    for (const el of icons) if (!el.innerHTML.trim()) empty.push(el.getAttribute('data-icon'));
    // 红线断言
    const cdOk = !!(doc.getElementById('countdownModal') && doc.getElementById('cdName') && doc.getElementById('cdDate') && doc.getElementById('cdColorPicker'));
    if (!cdOk) domFail.push('countdownModal 全套缺失');

    const hardIssues = r.issues.filter((x) => !/XT-BOUNDARY/.test(x));
    const boundaryConsole = r.issues.filter((x) => /XT-BOUNDARY/.test(x));
    const pass = r.scriptErrors.length === 0 && r.uncaught.length === 0 && hardIssues.length === 0
      && (r.boundaryHit + boundaryConsole.length) === 0 && domFail.length === 0 && empty.length === 0;
    if (!pass) fail++;
    console.log('\n--- C3 设置.html : ' + (pass ? 'PASS' : 'FAIL') + ' ---');
    console.log('  data-icon spans: ' + icons.length + ', 空渲染: ' + (empty.length ? empty.join(',') : '无'));
    console.log('  countdownModal 全套: ' + (cdOk ? 'OK' : 'MISSING'));
    if (domFail.length) console.log('  domFail: ' + domFail.join(' | '));
    if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
    if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
    if (hardIssues.length) console.log('  hardIssues: ' + hardIssues.join(' | '));
  }

  console.log('\n========= C2+C3 重构验证: ' + (fail === 0 ? 'ALL PASS' : 'FAIL=' + fail) + ' =========');
  process.exit(fail > 0 ? 1 : 0);
})();
