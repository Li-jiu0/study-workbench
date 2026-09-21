/* R91-C freeze repro v2: real Chrome CDP + logged-in localStorage state.
   Pages: 个人中心.html / 个人资料.html (click into AI对话记录 view) / 私聊.html
   Blocked main thread -> Debugger.pause stack. Report: r91c_cdp_report.txt */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const UDATA = path.join(ROOT, 'tools', 'qa', '_chrome_tmp_profile');
const OUT = path.join(ROOT, 'tools', 'qa', 'r91c_cdp_report.txt');

function furl(name) {
  return 'file:///' + encodeURIComponent('D:/\u4e0b\u8f7d\u7684\u6587\u4ef6/\u5b66\u4e60\u5de5\u4f5c\u53f0/' + name)
    .replace(/%3A/gi, ':').replace(/%2F/gi, '/');
}
const P_CENTER = furl('\u4e2a\u4eba\u4e2d\u5fc3.html');   // 个人中心.html
const P_PROFILE = furl('\u4e2a\u4eba\u8d44\u6599.html');   // 个人资料.html
const P_CHAT = furl('\u79c1\u804a.html');                 // 私聊.html

const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function withTimeout(p, ms, tag) {
  return Promise.race([p, wait(ms).then(() => { throw new Error('TIMEOUT:' + tag); })]);
}

// seed login state + user-scale local data BEFORE page scripts run
const INIT =
  'try{' +
  'localStorage.setItem("study_workbench_token","qa-fake-access-token-0123456789abcdef");' +
  'localStorage.setItem("study_workbench_refresh","qa-fake-refresh-token-0123456789abcdef");' +
  'localStorage.setItem("study_workbench_auth","1");' +
  'var s=[];for(var i=0;i<50;i++){s.push({id:"chat_"+i,title:"\u6d4b\u8bd5\u4f1a\u8bdd"+i,createdAt:1700000000000+i*3600000,updatedAt:1700000000000+i*3600000,messages:[{role:"user",content:"\u6d88\u606f"+i+"a"},{role:"assistant",content:"\u6d88\u606f"+i+"b"}]});}' +
  'localStorage.setItem("ai_chat_history",JSON.stringify(s));' +
  '}catch(e){}';

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', e => {
      let m = null;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) { p.reject(new Error(JSON.stringify(m.error))); } else { p.resolve(m.result); }
      } else { for (const h of this.handlers.slice()) { try { h(m); } catch (err) {} } }
    });
  }
  send(method, params) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); });
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function newTarget(httpBase) {
  let resp;
  try { resp = await fetch(httpBase + '/json/new?url=about:blank', { method: 'PUT' }); }
  catch (e) { resp = await fetch(httpBase + '/json/new?' + encodeURIComponent('about:blank')); }
  return resp.json();
}

async function probe(cdp, label) {
  let alive = false, aliveErr = '';
  try { await withTimeout(cdp.send('Runtime.evaluate', { expression: '1+1', returnByValue: true }), 2500, label + ':eval'); alive = true; }
  catch (e) { aliveErr = e.message; }
  w('[probe:' + label + '] mainThreadAlive=' + alive + (alive ? '' : ' err=' + aliveErr));
  return alive;
}

