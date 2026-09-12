/**
 * 发布前检查单（0913b）· 第 1/2/3 项
 * ------------------------------------------------------------------
 *  1. 全站零外链扫描（32 个 HTML + assets 下 JS/CSS；排除 server/ 与 android/）
 *  2. 老存档回归（含三个废弃字段、不含 activityLog）
 *  3. 全新存档冒烟（空态 / 未开始灰态 / 无假数据）
 *
 * 用法：node tools/verifier/verify_release_precheck_0913b.js
 * 退出码：0 = 全部通过；1 = 有失败
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// ROOT 由脚本自身位置推导，禁止硬编码绝对路径
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, '学习工作台.html');

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ==================================================================
 * 第 1 项：全站零外链扫描
 * ================================================================== */
const RE_ABS = /https?:\/\/[^\s"'`<>)\\]+/g;
const RE_PROTO_REL = /(?:src|href)\s*=\s*["']\/\/[^\s"']+/g;
const RE_BARE_CDN = /\/\/cdn\.[^\s"'`<>)\\]*/g;

// 命名空间声明：不是真实网络请求
function isNamespace(line, url) {
  return /xmlns\s*=\s*["'][^"']*$/.test(line.slice(0, line.indexOf(url) + url.length)) ||
    /w3\.org|schemas\.android\.com|schemas\.microsoft\.com|schema\.org/.test(url);
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function isResourceCtx(line, url) {
  const u = escapeRe(url);
  return new RegExp('(?:src|href|poster|action|data-src|data-href)\\s*=\\s*["\'`]' + u).test(line) ||
    new RegExp('url\\(\\s*["\'`]?' + u).test(line) ||
    new RegExp('@import\\s+["\'`]' + u).test(line);
}
function isApiCtx(line, url) {
  const u = escapeRe(url);
  return new RegExp('(?:fetch|importScripts|XMLHttpRequest|\\.open)\\s*\\(\\s*["\'`]' + u).test(line) ||
    new RegExp('(?:API_BASE|BASE_URL|SERVER|API_URL|HOST|ENDPOINT|WS_URL)\\s*[:=]\\s*["\'`]' + u).test(line);
}

function scanFile(fp, kind) {
  const txt = fs.readFileSync(fp, 'utf8');
  const lines = txt.split(/\r?\n/);
  const hits = [];
  let blockComment = false;
  lines.forEach(function (line, idx) {
    let inComment = blockComment;
    let stripped = line;
    // 粗略的块注释跟踪（JS/CSS 用 /* */，HTML 用 <!-- -->）
    const openB = (line.match(/\/\*/g) || []).length + (line.match(/<!--/g) || []).length;
    const closeB = (line.match(/\*\//g) || []).length + (line.match(/-->/g) || []).length;
    const t = line.trim();
    const isLineComment = /^\/\//.test(t) || /^\*/.test(t) || /^#/.test(t) || /^<!--/.test(t) || /^-->/.test(t);

    const urls = [];
    let m;
    RE_ABS.lastIndex = 0;
    while ((m = RE_ABS.exec(line)) !== null) urls.push(m[0]);
    RE_PROTO_REL.lastIndex = 0;
    while ((m = RE_PROTO_REL.exec(line)) !== null) urls.push(m[0].replace(/^(?:src|href)\s*=\s*["']/, ''));
    RE_BARE_CDN.lastIndex = 0;
    while ((m = RE_BARE_CDN.exec(line)) !== null) urls.push(m[0]);

    urls.forEach(function (url) {
      idx; // noop
      let cat;
      if (isNamespace(line, url)) cat = 'namespace';
      else if (isResourceCtx(line, url)) cat = 'resource';
      else if (isApiCtx(line, url)) cat = 'api';
      else if (inComment || isLineComment) cat = 'comment';
      else cat = 'text';
      hits.push({ file: path.relative(ROOT, fp).replace(/\\/g, '/'), line: idx + 1, url: url, cat: cat, snippet: t.slice(0, 150) });
    });

    if (openB > closeB) blockComment = true;
    else if (closeB > openB) blockComment = false;
  });
  return hits;
}

function part1() {
  const files = [];
  fs.readdirSync(ROOT).filter(function (f) { return /\.html$/i.test(f); })
    .forEach(function (f) { files.push(path.join(ROOT, f)); });
  fs.readdirSync(path.join(ROOT, 'assets')).filter(function (f) {
    return /\.(js|css)$/i.test(f) && !/\.bak/.test(f);   // 排除 .bak-0913 / .bak-0914 备份
  }).forEach(function (f) { files.push(path.join(ROOT, 'assets', f)); });

  const all = [];
  files.forEach(function (f) { scanFile(f).forEach(function (h) { all.push(h); }); });

  const by = { resource: [], api: [], namespace: [], comment: [], text: [] };
  all.forEach(function (h) { by[h.cat].push(h); });

  assert('外链扫描：真实外链资源（CDN 图标/字体/远程脚本）数量为 0',
    by.resource.length === 0,
    by.resource.map(function (h) { return h.file + ':' + h.line + ' ' + h.url; }).join(' | ') || '无');
  assert('外链扫描：无协议相对（//cdn. 等）外链引用',
    by.resource.concat(by.text).filter(function (h) { return /^\/\//.test(h.url); }).length === 0,
    by.resource.concat(by.text).filter(function (h) { return /^\/\//.test(h.url); })
      .map(function (h) { return h.file + ':' + h.line + ' ' + h.url; }).join(' | ') || '无');
  return { files: files.length, all: all, by: by };
}

/* ==================================================================
 * jsdom 装配（第 2/3 项共用）
 * ================================================================== */
const rawHtml = fs.readFileSync(PAGE, 'utf8');
const SRC_RE = /<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const inlineHtml = rawHtml.replace(SRC_RE, function (m, src) {
  const rel = String(src).split('?')[0];
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return '<!-- 缺失：' + rel + ' -->';
  const code = fs.readFileSync(fp, 'utf8');
  return '<script>\n' + code + '\n</script>';
});

const PROBE = [
  '<script>',
  '(function () {',
  '  window.__QA = {',
  '    storageKey: function () { return STORAGE_KEY; },',
  '    appData: function () { return appData; },',
  '    cmp: function () { return computeModuleProgress(); },',
  '    cwp: function () { return computeWeakPoints(); },',
  '    crl: function () { return computeRecentLearning(); },',
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
    return {
      ok: true, status: 200,
      json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
    };
  });
}

function boot(seed, label) {
  const uncaught = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
  const html = inlineHtml.replace(/<\/body>/i, PROBE + '\n</body>');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse: function (window) {
      window.fetch = fetchStub;
      // app.js:225 有 `if (!getAuth()) location.replace('登录.html')` 登录守卫，
      // jsdom 不实现导航会报 jsdomError，故预置会话模拟已登录用户。
      try {
        window.localStorage.setItem('study_workbench_auth',
          JSON.stringify({ account: label, loginAt: Date.now() }));
        if (seed) window.localStorage.setItem('study_workbench_data', JSON.stringify(seed));
      } catch (e) {}
      window.addEventListener('error', function (e) {
        uncaught.push('[window.error] ' + ((e && e.message) || 'unknown'));
      });
      window.addEventListener('unhandledrejection', function (e) {
        uncaught.push('[unhandledrejection] ' + String(e && e.reason));
      });
    }
  });
  return { dom: dom, uncaught: uncaught };
}

/* ==================================================================
 * 第 2 项：老存档回归
 * ================================================================== */
function dstr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function makeLegacySave() {
  const today = new Date();
  return {
    countdowns: [{ id: 1, name: '四级考试', date: '2026-12-15', color: '#5B8DEF' }],
    stats: { todayMinutes: 35, totalMinutes: 1200, streakDays: 6, lastActiveDate: dstr(today) },
    // ↓↓↓ 三个已废弃字段（改造前写死的假数据）
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
    // ↓↓↓ 真实用户进度
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
    vocabRecords: {
      abandon: { lastReview: dstr(new Date(today.getTime() - 86400000)) },
      ability: { lastReview: dstr(new Date(today.getTime() - 3 * 86400000)) }
    },
    examRecords: {
      '3': { lastReview: dstr(today) },
      '17': { lastReview: dstr(new Date(today.getTime() - 5 * 86400000)) }
    },
    viewedContent: {
      commScenes: [1, 2, 3], pptLayouts: [1, 2], etiquette: [1],
      ivQuestions: [1, 2, 3, 4, 5, 6, 7, 8]
    },
    dailyQueues: {},
    notes: [], favoriteNotes: [],
    profile: { name: '老用户', avatar: '老', motto: '苟日新', gender: 'secret', birthday: '', city: '' },
    lastVisitDate: ''
    // 故意不含 activityLog
  };
}

const LEGACY = makeLegacySave();

function part2(ctx) {
  const win = ctx.dom.window, doc = win.document, QA = win.__QA;
  assert('老存档：探针可用（页面脚本整体执行成功）', !!QA);
  if (!QA) return;

  const ad = QA.appData();
  const eq = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  assert('老存档：vocabLearned 逐字段一致（3 词，零丢失）',
    eq(ad.vocabLearned, LEGACY.vocabLearned), JSON.stringify(ad.vocabLearned));
  assert('老存档：wrongQuestions 逐字段一致（4 条，零丢失）',
    eq(ad.wrongQuestions, LEGACY.wrongQuestions), JSON.stringify(ad.wrongQuestions));
  assert('老存档：favoriteQuestions 逐字段一致（3 条，零丢失）',
    eq(ad.favoriteQuestions, LEGACY.favoriteQuestions), JSON.stringify(ad.favoriteQuestions));
  assert('老存档：examTypeProgress 逐字段一致（图形推理 7 题对 2，零丢失）',
    eq(ad.examTypeProgress, LEGACY.examTypeProgress), JSON.stringify(ad.examTypeProgress));
  assert('老存档：activityLog 被补成数组', Array.isArray(ad.activityLog), typeof ad.activityLog);

  // 渲染：必须先渲染再断言
  try { QA.renderModuleProgress(); QA.renderWeakPoints(); QA.renderRecentLearning(); }
  catch (e) { assert('老存档：三个 render 调用不抛异常', false, e.message); return; }

  const grid = doc.getElementById('moduleProgressGrid');
  const cards = grid ? grid.querySelectorAll('.module-progress-card') : [];
  const rendered = {};
  Array.prototype.forEach.call(cards, function (c) {
    const name = (c.querySelector('.module-name') || {}).textContent || '';
    const pctTxt = (c.querySelector('.module-percent') || {}).textContent || '';
    rendered[name] = pctTxt;
  });
  const map = { '四级': 'cet', '笔试': 'exam', '表达': 'comm', '面试': 'interview', 'PPT': 'ppt' };
  const DEPRECATED_PCT = { cet: '45%', exam: '30%', comm: '20%', interview: '15%', ppt: '10%' };
  const bad = [];
  Object.keys(map).forEach(function (cn) {
    const got = rendered[cn];
    if (got === DEPRECATED_PCT[map[cn]]) bad.push(cn + '=' + got);
  });
  assert('老存档：首页五模块进度均不等于废弃字段的写死值（45/30/20/15/10%）',
    Object.keys(map).length === 5 && bad.length === 0,
    bad.length ? ('仍渲染废弃值：' + bad.join(', ')) : JSON.stringify(rendered));

  // 渲染值 == computeModuleProgress() 的实时推导值
  const prog = QA.cmp();
  const expect = { '四级': 'cet', '笔试': 'exam', '表达': 'comm', '面试': 'interview', 'PPT': 'ppt' };
  const mismatch = [];
  Object.keys(expect).forEach(function (cn) {
    const p = prog[expect[cn]] || 0;
    const want = p <= 0 ? '未开始' : (p + '%');
    if (rendered[cn] !== want) mismatch.push(cn + ' 渲染=' + rendered[cn] + ' 期望=' + want);
  });
  assert('老存档：模块进度渲染值与 computeModuleProgress() 实时推导一致',
    mismatch.length === 0, mismatch.join(' | ') || JSON.stringify(prog));

  const bodyTxt = QA.docText();
  const staleText = ['数量关系-工程问题', '图形推理-位置类 第3题', '麦肯锡报告案例拆解-第5页', '口语发音'];
  const leaked = staleText.filter(function (s) { return bodyTxt.indexOf(s) >= 0; });
  assert('老存档：首页不渲染废弃 weakPoints / recentLearning 的旧文案',
    leaked.length === 0, leaked.join(' | ') || '无');

  // 老档回退应能出「今天/昨天/N 天前」
  const rl = QA.crl();
  const metas = rl.map(function (r) { return r.meta || ''; }).join(' / ');
  assert('老存档：最近学习回退出相对/日期文案', rl.length > 0 && /今天|昨天|天前/.test(metas), metas);
}

/* ==================================================================
 * 第 3 项：全新存档冒烟
 * ================================================================== */
function part3(ctx) {
  const win = ctx.dom.window, doc = win.document, QA = win.__QA;
  assert('新存档：探针可用（页面脚本整体执行成功）', !!QA);
  if (!QA) return;

  // 注：app.js 首次加载会写入默认种子（countdowns 默认「四级考试」倒计时），属设计行为。
  // 这里真正要断言的是「没有任何用户进度数据」，而不是「localStorage 完全为空」。
  const rawSave = win.localStorage.getItem(QA.storageKey());
  const saved = rawSave ? JSON.parse(rawSave) : {};
  const progKeys = ['vocabLearned', 'wrongQuestions', 'favoriteQuestions'];
  const notEmpty = progKeys.filter(function (k) { return Array.isArray(saved[k]) && saved[k].length > 0; });
  assert('新存档：localStorage 内无用户进度数据（仅默认种子，如倒计时）',
    notEmpty.length === 0,
    (notEmpty.join(',') || '无用户进度') + ' | countdowns=' +
    (Array.isArray(saved.countdowns) ? saved.countdowns.length : 'n/a'));

  try { QA.renderModuleProgress(); QA.renderWeakPoints(); QA.renderRecentLearning(); }
  catch (e) { assert('新存档：三个 render 调用不抛异常', false, e.message); return; }

  const grid = doc.getElementById('moduleProgressGrid');
  const pcts = grid ? grid.querySelectorAll('.module-percent') : [];
  const muted = grid ? grid.querySelectorAll('.module-percent.muted') : [];
  const allWei = Array.prototype.every.call(pcts, function (e) { return e.textContent === '未开始'; });
  assert('新存档：5 个模块进度均为「未开始」灰态（muted），非 0% 数字',
    pcts.length === 5 && muted.length === 5 && allWei,
    'percent=' + pcts.length + ', muted=' + muted.length + ', 文本=' +
    Array.prototype.map.call(pcts, function (e) { return e.textContent; }).join(','));

  const gridTxt = grid ? grid.textContent : '';
  assert('新存档：模块进度区不含任何百分比数字', !/\d+%/.test(gridTxt), gridTxt.replace(/\s+/g, ' ').slice(0, 120));

  const weak = doc.getElementById('weakList');
  const recent = doc.getElementById('recentList');
  assert('新存档：薄弱点为空态（#weakList 含 .empty-hint）',
    !!weak && weak.querySelectorAll('.empty-hint').length === 1,
    weak ? weak.innerHTML.slice(0, 80) : '#weakList 不存在');
  assert('新存档：最近学习为空态（#recentList 含 .empty-hint）',
    !!recent && recent.querySelectorAll('.empty-hint').length === 1,
    recent ? recent.innerHTML.slice(0, 80) : '#recentList 不存在');
  assert('新存档：薄弱点无假数据条目（.weak-item 数为 0）',
    !!weak && weak.querySelectorAll('.weak-item').length === 0);
  assert('新存档：最近学习无假数据条目（.recent-item 数为 0）',
    !!recent && recent.querySelectorAll('.recent-item').length === 0);

  const bodyTxt = QA.docText();
  const fake = ['45%', '30%', '20%', '15%', '10%'].filter(function (s) { return bodyTxt.indexOf(s) >= 0; });
  assert('新存档：整页不出现写死的假进度数字（45/30/20/15/10%）',
    fake.length === 0, fake.join(',') || '无');
}

/* ==================================================================
 * 主流程
 * ================================================================== */
(async function main() {
  const r1 = part1();

  const c2 = boot(LEGACY, 'qa-legacy');
  await sleep(600);
  part2(c2);
  assert('老存档：加载与渲染期间零未捕获异常', c2.uncaught.length === 0, c2.uncaught.slice(0, 5).join(' || '));
  try { c2.dom.window.close(); } catch (e) {}

  const c3 = boot(null, 'qa-fresh');
  await sleep(600);
  part3(c3);
  assert('新存档：加载与渲染期间零未捕获异常', c3.uncaught.length === 0, c3.uncaught.slice(0, 5).join(' || '));
  try { c3.dom.window.close(); } catch (e) {}

  report(r1);
})().catch(function (e) {
  results.push({ name: '脚本自身运行异常', ok: false, detail: (e && e.stack) || String(e) });
  report(part1());
});

function report(r1) {
  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });
  const L = [];
  L.push('============================================================');
  L.push('发布前检查单（0913b）· 第 1/2/3 项');
  L.push('项目根：' + ROOT);
  L.push('============================================================');
  L.push('');
  L.push('【第 1 项】全站零外链扫描（排除 server/ 与 android/，排除 *.bak* 备份）');
  L.push('  扫描文件数：' + r1.files + '（32 HTML + assets 下 JS/CSS）');
  L.push('  命中总数：' + r1.all.length);
  L.push('  ├─ resource（真实外链资源，应为 0）：' + r1.by.resource.length);
  L.push('  ├─ api（运行时接口地址，列出即可）：' + r1.by.api.length);
  L.push('  ├─ namespace（xmlns 命名空间，非请求）：' + r1.by.namespace.length);
  L.push('  ├─ comment（注释内 URL，可接受）：' + r1.by.comment.length);
  L.push('  └─ text（文案 URL，可接受）：' + r1.by.text.length);
  ['resource', 'api', 'text', 'comment', 'namespace'].forEach(function (cat) {
    if (!r1.by[cat].length) return;
    L.push('  -- ' + cat + ' 明细 --');
    r1.by[cat].slice(0, 60).forEach(function (h) {
      L.push('     ' + h.file + ':' + h.line + '  ' + h.url +
        (cat === 'text' || cat === 'comment' ? '' : ''));
    });
    if (r1.by[cat].length > 60) L.push('     ...(其余 ' + (r1.by[cat].length - 60) + ' 条省略)');
  });
  L.push('');
  L.push('【第 2/3 项】jsdom 断言明细');
  results.forEach(function (r, i) {
    L.push((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name +
      (r.ok ? '' : '   →   ' + r.detail));
  });
  L.push('============================================================');
  L.push('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  L.push('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  L.push('============================================================');

  const txt = L.join('\n');
  console.log(txt);
  try { fs.writeFileSync(path.join(__dirname, '_precheck_out.txt'), txt + '\n', 'utf8'); } catch (e) {}
  process.exit(failed.length === 0 ? 0 : 1);
}
