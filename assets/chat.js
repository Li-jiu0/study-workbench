/* 私信页逻辑（挂在与学习博客相同的应用外壳里，见 私聊.html）。
   依赖 app.js（showToast 等）+ api.js；自身用 IIFE 隔离命名，仅暴露 im* 窗口函数。 */
(function () {
  'use strict';
  if (window.__IM_LOADED__) return;
  window.__IM_LOADED__ = true;

  var TOKEN_KEY = 'study_workbench_token', REFRESH_KEY = 'study_workbench_refresh';
  function apiBase() { return (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://localhost:8000'; }
  var API_BASE = apiBase();
  function gTok() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function rTok() { return localStorage.getItem(REFRESH_KEY) || ''; }
  function isOnline() { return !!(gTok() || rTok()); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function apiFile(u) { return (!u || /^(https?:|data:)/.test(u)) ? u : (API_BASE + u); }
  function fmt(t) { t = t || ''; return /^\d{4}-/.test(t) ? t.slice(5, 16) : t; }
  function avHtml(u) { if (u && u.avatarUrl && /^(https?:|\/uploads\/|data:)/.test(u.avatarUrl)) return '<img src="' + apiFile(u.avatarUrl) + '" alt="">'; return esc(((u && (u.nickname || '友')) || '友').slice(0, 1)); }

  /* toast（复用 app.js 的若存在，否则自建） */
  function toast(m) {
    if (typeof window.showToast === 'function') { window.showToast(m); return; }
    var el = document.getElementById('imToast');
    if (!el) { el = document.createElement('div'); el.id = 'imToast'; el.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#333;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:9999;opacity:0;transition:.25s;pointer-events:none'; document.body.appendChild(el); }
    el.textContent = m; el.style.opacity = '1'; clearTimeout(toast._t); toast._t = setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }

  /* ---- 请求封装（401 静默刷新） ---- */
  var _busy = null;
  function _doRefresh() {
    var rt = rTok(); if (!rt) return Promise.resolve(false);
    return fetch(API_BASE + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: rt }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { if (!x.ok || !x.d.token) return false; localStorage.setItem(TOKEN_KEY, x.d.token); if (x.d.refreshToken) localStorage.setItem(REFRESH_KEY, x.d.refreshToken); return true; })
      .catch(function () { return false; });
  }
  function tryRefresh() { if (!_busy) _busy = _doRefresh().then(function (ok) { _busy = null; return ok; }); return _busy; }
  async function req(path, opts, _retried) {
    opts = opts || {};
    var h = Object.assign({}, opts.headers || {});
    if (!(opts.body instanceof FormData)) h['Content-Type'] = 'application/json';
    var t = gTok(); if (t) h['Authorization'] = 'Bearer ' + t;
    var r = await fetch(API_BASE + path, { method: opts.method || 'GET', headers: h, body: opts.body instanceof FormData ? opts.body : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
    if (r.status === 401 && !_retried) { if (await tryRefresh()) return req(path, opts, true); location.replace('登录.html'); throw new Error('登录已过期'); }
    var d = null; try { d = await r.json(); } catch (e) { d = {}; }
    if (!r.ok) throw new Error((d && d.detail) || ('HTTP ' + r.status));
    return d;
  }

  /* ---- 状态 ---- */
  var S = { tab: 'chats', peer: null, chats: [], msgs: [], busy: false, hasMore: true, myId: 0, _pin: false };
  function $id(x) { return document.getElementById(x); }
  function meName() { var c = S.chats.find(function (x) { return x.id === S.peer.id; }); return c ? c.nickname : '好友'; }

  /* ---- WS：心跳 + 指数退避重连 ---- */
  var ws = null, wsa = 0;
  function wsUrl() {
    var host = API_BASE ? new URL(API_BASE).host : location.host;
    return ((location.protocol === 'https:') ? 'wss://' : 'ws://') + host + '/ws/chat?token=' + encodeURIComponent(gTok());
  }
  function connectWS() {
    if (!isOnline()) return;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try { ws = new WebSocket(wsUrl()); } catch (e) { schedule(); return; }
    ws.onopen = function () { wsa = 0; };
    ws.onmessage = function (ev) { onFrame(ev.data); };
    ws.onclose = function () { schedule(); };
    ws.onerror = function () { try { ws.close(); } catch (e) { } };
  }
  function schedule() { setTimeout(function () { connectWS(); }, Math.min(1000 * Math.pow(2, wsa++), 15000)); }
  function onFrame(raw) {
    var m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'msg') onWsMsg(m.message);
    else if (m.type === 'readReceipt') onReadReceipt(m.peerId, m.upToId);
  }
  function onWsMsg(msg) {
    loadUnread();
    if (S.peer && msg.senderId === S.peer.id) {
      S.msgs.push(msg); renderMsgs(); markRead(msg.id);
    } else if (msg.senderId) { toast('💬 ' + meOf(msg.senderId) + ' 给你发来新消息'); }
    loadChats();
  }
  function onReadReceipt(peerId, upToId) {
    if (S.peer && S.peer.id === peerId) { S.msgs.forEach(function (m) { if (m.senderId === S.myId && m.id <= upToId) m.read = true; }); renderMsgs(); }
    loadUnread();
  }
  function meOf(id) { var c = S.chats.find(function (x) { return x.id === id; }); return c ? c.nickname : '好友'; }
  setInterval(function () { if (ws && ws.readyState === 1) { try { ws.send('{"type":"ping"}'); } catch (e) { } } }, 25000);

  /* ---- 渲染：侧栏三种视图 ---- */
  function renderList() {
    var box = $id('imList'); if (!box) return;
    if (S.tab === 'chats') renderChats(box);
    else if (S.tab === 'friends') renderFriends(box);
    else renderRequests(box);
  }
  function sessHtml(c, extra, active) {
    return '<div class="im-sess' + (active ? ' on' : '') + '" onclick="imOpenChat(' + c.id + ')">' +
      '<div class="im-av">' + avHtml(c) + '</div>' +
      '<div class="im-si"><div class="im-n">' + esc(c.nickname) + '</div><div class="im-sub">' + esc(c.last || c.motto || '') + '</div></div>' +
      (c.unread ? '<span class="im-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '') + extra + '</div>';
  }
  function renderChats(box) {
    if (!S.chats.length) { box.innerHTML = '<div class="im-empty2">还没有好友<br>到「👥 好友」找人加好友</div>'; return; }
    box.innerHTML = S.chats.map(function (c) { return sessHtml(c, '', S.peer && S.peer.id === c.id); }).join('');
  }
  function renderFriends(box) {
    if (!S.chats.length) { box.innerHTML = '<div class="im-empty2">还没有好友</div>'; return; }
    box.innerHTML = S.chats.map(function (c) {
      return sessHtml(c, '<span class="im-del" onclick="event.stopPropagation();imRemoveFriend(' + c.id + ')">删</span>', false);
    }).join('');
  }
  async function renderRequests(box) {
    box.innerHTML = '<div class="im-empty2">加载中…</div>';
    var d; try { d = await req('/api/friends/requests'); } catch (e) { box.innerHTML = '<div class="im-empty2">' + esc(e.message) + '</div>'; return; }
    var inc = (d.incoming || []).map(function (r) {
      return '<div class="im-sess"><div class="im-av">' + avHtml(r.user) + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(r.user.nickname) + '</div><div class="im-sub">' + esc(r.user.motto || '') + '</div></div>' +
        '<button class="btn btn-outline" style="font-size:12px;padding:4px 10px" onclick="imActRequest(' + r.id + ',1)">同意</button>' +
        '<button class="btn" style="font-size:12px;padding:4px 10px;background:#eee;color:#666" onclick="imActRequest(' + r.id + ',0)">拒绝</button></div>';
    });
    box.innerHTML = (inc.length ? inc.join('') : '<div class="im-empty2">暂无好友申请<br>在「👥 好友」搜索用户名添加</div>');
  }

  /* ---- 搜索 / 加好友 ---- */
  window.imDoSearch = async function () {
    var kw = ($id('imSearch').value || '').trim(); var box = $id('imList');
    if (!kw) { renderList(); return; }
    var d; try { d = await req('/api/friends/search?q=' + encodeURIComponent(kw)); } catch (e) { toast(e.message); return; }
    var items = d.items || [];
    box.innerHTML = items.length ? items.map(function (u) {
      var act = u.isFriend ? '<span style="font-size:12px;color:var(--text-secondary)">已是好友</span>'
        : (u.blockedMe ? '<span style="font-size:12px;color:var(--text-secondary)">不可添加</span>'
          : '<button class="btn btn-primary" style="font-size:12px;padding:4px 10px" onclick="imAddFriend(' + u.id + ')">加好友</button>');
      return '<div class="im-sess"><div class="im-av">' + avHtml(u) + '</div><div class="im-si"><div class="im-n">' + esc(u.nickname) + '</div><div class="im-sub">@' + esc(u.username) + '</div></div>' + act + '</div>';
    }).join('') : '<div class="im-empty2">没有找到用户</div>';
  };
  window.imAddFriend = async function (uid) {
    try { var r = await req('/api/friends/requests', { method: 'POST', body: { toUserId: uid } }); toast(r.autoAccepted ? '已是好友，直接开聊~' : '好友申请已发送'); loadChats(); switchTab('chats'); }
    catch (e) { toast(e.message); }
  };
  window.imActRequest = async function (rid, accept) {
    try { await req('/api/friends/requests/' + rid + '/' + (accept ? 'accept' : 'decline'), { method: 'POST' }); toast(accept ? '已加为好友' : '已拒绝'); loadChats(); switchTab('chats'); }
    catch (e) { toast(e.message); }
  };
  window.imRemoveFriend = async function (uid) {
    if (!confirm('删除该好友？将无法继续私聊。')) return;
    try { await req('/api/friends/' + uid, { method: 'DELETE' }); if (S.peer && S.peer.id === uid) S.peer = null; toast('已删除好友'); loadChats(); renderMsgs(); }
    catch (e) { toast(e.message); }
  };

  /* ---- Tab 切换 ---- */
  function switchTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.im-tab').forEach(function (el) { el.classList.toggle('active', el.dataset.tab === tab); });
    renderList();
  }
  window.imSwitchTab = switchTab;

  /* ---- 会话 ---- */
  async function loadChats() {
    try {
      var d = await req('/api/friends'); S.chats = d.items || [];
      var un = await req('/api/chat/unread'); var map = {}; (un.items || []).forEach(function (x) { map[x.peerId] = x; });
      S.chats.forEach(function (c) { c.unread = (map[c.id] && map[c.id].count) || 0; c.last = (map[c.id] && map[c.id].last) || c.last || c.motto || ''; });
      if (S.tab === 'chats') renderList();
    } catch (e) { }
  }
  async function loadUnread() { try { await req('/api/chat/unread'); } catch (e) { } }
  window.imOpenChat = async function (uid) {
    var peer = S.chats.find(function (c) { return c.id === uid; }); if (!peer) return;
    S.peer = peer; S.msgs = []; S.hasMore = true; S.busy = false;
    $id('imEmpty').style.display = 'none';
    var conv = $id('imConv'); conv.style.display = 'flex';
    $id('imCName').textContent = peer.nickname;
    $id('imCAv').innerHTML = avHtml(peer);
    if (window.innerWidth <= 760) { document.body.classList.add('im-mobile'); document.getElementById('imBack').style.display = 'inline-flex'; }
    renderMsgs();
    await reloadLatest();
    markRead(0, true);
  };
  window.imBackList = function () { document.body.classList.remove('im-mobile'); };
  async function reloadLatest() {
    if (!S.peer) return;
    try { var d = await req('/api/chat/' + S.peer.id + '/messages?limit=50'); S.msgs = d.items || []; S.hasMore = d.hasMore; renderMsgs(); }
    catch (e) { }
  }
  function renderMsgs() {
    var box = $id('imMsgs'); if (!box) return;
    box.innerHTML = S.msgs.map(function (m) {
      var mine = m.senderId === S.myId;
      var body = m.kind === 'image' ? '<img src="' + apiFile(m.content) + '" alt="图片" style="max-width:220px;border-radius:8px;display:block">' : esc(m.content);
      return '<div class="im-m ' + (mine ? 'me' : 'ot') + '">' + body +
        '<div class="im-mt">' + fmt(m.createdAt) + (mine ? ' · ' + (m.read ? '已读' : '已送达') : '') + '</div></div>';
    }).join('') || '<div class="im-empty2" style="padding:30px">还没有消息，打个招呼吧~</div>';
    if (!S._pin) box.scrollTop = box.scrollHeight;
    S._pin = false;
  }
  $ready(function () { $id('imMsgs').addEventListener('scroll', function () { if (this.scrollTop < 30) loadOlder(); }); });
  async function loadOlder() {
    if (!S.peer || S.busy || !S.hasMore || !S.msgs.length) return;
    S.busy = true;
    var before = S.msgs[0].id;
    try {
      var d = await req('/api/chat/' + S.peer.id + '/messages?before_id=' + before + '&limit=30');
      S.hasMore = d.hasMore;
      var ids = {}; S.msgs.forEach(function (m) { ids[m.id] = 1; });
      S.msgs = (d.items || []).filter(function (m) { return !ids[m.id]; }).concat(S.msgs);
      renderMsgs();
      if (S.hasMore) { var box = $id('imMsgs'); box.scrollTop = 260; }
    } catch (e) { }
    S.busy = false;
  }
  function markRead(upToId, all) {
    var p = S.peer; if (!p) return;
    if (all) { var last = S.msgs[S.msgs.length - 1]; if (!last) return; upToId = last.id; }
    if (!upToId) return;
    req('/api/chat/' + p.id + '/read', { method: 'POST', body: { upToId: upToId } }).then(function () {
      S.msgs.forEach(function (m) { if (m.senderId !== S.myId && m.id <= upToId) m.read = true; });
      renderMsgs();
    }).catch(function () { });
  }
  function sendAfter() { reloadLatest(); }

  /* 发送区键盘 */
  $ready(function () {
    var inp = $id('imInput');
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.imSendText(); } });
    var box = $id('imMsgs');
  });

  window.imSendText = async function () {
    var inp = $id('imInput'); var text = (inp.value || '').trim();
    if (!text || !S.peer) return;
    inp.value = '';
    try { await req('/api/chat/' + S.peer.id + '/messages', { method: 'POST', body: { content: text, kind: 'text' } }); sendAfter(); }
    catch (e) { inp.value = text; toast(e.message); }
  };
  window.imSendImage = async function (el) {
    var f = el.files && el.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('请选择图片'); el.value = ''; return; }
    if (f.size > 8 * 1024 * 1024) { toast('图片超过 8MB'); el.value = ''; return; }
    var fd = new FormData(); fd.append('file', f);
    try {
      var up = await req('/api/uploads', { method: 'POST', body: fd });
      await req('/api/chat/' + S.peer.id + '/messages', { method: 'POST', body: { content: up.url, kind: 'image' } });
      sendAfter();
    } catch (e) { toast(e.message); }
    el.value = '';
  };

  /* ---- 启动 ---- */
  function boot() {
    if (!isOnline()) {
      $id('imList').innerHTML = '<div class="im-empty2">💬 好友私信是在线功能<br>请先启动后端并用账号在线登录</div>';
      var empty = $id('imEmpty'); empty.style.display = 'flex'; empty.innerHTML = '💬 在线登录后才能私信';
      return;
    }
    req('/api/auth/me').then(function (me) {
      S.myId = me.id;
      loadChats();
      connectWS();
    }).catch(function () { });
  }
  function $ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  $ready(boot);
})();
