#!/usr/bin/env node
/* kou-l-home 静态自检：首页任务卡增强 + 各模块进度布局重构（只查 学习工作台.html） */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, '学习工作台.html');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
}

let html = '';
try { html = fs.readFileSync(PAGE, 'utf8'); }
catch (e) { console.error('FATAL: cannot read page: ' + e.message); process.exit(2); }

// 断言1：＋添加按钮存在（渲染函数输出 xt-task-add，且 onclick 指向 openXtTaskModal）
check('plus-add-button-rendered',
  html.includes('xt-task-add') && html.includes('onclick="openXtTaskModal()"'),
  'xt-task-add + openXtTaskModal');

// 断言2：localStorage 读写函数存在（key=xt_custom_tasks_v1，含 getItem/setItem + JSON 持久化）
check('localStorage-rw-functions',
  html.includes("STORE_KEY = 'xt_custom_tasks_v1'")
    && html.includes('localStorage.getItem(storeKey())')
    && html.includes('localStorage.setItem(storeKey()')
    && html.includes('JSON.stringify(tasks)'),
  'xt_custom_tasks_v1 + load/save + JSON');

// 断言3：勾选框渲染函数存在（renderXtCustomTasks 输出 task-checkbox，且支持 done 切换）
check('checkbox-render-function',
  html.includes('function renderXtCustomTasks()')
    && html.includes('<div class="task-checkbox">✓</div>')
    && html.includes("t.done ? ' done' : ''"),
  'renderXtCustomTasks + task-checkbox + done toggle');

// 断言4：各模块进度卡容器存在，且页内有布局重构覆盖样式（两列网格 + 卡内 grid-areas）
check('module-progress-grid-container',
  html.includes('id="moduleProgressGrid"')
    && html.includes('.module-progress-grid {')
    && html.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
    && html.includes('grid-template-areas'),
  'moduleProgressGrid + 2-col grid override + card grid-areas');

// 附加断言：弹窗 DOM 存在、renderTasks 包装挂载点存在、动态图标补渲染已调用
check('add-task-modal-dom', html.includes('id="xtTaskModal"') && html.includes('id="xtTaskName"'), 'xtTaskModal');
check('renderTasks-wrapper-hook', html.includes('window.renderTasks = wrapped') && html.includes('__xtWrapped'), 'wrapper');
check('lucide-autorender-after-insert', html.includes('window.lucideAutoRender()'), 'lucideAutoRender()');

// 输出
let pass = 0, fail = 0;
const lines = [];
lines.push('===== kou-l-home static check @ ' + new Date().toISOString() + ' =====');
for (const r of results) {
  lines.push((r.ok ? '[PASS] ' : '[FAIL] ') + r.name + (r.detail ? '  -- ' + r.detail : ''));
  r.ok ? pass++ : fail++;
}
lines.push('-----');
lines.push('TOTAL: ' + results.length + '  PASS: ' + pass + '  FAIL: ' + fail);
const verdict = 'IS_PASS: ' + (fail === 0 ? 'YES' : 'NO');
lines.push(verdict);
const out = lines.join('\n');
console.log(out);
fs.writeFileSync(path.join(__dirname, '_l_home_check.log'), out + '\n');
process.exit(fail === 0 ? 0 : 1);
