#!/usr/bin/env node
/**
 * split.js —— 把单文件 学习工作台.html 拆分为「主页面 + 各模块独立网页」
 *
 * 产物：
 *   学习工作台.html   主页面（首页 hub）
 *   四级备考.html / 央国企笔试.html / 高情商表达.html / 商务礼仪面试.html / PPT训练.html
 *   学习博客.html / 行测刷题.html / 错题本.html / 四级词汇.html / 商务礼仪.html
 *   面试题库.html / PPT版式库.html / PPT案例拆解.html / 场景话术库.html / 万能金句库.html / 设置.html
 *   assets/common.css  共享样式（全部模块样式，保证任意页渲染一致）
 *   assets/app.js      共享脚本（全部逻辑 + 多页面跳转改造 + init 按页守卫）
 *
 * 运行：node tools/split.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 源文件用「备份的单文件版」：拆分完成后 学习工作台.html 已是多页面版
const SRC_FILE = path.join(ROOT, '备份', '学习工作台-单文件版-20260908.html');
assert(fs.existsSync(SRC_FILE), '找不到源文件（备份/学习工作台-单文件版-20260908.html）');

const src = fs.readFileSync(SRC_FILE, 'utf8').replace(/\r\n/g, '\n'); // 统一 LF 行尾，便于字符串补丁

function assert(cond, msg) { if (!cond) { console.error('❌ ' + msg); process.exit(1); } }

// 找到从 start（指向 "<div"）开始的 div 闭合位置（返回其后一位下标）
function findDivEnd(text, start) {
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(text))) {
    if (m[0][1] === '/') { depth--; if (depth === 0) return re.lastIndex; }
    else depth++;
  }
  return -1;
}

/* ================= 提取三大块 ================= */
const cssM = src.match(/<style>([\s\S]*?)<\/style>/);
assert(cssM, '找不到 <style>');
const css = cssM[1];

const jsM = src.match(/<script>([\s\S]*?)<\/script>/);
assert(jsM, '找不到 <script>');
let js = jsM[1];

const bodyOpen = src.indexOf('<body');
const bodyClose = src.indexOf('</body>');
const bodyInner = src.slice(src.indexOf('>', bodyOpen) + 1, bodyClose);

const appStart = bodyInner.indexOf('<div class="app">');
assert(appStart !== -1, '找不到 .app');
const appEnd = findDivEnd(bodyInner, appStart);
assert(appEnd > 0, '.app 不配平');
const app = bodyInner.slice(appStart, appEnd);
const scriptIdx = bodyInner.indexOf('<script');
assert(bodyInner.slice(appEnd, scriptIdx).trim() === '', '.app 之后到 <script> 之间有非空白内容，请人工检查');

/* sidebar */
const sbStart = app.indexOf('<nav class="sidebar">');
const sbEnd = app.indexOf('</nav>', sbStart) + '</nav>'.length;
const sidebar = app.slice(sbStart, sbEnd);
assert(sidebar.includes('nav-section'), 'sidebar 提取异常');

/* main 及其内部 */
const mainStart = app.indexOf('<div class="main">');
const mainEnd = findDivEnd(app, mainStart);
assert(mainEnd > 0, '.main 不配平');
const mainInner = app.slice(app.indexOf('>', mainStart) + 1, mainEnd - '</div>'.length);

const tbStart = mainInner.indexOf('<header class="topbar">');
const tbEnd = mainInner.indexOf('</header>', tbStart) + '</header>'.length;
const topbar = mainInner.slice(tbStart, tbEnd);
assert(topbar.includes('topbarTitle'), 'topbar 提取异常');

/* .main 内 .content 之后的外壳（bottom-nav、更多面板、弹窗、AI助手等）
   注意：去掉结尾 .app 自己的闭合 </div>，由组装模板统一补上 */
const rest = app.slice(mainEnd, app.lastIndexOf('</div>'));
assert(rest.includes('bottom-nav') && rest.includes('ai-fab'), 'rest 外壳提取异常');

/* 所有 page div（含 .content 内与 .main 直接子级） */
const pages = {};
const pageRe = /<div\s+class="page[^"]*"\s+id="page-([a-z-]+)"/g;
let m;
while ((m = pageRe.exec(mainInner))) {
  const id = m[1];
  assert(!pages[id], '重复页面 id: ' + id);
  const end = findDivEnd(mainInner, m.index);
  assert(end > 0, 'page div 不配平: ' + id);
  // 统一去掉 active，由组装阶段决定哪页激活
  pages[id] = mainInner.slice(m.index, end)
    .replace(/<div\s+class="page[^"]*"\s+id="page-/, '<div class="page" id="page-');
}
console.log('提取到页面：', Object.keys(pages).join(', '));

