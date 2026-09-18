/* R96 QA · 补测 B3 / B7（v3） */
'use strict';
const fs = require('fs');
const vm = require('vm');
const R = [];
function log(s) { R.push(s); }
const SRC = fs.readFileSync('D:\\下载的文件\\学习工作台\\assets\\xt-region.js', 'utf8');

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), childNodes: [], parentNode: null,
    attrs: {}, style: {}, className: '', id: '', textContent: '', value: '', src: '', charset: '',
    _ls: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return (k in this.attrs) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
    removeEventListener(t, f) { const a = this._ls[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    getBoundingClientRect() { return { height: 800, width: 400 }; },
    focus() {},
    _walk(map) { map.push(this); (this.childNodes || []).forEach(c => c._walk(map)); },
    _matches(sel) {
      if (sel.charAt(0) === '.') return this.className === sel.slice(1);
      if (sel.charAt(0) === '[') { const k = sel.slice(1, -1); return this.attrs && (k in this.attrs); }
      return this.tagName === sel.toUpperCase();
    },
    querySelector(sel) { const m = []; this._walk(m); for (const e of m) if (e._matches(sel)) return e; return null; },
    querySelectorAll(sel) { const m = []; this._walk(m); return m.filter(e => e._matches(sel)); },
    click() { let n = this; while (n) { ((n._ls && n._ls.click) || []).forEach(f => f({ target: this, currentTarget: n })); n = n.parentNode; } }
  };
  return el;
}
function makeDoc() {
  const head = makeEl('head'), body = makeEl('body');
  return { documentElement: makeEl('html'), head, body, createElement: makeEl,
           getElementsByTagName: t => String(t).toLowerCase() === 'head' ? [head] : [body],
           addEventListener() {}, removeEventListener() {} };
}
function parseInto(container, html) {
  container.childNodes = [];
  const re = /<(\w+)([^>]*?)(\/?)>/g;
  const voidTags = { br: 1, input: 1, img: 1, meta: 1, link: 1 };
  const stack = [container];
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(), attrStr = m[2] || '', selfClose = m[3] === '/';
    const el = makeEl(tag);
    const ar = /([\w:-]+)\s*=\s*"([^"]*)"/g; let a;
    while ((a = ar.exec(attrStr))) el.setAttribute(a[1], a[2]);
    stack[stack.length - 1].appendChild(el);
    if (!voidTags[tag] && !selfClose) stack.push(el);
    // 处理闭合标签
    const closeRe = /<\/(\w+)\s*>/g; // 简化：不做完整配对，靠 void/selfClose 足够
  }
  return container;
}
function sandbox(cfg) {
  cfg = cfg || {};
  const doc = makeDoc();
  const win = {};
  const injected = [];
  const origAppend = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = function (c) {
    if (c && c.tagName === 'SCRIPT') { injected.push(c.src || ''); return c; }
    return origAppend(c);
  };
  const origCreate = doc.createElement;
  doc.createElement = function (tag) {
    const e = origCreate(tag);
    let _html = '';
    Object.defineProperty(e, 'innerHTML', {
      get() { return _html; },
      set(v) { _html = String(v); parseInto(e, _html); },
      configurable: true
    });
    // 预挂关键子元素（模块用 root.querySelector 取）
    if (String(tag).toLowerCase() === 'div') {
      [['input', 'xtlp-input'], ['div', 'xtlp-list'], ['div', 'xtlp-curline'], ['button', 'xtlp-ok']].forEach(function (p) {
        const c = origCreate(p[0]);
        Object.defineProperty(c, 'className', { value: p[1], writable: true });
        e.childNodes.push(c); c.parentNode = e;
      });
    }
    return e;
  };
  win.document = doc;
  win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
  win.addEventListener = function () {}; win.removeEventListener = function () {};
  win.innerHeight = 800;
  win.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  win.navigator = cfg.navigator || {};
  win.XT_TOAST = function (t) { win._toast = t; };
  const sb = { document: doc, navigator: win.navigator, localStorage: win.localStorage, setTimeout, clearTimeout, console };
  sb.window = win; sb.self = win;
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'xt-region.js' });
  return { win, doc, injected, sb };
}

