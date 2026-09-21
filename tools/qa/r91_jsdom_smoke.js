/* R91-A jsdom smoke: profile page chat view.
   Assert: no server-record block, no GET /api/ai/history request,
   chatBadge shows local count, M5 panel skeleton intact.
   ASCII-only source; Chinese via \uXXXX escapes. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const PAGE = '\u4e2a\u4eba\u8d44\u6599.html'; // 个人资料.html
const report = [];
function w(s) { report.push(String(s)); }

function fetchLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel.replace(/\//g, path.sep)), 'utf8');
}

const PRELUDE =
  'window.__qaErrors=[];' +
  'window.addEventListener("error",function(e){window.__qaErrors.push(String(e.message||e))});' +
  'window.addEventListener("unhandledrejection",function(e){window.__qaErrors.push("unhandledrejection:"+String((e.reason&&e.reason.message)||e.reason))});' +
  'window.fetch=function(){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({})},text:function(){return Promise.resolve("{}")}})};' +
  'try{localStorage.setItem("study_workbench_token","qa-token")}catch(e){};' +
  // seed ONE local chat session → chatBadge() should show "1"
  'try{localStorage.setItem("ai_chat_history", JSON.stringify([{id:"qa_s1",title:"QA\u4f1a\u8bdd",createdAt:1700000000000,updatedAt:1700000000000,messages:[{role:"user",content:"hi"},{role:"assistant",content:"hello"}]}]))}catch(e){};';

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
    if (src.indexOf('api.js') >= 0) {
      out += '<script>\nwindow.__qaCalls=[];window.api=function(url,opts){window.__qaCalls.push((opts&&opts.method||"GET")+" "+url);return Promise.resolve({items:[],models:[]});};\n</script>';
    }
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

(async function main() {
  const box = { jsdomErrors: [], consoleErrors: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(String(e && e.message))) box.jsdomErrors.push(String(e && e.message)); });
  vc.on('error', () => box.consoleErrors.push(Array.prototype.slice.call(arguments).join(' ')));

  const html = inlineScripts(fetchLocal(PAGE));
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:1/' + encodeURIComponent(PAGE),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  await new Promise(r => { if (win.document.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 8000); });
  await new Promise(r => setTimeout(r, 600));
  const doc = win.document;
  const calls = win.__qaCalls || [];
  const errs = win.__qaErrors || [];

  // 1) home skeleton
  const root = doc.querySelector('#xtProfileRoot');
  const chatCell = doc.querySelector('[data-view="chat"]');
  const badge = chatCell ? chatCell.querySelector('.xtp-badge') : null;
  w('[home] root=' + !!root + ' chatCell=' + !!chatCell +
    ' badge=' + (badge ? JSON.stringify(badge.textContent) : 'null') +
    ' qaErrors=' + JSON.stringify(errs) +
    ' jsdomErrors=' + JSON.stringify(box.jsdomErrors));

  // 2) open chat view
  if (chatCell) {
    chatCell.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 400));
  }
  const chatView = doc.querySelector('#xtpView_chat');
  const chatHtml = chatView ? chatView.innerHTML : '';
  const chatText = chatView ? chatView.textContent : '';
  const T_LOCAL = '\u672c\u673a\u5bf9\u8bdd\u8bb0\u5f55';             // 本机对话记录
  const T_QA = 'QA\u4f1a\u8bdd';                                       // QA会话
  const T_NODEL = '\u6682\u4e0d\u652f\u6301\u5220\u9664';              // 暂不支持删除
  const T_SRV = '\u670d\u52a1\u7aef\u8bb0\u5f55\u5171';                // 服务端记录共
  const T_TIP = '\u300c\u6e05\u7a7a\u5168\u90e8\u300d\u4f1a\u540c\u65f6\u5220\u9664\u672c\u673a\u4e0e\u670d\u52a1\u7aef\u8bb0\u5f55'; // 「清空全部」会同时删除本机与服务端记录
  const res = {
    chatViewOpen: !!(chatView && chatView.classList.contains('on')),
    m5Header: chatText.indexOf(T_LOCAL) >= 0,
    localSessionShown: chatText.indexOf(T_QA) >= 0,
    noSrvNote: chatHtml.indexOf('xtp-m5-srvnote') < 0 && chatText.indexOf(T_NODEL) < 0 && chatText.indexOf(T_SRV) < 0,
    quicktipNew: chatText.indexOf(T_TIP) >= 0,
    historyCalls: calls.filter(c => c.indexOf('/api/ai/history') >= 0),
    totalCalls: calls.length
  };
  w('[chat] ' + JSON.stringify(res));
  w('[calls] ' + JSON.stringify(calls));

  // localChatCount() counts MESSAGES (not sessions): seeded 1 session with 2 messages → badge "2"
  const passHome = !!root && !!chatCell && badge && badge.textContent === '2' && errs.length === 0 && box.jsdomErrors.length === 0;
  const passChat = res.chatViewOpen && res.m5Header && res.localSessionShown && res.noSrvNote && res.quicktipNew && res.historyCalls.length === 0;
  w('HOME => ' + (passHome ? 'PASS' : 'FAIL'));
  w('CHAT => ' + (passChat ? 'PASS' : 'FAIL'));
  w('JSDOM_ALL => ' + (passHome && passChat ? 'PASS' : 'FAIL'));
  win.close();
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r91_jsdom_report.txt'), report.join('\n'), 'utf8');
  console.log('done');
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r91_jsdom_report.txt'), report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
