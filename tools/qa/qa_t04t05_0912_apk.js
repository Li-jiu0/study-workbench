/* =====================================================================
 * qa_t04t05_0912_apk.js —— QA 独立验证 §5 APK 打包脚本（不真打包）
 * ---------------------------------------------------------------------
 * 1) 三个打包脚本是否都硬断言 icon-map.js / subpage-router.js
 * 2) assets 复制是否递归（子目录 assets/emoji/ 不能被静默跳过）
 * 3) 断言失败是否真的中止（exit 1 / throw），而不是 || true 吞掉
 * 4) 独立交叉校验：白名单是否覆盖了页面真实引用的所有 assets
 * 只读脚本。
 * 运行：node tools/qa/qa_t04t05_0912_apk.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const R = path.resolve('D:/下载的文件/学习工作台');
let PASS = 0, FAIL = 0;
const failures = [];
function ok(c, name, detail) { if (c) PASS++; else { FAIL++; failures.push({ name, detail: detail || '' }); } }
function section(t) { console.log('\n---- ' + t + ' ----'); }

const py = fs.readFileSync(path.join(R, 'android/build_apk.py'), 'utf8');
const sh = fs.readFileSync(path.join(R, 'android/build-apk.sh'), 'utf8');
const ps = fs.readFileSync(path.join(R, 'android/build-apk.ps1'), 'utf8');

const SCRIPTS = [
  { name: 'build_apk.py', src: py, kind: 'py' },
  { name: 'build-apk.sh', src: sh, kind: 'sh' },
  { name: 'build-apk.ps1', src: ps, kind: 'ps' }
];

// ---------------- 1. 白名单内容 ----------------
section('5.1 三个脚本都硬断言 icon-map.js / subpage-router.js');
for (const s of SCRIPTS) {
  ok(/icon-map\.js/.test(s.src), s.name + ' 白名单含 icon-map.js');
  ok(/subpage-router\.js/.test(s.src), s.name + ' 白名单含 subpage-router.js');
}

// 白名单项数（三份应一致）
function countPy(src) {
  const m = src.match(/REQUIRED_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return -1;
  return (m[1].match(/"[^"]+"/g) || []).length;
}
function countSh(src) {
  const m = src.match(/REQUIRED_ASSETS="([\s\S]*?)"/);
  if (!m) return -1;
  return m[1].split('\n').map(x => x.trim()).filter(Boolean).length;
}
function countPs(src) {
  const m = src.match(/\$REQUIRED_ASSETS\s*=\s*@\(([\s\S]*?)\)/);
  if (!m) return -1;
  return (m[1].match(/'[^']+'/g) || []).length;
}
const counts = { py: countPy(py), sh: countSh(sh), ps: countPs(ps) };
console.log('   白名单项数: py=' + counts.py + ' sh=' + counts.sh + ' ps=' + counts.ps);
ok(counts.py === 23, 'build_apk.py 白名单 23 项', '实际 ' + counts.py);
ok(counts.sh === 23, 'build-apk.sh 白名单 23 项', '实际 ' + counts.sh);
ok(counts.ps === 23, 'build-apk.ps1 白名单 23 项', '实际 ' + counts.ps);
ok(counts.py === counts.sh && counts.sh === counts.ps, '三份白名单项数一致');

// ---------------- 2. 递归复制 ----------------
section('5.2 assets 递归复制（子目录不能被静默跳过）');
ok(/cp\s+-[a-z]*r[a-z]*\s/.test(sh) && /cp\s+-r/.test(sh), 'build-apk.sh 使用 cp -r 递归复制 assets');
{
  // 定位复制 assets 的那一句，确认带 -r 且目标是 $STAGE/assets
  const m = sh.match(/cp\s+(-\S+)\s+"\$ROOT"\/?assets\/\.?\s+"\$STAGE\/assets\/?"/);
  ok(!!m, 'build-apk.sh assets 复制语句已定位', m ? m[0] : '未匹配');
  ok(!!m && /r/.test(m[1]), 'build-apk.sh assets 复制参数含 -r', m ? m[1] : 'n/a');
}
{
  // 只看真正会执行的代码行（# 注释里描述了旧版 cp -f assets/* 的 bug，不能拿来当证据）
  const code = sh.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  const bad = code.split('\n').filter(l => /cp\s/.test(l) && /assets/.test(l) && !/cp\s+-\S*r/.test(l));
  ok(bad.length === 0, 'build-apk.sh 无「不带 -r 的 assets 复制」残留', bad.join(' | '));
  const anyAssetsCp = code.split('\n').filter(l => /cp\s+-\S*r\S*\s/.test(l) && /assets/.test(l));
  ok(anyAssetsCp.length >= 1, 'build-apk.sh 存在带 -r 的 assets 复制语句',
     anyAssetsCp.join(' | '));
}
ok(/Copy-Item[\s\S]{0,120}-Recurse/.test(ps), 'build-apk.ps1 用 Copy-Item -Recurse');
ok(/shutil\.copytree/.test(py), 'build_apk.py 用 shutil.copytree（递归）');
ok(/dirs_exist_ok\s*=\s*True/.test(py), 'build_apk.py copytree 允许目录已存在（幂等）');

// ---------------- 3. 失败必须中止 ----------------
section('5.3 断言失败确实中止（不是 || true 吞掉）');
ok(/raise\s+SystemExit\(/.test(py), 'build_apk.py 用 raise SystemExit 中止');
ok(/exit\s+1/.test(sh), 'build-apk.sh 用 exit 1 中止');
ok(/throw\s+"/.test(ps), 'build-apk.ps1 用 throw 中止');
// 不能有 || true / ||: 之类的吞错写法出现在白名单校验附近
for (const s of SCRIPTS) {
  const around = s.src.split('\n').filter(l => /REQUIRED_ASSETS|MISSING|missingAssets|白名单/.test(l)).join('\n');
  ok(!/\|\|\s*(true|:)/.test(around), s.name + ' 白名单校验处无 || true 吞错');
  ok(!/2>\s*\/dev\/null/.test(around), s.name + ' 白名单校验处无 2>/dev/null 吞错');
}
// 全局开关
ok(/set\s+-e/.test(sh), 'build-apk.sh 设了 set -e');
ok(/\$ErrorActionPreference\s*=\s*["']Stop["']/.test(ps), 'build-apk.ps1 设了 $ErrorActionPreference=Stop');

// 中止后不能继续生成 APK：exit/throw 之后不应再出现 cp 回 FINAL_APK
{
  const idx = sh.indexOf('exit 1');
  const after = sh.slice(idx, idx + 400);
  ok(idx > 0, 'build-apk.sh 存在 exit 1 分支');
  ok(!/FINAL_APK/.test(after), 'build-apk.sh 白名单失败后不继续产出 APK');
}

// ---------------- 4. 白名单文件真实存在 ----------------
section('5.4 白名单 23 项在 assets/ 中真实存在');
const shList = (sh.match(/REQUIRED_ASSETS="([\s\S]*?)"/)[1]).split('\n').map(x => x.trim()).filter(Boolean);
for (const a of shList) {
  const p = path.join(R, 'assets', a.replace(/\//g, path.sep));
  ok(fs.existsSync(p), '白名单资源存在: ' + a);
}
// emoji 子目录确实被打包（递归复制的目标）
ok(fs.existsSync(path.join(R, 'assets/emoji')), 'assets/emoji 子目录存在（递归复制才有意义）');
{
  const files = fs.readdirSync(path.join(R, 'assets/emoji'));
  console.log('   assets/emoji 内容: ' + files.join(', '));
  ok(files.length > 0, 'assets/emoji 非空');
}

// ---------------- 5. 独立交叉校验：页面真实引用 vs 白名单 ----------------
section('5.5 交叉校验 · 页面引用的 assets 是否都被白名单覆盖');
const EXCL = (b) => b === 'settings.html' || /^settings_.*\.html$/.test(b) ||
                    /^profile.*\.html$/.test(b) || b === '设置_旧版.html';
const formal = fs.readdirSync(R).filter(f => /\.html?$/i.test(f) && !EXCL(f));
const referenced = new Map();
for (const f of formal) {
  const s = fs.readFileSync(path.join(R, f), 'utf8');
  let m; const re = /(?:src|href)\s*=\s*["']([^"']*assets\/([^"'?]+))(?:\?v=[^"']*)?["']/gi;
  while ((m = re.exec(s))) {
    if (!referenced.has(m[2])) referenced.set(m[2], new Set());
    referenced.get(m[2]).add(f);
  }
}
const whitelist = new Set(shList);
// api.js 会被打包脚本主动剔除（离线 APK 不需要），不计入
const uncovered = [...referenced.keys()].filter(a => a !== 'api.js' && !whitelist.has(a));
console.log('   页面引用 assets 种类: ' + referenced.size + '（其中 api.js 被脚本主动剔除）');
console.log('   未被白名单覆盖: ' + (uncovered.length ? uncovered.join(', ') : '（无）'));
for (const u of uncovered) console.log('      引用者: ' + [...referenced.get(u)].join(', '));
ok(uncovered.length === 0, '所有被引用的 assets 均在白名单中', uncovered.join(', '));

// 反向：白名单里有没有多余项（信息）
const extra = shList.filter(a => !referenced.has(a) && a !== 'emoji/manifest.js');
console.log('   白名单中未被任何页面直接引用（可能由 JS 动态加载）: ' + (extra.length ? extra.join(', ') : '（无）'));

// ---------------- 6. 打包脚本是否会误伤 icon-map 注入 ----------------
section('5.6 打包脚本的 api.js 剔除不会误删 icon-map.js');
for (const s of SCRIPTS) {
  // 剔除规则应只匹配 api.js
  const rules = s.src.match(/[^\n]*api\\?\.js[^\n]*/g) || [];
  const bad = rules.filter(r => /icon-map|subpage-router/.test(r));
  ok(bad.length === 0, s.name + ' 的 api.js 剔除规则不含 icon-map/subpage-router', bad.join(' | '));
}
// 剔除用的是整行 sed/regex，不会误伤同行的 icon-map
// sed 里斜杠被转义成 assets\/api\.js，正则要容忍反斜杠
ok(/<script\s+src="assets\\?\/api\\?\.js/.test(sh), 'build-apk.sh 剔除规则精确定位 api.js 的 script 标签');
ok(/<script src="assets\/api\\?\.js/.test(py), 'build_apk.py 剔除规则精确定位 api.js');
ok(/<script src="assets\/api\\?\.js/.test(ps), 'build-apk.ps1 剔除规则精确定位 api.js');

console.log('\n=== §5 汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' ===');
if (failures.length) {
  console.log('\n--- 失败明细 ---');
  failures.forEach((f, i) => console.log((i + 1) + '. ' + f.name + (f.detail ? '\n     ' + f.detail : '')));
}
process.exit(FAIL ? 1 : 0);
