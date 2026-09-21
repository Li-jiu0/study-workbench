#!/usr/bin/env node
/**
 * tools/qa/check_t04t05_0912.js —— 批次五 T04 收尾 + T05 全局一致性自检
 * （寇豆码 / engineer，2026-09-12）
 *
 * 覆盖主理人指定的 5 项自检中的 1/2/3/4（第 5 项 jsdom 见 ed_t05_smoke_0912.js）：
 *   [1] 字典缺失 = 无（data-icon 引用的 key 全部在 LUCIDE_ICONS 里）
 *   [2] 每个被改页面 div 开闭配平、注释配平、无畸形引号
 *   [3] 版本号损坏签名 grep = 0；注释内的资源引用不带版本号
 *   [4] 版本号分布报告（本批被改页 = 20260912a，旧页 = 20260911i）
 *   [5] 侧栏 nav-icon 里不再残留被替换的目标 emoji
 *
 * 运行：node tools/qa/check_t04t05_0912.js
 * 退出码：0 = 全通过；1 = 有失败
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = '20260912a';
const OLD_VERSION = '20260911i';

/** 本批被改动并 bump 到 20260912a 的页面（与 tools/bump_versions_0912a.py 的 PAGES 一致） */
const CHANGED_PAGES = [
  'PPT案例拆解.html', 'PPT版式库.html', 'PPT训练.html', 'blog_wechat.html',
  '万能金句库.html', '个人中心.html', '动态.html', '商务礼仪.html',
  '商务礼仪面试.html', '四级备考.html', '四级词汇.html', '场景话术库.html',
  '央国企笔试.html', '学习博客.html', '学习工作台.html', '工具.html',
  '更多.html', '登录.html', '私聊.html', '行测刷题.html', '设置.html',
  '错题本.html', '面试题库.html', '高情商表达.html'
];

/** 侧栏已被替换掉的目标 emoji（§2.4 必换清单） */
const REPLACED_EMOJI = ['🏠', '📖', '📝', '💬', '🤝', '🎨', '📒', '👤', '⚙️', '🌏', '🗂️'];
/** 语义 emoji 按 D5 决策保留，不参与检查 */

const EXCLUDE_FILE_RE = /^(settings|profile|_preview_|_t|_)/;

let pass = 0;
let fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; }
  else {
    fail++;
    FAILS.push(label + (detail ? ' | ' + detail : ''));
    console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }

/* ---------- 载入 icon-map.js 取字典 ---------- */
const sandbox = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [] }, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'icon-map.js'), 'utf8'), sandbox);
const ICONS = sandbox.window.LUCIDE_ICONS || {};
const ICON_KEYS = Object.keys(ICONS);

function countOf(text, re) { const m = text.match(re); return m ? m.length : 0; }
function tagBalance(text, tag) {
  const op = countOf(text, new RegExp('<' + tag + '(\\s|>)', 'gi'));
  const cl = countOf(text, new RegExp('</' + tag + '>', 'gi'));
  return [op, cl];
}

