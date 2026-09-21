/* 批次 20260913K · kou-k-appjs 静态断言（只读，不改任何文件） */
const fs = require('fs');
const app = fs.readFileSync('D:/下载的文件/学习工作台/assets/app.js', 'utf8');
const imap = fs.readFileSync('D:/下载的文件/学习工作台/assets/icon-map.js', 'utf8');
const lines = app.split('\n');
const out = [];
function a(name, ok) { out.push((ok ? 'PASS' : 'FAIL') + ' | ' + name); }
const has = (s) => app.includes(s);

// ① icon-map 注册
['sun','moon','bell','pin','trash','save','eraser','rotate-ccw','monitor','ban','download','calculator','calendar-days','award','notebook','file-text','plug','chevron-down','chevron-up','archive'].forEach(n => {
  a('icon registered: ' + n, imap.includes('"' + n + '": svg('));
});
['pencil','message-square','check','search','palette','fire','clock','target','lightbulb','chart-bar','bookmark','inbox','send','sparkles','mic','headphones','clipboard','user','globe','bot','brain','book'].forEach(n => {
  a('icon still registered: ' + n, imap.includes('"' + n + '": svg('));
});
a('icon-map no real mask/filter/symbol/use markup', !/(mask=|filter=|<symbol|<use)/.test(imap));

// ② renderCountdowns + 主题切换
const cdZone = lines.slice(1180, 1245).join('\n');
a('countdowns emoji cleared', !/✏️|🗑️|📌/.test(cdZone));
a('countdowns data-icon used', cdZone.includes("icSpan('pencil', 14)") && cdZone.includes("icSpan('trash', 14)") && cdZone.includes("icSpan('pin', 12)"));
a('countdowns autoRender added', /row\.innerHTML = html;\s*\n\s*if \(window\.lucideAutoRender\) window\.lucideAutoRender\(\);/.test(app));
a('applyTheme sun/moon data-icon', has("(isDarkMode ? 'sun' : 'moon')"));
a('toggleTheme toast emoji cleared', !has("'🌙 已切换到深色模式'") && !has("'☀️ 已切换到浅色模式'"));
a('studyLimit tip/toast emoji cleared', !has("小时上限 🌙") && !has("showToast('🌙 ' + tip)"));
a('studyLimit modal moon data-icon', has('data-icon="moon" data-icon-size="44"'));
a('stLimitTip emoji cleared', !has("'🌙 已超过今日上限"));

// ③ 本地贴评论
a('renderLocalComments exists', has('function renderLocalComments(n)'));
a('avatar fallback fullwidth ?', has("nm ? nm.slice(0, 1) : '？'"));
a('bc-reply nested class', has("' bc-reply' : ''"));
a('bc-fold-btn class', has('bc-fold-btn'));
a('fold >5 show 3', has('FOLD_THRESHOLD = 5') && has('FOLD_COUNT = 3'));
a('fold toggle fn exists', has('function toggleBlogCommentFold()'));
a('openBlogDetail resets fold state', has('bcExpandAll = false;'));
a('replyTo mark 回复 @', has('回复 @'));

// ④ 我的文章 列表菜单→页面
a('blogMineOpen global', has('let blogMineOpen = false'));
a('menu vertical column layout', has('flex-direction:column'));
a('menu item chevron-right', has('chevron-right'));
a('category page back button', /blogMineOpen=false;renderBlogMine\(\)/.test(app) && has('chevron-left'));
a('mine tabs chip emoji cleared', !has("'📤 已发布'") && !has("'💾 草稿'") && !has("'📁 归档'") && !has("'🔖 收藏'"));
a('favorite entries open list page', (app.match(/blogMineOpen = true;/g) || []).length >= 2);

// ⑤ 广场筛选自定义下拉
a('dropdown container blogCatDrop', has("drop.id = 'blogCatDrop'"));
a('dropdown moved into search row', has("querySelector('#blogViewList .blog-search-row')"));
a('dropdown lists all + 6 cats', has('BLOG_CATS.map(c => optHtml(c.id, c.name, c.dc))'));
a('pickBlogCat keeps filter logic', has('function pickBlogCat(id)') && has('blogTagFilter = \'\';'));
a('old chip row removed', !has("blogCatFilter='all';blogTagFilter='';renderBlogFilters()"));

// ⑥ 个人中心图标
const prof = lines.slice(5950, 6220).join('\n');
a('profile edit button icon', prof.includes("icSpan('pencil', 14)") && !has('✏️ 编辑资料'));
a('profile four stats icons', prof.includes("icSpan('fire', 18)") && prof.includes("icSpan('calculator', 18)") && prof.includes("icSpan('target', 18)") && prof.includes("icSpan('clock', 18)"));
a('week calendar icon', prof.includes("icSpan('calendar-days', 14)") && !has('📅 本周学习'));
a('today study title clock icon', prof.includes("icSpan('clock', 15)"));
a('lightbulb tip icon', prof.includes("icSpan('lightbulb', 14)") && !has('💡 打开任意页面'));
a('award title icon', prof.includes("icSpan('award', 15)") && !has('🏅 我的成就'));
a('six quick entries data-icon', !/📒|🎤|🎧/.test(prof) && prof.includes('data-icon="notebook"') && prof.includes('data-icon="headphones"') && prof.includes('data-icon="sparkles"') && prof.includes('data-icon="clipboard"') && prof.includes('data-icon="mic"') && prof.includes('data-icon="book-open"'));
a('badge b.icon kept (content data)', prof.includes('${b.icon}'));

// ⑦ AI 面板
a('ai panel title palette icon', has("icSpan('palette', 14)} AI助手外观") && !has('🎨 AI助手外观'));
a('ai data-val emoji preserved', (app.match(/data-val="🤖"/g) || []).length >= 1 && (app.match(/data-val="🧠"/g) || []).length >= 1 && (app.match(/data-val="💡"/g) || []).length >= 1 && (app.match(/data-val="📚"/g) || []).length >= 1);
a('ai avatar buttons display data-icon', prof.includes('data-icon="bot" data-icon-size="16"') || has('data-icon="bot" data-icon-size="16"'));
a('ai four buttons icons', has("icSpan('save', 14)} 保存配置") && has("icSpan('plug', 14)} 测试连接") && has("icSpan('trash', 14)} 清除配置") && has("icSpan('chart-bar', 14)} 用量统计"));
a('ai test toast emoji cleared', !has("'🔌 正在测试连接…'"));

// ⑧ ppStatsCard（K15 契约 id）
a('ppStatsCard id present', has('<div class="pp-card" id="ppStatsCard"'));
a('ppStatsCard id unique', (app.match(/id="ppStatsCard"/g) || []).length === 1);

// 附加清理项
a('mine card actions icons', has("icSpan('archive', 12) + ' 归档'") && has("icSpan('trash', 12)} 删除"));
a('note-interact icons', has("icSpan('file-text', 12)} 导出 Markdown") && has("icSpan('pencil', 12)} 编辑"));
a('blog stats buttons icons', has("icSpan('file-text', 14)} 导出全部 Markdown") && has("icSpan('user', 14)} 前往个人中心"));

// 重复 id 粗查
['ppStatsCard', 'blogCatDropPanel', 'blogCatDropWrap'].forEach(id => {
  const c = (app.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  a('static id unique: ' + id + ' x' + c, c <= 1);
});

const fails = out.filter(l => l.startsWith('FAIL'));
out.push('---');
out.push('TOTAL: ' + out.length + ' ASSERTS, FAIL: ' + fails.length);
out.push('IS_PASS: ' + (fails.length === 0 ? 'YES' : 'NO'));
console.log(out.join('\n'));
