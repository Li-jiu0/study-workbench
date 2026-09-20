/* QA P1 四级词汇页词库数量显示修复验证（2026-09-13i）—— 真加载页面 + 模拟增量分片合并
 * 覆盖：
 *   ① 静态：四级词汇.html 文案统一「第 1 词 · 共 466 · 已学 0」，旧「第 1 / 200 词」清零
 *   ② 静态：app.js afterVocabMerge 派发 window 'vocab-merged'（detail.added）；renderVocab 使用统一模板
 *   ③ 动态：jsdom 真加载四级词汇页 → 模拟 mergeVocabWords + afterVocabMerge →
 *          'vocab-merged' 事件触发 1 次 → 页面监听重建 vocabModeList → vocabProgress 实时变为「共 469」
 *   ④ 动态：added=0 时不派发事件（防误刷）
 *   ⑤ 版本：页面无 v=20260913h 残留
 * 运行：node tools/qa/qa_p1_vocab_0913i.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

const FAILS = [];
function check(cond, msg) { if (!cond) FAILS.push(msg); }

function extractScripts(html) {
  const ext = [];
  const inline = [];
  const reExt = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = reExt.exec(html))) ext.push(m[1].split('?')[0]);
  const reIn = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = reIn.exec(html))) inline.push(m[1]);
  return { ext, inline };
}

async function loadVocabPage() {
  const html = fs.readFileSync(path.join(ROOT, '四级词汇.html'), 'utf8');
  const { ext, inline } = extractScripts(html);

  const issues = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (/Could not load|Not implemented|Could not parse CSS/.test(e.message)) return; // 资源/CSS 噪声
    issues.push('jsdomError: ' + e.message);
  });
  vc.on('error', (...a) => issues.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));

  const dom = new JSDOM(html, {
    url: 'https://example.test/' + encodeURIComponent('四级词汇.html'),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() }));
    },
  });
  const { window } = dom;
  const ctx = dom.getInternalVMContext();

  const uncaught = [];
  window.addEventListener('error', (e) => uncaught.push('window.error: ' + (e && e.message ? e.message : '?')));
  window.addEventListener('unhandledrejection', (e) => uncaught.push('unhandledrejection: ' + (e && e.reason ? e.reason : '?')));

  // 页面内测试探针：记录 vocab-merged 事件（在业务内联脚本之后追加，不影响业务监听）
  inline.push(
    'window.__qaMergedEvents = [];' +
    "window.addEventListener('vocab-merged', function (e) { window.__qaMergedEvents.push(e && e.detail ? e.detail.added : null); });"
  );

  const scriptErrors = [];
  for (const rel of ext) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { issues.push('缺失脚本: ' + rel); continue; }
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); }
    catch (e) { scriptErrors.push(rel + ': ' + e.message); }
  }
  inline.forEach((code, i) => {
    try { vm.runInContext(code, ctx, { filename: 'qa-inline#' + (i + 1) }); }
    catch (e) { scriptErrors.push('inline#' + (i + 1) + ': ' + e.message); }
  });

  try {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    window.dispatchEvent(new window.Event('load', { bubbles: true }));
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 600));

  return { html, issues, uncaught, scriptErrors, window, ctx };
}

(async () => {
  console.log('\n========= QA P1 四级词汇页词库数量显示修复验证（20260913i） =========');

  // ---------- ① 静态断言 ----------
  const htmlPath = path.join(ROOT, '四级词汇.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  check(html.includes('id="vocabProgress">第 1 词 · 共 466 · 已学 0<'),
    '静态: 页首标签未使用统一文案「第 1 词 · 共 466 · 已学 0」');
  check(!html.includes('第 1 / 200 词'), '静态: 旧文案「第 1 / 200 词」仍存在');
  check(/addEventListener\(\s*'vocab-merged'/.test(html), '静态: 四级词汇.html 未监听 vocab-merged 事件');
  check(!/v=20260913h/.test(html), '静态: 页面仍有 v=20260913h 残留');

  const appjs = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
  check(/dispatchEvent\(new CustomEvent\('vocab-merged'/.test(appjs),
    '静态: app.js afterVocabMerge 未派发 vocab-merged 事件');
  check(/第 \$\{vocabCurrentIndex \+ 1\} 词 · 共 \$\{CET_VOCAB\.length\} · 已学 \$\{appData\.vocabLearned\.length\}/.test(appjs),
    '静态: app.js renderVocab 未使用统一模板「第 x 词 · 共 N · 已学 M」');
  check(!appjs.includes('`第 ${vocabCurrentIndex + 1} / ${vocabModeList.length} 词`'),
    '静态: app.js renderVocab 旧文案「第 x / N 词」仍存在');

  // ---------- ③④ 动态断言（jsdom 真加载） ----------
  const r = await loadVocabPage();
  const doc = r.window.document;

  // 初始渲染：统一文案 + 内置 466 词
  const vp = doc.getElementById('vocabProgress');
  check(!!vp, '动态: #vocabProgress 缺失');
  if (vp) {
    check(vp.textContent === '第 1 词 · 共 466 · 已学 0',
      '动态: 初始文案异常 "' + vp.textContent + '" (期望 "第 1 词 · 共 466 · 已学 0")');
  }

  // 模拟增量分片合并：走真实代码路径 mergeVocabWords → afterVocabMerge
  try {
    vm.runInContext(
      'var __qaAdded = mergeVocabWords([' +
      '{ word: "qa-p1-alpha", phonetic: "/x/", meaning: "测试词条A" },' +
      '{ word: "abandon", phonetic: "/x/", meaning: "重复词不应计入" },' + // 已存在词条 → 去重不计入 added
      '{ word: "qa-p1-beta", phonetic: "/x/", meaning: "测试词条B" },' +
      '{ word: "qa-p1-gamma", phonetic: "/x/", meaning: "测试词条C" }' +
      ']); afterVocabMerge(__qaAdded);',
      r.ctx, { filename: 'qa-simulate-merge' });
  } catch (e) { FAILS.push('动态: 模拟合并抛异常 ' + e.message); }

  const events = r.window.__qaMergedEvents || [];
  check(events.length === 1, '动态: vocab-merged 应触发 1 次，实际 ' + events.length);
  check(events.length === 1 && events[0] === 3, '动态: detail.added 应为 3（重复词去重），实际 ' + (events[0] === undefined ? 'undefined' : events[0]));

  if (vp) {
    check(vp.textContent === '第 1 词 · 共 469 · 已学 0',
      '动态: 合并后文案未实时刷新 "' + vp.textContent + '" (期望 "第 1 词 · 共 469 · 已学 0")');
  }
  // 页面监听确实重建了词表：新词条进入当前模式列表（第 1 词即新词或列表已扩容均可，断言扩容后的渲染无异常即可）
  try {
    const len = vm.runInContext('vocabModeList.length', r.ctx, { filename: 'qa-read-list' });
    check(len === 469, '动态: 页面监听未重建 vocabModeList（长度 ' + len + '，期望 469）');
  } catch (e) { FAILS.push('动态: 读取 vocabModeList 失败 ' + e.message); }

  // added=0 → 不派发事件
  try { vm.runInContext('afterVocabMerge(0);', r.ctx, { filename: 'qa-simulate-zero' }); } catch (e) { FAILS.push('动态: afterVocabMerge(0) 抛异常 ' + e.message); }
  check((r.window.__qaMergedEvents || []).length === 1, '动态: added=0 时误派发了 vocab-merged 事件');

  // ---------- 汇总 ----------
  const hardIssues = r.issues.filter((x) => !/XT-BOUNDARY/.test(x));
  const pass = FAILS.length === 0 && r.scriptErrors.length === 0 && r.uncaught.length === 0 && hardIssues.length === 0;

  console.log('\n--- 四级词汇.html : ' + (pass ? 'PASS' : 'FAIL') + ' ---');
  console.log('  初始文案: ' + (vp ? vp.textContent : '(无 #vocabProgress)'));
  console.log('  vocab-merged 事件: ' + JSON.stringify(r.window.__qaMergedEvents || []));
  if (FAILS.length) console.log('  FAILS: ' + FAILS.join(' | '));
  if (r.scriptErrors.length) console.log('  scriptErrors: ' + r.scriptErrors.join(' | '));
  if (r.uncaught.length) console.log('  uncaught: ' + r.uncaught.join(' | '));
  if (hardIssues.length) console.log('  hardIssues: ' + hardIssues.join(' | '));

  console.log('\n========= P1 词库数量显示修复验证: ' + (pass ? 'ALL PASS' : 'FAIL') + ' =========');
  process.exit(pass ? 0 : 1);
})();
