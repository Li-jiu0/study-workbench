// 内部辅助: 用 acorn AST 做「跨文件全局名唯一性」分析。
// 由 global_name_scan_20260916m.py 调用:
//   node _globals_scan.js <input_json> <output_json>
// input_json: [{ "rel": "assets/app.js", "abs": "...", "kind": "js"|"html" }, ...]
// output_json: { "<rel>": {
//     "globals": {"name": ["var"|"let"|"const"|"function"|"class"|"implicit", ...], ...},
//     "guardedWrites": ["name", ...],
//     "guardWrappers": <int>,
//     "exponent": <int>, "objSpread": <int>, "arrSpread": <int>,
//     "parseOk": true|false
// }}
const fs = require('fs');
const acorn = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\acorn');

const BUILTINS = new Set([
  'window','document','console','globalThis','self','top','parent','frames','location',
  'history','navigator','localStorage','sessionStorage','screen','devicePixelRatio',
  'setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame',
  'Math','JSON','Date','Object','Array','String','Number','Boolean','RegExp','Error','TypeError',
  'RangeError','SyntaxError','ReferenceError','Promise','Map','Set','WeakMap','WeakSet','Symbol','Proxy',
  'Reflect','BigInt','BigInt64Array','Float64Array','Float32Array','Int32Array','Int16Array','Int8Array',
  'Uint32Array','Uint16Array','Uint8Array','Uint8ClampedArray','ArrayBuffer','DataView','Atomics',
  'fetch','XMLHttpRequest','WebSocket','EventSource','Worker','Blob','File','FileReader','Image','Audio',
  'URL','URLSearchParams','FormData','Headers','Request','Response','TextEncoder','TextDecoder',
  'alert','confirm','prompt','print','open','close','focus','blur','postMessage','addEventListener',
  'removeEventListener','getComputedStyle','querySelector','querySelectorAll','setAttribute','getAttribute',
  'parseInt','parseFloat','isNaN','isFinite','encodeURI','decodeURI','encodeURIComponent','decodeURIComponent',
  'escape','unescape','eval','undefined','NaN','Infinity','null','true','false','this','arguments','module',
  'exports','require','process','global','Buffer','setImmediate','clearImmediate','queueMicrotask',
  'structuredClone','crypto','performance','indexedDB','IDBFactory','HTMLElement','Element','Node',
  'event','name','status','length','closed','origin','protocol','host','hostname','port','pathname','search',
  'hash','href','title','innerWidth','innerHeight','outerWidth','outerHeight','pageXOffset','pageYOffset',
  'scrollX','scrollY','devicePixelRatio','language','userAgent','platform','onload','onerror','onclick',
  'XMLSerializer','DOMParser','MutationObserver','IntersectionObserver','ResizeObserver','CustomEvent',
  'KeyboardEvent','MouseEvent','TouchEvent','PointerEvent','Storage','Notification','Geolocation'
]);

function parseCode(code) {
  for (const lv of [2017, 2020, 2022]) {
    try {
      return acorn.parse(code, { ecmaVersion: lv, sourceType: 'script', allowReturnOutsideFunction: true });
    } catch (e) { /* try next */ }
  }
  return null;
}

class Scope {
  constructor(kind, parent) { this.kind = kind; this.parent = parent; this.names = new Map(); }
}
function collectIdents(pattern, out) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') (pattern.properties || []).forEach(p => {
    if (p.type === 'RestElement') collectIdents(p.argument, out);
    else if (p.value) collectIdents(p.value, out);
  });
  else if (pattern.type === 'ArrayPattern') (pattern.elements || []).forEach(e => collectIdents(e, out));
  else if (pattern.type === 'RestElement') collectIdents(p.argument, out);
  else if (pattern.type === 'AssignmentPattern') collectIdents(pattern.left, out);
}
function addName(scope, name, kind) {
  if (!scope.names.has(name)) scope.names.set(name, new Set());
  scope.names.get(name).add(kind);
}
function fnScope(scope) { while (scope && scope.kind === 'block') scope = scope.parent; return scope; }

