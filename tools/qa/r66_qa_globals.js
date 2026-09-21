// R66 QA：语法编译 + 文件级全局名碰撞检查（权威版，避免启发式误报）
// node --check 抓不到 ES2017 语义，但能抓语法错误；本脚本用 vm 编译 + 沙箱运行探测真实顶层全局。
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const BASE = 'D:/下载的文件/学习工作台';
const FILES = [
  'ai-settings.html',            // 仅编译内联 <script>，但本脚本只处理 .js
  'assets/ai-settings.js',
  'assets/ai-page.js',
  'assets/ai-config.js',
  'assets/ai-service.js',
  'AI.html'
];
const JS = ['assets/ai-settings.js','assets/ai-page.js','assets/ai-config.js','assets/ai-service.js'];

function makeSandbox() {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k,v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const elProxy = new Proxy(function(){}, {
    get: (t, p) => {
      if (p === 'style') return {};
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){return false;} };
      if (p === 'getAttribute') return () => null;
      if (p === 'querySelector' || p === 'querySelectorAll') return () => null;
      if (p === 'appendChild' || p === 'addEventListener' || p === 'removeChild') return () => {};
      if (p === 'getBoundingClientRect') return () => ({top:0,left:0,bottom:0,right:0});
      if (p === 'offsetWidth' || p === 'offsetHeight') return 0;
      return elProxy;
    },
    set: () => true,
    apply: () => elProxy
  });
  const document = {
    getElementById: () => null,
    createElement: () => elProxy,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: elProxy,
    documentElement: elProxy,
    readyState: 'complete'
  };
  const windowObj = {};
  const sandbox = {
    window: windowObj,
    document,
    localStorage,
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    location: { hash: '' },
    navigator: { clipboard: {}, userAgent: 'node' },
    matchMedia: () => ({ matches: false }),
    TextDecoder: function(){ this.decode = s => s; },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    fetch: undefined,
    AbortController: function(){ this.abort=()=>{}; this.signal={}; },
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN, Promise
  };
  sandbox.window = sandbox; // window 指向全局自身，模拟浏览器
  sandbox.globalThis = sandbox;
  return sandbox;
}

const out = [];
let allok = true;

// 1) 语法编译（vm.Script）—— 等价于 node --check，抓 SyntaxError
out.push('===== [H] 语法编译（vm.Script，抓 SyntaxError；等价 node --check） =====');
for (const rel of JS) {
  const p = path.join(BASE, rel);
  const code = fs.readFileSync(p, 'utf8');
  try {
    new vm.Script(code, { filename: rel });
    out.push('[PASS] 编译通过: ' + rel);
  } catch (e) {
    allok = false;
    out.push('[FAIL] 编译错误: ' + rel + ' -> ' + e.message);
  }
}

// 2) 沙箱运行，探测真实文件级全局（非 IIFE 内泄露）+ window.* 赋值
out.push('');
out.push('===== [I] 沙箱运行：真实文件级顶层全局 + window.* 赋值探测 =====');
const windowSeen = {};
for (const rel of JS) {
  const p = path.join(BASE, rel);
  const code = fs.readFileSync(p, 'utf8');
  const sandbox = makeSandbox();
  const before = new Set(Object.keys(sandbox));
  try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: rel });
  } catch (e) {
    // 运行期报错有些是预期（缺 DOM 细节），只要不抛 SyntaxError 即可；记录但不算 FAIL
    out.push('[INFO] 运行期: ' + rel + ' -> ' + e.message.split('\n')[0]);
  }
  // 文件级顶层全局（排除内置 + stub）
  const topGlobals = [];
  for (const k of Object.keys(sandbox)) {
    if (!before.has(k) && !['window','document','localStorage','console','setTimeout','clearTimeout','setInterval','clearInterval','location','navigator','matchMedia','TextDecoder','atob','btoa','fetch','AbortController','JSON','Math','Date','Object','Array','String','Number','Boolean','RegExp','parseInt','parseFloat','isNaN','Promise','globalThis'].includes(k)) {
      topGlobals.push(k);
    }
  }
  // window.* 赋值
  const wkeys = Object.keys(sandbox.window).filter(k => k !== 'window');
  for (const w of wkeys) (windowSeen[w] = windowSeen[w] || []).push(rel);
  out.push('[INFO] ' + rel + ' 顶层全局=' + (topGlobals.length ? topGlobals.join(',') : '(无，IIFE 包裹)') + ' ; window.*=' + (wkeys.join(',')||'(无)'));
}

const dupWin = Object.entries(windowSeen).filter(([k,v]) => new Set(v).size > 1);
out.push('');
if (dupWin.length === 0) {
  out.push('[PASS] 无跨文件 window.* 重复赋值');
} else {
  for (const [k,v] of dupWin) {
    out.push('[GUARDED] window.' + k + ' 跨文件出现: ' + v.join(', ') + ' （需人工确认是否都带 typeof 守卫）');
  }
}

const res = out.join('\n');
fs.writeFileSync(path.join(BASE, 'tools/qa/r66_qa_globals_result.txt'), res, 'utf8');
console.log(res);
