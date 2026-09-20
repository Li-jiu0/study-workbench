/* J batch (20260913j) static assertions for kou-appjs scope.
   Run once: node tools/qa/j_kou_appjs_check.js  (result also tee'd to tools/qa/j_kou_appjs.log)
   Scope: assets/app.js + assets/icon-map.js only.
*/
const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台';
const app = fs.readFileSync(ROOT + '/assets/app.js', 'utf8');
const imap = fs.readFileSync(ROOT + '/assets/icon-map.js', 'utf8');

let pass = true;
const out = [];
function chk(name, cond, detail) {
  out.push((cond ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
  if (!cond) pass = false;
}

// ---------- collect registered icon names from icon-map.js ----------
const regNames = new Set();
let m;
const reKey = /"([A-Za-z0-9_-]+)":\s*svg\(/g;
while ((m = reKey.exec(imap))) regNames.add(m[1]);

// collect data-icon names referenced from app.js (literal + via dc fields + icSpan literals + stat arrays)
const used = new Set();
const reLit = /data-icon="([A-Za-z0-9_-]+)"/g;
while ((m = reLit.exec(app))) used.add(m[1]);
const reIcSpan = /icSpan\('([A-Za-z0-9_-]+)'/g;
while ((m = reIcSpan.exec(app))) used.add(m[1]);
(HOME_DEF_DC()).forEach(n => used.add(n));
(BLOG_CATS_DC()).forEach(n => used.add(n));
(MODULE_INDEX_DC()).forEach(n => used.add(n));
['pencil', 'bookmark', 'inbox', 'thumbs-up', 'message-circle', 'eye'].forEach(n => used.add(n));
['bot', 'brain', 'lightbulb', 'book'].forEach(n => used.add(n));
['upload', 'cloud', 'logout', 'settings', 'info', 'chart-bar', 'clock', 'user', 'home'].forEach(n => used.add(n));
function HOME_DEF_DC() {
  const blk = app.match(/var HOME_DEF = \[[\s\S]*?\];/) || [''];
  return [...blk[0].matchAll(/dc:\s*'([A-Za-z0-9_-]+)'/g)].map(x => x[1]);
}
function BLOG_CATS_DC() {
  const blk = app.match(/const BLOG_CATS = \[[\s\S]*?\];/) || [''];
  return [...blk[0].matchAll(/dc:\s*'([A-Za-z0-9_-]+)'/g)].map(x => x[1]);
}
function MODULE_INDEX_DC() {
  const blk = app.match(/const MODULE_INDEX = \[[\s\S]*?\];/) || [''];
  return [...blk[0].matchAll(/dc:\s*'([A-Za-z0-9_-]+)'/g)].map(x => x[1]);
}

// ---------- 1) HOME_DEF / renderHomeQuick dc rendering in place ----------
chk('A1 HOME_DEF 6 items all have dc', HOME_DEF_DC().length === 6, 'found=' + HOME_DEF_DC().length);
chk('A2 HOME_DEF dc mapping correct',
  JSON.stringify(HOME_DEF_DC()) === JSON.stringify(['globe', 'book-open', 'pencil', 'message-square', 'handshake', 'palette']),
  HOME_DEF_DC().join(','));
chk('A3 hq-ic renders data-icon span via x.dc',
  app.includes('<span class="hq-ic"><span class="nav-icon" data-icon="\' + x.dc + \'" data-icon-size="20"></span></span>'));
chk('A4 hq-ic no longer renders raw emoji x.ic', !app.includes('<span class="hq-ic">\' + x.ic + \''));
chk('A5 edit-panel chip keeps x.ic text', app.includes("toggleHomeItem(\\'' + x.k + '\\')\">' + x.ic + ' ' + x.t"));
chk('A6 功能中心 title 🛣️ → data-icon map',
  app.includes('<span class="title-icon" data-icon="map"></span>功能中心') && !app.includes('🛣️'));
chk('A7 renderHomeQuick calls lucideAutoRender',
  /function renderHomeQuick\(\)[\s\S]*?window\.lucideAutoRender/.test(app));

// ---------- 2) blog stats six-grid + post-card emoji containers = 0 ----------
chk('B1 blog stats six-grid emoji array removed', !app.includes("['📝', pub.length"));
chk('B2 profile six-grid emoji array removed', !app.includes("['📝', pub.length, '已发布'], ['💾'"));
chk('B3 six-grid uses icon names array',
  app.includes("['pencil', pub.length, '已发布'], ['bookmark', draft.length, '草稿'], ['inbox', arch.length, '已归档'], ['thumbs-up', totalLikes, '总点赞'], ['message-circle', totalComments, '总评论'], ['eye', totalViews, '总阅读']"));
chk('B4 blog stats title-icon 📊 → chart-bar', app.includes('<span class="title-icon" data-icon="chart-bar"></span>博客数据统计'));
chk('B5 六宫格/分类分布 📚 → book-open icSpan (x2)', (app.match(/icSpan\('book-open', 14\)/g) || []).length === 2);
chk('B6 card stats row 👁/👍/💬 gone', !app.includes('<span>👁') && !app.includes('<span>👍') && !app.includes('<span>💬'));
chk('B7 stats row uses eye/thumbs-up/message-circle icSpan',
  (app.match(/icSpan\('eye', 12\)/g) || []).length >= 2 &&      // card stats + detail reads
  (app.match(/icSpan\('thumbs-up', 12\)/g) || []).length >= 1 && // card stats (detail 👍 赞 is button text, kept by rule 7)
  (app.match(/icSpan\('message-circle', 12\)/g) || []).length >= 1); // card stats (detail 💬 评论区 is section title, kept by rule 7)
chk('B8 nc-cat/nd-cat use cat.dc', (app.match(/icSpan\(cat\.dc, 12\)/g) || []).length === 2);
chk('B9 filter chips use c.dc', (app.match(/icSpan\(c\.dc, 12\)/g) || []).length === 3); // filters + 2 catBars
chk('B10 🌍 公开 badge → globe icSpan (cover + detail)', (app.match(/icSpan\('globe', 12\)/g) || []).length === 2 && !app.includes("'🌍公开'") && !app.includes("'🌍 公开'"));
chk('B11 cover fallback uses cat.dc icon span', app.includes('icSpan(noteCat(n.category).dc, 26)'));
chk('B12 catBars no longer use c.icon', !app.includes('${c.icon} ${c.name}</span>'));

// ---------- 3) AI demo fab 🤖 → bot data-icon (app.js scope) ----------
// R86h：助手头像 bug 修复后，applySettings 不再走 #aiFabBtn 死分支（全站无此节点），
// 改为统一入口 xtApplyAiAvatarToFab()；存储键由误写的 aiIcon 纠正为 aiAvatar。
chk('C1 applySettings applies aiAvatar via xtApplyAiAvatarToFab', app.includes('xtApplyAiAvatarToFab(s.aiAvatar)') && !app.includes("getElementById('aiFabBtn')"));
chk('C1b avatar persisted under aiAvatar key (not aiIcon)', app.includes("setSetting('aiAvatar', icon)") && !app.includes("setSetting('aiIcon'"));
chk('C2 setAiIcon inserts data-icon span (no raw textContent write)', !app.includes('fab.firstChild.textContent = icon'));
chk('C3 AI avatar emoji→icon map present', app.includes("var AI_AVATAR_ICON_MAP = { '🤖': 'bot', '🧠': 'brain', '💡': 'lightbulb', '📚': 'book' }"));
// R86h：旧写法 replaceChild(iconSpan, fab.firstChild) 只替换第一个空白文本节点，
// 原 bot 图标不会移除 → 按钮里叠出两个头像。改为先清空前置文本节点再插入。
chk('C4 fab leading text nodes stripped before icon insert (no icon stacking)', app.includes('while (fab.firstChild && fab.firstChild.nodeType === 3) fab.removeChild(fab.firstChild);'));

// ---------- 4) icon-map.js new icons: format compliance ----------
const NEW_ICONS = ['bot', 'map', 'eye', 'thumbs-up', 'send', 'smile', 'image', 'video', 'brain', 'lightbulb', 'target', 'upload', 'cloud', 'tag'];
NEW_ICONS.forEach(n => chk('D1 registered: ' + n, regNames.has(n)));
const reBody = /"([A-Za-z0-9_-]+)":\s*svg\(([\s\S]*?)\)\s*(?=,\s*\n\s*"|,\s*\n\s*\/\*|\n\s*\};)/g;
let bad = [];
while ((m = reBody.exec(imap))) {
  const name = m[1], body = m[2];
  if (!NEW_ICONS.includes(name)) continue;
  if (/mask|filter|<symbol|<use/.test(body)) bad.push(name + ':forbidden-elem');
  const tags = [...body.matchAll(/<([a-z]+)/g)].map(x => x[1]);
  const allowed = ['path', 'rect', 'circle', 'line', 'polyline', 'polygon'];
  if (tags.some(t => !allowed.includes(t))) bad.push(name + ':' + tags.join('|'));
}
chk('D2 new icons only path/rect/circle/line(+polyline/polygon), no mask/filter/symbol/use', bad.length === 0, bad.join('; '));
chk('D3 icon-map still passes node --check contract (SVG_TPL reused, no second template)',
  (imap.match(/var SVG_TPL/g) || []).length === 1);

// ---------- 5) every data-icon referenced from app.js is registered ----------
const missing = [...used].filter(n => !regNames.has(n));
chk('E1 all app.js data-icon references registered', missing.length === 0, 'missing=' + missing.join(','));

// ---------- report-only scan (no fail): leftover emoji inside icon container classes in app.js ----------
const contClasses = ['title-icon', 'hq-ic', 'stat-icon', 'logo-icon', 'bn-icon', 'bm-icon', 'mpc-icon', 'sgc-icon', 'sq-ic', 'nc-cat', 'nd-cat', 'pp-ic', 'gs-item-icon', 'ps-num'];
const leftovers = [];
const reCont = new RegExp('class="' + contClasses.join('|') + '"[^<]*<', 'g');
const lines = app.split('\n');
lines.forEach((ln, i) => {
  contClasses.forEach(c => {
    const re = new RegExp('class="' + c + '"(>[^<]*)');
    const mm = ln.match(re);
    if (mm && /[\uD800-\uDFFF\u2300-\u2BFF\uFE0F]/.test(mm[1])) leftovers.push('L' + (i + 1) + ' .' + c + ' ' + mm[1].trim().slice(0, 12));
  });
});
out.push('[INFO] leftover emoji inside icon containers in app.js (report-only, outside J-task scope): ' + (leftovers.length ? leftovers.join(' | ') : 'NONE'));

// ---------- 6) J-batch follow-up: pp-ic / gs-item-icon / detail meta ----------
const PP_IC_MAP = ['chart-bar', 'message-circle', 'chart-bar', 'book-open', 'settings', 'info', 'upload', 'cloud', 'logout'];
const ppIcIcons = [...app.matchAll(/class="pp-ic" data-icon="([A-Za-z0-9_-]+)"/g)].map(x => x[1]);
chk('F1 pp-ic all 9 use data-icon with correct mapping', JSON.stringify(ppIcIcons) === JSON.stringify(PP_IC_MAP), ppIcIcons.join(','));
chk('F2 pp-ic raw emoji leftover = 0', !/class="pp-ic">[^<]*[\uD800-\uDFFF]/.test(app));
const miDc = MODULE_INDEX_DC();
chk('F3 MODULE_INDEX 18 entries all have dc', miDc.length === 18, 'found=' + miDc.length);
const miExpected = ['home', 'book-open', 'pencil', 'message-square', 'handshake', 'palette', 'globe', 'pencil', 'book', 'book-open', 'briefcase', 'help-circle', 'ruler', 'tag', 'messages-square', 'sparkles', 'settings', 'user'];
chk('F4 MODULE_INDEX dc mapping correct', JSON.stringify(miDc) === JSON.stringify(miExpected), miDc.join(','));
chk('F5 gs-item-icon renders icSpan(r.icon, 16) x2', (app.match(/icSpan\(r\.icon, 16\)/g) || []).length === 2 && !(/gs-item-icon">' \+ r\.icon/.test(app)));
chk('F6 search results carry icon names (pencil / m.dc), not emoji',
  app.includes("results.push({ icon: 'pencil', title: n.title") && app.includes('results.push({ icon: m.dc, title: m.title'));
chk('F7 globalSearch calls lucideAutoRender', /function globalSearch\(kw\)[\s\S]*?window\.lucideAutoRender[\s\S]*?dd\.classList\.add\('open'\)/.test(app));
chk('F8 detail 更新时间 🕒 → clock icSpan', app.includes("icSpan('clock', 12)} 更新于") && !app.includes('🕒 更新于'));
chk('F9 detail 赞按钮 👍 → thumbs-up icSpan', app.includes("icSpan('thumbs-up', 12)} 赞 ") && !app.includes('>👍 赞 '));
chk('F10 评论区标题 💬 → message-circle icSpan', app.includes("icSpan('message-circle', 14)} 评论区") && !app.includes('>💬 评论区'));

// ---------- verdict ----------
const verdict = pass ? 'IS_PASS: YES' : 'IS_PASS: NO';
out.push(verdict);
const report = out.join('\n') + '\n';
fs.writeFileSync(ROOT + '/tools/qa/j_kou_appjs.log', report);
console.log(report);
process.exit(pass ? 0 : 1);