/* ============ B3 ============ */
log('=== B3 _parseTencentGeo 边界输入安全性（经公开链路 reverseGeocode） ===');
const samples = [
  ['{status:121,message:"此key每日调用量已达到上限"}', { status: 121, message: '此key每日调用量已达到上限' }],
  ['{status:0,result:null}', { status: 0, result: null }],
  ['{}', {}],
  ['null', null],
  ['{status:0,result:{}}', { status: 0, result: {} }],
  ['{status:0,result:{address_component:null,formatted_addresses:null,pois:null}}',
    { status: 0, result: { address_component: null, formatted_addresses: null, pois: null } }],
  ['{status:0,result:{address_component:"str",formatted_addresses:1,pois:"x"}}',
    { status: 0, result: { address_component: 'str', formatted_addresses: 1, pois: 'x' } }],
  ['{result:{address:"北京市东城区"}}  (无 status) ', { result: { address: '北京市东城区' } }]
];
let si = 0;
function nextSample() {
  if (si >= samples.length) { stepB7(); return; }
  const pair = samples[si++];
  const label = pair[0], payload = pair[1];
  const s = sandbox();
  s.win.XT_REGION.GEO.timeoutMs = 4000;
  let threwAtInject = null, val = 'NOT_CALLED';
  // 取实时包装（每次 appendChild 时读当前包装）
  s.doc.head.appendChild = function (c) {
    if (c && c.tagName === 'SCRIPT') {
      const url = c.src || '';
      if (url.indexOf('apis.map.qq.com/ws/geocoder') >= 0) {
        Object.keys(s.win).forEach(function (k) {
          if (k.indexOf('__xtGeoCb') === 0 && typeof s.win[k] === 'function') {
            const f = s.win[k];
            setTimeout(function () { try { f(payload); } catch (e) { threwAtInject = e; } }, 5);
          }
        });
      }
      return c;
    }
    return null;
  };
  try { s.win.XT_REGION.reverseGeocode(39.9, 116.4, function (g) { val = g; }); } catch (e) { threwAtInject = e; }
  setTimeout(function () {
    log('  样本 ' + label);
    log('    注入/同步抛异常 = ' + (threwAtInject ? threwAtInject.message : 'null') + '   (期望 null)');
    log('    最终 cb 值     = ' + JSON.stringify(val) + '   (期望 null，链走完后兜底)');
    nextSample();
  }, 350);
}

/* ============ B7 ============ */
function stepB7() {
  log('');
  log('=== B7 locBusy 并发闸门 ===');
  const s = sandbox();
  let locateCalls = 0;
  s.win.navigator = { geolocation: { getCurrentPosition() { locateCalls++; } } };
  s.win.XT_REGION.GEO.timeoutMs = 50;
  s.win.XT_LOC_PICK.openPicker({ title: 't' }, function () {});
  const root = s.doc.body.childNodes[s.doc.body.childNodes.length - 1];
  log('  root 存在 = ' + !!root + '  id=' + (root && root.id));
  const all = []; root._walk(all);
  log('  root 子树元素数 = ' + all.length);
  const acts = all.filter(e => e.getAttribute && e.getAttribute('data-act'));
  log('  带 data-act 的元素: ' + acts.map(e => e.tagName + '[data-act=' + e.getAttribute('data-act') + ']').join(' | '));
  const btn = acts.filter(e => e.getAttribute('data-act') === 'loc')[0];
  log('  找到 loc 按钮 = ' + !!btn);
  if (!btn) { done(); return; }
  btn.click(); btn.click();
  setTimeout(function () {
    log('  getCurrentPosition 调用次数 = ' + locateCalls + '   (期望 1)');
    log('  locBusy 闸门判定: ' + (locateCalls === 1 ? 'PASS' : 'FAIL'));
    done();
  }, 400);
}
function done() {
  fs.writeFileSync('D:\\下载的文件\\学习工作台\\_qa_behavior2_out.txt', R.join('\n'), 'utf8');
  console.log('DONE2');
}
