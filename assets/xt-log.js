/* assets/xt-log.js — 星途统一日志门面（R9 · 2026-09-21）
 * ------------------------------------------------------------------
 * 对齐《日志问题优化总结》必做项（前端侧）：
 *   ① 分级：DEBUG<INFO<WARN<ERROR；生产（window.__XT_PROD__）默认关闭 DEBUG
 *   ② 固定字段：ts / level / module / msg / ctx / reqId / page / ver
 *   ③ 脱敏：token/JWT/密钥/手机号/身份证/邮箱 一律打码后才入缓存与导出
 *   ④ 可控消耗：内存环形 400 条 + localStorage 尾部 200 条，超限丢最旧；落盘合并延迟写，不阻塞主流程
 *   ⑤ 可检索：XTLog.get({level,q,limit}) / stats()
 *   ⑥ 请求ID：XTLog.newReqId() 供 api.js 全链路透传
 * 原则：
 *   - 自身任何异常都吞掉，绝不影响业务页面
 *   - 不负责写原生文件（error-boundary → AndroidBridge.logJsError 已有链路），本模块只管前端缓存与检索
 *   - 查看端在 日志.html（应用日志 = 本模块缓存；设备日志 = 原生日志文件，经 readLogs 桥读取）
 * 依赖：无（lsKey 存在则用其前缀，否则裸键）
 */
