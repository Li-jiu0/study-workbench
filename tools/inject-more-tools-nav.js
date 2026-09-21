/**
 * tools/inject-more-tools-nav.js —— 把各 live 页底部「🧰 工具 / ☰ 更多」改为跳独立页（幂等）
 *
 * 背景（A8）：底部「更多/工具」原为弹层（toggleMorePanel/toggleToolsPanel）。
 * 现改为独立页 更多.html / 工具.html：
 *   - 「工具」→ onclick="location.href='工具.html'"
 *   - 「更多」→ onclick="location.href='更多.html'"
 * 只改 <nav class="bottom-nav"> 块内的这两个 bottom-nav-item 的 onclick，
 * 不碰其它任何 DOM；旧弹层 DOM 与函数全部保留（可回退）。
 *
 * 用法：node tools/inject-more-tools-nav.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 不处理：历史副本 / 备份 / 非 live 页
const SKIP_FILES = new Set([
  '登录.html',
  '设置_旧版.html',
  'blog_wechat.html',
  '更多.html',   // 新页自身已正确
  '工具.html',   // 新页自身已正确
]);
// 不处理的历史副本命名（settings*.html / profile*.html）
const SKIP_RE = /^(settings.*\.html|profile.*\.html)$/i;

const NAV_RE = /<nav class="bottom-nav"[^>]*>[\s\S]*?<\/nav>/;

function patchNavBlock(navBlock) {
  let out = navBlock;
  // 幂等：已是 location.href 的就不再改。
  // 只改导航块内这两个 onclick（块内不会有 .more-overlay，故不会误伤遮罩）。
  out = out.replace(
    /onclick="toggleToolsPanel\(\)"/g,
    "onclick=\"location.href='工具.html'\""
  );
  out = out.replace(
    /onclick="toggleMorePanel\(\)"/g,
    "onclick=\"location.href='更多.html'\""
  );
  return out;
}

let total = 0, changed = 0, skipped = 0;
const reports = [];

for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  total++;
  if (SKIP_FILES.has(f) || SKIP_RE.test(f)) { skipped++; continue; }

  const p = path.join(ROOT, f);
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(NAV_RE);
  if (!m) { skipped++; continue; }

  const patched = patchNavBlock(m[0]);
  if (patched === m[0]) { skipped++; continue; }

  const out = html.replace(NAV_RE, patched);
  if (out === html) { skipped++; continue; }

  fs.writeFileSync(p, out);
  changed++;
  reports.push('  ✓ ' + f);
}

console.log('底部导航改独立页：共 ' + total + ' 个 HTML，更新 ' + changed + ' 个，跳过 ' + skipped + ' 个。');
if (reports.length) console.log(reports.join('\n'));
