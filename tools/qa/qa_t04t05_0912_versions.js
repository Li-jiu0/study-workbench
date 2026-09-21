/* =====================================================================
 * qa_t04t05_0912_versions.js —— QA 独立验证 §2 版本分布与缓存正确性
 * ---------------------------------------------------------------------
 * 关键点：只统计「真正会被浏览器请求」的 src/href 属性里的 assets 引用，
 *        注释里出现的 assets/xxx.js（本次共 36 处）不算 —— 否则会误报。
 * 只读脚本。
 * 运行：node tools/qa/qa_t04t05_0912_versions.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const R = path.resolve('D:/下载的文件/学习工作台');
let PASS = 0, FAIL = 0;
const failures = [];
function ok(c, name, detail) { if (c) PASS++; else { FAIL++; failures.push({ name, detail: detail || '' }); } }
function section(t) { console.log('\n---- ' + t + ' ----'); }

const EXCL = (b) => b === 'settings.html' || /^settings_.*\.html$/.test(b) ||
                    /^profile.*\.html$/.test(b) || b === '设置_旧版.html';
const formal = fs.readdirSync(R).filter(f => /\.html?$/i.test(f) && !EXCL(f));

/** 只抽取 src/href 属性中的 assets 引用（真正发请求的部分） */
function assetRefs(html) {
  const out = [];
  const re = /(?:src|href)\s*=\s*["']([^"']*assets\/[^"']+\.(?:js|css))(?:\?v=([0-9A-Za-z._\-]+))?["']/gi;
  let m;
  while ((m = re.exec(html))) out.push({ path: m[1], v: m[2] || null });
  return out;
}

section('0. 页面集合');
console.log('   根级 HTML=45  草稿(settings*/profile*/旧版)=16  正式页=' + formal.length);
ok(formal.length === 29, '正式页数量 = 29（45 - 16 草稿）', '实际 ' + formal.length);

// ---------- 1. 版本分布 ----------
section('1. 版本分布（24 页 20260912a / 5 页 20260911i / 混合 0）');
const buckets = { '20260912a': [], '20260911i': [], mixed: [], other: [], none: [] };
const detail = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const refs = assetRefs(s);
  const vs = Array.from(new Set(refs.map(r => r.v)));
  const rec = { f, refs: refs.length, vs, files: refs.map(r => r.path.split('/').pop()) };
  detail.push(rec);
  if (!refs.length) buckets.none.push(f);
  else if (vs.length > 1) buckets.mixed.push(f + ' => ' + vs.join('+'));
  else if (vs[0] === '20260912a') buckets['20260912a'].push(f);
  else if (vs[0] === '20260911i') buckets['20260911i'].push(f);
  else buckets.other.push(f + ' => ' + vs.join('+'));
}
console.log('   20260912a: ' + buckets['20260912a'].length + ' 页');
console.log('   20260911i: ' + buckets['20260911i'].length + ' 页 -> ' + buckets['20260911i'].join(', '));
console.log('   混合版本 : ' + buckets.mixed.length + ' -> ' + buckets.mixed.join(', '));
console.log('   其它版本 : ' + buckets.other.length + ' -> ' + buckets.other.join(', '));
ok(buckets['20260912a'].length === 24, '恰 24 页全部资源引用为 20260912a', '实际 ' + buckets['20260912a'].length);
ok(buckets['20260911i'].length === 5, '恰 5 页保持 20260911i', '实际 ' + buckets['20260911i'].length);
ok(buckets.mixed.length === 0, '混合版本页 = 0（避免一半新一半旧的缓存）', buckets.mixed.join('; '));
ok(buckets.other.length === 0, '不存在其它版本号的页', buckets.other.join('; '));
ok(buckets.none.length === 0, '不存在「无 assets 引用」的正式页', buckets.none.join('; '));

const expectI = ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html', '好友申请.html', '学途.html'];
for (const f of expectI) ok(buckets['20260911i'].indexOf(f) >= 0, f + ' 应为 20260911i');
for (const f of expectI) {
  const i = buckets['20260912a'].indexOf(f);
  ok(i < 0, f + ' 不应被 bump 到 20260912a');
}

