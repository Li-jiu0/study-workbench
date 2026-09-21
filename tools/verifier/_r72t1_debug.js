const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
const chatjs = fs.readFileSync(path.join(ROOT, 'assets/chat-local.js'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
let stub = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ items: [] }); } }); };
const calls = [];
w.fetch = function (u) { calls.push(String(u)); return stub.apply(null, arguments); };
w.lsKey = function (k) { return 'acctA::' + k; };
w.STUDY_API_BASE = '';
w.localStorage.setItem('study_workbench_token', 'tok');

const h = `
;(function(){
  var out = [];
  var T = window.__IM_TEST__;
  out.push('has __IM_TEST__=' + !!T);
  out.push('typeof window.fetch=' + typeof window.fetch);
  out.push('token=' + window.localStorage.getItem('study_workbench_token'));
  out.push('typeof loadChats=' + typeof T.loadChats);
  try { T.loadChats(); out.push('loadChats called ok'); } catch(e){ out.push('loadChats threw: ' + e.message); }
  // 直接测 window.fetch 能否被调用
  try { window.fetch('DIRECT_CALL'); out.push('direct fetch ok'); } catch(e){ out.push('direct fetch threw: ' + e.message); }
  setTimeout(function(){
    out.push('S.chats len=' + T.S.chats.length);
    out.push('cached via getToken -> ' + (typeof T.getAiConfig === 'function'));
    window.__DBG = out.join('\\n');
  }, 120);
})();
`;
try { w.eval(chatjs + '\n' + h); } catch (e) { console.log('EVAL_THROW', e.message); }
setTimeout(function () {
  console.log(w.__DBG || '(no dbg)');
  console.log('calls captured = ' + JSON.stringify(calls));
}, 400);
