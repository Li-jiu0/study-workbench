#!/usr/bin/env node
/* ============================================================================
 * qa_data_pipeline_0912e.js —— data/ 交付管线离线静态校验（2026-09-12e）
 * ----------------------------------------------------------------------------
 * 背景：真题模考三级独立页（mock_exam.html / mock_exam_run.html /
 *       mock_exam_result.html）依赖一级资源目录 data/mock-papers.js
 *       （window.MOCK_PAPERS_DATA）。data/ 曾未进任何交付脚本 → 部署后 404、
 *       APK 内缺失，且页面静默空题库（与 assets/emoji/ 漏拷同类事故）。
 *
 * 本脚本只做「静态解析 + 断言」，不联网、不上传、不打包、不改任何文件。
 * 覆盖 4 个交付脚本：
 *   tools/deploy_update_20260912a.py   （服务器部署：清单/打包/MD5/探针）
 *   android/build-apk.sh               （APK 打包 · Git Bash 版）
 *   android/build_apk.py               （APK 打包 · Python 版）
 *   android/build-apk.ps1              （APK 打包 · PowerShell 版）
 *
 * 断言两类：
 *   ① 正向：每处都必须含 data/ 处理 + mock-papers.js 必检项
 *   ② 回归：原有检查项（assets 递归复制、icon-map.js / subpage-router.js
 *          白名单、旧探针项、md5sum 条件拼接）不得被削弱
 *
 * 用法：
 *   node tools/qa/qa_data_pipeline_0912e.js
 *   QA_ROOT=<另一份工程根目录> node tools/qa/qa_data_pipeline_0912e.js
 *   QA_OUT=<报告落盘路径(utf8)> node tools/qa/qa_data_pipeline_0912e.js
 * 退出码：0 = 全部 PASS；1 = 有 FAIL
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.QA_ROOT || 'D:\\下载的文件\\学习工作台';
const REL_DEPLOY = 'tools/deploy_update_20260912a.py';
const REL_SH = 'android/build-apk.sh';
const REL_PY = 'android/build_apk.py';
const REL_PS1 = 'android/build-apk.ps1';
const REL_DATA = 'data/mock-papers.js';

const results = [];

/**
 * 读取文本文件，缺失返回 null。
 * @param {string} rel 相对 ROOT 的路径
 * @returns {string|null}
 */
