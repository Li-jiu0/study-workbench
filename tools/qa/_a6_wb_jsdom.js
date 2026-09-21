/**
 * A6 · 错题本 AI 分析（C18）验证 —— 加载真实完整页面 + 注入 callAI 桩驱动
 * ============================================================================
 * 为什么必须加载真实页面：只测服务层（ai-service.js）会"假绿"——
 *   本次要验证的是"页面在 AI 不可用 / 错题本为空时是否白屏/报错"，
 *   属于页面级行为，必须在真实 DOM + 真实内联脚本里跑。
 *
 * 场景：
 *   S0 基线          —— 不注入桩，走 ai-service.js 真实底座（验证页面能正常加载、无运行时错误）
 *   S1 callAI 未定义 —— delete window.callAI
 *   S2 callAI 抛异常 —— callAI 同步 throw
 *   S3 callAI reject —— callAI 返回 rejected Promise
 *   S4 空错题本      —— localStorage 无 wrongQuestions，点「分析本模块」
 *
 * 断言：
 *   - 无未捕获异常 / unhandledrejection
 *   - 页面不白屏（body 文本长度合理、关键 DOM 仍在）
 *   - 面板有用户可见错误提示（走页内区块 + toast，非原生 alert）
 *
 * 用法：QA_PORT=8911 node tools/qa/_a6_wb_jsdom.js
 * 输出：D:\下载的文件\学习工作台\tools\qa\_a6_wb_out.txt（UTF-8）
 */
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const OUT = 'D:\\下载的文件\\学习工作台\\tools\\qa\\_a6_wb_out.txt';
const PAGE = '错题本.html';

/** 收集一轮 jsdom 的运行时错误 */
function makeVC(sink) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => sink.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
  vc.on('error', (...a) => sink.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));
  return vc;
}

/**
 * 造一份"有错题"的 localStorage 数据（含 EXAM_BANK 回表所需结构）。
 * 注意：真实页面里 EXAM_BANK 由 assets/app.js 提供；这里只塞 localStorage，
 *       让 allQuestions() 走 wrongIds()+bank() 分支或 getWrongDetails 分支。
 */
const WORNG_IDS = [1001, 1002, 1003];
const WRONG_REASONS = { 1001: '看错了单位', 1002: '公式记混了', 1003: '时间不够蒙的' };

function seedStorage(w, withWrong) {
  const data = {
    wrongQuestions: withWrong ? WORNG_IDS.slice() : [],
    tasks: [], notes: [], countdowns: []
  };
  // 账号键 + 裸键双写，兼容 akey() 的两种查找路径
  w.localStorage.setItem('study_workbench_data', JSON.stringify(data));
  w.localStorage.setItem('study_workbench_data@shared', JSON.stringify(data));
  if (withWrong) {
    const r = JSON.stringify(WRONG_REASONS);
    w.localStorage.setItem('study_workbench_wrong_reasons', r);
    w.localStorage.setItem('study_workbench_wrong_reasons@shared', r);
  }
}

/** 让 EXAM_BANK 可用（页面脚本只读 window.EXAM_BANK），造 3 道题 */
function seedBank(w) {
  w.EXAM_BANK = [
    { id: 1001, q: '1 米等于多少厘米？', type: '行测', sub: '常识', o: ['10', '100', '1000', '10000'], a: 1, x: '1 米 = 100 厘米。' },
    { id: 1002, q: '圆的面积公式是？', type: '行测', sub: '数量关系', o: ['2πr', 'πr²', 'πd', '4πr²'], a: 1, x: 'S = πr²。' },
    { id: 1003, q: '下列哪个是质数？', type: '行测', sub: '数量关系', o: ['9', '15', '21', '17'], a: 3, x: '17 只有 1 和自身两个因数。' }
  ];
}

/** 等待条件成立（轮询），超时返回 false */
async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) { /* 继续等 */ }
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

