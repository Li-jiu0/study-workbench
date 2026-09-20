#!/usr/bin/env node
/* =====================================================================
   tools/apply_icons_0912a.js —— 批次五 T04 收尾：lucide 图标铺到剩余正式页
   （寇豆码 / engineer，2026-09-12）
   ---------------------------------------------------------------------
   做什么：
     1) 把侧栏 `<span class="nav-icon">EMOJI</span>` 换成
        `<span class="nav-icon" data-icon="KEY"></span>`（保留 class 与所有
        其它属性，如 data-page-node-id —— 属性容错，不靠整串精确匹配）
     2) 在 `<script src="assets/app.js...">` 那一行之前注入
        `<script src="assets/icon-map.js?v=20260912a"></script>`

   客观筛选（幂等）：
     - 只处理：根目录正式 .html 且含 `<nav class="sidebar">`
     - 严格排除：备份/ 目录、settings*.html、profile*.html、_preview_*、_t*、
       设置_旧版.html
     - 已注入 icon-map.js 且侧栏已全部换成 data-icon 的页 → 跳过

   安全策略（吸取 2026-09-11「正则吞注释」事故教训）：
     - 不跨行通配替换；先看行、再定点替换
     - 只在 `<nav class="sidebar">…</nav>` 区间内动手
     - 改后校验：`<!--`/`-->`、`<div`/`</div>`、`<span`/`</span>`、`<script`/
       `</script` 配对必须与改前完全一致，否则不落盘

   用法：
     node tools/apply_icons_0912a.js            # 预演（只报告，不落盘）
     node tools/apply_icons_0912a.js --write    # 真正写入
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION = '20260912a';

/** 侧栏文案 → lucide 图标 key（11 项固定映射 + 2 项扩展） */
const LABEL_ICON = {
  '首页': 'home',
  '四级备考': 'book-open',
  '央国企笔试': 'pencil',
  '高情商表达': 'message-square',
  '商务礼仪面试': 'handshake',
  'PPT训练': 'palette',
  '广场': 'globe',
  '好友': 'users',
  '错题本': 'book',
  '个人中心': 'user',
  '设置': 'settings',
  // ---- 扩展项（非 11 项标准侧栏，见 blog_wechat.html / 动态.html）----
  '动态': 'rss',
  '互动广场': 'messages-square',
  '笔记广场': 'globe'
};

/** 排除规则：草稿 / 存档 / 备份，一律不动 */
const EXCLUDE_DIRS = new Set(['备份', 'android', 'node_modules', '.git', '.workbuddy',
  'docs', 'tools', 'server', 'ai-server', 'assets', '.tmp_eng']);
const EXCLUDE_FILE_RE = /^(settings|profile|_preview_|_t|_)/;
const EXCLUDE_FILE_SET = new Set(['设置_旧版.html']);

/** 匹配 `<span …class="nav-icon"…>` 开标签（class 位置任意，属性数量任意） */
const RE_NAV_OPEN = /<span\b([^>]*\bclass\s*=\s*"nav-icon"[^>]*)>/gi;
/** 已经写好的目标形态：`<span … data-icon="xxx"></span>` */
const RE_DATA_ICON = /\sdata-icon\s*=\s*"([^"]*)"/;
/** 真实资源行：<script … src="assets/xxx.js…"> */
const RE_APP_LINE = /<script\b[^>]*\bsrc\s*=\s*"assets\/app\.js/;