/* 页面标题（直接从源码 pageTitles 解析，避免双份维护） */
const ptMatch = js.match(/const pageTitles = \{([\s\S]*?)\};/);
assert(ptMatch, '找不到 pageTitles');
const pageTitles = new Function('return {' + ptMatch[1] + '}')();

/* ================= 页面分组（文件 → 包含的 page） ================= */
const GROUPS = [
  { file: '学习工作台.html', content: ['home'] },
  { file: '四级备考.html', content: ['cet', 'speaking-demo'] },
  { file: '央国企笔试.html', content: ['exam', 'exam-demo'] },
  { file: '高情商表达.html', content: ['comm', 'roleplay-demo'] },
  { file: '商务礼仪面试.html', content: ['interview', 'interview-demo'] },
  { file: 'PPT训练.html', content: ['ppt'] },
  { file: '学习博客.html', pages: ['blog'] },
  { file: '行测刷题.html', pages: ['exam-center'] },
  { file: '错题本.html', pages: ['wrong-book'] },
  { file: '四级词汇.html', pages: ['cet-vocab'] },
  { file: '商务礼仪.html', pages: ['etiquette'] },
  { file: '面试题库.html', pages: ['iv-questions'] },
  { file: 'PPT版式库.html', pages: ['ppt-layouts'] },
  { file: 'PPT案例拆解.html', pages: ['ppt-cases'] },
  { file: '场景话术库.html', pages: ['comm-scenes'] },
  { file: '万能金句库.html', pages: ['comm-quotes'] },
  { file: '设置.html', pages: ['settings'] },
];
// 校验：每个提取到的 page 恰好分到一个文件
const used = {};
GROUPS.forEach(g => (g.content || g.pages).forEach(p => {
  assert(pages[p], '分组引用了不存在的页面: ' + p);
  assert(!used[p], '页面被重复分组: ' + p);
  used[p] = true;
}));
Object.keys(pages).forEach(p => assert(used[p], '页面未被分组: ' + p));

/* 模块主题色映射（与 navigateTo 内 themeMap 一致） */
const THEMES = { cet: 'theme-cet', exam: 'theme-exam', comm: 'theme-comm', interview: 'theme-interview', ppt: 'theme-ppt' };

/* ================= JS 多页面改造补丁 ================= */
function patchOnce(j, oldStr, newStr, name) {
  const i = j.indexOf(oldStr);
  assert(i !== -1, 'JS 补丁找不到目标: ' + name);
  assert(j.indexOf(oldStr, i + 1) === -1, 'JS 补丁目标不唯一: ' + name);
  return j.slice(0, i) + newStr + j.slice(i + oldStr.length);
}

// 1) 在 navigateTo 前插入 PAGE_FILES（page id → 模块网页文件名）
const PAGE_FILES_DEF = `// ========== 多页面版：各模块独立网页的文件映射 ==========
// 本页没有某模块的 DOM 时，navigateTo() 会据此跳转到对应模块网页
const PAGE_FILES = {
  home: '学习工作台.html',
  cet: '四级备考.html', 'speaking-demo': '四级备考.html',
  exam: '央国企笔试.html', 'exam-demo': '央国企笔试.html',
  comm: '高情商表达.html', 'roleplay-demo': '高情商表达.html',
  interview: '商务礼仪面试.html', 'interview-demo': '商务礼仪面试.html',
  ppt: 'PPT训练.html',
  blog: '学习博客.html',
  'exam-center': '行测刷题.html',
  'wrong-book': '错题本.html',
  'cet-vocab': '四级词汇.html',
  etiquette: '商务礼仪.html',
  'iv-questions': '面试题库.html',
  'ppt-layouts': 'PPT版式库.html',
  'ppt-cases': 'PPT案例拆解.html',
  'comm-scenes': '场景话术库.html',
  'comm-quotes': '万能金句库.html',
  settings: '设置.html'
};

`;
js = patchOnce(js, 'function navigateTo(page) {\n  // 隐藏所有页面',
  PAGE_FILES_DEF +
  'function navigateTo(page) {\n' +
  '  // 【多页面版】本页没有该模块时，直接跳转到对应模块网页\n' +
  '  if (!document.getElementById(\'page-\' + page)) {\n' +
  '    const __f = PAGE_FILES[page];\n' +
  '    if (__f) { location.href = __f; return false; }\n' +
  '    console.warn(\'未知页面：\' + page);\n' +
  '    return false;\n' +
  '  }\n' +
  '  // 隐藏所有页面', 'navigateTo 跳转头');

