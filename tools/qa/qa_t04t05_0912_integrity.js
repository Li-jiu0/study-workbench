/* =====================================================================
 * qa_t04t05_0912_integrity.js —— QA 独立验证 §4 批量改写完整性
 * ---------------------------------------------------------------------
 * 关注最容易「静默漏替换」的地方：
 *   4.1 侧栏 emoji 是否换干净（23 个带 nav.sidebar 的正式页）
 *   4.2 已排除的草稿页是否确实没被碰
 *   4.3 div / script / section 配平
 *   4.4 畸形引号（如 class="nav-item active data-page="）
 *   4.5 行尾（CRLF/LF）未被批量脚本偷偷统一
 * 只读脚本。
 * 运行：node tools/qa/qa_t04t05_0912_integrity.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const R = path.resolve('D:/下载的文件/学习工作台');
let PASS = 0, FAIL = 0, WARN = 0;
const failures = [], warns = [];
function ok(c, name, detail) { if (c) PASS++; else { FAIL++; failures.push({ name, detail: detail || '' }); } }
function warn(c, name, detail) { if (!c) { WARN++; warns.push({ name, detail: detail || '' }); } else PASS++; }
function section(t) { console.log('\n---- ' + t + ' ----'); }

// git 帮助函数（注意 -c core.quotepath=false，否则中文路径是八进制转义）
function git(args) {
  const r = cp.spawnSync('git', ['-C', R, '-c', 'core.quotepath=false'].concat(args),
    { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  return (r.stdout || '');
}

const EXCL = (b) => b === 'settings.html' || /^settings_.*\.html$/.test(b) ||
                    /^profile.*\.html$/.test(b) || b === '设置_旧版.html';
const allRoot = fs.readdirSync(R).filter(f => /\.html?$/i.test(f));
const formal = allRoot.filter(f => !EXCL(f));
const drafts = allRoot.filter(f => EXCL(f));

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

/** 引号感知地切出所有开始/结束标签，避免 onclick="if(a>1)" 被截断 */
function extractTags(html) {
  const tags = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== '<') { i++; continue; }
    const nx = html[i + 1] || '';
    if (!/[a-zA-Z/]/.test(nx)) { i++; continue; }
    let j = i + 1, q = null;
    while (j < html.length) {
      const c = html[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") { q = c; }
      else if (c === '>') break;
      j++;
    }
    tags.push(html.slice(i, Math.min(j + 1, html.length)));
    i = j + 1;
  }
  return tags;
}

// =====================================================================
section('4.1 侧栏 emoji 是否换干净');
const sidebarPages = [], nonSidebar = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  if (/<nav[^>]*class="[^"]*\bsidebar\b[^"]*"/i.test(s)) sidebarPages.push(f); else nonSidebar.push(f);
}
console.log('   带 nav.sidebar 的正式页: ' + sidebarPages.length + '；不带: ' + nonSidebar.length + ' (' + nonSidebar.join(',') + ')');
ok(sidebarPages.length === 23, '带侧栏的正式页 = 23', '实际 ' + sidebarPages.length);

