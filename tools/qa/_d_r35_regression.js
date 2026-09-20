// ===================================================================
// D 线独立证伪回归（R35 题库链，commit d193b2d，仅 assets/app.js）
// 与开发自检 verify_r35o_exam_0913o.js 独立：本脚本用「fetch 一律拒绝 +
// 可控 XHR 桩」显式实测「fetch 失败 → XHR 兜底 → 数据真的加载到」这一核心需求。
// 输出写入 tools/qa/_d_r35_regression.txt（本机 stdout 捕获不稳，统一写文件）。
// ===================================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

// ---- 桩 1：fetch 一律「异步拒绝」（模拟 file:// 下 fetch 被拒）----
w.__fetchCalls = [];
w.fetch = function (url) {
  w.__fetchCalls.push(String(url));
  return Promise.reject(new Error('fetch blocked (simulated file://) ' + url));
};

// ---- 桩 2：可控 XMLHttpRequest（默认全体失败，可用 __xhrForceFail 切换）----
w.__xhrCalls = [];
w.__xhrForceFail = true; // 初始：全体失败 → 触发失败提示/兜底路径
w.__xhrResponder = function () { return { fail: true, status: 500 }; };
function FakeXHR() {
  this.readyState = 0; this.status = 0; this.responseText = '';
  this.onreadystatechange = null; this.onerror = null;
}
FakeXHR.prototype.open = function (m, url) { this._url = String(url); this.readyState = 1; };
FakeXHR.prototype.send = function () {
  var self = this;
  w.__xhrCalls.push(self._url);
  setTimeout(function () {
    function finish(status, text) {
      self.status = status; self.responseText = text || ''; self.readyState = 4;
      if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
    }
    if (w.__xhrForceFail) { finish(500, ''); return; }
    var r = null;
    try { r = w.__xhrResponder(self._url); } catch (e) { r = null; }
    if (!r || r.fail) { finish((r && r.status) || 500, ''); return; }
    finish(200, JSON.stringify(r.body));
  }, 0);
};
w.XMLHttpRequest = FakeXHR;

