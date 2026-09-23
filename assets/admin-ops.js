/* =====================================================================
   assets/admin-ops.js · R170-C 管理后台「全能管理台」前端逻辑（自包含）
   ---------------------------------------------------------------------
   依赖（均在 管理员.html 中按序 defer 加载，本文件最后加载）：
     assets/api.js      —— apiAuthedFetch / apiGetToken / isOnlineSession / API_BASE
     assets/icon-map.js —— lucideAutoRender
     assets/xt-toast.js —— xtToast（缺失回退 app.js 的 showToast）
     assets/app.js      —— uiConfirm / uiAlert / uiPrompt（缺省回退原生弹窗）
     assets/admin.js    —— window.admRefresh / window.admSwitchTab（本文件包装其刷新）
   约定：
     · 所有 /api/admin/* 请求统一走本文件的 opsApi()（错误处理口径与 admin.js 的
       adminApi() 完全一致），不改动 admin.js 的 adminApi。
     · 一律 ES5（var / function / 字符串拼接 / Promise），兼容老 WebView。
     · 动态 innerHTML 若含 data-icon，插入后统一调 window.lucideAutoRender()。
     · 只「追加」UI，不重排既有卡片顺序，不删既有 DOM。
   暴露：window.XTADMOPS = { version, onTab, injectRowActions, act, ... }
   ===================================================================== */
