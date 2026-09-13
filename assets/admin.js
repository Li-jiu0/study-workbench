/* =====================================================================
   assets/admin.js · 需求01 管理员超级账号（前端）
   ---------------------------------------------------------------------
   依赖（均在本文件之前以 defer 加载）：
     assets/api.js        —— apiAuthedFetch / apiGetToken / isOnlineSession / API_BASE
     assets/icon-map.js   —— lucideAutoRender
     assets/xt-toast.js   —— xtToast（缺失时回退 app.js 的 showToast）
   本文件被两个页面共用，按 DOM 特征自动分流：
     1) 更多.html   —— 只跑 initAdminEntry()：按 is_admin 显隐「管理后台」入口
     2) 管理员.html —— 跑 initAdminPage()：概览 / 用户 / 在线 / 反馈
   约定：
     · 所有 /api/admin/* 请求统一走 adminApi()，403 一律提示「无权限」并回首页，
       任何情况下都不把错误堆栈 / HTTP 细节暴露给用户。
     · 管理员对普通用户隐形由后端保证；前端不额外渲染管理员账号。
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  var ADMIN_FLAG_KEY = 'study_workbench_is_admin';   // '1' / '0' / 未设置 = 未知
  var AUTH_KEY = 'study_workbench_auth';            // {account, loginAt[, is_admin]}
  var HOME_URL = '学习工作台.html';
  var LOGIN_URL = '登录.html';
  var REFRESH_MS = 30000;                            // 与私聊页 presence 同节奏

  /* ---------------- 小工具 ---------------- */
  function admStr(v) { return (v === null || v === undefined) ? '' : String(v); }
  function admBool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
  function admEsc(s) {
    return admStr(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function admNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function $(id) { return (typeof document === 'undefined') ? null : document.getElementById(id); }

  function toast(msg, state) {
    var s = state || 'info';
    try { if (typeof window.xtToast === 'function') { window.xtToast(s, msg); return; } } catch (e) { /* 忽略 */ }
    try { if (typeof window.showToast === 'function') { window.showToast(msg); return; } } catch (e) { /* 忽略 */ }
    try { if (typeof console !== 'undefined' && console.warn) console.warn('[admin] ' + msg); } catch (e) { /* 忽略 */ }
  }

  // 统一错误对象：status + 是否 403，调用方只看这俩，不看 message 细节
  function makeErr(status, msg) {
    var e = new Error(msg || '请求失败');
    e.status = status || 0;
    e.isForbidden = (status === 403);
    return e;
  }

  /* ---------------- is_admin 读写 ----------------
     读取顺序：本地独立键 → 登录门禁对象 → CURRENT_USER；都没有 = 未知(null)。
     未知且在线会话时再走 /api/auth/me 现取一次并落盘缓存。 */
  function readAdminFlag() {
    try {
      var raw = localStorage.getItem(ADMIN_FLAG_KEY);
      if (raw === '1' || raw === 'true') return true;
      if (raw === '0' || raw === 'false') return false;
    } catch (e) { /* localStorage 被禁用：按未知处理 */ }
    try {
      var auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
      if (auth && admBool(auth.is_admin)) return true;
    } catch (e) { /* 老版本门禁值是字符串 '1'，解析失败属预期 */ }
    var cu = (typeof window.CURRENT_USER === 'object' && window.CURRENT_USER) ? window.CURRENT_USER : null;
    if (cu && (admBool(cu.is_admin) || admBool(cu.isAdmin))) return true;
    return null;
  }

  function writeAdminFlag(v) {
    try { localStorage.setItem(ADMIN_FLAG_KEY, v ? '1' : '0'); } catch (e) { /* 忽略 */ }
  }

  function isOnline() {
    try { if (typeof window.isOnlineSession === 'function') return !!window.isOnlineSession(); } catch (e) { /* 忽略 */ }
    try { return !!(localStorage.getItem('study_workbench_token') || localStorage.getItem('study_workbench_refresh')); } catch (e) { return false; }
  }

  // 远端兜底：老会话 / 登录页还没落盘 is_admin 时现取一次
  function fetchIsAdminRemote() {
    if (!isOnline() || typeof window.api !== 'function') return Promise.resolve(null);
    return window.api('/api/auth/me').then(function (me) {
      var flag = admBool(me && (me.is_admin !== undefined ? me.is_admin : me.isAdmin));
      writeAdminFlag(flag);
      return flag;
    }).catch(function () { return null; });
  }

  /* ---------------- 请求封装（复用 api.js 的 apiAuthedFetch） ----------------
     不用裸 fetch：沿用 api.js 的鉴权头与 401 静默续期；403 / 其它错误统一转中文提示。 */
  function adminApi(path, opts) {
    opts = opts || {};
    if (typeof window.apiAuthedFetch !== 'function') {
      return Promise.reject(makeErr(0, '页面脚本未就绪，请刷新重试'));
    }
    var init = { method: opts.method || 'GET' };
    if (opts.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.body);
    }
    return window.apiAuthedFetch(path, init).then(function (res) {
      var status = res.status || 0;
      if (status === 403) return Promise.reject(makeErr(403, '无权限'));
      if (status === 401) return Promise.reject(makeErr(401, '登录已过期'));
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var detail = data && (data.detail || data.message);
          if (typeof detail !== 'string' || !detail) detail = '请求失败，请稍后再试';
          return Promise.reject(makeErr(status, detail));
        }
        return data;
      });
    }).catch(function (e) {
      if (e && e.status) return Promise.reject(e);
      // 网络层异常：绝不把原始异常抛给用户
      return Promise.reject(makeErr(0, '网络异常，请稍后再试'));
    });
  }

  /* ---------------- 无权限处理 ---------------- */
  var forbiddenHandled = false;
  function onForbidden() {
    writeAdminFlag(false);
    if (forbiddenHandled) return;
    forbiddenHandled = true;
    toast('无权限：仅管理员可访问', 'error');
    setTimeout(function () { location.replace(HOME_URL); }, 900);
  }
  function onExpired() {
    toast('登录已过期，请重新登录', 'warning');
    setTimeout(function () { location.replace(LOGIN_URL); }, 900);
  }
  // 统一错误出口：返回true表示已做跳转处理
  function handleErr(e, fallbackMsg) {
    if (e && e.isForbidden) { onForbidden(); return true; }
    if (e && e.status === 401) { onExpired(); return true; }
    if (fallbackMsg) toast(fallbackMsg, 'error');
    return false;
  }

  /* ---------------- 数据归一化 ---------------- */
  function normalizeUser(u) {
    u = u || {};
    return {
      id: u.id,
      username: admStr(u.username || u.account || u.name),
      nickname: admStr(u.nickname || u.nick_name || u.username || ''),
      created_at: admStr(u.created_at || u.createdAt || u.created || ''),
      last_active: admStr(u.last_active || u.lastActive || u.last_seen_at || u.lastSeenAt || ''),
      // admin.py _user_row 对时间/布尔字段做了 camelCase + snake_case 双写，这里两套都收
      is_online: admBool(u.is_online !== undefined ? u.is_online
        : (u.isOnline !== undefined ? u.isOnline : u.online))
    };
  }

  function normalizeFeedback(f) {
    f = f || {};
    var src = admStr(f.source || (f.user_id ? 'account' : 'public')) || 'public';
    return {
      // 后端回复接口要求「来源+id」复合定位（如 public-3 / account-7），
      // 因为两源 id 空间独立；缺 key 时按 source-id 现场拼一个。
      key: admStr(f.key || (src + '-' + admStr(f.id))),
      id: f.id,
      source: src,
      created_at: admStr(f.created_at || f.createdAt || f.time || ''),
      nickname: admStr(f.nickname || f.nick_name || f.account || f.username || ''),
      type: admStr(f.type || ''),
      content: admStr(f.content || f.text || ''),
      status: admStr(f.status || (f.reply ? 'replied' : 'pending')),
      reply: admStr(f.reply || ''),
      replied_at: admStr(f.replied_at || f.repliedAt || '')
    };
  }

  function toList(data, keys) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(data[keys[i]])) return data[keys[i]];
      }
    }
    return [];
  }

  function fmtTime(s) {
    var t = admStr(s).trim();
    if (!t) return '—';
    var d = new Date(t.replace(' ', 'T'));
    if (isNaN(d.getTime())) return t;   // 解析不了就原样显示，绝不造假
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function presenceText(u) {
    try {
      if (typeof window.formatPresence === 'function') {
        var t = window.formatPresence(u.last_active, u.is_online);
        if (t) return t;
      }
    } catch (e) { /* 回退到下面 */ }
    return u.is_online ? '在线' : '离线';
  }

  /* ---------------- 页面状态 ---------------- */
  var PAGE = {
    tab: 'users',            // users | online | feedback
    overview: null,
    users: [],
    online: [],
    feedback: [],
    usersLoading: false,
    feedbackLoading: false,
    usersError: '',
    feedbackError: '',
    expandedId: null,
    detailCache: {},         // id -> {state:'loading'|'ok'|'error', data, msg}
    replyDraft: {}           // 反馈 id -> 草稿文本
  };

  /* ---------------- 概览 ---------------- */
  function ovPick(o, camel, snake) {
    if (o[camel] !== undefined && o[camel] !== null) return o[camel];
    if (o[snake] !== undefined && o[snake] !== null) return o[snake];
    return null;
  }

  function renderOverview() {
    var o = PAGE.overview || {};
    var total = ovPick(o, 'totalUsers', 'total_users');
    var active = ovPick(o, 'activeToday', 'active_today');
    var online = ovPick(o, 'onlineCount', 'online_count');
    var setv = function (id, v) {
      var n = $(id); if (n) n.textContent = (v === null || v === undefined) ? '—' : String(admNum(v));
    };
    setv('admTotalUsers', total);
    setv('admActiveToday', active);
    setv('admOnlineCount', online);
  }

  function loadOverview() {
    return adminApi('/api/admin/overview').then(function (d) {
      PAGE.overview = d || {};
      renderOverview();
    }).catch(function (e) {
      if (!handleErr(e, '')) renderOverview();
    });
  }

  /* ---------------- 用户列表 ---------------- */
  function renderUserList() {
    var box = $('admUserList');
    if (!box) return;
    var list = (PAGE.tab === 'online') ? PAGE.online : PAGE.users;
    list = (list || []).map(normalizeUser);

    if (PAGE.usersLoading) {
      box.innerHTML = '<div class="adm-empty">加载中…</div>';
      return;
    }
    if (PAGE.usersError) {
      box.innerHTML = '<div class="adm-empty err">' + admEsc(PAGE.usersError) + '</div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="adm-empty">' + (PAGE.tab === 'online' ? '当前没有在线用户' : '暂无用户') + '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      var open = (PAGE.expandedId !== null && admStr(PAGE.expandedId) === admStr(u.id));
      var initial = admEsc((u.nickname || u.username || '?').slice(0, 1));
      html += '<div class="adm-row' + (open ? ' open' : '') + '" data-uid="' + admEsc(u.id) + '">' +
        '<div class="adm-row-main" onclick="admToggleDetail(' + JSON.stringify(admStr(u.id)) + ')">' +
          '<div class="adm-avatar">' + initial + '</div>' +
          '<div class="adm-row-mid">' +
            '<div class="adm-name">' + admEsc(u.nickname || u.username || '未命名') + '</div>' +
            '<div class="adm-meta">@' + admEsc(u.username || '-') + ' · 注册 ' + admEsc(fmtTime(u.created_at)) + '</div>' +
          '</div>' +
          '<div class="adm-row-right">' +
            '<span class="adm-dot' + (u.is_online ? ' on' : '') + '"></span>' +
            '<span>' + admEsc(presenceText(u)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="adm-detail" id="admDetail" style="display:' + (open ? 'block' : 'none') + '">' +
          (open ? detailHtml(PAGE.detailCache[admStr(u.id)]) : '') +
        '</div>' +
      '</div>';
    }
    box.innerHTML = html;
    try { if (window.lucideAutoRender) window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
  }

  function detailHtml(rec) {
    if (!rec) return '<div class="adm-detail-body"><span class="adm-muted">加载中…</span></div>';
    if (rec.state === 'error') {
      return '<div class="adm-detail-body"><span class="adm-err">' + admEsc(rec.msg || '详情加载失败') + '</span></div>';
    }
    var d = rec.data || {};
    var u = normalizeUser(d);
    var rows = [
      ['用户 ID', u.id === undefined || u.id === null ? '—' : admStr(u.id)],
      ['用户名', u.username || '—'],
      ['昵称', u.nickname || '—'],
      ['注册时间', fmtTime(u.created_at)],
      ['最近活跃', fmtTime(u.last_active)],
      ['在线状态', u.is_online ? '在线' : '离线']
    ];
    if (d.is_admin !== undefined || d.isAdmin !== undefined) {
      rows.push(['管理员', admBool(d.is_admin !== undefined ? d.is_admin : d.isAdmin) ? '是' : '否']);
    }
    // 后端追加的其它标量字段原样补在后面，不改结构也能看到
    var known = {
      id: 1, username: 1, account: 1, name: 1, nickname: 1, nick_name: 1,
      created_at: 1, createdAt: 1, created: 1, last_active: 1, lastActive: 1,
      last_seen_at: 1, lastSeenAt: 1, is_online: 1, online: 1, is_admin: 1, isAdmin: 1
    };
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      if (known[k]) continue;
      var v = d[k];
      if (v === null || v === undefined || typeof v === 'object') continue;
      if (typeof v === 'boolean') v = v ? '是' : '否';
      rows.push([k, admStr(v)]);
    }
    var body = '';
    for (var i = 0; i < rows.length; i++) {
      body += '<div class="adm-kv"><div class="adm-kv-k">' + admEsc(rows[i][0]) +
        '</div><div class="adm-kv-v">' + admEsc(rows[i][1]) + '</div></div>';
    }
    return '<div class="adm-detail-body">' + body + '</div>';
  }

  function loadUsers() {
    PAGE.usersLoading = true;
    PAGE.usersError = '';
    renderUserList();
    return adminApi('/api/admin/users').then(function (d) {
      PAGE.users = toList(d, ['users', 'items', 'data']);
      PAGE.usersLoading = false;
      renderUserList();
    }).catch(function (e) {
      PAGE.usersLoading = false;
      PAGE.users = [];
      if (!handleErr(e, '')) PAGE.usersError = '用户列表加载失败，请稍后刷新';
      renderUserList();
    });
  }

  function loadOnline() {
    PAGE.usersLoading = true;
    PAGE.usersError = '';
    renderUserList();
    return adminApi('/api/admin/online').then(function (d) {
      PAGE.online = toList(d, ['users', 'items', 'online', 'data']);
      PAGE.usersLoading = false;
      renderUserList();
    }).catch(function (e) {
      PAGE.usersLoading = false;
      PAGE.online = [];
      if (!handleErr(e, '')) PAGE.usersError = '在线用户加载失败，请稍后刷新';
      renderUserList();
    });
  }

  function loadUserDetail(uid) {
    var key = admStr(uid);
    PAGE.detailCache[key] = { state: 'loading', data: null, msg: '' };
    return adminApi('/api/admin/users/' + encodeURIComponent(key)).then(function (d) {
      PAGE.detailCache[key] = { state: 'ok', data: d, msg: '' };
    }).catch(function (e) {
      if (e && e.isForbidden) { onForbidden(); return; }
      if (e && e.status === 401) { onExpired(); return; }
      PAGE.detailCache[key] = { state: 'error', data: null, msg: '详情加载失败，请稍后重试' };
    }).then(function () {
      if (admStr(PAGE.expandedId) === key) renderUserList();
    });
  }

  window.admToggleDetail = function (uid) {
    var key = admStr(uid);
    if (PAGE.expandedId !== null && admStr(PAGE.expandedId) === key) {
      PAGE.expandedId = null;
      renderUserList();
      return;
    }
    PAGE.expandedId = key;
    if (!PAGE.detailCache[key]) loadUserDetail(uid);
    renderUserList();
  };

  /* ---------------- 用户反馈 ---------------- */
  var FB_SOURCE_TEXT = { public: '公开反馈', account: '账号反馈' };

  function renderFeedback() {
    var box = $('admFeedbackList');
    if (!box) return;
    if (PAGE.feedbackLoading) { box.innerHTML = '<div class="adm-empty">加载中…</div>'; return; }
    if (PAGE.feedbackError) { box.innerHTML = '<div class="adm-empty err">' + admEsc(PAGE.feedbackError) + '</div>'; return; }
    var list = (PAGE.feedback || []).map(normalizeFeedback);
    if (!list.length) { box.innerHTML = '<div class="adm-empty">暂无用户反馈</div>'; return; }

    function srcBadge(f) {
      var isPub = (f.source === 'public');
      return '<span class="adm-tag ' + (isPub ? 'pub' : 'acc') + '">' + admEsc(FB_SOURCE_TEXT[f.source] || f.source) + '</span>';
    }
    function statusBadge(f) {
      var replied = (f.status === 'replied') || !!f.reply;
      return '<span class="adm-tag ' + (replied ? 'ok' : 'wait') + '">' + (replied ? '已回复' : '待回复') + '</span>';
    }
    function replyBlock(f) {
      if (f.reply) {
        return '<div class="adm-reply-box">' +
          '<div class="adm-reply-line"><b>管理员回复：</b>' + admEsc(f.reply) + '</div>' +
          '<div class="adm-reply-time">' + admEsc(fmtTime(f.replied_at)) + '</div>' +
          '</div>';
      }
      var draft = admEsc(PAGE.replyDraft[admStr(f.key)] || '');
      var fid = admEsc(f.key);
      return '<div class="adm-reply-form">' +
        '<textarea class="adm-reply-input" id="admReply_' + fid + '" rows="2" maxlength="500" ' +
          'placeholder="回复该用户…" oninput="admReplyDraft(' + JSON.stringify(admStr(f.key)) + ',this.value)">' + draft + '</textarea>' +
        '<div class="adm-reply-actions">' +
          '<button class="btn btn-sm btn-primary" id="admReplyBtn_' + fid + '" ' +
            'onclick="admSendReply(' + JSON.stringify(admStr(f.key)) + ')">提交回复</button>' +
        '</div></div>';
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      html += '<div class="adm-fb" data-fid="' + admEsc(f.id) + '">' +
        '<div class="adm-fb-head">' +
          '<span class="adm-fb-who">' + admEsc(f.nickname || '匿名') + '</span>' +
          srcBadge(f) + statusBadge(f) +
          '<span class="adm-fb-time">' + admEsc(fmtTime(f.created_at)) + '</span>' +
        '</div>' +
        '<div class="adm-fb-type">' + admEsc(f.type || '未分类') + ' · #' + admEsc(f.id) + '</div>' +
        '<div class="adm-fb-content">' + admEsc(f.content) + '</div>' +
        replyBlock(f) +
        '</div>';
    }
    box.innerHTML = html;
  }

  function loadFeedback() {
    PAGE.feedbackLoading = true;
    PAGE.feedbackError = '';
    renderFeedback();
    return adminApi('/api/admin/feedback').then(function (d) {
      PAGE.feedback = toList(d, ['items', 'feedback', 'data', 'list']);
      PAGE.feedbackLoading = false;
      renderFeedback();
    }).catch(function (e) {
      PAGE.feedbackLoading = false;
      PAGE.feedback = [];
      if (!handleErr(e, '')) PAGE.feedbackError = '反馈加载失败，请稍后刷新';
      renderFeedback();
    });
  }

  window.admReplyDraft = function (fid, val) {
    PAGE.replyDraft[admStr(fid)] = val || '';
  };

  window.admSendReply = function (fid) {
    var key = admStr(fid);
    var ta = $('admReply_' + key);
    var text = ((ta && ta.value) || PAGE.replyDraft[key] || '').trim();
    if (!text) { toast('请先填写回复内容', 'warning'); return; }
    var btn = $('admReplyBtn_' + key);
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
    adminApi('/api/admin/feedback/' + encodeURIComponent(key) + '/reply', {
      method: 'POST',
      body: { reply: text }
    }).then(function () {
      // 提交成功：本地即时置为已回复，避免再等一次列表请求
      for (var i = 0; i < PAGE.feedback.length; i++) {
        var it = PAGE.feedback[i] || {};
        if (admStr(it.key) === key || admStr(it.id) === key) {
          it.reply = text;
          it.status = 'replied';
          it.replied_at = it.replied_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
      }
      delete PAGE.replyDraft[key];
      toast('已回复', 'success');
      renderFeedback();
    }).catch(function (e) {
      if (!handleErr(e, '回复提交失败，请稍后重试')) { /* 已提示 */ }
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = '提交回复'; }
    });
  };

  /* ---------------- tab 切换 / 刷新 ---------------- */
  function syncTabs() {
    var map = { users: 'admTabUsers', online: 'admTabOnline', feedback: 'admTabFeedback' };
    for (var k in map) {
      var n = $(map[k]);
      if (n) n.className = 'adm-tab' + (PAGE.tab === k ? ' active' : '');
    }
    var ul = $('admUserList');
    if (ul) ul.style.display = (PAGE.tab === 'feedback') ? 'none' : '';
    var fl = $('admFeedbackList');
    if (fl) fl.style.display = (PAGE.tab === 'feedback') ? '' : 'none';
  }

  window.admSwitchTab = function (tab) {
    if (tab !== 'users' && tab !== 'online' && tab !== 'feedback') tab = 'users';
    if (PAGE.tab === tab) return;
    PAGE.tab = tab;
    PAGE.expandedId = null;
    syncTabs();
    if (tab === 'online') loadOnline();
    else if (tab === 'feedback') { if (!PAGE.feedback.length) loadFeedback(); else renderFeedback(); }
    else renderUserList();
  };

  window.admRefresh = function () {
    loadOverview();
    if (PAGE.tab === 'feedback') loadFeedback();
    else if (PAGE.tab === 'online') loadOnline();
    else loadUsers();
  };

  /* ---------------- 页面初始化 ---------------- */
  function initAdminPage() {
    if (!$('adminRoot')) return;
    if (!isOnline()) {
      toast('管理后台需要在线登录', 'warning');
      setTimeout(function () { location.replace(LOGIN_URL); }, 900);
      return;
    }
    syncTabs();
    admRefresh();
    setInterval(function () {
      try { if (document.hidden) return; } catch (e) { /* 忽略 */ }
      window.admRefresh();
    }, REFRESH_MS);
  }

  /* ---------------- 更多.html 入口 ---------------- */
  function initAdminEntry() {
    var card = $('adminEntryCard');
    if (!card) return;
    var show = function () {
      card.style.display = '';
      try { if (window.lucideAutoRender) window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
    };
    var flag = readAdminFlag();
    if (flag === true) { show(); return; }
    if (isOnline()) {
      fetchIsAdminRemote().then(function (remote) {
        if (remote === true) show();
        else card.style.display = 'none';
      }).catch(function () { card.style.display = 'none'; });
      return;
    }
    card.style.display = 'none';
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if ($('adminRoot')) { initAdminPage(); return; }
    if ($('adminEntryCard')) { initAdminEntry(); return; }
  }

  window.adminIsAdmin = readAdminFlag;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
