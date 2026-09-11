/* =====================================================================
   study-stats.js —— 学习统计底座（P0-8，2026-09-11 增量）
   ---------------------------------------------------------------------
   设计（见 docs/增量架构设计-2026-09-11.md §1.8）：
   - 本地优先：数据先写 localStorage['study_workbench_stats']，渲染只读本地；
   - 云端汇聚：上报队列 fire-and-forget POST /api/study/logs，失败静默留队重试；
   - 六模块共用固定 key：cet4 / xingce / eq / etiquette / ppt / tools。

   对外契约：
     StudyStats.track(module, event, payload)   埋点（同步写本地 + 异步上报）
     StudyStats.render(containerId, module)     渲染「📊 学习概况」卡（今日分钟/累计次数/连续打卡/7天柱图）
     StudyStats.getToolUsage(tool)              读 tools 模块 tool_use 事件（更多工具卡用）
     StudyStats.syncFromCloud()                 【后续扩展点：账号级云同步】空函数
   ===================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'study_workbench_stats';
  var QUEUE_KEY = 'study_workbench_stats_queue';
  var VALID_MODULES = ['cet4', 'xingce', 'eq', 'etiquette', 'ppt', 'tools'];

  /* ---------- 后端地址（统一走 config.js，本文件禁止硬编码 IP） ---------- */
  function apiBase() {
    if (typeof window.getApiBase === 'function') return window.getApiBase();
    return window.STUDY_API_BASE != null ? window.STUDY_API_BASE : '';
  }

  /* ---------- 本地存储 ---------- */
  function today() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.modules) return d;
      }
    } catch (e) { }
    return { version: 1, modules: {}, lastActiveDay: '', streak: 0, syncAt: 0 };
  }

  function saveLocal(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* 容量满时静默 */ }
  }

  function mod(data, m) {
    if (!data.modules[m]) data.modules[m] = { total: 0, days: {} };
    if (!data.modules[m].days) data.modules[m].days = {};
    return data.modules[m];
  }

  /* 连续打卡：跨天惰性重算（任一模块有记录即算打卡） */
  function recomputeStreak(data) {
    function dayKey(offset) {
      var d = new Date();
      d.setDate(d.getDate() - offset);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    var streak = 0;
    for (var i = 0; i < 365; i++) {
      var has = VALID_MODULES.some(function (m) {
        var mm = data.modules[m];
        return mm && mm.days && mm.days[dayKey(i)] && mm.days[dayKey(i)].events > 0;
      });
      if (has) streak++;
      else if (i > 0 || !has) break;
    }
    data.streak = streak;
    data.lastActiveDay = today();
    return streak;
  }

  /* ---------- 上报队列（fire-and-forget） ---------- */
  function loadQueue() {
    try {
      var q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch (e) { return []; }
  }

  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500))); } catch (e) { }
  }

  function flushQueue() {
    var token = localStorage.getItem('study_workbench_token');
    if (!token) return; // 离线：队列留存
    var q = loadQueue();
    if (!q.length) return;
    var batch = q.slice(0, 100);
    // 地址统一走 assets/config.js（window.getApiBase / window.STUDY_API_BASE），
    // 不在本文件硬编码 IP；config.js 未加载时 file: 场景直接跳过，队列留存待重试。
    var base = apiBase();
    if (!base && location.protocol === 'file:') return;
    fetch(base + '/api/study/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        logs: batch.map(function (x) {
          return { module: x.m, event: x.e, payload: x.p || {}, createdAt: x.t };
        })
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function () {
        var rest = loadQueue().slice(batch.length);
        saveQueue(rest);
      })
      .catch(function () { /* 失败静默：留在队列下次重试 */ });
  }

  /* ---------- 埋点 ---------- */
  function track(module, event, payload) {
    if (VALID_MODULES.indexOf(module) === -1) return;
    var data = readLocal();
    var m = mod(data, m0(module));
    var key = today();
    var day = m.days[key] || (m.days[key] = { minutes: 0, events: 0 });
    m.total += 1;
    day.events += 1;
    if (payload && payload.minutes) day.minutes += Math.round(payload.minutes);
    recomputeStreak(data);
    saveLocal(data);

    // 入上报队列
    var q = loadQueue();
    q.push({ m: module, e: event, p: payload || {}, t: nowTs() });
    saveQueue(q);
    // 异步上报（不阻塞 UI）
    setTimeout(flushQueue, 50);
    // 惰性重渲染本模块统计卡
    var cards = document.querySelectorAll('[data-stats-module="' + module + '"]');
    for (var i = 0; i < cards.length; i++) render(cards[i].id, module);
    return true;
  }

  function m0(m) { return m; } // 占位：未来支持别名映射【后续扩展点】

  function nowTs() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------- 工具使用痕迹（更多工具卡） ---------- */
  function getToolUsage(tool) {
    var data = readLocal();
    var m = data.modules.tools;
    if (!m || !m.days) return { count: 0, lastTs: 0 };
    var count = 0, lastTs = 0;
    Object.keys(m.days).forEach(function (d) {
      var evs = m.days[d].events || 0;
      count += evs; // 粗粒度：events 里含 tool_use，明细在云端聚合【后续扩展点：按事件类型细分】
    });
    try {
      var detail = JSON.parse(localStorage.getItem('study_workbench_tool_' + tool) || 'null');
      if (detail && detail.count) { count = detail.count; lastTs = detail.lastTs || 0; }
    } catch (e) { }
    return { count: count, lastTs: lastTs };
  }

  function markToolUse(tool) {
    try {
      var detail = JSON.parse(localStorage.getItem('study_workbench_tool_' + tool) || '{"count":0,"lastTs":0}');
      detail.count = (detail.count || 0) + 1;
      detail.lastTs = Date.now();
      localStorage.setItem('study_workbench_tool_' + tool, JSON.stringify(detail));
    } catch (e) { }
    track('tools', 'tool_use', { tool: tool });
  }

  /* ---------- 渲染「📊 学习概况」卡 ---------- */
  function render(containerId, module) {
    var box = document.getElementById(containerId);
    if (!box) return;
    box.setAttribute('data-stats-module', module);
    var data = readLocal();
    var m = data.modules[module] || { total: 0, days: {} };
    var key = today();
    var day = m.days[key] || { minutes: 0, events: 0 };

    // 近 7 天每日分钟数（纯 CSS 柱图）
    var bars = '';
    var maxMin = 1;
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var p = function (n) { return String(n).padStart(2, '0'); };
      var k = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      var mins = (m.days[k] && m.days[k].minutes) || 0;
      maxMin = Math.max(maxMin, mins);
      days.push({ label: '周' + ['日', '一', '二', '三', '四', '五', '六'][d.getDay()], mins: mins });
    }
    days.forEach(function (x) {
      var h = Math.round((x.mins / maxMin) * 56) + 4;
      bars += '<div class="study-stats-bar"><i style="height:' + h + 'px" title="' + x.mins + ' 分钟"></i><b>' + x.label + '</b></div>';
    });

    box.innerHTML =
      '<div class="study-stats-head"><span>📊 学习概况</span>' +
      '<span class="study-stats-week" onclick="StudyStats.toggleWeek(this)">本周报告 ▾</span></div>' +
      '<div class="study-stats-week-body" style="display:none">近 7 天合计 ' +
      days.reduce(function (a, x) { return a + x.mins; }, 0) + ' 分钟 · 累计 ' + m.total + ' 次</div>' +
      '<div class="study-stats-grid">' +
        '<div class="study-stats-cell"><b>' + day.minutes + '</b><span>今日分钟</span></div>' +
        '<div class="study-stats-cell"><b>' + m.total + '</b><span>累计次数</span></div>' +
        '<div class="study-stats-cell"><b>' + (data.streak || 0) + '</b><span>连续打卡</span></div>' +
        '<div class="study-stats-cell study-stats-chart">' + bars + '</div>' +
      '</div>';

    // 心跳计时长：进入页面 / 离开页面差值 = 分钟数
    heartbeat(module);
  }

  window.StudyStats = {
    track: track,
    render: render,
    getToolUsage: getToolUsage,
    markToolUse: markToolUse,
    flushQueue: flushQueue,
    toggleWeek: function (el) {
      var body = el.parentElement.nextElementSibling;
      if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
    },
    /* 【后续扩展点：study-stats 云端合并 syncFromCloud】多设备统计合并逻辑，本轮留空实现。 */
    syncFromCloud: function () { return null; }
  };

  /* ---------- 心跳计时长（visibilitychange + 页面进入/离开打点） ---------- */
  var _hb = { module: null, enterTs: 0 };

  function heartbeat(module) {
    if (_hb.module === module) return;
    finishHeartbeat(); // 结束上一个模块的心跳
    _hb.module = module;
    _hb.enterTs = Date.now();
    track(module, 'start', {});
  }

  function finishHeartbeat() {
    if (!_hb.module) return;
    var minutes = Math.round((Date.now() - _hb.enterTs) / 60000);
    if (minutes >= 1) track(_hb.module, 'finish', { minutes: minutes });
    _hb.module = null;
    _hb.enterTs = 0;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') finishHeartbeat();
  });
  window.addEventListener('beforeunload', finishHeartbeat);

  // 队列定时冲刷（每 60s；页面隐藏时跳过）
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    flushQueue();
  }, 60000);
})();
