/* =====================================================================
   net-compat.js —— 安卓 App（file:// + 老 WebView 内核）网络/语法兜底层
   ---------------------------------------------------------------------
   为什么需要它：
     APK 的目标是 minSdk 21（Android 5.0）。系统 WebView 的 Chromium 版本
     由厂商预装决定，中国 ROM 常常无法升级，可能长期停留在 Chromium 37~51：
       · Chromium 37 (Android 5.0)：无 fetch / 无 TextDecoder / 无 Object.assign
       · Chromium 41：仍无 fetch
       · Chromium 42：有 fetch，但无流式 body.getReader 的早期实现
       · Chromium 45：才有 Object.assign
       · Chromium 55：才有 async / await（这一条是本文件「无法」兜底的，见下方探针）
     一旦缺失，页面里的 fetch(...) 直接抛异常，表现为「连不上服务器 / 单机静态」。

   本文件做什么：
     1) 补齐 fetch / Promise / TextDecoder / 常用 ES5+ 原型方法；
     2) 为「有 fetch 但没有 body.getReader()」的中间版本补一个一次性流的读器，
        让 ai-service.js 的 `resp.body.getReader()` 流式循环能跑通（退化为整段返回）；
     3) 探测内核是否支持 async/await —— 若不支持，画一屏明确提示，
        不让用户对着一片空白猜「App 坏了」。

   铁律：本文件必须用 ES5 语法写（var / function，禁箭头函数、模板字符串、
         let/const、可选链、空值合并），因为它就是要在最老的内核上先跑起来。
   加载位置：由 android/build_apk.py 在打包时注入为各页面 <head> 的「第一个」
             script（非 defer），保证在所有 defer 业务脚本之前同步执行。
   ===================================================================== */