const harness = `
;(function(){
  var R = [];
  function check(name, fn){ try { fn(); R.push('PASS ' + name); } catch (e) { R.push('FAIL ' + name + ' :: ' + e.message); } }

  // 接管 toast（showToast 是顶层函数声明 → 覆盖 window.showToast 可拦到后续调用）
  window.__toastLog = [];
  var __origToast = (typeof showToast === 'function') ? showToast : function () {};
  window.showToast = function (m) { window.__toastLog.push(String(m)); try { __origToast(m); } catch (e) {} };

  // ---------- 同步断言 ----------
  check('D1_exam_chain_no_raw_fetch', function () {
    var src = String(loadExamBankExt) + String(loadExamBankShard);
    if (/[^a-zA-Z]fetch\\s*\\(/.test(src)) throw new Error('题库链仍残留裸 fetch');
  });
  check('D1b_exam_chain_no_direct_xhr', function () {
    var src = String(loadExamBankExt) + String(loadExamBankShard);
    if (/XMLHttpRequest/.test(src)) throw new Error('题库链直接引用了 XMLHttpRequest（应仅走 fetchJSONAnywhere）');
  });
  check('D5_builtin_exam_bank_60', function () {
    if (EXAM_BANK.length !== 60) throw new Error('内置题库条数=' + EXAM_BANK.length + '（应为 60）');
  });
  check('D4a_vocab_msg_source_kept', function () {
    var s = String(notifyVocabExtFailed);
    if (s.indexOf('⚠️ 词库扩展加载失败，当前仅显示内置词表') < 0) throw new Error('R35 原文案丢失: ' + s);
  });
  check('D3a_notify_once_sync', function () {
    notifyDataLoadFailed('__probe1__', 'x'); notifyDataLoadFailed('__probe1__', 'x'); notifyDataLoadFailed('__probe1__', 'x');
    var c = window.__toastLog.filter(function (m) { return m.indexOf('__probe1__') >= 0; }).length;
    if (c !== 1) throw new Error('同名重复弹窗 ' + c + ' 次（应为 1）');
  });

  // ---------- 等待自动初始化(loadVocabExt/loadExamBankExt)在「全体失败」下跑完 ----------
  setTimeout(function () {
    var examT = window.__toastLog.filter(function (m) { return m.indexOf('题库扩展加载失败') >= 0; });
    R.push((examT.length === 1 ? 'PASS' : 'FAIL') + ' D3b_exam_failure_toast_once :: 共 ' + examT.length + ' 条');
    var vocabT = window.__toastLog.filter(function (m) { return m.indexOf('词库扩展加载失败，当前仅显示内置词表') >= 0; });
    R.push((vocabT.length === 1 ? 'PASS' : 'FAIL') + ' D4b_vocab_failure_toast_once :: 共 ' + vocabT.length + ' 条');

    // ---------- 切换到「fetch 拒绝 + XHR 成功」：核心证伪点 ② ----------
    window.__xhrForceFail = false;
    window.__xhrResponder = function (url) {
      if (url.indexOf('exam-bank-ext-index') >= 0) return { body: { shards: [{ file: 'assets/data/exam-bank-sentinel.json' }] } };
      if (url.indexOf('exam-bank-sentinel') >= 0) return { body: { questions: [{ id: 9999, type: '回归哨兵', q: 'SENTINEL-Q', o: ['A', 'B'], a: 0, x: 'x' }] } };
      if (url.indexOf('exam-bank.json') >= 0) return { body: { questions: [] } };
      if (url.indexOf('probe.test') >= 0) return { body: { hello: 'xhr-fallback-ok' } };
      return { fail: true, status: 404 };
    };

    var d2 = fetchJSONAnywhere('http://probe.test/data.json').then(function (j) {
      if (!j || j.hello !== 'xhr-fallback-ok') throw new Error('未通过 XHR 拿到数据: ' + JSON.stringify(j));
      R.push('PASS D2_fetchJSONAnywhere_xhr_fallback (fetch 拒绝 → XHR 成功拿到数据)');
    }, function (e) { R.push('FAIL D2_fetchJSONAnywhere_xhr_fallback :: rejected ' + e.message); });

    var d6 = loadExamBankShard('assets/data/exam-bank-sentinel.json', true).then(function (changed) {
      var hit = EXAM_BANK.findIndex(function (q) { return q.id === 9999; });
      if (changed < 1 || hit < 0) throw new Error('changed=' + changed + ' hit=' + hit);
      R.push('PASS D6_xhr_fallback_data_merged_into_EXAM_BANK :: changed=' + changed + ' EXAM_BANK=' + EXAM_BANK.length);
    }, function (e) { R.push('FAIL D6_xhr_fallback_data_merged_into_EXAM_BANK :: rejected ' + e.message); });

    Promise.all([d2['catch'](function () {}), d6['catch'](function () {})]).then(function () {
      // ---------- fetch + XHR 双失败 → 应 reject ----------
      window.__xhrForceFail = true;
      return fetchJSONAnywhere('http://probe.test/nope.json').then(function () {
        R.push('FAIL D7_both_fail_rejects :: 双失败却 resolve');
      }, function () { R.push('PASS D7_both_fail_rejects'); });
    }).then(function () {
      setTimeout(function () {
        R.push('INFO exam_bank_final=' + EXAM_BANK.length);
        R.push('INFO toast_log=' + JSON.stringify(window.__toastLog));
        R.push('INFO fetch_calls=' + JSON.stringify(window.__fetchCalls));
        R.push('INFO xhr_calls=' + JSON.stringify(window.__xhrCalls));
        window.__D_RESULTS = R.join('\\n');
      }, 300);
    });
  }, 800);
})();
`;

let evalThrow = null;
try { w.eval(appjs + '\n' + harness); }
catch (e) { evalThrow = e.name + ' :: ' + e.message; }

setTimeout(function () {
  var body = (w.__D_RESULTS || '(no results)');
  var pass = (body.match(/PASS/g) || []).length;
  var fail = (body.match(/FAIL/g) || []).length;
  var lines = [];
  lines.push('===== D 线独立证伪回归：R35 题库链（assets/app.js, commit d193b2d）=====');
  lines.push('运行时间: ' + new Date().toISOString());
  lines.push('');
  lines.push('--- eval 阶段 ---');
  lines.push(evalThrow ? ('EVAL_THROW ' + evalThrow) : 'OK（app.js + harness 同一段 eval 完成）');
  lines.push('');
  lines.push('--- 证伪结果 ---');
  lines.push(body);
  lines.push('');
  lines.push('--- 汇总 ---');
  lines.push('PASS=' + pass + '  FAIL=' + fail + (evalThrow ? '  EVAL_THROW=1' : '  EVAL_THROW=0'));
  lines.push((fail === 0 && !evalThrow) ? 'RESULT: PASS —— D 线 6 项证伪点全部通过' : 'RESULT: FAIL —— 见上方明细');
  var out = lines.join('\n');
  fs.writeFileSync(path.join(ROOT, 'tools/qa/_d_r35_regression.txt'), out + '\n');
  console.log(out);
  process.exit(0);
}, 4000);
