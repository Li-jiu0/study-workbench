/* R73 需求13 联动验证：导入 → 我的文件页出现模块卡片与分组。
   做法：在 vm 沙箱里用「真实 assets/importer.js」跑完整导入流程（txt/csv 两种格式），
   再用「真实 我的文件.html 内联脚本」渲染，断言 #mfList 卡片与 #mfModule 分组。
   不 mock 业务代码，只提供最小 DOM/localStorage 桩。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:\\下载的文件\\学习工作台';
const out = [];
function log(s) { out.push(s); }

function makeEl(id) {
  return {
    id: id, _attrs: {}, style: {}, value: '', innerHTML: '', textContent: '',
    classList: {
      _s: {},
      add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
      toggle(c, f) { if (f === undefined) f = !this._s[c]; if (f) this._s[c] = 1; else delete this._s[c]; },
      contains(c) { return !!this._s[c]; }
    },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    addEventListener() { }, removeEventListener() { },
    appendChild() { }, removeChild() { }, remove() { },
    querySelectorAll() { return []; }, querySelector() { return null; },
    focus() { }, scrollIntoView() { },
    getContext() { return { fillRect() { }, drawImage() { }, fillStyle: '' }; },
    toDataURL() { return ''; },
    parentNode: null, onclick: null, disabled: false
  };
}

function makeEnv() {
  const els = {};
  const _store = Object.create(null);
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem(k, v) { _store[k] = String(v); },
    removeItem(k) { delete _store[k]; },
    key(i) { const ks = Object.keys(_store); return i < ks.length ? ks[i] : null; },
    clear() { Object.keys(_store).forEach(function (k) { delete _store[k]; }); }
  };
  Object.defineProperty(localStorage, 'length', { get() { return Object.keys(_store).length; } });
  const document = {
    readyState: 'complete',
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement(tag) { return makeEl(tag); },
    createTextNode(t) { return { textContent: t }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() { }, removeEventListener() { }
  };
  const sandbox = {
    document: document, localStorage: localStorage, console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    Date: Date, JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number,
    Boolean: Boolean, RegExp: RegExp, Error: Error, Promise: Promise,
    parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    TextDecoder: TextDecoder, TextEncoder: TextEncoder,
    Uint8Array: Uint8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array,
    DataView: DataView, ArrayBuffer: ArrayBuffer
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__els = els; sandbox.__store = _store;
  return sandbox;
}

function fakeFile(name, text) {
  const buf = Buffer.from(text, 'utf8');
  return {
    name: name, size: buf.length,
    arrayBuffer: function () {
      const ab = new ArrayBuffer(buf.length);
      new Uint8Array(ab).set(buf);
      return Promise.resolve(ab);
    }
  };
}

function run(code, sandbox) { vm.runInContext(code, vm.createContext(sandbox), { timeout: 20000 }); }

const importerCode = fs.readFileSync(path.join(ROOT, 'assets', 'importer.js'), 'utf8');
const mfHtml = fs.readFileSync(path.join(ROOT, '我的文件.html'), 'utf8');

// 取 我的文件.html 中承载数据层的内联脚本（含 KEY_IMPORTS 的那个）
let mfScript = null;
{
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(mfHtml))) {
    if (m[1].indexOf('KEY_IMPORTS') >= 0 && m[1].indexOf('function bankEntries') >= 0) { mfScript = m[1]; break; }
  }
}
if (!mfScript) { log('FAIL: 未能从 我的文件.html 提取数据层脚本'); fs.writeFileSync('D:\\cache\\temp\\r73_link_out.txt', out.join('\n'), 'utf8'); process.exit(1); }

// ---------- 场景 ----------
const CASES = [
  { file: 'core_vocab.txt', target: 'cet',  label: '四级词汇', text:
      '1. abandon /əˈbændən/ v. 放弃；抛弃\n2. ability  能力；才能\n3. absorb — 吸收；使全神贯注\n4. abstract  抽象的\n' },
  { file: 'exam_2026.csv', target: 'exam', label: '行测刷题', text:
      '1. 下列哪个是质数？\nA. 4\nB. 6\nC. 7\nD. 9\n答案：C\n解析：7 只有 1 和自身两个因数。\n\n2. 中国的首都是？\nA. 上海\nB. 北京\nC. 广州\nD. 深圳\n答案：B\n解析：常识题。\n' }
];

const results = [];
const bankNames = [];

(async function () {
  for (let ci = 0; ci < CASES.length; ci++) {
    const C = CASES[ci];
    const sb = makeEnv();
    sb.xtToast = function () { };
    sb.showToast = function () { };
    sb.__qbReg = function () { return { cet: '四级词汇', exam: '行测刷题', iv: '面试题库' }; };
    sb.__qbImportRaw = function (key, items) { return { ok: true, n: items.length, skip: 0 }; };
    run(importerCode, sb);

    if (typeof sb.__impPick !== 'function' || typeof sb.__impTarget !== 'function' || typeof sb.__impDo !== 'function') {
      log('FAIL: importer.js 未导出 __impPick/__impTarget/__impDo'); break;
    }
    // ⓪ 打开向导（初始化内部状态 S）
    if (typeof sb.openImporter === 'function') sb.openImporter();
    // ① 选文件
    await sb.__impPick({ target: { files: [fakeFile(C.file, C.text)], value: '' } });
    // ② 选目标题库（内置）
    sb.__impTarget(C.target);
    // ③ 导入
    sb.__impDo();

    const banks = sb.__impBanks() || {};
    const names = Object.keys(banks);
    const b = names.length ? banks[names[0]] : null;
    const name = names[0];
    bankNames.push({ name: name, sb: sb });
    results.push('case ' + C.file + ' | target=' + C.target +
      ' | banks=' + names.length + ' | name=' + name +
      ' | items=' + (b ? b.items.length : 0) + ' | type=' + (b ? b.type : '-') +
      ' | module=' + (b ? b.module : '-'));

    // ---------- 我的文件页渲染 ----------
    const sb2 = makeEnv();
    sb2.showToast = function () { };
    sb2.uiConfirm = function () { return Promise.resolve(false); };
    sb2.xtToast = function () { };
    // 把 importer 写入的导入库原样搬到「我的文件」沙箱
    Object.keys(sb.__store).forEach(function (k) { sb2.__store[k] = sb.__store[k]; });
    run(mfScript, sb2);
    const grid = sb2.__els['mfList'];
    const sel = sb2.__els['mfModule'];
    const gridHtml = grid ? String(grid.innerHTML) : '';
    const selHtml = sel ? String(sel.innerHTML) : '';
    if (gridHtml.indexOf(name) >= 0) results.push('  DOM: #mfList 出现卡片「' + name + '」✓');
    else results.push('  DOM: #mfList 未见卡片「' + name + '」✗  html=' + gridHtml.slice(0, 200));
    if (gridHtml.indexOf('mf-item') >= 0) results.push('  DOM: #mfList 含 .mf-item 卡片节点 ✓');
    else results.push('  DOM: #mfList 无 .mf-item ✗');
    if (gridHtml.indexOf(C.label) >= 0) results.push('  DOM: 卡片分组归属 =「' + C.label + '」✓');
    else results.push('  DOM: 卡片未显示分组「' + C.label + '」✗  html=' + gridHtml.slice(0, 300));
    if (selHtml.indexOf('>' + C.label + '<') >= 0) results.push('  DOM: #mfModule 分组下拉含「' + C.label + '」✓');
    else results.push('  DOM: #mfModule 未含「' + C.label + '」✗  html=' + selHtml.slice(0, 300));
  }
  log(results.join('\n'));
  fs.writeFileSync('D:\\cache\\temp\\r73_link_out.txt', out.join('\n') + '\n', 'utf8');
  console.log('DONE');
})().catch(function (e) {
  log('EXCEPTION: ' + (e && e.stack ? e.stack : e));
  fs.writeFileSync('D:\\cache\\temp\\r73_link_out.txt', out.join('\n') + '\n', 'utf8');
  console.log('ERR');
});
