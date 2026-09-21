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
      L.push('导出时间: ' + nowIso());
      L.push('版本: ' + (verTag() || '未知') + '  环境: ' + (window.__XT_PROD__ ? 'prod' : 'dev'));
      try { L.push('UA: ' + clip(str(navigator.userAgent), 200)); } catch (e) { }
      var s = this.stats();
      L.push('条数: ' + s.total + '（错误 ' + s.error + ' / 警告 ' + s.warn + '）  范围: ' + (s.firstTs || '-') + ' ~ ' + (s.lastTs || '-'));
      L.push('说明: 敏感信息（密钥/手机号/证件号/邮箱）已自动打码');
      L.push('');
      for (var i = 0; i < mem.length; i++) {
        var e = mem[i];
        L.push(e.t + ' [' + e.level.toUpperCase() + '][' + e.module + '] ' + e.msg + (e.ctx ? ('  | ctx=' + e.ctx) : '') + (e.req ? ('  | req=' + e.req) : ''));
      }
      return L.join('\n');
    },
    /** 一键上报：走既有反馈接口（POST /api/feedbacks，type=bug）；未登录/限频时回调 err */
    report: function (done, fail) {
      try {
        var text = this.exportText();
        var body = 'content=' + encodeURIComponent('【自动错误上报】\n' + text.slice(0, 4000)) +
                   '&type=bug';
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/feedbacks', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          var ok = (xhr.status >= 200 && xhr.status < 300);
          if (ok) { if (done) done(); }
          else { if (fail) fail(xhr.status, xhr.responseText); }
        };
        xhr.send(body);
      } catch (e) { if (fail) fail(0, String(e)); }
    }
  };

  /* ---------- 启动 ---------- */
  loadStored();
  attachConsole();
  window.XTLog.info('xt-log', '日志门面就绪', 'level>=' + window.XTLog.getMinLevel());
})();