async function runScenario(origin, name, opt) {
  const logs = [];
  const vc = makeVC(logs);
  const got = await QA.fetchPage(origin, PAGE);
  const R = ['', '########## ' + name + ' ##########'];
  if (!got.ok) {
    R.push('FETCH_FAIL ' + PAGE + ' HTTP ' + got.status);
    return R;
  }

  const dom = new JSDOM(got.html, {
    url: got.url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      QA.baseBeforeParse(origin)(window);
      // 捕获未处理 Promise 拒绝（jsdom 里 window 上有该事件）
      window.addEventListener('unhandledrejection', ev => {
        logs.push('UNHANDLED_REJECTION: ' + (ev && ev.reason ? String(ev.reason && ev.reason.message || ev.reason) : 'unknown'));
      });
      window.addEventListener('error', ev => {
        logs.push('WINDOW_ERROR: ' + (ev && ev.message ? ev.message : String(ev)));
      });
      seedStorage(window, opt.withWrong !== false);
      if (opt.seedBank) seedBank(window);
      // 桩注入必须在页面脚本执行前完成（beforeParse 正是这个时机）
      if (opt.patch) opt.patch(window);
      // 记录 alert/confirm/prompt 是否被调用（铁律：禁原生弹窗）
      window.__A6_ALERT = [];
      ['alert', 'confirm', 'prompt'].forEach(fn => {
        const orig = window[fn];
        window[fn] = function () { window.__A6_ALERT.push(fn); return orig ? undefined : undefined; };
      });
    }
  });
  const w = dom.window;

  // 等页面初始化（DOMContentLoaded + defer 脚本 + load 增强）
  await waitFor(() => w.document.readyState === 'complete', 8000);
  await new Promise(r => setTimeout(r, 1200));

  R.push('typeof callAI      = ' + typeof w.callAI);
  R.push('typeof xtWbAnalyzeModule = ' + typeof w.xtWbAnalyzeModule);
  R.push('typeof xtWbAnalyzeOne    = ' + typeof w.xtWbAnalyzeOne);
  R.push('typeof renderWrongBook   = ' + typeof w.renderWrongBook);
  const bodyLen0 = (w.document.body.textContent || '').length;
  R.push('body 文本长度(初始) = ' + bodyLen0);
  R.push('DOM 关键节点: #wrongList=' + !!w.document.getElementById('wrongList')
    + ' #wbAiPanel=' + !!w.document.getElementById('wbAiPanel')
    + ' #wbAiModuleOut=' + !!w.document.getElementById('wbAiModuleOut')
    + ' #wbAiModuleSel=' + !!w.document.getElementById('wbAiModuleSel'));

  // 点击「分析本模块」
  const outEl = w.document.getElementById('wbAiModuleOut');
  R.push('点击按钮 → xtWbAnalyzeModule()');
  let thrown = '';
  try { w.xtWbAnalyzeModule(); } catch (e) { thrown = String(e && e.message || e); }
  R.push('  document.getElementById("wbAiModuleOut") 存在 = ' + !!outEl);

  // 等异步降级链路落定（Promise.resolve(p).catch 是微任务，但保险起见给足时间）
  await waitFor(() => outEl && outEl.style.display !== 'none' && (outEl.innerHTML || '').length > 0, 4000);
  await new Promise(r => setTimeout(r, 600));

  const outText = ((outEl && outEl.textContent) || '').replace(/\s+/g, ' ').trim();
  const outHtml = (outEl && outEl.innerHTML) || '';
  R.push('  同步抛出异常 = ' + (thrown ? ('YES: ' + thrown) : 'NO'));
  R.push('  输出区块 display = ' + (outEl ? outEl.style.display : '(无)'));
  R.push('  输出区块文本 = ' + (outText ? outText.slice(0, 320) : '(空)'));
  R.push('  输出区块含 thinking/empty 类 = ' + (/wb-ai-(thinking|empty|h)/.test(outHtml)));

  // toast 是否出现（xt-toast.js 提供 window.xtToast → 渲染 #toast 或自建节点）
  const toastEl = w.document.getElementById('toast');
  const toastTxt = toastEl ? (toastEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
  R.push('  #toast 文本 = ' + (toastTxt ? toastTxt.slice(0, 200) : '(空)'));

  const bodyLen1 = (w.document.body.textContent || '').length;
  R.push('body 文本长度(点击后) = ' + bodyLen1 + '  （白屏判定线 > 500）');

  R.push('原生弹窗调用记录 = ' + JSON.stringify(w.__A6_ALERT || []));
  const errs = logs.filter(x => /JSDOM_ERR|ERR:|UNHANDLED_REJECTION|WINDOW_ERROR/.test(x));
  R.push('运行时错误数 = ' + errs.length);
  errs.slice(0, 10).forEach(e => R.push('   ' + e));

  // 逐条断言
  const A = [];
  A.push(['不白屏(body>500)', bodyLen1 > 500]);
  A.push(['有用户可见输出区块', !!(outEl && outEl.style.display !== 'none' && outText.length > 0)]);
  A.push(['无同步抛出', !thrown]);
  A.push(['无未捕获异常/未处理拒绝', errs.filter(x => /UNHANDLED_REJECTION|WINDOW_ERROR|JSDOM_ERR/.test(x)).length === 0]);
  A.push(['未用原生弹窗', (w.__A6_ALERT || []).length === 0]);
  R.push('-- 断言 --');
  A.forEach(([k, v]) => R.push('  [' + (v ? 'PASS' : 'FAIL') + '] ' + k));

  w.close();
  return R;
}

(async () => {
  const all = [];
  const src = await QA.resolve();
  all.push(QA.sourceBanner(src));
  all.push('目标页面 = ' + PAGE);

  try {
    // S0：真实底座基线（不 patch），有错题
    all.push(...await runScenario(src.origin, 'S0 基线（真实 ai-service 底座 · 有错题）', { withWrong: true, seedBank: true }));

    // S1：callAI 未定义
    all.push(...await runScenario(src.origin, 'S1 降级 · callAI 未定义', {
      withWrong: true, seedBank: true,
      patch(w) { try { delete w.callAI; } catch (e) { w.callAI = undefined; } }
    }));

    // S2：callAI 同步抛异常
    all.push(...await runScenario(src.origin, 'S2 降级 · callAI 抛异常', {
      withWrong: true, seedBank: true,
      patch(w) { w.callAI = function () { throw new Error('A6-stub: callAI boom'); }; }
    }));

    // S3：callAI 返回 rejected Promise
    all.push(...await runScenario(src.origin, 'S3 降级 · callAI 返回 rejected', {
      withWrong: true, seedBank: true,
      patch(w) { w.callAI = function () { return Promise.reject(new Error('A6-stub: network down')); }; }
    }));

    // S4：空错题本（localStorage 无 wrongQuestions）+ 基座异常（最恶劣组合）
    all.push(...await runScenario(src.origin, 'S4 空态 · 错题本为空 + callAI 未定义', {
      withWrong: false, seedBank: false,
      patch(w) { try { delete w.callAI; } catch (e) { w.callAI = undefined; } }
    }));

    // S5：空错题本 + 正常底座
    all.push(...await runScenario(src.origin, 'S5 空态 · 错题本为空 + 真实底座', {
      withWrong: false, seedBank: false
    }));
  } catch (e) {
    all.push('HARNESS_ERROR: ' + (e && e.stack ? e.stack : e));
  }

  fs.writeFileSync(OUT, all.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
