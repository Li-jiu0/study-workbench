/* QA jsdom smoke: 动态空间.html row click; 个人资料.html friend/non-friend states.
   ASCII-only source; Chinese via \uXXXX escapes. */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const PAGE_DTKJ = '\u52a8\u6001\u7a7a\u95f4.html';   // 动态空间.html
const PAGE_GRZL = '\u4e2a\u4eba\u8d44\u6599.html';   // 个人资料.html
const HREF_MINE = '\u6211\u7684\u52a8\u6001.html';   // 我的动态.html
const T_MINE = '\u6211\u7684\u52a8\u6001';           // 我的动态
const T_ABOUT = '\u5173\u4e8e';                      // 关于
const T_PHONE = '\u624b\u673a';                      // 手机
const T_EMAIL = '\u90ae\u7bb1';                      // 邮箱
const T_GENDER = '\u6027\u522b';                     // 性别
const T_BIRTH = '\u751f\u65e5';                      // 生日
const T_REMARK = '\u5907\u6ce8';                     // 备注

const report = [];
function w(s) { report.push(String(s)); }

const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p.replace(/\//g, path.sep));
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(fp));
  } catch (e) { res.writeHead(500); res.end('err'); }
});

function fetchLocal(rel) {
  const fp = path.join(ROOT, rel.replace(/\//g, path.sep));
  return fs.readFileSync(fp, 'utf8');
}

// inline external <script src> blocks; inject extra script right after api.js block
function inlineScripts(html, injectAfterApi) {
  // inject PRELUDE right after <head> so error hooks + token exist before all page scripts
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
    if (injectAfterApi && src.indexOf('api.js') >= 0) {
      out += '<script>\n' + injectAfterApi + '\n</script>';
    }
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

const PRELUDE =
  'window.__qaErrors=window.__qaErrors||[];' +
  'window.addEventListener("error",function(e){window.__qaErrors.push(String(e.message||e))});' +
  'window.addEventListener("unhandledrejection",function(e){window.__qaErrors.push("unhandledrejection:"+String((e.reason&&e.reason.message)||e.reason))});' +
  'window.fetch=function(){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({})},text:function(){return Promise.resolve("{}")}})};' +
  'try{localStorage.setItem("study_workbench_token","qa-token")}catch(e){}';

function makeVC(navSeenBox) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (err) {
    if (/navigation/i.test(String(err && err.message))) { navSeenBox.nav = true; return; }
    navSeenBox.jsdomErrors.push(String(err && err.message));
  });
  vc.on('error', function () { navSeenBox.consoleErrors.push(Array.prototype.slice.call(arguments).join(' ')); });
  return vc;
}

function makeApiStub(user, friendList, momentsItems, momentsReject403) {
  const u = JSON.stringify(user);
  const fl = JSON.stringify(friendList);
  const mi = JSON.stringify(momentsItems);
  return 'window.__qaCalls=[];' +
    'window.api=function(url,opts){window.__qaCalls.push(url);' +
    'if(url.indexOf("/api/users/")===0) return Promise.resolve(' + u + ');' +
    'if(url.indexOf("/api/friends")===0&&url.indexOf("remark")<0) return Promise.resolve(' + fl + ');' +
    'if(url.indexOf("/api/moments/user/")===0){' +
    (momentsReject403 ? 'return Promise.reject(new Error("403 \u4ec5\u597d\u53cb\u53ef\u89c1"));' : 'return Promise.resolve({items:' + mi + '});') +
    '}' +
    'return Promise.resolve({});};';
}

async function runCase(name, pageFile, query, injectAfterApi) {
  const box = { nav: false, jsdomErrors: [], consoleErrors: [] };
  const vc = makeVC(box);
  const html0 = fetchLocal(pageFile);
  const html = inlineScripts(html0, injectAfterApi);
  const url = 'http://127.0.0.1:' + PORT + '/' + encodeURIComponent(pageFile) + (query || '');
  const dom = new JSDOM(html, {
    url: url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  await new Promise(r => { if (win.document.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 8000); });
  await new Promise(r => setTimeout(r, 600));
  return { dom, win, box };
}

let PORT = 0;

(async function main() {
  await new Promise(r => { server.listen(0, '127.0.0.1', r); });
  PORT = server.address().port;
  w('server port=' + PORT);

  /* ---- Case 1 (rerun after PRELUDE wiring fix) ---- */
  const RUN_CASE1 = true;
  if (RUN_CASE1) try {
    const { win, box } = await runCase('dtkj', PAGE_DTKJ, '', null);
    const doc = win.document;
    const row = doc.querySelector('#xtmMineRow');
    const href = row ? row.getAttribute('href') : null;
    const rowText = row ? row.textContent.trim() : '';
    w('[Case1] rowFound=' + !!row + ' href=' + href + ' text=' + JSON.stringify(rowText));
    if (row) {
      const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
      row.dispatchEvent(ev);
      await new Promise(r => setTimeout(r, 300));
    }
    w('[Case1] navTriggered=' + box.nav + ' hrefOk=' + (href === HREF_MINE) +
      ' qaErrors=' + JSON.stringify(win.__qaErrors || []) +
      ' jsdomErrors=' + JSON.stringify(box.jsdomErrors) +
      ' consoleErrors=' + JSON.stringify(box.consoleErrors.slice(0, 5)));
    const pass1 = !!row && href === HREF_MINE && box.nav && (win.__qaErrors || []).length === 0 && box.jsdomErrors.length === 0;
    w('[Case1] => ' + (pass1 ? 'PASS' : 'FAIL'));
    win.close();
  } catch (e) { w('[Case1] EXCEPTION ' + (e && e.stack || e)); }

  /* ---- Case 2a: 个人资料.html?user=88 friend state ---- */
  const USER_F = { id: 88, nickname: '\u5c0f\u660e', isFriend: true, isMe: false, motto: '', city: '', createdAt: '', online: false, lastSeenAt: '', avatarUrl: '' };
  const USER_NF = { id: 88, nickname: '\u5c0f\u660e', isFriend: false, isMe: false, motto: '', city: '', createdAt: '', online: false, lastSeenAt: '', avatarUrl: '' };
  const FLIST = [{ id: 88, peerRemark: '\u5907\u6ce8A' }];
  const MOMENTS = [{ content: 'hello qa', createdAt: '2026-09-17T10:00:00Z', images: [] }];

  async function profileCase(tag, user, reject403) {
    const stub = makeApiStub(user, FLIST, MOMENTS, reject403);
    const { win, box } = await runCase('grzl-' + tag, PAGE_GRZL, '?user=88', stub);
    const doc = win.document;
    const q = s => !!doc.querySelector(s);
    const rootEl = doc.querySelector('#xtProfileRoot');
    // strip design-intent privacy tip (.xtp-tip) before token checks
    rootEl.querySelectorAll('.xtp-tip').forEach(n => n.remove());
    const rootText = rootEl ? rootEl.textContent : '';
    const rootHtml = rootEl ? rootEl.innerHTML : '';
    const has = t => rootText.indexOf(t) >= 0;
    const res = {
      rootFound: !!rootEl,
      hero: q('#xtpHeroOther'),
      chat: q('[data-other-act="chat"]'),
      delfriend: q('[data-other-act="delfriend"]'),
      remark: q('[data-other-act="remark"]'),
      addfriend: q('[data-other-act="addfriend"]'),
      about: has(T_ABOUT),
      phone: has(T_PHONE), email: has(T_EMAIL), gender: has(T_GENDER), birth: has(T_BIRTH),
      idShown: /ID：<b>\s*88\s*<\/b>/.test(rootHtml) || rootText.indexOf('88') >= 0,
      remarkShown: has(T_REMARK),
      forbiddenMsg: has('\u4ec5\u597d\u53cb\u53ef\u89c1') || has('\u4ec5\u597d\u53cb'), // 仅好友可见
      calls: win.__qaCalls || [],
      locSearch: win.location ? win.location.search : '',
      rootSnippet: rootText.replace(/\s+/g, ' ').slice(0, 120),
      qaErrors: win.__qaErrors || [],
      jsdomErrors: box.jsdomErrors
    };
    w('[Case' + tag + '] ' + JSON.stringify(res));
    win.close();
    return res;
  }

  try {
    const f = await profileCase('2a', USER_F, false);
    const passF = f.hero && f.chat && f.delfriend && f.remark && !f.addfriend && f.remarkShown && !f.phone && !f.email && !f.gender && !f.birth && f.idShown;
    w('[Case2a] => ' + (passF ? 'PASS' : 'FAIL'));
  } catch (e) { w('[Case2a] EXCEPTION ' + (e && e.stack || e)); }

  try {
    const nf = await profileCase('2b', USER_NF, true);
    const passNF = nf.hero && nf.addfriend && !nf.chat && !nf.delfriend && !nf.remark && !nf.about && !nf.phone && !nf.email && !nf.gender && !nf.birth && nf.forbiddenMsg;
    w('[Case2b] => ' + (passNF ? 'PASS' : 'FAIL'));
  } catch (e) { w('[Case2b] EXCEPTION ' + (e && e.stack || e)); }

  server.close();
  fs.writeFileSync(path.join(ROOT, 'tools', '_qa_report_jsdom.txt'), report.join('\n'), 'utf8');
  console.log('done');
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(path.join(ROOT, 'tools', '_qa_report_jsdom.txt'), report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
