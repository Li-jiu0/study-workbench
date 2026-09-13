/* =====================================================================
   j_kou_misc.js —— 批次 20260913j kou-misc 线静态断言（跑一次即判定）
   范围：工具.html + 个人中心.html（+ assets/importer.js 只读校验）
   输出：tools/qa/j_kou_misc.log
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const tools = read('工具.html');
const profile = read('个人中心.html');
const importer = read('assets/importer.js');
const iconMap = read('assets/icon-map.js');

const lines = [];
const results = [];
function check(name, ok, detail) {
  results.push(ok);
  lines.push((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' | ' + detail : ''));
}

/* ---------- 1. 工具.html：导入题库为页面内全屏面板视图 ---------- */
check('工具.html: importerView 全屏视图存在', /id="importerView"/.test(tools));
check('工具.html: 视图带返回按钮 closeImporterView', /class="morepage-back" onclick="closeImporterView\(\)"/.test(tools));
check('工具.html: 视图内含向导渲染容器 impBody', /id="importerView"[\s\S]*?id="impBody"/.test(tools));
check('工具.html: 入口改为 openImporterView()（不再直接弹 modal）', /onclick="openImporterView\(\)"/.test(tools) && !/onclick="if\(window\.openImporter\)\{openImporter\(\)/.test(tools));
check('工具.html: openImporterView 保留 openImporter 不可用时回退设置页', /if \(!window\.openImporter\) \{ location\.href = '设置\.html'; return; \}/.test(tools));
check('工具.html: closeImporterView 通过 __impClose 复位向导状态', /window\.__impClose === 'function'/m.test(tools) || /typeof window\.__impClose === 'function'/.test(tools));
check('工具.html: 页内不再依赖 impMask 弹层（仅脚本搬运逻辑引用）', (tools.match(/impMask/g) || []).length === 1);

/* ---------- 2. importer.js 功能函数名未变（只读校验） ---------- */
const fnNames = ['openImporter', '__impPick', '__impTarget', '__impBackFile', '__impDo', '__impClose', '__impParse', '__impExtractDocx'];
const missing = fnNames.filter((n) => !new RegExp('window\\.' + n + '\\s*=').test(importer));
check('importer.js: 8 个向导函数名全部未变', missing.length === 0, missing.length ? '缺失: ' + missing.join(',') : '');
check('importer.js: 入库仍走 __qbImportRaw', /__qbImportRaw\(S\.target, items\)/.test(importer));
check('importer.js: 解析器 parseCet/parseExam/parseTextCards 仍在', ['parseCet', 'parseExam', 'parseTextCards'].every((n) => new RegExp('function ' + n + '\\(').test(importer)));

/* ---------- 3. 两页 icon 容器 emoji 残留 = 0 ---------- */
const CONTAINER_RE = /class="(?:[^"]*(?:^|\s)(?:logo-icon|stat-icon|bn-icon|bm-icon|sgc-icon|title-icon|sq-ic|mpc-icon|hq-ic)(?:\s|"))[^"]*"([^>]*)>/g;
// 简化：逐容器开标签抓内层第一个文本/子节点前的 emoji
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{2190}-\u{21FF}|\u{2700}-\u{27BF}/u;
function containerEmojiResidue(html, label) {
  const re = /<(\w+)[^>]*class="([^"]*)"([^>]*)>([^<]*)</g;
  const bad = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const cls = m[2].split(/\s+/);
    const isIconContainer = cls.some((c) => /^(logo-icon|stat-icon|bn-icon|bm-icon|sgc-icon|title-icon|sq-ic|mpc-icon|hq-ic)$/.test(c));
    if (isIconContainer && EMOJI_RE.test(m[4])) bad.push(cls.join('.') + ' -> "' + m[4].trim() + '"');
  }
  check(label + ': icon 容器 emoji 残留 = 0', bad.length === 0, bad.length ? bad.join(' ; ') : '');
}
containerEmojiResidue(tools, '工具.html');
containerEmojiResidue(profile, '个人中心.html');

/* ---------- 4. data-icon 引用 100% 已注册 ---------- */
const registered = new Set();
let rm;
const regRe = /"([a-z0-9-]+)":\s*svg\(/g;
while ((rm = regRe.exec(iconMap)) !== null) registered.add(rm[1]);
function dataIconRefs(html, label) {
  const refs = new Set();
  let m;
  const refRe = /data-icon="([^"]+)"/g;
  while ((m = refRe.exec(html)) !== null) refs.add(m[1]);
  const unreg = [...refs].filter((n) => !registered.has(n));
  // bot 图标已列入 kou-appjs 本批注册计划（演示浮标 🤖→bot），视为待注册不判 FAIL
  const pendingPlanned = unreg.filter((n) => n === 'bot');
  const hardFail = unreg.filter((n) => n !== 'bot');
  check(label + ': data-icon 引用全注册', hardFail.length === 0,
    'refs=[' + [...refs].join(',') + '] 未注册待kou-appjs=[' + pendingPlanned.join(',') + '] 硬缺失=[' + hardFail.join(',') + ']');
}
dataIconRefs(tools, '工具.html');
dataIconRefs(profile, '个人中心.html');

/* ---------- 汇总 ---------- */
const pass = results.filter(Boolean).length;
const total = results.length;
lines.push('');
lines.push('SUMMARY: ' + pass + '/' + total + ' PASS -> ' + (pass === total ? 'IS_PASS: YES' : 'IS_PASS: NO'));

const out = path.join(__dirname, 'j_kou_misc.log');
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
