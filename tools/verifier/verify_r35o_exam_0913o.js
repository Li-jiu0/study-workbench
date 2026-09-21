// R35 遗留验证：题库（exam-bank）加载链改用 fetchJSONAnywhere + 一次性 toast
// 关键 1：测试代码必须拼到同一段 eval（appData / EXAM_BANK 是 let/const 词法绑定，分开 eval 拿不到）
// 关键 2：showToast 是顶层函数声明 → 会在 eval 开始时成为全局属性，
//        因此在同一段 eval 内接管 window.showToast 才能拦到后续调用（外部先设的桩会被覆盖）。
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
  var results = [];
  function check(name, fn){ try { fn(); results.push('PASS ' + name); } catch (e) { results.push('FAIL ' + name + ' :: ' + e.message); } }

  // 接管 toast：记录全部弹窗，用于验证「只弹一次」
  window.__toastLog = [];
  var __origToast = (typeof showToast === 'function') ? showToast : function () {};
  window.showToast = function (m) { window.__toastLog.push(String(m)); try { __origToast(m); } catch (e) {} };

  check('fetchJSONAnywhere_exists', function () {
    if (typeof fetchJSONAnywhere !== 'function') throw new Error('fetchJSONAnywhere 未定义');
  });

  check('notifyDataLoadFailed_once', function () {
    notifyDataLoadFailed('__probe1__', 'probe');
    notifyDataLoadFailed('__probe1__', 'probe');
    notifyDataLoadFailed('__probe1__', 'probe');
    var cnt = window.__toastLog.filter(function (m) { return m.indexOf('__probe1__') >= 0; }).length;
    if (cnt !== 1) throw new Error('重复弹窗 ' + cnt + ' 次（应为 1）');
  });

  check('notifyVocabExtFailed_message_kept', function () {
    notifyVocabExtFailed();
    var hit = window.__toastLog.filter(function (m) { return m.indexOf('词库扩展加载失败') >= 0; });
    if (hit.length === 0) throw new Error('词库扩展 toast 文案丢失（R35 既有行为被破坏）');
  });

  check('exam_loader_no_sync_throw', function () {
    var before = EXAM_BANK.length;
    loadExamBankExt();                                        // jsdom 下 fetch/XHR 均失败 → 应静默走 catch
    loadExamBankShard('assets/data/__not_exist__.json');
    if (EXAM_BANK.length < before) throw new Error('EXAM_BANK 被异常改写');
  });

  check('loadExamBankShard_returns_promise', function () {
    var r = loadExamBankShard('assets/data/__not_exist__.json');
    if (!r || typeof r.then !== 'function') throw new Error('未返回 Promise');
    r.catch(function () {});
  });

  check('exam_chain_no_raw_fetch', function () {
    var src = String(loadExamBankExt) + String(loadExamBankShard);
    if (/[^a-zA-Z]fetch\\s*\\(/.test(src)) throw new Error('题库链仍残留裸 fetch：' + src.slice(0, 120));
  });

  // 等异步兜底链跑完再收口，确认最终只有「题库扩展」一条 toast
  setTimeout(function () {
    var examToasts = window.__toastLog.filter(function (m) { return m.indexOf('题库扩展加载失败') >= 0; });
    results.push((examToasts.length <= 1 ? 'PASS' : 'FAIL') + ' exam_failure_toast_once :: 共 ' + examToasts.length + ' 条');
    results.push('INFO exam_bank_count=' + EXAM_BANK.length);
    window.__R35O_RESULTS = results.join('\\n');
  }, 1500);

  // 同步阶段先给个兜底结果，避免异步未完成时空指针
  window.__R35O_RESULTS = results.join('\\n') + '\\n(awaiting async)';
})();
`;
try { w.eval(appjs + '\n' + harness); }
catch (e) { console.log('EVAL_THROW', e.message); w.__R35O_RESULTS = 'EVAL_THROW ' + e.message; }

setTimeout(function () {
  const out = (w.__R35O_RESULTS || '(no results)') + '\n\n[toast log]\n  ' + ((w.__toastLog || []).join('\n  ') || '(none)');
  console.log(out);
  try { fs.writeFileSync(path.join(ROOT, 'tools/qa/_r35o_verify.txt'), out + '\n'); } catch (e) { console.log('write fail ' + e.message); }
  process.exit(0);
}, 2500);
