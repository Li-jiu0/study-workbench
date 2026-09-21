/* 本页顶栏搜索框专用：只搜索聊天记录（好友昵称 + 本地/服务器消息内容），不搜发贴模块 */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtTime(t) {
    if (!t) return '';
    var d = new Date(t);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function apiBase() { return (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000')); }
  function tok() { return localStorage.getItem('study_workbench_token') || ''; }

  function render(kw, hits) {
    var dd = document.getElementById('gsDropdown'); if (!dd) return;
    if (!hits.length) { dd.innerHTML = '<div class="gs-empty">聊天记录里没有找到「' + esc(kw) + '」</div>'; }
    else {
      dd.innerHTML = hits.slice(0, 12).map(function (h) {
        return '<div class="gs-item" onclick="window.__gsOpen(' + h.fid + ');closeGsDropdown && closeGsDropdown()">' +
          '<div class="gs-item-icon"><span class="nav-icon" data-icon="message-circle" data-icon-size="18"></span></div><div class="gs-item-main">' +
          '<div class="gs-item-title">' + esc(h.name) + '</div>' +
          '<div class="gs-item-desc">' + esc(h.txt) + ' · ' + fmtTime(h.time) + '</div></div></div>';
      }).join('') + (hits.length > 12 ? '<div class="gs-empty">还有 ' + (hits.length - 12) + ' 条结果未显示</div>' : '');
    }
    dd.classList.add('open');
    /* C1 20260913k：动态插入的 data-icon span 需手动触发一次图标水合 */
    if (window.lucideAutoRender) window.lucideAutoRender();
  }
  window.__gsOpen = function (fid) { if (typeof imOpenChat === 'function') imOpenChat(fid); };

  window.globalSearch = function (kw) {
    var dd = document.getElementById('gsDropdown'); if (!dd) return;
    kw = (kw || '').trim();
    if (!kw) { dd.classList.remove('open'); dd.innerHTML = ''; return; }
    var kwL = kw.toLowerCase();
    var hits = [], seen = {};
    var data = null;
    try { data = JSON.parse(localStorage.getItem('study_im_local_data') || 'null'); } catch (e) { }
    if (data && data.chats) {
      Object.keys(data.chats).forEach(function (fid) {
        var c = data.chats[fid];
        var nameHit = (c.nickname || '').toLowerCase().indexOf(kwL) >= 0;
        var got = false;
        ((data.messages || {})[fid] || []).forEach(function (m) {
          if ((m.content || '').toLowerCase().indexOf(kwL) >= 0) {
            hits.push({ fid: Number(fid), name: c.nickname || '好友', txt: m.content, time: m.time }); got = true;
          }
        });
        if (nameHit && !got) hits.push({ fid: Number(fid), name: c.nickname || '好友', txt: '（联系人，点开查看聊天）', time: c.time || '' });
        seen[fid] = 1;
      });
    }
    render(kw, hits);

    /* 服务器好友：异步补充搜索服务器聊天记录 */
    var t = tok(); if (!t) return;
    var servers = [];
    if (data && data.chats) Object.keys(data.chats).forEach(function (fid) { if (Number(fid) >= 10000) servers.push({ fid: Number(fid), sid: Number(fid) - 10000, name: data.chats[fid].nickname }); });
    // 本地缓存里还没有的服务器好友（刚加载的情况）也从会话列表补
    if (typeof S !== 'undefined' && S && S.chats) S.chats.forEach(function (c) { if (c.isServer && c.serverId && servers.indexOf ) { var fid = 10000 + c.serverId; if (!seen[fid] && !servers.some(function (s) { return s.fid === fid; })) servers.push({ fid: fid, sid: c.serverId, name: c.nickname }); } });
    if (!servers.length) return;
    var serverHits = [], pending = servers.length;
    servers.forEach(function (sv) {
      fetch(apiBase() + '/api/chat/' + sv.sid + '/messages?limit=50', { headers: { 'Authorization': 'Bearer ' + t } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var nameHit = (sv.name || '').toLowerCase().indexOf(kwL) >= 0, got = false;
          (d.items || []).forEach(function (m) {
            if ((m.content || '').toLowerCase().indexOf(kwL) >= 0) {
              serverHits.push({ fid: sv.fid, name: sv.name, txt: m.content, time: m.createdAt }); got = true;
            }
          });
          if (nameHit && !got) serverHits.push({ fid: sv.fid, name: sv.name, txt: '（联系人，点开查看聊天）', time: '' });
        })
        .catch(function () { })
        .finally(function () { if (--pending === 0) { Array.prototype.push.apply(hits, serverHits); render(kw, hits); } });
    });
  };
})();