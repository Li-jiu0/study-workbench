/* =====================================================================
   assets/xt-moments.js — 需求11「动态空间」共享逻辑
   朋友圈信息流（发现→朋友圈）/ 我的朋友圈（我→朋友圈）/ 发布编辑页 三页共用。
   由页面 <body data-xtm="feed|mine|publish"> 决定启动分支。

   语法上限：ES2017（旧安卓 WebView）。本文件不使用：可选链、空值合并、
   对象/数组展开运算符、fromEntries、Array 原型 at 取值、正则后行断言、
   幂运算符、可选 catch 绑定、Promise 终结方法。
   ===================================================================== */
(function () {
  'use strict';

  /* ============================ 基础工具 ============================ */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function apiBase() {
    if (typeof window.getApiBase === 'function') return window.getApiBase();
    return window.STUDY_API_BASE != null ? window.STUDY_API_BASE : '';
  }
  function tok() { try { return localStorage.getItem('study_workbench_token') || ''; } catch (e) { return ''; } }
  function myId() { try { return Number(localStorage.getItem('study_workbench_uid') || 0); } catch (e) { return 0; } }
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    var t = $('toast');
    if (t) {
      t.textContent = msg;
      t.style.transform = 'translateX(-50%) translateY(0)';
      setTimeout(function () { t.style.transform = 'translateX(-50%) translateY(-100px)'; }, 1800);
    }
  }
  function confirmBox(msg, okText) {
    if (typeof window.uiConfirm === 'function') return window.uiConfirm(msg, okText || '确定');
    return Promise.resolve(window.confirm ? window.confirm(msg) : true);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* R82：动态插入的 lucide 图标（与静态 data-icon 共用同一套 LUCIDE_ICONS 字典，经 window.lucideIcon 取值）；
     字典缺失时回落调用方传入的原 emoji，保证任何环境下都不出现「图标空白」。 */
  function ico(name, size, fallback) {
    var html = (typeof window.lucideIcon === 'function') ? window.lucideIcon(name, size) : '';
    if (!html) return fallback || '';
    return '<span class="xtm-ico">' + html + '</span>';
  }

  function api(method, path, body) {
    var opt = { method: method, headers: { 'Authorization': 'Bearer ' + tok() } };
    if (body !== undefined && body !== null) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(apiBase() + path, opt).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; },
        function () { return { ok: r.ok, status: r.status, d: {} }; });
    }).then(function (res) {
      if (!res.ok) {
        var e = new Error((res.d && res.d.detail) || ('请求失败(' + res.status + ')'));
        e.status = res.status;
        throw e;
      }
      return res.d;
    });
  }

  function absUrl(u) { return !u ? '' : (/^(https?:|data:|blob:)/.test(u) ? u : apiBase() + u); }
  function avatarHtml(url, name) {
    if (url && /^(https?:|\/uploads\/|data:)/.test(url)) {
      return '<img src="' + esc(absUrl(url)) + '" alt="">';
    }
    return '<span>' + esc(String(name || '友').slice(0, 1)) + '</span>';
  }
  function fmtTime(t) {
    if (!t) return '';
    var d = new Date(String(t).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(t);
    var diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 1) return '刚刚';
    if (diff < 60) return Math.floor(diff) + ' 分钟前';
    if (diff < 60 * 24) return Math.floor(diff / 60) + ' 小时前';
    if (diff < 60 * 24 * 2) return '昨天 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fullTime(t) {
    var d = new Date(String(t).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(t || '');
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function dayKey(t) {
    var d = new Date(String(t).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(t || '');
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayLabel(t) {
    var d = new Date(String(t).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(t || '');
    var now = new Date();
    function zero(x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); }
    var dd = Math.round((zero(now) - zero(d)) / 86400000);
    if (dd === 0) return '今天';
    if (dd === 1) return '昨天';
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  var VIS_TEXT = { '': '公开', 'public': '公开', 'private': '私密', 'partial_allow': '部分可见', 'partial_deny': '部分不可见' };

  var S = { items: [], nextBefore: 0, hasMore: false, loading: false, online: !!tok(), page: '', me: null, notif: [] };

  function findM(mid) {
    for (var i = 0; i < S.items.length; i++) { if (S.items[i].id === mid) return S.items[i]; }
    return null;
  }
  function findC(m, cid) {
    var arr = m.comments || [];
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === cid) return arr[i]; }
    return null;
  }

  /* ============================ 卡片渲染 ============================ */
  function visChip(m) {
    var sc = m.visScope || '';
    if (!sc) return '';
    var t = VIS_TEXT[sc];
    if (!t) return '';
    return '<span class="xtm-chip xtm-chip-vis">' + esc(t) + '</span>';
  }
  function textHtml(m) {
    if (!m.content) return '';
    return '<div class="xtm-text" onclick="XTM.toggleText(this)">' + esc(m.content) + '</div>';
  }
  function metaHtml(m) {
    var out = '<div class="xtm-meta"><span class="xtm-time" title="' + esc(fullTime(m.createdAt)) + '">' + esc(fmtTime(m.createdAt)) + '</span>';
    if (m.location) out += '<span class="xtm-loc">📍' + esc(m.location) + '</span>';
    out += visChip(m) + '</div>';
    return out;
  }
  function mediaHtml(m) {
    var out = '';
    var imgs = m.images || [];
    if (imgs.length === 1) {
      out += '<div class="xtm-media-single" onclick="XTM.viewer(' + m.id + ',0)"><img src="' + esc(absUrl(imgs[0])) + '" alt=""></div>';
    } else if (imgs.length > 1) {
      var cells = imgs.map(function (u, i) {
        return '<div class="xtm-cell" onclick="XTM.viewer(' + m.id + ',' + i + ')"><img src="' + esc(absUrl(u)) + '" alt=""></div>';
      }).join('');
      out += '<div class="xtm-grid">' + cells + '</div>';
    }
    if (m.video) {
      out += '<div class="xtm-video"><video src="' + esc(absUrl(m.video)) + '" controls preload="metadata" playsinline></video></div>';
    }
    if (m.linkUrl) {
      out += '<a class="xtm-link" href="' + esc(m.linkUrl) + '" target="_blank" rel="noopener"><span class="xtm-link-ico"></span><span class="xtm-link-t">' + esc(m.linkTitle || m.linkUrl) + '</span></a>';
    }
    return out;
  }
  function likesHtml(m) {
    var arr = m.likes || [];
    if (!arr.length) return '';
    return '<div class="xtm-likes">' + ico('heart', 12, '❤') + ' ' + esc(arr.join('、')) + '</div>';
  }
  function cmtPreviewRow(m, c) {
    var rep = c.parentId ? '<span class="xtm-reply-to"> 回复 ' + esc(c.replyTo || '') + '</span>' : '';
    var del = c.canDelete ? '<span class="xtm-cmt-del" onclick="XTM.delComment(' + m.id + ',' + c.id + ')">删除</span>' : '';
    return '<div class="xtm-cmt-row"><b onclick="XTM.openUser(' + c.userId + ')">' + esc(c.nickname) + '</b>' + rep + '：' + esc(c.text) + del + '</div>';
  }
  function cmtsPreview(m) {
    var arr = m.comments || [];
    if (!arr.length) return '';
    var shown = arr.slice(0, 3).map(function (c) { return cmtPreviewRow(m, c); }).join('');
    var more = arr.length > 3 ? '<div class="xtm-cmt-more" onclick="XTM.panel(' + m.id + ')">查看全部 ' + arr.length + ' 条评论</div>' : '';
    return '<div class="xtm-cmts">' + shown + more + '</div>';
  }
  function cardHtml(m) {
    var del = m.canDelete ? '<div class="xtm-more" onclick="XTM.delMoment(' + m.id + ')">···</div>' : '';
    return '<div class="xtm-card" data-mid="' + m.id + '">' +
      '<div class="xtm-head">' +
        '<div class="xtm-avatar" onclick="XTM.openUser(' + m.author.id + ')">' + avatarHtml(m.author.avatarUrl, m.author.nickname) + '</div>' +
        '<div class="xtm-head-main">' +
          '<div class="xtm-name" onclick="XTM.openUser(' + m.author.id + ')">' + esc(m.author.nickname) + '</div>' +
          metaHtml(m) +
        '</div>' + del +
      '</div>' +
      textHtml(m) + mediaHtml(m) +
      '<div class="xtm-bar">' +
        '<span class="xtm-act' + (m.likedByMe ? ' on' : '') + '" onclick="XTM.like(' + m.id + ')">' + (m.likedByMe ? ico('heart', 13, '❤') + ' 取消' : ico('heart', 13, '🤍') + ' 赞') + '</span>' +
        '<span class="xtm-act" onclick="XTM.panel(' + m.id + ')">' + ico('message-circle', 13, '💬') + ' 评论</span>' +
      '</div>' +
      likesHtml(m) + cmtsPreview(m) +
    '</div>';
  }

  /* ============================ 互动面板 ============================ */
  var panelMid = 0, replyToId = 0, replyToName = '';

  function ensureOverlay(id, cls) {
    var el = $(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = cls || 'xtm-overlay';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function ensurePanel() {
    var el = ensureOverlay('xtmPanel', 'xtm-overlay');
    if (el.getAttribute('data-ready') === '1') return el;
    el.setAttribute('data-ready', '1');
    el.innerHTML = '<div class="xtm-sheet" onclick="event.stopPropagation()">' +
      '<div class="xtm-sheet-hd"><span id="xtmPanelTitle">互动</span><span class="xtm-sheet-x" onclick="XTM.closePanel()">' + ico('close', 18, '✕') + '</span></div>' +
      '<div class="xtm-sheet-body" id="xtmPanelBody"></div>' +
      '<div class="xtm-reply-bar" id="xtmReplyBar" style="display:none">正在回复 <b id="xtmReplyTo"></b><span class="xtm-reply-cancel" onclick="XTM.cancelReply()">取消</span></div>' +
      '<div class="xtm-sheet-ft"><input id="xtmPanelInput" maxlength="500" placeholder="友善评论…" onkeydown="if(event.key===\'Enter\'){event.preventDefault();XTM.sendComment();}"><button onclick="XTM.sendComment()">发送</button></div>' +
    '</div>';
    el.addEventListener('click', function () { closePanel(); });
    return el;
  }

  function cmtFullRow(m, c) {
    var av = avatarHtml(c.avatarUrl, c.nickname);
    var rep = c.parentId ? '<span class="xtm-reply-to"> 回复 ' + esc(c.replyTo || '') + '</span>' : '';
    var ops = '<div class="xtm-cmt-ops"><span onclick="XTM.startReply(' + m.id + ',' + c.id + ')">回复</span>' +
      (c.canDelete ? '<span onclick="XTM.delComment(' + m.id + ',' + c.id + ')">删除</span>' : '') + '</div>';
    return '<div class="xtm-cmt-item' + (c.parentId ? ' is-reply' : '') + '">' +
      '<div class="xtm-cmt-hd"><div class="xtm-cmt-av">' + av + '</div>' +
      '<span class="xtm-cmt-nm">' + esc(c.nickname) + '</span>' + rep +
      '<span class="xtm-cmt-tm">' + esc(fmtTime(c.time)) + '</span></div>' +
      '<div class="xtm-cmt-tx">' + esc(c.text) + '</div>' + ops + '</div>';
  }

  function renderPanel() {
    var m = findM(panelMid);
    if (!m) { closePanel(); return; }
    var likes = m.likes || [], cmts = m.comments || [];
    $('xtmPanelTitle').textContent = '互动 · ' + cmts.length + ' 条评论';
    var html = '<div class="xtm-sec"><div class="xtm-sec-t">' + ico('heart', 12, '❤') + ' 点赞（' + likes.length + '）</div>';
    html += likes.length
      ? '<div class="xtm-like-list">' + likes.map(function (n) { return '<span class="xtm-like-name">' + esc(n) + '</span>'; }).join('') + '</div>'
      : '<div class="xtm-none">还没有人点赞</div>';
    html += '</div><div class="xtm-sec"><div class="xtm-sec-t">' + ico('message-circle', 12, '💬') + ' 评论（' + cmts.length + '）</div>';
    html += cmts.length
      ? cmts.map(function (c) { return cmtFullRow(m, c); }).join('')
      : '<div class="xtm-none">还没有评论，来抢沙发～</div>';
    html += '</div>';
    $('xtmPanelBody').innerHTML = html;
  }

  function openPanel(mid) {
    ensurePanel();
    panelMid = mid; replyToId = 0; replyToName = '';
    var bar = $('xtmReplyBar'); if (bar) bar.style.display = 'none';
    renderPanel();
    $('xtmPanel').style.display = 'block';
  }
  function closePanel() {
    var el = $('xtmPanel'); if (el) el.style.display = 'none';
    panelMid = 0; replyToId = 0;
  }
  function startReply(mid, cid) {
    var m = findM(mid); if (!m) return;
    var c = findC(m, cid); if (!c) return;
    replyToId = cid; replyToName = c.nickname;
    var bar = $('xtmReplyBar'); if (bar) bar.style.display = 'block';
    var to = $('xtmReplyTo'); if (to) to.textContent = c.nickname;
    var inp = $('xtmPanelInput'); if (inp) inp.focus();
  }
  function cancelReply() {
    replyToId = 0; replyToName = '';
    var bar = $('xtmReplyBar'); if (bar) bar.style.display = 'none';
  }
  function sendComment() {
    var inp = $('xtmPanelInput'); if (!inp) return;
    var text = (inp.value || '').trim();
    if (!text) return;
    var mid = panelMid;
    var isReply = replyToId > 0;
    var path = isReply ? ('/api/moments/' + mid + '/reply') : ('/api/moments/' + mid + '/comments');
    var body = isReply ? { content: text, parentId: replyToId } : { content: text };
    var btn = document.querySelector('#xtmPanel .xtm-sheet-ft button');
    if (btn) btn.disabled = true;
    api('POST', path, body).then(function (c) {
      var m = findM(mid);
      if (m) { m.comments = (m.comments || []).concat([c]); }
      inp.value = '';
      cancelReply();
      renderPanel();
      rerenderCards();
      toast('已发送');
    }).catch(function (e) {
      toast(e.message || '评论失败，请检查网络');
    }).then(function () { if (btn) btn.disabled = false; });
  }
  function delComment(mid, cid) {
    confirmBox('确定删除这条评论吗？', '删除').then(function (ok) {
      if (!ok) return;
      return api('DELETE', '/api/moments/comments/' + cid).then(function () {
        var m = findM(mid);
        if (m) { m.comments = (m.comments || []).filter(function (c) { return c.id !== cid; }); }
        if (panelMid === mid) renderPanel();
        rerenderCards();
        toast('已删除');
      }).catch(function (e) { toast(e.message || '删除失败'); });
    });
  }

  /* ============================ 点赞 / 删动态 ============================ */
  function like(mid) {
    if (!S.online) { toast('需联网操作'); return; }
    api('POST', '/api/moments/' + mid + '/like').then(function (d) {
      var m = findM(mid); if (!m) return;
      m.likedByMe = d.liked;
      var nick = (S.me && S.me.nickname) || '我';
      m.likes = m.likes || [];
      if (d.liked) { if (m.likes.indexOf(nick) === -1) m.likes.push(nick); }
      else { m.likes = m.likes.filter(function (n) { return n !== nick; }); }
      rerenderCards();
      if (panelMid === mid) renderPanel();
    }).catch(function (e) { toast(e.message || '操作失败'); });
  }
  function delMoment(mid) {
    confirmBox('删除这条动态？点赞与评论会一并删除。', '删除').then(function (ok) {
      if (!ok) return;
      return api('DELETE', '/api/moments/' + mid).then(function () {
        S.items = S.items.filter(function (x) { return x.id !== mid; });
        rerenderCards();
        toast('已删除');
      }).catch(function (e) { toast(e.message || '删除失败'); });
    });
  }
  function rerenderCards() {
    if (S.page === 'feed') renderFeed();
    else if (S.page === 'mine') renderMine();
  }

  /* ============================ 大图查看器 ============================ */
  var viewerImgs = [], viewerIdx = 0;
  function ensureViewer() {
    var el = ensureOverlay('xtmViewer', 'xtm-viewer');
    if (el.getAttribute('data-ready') === '1') return el;
    el.setAttribute('data-ready', '1');
    el.innerHTML = '<span class="xtm-viewer-x" onclick="XTM.closeViewer()">' + ico('close', 20, '✕') + '</span>' +
      '<img id="xtmViewerImg" src="" alt="">' +
      '<div class="xtm-viewer-idx" id="xtmViewerIdx"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeViewer(); });
    var sx = 0;
    el.addEventListener('touchstart', function (e) { if (e.touches && e.touches.length) sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var ex = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientX : sx;
      if (ex - sx > 50) showViewer(viewerIdx - 1);
      else if (sx - ex > 50) showViewer(viewerIdx + 1);
    });
    return el;
  }
  function showViewer(i) {
    if (i < 0) i = viewerImgs.length - 1;
    if (i >= viewerImgs.length) i = 0;
    viewerIdx = i;
    var img = $('xtmViewerImg');
    if (img) img.src = absUrl(viewerImgs[i]);
    var idx = $('xtmViewerIdx');
    if (idx) idx.textContent = (i + 1) + ' / ' + viewerImgs.length;
  }
  function viewer(mid, i) {
    var m = findM(mid);
    if (!m || !(m.images || []).length) return;
    viewerImgs = m.images;
    ensureViewer();
    showViewer(i || 0);
    $('xtmViewer').style.display = 'flex';
  }
  function closeViewer() { var el = $('xtmViewer'); if (el) el.style.display = 'none'; }

  /* ============================ 通用输入 / 通知弹层 ============================ */
  function inputSheet(title, placeholder, value, onOk) {
    var el = ensureOverlay('xtmInput', 'xtm-overlay');
    el.innerHTML = '<div class="xtm-sheet" onclick="event.stopPropagation()">' +
      '<div class="xtm-sheet-hd"><span>' + esc(title) + '</span><span class="xtm-sheet-x" onclick="XTM.closeInput()">' + ico('close', 18, '✕') + '</span></div>' +
      '<div class="xtm-picker-search"><input id="xtmInputVal" maxlength="512" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"></div>' +
      '<div class="xtm-picker-ft"><button class="no" onclick="XTM.closeInput()">取消</button><button class="ok" id="xtmInputOk">确定</button></div>' +
    '</div>';
    el.style.display = 'block';
    var okBtn = $('xtmInputOk');
    if (okBtn) {
      okBtn.onclick = function () {
        var v = ($('xtmInputVal') || {}).value || '';
        closeInput();
        onOk(String(v).trim());
      };
    }
    var inp = $('xtmInputVal');
    if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
  }
  function closeInput() { var el = $('xtmInput'); if (el) el.style.display = 'none'; }

  function notifSheet() {
    var el = ensureOverlay('xtmNotif', 'xtm-overlay');
    var rows = (S.notif || []).map(function (n) {
      var t = String(n.type || '');
      var verb = t === 'moment_like' ? '赞了你的动态' : (t === 'moment_comment' ? '评论了你的动态' : '与你互动');
      return '<div class="xtm-cmt-item"><div class="xtm-cmt-hd"><span class="xtm-cmt-nm">' + esc(n.actor) + '</span>' +
        '<span class="xtm-cmt-tm">' + esc(fmtTime(n.createdAt)) + '</span></div>' +
        '<div class="xtm-cmt-tx">' + esc(verb) + '</div></div>';
    }).join('');
    el.innerHTML = '<div class="xtm-sheet" onclick="event.stopPropagation()">' +
      '<div class="xtm-sheet-hd"><span>互动通知</span><span class="xtm-sheet-x" onclick="XTM.closeNotif()">' + ico('close', 18, '✕') + '</span></div>' +
      '<div class="xtm-sheet-body">' + (rows || '<div class="xtm-none">暂无新的互动通知</div>') + '</div>' +
      '<div class="xtm-picker-ft"><button class="ok" onclick="XTM.readAllNotif()">全部标记已读</button></div>' +
    '</div>';
    el.style.display = 'block';
    el.onclick = function () { closeNotif(); };
  }
  function closeNotif() { var el = $('xtmNotif'); if (el) el.style.display = 'none'; }
  function readAllNotif() {
    api('POST', '/api/notifications/read-all').then(function () {
      (S.notif || []).forEach(function (n) { n.isRead = true; });
      renderBellDot();
      closeNotif();
      toast('已全部标记为已读');
    }).catch(function () { toast('操作失败'); });
  }

  /* ============================ 好友选择器 ============================ */
  var friendsCache = null;
  function loadFriends() {
    if (friendsCache) return Promise.resolve(friendsCache);
    return api('GET', '/api/friends').then(function (d) {
      friendsCache = (d.items || []).map(function (f) { return { id: f.id, nickname: f.nickname || f.peerRemark || ('用户#' + f.id), avatarUrl: f.avatarUrl || f.avatar || '' }; });
      return friendsCache;
    }).catch(function () { friendsCache = []; return friendsCache; });
  }
  function pickerSheet(title, selected, onDone) {
    loadFriends().then(function (list) {
      var el = ensureOverlay('xtmPicker', 'xtm-overlay');
      var sel = {};
      (selected || []).forEach(function (id) { sel[id] = true; });
      var html = '<div class="xtm-sheet" onclick="event.stopPropagation()">' +
        '<div class="xtm-sheet-hd"><span>' + esc(title) + '</span><span class="xtm-sheet-x" onclick="XTM.closePicker()">' + ico('close', 18, '✕') + '</span></div>' +
        '<div class="xtm-picker-search"><input id="xtmPickerSearch" placeholder="搜索好友昵称"></div>' +
        '<div class="xtm-picker-list" id="xtmPickerList"></div>' +
        '<div class="xtm-picker-ft"><button class="no" onclick="XTM.closePicker()">取消</button><button class="ok" id="xtmPickerOk">确定</button></div>' +
      '</div>';
      el.innerHTML = html;
      el.style.display = 'block';
      el.onclick = function () { closePicker(); };
      function draw(filter) {
        var f = (filter || '').trim().toLowerCase();
        var rows = list.filter(function (u) { return !f || String(u.nickname).toLowerCase().indexOf(f) !== -1; });
        var box = $('xtmPickerList');
        if (!box) return;
        if (!rows.length) { box.innerHTML = '<div class="xtm-none">没有可选择的联系人</div>'; return; }
        box.innerHTML = rows.map(function (u) {
          return '<div class="xtm-picker-row' + (sel[u.id] ? ' sel' : '') + '" data-uid="' + u.id + '">' +
            '<div class="xtm-picker-av">' + avatarHtml(u.avatarUrl, u.nickname) + '</div>' +
            '<div class="xtm-picker-nm">' + esc(u.nickname) + '</div><div class="xtm-picker-ck"></div></div>';
        }).join('');
        var rs = box.querySelectorAll('.xtm-picker-row');
        for (var i = 0; i < rs.length; i++) {
          rs[i].addEventListener('click', function () {
            var uid = Number(this.getAttribute('data-uid'));
            if (sel[uid]) delete sel[uid]; else sel[uid] = true;
            this.classList.toggle('sel');
          });
        }
      }
      draw('');
      var s = $('xtmPickerSearch');
      if (s) s.addEventListener('input', function () { draw(this.value); });
      var ok = $('xtmPickerOk');
      if (ok) {
        ok.onclick = function () {
          var ids = [], names = [];
          for (var k in sel) {
            if (Object.prototype.hasOwnProperty.call(sel, k)) {
              var uid = Number(k);
              ids.push(uid);
              for (var j = 0; j < list.length; j++) { if (list[j].id === uid) { names.push(list[j].nickname); break; } }
            }
          }
          closePicker();
          onDone(ids, names);
        };
      }
    });
  }
  function closePicker() { var el = $('xtmPicker'); if (el) el.style.display = 'none'; }

  /* ============================ 信息流页 ============================ */
  function scroller() { return $('page-moments') || window; }
  function bindInfinite() {
    var sent = $('xtmSentinel');
    if (!sent) return;
    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (ents) {
        for (var i = 0; i < ents.length; i++) {
          if (ents[i].isIntersecting && S.hasMore && !S.loading) loadFeed(true);
        }
      }, { root: ($('page-moments') || null), rootMargin: '240px' });
      io.observe(sent);
    } else {
      var sc = scroller();
      var target = (sc === window) ? window : sc;
      target.addEventListener('scroll', function () {
        var st = (sc === window) ? (window.pageYOffset || document.documentElement.scrollTop)
          : sc.scrollTop;
        var ch = (sc === window) ? document.documentElement.clientHeight : sc.clientHeight;
        var sh = (sc === window) ? document.documentElement.scrollHeight : sc.scrollHeight;
        if (sh - st - ch < 300 && S.hasMore && !S.loading) loadFeed(true);
      }, { passive: true });
    }
  }
  function bindPullRefresh(refreshFn) {
    var sc = scroller();
    var startY = 0, pulling = false;
    var ind = $('xtmRefresh');
    sc.addEventListener('touchstart', function (e) {
      if ((sc === window) ? (window.pageYOffset > 0) : (sc.scrollTop > 0)) return;
      if (!e.touches || !e.touches.length) return;
      startY = e.touches[0].clientY; pulling = true;
    }, { passive: true });
    sc.addEventListener('touchmove', function (e) {
      if (!pulling || !e.touches || !e.touches.length) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 60 && ind) ind.className = 'xtm-refresh show';
    }, { passive: true });
    sc.addEventListener('touchend', function (e) {
      if (!pulling) return;
      pulling = false;
      var dy = (e.changedTouches && e.changedTouches.length) ? (e.changedTouches[0].clientY - startY) : 0;
      if (dy > 60) {
        if (ind) ind.textContent = '正在刷新…';
        refreshFn();
        setTimeout(function () { if (ind) { ind.className = 'xtm-refresh'; ind.textContent = '下拉刷新'; } }, 700);
      }
      if (ind) ind.className = 'xtm-refresh';
    }, { passive: true });
  }

  function loadFeed(append) {
    if (!S.online) { renderOffline(); return; }
    if (S.loading) return;
    S.loading = true;
    var q = '/api/moments/feed?limit=20' + (append && S.nextBefore ? ('&beforeId=' + S.nextBefore) : '');
    api('GET', q).then(function (d) {
      if (append) S.items = S.items.concat(d.items || []); else S.items = d.items || [];
      S.nextBefore = d.nextBefore || 0;
      S.hasMore = !!d.hasMore && !!S.nextBefore;
      S.loading = false;
      renderFeed();
    }).catch(function () {
      S.online = false; S.loading = false; renderOffline();
    });
  }
  function renderFeed() {
    var box = $('xtmFeed');
    if (!box) return;
    if (!S.items.length) {
      box.innerHTML = '<div class="xtm-empty">还没有朋友圈动态<br><span style="font-size:12px">发一条，或去认识更多好友～</span></div>';
      return;
    }
    box.innerHTML = S.items.map(cardHtml).join('');
    if (typeof window.lucideAutoRender === 'function') { try { window.lucideAutoRender(); } catch (e) {} }
  }
  function renderOffline() {
    var box = $('xtmFeed') || $('xtmTimeline');
    if (box) box.innerHTML = '<div class="xtm-offline">朋友圈需联网查看，请检查网络后下拉刷新重试。</div>';
  }

  /* ============================ 我的朋友圈 ============================ */
  function loadMine(append) {
    if (!S.online) { renderOffline(); return; }
    if (S.loading) return;
    function run(uid) {
      S.loading = true;
      var q = '/api/moments/user/' + uid + '?limit=20' + (append && S.nextBefore ? ('&beforeId=' + S.nextBefore) : '');
      api('GET', q).then(function (d) {
        if (append) S.items = S.items.concat(d.items || []); else S.items = d.items || [];
        S.nextBefore = d.nextBefore || 0;
        S.hasMore = !!d.hasMore && !!S.nextBefore;
        S.loading = false;
        renderMine();
      }).catch(function () { S.online = false; S.loading = false; renderOffline(); });
    }
    var uid = myId();
    if (uid) { run(uid); return; }
    api('GET', '/api/auth/me').then(function (me) {
      S.me = me;
      if (me && me.id) { try { localStorage.setItem('study_workbench_uid', String(me.id)); } catch (e) {} }
      run((me && me.id) || 0);
    }).catch(function () { S.online = false; renderOffline(); });
  }
  function renderMine() {
    var box = $('xtmTimeline');
    if (!box) return;
    if (!S.items.length) {
      box.innerHTML = '<div class="xtm-empty">你还没有发过朋友圈<br><span style="font-size:12px">点右上角相机，记录第一条～</span></div>';
      return;
    }
    var html = '', lastKey = '';
    S.items.forEach(function (m) {
      var k = dayKey(m.createdAt);
      if (k !== lastKey) {
        lastKey = k;
        html += '<div class="xtm-tl-divider"><span>' + esc(dayLabel(m.createdAt)) + '</span></div>';
      }
      html += cardHtml(m);
    });
    box.innerHTML = html;
  }

  /* ============================ 相册网格（灰度/遗留：按年归档） ============================ */
  function buildAlbum() {
    var box = $('xtmAlbumGrid');
    if (!box) return;
    var all = [];
    S.items.forEach(function (m) {
      (m.images || []).forEach(function (u) { all.push({ u: u, t: m.createdAt }); });
    });
    if (!all.length) { box.innerHTML = '<div class="xtm-none">还没有图片</div>'; return; }
    box.innerHTML = all.map(function (x, i) {
      var y = '';
      var d = new Date(String(x.t).replace(' ', 'T'));
      if (!isNaN(d.getTime())) y = String(d.getFullYear());
      return '<div class="xtm-album-cell" data-src="' + esc(absUrl(x.u)) + '" onclick="XTM.viewerSrc(this.getAttribute(\'data-src\'))"><img src="' + esc(absUrl(x.u)) + '" alt=""><span class="xtm-album-y">' + esc(y) + '</span></div>';
    }).join('');
  }
  function viewerSrc(src) {
    viewerImgs = [src];
    ensureViewer();
    showViewer(0);
    $('xtmViewer').style.display = 'flex';
  }

  /* ============================ 通知铃铛 ============================ */
  function renderBellDot() {
    var dot = $('xtmBellDot');
    if (!dot) return;
    var unread = (S.notif || []).filter(function (n) { return !n.isRead; }).length;
    if (unread > 0) { dot.style.display = 'block'; dot.textContent = unread > 99 ? '99+' : String(unread); }
    else { dot.style.display = 'none'; }
  }
  function loadNotif() {
    if (!S.online) return;
    api('GET', '/api/notifications').then(function (d) {
      S.notif = (d.items || []).filter(function (x) { return String(x.type || '').indexOf('moment') === 0; });
      renderBellDot();
    }).catch(function () {});
  }

  /* ============================ 发布编辑页 ============================ */
  var P = null;
  function newP() {
    return { picked: [], video: '', linkUrl: '', linkTitle: '', location: '', visScope: '', visIds: [], visNames: [], mentionIds: [], mentionNames: [], textMode: false };
  }
  function imgCompress(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = 1280, w = img.width, h = img.height;
        if (Math.max(w, h) > max) { var k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var q = 0.85, out = cv.toDataURL('image/jpeg', q);
        while (out.length > 1.05 * 1024 * 1024 && q > 0.3) { q -= 0.15; out = cv.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  function uploadImg(dataUrl) {
    var arr = atob(dataUrl.split(',')[1]);
    var buf = new Uint8Array(arr.length);
    for (var i = 0; i < arr.length; i++) buf[i] = arr.charCodeAt(i);
    var blob = new Blob([buf], { type: 'image/jpeg' });
    var fd = new FormData();
    fd.append('file', blob, 'moment.jpg');
    return fetch(apiBase() + '/api/uploads', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok() }, body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.url) throw new Error(d.detail || '上传失败'); return d.url; });
  }
  function renderPicked() {
    var box = $('xtmMedia');
    if (!box) return;
    var cells = P.picked.map(function (p, i) {
      return '<div class="xtm-pub-cell"><img src="' + esc(p.dataUrl) + '">' +
        '<div class="xtm-pub-cell-del" onclick="XTM.removePicked(' + i + ')">' + ico('close', 16, '✕') + '</div>' +
        '<div class="xtm-pub-cell-edit" onclick="XTM.editPicked(' + i + ')">编辑</div></div>';
    }).join('');
    if (P.video) {
      cells += '<div class="xtm-pub-cell"><video src="' + esc(absUrl(P.video)) + '" muted playsinline></video>' +
        '<div class="xtm-pub-cell-del" onclick="XTM.removeVideo()">' + ico('close', 16, '✕') + '</div></div>';
    }
    if (P.picked.length < 9) {
      cells += '<div class="xtm-pub-add" onclick="document.getElementById(\'xtmFileImg\').click()">+</div>';
    }
    box.innerHTML = cells;
    renderChosen();
  }
  function renderChosen() {
    var box = $('xtmChosen');
    if (!box) return;
    var parts = [];
    if (P.location) parts.push('📍 ' + esc(P.location));
    if (P.visScope) { parts.push(ico('eye', 12, '👁') + ' ' + esc(VIS_TEXT[P.visScope] || '公开') + (P.visNames.length ? '（' + esc(P.visNames.join('、')) + '）' : '')); }
    if (P.mentionIds.length) parts.push('@ ' + esc(P.mentionNames.join('、')));
    if (P.linkUrl) parts.push('🔗 ' + esc(P.linkTitle || P.linkUrl));
    box.innerHTML = parts.map(function (x) { return '<span>' + x + '</span>'; }).join('');
    var fb = $('xtmVisBtn'); if (fb) fb.className = 'xtm-fn' + (P.visScope && P.visScope !== 'public' ? ' on' : '');
    var fm = $('xtmMentionBtn'); if (fm) fm.className = 'xtm-fn' + (P.mentionIds.length ? ' on' : '');
    var fl = $('xtmLocBtn'); if (fl) fl.className = 'xtm-fn' + (P.location ? ' on' : '');
  }
  function pubSubmit() {
    if (!tok()) { toast('请先登录后再发表'); return; }
    var text = ($('xtmText') || {}).value || '';
    if (!text.trim() && !P.picked.length && !P.video && !P.linkUrl) { toast('写点什么再发表吧'); return; }
    var btn = $('xtmSubmit');
    if (btn) btn.disabled = true;
    var ups = P.picked.map(function (p) { return p.url ? Promise.resolve(p.url) : uploadImg(p.dataUrl); });
    Promise.all(ups).then(function (urls) {
      return api('POST', '/api/moments/publish', {
        content: text.trim(), images: urls, video: P.video,
        linkUrl: P.linkUrl, linkTitle: P.linkTitle, location: P.location,
        visScope: P.visScope, visIds: P.visIds, mentionIds: P.mentionIds
      });
    }).then(function () {
      toast('✅ 已发表');
      try { localStorage.removeItem('study_workbench_moment_draft2'); } catch (e) {}
      setTimeout(function () { location.href = '动态空间.html'; }, 500);
    }).catch(function (e) {
      toast('发表失败：' + (e.message || '网络错误'));
      if (btn) btn.disabled = false;
    }).then(function () { if (btn) btn.disabled = false; });
  }
  function chooseVis() {
    var el = ensureOverlay('xtmVis', 'xtm-overlay');
    var opts = [['public', '公开'], ['partial_allow', '部分可见'], ['partial_deny', '不给谁看'], ['private', '私密']];
    var rows = opts.map(function (o) {
      var on = (P.visScope || 'public') === o[0];
      return '<div class="xtm-picker-row' + (on ? ' sel' : '') + '" data-scope="' + o[0] + '"><div class="xtm-picker-nm">' + o[1] + '</div><div class="xtm-picker-ck"></div></div>';
    }).join('');
    el.innerHTML = '<div class="xtm-sheet" onclick="event.stopPropagation()">' +
      '<div class="xtm-sheet-hd"><span>谁可以看</span><span class="xtm-sheet-x" onclick="XTM.closeVis()">' + ico('close', 18, '✕') + '</span></div>' +
      '<div class="xtm-picker-list">' + rows + '</div></div>';
    el.style.display = 'block';
    el.onclick = function () { closeVis(); };
    var rs = el.querySelectorAll('.xtm-picker-row');
    for (var i = 0; i < rs.length; i++) {
      rs[i].addEventListener('click', function () {
        var sc = this.getAttribute('data-scope');
        var prevScope = P.visScope;
        P.visScope = sc;
        closeVis();
        if (sc === 'partial_allow' || sc === 'partial_deny') {
          var title = sc === 'partial_allow' ? '选择可见的好友' : '选择不可见的好友';
          var pre = (prevScope === sc) ? P.visIds : [];
          pickerSheet(title, pre, function (ids, names) {
            P.visIds = ids;
            P.visNames = names || [];
            renderChosen();
          });
        } else {
          P.visIds = []; P.visNames = [];
          renderChosen();
        }
      });
    }
  }
  function closeVis() { var el = $('xtmVis'); if (el) el.style.display = 'none'; }

  /* ============================ 页面启动 ============================ */
  function initFeedPage() {
    S.page = 'feed';
    heroInit(); /* R78：页顶背景自定义；R84：动态空间页的换背景/恢复默认入口已移除，模块保留待 R80 迁移到 我的动态.html 复用（feed 页无 #xtmHero 时自动跳过） */
    var back = $('xtmBack');
    if (back) back.onclick = function () { if (history.length > 1) history.back(); else location.href = '动态空间.html'; };
    var cam = $('xtmCam');
    if (cam) {
      var timer = null, longPressed = false;
      function go(mode) { location.href = '朋友圈发布.html' + (mode === 'text' ? '?mode=text' : ''); }
      cam.addEventListener('touchstart', function () { longPressed = false; timer = setTimeout(function () { longPressed = true; go('text'); }, 650); }, { passive: true });
      cam.addEventListener('touchend', function () { if (timer) clearTimeout(timer); if (!longPressed) go('post'); });
      cam.addEventListener('mousedown', function () { longPressed = false; timer = setTimeout(function () { longPressed = true; go('text'); }, 650); });
      cam.addEventListener('mouseup', function () { if (timer) clearTimeout(timer); if (!longPressed) go('post'); });
      cam.addEventListener('mouseleave', function () { if (timer) clearTimeout(timer); });
    }
    api('GET', '/api/auth/me').then(function (me) { S.me = me; if (me && me.id) { try { localStorage.setItem('study_workbench_uid', String(me.id)); } catch (e) {} } }).catch(function () {});
    bindInfinite();
    bindPullRefresh(function () { S.items = []; S.nextBefore = 0; loadFeed(false); });
    loadFeed(false);
  }
  function initMinePage() {
    S.page = 'mine';
    var back = $('xtmBack');
    if (back) back.onclick = function () { if (history.length > 1) history.back(); else location.href = '动态空间.html'; };
    var cam = $('xtmCam');
    if (cam) cam.onclick = function () { location.href = '朋友圈发布.html'; };
    var bell = $('xtmBell');
    if (bell) bell.onclick = function () { notifSheet(); };
    var alb = $('xtmAlbumBtn');
    var albGrid = $('xtmAlbumGrid');
    if (alb && albGrid) alb.onclick = function () {
      var open = albGrid.style.display !== 'none';
      if (open) { albGrid.style.display = 'none'; alb.textContent = '🖼 相册（灰度）'; }
      else { buildAlbum(); albGrid.style.display = 'grid'; alb.textContent = '🖼 收起相册'; }
    };
    bindInfiniteMine();
    bindPullRefresh(function () { S.items = []; S.nextBefore = 0; loadMine(false); });
    api('GET', '/api/auth/me').then(function (me) {
      S.me = me;
      if (me && me.id) { try { localStorage.setItem('study_workbench_uid', String(me.id)); } catch (e) {} }
      var nm = $('xtmMyName'); if (nm) nm.textContent = (me && me.nickname) || '同学';
      var av = $('xtmMyAv'); if (av) av.innerHTML = avatarHtml(me && me.avatarUrl, me && me.nickname);
    }).catch(function () {});
    loadMine(false);
    loadNotif();
  }
  function bindInfiniteMine() {
    var sent = $('xtmSentinel');
    if (!sent) return;
    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (ents) {
        for (var i = 0; i < ents.length; i++) { if (ents[i].isIntersecting && S.hasMore && !S.loading) loadMine(true); }
      }, { root: ($('page-moments') || null), rootMargin: '240px' });
      io.observe(sent);
    } else {
      var sc = scroller();
      var target = (sc === window) ? window : sc;
      target.addEventListener('scroll', function () {
        var st = (sc === window) ? (window.pageYOffset || document.documentElement.scrollTop) : sc.scrollTop;
        var ch = (sc === window) ? document.documentElement.clientHeight : sc.clientHeight;
        var sh = (sc === window) ? document.documentElement.scrollHeight : sc.scrollHeight;
        if (sh - st - ch < 300 && S.hasMore && !S.loading) loadMine(true);
      }, { passive: true });
    }
  }
  function initPublishPage() {
    S.page = 'publish';
    P = newP();
    var params = '';
    try { params = location.search || ''; } catch (e) {}
    if (params.indexOf('mode=text') !== -1) {
      P.textMode = true;
      var bar = $('xtmFuncbar'); if (bar) bar.style.display = 'none';
    }
    var cancel = $('xtmCancel');
    if (cancel) cancel.onclick = function () {
      var text = ($('xtmText') || {}).value || '';
      if (!text.trim() && !P.picked.length && !P.video && !P.linkUrl) { history.back(); return; }
      confirmBox('放弃本次编辑？', '放弃').then(function (ok) { if (ok) history.back(); });
    };
    var submit = $('xtmSubmit');
    if (submit) submit.onclick = pubSubmit;
    var file = $('xtmFileImg');
    if (file) file.addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      this.value = '';
      files.forEach(function (f) {
        if (P.picked.length >= 9) { toast('最多 9 张图片'); return; }
        var rd = new FileReader();
        rd.onload = function (e) {
          imgCompress(e.target.result).then(function (dataUrl) {
            P.picked.push({ dataUrl: dataUrl, url: '' });
            renderPicked();
          });
        };
        rd.readAsDataURL(f);
      });
    });
    var locBtn = $('xtmLocBtn');
    if (locBtn) locBtn.onclick = function () { inputSheet('所在位置', '如：图书馆 / 自习室', P.location, function (v) { P.location = v.slice(0, 64); renderChosen(); }); };
    var locSelf = $('xtmAtBtn');
    if (locSelf) locSelf.onclick = function () {
      if (!navigator.geolocation) { toast('当前设备不支持定位'); return; }
      toast('正在定位…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        P.location = ('经纬度 ' + pos.coords.latitude.toFixed(3) + ',' + pos.coords.longitude.toFixed(3));
        renderChosen();
        toast('已记录当前位置');
      }, function () { toast('定位失败，请手动填写'); });
    };
    var visBtn = $('xtmVisBtn');
    if (visBtn) visBtn.onclick = chooseVis;
    var menBtn = $('xtmMentionBtn');
    if (menBtn) menBtn.onclick = function () {
      pickerSheet('提醒谁看', P.mentionIds, function (ids, names) { P.mentionIds = ids; P.mentionNames = names || []; renderChosen(); });
    };
    var vidBtn = $('xtmVidBtn');
    if (vidBtn) vidBtn.onclick = function () { inputSheet('视频链接', '粘贴视频地址', P.video, function (v) { P.video = v.slice(0, 512); renderPicked(); }); };
    var linkBtn = $('xtmLinkBtn');
    if (linkBtn) linkBtn.onclick = function () {
      inputSheet('链接地址', 'https://…', P.linkUrl, function (v) {
        P.linkUrl = v.slice(0, 512);
        inputSheet('链接标题', '可留空', P.linkTitle, function (t) { P.linkTitle = t.slice(0, 200); renderPicked(); });
      });
    };
    var ta = $('xtmText');
    if (ta) setTimeout(function () { try { ta.focus(); } catch (e) {} }, 80);
    renderPicked();
  }

  /* ============================ R78：页顶背景自定义（动态空间信息流页） ============================
     #xtmHero 存在时启用（R84 后 feed 页已无入口，仅保留能力）：选本地图片（≤2MB）→ FileReader dataURL → localStorage
     study_workbench_moments_bg；恢复默认（清 key）图标 rotate-ccw。有背景时加半透明遮罩保证可读性。
     R84：动态空间（feed 页）的换背景 / 恢复默认入口已按用户要求移除，本模块进入休眠状态
     （heroInit 在无 #xtmHero 时自动跳过）；函数与 localStorage 键逻辑完整保留，
     待 R80 迁移到 我的动态.html 时直接复用，勿删。 */
  var BG_KEY = 'study_workbench_moments_bg';
  var BG_MAX_BYTES = 2 * 1024 * 1024;
  function heroApply(url) {
    var hero = $('xtmHero');
    if (!hero) return;
    var mask = $('xtmHeroMask');
    var reset = $('xtmBgReset');
    if (url) {
      hero.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
      hero.classList.add('has-bg');
      if (mask) mask.style.display = 'block';
      if (reset) reset.style.display = '';
    } else {
      hero.style.backgroundImage = '';
      hero.classList.remove('has-bg');
      if (mask) mask.style.display = 'none';
      if (reset) reset.style.display = 'none';
    }
  }
  function heroInit() {
    var hero = $('xtmHero');
    if (!hero) return;
    var saved = '';
    try { saved = localStorage.getItem(BG_KEY) || ''; } catch (e) { saved = ''; }
    if (saved && saved.indexOf('data:image/') === 0) heroApply(saved);
    else {
      if (saved) { try { localStorage.removeItem(BG_KEY); } catch (e) {} }
      heroApply('');
    }
    var btn = $('xtmBgBtn');
    var file = $('xtmBgFile');
    var reset = $('xtmBgReset');
    if (btn && file) {
      btn.onclick = function () { file.value = ''; file.click(); };
    }
    if (file) {
      file.addEventListener('change', function () {
        var f = (this.files && this.files[0]) || null;
        this.value = '';
        if (!f) return;
        if (f.size > BG_MAX_BYTES) { toast('背景图不能超过 2MB，请换一张'); return; }
        var rd = new FileReader();
        rd.onload = function (e) {
          var url = String((e.target && e.target.result) || '');
          if (url.indexOf('data:image/') !== 0) { toast('仅支持图片文件'); return; }
          try { localStorage.setItem(BG_KEY, url); } catch (er) { toast('背景保存失败：本地存储空间不足'); return; }
          heroApply(url);
          toast('✅ 背景已更新');
        };
        rd.onerror = function () { toast('读取图片失败，请重试'); };
        rd.readAsDataURL(f);
      });
    }
    if (reset) {
      reset.onclick = function () {
        try { localStorage.removeItem(BG_KEY); } catch (e) {}
        heroApply('');
        toast('已恢复默认背景');
      };
    }
  }

  /* ============================ 对外接口 ============================ */
  var XTM = {
    /* 卡片交互 */
    toggleText: function (el) { if (el) el.classList.toggle('open'); },
    openUser: function (uid) { if (uid) location.href = '个人资料.html?user=' + uid; },
    like: like, delMoment: delMoment, panel: openPanel, closePanel: closePanel,
    sendComment: sendComment, startReply: startReply, cancelReply: cancelReply, delComment: delComment,
    /* 查看器 */
    viewer: viewer, viewerSrc: viewerSrc, closeViewer: closeViewer,
    /* 弹层 */
    closeInput: closeInput, closeNotif: closeNotif, readAllNotif: readAllNotif,
    closePicker: closePicker, closeVis: closeVis,
    /* 发布页 */
    removePicked: function (i) { if (P) { P.picked.splice(i, 1); renderPicked(); } },
    editPicked: function (i) {
      if (!P || !P.picked[i]) return;
      inputSheet('替换图片链接（留空=保留当前图片）', 'https://… 或 /uploads/images/…', '', function (v) {
        if (!v) return;
        P.picked[i] = { dataUrl: absUrl(v), url: v };
        renderPicked();
      });
    },
    removeVideo: function () { if (P) { P.video = ''; renderPicked(); } },
    boot: function () {
      var page = document.body.getAttribute('data-xtm');
      if (page === 'feed') initFeedPage();
      else if (page === 'mine') initMinePage();
      else if (page === 'publish') initPublishPage();
    }
  };
  window.XTM = XTM;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', XTM.boot);
  else XTM.boot();
})();
