/* CLEAN subpage repro: load pages via JSDOM.fromFile with native resource loading
   (real <script src> + defer semantics, parse5 spec-compliant tokenizer).
   Report: tools/qa/_r7_subpage_clean.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const OUT = path.join(ROOT, 'tools', 'qa', '_r7_subpage_clean.txt');
const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function mockStorage() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { for (const k in m) delete m[k]; },
    key: i => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; }
  };
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

async function testPage(page, navKeys) {
  w('== ' + page + ' ==');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const msg = String((e && e.message) || e);
    if (!/navigation/i.test(msg)) errs.push(msg.slice(0, 300) + (e && e.detail ? ' [detail:' + String(e.detail).slice(0, 120) + ']' : ''));
  });
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ').slice(0, 200)));
  vc.on('warn', (...a) => { const s = a.join(' ').slice(0, 200); if (/SubpageRouter/i.test(s)) errs.push('console.warn: ' + s); });

  const fileUrl = 'file:///' + path.join(ROOT, page).replace(/\\/g, '/');
  let dom;
  try {
    dom = await JSDOM.fromFile(path.join(ROOT, page), {
      resources: 'usable',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(win) {
        try { Object.defineProperty(win, 'localStorage', { value: mockStorage(), configurable: true }); } catch (e) {}
        try { Object.defineProperty(win, 'sessionStorage', { value: mockStorage(), configurable: true }); } catch (e) {}
        win.__qaErrors = [];
        win.addEventListener('error', e => win.__qaErrors.push(String((e && e.message) || e)));
        win.fetch = function () { return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) }); };
        try { win.localStorage.setItem('study_workbench_token', 'qa-token'); } catch (e) {}
        if (!win.ResizeObserver) win.ResizeObserver = function () { this.observe = function () {}; this.unobserve = function () {}; this.disconnect = function () {}; };
        if (!win.IntersectionObserver) win.IntersectionObserver = function () { this.observe = function () {}; this.unobserve = function () {}; this.disconnect = function () {}; };
        if (!win.matchMedia) win.matchMedia = function (q) { return { matches: false, media: q, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };
      }
    });
  } catch (e) { w('FATAL fromFile: ' + e.message); w(''); return; }

  const win = dom.window;
  const doc = win.document;
  await new Promise(r => { if (doc.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 15000); });
  await wait(1200);

  const sr = win.SubpageRouter;
  w('SubpageRouter=' + (typeof sr) + ' _state=' + (sr && sr._state ? 'SET' : 'NULL') +
    ' loadAllSettings=' + (typeof win.loadAllSettings));
  if (sr && sr._state) w('  validKeys=' + Object.keys(sr._state.validKeys).join(','));

  // R7c gate assertions: body must carry sp-ready after router init; the FOUC
  // gate selector body:not(.sp-ready) [data-subpage] must therefore MISS body.
  let gateHits = null;
  try { gateHits = doc.body.matches(':not(.sp-ready)'); } catch (e) { gateHits = 'ERR:' + e.message; }
  w('R7cGate spReady=' + doc.body.classList.contains('sp-ready') + ' gateHitsBody=' + gateHits);

  const scriptCount = doc.querySelectorAll('script[src]').length;
  w('script[src] in DOM=' + scriptCount);
  // which external scripts did NOT execute? check a marker per known asset
  const known = ['subpage-router.js', 'xt-settings.js', 'app.js', 'api.js', 'config.js', 'error-boundary.js'];
  known.forEach(k => {
    const el = Array.prototype.find.call(doc.querySelectorAll('script[src]'), s => s.getAttribute('src').indexOf(k) >= 0);
    w('  tag ' + k + ' present=' + !!el);
  });

  const cards = Array.prototype.slice.call(doc.querySelectorAll('.subpage-group-card'));
  w('group cards=' + cards.length);
  for (const key of navKeys) {
    const card = cards.find(c => (c.getAttribute('onclick') || '').indexOf("'" + key + "'") >= 0);
    if (card) card.click(); else if (sr && sr.navigate) sr.navigate(key); else { w('  -> ' + key + ': NO WAY TO NAV'); continue; }
    await wait(250);
    const sects = doc.querySelectorAll('[data-subpage]');
    const vis = []; let targetComputedNone = false;
    sects.forEach(s => {
      if (disp(s) !== 'none(inline)') vis.push(s.getAttribute('data-subpage'));
      if (s.getAttribute('data-subpage') === key) {
        try { const cd = win.getComputedStyle(s).display; if (cd === 'none') targetComputedNone = true; } catch (e) {}
      }
    });
    w('  -> ' + key + ': hash=' + (win.location.hash || '(none)') + ' visible=[' + vis.join(',') + '] list=' + disp(doc.querySelector('.subpage-list')) +
      (targetComputedNone ? ' ** COMPUTED-NONE(R7c-FAIL: CSS gate still hiding) **' : ' computed-ok'));
    if (sr && sr.navigate) { sr.navigate('list'); await wait(120); }
  }
  w('errors(' + errs.length + '):'); errs.slice(0, 10).forEach(e => w('   * ' + e));
  w('__qaErrors(' + (win.__qaErrors || []).length + '):'); (win.__qaErrors || []).slice(0, 10).forEach(e => w('   ! ' + String(e).slice(0, 250)));
  w('');
  try { win.close(); } catch (e) {}
}

function staticGateCheck(page) {
  const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const gated = /body:not\(\.sp-ready\)\s*\[data-subpage\]\s*\{display:none\}/.test(src);
  const residual = src.replace(/body:not\(\.sp-ready\)\s*\[data-subpage\]\s*\{display:none\}/g, '').indexOf('[data-subpage]{display:none}') >= 0;
  w('[gate-static] ' + page + ' gatedRule=' + gated + ' bareResidual=' + residual);
}

(async function main() {
  staticGateCheck('\u4e2a\u4eba\u4e2d\u5fc3.html');
  staticGateCheck('\u8bbe\u7f6e.html');
  await testPage('\u4e2a\u4eba\u4e2d\u5fc3.html', ['prefs', 'posts']);
  await testPage('\u8bbe\u7f6e.html', ['appearance', 'ai']);
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); console.log('DONE'); }
  catch (e) { console.log('WRITE FAILED: ' + e.message); }
})();