async function testPage(httpBase, url, opts) {
  const tag = opts.tag;
  w('========== PAGE ' + tag + ' ==========');
  const consoleLines = [];
  const target = await newTarget(httpBase);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); setTimeout(() => rej(new Error('ws open timeout')), 5000); });
  const cdp = new CDP(ws);

  let pausedFrames = null;
  cdp.on(m => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || []).map(a => (a.value !== undefined ? String(a.value) : (a.description || a.type || ''))).join(' ');
      consoleLines.push('[' + m.params.type + '] ' + args.slice(0, 220));
    } else if (m.method === 'Log.entryAdded') {
      consoleLines.push('[log:' + m.params.entry.level + '] ' + m.params.entry.text.slice(0, 200) + ' @' + (m.params.entry.url || '') + ':' + (m.params.entry.lineNumber + 1));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleLines.push('[exception] ' + ((d.exception && d.exception.description || d.text) + '').slice(0, 300));
    } else if (m.method === 'Debugger.paused') {
      pausedFrames = m.params.callFrames;
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Debugger.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  try { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); } catch (e) { w('[profiler] unavailable: ' + e.message); }

  const t0 = Date.now();
  await cdp.send('Page.navigate', { url: url });
  await wait(10000);
  let alive = await probe(cdp, 'load');

  if (alive && opts.interact === 'chat') {
    // click the AI对话记录 entry
    try {
      const r = await withTimeout(cdp.send('Runtime.evaluate', {
        expression: '(function(){var c=document.querySelector(\'[data-view="chat"]\'); if(!c) return "no-chat-cell"; c.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})); return "clicked";})()',
        returnByValue: true
      }), 3000, 'click-chat');
      w('[probe] openChatView=' + JSON.stringify(r.result.value));
      await wait(4000);
      alive = await probe(cdp, 'chat-view');
      if (alive) {
        const r2 = await withTimeout(cdp.send('Runtime.evaluate', {
          expression: '(function(){var v=document.querySelector("#xtpView_chat"); var t=v?v.textContent:""; return JSON.stringify({open:!!(v&&v.classList.contains("on")),hasLocal:t.indexOf("\u672c\u673a\u5bf9\u8bdd\u8bb0\u5f55")>=0,hasSrv:t.indexOf("\u670d\u52a1\u7aef\u8bb0\u5f55")>=0,len:t.length});})()',
          returnByValue: true
        }), 3000, 'chat-state');
        w('[probe] chatViewState=' + r2.result.value);
      }
    } catch (e) { w('[probe] chat interaction err=' + e.message); }
  }
  if (alive && opts.interact === 'center') {
    // 个人中心: simulate a few clicks on nav cards
    try {
      const r = await withTimeout(cdp.send('Runtime.evaluate', {
        expression: '(function(){var n=0;var cards=document.querySelectorAll(".subpage-group-card");for(var i=0;i<Math.min(cards.length,3);i++){cards[i].click();n++;} return "clicked="+n+" total="+cards.length;})()',
        returnByValue: true
      }), 3000, 'click-cards');
      w('[probe] centerCards=' + JSON.stringify(r.result.value));
      await wait(4000);
      alive = await probe(cdp, 'center-clicks');
    } catch (e) { w('[probe] center interaction err=' + e.message); }
  }

  if (!alive) {
    try { await cdp.send('Debugger.pause'); } catch (e) {}
    await wait(3000);
    if (pausedFrames) {
      w('[stack] SPIN LOOP callFrames (top 30):');
      for (let i = 0; i < Math.min(30, pausedFrames.length); i++) {
        const f = pausedFrames[i];
        w('  #' + i + ' ' + (f.functionName || '(anon)') + ' @' + (f.url || '') + ':' + (f.location.lineNumber + 1) + ':' + (f.location.columnNumber + 1));
      }
    } else { w('[stack] no Debugger.paused event within 3s'); }
  } else {
    try {
      const prof = await withTimeout(cdp.send('Profiler.stop'), 5000, 'profiler-stop');
      const nodes = prof.profile.nodes || [];
      const hot = nodes.slice().sort((a, b) => ((b.hitCount || 0) - (a.hitCount || 0))).slice(0, 8);
      w('[profiler] top nodes:');
      for (const n of hot) {
        const cf = n.callFrame;
        w('  hits=' + (n.hitCount || 0) + ' ' + (cf.functionName || '(anon)') + ' @' + (cf.url || '') + ':' + (cf.lineNumber + 1));
      }
    } catch (e) { w('[profiler] stop err=' + e.message); }
  }

  w('[console] ' + consoleLines.length + ' entries (first 40):');
  for (const line of consoleLines.slice(0, 40)) { w('  ' + line); }

  cdp.close();
  try { await fetch(httpBase + '/json/close/' + target.id); } catch (e) {}
  await wait(500);
  w('[done] ' + tag + ' elapsed=' + (Date.now() - t0) + 'ms');
}

(async function main() {
  let chrome = null;
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  try {
    chrome = spawn(CHROME, [
      '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + UDATA,
      '--no-first-run', '--disable-gpu', '--window-size=420,800', 'about:blank'
    ], { stdio: 'ignore' });
  } catch (e) {
    w('FATAL spawn chrome: ' + (e && e.stack || e));
    fs.writeFileSync(OUT, report.join('\n'), 'utf8'); console.log('fatal'); return;
  }
  const httpBase = 'http://127.0.0.1:' + PORT;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { await fetch(httpBase + '/json/version'); ready = true; break; } catch (e) { await wait(250); }
  }
  if (!ready) {
    w('FATAL chrome devtools endpoint not ready');
    try { chrome.kill(); } catch (e) {}
    fs.writeFileSync(OUT, report.join('\n'), 'utf8'); console.log('fatal'); return;
  }
  w('[chrome] headless ready port=' + PORT);
  const cases = [
    { url: P_CENTER, tag: '\u4e2a\u4eba\u4e2d\u5fc3(logged-in)', interact: 'center' },
    { url: P_PROFILE, tag: '\u4e2a\u4eba\u8d44\u6599(logged-in)', interact: 'chat' },
    { url: P_CHAT, tag: '\u79c1\u804a(logged-in)', interact: null }
  ];
  for (const c of cases) {
    try { await testPage(httpBase, c.url, c); } catch (e) { w('PAGE ERROR ' + c.tag + ' -> ' + (e && e.stack || e)); }
  }
  try { chrome.kill(); } catch (e) {}
  try { fs.rmSync(UDATA, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('done');
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
