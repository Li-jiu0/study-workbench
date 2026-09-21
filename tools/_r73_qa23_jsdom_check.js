// C-segment behavior check for 动态空间 entry. Outputs one JSON line.
// App.js is injected via a <script> textContent (not inline-in-HTML) to avoid
// jsdom HTML script-data re-parsing issues with the large file.
const fs = require('fs');
const jsdomPath = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
const { JSDOM, VirtualConsole } = require(jsdomPath);
const ROOT = 'D:/下载的文件/学习工作台/';

function parseObjLiteral(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  if (open < 0) return null;
  let depth = 0, j = open;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  const lit = src.slice(open, j + 1);
  try { return eval('(' + lit + ')'); } catch (e) { return { __evalErr: String(e) }; }
}

const appjsRaw = fs.readFileSync(ROOT + 'assets/app.js', 'utf8');
const PF = parseObjLiteral(appjsRaw, 'const PAGE_FILES = {') || {};
const PT = parseObjLiteral(appjsRaw, 'const pageTitles = {') || {};

let appjs = appjsRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
// expose tables right after the PAGE_FILES block close (both pageTitles and PAGE_FILES defined by then)
const pfIdx = appjs.indexOf('const PAGE_FILES = {');
const open = appjs.indexOf('{', pfIdx); let depth = 0, k = open;
for (; k < appjs.length; k++) { const c = appjs[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
const insAt = k + 1;
appjs = appjs.slice(0, insAt) + '\n;try{window.__PF=PAGE_FILES;window.__PT=pageTitles;}catch(e){window.__EXPERR=String(e);}\n' + appjs.slice(insAt);

const html = fs.readFileSync(ROOT + '学习工作台.html', 'utf8');
const out = { ok: true, steps: {} };
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
let dom;
try {
  dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc,
    beforeParse(window) { window.__warn = 0; window.console.warn = function () { window.__warn++; }; } });
} catch (e) { out.ok = false; out.fatal = String(e); console.log(JSON.stringify(out)); process.exit(0); }
const w = dom.window, d = w.document;
try {
  const s = d.createElement('script');
  s.textContent = appjs;
  d.body.appendChild(s); // executes app.js in window context
} catch (e) { out.ok = false; out.fatal = 'inject:' + String(e); console.log(JSON.stringify(out)); process.exit(0); }

setTimeout(() => {
  try {
    out.steps.pageFilesMoments = PF.moments || null;
    out.steps.pageTitlesMoments = PT.moments || null;
    out.steps.exposeErr = w.__EXPERR || null;

    const el = d.querySelector('[data-page="moments"]');
    let c1 = { exists: false, text: null, display: null, hiddenByAncestor: false, pass: false };
    if (el) {
      c1.exists = true; c1.text = (el.textContent || '').trim();
      try { c1.display = w.getComputedStyle(el).display; } catch (_) {}
      let hidden = false, p = el.parentElement;
      while (p) { try { if (w.getComputedStyle(p).display === 'none') hidden = true; } catch (_) {} p = p.parentElement; }
      c1.hiddenByAncestor = hidden;
      c1.pass = c1.text.indexOf('动态空间') >= 0 && !hidden;
    }
    out.steps.c1 = c1;

    let c3 = { noWarn: null, threw: false, err: null, targetViaTable: PF.moments || null, pass: false };
    try { w.__warn = 0; w.navigateTo('moments'); c3.noWarn = (w.__warn === 0); }
    catch (e) { c3.threw = true; c3.err = String(e); c3.noWarn = (w.__warn === 0); }
    c3.pass = (c3.targetViaTable === '动态.html') && (c3.noWarn === true);
    out.steps.c3 = c3;

    let c4 = { warned: false, threw: false, pass: false };
    try { w.__warn = 0; w.navigateTo('一个不存在的页面xyz'); c4.warned = (w.__warn > 0); }
    catch (e) { c4.threw = true; c4.warned = (w.__warn > 0); }
    c4.pass = c4.warned;
    out.steps.c4 = c4;
  } catch (e) { out.ok = false; out.fatal = String(e); }
  console.log(JSON.stringify(out));
}, 300);
