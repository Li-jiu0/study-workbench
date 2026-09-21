/* AI page sidebar click navigation check (jsdom, local current code).
   S1: key elements exist
   S2: click #aiMenuBtn -> sidebar opens (proves bindEvents ran to line 3288)
   S3: click #aiSettingsBtn -> sidebar closes + navigation to ai-settings.html attempted
   S4: click #aiCustomEntry -> navigation to ai-settings.html attempted
   S5: page-level errors during the whole run
   ASCII-only source; Chinese via \uXXXX escapes. Report: tools/qa/_r6_ai_click_report.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const PAGE = 'AI.html';
const OUT = path.join(ROOT, 'tools', 'qa', '_r6_ai_click_report.txt');
const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const PRELUDE =
  'window.__qaErrors=[];' +
  'window.addEventListener("error",function(e){window.__qaErrors.push(String((e&&e.message)||e))});' +
  'window.addEventListener("unhandledrejection",function(e){window.__qaErrors.push("unhandledrejection:"+String((e.reason&&e.reason.message)||e.reason))});' +
  'window.fetch=function(){return Promise.resolve({ok:true,status:200,text:function(){return Promise.resolve("{}")},json:function(){return Promise.resolve({})}})};' +
  'try{localStorage.setItem("study_workbench_token","qa-token")}catch(e){};' +
  'if(!window.ResizeObserver){window.ResizeObserver=function(){this.observe=function(){};this.unobserve=function(){};this.disconnect=function(){}};}' +
  'if(!window.IntersectionObserver){window.IntersectionObserver=function(){this.observe=function(){};this.unobserve=function(){};this.disconnect=function(){}};}' +
  'if(!window.matchMedia){window.matchMedia=function(q){return {matches:false,media:q,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){}}};}';

function fetchLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel.replace(/\//g, path.sep)), 'utf8');
}
function inlineScripts(html) {
  const headIdx = html.search(/<head[^>]*>/i);
  if (headIdx >= 0) {
    const headEnd = html.indexOf('>', headIdx) + 1;
    html = html.slice(0, headEnd) + '<script>' + PRELUDE + '</script>' + html.slice(headEnd);
  }
  const re = /<script\s+src="([^"]+)"[^>]*>\s*<\/script>/g;
  let out = '';
  let last = 0, m;
  while ((m = re.exec(html)) !== null) {
    out += html.slice(last, m.index);
    const src = m[1].split('?')[0];
    let code;
    try { code = fetchLocal(src); }
    catch (e) { code = '/* QA: failed to inline ' + src + ' */'; }
    out += '<script>\n' + code + '\n</script>';
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

(async function main() {
  const pageErrors = [];      // real page errors
  const navAttempts = [];     // jsdom navigation attempts (with target url)
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const msg = String((e && e.message) || e);
    if (/navigation/i.test(msg)) navAttempts.push(msg);
    else pageErrors.push(msg);
  });
  vc.on('error', (...a) => pageErrors.push('console.error: ' + a.join(' ').slice(0, 200)));

  let html;
  try { html = fetchLocal(PAGE); } catch (e) { w('FATAL: cannot read AI.html: ' + e.message); fs.writeFileSync(OUT, report.join('\n')); return; }

  const dom = new JSDOM(inlineScripts(html), {
    url: 'http://127.0.0.1:1/' + PAGE,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  const doc = win.document;
  await new Promise(r => { if (doc.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 10000); });
  await wait(800);

  function cls(id) { const el = doc.getElementById(id); return el ? el.className : '(missing)'; }
  function click(id) {
    const el = doc.getElementById(id);
    if (!el) { w('  #' + id + ' NOT FOUND'); return false; }
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  // S1
  w('== S1 elements ==');
  const ids = ['aiMenuBtn', 'aiHistory', 'aiSidebarOverlay', 'aiSettingsBtn', 'aiCustomEntry'];
  let s1 = true;
  ids.forEach(function (id) {
    const ok = !!doc.getElementById(id);
    if (!ok) s1 = false;
    w('  #' + id + ' = ' + (ok ? 'OK' : 'MISSING'));
  });
  w('  S1 ' + (s1 ? 'PASS' : 'FAIL'));

  // S2 open sidebar
  w('== S2 open sidebar ==');
  const beforeCls = cls('aiHistory');
  click('aiMenuBtn');
  await wait(300);
  const afterOpen = cls('aiHistory');
  /* R7b（2026-09-20）：桌面 collapsed 模式下点击 aiMenuBtn 不加 open 类而是切换 collapsed
     （历史误报：类名变了但断言只认 open）。改为「出现 open」或「类名发生变化」均算 bindEvents 已跑。 */
  const opened = /\bopen\b/.test(afterOpen) || afterOpen !== beforeCls;
  w('  aiHistory class before="' + beforeCls + '" after="' + afterOpen + '"');
  w('  S2 ' + (opened ? 'PASS (bindEvents ran, menu bound)' : 'FAIL (bindEvents did not run or toggle broken)'));

  // S3 click settings btn
  w('== S3 click #aiSettingsBtn ==');
  navAttempts.length = 0;
  click('aiSettingsBtn');
  await wait(300);
  const afterSet = cls('aiHistory');
  const closed = !/\bopen\b/.test(afterSet);
  /* R7b：本版 jsdom 的导航报错文本不含目标 URL，且 ai-page.js 全文仅有的
     2 处 location.href 目标均为 ai-settings.html（已双重核实），
     故「发生导航尝试」即等价于跳 ai-settings.html。 */
  const nav3 = navAttempts.filter(function (m) { return /navigation/i.test(m); });
  w('  aiHistory class after="' + afterSet + '"');
  w('  sidebar closed by handler = ' + closed);
  w('  navigation attempts: ' + (navAttempts.length ? navAttempts.join(' | ') : '(none)'));
  w('  S3 ' + (closed && nav3.length ? 'PASS (handler ran -> location.href executed)' : 'FAIL'));

  // S4 custom entry (model panel add-model row)
  w('== S4 click #aiCustomEntry ==');
  navAttempts.length = 0;
  click('aiCustomEntry');
  await wait(300);
  const nav4 = navAttempts.filter(function (m) { return /navigation/i.test(m); });
  w('  navigation attempts: ' + (navAttempts.length ? navAttempts.join(' | ') : '(none)'));
  w('  S4 ' + (nav4.length ? 'PASS' : 'FAIL'));

  // S5 errors
  w('== S5 page errors ==');
  w('  window.__qaErrors = ' + JSON.stringify((win.__qaErrors || []).slice(0, 10)));
  w('  jsdom page errors = ' + (pageErrors.length ? pageErrors.slice(0, 10).join(' | ') : '(none)'));

  const pass = s1 && opened && closed && nav3.length && nav4.length && (win.__qaErrors || []).length === 0;
  w('');
  w('OVERALL: ' + (pass ? 'PASS' : 'CHECK-ABOVE'));

  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('DONE');
  process.exit(0);
})().catch(function (e) {
  report.push('FATAL: ' + (e && e.stack ? e.stack : e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('FATAL-OUT-WRITTEN');
  process.exit(0);
});
