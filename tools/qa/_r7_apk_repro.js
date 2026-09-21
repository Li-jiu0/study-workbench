/* Reproduce the APP behaviour: load AI.html + ai-page.js EXACTLY as packaged in the APK
   (extracted to a temp dir), then click #aiMenuBtn and #aiSettingsBtn.
   Report: tools/qa/_r7_apk_repro_report.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const STAGE = path.join(ROOT, '_r7_apk_stage');      // pre-extracted APK assets
const OUT = path.join(ROOT, 'tools', 'qa', '_r7_apk_repro_report.txt');
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

// APK 内页面在 assets/ 下，引用 assets/xxx.js → 实际 assets/assets/xxx.js
function fetchFromStage(rel) {
  const p = path.join(STAGE, rel.split('?')[0].replace(/\//g, path.sep));
  return fs.readFileSync(p, 'utf8');
}
function inlineScriptsFromStage(html) {
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
    try { code = fetchFromStage(src); }
    catch (e) { code = '/* QA: MISSING in APK: ' + src + ' */'; }
    out += '<script>\n' + code + '\n</script>';
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

(async function main() {
  const pageErrors = [];
  const navAttempts = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const msg = String((e && e.message) || e);
    if (/navigation/i.test(msg)) navAttempts.push(msg); else pageErrors.push(msg);
  });
  vc.on('error', (...a) => pageErrors.push('console.error: ' + a.join(' ').slice(0, 200)));

  let html;
  try { html = fetchFromStage('AI.html'); }
  catch (e) { w('FATAL: cannot read AI.html from stage: ' + e.message); fs.writeFileSync(OUT, report.join('\n')); return; }

  const dom = new JSDOM(inlineScriptsFromStage(html), {
    url: 'file:///android_asset/AI.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window, doc = win.document;
  await new Promise(r => { if (doc.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 10000); });
  await wait(800);

  function cls(id) { const el = doc.getElementById(id); return el ? el.className : '(missing)'; }
  function click(id) {
    const el = doc.getElementById(id);
    if (!el) { w('  #' + id + ' NOT FOUND'); return false; }
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  w('=== APK-internal AI.html reproduced in file:// context ===');
  w('#aiMenuBtn = ' + (doc.getElementById('aiMenuBtn') ? 'OK' : 'MISSING'));
  w('#aiSettingsBtn = ' + (doc.getElementById('aiSettingsBtn') ? 'OK' : 'MISSING'));
  w('#aiCustomEntry = ' + (doc.getElementById('aiCustomEntry') ? 'OK' : 'MISSING'));
  w('');
  w('== click #aiMenuBtn ==');
  w('  before = ' + cls('aiHistory'));
  click('aiMenuBtn');
  await wait(300);
  w('  after  = ' + cls('aiHistory'));
  w('');
  w('== click #aiSettingsBtn ==');
  navAttempts.length = 0;
  click('aiSettingsBtn');
  await wait(300);
  w('  aiHistory = ' + cls('aiHistory'));
  w('  nav attempts: ' + (navAttempts.length ? navAttempts.join(' | ') : '(NONE -> handler did NOT run)'));
  w('');
  w('== click #aiCustomEntry ==');
  navAttempts.length = 0;
  click('aiCustomEntry');
  await wait(300);
  w('  nav attempts: ' + (navAttempts.length ? navAttempts.join(' | ') : '(NONE)'));
  w('');
  w('== errors ==');
  w('  __qaErrors = ' + JSON.stringify((win.__qaErrors || []).slice(0, 8)));
  w('  pageErrors = ' + (pageErrors.length ? pageErrors.slice(0, 8).join(' | ') : '(none)'));

  const ok = navAttempts.length > 0;
  w('');
  w('VERDICT: APK-internal AI.html ' + (ok ? 'DOES navigate (problem is elsewhere)' : 'DOES NOT navigate -> REPRODUCED'));

  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('DONE');
  process.exit(0);
})().catch(function (e) {
  report.push('FATAL: ' + (e && e.stack ? e.stack : e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('FATAL-OUT-WRITTEN');
  process.exit(0);
});
