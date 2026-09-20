/**
 * tools/qa/ed_t01_home_0912.js —— 批次五 T01（图标与交互）自测
 * 覆盖：
 *   #0.1 首页 5 张轮播卡 + 5 个圆点 + moreToolsCard 不存在 + 无 PPT素材库 字符串
 *   #0.2 blog_wechat / 个人中心 / 工具 / 更多 4 处 PPT素材库→PPT版式库
 *   #1.0/#1.1 工具/更多页 改 .morepage-list 纵向列表（morepage-grid 不再存在）
 *   #0.3 工具页 3 入口保留（AI模拟面试/四级经验分享/穿越英语）
 *   D4 PPT素材库.html 文件保留 + PPT版式库.html 存在
 *
 * 运行：node tools/qa/ed_t01_home_0912.js
 * 依赖 jsdom（从 tools/verifier/node_modules 解析）
 */
const path = require('path');
const fs = require('fs');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; FAILS.push(label + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }

function loadDom(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return new JSDOM(html).window.document;
}
function loadSrc(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

sec('[A] 首页精简 #0.1');
{
  const d = loadDom('学习工作台.html');
  const carousel = d.getElementById('homeCardsCarousel');
  const dots = d.getElementById('carouselDots');
  check('A1 homeCardsCarousel 存在', !!carousel);
  check('A1 轮播卡数 === 5', carousel && carousel.querySelectorAll('.home-carousel-card').length === 5,
    'actual=' + (carousel ? carousel.querySelectorAll('.home-carousel-card').length : 'N/A'));
  check('A1 圆点数 === 5', dots && dots.querySelectorAll('span').length === 5,
    'actual=' + (dots ? dots.querySelectorAll('span').length : 'N/A'));
  check('A1 moreToolsCard 不存在', !d.getElementById('moreToolsCard'));
  const home = loadSrc('学习工作台.html');
  check('A1 首页源码不含 PPT素材库', home.indexOf('PPT素材库') === -1);
  // 注意：renderToolTraces 脚本按 arch §4.1 #0.1 明文保留，其内 $id('moreToolsGrid') 死引用会留着——属预期
  check('A1 DOM 中 #moreToolsGrid 不存在（#moreToolsCard 已删）', !d.getElementById('moreToolsGrid'));
  check('A1 scrollToCard 索引 0..4 范围（dots=5）', dots && dots.querySelectorAll('span').length === 5);
}

sec('[B] PPT素材库→PPT版式库 全仓统一 #0.2');
{
  const bw = loadSrc('blog_wechat.html');
  check('B1 blog_wechat 含 PPT版式', bw.indexOf('PPT版式') !== -1);
  check('B1 blog_wechat 链接 → PPT版式库.html', /location\.href='PPT版式库\.html'/.test(bw));
  check('B1 blog_wechat 不含 PPT素材库', bw.indexOf('PPT素材库') === -1);

  const pf = loadSrc('个人中心.html');
  check('B2 个人中心 含 PPT版式', pf.indexOf('PPT版式') !== -1);
  check('B2 个人中心 链接 → PPT版式库.html', /location\.href='PPT版式库\.html'/.test(pf));
  check('B2 个人中心 不含 PPT素材库', pf.indexOf('PPT素材库') === -1);

  const tg = loadSrc('工具.html');
  check('B3 工具 含 PPT版式', tg.indexOf('PPT版式') !== -1);
  check('B3 工具 链接 → PPT版式库.html', /location\.href='PPT版式库\.html'/.test(tg));
  check('B3 工具 不含 PPT素材库', tg.indexOf('PPT素材库') === -1);

  const mg = loadSrc('更多.html');
  check('B4 更多 含 PPT版式', mg.indexOf('PPT版式') !== -1);
  check('B4 更多 链接 → PPT版式库.html', /location\.href='PPT版式库\.html'/.test(mg));
  check('B4 更多 不含 PPT素材库', mg.indexOf('PPT素材库') === -1);

  check('B5 PPT素材库.html 文件保留(D4 拍板)', fs.existsSync(path.join(ROOT, 'PPT素材库.html')));
  check('B5 PPT版式库.html 文件存在', fs.existsSync(path.join(ROOT, 'PPT版式库.html')));
}

sec('[C] 工具/更多 纵向列表 #1.0/#1.1');
{
  const dt = loadDom('工具.html');
  check('C1 工具页 morepage-list 存在', !!dt.querySelector('.morepage-list'));
  check('C1 工具页 不再有 morepage-grid', !dt.querySelector('.morepage-grid'));
  check('C1 工具页 列表项含 morepage-list-item',
    dt.querySelectorAll('.morepage-list .morepage-list-item').length >= 3,
    'items=' + dt.querySelectorAll('.morepage-list .morepage-list-item').length);

  const tg = loadSrc('工具.html');
  check('C1 工具页 保留 AI模拟面试 入口', /location\.href='AI模拟面试\.html'/.test(tg));
  check('C1 工具页 保留 四级经验分享 入口', /location\.href='四级经验分享\.html'/.test(tg));
  check('C1 工具页 保留 穿越英语 openQuest() 入口', tg.indexOf('openQuest') !== -1);

  const dm = loadDom('更多.html');
  check('C2 更多页 morepage-list 存在', !!dm.querySelector('.morepage-list'));
  check('C2 更多页 不再有 morepage-grid', !dm.querySelector('.morepage-grid'));
  check('C2 更多页 列表项含 morepage-list-item',
    dm.querySelectorAll('.morepage-list .morepage-list-item').length >= 3,
    'items=' + dm.querySelectorAll('.morepage-list .morepage-list-item').length);
}

sec('[D] common.css 追加 .morepage-list*');
{
  const css = loadSrc('assets/common.css');
  check('D1 .morepage-list 规则存在', /\.morepage-list\s*\{/.test(css));
  check('D1 .morepage-list .morepage-card 规则存在', /\.morepage-list\s+\.morepage-card\s*\{/.test(css));
  check('D1 .morepage-list-item::after 箭头规则存在', /\.morepage-list-item::after\s*\{/.test(css));
}

console.log('\n----- 结果 -----');
console.log('PASS=' + pass + '  FAIL=' + fail);
if (fail) { console.log('失败项：\n' + FAILS.join('\n')); process.exit(1); }
process.exit(0);
