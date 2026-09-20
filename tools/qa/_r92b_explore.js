const fs = require('fs');
const M = 'C:/Users/ATM/_r92b_marker.txt';
fs.writeFileSync(M, 'START cwd=' + process.cwd() + '\n');
function mark(s) { fs.appendFileSync(M, s + '\n'); }
try {
  const vm = require('vm');
  const path = require('path');
  const ROOT = 'D:\\下载的文件\\学习工作台';
  const code = fs.readFileSync(path.join(ROOT, 'assets', 'ai-config.js'), 'utf8');
  mark('READ_OK len=' + code.length);
  const sandbox = {
    console: console,
    window: {}, document: { querySelector: () => null, getElementById: () => null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, setTimeout: setTimeout, clearTimeout: clearTimeout,
    fetch: () => Promise.reject(new Error('no fetch')),
    Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
    Boolean: Boolean, Date: Date, RegExp: RegExp, Error: Error, parseInt: parseInt, parseFloat: parseFloat,
    isNaN: isNaN, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    Promise: Promise, Proxy: Proxy, Map: Map, Set: Set, Symbol: Symbol,
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  mark('CTX_OK');
  vm.runInContext(code, sandbox, { filename: 'ai-config.js' });
  mark('RUN_OK');
  const out = ['LOAD_OK'];
  const ignore = ['console','window','document','localStorage','navigator','setTimeout','clearTimeout','fetch','self','globalThis','Math','JSON','Object','Array','String','Number','Boolean','Date','RegExp','Error','parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent','Promise','Proxy','Map','Set','Symbol'];
  out.push('TOPLEVEL_GLOBALS: ' + JSON.stringify(Object.keys(sandbox).filter(k => !ignore.includes(k))));
  let bm = sandbox.builtinModels, src = 'sandbox.builtinModels';
  if (bm === undefined && sandbox.AI_CONFIG) { bm = sandbox.AI_CONFIG.builtinModels; src = 'AI_CONFIG.builtinModels'; }
  out.push('builtinModels_src=' + src);
  if (bm !== undefined) {
    out.push('builtinModels_type=' + (Array.isArray(bm) ? 'array len=' + bm.length : typeof bm));
    if (Array.isArray(bm)) {
      out.push('sample[0] keys=' + JSON.stringify(Object.keys(bm[0] || {})));
      const ids = new Set();
      function collect(o) {
        if (!o || typeof o !== 'object') return;
        if (typeof o.id === 'string') ids.add(o.id);
        if (Array.isArray(o.models)) o.models.forEach(collect);
        if (Array.isArray(o.children)) o.children.forEach(collect);
      }
      bm.forEach(collect);
      out.push('DEFINED_MODEL_IDS_COUNT=' + ids.size);
      out.push('DEFINED_MODEL_IDS=' + JSON.stringify([...ids].slice(0, 140)));
    }
  } else out.push('builtinModels UNDEFINED');
  fs.writeFileSync('C:/Users/ATM/_r92b_explore_out.txt', out.join('\n'), 'utf8');
  mark('WROTE');
} catch (e) {
  fs.writeFileSync('C:/Users/ATM/_r92b_explore_out.txt', 'LOAD_ERROR: ' + (e && e.stack || e), 'utf8');
  mark('CATCH ' + (e && e.message));
}
