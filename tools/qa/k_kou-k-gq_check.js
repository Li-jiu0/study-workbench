/* 20260913K kou-k-gq 静态断言：高情商表达.html 弹窗面板化 + emoji 容器清零 + K6 */
const fs = require('fs');
const PATH = 'D:/下载的文件/学习工作台/高情商表达.html';
const ICONMAP = 'D:/下载的文件/学习工作台/assets/icon-map.js';
const results = [];
function assert(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || '' }); }

const html = fs.readFileSync(PATH, 'utf8');
const iconmap = fs.readFileSync(ICONMAP, 'utf8');

/* 1. 被删菜单名 0 命中 */
assert('「i人沟通专区」0 命中', !html.includes('i人沟通专区'));
assert('「comm-introvert」0 命中', !html.includes('comm-introvert'));

/* 2. 三个入口均为面板/页面视图 */
assert('案例拆解库入口 → openGqCasesView', /onclick="openGqCasesView\(\)"/.test(html));
assert('i人伙伴团入口 → openGqIpartnerView', /onclick="openGqIpartnerView\(\)"/.test(html));
assert('入口不再直调 openMiniQuiz(comm-cases)', !/onclick="openMiniQuiz\(/.test(html));
assert('入口不再直调 IPartner.open()', !/onclick="IPartner\.open\(\)"/.test(html));
assert('面板 #gqCasesView 在位', html.includes('id="gqCasesView"') && html.includes('id="gqCasesSlot"'));
assert('面板 #gqIpartnerView 在位', html.includes('id="gqIpartnerView"') && html.includes('id="gqIpartnerSlot"'));
assert('案例面板 mz-* 载体替换样式在位', html.includes('.gq-cases-slot .mz-mask') && html.includes('.gq-cases-slot .mz-head{display:none}'));
assert('伙伴团面板 ip-* 载体替换样式在位', html.includes('.gq-ip-slot .ip-mask') && html.includes('.gq-ip-slot .ip-close{display:none}'));
assert('返回栏+ESC+锁滚动逻辑在位', html.includes('closeGqCasesView') && html.includes('closeGqIpartnerView') && html.includes("'Escape'") && html.includes('openAppModal'));
assert('i人心法并入面板（5 卡）', (html.match(/gq-mindset-card"/g) || []).length === 5);

/* 3. 角色扮演训练 = 页面视图 + 布局重构 + 功能 id 保留 */
assert('roleplay 为页内 page', html.includes('id="page-roleplay-demo"'));
assert('roleplay 返回栏在位', html.includes('class="rp-topbar"') && html.includes("navigateTo('comm')"));
['rpCurrent', 'rpDialogue', 'rpInput', 'rpEval', 'submitRoleplay()', 'nextRoleplayRound()'].forEach(function (k) {
  assert('roleplay 功能契约保留: ' + k, html.includes(k));
});

/* 4. K6：themeToggle / 搜索 placeholder */
assert('themeToggle 🌙→moon data-icon', /id="themeToggle"[^>]*><span class="nav-icon" data-icon="moon"/.test(html) && !html.includes('>🌙<'));
assert('搜索 placeholder 无 🔍', !html.includes('🔍'));

/* 5. data-icon 引用名均已注册（或 appjs 承诺注册的 moon/eraser） */
var pending = { moon: 1, eraser: 1 };
var names = {};
html.replace(/data-icon="([a-z0-9-]+)"/g, function (_, n) { names[n] = 1; return _; });
var missing = Object.keys(names).filter(function (n) {
  return !iconmap.includes('"' + n + '":') && !pending[n];
});
assert('data-icon 名称全部可解析', missing.length === 0, missing.join(','));

/* 6. *ic* 容器 emoji=0（icon/图标类容器行内不允许 emoji；用户/AI 头像内容行豁免） */
var emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}]/gu;
var allow = ['user-streak', 'aiFab', 'ai-avatar', 'ai-mode-badge'];
var hits = [];
html.split('\n').forEach(function (line, i) {
  if (!emojiRe.test(line)) return;
  emojiRe.lastIndex = 0;
  if (allow.some(function (a) { return line.includes(a); })) return;
  hits.push('L' + (i + 1) + ': ' + line.trim().slice(0, 90));
});
assert('页内 emoji 容器清零（除侧栏用户打卡/AI 头像内容行）', hits.length === 0, hits.join(' | '));

/* 7. 新增 id 无重复 */
['gqCasesView', 'gqCasesSlot', 'gqIpartnerView', 'gqIpartnerSlot'].forEach(function (id) {
  var n = (html.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  assert('id 唯一: ' + id, n === 1, 'count=' + n);
});

/* 8. 标签配平粗检 */
function count(re) { return (html.match(re) || []).length; }
assert('<div>/</div> 配平', count(/<div\b/g) === count(/<\/div>/g), count(/<div\b/g) + ' vs ' + count(/<\/div>/g));
assert('<span>/</span> 配平', count(/<span\b/g) === count(/<\/span>/g), count(/<span\b/g) + ' vs ' + count(/<\/span>/g));
assert('script 标签配平', count(/<script[\s>]/g) === count(/<\/script>/g), count(/<script[\s>]/g) + ' vs ' + count(/<\/script>/g));

var failed = results.filter(function (r) { return !r.pass; });
var out = [];
out.push('=== kou-k-gq 自验断言（高情商表达.html） ===');
results.forEach(function (r) {
  out.push((r.pass ? '[PASS] ' : '[FAIL] ') + r.name + (r.detail ? '  → ' + r.detail : ''));
});
out.push('---');
out.push('TOTAL: ' + results.length + '  PASS: ' + (results.length - failed.length) + '  FAIL: ' + failed.length);
out.push(failed.length === 0 ? 'IS_PASS: YES' : 'IS_PASS: NO');
var report = out.join('\r\n');
fs.writeFileSync('D:/下载的文件/学习工作台/tools/qa/k_kou-k-gq.log', report, 'utf8');
console.log(report);