// 2) .content 滚动复位加守卫（模块独立页可能没有 .content）
js = patchOnce(js,
  '  // 滚动到顶部\n  document.querySelector(\'.content\').scrollTop = 0;',
  '  // 滚动到顶部\n  const __ct = document.querySelector(\'.content\'); if (__ct) __ct.scrollTop = 0;',
  'scrollTop 守卫');

// 3) navigateTo 成功返回 true（供 openBlog* 判断是否留在本页）
js = patchOnce(js,
  '  // 关闭更多面板\n  closeMorePanel();\n}',
  '  // 关闭更多面板\n  closeMorePanel();\n  return true;\n}',
  'navigateTo 返回值');

// 4) openBlog*：跨页时带 #hash 跳转，博客页加载后按 hash 定位子视图
js = patchOnce(js,
  "function openBlogStats() { navigateTo('blog'); closeMorePanel(); showBlogView('stats'); }\n" +
  "function openBlogFavorites() { navigateTo('blog'); closeMorePanel(); blogMineType = 'favorite'; showBlogView('mine'); }\n" +
  "function openBlogProfile() { navigateTo('blog'); closeMorePanel(); showBlogView('stats'); }",
  "function openBlogStats() {\n" +
  "  if (document.getElementById('page-blog')) { closeMorePanel(); showBlogView('stats'); }\n" +
  "  else location.href = '学习博客.html#stats';   // 跨页：带 hash 定位到统计视图\n" +
  "}\n" +
  "function openBlogFavorites() {\n" +
  "  if (document.getElementById('page-blog')) { closeMorePanel(); blogMineType = 'favorite'; showBlogView('mine'); }\n" +
  "  else location.href = '学习博客.html#favorite'; // 跨页：定位到我的收藏\n" +
  "}\n" +
  "function openBlogProfile() {\n" +
  "  if (document.getElementById('page-blog')) { closeMorePanel(); showBlogView('stats'); }\n" +
  "  else location.href = '学习博客.html#stats';\n" +
  "}",
  'openBlog* 跨页视图');

// 5) 初始化段：按 DOM 存在性守卫（各模块网页只初始化自己有的模块）
js = patchOnce(js,
  '// ========== 初始化 ==========\n' +
  'applyTheme();          // 应用上次保存的主题（深色/浅色）\n' +
  'loadData();\n' +
  'renderHome();\n' +
  'updateDate();\n' +
  'initVocabOrder();\n' +
  'vocabModeList = getNewVocabs();\n' +
  'examModeList = getNewQuestions();\n' +
  'examFilteredBank = examModeList;\n' +
  'renderExamQuestion();\n' +
  'renderVocab();\n' +
  'renderWrongBook();\n' +
  'updateModuleStats();\n' +
  'renderEtiquette();\n' +
  'renderIvQuestions();\n' +
  'renderLayouts();\n' +
  'renderPptCases();\n' +
  'renderCommScenes();\n' +
  'renderQuotes();',
  '// ========== 初始化（多页面版：各网页只初始化自己拥有的模块 DOM）==========\n' +
  'applyTheme();          // 应用上次保存的主题（深色/浅色）——全页面通用\n' +
  'loadData();            // 读取本地数据——全页面通用\n' +
  'updateDate();          // 顶栏日期在外壳里——全页面通用\n' +
  'function __tryInit(name, fn) { try { fn(); } catch (e) { /* 本页无该模块 DOM，正常跳过 */ } }\n' +
  '__tryInit(\'renderHome\', renderHome);\n' +
  '__tryInit(\'initVocabOrder\', initVocabOrder);\n' +
  '__tryInit(\'vocabInit\', () => { vocabModeList = getNewVocabs(); });\n' +
  '__tryInit(\'examInit\', () => { examModeList = getNewQuestions(); examFilteredBank = examModeList; });\n' +
  '__tryInit(\'renderExamQuestion\', renderExamQuestion);\n' +
  '__tryInit(\'renderVocab\', renderVocab);\n' +
  '__tryInit(\'renderWrongBook\', renderWrongBook);\n' +
  '__tryInit(\'updateModuleStats\', updateModuleStats);\n' +
  '__tryInit(\'renderEtiquette\', renderEtiquette);\n' +
  '__tryInit(\'renderIvQuestions\', renderIvQuestions);\n' +
  '__tryInit(\'renderLayouts\', renderLayouts);\n' +
  '__tryInit(\'renderPptCases\', renderPptCases);\n' +
  '__tryInit(\'renderCommScenes\', renderCommScenes);\n' +
  '__tryInit(\'renderQuotes\', renderQuotes);',
  '初始化守卫');

