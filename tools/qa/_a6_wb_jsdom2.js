/**
 * A6 · 错题本 AI 分析（C18）验证 v2 —— 修复桩覆盖问题
 * ============================================================================
 * v1 的 bug：beforeParse 里给 window.callAI 打桩，但页面第 273 行会加载
 *   assets/ai-service.js，其第 1078 行 `window.callAI = callAI` 无条件覆盖桩，
 *   导致 S1/S2/S3 实际跑的是真实底座 → 降级场景根本没测到（假绿）。
 *
 * v2 修复：
 *   1) 用 Object.defineProperty 在 window 上定义 callAI 的「只写一次」语义不适用，
 *      改为：在页面 script 全部执行完（load 事件）之后、点击按钮之前，再打一次桩；
 *      并对 callAI 用 defineProperty({configurable:true}) 冻结赋值，防止再被覆盖。
 *   2) 记录 callAI 的真实被调用次数与入参形态，验证「只在点按钮时调用」。
 *   3) 记录所有未捕获错误的消息，便于根因定位。
 *
 * 用法：QA_PORT=8911 node tools/qa/_a6_wb_jsdom2.js
 * 输出：tools/qa/_a6_wb_out2.txt（UTF-8）
 */
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const OUT = 'D:\\下载的文件\\学习工作台\\tools\\qa\\_a6_wb_out2.txt';
const PAGE = '错题本.html';

function makeVC(sink) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => sink.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
  vc.on('error', (...a) => sink.push('ERR: ' + a.map(String).join(' ').slice(0, 400)));
  return vc;
}

const WORNG_IDS = [1001, 1002, 1003];
const WRONG_REASONS = { 1001: '看错了单位', 1002: '公式记混了', 1003: '时间不够蒙的' };

function seedStorage(w, withWrong) {
  const data = { wrongQuestions: withWrong ? WORNG_IDS.slice() : [], tasks: [], notes: [], countdowns: [] };
  const j = JSON.stringify(data);
  w.localStorage.setItem('study_workbench_data', j);
  w.localStorage.setItem('study_workbench_data@shared', j);
  if (withWrong) {
    const r = JSON.stringify(WRONG_REASONS);
    w.localStorage.setItem('study_workbench_wrong_reasons', r);
    w.localStorage.setItem('study_workbench_wrong_reasons@shared', r);
  }
}
function seedBank(w) {
  w.EXAM_BANK = [
    { id: 1001, q: '1 米等于多少厘米？', type: '行测', sub: '常识', o: ['10', '100', '1000', '10000'], a: 1, x: '1 米 = 100 厘米。' },
    { id: 1002, q: '圆的面积公式是？', type: '行测', sub: '数量关系', o: ['2πr', 'πr²', 'πd', '4πr²'], a: 1, x: 'S = πr²。' },
    { id: 1003, q: '下列哪个是质数？', type: '行测', sub: '数量关系', o: ['9', '15', '21', '17'], a: 3, x: '17 只有 1 和自身两个因数。' }
  ];
}

async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { /* 继续 */ }
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/** 在页面脚本全部执行完之后再安装桩（关键修复） */
function installStub(w, kind, rec) {
  let impl;
  if (kind === 'undef') {
    // 彻底移除：delete 后 typeof === 'undefined'
    try { delete w.callAI; } catch (e) { /* ignore */ }
    Object.defineProperty(w, 'callAI', { value: undefined, writable: false, configurable: true });
    return;
  }
  if (kind === 'throw') {
    impl = function (funcType, messages, opts) {
      rec.push({ at: 'throw', funcType, messages: (messages || []).length, opts: Object.keys(opts || {}) });
      throw new Error('A6-stub: callAI boom');
    };
  } else if (kind === 'reject') {
    impl = function (funcType, messages, opts) {
      rec.push({ at: 'reject', funcType, messages: (messages || []).length, opts: Object.keys(opts || {}) });
      return Promise.reject(new Error('A6-stub: network down'));
    };
  } else if (kind === 'resolve') {
    impl = function (funcType, messages, opts) {
      rec.push({ at: 'resolve', funcType, messages: (messages || []).length, opts: Object.keys(opts || {}) });
      if (opts && typeof opts.onChunk === 'function') opts.onChunk('STUB-流式片段', 'STUB-完整回答');
      return Promise.resolve({ text: 'STUB-完整回答', modelUsedName: 'A6-StubModel' });
    };
  } else { // 'spy' —— 只观测不改变行为（记录真实底座被调用）
    const real = w.callAI;
    impl = function (funcType, messages, opts) {
      rec.push({ at: 'spy', funcType, messages: (messages || []).length, opts: Object.keys(opts || {}) });
      return real.apply(w, arguments);
    };
  }
  Object.defineProperty(w, 'callAI', { value: impl, writable: true, configurable: true });
}

