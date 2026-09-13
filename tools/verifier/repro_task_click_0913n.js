// 复现：首页点击内置任务条报错（v2：try/finally 落盘 + eval 读 appData）
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';

const html = fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/学习工作台.html', pretendToBeVisual: true });
const w = dom.window;

const out = [];
function log(s) { out.push(s); }
function flush() { try { fs.writeFileSync(path.join(ROOT, 'tools/qa/_repro_task_click.txt'), out.join('\n') + '\n', 'utf8'); } catch (e) { console.log('flush fail ' + e.message); } }

w.addEventListener('error', function (ev) {
  log('[window.error] ' + (ev.error && ev.error.stack ? ev.error.stack : ev.message));
  flush();
});

try { w.eval(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8')); } catch (e) { log('[app.js eval] ' + e.message); }
if (typeof w.showToast !== 'function') { w.showToast = function (m) { log('[showToast] ' + m); }; }

function readTasks() {
  try { return w.eval('JSON.stringify(appData.tasks.map(function(t){return t.id+":"+t.name+":"+t.done}))'); } catch (e) { return 'EVAL_FAIL ' + e.message; }
}

log('typeof toggleTask=' + typeof w.toggleTask + ' updateTopbarStats=' + typeof w.updateTopbarStats + ' updateGoalProgress=' + typeof w.updateGoalProgress);
log('appData.tasks=' + readTasks());

try { w.renderTasks(); } catch (e) { log('[renderTasks throw] ' + e.stack); }
const list = w.document.getElementById('taskList');
log('taskList rows=' + (list ? list.querySelectorAll('.task-item').length : 'NO #taskList'));

const row = list && list.querySelector('.task-item:not(.xt-custom-task)');
if (row) {
  log('clicking onclick=' + row.getAttribute('onclick'));
  try { row.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); log('[click] dispatched, no sync throw'); }
  catch (e) { log('[click throw] ' + e.stack); }
  log('after click tasks=' + readTasks());
} else {
  log('未找到内置任务条');
}

try { w.toggleTask(2); log('[direct toggleTask(2)] ok'); } catch (e) { log('[direct toggleTask(2) throw] ' + e.stack); }
log('final tasks=' + readTasks());
flush();
console.log('done');
