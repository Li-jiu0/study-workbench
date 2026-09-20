// R37 边界测试：模拟「旧 localStorage 含内置 5 条任务」的存档升级场景
// 目标：验证 loadData 强制清空内置任务后，首页不再渲染任何 .task-item，
//       且 updateTopbarStats / toggleTask 在全链路下不再抛 TypeError。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

// 模拟旧版存档：内置 5 条任务
const oldSave = {
  tasks: [
    { id: 1, name: '背单词',     module: 'cet',       done: false, progress: 30 },
    { id: 2, name: '做真题',     module: 'exam',      done: false, progress: 10 },
    { id: 3, name: '练表达',     module: 'comm',      done: false, progress: 50 },
    { id: 4, name: '模拟面试',   module: 'interview', done: false, progress: 0  },
    { id: 5, name: '做 PPT',     module: 'ppt',       done: false, progress: 20 },
  ],
};

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

// ---- 关键：在 eval app.js（自动初始化）之前，预置旧存档 ----
w.localStorage.setItem('study_workbench_data', JSON.stringify(oldSave));

// 捕获控制台 TypeError / 运行时异常
let consoleTypeError = null;
const origErr = w.console.error.bind(w.console);
w.console.error = function (...a) {
  const msg = a.map(String).join(' ');
  if (/TypeError/.test(msg) && !consoleTypeError) consoleTypeError = msg;
  origErr(...a);
};
let windowError = null;
w.addEventListener('error', (e) => {
  const m = (e && (e.message || (e.error && e.error.message))) || 'unknown';
  if (!windowError) windowError = 'window.error: ' + m;
});

const harness = `
;(function () {
  const R = [];
  function step(name, fn) {
    try { fn(); R.push('PASS ' + name); }
    catch (e) { R.push('FAIL ' + name + ' :: ' + e.name + ' :: ' + e.message); }
  }
  // 1) 自动初始化（eval 期间已触发 loadData/renderHome）后，显式再跑一遍核心链路
  step('loadData_idempotent', () => { loadData(); });
  step('renderTasks_safe',    () => { renderTasks(); });
  step('updateTopbarStats_safe', () => { updateTopbarStats(); });
  step('updateGoalProgress_safe', () => { updateGoalProgress(); });
  // 2) 复现「用户点击旧内置任务 #1」——若 tasks 未清空，find 会命中并走到崩溃链路
  step('toggleTask_old_builtin_id_safe', () => { toggleTask(1); });
  // 3) 断言：页面无任何 .task-item（内置任务条已不渲染）
  const items = document.querySelectorAll('.task-item');
  if (items.length === 0) R.push('PASS no_task_item_rendered');
  else R.push('FAIL task_items_present count=' + items.length);
  // 4) 断言：appData.tasks 已被清空
  if (appData.tasks && appData.tasks.length === 0) R.push('PASS tasks_cleared');
  else R.push('FAIL tasks_not_cleared len=' + (appData.tasks ? appData.tasks.length : 'n/a'));
  // 5) 断言：localStorage 落盘后不再含内置任务（saveData 不会回写 tasks）
  try {
    const persisted = JSON.parse(localStorage.getItem('study_workbench_data') || '{}');
    if (!Array.isArray(persisted.tasks) || persisted.tasks.length === 0) R.push('PASS persisted_no_builtin_tasks');
    else R.push('FAIL persisted_still_has_tasks len=' + persisted.tasks.length);
  } catch (e) { R.push('FAIL persisted_parse :: ' + e.message); }
  window.__R37_EDGE = R.join('\\n');
})();
`;

let evalThrow = null;
try {
  w.eval(appjs + '\n' + harness);
} catch (e) {
  evalThrow = e.name + ' :: ' + e.message;
}

const results = w.__R37_EDGE || '(no edge results)';
const lines = [];
lines.push('===== R37 边界测试（旧 localStorage 含内置 5 条任务）=====');
lines.push('运行时间: ' + new Date().toISOString());
lines.push('');
lines.push('--- eval 阶段（自动初始化 loadData/renderHome）---');
lines.push(evalThrow ? ('THROW ' + evalThrow) : 'OK 无异常抛出（自动初始化未崩溃）');
lines.push('');
lines.push('--- 断言结果 ---');
lines.push(results);
lines.push('');
lines.push('--- 控制台/运行时错误捕获 ---');
lines.push('consoleTypeError: ' + (consoleTypeError || '无'));
lines.push('windowError:      ' + (windowError || '无'));
lines.push('');
const passCount = (results.match(/PASS/g) || []).length;
const failCount = (results.match(/FAIL/g) || []).length;
lines.push('--- 结论 ---');
lines.push('PASS=' + passCount + '  FAIL=' + failCount + (evalThrow ? '  EVAL_THROW=1' : '  EVAL_THROW=0'));
lines.push((failCount === 0 && !evalThrow && !consoleTypeError && !windowError)
  ? 'RESULT: PASS —— R37 边界（旧存档升级）无崩溃、无内置任务渲染'
  : 'RESULT: FAIL —— 见上方 FAIL/THROW 明细');

const out = lines.join('\n');
fs.writeFileSync(path.join(ROOT, 'tools/qa/_r37_qa_edge.txt'), out + '\n');
console.log(out);
process.exit(0);
