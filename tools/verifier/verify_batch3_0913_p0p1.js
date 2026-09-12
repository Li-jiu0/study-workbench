/**
 * 批次三（0913）P0/P1 改动专项回归验证脚本
 * ------------------------------------------------------------------
 * 覆盖范围：
 *   P0-1 面试进度不再恒 0（computeModuleProgress / interviewProgressTarget / pct）
 *   P0-2 题库分片加载合并（exam-bank-ext-index.json + 7 分片，id<101 跳过、已存在跳过）
 *   P0-3 voiceplayer.js loadListeningExt（本轮未改码，仅静态确认未调用 saveData）
 *   P1-4 activityLog 环形 200 + formatRelTime + computeRecentLearning 三级回退
 *   P1-5 泄题清洗由 tools/qa/scan_question_leak.py 负责，本脚本不重复
 *   回归基线：零未捕获异常 / showToast / navigateTo / #countdownModal 结构
 *
 * 说明：tools/verifier/verify_batch3_0913.js 已存在（上一轮「全局一致性」断言），
 *       为避免覆盖既有资产，本脚本另起名 _p0p1。
 *
 * 用法：node tools/verifier/verify_batch3_0913_p0p1.js
 * 退出码：0=全部通过，1=存在失败断言
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// ROOT 由脚本自身位置推导，禁止硬编码绝对路径
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, '学习工作台.html');

// ---------- 结果收集 ----------
const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ---------- 1. 页面装配：把外链 <script src> 内联，执行顺序与真实页面一致 ----------
const rawHtml = fs.readFileSync(PAGE, 'utf8');
const SRC_RE = /<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const loadedScripts = [];
const html = rawHtml.replace(SRC_RE, function (m, src) {
  const rel = String(src).split('?')[0];
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return '<!-- 脚本缺失：' + rel + ' -->';
  const code = fs.readFileSync(fp, 'utf8');
  if (/<\/script/i.test(code)) {
    throw new Error('脚本内含 </script 字面量，无法安全内联：' + rel);
  }
  loadedScripts.push(rel);
  return '<script>\n' + code + '\n</script>';
});

// 追加探针脚本：作为普通脚本参与执行，可读取顶层 const/let 词法绑定
const PROBE = [
  '<script>',
  '(function () {',
  '  window.__qaSaveCalls = 0;',
  '  var __origSaveData = saveData;',
  '  saveData = function () { window.__qaSaveCalls++; return __origSaveData.apply(null, arguments); };',
  '  window.__QA = {',
  '    storageKey: function () { return STORAGE_KEY; },',
  '    appData: function () { return appData; },',
  '    setAppData: function (k, v) { appData[k] = v; },',
  '    iqLen: function () {',
  '      return (typeof INTERVIEW_QUESTIONS !== "undefined" && INTERVIEW_QUESTIONS) ? INTERVIEW_QUESTIONS.length : 0;',
  '    },',
  '    target: function () { return interviewProgressTarget(); },',
  '    pct: function (n, d) { return pct(n, d); },',
  '    cmp: function () { return computeModuleProgress(); },',
  '    cwp: function () { return computeWeakPoints(); },',
  '    crl: function () { return computeRecentLearning(); },',
  '    bank: function () { return EXAM_BANK; },',
  '    bankLen: function () { return EXAM_BANK.length; },',
  '    writeActivity: function (t, r, m) { return writeActivity(t, r, m); },',
  '    formatRelTime: function (ts) { return formatRelTime(ts); },',
  '    loadData: function () { return loadData(); },',
  '    showToast: function (m) { return showToast(m); },',
  '    navigateTo: function (p) { return navigateTo(p); },',
  '    loadExamBankExt: function () { return loadExamBankExt(); },',
  '    loadExamBankShard: function (u) { return loadExamBankShard(u); },',
  '    saveCalls: function () { return window.__qaSaveCalls; },',
  '    resetSaveCalls: function () { window.__qaSaveCalls = 0; }',
  '  };',
  '})();',
  '</script>'
].join('\n');

// ---------- 2. fetch 桩：把 assets/data/*.json 映射到本地磁盘 ----------
const GUARD_URL = 'assets/data/__qa_guard.json';
const GUARD_PAYLOAD = {
  questions: [
    { id: 2, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID2', o: ['a', 'b'], a: 0, x: '', tip: '' },
    { id: 101, type: 'QA', sub: 'guard', diff: 1, q: 'GUARD_MARKER_ID101_DUP', o: ['a', 'b'], a: 0, x: '', tip: '' }
  ]
};
function makeRes(obj) {
  return {
    ok: true, status: 200,
    json: function () { return Promise.resolve(obj); },
    text: function () { return Promise.resolve(JSON.stringify(obj)); }
  };
}
let fetchCount = 0;
function fetchStub(u) {
  const url = String(u === undefined || u === null ? '' : u);
  fetchCount++;
  return Promise.resolve().then(function () {
    if (url.indexOf('__qa_guard') >= 0) return makeRes(GUARD_PAYLOAD);
    const rel = url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    const fp = path.join(ROOT, rel);
    if (fp.indexOf(ROOT) !== 0 || !fs.existsSync(fp)) {
      return { ok: false, status: 404, json: function () { return Promise.reject(new Error('404 ' + rel)); } };
    }
    return makeRes(JSON.parse(fs.readFileSync(fp, 'utf8')));
  });
}

// ---------- 3. 启动 jsdom ----------
const uncaught = [];
const consoleErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
vc.on('error', function () {
  consoleErrors.push(Array.prototype.map.call(arguments, function (a) { return String(a); }).join(' '));
});

let dom;
try {
  dom = new JSDOM(html.indexOf('</body>') >= 0 ? html.replace(/<\/body>/i, PROBE + '\n</body>') : html + PROBE, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse: function (window) {
      window.fetch = fetchStub;
      // 预置登录态：app.js 顶部有 `if (!getAuth()) location.replace('登录.html')` 的登录守卫，
      // jsdom 不实现导航会抛 "Not implemented: navigation"。此为产品设计行为，非本批改动缺陷，
      // 故在解析前写入合法会话，模拟「已登录用户」这一真实使用场景。
      try {
        window.localStorage.setItem('study_workbench_auth',
          JSON.stringify({ account: 'qa', loginAt: Date.now() }));
      } catch (e) { /* 忽略 */ }
      window.addEventListener('error', function (e) {
        uncaught.push('[window.error] ' + ((e && e.message) || 'unknown'));
      });
      window.addEventListener('unhandledrejection', function (e) {
        uncaught.push('[unhandledrejection] ' + String(e && e.reason));
      });
    }
  });
} catch (e) {
  console.error('jsdom 启动失败：' + (e && e.stack ? e.stack : e));
  process.exit(1);
}
const win = dom.window;
const doc = win.document;