async function runScenario(origin, name, opt) {
  const logs = [];
  const vc = makeVC(logs);
  const got = await QA.fetchPage(origin, PAGE);
  const R = ['', '########## ' + name + ' ##########'];
  if (!got.ok) { R.push('FETCH_FAIL HTTP ' + got.status); return R; }

  const rec = [];       // callAI 调用记录
  const dom = new JSDOM(got.html, {
    url: got.url, runScripts: 'dangerously', resources: 'usable',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      QA.baseBeforeParse(origin)(window);
      window.addEventListener('unhandledrejection', ev => {
        logs.push('UNHANDLED_REJECTION: ' + (ev && ev.reason ? String((ev.reason && ev.reason.message) || ev.reason) : 'unknown'));
      });
      window.addEventListener('error', ev => {
        logs.push('WINDOW_ERROR: ' + (ev && ev.message ? ev.message : String(ev)));
      });
      window.__A6_ALERT = [];
      ['alert', 'confirm', 'prompt'].forEach(fn => { window[fn] = function () { window.__A6_ALERT.push(fn); }; });
      window.__A6_REC = rec;
      seedStorage(window, opt.withWrong !== false);
      if (opt.seedBank) seedBank(window);
      // 记录「页面加载期间」是否发生过 callAI 调用（用于验证"不得在加载时自动调用"）
      window.__A6_LOADCALLS = [];
      let impl = window.callAI;
      Object.defineProperty(window, 'callAI', {
        configurable: true,
        get() { return impl; },
        set(v) {
          // ai-service.js 会赋值真实实现；在此拦截并包一层计数
          const wrapped = function () {
            window.__A6_LOADCALLS.push({ funcType: arguments[0], phase: window.__A6_PHASE || 'load' });
            return v.apply(this, arguments);
          };
          impl = wrapped;
        }
      });
      window.__A6_PHASE = 'load';
    }
  });
  const w = dom.window;

  await waitFor(() => w.document.readyState === 'complete', 8000);
  await new Promise(r => setTimeout(r, 1500));

  const loadCalls = (w.__A6_LOADCALLS || []).slice();
  R.push('typeof callAI(加载后) = ' + typeof w.callAI);
  R.push('★ 页面加载期间 callAI 被调用次数 = ' + loadCalls.length + (loadCalls.length ? '  ' + JSON.stringify(loadCalls.slice(0, 5)) : '  （应为 0）'));

  // ==== 关键修复：在页面脚本全部跑完后，再安装测试桩 ====
  w.__A6_PHASE = 'click';
  if (opt.stub) installStub(w, opt.stub, rec);
  R.push('测试桩类型 = ' + (opt.stub || '(不打桩, 真实底座)'));
  R.push('打桩后 typeof callAI = ' + typeof w.callAI);

  const outEl = w.document.getElementById('wbAiModuleOut');
  const bodyLen0 = (w.document.body.textContent || '').length;
  R.push('body 文本长度(初始) = ' + bodyLen0);

  // 点按钮之前，输出区块应为隐藏
  R.push('点击前 #wbAiModuleOut display = ' + (outEl ? outEl.style.display : '(无)'));

  let thrown = '';
  try { w.xtWbAnalyzeModule(); } catch (e) { thrown = String((e && e.message) || e); }

  // 等异步链路落定
  await waitFor(() => outEl && outEl.style.display !== 'none' && (outEl.textContent || '').trim().length > 0, 5000);
  await new Promise(r => setTimeout(r, 800));

  const outText = ((outEl && outEl.textContent) || '').replace(/\s+/g, ' ').trim();
  const outHtml = (outEl && outEl.innerHTML) || '';
  R.push('  同步抛出异常 = ' + (thrown ? ('YES: ' + thrown) : 'NO'));
  R.push('  输出区块 display = ' + (outEl ? outEl.style.display : '(无)'));
  R.push('  输出区块文本 = ' + (outText ? outText.slice(0, 300) : '(空)'));
  R.push('  点击阶段 callAI 调用记录 = ' + (rec.length ? JSON.stringify(rec.slice(0, 4)) : '(无)'));

  // 降级态判定：是否出现「AI 暂时不可用」提示块
  const degradedShown = /AI 暂时不可用/.test(outHtml);
  const emptyShown = /错题本还是空的/.test(outHtml);
  R.push('  含「AI 暂时不可用」降级提示 = ' + degradedShown);
  R.push('  含「错题本还是空的」空态提示 = ' + emptyShown);

  const toastEl = w.document.getElementById('toast');
  R.push('  #toast 文本 = ' + (toastEl ? ((toastEl.textContent || '').trim().slice(0, 160) || '(空)') : '(无节点)'));

  const bodyLen1 = (w.document.body.textContent || '').length;
  R.push('body 文本长度(点击后) = ' + bodyLen1);
  R.push('原生弹窗调用记录 = ' + JSON.stringify(w.__A6_ALERT || []));

  const errs = logs.filter(x => /JSDOM_ERR|ERR:|UNHANDLED_REJECTION|WINDOW_ERROR/.test(x));
  R.push('运行时错误数 = ' + errs.length);
  errs.slice(0, 8).forEach(e => R.push('   ' + e));

  // 断言
  const expect = opt.expect || {};
  const A = [];
  A.push(['无同步抛出', !thrown]);
  A.push(['面板有可见内容', !!(outEl && outEl.style.display !== 'none' && outText.length > 0)]);
  A.push(['页面不白屏', bodyLen1 > 500]);
  A.push(['未用原生弹窗', (w.__A6_ALERT || []).length === 0]);
  A.push(['加载期未自动调 AI', loadCalls.length === 0]);
  if (expect.degraded) A.push(['显示降级提示(AI暂时不可用)', degradedShown]);
  if (expect.empty) A.push(['显示空态提示', emptyShown]);
  if (expect.clickCalled) A.push(['点击后确实调了 callAI', rec.length > 0]);
  A.push(['无未捕获异常/未处理拒绝', logs.filter(x => /UNHANDLED_REJECTION|WINDOW_ERROR|JSDOM_ERR/.test(x)).length === 0]);
  R.push('-- 断言 --');
  A.forEach(([k, v]) => R.push('  [' + (v ? 'PASS' : 'FAIL') + '] ' + k));

  w.close();
  return R;
}

