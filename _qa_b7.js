/* R96 QA · B7 locBusy 并发闸门（v4，桩已修正） */
'use strict';
const fs = require('fs');
const vm = require('vm');
const R = [];
function el(t) {
  const e = {
    tagName: String(t).toUpperCase(), childNodes: [], parentNode: null, attrs: {}, style: {},
    className: '', id: '', textContent: '', value: '', src: '', charset: '', _ls: {},
    setAttribute(k, v) { e.attrs[k] = String(v); },
    getAttribute(k) { return (k in e.attrs) ? e.attrs[k] : null; },
    removeAttribute(k) { delete e.attrs[k]; },
    appendChild(c) { c.parentNode = e; e.childNodes.push(c); return c; },
    removeChild(c) { const i = e.childNodes.indexOf(c); if (i >= 0) { e.childNodes.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener(t, f) { (e._ls[t] = e._ls[t] || []).push(f); },
    removeEventListener(t, f) { const a = e._ls[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    getBoundingClientRect() { return { height: 800, width: 400 }; },
    focus() {},
    _walk(m) { m.push(e); e.childNodes.forEach(c => c._walk(m)); },
    _match(s) {
      if (s[0] === '.') return e.className === s.slice(1);
      if (s[0] === '[') return e.getAttribute(s.slice(1, -1)) !== null;
      return e.tagName === s.toUpperCase();
    },
    querySelector(s) { const m = []; e._walk(m); for (const x of m) if (x._match(s)) return x; return null; },
    querySelectorAll(s) { const m = []; e._walk(m); return m.filter(x => x._match(s)); },
    click() {
      let n = e;
      while (n) { ((n._ls && n._ls.click) || []).slice().forEach(f => f({ target: e, currentTarget: n })); n = n.parentNode; }
    }
  };
  return e;
}
function parseInto(cont, html) {
  cont.childNodes = [];
  const re = /<(\w+)([^>]*?)(\/?)>/g;
  const vd = { br: 1, input: 1, img: 1, meta: 1, link: 1 };
  const st = [cont];
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(), as = m[2] || '', sc = m[3] === '/';
    const x = el(tag);
    const ar = /([\w:-]+)\s*=\s*"([^"]*)"/g; let a;
    while ((a = ar.exec(as))) x.setAttribute(a[1], a[2]);
    st[st.length - 1].appendChild(x);
    if (!vd[tag] && !sc) st.push(x);
  }
  return cont;
}
const head = el('head'), body = el('body');
const doc = {
  documentElement: el('html'), head, body,
  addEventListener() {}, removeEventListener() {},
  getElementsByTagName: t => String(t).toLowerCase() === 'head' ? [head] : [body]
};
doc.createElement = function (tag) {
  const e = el(tag);
  let h = '';
  Object.defineProperty(e, 'innerHTML', {
    get() { return h; }, set(v) { h = String(v); parseInto(e, h); }, configurable: true
  });
  if (String(tag).toLowerCase() === 'div') {
    const inp = el('input'); inp.className = 'xtlp-input'; e.appendChild(inp);
    const li = el('div'); li.className = 'xtlp-list'; e.appendChild(li);
    const cl = el('div'); cl.className = 'xtlp-curline'; e.appendChild(cl);
    const ok = el('button'); ok.className = 'xtlp-ok'; e.appendChild(ok);
  }
  return e;
};
const win = {}; const inj = [];
const oa = doc.head.appendChild.bind(head);
doc.head.appendChild = function (c) { if (c && c.tagName === 'SCRIPT') { inj.push(c.src || ''); return c; } return oa(c); };
win.document = doc; win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
win.addEventListener = function () {}; win.removeEventListener = function () {}; win.innerHeight = 800;
win.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } };
let locateCalls = 0;
win.navigator = { geolocation: { getCurrentPosition() { locateCalls++; R.push('    [getCurrentPosition 第 ' + locateCalls + ' 次被调用]'); } } };
win.XT_TOAST = function (t) { R.push('    [toast] ' + t); };
const sb = { document: doc, navigator: win.navigator, localStorage: win.localStorage, setTimeout, clearTimeout, console };
sb.window = win; sb.self = win;
vm.createContext(sb);
vm.runInContext(fs.readFileSync('D:\\下载的文件\\学习工作台\\assets\\xt-region.js', 'utf8'), sb, { filename: 'xt-region.js' });

R.push('=== B7 locBusy 并发闸门 ===');
win.XT_REGION.GEO.timeoutMs = 60;
win.XT_LOC_PICK.openPicker({ title: '选择位置' }, function (v) { R.push('    [picker 回调] ' + JSON.stringify(v)); });
const root = body.childNodes[body.childNodes.length - 1];
const all = []; root._walk(all);
const btn = all.filter(x => x.getAttribute && x.getAttribute('data-act') === 'loc')[0];
R.push('  定位按钮存在 = ' + !!btn);
R.push('  --- 连点两次「用当前位置」---');
btn.click();
btn.click();
setTimeout(function () {
  R.push('  getCurrentPosition 总调用次数 = ' + locateCalls + '   (期望 1)');
  R.push('  B7 判定: ' + (locateCalls === 1 ? 'PASS（第二次被 locBusy 拦下）' : 'FAIL'));
  fs.writeFileSync('D:\\下载的文件\\学习工作台\\_qa_b7_out.txt', R.join('\n'), 'utf8');
  console.log('B7DONE');
}, 600);