function read(rel) {
  const p = path.join(ROOT, rel);
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * 正则断言。
 * @param {string} file 被检文件（相对路径）
 * @param {string} id 断言编号
 * @param {string} desc 语义描述
 * @param {RegExp} re 断言正则
 * @param {string|null} text 被检文本（null 表示文件缺失）
 */
function check(file, id, desc, re, text) {
  let ok = false;
  if (text !== null) {
    re.lastIndex = 0;
    ok = re.test(text);
  }
  results.push({ file: file, id: id, desc: desc, ok: ok });
}

/**
 * 布尔断言（用于跨文件一致性等无法用单条正则表达的检查）。
 * @param {string} file 被检文件
 * @param {string} id 断言编号
 * @param {string} desc 语义描述
 * @param {boolean} ok 断言结果
 */
function checkTrue(file, id, desc, ok) {
  results.push({ file: file, id: id, desc: desc, ok: !!ok });
}

// ---------------------------------------------------------------------------
// 0) 数据契约本体：data/mock-papers.js 必须存在且含真实数据标记
// ---------------------------------------------------------------------------
const dataJs = read(REL_DATA);
check(REL_DATA, 'DATA-01', 'data/mock-papers.js 存在', /^/, dataJs);
check(REL_DATA, 'DATA-02', '数据标记 window.MOCK_PAPERS_DATA 存在',
  /window\.MOCK_PAPERS_DATA\s*=/, dataJs);

// ---------------------------------------------------------------------------
// 1) 服务器部署脚本 tools/deploy_update_20260912a.py
// ---------------------------------------------------------------------------
const dep = read(REL_DEPLOY);
check(REL_DEPLOY, 'DEPLOY-01', '本地清单递归收集一级目录 data/',
  /data_dir\s*=\s*os\.path\.join\(ROOT,\s*'data'\)/, dep);
check(REL_DEPLOY, 'DEPLOY-02', 'data/ 必检项 DATA_MUST 含 mock-papers.js',
  /DATA_MUST\s*=\s*\([^)]*'mock-papers\.js'/, dep);
check(REL_DEPLOY, 'DEPLOY-03', 'data/ 缺失时本地硬失败 SystemExit',
  /for must in DATA_MUST:[\s\S]{0,300}?raise SystemExit/, dep);
check(REL_DEPLOY, 'DEPLOY-04', '打包进 tar（arcname web/data/）',
  /tar\.add\(os\.path\.join\(data_dir,[^\n]*arcname='web\/data\/'\s*\+\s*f\)/, dep);
check(REL_DEPLOY, 'DEPLOY-05', '纳入全量 MD5 校验清单 verify_rel',
  /verify_rel[\s\S]{0,400}?'web\/data\/'\s*\+\s*f/, dep);
check(REL_DEPLOY, 'DEPLOY-06', '探针：/data/mock-papers.js HTTP 码',
  /echo MOCKPAPERS:\$\(curl[^\n]*\/data\/mock-papers\.js/, dep);
check(REL_DEPLOY, 'DEPLOY-07', '探针：响应内容按数据标记 grep -c（MOCK_PAPERS_MARK 变量）',
  /echo MOCKPAPERS_MARK:\$\(curl[\s\S]{0,240}?grep -c '\{MOCK_PAPERS_MARK\}'/, dep);
check(REL_DEPLOY, 'DEPLOY-08', 'data/ 探针失败即硬失败（raise SystemExit）',
  /if fatal:[\s\S]{0,600}?raise SystemExit\(/, dep);
check(REL_DEPLOY, 'DEPLOY-09', '打印计数含 data 维度',
  /\+ data \{len\(data_files\)\}/, dep);

// 跨文件一致性：部署脚本里的数据标记常量必须与 data/mock-papers.js 里的真实标记同名
const markMatch = dep ? dep.match(/MOCK_PAPERS_MARK\s*=\s*"([^"]+)"/) : null;
const mark = markMatch ? markMatch[1] : null;
checkTrue(REL_DEPLOY, 'DEPLOY-10',
  '常量 MOCK_PAPERS_MARK 已定义（值=' + mark + '）', !!mark);
checkTrue(REL_DEPLOY, 'DEPLOY-11',
  '跨文件一致：MOCK_PAPERS_MARK 值确实出现在 data/mock-papers.js 中',
  !!mark && !!dataJs && dataJs.indexOf(mark) !== -1);

// 回归：既有行为不得削弱
check(REL_DEPLOY, 'DEPLOY-R01', '回归：server 段 md5sum 条件拼接（空列表不拼裸 md5sum）',
  /server_md5_cmd\s*=\s*\([\s\S]{0,200}?if SERVER_FILES else "true"/, dep);
check(REL_DEPLOY, 'DEPLOY-R02', '回归：SERVER_FILES 仍为空列表',
  /SERVER_FILES\s*=\s*\[\s*\]/, dep);
check(REL_DEPLOY, 'DEPLOY-R03', '回归：探针 ICONMAP', /echo ICONMAP:/, dep);
check(REL_DEPLOY, 'DEPLOY-R04', '回归：探针 SUBPAGEROUTER', /echo SUBPAGEROUTER:/, dep);
check(REL_DEPLOY, 'DEPLOY-R05', '回归：新资源 assets 可达性仍在（HTTP 码探针组）',
  /icon-map\.js\)[\s\S]{0,200}subpage-router\.js\)/, dep);
check(REL_DEPLOY, 'DEPLOY-R06', '回归：新令牌计数 20260912a',
  /HOME_VER2026:\$\(curl[^\n]*grep -c '20260912a'/, dep);
check(REL_DEPLOY, 'DEPLOY-R07', '回归：旧令牌计数 20260911i（须为 0）',
  /HOME_OLDVER:\$\(curl[^\n]*grep -c '20260911i'/, dep);
check(REL_DEPLOY, 'DEPLOY-R08', '回归：用户数基线 USERS 探针',
  /print\('USERS:'/, dep);
check(REL_DEPLOY, 'DEPLOY-R09', '回归：SERVICE / HEALTH 探针',
  /echo SERVICE:[\s\S]{0,400}echo HEALTH:/, dep);

// ---------------------------------------------------------------------------
// 2) APK 打包 · Git Bash 版 android/build-apk.sh
// ---------------------------------------------------------------------------
const sh = read(REL_SH);
check(REL_SH, 'SH-01', '阶段目录创建 $STAGE/data',
  /mkdir -p [^\n]*"\$STAGE\/data"/, sh);
check(REL_SH, 'SH-02', '递归复制 data/ 进 APK 资产（cp -rf，防漏子目录）',
  /cp -rf "\$ROOT"\/data\/\. "\$STAGE\/data\/"/, sh);
check(REL_SH, 'SH-03', '数据资源白名单 REQUIRED_DATA 含 mock-papers.js',
  /REQUIRED_DATA="\s*\n\s*mock-papers\.js\s*\n"/, sh);
check(REL_SH, 'SH-04', '白名单逐项检查 $STAGE/data/$a',
  /\[ -f "\$STAGE\/data\/\$a" \]/, sh);
check(REL_SH, 'SH-05', 'data/ 资源缺失即构建失败 exit 1',
  /if \[ -n "\$DATA_MISSING" \]; then[\s\S]{0,300}?exit 1/, sh);

// 回归
check(REL_SH, 'SH-R01', '回归：assets/ 递归复制 cp -rf',
  /cp -rf "\$ROOT"\/assets\/\. "\$STAGE\/assets\/"/, sh);
check(REL_SH, 'SH-R02', '回归：REQUIRED_ASSETS 含 icon-map.js',
  /REQUIRED_ASSETS="\s*\n\s*icon-map\.js/, sh);
check(REL_SH, 'SH-R03', '回归：REQUIRED_ASSETS 含 subpage-router.js',
  /REQUIRED_ASSETS="\s*\n\s*icon-map\.js\s*\n\s*subpage-router\.js/, sh);
check(REL_SH, 'SH-R04', '回归：REQUIRED_ASSETS 含 emoji/manifest.js',
  /emoji\/manifest\.js\s*\n"/, sh);

// ---------------------------------------------------------------------------
// 3) APK 打包 · Python 版 android/build_apk.py
// ---------------------------------------------------------------------------
const py = read(REL_PY);
check(REL_PY, 'PY-01', '数据资源白名单 REQUIRED_DATA_ASSETS 含 mock-papers.js',
  /REQUIRED_DATA_ASSETS\s*=\s*\[\s*\n\s*"mock-papers\.js",?\s*\n\]/, py);
check(REL_PY, 'PY-02', '源目录 data/ 缺失即构建失败',
  /_missing_data_src[\s\S]{0,240}?raise SystemExit\([^\n]*data\//, py);
check(REL_PY, 'PY-03', '递归复制 data/ 到 stage（copytree dirs_exist_ok）',
  /shutil\.copytree\(_data_dir,\s*os\.path\.join\(STAGE,\s*"data"\),\s*dirs_exist_ok=True\)/, py);
check(REL_PY, 'PY-04', '暂存区 stage/data 缺失即构建失败',
  /_missing_data_stage[\s\S]{0,240}?raise SystemExit\([^\n]*stage\/data\//, py);

// 回归
check(REL_PY, 'PY-R01', '回归：assets 递归复制（copytree 分支）',
  /if os\.path\.isdir\(src\):\s*\n\s*shutil\.copytree\(src, dst, dirs_exist_ok=True\)/, py);
check(REL_PY, 'PY-R02', '回归：REQUIRED_ASSETS 含 icon-map.js / subpage-router.js',
  /REQUIRED_ASSETS\s*=\s*\[[\s\S]{0,300}?"icon-map\.js"[\s\S]{0,120}?"subpage-router\.js"/, py);
check(REL_PY, 'PY-R03', '回归：REQUIRED_ASSETS 含 emoji/manifest.js',
  /"emoji\/manifest\.js"/, py);

// ---------------------------------------------------------------------------
// 4) APK 打包 · PowerShell 版 android/build-apk.ps1
// ---------------------------------------------------------------------------
const ps1 = read(REL_PS1);
check(REL_PS1, 'PS-01', '阶段目录创建 $STAGE\\data',
  /New-Item -ItemType Directory -Force -Path [^\n]*"\$STAGE\\data"/, ps1);
check(REL_PS1, 'PS-02', '递归复制 data/ 进 APK 资产（Copy-Item -Recurse）',
  /Copy-Item -Path "\$ROOT\\data\\\*" -Destination "\$STAGE\\data\\" -Recurse -Force/, ps1);
check(REL_PS1, 'PS-03', '数据资源白名单 $REQUIRED_DATA_ASSETS 含 mock-papers.js',
  /\$REQUIRED_DATA_ASSETS\s*=\s*@\(\s*\n\s*'mock-papers\.js'/, ps1);
check(REL_PS1, 'PS-04', '白名单逐项检查 $STAGE\\data',
  /foreach \(\$a in \$REQUIRED_DATA_ASSETS\)[\s\S]{0,240}?Join-Path "\$STAGE\\data"/, ps1);
check(REL_PS1, 'PS-05', 'data/ 资源缺失即构建失败 throw',
  /if \(\$missingDataAssets\.Count -gt 0\)[\s\S]{0,300}?throw /, ps1);

// 回归
check(REL_PS1, 'PS-R01', '回归：assets 递归复制 Copy-Item -Recurse',
  /Copy-Item -Path "\$ROOT\\assets\\\*" -Destination "\$STAGE\\assets\\" -Recurse -Force/, ps1);
check(REL_PS1, 'PS-R02', '回归：$REQUIRED_ASSETS 含 icon-map.js / subpage-router.js',
  /\$REQUIRED_ASSETS\s*=\s*@\([\s\S]{0,300}?'icon-map\.js'[\s\S]{0,120}?'subpage-router\.js'/, ps1);
check(REL_PS1, 'PS-R03', '回归：$REQUIRED_ASSETS 含 emoji/manifest.js',
  /'emoji\/manifest\.js'/, ps1);

// ---------------------------------------------------------------------------
// 输出（同时落盘 QA_OUT，避免控制台编码吞字）
// ---------------------------------------------------------------------------
const lines = [];
lines.push('=== data/ 交付管线静态校验 · qa_data_pipeline_0912e ===');
lines.push('ROOT: ' + ROOT);
lines.push('断言总数: ' + results.length + '（正向 data/ 处理 + 回归防削弱）');
lines.push('');

let curFile = null;
let pass = 0;
for (const r of results) {
  if (r.file !== curFile) {
    curFile = r.file;
    lines.push('--- ' + curFile + ' ---');
  }
  const tag = r.ok ? 'PASS' : 'FAIL';
  if (r.ok) {
    pass += 1;
  }
  lines.push('  [' + tag + '] ' + r.id + '  ' + r.desc);
}
const failed = results.length - pass;
lines.push('');
lines.push('----------------------------------------');
lines.push('RESULT: ' + (failed === 0 ? 'PASS' : 'FAIL') +
  '  (' + pass + '/' + results.length + ' passed, ' + failed + ' failed)');
if (failed > 0) {
  lines.push('失败项: ' + results.filter(function (r) { return !r.ok; })
    .map(function (r) { return r.id; }).join(', '));
}
const out = lines.join('\n');
console.log(out);
if (process.env.QA_OUT) {
  fs.writeFileSync(process.env.QA_OUT, out + '\n', 'utf8');
}
process.exitCode = failed === 0 ? 0 : 1;