// ---------- 4. 主流程 ----------
(async function main() {
  // 等 DOM 解析完成 + 分片 fetch 的 promise 链跑完
  await sleep(600);

  const QA = win.__QA;
  assert('探针脚本注入成功（页面脚本整体可执行）', !!QA, QA ? '' : 'window.__QA 未定义');
  if (!QA) return finalize();

  // ---- A. 回归基线：showToast ----
  assert('showToast 是可用函数', typeof win.showToast === 'function', typeof win.showToast);
  let toastErr = '';
  try { QA.showToast('QA 回归验证'); } catch (e) { toastErr = e && e.message ? e.message : String(e); }
  assert('showToast 调用不抛异常', !toastErr, toastErr);

  // ---- B. navigateTo ----
  let navErr = '';
  try { QA.navigateTo('home'); } catch (e) { navErr = e && e.message ? e.message : String(e); }
  assert('navigateTo("home") 不抛异常', !navErr, navErr);
  const homePage = doc.getElementById('page-home');
  const titleEl = doc.getElementById('topbarTitle');
  assert('navigateTo 后 page-home 处于 active', !!(homePage && homePage.classList.contains('active')),
    homePage ? homePage.className : 'page-home 不存在');
  assert('navigateTo 后顶栏标题为「首页」', !!(titleEl && titleEl.textContent === '首页'),
    titleEl ? titleEl.textContent : 'topbarTitle 不存在');

  // ---- C. #countdownModal 结构（回归基线，本批不许动） ----
  const modal = doc.getElementById('countdownModal');
  const needIds = ['countdownModalTitle', 'cdName', 'cdDate', 'cdColorPicker'];
  const missing = needIds.filter(function (id) { return !doc.getElementById(id); });
  assert('#countdownModal 结构完好（4 个关键子节点齐全）', !!modal && missing.length === 0,
    modal ? ('缺失：' + missing.join(',')) : 'countdownModal 不存在');
  if (modal) {
    const groups = modal.querySelectorAll('.form-group').length;
    const dots = modal.querySelectorAll('#cdColorPicker .color-dot').length;
    const titleTxt = (doc.getElementById('countdownModalTitle') || {}).textContent || '';
    assert('倒计时弹窗表单项 ≥4 且色板色点 ≥5', groups >= 4 && dots >= 5,
      'form-group=' + groups + ', color-dot=' + dots);
    assert('倒计时弹窗标题为「添加倒计时」', titleTxt.indexOf('添加倒计时') >= 0, titleTxt);
  }

  // ---- D. P0-1：面试进度不再恒 0 ----
  const iqLen = QA.iqLen();
  assert('INTERVIEW_QUESTIONS 长度为 8', iqLen === 8, '实际 ' + iqLen);
  assert('interviewProgressTarget() 返回 8', QA.target() === 8, '实际 ' + QA.target());
  assert('pct(3,8) === 38', QA.pct(3, 8) === 38, '实际 ' + QA.pct(3, 8));
  assert('pct(3,0) / pct(0,0) 均为 0（分母≤0 不产生 NaN）',
    QA.pct(3, 0) === 0 && QA.pct(0, 0) === 0,
    'pct(3,0)=' + QA.pct(3, 0) + ', pct(0,0)=' + QA.pct(0, 0));

  QA.setAppData('viewedContent', { ivQuestions: [1, 2, 3] });
  const ivP = QA.cmp().interview;
  assert('viewedContent.ivQuestions 长度 3 时面试进度 = 38%', ivP === 38, '实际 ' + ivP);
  QA.setAppData('viewedContent', { ivQuestions: [] });
  assert('面试题库未看时面试进度 = 0', QA.cmp().interview === 0, '实际 ' + QA.cmp().interview);

  // ---- E. 空数据三件套 ----
  QA.setAppData('viewedContent', {});
  QA.setAppData('vocabLearned', []);
  QA.setAppData('activityLog', []);
  QA.setAppData('vocabRecords', {});
  QA.setAppData('examRecords', {});
  const zeroP = QA.cmp();
  const PKEYS = ['cet', 'exam', 'comm', 'interview', 'ppt'];
  const allZero = PKEYS.every(function (k) { return zeroP[k] === 0; });
  const noNaN = PKEYS.every(function (k) { return Number.isFinite(zeroP[k]); });
  assert('空数据下 computeModuleProgress 五模块全 0', allZero, JSON.stringify(zeroP));
  assert('空数据下 computeModuleProgress 无 NaN / Infinity', noNaN, JSON.stringify(zeroP));

  const wp = QA.cwp();
  assert('空数据下 computeWeakPoints() 返回 []', Array.isArray(wp) && wp.length === 0, JSON.stringify(wp));
  const rl = QA.crl();
  assert('空数据下 computeRecentLearning() 返回 []', Array.isArray(rl) && rl.length === 0, JSON.stringify(rl));

  // 正向用例：做题 10 对 3（正确率 30%）应命中薄弱点
  QA.setAppData('examTypeProgress', { '图形推理': { total: 10, correct: 3 } });
  const wp2 = QA.cwp();
  assert('computeWeakPoints 命中「做题≥5 且正确率<60%」',
    wp2.length === 1 && wp2[0].title === '图形推理', JSON.stringify(wp2));
  QA.setAppData('examTypeProgress', {
    '图形推理': { total: 0, correct: 0 }, '定义判断': { total: 0, correct: 0 },
    '类比推理': { total: 0, correct: 0 }, '逻辑判断': { total: 0, correct: 0 },
    '言语理解': { total: 0, correct: 0 }, '数量关系': { total: 0, correct: 0 },
    '资料分析': { total: 0, correct: 0 }
  });

  // ---- F. P0-2：题库分片合并 ----
  // 说明（QA 2026-09-13 第二批补产后更新）：第二批 100 题（id 301–400）入库后
  // 合并总量由 200 变为 300。此断言原先写死 200，属「期望值过期」而非源码缺陷，
  // 已同步为 300（内置 60 + 增量 240）。
  assert('EXAM_BANK 合并后总数 = 300（内置 60 + 增量 240）', QA.bankLen() === 300, '实际 ' + QA.bankLen());
  const bank = QA.bank();
  const extIds = bank.filter(function (q) { return q.id >= 101; }).map(function (q) { return q.id; });
  const uniqExt = Array.from(new Set(extIds));
  assert('增量题（id≥101）共 240 题且无重复', uniqExt.length === 240, '实际 ' + uniqExt.length);
  const under101 = bank.filter(function (q) { return q.id < 101; }).length;
  assert('id<101 的题数量为 60（未被增量重复追加）', under101 === 60, '实际 ' + under101);

  // 守卫分片：id=2（<101）与已存在的 id=101 都必须被跳过
  QA.loadExamBankShard(GUARD_URL);
  await sleep(250);
  const q2 = bank.filter(function (q) { return q.id === 2; })[0] || {};
  const q101 = bank.filter(function (q) { return q.id === 101; })[0] || {};
  assert('分片中 id<101 的题被跳过（未覆盖内置）', q2.q !== 'GUARD_MARKER_ID2', 'q2.q=' + String(q2.q).slice(0, 40));
  assert('分片中已存在的 id 被跳过（不重复追加）', q101.q !== 'GUARD_MARKER_ID101_DUP',
    'q101.q=' + String(q101.q).slice(0, 40));
  assert('守卫分片加载后总数仍为 300', QA.bankLen() === 300, '实际 ' + QA.bankLen());

  // ---- G. 合并安全性：合并路径不得调用 saveData ----
  QA.resetSaveCalls();
  QA.loadExamBankExt();
  QA.loadExamBankShard(GUARD_URL);
  await sleep(300);
  assert('P0-2 分片合并路径未调用 saveData（用户进度零改动）', QA.saveCalls() === 0,
    'saveData 被调用 ' + QA.saveCalls() + ' 次');

  // ---- H. P1-4：activityLog 环形 ----
  QA.setAppData('activityLog', []);
  for (let i = 0; i < 260; i++) QA.writeActivity('exam', 'r' + i, 'exam');
  const log = QA.appData().activityLog;
  assert('activityLog 写入 260 条后截断为 200', log.length === 200, '实际 ' + log.length);
  assert('环形截断保留最新（首条 r60 / 末条 r259）',
    log[0].ref === 'r60' && log[log.length - 1].ref === 'r259',
    'first=' + log[0].ref + ', last=' + log[log.length - 1].ref);

  // ---- I. P1-4：formatRelTime ----
  const now = Date.now();
  const s30 = QA.formatRelTime(now - 30 * 1000);
  const s5m = QA.formatRelTime(now - 5 * 60 * 1000);
  const s3h = QA.formatRelTime(now - 3 * 60 * 60 * 1000);
  const s2d = QA.formatRelTime(now - 2 * 24 * 60 * 60 * 1000);
  assert('formatRelTime 30 秒前 → 「刚刚」', s30 === '刚刚', s30);
  assert('formatRelTime 5 分钟前 → 「5 分钟前」', /^\d+ 分钟前$/.test(s5m) && s5m.indexOf('5') === 0, s5m);
  assert('formatRelTime 3 小时前 → 「3 小时前」', /^\d+ 小时前$/.test(s3h) && s3h.indexOf('3') === 0, s3h);
  assert('formatRelTime 2 天前 → 「2 天前」', /^\d+ 天前$/.test(s2d) && s2d.indexOf('2') === 0, s2d);
  assert('formatRelTime(0) 返回空串而非抛异常', QA.formatRelTime(0) === '', JSON.stringify(QA.formatRelTime(0)));

  // ---- J. 老存档兼容：不含 activityLog 字段的旧档 ----
  function dstr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const d3 = new Date(today.getTime() - 3 * 86400000);
  const oldSave = {
    vocabLearned: ['abandon', 'ability'],
    vocabRecords: { abandon: { lastReview: dstr(today) }, ability: { lastReview: dstr(yest) } },
    examRecords: { '1': { lastReview: dstr(d3) } },
    viewedContent: { commScenes: [1, 2], pptLayouts: [1], ivQuestions: [] },
    weakPoints: [], recentLearning: [],
    moduleProgress: { cet: 45, exam: 30, comm: 20, interview: 15, ppt: 10 }
  };
  let legacyErr = '';
  let legacyItems = null;
  try {
    // 关键：loadData() 的合并语义是 {...appData, ...saved}——旧存档里没有的字段会沿用当前内存值。
    // 上面 H 段刚灌了 200 条 activityLog，若不先清空，computeRecentLearning 会走 ① 分支而不是日期回退。
    // 真实老用户升级场景中 appData 为默认（activityLog=[]），故此处显式清空以还原该场景。
    QA.setAppData('activityLog', []);
    win.localStorage.setItem(QA.storageKey(), JSON.stringify(oldSave));
    QA.loadData();
    legacyItems = QA.crl();
  } catch (e) {
    legacyErr = e && e.message ? e.message : String(e);
  }
  assert('灌入无 activityLog 的旧存档：加载零异常', !legacyErr, legacyErr);
  const metas = (legacyItems || []).map(function (it) { return it && it.meta ? it.meta : ''; }).join(' / ');
  assert('旧存档回退后能显示「今天」', metas.indexOf('今天') >= 0, metas);
  assert('旧存档回退后能显示「昨天」', metas.indexOf('昨天') >= 0, metas);
  assert('旧存档回退后能显示「3 天前」', metas.indexOf('3 天前') >= 0, metas);
  assert('旧存档加载后 activityLog 被补成数组', Array.isArray(QA.appData().activityLog),
    typeof QA.appData().activityLog);

  finalize();
})().catch(function (e) {
  uncaught.push('[verifier] ' + (e && e.stack ? e.stack : String(e)));
  finalize();
});

