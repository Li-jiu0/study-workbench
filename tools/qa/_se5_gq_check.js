/* SE-5：高情商表达.html「i人心法 · 沟通专区」新增两卡自测
   校验：卡片数量、结构与风格一致、图标存在于 window.LUCIDE_ICONS、与 mini-comm.js 内容同源 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, '高情商表达.html');
const out = [];
function log(s) { out.push(String(s)); }
function assert(ok, name) { log((ok ? '[PASS] ' : '[FAIL] ') + name); }

const html = fs.readFileSync(HTML, 'utf8');

// ---- 1. 图标字典：确认新卡用到的两个图标名真实存在 ----
const iconSandbox = { window: {}, console };
vm.createContext(iconSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'icon-map.js'), 'utf8'), iconSandbox, { filename: 'icon-map.js' });
const ICONS = iconSandbox.window.LUCIDE_ICONS || {};
assert(Object.keys(ICONS).length > 50, 'LUCIDE_ICONS 已加载，共 ' + Object.keys(ICONS).length + ' 个');
assert(typeof ICONS['clipboard'] === 'string' && ICONS['clipboard'].indexOf('<svg') === 0, '图标 clipboard 存在于字典');
assert(typeof ICONS['file-text'] === 'string' && ICONS['file-text'].indexOf('<svg') === 0, '图标 file-text 存在于字典');

// ---- 2. 结构化校验（jsdom 可用则用 DOM，否则退回正则） ----
let cards = [];
let jsdomOk = false;
let dom = null;
const JSDOM_CANDIDATES = [
  'jsdom',
  path.join(ROOT, 'tools', 'verifier', 'node_modules', 'jsdom')
];
try {
  let JSDOM = null;
  for (const cand of JSDOM_CANDIDATES) {
    try { JSDOM = require(cand).JSDOM; if (JSDOM) break; } catch (e) { /* 试下一个候选路径 */ }
  }
  if (!JSDOM) throw new Error('jsdom 未安装');
  dom = new JSDOM(html, { runScripts: 'outside-only' });
  cards = Array.from(dom.window.document.querySelectorAll('.gq-mindset-card'));
  jsdomOk = true;
} catch (e) {
  jsdomOk = false;
  log('  · jsdom 不可用（' + e.message + '），改用正则校验');
}
log('  · 解析方式：' + (jsdomOk ? 'jsdom DOM' : '正则'));

if (jsdomOk) {
  assert(cards.length === 7, '心法卡片数 = 7（原5+新增2），实际=' + cards.length);
  const info = cards.map(c => {
    const ic = c.querySelector('.gq-mindset-ic .nav-icon');
    return {
      icon: ic ? ic.getAttribute('data-icon') : '',
      size: ic ? ic.getAttribute('data-icon-size') : '',
      title: (c.querySelector('.gq-mindset-t') || {}).textContent || '',
      body: ((c.querySelector('.gq-mindset-b') || {}).textContent || '').trim(),
      hasSvgFallback: !!c.querySelector('.gq-mindset-ic [data-icon]')
    };
  });

  // 风格一致性：每张卡必须有 ic(nav-icon 带 data-icon) + t + b 三段，且图标尺寸统一 17
  assert(info.every(i => i.icon && i.title && i.body), '7 张卡均为 图标+标题+正文 三段结构');
  assert(info.every(i => i.size === '17'), '7 张卡图标尺寸统一为 17');
  assert(info.every(i => typeof ICONS[i.icon] === 'string'), '7 张卡图标名全部命中 LUCIDE_ICONS：' + info.map(i => i.icon).join(','));

  // 结构完整性：class 命名与既有卡一致
  const rawOk = cards.every(c =>
    /^gq-mindset-card$/.test(c.className) &&
    /^gq-mindset-ic$/.test(c.querySelector('.gq-mindset-ic').className) &&
    /^gq-mindset-t$/.test(c.querySelector('.gq-mindset-t').className) &&
    /^gq-mindset-b$/.test(c.querySelector('.gq-mindset-b').className));
  assert(rawOk, '7 张卡 class 命名与既有 5 张完全一致（gq-mindset-card/ic/t/b）');

  // 新增两卡
  const prep = info.find(i => i.title.indexOf('提前准备') !== -1);
  const text = info.find(i => i.title.indexOf('文字辅助') !== -1);
  assert(!!prep, '存在「提前准备」卡');
  assert(!!text, '存在「文字辅助」卡');
  assert(prep && prep.body.indexOf('打扰你两分钟') !== -1, '提前准备卡含万能开场句模板');
  assert(text && text.body.indexOf('我整理一下') !== -1, '文字辅助卡含小结模板');
  assert(text && text.body.indexOf('别只用文字') !== -1, '文字辅助卡含"情绪冲突不宜只用文字"提示');
  assert(info.length === 7 && info[5].title.indexOf('提前准备') !== -1 && info[6].title.indexOf('文字辅助') !== -1,
    '两张新卡插在「电量管家小技巧」之后（第6、7位）');
  log('  · 卡片顺序：' + info.map(i => i.title).join(' / '));

  // 副标题坐实
  const sub = dom.window.document.querySelector('.gq-mindset-sub');
  assert(!!sub && sub.textContent.indexOf('提前准备') !== -1 && sub.textContent.indexOf('文字辅助') !== -1,
    '副标题已坐实提及两个工具名');

  // 只改了心法区：确认该文件其它关键锚点仍在
  assert(!!dom.window.document.getElementById('gqIpartnerView'), 'gqIpartnerView 面板仍在');
  assert(!!dom.window.document.getElementById('gqCasesView'), 'gqCasesView 面板仍在');
  assert(!!dom.window.document.getElementById('aiFab'), 'AI 悬浮助手仍在');
} else {
  const m = html.match(/<div class="gq-mindset-card">/g) || [];
  assert(m.length === 7, '心法卡片数 = 7，实际=' + m.length);
  assert(html.indexOf('提前准备：开口前先写三行') !== -1, '含「提前准备」卡');
  assert(html.indexOf('文字辅助：说不出就先打字') !== -1, '含「文字辅助」卡');
  assert(html.indexOf('data-icon="clipboard"') !== -1, '提前准备卡使用 clipboard 图标');
  assert(html.indexOf('data-icon="file-text"') !== -1, '文字辅助卡使用 file-text 图标');
}

// ---- 3. 与 mini-comm.js 内容同源 ----
const bankSandbox = { window: {}, console };
vm.createContext(bankSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'mini-comm.js'), 'utf8'), bankSandbox, { filename: 'mini-comm.js' });
const introvert = bankSandbox.window.MINI_BANK['comm-introvert'];
assert(introvert.items.length === 7, 'mini-comm.js comm-introvert 同为 7 条（页面与数据同源）');
assert(introvert.items.some(i => i.title.indexOf('提前准备') !== -1), 'mini-comm.js 含提前准备');
assert(introvert.items.some(i => i.title.indexOf('文字辅助') !== -1), 'mini-comm.js 含文字辅助');

// ---- 4. 版本戳未被改动 ----
assert(html.indexOf('?v=20260913o') !== -1, '版本戳 ?v=20260913o 未被改动');

fs.writeFileSync(path.join(__dirname, '_se5_gq_check.txt'), out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
