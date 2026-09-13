/* j_kou_blog_check.js · 批次 20260913j kou-blog 静态断言（跑一次即判定）
 * 用法: node tools/qa/j_kou_blog_check.js
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..', '..');
var html = fs.readFileSync(path.join(ROOT, '学习博客.html'), 'utf8');
var lines = html.split(/\r?\n/);
var results = [];
function check(name, ok, detail) { results.push({ name: name, ok: !!ok, detail: detail || '' }); }

// ---------- helpers ----------
function findLine(re) {
  for (var i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1; // 1-based
  return -1;
}

// ---------- 断言 1: ed-hero 大卡已无（按 DOM 元素判定，忽略注释/CSS） ----------
var heroDomCount = (html.match(/<(?:div|span)[^>]*class="[^"]*ed-hero[^"]*"/g) || []).length;
var edStatCount = (html.match(/class="ed-stat"/g) || []).length;
check('ed-hero 大卡移除', heroDomCount === 0, 'ed-hero DOM 元素 ' + heroDomCount + ' 个（应为 0）');
check('ed-stat 大卡移除', edStatCount === 0, 'ed-stat 出现 ' + edStatCount + ' 次（应为 0）');
var headBar = findLine(/class="ed-head-bar"/);
check('轻量标题行存在', headBar > 0, 'ed-head-bar 行号 ' + headBar);

// ---------- 断言 2: 字数指示在编辑器工具条区域 ----------
var lnToolbar = findLine(/class="rt-toolbar"/);
var lnWord = findLine(/id="edWordCount"/);
var lnRead = findLine(/id="edReadTime"/);
var lnDraft = findLine(/id="edDraftState"/);
var lnTextarea = findLine(/id="blogEditorInput"/);
var lnViewEdit = findLine(/id="blogViewEdit"/);
var lnViewDetail = findLine(/id="blogViewDetail"/);
check('edWordCount 存在', lnWord > 0, '行号 ' + lnWord);
check('edReadTime 存在', lnRead > 0, '行号 ' + lnRead);
check('edDraftState 存在', lnDraft > 0, '行号 ' + lnDraft);
check('字数指示位于富文本工具条内(紧跟其后)', lnToolbar > 0 && lnWord > lnToolbar && lnWord < lnTextarea,
  'rt-toolbar@' + lnToolbar + ' edWordCount@' + lnWord + ' textarea@' + lnTextarea);
check('字数指示位于编辑视图(blogViewEdit)内部', lnViewEdit > 0 && lnViewDetail > 0 && lnWord > lnViewEdit && lnWord < lnViewDetail,
  'blogViewEdit@' + lnViewEdit + ' blogViewDetail@' + lnViewDetail);
check('草稿状态默认隐藏(display:none)', /id="edDraftState"[^>]*display:none/.test(html) ||
  /display:none[^>]*id="edDraftState"/.test(html.replace(/\r?\n/g, ' ').replace(/>\s+</g, '><').replace(/<span\s+/g, '<span ')) ||
  /<span class="ed-draft-state" id="edDraftState" style="display:none"/.test(html), '');
// 精确复核草稿状态初始隐藏
check('草稿状态初始 hidden 属性精确匹配', /<span class="ed-draft-state" id="edDraftState" style="display:none"><\/span>/.test(html), '');
check('edState 未保存时才显示', /text === '新发贴'/.test(html) && /'● ' \+ text/.test(html), '');

// ---------- 断言 3: 按钮条 DOM 位于预览容器之后（同视图内） ----------
var lnPreview = findLine(/id="blogEditorPreview"/);
var lnActions = findLine(/class="editor-actions ed-actions-bar"/);
check('按钮条位于预览容器之后', lnPreview > 0 && lnActions > lnPreview,
  'preview@' + lnPreview + ' actions@' + lnActions);
check('按钮条在 blogViewEdit 内', lnActions > lnViewEdit && lnActions < lnViewDetail, '');
check('四个按钮事件绑定保留',
  /onclick="saveBlogNote\('published'\)"/.test(html) &&
  /onclick="saveBlogNote\('draft'\)"/.test(html) &&
  /onclick="editorAiAssist\(\)"/.test(html) &&
  /onclick="resetBlogEditor\(\)"/.test(html), '');

// ---------- 断言 4: icon 容器 emoji = 0 ----------
var containerRe = /class="[^"]*(?:logo-icon|stat-icon|title-icon|sgc-icon|sq-ic|hq-ic|mpc-icon|bn-icon|bm-icon|nav-icon|ed-hero-emoji|ed-stat)[^"]*"[^>]*>([^<]*)</g;
var bad = [];
var m;
while ((m = containerRe.exec(html)) !== null) {
  var inner = m[1].trim();
  if (inner && /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2700}-\u{27BF}]/u.test(inner)) {
    var upTo = html.slice(0, m.index);
    bad.push('line ' + (upTo.split(/\r?\n/).length) + ': class="' + m[0].slice(7, 60) + '..." inner="' + inner + '"');
  }
}
check('icon 容器 emoji 残留 = 0', bad.length === 0, bad.join(' | ') || '通过');

// ---------- 断言 5: div 平衡 ----------
var open = (html.match(/<div\b/g) || []).length;
var close = (html.match(/<\/div>/g) || []).length;
check('div 标签平衡', open === close, 'open=' + open + ' close=' + close);

// ---------- 断言 6: data-icon 引用均已注册 ----------
var iconJs = fs.readFileSync(path.join(ROOT, 'assets', 'icon-map.js'), 'utf8');
var registered = {};
var re = /"([a-z0-9-]+)":\s*svg\(/g;
while ((m = re.exec(iconJs)) !== null) registered[m[1]] = true;
var used = {};
var reUse = /data-icon="([a-z0-9-]+)"/g;
var missing = [];
while ((m = reUse.exec(html)) !== null) used[m[1]] = true;
Object.keys(used).forEach(function (k) { if (!registered[k]) missing.push(k); });
check('data-icon 引用 100% 已注册', missing.length === 0, missing.join(',') || Object.keys(used).join(','));

// ---------- 输出 ----------
var pass = results.every(function (r) { return r.ok; });
var out = [];
out.push('=== j_kou_blog_check · 20260913j kou-blog ===');
results.forEach(function (r) {
  out.push((r.ok ? '[PASS] ' : '[FAIL] ') + r.name + (r.detail ? '  -- ' + r.detail : ''));
});
out.push('VERDICT: ' + (pass ? 'ALL_PASS' : 'HAS_FAIL'));
var text = out.join('\n');
console.log(text);
fs.writeFileSync(__filename.replace(/\.js$/, '.log'), text + '\n', 'utf8');
process.exit(pass ? 0 : 1);
