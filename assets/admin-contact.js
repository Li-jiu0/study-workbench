/* =====================================================================
   assets/admin-contact.js · 需求01「联系管理员」固定入口（私聊.html）
   ---------------------------------------------------------------------
   背景：管理员账号对普通用户完全隐形（不在好友列表 / 搜索列表 / 在线状态里），
        因此它是用户联系管理员的唯一途径。
   后端已放行：server/routers/chat.py 的 can_message() 对「任一方是管理员」
        额外放行，不需要好友关系；本文件直接走 /api/chat/*，绕开前端
        chat-local.js 的 imOpenChat()（它要求本地好友记录，管理员没有）。

   链路：
     1) GET  /api/admin/contact            → 取管理员 userId（登录即可，结果缓存）
        （管理员隐形 → /api/friends/search 已按 is_admin 过滤；只用专用端点，无回退）
     2) GET  /api/chat/{id}/messages?limit=50&markRead=1  → 会话历史
     3) POST /api/chat/{id}/messages      body {content, kind:'text'} → 发消息
   ===================================================================== */
(function () {
  'use strict';

  var ADMIN_ID_KEY = 'xt_admin_user_id';            // 解析结果缓存，避免每次点都查一次

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function base() {
    try { if (typeof window.getApiBase === 'function') return window.getApiBase() || ''; } catch (e) { /* 忽略 */ }
    if (window.API_BASE != null) return window.API_BASE;
    return ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000');
  }
  function tok() {
    try { return localStorage.getItem('study_workbench_token') || ''; } catch (e) { return ''; }
  }
  function toast(msg, state) {
    try { if (typeof window.xtToast === 'function') { window.xtToast(state || 'info', msg); return; } } catch (e) { /* 忽略 */ }
    try { if (typeof window.showToast === 'function') { window.showToast(msg); return; } } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 解析管理员 userId ---------------- */
  function cacheAdminId(id) {
    if (id) { try { localStorage.setItem(ADMIN_ID_KEY, String(id)); } catch (e) { /* 忽略 */ } }
    return id;
  }

  /* 唯一路径：GET /api/admin/contact（登录即可访问，返回最小信息 {id, username, nickname}）。
     管理员对普通用户隐形 → /api/friends/search 已按 is_admin 过滤（0 命中），
     永不回退搜索；拿不到 id 一律按失败处理，由调用方给用户明确提示。 */
  function fetchAdminId() {
    return fetch(base() + '/api/admin/contact', {
      headers: { 'Authorization': 'Bearer ' + tok() }
    }).then(function (r) {
      if (!r.ok) throw new Error('contact unavailable');
      return r.json();
    }).then(function (d) {
      var id = Number(d && (d.id !== undefined ? d.id : d.userId));
      if (!id) throw new Error('bad payload');
      return id;
    });
  }

  function resolveAdminId() {
    var cached = '';
    try { cached = localStorage.getItem(ADMIN_ID_KEY) || ''; } catch (e) { /* 忽略 */ }
    if (cached && /^\d+$/.test(cached)) return Promise.resolve(Number(cached));
    if (!tok()) return Promise.resolve(0);
    return fetchAdminId().then(cacheAdminId).catch(function () { return 0; });
  }

  /* ---------------- 面板状态 ---------------- */
  var S = { open: false, adminId: 0, msgs: [], myId: 0, timer: null, loading: false };

  function myId() {
    if (S.myId) return S.myId;
    try {
      if (window.CURRENT_USER && window.CURRENT_USER.id) { S.myId = Number(window.CURRENT_USER.id); return S.myId; }
    } catch (e) { /* 忽略 */ }
    return 0;
  }

  function fmtTime(v) {
    var t = String(v || '').trim();
    if (!t) return '';
    var d = new Date(t.replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderMsgs() {
    var box = $('acMsgs');
    if (!box) return;
    if (!S.msgs.length) {
      box.innerHTML = '<div class="ac-empty">还没有消息，直接给管理员留言吧</div>';
      return;
    }
    var me = myId();
    var html = '';
    for (var i = 0; i < S.msgs.length; i++) {
      var m = S.msgs[i];
      var mine = (me && Number(m.senderId) === me);
      html += '<div class="ac-m ' + (mine ? 'me' : 'ot') + '">' +
        '<div class="ac-m-text">' + esc(m.content) + '</div>' +
        '<div class="ac-m-time">' + esc(fmtTime(m.createdAt || m.time || '')) + '</div>' +
        '</div>';
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function loadMsgs() {
    if (!S.adminId || !tok()) return Promise.resolve();
    return fetch(base() + '/api/chat/' + S.adminId + '/messages?limit=50&markRead=1', {
      headers: { 'Authorization': 'Bearer ' + tok() }
    }).then(function (r) { return r.ok ? r.json() : { items: [] }; }).then(function (d) {
      var items = (d && d.items) || [];
      // 服务端返回正序；id 去重，避免本地乐观插入的消息重复渲染
      var seen = {};
      var out = [];
      var i;
      for (i = 0; i < items.length; i++) { seen[String(items[i].id)] = true; out.push(items[i]); }
      for (i = 0; i < S.msgs.length; i++) {
        // 本地乐观插入的条目 id 为 0：交给服务端真值重绘，避免重复渲染
        if (!S.msgs[i].id) continue;
        if (!seen[String(S.msgs[i].id)]) out.push(S.msgs[i]);
      }
      out.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
      S.msgs = out;
      renderMsgs();
    }).catch(function () { /* 静默：历史拉取失败不打断输入 */ });
  }

  function sendMsg() {
    var inp = $('acInput');
    var text = (inp && inp.value ? inp.value : '').trim();
    if (!text) return;
    if (!S.adminId) { toast('未找到管理员账号，请稍后再试', 'warning'); return; }
    if (inp) inp.value = '';
    // 乐观插入，等服务端返回后再以真实 id 重绘
    S.msgs.push({ id: 0, senderId: myId(), content: text, kind: 'text', createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    renderMsgs();
    fetch(base() + '/api/chat/' + S.adminId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok() },
      body: JSON.stringify({ content: text, kind: 'text' })
    }).then(function (r) {
      if (!r.ok) throw new Error('send failed');
      return r.json();
    }).then(function (m) {
      // 用服务端返回的真实消息顶替本地乐观条目，再整体对齐一次
      S.msgs = S.msgs.filter(function (x) {
        return x.id && !(m && String(x.id) === String(m.id));
      });
      if (m && m.id) S.msgs.push(m);
      renderMsgs();
      return loadMsgs();
    }).catch(function () {
      S.msgs = S.msgs.filter(function (x) { return x.id; });  // 发送失败：撤掉乐观条目
      renderMsgs();
      toast('消息发送失败，请稍后重试', 'error');
    });
  }
  window.acSend = sendMsg;

  /* ---------------- R43（2026-09-14）：联系管理员入口未读角标 ----------------
     普通用户收到的「管理员来信」未读角标应显示在会话列表的「联系管理员」入口（.ac-entry）上。
     数据源 GET /api/chat/unread，取 peerId === 管理员 id（S.adminId）的 count。
     管理员 id 走 resolveAdminId()（已缓存到 localStorage，键名与 chat-local.js 共用 xt_admin_user_id）。 */
  var badgeTimer = null;

  function renderEntryBadge(n) {
    var entry = document.querySelector('.ac-entry');
    if (!entry) return;
    var b = document.getElementById('acEntryBadge');
    if (!b) {
      b = document.createElement('span');
      b.className = 'ac-badge';
      b.id = 'acEntryBadge';
      entry.appendChild(b);
    }
    var cnt = Number(n) || 0;
    if (cnt > 0) {
      b.textContent = cnt > 99 ? '99+' : String(cnt);
      b.style.display = '';
    } else {
      b.textContent = '';
      b.style.display = 'none';
    }
  }

  function refreshEntryBadge() {
    if (!tok()) { renderEntryBadge(0); return Promise.resolve(0); }
    return resolveAdminId().then(function (id) {
      if (id) S.adminId = id;
      if (!S.adminId) { renderEntryBadge(0); return 0; }
      return fetch(base() + '/api/chat/unread', { headers: { 'Authorization': 'Bearer ' + tok() } })
        .then(function (r) { return r.ok ? r.json() : { items: [] }; })
        .then(function (d) {
          var items = (d && d.items) || [];
          var hit = 0;
          for (var i = 0; i < items.length; i++) {
            if (Number(items[i].peerId) === Number(S.adminId)) { hit = Number(items[i].count) || 0; break; }
          }
          renderEntryBadge(hit);
          return hit;
        })
        .catch(function () { return 0; });
    }).catch(function () { return 0; });
  }

  function startBadgePoll() {
    if (badgeTimer) return;
    badgeTimer = setInterval(function () {
      try { if (document.hidden) return; } catch (e) { /* 忽略 */ }
      refreshEntryBadge();
    }, 5000);
  }

  function openPanel() {
    var panel = $('acPanel');
    if (!panel) return;
    if (!tok()) { toast('请先登录后再联系管理员', 'warning'); return; }
    S.open = true;
    panel.style.display = 'flex';
    var box = $('acMsgs');
    if (box) box.innerHTML = '<div class="ac-empty">加载中…</div>';
    resolveAdminId().then(function (id) {
      S.adminId = id || 0;
      if (!S.adminId) {
        if (box) box.innerHTML = '<div class="ac-empty">联系管理员失败，请稍后重试</div>';
        toast('联系管理员失败，请稍后重试', 'error');
        return;
      }
      return loadMsgs().then(function () { refreshEntryBadge(); }); // 打开即已读 → 角标清零
    });
    // 打开期间轮询新消息（含管理员回复）
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(function () {
      if (!S.open) return;
      try { if (document.hidden) return; } catch (e) { /* 忽略 */ }
      if (S.adminId) loadMsgs();
    }, 10000);
    var inp = $('acInput');
    if (inp) setTimeout(function () { inp.focus(); }, 100);
  }
  window.xtOpenAdminChat = openPanel;

  function closePanel() {
    var panel = $('acPanel');
    if (panel) panel.style.display = 'none';
    S.open = false;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  }
  window.acClose = closePanel;

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.open) closePanel();
    });
    // R43：进入页面即拉一次角标并每 5 秒轮询（无需先打开面板，入口角标也能显示）
    function bootBadge() { refreshEntryBadge(); startBadgePoll(); }
    if (document.readyState !== 'loading') bootBadge();
    else document.addEventListener('DOMContentLoaded', bootBadge);
  }
})();
