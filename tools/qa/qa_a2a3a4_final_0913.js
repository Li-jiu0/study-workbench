/* =====================================================================
 * qa_a2a3a4_final_0913.js —— QA(Edward) 验收三连终验
 *   A2 需求15：数据按账号隔离（lsKey 前缀 + 启动迁移 + 运行时写点）
 *   A3 需求18：计数器同步（行测答题即时 streak/正确率 + 双口径一致性）
 *   A4 需求09：个人中心路由语义匹配（入口→目标逐项核对 + T06 空壳回归）
 * 运行：node tools/qa/qa_a2a3a4_final_0913.js
 * 只读校验器（自身不改源码）。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'tools', 'verifier', 'node_modules', 'jsdom'));

let PASS = 0, FAIL = 0;
const failures = [];
function ok(c, name, detail) {
  if (c) { PASS++; console.log('  [PASS] ' + name); }
  else { FAIL++; failures.push({ name, detail: detail || '' }); console.log('  [FAIL] ' + name + (detail ? '  << ' + String(detail).slice(0, 220) : '')); }
}
function section(t) { console.log('\n===== ' + t + ' ====='); }

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

/* ---------- jsdom 公共件 ---------- */
function shim(w) {
  const noop = function () {};
  if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = noop;
  if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = noop;
  if (!w.HTMLElement.prototype.scrollIntoView) w.HTMLElement.prototype.scrollIntoView = noop;
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop });
  if (!w.fetch) w.fetch = () => Promise.reject(new Error('offline'));
  if (!w.requestAnimationFrame) w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  // localStorage 保证可用（含 file:// 场景兜底）
  let avail = false;
  try { void w.localStorage; avail = true; } catch (e) { avail = false; }
  if (!avail) {
    const store = new Map();
    const fake = {
      getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
      setItem: (k, v) => { store.set(String(k), String(v)); },
      removeItem: k => { store.delete(String(k)); },
      clear: () => store.clear(),
      key: i => Array.from(store.keys())[i] || null,
      get length() { return store.size; }
    };
    try { Object.defineProperty(w, 'localStorage', { value: fake, configurable: true, writable: true }); } catch (e) {}
  }
}
function seedAuth(w, account) {
  try { w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: account, loginAt: Date.now() })); } catch (e) {}
}
function extractScripts(html) {
  const ext = [], inline = [];
  const reExt = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = reExt.exec(html))) ext.push(m[1].split('?')[0]);
  const reIn = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = reIn.exec(html))) inline.push(m[1]);
  return { ext, inline };
}

/* =====================================================================
 * A2 —— 需求15：数据按账号隔离
 * ===================================================================== */