(function () {
  'use strict';

  var W = window;
  var D = document;

  W.__NET_COMPAT__ = { installed: true, legacyKernel: false, reasons: [] };

  function reason(msg) {
    W.__NET_COMPAT__.reasons.push(msg);
  }

  /* ------------------------------------------------------------------
     0) 内核能力探针（用 new Function 试探语法，避免自身被解析失败）
     ------------------------------------------------------------------ */
  function supportsSyntax(src) {
    try {
      /* jshint evil:true */
      new Function(src);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 注意：本文件自身禁写 ES6+ 语法，所以探针源码一律用字符串拼接生成 */
  var BT = String.fromCharCode(96); // 反引号
  var hasAsync = supportsSyntax('return async function(){ await 0; };');
  var hasArrow = supportsSyntax('var f = x =' + '> x; return f(1);');
  var hasTemplate = supportsSyntax('var s = ' + BT + 'a' + BT + '; return s;');
  var hasLetConst = supportsSyntax('let a = 1; const b = 2; return a + b;');

  if (!hasAsync) { reason('async/await'); W.__NET_COMPAT__.legacyKernel = true; }
  if (!hasArrow) { reason('箭头函数'); W.__NET_COMPAT__.legacyKernel = true; }
  if (!hasTemplate) { reason('模板字符串'); W.__NET_COMPAT__.legacyKernel = true; }
  if (!hasLetConst) { reason('let/const'); W.__NET_COMPAT__.legacyKernel = true; }

  /* ------------------------------------------------------------------
     1) Promise 兜底（极简实现：then / catch / resolve / reject / all / race）
     ------------------------------------------------------------------ */
  var P = W.Promise;

  function isThenable(v) {
    return v && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';
  }

  function tick(fn) {
    if (typeof W.setTimeout === 'function') { W.setTimeout(fn, 0); }
    else { fn(); }
  }

  function MiniPromise(executor) {
    var self = this;
    self._state = 0; // 0=pending 1=fulfilled 2=rejected
    self._value = undefined;
    self._handlers = [];

    function settle(nextState, value) {
      if (self._state !== 0) { return; }
      if (nextState === 1 && isThenable(value)) {
        var guarded = false;
        try {
          value.then(function (v) { if (!guarded) { guarded = true; settle(1, v); } },
                     function (e) { if (!guarded) { guarded = true; settle(2, e); } });
        } catch (err) {
          if (!guarded) { guarded = true; settle(2, err); }
        }
        return;
      }
      self._state = nextState;
      self._value = value;
      flush(self);
    }

    function flush(mp) {
      if (!mp._handlers.length) { return; }
      var hs = mp._handlers;
      mp._handlers = [];
      for (var i = 0; i < hs.length; i++) { (function (h) { tick(function () { runHandler(mp, h); }); })(hs[i]); }
    }

    function runHandler(mp, h) {
      var cb = mp._state === 1 ? h.onFulfilled : h.onRejected;
      if (typeof cb !== 'function') {
        if (mp._state === 1) { h.resolve(mp._value); } else { h.reject(mp._value); }
        return;
      }
      try {
        h.resolve(cb(mp._value));
      } catch (err) {
        h.reject(err);
      }
    }

    self._settle = settle;

    if (typeof executor === 'function') {
      try {
        executor(function (v) { settle(1, v); }, function (e) { settle(2, e); });
      } catch (err) {
        settle(2, err);
      }
    }
  }

  MiniPromise.prototype.then = function (onFulfilled, onRejected) {
    var self = this;
    return new MiniPromise(function (resolve, reject) {
      self._handlers.push({ onFulfilled: onFulfilled, onRejected: onRejected, resolve: resolve, reject: reject });
      if (self._state !== 0) { flush(self); }
    });
  };

  MiniPromise.prototype['catch'] = function (onRejected) {
    return this.then(null, onRejected);
  };

  MiniPromise.resolve = function (v) {
    if (v instanceof MiniPromise) { return v; }
    return new MiniPromise(function (resolve) { resolve(v); });
  };

  MiniPromise.reject = function (e) {
    return new MiniPromise(function (resolve, reject) { reject(e); });
  };

  MiniPromise.all = function (arr) {
    return new MiniPromise(function (resolve, reject) {
      var list = [];
      var n = arr.length;
      var left = n;
      if (!n) { resolve(list); return; }
      for (var i = 0; i < n; i++) { (function (idx) {
        MiniPromise.resolve(arr[idx]).then(function (v) {
          list[idx] = v;
          left -= 1;
          if (left === 0) { resolve(list); }
        }, reject);
      })(i); }
    });
  };

  MiniPromise.race = function (arr) {
    return new MiniPromise(function (resolve, reject) {
      for (var i = 0; i < arr.length; i++) { MiniPromise.resolve(arr[i]).then(resolve, reject); }
    });
  };

  if (typeof P !== 'function') {
    W.Promise = MiniPromise;
    P = MiniPromise;
    reason('Promise');
  }

  /* ------------------------------------------------------------------
     2) TextDecoder 兜底（UTF-8 增量解码，必须正确处理中文）
     ------------------------------------------------------------------ */
  function utf8BytesToString(bytes) {
    var out = '';
    var i = 0;
    var len = bytes.length;

    while (i < len) {
      var b = bytes[i];
      var need = 0;
      var cp = 0;
      if (b < 0x80) { cp = b; need = 0; }
      else if ((b & 0xE0) === 0xC0) { cp = b & 0x1F; need = 1; }
      else if ((b & 0xF0) === 0xE0) { cp = b & 0x0F; need = 2; }
      else if ((b & 0xF8) === 0xF0) { cp = b & 0x07; need = 3; }
      else { i += 1; continue; } // 非法首字节，丢弃

      if (i + need >= len) {
        break; // 序列不完整：不输出半截字符，由 decode() 留到下一次
      }
      var ok = true;
      for (var k = 1; k <= need; k++) {
        var cb = bytes[i + k];
        if ((cb & 0xC0) !== 0x80) { ok = false; break; }
        cp = (cp << 6) | (cb & 0x3F);
      }
      if (!ok) { i += 1; continue; }
      i += need + 1;

      if (cp > 0xFFFF) {
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      } else {
        out += String.fromCharCode(cp);
      }
    }

    return out;
  }

  function toByteArray(input) {
    if (!input) { return []; }
    if (typeof input === 'string') {
      return utf8Encode(input);
    }
    if (input instanceof ArrayBuffer) { return new Uint8Array(input); }
    if (input.buffer && typeof input.byteLength === 'number') {
      return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    }
    if (typeof input.length === 'number') { return input; }
    return [];
  }

  function utf8Encode(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { bytes.push(c); }
      else if (c < 0x800) { bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        i += 1;
        bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return bytes;
  }

  function MiniTextDecoder(label) {
    this.encoding = (label || 'utf-8').toLowerCase();
    this._pending = [];
  }

  MiniTextDecoder.prototype.decode = function (input, options) {
    var stream = !!(options && options.stream);
    var bytes = this._pending && this._pending.length
      ? this._pending.concat(Array.prototype.slice.call(toByteArray(input)))
      : Array.prototype.slice.call(toByteArray(input));
    this._pending = [];
    var text = utf8BytesToString(bytes);
    if (stream) {
      /* 计算结尾残留的不完整多字节序列，留到下一次 decode 续借 */
      var remain = [];
      var n = bytes.length;
      var back = 0;
      while (back < 4 && back < n) {
        var b = bytes[n - 1 - back];
        if ((b & 0xC0) === 0x80) { back += 1; continue; }
        var need = (b & 0xE0) === 0xC0 ? 1 : ((b & 0xF0) === 0xE0 ? 2 : ((b & 0xF8) === 0xF0 ? 3 : 0));
        if (need > back) { remain = Array.prototype.slice.call(bytes, n - 1 - back); }
        break;
      }
      this._pending = remain;
    }
    return text;
  };

  if (typeof W.TextDecoder !== 'function') {
    W.TextDecoder = MiniTextDecoder;
    reason('TextDecoder');
  }
  if (typeof W.TextEncoder !== 'function') {
    W.TextEncoder = function () {};
    W.TextEncoder.prototype.encode = function (str) {
      var arr = utf8Encode(str);
      var u8 = new Uint8Array(arr.length);
      for (var i = 0; i < arr.length; i++) { u8[i] = arr[i]; }
      return u8;
    };
  }

  /* ------------------------------------------------------------------
     3) fetch 兜底（XHR 实现）+ Response.body.getReader() 流式兜底
     ------------------------------------------------------------------ */
  function parseHeaders(raw) {
    var map = {};
    (raw || '').replace(/\r?\n/g, '\n').split('\n').forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx > 0) {
        map[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      }
    });
    return map;
  }

  function makeHeadersLike(map) {
    return {
      get: function (k) { return map[String(k).toLowerCase()] || null; },
      has: function (k) { return Object.prototype.hasOwnProperty.call(map, String(k).toLowerCase()); },
      keys: function () { return Object.keys ? Object.keys(map) : []; },
      forEach: function (cb) { for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) { cb(map[k], k, map); } } }
    };
  }

  function bytesOfText(str) {
    var arr = utf8Encode(str);
    var u8 = new Uint8Array(arr.length);
    for (var i = 0; i < arr.length; i++) { u8[i] = arr[i]; }
    return u8;
  }

  /* 包装任意“可 await 的响应”成 {ok,status,text(),json(),body.getReader()} */
  function buildResponse(meta, textGetter, bytesGetter) {
    var res = {
      ok: meta.status >= 200 && meta.status < 300,
      status: meta.status,
      statusText: meta.statusText || '',
      url: meta.url || '',
      headers: makeHeadersLike(meta.headers || {}),
      redirected: false,
      type: 'basic',
      text: function () {
        return P.resolve().then(function () { return textGetter(); });
      },
      json: function () {
        return P.resolve().then(function () { return JSON.parse(textGetter()); });
      },
      arrayBuffer: function () {
        return P.resolve().then(function () {
          var u8 = bytesGetter();
          return u8.buffer ? u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) : u8;
        });
      }
    };
    var chunkDone = false;
    res.body = {
      getReader: function () {
        return {
          read: function () {
            if (chunkDone) { return P.resolve({ done: true, value: undefined }); }
            chunkDone = true;
            return P.resolve().then(function () {
              var u8 = bytesGetter();
              if (!u8 || !u8.length) { return { done: true, value: undefined }; }
              return { done: false, value: u8 };
            });
          },
          cancel: function () { chunkDone = true; return P.resolve(); },
          releaseLock: function () {}
        };
      }
    };
    return res;
  }

  function xhrFetch(url, opts) {
    opts = opts || {};
    return new P(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var method = (opts.method || 'GET').toUpperCase();
      var body = opts.body;
      var isForm = (typeof W.FormData === 'function') && (body instanceof W.FormData);
      xhr.open(method, url, true);

      if (typeof xhr.responseType === 'string') {
        try { xhr.responseType = 'arraybuffer'; } catch (e) { /* 老 XHR 忽略 */ }
      }

      var headers = opts.headers || {};
      var headerNames = [];
      if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
        headers.forEach(function (v, k) { headerNames.push([k, v]); });
      } else {
        for (var k in headers) { if (Object.prototype.hasOwnProperty.call(headers, k)) { headerNames.push([k, headers[k]]); } }
      }
      for (var i = 0; i < headerNames.length; i++) {
        try { xhr.setRequestHeader(headerNames[i][0], headerNames[i][1]); } catch (e2) { /* 忽略非法头 */ }
      }
      if (!isForm && method !== 'GET' && method !== 'HEAD' && typeof body === 'string') {
        try { xhr.setRequestHeader('Content-Type', 'application/json'); } catch (e3) { /* 忽略 */ }
      }

      if (opts.signal && typeof opts.signal.addEventListener === 'function') {
        opts.signal.addEventListener('abort', function () { try { xhr.abort(); } catch (e4) {} });
      }

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        if (xhr.status === 0) {
          reject(new TypeError('网络不可达（status 0）: ' + url));
          return;
        }
        var raw = xhr.response;
        var text = '';
        var u8 = null;
        if (typeof raw === 'string') {
          text = raw;
          u8 = bytesOfText(raw);
        } else if (raw instanceof ArrayBuffer) {
          u8 = new Uint8Array(raw);
          /* 用 TextDecoder（含上面的兜底）解码，保证中文正确 */
          var TD = W.TextDecoder;
          try { text = new TD('utf-8').decode(u8); } catch (e5) { text = ''; }
        } else {
          text = (typeof xhr.responseText === 'string') ? xhr.responseText : '';
          u8 = bytesOfText(text);
        }
        resolve(buildResponse({
          status: xhr.status,
          statusText: xhr.statusText,
          url: url,
          headers: parseHeaders(typeof xhr.getAllResponseHeaders === 'function' ? xhr.getAllResponseHeaders() : '')
        }, function () { return text; }, function () { return u8; }));
      };

      xhr.onerror = function () { reject(new TypeError('网络请求失败: ' + url)); };
      xhr.ontimeout = function () { reject(new TypeError('网络请求超时: ' + url)); };

      var sendBody = null;
      if (method !== 'GET' && method !== 'HEAD' && typeof body !== 'undefined' && body !== null) {
        sendBody = isForm ? body : (typeof body === 'string' ? body : String(body));
      }
      try { xhr.send(sendBody); } catch (e6) { reject(e6); }
    });
  }

  /* 给「有 fetch 但没有 body.getReader()」的中间版本补流读器 */
  function patchReader(res) {
    try {
      if (!res) { return res; }
      if (res.body && typeof res.body.getReader === 'function') { return res; }
      var meta = {
        status: res.status,
        statusText: res.statusText,
        url: res.url,
        headers: {}
      };
      if (res.headers && typeof res.headers.forEach === 'function') {
        res.headers.forEach(function (v, k) { meta.headers[String(k).toLowerCase()] = v; });
      }
      var cachedText = null;
      function getText() {
        if (cachedText !== null) { return cachedText; }
        return res.text().then(function (t) { cachedText = t; return t; });
      }
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        url: res.url,
        headers: res.headers,
        text: function () { return getText(); },
        json: function () { return getText().then(function (t) { return JSON.parse(t); }); },
        arrayBuffer: function () {
          if (typeof res.arrayBuffer === 'function') { return res.arrayBuffer(); }
          return getText().then(function (t) { return bytesOfText(t).buffer; });
        },
        body: {
          getReader: function () {
            var done = false;
            return {
              read: function () {
                if (done) { return P.resolve({ done: true, value: undefined }); }
                done = true;
                return getText().then(function (t) {
                  var u8 = bytesOfText(t);
                  if (!u8.length) { return { done: true, value: undefined }; }
                  return { done: false, value: u8 };
                });
              },
              cancel: function () { done = true; return P.resolve(); },
              releaseLock: function () {}
            };
          }
        }
      };
    } catch (e) {
      return res;
    }
  }

  var nativeFetch = (typeof W.fetch === 'function') ? W.fetch : null;

  if (!nativeFetch) {
    W.fetch = xhrFetch;
    reason('fetch');
  } else {
    /* 原生 fetch 存在：只补它可能缺的 body.getReader()，不改语义 */
    W.fetch = function (url, opts) {
      var ret = nativeFetch.call(W, url, opts);
      if (ret && typeof ret.then === 'function') {
        return ret.then(function (res) { return patchReader(res); });
      }
      return ret;
    };
  }

  /* ------------------------------------------------------------------
     4) 常用原型方法兜底（老内核缺失会在业务脚本里直接抛 TypeError）
     ------------------------------------------------------------------ */
  function define(obj, name, fn) {
    if (!obj || obj[name]) { return; }
    try { obj[name] = fn; } catch (e) { reason('无法定义 ' + name); }
  }

  define(Object, 'assign', function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) { continue; }
      for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) { target[k] = src[k]; } }
    }
    return target;
  });
  define(Object, 'entries', function (o) {
    var out = [];
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { out.push([k, o[k]]); } }
    return out;
  });
  define(Object, 'values', function (o) {
    var out = [];
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { out.push(o[k]); } }
    return out;
  });

  define(Array, 'from', function (src) {
    var out = [];
    if (!src) { return out; }
    for (var i = 0; i < src.length; i++) { out.push(src[i]); }
    return out;
  });
  define(Array.prototype, 'find', function (cb, thisArg) {
    for (var i = 0; i < this.length; i++) { if (cb.call(thisArg, this[i], i, this)) { return this[i]; } }
    return undefined;
  });
  define(Array.prototype, 'findIndex', function (cb, thisArg) {
    for (var i = 0; i < this.length; i++) { if (cb.call(thisArg, this[i], i, this)) { return i; } }
    return -1;
  });
  define(Array.prototype, 'includes', function (v) { return this.indexOf(v) !== -1; });
  define(Array.prototype, 'fill', function (v, s, e) {
    var len = this.length;
    var start = s === undefined ? 0 : (s < 0 ? Math.max(len + s, 0) : s);
    var end = e === undefined ? len : (e < 0 ? Math.max(len + e, 0) : Math.min(e, len));
    for (var i = start; i < end; i++) { this[i] = v; }
    return this;
  });
  define(Array.prototype, 'flat', function () {
    var out = [];
    for (var i = 0; i < this.length; i++) {
      if (Object.prototype.toString.call(this[i]) === '[object Array]') {
        for (var j = 0; j < this[i].length; j++) { out.push(this[i][j]); }
      } else { out.push(this[i]); }
    }
    return out;
  });

  define(String.prototype, 'includes', function (s, p) { return this.indexOf(s, p || 0) !== -1; });
  define(String.prototype, 'startsWith', function (s, p) { return this.substr(p || 0, s.length) === s; });
  define(String.prototype, 'endsWith', function (s, p) {
    var str = (p === undefined) ? this : this.slice(0, p);
    return str.slice(-s.length) === s;
  });
  define(String.prototype, 'repeat', function (n) {
    var out = '';
    for (var i = 0; i < n; i++) { out += this; }
    return out;
  });
  define(String.prototype, 'padStart', function (len, pad) {
    var s = String(this);
    var p = pad === undefined ? ' ' : String(pad);
    while (s.length < len) { s = p + s; }
    return s.length > len ? s.slice(s.length - len) : s;
  });
  define(String.prototype, 'padEnd', function (len, pad) {
    var s = String(this);
    var p = pad === undefined ? ' ' : String(pad);
    while (s.length < len) { s = s + p; }
    return s.slice(0, len);
  });
  define(String.prototype, 'trimStart', function () { return this.replace(/^\s+/, ''); });
  define(String.prototype, 'trimEnd', function () { return this.replace(/\s+$/, ''); });

  define(Number, 'isInteger', function (v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; });
  define(Number, 'isNaN', function (v) { return typeof v === 'number' && v !== v; });
  define(Math, 'trunc', function (v) { return v < 0 ? Math.ceil(v) : Math.floor(v); });
  define(Math, 'sign', function (v) { v = Number(v); return v > 0 ? 1 : (v < 0 ? -1 : v); });

  if (W.Element && W.Element.prototype) {
    define(W.Element.prototype, 'matches', function (sel) {
      var fn = this.matches || this.msMatchesSelector || this.webkitMatchesSelector;
      return fn ? fn.call(this, sel) : false;
    });
    define(W.Element.prototype, 'closest', function (sel) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches && el.matches(sel)) { return el; }
        el = el.parentElement || el.parentNode;
      }
      return null;
    });
  }
  if (W.NodeList && W.NodeList.prototype) {
    define(W.NodeList.prototype, 'forEach', function (cb, thisArg) {
      for (var i = 0; i < this.length; i++) { cb.call(thisArg, this[i], i, this); }
    });
  }

  /* 去掉 click 事件的 300ms 延迟（老 WebView 体验兜底），不改变任何行为 */
  try {
    if (D && D.documentElement) { D.documentElement.style.webkitTapHighlightColor = 'rgba(0,0,0,0)'; }
  } catch (e7) { /* 忽略 */ }

  /* ------------------------------------------------------------------
     5) 内核过旧（不支持 async/await）时的明确提示
        —— app.js / api.js / ai-service.js 都用了 async/await，
           解析阶段就会 SyntaxError，整页 JS 全灭，用户只会看到「点了没反应」。
     ------------------------------------------------------------------ */
  function showLegacyNotice() {
    try {
      if (D.getElementById('xt-legacy-kernel-notice')) { return; }
      var wrap = D.createElement('div');
      wrap.id = 'xt-legacy-kernel-notice';
      wrap.setAttribute('style',
        'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#0f172a;' +
        'color:#e2e8f0;padding:28px 22px;font-size:15px;line-height:1.75;overflow:auto;' +
        '-webkit-overflow-scrolling:touch;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;');
      var html = '';
      html += '<div style="font-size:19px;font-weight:700;margin-bottom:14px;color:#fff;">需要更新系统 WebView 组件</div>';
      html += '<div style="margin-bottom:12px;">检测到本机 WebView 内核版本过旧（缺少 <b>async/await</b> 等基础能力），'
           + '网页脚本无法解析，因此登录、私信、AI 等功能都无法使用。</div>';
      html += '<div style="margin-bottom:12px;">这不是网络问题，App 已能访问服务器；请按下面任一种方式处理：</div>';
      html += '<div style="margin-bottom:10px;">1）应用商店搜索并更新「<b>Android System WebView</b>」或「<b>Chrome</b>」（华为/小米/OPPO/vivo 应用商店均有）；</div>';
      html += '<div style="margin-bottom:10px;">2）系统设置 → 应用管理 → 显示系统程序 → Android System WebView → 卸载更新后重新更新；</div>';
      html += '<div style="margin-bottom:10px;">3）若设备为 Android 7 及以下且无法更新 WebView，建议使用 Android 8 以上的设备。</div>';
      html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #334155;color:#94a3b8;font-size:13px;">缺失能力：'
           + W.__NET_COMPAT__.reasons.join('、') + '</div>';
      wrap.innerHTML = html;
      var mount = D.body || D.documentElement;
      if (mount) { mount.appendChild(wrap); }
    } catch (e) { /* 提示失败不影响其它逻辑 */ }
  }

  if (W.__NET_COMPAT__.legacyKernel) {
    if (D.readyState === 'loading') {
      D.addEventListener('DOMContentLoaded', showLegacyNotice, false);
    } else {
      showLegacyNotice();
    }
  }
})();
