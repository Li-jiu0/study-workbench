/**
 * R89-B jsdom assertions.
 *
 * Coverage:
 *   T1  地区选择.html  — 滚动修复规则已写入页面 <style>，且无残留生效于根容器的 overflow:hidden
 *   T2  XT_LOC_PICK.openPicker — 列表具备滚动上下文（flex + min-height:0 + overflow-y:auto），
 *       且不再存在打断 flex 的无样式 .xtlp-body 中间 div
 *   T3  朋友圈发布.html — #xtmLocBtn 点击触发位置选择（可测缝 xtmLocPick 被调用）
 *   T4  朋友圈发布.html — #xtmAtBtn 点击同样触发
 *   T5  降级 — window.XT_LOC_PICK 不存在时点按钮不抛异常 + 有提示且并发起整页跳转
 *
 * Assertion strategy (important):
 *   jsdom does NOT perform layout, so "can it scroll" cannot be proven by computed
 *   styleboxes. Instead we assert on the authored CSS *text*: the fix rules must be
 *   present in the page's own <style>, and the common.css root lock (`overflow:hidden`
 *   on html/body) must be overridden by a page-scoped selector. For openPicker we
 *   inspect the injected <style> element's textContent.
 *
 * Run:  NODE_PATH=C:/Users/ATM/node_modules <node> tools/qa/r89b_assert.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var ROOT = path.resolve(__dirname, '..', '..');

var pass = 0, fail = 0, lines = [];
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('  PASS  ' + name); }
  else { fail++; lines.push('  FAIL  ' + name + (extra ? ('  << ' + extra) : '')); }
}
function section(t) { lines.push(''); lines.push('== ' + t + ' =='); }

function readBytes(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

function newDom(rel, opts) {
  var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  var o = {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/')
  };
  if (opts) { Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); }
  return new JSDOM(html, o);
}

/* ============================================================
 * T1  地区选择.html  —  滚动上下文
 * ============================================================ */