async function runA2() {
  section('A2 需求15：数据按账号隔离（账号 qa_user）');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
  const seedStats = JSON.stringify({
    version: 1,
    modules: { cet4: { total: 3, days: { '2026-09-13': { minutes: 10, events: 3 } } } },
    lastActiveDay: '2026-09-13', streak: 1, syncAt: 0
  });
  const seedTool = JSON.stringify({ count: 5, lastTs: 111 });

  const dom = new JSDOM(html, {
    url: 'https://example.test/qa-a2',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(w) {
      shim(w);
      seedAuth(w, 'qa_user');
      w.localStorage.setItem('study_workbench_stats', seedStats);          // 裸键（待迁移）
      w.localStorage.setItem('study_workbench_tool_wrongbook', seedTool);  // 裸前缀类键（待迁移）
    }
  });
  const w = dom.window;
  const ctx = dom.getInternalVMContext();
  const L = (k) => w.localStorage.getItem(k);
  const Lhas = (k) => w.localStorage.getItem(k) != null;
  const scriptErrs = [];
  const run = (rel, code) => {
    try { vm.runInContext(code || read(rel), ctx, { filename: rel }); }
    catch (e) { scriptErrs.push(rel + ': ' + e.message); }
  };

  // 1) 加载 app.js（CURRENT_ACCOUNT + 启动迁移）
  run('assets/app.js');
  ok(scriptErrs.length === 0, 'A2-0 app.js 在 jsdom 中零脚本异常', scriptErrs.join(' | '));
  ok(w.CURRENT_ACCOUNT === 'qa_user', 'A2-1 window.CURRENT_ACCOUNT === "qa_user"', 'got: ' + w.CURRENT_ACCOUNT);
  ok(L('study_workbench_stats@qa_user') === seedStats, 'A2-2a 启动迁移：裸键 study_workbench_stats 数据出现在 study_workbench_stats@qa_user');
  ok(!Lhas('study_workbench_stats'), 'A2-2b 启动迁移：裸键 study_workbench_stats 已删除');
  ok(L('study_workbench_tool_wrongbook@qa_user') === seedTool, 'A2-2c 启动迁移：裸键 study_workbench_tool_wrongbook 复制到前缀键');
  ok(!Lhas('study_workbench_tool_wrongbook'), 'A2-2d 启动迁移：裸键 study_workbench_tool_wrongbook 已删除');

  // 2) 加载 study-stats.js，markToolUse('wrongbook')
  run('assets/study-stats.js');
  let toolDetail = null;
  try { vm.runInContext('StudyStats.markToolUse("wrongbook")', ctx); } catch (e) { scriptErrs.push('markToolUse: ' + e.message); }
  ok(scriptErrs.length === 0, 'A2-3a markToolUse 执行无异常', scriptErrs.join(' | '));
  try { toolDetail = JSON.parse(L('study_workbench_tool_wrongbook@qa_user') || 'null'); } catch (e) { toolDetail = null; }
  ok(toolDetail && toolDetail.count === 6, 'A2-3b markToolUse 写前缀键 study_workbench_tool_wrongbook@qa_user（count 5→6）',
    'got: ' + L('study_workbench_tool_wrongbook@qa_user'));
  ok(!Lhas('study_workbench_tool_wrongbook'), 'A2-3c 裸键 study_workbench_tool_wrongbook 不存在');
  ok(Lhas('study_workbench_stats@qa_user'), 'A2-3d track 落盘写前缀键 study_workbench_stats@qa_user');
  let statsNow = null;
  try { statsNow = JSON.parse(L('study_workbench_stats@qa_user') || 'null'); } catch (e) { statsNow = null; }
  ok(statsNow && statsNow.modules && statsNow.modules.tools && statsNow.modules.tools.total >= 1,
    'A2-3e 前缀 stats 键内 tools 模块计数 >= 1', JSON.stringify(statsNow).slice(0, 160));
  ok(Lhas('study_workbench_stats_queue@qa_user'), 'A2-3f 上报队列写前缀键 study_workbench_stats_queue@qa_user');
  ok(!Lhas('study_workbench_stats_queue'), 'A2-3g 裸键 study_workbench_stats_queue 不存在');

  // 3) syncAiFromServer：mock api() 返回固定历史，断言写前缀键
  run('assets/api.js');
  vm.runInContext('aiChatHistory = [];', ctx);
  vm.runInContext('window.api = function () { return Promise.resolve({ items: [{ role: "user", content: "QA固定历史" }] }); };', ctx);
  vm.runInContext('window.renderAiMessages = function () {};', ctx);
  try { await vm.runInContext('syncAiFromServer()', ctx); } catch (e) { scriptErrs.push('syncAiFromServer: ' + e.message); }
  await new Promise(r => setTimeout(r, 120));
  ok(scriptErrs.length === 0, 'A2-4a syncAiFromServer 执行无异常', scriptErrs.join(' | '));
  let aiChat = null;
  try { aiChat = JSON.parse(L('study_workbench_ai_chat@qa_user') || 'null'); } catch (e) { aiChat = null; }
  ok(Array.isArray(aiChat) && aiChat.length === 1 && aiChat[0].text === 'QA固定历史',
    'A2-4b syncAiFromServer 写前缀键 study_workbench_ai_chat@qa_user（内容=mock历史）', 'got: ' + L('study_workbench_ai_chat@qa_user'));
  ok(!Lhas('study_workbench_ai_chat'), 'A2-4c 裸键 study_workbench_ai_chat 不存在');

  dom.window.close();
}

/* =====================================================================
 * A3 —— 需求18：计数器同步（行测刷题答题即时性 + 口径一致性）
 * ===================================================================== */
