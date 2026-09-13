/* QA C1 好友页菜单重排验证（2026-09-13h）—— 真加载页面，断言零未捕获异常 + 菜单重排断言
 * 覆盖：私聊.html（需求08：会话→好友→群聊→申请→加好友；「+好友」改「加好友」且排最末）
 * 运行：node tools/qa/qa_c1_0913h.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

// 重排后期望的菜单（DOM 顺序 + onclick 目标 + 文案）
const EXPECTED_TABS = [
  { label: '会话', onclick: "imSwitchTab('chats')" },
  { label: '好友', onclick: "imSwitchTab('friends')" },
  { label: '群聊', onclick: 'imOpenGroupCreator()' },
  { label: '申请', onclick: "imSwitchTab('requests')" },
  { label: '加好友', onclick: 'imOpenAddFriendModal()' },
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
  console.log('\n========= QA C1 好友页菜单重排验证（20260913h） =========');
  const r = await loadPage('私聊.html');
  const doc = r.window.document;
  const domFail = [];

  // ① 菜单顺序与 onclick 断言
  const tabs = Array.from(doc.querySelectorAll('.im-tabs .im-tab'));
  if (tabs.length !== EXPECTED_TABS.length) {
    domFail.push('菜单按钮数量异常: ' + tabs.length + ' (期望 ' + EXPECTED_TABS.length + ')');
  } else {
    tabs.forEach((btn, i) => {
      const exp = EXPECTED_TABS[i];
      const label = btn.textContent.trim();
      const oc = btn.getAttribute('onclick') || '';
      if (!label.includes(exp.label)) domFail.push('第' + (i + 1) + '个按钮文案异常: "' + label + '" (期望含 "' + exp.label + '")');
      if (oc !== exp.onclick) domFail.push('第' + (i + 1) + '个按钮 onclick 异常: "' + oc + '" (期望 "' + exp.onclick + '")');
    });
  }
  // 「加好友」必须在最末位
  const last = tabs[tabs.length - 1];
  if (!last || last.textContent.trim() !== '加好友') domFail.push('最末位按钮不是「加好友」: ' + (last ? last.textContent.trim() : '无'));
  // 「+好友」旧字样 0 命中（含 ➕ 前缀变体）
  if (r.html.includes('➕ 加好友') || r.html.includes('+好友')) domFail.push('旧文案「➕ 加好友 / +好友」仍存在');

  // ② 红线断言：countdownModal 全套
  const cdOk = !!(doc.getElementById('countdownModal') && doc.getElementById('cdName') && doc.getElementById('cdDate') && doc.getElementById('cdColorPicker'));
  if (!cdOk) domFail.push('countdownModal 全套缺失');
  if (/history\.back\s*\(/.test(r.html)) domFail.push('history.back() 出现（违规）');

  // ③ 版本 bump 断言：真实 script/link 行无 20260913g 残留
  const staleG = /(?:rel="stylesheet"[^>]*|<script[^>]*)\?v=20260913g/.test(r.html);
  if (staleG) domFail.push('真实 script/link 行仍有 v=20260913g');

  // ④ 样式断言：im-tab-add 无硬编码橙色，使用设计令牌
  const styleBlock = r.html.match(/<style>[\s\S]*?<\/style>/g) || [];
  const allStyle = styleBlock.join('\n');
  if (/\.im-tab-add\{[^}]*#(fff7ed|fdba74|c2410c|ffedd5)/.test(allStyle)) domFail.push('im-tab-add 仍有硬编码橙色');
  if (!/\.im-tab-add\{[^}]*var\(--primary-light\)[^}]*var\(--primary\)/.test(allStyle)) domFail.push('im-tab-add 未使用设计令牌');

  // ⑤ 图标渲染断言：data-icon span 全部非空
  const icons = doc.querySelectorAll('[data-icon]');
  const empty = [];
  for (const el of icons) if (!el.innerHTML.trim()) empty.push(el.getAttribute('data-icon'));

  const hardIssues = r.issues.filter((x) => !/XT-BOUNDARY/.test(x));
  const boundaryConsole = r.issues.filter((x) => /XT-BOUNDARY/.test(x));
  const pass = r.scriptErrors.length === 0 && r.uncaught.length === 0 && hardIssues.length === 0
    && (r.boundaryHit + boundaryConsole.length) === 0 && domFail.length === 0 && empty.length === 0;
  if (!pass) fail++;

  console.log('\n--- 私聊.html : ' + (pass ? 'PASS' : 'FAIL') + ' ---');
  console.log('  菜单顺序: ' + tabs.map((b) => b.textContent.trim()).join(' → '));
  console.log('  data-icon spans: ' + icons.length + ', 空渲染: ' + (empty.length ? empty.join(',') : '无'));
  console.log('  countdownModal 全套: ' + (cdOk ? 'OK' : 'MISSING'));
  if (domFail.length) console.log('  domFail: ' + domFail.join(' | '));
  if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
  if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
  if (hardIssues.length) console.log('  hardIssues: ' + hardIssues.join(' | '));

  console.log('\n========= C1 好友页菜单重排验证: ' + (fail === 0 ? 'ALL PASS' : 'FAIL=' + fail) + ' =========');
  process.exit(fail > 0 ? 1 : 0);
})();
