const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = 'D:\\下载的文件\\学习工作台';
const code = fs.readFileSync(path.join(ROOT, 'assets', 'ai-config.js'), 'utf8');
const sandbox = {
  console: console, window: {}, document: { querySelector: () => null, getElementById: () => null },
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
vm.runInContext(code, sandbox, { filename: 'ai-config.js' });

const bm = sandbox.AI_CONFIG.builtinModels;
const defined = new Set();
function collect(o) {
  if (!o || typeof o !== 'object') return;
  if (typeof o.id === 'string') defined.add(o.id);
  if (Array.isArray(o.models)) o.models.forEach(collect);
  if (Array.isArray(o.children)) o.children.forEach(collect);
}
bm.forEach(collect);

// collect every fallback reference (string or array of strings) anywhere in builtinModels
const fallbackRefs = [];
function walk(o, path) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach((v, i) => walk(v, path + '[' + i + ']')); return; }
  for (const k of Object.keys(o)) {
    if (k === 'fallback') {
      const v = o[k];
      if (typeof v === 'string') fallbackRefs.push({ path: path + '.fallback', val: v });
      else if (Array.isArray(v)) v.forEach((s, i) => { if (typeof s === 'string') fallbackRefs.push({ path: path + '.fallback[' + i + ']', val: s }); });
    } else if (k === 'primary') {
      const v = o[k];
      if (typeof v === 'string') fallbackRefs.push({ path: path + '.primary', val: v, isPrimary: true });
    }
    walk(o[k], path + '.' + k);
  }
}
walk(bm, 'builtinModels');

const dangling = fallbackRefs.filter(r => !defined.has(r.val));
const out = [];
out.push('DEFINED_COUNT=' + defined.size);
out.push('FALLBACK_REF_TOTAL=' + fallbackRefs.length);
out.push('DANGLING_COUNT=' + dangling.length);
if (dangling.length) {
  for (const d of dangling) out.push('  DANGLING ' + d.path + ' -> ' + d.val);
}
// sanity: show the 3 removed ids are truly absent among defined
for (const rid of ['ark-seedance-1-5-pro', 'ark-seedance-1-0-lite-t2v', 'ark-seedance-1-0-lite-i2v']) {
  out.push('removed_id ' + rid + ' inDEFINED=' + defined.has(rid));
}
out.push('kept ark-seedance-1-0-pro inDEFINED=' + defined.has('ark-seedance-1-0-pro'));
out.push('kept ark-seedance-1-0-pro-fast inDEFINED=' + defined.has('ark-seedance-1-0-pro-fast'));

fs.writeFileSync('C:/Users/ATM/_r92b_fallback_out.txt', out.join('\n'), 'utf8');
