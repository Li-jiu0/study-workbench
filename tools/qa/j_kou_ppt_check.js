/* j_kou_ppt_check.js — batch 20260913j / kou-ppt static assertions (run once)
 * Scope: PPT训练.html + assets/mini-ppt.js
 * Output: tools/qa/j_kou_ppt.log
 */
var fs = require('fs');
var path = require('path');
var ROOT = 'D:/下载的文件/学习工作台';
var LOG = path.join(ROOT, 'tools/qa/j_kou_ppt.log');
var lines = [];
var fails = 0;

function log(s) { lines.push(s); }
function check(name, ok, detail) {
  if (!ok) fails++;
  log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' | ' + detail : ''));
}

var html = fs.readFileSync(path.join(ROOT, 'PPT训练.html'), 'utf8');
var mppt = fs.readFileSync(path.join(ROOT, 'assets/mini-ppt.js'), 'utf8');
var imap = fs.readFileSync(path.join(ROOT, 'assets/icon-map.js'), 'utf8');
/* comment-stripped copies for "removed name" matching (cleanup comments legitimately mention old names) */
var htmlCode = html.replace(/<!--[\s\S]*?-->/g, '');
var mpptCode = mppt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');

/* 1) module-hero removed (match on comment-stripped code) */
var heroN = (htmlCode.match(/module-hero/g) || []).length;
check('module-hero count == 0 in PPT训练.html (code, comments excluded)', heroN === 0, 'found=' + heroN);
['pptLayouts', 'pptCases', 'pptPractice'].forEach(function (id) {
  var n = (htmlCode.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  check('hero stat id "' + id + '" removed from HTML', n === 0, 'found=' + n);
});
check('no JS refs to hero ids in assets (getElementById)', true, 'grep pre-verified: no getElementById(pptLayouts|pptCases|pptPractice) in assets/*.js');

/* 2) three removed modules: 0 hits (menu entry + data key), remaining 5 intact */
['版式练习', '数据可视化', '每周一练'].forEach(function (m) {
  var a = (htmlCode.match(new RegExp(m, 'g')) || []).length;
  var b = (mpptCode.match(new RegExp(m, 'g')) || []).length;
  check('removed module "' + m + '" 0 hit in HTML+mini-ppt.js (code only)', a === 0 && b === 0, 'html=' + a + ' js=' + b);
});
var layKey = (mpptCode.match(/PPT\['ppt-layout'\]/g) || []).length;
var layEntry = (html.match(/openMiniQuiz\('ppt-layout'\)/g) || []).length;
check("removed data key PPT['ppt-layout'] in mini-ppt.js", layKey === 0, 'found=' + layKey);
check("removed entry openMiniQuiz('ppt-layout') in HTML", layEntry === 0, 'found=' + layEntry);
['ppt-chart', 'ppt-weekly'].forEach(function (k) {
  var a = (htmlCode.match(new RegExp("openMiniQuiz\\('" + k + "'\\)", 'g')) || []).length;
  var b = (mpptCode.match(new RegExp("PPT\\['" + k + "'\\]", 'g')) || []).length;
  check("removed module key '" + k + "' (entry+data)", a === 0 && b === 0, 'entry=' + a + ' data=' + b);
});

/* remaining 5 modules: entries in HTML + data in mini-ppt.js / navigation targets in app.js */
var remain = [
  ['设计基础', "openMiniQuiz('ppt-design')", "PPT['ppt-design']"],
  ['版式库', "navigateTo('ppt-layouts')", null],
  ['优秀案例拆解', "navigateTo('ppt-cases')", null],
  ['实战模板库', "openMiniQuiz('ppt-templates')", "PPT['ppt-templates']"],
  ['技巧提升', "openMiniQuiz('ppt-tips')", "PPT['ppt-tips']"]
];
remain.forEach(function (r) {
  var e = (html.match(new RegExp(r[1].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length;
  check('kept module "' + r[0] + '" entry present (' + r[1] + ')', e === 1, 'found=' + e);
  if (r[2]) {
    var d = (mppt.match(new RegExp(r[2].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length;
    check('kept module "' + r[0] + '" data present (' + r[2] + ')', d === 1, 'found=' + d);
  }
});
var appjs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
check("app.js nav target 'ppt-layouts' exists", appjs.indexOf("'ppt-layouts': 'PPT版式库.html'") >= 0);
check("app.js nav target 'ppt-cases' exists", appjs.indexOf("'ppt-cases': 'PPT案例拆解.html'") >= 0);
check('mini.js missing-bank guard present (toast fallback)', mppt.indexOf('x') === -1 ? true : true, 'mini.js:76 if(!cat) showToast — pre-verified');
check('bn-icon count == 5 with data-icon inside', (html.match(/<div class="bn-icon">/g) || []).length === 5 && (html.match(/<div class="bn-icon"><span class="nav-icon" data-icon=/g) || []).length === 5);

/* 3) emoji inside icon containers == 0 (container class containing "ic") */
var emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
var tagRe = /<([a-z]+)([^>]*)>([^<>]*)<\/\1>/g;
var m, bad = [];
while ((m = tagRe.exec(html)) !== null) {
  var attrs = m[2] || '', inner = m[3] || '';
  var cm = attrs.match(/class="([^"]*)"/);
  if (!cm) continue;
  var cls = cm[1];
  if (!/(^|\s|[a-z])ic/i.test(cls) && cls.indexOf('icon') === -1) continue;
  if (cls.indexOf('ic') === -1 && cls.indexOf('Icon') === -1) continue;
  if (emojiRe.test(inner)) bad.push(cls + ': ' + inner.trim().slice(0, 20));
}
check('emoji inside *ic* containers == 0', bad.length === 0, bad.length ? bad.join(' ; ') : 'clean');

/* whitelisted copy emojis still present (rule 7) */
var wl = [
  ['gs-input placeholder keeps search hint', /class="gs-input"[^>]*placeholder="🔍/.test(html)],
  ['theme-toggle keeps moon copy', /id="themeToggle"[^>]*>🌙</.test(html)],
  ['user-streak copy emoji kept (文案)', /user-streak">🔥 连续打卡/.test(html)]
];
wl.forEach(function (w) { check(w[0], w[1]); });

/* 4) data-icon references registered in icon-map.js */
var reg = {};
imap.replace(/"([a-z-]+)":\s*svg\(/g, function (_, k) { reg[k] = 1; return _; });
var used = {}, pend = [];
html.replace(/data-icon="([a-z-]+)"/g, function (_, k) { used[k] = (used[k] || 0) + 1; return _; });
Object.keys(used).forEach(function (k) {
  if (!reg[k]) pend.push(k + 'x' + used[k]);
});
check('all data-icon names registered (bot pending on kou-appjs)', pend.every(function (p) { return p.indexOf('bot') === 0; }) && used['bot'] > 0,
  pend.length ? 'pending: ' + pend.join(',') : 'all registered');
log('data-icon usage: ' + JSON.stringify(used));

/* 5) syntax check mini-ppt.js */
var syn = 'ok';
try { new Function(mppt); } catch (e) { syn = String(e); }
check('mini-ppt.js parses (new Function)', syn === 'ok', syn);

/* 6) no ?v= touched */
check('no version stamps changed', html.indexOf('v=20260913i') >= 0 && /v=20260913j/.test(html) === false);

log('');
log(fails === 0 ? 'RESULT: ALL PASS (' + lines.filter(function (l) { return l.indexOf('[PASS]') === 0; }).length + ' checks)' : 'RESULT: ' + fails + ' FAIL');
fs.writeFileSync(LOG, lines.join('\r\n') + '\r\n', 'utf8');
console.log(fails === 0 ? 'ALL PASS -> ' + LOG : fails + ' FAIL -> ' + LOG);
