/**
 * 版本 bump 20260913a → 20260913c 全站扫描验证
 * ---------------------------------------------------------------------------
 * 覆盖：
 *   V1 32 个页面全部被扫描
 *   V2 27 页取值为 20260913c、5 页（不加载 app.js）保持 20260913a
 *   V3 无「混合版本页」（同一页出现两种及以上版本）
 *   V4 无「降级页」（出现比 20260913a 更旧的版本号）
 *   V5 无损坏签名：?v= 后的版本 token 必须完整且紧跟闭合引号
 *      （版本号把后续属性/引号吞掉的特征：token 里混入了非版本字符）
 *   V6 script / link 标签配平
 *
 * 用法：node tools/verifier/verify_versions_0913b.js
 * 退出码：0=全部通过，1=存在失败断言
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const CUR = '20260913c';
const PREV = '20260913a';
// 不加载 assets/app.js 的 5 个页面：保持 20260913a
const KEEP_OLD = ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html', '好友申请.html', '登录.html'];
const ALLOWED = [CUR, PREV];

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}

const pages = fs.readdirSync(ROOT).filter(function (f) { return f.toLowerCase().endsWith('.html'); }).sort();

assert('V1 扫描到 32 个 HTML 页面', pages.length === 32, '实际 ' + pages.length);

const pageInfo = [];
pages.forEach(function (p) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const tokens = [];
  // 形如 ?v=xxx 且紧跟闭合引号 —— 若版本号吞掉了后续属性，token 会混入非版本字符
  const re = /\?v=([^"']*)(["'])/g;
  let m;
  while ((m = re.exec(html)) !== null) tokens.push(m[1]);
  // 兜底：即便没有闭合引号也要抓到（损坏签名的极端形态）
  const orphan = (html.match(/\?v=[^"'\s>]*(?=\s|>)/g) || []).length;
  const uniq = Array.from(new Set(tokens));
  pageInfo.push({
    page: p, total: tokens.length, uniq: uniq,
    hasAppJs: /<script\b[^>]*src=["'][^"']*assets\/app\.js/.test(html),
    orphan: orphan
  });
});

// ---- V2 分组 ----
const curPages = pageInfo.filter(function (i) { return i.uniq.length === 1 && i.uniq[0] === CUR; });
const oldPages = pageInfo.filter(function (i) { return i.uniq.length === 1 && i.uniq[0] === PREV; });
assert('V2-a 27 页版本取值 = ' + CUR, curPages.length === 27, '实际 ' + curPages.length +
  '；' + curPages.map(function (i) { return i.page; }).join(','));
assert('V2-b 5 页保持 ' + PREV + '（不加载 app.js 的页面）', oldPages.length === 5,
  '实际 ' + oldPages.length + '；' + oldPages.map(function (i) { return i.page; }).join(','));
const keepOk = oldPages.length === 5 &&
  KEEP_OLD.every(function (k) { return oldPages.some(function (i) { return i.page === k; }); });
assert('V2-c 保留旧版的正是约定的 5 个页面', keepOk,
  '期望 ' + KEEP_OLD.join('/') + '，实际 ' + oldPages.map(function (i) { return i.page; }).join('/'));
const keepLoadsAppJs = oldPages.filter(function (i) { return i.hasAppJs; });
assert('V2-d 保留旧版的 5 页确实不加载 assets/app.js', keepLoadsAppJs.length === 0,
  keepLoadsAppJs.map(function (i) { return i.page; }).join(','));

// ---- V3 混合版本 ----
const mixed = pageInfo.filter(function (i) { return i.uniq.length > 1; });
assert('V3 无混合版本页（每页版本取值唯一）', mixed.length === 0,
  mixed.map(function (i) { return i.page + '=' + i.uniq.join('|'); }).join(' ; '));

// ---- V4 降级 ----
const illegal = pageInfo.filter(function (i) {
  return i.uniq.some(function (t) { return ALLOWED.indexOf(t) < 0; });
});
assert('V4 无降级/非法版本（全部 ∈ {' + ALLOWED.join(',') + '}）', illegal.length === 0,
  illegal.map(function (i) { return i.page + '=' + i.uniq.join('|'); }).join(' ; '));

// ---- V5 损坏签名 ----
// 语义化实现：?v= 之后到闭合引号之间的内容必须「恰好」是允许的版本号之一。
// 若 bump 把后续属性（如 crossorigin、defer）或引号一起吞掉，token 就会变长/混入
// 其它字符，从而被这里判死。
const corrupted = [];
pageInfo.forEach(function (i) {
  i.uniq.forEach(function (t) { if (ALLOWED.indexOf(t) < 0) corrupted.push(i.page + ' token="' + t + '"'); });
});
assert('V5 无损坏签名（?v= 到闭合引号之间恰好是版本号）', corrupted.length === 0, corrupted.join(' | '));

// 用户给出的字面正则 /\.js\?v=[^"']*["'][^>]/ 作为信息项统计（它对任何闭合良好的
// script 标签都会命中，属恒真式，不能作为判据，这里仅如实记录）
let literalHits = 0;
pages.forEach(function (p) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  literalHits += (html.match(/\.js\?v=[^"']*["'][^>]/g) || []).length;
});
const orphanPages = pageInfo.filter(function (i) { return i.orphan > 0; });
assert('V5-b 无「?v= 后未闭合引号」的孤儿版本号', orphanPages.length === 0,
  orphanPages.map(function (i) { return i.page + '×' + i.orphan; }).join(','));

// ---- V6 标签配平 ----
const unbalancedScript = [], unbalancedLink = [], strayCloseLink = [];
pages.forEach(function (p) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const open = (html.match(/<script\b/gi) || []).length;
  const close = (html.match(/<\/script\s*>/gi) || []).length;
  if (open !== close) unbalancedScript.push(p + ' open=' + open + ' close=' + close);
  // link 是空元素：不得出现 </link>
  if (/<\/link\s*>/i.test(html)) strayCloseLink.push(p);
  // 每个 <link 必须有对应的 '>' 结尾（在同一行内）
  const lines = html.split(/\r?\n/);
  lines.forEach(function (ln, li) {
    const n = (ln.match(/<link\b/gi) || []).length;
    if (n === 0) return;
    const gt = (ln.match(/>/g) || []).length;
    if (gt < n) unbalancedLink.push(p + ':' + (li + 1) + ' link=' + n + ' >=' + gt);
  });
});
assert('V6-a script 标签配平（<script> 与 </script> 数量一致）', unbalancedScript.length === 0,
  unbalancedScript.join(' | '));
assert('V6-b link 标签均为空元素且同行闭合', unbalancedLink.length === 0 && strayCloseLink.length === 0,
  unbalancedLink.slice(0, 5).join(' | ') + (strayCloseLink.length ? ' 出现 </link>：' + strayCloseLink.join(',') : ''));

// ---- 输出 ----
const pass = results.filter(function (r) { return r.ok; }).length;
const failed = results.filter(function (r) { return !r.ok; });
console.log('');
console.log('============================================================');
console.log('版本 bump 20260913a → 20260913c 全站扫描');
console.log('项目根：' + ROOT);
console.log('============================================================');
results.forEach(function (r, i) {
  console.log((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name +
    (r.ok ? '' : '   →   ' + r.detail));
});
console.log('------------------------------------------------------------');
console.log('逐页版本取值（共 ' + pageInfo.length + ' 页）：');
pageInfo.forEach(function (i) {
  console.log('  ' + (i.page + '                      ').slice(0, 24) +
    ' ' + (i.uniq.join('|') || '(无 ?v=)') +
    '  ×' + String(i.total).padStart(3) +
    (i.hasAppJs ? '  [app.js]' : ''));
});
console.log('------------------------------------------------------------');
console.log('参考信息：字面正则 /\\.js\\?v=[^"\']*["\'][^>]/ 命中 ' + literalHits +
  ' 处（该式对闭合良好的 script 标签恒真，不能作判据，已改用语义化 V5）');
console.log('============================================================');
console.log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
console.log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
console.log('============================================================');
process.exit(failed.length === 0 ? 0 : 1);