// 6) 默认倒计时块里的 renderCountdowns() 加守卫
js = patchOnce(js,
  '  saveData();\n  renderCountdowns();\n}',
  '  saveData();\n  if (document.getElementById(\'countdownRow\')) renderCountdowns();\n}',
  '默认倒计时守卫');

// 7) 博客初始化：仅博客页执行，并补首次进入的列表渲染；支持 #hash 直达子视图
js = patchOnce(js,
  '// 初始化：加载分类下拉、输入框联动、标签页计数、个人中心资料\n' +
  'loadBlogEditor();\n' +
  'updateProfileUI();',
  '// 初始化：加载分类下拉、输入框联动、标签页计数、个人中心资料（多页面版：仅博客页执行）\n' +
  'if (document.getElementById(\'page-blog\')) {\n' +
  '  loadBlogEditor();\n' +
  '  renderBlogList();\n' +
  '  renderBlogMine();\n' +
  '  // 支持从其他页面带 #hash 跳转直达子视图（如 学习博客.html#stats）\n' +
  '  const __h = location.hash.replace(\'#\', \'\');\n' +
  '  if (__h === \'favorite\') { blogMineType = \'favorite\'; showBlogView(\'mine\'); }\n' +
  '  else if ([\'list\', \'mine\', \'edit\', \'stats\'].includes(__h)) showBlogView(__h);\n' +
  '}\n' +
  'updateProfileUI();',
  '博客初始化');

/* ================= 组装输出 ================= */
fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'assets', 'common.css'), css.trimEnd() + '\n');
fs.writeFileSync(path.join(ROOT, 'assets', 'app.js'), js.trimEnd() + '\n');
console.log('✓ assets/common.css + assets/app.js 已生成');

function makeSidebar(active) {
  let s = sidebar.replace('class="nav-item active" data-page="home"', 'class="nav-item" data-page="home"');
  if (active && active !== 'home') {
    const re = new RegExp('class="nav-item" data-page="' + active + '"');
    assert(re.test(s), 'nav-item 不存在: ' + active);
    s = s.replace(re, 'class="nav-item active" data-page="' + active + '"');
  } else {
    s = s.replace('class="nav-item" data-page="home"', 'class="nav-item active" data-page="home"');
  }
  return s;
}
function makeTopbar(title) {
  return topbar.replace(/(id="topbarTitle">)[^<]*(<)/, '$1' + title + '$2');
}
function makeRest(active) {
  let r = rest.replace('class="bottom-nav-item active" data-page="home"', 'class="bottom-nav-item" data-page="home"');
  if (active && ['home', 'cet', 'exam', 'comm'].includes(active)) {
    r = r.replace(new RegExp('class="bottom-nav-item" data-page="' + active + '"'),
      'class="bottom-nav-item active" data-page="' + active + '"');
  }
  return r;
}
function activePageHtml(p) {
  return pages[p].replace('<div class="page" id="page-' + p + '"', '<div class="page active" id="page-' + p + '"');
}

GROUPS.forEach(g => {
  const primary = (g.content || g.pages)[0];
  const title = pageTitles[primary] || '学习工作台';
  const theme = THEMES[primary] || 'theme-home';

  let mainPart;
  if (g.content) {
    const inner = g.content.map((p, i) => i === 0 ? activePageHtml(p) : pages[p]).join('\n\n');
    mainPart = '  <div class="main">\n' + makeTopbar(title) + '\n    <div class="content">\n' + inner + '\n    </div>\n  </div>';
  } else {
    mainPart = '  <div class="main">\n' + makeTopbar(title) + '\n' + activePageHtml(g.pages[0]) + '\n  </div>';
  }

  const head = src.slice(0, src.indexOf('</head>') + 7)
    .replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="assets/common.css">')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + title + ' · 学习工作台</title>');

  const html = head + '\n<body class="' + theme + '">\n\n<div class="app">\n'
    + makeSidebar(primary) + '\n\n' + mainPart + '\n\n' + makeRest(primary)
    + '\n\n</div>\n\n<script src="assets/app.js"></script>\n</body>\n</html>\n';

  fs.writeFileSync(path.join(ROOT, g.file), html);
  console.log('✓ ' + g.file + '（' + (g.content || g.pages).join(' + ') + '）');
});

console.log('\n全部完成：1 个主页面 + ' + (GROUPS.length - 1) + ' 个模块网页 + assets/ 共享资源');