function main() {
  const allHtml = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.statSync(path.join(ROOT, f)).isFile())
    .sort();

  const contents = {};
  for (const f of allHtml) contents[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

  /* ================= 1. 字典完整性 ================= */
  sec('[1] icon-map.js 字典 vs 全站 data-icon 引用');
  console.log('  字典图标数: ' + ICON_KEYS.length);
  const usedKeys = new Map();
  for (const f of allHtml) {
    if (EXCLUDE_FILE_RE.test(f)) continue;
    const re = /data-icon\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(contents[f])) !== null) {
      if (!usedKeys.has(m[1])) usedKeys.set(m[1], []);
      usedKeys.get(m[1]).push(f);
    }
  }
  const missing = [...usedKeys.keys()].filter((k) => !ICONS[k]);
  check('字典缺失（会渲染空白）= 无', missing.length === 0,
    missing.length ? '缺失=' + missing.join(', ') : '引用种类=' + usedKeys.size);
  console.log('  页面引用到的图标种类: ' + usedKeys.size +
    '（' + [...usedKeys.keys()].sort().join(', ') + '）');

  /* ================= 2. 结构配平 ================= */
  sec('[2] 被改页面结构配平 / 畸形引号');
  for (const f of CHANGED_PAGES) {
    if (!contents[f]) { check('[' + f + '] 文件存在', false); continue; }
    const t = contents[f];
    let ok = true;
    const detail = [];
    for (const tag of ['div', 'nav', 'span', 'script', 'section']) {
      const [o, c] = tagBalance(t, tag);
      if (o !== c) { ok = false; detail.push(tag + ' ' + o + '/' + c); }
    }
    if (t.split('<!--').length !== t.split('-->').length) {
      ok = false; detail.push('注释 ' + (t.split('<!--').length - 1) + '/' + (t.split('-->').length - 1));
    }
    if (/class="nav-item active data-page=/.test(t)) { ok = false; detail.push('畸形引号 class="nav-item active data-page='); }
    if (/class="nav-icon"[^>]*data-page=/.test(t)) { ok = false; detail.push('畸形标签 nav-icon 内出现 data-page='); }
    check('[' + f + '] 标签/注释配平 + 无畸形引号', ok, detail.join('; '));
  }

  /* ================= 3. 版本号损坏签名 ================= */
  sec('[3] 版本号损坏签名 / 注释内引用');
  let corruptTotal = 0;
  let commentWithVersion = 0;
  for (const f of allHtml) {
    const t = contents[f];
    const hits = t.match(/\.js\?v=[0-9A-Za-z._]+"[^>\s]/g) || [];
    corruptTotal += hits.length;
    if (hits.length) console.log('  !! ' + f + ' 损坏签名: ' + hits.slice(0, 3).join(' | '));
    // 注释里的资源引用必须不带版本号
    const comments = t.match(/<!--[\s\S]*?-->/g) || [];
    for (const c of comments) {
      if (/assets\/[A-Za-z0-9_\-.]+\.(js|css)\?v=/.test(c)) commentWithVersion++;
    }
  }
  check('全站 .js?v=xxx" 后紧跟非闭合字符的损坏签名 = 0', corruptTotal === 0, '实际=' + corruptTotal);
  check('HTML 注释内的资源引用一律不带版本号', commentWithVersion === 0, '实际=' + commentWithVersion);

  /* ================= 4. 版本号分布 ================= */
  sec('[4] 版本号分布（本批被改页应 = ' + VERSION + '）');
  const atNew = [];
  const atOld = [];
  const mixed = [];
  for (const f of allHtml) {
    if (EXCLUDE_FILE_RE.test(f) || f === '设置_旧版.html') continue;
    const t = contents[f];
    const toks = (t.match(/\?v=([0-9A-Za-z._]+)/g) || []).map((s) => s.slice(3));
    if (!toks.length) continue;
    const uniq = [...new Set(toks)];
    if (uniq.length === 1 && uniq[0] === VERSION) atNew.push(f);
    else if (uniq.length === 1 && uniq[0] === OLD_VERSION) atOld.push(f);
    else mixed.push(f + '(' + uniq.join(',') + ')');
  }
  console.log('  全部 ' + VERSION + ' 的页(' + atNew.length + '): ' + atNew.join(', '));
  console.log('  全部 ' + OLD_VERSION + ' 的页(' + atOld.length + '): ' + atOld.join(', '));
  console.log('  混合版本的页(' + mixed.length + '): ' + (mixed.join(', ') || '无'));
  const notBumped = CHANGED_PAGES.filter((f) => atNew.indexOf(f) < 0);
  check('本批被改的 ' + CHANGED_PAGES.length + ' 页全部统一到 ' + VERSION,
    notBumped.length === 0, '未达标=' + notBumped.join(', '));
  check('无混合版本页面', mixed.length === 0, mixed.join(', '));

  /* ================= 5. 图标注入与 emoji 残留 ================= */
  sec('[5] icon-map.js 注入 + 侧栏 emoji 残留');
  const sidebarPages = allHtml.filter((f) => /<nav class="sidebar"/.test(contents[f])
    && !EXCLUDE_FILE_RE.test(f) && f !== '设置_旧版.html');
  let noInject = [];
  let emojiLeft = [];
  let dataIconMissing = [];
  for (const f of sidebarPages) {
    const t = contents[f];
    if (!/assets\/icon-map\.js/.test(t)) noInject.push(f);
    const navTags = t.match(/<span\b[^>]*\bclass\s*=\s*"nav-icon"[^>]*>[\s\S]*?<\/span>/g) || [];
    for (const tag of navTags) {
      for (const e of REPLACED_EMOJI) {
        if (tag.indexOf(e) >= 0) { emojiLeft.push(f + ': ' + e); break; }
      }
      const dm = tag.match(/data-icon\s*=\s*"([^"]+)"/);
      if (!dm) dataIconMissing.push(f + ': ' + tag.slice(0, 60));
    }
  }
  console.log('  带侧栏正式页(' + sidebarPages.length + '): ' + sidebarPages.join(', '));
  check('所有带侧栏正式页都注入了 icon-map.js', noInject.length === 0, '未注入=' + noInject.join(', '));
  check('侧栏 nav-icon 内无被替换目标 emoji 残留', emojiLeft.length === 0, emojiLeft.slice(0, 5).join(' | '));
  check('侧栏每个 nav-icon 都带 data-icon', dataIconMissing.length === 0, dataIconMissing.slice(0, 3).join(' | '));

  /* ================= 6. 行尾 / BOM 完整性 ================= */
  sec('[6] 行尾(CRLF/LF) 与 BOM 完整性（批量改写容易悄悄统一行尾）');
  const EXPECTED_CRLF = new Set(['个人中心.html', '工具.html', '更多.html', '登录.html', '私聊.html', '设置.html']);
  const eolIssues = [];
  for (const f of CHANGED_PAGES) {
    if (!contents[f]) continue;
    const raw = fs.readFileSync(path.join(ROOT, f));
    const s = raw.toString('utf8').replace(/^\uFEFF/, '');
    const crlf = (s.match(/\r\n/g) || []).length;
    const lfOnly = (s.match(/\n/g) || []).length - crlf;
    const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
    // 判定：不得出现「CRLF 与裸 LF 混用」
    if (crlf > 0 && lfOnly > 0) eolIssues.push(f + ' 混用 CRLF=' + crlf + '/LF=' + lfOnly);
    const isCrlf = crlf > 0 && lfOnly === 0;
    if (EXPECTED_CRLF.has(f) && !isCrlf) eolIssues.push(f + ' 应为纯 CRLF，实际 CRLF=' + crlf + '/LF=' + lfOnly);
    if (!EXPECTED_CRLF.has(f) && isCrlf) eolIssues.push(f + ' 应为纯 LF，实际为 CRLF');
    if (bom) eolIssues.push(f + ' 带 BOM（原文件无 BOM）');
  }
  check('被改页面行尾未混用、未意外切换 CRLF/LF、无多余 BOM',
    eolIssues.length === 0, eolIssues.join(' | '));

  /* ================= 汇总 ================= */
  console.log('\n===== 汇总 =====');
  console.log('通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项');
  if (FAILS.length) { console.log('失败清单：'); FAILS.forEach((x) => console.log('  - ' + x)); }
  const outLines = [
    '通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项',
    ...(FAILS.length ? ['失败清单：', ...FAILS.map((x) => '  - ' + x)] : ['无失败项 ✅'])
  ];
  fs.writeFileSync(path.join(__dirname, '_t04t05_check.txt'), outLines.join('\n'), 'utf8');
  process.exit(fail === 0 ? 0 : 1);
}

main();
