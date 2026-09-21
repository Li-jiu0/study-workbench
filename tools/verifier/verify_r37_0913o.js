// R37 验证脚本 v2：把测试代码拼到同一段 eval 里，使 let appData 在词法作用域内可见
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

const harness = `
;(function(){
  const results=[];
  function check(name,fn){ try{ fn(); results.push('PASS '+name);}catch(e){ results.push('FAIL '+name+' :: '+e.message);} }
  // 以下符号均在 appjs 同一段 eval 的词法作用域内
  check('updateTopbarStats_nullsafe', function(){ updateTopbarStats(); });
  check('renderTasks_preserves_custom', function(){
    const list=document.getElementById('taskList');
    if(!list) throw new Error('#taskList missing');
    const c=document.createElement('div'); c.className='xt-custom-task'; c.setAttribute('data-id','c1'); c.textContent='自定义A';
    list.appendChild(c);
    appData.tasks=[]; renderTasks();
    if(!list.querySelector('.xt-custom-task[data-id="c1"]')) throw new Error('自定义任务节点被误删');
  });
  check('toggleTask_unknown_id_safe', function(){ appData.tasks=[]; toggleTask(99); });
  check('loadData_clears_builtin', function(){
    appData.tasks=[{id:1,name:'内置',module:'cet',done:false,progress:0}]; loadData();
    if(appData.tasks.length!==0) throw new Error('内置任务未清空 len='+appData.tasks.length);
  });
  if(typeof DEFAULT_DATA!=='undefined'){
    check('DEFAULT_DATA_tasks_empty', function(){ if(DEFAULT_DATA.tasks.length!==0) throw new Error('DEFAULT 仍含内置任务'); });
  } else {
    results.push('SKIP DEFAULT_DATA_tasks_empty (app.js 未定义 DEFAULT_DATA)');
  }
  window.__R37_RESULTS = results.join('\\n');
})();
`;
try { w.eval(appjs + '\n' + harness); }
catch (e) { console.log('EVAL_THROW', e.message); w.__R37_RESULTS = 'EVAL_THROW ' + e.message; }
const out = w.__R37_RESULTS || '(no results)';
console.log(out);
fs.writeFileSync(path.join(ROOT, 'tools/qa/_r37_verify.txt'), out + '\n');
process.exit(0);