function analyze(code) {
  const ast = parseCode(code);
  if (!ast) return { parseOk: false, globals: {}, guardedWrites: [], guardWrappers: 0, exponent: 0, objSpread: 0, arrSpread: 0 };
  let current = new Scope('program', null);
  const root = current;
  const assignments = [];
  let exponent = 0, objSpread = 0, arrSpread = 0;
  const guardedWrites = new Set();
  let guardWrappers = 0;

  function enter(kind) { current = new Scope(kind, current); }
  function exit() { current = current.parent; }

  function isGlobalObj(n) { return n && n.type === 'Identifier' && (n.name === 'window' || n.name === 'globalThis' || n.name === 'self'); }

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === undefined) return;
    let created = false;

    if (node.type === 'Program') { created = true; }
    else if (node.type === 'FunctionDeclaration') {
      if (node.id) addName(fnScope(current), node.id.name, 'function');
      enter('function'); created = true;
      (node.params || []).forEach(p => { const ids = []; collectIdents(p, ids); ids.forEach(n => addName(current, n, 'param')); });
    }
    else if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      enter('function'); created = true;
      (node.params || []).forEach(p => { const ids = []; collectIdents(p, ids); ids.forEach(n => addName(current, n, 'param')); });
    }
    else if (node.type === 'BlockStatement' || node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'SwitchStatement') {
      enter('block'); created = true;
    }
    else if (node.type === 'CatchClause') {
      enter('block'); created = true;
      if (node.param) { const ids = []; collectIdents(node.param, ids); ids.forEach(n => addName(current, n, 'param')); }
    }
    else if (node.type === 'ClassDeclaration') {
      if (node.id) addName(current, node.id.name, 'class');
    }
    else if (node.type === 'ClassExpression') {
      if (node.id) addName(current, node.id.name, 'class');
    }

    if (node.type === 'VariableDeclaration') {
      const tgt = node.kind === 'var' ? fnScope(current) : current;
      (node.declarations || []).forEach(d => { const ids = []; collectIdents(d.id, ids); ids.forEach(n => addName(tgt, n, node.kind)); });
    }

    // 数组 / 对象展开统计 (精确, 来自 AST)
    if (node.type === 'ArrayExpression') {
      (node.elements || []).forEach(e => { if (e && e.type === 'SpreadElement') arrSpread++; });
    }
    if (node.type === 'ObjectExpression') {
      (node.properties || []).forEach(p => { if (p && p.type === 'SpreadElement') objSpread++; });
    }
    if (node.type === 'BinaryExpression' && node.operator === '**') exponent++;

    // 守卫写法: window.X = ...  (合规全局定义, 不算冲突)
    if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'MemberExpression' && isGlobalObj(node.left.object) && node.left.property && node.left.property.type === 'Identifier') {
      guardedWrites.add(node.left.property.name);
    }
    // 守卫条件: typeof window.X / !window.X / window.X !== 'function' / == 'undefined'
    if (node.type === 'UnaryExpression' && node.operator === 'typeof' && node.argument && node.argument.type === 'MemberExpression' && isGlobalObj(node.argument.object) && node.argument.property && node.argument.property.type === 'Identifier') {
      guardWrappers++;
    }
    if (node.type === 'UnaryExpression' && node.operator === '!' && node.argument && node.argument.type === 'MemberExpression' && isGlobalObj(node.argument.object) && node.argument.property && node.argument.property.type === 'Identifier') {
      guardWrappers++;
    }
    if (node.type === 'BinaryExpression' && (node.operator === '!==' || node.operator === '===' || node.operator === '==' || node.operator === '!=') && node.left && node.left.type === 'MemberExpression' && isGlobalObj(node.left.object) && node.left.property && node.left.property.type === 'Identifier') {
      guardWrappers++;
    }

    // 赋值 / 更新 -> 记录供 pass2 判隐式全局
    if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'Identifier') {
      assignments.push({ name: node.left.name, scope: current });
    }
    if (node.type === 'UpdateExpression' && node.argument && node.argument.type === 'Identifier') {
      assignments.push({ name: node.argument.name, scope: current });
    }

    for (const key in node) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      visit(node[key]);
    }
    if (created) exit();
  }
  visit(ast);

  // pass2: 隐式全局 (赋值目标不在任何外层作用域声明)
  const implicit = new Set();
  for (const a of assignments) {
    if (BUILTINS.has(a.name)) continue;
    let s = a.scope, found = false;
    while (s) { if (s.names.has(a.name)) { found = true; break; } s = s.parent; }
    if (!found) implicit.add(a.name);
  }

  const globals = {};
  for (const [name, kinds] of root.names) {
    if (BUILTINS.has(name)) continue;
    globals[name] = Array.from(kinds);
  }
  for (const n of implicit) {
    if (!globals[n]) globals[n] = [];
    if (!globals[n].includes('implicit')) globals[n].push('implicit');
  }

  return { parseOk: true, globals, guardedWrites: Array.from(guardedWrites), guardWrappers, exponent, objSpread, arrSpread };
}

// ---- 入口 ----
const inp = process.argv[2];
const outp = process.argv[3];
const files = JSON.parse(fs.readFileSync(inp, 'utf8'));
const result = {};

for (const f of files) {
  const rel = f.rel, abs = f.abs, kind = f.kind;
  let code;
  try { code = fs.readFileSync(abs, 'utf8'); }
  catch (e) { result[rel] = { error: 'READ_FAIL: ' + e.message }; continue; }

  if (kind === 'html') {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, merged = { globals: {}, guardedWrites: new Set(), guardWrappers: 0, exponent: 0, objSpread: 0, arrSpread: 0, parseOk: true };
    while ((m = re.exec(code))) {
      const body = m[1];
      if (body.trim().length < 20) continue;
      const r = analyze(body);
      if (!r.parseOk) { merged.parseOk = false; continue; }
      for (const n in r.globals) {
        if (!merged.globals[n]) merged.globals[n] = [];
        r.globals[n].forEach(k => { if (!merged.globals[n].includes(k)) merged.globals[n].push(k); });
      }
      r.guardedWrites.forEach(n => merged.guardedWrites.add(n));
      merged.guardWrappers += r.guardWrappers;
      merged.exponent += r.exponent; merged.objSpread += r.objSpread; merged.arrSpread += r.arrSpread;
    }
    result[rel] = {
      globals: merged.globals,
      guardedWrites: Array.from(merged.guardedWrites),
      guardWrappers: merged.guardWrappers,
      exponent: merged.exponent, objSpread: merged.objSpread, arrSpread: merged.arrSpread,
      parseOk: merged.parseOk
    };
  } else if (kind === 'js') {
    result[rel] = analyze(code);
  } else {
    result[rel] = { skipped: true };
  }
}

fs.writeFileSync(outp, JSON.stringify(result), 'utf8');