(function () {
  'use strict';

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  /* =============================== 基础工具 =============================== */
  function $(id) { return document.getElementById(id); }
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function bool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

  function esc(s) {
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 生成可安全嵌入「双引号 HTML 属性」中 onclick 的 JS 字符串字面量（单引号包裹）。 */
  function jsq(v) {
    return "'" + str(v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/</g, '\\u003c')
      .replace(/\r?\n/g, ' ') + "'";
  }
  /* onclick 属性（表达式内部一律用 jsq() 拼字符串字面量） */
  function oc(expr) { return ' onclick="' + expr + '"'; }

  function fmtTime(s) {
    var t = str(s).trim();
    if (!t) return '—';
    var d = new Date(t.replace(' ', 'T'));
    if (isNaN(d.getTime())) return t;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function toast(msg, state) {
    var s = state || 'info';
    try { if (typeof window.xtToast === 'function') { window.xtToast(s, msg); return; } } catch (e) { /* 忽略 */ }
    try { if (typeof window.showToast === 'function') { window.showToast(msg); return; } } catch (e) { /* 忽略 */ }
    try { if (typeof console !== 'undefined' && console.warn) console.warn('[admops] ' + msg); } catch (e) { /* 忽略 */ }
  }

  function paint() {
    try { if (typeof window.lucideAutoRender === 'function') window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
  }

  /* 统一弹层（优先复用 app.js 的 uiConfirm/uiAlert/uiPrompt） */
  function uiConfirm(msg, okText) {
    if (typeof window.uiConfirm === 'function') return window.uiConfirm(msg, okText || '确定');
    return Promise.resolve(!!window.confirm(msg));
  }
  function uiAlert(msg) {
    if (typeof window.uiAlert === 'function') return window.uiAlert(msg);
    try { window.alert(msg); } catch (e) { /* 忽略 */ }
    return Promise.resolve(true);
  }
  function uiPrompt(msg, def) {
    if (typeof window.uiPrompt === 'function') return window.uiPrompt(msg, def || '');
    var v = window.prompt(msg, def || '');
    return Promise.resolve(v === null ? null : String(v));
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

  /* =============================== 请求封装 =============================== */
  function mkErr(status, msg) {
    var e = new Error(msg || '请求失败');
    e.status = status || 0;
    e.isForbidden = (status === 403);
    return e;
  }

  var HOME_URL = '学习工作台.html';
  var LOGIN_URL = '登录.html';
  var forbiddenHandled = false;

  function onForbidden() {
    if (forbiddenHandled) return;
    forbiddenHandled = true;
    toast('无权限：仅管理员可访问', 'error');
    setTimeout(function () { try { location.replace(HOME_URL); } catch (e) { /* 忽略 */ } }, 900);
  }
  function onExpired() {
    toast('登录已过期，请重新登录', 'warning');
    setTimeout(function () { try { location.replace(LOGIN_URL); } catch (e) { /* 忽略 */ } }, 900);
  }
  /* 统一错误出口：返回 true 表示已做跳转处理 */
  function handleErr(e, fallbackMsg) {
    if (e && e.isForbidden) { onForbidden(); return true; }
    if (e && e.status === 401) { onExpired(); return true; }
    if (fallbackMsg) toast(fallbackMsg, 'error');
    return false;
  }

  /* 与 admin.js adminApi() 同构的请求封装（鉴权头 / 401 静默续期 / 403 / detail 中文原样透出） */
  function opsApi(path, opts) {
    opts = opts || {};
    if (typeof window.apiAuthedFetch !== 'function') {
      return Promise.reject(mkErr(0, '页面脚本未就绪，请刷新重试'));
    }
    var init = { method: opts.method || 'GET' };
    if (opts.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.body);
    }
    return window.apiAuthedFetch(path, init).then(function (res) {
      var status = res.status || 0;
      if (status === 403) return Promise.reject(mkErr(403, '无权限'));
      if (status === 401) return Promise.reject(mkErr(401, '登录已过期'));
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var detail = data && (data.detail || data.message);
          if (typeof detail !== 'string' || !detail) detail = '请求失败，请稍后再试';
          return Promise.reject(mkErr(status, detail));
        }
        return data;
      });
    }).catch(function (e) {
      if (e && e.status) return Promise.reject(e);
      return Promise.reject(mkErr(0, '网络异常，请稍后再试'));
    });
  }

  /* =============================== 状态 =============================== */
  var OPS = {
    booted: false,
    activeTab: 'users',          // users|online|feedback|devices|content|announcements|groups|chat|logs
    hidden: false,               // 当前管理员隐身状态
    visLoading: false,
    userMap: {},                 // uid -> {username, account, nickname, banned}
    /* 内容治理 */
    content: { section: 'moments', q: '', offset: 0, limit: 20, items: [], total: 0, loading: false, error: '', summary: null },
    /* 公告 */
    ann: { items: [], loading: false, error: '', editId: null },
    /* 群组 */
    groups: { q: '', offset: 0, limit: 20, items: [], total: 0, loading: false, error: '', open: {} },
    /* 私聊 */
    chat: { q: '', threads: [], offset: 0, limit: 20, total: 0, loading: false, error: '',
            active: null, msgs: [], msgsLoading: false, msgsError: '', search: null },
    /* 审计日志 */
    logs: { offset: 0, limit: 20, items: [], total: 0, loading: false, error: '' },
    /* R171-C2：某用户已安装应用列表弹层 */
    apps: { uid: null, data: null, q: '', loading: false, error: '' }
  };

  var CONTENT_SECTIONS = {
    moments: { label: '动态', url: '/api/admin/content/moments', base: '/api/admin/content/moments', q: true, primary: 'content' },
    momentComments: { label: '动态评论', url: '/api/admin/content/moment-comments', base: '/api/admin/content/moment-comments', q: false, primary: 'content' },
    notes: { label: '笔记', url: '/api/admin/content/notes', base: '/api/admin/content/notes', q: true, primary: 'title' },
    board: { label: '留言板', url: '/api/admin/content/board', base: '/api/admin/content/board', q: false, primary: 'content' },
    boardReplies: { label: '留言回复', url: '/api/admin/content/board-replies', base: '/api/admin/content/board-replies', q: false, primary: 'content' }
  };

  function adminName() {
    try {
      var a = JSON.parse(localStorage.getItem('study_workbench_auth') || '{}');
      if (a && (a.account || a.username)) return str(a.account || a.username);
    } catch (e) { /* 忽略 */ }
    try {
      if (window.CURRENT_USER) {
        return str(window.CURRENT_USER.nickname || window.CURRENT_USER.username || window.CURRENT_USER.account || '');
      }
    } catch (e) { /* 忽略 */ }
    return '';
  }

  function emptyBox(text) { return '<div class="adm-empty">' + esc(text) + '</div>'; }
  function errBox(text, retryCmd) {
    var h = '<div class="adm-empty err">' + esc(text);
    if (retryCmd) h += ' <a class="adm-op-retry" href="javascript:void(0)"' + oc("XTADMOPS.act('" + retryCmd + "')") + '>点击重试</a>';
    h += '</div>';
    return h;
  }

  /* =============================== 顶部工具条 =============================== */
  function renderOpsBar() {
    var bar = $('admOpsBar');
    if (!bar) return;
    var who = adminName();
    bar.innerHTML =
      '<div class="adm-op-bar">' +
        '<div class="adm-op-who">' +
          '<span class="adm-op-badge">管理员</span>' +
          '<span class="adm-op-whoname">' + esc(who || '当前账号') + '</span>' +
        '</div>' +
        '<button class="adm-op-vis" id="admVisBtn"' + oc("XTADMOPS.act('vis')") + '>' +
          (OPS.hidden ? '👁 我对他人隐身中' : '👁 已现身') +
        '</button>' +
      '</div>';
    paint();
  }

  function loadVisibility() {
    return opsApi('/api/admin/me/visibility').then(function (d) {
      OPS.hidden = !!(d && d.hidden);
      renderOpsBar();
    }).catch(function (e) {
      if (!handleErr(e, '')) { /* 静默：工具条仍显示默认文案 */ }
    });
  }

  function toggleVisibility() {
    if (OPS.visLoading) return;
    OPS.visLoading = true;
    var next = !OPS.hidden;
    var btn = $('admVisBtn');
    if (btn) btn.disabled = true;
    opsApi('/api/admin/me/visibility', { method: 'POST', body: { hidden: next } }).then(function (d) {
      OPS.hidden = (d && d.hidden !== undefined) ? !!d.hidden : next;
      renderOpsBar();
      toast(OPS.hidden ? '已切换为隐身（对普通用户不可见）' : '已切换为现身', 'success');
    }).catch(function (e) {
      if (!handleErr(e, '切换失败，请稍后重试')) { /* 已提示 */ }
    }).then(function () {
      OPS.visLoading = false;
      var b2 = $('admVisBtn');
      if (b2) b2.disabled = false;
    });
  }

  /* =============================== 用户行操作区 =============================== */
  function rowActionsInner(uid) {
    var u = OPS.userMap[str(uid)] || {};
    var banned = !!u.banned;
    var banCls = banned ? 'adm-op-btn ok' : 'adm-op-btn warn';
    var banTxt = banned ? '解封' : '封禁';
    var q = jsq(uid);
    var h = '';
    h += '<button class="' + banCls + '"' + oc("XTADMOPS.act('uBan'," + q + ")") + '>' + banTxt + '</button>';
    h += '<button class="adm-op-btn"' + oc("XTADMOPS.act('uMute'," + q + ")") + '>禁言</button>';
    h += '<button class="adm-op-btn"' + oc("XTADMOPS.act('uKick'," + q + ")") + '>踢下线</button>';
    h += '<button class="adm-op-btn"' + oc("XTADMOPS.act('uPwd'," + q + ")") + '>重置密码</button>';
    h += '<button class="adm-op-btn"' + oc("XTADMOPS.act('uProfile'," + q + ")") + '>改资料</button>';
    h += '<button class="adm-op-btn"' + oc("XTADMOPS.act('uSummary'," + q + ")") + '>数据概览</button>';
    h += '<button class="adm-op-btn"' + oc("XTADMOPS.act('uApps'," + q + ")") + '>应用列表</button>';
    h += '<button class="adm-op-btn danger"' + oc("XTADMOPS.act('uDelete'," + q + ")") + '>彻底删除</button>';
    return h;
  }

  function usersTabActive() {
    var t = $('admTabUsers');
    return !!(t && t.className && t.className.indexOf('active') > -1);
  }

  function injectRowActions() {
    var box = $('admUserList');
    if (!box) return;
    if (!usersTabActive()) return;   // 仅在「全部用户」tab 注入
    var rows = box.querySelectorAll('.adm-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.querySelector('.adm-op-rowacts')) continue;
      var uid = row.getAttribute('data-uid');
      if (uid === null || uid === '') continue;
      var acts = document.createElement('div');
      acts.className = 'adm-op-rowacts';
      acts.innerHTML = rowActionsInner(uid);
      row.appendChild(acts);
    }
    // 注意：此处不调 paint()——操作条不含 data-icon；避免 MutationObserver 自触发循环
  }

  function refreshRowActionsLabel(uid) {
    var box = $('admUserList');
    if (!box) return;
    var rows = box.querySelectorAll('.adm-row');
    for (var i = 0; i < rows.length; i++) {
      if (str(rows[i].getAttribute('data-uid')) === str(uid)) {
        var acts = rows[i].querySelector('.adm-op-rowacts');
        if (acts) acts.innerHTML = rowActionsInner(uid);
        break;
      }
    }
  }

  /* 拉一次用户列表，建立 uid -> {username, account, nickname, banned} 映射（只读，失败静默）。
     用于「封禁/解封」按钮按 isBanned 切换、以及「彻底删除」的账号校验。 */
  function loadUserMap() {
    return opsApi('/api/admin/users').then(function (d) {
      var items = toList(d, ['users', 'items', 'data']);
      var map = {};
      for (var i = 0; i < items.length; i++) {
        var u = items[i] || {};
        var id = str(u.id !== undefined ? u.id : u.user_id);
        if (!id) continue;
        map[id] = {
          username: str(u.username || u.account || u.name),
          account: str(u.account || u.username || ''),
          nickname: str(u.nickname || u.nick_name || u.username || ''),
          banned: bool(u.is_banned !== undefined ? u.is_banned : (u.isBanned !== undefined ? u.isBanned : u.banned))
        };
      }
      OPS.userMap = map;
    }).catch(function () { /* 静默：拿不到映射时按钮默认显示「封禁」 */ });
  }

  function ensureUserMeta(uid) {
    var key = str(uid);
    if (OPS.userMap[key]) return Promise.resolve(OPS.userMap[key]);
    return opsApi('/api/admin/users/' + encodeURIComponent(key)).then(function (d) {
      d = d || {};
      var rec = {
        username: str(d.username || d.account || d.name),
        account: str(d.account || d.username || ''),
        nickname: str(d.nickname || d.nick_name || d.username || ''),
        banned: bool(d.is_banned !== undefined ? d.is_banned : (d.isBanned !== undefined ? d.isBanned : d.banned))
      };
      OPS.userMap[key] = rec;
      return rec;
    }).catch(function () { return OPS.userMap[key] || {}; });
  }

  /* ---------------- 用户操作 ---------------- */
  function actUserBan(uid) {
    uid = str(uid);
    var banned = !!(OPS.userMap[uid] && OPS.userMap[uid].banned);
    if (banned) {
      uiConfirm('确定解除对该用户的封禁？解除后其可重新登录。', '解封').then(function (ok) {
        if (!ok) return;
        return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/unban', { method: 'POST' }).then(function () {
          if (OPS.userMap[uid]) OPS.userMap[uid].banned = false;
          refreshRowActionsLabel(uid);
          toast('已解除封禁', 'success');
        }).catch(function (e) { handleErr(e, '解封失败，请稍后重试'); });
      });
      return;
    }
    uiPrompt('输入封禁原因（可留空）：', '').then(function (reason) {
      if (reason === null) return;
      return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/ban', {
        method: 'POST', body: { reason: str(reason) }
      }).then(function () {
        if (OPS.userMap[uid]) OPS.userMap[uid].banned = true;
        refreshRowActionsLabel(uid);
        toast('已封禁并踢下线', 'success');
      }).catch(function (e) { handleErr(e, '封禁失败，请稍后重试'); });
    });
  }

  function actUserMute(uid) {
    uid = str(uid);
    uiPrompt('输入禁言分钟数（输入 0 表示解除禁言）：', '30').then(function (v) {
      if (v === null) return;
      var minutes = parseInt(str(v).replace(/[^0-9\-]/g, ''), 10);
      if (isNaN(minutes)) { toast('请输入数字分钟数', 'warning'); return; }
      return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/mute', {
        method: 'POST', body: { minutes: minutes }
      }).then(function () {
        toast(minutes <= 0 ? '已解除禁言' : ('已禁言 ' + minutes + ' 分钟'), 'success');
      }).catch(function (e) { handleErr(e, '禁言操作失败，请稍后重试'); });
    });
  }

  function actUserKick(uid) {
    uid = str(uid);
    uiConfirm('确定将该用户踢下线？（其登录令牌将立即失效）', '踢下线').then(function (ok) {
      if (!ok) return;
      return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/kick', { method: 'POST' }).then(function () {
        toast('已踢下线', 'success');
      }).catch(function (e) { handleErr(e, '踢下线失败，请稍后重试'); });
    });
  }

  function actUserPwd(uid) {
    uid = str(uid);
    uiPrompt('输入新密码（建议 8 位以上，含字母与数字）：', '').then(function (pw) {
      if (pw === null) return;
      pw = str(pw);
      if (!pw) { toast('密码不能为空', 'warning'); return; }
      return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/reset-password', {
        method: 'POST', body: { newPassword: pw }
      }).then(function () {
        toast('密码已重置', 'success');
      }).catch(function (e) {
        if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); return; }
        // 弱口令等 400：把后端中文原因原样透出
        toast((e && e.message) ? e.message : '重置失败，请稍后重试', 'error');
      });
    });
  }

  function ensureInlineBlock(row, cls) {
    var el = row.querySelector('.' + cls);
    return el;
  }

  function actUserSummary(uid) {
    uid = str(uid);
    var row = findRow(uid);
    if (!row) return;
    var existing = ensureInlineBlock(row, 'adm-op-summary');
    if (existing) { existing.parentNode.removeChild(existing); return; }
    var block = document.createElement('div');
    block.className = 'adm-op-summary';
    block.innerHTML = '<div class="adm-op-muted">数据概览加载中…</div>';
    row.appendChild(block);
    opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/data-summary').then(function (d) {
      d = d || {};
      var user = d.user || {};
      var counts = d.counts || {};
      var labels = {
        moments: '动态', notes: '笔记', noteComments: '笔记评论', momentComments: '动态评论',
        board: '留言板', messages: '私聊消息', friends: '好友', devices: '设备',
        aiLogs: 'AI 日志', studyLogs: '学习记录'
      };
      var grid = '';
      var keys = Object.keys(counts);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        grid += '<div class="adm-op-summary-cell">' +
          '<div class="adm-op-summary-num">' + num(counts[k]) + '</div>' +
          '<div class="adm-op-summary-lab">' + esc(labels[k] || k) + '</div>' +
        '</div>';
      }
      if (!grid) grid = '<div class="adm-op-muted">该用户暂无数据</div>';
      block.innerHTML =
        '<div class="adm-op-summary-head">' +
          '<b>' + esc(user.nickname || user.username || ('#' + uid)) + '</b>' +
          '<span class="adm-op-muted">' + esc(user.account ? ('@' + user.account) : '') + '</span>' +
        '</div>' +
        '<div class="adm-op-summary-grid">' + grid + '</div>';
    }).catch(function (e) {
      if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); block.parentNode && block.parentNode.removeChild(block); return; }
      block.innerHTML = errBox((e && e.message) ? e.message : '数据概览加载失败');
    });
  }

  function findRow(uid) {
    var box = $('admUserList');
    if (!box) return null;
    var rows = box.querySelectorAll('.adm-row');
    for (var i = 0; i < rows.length; i++) {
      if (str(rows[i].getAttribute('data-uid')) === str(uid)) return rows[i];
    }
    return null;
  }

  var PROFILE_FIELDS = ['nickname', 'motto', 'bio', 'city', 'goal', 'tags', 'gender', 'account', 'email'];
  var PROFILE_LABEL = {
    nickname: '昵称', motto: '签名', bio: '简介', city: '城市', goal: '目标',
    tags: '标签(逗号分隔)', gender: '性别', account: '账号', email: '邮箱'
  };

  function actUserProfile(uid) {
    uid = str(uid);
    var row = findRow(uid);
    if (!row) return;
    var existing = row.querySelector('.adm-op-profileform');
    if (existing) { existing.parentNode.removeChild(existing); return; }
    var form = document.createElement('div');
    form.className = 'adm-op-profileform';
    form.innerHTML = '<div class="adm-op-muted">资料加载中…</div>';
    row.appendChild(form);
    opsApi('/api/admin/users/' + encodeURIComponent(uid)).then(function (d) {
      d = d || {};
      OPS.userMap[uid] = OPS.userMap[uid] || {};
      OPS.userMap[uid].username = str(d.username || d.account || OPS.userMap[uid].username);
      OPS.userMap[uid].account = str(d.account || OPS.userMap[uid].account);
      var pre = {};
      for (var i = 0; i < PROFILE_FIELDS.length; i++) {
        var f = PROFILE_FIELDS[i];
        var v = d[f];
        if (f === 'tags' && Object.prototype.toString.call(v) === '[object Array]') v = v.join(',');
        pre[f] = str(v);
      }
      var inputs = '';
      for (var j = 0; j < PROFILE_FIELDS.length; j++) {
        var f2 = PROFILE_FIELDS[j];
        inputs += '<label class="adm-op-field"><span>' + esc(PROFILE_LABEL[f2]) + '</span>' +
          '<input class="adm-op-input" id="admPf_' + uid + '_' + f2 + '" value="' + esc(pre[f2]) + '"></label>';
      }
      form.setAttribute('data-pre', encodeURIComponent(JSON.stringify(pre)));
      form.innerHTML = '<div class="adm-op-form-grid">' + inputs + '</div>' +
        '<div class="adm-op-form-actions">' +
          '<button class="btn btn-sm btn-primary"' + oc("XTADMOPS.act('uProfileSave'," + jsq(uid) + ")") + '>保存</button>' +
          '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('uProfile'," + jsq(uid) + ")") + '>取消</button>' +
        '</div>';
    }).catch(function (e) {
      if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); if (form.parentNode) form.parentNode.removeChild(form); return; }
      form.innerHTML = errBox((e && e.message) ? e.message : '资料加载失败，请稍后重试');
    });
  }

  function actUserProfileSave(uid) {
    uid = str(uid);
    var row = findRow(uid);
    if (!row) return;
    var form = row.querySelector('.adm-op-profileform');
    if (!form) return;
    var pre = {};
    try { pre = JSON.parse(decodeURIComponent(form.getAttribute('data-pre') || '{}')); } catch (e) { pre = {}; }
    var body = {};
    var changed = 0;
    for (var i = 0; i < PROFILE_FIELDS.length; i++) {
      var f = PROFILE_FIELDS[i];
      var el = $('admPf_' + uid + '_' + f);
      if (!el) continue;
      var val = str(el.value).trim();
      if (val !== str(pre[f])) { body[f] = val; changed++; }
    }
    if (!changed) { toast('没有修改任何字段', 'info'); return; }
    opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/profile', { method: 'PATCH', body: body }).then(function () {
      toast('资料已更新', 'success');
      if (form.parentNode) form.parentNode.removeChild(form);
      if (body.nickname) { OPS.userMap[uid] = OPS.userMap[uid] || {}; OPS.userMap[uid].nickname = body.nickname; }
    }).catch(function (e) {
      if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); return; }
      toast((e && e.message) ? e.message : '更新失败，请稍后重试', 'error');
    });
  }

  function actUserDelete(uid) {
    uid = str(uid);
    ensureUserMeta(uid).then(function (meta) {
      var hint = str(meta.account || meta.username || '');
      var msg = '彻底删除不可恢复（该用户及其全部数据将被清除）！\n请手动输入该用户的账号/用户名以确认' +
        (hint ? ('（' + hint + '）') : '') + '：';
      return uiPrompt(msg, '').then(function (typed) {
        if (typed === null) return;
        typed = str(typed).trim();
        if (!typed) { toast('已取消：未输入确认文本', 'warning'); return; }
        var matched = (typed === str(meta.account) || typed === str(meta.username));
        if (!matched) { toast('确认文本与该用户账号/用户名不一致，已取消', 'error'); return; }
        return uiConfirm('再次确认：彻底删除用户「' + (meta.nickname || meta.username || ('#' + uid)) + '」及其全部数据？', '彻底删除').then(function (ok) {
          if (!ok) return;
          return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '?confirm=' + encodeURIComponent(typed), { method: 'DELETE' }).then(function () {
            toast('已彻底删除', 'success');
            delete OPS.userMap[uid];
            if (typeof window.admRefresh === 'function') window.admRefresh();
          }).catch(function (e) {
            if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); return; }
            toast((e && e.message) ? e.message : '删除失败，请稍后重试', 'error');
          });
        });
      });
    });
  }

  /* =============================== 应用列表弹层（R171-C2） =============================== */
  /* 管理员查看某用户已安装应用列表：GET /api/admin/users/{uid}/apps（走 opsApi 鉴权）。
     弹层动态挂到 body（#admAppsModal）；图标空值用首字母色块兜底；搜索为纯前端过滤。 */

  /* 由应用名算一个稳定色值（供首字母色块背景；内联 style 写死，不依赖 CSS 类）。 */
  function appsIconColor(label) {
    var s = str(label);
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 360; }
    return 'hsl(' + h + ', 52%, 46%)';
  }

  /* 首字母（含中文取首字），无内容回退 '?'。 */
  function appsInitial(label) {
    var s = str(label).trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }

  /* 已加载数据按当前关键词过滤（对 label / pkg 做小写子串匹配）。 */
  function appsFiltered() {
    var d = OPS.apps.data || {};
    var items = (Object.prototype.toString.call(d.apps) === '[object Array]') ? d.apps : [];
    var q = str(OPS.apps.q).trim().toLowerCase();
    if (!q) return items;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var a = items[i] || {};
      var label = str(a.label).toLowerCase();
      var pkg = str(a.pkg).toLowerCase();
      if (label.indexOf(q) > -1 || pkg.indexOf(q) > -1) out.push(a);
    }
    return out;
  }

  /* 单行应用 HTML：图标 + 应用名 + 包名（全部过 esc 转义）。 */
  function appsRowHtml(app) {
    var a = app || {};
    var label = str(a.label);
    var pkg = str(a.pkg);
    var icon = str(a.icon);
    var ico = icon
      ? '<img class="adm-apps-ico" src="' + esc(icon) + '" alt="">'
      : '<span class="adm-apps-ico adm-apps-ico-fb" style="background:' + appsIconColor(label) + '">' + esc(appsInitial(label)) + '</span>';
    return '<div class="adm-apps-row">' + ico +
      '<div class="adm-apps-info">' +
        '<div class="adm-apps-name">' + esc(label || '（未命名应用）') + '</div>' +
        '<div class="adm-apps-pkg">' + esc(pkg || '—') + '</div>' +
      '</div>' +
    '</div>';
  }

  /* 列表区 HTML（含空态：无匹配 / 未上报 / 已关闭上报）。 */
  function appsListHtml() {
    var d = OPS.apps.data || {};
    var items = appsFiltered();
    var q = str(OPS.apps.q).trim();
    if (!items.length) {
      var msg;
      if (q) msg = '无匹配应用';
      else if (d.enabled === false) msg = '该用户已关闭上报';
      else msg = '该用户暂未上报应用列表';
      return '<div class="adm-apps-empty">' + esc(msg) + '</div>';
    }
    var h = '';
    for (var i = 0; i < items.length; i++) h += appsRowHtml(items[i]);
    return h;
  }

  /* 只重渲染列表区（不重建整弹层，避免搜索框失焦）。 */
  function renderAppsList() {
    var box = $('admAppsList');
    if (box) box.innerHTML = appsListHtml();
  }

  /* 副信息行：共 N 个应用 · 更新于 ...；用户关闭上报时补红字提示。 */
  function appsMetaHtml() {
    var d = OPS.apps.data || {};
    var arr = (Object.prototype.toString.call(d.apps) === '[object Array]') ? d.apps : [];
    var count = (d.appCount !== undefined && d.appCount !== null) ? num(d.appCount) : arr.length;
    var h = '<div class="adm-apps-meta">共 ' + count + ' 个应用';
    var t = fmtTime(d.updatedAt);
    if (t && t !== '—') h += ' · 更新于 ' + esc(t);
    h += '</div>';
    if (d.enabled === false) h += '<div class="adm-apps-off">该用户已关闭上报</div>';
    return h;
  }

  /* 标题：昵称（@账号），缺省回退 #uid。 */
  function appsTitleHtml() {
    var d = OPS.apps.data || {};
    var uid = OPS.apps.uid;
    var nick = str(d.nickname);
    var uname = str(d.username);
    if (!nick && !uname) {
      var m = OPS.userMap[str(uid)] || {};
      nick = str(m.nickname);
      uname = str(m.username || m.account);
    }
    if (nick || uname) return esc(nick || uname) + (uname ? '（@' + esc(uname) + '）' : '');
    return '#' + esc(uid);
  }

  /* 完整重建弹层（读取 OPS.apps）并挂到 body；若已存在先移除，避免叠加。 */
  function renderAppsModal() {
    var old = $('admAppsModal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = OPS.apps;
    var metaHtml = st.loading ? '<div class="adm-apps-meta">加载中…</div>' : (st.error ? '' : appsMetaHtml());
    var listHtml = st.loading ? '<div class="adm-apps-empty">加载中…</div>'
      : (st.error ? '<div class="adm-apps-empty err">' + esc(st.error) + '</div>' : appsListHtml());
    var overlay = document.createElement('div');
    overlay.className = 'adm-apps-overlay';
    overlay.id = 'admAppsModal';
    overlay.setAttribute('onclick', "XTADMOPS.act('uAppsClose')");   /* 点遮罩空白处关闭 */
    overlay.innerHTML =
      '<div class="adm-apps-panel" onclick="event.stopPropagation()">' +
        '<div class="adm-apps-head">' +
          '<div class="adm-apps-title">' + appsTitleHtml() + '</div>' +
          '<button class="adm-apps-close" aria-label="关闭"' + oc("XTADMOPS.act('uAppsClose')") + '>×</button>' +
        '</div>' +
        '<div id="admAppsMeta">' + metaHtml + '</div>' +
        '<input class="adm-apps-search" id="admAppsSearch" placeholder="搜索应用名或包名" oninput="XTADMOPS.act(\'uAppsFilter\')">' +
        '<div class="adm-apps-list" id="admAppsList">' + listHtml + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  /* 入口：拉取某用户的已安装应用列表并弹层展示。 */
  function actUserApps(uid) {
    uid = str(uid);
    var old = $('admAppsModal');
    if (old && old.parentNode) old.parentNode.removeChild(old);   // 避免叠加
    OPS.apps = { uid: uid, data: null, q: '', loading: true, error: '' };
    renderAppsModal();
    return opsApi('/api/admin/users/' + encodeURIComponent(uid) + '/apps').then(function (d) {
      OPS.apps.data = d || {};
      OPS.apps.loading = false;
      OPS.apps.error = '';
      OPS.apps.q = '';
      renderAppsModal();
    }).catch(function (e) {
      if (handleErr(e, '加载失败，请稍后重试')) { appsClose(); return; }
      OPS.apps.loading = false;
      OPS.apps.error = (e && e.message) ? e.message : '加载失败，请稍后重试';
      renderAppsModal();
    });
  }

  /* 纯前端过滤（对已加载数据过滤，不再请求）。 */
  function appsApplyFilter() {
    var el = $('admAppsSearch');
    OPS.apps.q = str(el && el.value);
    renderAppsList();
  }

  /* 关闭弹层并复位状态。 */
  function appsClose() {
    var el = $('admAppsModal');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    OPS.apps = { uid: null, data: null, q: '', loading: false, error: '' };
  }

  /* =============================== 内容治理 =============================== */
  function contentSummaryHtml() {
    var s = OPS.content.summary;
    if (!s) return '<div class="adm-op-summaryline adm-op-muted">内容统计加载中…</div>';
    var labels = { moments: '动态', momentComments: '动态评论', notes: '笔记', board: '留言板', boardReplies: '留言回复' };
    var parts = [];
    var keys = ['moments', 'momentComments', 'notes', 'board', 'boardReplies'];
    for (var i = 0; i < keys.length; i++) {
      parts.push('<span class="adm-op-chip">' + esc(labels[keys[i]]) + ' ' + num(s[keys[i]]) + '</span>');
    }
    return '<div class="adm-op-summaryline">' + parts.join('') + '</div>';
  }

  function renderContentShell() {
    var host = $('admContentPanel');
    if (!host) return;
    var sec = CONTENT_SECTIONS[OPS.content.section] || CONTENT_SECTIONS.moments;
    var tabs = '';
    var order = ['moments', 'momentComments', 'notes', 'board', 'boardReplies'];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      tabs += '<button class="adm-op-subtab' + (OPS.content.section === k ? ' active' : '') + '"' +
        oc("XTADMOPS.act('cSec'," + jsq(k) + ")") + '>' + esc(CONTENT_SECTIONS[k].label) + '</button>';
    }
    var search = '';
    if (sec.q) {
      search = '<input class="adm-op-input" id="admContentSearch" placeholder="搜索关键词…" value="' + esc(OPS.content.q) + '"' +
        ' onkeydown="if(event.key===\'Enter\'){XTADMOPS.act(\'cSearch\')}">' +
        '<button class="btn btn-sm btn-primary"' + oc("XTADMOPS.act('cSearch')") + '>搜索</button>';
    }
    host.innerHTML =
      '<div class="adm-op-panelwrap">' +
        '<div class="adm-op-panelhead">' +
          '<div class="adm-op-subtabs">' + tabs + '</div>' +
          '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('cRefresh')") + '>刷新</button>' +
        '</div>' +
        '<div id="admContentSummary">' + contentSummaryHtml() + '</div>' +
        '<div class="adm-op-toolbar">' + search + '</div>' +
        '<div class="adm-op-list" id="admContentList"></div>' +
        '<div class="adm-op-pager" id="admContentPager"></div>' +
      '</div>';
  }

  function contentItemHtml(it) {
    it = it || {};
    var sec = CONTENT_SECTIONS[OPS.content.section] || CONTENT_SECTIONS.moments;
    var id = str(it.id);
    var primary = str(it[sec.primary] || it.content || it.title || '');
    var hidden = !!(it.hiddenAt || it.hidden_at || it.deletedAt || it.deleted_at);
    var author = str(it.nickname || it.nick_name || '');
    var time = fmtTime(it.createdAt || it.created_at);
    var toggleCmd = hidden ? 'cUnhide' : 'cHide';
    var toggleTxt = hidden ? '恢复' : '隐藏';
    var extra = '';
    if (OPS.content.section === 'notes') {
      extra = '<span class="adm-op-chip">' + esc(it.category || '未分类') + '</span>' +
        '<span class="adm-op-chip">' + esc(it.privacy || '') + '</span>';
    }
    return '<div class="adm-op-item" data-cid="' + esc(id) + '">' +
      '<div class="adm-op-item-head">' +
        '<span class="adm-op-item-who">' + esc(author || '匿名') + '</span>' +
        (hidden ? '<span class="adm-op-flag">已隐藏</span>' : '') +
        extra +
        '<span class="adm-op-item-time">' + esc(time) + '</span>' +
      '</div>' +
      '<div class="adm-op-item-body">' + (primary ? esc(primary) : '<span class="adm-op-muted">（无正文）</span>') + '</div>' +
      '<div class="adm-op-item-acts">' +
        '<button class="adm-op-btn"' + oc("XTADMOPS.act('" + toggleCmd + "'," + jsq(id) + ")") + '>' + toggleTxt + '</button>' +
        '<button class="adm-op-btn danger"' + oc("XTADMOPS.act('cDel'," + jsq(id) + ")") + '>删除</button>' +
        '<span class="adm-op-muted">#' + esc(id) + '</span>' +
      '</div>' +
    '</div>';
  }

  function renderContentList() {
    var box = $('admContentList');
    if (!box || !box.parentNode) return;   // 面板已被切换走
    if (OPS.content.loading) { box.innerHTML = emptyBox('加载中…'); renderContentPager(); return; }
    if (OPS.content.error) { box.innerHTML = errBox(OPS.content.error, 'cRefresh'); renderContentPager(); return; }
    if (!OPS.content.items.length) { box.innerHTML = emptyBox('暂无内容'); renderContentPager(); return; }
    var html = '';
    for (var i = 0; i < OPS.content.items.length; i++) html += contentItemHtml(OPS.content.items[i]);
    box.innerHTML = html;
    renderContentPager();
  }

  function renderContentPager() {
    var host = $('admContentPager');
    if (!host) return;
    var c = OPS.content;
    var page = Math.floor(c.offset / c.limit) + 1;
    var total = num(c.total);
    var pages = total ? Math.ceil(total / c.limit) : 0;
    var hasMore = pages ? (c.offset + c.limit < total) : (c.items.length >= c.limit);
    host.innerHTML =
      '<button class="btn btn-sm btn-secondary"' + (c.offset <= 0 ? ' disabled' : '') + oc("XTADMOPS.act('cPage',-1)") + '>上一页</button>' +
      '<span class="adm-op-pager-info">第 ' + page + ' 页 · 共 ' + (total || '—') + ' 条</span>' +
      '<button class="btn btn-sm btn-secondary"' + (!hasMore ? ' disabled' : '') + oc("XTADMOPS.act('cPage',1)") + '>下一页</button>';
  }

  function loadContentSummary() {
    return opsApi('/api/admin/content/summary').then(function (d) {
      OPS.content.summary = d || {};
      var host = $('admContentSummary');
      if (host) host.innerHTML = contentSummaryHtml();
    }).catch(function () { /* 静默 */ });
  }

  function loadContent() {
    var sec = CONTENT_SECTIONS[OPS.content.section] || CONTENT_SECTIONS.moments;
    if (!$('admContentList')) renderContentShell();   // 确保面板骨架存在（onTab 直达时）
    OPS.content.loading = true;
    OPS.content.error = '';
    renderContentList();
    if (!OPS.content.summary) loadContentSummary();
    var url = sec.url + '?offset=' + OPS.content.offset + '&limit=' + OPS.content.limit;
    if (sec.q && OPS.content.q) url += '&q=' + encodeURIComponent(OPS.content.q);
    return opsApi(url).then(function (d) {
      OPS.content.items = toList(d, ['items', 'data', 'list']);
      OPS.content.total = num(d && d.total);
      OPS.content.loading = false;
      renderContentList();
    }).catch(function (e) {
      OPS.content.loading = false;
      OPS.content.items = [];
      if (!handleErr(e, '')) OPS.content.error = (e && e.message) ? e.message : '内容加载失败，请稍后重试';
      renderContentList();
    });
  }

  function contentActToggle(id, hide) {
    var sec = CONTENT_SECTIONS[OPS.content.section] || CONTENT_SECTIONS.moments;
    var url = sec.base + '/' + encodeURIComponent(str(id)) + (hide ? '/hide' : '/unhide');
    opsApi(url, { method: 'POST' }).then(function () {
      toast(hide ? '已隐藏' : '已恢复', 'success');
      loadContent();
    }).catch(function (e) { handleErr(e, '操作失败，请稍后重试'); });
  }

  function contentActDelete(id) {
    var sec = CONTENT_SECTIONS[OPS.content.section] || CONTENT_SECTIONS.moments;
    uiConfirm('确定永久删除这条内容？此操作不可恢复。', '删除').then(function (ok) {
      if (!ok) return;
      return opsApi(sec.base + '/' + encodeURIComponent(str(id)), { method: 'DELETE' }).then(function () {
        toast('已删除', 'success');
        loadContent();
      }).catch(function (e) { handleErr(e, '删除失败，请稍后重试'); });
    });
  }

  /* =============================== 公告 =============================== */
  function renderAnn() {
    var host = $('admAnnPanel');
    if (!host) return;
    var s = OPS.ann;
    var titleVal = '';
    var contentVal = '';
    var submitTxt = s.editId ? '保存修改' : '发布公告';
    var cancel = s.editId ? '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('aCancel')") + '>取消编辑</button>' : '';
    var listHtml = '';
    if (s.loading) listHtml = emptyBox('加载中…');
    else if (s.error) listHtml = errBox(s.error, 'aRefresh');
    else if (!s.items.length) listHtml = emptyBox('暂无公告');
    else {
      for (var i = 0; i < s.items.length; i++) {
        var a = s.items[i] || {};
        var active = !!a.active;
        listHtml += '<div class="adm-ann-item' + (s.editId !== null && str(s.editId) === str(a.id) ? ' editing' : '') + '">' +
          '<div class="adm-ann-head">' +
            '<span class="adm-ann-title">' + esc(a.title || '（无标题）') + '</span>' +
            '<span class="adm-op-flag ' + (active ? 'on' : 'off') + '">' + (active ? '已上线' : '已下线') + '</span>' +
            '<span class="adm-op-item-time">' + esc(fmtTime(a.createdAt || a.created_at)) + '</span>' +
          '</div>' +
          '<div class="adm-ann-body">' + esc(a.content || '') + '</div>' +
          '<div class="adm-op-item-acts">' +
            '<button class="adm-op-btn"' + oc("XTADMOPS.act('aEdit'," + jsq(a.id) + ")") + '>编辑</button>' +
            '<button class="adm-op-btn"' + oc("XTADMOPS.act('aToggle'," + jsq(a.id) + ")") + '>' + (active ? '下线' : '上线') + '</button>' +
            '<button class="adm-op-btn danger"' + oc("XTADMOPS.act('aDel'," + jsq(a.id) + ")") + '>删除</button>' +
          '</div>' +
        '</div>';
      }
    }
    host.innerHTML =
      '<div class="adm-op-panelwrap">' +
        '<div class="adm-op-panelhead"><div class="adm-op-panel-title">公告管理</div>' +
          '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('aRefresh')") + '>刷新</button></div>' +
        '<div class="adm-ann-form">' +
          '<input class="adm-op-input" id="admAnnTitle" maxlength="80" placeholder="公告标题（可留空，≤80 字）" value="' + esc(titleVal) + '">' +
          '<textarea class="adm-op-textarea" id="admAnnContent" maxlength="2000" rows="3" placeholder="公告内容（1~2000 字）"' +
            ' oninput="XTADMOPS.act(\'aCount\')"></textarea>' +
          '<div class="adm-ann-form-foot">' +
            '<span class="adm-op-muted" id="admAnnCount">0 / 2000</span>' +
            '<div class="adm-op-form-actions">' + cancel +
              '<button class="btn btn-sm btn-primary"' + oc("XTADMOPS.act('aSubmit')") + '>' + submitTxt + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="adm-op-list">' + listHtml + '</div>' +
      '</div>';
    // 编辑态：回填标题/内容
    if (s.editId !== null) {
      var cur = null;
      for (var k = 0; k < s.items.length; k++) { if (str(s.items[k].id) === str(s.editId)) { cur = s.items[k]; break; } }
      if (cur) {
        var tEl = $('admAnnTitle'); if (tEl) tEl.value = str(cur.title || '');
        var cEl = $('admAnnContent'); if (cEl) cEl.value = str(cur.content || '');
        updateAnnCount();
      }
    }
    paint();
  }

  function updateAnnCount() {
    var cEl = $('admAnnContent');
    var nEl = $('admAnnCount');
    if (cEl && nEl) nEl.textContent = str(cEl.value || '').length + ' / 2000';
  }

  function normalizeAnn(a) {
    a = a || {};
    return {
      id: a.id,
      title: str(a.title || ''),
      content: str(a.content || ''),
      active: !!a.active,
      createdAt: str(a.createdAt || a.created_at || ''),
      updatedAt: str(a.updatedAt || a.updated_at || '')
    };
  }

  function loadAnn() {
    OPS.ann.loading = true;
    OPS.ann.error = '';
    renderAnn();
    return opsApi('/api/admin/announcements').then(function (d) {
      var raw = toList(d, ['items', 'announcements', 'data']);
      var out = [];
      for (var i = 0; i < raw.length; i++) out.push(normalizeAnn(raw[i]));
      OPS.ann.items = out;
      OPS.ann.loading = false;
      renderAnn();
    }).catch(function (e) {
      OPS.ann.loading = false;
      OPS.ann.items = [];
      if (!handleErr(e, '')) OPS.ann.error = (e && e.message) ? e.message : '公告加载失败，请稍后重试';
      renderAnn();
    });
  }

  function annSubmit() {
    var tEl = $('admAnnTitle');
    var cEl = $('admAnnContent');
    var title = str(tEl && tEl.value).trim();
    var content = str(cEl && cEl.value).trim();
    if (!content) { toast('公告内容不能为空', 'warning'); return; }
    if (content.length > 2000) { toast('公告内容超过 2000 字', 'warning'); return; }
    if (title.length > 80) { toast('标题超过 80 字', 'warning'); return; }
    var body = { title: title, content: content };
    var isEdit = (OPS.ann.editId !== null);
    var req = isEdit
      ? opsApi('/api/admin/announcements/' + encodeURIComponent(str(OPS.ann.editId)), { method: 'PATCH', body: body })
      : opsApi('/api/admin/announcements', { method: 'POST', body: body });
    req.then(function () {
      toast(isEdit ? '公告已更新' : '公告已发布', 'success');
      OPS.ann.editId = null;
      loadAnn();
    }).catch(function (e) {
      if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); return; }
      toast((e && e.message) ? e.message : '提交失败，请稍后重试', 'error');
    });
  }

  function annToggle(id) {
    var cur = null;
    for (var i = 0; i < OPS.ann.items.length; i++) { if (str(OPS.ann.items[i].id) === str(id)) { cur = OPS.ann.items[i]; break; } }
    if (!cur) return;
    opsApi('/api/admin/announcements/' + encodeURIComponent(str(id)), {
      method: 'PATCH', body: { active: !cur.active }
    }).then(function () {
      toast(cur.active ? '已下线' : '已上线', 'success');
      loadAnn();
    }).catch(function (e) { handleErr(e, '操作失败，请稍后重试'); });
  }

  function annDelete(id) {
    uiConfirm('确定删除该公告？此操作不可恢复。', '删除').then(function (ok) {
      if (!ok) return;
      return opsApi('/api/admin/announcements/' + encodeURIComponent(str(id)), { method: 'DELETE' }).then(function () {
        toast('已删除', 'success');
        if (str(OPS.ann.editId) === str(id)) OPS.ann.editId = null;
        loadAnn();
      }).catch(function (e) { handleErr(e, '删除失败，请稍后重试'); });
    });
  }

  /* =============================== 群组 =============================== */
  function renderGroups() {
    var host = $('admGroupPanel');
    if (!host) return;
    var g = OPS.groups;
    var listHtml = '';
    if (g.loading) listHtml = emptyBox('加载中…');
    else if (g.error) listHtml = errBox(g.error, 'gRefresh');
    else if (!g.items.length) listHtml = emptyBox('暂无群组');
    else {
      for (var i = 0; i < g.items.length; i++) {
        var it = g.items[i] || {};
        var gid = str(it.id);
        var open = !!g.open[gid];
        listHtml += '<div class="adm-grp-item" data-gid="' + esc(gid) + '">' +
          '<div class="adm-grp-head">' +
            '<span class="adm-grp-name">' + esc(it.name || ('群#' + gid)) + '</span>' +
            '<span class="adm-op-chip">群主 ' + esc(it.ownerNickname || it.owner_nickname || '—') + '</span>' +
            '<span class="adm-op-chip">' + num(it.memberCount !== undefined ? it.memberCount : it.member_count) + ' 人</span>' +
          '</div>' +
          '<div class="adm-grp-ann">' + (str(it.announcement) ? esc(it.announcement) : '<span class="adm-op-muted">（无群公告）</span>') + '</div>' +
          '<div class="adm-op-item-acts">' +
            '<button class="adm-op-btn"' + oc("XTADMOPS.act('gToggle'," + jsq(gid) + ")") + '>' + (open ? '收起成员' : '展开成员') + '</button>' +
            '<button class="adm-op-btn"' + oc("XTADMOPS.act('gEditName'," + jsq(gid) + ")") + '>改群名</button>' +
            '<button class="adm-op-btn"' + oc("XTADMOPS.act('gEditAnn'," + jsq(gid) + ")") + '>改公告</button>' +
            '<button class="adm-op-btn danger"' + oc("XTADMOPS.act('gDismiss'," + jsq(gid) + ")") + '>解散群</button>' +
          '</div>' +
          '<div class="adm-grp-members" id="admGrpMembers_' + esc(gid) + '" style="display:' + (open ? 'block' : 'none') + '"></div>' +
        '</div>';
      }
    }
    host.innerHTML =
      '<div class="adm-op-panelwrap">' +
        '<div class="adm-op-panelhead"><div class="adm-op-subtabs">' +
          '<input class="adm-op-input" id="admGroupSearch" placeholder="搜索群名 / 群主…" value="' + esc(g.q) + '"' +
            ' onkeydown="if(event.key===\'Enter\'){XTADMOPS.act(\'gSearch\')}">' +
          '<button class="btn btn-sm btn-primary"' + oc("XTADMOPS.act('gSearch')") + '>搜索</button>' +
        '</div>' +
        '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('gRefresh')") + '>刷新</button></div>' +
        '<div class="adm-op-list">' + listHtml + '</div>' +
        '<div class="adm-op-pager" id="admGroupPager"></div>' +
      '</div>';
    renderGroupPager();
    // 重新渲染后回填已展开群的成员
    for (var k in g.open) {
      if (g.open[k]) loadGroupMembers(k);
    }
    paint();
  }

  function renderGroupPager() {
    var host = $('admGroupPager');
    if (!host) return;
    var g = OPS.groups;
    var page = Math.floor(g.offset / g.limit) + 1;
    var total = num(g.total);
    var hasMore = (num(g.total) ? (g.offset + g.limit < total) : (g.items.length >= g.limit));
    host.innerHTML =
      '<button class="btn btn-sm btn-secondary"' + (g.offset <= 0 ? ' disabled' : '') + oc("XTADMOPS.act('gPage',-1)") + '>上一页</button>' +
      '<span class="adm-op-pager-info">第 ' + page + ' 页 · 共 ' + (total || '—') + ' 条</span>' +
      '<button class="btn btn-sm btn-secondary"' + (!hasMore ? ' disabled' : '') + oc("XTADMOPS.act('gPage',1)") + '>下一页</button>';
  }

  function loadGroups() {
    OPS.groups.loading = true;
    OPS.groups.error = '';
    renderGroups();
    var url = '/api/admin/groups?offset=' + OPS.groups.offset + '&limit=' + OPS.groups.limit;
    if (OPS.groups.q) url += '&q=' + encodeURIComponent(OPS.groups.q);
    return opsApi(url).then(function (d) {
      OPS.groups.items = toList(d, ['items', 'data', 'list']);
      OPS.groups.total = num(d && d.total);
      OPS.groups.loading = false;
      renderGroups();
    }).catch(function (e) {
      OPS.groups.loading = false;
      OPS.groups.items = [];
      if (!handleErr(e, '')) OPS.groups.error = (e && e.message) ? e.message : '群组加载失败，请稍后重试';
      renderGroups();
    });
  }

  function loadGroupMembers(gid) {
    var box = $('admGrpMembers_' + str(gid));
    if (!box) return;
    box.innerHTML = '<div class="adm-op-muted">成员加载中…</div>';
    opsApi('/api/admin/groups/' + encodeURIComponent(str(gid)) + '/members').then(function (d) {
      var items = toList(d, ['items', 'data', 'list']);
      if (!items.length) { box.innerHTML = '<div class="adm-op-muted">该群暂无成员</div>'; return; }
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var m = items[i] || {};
        html += '<div class="adm-grp-member">' +
          '<span class="adm-grp-mname">' + esc(m.nickname || ('#' + str(m.id))) + '</span>' +
          '<span class="adm-op-chip">' + esc(m.role || 'member') + '</span>' +
          '<span class="adm-op-muted">' + esc(fmtTime(m.joinedAt || m.joined_at)) + '</span>' +
          '<button class="adm-op-btn danger"' + oc("XTADMOPS.act('gDelMember'," + jsq(gid) + "," + jsq(m.id) + ")") + '>移除</button>' +
        '</div>';
      }
      box.innerHTML = html;
    }).catch(function (e) {
      if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); return; }
      box.innerHTML = errBox((e && e.message) ? e.message : '成员加载失败');
    });
  }

  function groupEditField(gid, field, label) {
    var cur = null;
    for (var i = 0; i < OPS.groups.items.length; i++) { if (str(OPS.groups.items[i].id) === str(gid)) { cur = OPS.groups.items[i]; break; } }
    var def = cur ? str(cur[field] || '') : '';
    uiPrompt('输入新的' + label + '：', def).then(function (v) {
      if (v === null) return;
      var body = {};
      body[field] = str(v);
      opsApi('/api/admin/groups/' + encodeURIComponent(str(gid)), { method: 'PATCH', body: body }).then(function () {
        toast('已更新', 'success');
        loadGroups();
      }).catch(function (e) { handleErr(e, '更新失败，请稍后重试'); });
    });
  }

  function groupRemoveMember(gid, uid) {
    uiConfirm('确定将该成员移出群？', '移除').then(function (ok) {
      if (!ok) return;
      return opsApi('/api/admin/groups/' + encodeURIComponent(str(gid)) + '/members/' + encodeURIComponent(str(uid)), { method: 'DELETE' }).then(function () {
        toast('已移除成员', 'success');
        loadGroupMembers(gid);
      }).catch(function (e) { handleErr(e, '移除失败，请稍后重试'); });
    });
  }

  function groupDismiss(gid) {
    var cur = null;
    for (var i = 0; i < OPS.groups.items.length; i++) { if (str(OPS.groups.items[i].id) === str(gid)) { cur = OPS.groups.items[i]; break; } }
    var name = cur ? str(cur.name || '') : '';
    var msg = '解散群不可恢复！请手动输入群名以确认' + (name ? ('（' + name + '）') : '') + '：';
    uiPrompt(msg, '').then(function (typed) {
      if (typed === null) return;
      if (name && str(typed).trim() !== name) { toast('群名不一致，已取消', 'error'); return; }
      if (!name && !str(typed).trim()) { toast('请先输入群名确认', 'warning'); return; }
      return uiConfirm('再次确认：解散群「' + (name || ('#' + str(gid))) + '」？', '解散').then(function (ok) {
        if (!ok) return;
        return opsApi('/api/admin/groups/' + encodeURIComponent(str(gid)) + '/dismiss', { method: 'POST' }).then(function () {
          toast('已解散群', 'success');
          loadGroups();
        }).catch(function (e) { handleErr(e, '解散失败，请稍后重试'); });
      });
    });
  }

  /* =============================== 私聊 =============================== */
  function myAdminId() {
    try { if (window.CURRENT_USER && window.CURRENT_USER.id) return str(window.CURRENT_USER.id); } catch (e) { /* 忽略 */ }
    try { var a = JSON.parse(localStorage.getItem('study_workbench_auth') || '{}'); if (a && a.id) return str(a.id); } catch (e) { /* 忽略 */ }
    return '';
  }

  function renderChat() {
    var host = $('admChatPanel');
    if (!host) return;
    var c = OPS.chat;
    if (c.active) { renderChatStream(); return; }

    var body = '';
    if (c.search !== null) {
      // 展示搜索结果
      var hits = c.search.items || [];
      body = '<div class="adm-op-subhead">搜索「' + esc(c.search.q) + '」命中 ' + hits.length + ' 条 ' +
        '<a class="adm-op-retry" href="javascript:void(0)"' + oc("XTADMOPS.act('chClearSearch')") + '>返回会话列表</a></div>';
      if (!hits.length) body += emptyBox('没有匹配的消息');
      else {
        for (var i = 0; i < hits.length; i++) {
          var m = hits[i] || {};
          body += chatSearchItemHtml(m);
        }
      }
    } else {
      if (c.loading) body = emptyBox('加载中…');
      else if (c.error) body = errBox(c.error, 'chRefresh');
      else if (!c.threads.length) body = emptyBox('暂无会话');
      else {
        for (var j = 0; j < c.threads.length; j++) {
          var t = c.threads[j] || {};
          body += '<div class="adm-chat-thread">' +
            '<div class="adm-chat-thread-main"' + oc("XTADMOPS.act('chOpen'," + jsq(t.aId) + "," + jsq(t.bId) + ")") + '>' +
              '<div class="adm-chat-thread-names">' + esc(t.aNickname || ('#' + str(t.aId))) + ' ⇄ ' + esc(t.bNickname || ('#' + str(t.bId))) + '</div>' +
              '<div class="adm-op-muted">最后 ' + esc(fmtTime(t.lastAt || t.last_at)) + '</div>' +
            '</div>' +
            '<span class="adm-op-chip">' + num(t.count) + ' 条</span>' +
          '</div>';
        }
      }
    }

    host.innerHTML =
      '<div class="adm-op-panelwrap">' +
        '<div class="adm-op-panelhead">' +
          '<div class="adm-op-subtabs">' +
            '<input class="adm-op-input" id="admChatSearch" placeholder="搜索私聊消息…" value="' + esc(c.search !== null ? c.search.q : c.q) + '"' +
              ' onkeydown="if(event.key===\'Enter\'){XTADMOPS.act(\'chSearch\')}">' +
            '<button class="btn btn-sm btn-primary"' + oc("XTADMOPS.act('chSearch')") + '>搜索</button>' +
          '</div>' +
          '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('chRefresh')") + '>刷新</button>' +
        '</div>' +
        '<div class="adm-op-list">' + body + '</div>' +
        '<div class="adm-op-pager" id="admChatPager"></div>' +
      '</div>';
    renderChatPager();
    paint();
  }

  function chatSearchItemHtml(m) {
    m = m || {};
    var id = str(m.id);
    return '<div class="adm-op-item">' +
      '<div class="adm-op-item-head">' +
        '<span class="adm-op-item-who">' + esc(m.senderNickname || m.sender_nickname || ('#' + str(m.senderId || m.sender_id))) + '</span>' +
        '<span class="adm-op-item-time">' + esc(fmtTime(m.createdAt || m.created_at)) + '</span>' +
      '</div>' +
      '<div class="adm-op-item-body">' + chatBodyHtml(m) + '</div>' +
      '<div class="adm-op-item-acts">' +
        '<button class="adm-op-btn danger"' + oc("XTADMOPS.act('chDelMsg'," + jsq(id) + ")") + '>删除</button>' +
      '</div>' +
    '</div>';
  }

  function renderChatPager() {
    var host = $('admChatPager');
    if (!host) return;
    if (OPS.chat.active || OPS.chat.search !== null) { host.innerHTML = ''; return; }
    var c = OPS.chat;
    var page = Math.floor(c.offset / c.limit) + 1;
    var hasMore = (num(c.total) ? (c.offset + c.limit < c.total) : (c.threads.length >= c.limit));
    host.innerHTML =
      '<button class="btn btn-sm btn-secondary"' + (c.offset <= 0 ? ' disabled' : '') + oc("XTADMOPS.act('chPage',-1)") + '>上一页</button>' +
      '<span class="adm-op-pager-info">第 ' + page + ' 页</span>' +
      '<button class="btn btn-sm btn-secondary"' + (!hasMore ? ' disabled' : '') + oc("XTADMOPS.act('chPage',1)") + '>下一页</button>';
  }

  function loadChat() {
    OPS.chat.loading = true;
    OPS.chat.error = '';
    OPS.chat.search = null;
    OPS.chat.active = null;
    renderChat();
    return opsApi('/api/admin/chat/threads?offset=' + OPS.chat.offset + '&limit=' + OPS.chat.limit).then(function (d) {
      OPS.chat.threads = toList(d, ['items', 'data', 'list']);
      OPS.chat.total = num(d && d.total);
      OPS.chat.loading = false;
      renderChat();
    }).catch(function (e) {
      OPS.chat.loading = false;
      OPS.chat.threads = [];
      if (!handleErr(e, '')) OPS.chat.error = (e && e.message) ? e.message : '会话加载失败，请稍后重试';
      renderChat();
    });
  }

  function chatKindLabel(m) {
    var k = str(m.kind || 'text');
    if (k === 'text') return null;
    if (k === 'image' || k === 'img') return '[图片]';
    if (k === 'voice' || k === 'audio') return '[语音' + (m.duration ? (' ' + num(m.duration) + 's') : '') + ']';
    if (k === 'location' || k === 'loc') return '[位置]';
    if (k === 'live' || k === 'live-location' || k === 'realtime' || k === 'liveLocation') return '[实时位置]';
    return '[' + esc(k) + ']';
  }

  function chatBodyHtml(m) {
    var label = chatKindLabel(m);
    if (label) return '<span class="adm-chat-kind">' + label + '</span>';
    return esc(m.content || '');
  }

  function renderChatStream() {
    var host = $('admChatPanel');
    if (!host) return;
    var c = OPS.chat;
    var th = c.active;
    var head = '<div class="adm-op-subhead">' +
      '<a class="adm-op-retry" href="javascript:void(0)"' + oc("XTADMOPS.act('chBack')") + '>← 返回</a>' +
      '<span class="adm-chat-thread-names">' + esc(th.aNickname || ('#' + str(th.aId))) + ' ⇄ ' + esc(th.bNickname || ('#' + str(th.bId))) + '</span>' +
    '</div>';
    var stream = '';
    if (c.msgsLoading) stream = emptyBox('加载中…');
    else if (c.msgsError) stream = errBox(c.msgsError, 'chReload');
    else if (!c.msgs.length) stream = emptyBox('暂无消息');
    else {
      var me = myAdminId();
      for (var i = 0; i < c.msgs.length; i++) {
        var m = c.msgs[i] || {};
        var mine = (me && str(m.senderId || m.sender_id) === me);
        var label = chatKindLabel(m);
        stream += '<div class="adm-chat-line ' + (mine ? 'right' : 'left') + '">' +
          '<div class="adm-chat-bubble">' +
            '<div class="adm-chat-who">' + esc(m.senderNickname || m.sender_nickname || ('#' + str(m.senderId || m.sender_id))) + '</div>' +
            '<div class="adm-chat-text">' + (label ? label : esc(m.content || '')) + '</div>' +
            '<div class="adm-chat-time">' + esc(fmtTime(m.createdAt || m.created_at)) + '</div>' +
            '<button class="adm-op-btn danger adm-chat-del"' + oc("XTADMOPS.act('chDelMsg'," + jsq(m.id) + ")") + '>删除</button>' +
          '</div>' +
        '</div>';
      }
    }
    host.innerHTML =
      '<div class="adm-op-panelwrap">' + head +
        '<div class="adm-chat-stream">' + stream + '</div>' +
      '</div>';
    var s = host.querySelector('.adm-chat-stream');
    if (s) s.scrollTop = s.scrollHeight;
  }

  function loadThreadMessages() {
    var c = OPS.chat;
    if (!c.active) return;
    c.msgsLoading = true;
    c.msgsError = '';
    renderChatStream();
    var url = '/api/admin/chat/thread/' + encodeURIComponent(str(c.active.aId)) + '/' +
      encodeURIComponent(str(c.active.bId)) + '/messages?beforeId=0&limit=50';
    return opsApi(url).then(function (d) {
      c.msgs = toList(d, ['items', 'data', 'list']);
      c.msgsLoading = false;
      renderChatStream();
    }).catch(function (e) {
      c.msgsLoading = false;
      c.msgs = [];
      if (!handleErr(e, '')) c.msgsError = (e && e.message) ? e.message : '消息加载失败，请稍后重试';
      renderChatStream();
    });
  }

  function chatSearch() {
    var el = $('admChatSearch');
    var q = str(el && el.value).trim();
    if (!q) { toast('请输入搜索关键词', 'warning'); return; }
    OPS.chat.active = null;
    OPS.chat.search = { q: q, items: [], loading: true };
    renderChat();
    opsApi('/api/admin/chat/search?q=' + encodeURIComponent(q) + '&limit=50').then(function (d) {
      OPS.chat.search.items = toList(d, ['items', 'data', 'list']);
      renderChat();
    }).catch(function (e) {
      if (e && (e.isForbidden || e.status === 401)) { handleErr(e, ''); return; }
      OPS.chat.search.items = [];
      toast((e && e.message) ? e.message : '搜索失败，请稍后重试', 'error');
      renderChat();
    });
  }

  function chatDeleteMsg(mid) {
    uiConfirm('确定删除这条私聊消息？此操作不可恢复。', '删除').then(function (ok) {
      if (!ok) return;
      return opsApi('/api/admin/chat/messages/' + encodeURIComponent(str(mid)), { method: 'DELETE' }).then(function () {
        toast('已删除', 'success');
        if (OPS.chat.active) loadThreadMessages();
        else if (OPS.chat.search !== null) chatSearch();
      }).catch(function (e) { handleErr(e, '删除失败，请稍后重试'); });
    });
  }

  /* =============================== 审计日志 =============================== */
  function renderLogs() {
    var host = $('admLogPanel');
    if (!host) return;
    var l = OPS.logs;
    var body = '';
    if (l.loading) body = emptyBox('加载中…');
    else if (l.error) body = errBox(l.error, 'lRefresh');
    else if (!l.items.length) body = emptyBox('暂无审计日志');
    else {
      body = '<div class="adm-log-tablewrap"><table class="adm-log-table"><thead><tr>' +
        '<th>时间</th><th>管理员</th><th>动作</th><th>目标</th><th>详情</th>' +
        '</tr></thead><tbody>';
      for (var i = 0; i < l.items.length; i++) {
        var r = l.items[i] || {};
        body += '<tr>' +
          '<td>' + esc(fmtTime(r.createdAt || r.created_at)) + '</td>' +
          '<td>' + esc(r.adminNickname || r.admin_nickname || ('#' + str(r.adminId || r.admin_id))) + '</td>' +
          '<td>' + esc(r.action || '') + '</td>' +
          '<td>' + esc((str(r.targetType || r.target_type) ? (str(r.targetType || r.target_type) + '#' + str(r.targetId || r.target_id)) : '—')) + '</td>' +
          '<td class="adm-log-detail">' + esc(r.detail || '') + '</td>' +
        '</tr>';
      }
      body += '</tbody></table></div>';
    }
    host.innerHTML =
      '<div class="adm-op-panelwrap">' +
        '<div class="adm-op-panelhead"><div class="adm-op-panel-title">审计日志</div>' +
          '<button class="btn btn-sm btn-secondary"' + oc("XTADMOPS.act('lRefresh')") + '>刷新</button></div>' +
        body +
        '<div class="adm-op-pager" id="admLogPager"></div>' +
      '</div>';
    renderLogPager();
  }

  function renderLogPager() {
    var host = $('admLogPager');
    if (!host) return;
    var l = OPS.logs;
    var page = Math.floor(l.offset / l.limit) + 1;
    var hasMore = (num(l.total) ? (l.offset + l.limit < l.total) : (l.items.length >= l.limit));
    host.innerHTML =
      '<button class="btn btn-sm btn-secondary"' + (l.offset <= 0 ? ' disabled' : '') + oc("XTADMOPS.act('lPage',-1)") + '>上一页</button>' +
      '<span class="adm-op-pager-info">第 ' + page + ' 页 · 共 ' + (num(l.total) || '—') + ' 条</span>' +
      '<button class="btn btn-sm btn-secondary"' + (!hasMore ? ' disabled' : '') + oc("XTADMOPS.act('lPage',1)") + '>下一页</button>';
  }

  function loadLogs() {
    OPS.logs.loading = true;
    OPS.logs.error = '';
    renderLogs();
    return opsApi('/api/admin/logs?offset=' + OPS.logs.offset + '&limit=' + OPS.logs.limit).then(function (d) {
      OPS.logs.items = toList(d, ['items', 'data', 'list']);
      OPS.logs.total = num(d && d.total);
      OPS.logs.loading = false;
      renderLogs();
    }).catch(function (e) {
      OPS.logs.loading = false;
      OPS.logs.items = [];
      if (!handleErr(e, '')) OPS.logs.error = (e && e.message) ? e.message : '日志加载失败，请稍后重试';
      renderLogs();
    });
  }

  /* =============================== tab 分发 =============================== */
  function detectTab() {
    var el = document.querySelector('.adm-tab.active');
    if (!el || !el.id) return OPS.activeTab;
    var map = {
      admTabUsers: 'users', admTabOnline: 'online', admTabFeedback: 'feedback', admTabDevices: 'devices',
      admTabContent: 'content', admTabAnn: 'announcements', admTabGroup: 'groups', admTabChat: 'chat', admTabLog: 'logs'
    };
    return map[el.id] || OPS.activeTab;
  }

  function loadTab(tab) {
    if (tab === 'content') return loadContent();
    if (tab === 'announcements') return loadAnn();
    if (tab === 'groups') return loadGroups();
    if (tab === 'chat') return loadChat();
    if (tab === 'logs') return loadLogs();
  }

  function openThread(aId, bId) {
    var th = { aId: aId, bId: bId };
    for (var i = 0; i < OPS.chat.threads.length; i++) {
      var t = OPS.chat.threads[i] || {};
      if (str(t.aId) === str(aId) && str(t.bId) === str(bId)) { th = t; break; }
    }
    OPS.chat.search = null;
    OPS.chat.active = th;
    return loadThreadMessages();
  }

  /* =============================== 命令分发（供内联 onclick 调用） =============================== */
  function act(cmd) {
    var a = arguments[1];
    var b = arguments[2];
    try {
      switch (cmd) {
        case 'vis': return toggleVisibility();
        case 'uBan': return actUserBan(a);
        case 'uMute': return actUserMute(a);
        case 'uKick': return actUserKick(a);
        case 'uPwd': return actUserPwd(a);
        case 'uProfile': return actUserProfile(a);
        case 'uProfileSave': return actUserProfileSave(a);
        case 'uSummary': return actUserSummary(a);
        case 'uApps': return actUserApps(a);
        case 'uAppsFilter': return appsApplyFilter();
        case 'uAppsClose': return appsClose();
        case 'uDelete': return actUserDelete(a);
        case 'cSec': OPS.content.section = a; OPS.content.offset = 0; OPS.content.q = ''; renderContentShell(); return loadContent();
        case 'cSearch': { var cEl = $('admContentSearch'); OPS.content.q = str(cEl && cEl.value).trim(); OPS.content.offset = 0; return loadContent(); }
        case 'cRefresh': return loadContent();
        case 'cHide': return contentActToggle(a, true);
        case 'cUnhide': return contentActToggle(a, false);
        case 'cDel': return contentActDelete(a);
        case 'cPage': OPS.content.offset = Math.max(0, OPS.content.offset + num(a) * OPS.content.limit); return loadContent();
        case 'aCount': return updateAnnCount();
        case 'aSubmit': return annSubmit();
        case 'aEdit': OPS.ann.editId = a; renderAnn(); return;
        case 'aCancel': OPS.ann.editId = null; renderAnn(); return;
        case 'aToggle': return annToggle(a);
        case 'aDel': return annDelete(a);
        case 'aRefresh': return loadAnn();
        case 'gSearch': { var gEl = $('admGroupSearch'); OPS.groups.q = str(gEl && gEl.value).trim(); OPS.groups.offset = 0; return loadGroups(); }
        case 'gRefresh': return loadGroups();
        case 'gToggle': OPS.groups.open[str(a)] = !OPS.groups.open[str(a)]; renderGroups(); return;
        case 'gEditName': return groupEditField(a, 'name', '群名');
        case 'gEditAnn': return groupEditField(a, 'announcement', '群公告');
        case 'gDelMember': return groupRemoveMember(a, b);
        case 'gDismiss': return groupDismiss(a);
        case 'gPage': OPS.groups.offset = Math.max(0, OPS.groups.offset + num(a) * OPS.groups.limit); return loadGroups();
        case 'chOpen': return openThread(a, b);
        case 'chBack': OPS.chat.active = null; OPS.chat.search = null; renderChat(); return;
        case 'chSearch': return chatSearch();
        case 'chClearSearch': OPS.chat.search = null; renderChat(); return;
        case 'chDelMsg': return chatDeleteMsg(a);
        case 'chRefresh': return loadChat();
        case 'chReload': return loadThreadMessages();
        case 'chPage': OPS.chat.offset = Math.max(0, OPS.chat.offset + num(a) * OPS.chat.limit); return loadChat();
        case 'lPage': OPS.logs.offset = Math.max(0, OPS.logs.offset + num(a) * OPS.logs.limit); return loadLogs();
        case 'lRefresh': return loadLogs();
        default: return;
      }
    } catch (e) {
      toast('操作失败，请刷新后重试', 'error');
    }
  }

  /* =============================== 包装 admRefresh + DOM 观察 =============================== */
  function wrapRefresh() {
    if (typeof window.admRefresh !== 'function' || window.admRefresh.__xtadmops) return;
    var orig = window.admRefresh;
    var wrapped = function () {
      var tab = detectTab();
      OPS.activeTab = tab;
      if (tab === 'content' || tab === 'announcements' || tab === 'groups' || tab === 'chat' || tab === 'logs') {
        loadTab(tab);
        return;
      }
      var r = orig.apply(this, arguments);
      setTimeout(injectRowActions, 0);
      return r;
    };
    wrapped.__xtadmops = true;
    wrapped.__orig = orig;
    window.admRefresh = wrapped;
  }

  function observeUserList() {
    if (typeof MutationObserver === 'undefined') return;
    var box = $('admUserList');
    if (!box) return;
    try {
      var mo = new MutationObserver(function () { injectRowActions(); });
      mo.observe(box, { childList: true, subtree: true });
    } catch (e) { /* 忽略 */ }
  }

  /* =============================== R170-E 列表导航 + 子页 =============================== */
  /* 主页 = 概览卡片 + 工具条 + 9 项模块列表；点击任一项进入子页（子页顶栏：返回/标题/刷新）。
     纯 JS 视图切换（root 上切 adm-home / adm-sub 类），不碰 history，规避返回死循环红线。
     原 tab 条与全部面板 DOM 保留不动，仅由 CSS 控制显隐——admSwitchTab/syncTabs 原逻辑零改动。 */
  var NAV_ITEMS = [
    { tab: 'users', title: '全部用户', desc: '封禁 / 禁言 / 踢下线 / 重置密码 / 改资料 / 彻底删除' },
    { tab: 'online', title: '在线用户', desc: '当前在线名单' },
    { tab: 'feedback', title: '用户反馈', desc: '查看并回复用户反馈' },
    { tab: 'devices', title: '设备统计', desc: '机型 / 系统版本 / 活跃分布' },
    { tab: 'content', title: '内容治理', desc: '动态 / 评论 / 笔记 / 留言板 隐藏与删除' },
    { tab: 'announcements', title: '公告管理', desc: '发布全站公告 / 管理历史公告' },
    { tab: 'groups', title: '群组管理', desc: '查看群组 / 解散 / 移除成员 / 群公告' },
    { tab: 'chat', title: '私聊审计', desc: '查看任意私聊会话内容' },
    { tab: 'logs', title: '审计日志', desc: '全部管理员操作留痕' }
  ];

  function navFind(tab) {
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      if (NAV_ITEMS[i].tab === tab) return NAV_ITEMS[i];
    }
    return null;
  }

  function renderMenu() {
    var box = $('admMenuList');
    if (!box) return;
    var h = '';
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var it = NAV_ITEMS[i];
      h += '<div class="adm-menu-item" data-tab="' + it.tab + '"' + oc("XTADMOPS.enter('" + it.tab + "')") + '>' +
        '<div class="adm-menu-main">' +
          '<div class="adm-menu-title">' + esc(it.title) + '</div>' +
          '<div class="adm-menu-desc">' + esc(it.desc) + '</div>' +
        '</div>' +
        '<div class="adm-menu-arrow">›</div>' +
      '</div>';
    }
    box.innerHTML = h;
    // 列表项无 data-icon，不调 paint()
  }

  function renderSubHead(tab) {
    var head = $('admSubHead');
    if (!head) return;
    var it = navFind(tab);
    var title = it ? it.title : String(tab);
    head.innerHTML =
      '<div class="adm-subhead">' +
        '<button class="adm-subhead-back" id="admSubBack"' + oc('XTADMOPS.back()') + ' title="返回" aria-label="返回">←</button>' +
        '<div class="adm-subhead-title">' + esc(title) + '</div>' +
        '<button class="adm-subhead-refresh" id="admSubRefresh"' + oc('admRefresh()') + '>刷新</button>' +
      '</div>';
  }

  function applyMode() {
    var root = $('adminRoot');
    if (!root) return;
    var sub = !!OPS.subTab;
    if (root.classList && typeof root.classList.add === 'function' && typeof root.classList.remove === 'function') {
      if (sub) { root.classList.remove('adm-home'); root.classList.add('adm-sub'); }
      else { root.classList.remove('adm-sub'); root.classList.add('adm-home'); }
    } else {
      // 兜底：字符串拼类名
      var cls = String(root.className || '').replace(/\s*\b(adm-home|adm-sub)\b/g, '');
      root.className = cls + (sub ? ' adm-sub' : ' adm-home');
    }
  }

  function enter(tab) {
    if (!navFind(tab)) return;
    OPS.subTab = tab;
    renderSubHead(tab);
    applyMode();
    try {
      if (detectTab() === tab) {
        // 已在该 tab（admSwitchTab 会 early-return）：强制刷新一次，保证「进子页 = 看最新数据」
        if (typeof window.admRefresh === 'function') window.admRefresh();
      } else if (typeof window.admSwitchTab === 'function') {
        window.admSwitchTab(tab);   // 切 tab：内部完成面板显隐 + 首次数据加载
      }
    } catch (e) { /* 面板切换失败不阻塞视图进入 */ }
    try { window.scrollTo(0, 0); } catch (e2) { /* 忽略 */ }
  }

  function back() {
    OPS.subTab = null;
    applyMode();
    var head = $('admSubHead');
    if (head) head.innerHTML = '';   // 返回主页时清空子页顶栏 DOM
    try { window.scrollTo(0, 0); } catch (e) { /* 忽略 */ }
  }

  function boot() {
    if (OPS.booted) return;
    if (!$('adminRoot')) return;   // 仅 管理员.html 生效
    OPS.booted = true;

    OPS.activeTab = detectTab();
    renderOpsBar();
    renderMenu();     // R170-E：主页模块导航列表
    applyMode();      // R170-E：初始为主页模式（adm-home）
    loadVisibility();
    wrapRefresh();
    observeUserList();
    loadUserMap();

    // 用户列表可能早于本文件渲染完成：多次补注入
    setTimeout(function () { injectRowActions(); }, 0);
    setTimeout(function () { injectRowActions(); }, 800);
    setTimeout(function () { injectRowActions(); }, 2000);
  }

  /* =============================== 暴露 =============================== */
  window.XTADMOPS = {
    version: '20260923c',
    onTab: function (tab) { OPS.activeTab = tab || detectTab(); return loadTab(tab); },
    injectRowActions: injectRowActions,
    loadTab: loadTab,
    detectTab: detectTab,
    act: act,
    // R170-E：列表导航 + 子页
    enter: enter,
    back: back,
    renderMenu: renderMenu,
    _state: OPS,
    _renderOpsBar: renderOpsBar,
    _wrapRefresh: wrapRefresh
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