async function runA3() {
  section('A3 需求18：计数器同步（行测刷题.html 运行时）');

  /* --- 静态断言：两处口径键名一致（均经 lsKey 账号前缀） --- */
  const appSrc = read('assets/app.js');
  const statsSrc = read('assets/study-stats.js');
  ok(/STREAK_KEY\s*=\s*lsKey\('study_workbench_streak'\)/.test(appSrc),
    'A3-S1 静态：app.js STREAK_KEY = lsKey("study_workbench_streak")（首页/顶栏/模块页同一前缀键）');
  ok(!/['"]study_workbench_streak['"]/.test(appSrc.replace(/lsKey\('study_workbench_streak'\)/g, '')),
    'A3-S2 静态：app.js 中 study_workbench_streak 无裸键残留写点');
  ok(/STORE_KEY\s*=\s*LK\('study_workbench_stats'\)/.test(statsSrc) && /LK\('study_workbench_tool_' \+ tool\)/.test(statsSrc),
    'A3-S3 静态：study-stats.js stats/tool 键均经 LK(lsKey) 前缀（首页 getSummary 与模块页统计卡同键）');

  /* --- 动态断言 --- */
  const file = '行测刷题.html';
  const html = read(file);
  const { ext, inline } = extractScripts(html);
  const dom = new JSDOM(html, {
    url: 'https://example.test/' + encodeURIComponent(file),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(w) { shim(w); seedAuth(w, 'qa_user'); }
  });
  const w = dom.window;
  const ctx = dom.getInternalVMContext();
  const L = (k) => w.localStorage.getItem(k);
  const Lhas = (k) => w.localStorage.getItem(k) != null;
  const errs = [];
  const run = (rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { errs.push('缺失脚本: ' + rel); return; }
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); }
    catch (e) { errs.push(rel + ': ' + e.message); }
  };
  ext.forEach(run);
  inline.forEach((code, i) => {
    try { vm.runInContext(code, ctx, { filename: file + '#inline' + (i + 1) }); }
    catch (e) { errs.push('inline#' + (i + 1) + ': ' + e.message); }
  });
  ok(errs.length === 0, 'A3-0 行测刷题.html 全部脚本零异常加载', errs.join(' | '));

  // 答对当前题（同步驱动，模拟「答对 1 题」；同刻断言 = 不等刷新页面）
  const q = vm.runInContext('examFilteredBank[examCurrentIndex]', ctx);
  ok(!!q, 'A3-1 题库可用（examFilteredBank 非空）', 'q=' + JSON.stringify(q).slice(0, 80));
  if (q) {
    vm.runInContext('answerExamQuestion(' + q.a + ')', ctx); // 传正确答案 → 必答对
    // ① streak 前缀键即时更新（answerExamQuestion 同步返回后立刻读）
    let streak = null;
    try { streak = JSON.parse(L('study_workbench_streak@qa_user') || 'null'); } catch (e) { streak = null; }
    const tk = (function () { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
    ok(streak && typeof streak.count === 'number' && streak.count >= 1 && streak.lastDay === tk,
      'A3-2 答对 1 题后 streak 前缀键 study_workbench_streak@qa_user 即时更新（count>=1，lastDay=今天）',
      'got: ' + L('study_workbench_streak@qa_user') + ' today=' + tk);
    ok(!Lhas('study_workbench_streak'), 'A3-3 裸键 study_workbench_streak 不存在');
    // ② 正确率 100%（做对1/已做1）
    const accEl = w.document.getElementById('ecAccuracy');
    ok(!!accEl && accEl.textContent === '正确率 100%',
      'A3-4 正确率显示 100%（做对1/已做1）', 'got: ' + (accEl ? accEl.textContent : '元素不存在'));
    // ③ 已答 1 题且正确（DOM 即时刷新由同步调用链保证：answerExamQuestion→updateExamAccuracy 同 tick）
    const st = vm.runInContext('JSON.stringify({ n: Object.keys(examAnswered).length, c: appData.stats.correctQuestions, t: appData.stats.totalQuestions })', ctx);
    ok(st === '{"n":1,"c":1,"t":1}', 'A3-5 答题状态即时落账（已答1/对1/总1）', 'got: ' + st);
    ok(!!L('study_workbench_data@qa_user'), 'A3-6 appData 落盘走前缀键 study_workbench_data@qa_user');

    // 一致性：首页 getConvergedStreak() 与模块页 study-stats 卡同前缀键、值相等
    run('assets/study-stats.js'); // 首页/模块页共用的统计底座
    vm.runInContext('StudyStats.track("xingce", "finish", { minutes: 5 })', ctx); // 模块页统计卡写路径
    const conv = vm.runInContext('getConvergedStreak()', ctx);
    const sget = vm.runInContext('window.Streak.get()', ctx);
    const summ = vm.runInContext('JSON.stringify(window.StudyStats.getSummary())', ctx);
    let sStreak = null;
    try { sStreak = JSON.parse(summ).streak; } catch (e) { sStreak = null; }
    ok(conv === sget && sget === 1, 'A3-7 首页 getConvergedStreak() === Streak.get() === 1（单一前缀键口径）',
      'conv=' + conv + ' streakGet=' + sget);
    ok(sStreak === sget, 'A3-8 模块页 study-stats 卡口径（getSummary().streak）与全局 streak 相等（' + sStreak + '===' + sget + '）');
  }
  dom.window.close();
}

/* =====================================================================
 * A4 —— 需求09：个人中心路由语义匹配
 * ===================================================================== */
async function runA4() {
  section('A4 需求09：个人中心.html 路由语义匹配');

  const src = read('个人中心.html');
  const appSrc = read('assets/app.js');
  const apiSrc = read('assets/api.js');

  /* --- 静态：第一层分组卡 onclick ↔ 标题语义配对 --- */
  const cardRe = /class="subpage-group-card" onclick="SubpageRouter\.navigate\('([a-z-]+)'\)"[\s\S]{0,300}?sgc-title">([^<]+)<\/div>/g;
  const pairs = [];
  let m;
  while ((m = cardRe.exec(src))) pairs.push({ key: m[1], title: m[2] });
  const expectPairs = [
    { key: 'profile', title: '个人资料' },
    { key: 'posts', title: '发贴统计' },
    { key: 'moments', title: '我的动态' },
    { key: 'prefs', title: '学习偏好' },
    { key: 'local-data', title: '本机数据' }
  ];
  ok(pairs.length === expectPairs.length, 'A4-S1 分组卡数量 = 5', 'got: ' + JSON.stringify(pairs));
  expectPairs.forEach(ep => {
    const hit = pairs.find(p => p.title === ep.title);
    ok(hit && hit.key === ep.key, 'A4-S2 「' + ep.title + '」→ navigate("' + ep.key + '") 语义匹配',
      hit ? 'got key: ' + hit.key : 'card not found');
  });
  ok(!!pairs.find(p => p.title === '发贴统计' && p.key === 'posts') && !/navigate\('profile'\)[\s\S]{0,300}发贴统计/.test(src),
    'A4-S3 重点：「发贴统计」入口不指向「个人资料」');

  /* --- 静态：底部导航 / 更多面板 / 工具面板 / 卡片动作 --- */
  const staticChecks = [
    ['更多面板-学习统计', /bm-label">学习统计[\s\S]{0,80}/, () => src.includes('onclick="openBlogStats()"') && appSrc.includes("location.href = '学习博客.html#stats'") && exists('学习博客.html')],
    ['更多面板-互动广场', null, () => src.includes('onclick="gotoBlogMine()"') && apiSrc.includes("location.href = '学习博客.html#mine'") && exists('学习博客.html')],
    ['更多面板-错题本', null, () => src.includes("navigateTo('wrong-book')") && appSrc.includes("'wrong-book': '错题本.html'") && exists('错题本.html')],
    ['更多面板-设置', null, () => src.includes("navigateTo('settings')") && appSrc.includes("settings: '设置.html'") && exists('设置.html')],
    ['底部导航-工具', null, () => /bottom-nav-item" onclick="location\.href='工具\.html'"/.test(src) && exists('工具.html')],
    ['底部导航-更多', null, () => /bottom-nav-item" onclick="location\.href='更多\.html'"/.test(src) && exists('更多.html')],
    ['底部导航-我的', null, () => src.includes('onclick="openBlogProfile()"') && appSrc.includes("location.href = '个人中心.html'")],
    ['我的动态-去发布', null, () => src.includes("location.href='动态.html'") && exists('动态.html')],
    ['学习偏好-去调整', null, () => src.includes("location.href='设置.html'") && exists('设置.html')],
    ['工具面板-AI面试', null, () => src.includes("location.href='AI模拟面试.html'") && exists('AI模拟面试.html')],
    ['工具面板-PPT版式', null, () => src.includes("location.href='PPT版式库.html'") && exists('PPT版式库.html')],
    ['工具面板-四级经验', null, () => src.includes("location.href='四级经验分享.html'") && exists('四级经验分享.html')],
    ['工具面板-穿越英语（guard 兜底）', null, () => /onclick="if\(window\.openQuest\)\{openQuest\(\)\}else\{location\.href='工具\.html'\};toggleToolsPanel\(\)"/.test(src)],
    ['退出登录-confirmLogout', null, () => src.includes('onclick="confirmLogout()"')],
    ['数据导出-exportAllNotesMd', null, () => /导出全部 Markdown/.test(apiSrc) && /function exportAllNotesMd/.test(apiSrc)]
  ];
  staticChecks.forEach(([name, , fn]) => ok(!!fn(), 'A4-S4 ' + name));

  /* --- 动态：jsdom 真加载，点击断言路由 --- */
  const fileUrl = 'file:///' + encodeURI(path.join(ROOT, '个人中心.html').replace(/\\/g, '/'));
  const errs = [];
  const navNotices = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const msg = String((e && e.message) || e);
    if (/Could not load|Could not parse CSS|Not implemented: navigation/.test(msg)) {
      if (/Not implemented: navigation/.test(msg)) navNotices.push(msg);
      return; // 资源/导航噪声单独记录
    }
    errs.push('jsdomError: ' + msg);
  });
  vc.on('error', (...a) => errs.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));

  const dom = new JSDOM(src, {
    url: fileUrl,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) { shim(w); seedAuth(w, 'qa_user'); }
  });
  const w = dom.window;
  w.confirm = () => true;
  await new Promise(res => {
    if (w.document.readyState === 'complete') return res();
    w.addEventListener('load', () => res());
    setTimeout(res, 9000);
  });
  await new Promise(r => setTimeout(r, 800));
  const d = w.document;
  const vis = key => {
    const s = d.querySelector('#page-profile [data-subpage="' + key + '"]');
    return s && s.style.display !== 'none';
  };

  ok(errs.length === 0, 'A4-D1 个人中心.html 真加载零关键异常', errs.join(' | '));

  // 点击「发贴统计」分组卡 → hash #posts，posts 区显示，profile 区隐藏
  const postsCard = Array.from(d.querySelectorAll('.subpage-group-card'))
    .find(c => (c.querySelector('.sgc-title') || {}).textContent === '发贴统计');
  ok(!!postsCard, 'A4-D2 「发贴统计」分组卡存在');
  if (postsCard) {
    try { postsCard.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); } catch (e) { errs.push('click posts: ' + e.message); }
    await new Promise(r => setTimeout(r, 120));
    ok(w.location.hash === '#posts', 'A4-D3 点击「发贴统计」→ location.hash === "#posts"', 'got: ' + w.location.hash);
    ok(vis('posts') && !vis('profile'), 'A4-D4 posts 区显示且 profile（个人资料）区隐藏', 'posts=' + vis('posts') + ' profile=' + vis('profile'));
  }

  // 学习偏好 / 本机数据：可进入且非 display:none 空壳（T06 修复保留）
  for (const key of ['prefs', 'local-data']) {
    w.SubpageRouter && w.SubpageRouter.navigate(key);
    await new Promise(r => setTimeout(r, 150)); // hashchange 异步
    const title = key === 'prefs' ? '学习偏好' : '本机数据';
    const sect = d.querySelector('#page-profile [data-subpage="' + key + '"]');
    const card = sect && sect.querySelector('.card');
    const shown = vis(key);
    const shellFree = !!card && card.style.display !== 'none' && (card.textContent || '').length > 0;
    ok(shown && shellFree, 'A4-D5 「' + title + '」section 可进入且卡片非 display:none 空壳（T06 保留）',
      'shown=' + shown + ' cardDisplay=' + (card && card.style.display));
  }
  w.SubpageRouter && w.SubpageRouter.navigate('profile');
  // 点击「穿越英语」（openQuest 未定义 → 守卫兜底跳 工具.html，不抛异常）
  const questItem = Array.from(d.querySelectorAll('#toolsPanel .bottom-more-item'))
    .find(c => (c.textContent || '').indexOf('穿越英语') >= 0);
  ok(!!questItem, 'A4-D6 「穿越英语」工具项存在');
  if (questItem) {
    const before = navNotices.length;
    let threw = null;
    try { questItem.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
    catch (e) { threw = e.message; }
    await new Promise(r => setTimeout(r, 120));
    ok(!threw, 'A4-D7 点击「穿越英语」无 JS 异常（openQuest 未加载时走兜底）', threw || '');
    ok(navNotices.length > before, 'A4-D8 兜底导航已触发（location.href → 工具.html，jsdom 记录 Not implemented: navigation）');
  }

  dom.window.close();
}

/* =====================================================================
 * 汇总
 * ===================================================================== */
(async function main() {
  console.log('=== QA 验收三连 A2/A3/A4（HEAD=8ef7f49 + QA 最小修复后） ===');
  try { await runA2(); } catch (e) { ok(false, 'A2 harness 异常', e.stack || e); }
  try { await runA3(); } catch (e) { ok(false, 'A3 harness 异常', e.stack || e); }
  try { await runA4(); } catch (e) { ok(false, 'A4 harness 异常', e.stack || e); }

  console.log('\n=== 汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' ===');
  if (failures.length) {
    console.log('\n--- 失败明细 ---');
    failures.forEach((x, i) => console.log((i + 1) + '. ' + x.name + (x.detail ? '\n     ' + x.detail : '')));
  }
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e && e.stack || e); process.exit(2); });
