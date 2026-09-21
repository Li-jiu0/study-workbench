/* =====================================================================
   tools/qa/_r44_qa_sandbox.js —— R44 第二层 QA 独立最小 DOM 沙箱 runner
   读 私聊.html + assets/chat-local.js，在 jsdom 中 eval 页内脚本
   （tools/qa/_r44_qa_sandbox_page.js），把结果落盘 tools/qa/_r44_qa_sandbox_out.txt。
   依赖 jsdom：NODE_PATH 指向 tools/verifier/node_modules（项目既有，不新增依赖）。

   用法：NODE_PATH=D:/下载的文件/学习工作台/tools/verifier/node_modules \
         node tools/qa/_r44_qa_sandbox.js
   ===================================================================== */
'use strict';
// 页内 harness 若有未捕获的异步异常，不要静默丢结果
process.on('unhandledRejection', function (e) {
  console.log('UNHANDLED_REJECTION :: ' + (e && e.message ? e.message : String(e)));
});
var fs = require('fs');
var path = require('path');
var { JSDOM } = require('jsdom');

var ROOT = 'D:/下载的文件/学习工作台';
var OUT = path.join(ROOT, 'tools', 'qa', '_r44_qa_sandbox_out.txt');

var html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
var chatjs = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
var pagejs = fs.readFileSync(path.join(ROOT, 'tools', 'qa', '_r44_qa_sandbox_page.js'), 'utf8');

var dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
var w = dom.window;

var __fetchImpl = function () {
  return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({}); } });
};
w.__setFetch = function (fn) { __fetchImpl = fn; };
w.fetch = function () { return __fetchImpl.apply(null, arguments); };
w.__intervals = [];
w.setInterval = function (fn, ms) { w.__intervals.push({ ms: ms, fn: fn }); return w.__intervals.length; };
w.clearInterval = function () { };
// 外部依赖（assets/api.js 未加载）：只补一个 apiBase，其余走真实本地实现
w.apiBase = function () { return ''; };
w.eval(chatjs);

setTimeout(function () {
  try {
    w.eval(pagejs);
  } catch (e) {
    w.__R44QA_RESULTS = 'HARNESS_EVAL_THROW ' + e.name + ' :: ' + e.message;
  }
  setTimeout(function () {
    var body = w.__R44QA_RESULTS || '(no results — 页内异步未跑完)';
    var pass = (body.match(/\bPASS\b/g) || []).length;
    var fail = (body.match(/\bFAIL\b/g) || []).length;
    var lines = [];
    lines.push('===== R44 第二层 QA · 最小 DOM 沙箱（管理员回复 → loadChats → 会话列表） =====');
    lines.push('jsdom=' + require(path.join(ROOT, 'tools', 'verifier', 'node_modules', 'jsdom', 'package.json')).version);
    lines.push('时间: ' + new Date().toISOString());
    lines.push('捕获 interval: ' + (w.__intervals || []).map(function (x) { return x.ms; }).join(','));
    lines.push('');
    lines.push(body);
    lines.push('');
    lines.push('--- 汇总 --- PASS=' + pass + '  FAIL=' + fail);
    lines.push(fail === 0 ? 'IS_PASS: YES' : 'IS_PASS: NO');
    fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
    console.log(lines.join('\n'));
    process.exit(0);
  }, 3000);
}, 400);