// ---------- 5. 静态检查：合并函数体不得出现 saveData（P0-2 / P0-3） ----------
function bodyOf(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return src.slice(i, i + 2000);
}
function staticCheck() {
  let appTxt = '', vpTxt = '';
  try { appTxt = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8'); } catch (e) {}
  try { vpTxt = fs.readFileSync(path.join(ROOT, 'assets', 'voiceplayer.js'), 'utf8'); } catch (e) {}
  [
    { file: 'assets/app.js', sig: 'function loadExamBankShard', src: appTxt },
    { file: 'assets/app.js', sig: 'function loadExamBankExt', src: appTxt },
    { file: 'assets/voiceplayer.js', sig: 'function loadListeningExt', src: vpTxt }
  ].forEach(function (t) {
    const body = bodyOf(t.src, t.sig);
    if (body === null) { assert('静态检查：定位到 ' + t.sig, false, '未找到函数定义'); return; }
    const hit = /saveData\s*\(/.test(body);
    assert('静态检查：' + t.file + ' · ' + t.sig + ' 函数体未调用 saveData', !hit,
      hit ? '函数体内出现 saveData(' : '');
  });
}

// ---------- 6. 输出与退出 ----------
let finalized = false;
function finalize() {
  if (finalized) return;
  finalized = true;
  staticCheck();
  assert('页面加载与运行期间零未捕获异常', uncaught.length === 0, uncaught.slice(0, 5).join(' || '));

  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });

  console.log('');
  console.log('============================================================');
  console.log('批次三（0913）P0/P1 专项回归验证 · 页面：学习工作台.html');
  console.log('项目根：' + ROOT);
  console.log('已内联脚本：' + loadedScripts.join(' | '));
  console.log('fetch 桩命中次数：' + fetchCount);
  console.log('============================================================');
  results.forEach(function (r, i) {
    console.log((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name +
      (r.ok ? '' : '   →   ' + r.detail));
  });
  if (consoleErrors.length) {
    console.log('------------------------------------------------------------');
    console.log('console.error 输出（仅供参考，不计为失败）：');
    consoleErrors.slice(0, 10).forEach(function (m) { console.log('  - ' + m.slice(0, 200)); });
  }
  console.log('============================================================');
  console.log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  console.log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  console.log('============================================================');

  try { dom.window.close(); } catch (e) {}
  process.exit(failed.length === 0 ? 0 : 1);
}
