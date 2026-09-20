/* R92-A jsdom e2e: AI.html send flow routing.
   Case1: video model selected -> xtRunCapability called, callAI NOT called.
   Case2: normal model selected -> callAI called, xtRunCapability NOT called.
   ASCII-only source; Chinese via \uXXXX escapes. Report: r92a_jsdom_report.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const PAGE = 'AI.html';
const OUT = path.join(ROOT, 'tools', 'qa', 'r92a_jsdom_report.txt');
const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const PRELUDE =
  'window.__qaErrors=[];' +
  'window.addEventListener("error",function(e){window.__qaErrors.push(String(e.message||e))});' +
  'window.addEventListener("unhandledrejection",function(e){window.__qaErrors.push("unhandledrejection:"+String((e.reason&&e.reason.message)||e.reason))});' +
  'window.fetch=function(){return Promise.resolve({ok:true,status:200,text:function(){return Promise.resolve("{}")},json:function(){return Promise.resolve({})}})};' +
  'try{localStorage.setItem("study_workbench_token","qa-token")}catch(e){};';

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
  const box = { jsdomErrors: [], consoleErrors: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(String(e && e.message))) box.jsdomErrors.push(String(e && e.message)); });
  vc.on('error', () => box.consoleErrors.push(Array.prototype.slice.call(arguments).join(' ').slice(0, 150)));

  const dom = new JSDOM(inlineScripts(fetchLocal(PAGE)), {
    url: 'http://127.0.0.1:1/' + PAGE,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  await new Promise(r => { if (win.document.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 15000); });
  await wait(800);
  const doc = win.document;

  // install spies AFTER boot (capRunner resolves lazily at send time)
  win.eval(
    'window.__capCalls=[];window.__chatCalls=[];' +
    'function __capSpy(id,input,opts){window.__capCalls.push({id:id,prompt:(input&&input.prompt)||""});' +
    '  return Promise.resolve({ok:true,kind:"video",result:{url:"https://qa.example/v.mp4"}});}' +
    'try{ if(window.AI_SERVICE) window.AI_SERVICE.xtRunCapability=__capSpy; }catch(e){}' +
    'window.xtRunCapability=__capSpy;' +
    'window.callAI=function(ft,msgs,opts){window.__chatCalls.push({ft:ft});' +
    '  if(opts&&opts.onChunk){opts.onChunk("qa","qa");}' +
    '  return Promise.resolve({text:"qa-ok",degraded:false});};'
  );

  function send(text) {
    const inp = doc.querySelector('#aiInput');
    const btn = doc.querySelector('#aiSendBtn');
    if (!inp || !btn) { w('[send] input/button not found'); return false; }
    inp.value = text;
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  // Case1: video model
  win.localStorage.setItem('ai_selected_model', 'ark-seedance-1-0-pro');
  const s1 = send('\u751f\u6210\u4e00\u6bb5\u89c6\u9891'); // 生成一段视频
  await wait(1200);
  const cap1 = win.eval('JSON.stringify(window.__capCalls)');
  const chat1 = win.eval('JSON.stringify(window.__chatCalls)');
  w('[case1] sent=' + s1 + ' capCalls=' + cap1 + ' chatCalls=' + chat1);

  // Case2: normal model
  win.localStorage.setItem('ai_selected_model', 'ark-doubao-mini');
  const s2 = send('\u4f60\u597d'); // 你好
  await wait(1200);
  const cap2 = win.eval('JSON.stringify(window.__capCalls)');
  const chat2 = win.eval('JSON.stringify(window.__chatCalls)');
  w('[case2] sent=' + s2 + ' capCalls=' + cap2 + ' chatCalls=' + chat2);
  w('[errors] qa=' + JSON.stringify((win.__qaErrors || []).slice(0, 5)) +
    ' jsdom=' + JSON.stringify(box.jsdomErrors.slice(0, 5)) +
    ' console=' + JSON.stringify(box.consoleErrors.slice(0, 5)));

  const c1 = JSON.parse(cap1), ch1 = JSON.parse(chat1);
  const c2 = JSON.parse(cap2), ch2 = JSON.parse(chat2);
  const pass1 = s1 && c1.length === 1 && c1[0].id === 'ark-seedance-1-0-pro' &&
    c1[0].prompt === '\u751f\u6210\u4e00\u6bb5\u89c6\u9891' && ch1.length === 0;
  const pass2 = s2 && c2.length === 1 && ch2.length === 1;
  w('CASE1(video->xtRunCapability) => ' + (pass1 ? 'PASS' : 'FAIL'));
  w('CASE2(normal->callAI)         => ' + (pass2 ? 'PASS' : 'FAIL'));
  w('JSDOM_ALL => ' + (pass1 && pass2 ? 'PASS' : 'FAIL'));
  win.close();
  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('done');
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