function countOf(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function detectEol(text) {
  const i = text.indexOf('\n');
  if (i < 0) return '\n';
  return text[i - 1] === '\r' ? '\r\n' : '\n';
}

/** 从 nav-icon 结束标签之后取出紧跟的 `<span …>文案</span>` 文案 */
function readLabel(region, from) {
  const rest = region.slice(from, from + 400);
  const m = rest.match(/^\s*<span\b[^>]*>\s*([^<]{1,30}?)\s*<\/span>/);
  if (m) return m[1].trim();
  const m2 = rest.match(/^\s*<span\b[^>]*>\s*([^<]{1,30})/);
  return m2 ? m2[1].trim() : '';
}

function processFile(file) {
  const abs = path.join(ROOT, file);
  const raw = fs.readFileSync(abs);
  const hasBom = raw.length >= 3 && raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  const text = raw.toString('utf8').replace(/^\uFEFF/, '');
  const eol = detectEol(text);

  const report = {
    file, replaced: 0, already: 0, skipped: 0, unmapped: [], injected: false,
    hadInject: /assets\/icon-map\.js/.test(text), changed: false, problems: []
  };

  // ---- 1) 侧栏区间 ----
  const navStart = text.search(/<nav class="sidebar"/);
  if (navStart < 0) return null; // 无侧栏 → 不处理
  let region = text;
  let offset = 0;
  const navEndRel = text.indexOf('</nav>', navStart);
  if (navEndRel >= 0) {
    region = text.slice(navStart, navEndRel + 6);
    offset = navStart;
  }

  // ---- 2) 逐个 nav-icon 替换 ----
  const edits = [];
  RE_NAV_OPEN.lastIndex = 0;
  let m;
  while ((m = RE_NAV_OPEN.exec(region)) !== null) {
    const openEnd = m.index + m[0].length;
    const closeIdx = region.indexOf('</span>', openEnd);
    if (closeIdx < 0) { report.problems.push('nav-icon 开标签找不到配对的 </span>'); break; }

    const attrs = m[1];
    const inner = region.slice(openEnd, closeIdx);
    const existing = attrs.match(RE_DATA_ICON);
    const label = readLabel(region, closeIdx + 7);
    const iconKey = LABEL_ICON[label];

    if (!iconKey) {
      // 字典/映射里没有的侧栏项：原样保留（绝不留下 data-icon 空引用）
      if (existing) {
        report.problems.push('已存在 data-icon="' + existing[1] + '" 但映射表里没有文案「' +
          (label || '(空)') + '」 → 请核对');
      }
      report.skipped++;
      continue;
    }

    // 幂等：已是正确的 data-icon 且内部为空 → 跳过
    if (existing && existing[1] === iconKey && inner.trim() === '') {
      report.already++;
      continue;
    }

    const cleanAttrs = attrs.replace(/\s*data-icon\s*=\s*"[^"]*"/g, '');
    const newOpen = '<span' + cleanAttrs + ' data-icon="' + iconKey + '">';
    edits.push({ start: offset + m.index, end: offset + closeIdx + 7, text: newOpen + '</span>' });
    report.replaced++;
    RE_NAV_OPEN.lastIndex = closeIdx + 7;
  }

  let newText = text;
  if (edits.length) {
    let cursor = 0;
    let out = '';
    for (const e of edits) {
      out += text.slice(cursor, e.start) + e.text;
      cursor = e.end;
    }
    out += text.slice(cursor);
    newText = out;
  }

  // ---- 3) 注入 icon-map.js（在 app.js 那一行之前，逐行过滤后插入）----
  if (!report.hadInject) {
    const lines = newText.split('\n');
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].replace(/^\s+/, '');
      if (s.indexOf('<script') === 0 && RE_APP_LINE.test(lines[i])) { idx = i; break; }
    }
    if (idx < 0) {
      report.problems.push('找不到 app.js 的 script 行，未注入 icon-map.js');
    } else {
      const ref = lines[idx];
      const lead = (ref.match(/^[ \t]*/) || [''])[0];
      const tail = ref.charAt(ref.length - 1) === '\r' ? '\r' : '';
      lines.splice(idx, 0, lead + '<script src="assets/icon-map.js?v=' + VERSION + '"></script>' + tail);
      newText = lines.join('\n');
      report.injected = true;
    }
  }

  // ---- 4) 结构校验（与改前逐项比对，任何一项变化即拒绝落盘）----
  const pairs = [
    ['注释 <!--', /<!--/g], ['注释 -->', /-->/g],
    ['div 开', /<div(\s|>)/gi], ['div 闭', /<\/div>/gi],
    ['span 开', /<span(\s|>)/gi], ['span 闭', /<\/span>/gi],
    ['script 开', /<script(\s|>)/gi], ['script 闭', /<\/script>/gi],
    ['nav 开', /<nav(\s|>)/gi], ['nav 闭', /<\/nav>/gi]
  ];
  for (const [name, re] of pairs) {
    const before = countOf(text, re);
    const after = countOf(newText, re);
    // 注入 icon-map.js 会合法地新增一对 <script></script>，预期差值 = 注入个数
    const allowed = name.indexOf('script') === 0 ? (report.injected ? 1 : 0) : 0;
    if (after - before !== allowed) {
      report.problems.push(name + ' 配对发生变化（' + before + ' → ' + after +
        '，预期 +' + allowed + '），拒绝落盘');
    }
  }
  if (/class="nav-item active data-page=/.test(newText)) {
    report.problems.push('检测到畸形属性 class="nav-item active data-page=');
  }
  if (/\.js\?v=[0-9A-Za-z._]+"[^>\s]/.test(newText)) {
    report.problems.push('检测到版本号损坏签名 .js?v=xxx" 后紧跟非闭合字符');
  }

  report.changed = newText !== text;
  // 行尾与 BOM 原样还原：newText 全程按 \n 切分再拼回，行尾字符本身未被改动
  report.payload = (hasBom ? '\uFEFF' : '') + newText;
  report.eol = eol;
  report.abs = abs;
  return report;
}