(async () => {
  const all = [];
  const src = await QA.resolve();
  all.push(QA.sourceBanner(src));
  all.push('目标页面 = ' + PAGE + '   （桩在页面脚本执行完毕后安装，规避 ai-service.js 覆盖）');

  try {
    all.push(...await runScenario(src.origin, 'S0 基线 · 真实底座 + 有错题（验证 loading 期不自动调 AI）', {
      withWrong: true, seedBank: true, stub: 'spy', expect: {}
    }));
    all.push(...await runScenario(src.origin, 'S1 降级 · callAI 未定义', {
      withWrong: true, seedBank: true, stub: 'undef', expect: { degraded: true }
    }));
    all.push(...await runScenario(src.origin, 'S2 降级 · callAI 同步抛异常', {
      withWrong: true, seedBank: true, stub: 'throw', expect: { degraded: true, clickCalled: true }
    }));
    all.push(...await runScenario(src.origin, 'S3 降级 · callAI 返回 rejected', {
      withWrong: true, seedBank: true, stub: 'reject', expect: { degraded: true, clickCalled: true }
    }));
    all.push(...await runScenario(src.origin, 'S3b 正常 · callAI resolve（验证成功渲染路径）', {
      withWrong: true, seedBank: true, stub: 'resolve', expect: { clickCalled: true }
    }));
    all.push(...await runScenario(src.origin, 'S4 空态 · 错题本为空 + callAI 未定义', {
      withWrong: false, seedBank: false, stub: 'undef', expect: { empty: true }
    }));
    all.push(...await runScenario(src.origin, 'S5 空态 · 错题本为空 + 真实底座', {
      withWrong: false, seedBank: false, expect: { empty: true }
    }));
  } catch (e) {
    all.push('HARNESS_ERROR: ' + (e && e.stack ? e.stack : e));
  }

  fs.writeFileSync(OUT, all.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
