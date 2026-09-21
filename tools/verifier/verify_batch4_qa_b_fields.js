/**
 * 批次四 QA 独立验证 · B. 清理 4 个废弃存档字段 证伪脚本
 * ---------------------------------------------------------------------------
 *   B1 灌入含 interviewDone/moduleProgress/weakPoints/recentLearning 的老存档 → 零未捕获异常
 *   B2 loadData() 后 appData 不再含这 4 个键
 *   B3 首页不渲染旧值（不出现 45/30/20/15/10% 与「数量关系-工程问题」等旧文案）
 *   B4 触发 saveData() 后 localStorage 里不再回写这 4 个键
 *   B5 进度四字段（vocabLearned/wrongQuestions/favoriteQuestions/examTypeProgress）
 *      逐字段与灌入前一致（零丢失）
 *
 * 用法：node tools/verifier/verify_batch4_qa_b_fields.js
 * 退出码：0=全部通过；1=有失败。结果同时写入同目录 _qa_b_out.txt
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, '学习工作台.html');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { ({ JSDOM, VirtualConsole } = require('c:/Users/ATM/node_modules/jsdom')); }

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
const L = [];
function log(s) { L.push(s); }

const rawHtml = fs.readFileSync(PAGE, 'utf8');
const SRC_RE = /<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const html = rawHtml.replace(SRC_RE, function (m, src) {
  const rel = String(src).split('?')[0];
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return '<!-- 脚本缺失：' + rel + ' -->';
  return '<script>\n' + fs.readFileSync(fp, 'utf8') + '\n</script>';
});

const PROBE = [
  '<script>',
  '(function () {',
  '  window.__QA = {',
  '    storageKey: function () { return STORAGE_KEY; },',
  '    appData: function () { return appData; },',
  '    saveData: function () { return saveData(); },',
  '    saveCalls: function () { return window.__qaSaveCalls; },',
  '    renderModuleProgress: function () { return renderModuleProgress(); },',
  '    renderWeakPoints: function () { return renderWeakPoints(); },',
  '    renderRecentLearning: function () { return renderRecentLearning(); },',
  '    docText: function () { var b = document.body.cloneNode(true); var ss = b.querySelectorAll("script"); for (var i = 0; i < ss.length; i++) { ss[i].parentNode.removeChild(ss[i]); } return b.textContent; }',
  '  };',
  '})();',
  '</script>'
].join('\n');

function fetchStub(u) {
  const url = String(u === undefined || u === null ? '' : u);
  return Promise.resolve().then(function () {
    const rel = url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    const fp = path.join(ROOT, rel);
    if (fp.indexOf(ROOT) !== 0 || !fs.existsSync(fp)) {
      return { ok: false, status: 404, json: function () { return Promise.reject(new Error('404')); } };
    }
    return { ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(fp, 'utf8'))); } };
  });
}

// 含 4 个废弃字段（含原写死假数据）+ 真实进度的老存档
function makeLegacySave() {
  return {
    // ↓↓ 4 个废弃字段（含写死假数据 45/30/20/15/10% 与旧文案）
    moduleProgress: { cet: 45, exam: 30, comm: 20, interview: 15, ppt: 10 },
    weakPoints: [
      { icon: '\u{1F522}', title: '数量关系-工程问题', desc: '正确率仅40%，建议专项练习', module: 'exam' },
      { icon: '\u{1F5E3}', title: '口语发音 /θ/ 音素', desc: '多次发音不准确，需加强', module: 'cet' },
      { icon: '\u{1F4D0}', title: 'PPT数据页版式选择', desc: '版式选择正确率低', module: 'ppt' }
    ],
    recentLearning: [
      { icon: '\u{1F9E9}', title: '图形推理-位置类 第3题', meta: '央国企笔试 · 收藏', module: 'exam' },
      { icon: '\u{1F3AD}', title: '拒绝同事请求-角色扮演', meta: '高情商表达 · 进行到第3轮', module: 'comm' },
      { icon: '\u{1F50D}', title: '麦肯锡报告案例拆解-第5页', meta: 'PPT训练 · 已完成', module: 'ppt' }
    ],
    interviewDone: 0,
    // ↓↓ 真实用户进度（必须零丢失）
    wrongQuestions: [3, 17, 28, 41],
    favoriteQuestions: [7, 22, 55],
    vocabLearned: ['abandon', 'ability', 'absorb'],
    vocabCurrentIndex: 3,
    examTypeProgress: {
      '图形推理': { total: 7, correct: 2 },
      '定义判断': { total: 0, correct: 0 },
      '类比推理': { total: 0, correct: 0 },
      '逻辑判断': { total: 0, correct: 0 },
      '言语理解': { total: 0, correct: 0 },
      '数量关系': { total: 0, correct: 0 },
      '资料分析': { total: 0, correct: 0 }
    },
    countdowns: [{ id: 1, name: '四级考试', date: '2026-12-15', color: '#5B8DEF' }],
    profile: { name: '老用户', avatar: '老', motto: '苟日新', gender: 'secret', birthday: '', city: '' },
    lastVisitDate: ''
  };
}
const LEGACY = makeLegacySave();

function boot(seed) {
  const uncaught = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
  const dom = new JSDOM(html.replace(/<\/body>/i, PROBE + '\n</body>'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse: function (window) {
      window.fetch = fetchStub;
      try {
        window.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() }));
        if (seed) window.localStorage.setItem('study_workbench_data', JSON.stringify(seed));
      } catch (e) {}
      window.addEventListener('error', function (e) { uncaught.push('[window.error] ' + ((e && e.message) || 'unknown')); });
      window.addEventListener('unhandledrejection', function (e) { uncaught.push('[unhandledrejection] ' + String(e && e.reason)); });
    }
  });
  return { dom: dom, win: dom.window, uncaught: uncaught };
}

function finalize() {
  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });
  log('');
  log('============================================================');
  log('批次四 QA 独立验证 · B. 清理 4 个废弃存档字段');
  log('项目根：' + ROOT);
  log('============================================================');
  results.forEach(function (r, i) {
    log((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name + (r.ok ? '' : '   →   ' + r.detail));
  });
  log('============================================================');
  log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  log('============================================================');
  const txt = L.join('\n');
  try { fs.writeFileSync(path.join(__dirname, '_qa_b_out.txt'), txt + '\n', 'utf8'); } catch (e) {}
  console.log(txt);
  process.exit(failed.length === 0 ? 0 : 1);
}

(async function main() {
  const ctx = boot(LEGACY);
  await sleep(800);
  const win = ctx.win, doc = win.document, QA = win.__QA;
  assert('B0 探针可用（页面脚本整体执行成功）', !!QA, QA ? '' : 'window.__QA 未定义');
  if (!QA) { finalize(); return; }

  const ad = QA.appData();
  const KEYS = ['interviewDone', 'moduleProgress', 'weakPoints', 'recentLearning'];

  // B2 appData 不再含这四个键
  const still = KEYS.filter(function (k) { return Object.prototype.hasOwnProperty.call(ad, k); });
  assert('B2 loadData() 后 appData 不再含这 4 个废弃键', still.length === 0, '仍存在：' + still.join(','));

  // B5 进度四字段零丢失
  const eq = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  assert('B5-a vocabLearned 逐字段一致（3 词，零丢失）', eq(ad.vocabLearned, LEGACY.vocabLearned), JSON.stringify(ad.vocabLearned));
  assert('B5-b wrongQuestions 逐字段一致（4 条，零丢失）', eq(ad.wrongQuestions, LEGACY.wrongQuestions), JSON.stringify(ad.wrongQuestions));
  assert('B5-c favoriteQuestions 逐字段一致（3 条，零丢失）', eq(ad.favoriteQuestions, LEGACY.favoriteQuestions), JSON.stringify(ad.favoriteQuestions));
  assert('B5-d examTypeProgress 逐字段一致（图形推理 7/2，零丢失）', eq(ad.examTypeProgress, LEGACY.examTypeProgress), JSON.stringify(ad.examTypeProgress));

  // B3 首页不渲染旧值
  try { QA.renderModuleProgress(); QA.renderWeakPoints(); QA.renderRecentLearning(); }
  catch (e) { assert('B3-render 三个 render 调用不抛异常', false, e.message); }
  const bodyTxt = QA.docText();
  const oldTexts = ['数量关系-工程问题', '图形推理-位置类 第3题', '麦肯锡报告案例拆解-第5页', '口语发音'];
  const leaked = oldTexts.filter(function (s) { return bodyTxt.indexOf(s) >= 0; });
  assert('B3-a 首页不渲染废弃 weakPoints / recentLearning 旧文案', leaked.length === 0, leaked.join(' | '));
  const grid = doc.getElementById('moduleProgressGrid');
  const cards = grid ? Array.prototype.slice.call(grid.querySelectorAll('.module-progress-card')) : [];
  const rendered = {};
  cards.forEach(function (c) {
    const name = (c.querySelector('.module-name') || {}).textContent || '';
    const pct = (c.querySelector('.module-percent') || {}).textContent || '';
    rendered[name] = pct;
  });
  const DEPRECATED = { '四级': '45%', '笔试': '30%', '表达': '20%', '面试': '15%', 'PPT': '10%' };
  const bad = Object.keys(DEPRECATED).filter(function (cn) { return rendered[cn] === DEPRECATED[cn]; });
  assert('B3-b 首页五模块进度均不等于废弃写死值（45/30/20/15/10%）', bad.length === 0,
    bad.length ? ('仍渲染废弃值：' + bad.join(',')) : JSON.stringify(rendered));

  // B4 saveData 后 localStorage 不再回写这 4 个键
  QA.saveData();
  const raw = win.localStorage.getItem(QA.storageKey());
  let saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch (e) {}
  const persisted = KEYS.filter(function (k) { return Object.prototype.hasOwnProperty.call(saved, k); });
  assert('B4 saveData() 后 localStorage 不再回写这 4 个废弃键', persisted.length === 0,
    '仍回写：' + persisted.join(',') + ' | 落盘键=' + Object.keys(saved).join(','));

  // B1 零未捕获异常
  assert('B1 加载与渲染期间零未捕获异常', ctx.uncaught.length === 0, ctx.uncaught.slice(0, 5).join(' || '));

  try { win.close(); } catch (e) {}
  finalize();
})().catch(function (e) {
  results.push({ name: '脚本自身运行异常', ok: false, detail: (e && e.stack) || String(e) });
  finalize();
});
