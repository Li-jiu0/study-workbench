/* Subpage blank repro (jsdom, local current code).
   Pages: 个人中心.html + 设置.html (the two pages user reports blank subpages).
   Steps per page:
   A1: page loads, key globals exist (SubpageRouter / loadAllSettings / appData)
   A2: SubpageRouter._state initialized (validKeys, root found)
   A3: sections [data-subpage] present in root; .subpage-list visible in list state
   A4: simulate click on each subpage group card -> assert target section becomes visible
   A5: page-level errors during the whole run
   ASCII-only source; Chinese via \uXXXX escapes.
   Report: tools/qa/_r7_subpage_repro.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const OUT = path.join(ROOT, 'tools', 'qa', '_r7_subpage_repro.txt');
const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const PRELUDE =
  'window.__qaErrors=[];' +
  'window.addEventListener("error",function(e){window.__qaErrors.push(String((e&&e.message)||e))});' +
  'window.addEventListener("unhandledrejection",function(e){window.__qaErrors.push("unhandledrejection:"+String((e.reason&&e.reason.message)||e.reason))});' +
  'window.fetch=function(u){return Promise.resolve({ok:true,status:200,text:function(){return Promise.resolve("{}")},json:function(){return Promise.resolve({})}})};' +
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

function disp(el) {
  if (!el) return '(missing)';
  const s = el.getAttribute('style') || '';
  const m = s.match(/display\s*:\s*([^;]+)/i);
  const inline = m ? m[1].trim() : '';
  if (inline === 'none') return 'none(inline)';
  if (inline) return inline + '(inline)';
  return 'default';
}

async function testPage(page, navEntries) {
  const tag = '== ' + page + ' ==';
  try {
    const html = fetchLocal(page);
    const pageErrors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => {
      const msg = String((e && e.message) || e);
      if (!/navigation/i.test(msg)) pageErrors.push(msg.slice(0, 300));
    });
    vc.on('error', (...a) => pageErrors.push('console.error: ' + a.join(' ').slice(0, 200)));
    vc.on('warn', (...a) => { const s = a.join(' ').slice(0, 200); if (/SubpageRouter|not found|not initialized/i.test(s)) pageErrors.push('console.warn: ' + s); });

    const dom = new JSDOM(inlineScripts(html), {
      url: 'http://127.0.0.1:1/' + page,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc
    });
    const win = dom.window;
    const doc = win.document;
    await new Promise(r => { if (doc.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 12000); });
    await wait(900);

    w(tag);
    w('A1 globals: SubpageRouter=' + (typeof win.SubpageRouter) + ' loadAllSettings=' + (typeof win.loadAllSettings) +
      ' setSetting=' + (typeof win.setSetting) + ' appData=' + (typeof win.appData) +
      ' renderProfilePage=' + (typeof win.renderProfilePage));

    const sr = win.SubpageRouter;
    w('A2 router._state=' + (sr && sr._state ? 'SET(root=' + (sr._state.root && sr._state.root.id ? '#' + sr._state.root.id : String(sr._state.rootSelector)) + ', default=' + sr._state.defaultSubpage + ')' : 'NULL'));
    if (sr && sr._state) {
      w('   validKeys=' + Object.keys(sr._state.validKeys).join(','));
    }

    const roots = doc.querySelectorAll('[data-subpage]');
    w('A3 sections[data-subpage] in whole doc=' + roots.length + ' keys=[' +
      Array.prototype.map.call(roots, s => s.getAttribute('data-subpage')).join(',') + ']');
    roots.forEach(s => {
      w('   - key=' + s.getAttribute('data-subpage') + ' id=' + (s.id || '-') + ' display=' + disp(s) + ' inPage=' + !!(s.closest && s.closest('.page, .content, [id^="page-"]')));
    });
    const listEl = doc.querySelector('.subpage-list');
    w('   .subpage-list=' + disp(listEl));
    const bc = doc.querySelector('.subpage-header');
    w('   .subpage-header=' + disp(bc));

    // find group cards
    const cards = Array.prototype.slice.call(doc.querySelectorAll('.subpage-group-card'));
    w('A4 group cards=' + cards.length + ' onclicks=[' + cards.map(c => (c.getAttribute('onclick') || '').trim().slice(0, 60)).join(' | ') + ']');

    for (const entry of navEntries) {
      const before = entry.key;
      // click the matching card by onclick content
      const card = cards.find(c => (c.getAttribute('onclick') || '').indexOf("'" + before + "'") >= 0);
      w('   -> nav "' + before + '" via ' + (card ? 'card click' : 'direct call (card NOT FOUND)'));
      if (card) card.click(); else if (sr && sr.navigate) sr.navigate(before);
      await wait(250);
      const hash = win.location.hash || '(none)';
      const sects = doc.querySelectorAll('[data-subpage]');
      const vis = [];
      sects.forEach(s => { if (disp(s) !== 'none(inline)') vis.push(s.getAttribute('data-subpage')); });
      const sl = disp(doc.querySelector('.subpage-list'));
      const bch = disp(doc.querySelector('.subpage-header'));
      w('      hash=' + hash + ' visible=[' + vis.join(',') + '] subpage-list=' + sl + ' subpage-header=' + bch);
      // go back to list for next entry
      if (sr && sr.navigate) { sr.navigate('list'); await wait(150); }
    }

    w('A5 pageErrors(' + pageErrors.length + '):');
    pageErrors.slice(0, 12).forEach(e => w('   * ' + e));
    w('   window.__qaErrors(' + (win.__qaErrors || []).length + '):');
    (win.__qaErrors || []).slice(0, 12).forEach(e => w('   ! ' + String(e).slice(0, 300)));
    w('');
    dom.window.close();
  } catch (e) {
    w(tag + ' FATAL: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    w('');
  }
}

(async function main() {
  // 个人中心: prefs / posts / moments / local-data / profile
  await testPage('\u4e2a\u4eba\u4e2d\u5fc3.html', [
    { key: 'prefs' }, { key: 'posts' }, { key: 'moments' }, { key: 'local-data' }, { key: 'profile' }
  ]);
  // 设置: discover keys dynamically -> pass broad list; unknown keys fall back by router
  await testPage('\u8bbe\u7f6e.html', [
    { key: 'appearance' }, { key: 'account' }, { key: 'ai' }, { key: 'about' }, { key: 'reading' }
  ]);
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); console.log('DONE'); }
  catch (e) { console.log('WRITE FAILED: ' + e.message); }
})();
