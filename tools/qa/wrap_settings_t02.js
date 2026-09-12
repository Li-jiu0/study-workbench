/**
 * tools/qa/wrap_settings_t02.js —— 一次性脚本：把 设置.html 的 16 张顶层 card 包入 <section data-subpage="...">
 * 用法：node tools/qa/wrap_settings_t02.js
 * 不依赖第三方模块，纯 fs + 正则。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const target = path.join(ROOT, '设置.html');

// 顶层 card 的特征：以 8 空格缩进 + <div class="card...">（可能带 id/class/data-page-node-id）
// 不匹配 card-header / card-title / card-body / card-action 等子元素。
// 通过匹配 card 起始行 + 计数 div 深度，找到匹配的 </div>。
const CARD_OPEN_RE = /^(\s*)<div class="card(\s+privacy-card)?"(?:[^>]*)>(\s*)$/m;

// 卡片按出现顺序的 subpage 映射（基于 标题图标 + 标题文本 启发式）
// 出现顺序：appearance, appearance, content, content, appearance, appearance, about, about, ai, about, about, about, about, account, privacy, about
const SUBPAGE_FOR_CARD_INDEX = [
  'appearance', // L133 🎨 外观
  'appearance', // L166 📐 阅读与界面
  'content',    // L221 ✍️ 发贴默认偏好
  'content',    // L259 🎯 学习目标与习惯
  'appearance', // L324 🔊 声音
  'appearance', // L364 🔔 通知
  'about',      // L402 💾 数据
  'about',      // L449 🆘 帮助/反馈 (feedbackCard)
  'ai',         // L517 aiServerCard
  'about',      // L557 📥 migrateCard
  'about',      // L574 📊 数据总览
  'about',      // L587 ⚡ 快捷入口
  'about',      // L607 🧹 清理
  'account',    // L641 🔐 accountCard
  'privacy',    // L670 🔒 privacyCard
  'about'       // L754 ℹ️ 关于
];

function wrapCards(html) {
  const lines = html.split('\n');
  const out = [];
  let i = 0;
  let cardIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    // 匹配顶层 card 起始（缩进 ≤ 12 空格的 "<div class=\"card...\">"）
    const m = line.match(/^(\s*)<div class="card(?:\s+privacy-card)?"(?:[^>]*)>(\s*)$/);
    if (m && m[1].length <= 12) {
      const indent = m[1];
      const subpage = SUBPAGE_FOR_CARD_INDEX[cardIdx] || 'about';
      // 找到这张 card 的匹配 </div>
      // 从起始行后开始计数：每遇 <div （不计自闭合） depth+1；遇 </div> depth-1；depth=0 时即匹配。
      let depth = 1;
      let j = i + 1;
      while (j < lines.length && depth > 0) {
        const ln = lines[j];
        // 简化：数 <div 与 </div> 出现次数（不解析属性，但 card 内部全是纯 div 结构，无嵌套 <div .../>）
        const opens = (ln.match(/<div\b/g) || []).length;
        const closes = (ln.match(/<\/div>/g) || []).length;
        depth += opens - closes;
        if (depth === 0) break;
        j++;
      }
      if (depth !== 0) {
        throw new Error('无法为 card #' + (cardIdx + 1) + ' (line ' + (i + 1) + ') 找到匹配的 </div>');
      }
      // 输出：从 i 到 j 的所有行，外面包 <section data-subpage="...">
      out.push(indent + '<section data-subpage="' + subpage + '">');
      for (let k = i; k <= j; k++) out.push(lines[k]);
      out.push(indent + '</section>');
      cardIdx++;
      i = j + 1;
      continue;
    }
    out.push(line);
    i++;
  }
  if (cardIdx !== SUBPAGE_FOR_CARD_INDEX.length) {
    console.warn('警告：实际包裹 ' + cardIdx + ' 张 card，预期 ' + SUBPAGE_FOR_CARD_INDEX.length);
  }
  return out.join('\n');
}

const original = fs.readFileSync(target, 'utf8');
const wrapped = wrapCards(original);
fs.writeFileSync(target, wrapped, 'utf8');
console.log('OK: 设置.html 已包裹 ' + (SUBPAGE_FOR_CARD_INDEX.length) + ' 张 card');

// 统计
const ds = (wrapped.match(/<section data-subpage="/g) || []).length;
const stats = {};
const re = /<section data-subpage="([^"]+)"/g;
let mm;
while ((mm = re.exec(wrapped)) !== null) stats[mm[1]] = (stats[mm[1]] || 0) + 1;
console.log('section 分布:', JSON.stringify(stats));

// div 配平
const opens = (wrapped.match(/<div\b/g) || []).length;
const closes = (wrapped.match(/<\/div>/g) || []).length;
const secs = (wrapped.match(/<section\b/g) || []).length;
const sclose = (wrapped.match(/<\/section>/g) || []).length;
console.log('div:', opens, '/', closes, ' section:', secs, '/', sclose);