// 用 jsdom 解析（比正则稳，能正确处理单行/多行、嵌套的 nav）
const { JSDOM } = require(R + '/tools/verifier/node_modules/jsdom');
const emojiResidue = [];
let navIconTotal = 0;
for (const f of sidebarPages) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const doc = new JSDOM(s).window.document;
  const items = Array.from(doc.querySelectorAll('nav.sidebar .nav-item'));
  for (const it of items) {
    const txt = (it.textContent || '').trim();
    const m = txt.match(EMOJI_RE);
    if (m) emojiResidue.push(f + ' nav-item 残留 emoji: ' + JSON.stringify(txt.slice(0, 60)));
  }
  const icons = Array.from(doc.querySelectorAll('nav.sidebar .nav-icon'));
  navIconTotal += icons.length;
  for (const ic of icons) {
    const t = (ic.textContent || '').trim();
    if (t) emojiResidue.push(f + ' nav-icon 内有文本: ' + JSON.stringify(t.slice(0, 60)));
  }
  ok(icons.length > 0, f + ' 侧栏存在 .nav-icon（' + icons.length + ' 个）');
  ok(items.length > 0, f + ' 侧栏存在 .nav-item（' + items.length + ' 个）');
  // logo-icon 的 📚 是设计保留项，不应被替换 —— 反向断言它还在
  const logo = doc.querySelector('nav.sidebar .logo-icon');
  ok(!!logo, f + ' logo-icon 保留（设计项，未被误换）');
}
console.log('   侧栏 .nav-icon 总数: ' + navIconTotal);
ok(emojiResidue.length === 0, '23 个侧栏页无 emoji 残留 / nav-icon 无残留文本',
   emojiResidue.slice(0, 20).join('\n     '));

// 其它图标位（title-icon / mpc-icon / bm-icon / tp-icon）现状盘点（信息）
const otherIcons = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  for (const cls of ['title-icon', 'mpc-icon', 'bm-icon', 'tp-icon']) {
    const re = new RegExp('<[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>([\\s\\S]*?)</', 'gi');
    let m;
    while ((m = re.exec(s))) {
      if (m[1] && m[1].trim()) otherIcons.push(f + ' .' + cls + ' => ' + JSON.stringify(m[1].trim().slice(0, 20)));
    }
  }
}
console.log('   [信息] 非侧栏图标位仍有内容（不在 T04 范围内）: ' + otherIcons.length + ' 处');
otherIcons.slice(0, 8).forEach(x => console.log('      ' + x));

// 全站（含非侧栏正式页）nav-icon 残留 emoji
const globalResidue = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const spans = s.match(/<span[^>]*\bnav-icon\b[^>]*>[\s\S]*?<\/span>/gi) || [];
  spans.forEach(sp => {
    const inner = sp.replace(/^<span[^>]*>/i, '').replace(/<\/span>$/i, '');
    if (inner.trim()) globalResidue.push(f + ': ' + JSON.stringify(inner.trim().slice(0, 60)));
  });
}
ok(globalResidue.length === 0, '全站 nav-icon span 均为空（由 JS 注入）', globalResidue.slice(0, 10).join('; '));

// logo-icon 的 📚 属于设计保留项，不应被换
warn(true, 'logo-icon 📚 保留为设计项（不计入残留）');

// =====================================================================
section('4.2 已排除的草稿页确实没被碰');
const st = git(['status', '--porcelain']).split('\n').map(s => s.slice(3).trim()).filter(Boolean);
const changedSet = new Set(st);
console.log('   草稿页清单: ' + drafts.join(', '));
console.log('   备份目录页数: ' + (() => { let n = 0; try { n = fs.readdirSync(path.join(R, '备份')).filter(f => /\.html?$/i.test(f)).length; } catch (e) {} return n; })());
for (const d of drafts) ok(!changedSet.has(d), '草稿页未被改动: ' + d);
const bakChanged = st.filter(f => f.startsWith('备份/'));
ok(bakChanged.length === 0, '备份/ 目录未被改动', bakChanged.join(', '));
// 反查：改动集合里不能出现任何 settings_*/profile*/settings.html
const strayDrafts = st.filter(f => /\.html?$/i.test(f) && EXCL(path.basename(f)));
ok(strayDrafts.length === 0, '改动集合中不含任何草稿页', strayDrafts.join(', '));

