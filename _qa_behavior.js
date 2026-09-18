/* R96 QA 行为级验证：Node + 手写 DOM 桩，真实加载并执行 assets/xt-region.js */
'use strict';
const fs = require('fs');
const path = require('path');
const R = [];
function log(s) { R.push(s); }

const SRC = fs.readFileSync('D:\\下载的文件\\学习工作台\\assets\\xt-region.js', 'utf8');

// ---------- 极简 DOM 桩 ----------
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], parentNode: null, attributes: {}, style: {},
    className: '', id: '', textContent: '', innerHTML: '', value: '', src: '', charset: '',
    _listeners: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return (k in this.attributes) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } return c; },
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    removeEventListener(t, f) { const a = this._listeners[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    querySelector() { return makeEl('div'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { height: 800, width: 400 }; },
    focus() {},
    _emit(t, ev) { (this._listeners[t] || []).slice().forEach(f => f(ev)); }
  };
  return el;
}
function makeDoc() {
  const head = makeEl('head');
  const body = makeEl('body');
  return {
    documentElement: makeEl('html'), head, body,
    createElement: makeEl,
    getElementsByTagName(t) { return String(t).toLowerCase() === 'head' ? [head] : [body]; },
    addEventListener() {}, removeEventListener() {},
    _scripts: []
  };
}

// ---------- 每次用例：全新沙箱 ----------
function sandbox(cfg) {
  cfg = cfg || {};
  const doc = makeDoc();
  const win = {};
  const injected = [];      // 记录所有被注入的 script.src（= JSONP URL）
  const xhrCalls = [];
  const fetchCalls = [];
  // 拦截 script 注入：把 appendChild 到 head 的 script 记下来
  const origAppend = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = function (c) {
    if (c && c.tagName === 'SCRIPT') injected.push(c.src || '');
    return origAppend(c);
  };
  win.document = doc;
  win.setTimeout = cfg.setTimeout || setTimeout;
  win.clearTimeout = cfg.clearTimeout || clearTimeout;
  win.addEventListener = function () {};
  win.removeEventListener = function () {};
  win.innerHeight = 800;
  win.XMLHttpRequest = function () { xhrCalls.push(1); };
  win.fetch = function (u) { fetchCalls.push(u); return { then() { return this; }, catch() { return this; } }; };
  win.geolocation = undefined;
  win.localStorage = {
    _m: {}, getItem(k) { return (k in this._m) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }
  };
  win.navigator = cfg.navigator || {};
  if (cfg.geolocation !== undefined) win.geolocation = cfg.geolocation;

  const ctx = { window: win, document: doc, navigator: win.navigator, localStorage: win.localStorage,
                setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, console: console };
  const vm = require('vm');
  const sandboxObj = Object.assign({}, ctx);
  sandboxObj.window = win;
  sandboxObj.self = win;
  vm.createContext(sandboxObj);
  vm.runInContext(SRC, sandboxObj, { filename: 'xt-region.js' });
  return { win, doc, injected, xhrCalls, fetchCalls, sandboxObj };
}

function run() {
  const vm = require('vm');

  /* ============ B1 加载不抛异常 + 导出函数存在 ============ */
  log('=== B1 加载与导出 ===');
  let S;
  try {
    S = sandbox();
    log('加载: 无异常 OK');
  } catch (e) {
    log('加载: 抛异常 FAIL :: ' + e.message);
    fs.writeFileSync('D:\\下载的文件\\学习工作台\\_qa_behavior_out.txt', R.join('\n'), 'utf8');
    return;
  }
  log('typeof XT_REGION.nearby     = ' + typeof S.win.XT_REGION.nearby);
  log('typeof XT_LOC_PICK.openPicker = ' + typeof S.win.XT_LOC_PICK.openPicker);
  log('typeof XT_REGION.reverseGeocode = ' + typeof S.win.XT_REGION.reverseGeocode);
  log('typeof XT_REGION.locate = ' + typeof S.win.XT_REGION.locate);
  log('GEO = ' + JSON.stringify(S.win.XT_REGION.GEO));
  log('XT_REGION keys = ' + Object.keys(S.win.XT_REGION).join(','));
  log('XT_LOC_PICK keys = ' + Object.keys(S.win.XT_LOC_PICK).join(','));

  /* ============ B2 降级链：全部失败 → cb(null) 且不抛 ============ */
  log('');
  log('=== B2a 降级链：JSONP 全部失败（不触发 onload/onerror，等真实超时） ===');
  // 用短超时：直接 monkeypatch GEO.timeoutMs
  {
    const s = sandbox();
    s.win.XT_REGION.GEO.timeoutMs = 60;
    let cbVal = 'NOT_CALLED', threw = null;
    try {
      s.win.XT_REGION.reverseGeocode(39.9087, 116.3975, function (g) { cbVal = g; });
    } catch (e) { threw = e; }
    log('  同步返回后 cbVal=' + cbVal + ' threw=' + threw);
  }
  // 上面是同步检查；真正等超时用异步版本
  {
    const s = sandbox();
    s.win.XT_REGION.GEO.timeoutMs = 60;
    let cbVal = 'NOT_CALLED', threw = null;
    try {
      s.win.XT_REGION.reverseGeocode(39.9087, 116.3975, function (g) { cbVal = g; });
    } catch (e) { threw = e; }
    setTimeout(function () {
      log('  异步(1200ms后) cbVal=' + JSON.stringify(cbVal) + ' threw=' + (threw ? threw.message : 'null'));
      log('  注入的 JSONP URL 数=' + s.injected.length);
      s.injected.forEach(function (u, i) { log('    URL[' + i + '] = ' + u.slice(0, 160)); });
      log('  含 place/v1 的 URL 数=' + s.injected.filter(u => u.indexOf('place/v1') >= 0).length);
      log('  含 apis.map.qq.com/ws/place 的 URL 数=' + s.injected.filter(u => u.indexOf('apis.map.qq.com/ws/place') >= 0).length);
      log('  xhr 调用数=' + s.xhrCalls.length + ' fetch 调用数=' + s.fetchCalls.length);

      stepB2b();
    }, 1200);
  }
  function stepB2b() {
    log('');
    log('=== B2b 降级链：tencent 返回 {status:121}（额度打爆） ===');
    const s = sandbox();
    s.win.XT_REGION.GEO.timeoutMs = 80;
    let cbVal = 'NOT_CALLED', threw = null;
    const origAppend = s.doc.head.appendChild;
    try {
      s.win.XT_REGION.reverseGeocode(39.9087, 116.3975, function (g) { cbVal = g; });
    } catch (e) { threw = e; }
    // 立刻对每个注入的 script 模拟 status:121 回调
    s.injected.length = 0;
    // 重新触发一次：让 script 注入后调用 window[cbName]
    setTimeout(function () {
      // 找到所有 __xtGeoCb* 回调并灌入 status:121
      let n = 0;
      Object.keys(s.win).forEach(function (k) {
        if (k.indexOf('__xtGeoCb') === 0 && typeof s.win[k] === 'function') { n++; s.win[k]({ status: 121, message: '此key每日调用量已达到上限' }); }
      });
      log('  灌入 status:121 的回调数=' + n);
      setTimeout(function () {
        log('  异步 cbVal=' + JSON.stringify(cbVal) + ' threw=' + (threw ? threw.message : 'null'));
        log('  累计注入 URL 数=' + s.injected.length);
        s.injected.forEach(function (u, i) { log('    URL[' + i + '] = ' + u.slice(0, 150)); });
        stepB3();
      }, 700);
    }, 30);
  }

  /* ============ B3 _parseTencentGeo 收到 status:121 无 result ============ */
  function stepB3() {
    log('');
    log('=== B3 status:121（无 result 字段）解析安全性 ===');
    // _parseTencentGeo 未导出，走公开链路：桩 JSONP 注入后灌 status:121，看是否抛
    const s = sandbox();
    s.win.XT_REGION.GEO.timeoutMs = 2000;
    let threw = null, cbVal = 'NOT_CALLED';
    try { s.win.XT_REGION.reverseGeocode(39.9, 116.4, function (g) { cbVal = g; }); } catch (e) { threw = e; }
    setTimeout(function () {
      let n = 0;
      Object.keys(s.win).forEach(function (k) {
        if (k.indexOf('__xtGeoCb') === 0 && typeof s.win[k] === 'function') { n++; try { s.win[k]({ status: 121, message: '此key每日调用量已达到上限' }); } catch (e) { threw = e; } }
      });
      log('  回调数=' + n + ' 灌入时 threw=' + (threw ? threw.message : 'null'));
      setTimeout(function () { log('  最终 cbVal=' + JSON.stringify(cbVal)); stepB4(); }, 900);
    }, 40);
  }

  /* ============ B4 正常解析 ============ */
  function stepB4() {
    log('');
    log('=== B4 正常成功响应解析 ===');
    const pois = [];
    for (let i = 0; i < 10; i++) pois.push({ title: 'POI' + i, address: '地址' + i, category: '分类' + i, _distance: String(i * 100) });
    const sample = {
      status: 0,
      result: {
        address: '北京市东城区西长安街',
        address_component: { province: '北京市', city: '北京市', district: '东城区', street: '西长安街', street_number: '' },
        formatted_addresses: { recommend: '天安门城楼', rough: '北京市东城区西长安街' },
        pois: pois
      }
    };
    const s = sandbox();
    s.win.XT_REGION.GEO.timeoutMs = 2000;
    let g = 'NOT_CALLED';
    s.win.XT_REGION.reverseGeocode(39.9087, 116.3975, function (r) { g = r; });
    setTimeout(function () {
      Object.keys(s.win).forEach(function (k) {
        if (k.indexOf('__xtGeoCb') === 0 && typeof s.win[k] === 'function') s.win[k](sample);
      });
      setTimeout(function () {
        log('  g = ' + JSON.stringify(g));
        if (g && typeof g === 'object') {
          log('  street === "西长安街"  -> ' + (g.street === '西长安街'));
          log('  recommend === "天安门城楼" -> ' + (g.recommend === '天安门城楼'));
          log('  text === "北京市东城区西长安街" -> ' + (g.text === '北京市东城区西长安街'));
          log('  pois.length === 10 -> ' + (g.pois.length === 10));
          log('  pois[0] = ' + JSON.stringify(g.pois[0]));
        }
        stepB5();
      }, 300);
    }, 40);
  }

  /* ============ B5 nearby 不发 place 请求 ============ */
  function stepB5() {
    log('');
    log('=== B5 nearby 不调用 place/v1 ===');
    const s = sandbox();
    s.win.XT_REGION.GEO.timeoutMs = 60;
    let got = 'NOT_CALLED';
    s.win.XT_REGION.nearby(39.9087, 116.3975, function (l) { got = l; });
    setTimeout(function () {
      log('  注入 URL 总数=' + s.injected.length);
      s.injected.forEach(function (u, i) { log('    URL[' + i + '] = ' + u.slice(0, 160)); });
      const bad = s.injected.filter(u => u.indexOf('place/v1') >= 0 || u.indexOf('/ws/place') >= 0);
      log('  含 place/v1 或 /ws/place 的 URL 数 = ' + bad.length + '  (期望 0)');
      log('  xhr=' + s.xhrCalls.length + ' fetch=' + s.fetchCalls.length + ' (期望 0/0)');
      log('  nearby 回调（全失败时） = ' + JSON.stringify(got) + '  (期望 [])');
      stepB6();
    }, 900);
  }

  /* ============ B6 locate 重试语义 ============ */
  function stepB6() {
    log('');
    log('=== B6a locate: 第1次 {code:3} → 第2次成功 ===');
    let calls = 0;
    const geo = {
      getCurrentPosition(ok, err, opt) {
        calls++;
        const n = calls;
        if (n === 1) setTimeout(function () { err({ code: 3, message: 'timeout' }); }, 10);
        else setTimeout(function () { ok({ coords: { latitude: 39.9, longitude: 116.4 } }); }, 10);
      }
    };
    const s = sandbox({ navigator: { geolocation: geo } });
    let res = 'NOT_CALLED';
    s.win.XT_REGION.locate(function (r) { res = r; });
    setTimeout(function () {
      log('  getCurrentPosition 调用次数 = ' + calls + '  (期望 2)');
      log('  结果 = ' + JSON.stringify(res) + '  (期望 ok:true)');
      stepB6b();
    }, 900);

    function stepB6b() {
      log('');
      log('=== B6b locate: {code:1} → 不重试，denied ===');
      let c2 = 0;
      const geo2 = {
        getCurrentPosition(ok, err) { c2++; setTimeout(function () { err({ code: 1, message: 'denied' }); }, 10); }
      };
      const s2 = sandbox({ navigator: { geolocation: geo2 } });
      let r2 = 'NOT_CALLED';
      s2.win.XT_REGION.locate(function (r) { r2 = r; });
      setTimeout(function () {
        log('  getCurrentPosition 调用次数 = ' + c2 + '  (期望 1)');
        log('  结果 = ' + JSON.stringify(r2) + '  (期望 reason:"denied")');
        stepB7();
      }, 900);
    }
  }

  /* ============ B7 locBusy 闸门 ============ */
  function stepB7() {
    log('');
    log('=== B7 locBusy 并发闸门（openPicker 内「用当前位置」连点两次） ===');
    const s = sandbox();
    // openPicker 依赖 DOM；用 querySelector 返回真实元素以便拿按钮
    const made = {};
    s.doc.createElement = function (tag) { const e = makeEl(tag); made[tag] = e; return e; };
    // root.querySelector 需要返回 input/list/curline/ok 四个元素（openPicker 内使用）
    const origCreate = s.doc.createElement;
    s.doc.createElement = function (tag) {
      const e = origCreate(tag);
      e.querySelector = function (sel) {
        if (sel === '.xtlp-input') return (e._q = e._q || makeEl('input'));
        if (sel === '.xtlp-list') return (e._q2 = e._q2 || makeEl('div'));
        if (sel === '.xtlp-curline') return (e._q3 = e._q3 || makeEl('div'));
        if (sel === '.xtlp-ok') return (e._q4 = e._q4 || makeEl('button'));
        return makeEl('div');
      };
      return e;
    };

    let locateCalls = 0;
    const geo = {
      getCurrentPosition(ok, err) { locateCalls++; /* 永不回调，保持 locBusy 置位 */ }
    };
    s.win.navigator = { geolocation: geo };
    s.win.XT_REGION.GEO.timeoutMs = 50;

    let pickerCb = null;
    try {
      s.win.XT_LOC_PICK.openPicker({ title: 't' }, function (v) { pickerCb = v; });
    } catch (e) {
      log('  openPicker 抛异常 FAIL :: ' + e.message);
      log('  （openPicker 依赖真实 DOM，桩不足）');
      finish();
      return;
    }
    const root = s.doc.body.children[s.doc.body.children.length - 1];
    if (!root) { log('  root 未挂载 FAIL'); finish(); return; }
    // 模拟两次点击「data-act="loc"」
    const fakeBtn = makeEl('button');
    fakeBtn.setAttribute('data-act', 'loc');
    fakeBtn.parentNode = root;
    // root.addEventListener('click') 已注册；用根的 _emit
    const ev = { target: fakeBtn };
    // 注意：handleClick 从 ev.target 向上找 data-act，fakeBtn 自带，成立
    root._emit('click', ev);
    root._emit('click', ev);
    setTimeout(function () {
      log('  getCurrentPosition 调用次数 = ' + locateCalls + '  (期望 1，闸门生效)');
      finish();
    }, 500);
  }

  function finish() {
    fs.writeFileSync('D:\\下载的文件\\学习工作台\\_qa_behavior_out.txt', R.join('\n'), 'utf8');
    console.log('BEHAVIOR_DONE');
  }
}

try { run(); } catch (e) {
  log('!!! 顶层异常: ' + e.stack);
  fs.writeFileSync('D:\\下载的文件\\学习工作台\\_qa_behavior_out.txt', R.join('\n'), 'utf8');
}
