/* QA (Edward) 独立验证 —— Bug2：模考页返回死循环
 * 方法：
 *   1) 从三个页面 HTML 中抽取真实内联 <script> 里的 goBack() 定义；
 *   2) 构造可控沙箱（window.location 可写 + URLSearchParams + 真实 mock-papers/mock-engine 引擎）；
 *   3) 真执行 goBack()，捕获其设置的 window.location.href 目标；
 *   4) 覆盖刁钻用例（含无参/垃圾值/含 run/真实 paperId）；
 *   5) 反向自证：篡改映射，确认测试能捕获（仅改内存字符串，不落盘）。
 * 运行：node tools/qa/qa_bug2_goback.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { URLSearchParams } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');

const PAGES = {
  run: 'mock_exam_run.html',
  exam: 'mock_exam.html',
  result: 'mock_exam_result.html',
};

const htmlCache = {};
Object.keys(PAGES).forEach((k) => (htmlCache[k] = fs.readFileSync(path.join(ROOT, PAGES[k]), 'utf8')));

const DATA_JS = fs.readFileSync(path.join(ROOT, 'data', 'mock-papers.js'), 'utf8');
const ENGINE_JS = fs.readFileSync(path.join(ROOT, 'assets', 'mock-engine.js'), 'utf8');

// 抽取包含 goBack 定义的内联脚本块
function extractGoBackScript(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/function\s+goBack\s*\(/.test(m[1])) return m[1];
  }
  return null;
}

// 构造沙箱并执行某页 goBack，捕获跳转目标
function callGoBack(pageKey, fullUrl) {
  const script = extractGoBackScript(htmlCache[pageKey]);
  if (!script) return { error: 'no goBack script in ' + PAGES[pageKey] };

  const u = new URL(fullUrl);
  let captured = null;

  const localStorageStub = {
    _m: {},
    getItem(k) { return k in this._m ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; },
  };

  const sandbox = {
    console,
    URLSearchParams,
    URL,
    localStorage: localStorageStub,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    document: { readyState: 'complete', addEventListener() {}, removeEventListener() {}, getElementById: () => null, createElement: () => ({ style: {}, setAttribute(){}, appendChild(){} }) },
    navigator: { userAgent: 'qa' },
  };
  sandbox.window = sandbox;
  // 可写的 location：goBack 只会赋值 window.location.href
  sandbox.location = {
    _href: u.href,
    get href() { return this._href; },
    set href(v) { this._href = String(v); captured = String(v); },
    get search() { return u.search; },
    get hash() { return u.hash; },
    get pathname() { return u.pathname; },
    get origin() { return u.origin; },
    replace() {},
    assign(v) { this.href = v; },
  };
  sandbox.window.location = sandbox.location;

  vm.createContext(sandbox);
  try {
    // 先注入真实引擎与题库（goBack 依赖 MockEngine.findPaperCategory）
    vm.runInContext(DATA_JS, sandbox, { filename: 'mock-papers.js' });
    vm.runInContext(ENGINE_JS, sandbox, { filename: 'mock-engine.js' });
    vm.runInContext(script, sandbox, { filename: PAGES[pageKey] });
  } catch (e) {
    return { error: 'eval failed: ' + e.message };
  }
  try {
    sandbox.goBack();
  } catch (e) {
    return { error: 'call goBack failed: ' + e.message };
  }
  return { target: captured };
}

let pass = 0, fail = 0;
const lines = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  lines.push((ok ? 'PASS' : 'FAIL') + ' | ' + label + '\n        expected=' + expected + '\n        actual  =' + actual);
  return ok;
}
const g = (r) => r.target || ('(null/' + (r.error || '') + ')');

console.log('\n================ QA Bug2 goBack 独立验证 ================\n');

check('run?paper=cet-real-a -> mock_exam?cat=cet-mock',
  g(callGoBack('run', 'https://x/mock_exam_run.html?paper=cet-real-a')),
  'mock_exam.html?cat=cet-mock');

check('run?paper=cet-demo-1 -> mock_exam?cat=cet-mock',
  g(callGoBack('run', 'https://x/mock_exam_run.html?paper=cet-demo-1')),
  'mock_exam.html?cat=cet-mock');

check('run?paper=exam-comp-a -> mock_exam?cat=exam-mock',
  g(callGoBack('run', 'https://x/mock_exam_run.html?paper=exam-comp-a')),
  'mock_exam.html?cat=exam-mock');

check('run?paper=exam-real-1 -> mock_exam?cat=exam-mock',
  g(callGoBack('run', 'https://x/mock_exam_run.html?paper=exam-real-1')),
  'mock_exam.html?cat=exam-mock');

check('run 无 paper -> 兜底 cat=cet-mock',
  g(callGoBack('run', 'https://x/mock_exam_run.html')),
  'mock_exam.html?cat=cet-mock');

check('run?paper=不存在 -> 兜底 cat=cet-mock',
  g(callGoBack('run', 'https://x/mock_exam_run.html?paper=zzz-nope')),
  'mock_exam.html?cat=cet-mock');

check('exam?cat=cet-mock -> 四级备考.html',
  g(callGoBack('exam', 'https://x/mock_exam.html?cat=cet-mock')),
  '四级备考.html');

check('exam?cat=exam-mock -> 央国企笔试.html',
  g(callGoBack('exam', 'https://x/mock_exam.html?cat=exam-mock')),
  '央国企笔试.html');

check('exam 无 cat -> 兜底 四级备考.html',
  g(callGoBack('exam', 'https://x/mock_exam.html')),
  '四级备考.html');

check('exam?cat=垃圾值 -> 兜底 四级备考.html',
  g(callGoBack('exam', 'https://x/mock_exam.html?cat=%E5%9E%83%E5%9C%BE')),
  '四级备考.html');

check('exam?cat=exam-mock&extra=1 -> 央国企笔试.html',
  g(callGoBack('exam', 'https://x/mock_exam.html?cat=exam-mock&extra=1')),
  '央国企笔试.html');

check('result?paper=cet-real-a&run=xyz -> mock_exam?cat=cet-mock',
  g(callGoBack('result', 'https://x/mock_exam_result.html?paper=cet-real-a&run=xyz')),
  'mock_exam.html?cat=cet-mock');

check('result?paper=exam-comp-b&run=abc -> mock_exam?cat=exam-mock',
  g(callGoBack('result', 'https://x/mock_exam_result.html?paper=exam-comp-b&run=abc')),
  'mock_exam.html?cat=exam-mock');

check('result 无 paper -> 兜底 mock_exam?cat=cet-mock',
  g(callGoBack('result', 'https://x/mock_exam_result.html')),
  'mock_exam.html?cat=cet-mock');

check('result?paper=垃圾 -> 兜底 mock_exam?cat=cet-mock',
  g(callGoBack('result', 'https://x/mock_exam_result.html?paper=nope')),
  'mock_exam.html?cat=cet-mock');

lines.forEach((l) => console.log(l));
console.log('\n=============== 汇总: PASS=' + pass + ' FAIL=' + fail + ' ===============');

// ---- 反向自证：篡改映射，确认用例能捕获 ----
console.log('\n---- 反向自证（篡改映射，验证测试非空转）----');
const orig = htmlCache.exam;
const tampered = orig.replace("cat === 'exam-mock' ? '央国企笔试.html' : '四级备考.html'",
                              "cat === 'exam-mock' ? '不存在的页面.html' : '四级备考.html'");
if (tampered === orig) {
  console.log('WARN: 未定位到 exam 页映射字符串，无法自动篡改');
} else {
  htmlCache.exam = tampered;
  const t = callGoBack('exam', 'https://x/mock_exam.html?cat=exam-mock').target;
  htmlCache.exam = orig; // 还原
  const caught = t === '不存在的页面.html';
  console.log('篡改后 exam?cat=exam-mock 实际目标 = ' + t + '  (预期错误值 不存在的页面.html)');
  console.log('测试能否捕获错误映射: ' + (caught ? '是（自证有效，测试非空转）' : '否（测试空转！）'));
  if (!caught) { fail++; }
}

process.exit(fail > 0 ? 1 : 0);