(function () {
  'use strict';
  if (window.XTLog) { return; }   // 防重复注入
  /* D1：防重复 hook 守卫 —— 已挂过网络钩子（fetch/XHR/api 包装）绝不二次包装，
     否则每次重载会把原函数层层套壳，请求日志翻倍且原行为被嵌套改变。 */
  if (window.__xtLogHooked) { return; }

  /* ---------- 常量与状态 ---------- */
  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  var MAX_MEM = 2000;     // 内存环形上限（R153b：400→2000）
  var MAX_STORE = 1000;   // localStorage 持久化尾部条数（R153b：200→1000；IDB 不可用时的兜底口径）
  var MAX_FIELD = 500;    // 单字段截断长度
  // 固定裸键：xt-log 早于 app.js 加载（此时 lsKey 还不存在），且日志是设备级数据，
  // 不应随登录账号漂移，故刻意不走 lsKey() 前缀。
  var STORE_KEY = 'xt_log_v1';
  /* R153b 追加2：IndexedDB 主库常量 */
  var IDB_NAME = 'xt_log_db';           // 主库名（对象仓 logs：keyPath id 自增 + ts 时间戳索引）
  var META_KEY = 'xt_log_db_meta_v1';   // 容量/统计 meta（localStorage 承载，同步读写）
  var IDB_FLUSH_MS = 2000;              // 内存队列定时 flush 间隔
  var EXPORT_LIMIT = 2000;              // 导出/上报最多取最近 N 条（防 10 万条全量拖死导出）

  var minLevel = (window.__XT_PROD__ ? LEVELS.info : LEVELS.debug); // 生产关 DEBUG（必做①）
  var mem = [];           // 环形缓冲（最旧在前）
  var saveTimer = null;
  var inHook = false;     // console 钩子递归守卫
  /* R153b 追加2：IndexedDB 后端状态。
     mode：pending（启动，IDB 异步打开中）→ idb（主库）| ls（localStorage 兜底）| mem（纯内存）。
     兜底链 IDB→ls→mem，任何分支不抛异常。 */
  var _idb = {
    mode: 'pending',
    db: null,
    queue: [],            // 待 flush 队列（idb/pending 模式专用；失败丢弃——记录仍在 mem 环形窗内）
    flushing: false,
    trimming: false,      // R153d：裁剪互斥锁（并发 trim 会基于过期快照重复删行 → meta 幻影递减/过度裁剪）
    meta: { count: 0, bytes: 0, dbg: 0, inf: 0, wrn: 0, err: 0, firstT: '', lastT: '' }
  };

  /* ---------- 工具 ---------- */
  function nowIso() {
    try {
      /* D3：时间戳统一为本地 ISO 带毫秒（YYYY-MM-DDTHH:mm:ss.sss，无时区后缀=本地口径）。
         fmtLocal 对该形态按本地解析原样展平（此前 UTC+Z 展平慢 8 小时问题已在 R11k 修），
         存储从「UTC 无毫秒」切到「本地带毫秒」后：展示口径不变、毫秒精度可用于时序/去重窗口。 */
      var d = new Date();
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      function p3(n) { return (n < 100 ? '0' : '') + ((n < 10) ? '0' : '') + n; }
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
        'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
        '.' + p3(d.getMilliseconds());
    } catch (e) { return String(Date.now()); }
  }
  /* 【R11k 2026-09-21 用户反馈修复】日志时间显示为设备本地时间。
     存储刻意保持 UTC ISO（nowIso 用 toISOString，跨时区/跨端可比对），问题只出在展示层：
     此前直接把 ISO 的 T 换成空格、去掉尾缀 Z 就打出来 —— Z 被丢掉后文本成了「UTC 挂钟时间」，
     国内用户看到的时间比实际慢 8 小时（截图 10:31 实为 18:31），且用户无法察觉自己看到的是 UTC。
     规则（三种输入各有明确行为，绝不编造时间）：
       · 带 Z 或显式偏移（+08:00）→ new Date() 解析后取本地分量，正确换算；
       · 无时区（naive，如设备日志/历史数据）→ new Date() 按本地解析，分量与原文本一致，等价原样输出；
       · 非日期串（如 Date.now() 兜底像素串）→ 原样返回。 */
  function fmtLocal(v) {
    var s = String(v == null ? '' : v);
    if (!s) return '';
    if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
    try {
      var d = new Date(s);
      if (isNaN(d.getTime())) return s;
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
             p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
    } catch (e) { return s; }
  }
  function str(v) {
    try {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') { v = JSON.stringify(v); }
      return String(v);
    } catch (e) { return '[unserializable]'; }
  }
  function clip(s) { s = String(s || ''); return s.length > MAX_FIELD ? (s.slice(0, MAX_FIELD) + '…') : s; }

  /* 脱敏（必做③）：密钥/token/手机号/身份证/邮箱打码 */
  function sanitize(s) {
    s = String(s || '');
    try {
      s = s.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[JWT]');
      s = s.replace(/AQ\.[A-Za-z0-9_-]{10,}/g, '[KEY]');
      s = s.replace(/sk-[A-Za-z0-9]{16,}/g, '[KEY]');
      s = s.replace(/(password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|authorization)(["'\s:=]+)[^\s"'&,;]{4,}/ig, '$1$2[REDACTED]');
      s = s.replace(/(^|[^\d])1[3-9]\d{9}([^\d]|$)/g, '$1[手机号]$2');
      s = s.replace(/\d{17}[\dXx]/g, '[证件号]');
      s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[邮箱]');
    } catch (e) { /* 脱敏失败按原文返回（截断兜底） */ }
    return s;
  }

  function pageTag() {
    try {
      var m = String(location.pathname || '').split('/');
      var tag = m[m.length - 1] || '';
      /* R153：中文页名在 location.pathname 里是百分号编码（WebView/jsdom 同），
         解码后日志可读；解码失败（异常编码）原样返回。 */
      try { tag = decodeURIComponent(tag); } catch (e0) { /* 保持原样 */ }
      return tag;
    } catch (e) { return ''; }
  }
  function verTag() {
    try { return String(window.CURRENT_VERSION || ''); } catch (e) { return ''; }
  }

  /* ---------- 持久化（合并延迟写，避免高频 IO） ---------- */
  function ls() {
    try { return window.localStorage; } catch (e) { return null; }
  }
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        var l = ls(); if (!l) return;
        var tail = mem.slice(Math.max(0, mem.length - MAX_STORE));
        l.setItem(STORE_KEY, JSON.stringify(tail));
      } catch (e) { /* 存储满/禁用：静默放弃持久化，内存仍在 */ }
    }, 500);
  }
  function loadStored() {
    try {
      var l = ls(); if (!l) return;
      var raw = l.getItem(STORE_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (Object.prototype.toString.call(arr) === '[object Array]') {
        mem = arr.slice(-MAX_MEM).filter(function (e) { return e && e.level; });
      }
    } catch (e) { mem = []; }
  }

  /* ---------- 核心 ---------- */
  /* D3：msg 规范化指纹 —— 小写化 + 数字归并为 # + 空白归一，取前 120 字。
     同一错误的不同入口（onerror 的 message / console.error 的参数串）、不同行号列号，
     指纹一致 → 300ms 窗口内判重。 */
  function normFp(msg) {
    try {
      return String(msg || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 120);
    } catch (e) { return String(msg || '').slice(0, 120); }
  }
  var _dupWin = {};   // D3 去重窗口：fp → { at, level, rec }
  function push(level, module, msg, ctx) {
    try {
      var lv = LEVELS[level] || LEVELS.info;
      if (lv < minLevel) return;                        // 分级过滤（生产关 DEBUG）
      /* D3：禁空/未来时间 —— 时钟漂移兜底，异常即降级毫秒计，绝不落坏时间戳、绝不编造。 */
      var t = nowIso();
      try {
        var dt = new Date(t).getTime();
        if (!t || isNaN(dt) || dt > Date.now() + 60000) t = String(Date.now());
      } catch (eT) { t = String(Date.now()); }
      /* D3：错误/警告多入口去重 —— 300ms 窗口 + 指纹，只落最重级别一条。
         窗口内重复：新级别更重 → 原地升级已落记录（mem 与未 flush 队列共享同一对象引用）；
         否则直接丢弃新入口。info/debug 及「点击:」等常规流不受影响。 */
      if (lv >= LEVELS.warn) {
        var fp = normFp(msg);
        var dup = _dupWin[fp];
        if (dup && (Date.now() - dup.at) <= 300) {
          if (lv > (LEVELS[dup.level] || 0) && dup.rec) {
            dup.rec.level = level;
            dup.level = level;
          }
          return;
        }
        if (dup === undefined) {
          var n = 0; for (var k in _dupWin) { n++; if (n > 300) break; }
          if (n > 300) _dupWin = {};   // 指纹表防膨胀
        }
        _dupWin[fp] = { at: Date.now(), level: level, rec: null };
        dup = _dupWin[fp];
      }
      var rec = {
        t: t,
        level: level,
        module: clip(sanitize(str(module)), 40),
        page: clip(pageTag(), 60),
        msg: clip(sanitize(str(msg))),
        ctx: clip(sanitize(str(ctx))),
        req: clip(str(window.__xtReqId || ''), 24),
        ver: clip(verTag(), 16)
      };
      if (lv >= LEVELS.warn && dup) { dup.rec = rec; }   // D3：登记已落记录，供窗口内升级
      mem.push(rec);
      if (mem.length > MAX_MEM) { mem.splice(0, mem.length - MAX_MEM); }  // 环形：丢最旧
      /* R153b 追加2：存储路由 —— IDB 主库走内存队列（2s flush / pagehide 强制）；
         pending 期先入队（IDB 打开成功随批落库，失败留在 mem 由 ls 兜底）；ls 模式走延迟写。 */
      if (_idb.mode === 'idb' || _idb.mode === 'pending') { _idb.queue.push(rec); }
      if (_idb.mode === 'ls') { scheduleSave(); }
    } catch (e) { /* 日志自身异常绝不外抛 */ }
  }

  /* ---------- console 镜像（warn/error 进缓存，便于页内检索） ---------- */
  function attachConsole() {
    try {
      var origError = console.error, origWarn = console.warn;
      console.error = function () {
        try {
          if (!inHook) {
            inHook = true;
            var a = Array.prototype.slice.call(arguments);
            var s = a.map(str).join(' ');
            if (s.indexOf('[XT-BOUNDARY]') === -1) push('error', 'console', s, ''); // 边界日志避免双记
            inHook = false;
          }
        } catch (e) { }
        return origError.apply(console, arguments);
      };
      console.warn = function () {
        try {
          if (!inHook) {
            inHook = true;
            var a = Array.prototype.slice.call(arguments);
            push('warn', 'console', a.map(str).join(' '), '');
            inHook = false;
          }
        } catch (e) { }
        return origWarn.apply(console, arguments);
      };
    } catch (e) { /* 老环境无 console 可写：忽略 */ }
  }

  /* ---------- 全局钩子（R153 · 2026-09-28）：覆盖「所有操作」的基础面 ---------- */
  /* window.onerror：同步未捕获异常。level=error、module=pageTag()；
     msg = message + ' @'源文件名:行:列；ctx = error.stack 截断（MAX_FIELD）。 */
  function attachOnerror() {
    try {
      var prev = window.onerror;
      window.onerror = function (message, source, lineno, colno, error) {
        try {
          var msg = str(message) || '未知异常';
          var src = str(source || '');
          if (src) {
            msg += ' @' + src.replace(/^.*[\\\/]/, '') + ':' + (lineno || 0) + ':' + (colno || 0);
          }
          var stack = '';
          try { stack = (error && error.stack) ? String(error.stack) : ''; } catch (e0) { stack = ''; }
          push('error', pageTag(), msg, stack);
        } catch (e1) { /* 钩子自身异常绝不外抛 */ }
        if (typeof prev === 'function') {
          try { return prev.apply(window, arguments); } catch (e2) { /* 前置钩子异常不影响本钩子 */ }
        }
        return false;
      };
    } catch (e) { /* 老环境 onerror 不可写：忽略 */ }
  }
  /* unhandledrejection：未处理的 Promise 拒绝。reason 安全串化；
     老 WebView 无此事件 → addEventListener/try 双层包住，静默跳过。 */
  function attachRejection() {
    try {
      if (typeof window.addEventListener !== 'function') return;
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          var r = (ev && ev.reason !== undefined) ? ev.reason : ev;
          /* R153：reason 串化 —— Error 取 name+message（JSON.stringify(Error) 只会得到 {}），
             其余类型走通用 str()，全部安全兜底。 */
          var base;
          try {
            base = (r && r.name && r.message) ? (String(r.name) + ': ' + String(r.message)) : str(r);
          } catch (e2) { base = '[unserializable]'; }
          var msg = 'Unhandled rejection: ' + base;
          var stack = '';
          try { stack = (r && r.stack) ? String(r.stack) : ''; } catch (e0) { stack = ''; }
          push('error', pageTag(), msg, stack);
        } catch (e1) { /* 静默 */ }
      });
    } catch (e) { /* 无此事件的老 WebView：静默 */ }
  }
  /* 页面访问留痕（R153）：每页加载 push 一条 info（module=pageTag()、msg='页面打开'）——
     日志页统计卡/「操作留痕」明细的数据源基础面。 */
  var pageOpenDone = false;
  function logPageOpen() {
    /* D3：页面打开守卫 —— 无论本脚本被触发几次，每次页面加载仅落 1 条 */
    if (pageOpenDone) return;
    pageOpenDone = true;
    var ua = '';
    try { ua = clip(str(navigator.userAgent), 120); } catch (e0) { ua = ''; }
    push('info', pageTag() || 'xt-log', '页面打开', ua ? ('ua=' + ua) : '');
  }

  /* ---------- 全站操作采集（R153b 追加1）---------- */
  /* 点击：document 捕获阶段委托（先于页面 stopPropagation，全量）——
     从 target 向上最多 4 层找可操作元素（button / a / [role=button] /
     input[type=button|submit|reset] / label），命中即记一条 info「点击: 标识」。
     标识优先级：文本(clip20) > aria-label/title > #id > .class 首段 > <tag>；均无则 <tag>。
     【不做任何去重/丢弃 —— 每一次点击都记】。采集自身异常全部吞掉，绝不影响页面。 */
  function elOwnText(el) {
    try {
      var t = (el.innerText != null) ? el.innerText : (el.textContent || '');
      t = String(t).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      return t;
    } catch (e) { return ''; }
  }
  function clickLabel(el) {
    try {
      var t = elOwnText(el);
      if (t) return t.slice(0, 20);
      var a = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'));
      if (a) return String(a).slice(0, 20);
      if (el.id) return '#' + String(el.id).slice(0, 20);
      var cls = el.className ? String(el.className).replace(/^\s+|\s+$/g, '') : '';
      if (cls) return '.' + cls.split(/\s+/)[0].slice(0, 19);
      return '<' + String(el.tagName || '?').toLowerCase() + '>';
    } catch (e) { return '<unknown>'; }
  }
  function isActionTarget(el) {
    try {
      if (!el || !el.tagName) return false;
      var tag = String(el.tagName).toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'label') return true;
      if (tag === 'input') {
        var ty = String(el.getAttribute('type') || 'text').toLowerCase();
        return ty === 'button' || ty === 'submit' || ty === 'reset';
      }
      var role = el.getAttribute && el.getAttribute('role');
      return role === 'button';
    } catch (e) { return false; }
  }
  function attachClickCapture() {
    try {
      if (typeof document.addEventListener !== 'function') return;
      document.addEventListener('click', function (ev) {
        try {
          var el = ev && ev.target;
          var hit = null, cur = el, depth = 0;
          while (cur && cur.tagName && depth < 4) {
            if (isActionTarget(cur)) { hit = cur; break; }
            cur = cur.parentNode || cur.parentElement;
            depth++;
          }
          if (!hit) return;
          push('info', pageTag(), '点击: ' + clickLabel(hit), '');
        } catch (e1) { /* 采集异常绝不影响页面 */ }
      }, true);
    } catch (e) { /* 老环境：忽略 */ }
  }
  /* 变更：只记字段名（name > id > aria-label > <tag>），【值绝不入库——隐私红线】。 */
  function attachChangeCapture() {
    try {
      if (typeof document.addEventListener !== 'function') return;
      document.addEventListener('change', function (ev) {
        try {
          var el = ev && ev.target;
          if (!el || !el.tagName) return;
          var tag = String(el.tagName).toLowerCase();
          if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
          var name = el.name || el.id || (el.getAttribute && el.getAttribute('aria-label')) || ('<' + tag + '>');
          push('info', pageTag(), '变更: ' + clip(String(name), 20), '');
        } catch (e1) { /* 静默 */ }
      }, true);
    } catch (e) { /* 老环境：忽略 */ }
  }

  /* ---------- IndexedDB 主库（R153b 追加2）----------
   * 主库 xt_log_db：对象仓 logs（keyPath id 自增 + ts 时间戳索引）。
   * 写入：push() 入内存队列 → 2s 定时 flush → pagehide/切后台强制 flush。
   * 容量双闸：条数 10 万 或 字节 ~80MB（XTLog.IDB_CAP，谁先到）→ 批量裁最旧 10% + meta 计数收敛。
   * 兜底链：IDB → localStorage（MAX_MEM 2000 / MAX_STORE 1000）→ 纯内存；任何分支不抛异常。
   * 读路径 get/stats/clear/exportText 异步化（asyncOut：有 window.Promise 走 Promise，否则纯回调）。 */
  function asyncOut(run, cb) {
    var hasP = !!(window.Promise && typeof window.Promise.resolve === 'function');
    if (hasP) {
      return new window.Promise(function (resolve) {
        run(function (res) {
          try { if (typeof cb === 'function') cb(res); } catch (e1) { }
          resolve(res);
        });
      });
    }
    run(function (res) { try { if (typeof cb === 'function') cb(res); } catch (e2) { } });
    return null;
  }
  function loadMeta() {
    try {
      var l = ls(); if (!l) return;
      var v = JSON.parse(l.getItem(META_KEY) || 'null');
      if (v && typeof v === 'object') {
        _idb.meta.count = v.count || 0; _idb.meta.bytes = v.bytes || 0;
        _idb.meta.dbg = v.dbg || 0; _idb.meta.inf = v.inf || 0; _idb.meta.wrn = v.wrn || 0; _idb.meta.err = v.err || 0;
        _idb.meta.firstT = v.firstT || ''; _idb.meta.lastT = v.lastT || '';
      }
    } catch (e) { /* meta 坏了按 0 起步 */ }
  }
  function saveMeta() {
    try { var l = ls(); if (l) l.setItem(META_KEY, JSON.stringify(_idb.meta)); } catch (e) { /* 静默 */ }
  }
  function idbInit() {
    var decided = false;
    function decide(db) {
      if (decided) return;
      decided = true;
      if (db) { _idb.mode = 'idb'; _idb.db = db; loadMeta(); idbFlush(false); }
      else { _idb.mode = ls() ? 'ls' : 'mem'; scheduleSave(); }
    }
    try {
      var idb = window.indexedDB;
      if (!idb || typeof idb.open !== 'function') { decide(null); return; }
      var req = idb.open(IDB_NAME, 1);
      req.onupgradeneeded = function (ev) {
        try {
          var db = ev.target.result;
          if (!db.objectStoreNames.contains('logs')) {
            var st = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
            st.createIndex('ts', 't', { unique: false });   // 按时间戳索引（查询走主键降序，等价时序）
          }
        } catch (e0) { /* 升级失败 → onerror 走兜底 */ }
      };
      req.onsuccess = function (ev) { decide((ev.target && ev.target.result) || null); };
      req.onerror = function () { decide(null); };
      req.onblocked = function () { decide(null); };
      setTimeout(function () { decide(null); }, 1500);   // 老 WebView 打开挂死 → 兜底
    } catch (e) { decide(null); }
  }
  function idbFlush(force, done) {
    if (typeof done !== 'function') done = function () { };
    if (_idb.mode !== 'idb' || !_idb.db || _idb.flushing || !_idb.queue.length) { done(); return; }
    _idb.flushing = true;
    var batch = _idb.queue.splice(0, _idb.queue.length);
    var added = 0, bytes = 0;
    var lv = { debug: 0, info: 0, warn: 0, error: 0 };
    try {
      var tx = _idb.db.transaction('logs', 'readwrite');
      var st = tx.objectStore('logs');
      for (var i = 0; i < batch.length; i++) {
        var r0 = batch[i];
        try {
          st.put({ t: r0.t, level: r0.level, module: r0.module, msg: r0.msg, ctx: r0.ctx, req: r0.req, page: r0.page, ver: r0.ver });
          added++; bytes += str(r0).length;
          if (lv[r0.level] !== undefined) lv[r0.level]++;
        } catch (eP) { /* 单条失败不拖垮整批 */ }
      }
      var cntReq = null;
      try { cntReq = st.count(); } catch (eC) { cntReq = null; }
      tx.oncomplete = function () {
        _idb.meta.bytes += bytes;
        _idb.meta.dbg += lv.debug; _idb.meta.inf += lv.info; _idb.meta.wrn += lv.warn; _idb.meta.err += lv.error;
        if (batch.length) {
          if (!_idb.meta.firstT) _idb.meta.firstT = batch[0].t;
          _idb.meta.lastT = batch[batch.length - 1].t;
        }
        try { _idb.meta.count = (cntReq && cntReq.result != null) ? cntReq.result : (_idb.meta.count + added); }
        catch (eN) { _idb.meta.count += added; }
        saveMeta();
        /* D2：每批 flush 落一条 debug「IDB flush: N 条落库」（生产 minLevel=info 时自然过滤，
           不额外制造 info 噪音；本条入队，下一批或 pagehide 随批落库，无递归风险） */
        try { if (added > 0) push('debug', 'idb', 'IDB flush: ' + added + ' 条落库', ''); } catch (eDbg) { }
        idbTrim(function () { _idb.flushing = false; done(); });
      };
      tx.onerror = function () { _idb.flushing = false; _idb.mode = 'ls'; scheduleSave(); done(); };
      tx.onabort = function () { _idb.flushing = false; _idb.mode = 'ls'; scheduleSave(); done(); };
    } catch (e) { _idb.flushing = false; _idb.mode = 'ls'; scheduleSave(); done(); }
  }
  /* 容量双闸：超限（条数或字节，谁先到）批量裁最旧 10%，循环收敛到闸内（有界 24 轮防打转）。 */
  /* 容量双闸：超限（条数或字节，谁先到）批量裁剪，循环收敛到闸内（有界 24 轮防打转）。
     分级优先（R153d）：debug→info→warn 先裁（同级裁最旧），error 最后动——
     仅当非 error 全裁光仍超闸时，才按最旧优先裁 error 腾必要空间（最新错误自然保留）。 */
  function idbTrim(done, tries) {
    if (typeof done !== 'function') done = function () { };
    var t = tries || 0;
    try {
      /* R153d：互斥 —— 同时只允许一条裁剪链在跑。并发链会基于同一份旧数据选行，
         产生同一行的重复删除（部分 MISS）与 meta 幻影递减，最终过度裁剪误删 error。 */
      if (_idb.trimming) { done(); return; }
      var cap = (window.XTLog && window.XTLog.IDB_CAP) || { count: 100000, bytes: 80 * 1048576 };
      if (( _idb.meta.count <= cap.count && _idb.meta.bytes <= cap.bytes) || t >= 24 || _idb.meta.count <= 0) { done(); return; }
      _idb.trimming = true;
      var delN = Math.max(1, Math.floor(_idb.meta.count * 0.1));
      /* 字节闸换算为条数（均值估算），与条数闸取大者 */
      try {
        if (_idb.meta.bytes > cap.bytes && _idb.meta.count > 0) {
          var avg0 = _idb.meta.bytes / _idb.meta.count;
          var byN = Math.ceil((_idb.meta.bytes - cap.bytes) / Math.max(1, avg0));
          if (byN > delN) delN = Math.min(byN, _idb.meta.count);
        }
      } catch (eB) { }
      var tx = _idb.db.transaction('logs', 'readwrite');
      var st = tx.objectStore('logs');
      /* 分级桶：游标按主键升序（最旧在前）扫描，够裁即止（提前终止，不全表扫）。
         选取顺序 debug→info→warn→error：只有前面桶攒不够 delN 才动后面的桶（error 兜底）。 */
      var buckets = { debug: [], info: [], warn: [], error: [] };
      var selCount = 0;
      var scanDone = false;
      /* 完成收口（幂等）：删除、meta 记账、解锁、递归全部在此同步完成——
         无论由游标走完 / 够裁即止 / oncomplete 兜底 / onerror 触发，都只会收口一次。
         【不可把记账放进 tx.oncomplete】——完成回调可能早于游标链结束（尤其老内核/超时环境），
         届时递归新轮会与残留游标并发，基于旧快照重复删行（meta 幻影递减、误删 error）。 */
      var finishSelect = function () {
        if (scanDone) return;
        scanDone = true;
        try {
          var sel = buckets.debug.concat(buckets.info, buckets.warn, buckets.error).slice(0, delN);
          selCount = sel.length;
          for (var i = 0; i < sel.length; i++) { try { st.delete(sel[i]); } catch (eD) { } }
        } catch (eS) { selCount = 0; }
        _idb.trimming = false;
        var n = selCount > 0 ? selCount : delN;
        var avg = _idb.meta.count > 0 ? (_idb.meta.bytes / _idb.meta.count) : 0;
        _idb.meta.count = Math.max(0, _idb.meta.count - n);
        _idb.meta.bytes = Math.max(0, Math.round(_idb.meta.bytes - avg * n));
        saveMeta();
        idbTrim(done, t + 1);
      };
      var idsReq = st.openCursor(null, 'next');   // 自增主键升序 = 最旧在前
      idsReq.onsuccess = function (ev) {
        try {
          if (scanDone) return;                    // 已收口（oncomplete 兜底抢先）：残存游标直接作废
          var cur = (ev.target && ev.target.result);
          if (!cur) { finishSelect(); return; }
          var e = cur.value || {};
          var lv = (buckets[e.level] !== undefined) ? e.level : 'info';
          buckets[lv].push(e.id);
          var total = buckets.debug.length + buckets.info.length + buckets.warn.length + buckets.error.length;
          if (total >= delN) { finishSelect(); return; }   // 够裁即止
          cur.continue();
        } catch (eC) { finishSelect(); }
      };
      idsReq.onerror = function () { finishSelect(); };
      tx.oncomplete = function () { finishSelect(); };   // 兜底（真实 IDB 在删除全部落定后触发）
      tx.onerror = function () { finishSelect(); };
      tx.onabort = function () { finishSelect(); };
    } catch (e) { _idb.trimming = false; done(); }
  }
  function idbQuery(opt, done) {
    try {
      var out = [];
      var lv = (opt && opt.level) ? (LEVELS[opt.level] || 0) : 0;
      var q = (opt && opt.q) ? String(opt.q).toLowerCase() : '';
      var limit = (opt && opt.limit) || 200;
      var tx = _idb.db.transaction('logs', 'readonly');
      var st = tx.objectStore('logs');
      var req = st.openCursor(null, 'prev');   // 主键（自增 id）降序 = 时间倒序
      req.onsuccess = function (ev) {
        try {
          var cur = ev.target.result;
          if (!cur) { done(out); return; }
          var e = cur.value;
          if ((LEVELS[e.level] || 0) >= lv) {
            if (!q || ((e.msg || '') + ' ' + (e.module || '') + ' ' + (e.ctx || '') + ' ' + (e.page || '')).toLowerCase().indexOf(q) !== -1) out.push(e);
          }
          if (out.length >= limit) { done(out); return; }
          cur.continue();
        } catch (eC) { done(out); }
      };
      req.onerror = function () { done(out); };
    } catch (e) { done([]); }
  }
  function flushNow(done) {
    if (typeof done !== 'function') done = function () { };
    if (_idb.mode === 'idb') { idbFlush(true, done); return; }
    done();
  }
  function filterMem(opt) {
    try {
      opt = opt || {};
      var lv = opt.level ? (LEVELS[opt.level] || 0) : 0;
      var q = (opt.q ? String(opt.q).toLowerCase() : '');
      var out = [];
      for (var i = mem.length - 1; i >= 0 && out.length < (opt.limit || 200); i--) {
        var e = mem[i];
        if ((LEVELS[e.level] || 0) < lv) continue;
        if (q && (e.msg + ' ' + e.module + ' ' + e.ctx + ' ' + e.page).toLowerCase().indexOf(q) === -1) continue;
        out.push(e);
      }
      return out;
    } catch (e2) { return []; }
  }
  function memStats() {
    var s = { debug: 0, info: 0, warn: 0, error: 0, total: mem.length, firstTs: '', lastTs: '' };
    for (var i = 0; i < mem.length; i++) {
      var e = mem[i];
      if (s[e.level] !== undefined) s[e.level]++;
    }
    if (mem.length) { s.firstTs = mem[0].t; s.lastTs = mem[mem.length - 1].t; }
    return s;
  }
  function metaStats() {
    return {
      debug: _idb.meta.dbg, info: _idb.meta.inf, warn: _idb.meta.wrn, error: _idb.meta.err,
      total: _idb.meta.count, firstTs: _idb.meta.firstT, lastTs: _idb.meta.lastT
    };
  }
  function getAsync(opt, done) {
    try { opt = opt || {}; } catch (e0) { opt = {}; }
    flushNow(function () {
      if (_idb.mode === 'idb') { idbQuery(opt, done); return; }
      done(filterMem(opt));
    });
  }
  function statsNow() { return (_idb.mode === 'idb') ? metaStats() : memStats(); }
  function clearAsync(done) {
    try {
      var finish = function () {
        mem = [];
        /* R159：清空必须三处一致（IDB 主库 / localStorage / meta 计数）——
           ① 队列里尚未落库的旧记录一并丢弃：否则 clear 后由 2s flush / pagehide
              再落库，UI 出现「清空后又长回来」的虚假清空；
           ② meta 计数在所有后端模式下一并归零（此前只在 idb 分支重置，ls/mem 模式
              残留旧 meta 会让 stats 回读出幻影数字）。 */
        try { _idb.queue.length = 0; } catch (eQ) { }
        try {
          _idb.meta = { count: 0, bytes: 0, dbg: 0, inf: 0, wrn: 0, err: 0, firstT: '', lastT: '' };
          saveMeta();
        } catch (eM) { }
        try { var l = ls(); if (l) l.removeItem(STORE_KEY); } catch (e2) { }
        done();
      };
      if (_idb.mode === 'idb' && _idb.db) {
        try {
          var tx = _idb.db.transaction('logs', 'readwrite');
          tx.objectStore('logs').clear();
          tx.oncomplete = function () {
            _idb.meta = { count: 0, bytes: 0, dbg: 0, inf: 0, wrn: 0, err: 0, firstT: '', lastT: '' };
            saveMeta(); finish();
          };
          tx.onerror = function () { finish(); };
          tx.onabort = function () { finish(); };
          return;
        } catch (e1) { finish(); return; }
      }
      finish();
    } catch (e) { done(); }
  }
  /* ---------- clearNonErrors（R161 配合）：只清 debug/info，warn/error 一律保留 ----------
   * 复用分级桶思路：游标主键升序收集 debug/info 行 id（批量 CNE_BATCH，多轮递归清完），
   * 删除 + meta 计数同步（dbg/inf 精确递减、count/bytes 均值递减）+ trimming 互斥沿用。
   * 任何分支不抛异常；无 IDB 降级模式（ls/mem）走内存过滤；清完剔除队列中 debug/info（防长回来）。 */
  var CNE_BATCH = 800;
  function clearNonErrorsRound(done, tries) {
    if (typeof done !== 'function') done = function () { };
    var t = tries || 0;
    try {
      /* 互斥沿用：与 idbTrim 共用 _idb.trimming，在飞则稍候重试（有界） */
      if (_idb.trimming) {
        if (t < 40) { setTimeout(function () { clearNonErrorsRound(done, t + 1); }, 100); }
        else { done(); }
        return;
      }
      if (_idb.mode !== 'idb' || !_idb.db) { done(); return; }   // 降级模式由上层内存过滤处理
      _idb.trimming = true;
      var tx = _idb.db.transaction('logs', 'readwrite');
      var st = tx.objectStore('logs');
      var delIds = [], dbgN = 0, infN = 0;
      var scanDone = false;
      /* 收口（幂等）：删除、meta 记账、解锁、续轮全部在此同步完成（同 idbTrim 的教训——
         完成回调可能早于游标链结束，记账绝不能放进 tx.oncomplete）。 */
      var finishRound = function () {
        if (scanDone) return;
        scanDone = true;
        try {
          for (var i = 0; i < delIds.length; i++) { try { st.delete(delIds[i]); } catch (eD) { } }
        } catch (eS) { }
        _idb.trimming = false;
        var n = dbgN + infN;
        var avg = _idb.meta.count > 0 ? (_idb.meta.bytes / _idb.meta.count) : 0;
        _idb.meta.count = Math.max(0, _idb.meta.count - n);
        _idb.meta.dbg = Math.max(0, _idb.meta.dbg - dbgN);
        _idb.meta.inf = Math.max(0, _idb.meta.inf - infN);
        _idb.meta.bytes = Math.max(0, Math.round(_idb.meta.bytes - avg * n));
        saveMeta();
        var full = delIds.length >= CNE_BATCH;
        delIds = null;
        if (full && t < 200) { clearNonErrorsRound(done, t + 1); }
        else { done(); }
      };
      var curReq = st.openCursor(null, 'next');   // 主键升序（时序）
      var curActive = true;   /* R161 联调修正：游标在飞期间 tx.oncomplete 绝不收口——
                                 完成回调可能早于长游标扫描结束（老内核/实现差异），提前收口
                                 会只删半批且不满批不递归 → 清理不完整。真实 IDB 语义下
                                 oncomplete 本就在游标落定后触发，此门闸只是防御性对齐。 */
      curReq.onsuccess = function (ev) {
        try {
          if (scanDone) return;
          var cur = (ev.target && ev.target.result);
          if (!cur) { curActive = false; finishRound(); return; }
          var e = cur.value || {};
          var lv = String(e.level || '');
          if (lv === 'debug' || lv === 'info') {
            delIds.push(e.id);
            if (lv === 'debug') dbgN++; else infN++;
            if (delIds.length >= CNE_BATCH) { curActive = false; finishRound(); return; }   // 够一批即删
          }
          cur.continue();
        } catch (eC) { curActive = false; finishRound(); }
      };
      curReq.onerror = function () { curActive = false; finishRound(); };
      tx.oncomplete = function () { if (!curActive) finishRound(); };   // 兜底（真实 IDB 在游标落定后触发）
      tx.onerror = function () { finishRound(); };
      tx.onabort = function () { finishRound(); };
    } catch (e) { _idb.trimming = false; done(); }
  }
  function clearNonErrorsAsync(done) {
    try {
      flushNow(function () {
        /* 队列中尚未落库的 debug/info 一并剔除（清完不得再由 2s flush/pagehide 长回来） */
        try { _idb.queue = _idb.queue.filter(function (r) { return r && r.level !== 'debug' && r.level !== 'info'; }); } catch (eQ) { }
        if (_idb.mode !== 'idb') {
          /* 降级模式（ls/mem）：内存过滤即全量生效 */
          try { mem = mem.filter(function (r) { return r && r.level !== 'debug' && r.level !== 'info'; }); } catch (eM) { }
          try { if (_idb.mode === 'ls') scheduleSave(); } catch (eL) { }
          done();
          return;
        }
        clearNonErrorsRound(function () {
          try { mem = mem.filter(function (r) { return r && r.level !== 'debug' && r.level !== 'info'; }); } catch (eM2) { }
          done();
        });
      });
    } catch (e) { done(); }
  }
  function buildExportText(list, s) {
    var L = [];
    L.push('== 星途运行日志 ==');
    L.push('导出时间: ' + fmtLocal(nowIso()) + '（设备本地时间）');
    L.push('版本: ' + (verTag() || '未知') + '  环境: ' + (window.__XT_PROD__ ? 'prod' : 'dev'));
    try { L.push('UA: ' + clip(str(navigator.userAgent), 200)); } catch (e) { }
    L.push('条数: ' + s.total + '（错误 ' + s.error + ' / 警告 ' + s.warn + '）  范围: ' + (fmtLocal(s.firstTs) || '-') + ' ~ ' + (fmtLocal(s.lastTs) || '-'));
    L.push('说明: 敏感信息（密钥/手机号/证件号/邮箱）已自动打码；时间均为设备本地时间');
    L.push('');
    var arr = list.slice().reverse();   // 检索为时间倒序 → 导出按时间正序
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      L.push(fmtLocal(e.t) + ' [' + e.level.toUpperCase() + '][' + e.module + '] ' + e.msg + (e.ctx ? ('  | ctx=' + e.ctx) : '') + (e.req ? ('  | req=' + e.req) : ''));
    }
    return L.join('\n');
  }
  function exportAsync(done) {
    getAsync({ limit: EXPORT_LIMIT }, function (list) { done(buildExportText(list, statsNow())); });
  }

  /* 上报发送段（R153b 从 report 拆出：文本组装已异步化，发送逻辑原样保留）。
     API_BASE + JSON + Bearer 契约不变，绝不使用相对路径。 */
  function reportSend(payload, tk, done, fail) {
    if (typeof window.api === 'function') {
      window.api('/api/feedbacks', { method: 'POST', body: payload }).then(function () {
        if (done) done();
      }, function (err) {
        var msg = String((err && err.message) || err || '');
        var st = /登录已过期|401/.test(msg) ? 401 : 0;
        if (fail) fail(st, JSON.stringify({ detail: msg }));
      });
      return;
    }
    // 兜底（api.js 未加载）：同样必须 API_BASE + JSON + Bearer，绝不使用相对路径
    var base = '';
    try {
      if (typeof window.getApiBase === 'function') base = String(window.getApiBase() || '');
      else if (typeof window.STUDY_API_BASE === 'string') base = window.STUDY_API_BASE;
      else if (typeof window.API_BASE === 'string') base = window.API_BASE;
      else if (location.protocol !== 'http:' && location.protocol !== 'https:') base = String(window.STUDY_API_SERVER || '');
    } catch (eB) { base = ''; }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/api/feedbacks', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', 'Bearer ' + tk);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) { if (done) done(); }
      else { if (fail) fail(xhr.status, xhr.responseText); }
    };
    xhr.send(JSON.stringify(payload));
  }

  /* ---------- D1 执行结果链路：网络钩子（api 门面 + fetch + XHR） ----------
   * 每次请求落 info「请求: <方法> <url basename>」，响应到达补一条结果（状态码 + 耗时 ms，非 2xx 落 error）。
   * 铁律：全程 try 包住、绝不改变原函数行为（包装器原样转发 this/arguments/返回值/异常）。
   * api 门面（xt-log.js 加载早于 api.js）用 defineProperty 拦截后续赋值；其内部若走 fetch/XHR，
   * 由 _apiActive 标记抑制 fetch/XHR 侧记录，避免同一请求双记。 */
  var _apiActive = false;
  function urlBase(u) {
    try {
      var s = String(u || '');
      var m = s.match(/^[a-z][a-z0-9+.-]*:\/\/[^\/]+\/([\s\S]*)$/i);
      if (m) s = m[1];
      else if (s.charAt(0) === '/') s = s.slice(1);
      s = s.split('?')[0].split('#')[0];
      var seg = s.split('/');
      return seg[seg.length - 1] || '(root)';
    } catch (e) { return '(url)'; }
  }
  function logReq(how, method, url) {
    push('info', pageTag(), '请求: ' + String(method || 'GET').toUpperCase() + ' ' + urlBase(url) + '（' + how + '）', '');
  }
  function logRes(how, method, url, status, ms) {
    var st = (typeof status === 'number') ? status : 0;
    push((st >= 200 && st < 300) ? 'info' : 'error', pageTag(),
      '响应: ' + String(method || 'GET').toUpperCase() + ' ' + urlBase(url) + ' ' + st + ' ' + ms + 'ms（' + how + '）', '');
  }
  function attachNetHooks() {
    /* D1-① window.api 门面钩子（api.js 晚于本脚本 → defineProperty 拦截赋值时包装） */
    try {
      var wrapApi = function (orig) {
        try {
          if (typeof orig !== 'function' || orig.__xtLogWrapped) return orig;
          var wrapped = function (url, opt) {
            var method = 'GET';
            try { method = String((opt && opt.method) || 'GET'); } catch (e0) { }
            var t0 = Date.now();
            _apiActive = true;
            try { logReq('api', method, url); } catch (e1) { }
            var done = function (ok, st) {
              _apiActive = false;
              try { logRes('api', method, url, ok ? st : ((st > 0) ? st : 0), Date.now() - t0); } catch (e2) { }
            };
            try {
              var p = orig.apply(this, arguments);
              if (p && typeof p.then === 'function') {
                return p.then(function (res) {
                  var st = 200;
                  try { if (res && typeof res.status === 'number') st = res.status; } catch (e3) { }
                  done(st >= 200 && st < 300, st);
                  return res;
                }, function (err) {
                  var st = 0;
                  try { if (err && typeof err.status === 'number') st = err.status; } catch (e4) { }
                  done(false, st);
                  throw err;
                });
              }
              done(true, 200);
              return p;
            } catch (eCall) {
              done(false, 0);
              throw eCall;
            }
          };
          try { wrapped.__xtLogWrapped = true; } catch (e5) { }
          return wrapped;
        } catch (eW) { return orig; }
      };
      if (window.api !== undefined && window.api !== null) {
        window.api = wrapApi(window.api);   // 理论不发生（本脚本先载）；防御性包装现值
      } else if (typeof Object.defineProperty === 'function') {
        var _realApi;
        try {
          Object.defineProperty(window, 'api', {
            configurable: true,
            get: function () { return _realApi; },
            set: function (v) { _realApi = (typeof v === 'function') ? wrapApi(v) : v; }
          });
        } catch (eDef) { /* 老内核 defineProperty 失败：api 链路放弃 hook，fetch/XHR 仍覆盖 */ }
      }
    } catch (e) { /* hook 失败绝不影响业务 */ }
    /* D1-② 原生 fetch 钩子 */
    try {
      if (typeof window.fetch === 'function' && !window.fetch.__xtLogWrapped) {
        var origFetch = window.fetch;
        var wrappedFetch = function (input, init) {
          var skip = _apiActive;   // api 门面内部走 fetch：由 api 钩子记录（同步求值，异步后标记已清）
          var method = 'GET', url = '';
          try {
            url = (typeof input === 'string') ? input : String((input && input.url) || input || '');
            method = String((init && init.method) || (input && input.method) || 'GET');
          } catch (e0) { }
          var t0 = Date.now();
          if (!skip) { try { logReq('fetch', method, url); } catch (e1) { } }
          var p = origFetch.apply(this, arguments);
          if (!skip && p && typeof p.then === 'function') {
            return p.then(function (res) {
              try {
                var st = (res && typeof res.status === 'number') ? res.status : 0;
                logRes('fetch', method, url, st, Date.now() - t0);
              } catch (e2) { }
              return res;
            }, function (err) {
              try { logRes('fetch', method, url, 0, Date.now() - t0); } catch (e3) { }
              throw err;
            });
          }
          return p;
        };
        try { wrappedFetch.__xtLogWrapped = true; } catch (e4) { }
        window.fetch = wrappedFetch;
      }
    } catch (e) { /* 静默 */ }
    /* D1-③ XHR 钩子（open 存方法/URL，send 计时 + loadend 收结果；不改写业务回调） */
    try {
      var X = window.XMLHttpRequest;
      if (X && X.prototype && !X.prototype.__xtLogPatched &&
          typeof X.prototype.open === 'function' && typeof X.prototype.send === 'function') {
        var proto = X.prototype;
        var origOpen = proto.open, origSend = proto.send;
        proto.open = function (method, url) {
          try { this.__xtLogM = String(method || 'GET'); this.__xtLogU = String(url || ''); } catch (e0) { }
          return origOpen.apply(this, arguments);
        };
        proto.send = function () {
          var self = this;
          var skip = _apiActive;   // api 门面内部走 XHR：由 api 钩子记录
          var t0 = Date.now();
          var fired = false;
          var rec = function () {
            if (fired) return;
            fired = true;
            try {
              if (skip) return;
              var st = (self.readyState === 4) ? (self.status || 0) : 0;
              logRes('xhr', self.__xtLogM, self.__xtLogU, st, Date.now() - t0);
            } catch (e1) { }
          };
          try {
            if (!skip) { try { logReq('xhr', self.__xtLogM, self.__xtLogU); } catch (eR) { } }
            if (typeof self.addEventListener === 'function') self.addEventListener('loadend', rec);
            else {
              var prev = self.onreadystatechange;
              self.onreadystatechange = function () {
                try { if (self.readyState === 4) rec(); } catch (e2) { }
                if (typeof prev === 'function') prev.apply(this, arguments);
              };
            }
          } catch (e3) { }
          return origSend.apply(this, arguments);
        };
        try { proto.__xtLogPatched = true; } catch (e4) { }
      }
    } catch (e) { /* 静默 */ }
  }

  /* ---------- D2 自动运转流：生命周期留痕（debug 级） ----------
   * visibilitychange → 页面隐藏/可见；pagehide → 先入队「页面离开」再强制 flush（尾部随批落库）。
   * 不加心跳；后台轮询流由 D1 网络钩子天然覆盖。 */
  function attachLifecycle() {
    try {
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', function () {
          try { push('debug', pageTag(), document.hidden ? '页面隐藏' : '页面可见', ''); } catch (e0) { }
        });
      }
    } catch (e) { /* 静默 */ }
    try {
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', function () {
          try {
            push('debug', pageTag(), '页面离开', '');
            flushNow();   // D2：本条随批强制落库
          } catch (e1) { }
        });
      }
    } catch (e2) { /* 静默 */ }
  }

  /* ---------- 对外 API ---------- */
  window.XTLog = {
    LEVELS: LEVELS,
    version: '1.0',
    /** 【R11k】UTC ISO → 设备本地时间 'YYYY-MM-DD HH:mm:ss'（页面/导出统一入口） */
    fmtLocal: fmtLocal,
    /** 记一条：level ∈ debug|info|warn|error */
    log: function (level, module, msg, ctx) { push(level, module, msg, ctx); },
    debug: function (m, msg, ctx) { push('debug', m, msg, ctx); },
    info: function (m, msg, ctx) { push('info', m, msg, ctx); },
    warn: function (m, msg, ctx) { push('warn', m, msg, ctx); },
    error: function (m, msg, ctx) { push('error', m, msg, ctx); },
    /** 调整最低级别（'debug'|'info'|'warn'|'error'） */
    setLevel: function (name) { if (LEVELS[name]) { minLevel = LEVELS[name]; } },
    getMinLevel: function () {
      for (var k in LEVELS) { if (LEVELS[k] === minLevel) return k; }
      return 'info';
    },
    /** 生成请求链路 ID（api.js 每次请求调用一次并写 window.__xtReqId） */
    newReqId: function () {
      try {
        return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      } catch (e) { return 'r' + Date.now(); }
    },
    sanitize: sanitize,
    /** 检索：opt = { level:'error'|'' , q:'关键字', limit:200 } */
    /* R153b 追加2：以下读取/清理接口全部异步化 —— get(opt, cb?) / stats(cb?) /
       clear(cb?) / exportText(cb?)。有 window.Promise 时返回 Promise，否则纯回调；
       传回调始终会被调用（旧调用点按回调方式适配，见 日志.html）。 */
    get: function (opt, cb) { return asyncOut(function (fin) { getAsync(opt, fin); }, cb); },
    stats: function (cb) { return asyncOut(function (fin) { flushNow(function () { fin(statsNow()); }); }, cb); },
    clear: function (cb) { return asyncOut(function (fin) { clearAsync(fin); }, cb); },
    /* R161 配合：只清 debug/info，warn/error 一律保留（对齐分级保留策略）。
       回调语义与 clear 一致（asyncOut：有 Promise 返回 Promise，否则纯回调）；
       完成后回读验证：剩余 debug/info=0 且 warn/error 与清理前一致，不符重试一次，
       仍不符如实回调 false（绝不上报虚假成功）。 */
    clearNonErrors: function (cb) {
      return asyncOut(function (fin) {
        var attempt = 0;
        var before = null;
        var run = function () { clearNonErrorsAsync(function () { verify(); }); };
        var verify = function () {
          try {
            var after = statsNow();
            var d = (after.debug || 0) + (after.info || 0);
            var weOk = ((after.warn || 0) === ((before && before.warn) || 0)) && ((after.error || 0) === ((before && before.error) || 0));
            if (d === 0 && weOk) { fin(true); return; }
            if (attempt < 1) { attempt++; run(); return; }
            fin(false);
          } catch (eV) { fin(false); }
        };
        try {
          flushNow(function () {
            before = statsNow();
            run();
          });
        } catch (e0) { fin(false); }
      }, cb);
    },
    exportText: function (cb) { return asyncOut(function (fin) { exportAsync(fin); }, cb); },
    /* R153b 追加2：容量双闸（条数/字节，谁先到裁最旧 10% 循环收敛）；测试可覆盖本常量。 */
    IDB_CAP: { count: 100000, bytes: 80 * 1048576 },
    /* R153b：强制 flush（pagehide/切后台由内部自动触发；测试/调用方可手动调） */
    flushNow: function (cb) { return asyncOut(function (fin) { flushNow(fin); }, cb); },
    /* R153b：后端状态快照（测试/诊断用，零运行时依赖） */
    debugState: function () {
      return { mode: _idb.mode, queued: _idb.queue.length, meta: { count: _idb.meta.count, bytes: _idb.meta.bytes } };
    },
    /** 一键上报：POST /api/feedbacks（type=bug）。未登录 / 超限 / 网络异常时回调 fail(status, resp)。
     *
     * 【R11m 2026-09-21 用户反馈修复】原实现有三处与既有后端契约不符，导致「上报失败 HTTP 0」：
     *   ① URL 写成相对路径 '/api/feedbacks' —— 页面以 file:// 打开时（安卓 App 的 WebView、
     *      本地双击）会被解析成 file:///api/feedbacks，请求根本发不出去 → XHR status 0。
     *      必须走 config.js/api.js 的唯一地址来源 window.API_BASE（http/https 同源为 ''，
     *      file: 为绝对地址），这也是全站既定铁律。
     *   ② 没带 Authorization 头 —— 后端该路由是 Depends(get_current_user)，没 token 一律 401。
     *   ③ 发的是 x-www-form-urlencoded，而后端入参是 Pydantic 模型 FeedbackIn（JSON body），
     *      且 content 上限 2000 字 —— 表单体必然 422，且原来 slice(0,4000) 也超限。
     * 现改为：优先复用 window.api()（它已封装 API_BASE + Bearer + 401 静默刷新 + 统一错误）；
     * api.js 不可用时走内置兜底请求，同样严格执行上面三条。 */
    report: function (done, fail) {
      try {
        var tk = '';
        try { tk = localStorage.getItem('study_workbench_token') || ''; } catch (e0) { }
        if (!tk) { if (fail) fail(401, '未登录'); return; }
        /* R153b 追加2：exportText 已异步化（IDB 全量读）→ 回调拿文本后再组装上报 */
        this.exportText(function (text) {
          try {
            var payload = { content: ('【自动错误上报】\n' + text).slice(0, 2000), type: 'bug' };
            if (payload.content.length < 10) { if (fail) fail(400, '日志内容过短'); return; }
            reportSend(payload, tk, done, fail);
          } catch (eR1) { if (fail) fail(0, String(eR1)); }
        });
      } catch (e) { if (fail) fail(0, String(e)); }
    }
  };

  /* ---------- 启动 ---------- */
  loadStored();
  attachConsole();
  attachOnerror();        // R153：window.onerror
  attachRejection();      // R153：unhandledrejection
  attachClickCapture();   // R153b 追加1：全站点击采集（捕获委托，每一次点击都记）
  attachChangeCapture();  // R153b 追加1：变更采集（只记字段名，值绝不入库）
  attachNetHooks();       // D1：api 门面 + fetch + XHR 执行结果链路（__xtLogHooked 守卫防重复包装）
  attachLifecycle();      // D2：visibilitychange/pagehide 留痕（pagehide 内含强制 flush）
  idbInit();              // R153b 追加2：IDB 主库初始化（失败/超时自动落 ls/mem 兜底）
  /* R153b 追加2：2s 定时 flush（写路径内存队列 → IDB 批量落库） */
  try {
    setInterval(function () { try { idbFlush(false); } catch (eF) { /* 静默 */ } }, IDB_FLUSH_MS);
  } catch (eI) { /* 老环境 setInterval 异常：仅剩 pagehide/手动 flush */ }
  window.__xtLogHooked = true;   // D1：守卫置位（本脚本重载/二次注入时直接 return，绝不二次包装）
  window.XTLog.info('xt-log', '日志门面就绪', 'level>=' + window.XTLog.getMinLevel());
  logPageOpen();          // R153：页面打开留痕（统计卡数据源，D3 守卫每次加载仅 1 条）
})();
