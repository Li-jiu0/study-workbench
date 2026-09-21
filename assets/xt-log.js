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

  /* ---------- 常量与状态 ---------- */
  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  var MAX_MEM = 400;      // 内存环形上限
  var MAX_STORE = 200;    // localStorage 持久化尾部条数
  var MAX_FIELD = 500;    // 单字段截断长度
  // 固定裸键：xt-log 早于 app.js 加载（此时 lsKey 还不存在），且日志是设备级数据，
  // 不应随登录账号漂移，故刻意不走 lsKey() 前缀。
  var STORE_KEY = 'xt_log_v1';

  var minLevel = (window.__XT_PROD__ ? LEVELS.info : LEVELS.debug); // 生产关 DEBUG（必做①）
  var mem = [];           // 环形缓冲（最旧在前）
  var saveTimer = null;
  var inHook = false;     // console 钩子递归守卫

  /* ---------- 工具 ---------- */
  function nowIso() {
    try { return new Date().toISOString(); } catch (e) { return String(Date.now()); }
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
      return m[m.length - 1] || '';
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
  function push(level, module, msg, ctx) {
    try {
      var lv = LEVELS[level] || LEVELS.info;
      if (lv < minLevel) return;                        // 分级过滤（生产关 DEBUG）
      mem.push({
        t: nowIso(),
        level: level,
        module: clip(sanitize(str(module)), 40),
        msg: clip(sanitize(str(msg))),
        ctx: clip(sanitize(str(ctx))),
        req: clip(str(window.__xtReqId || ''), 24),
        page: clip(pageTag(), 60),
        ver: clip(verTag(), 16)
      });
      if (mem.length > MAX_MEM) { mem.splice(0, mem.length - MAX_MEM); }  // 环形：丢最旧
      scheduleSave();
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
    get: function (opt) {
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
    },
    stats: function () {
      var s = { debug: 0, info: 0, warn: 0, error: 0, total: mem.length, firstTs: '', lastTs: '' };
      for (var i = 0; i < mem.length; i++) {
        var e = mem[i];
        if (s[e.level] !== undefined) s[e.level]++;
      }
      if (mem.length) { s.firstTs = mem[0].t; s.lastTs = mem[mem.length - 1].t; }
      return s;
    },
    clear: function () {
      mem = [];
      try { var l = ls(); if (l) l.removeItem(STORE_KEY); } catch (e) { }
    },
    /** 导出文本（已脱敏）：头部带设备/版本/时间范围 */
    exportText: function () {
      var L = [];
      L.push('== 星途运行日志 ==');
      L.push('导出时间: ' + fmtLocal(nowIso()) + '（设备本地时间）');
      L.push('版本: ' + (verTag() || '未知') + '  环境: ' + (window.__XT_PROD__ ? 'prod' : 'dev'));
      try { L.push('UA: ' + clip(str(navigator.userAgent), 200)); } catch (e) { }
      var s = this.stats();
      L.push('条数: ' + s.total + '（错误 ' + s.error + ' / 警告 ' + s.warn + '）  范围: ' + (fmtLocal(s.firstTs) || '-') + ' ~ ' + (fmtLocal(s.lastTs) || '-'));
      L.push('说明: 敏感信息（密钥/手机号/证件号/邮箱）已自动打码；时间均为设备本地时间');
      L.push('');
      for (var i = 0; i < mem.length; i++) {
        var e = mem[i];
        L.push(fmtLocal(e.t) + ' [' + e.level.toUpperCase() + '][' + e.module + '] ' + e.msg + (e.ctx ? ('  | ctx=' + e.ctx) : '') + (e.req ? ('  | req=' + e.req) : ''));
      }
      return L.join('\n');
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
        var text = this.exportText();
        var tk = '';
        try { tk = localStorage.getItem('study_workbench_token') || ''; } catch (e0) { }
        if (!tk) { if (fail) fail(401, '未登录'); return; }
        var payload = { content: ('【自动错误上报】\n' + text).slice(0, 2000), type: 'bug' };
        if (payload.content.length < 10) { if (fail) fail(400, '日志内容过短'); return; }

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
      } catch (e) { if (fail) fail(0, String(e)); }
    }
  };

  /* ---------- 启动 ---------- */
  loadStored();
  attachConsole();
  window.XTLog.info('xt-log', '日志门面就绪', 'level>=' + window.XTLog.getMinLevel());
})();
