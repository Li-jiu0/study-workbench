/* QA (Edward) 独立验证 —— Bug1：个人中心 #prefs / #local-data 空白
 * 方法：用 jsdom 真加载 个人中心.html 的 DOM，手动按页面声明顺序执行本地 assets 脚本
 *       （因 jsdom 默认不解析 file:// 相对资源），注入登录态与数据，
 *       通过 SubpageRouter.navigate 真进入子页，断言容器可见且内容非占位。
 * 不复用工程师脚本逻辑。
 * 运行：node tools/qa/qa_bug1_profiles.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_MODULES = path.resolve(ROOT, 'tools', 'verifier', 'node_modules');
const { JSDOM, VirtualConsole } = require(path.join(NODE_MODULES, 'jsdom'));

const HTML = fs.readFileSync(path.join(ROOT, '个人中心.html'), 'utf8');

// 页面声明的外部脚本顺序
const SCRIPTS = [
  'assets/icon-map.js',
  'assets/xt-toast.js',
  'assets/error-boundary.js',
  'assets/app.js',
  'assets/config.js',
  'assets/api.js',
  'assets/subpage-router.js',
];

const uncaught = [];

function collectInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

async function runScenario(label, opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (!/Could not load|Not implemented/.test(e.message)) uncaught.push('[' + label + '] jsdomError: ' + e.message);
  });
  vc.on('error', (...a) => uncaught.push('[' + label + '] console.error: ' + a.map(String).join(' ')));

  const dom = new JSDOM(HTML, {
    url: 'https://example.test/个人中心.html' + (opts.hash || ''),
    runScripts: 'outside-only', // 我们自己控制脚本执行
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() }));
      if (opts.settings) window.localStorage.setItem('study_workbench_settings', opts.settings);
      if (opts.data) window.localStorage.setItem('study_workbench_data', opts.data);
    }
  });

  const { window } = dom;
  // 说明：已注入 study_workbench_auth，getAuth() 为真，app.js 顶部不会触发 location.replace。
  // jsdom 的 location.replace 为只读，勿覆盖。

  const errors = [];
  function runFile(rel) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try { vm.runInContext(code, dom.getInternalVMContext(), { filename: rel }); }
    catch (e) { errors.push(rel + ': ' + e.message); }
  }
  function runInline(code, name) {
    try { vm.runInContext(code, dom.getInternalVMContext(), { filename: name }); }
    catch (e) { errors.push(name + ': ' + e.message); }
  }

  // 执行外部脚本（模拟 defer：DOM 已就绪后按序执行）
  SCRIPTS.forEach(runFile);
  // 执行内联脚本（简化：全部顺序执行；真实浏览器里部分在 DOMContentLoaded/load 触发，
  // 我们额外手动派发事件以保证 renderProfileOverview / SubpageRouter.init 被调用）
  const inlines = collectInlineScripts(HTML);
  inlines.forEach((code, i) => runInline(code, 'inline#' + (i + 1)));

  // 手动派发 DOMContentLoaded + load，驱动 setTimeout(300) 之类逻辑
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  window.dispatchEvent(new window.Event('load', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700)); // 覆盖 renderProfileOverview 的 300ms 定时

  const doc = window.document;
  const result = { label, ok: false, notes: [], scriptErrors: errors.slice() };

  const routerReady = !!(window.SubpageRouter && typeof window.SubpageRouter.navigate === 'function');
  if (!routerReady) {
    result.notes.push('SubpageRouter 未就绪');
    return { result, window, doc };
  }

  const key = opts.subpage;
  window.SubpageRouter.navigate(key);
  await new Promise((r) => setTimeout(r, 500));

  const section = doc.querySelector('[data-subpage="' + key + '"]');
  const inner = doc.getElementById(opts.innerId);

  result.sectionExists = !!section;
  result.sectionDisplay = section ? section.style.display : '(missing)';
  result.innerExists = !!inner;

  const txt = inner ? (inner.textContent || '').trim() : '';
  result.innerText = txt;
  result.isPlaceholder = txt === '' || /^加载中…?$/.test(txt);
  result.hasRealData = opts.dataPattern ? opts.dataPattern.test(txt) : txt.length > 0;

  const card = section ? section.querySelector('.card') : null;
  result.cardDisplay = card ? card.style.display : '(no card)';

  result.ok = result.sectionExists && result.sectionDisplay !== 'none'
    && result.innerExists && !result.isPlaceholder && result.hasRealData
    && (result.cardDisplay === '' || result.cardDisplay === '(no card)');

  return { result, window, doc };
}

(async () => {
  const report = [];
  let pass = 0, fail = 0;
  const caseData = JSON.stringify({
    countdowns: [], mockExams: [], tasks: [],
    stats: { totalHours: 12, totalQuestions: 100, correctQuestions: 80, streakDays: 7, todayMinutes: 30 }
  });
  const settings = JSON.stringify({ dailyNew: 50, focusMinutes: 25, autoSpeak: false, voiceRate: 1, chatNotify: true });

  const cases = [
    ['prefs(有数据)', { subpage: 'prefs', innerId: 'prefBody', hash: '#prefs', settings, data: caseData, dataPattern: /每日新增学习内容：?\s*50/ }],
    ['local-data(有数据)', { subpage: 'local-data', innerId: 'localStats', hash: '#local-data', settings, data: caseData, dataPattern: /总学习|做题数|正确率|连续打卡/ }],
    ['prefs(空数据-边界)', { subpage: 'prefs', innerId: 'prefBody', hash: '#prefs', settings: null, data: null, dataPattern: /每日新增学习内容/ }],
    ['local-data(空数据-边界)', { subpage: 'local-data', innerId: 'localStats', hash: '#local-data', settings: null, data: null, dataPattern: /总学习|做题数|正确率|连续打卡/ }],
  ];

  for (const [label, opts] of cases) {
    const { result } = await runScenario(label, opts);
    report.push(result); result.ok ? pass++ : fail++;
  }

  console.log('\n================ QA Bug1 独立验证 ================');
  report.forEach((r) => {
    console.log('\n--- ' + r.label + ' : ' + (r.ok ? 'PASS' : 'FAIL') + ' ---');
    console.log('  section.exists=' + r.sectionExists + ' section.display="' + r.sectionDisplay + '"');
    console.log('  inner.exists=' + r.innerExists + ' card.display="' + r.cardDisplay + '"');
    console.log('  isPlaceholder=' + r.isPlaceholder + ' hasRealData=' + r.hasRealData);
    console.log('  text="' + (r.innerText || '').slice(0, 200) + '"');
    if (r.scriptErrors && r.scriptErrors.length) console.log('  scriptErrors=' + r.scriptErrors.join(' | '));
    if (r.notes && r.notes.length) console.log('  notes=' + r.notes.join(' | '));
  });
  console.log('\n=============== 汇总: PASS=' + pass + ' FAIL=' + fail + ' ===============');
  console.log('未捕获异常数: ' + uncaught.length);
  uncaught.slice(0, 20).forEach((u) => console.log('  ' + u));
  process.exit(fail > 0 ? 1 : 0);
})();