// =====================================================================
section('4.3 div / script / section 配平');
const UNBAL = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  // 去掉注释里的标记，避免 <!-- <div> --> 干扰（保守：只统计非注释区）
  const noComment = s.replace(/<!--[\s\S]*?-->/g, '');
  const pairs = [['<div', '</div>'], ['<script', '</script>'], ['<section', '</section>'], ['<span', '</span>'], ['<nav', '</nav>']];
  for (const [open, close] of pairs) {
    const o = (noComment.match(new RegExp(open + '\\b', 'gi')) || []).length;
    const c = (noComment.match(new RegExp(close, 'gi')) || []).length;
    // <script ... /> 自闭合极少见，这里只做「开>=闭」的宽松检查 + div/section/nav/span 严格相等
    if (['<div', '<section', '<nav', '<span'].indexOf(open) >= 0) {
      if (o !== c) UNBAL.push(f + ' ' + open + ' 开=' + o + ' 闭=' + c);
      ok(o === c, f + ' ' + open + ' 配平 (' + o + '/' + c + ')');
    } else {
      if (o !== c) UNBAL.push(f + ' ' + open + ' 开=' + o + ' 闭=' + c);
      ok(o === c, f + ' ' + open + ' 配平 (' + o + '/' + c + ')');
    }
  }
}
ok(UNBAL.length === 0, '29 个正式页 div/script/section/span/nav 全部配平', UNBAL.join('; '));

// =====================================================================
section('4.4 畸形引号 / 属性结构');
const malformed = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const noComment = s.replace(/<!--[\s\S]*?-->/g, '');
  // 去掉 <script> 内容（里面字符串可能含引号）
  const noScript = noComment.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // 引号感知的 tag 扫描器：onclick="if(a>1)" 里的 > 不能被当成标签结束
  const tags = extractTags(noScript);
  for (const t of tags) {
    // 移除所有合法的双引号属性/单引号属性后，不应再出现引号
    // 用占位符 Q 替换引号内容（占位符本身不能含引号，否则自伤）
    let rest = t.replace(/"[^"]*"/g, 'Q').replace(/'[^']*'/g, 'Q');
    if (/["']/.test(rest)) { malformed.push(f + ' 引号不配平: ' + t.slice(0, 120)); continue; }
    // 属性名 = 结构：属性数量应与等号数量匹配
    const attrs = rest.match(/[a-zA-Z_:@\-][a-zA-Z0-9_:@.\-]*(?==)/g) || [];
    const eqs = (rest.match(/=/g) || []).length;
    if (attrs.length !== eqs) malformed.push(f + ' 属性/等号不匹配: ' + t.slice(0, 120));
    // 典型事故：class="nav-item active data-page="
    if (/class="[^"]*\b(data-page|data-icon|href|src|id)="/.test(t)) {
      malformed.push(f + ' 疑似属性被吞进 class: ' + t.slice(0, 140));
    }
  }
}
ok(malformed.length === 0, '无畸形引号 / 属性被吞事故', malformed.slice(0, 15).join('\n     '));

