/*!
 * xt-polyfill.js  v20260916i
 * 老 WebView（Android System WebView / Chrome 50~58）运行时 API 兜底层。
 *
 * 铁律：
 *  1. 本文件必须保持 ES5 语法（var / function / 字符串拼接），
 *     不得出现 let/const/箭头函数/模板字符串/class/可选链/对象展开等新语法，
 *     否则老内核解析本文件就会失败，整站一起崩。
 *  2. 所有 shim 都先判断原生是否存在，存在则绝不覆盖。
 *  3. 每个 shim 独立 try/catch，单个失败不影响后续。
 */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var slice = Array.prototype.slice;

  function safe(name, fn) {
    try {
      fn();
    } catch (e) {
      try {
        if (global.console && global.console.warn) {
          global.console.warn('[xt-polyfill] ' + name + ' failed: ' + e);
        }
      } catch (e2) {}
    }
  }

  /* ---------------------------------------------------------------- Object */

  safe('Object.assign', function () {
    if (Object.assign) { return; }
    Object.assign = function (target) {
      if (target === null || target === undefined) {
        throw new TypeError('Object.assign: target is null or undefined');
      }
      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (src === null || src === undefined) { continue; }
        for (var key in src) {
          if (hasOwn.call(src, key)) { to[key] = src[key]; }
        }
      }
      return to;
    };
  });

  safe('Object.values', function () {
    if (Object.values) { return; }
    Object.values = function (obj) {
      var out = [];
      if (obj === null || obj === undefined) { return out; }
      var o = Object(obj);
      for (var key in o) {
        if (hasOwn.call(o, key)) { out.push(o[key]); }
      }
      return out;
    };
  });

  safe('Object.entries', function () {
    if (Object.entries) { return; }
    Object.entries = function (obj) {
      var out = [];
      if (obj === null || obj === undefined) { return out; }
      var o = Object(obj);
      for (var key in o) {
        if (hasOwn.call(o, key)) { out.push([key, o[key]]); }
      }
      return out;
    };
  });

  /* ----------------------------------------------------------------- Array */

  safe('Array.from', function () {
    if (Array.from) { return; }
    Array.from = function (src) {
      var mapFn = arguments.length > 1 ? arguments[1] : undefined;
      var thisArg = arguments.length > 2 ? arguments[2] : undefined;
      var out = [];
      var i = 0;
      if (src === null || src === undefined) { return out; }
      if (typeof src.length === 'number') {
        var len = src.length;
        for (i = 0; i < len; i++) { out.push(src[i]); }
      } else {
        for (var key in src) {
          if (hasOwn.call(src, key)) { out.push(src[key]); }
        }
      }
      if (typeof mapFn === 'function') {
        for (i = 0; i < out.length; i++) { out[i] = mapFn.call(thisArg, out[i], i); }
      }
      return out;
    };
  });

  safe('Array.prototype.find', function () {
    if (Array.prototype.find) { return; }
    Array.prototype.find = function (predicate) {
      var list = Object(this);
      var len = list.length >>> 0;
      if (typeof predicate !== 'function') {
        throw new TypeError('Array.prototype.find: predicate is not a function');
      }
      var thisArg = arguments.length > 1 ? arguments[1] : undefined;
      for (var i = 0; i < len; i++) {
        if (predicate.call(thisArg, list[i], i, list)) { return list[i]; }
      }
      return undefined;
    };
  });

  safe('Array.prototype.findIndex', function () {
    if (Array.prototype.findIndex) { return; }
    Array.prototype.findIndex = function (predicate) {
      var list = Object(this);
      var len = list.length >>> 0;
      if (typeof predicate !== 'function') {
        throw new TypeError('Array.prototype.findIndex: predicate is not a function');
      }
      var thisArg = arguments.length > 1 ? arguments[1] : undefined;
      for (var i = 0; i < len; i++) {
        if (predicate.call(thisArg, list[i], i, list)) { return i; }
      }
      return -1;
    };
  });

  safe('Array.prototype.includes', function () {
    if (Array.prototype.includes) { return; }
    Array.prototype.includes = function (search) {
      var list = Object(this);
      var len = list.length >>> 0;
      if (len === 0) { return false; }
      var from = arguments.length > 1 ? arguments[1] | 0 : 0;
      if (from < 0) { from = Math.max(len + from, 0); }
      for (var i = from; i < len; i++) {
        var cur = list[i];
        if (cur === search || (cur !== cur && search !== search)) { return true; }
      }
      return false;
    };
  });

  /* ---------------------------------------------------------------- Number */

  safe('Number.isNaN', function () {
    if (Number.isNaN) { return; }
    Number.isNaN = function (value) {
      return typeof value === 'number' && value !== value;
    };
  });

  safe('Number.isInteger', function () {
    if (Number.isInteger) { return; }
    Number.isInteger = function (value) {
      return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
    };
  });

  /* ---------------------------------------------------------------- String */

  safe('String.prototype.startsWith', function () {
    if (String.prototype.startsWith) { return; }
    String.prototype.startsWith = function (search) {
      var str = String(this);
      var pos = arguments.length > 1 ? arguments[1] : 0;
      if (pos < 0) { pos = 0; }
      return str.substr(pos, String(search).length) === String(search);
    };
  });

  safe('String.prototype.endsWith', function () {
    if (String.prototype.endsWith) { return; }
    String.prototype.endsWith = function (search) {
      var str = String(this);
      var needle = String(search);
      var end = arguments.length > 1 ? arguments[1] : str.length;
      if (end > str.length) { end = str.length; }
      if (end < 0) { end = 0; }
      return str.substring(end - needle.length, end) === needle;
    };
  });

  safe('String.prototype.includes', function () {
    if (String.prototype.includes) { return; }
    String.prototype.includes = function (search) {
      return String(this).indexOf(String(search)) !== -1;
    };
  });

  safe('String.prototype.padStart', function () {
    if (String.prototype.padStart) { return; }
    String.prototype.padStart = function (targetLength, padString) {
      var str = String(this);
      var len = targetLength >> 0;
      var pad = padString === undefined ? ' ' : String(padString);
      if (str.length >= len || pad === '') { return str; }
      var need = len - str.length;
      var fill = '';
      while (fill.length < need) { fill += pad; }
      return fill.substr(0, need) + str;
    };
  });

  safe('String.prototype.padEnd', function () {
    if (String.prototype.padEnd) { return; }
    String.prototype.padEnd = function (targetLength, padString) {
      var str = String(this);
      var len = targetLength >> 0;
      var pad = padString === undefined ? ' ' : String(padString);
      if (str.length >= len || pad === '') { return str; }
      var need = len - str.length;
      var fill = '';
      while (fill.length < need) { fill += pad; }
      return str + fill.substr(0, need);
    };
  });

  safe('String.prototype.trimStart', function () {
    if (!String.prototype.trimStart) {
      String.prototype.trimStart = String.prototype.trimLeft || function () {
        return String(this).replace(/^\s+/, '');
      };
    }
    if (!String.prototype.trimLeft) { String.prototype.trimLeft = String.prototype.trimStart; }
  });

  safe('String.prototype.trimEnd', function () {
    if (!String.prototype.trimEnd) {
      String.prototype.trimEnd = String.prototype.trimRight || function () {
        return String(this).replace(/\s+$/, '');
      };
    }
    if (!String.prototype.trimRight) { String.prototype.trimRight = String.prototype.trimEnd; }
  });

  /* --------------------------------------------------------------- Element */

  safe('Element.prototype.matches', function () {
    if (typeof Element === 'undefined' || !Element.prototype) { return; }
    if (Element.prototype.matches) { return; }
    Element.prototype.matches =
      Element.prototype.matchesSelector ||
      Element.prototype.webkitMatchesSelector ||
      Element.prototype.mozMatchesSelector ||
      Element.prototype.msMatchesSelector ||
      Element.prototype.oMatchesSelector ||
      function (selector) {
        var nodes = (this.parentNode || this.document || document).querySelectorAll(selector);
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i] === this) { return true; }
        }
        return false;
      };
  });

  safe('Element.prototype.closest', function () {
    if (typeof Element === 'undefined' || !Element.prototype) { return; }
    if (Element.prototype.closest) { return; }
    var proto = Element.prototype;
    if (!proto.matches) {
      proto.matches =
        proto.matchesSelector ||
        proto.webkitMatchesSelector ||
        proto.msMatchesSelector ||
        function (selector) {
          var nodes = (this.parentNode || document).querySelectorAll(selector);
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] === this) { return true; }
          }
          return false;
        };
    }
    Element.prototype.closest = function (selector) {
      var node = this;
      while (node && node.nodeType === 1) {
        try {
          if (node.matches(selector)) { return node; }
        } catch (e) {
          return null;
        }
        node = node.parentElement || node.parentNode;
      }
      return null;
    };
  });

  /* --------------------------------------------------------------- Promise */

  safe('Promise', function () {
    if (global.Promise) { return; }

    function XPromise(executor) {
      var self = this;
      self.state = 'pending';
      self.value = undefined;
      self.queue = [];

      function settle(state, value) {
        if (self.state !== 'pending') { return; }
        self.state = state;
        self.value = value;
        var q = self.queue;
        self.queue = [];
        for (var i = 0; i < q.length; i++) {
          try { q[i](); } catch (e) { /* ignore */ }
        }
      }

      function doResolve(value) {
        if (value && typeof value.then === 'function') {
          value.then(doResolve, doReject);
          return;
        }
        settle('fulfilled', value);
      }

      function doReject(reason) { settle('rejected', reason); }

      if (typeof executor !== 'function') {
        throw new TypeError('Promise resolver is not a function');
      }
      try {
        executor(doResolve, doReject);
      } catch (e) {
        doReject(e);
      }
    }

    XPromise.prototype.then = function (onFulfilled, onRejected) {
      var self = this;
      return new XPromise(function (resolve, reject) {
        function handle() {
          var cb = self.state === 'fulfilled' ? onFulfilled : onRejected;
          if (typeof cb !== 'function') {
            if (self.state === 'fulfilled') { resolve(self.value); } else { reject(self.value); }
            return;
          }
          setTimeout(function () {
            try { resolve(cb(self.value)); } catch (e) { reject(e); }
          }, 0);
        }
        if (self.state === 'pending') { self.queue.push(handle); } else { handle(); }
      });
    };

    XPromise.prototype['catch'] = function (onRejected) {
      return this.then(undefined, onRejected);
    };

    XPromise.resolve = function (value) {
      return new XPromise(function (resolve) { resolve(value); });
    };

    XPromise.reject = function (reason) {
      return new XPromise(function (resolve, reject) { reject(reason); });
    };

    XPromise.all = function (list) {
      var arr = slice.call(list || []);
      return new XPromise(function (resolve, reject) {
        var left = arr.length;
        var out = new Array(arr.length);
        if (left === 0) { resolve(out); return; }
        for (var i = 0; i < arr.length; i++) {
          (function (index, item) {
            XPromise.resolve(item).then(function (v) {
              out[index] = v;
              left--;
              if (left === 0) { resolve(out); }
            }, function (e) { reject(e); });
          })(i, arr[i]);
        }
      });
    };

    XPromise.race = function (list) {
      var arr = slice.call(list || []);
      return new XPromise(function (resolve, reject) {
        for (var i = 0; i < arr.length; i++) {
          XPromise.resolve(arr[i]).then(resolve, reject);
        }
      });
    };

    global.Promise = XPromise;
  });

  /* ----------------------------------------------------------------- fetch */

  safe('fetch', function () {
    if (global.fetch) { return; }
    var P = global.Promise;

    global.fetch = function (input, init) {
      init = init || {};
      return new P(function (resolve, reject) {
        var url;
        var method = 'GET';
        var body = null;
        var headers = null;

        if (input && typeof input === 'object' && typeof input.url === 'string') {
          url = input.url;
          method = input.method || 'GET';
          body = input.body === undefined ? null : input.body;
          headers = input.headers || null;
        } else {
          url = String(input);
          method = init.method || 'GET';
          body = init.body === undefined ? null : init.body;
          headers = init.headers || null;
        }

        var xhr;
        try {
          xhr = new XMLHttpRequest();
        } catch (e) {
          reject(new TypeError('fetch: XMLHttpRequest unavailable'));
          return;
        }

        try {
          xhr.open(method, url, true);
        } catch (e) {
          reject(e);
          return;
        }

        try {
          if (headers) {
            if (typeof headers.forEach === 'function') {
              headers.forEach(function (value, key) { xhr.setRequestHeader(key, value); });
            } else if (headers instanceof Array) {
              for (var h = 0; h < headers.length; h++) {
                xhr.setRequestHeader(headers[h][0], headers[h][1]);
              }
            } else {
              for (var name in headers) {
                if (hasOwn.call(headers, name)) { xhr.setRequestHeader(name, headers[name]); }
              }
            }
          }
        } catch (e) { /* header 出错不阻断请求 */ }

        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          var text = '';
          try { text = xhr.responseText; } catch (e) { text = ''; }
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            url: url,
            body: null,
            bodyUsed: false,
            redirected: false,
            headers: {
              get: function (key) {
                try { return xhr.getResponseHeader(key); } catch (e) { return null; }
              },
              has: function (key) {
                try { return xhr.getResponseHeader(key) !== null; } catch (e) { return false; }
              }
            },
            clone: function () { return this; },
            text: function () { return P.resolve(text); },
            json: function () {
              return new P(function (res, rej) {
                try { res(JSON.parse(text)); } catch (e) { rej(e); }
              });
            },
            arrayBuffer: function () { return P.resolve(null); },
            blob: function () { return P.resolve(null); }
          });
        };

        xhr.onerror = function () { reject(new TypeError('fetch: network request failed')); };
        xhr.ontimeout = function () { reject(new TypeError('fetch: request timeout')); };

        try {
          xhr.send(body);
        } catch (e) {
          reject(e);
        }
      });
    };
  });

  /* ----------------------------------------------- TextDecoder/TextEncoder */

  safe('TextDecoder', function () {
    if (global.TextDecoder) { return; }
    function XTextDecoder(label) {
      this.encoding = String(label === undefined ? 'utf-8' : label).toLowerCase();
    }
    XTextDecoder.prototype.decode = function (input) {
      if (input === null || input === undefined) { return ''; }
      var bytes;
      try {
        bytes = (typeof Uint8Array !== 'undefined' && input instanceof Uint8Array)
          ? input
          : new Uint8Array(input);
      } catch (e) {
        bytes = input || [];
      }
      var out = '';
      var i = 0;
      var len = bytes.length;
      var b1, b2, b3, b4, cp;
      while (i < len) {
        b1 = bytes[i];
        if (b1 < 0x80) {
          out += String.fromCharCode(b1);
          i += 1;
        } else if (b1 < 0xE0) {
          b2 = bytes[i + 1] || 0;
          out += String.fromCharCode(((b1 & 0x1F) << 6) | (b2 & 0x3F));
          i += 2;
        } else if (b1 < 0xF0) {
          b2 = bytes[i + 1] || 0;
          b3 = bytes[i + 2] || 0;
          out += String.fromCharCode(((b1 & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F));
          i += 3;
        } else {
          b2 = bytes[i + 1] || 0;
          b3 = bytes[i + 2] || 0;
          b4 = bytes[i + 3] || 0;
          cp = ((b1 & 0x07) << 18) | ((b2 & 0x3F) << 12) | ((b3 & 0x3F) << 6) | (b4 & 0x3F);
          cp -= 0x10000;
          out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
          i += 4;
        }
      }
      return out;
    };
    global.TextDecoder = XTextDecoder;
  });

  safe('TextEncoder', function () {
    if (global.TextEncoder) { return; }
    function XTextEncoder(label) {
      this.encoding = String(label === undefined ? 'utf-8' : label).toLowerCase();
    }
    XTextEncoder.prototype.encode = function (input) {
      var str = input === undefined || input === null ? '' : String(input);
      var bytes = [];
      var i = 0;
      var cp;
      for (i = 0; i < str.length; i++) {
        cp = str.charCodeAt(i);
        if (cp < 0x80) {
          bytes.push(cp);
        } else if (cp < 0x800) {
          bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
        } else if (cp < 0xD800 || cp >= 0xE000) {
          bytes.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        } else {
          i++;
          var next = i < str.length ? str.charCodeAt(i) : 0;
          var code = 0x10000 + (((cp & 0x3FF) << 10) | (next & 0x3FF));
          bytes.push(
            0xF0 | (code >> 18),
            0x80 | ((code >> 12) & 0x3F),
            0x80 | ((code >> 6) & 0x3F),
            0x80 | (code & 0x3F)
          );
        }
      }
      if (typeof Uint8Array !== 'undefined') {
        return new Uint8Array(bytes);
      }
      return bytes;
    };
    global.TextEncoder = XTextEncoder;
  });

})(typeof window !== 'undefined' ? window : this);