// ---------- 2. common.css 必须已 bump ----------
section('2. common.css 缓存正确性（T01 改过 common.css）');
let ccCount = 0, ccBad = [];
for (const rec of detail) {
  if (rec.vs.length === 1 && rec.vs[0] === '20260912a') {
    if (rec.files.indexOf('common.css') >= 0) {
      ccCount++;
      const s = fs.readFileSync(path.join(R, rec.f), 'utf8');
      if (!/common\.css\?v=20260912a/.test(s)) ccBad.push(rec.f);
    }
  }
}
console.log('   24 页中引用 common.css 的页数: ' + ccCount);
ok(ccBad.length === 0, '所有引用 common.css 的新版页都带 ?v=20260912a', ccBad.join(', '));
// 反向：列出所有引用 common.css 的页及其版本（用于暴露「冻页吃旧 CSS」风险）
const ccAll = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const m = s.match(/(?:src|href)\s*=\s*["'][^"']*common\.css(?:\?v=([0-9A-Za-z._\-]+))?["']/gi);
  if (m) ccAll.push({ f, raw: m.join(' | '), v: (m[0].match(/\?v=([0-9A-Za-z._\-]+)/) || [])[1] });
}
console.log('   引用 common.css 的页: ' + ccAll.length);
const ccStale = ccAll.filter(x => x.v !== '20260912a');
if (ccStale.length) {
  console.log('   [发现] 非 20260912a 的 common.css 引用（冻页，需人工判断影响面）:');
  ccStale.forEach(x => console.log('      ' + x.f + ' -> v=' + x.v + '  ' + x.raw));
}
// 硬断言：被 bump 的 24 页里，凡引用 common.css 的必须已是 20260912a
const bumpedSetC = new Set(buckets['20260912a']);
const ccBumpedBad = ccAll.filter(x => bumpedSetC.has(x.f) && x.v !== '20260912a');
ok(ccBumpedBad.length === 0, '24 个已 bump 页中引用 common.css 的都为 20260912a', ccBumpedBad.map(x => x.f + '=' + x.v).join(', '));

// ---------- 3. 版本号事故签名 ----------
section('3. 版本号事故签名与注释配平');
const sigRe = /\.js\?v=[0-9A-Za-z]+"[^>]/g;
let sigTotal = 0; const sigHits = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const m = s.match(sigRe);
  if (m) { sigTotal += m.length; sigHits.push(f + ': ' + m.join(' | ')); }
}
ok(sigTotal === 0, '事故签名 \\.js\\?v=xxx"[^>] 命中数 = 0', sigHits.join('\n'));

// 加强版：逐个定位 ?v= 令牌，取到下一个定界符，断言定界符必须是引号/&（防 ?v=20260912a" 被截断成 20260912）
let sig2Total = 0; const sig2Hits = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const re = /\.(?:js|css)\?v=/g;
  let m;
  while ((m = re.exec(s))) {
    let i = m.index + m[0].length;
    let tok = '';
    while (i < s.length && /[0-9A-Za-z._\-]/.test(s[i])) { tok += s[i]; i++; }
    const delim = s[i];
    if (delim !== '"' && delim !== "'" && delim !== '&') {
      sig2Total++; sig2Hits.push(f + ': ?v=' + tok + ' 后跟 ' + JSON.stringify(delim));
    }
    ok(tok === '20260912a' || tok === '20260911i', f + ' 版本令牌合法 (' + tok + ')');
  }
}
ok(sig2Total === 0, '版本令牌后必须紧跟引号或 &（0 畸形）', sig2Hits.join('\n'));

let unbal = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  const open = (s.match(/<!--/g) || []).length;
  const close = (s.match(/-->/g) || []).length;
  if (open !== close) unbal.push(f + ' (<!-- =' + open + ', --> =' + close + ')');
}
ok(unbal.length === 0, 'HTML 注释 <!-- 与 --> 数量配平', unbal.join('; '));

// ---------- 4. 版本引用完整性：外链资源全部存在 ----------
section('4. 引用的 assets 文件真实存在');
const missing = [];
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  for (const r of assetRefs(s)) {
    if (!fs.existsSync(path.join(R, r.path))) missing.push(f + ' -> ' + r.path);
  }
}
ok(missing.length === 0, '所有 assets 引用指向存在的文件', missing.join('; '));

// ---------- 5. git 视角：bump 覆盖面 ----------
section('5. git 视角交叉验证');
const st = cp.spawnSync('git', ['-C', R, '-c', 'core.quotepath=false', 'status', '--porcelain'], { encoding: 'utf8', shell: true });
const changed = (st.stdout || '').split('\n').map(s => s.slice(3).replace(/^"|"$/g, '')).filter(Boolean);
const htmlChanged = changed.filter(f => /\.html?$/i.test(f));
console.log('   工作树已改动 HTML: ' + htmlChanged.length);
ok(htmlChanged.length === 24, '被改动的 HTML 恰为 24 个', '实际 ' + htmlChanged.length + ' -> ' + htmlChanged.join(', '));
const bumpedSet = new Set(buckets['20260912a']);
const changedSet = new Set(htmlChanged);
const onlyVersion = [...changedSet].filter(f => !bumpedSet.has(f));
const onlyBump = [...bumpedSet].filter(f => !changedSet.has(f));
ok(onlyVersion.length === 0, '所有被改动的 HTML 都是 20260912a', onlyVersion.join(', '));
ok(onlyBump.length === 0, '所有 20260912a 页都有实际改动', onlyBump.join(', '));

console.log('\n=== §2 汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' ===');
if (failures.length) {
  console.log('\n--- 失败明细 ---');
  failures.forEach((f, i) => console.log((i + 1) + '. ' + f.name + (f.detail ? '\n     ' + f.detail : '')));
}
process.exitCode = FAIL ? 1 : 0;
