/* tools/qa/qa_t04_00_foundation.js — T04-00 公共基础自测
 * 用法：node tools/qa/qa_t04_00_foundation.js
 * 功能（不依赖 jsdom；Node vm + 自实现 DOM 桩）：
 *   1. 加载 icon-map.js / xt-toast.js / error-boundary.js
 *   2. 验证 window.xtToast / window.errorBoundary 暴露
 *   3. 验证 lucideIcon(name, size) 对 23 个新 key 返合法 SVG
 *   4. 验证旧 19 个 key 未被破坏
 * --------------------------------------------------------------------
 * 退出码：0 = PASS / 1 = FAIL
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// —— 极简 DOM 桩 ——
class FakeElement {
  constructor(tagName) {
    this.tagName = (tagName || 'div').toUpperCase();
    this.attributes = {};
    this.children = [];
    this.innerHTML = '';
    this.parentNode = null;
    this.style = {};
    this.classList = [];
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] != null ? this.attributes[name] : null; }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) { this.children.splice(i, 1); child.parentNode = null; }
    return child;
  }
  addEventListener() { /* noop */ }
  querySelectorAll() { return []; }
}

const fakeBody = new FakeElement('body');
const fakeDocument = {
  readyState: 'loading',
  body: fakeBody,
  createElement: (tag) => new FakeElement(tag),
  addEventListener: (type, cb) => {
    if (type === 'DOMContentLoaded') {
      // 同步触发（readyState = 'loading' + addEventListener 后再切）
      setImmediate(cb);
    }
  },
  querySelectorAll: () => [],
};

// —— vm 沙箱 ——
const sandbox = {
  window: {},
  document: fakeDocument,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setImmediate: setImmediate,
  console: console,
  __XT_PROD__: false,
};
sandbox.window.console = console;
// 互相引用便于 IIFE 内访问
sandbox.self = sandbox.window;

vm.createContext(sandbox);

// —— 加载三个脚本（按依赖顺序：icon-map → xt-toast → error-boundary）——
function loadScript(relPath) {
  const abs = path.resolve(__dirname, '..', '..', relPath);
  const code = fs.readFileSync(abs, 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

loadScript('assets/icon-map.js');
loadScript('assets/xt-toast.js');
loadScript('assets/error-boundary.js');

// —— 测试 ——
let pass = 0;
let fail = 0;
const fails = [];

function assert(name, cond, msg) {
  if (cond) {
    pass++;
    console.log('  [PASS] ' + name);
  } else {
    fail++;
    fails.push(name + (msg ? ' — ' + msg : ''));
    console.log('  [FAIL] ' + name + (msg ? ' — ' + msg : ''));
  }
}

console.log('\n=== T04-00 公共基础自测 ===');

// —— 1. globals ——
console.log('\n[1] 全局接口');
assert('window.xtToast 是函数', typeof sandbox.window.xtToast === 'function');
assert('window.errorBoundary 是对象', typeof sandbox.window.errorBoundary === 'object');
assert('window.errorBoundary.init 是函数', typeof sandbox.window.errorBoundary.init === 'function');
assert('window.errorBoundary.report 是函数', typeof sandbox.window.errorBoundary.report === 'function');
assert('window.lucideIcon 是函数', typeof sandbox.window.lucideIcon === 'function');
assert('window.LUCIDE_ICONS 字典存在', typeof sandbox.window.LUCIDE_ICONS === 'object');

// —— 2. 新 22/23 图标 ——
console.log('\n[2] icon-map.js · 23 个 key 全部存在且返合法 SVG');
const newKeys = [
  'play', 'pause', 'check', 'close', 'arrow_left', 'arrow-left',
  'clock', 'edit', 'delete', 'search', 'plus',
  'star', 'fire', 'trophy', 'headphones', 'pen', 'mic',
  'languages', 'chart', 'settings', 'logout', 'locked',
  'done', 'in_progress', 'in-progress'
];

const SVG_ATTR_CHECK = [
  'viewBox="0 0 24 24"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="2"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"'
];

for (const key of newKeys) {
  if (!sandbox.window.LUCIDE_ICONS[key]) {
    assert('  key "' + key + '" 在字典中', false, '未找到');
    continue;
  }
  const out = sandbox.window.lucideIcon(key, 24);
  const checks = [];
  for (const attr of SVG_ATTR_CHECK) {
    checks.push(out.indexOf(attr) !== -1);
  }
  const okAll = out.indexOf('<svg') !== -1 && checks.every(Boolean);
  assert('  lucideIcon("' + key + '", 24) 返合法 SVG', okAll,
    'out=' + out.substring(0, 80) + (out.length > 80 ? '...' : ''));
}

// —— 3. 旧 19 个图标未破坏 ——
console.log('\n[3] 旧 19 个图标未破坏');
const oldKeys = [
  'globe', 'book-open', 'pencil', 'message-square', 'handshake',
  'palette', 'clock', 'chevron-right', 'chevron-left', 'arrow-right',
  'user', 'settings', 'search', 'plus',
  'home', 'users', 'book', 'rss', 'messages-square'
];
for (const key of oldKeys) {
  const out = sandbox.window.lucideIcon(key, 20);
  assert('  旧 key "' + key + '" 仍返合法 SVG',
    !!out && out.indexOf('<svg') !== -1 && out.indexOf('viewBox="0 0 24 24"') !== -1);
}

// —— 4. lucideIcon(未知) 返空 ——
console.log('\n[4] lucideIcon 鲁棒性');
assert('  lucideIcon("__no_such_key__", 24) 返 ""',
  sandbox.window.lucideIcon('__no_such_key__', 24) === '');
assert('  lucideIcon(undefined) 返 ""',
  sandbox.window.lucideIcon(undefined, 24) === '');

// —— 5. xtToast —— 注：fake document.body.appendChild 不会真显示，但验证不崩
console.log('\n[5] xtToast 调用不崩');
try {
  sandbox.window.xtToast('success', '测试成功');
  sandbox.window.xtToast('error', '测试错误', { duration: 100 });
  sandbox.window.xtToast('warning', '警告');
  sandbox.window.xtToast('info', '提示');
  // 非法 state 降级到 info
  sandbox.window.xtToast('bogus', '瞎传');
  assert('  xtToast 5 个调用（含非法 state 降级）均未抛错', true);
} catch (e) {
  assert('  xtToast 调用', false, e.message);
}

// —— 6. errorBoundary ——
console.log('\n[6] errorBoundary 调用不崩');
try {
  sandbox.window.errorBoundary.report('手动测试错误', 'fake.js:42');
  sandbox.window.errorBoundary.report(null, null);
  assert('  errorBoundary.report 多次调用未抛错', true);
} catch (e) {
  assert('  errorBoundary.report 调用', false, e.message);
}

// —— 汇总 ——
console.log('\n=== 汇总 ===');
console.log('PASS: ' + pass + ' / FAIL: ' + fail);
if (fail > 0) {
  console.log('\n失败清单：');
  fails.forEach((s) => console.log('  - ' + s));
  process.exit(1);
}
console.log('\n[ALL PASS] 公共基础 5 件就绪。');
process.exit(0);