section('T1 地区选择.html 滚动上下文');
(function () {
  var raw = readBytes('地区选择.html');
  var src = raw.toString('utf8');

  // The page-local <style> block.
  var m = src.match(/<style>([\s\S]*?)<\/style>/);
  var css = m ? m[1] : '';

  // Placeholder replaced below after asserting the fix signature.
  var hasHtmlFix = /html\s*\{[^}]*height:\s*auto[^}]*overflow-y:\s*auto/.test(css);
  var hasBodyFix = /body\.theme-home\s*\{[^}]*height:\s*auto[^}]*min-height:\s*100%[^}]*overflow-y:\s*auto/.test(css);
  ok('本页 <style> 含 html{height:auto;overflow-y:auto} 覆盖规则', hasHtmlFix);
  ok('本页 <style> 含 body.theme-home{height:auto;min-height:100%;overflow-y:auto} 覆盖规则', hasBodyFix);

  // common.css root lock must exist (documenting the real cause).
  var common = readBytes('assets/common.css').toString('utf8');
  var lock = /html\s*,\s*body\s*\{\s*height:\s*100%;\s*overflow:\s*hidden;?\s*\}/.test(common);
  ok('复核真因：assets/common.css 存在 html, body { height:100%; overflow:hidden; }', lock);

  // Page override must win: body.theme-home (class) beats html,body (elements).
  ok('本页覆盖用高特异性选择器 body.theme-home（> html,body 元素选择器）', /body\.theme-home\s*\{/.test(css));

  // sticky header must remain intact (not broken by our fix).
  ok('.xtr-head 仍保留 position:sticky;top:0（吸顶未破坏）', /\.xtr-head\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/.test(css));

  // no clamp/min/max CSS in the page style
  ok('本页 CSS 未使用 clamp()/min()/max()', !/\bclamp\s*\(/.test(css) && !/\bmin\s*\(/.test(css) && !/\bmax\s*\(/.test(css));
})();

/* ============================================================
 * T2  XT_LOC_PICK.openPicker  —  列表滚动上下文
 * ============================================================ */
section('T2 XT_LOC_PICK.openPicker 列表滚动');
(function () {
  var dom = newDom('地区选择.html');
  var win = dom.window;
  var doc = win.document;

  // Load the region base into this window.
  win.eval(fs.readFileSync(path.join(ROOT, 'assets/xt-region.js'), 'utf8'));

  ok('window.XT_LOC_PICK 存在', !!(win.XT_LOC_PICK && typeof win.XT_LOC_PICK.openPicker === 'function'));

  win.XT_LOC_PICK.openPicker({ title: '选择位置', confirmText: '确定' });

  var root = doc.querySelector('.xtlp');
  ok('openPicker 生成根容器 .xtlp', !!root);

  var body = doc.querySelector('.xtlp-body');
  ok('存在 .xtlp-body 内容容器', !!body);

  var styleEl = root ? root.querySelector('style') : null;
  var css = styleEl ? styleEl.textContent : '';
  ok('注入 <style> 存在', !!styleEl);

  // .xtlp-list must carry the scroll context.
  var listRule = (css.match(/\.xtlp-list\{[^}]*\}/) || [''])[0];
  ok('.xtlp-list 规则存在于注入样式', !!listRule, listRule);
  ok('.xtlp-list 含 flex:1 1 0%（可伸缩）', /flex:\s*1\s+1\s+0%/.test(listRule), listRule);
  ok('.xtlp-list 含 min-height:0（flex 溢出滚动关键）', /min-height:\s*0/.test(listRule), listRule);
  ok('.xtlp-list 含 overflow-y:auto', /overflow-y:\s*auto/.test(listRule), listRule);

  // .xtlp-body must be the flex-column box (absolute + flex column).
  var bodyRule = (css.match(/\.xtlp-body\{[^}]*\}/) || [''])[0];
  ok('.xtlp-body 规则存在且为 flex 列容器（position:absolute + display:flex + column）',
    /position:\s*absolute/.test(bodyRule) && /display:\s*flex/.test(bodyRule) && /flex-direction:\s*column/.test(bodyRule), bodyRule);

  // The DOM wrapper must actually carry the class (no unstyled middle div).
  ok('.xtlp-body 作为真实 DOM 容器存在（类名已挂载）', !!body && body.className === 'xtlp-body');

  // No clamp/min/max in openPicker CSS
  ok('openPicker CSS 未使用 clamp()/min()/max()', !/\bclamp\s*\(/.test(css) && !/\bmin\s*\(/.test(css) && !/\bmax\s*\(/.test(css));

  win.close();
})();

/* ============================================================
 * T3/T4  朋友圈发布.html  —  两个位置按钮触发位置选择
 * ============================================================ */
section('T3/T4 朋友圈发布.html 位置按钮');
(function () {
  var dom = newDom('朋友圈发布.html');
  var win = dom.window;
  var doc = win.document;

  // Inject the real base, then the real moments module.
  win.eval(fs.readFileSync(path.join(ROOT, 'assets/xt-region.js'), 'utf8'));

  // Provide minimal globals the moments module expects (toast / config).
  win.eval('window.__XT_PROD__=true;');
  win.eval("if(!window.showToast){window.showToast=function(){};}");
  win.eval("window.STUDY_API_BASE='';");

  win.eval(fs.readFileSync(path.join(ROOT, 'assets/xt-moments.js'), 'utf8'));

  // Boot the publish page with an instrumented nav seam + openPicker spy.
  var navHits = [];
  win.xtmNavHook = function (u) { navHits.push(u); };

  var opened = [];
  var realOpen = win.XT_LOC_PICK.openPicker;
  win.XT_LOC_PICK.openPicker = function (opts, cb) { opened.push(opts || {}); };

  ok('XTM.boot 可调用', !!(win.XTM && typeof win.XTM.boot === 'function'));
  win.XTM.boot();

  var locBtn = doc.querySelector('#xtmLocBtn');
  var atBtn = doc.querySelector('#xtmAtBtn');
  ok('#xtmLocBtn 存在', !!locBtn);
  ok('#xtmAtBtn 存在', !!atBtn);

  // T3: click "位置" -> openPicker called
  var before = opened.length;
  locBtn && locBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok('#xtmLocBtn 点击触发位置选择（openPicker 被调用）', opened.length === before + 1);

  // T4: click "所在位置" -> openPicker called
  before = opened.length;
  atBtn && atBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok('#xtmAtBtn 点击触发位置选择（openPicker 被调用）', opened.length === before + 1);

  // Both must request a confirm label (统一口径).
  ok('两次调用都传入 confirmText', opened.every(function (o) { return typeof o.confirmText === 'string' && o.confirmText.length; }), JSON.stringify(opened));

  // Confirm wiring: picking a value writes into the draft & shows on #xtmChosen.
  var cb = null;
  win.XT_LOC_PICK.openPicker = function (opts, c) { cb = c; };
  locBtn && locBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  ok('openPicker 收到回调', typeof cb === 'function');
  if (typeof cb === 'function') {
    cb('广东省 广州市 天河区');
    var chosen = doc.querySelector('#xtmChosen');
    ok('选中后写入 #xtmChosen 显示区', !!chosen && chosen.textContent.indexOf('天河') >= 0, chosen ? chosen.textContent : '(none)');
  }

  win.close();
})();

/* ============================================================
 * T5  降级 — XT_LOC_PICK 缺失
 * ============================================================ */
section('T5 降级（XT_LOC_PICK 缺失）');
(function () {
  var dom = newDom('朋友圈发布.html');
  var win = dom.window;
  var doc = win.document;

  // NOTE: do NOT load xt-region.js -> window.XT_LOC_PICK stays undefined.
  win.eval('window.__XT_PROD__=true;');
  // The publish page ships `#toast`; the moments module's private toast() writes
  // into it (and calls window.showToast if present). Spy on BOTH so the fallback
  // is provably visible, not silent.
  win.eval("window.__t=[];");
  win.eval("window.showToast=function(m){ window.__t.push(String(m)); };");
  win.eval("window.XT_TOAST=function(m){ window.__t.push(String(m)); };");
  win.eval("window.STUDY_API_BASE='';");
  win.eval(fs.readFileSync(path.join(ROOT, 'assets/xt-moments.js'), 'utf8'));

  ok('确认 window.XT_LOC_PICK 不存在（降级前提）', typeof win.XT_LOC_PICK === 'undefined');

  var navHits = [];
  win.xtmNavHook = function (u) { navHits.push(u); };
  win.XTM.boot();

  var locBtn = doc.querySelector('#xtmLocBtn');
  var atBtn = doc.querySelector('#xtmAtBtn');

  // Click must NOT throw.
  var threw = null;
  try {
    locBtn && locBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
    atBtn && atBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  } catch (e) { threw = e; }
  ok('底座缺失时点击不抛异常', threw === null, threw && threw.message);

  // Fallback: should navigate to 地区选择.html (整页降级).
  ok('降级发起整页跳转 地区选择.html', navHits.length === 2 && navHits.every(function (u) { return u.indexOf('地区选择.html') === 0; }), JSON.stringify(navHits));
  ok('跳转 URL 带 back=朋友圈发布.html', navHits.length > 0 && navHits[0].indexOf('back=') >= 0, navHits[0]);

  // ---- 真·极死路（跳转本身也失败）→ 必须「不白屏、不静默」 ----
  // A throwing nav hook is caught inside xtmNav/xtmOpenRegionPage and degrades.
  var deadThrew = null;
  win.xtmNavHook = function () { throw new Error('nav blocked (simulated dead env)'); };
  win.eval('window.__t=[];');       // reset spy
  try {
    locBtn && locBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  } catch (e) { deadThrew = e; }
  var t2 = win.__t || [];
  var toastDom2 = doc.querySelector('#toast');
  var domText2 = toastDom2 ? (toastDom2.textContent || '') : '';
  ok('跳转也失败时点击不抛异常（不白屏）', deadThrew === null, deadThrew && deadThrew.message);
  ok('跳转也失败时有可见提示（toast 非静默，走 #toast / window.showToast）', t2.length > 0 || domText2.length > 0,
    'spy=' + JSON.stringify(t2) + ' dom=' + JSON.stringify(domText2));
  ok('跳转也失败时降级为本页半屏输入（inputSheet 的 .xtm-sheet 出现）',
    !!doc.querySelector('.xtm-sheet, .xtm-overlay'),
    'no sheet DOM found');

  win.close();
})();

/* ============================================================
 * Report
 * ============================================================ */
console.log(lines.join('\n'));
console.log('\n---------------------------------------------');
console.log('R89-B jsdom: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed');
console.log('---------------------------------------------');
process.exit(fail === 0 ? 0 : 1);
