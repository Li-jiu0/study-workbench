/* E1 图标全站升级专项 —— 确定性批量迁移脚本（一次性工具，跑完即归档）
 * 范围：仅根目录 16 个页面（排除其他成员正在改的 7 个文件），仅 4 类容器：
 *   .bn-icon / .bm-icon / .mpc-icon（div）与 .title-icon（span）
 * 行为：
 *   1. 容器内 emoji（按映射表）→ <span class="nav-icon" data-icon="X" data-icon-size="20"></span>
 *      映射表没有的 emoji 原样保留（禁止硬造）
 *   2. 真实 link/script 属性内 ?v=20260913g → ?v=20260913h（属性级匹配，注释不受影响）
 *   3. 详细日志：每文件替换清单 / 跳过清单 / bump 状态
 * 运行：node tools/e1_icon_upgrade.js（默认 dry-run=false）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry');

// 其他成员正在修改的文件：绝对不碰
const FORBIDDEN = new Set([
  '学习博客.html', '设置.html', '个人中心.html', '四级备考.html',
  '央国企笔试.html', '高情商表达.html', '工具.html',
]);

// 本批处理页面（根目录 grep 摸清单结果，含 4 类容器 emoji 的全部候选页）
const PAGES = [
  'blog_wechat.html',
  'PPT案例拆解.html',
  'PPT版式库.html',
  'PPT训练.html',
  '万能金句库.html',
  '动态.html',
  '商务礼仪.html',
  '商务礼仪面试.html',
  '四级词汇.html',
  '场景话术库.html',
  '学习工作台.html',
  '更多.html',
  '私聊.html',
  '面试题库.html',
  '错题本.html',
  '行测刷题.html',
];

// emoji → icon-map.js 注册表映射（均已人工核对 assets/icon-map.js，无硬造）
// 匹配前会去掉 U+FE0F 变体选择符
const ICON_MAP = {
  '🏠': 'home',
  '💬': 'message-circle',
  '👤': 'user',
  '🧰': 'wrench',
  '☰': 'menu',
  '📊': 'chart-bar',
  '📒': 'book',
  '📚': 'book',
  '⚙': 'settings',      // ⚙️ (2699 FE0F)
  'ℹ': 'info',          // ℹ️ (2139 FE0F)
  '🎙': 'mic',          // 🎙️ (1F399 FE0F)
  '📖': 'book-open',
  '🔍': 'search',
  '🔎': 'search',
  '📝': 'pen',
  '✏': 'pen',           // ✏️ (270F FE0F)
  '👥': 'users',
  '🌏': 'globe',
  '✅': 'check',
  '🔥': 'fire',
  '⏱': 'clock',         // ⏱️ (23F1 FE0F)
  '🕒': 'clock',
  '📋': 'clipboard',
  '🔒': 'locked',
  '⭐': 'star',
  '🏆': 'trophy',
  '🎧': 'headphones',
  '🗑': 'delete',        // 🗑️ (1F5D1 FE0F)
};

function normalize(s) {
  return s.replace(/\uFE0F/g, '').trim();
}

function iconSpan(name) {
  return '<span class="nav-icon" data-icon="' + name + '" data-icon-size="20"></span>';
}

// 容器模式：div(bn-icon|bm-icon|mpc-icon) 与 span(title-icon)，内容为纯文本 emoji
const RE_DIV = /<div class="(bn-icon|bm-icon|mpc-icon)"([^>]*)>([^<>]+)<\/div>/g;
const RE_SPAN = /<span class="(title-icon)"([^>]*)>([^<>]+)<\/span>/g;

function replaceIcons(html, log) {
  const cbDiv = (m, cls, attrs, inner) => {
    const norm = normalize(inner);
    const icon = ICON_MAP[norm];
    if (!icon) {
      log.skipped.push({ cls, emoji: inner });
      return m; // 无合适图标 → 保持 emoji 不动
    }
    log.replaced.push({ cls, emoji: inner, icon });
    return '<div class="' + cls + '"' + attrs + '>' + iconSpan(icon) + '</div>';
  };
  const cbSpan = (m, cls, attrs, inner) => {
    const norm = normalize(inner);
    const icon = ICON_MAP[norm];
    if (!icon) {
      log.skipped.push({ cls, emoji: inner });
      return m;
    }
    log.replaced.push({ cls, emoji: inner, icon });
    return '<span class="' + cls + '"' + attrs + '>' + iconSpan(icon) + '</span>';
  };
  // 注意：两次 replace 必须链式作用（第二次作用于第一次的结果）
  let out = html.replace(RE_DIV, cbDiv);
  out = out.replace(RE_SPAN, cbSpan);
  return out;
}

// 仅 bump 真实标签属性内的版本号（href="...v=g" / src="...v=g"），注释与正文不受影响
function bumpVersion(html, log) {
  const before = (html.match(/\?v=20260913g/g) || []).length;
  if (before === 0) {
    log.bump = 'no-g-found';
    return html;
  }
  const out = html.replace(/((?:href|src)="[^"]*)\?v=20260913g(")/g, '$1?v=20260913h$2');
  const after = (out.match(/\?v=20260913g/g) || []).length;
  log.bump = before + '→bumped, residual-g=' + after;
  return out;
}

let totalReplaced = 0;
let totalSkipped = 0;
const skippedAll = [];
const outLines = [];
const origLog = console.log.bind(console);
console.log = function (...a) { const s = a.join(' '); outLines.push(s); origLog(s); };

for (const file of PAGES) {
  if (FORBIDDEN.has(file)) throw new Error('禁止触碰: ' + file);
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { console.log('[MISS] ' + file); continue; }
  const log = { file, replaced: [], skipped: [], bump: '' };
  let html = fs.readFileSync(p, 'utf8');
  html = replaceIcons(html, log);
  html = bumpVersion(html, log);
  totalReplaced += log.replaced.length;
  totalSkipped += log.skipped.length;
  log.skipped.forEach((s) => skippedAll.push(file + ':' + s.cls + ':' + s.emoji));

  console.log('\n=== ' + file + ' ===');
  console.log('  替换 ' + log.replaced.length + ' 处: ' +
    log.replaced.map((r) => r.cls + '[' + r.emoji + '→' + r.icon + ']').join(', '));
  if (log.skipped.length) {
    console.log('  跳过 ' + log.skipped.length + ' 处(无合适图标): ' +
      log.skipped.map((s) => s.cls + '[' + s.emoji + ']').join(', '));
  }
  console.log('  bump: ' + log.bump);

  if (!DRY_RUN && log.replaced.length > 0) {
    fs.writeFileSync(p, html, 'utf8');
    console.log('  ✓ 已写入');
  }
}

console.log('\n========== 汇总: 替换 ' + totalReplaced + ' 处 / 跳过 ' + totalSkipped + ' 处 ==========');
if (skippedAll.length) {
  console.log('跳过清单:\n  ' + skippedAll.join('\n  '));
}

// 终端 stdout 在本环境可能被吞，同步落一份 UTF-8 日志便于复核
fs.writeFileSync(path.join(__dirname, 'e1_run_log.txt'), outLines.join('\n'), 'utf8');