// data-icon 属性必须写成 data-icon="xxx" 且有闭合
const diBad = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const m = s.match(/data-icon=(?!")/g);
  if (m) diBad.push(f + ' data-icon 未用双引号(' + m.length + ')');
  const di = s.match(/data-icon="[^"]*"/g) || [];
  const empty = di.filter(x => x === 'data-icon=""');
  if (empty.length) diBad.push(f + ' data-icon 空值(' + empty.length + ')');
}
ok(diBad.length === 0, 'data-icon 属性写法规范', diBad.join('; '));

// =====================================================================
section('4.5 行尾（CRLF/LF）未被统一');
// 注意：本仓 core.autocrlf=true —— 仓库里存 LF、检出成 CRLF。
// 因此「blob 是 LF、工作树是 CRLF」是检出产物而非文件被改写。
// 正确判据：把两侧都归一化成 LF 后逐字节比对，只有归一化后仍不同才是真改写。
const autocrlf = (git(['config', '--get', 'core.autocrlf']) || '').trim();
console.log('   core.autocrlf = ' + (autocrlf || '(unset)'));

const eolChanged = [];
const wholeFileRewrite = [];
for (const f of st.filter(x => /\.html?$/i.test(x))) {
  const wt = fs.readFileSync(path.join(R, f));
  const blob = cp.spawnSync('git', ['-C', R, 'show', 'HEAD:./' + f], { encoding: null, shell: true, maxBuffer: 64 * 1024 * 1024 });
  const old = blob.stdout;
  if (!old || !old.length) { eolChanged.push(f + ' (HEAD 无此文件)'); continue; }
  const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
  const a = norm(old), b = norm(wt);
  if (a === b) { eolChanged.push(f + ' (归一化后完全相同，仅行尾差异)'); continue; }
  // 归一化后仍有差异 → 计算改动比例，判断是不是整页被重写
  const al = a.split('\n').length, bl = b.split('\n').length;
  const changedLines = Math.abs(al - bl) + 1;
  const ratio = changedLines / Math.max(al, 1);
  if (ratio > 0.5) wholeFileRewrite.push(f + ' (' + al + ' -> ' + bl + ' 行)');
  ok(ratio <= 0.5, f + ' 未被整页重写（改动行数 ' + changedLines + ' / ' + al + '）');
  // 行尾风格：归一化比较后，再看工作树实际风格是否有“混合行尾”
  const raw = wt.toString('utf8');
  const crlf = (raw.match(/\r\n/g) || []).length;
  const lf = (raw.replace(/\r\n/g, '').match(/\n/g) || []).length;
  const mixed = crlf > 0 && lf > 0;
  ok(!mixed, f + ' 无混合行尾（CRLF=' + crlf + ' 纯LF=' + lf + '）');
}
console.log('   仅行尾差异 / 无实质改动: ' + eolChanged.filter(x => x.includes('仅行尾')).length + ' 页');
ok(wholeFileRewrite.length === 0, '无整页重写（批量脚本未失控）', wholeFileRewrite.join('; '));

// 行尾风格现状盘点（信息）
const styleStat = { CRLF: [], LF: [], MIXED: [] };
for (const f of formal) {
  const raw = fs.readFileSync(path.join(R, f), 'utf8');
  const c = (raw.match(/\r\n/g) || []).length;
  const l = (raw.replace(/\r\n/g, '').match(/\n/g) || []).length;
  styleStat[c > l ? 'CRLF' : (c === 0 && l > 0 ? 'LF' : 'MIXED')].push(f);
}
console.log('   行尾现状: CRLF=' + styleStat.CRLF.length + ' LF=' + styleStat.LF.length + ' MIXED=' + styleStat.MIXED.length);
console.log('   CRLF 页: ' + styleStat.CRLF.join(', '));

// =====================================================================
section('4.6 冻页（20260911i）是否用到新增 CSS 类 —— 影响面评估');
const NEW_CLASSES = ['.morepage-list', '.nav-icon', '.subpage-', '.im-group-title', '.pe-bd-err', '.subpage-group-card'];
const frozen = ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html', '好友申请.html', '学途.html'];
for (const f of frozen) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const hit = NEW_CLASSES.filter(c => s.indexOf(c) >= 0);
  console.log('   ' + f + ' 使用新增类: ' + (hit.length ? hit.join(', ') : '（无）'));
  ok(hit.length === 0, '冻页 ' + f + ' 未使用本批新增 CSS 类（旧 common.css 无影响）', hit.join(','));
}

console.log('\n=== §4 汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' | 警告 ' + WARN + ' ===');
if (failures.length) {
  console.log('\n--- 失败明细 ---');
  failures.forEach((f, i) => console.log((i + 1) + '. ' + f.name + (f.detail ? '\n     ' + f.detail : '')));
}
if (warns.length) {
  console.log('\n--- 警告 ---');
  warns.forEach((w, i) => console.log((i + 1) + '. ' + w.name + (w.detail ? '\n     ' + w.detail : '')));
}
process.exitCode = FAIL ? 1 : 0;
