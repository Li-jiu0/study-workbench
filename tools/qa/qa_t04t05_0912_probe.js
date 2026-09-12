/* qa_t04t05_0912_probe.js —— 事实采集（只读，不写业务文件）
 * 目的：在写断言之前先把「全站到底有哪些页 / 各自版本 / 是否有侧栏」摸清楚，
 *      避免照抄工程师的自检口径。
 * 输出：stdout（请重定向到文件再读）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const R = path.resolve('D:/下载的文件/学习工作台');

function listHtml(dir) {
  const out = [];
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.html?$/i.test(e.name)) out.push(fp);
    }
  };
  walk(dir);
  return out;
}

const all = listHtml(R).filter(p => !p.includes('/node_modules/') && !p.includes('\\node_modules\\'));
console.log('=== 全库 HTML（含备份）总数: ' + all.length);

// git 跟踪的 html
const g = cp.spawnSync('git', ['-C', R, 'ls-files', '*.html', '*.htm'], { encoding: 'utf8', shell: true });
const tracked = new Set((g.stdout || '').split('\n').map(s => s.trim()).filter(Boolean));
console.log('=== git 跟踪 HTML 数: ' + tracked.size);

// 备份目录
const bak = all.filter(p => p.includes('/备份/') || p.includes('\\备份\\'));
console.log('=== 备份目录 HTML 数: ' + bak.length);

// 根级 html
const rootHtml = all.filter(p => path.dirname(p) === R);
console.log('=== 根级 HTML 数: ' + rootHtml.length);

// 排除规则（团队约定）
function excluded(rel) {
  const base = path.basename(rel);
  if (rel.startsWith('备份/') || rel.startsWith('备份\\')) return '备份目录';
  if (base === 'settings.html') return 'settings.html 草稿';
  if (/^settings_.*\.html$/.test(base)) return 'settings_* 草稿';
  if (/^profile.*\.html$/.test(base)) return 'profile* 草稿';
  if (base === '设置_旧版.html') return '旧版';
  return null;
}

const formal = rootHtml.filter(p => !excluded(path.basename(p)));
console.log('=== 根级「正式页」（按排除规则）: ' + formal.length);
console.log(formal.map(p => path.basename(p)).join(' | '));

// 有 <nav class="sidebar"> 的页
const withSidebar = [];
const noSidebar = [];
for (const p of formal) {
  const s = fs.readFileSync(p, 'utf8');
  if (/<nav[^>]*class="[^"]*\bsidebar\b[^"]*"/i.test(s)) withSidebar.push(path.basename(p));
  else noSidebar.push(path.basename(p));
}
console.log('=== 正式页中含 nav.sidebar: ' + withSidebar.length);
console.log(withSidebar.join(' | '));
console.log('=== 正式页中不含 nav.sidebar: ' + noSidebar.length);
console.log(noSidebar.join(' | '));

// 版本分布
console.log('\n=== 各页 assets 引用版本分布 ===');
const verRe = /assets\/[A-Za-z0-9_\-.]+\.(?:js|css)\?v=([0-9A-Za-z._\-]+)/g;
const rows = [];
for (const p of formal) {
  const s = fs.readFileSync(p, 'utf8');
  const set = new Set();
  let m;
  verRe.lastIndex = 0;
  while ((m = verRe.exec(s))) set.add(m[1]);
  rows.push({ f: path.basename(p), v: Array.from(set).sort(), n: (s.match(verRe) || []).length });
}
for (const r of rows) console.log(r.f + ' -> ' + (r.v.length ? r.v.join(',') : '(无)') + '  (refs=' + r.n + ')');

// 无版本号的 assets 引用
console.log('\n=== 无 ?v= 的 assets 引用 ===');
for (const p of formal) {
  const s = fs.readFileSync(p, 'utf8');
  const bad = s.match(/assets\/[A-Za-z0-9_\-.]+\.(?:js|css)(?!\?v=)/g);
  if (bad) console.log(path.basename(p) + ' -> ' + Array.from(new Set(bad)).join(','));
}

// data-icon 统计
console.log('\n=== data-icon / nav-icon 统计（正式页）===');
for (const p of formal) {
  const s = fs.readFileSync(p, 'utf8');
  const di = (s.match(/data-icon="/g) || []).length;
  const ni = (s.match(/class="[^"]*\bnav-icon\b/g) || []).length;
  const inj = (s.match(/icon-map\.js/g) || []).length;
  if (di || ni || inj) console.log(path.basename(p) + '  data-icon=' + di + '  nav-icon=' + ni + '  icon-map引用=' + inj);
}