function main() {
  const write = process.argv.indexOf('--write') >= 0;
  const files = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !EXCLUDE_FILE_RE.test(f))
    .filter((f) => !EXCLUDE_FILE_SET.has(f))
    .filter((f) => !EXCLUDE_DIRS.has(f))
    .filter((f) => fs.statSync(path.join(ROOT, f)).isFile())
    .sort();

  const out = [];
  let touched = 0, skippedNoSidebar = 0, totalReplaced = 0, totalInjected = 0;
  const allProblems = [];
  const unmappedAll = [];

  for (const f of files) {
    const r = processFile(f);
    if (!r) { skippedNoSidebar++; continue; }
    out.push('  ' + f +
      ' | 替换 ' + r.replaced +
      ' | 已是 data-icon ' + r.already +
      ' | 未映射保留 ' + r.skipped +
      ' | 注入 icon-map: ' + (r.injected ? 'YES' : (r.hadInject ? '已存在' : 'NO')));
    if (r.unmapped && r.unmapped.length) unmappedAll.push(f + ': ' + r.unmapped.join(','));
    if (r.problems.length) allProblems.push(f + ' → ' + r.problems.join('; '));
    if (r.changed) {
      touched++;
      totalReplaced += r.replaced;
      if (r.injected) totalInjected++;
      if (write && r.problems.length === 0) {
        fs.writeFileSync(r.abs, r.payload, 'utf8');
      }
    }
  }

  const summary = [];
  summary.push('模式: ' + (write ? 'WRITE（已落盘）' : 'CHECK（预演，未落盘）'));
  summary.push('扫描根目录 html: ' + files.length + ' 个；含侧栏并处理: ' +
    (files.length - skippedNoSidebar) + ' 个；无侧栏跳过: ' + skippedNoSidebar + ' 个');
  summary.push('本次变更文件: ' + touched + ' 个；替换 nav-icon: ' + totalReplaced +
    ' 个；新注入 icon-map.js: ' + totalInjected + ' 个');
  summary.push('未映射而保留 emoji 的侧栏项: ' + (unmappedAll.length ? unmappedAll.join(' | ') : '无'));
  summary.push('结构校验问题: ' + (allProblems.length ? '\n  - ' + allProblems.join('\n  - ') : '无 ✅'));
  summary.push('');
  summary.push('--- 逐页明细 ---');
  summary.push(...out);

  const txt = summary.join('\n');
  fs.writeFileSync(path.join(__dirname, 'qa', '_icons_apply_' + (write ? 'out' : 'check') + '.txt'), txt, 'utf8');
  console.log(txt);
  process.exit(allProblems.length ? 2 : 0);
}

main();
