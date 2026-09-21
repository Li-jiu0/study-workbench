# -*- coding: utf-8 -*-
"""R72 工程师任务一：前端补丁（chat-local.js / api.js）。

按行号区间替换，CRLF 精确保留；
每组补丁断言区间内容包含若干 signature 子串，否则整体失败不落盘。
"""
import os
import sys

ROOT = r"D:\下载的文件\学习工作台"
EDITS = []  # (rel, start, end, [expect...], block_text)


def E(rel, start, end, expect, block):
    EDITS.append((rel, start, end, expect, block))


# ============================================================ chat-local.js
CL = r"assets\chat-local.js"

# E1: 存储键前缀助手（插在 STORAGE_KEY / AI_CFG_KEY 之后）
E(CL, 229, 230,
  ["var STORAGE_KEY = 'study_im_local_data';", "var AI_CFG_KEY = 'study_workbench_ai_config';"],
  r"""  var STORAGE_KEY = 'study_im_local_data';
  var AI_CFG_KEY = 'study_workbench_ai_config';

  /* ==================== R72（Bug1/Bug4）：多账号 localStorage 前缀统一 ====================
     背景：app.js 的 migrateLegacyKeys() 会把「裸键」迁到 lsKey() 前缀键并删除裸键；
     本文件此前直读裸键 → 每次进私聊页本地会话 / AI 配置归零。
     约定：写入统一走前缀键 lsKey(k)；读取优先前缀键、缺失回退裸键（老数据不丢）。
     lsKey 不存在（app.js 未加载 / 老缓存）时原样使用 k，行为与旧版一致。 */
  function lsK(k) {
    try { return (typeof window.lsKey === 'function') ? window.lsKey(k) : k; }
    catch (e) { return k; }
  }
  function lsGet(k) {
    try {
      var v = localStorage.getItem(lsK(k));
      if (v != null) return v;
      return localStorage.getItem(k); // 兼容迁移前裸键
    } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(lsK(k), v); }
    catch (e) { console.warn('[chat-local] 本地存储写入失败（可能超配额）:', k, e); }
  }""")

# E2: getAddedAiIds / setAddedAiIds
E(CL, 261, 270,
  ["function getAddedAiIds()", "localStorage.getItem('study_im_ai_added')", "localStorage.setItem('study_im_ai_added'"],
  r"""  function getAddedAiIds() {
    try {
      var saved = JSON.parse(lsGet('study_im_ai_added') || 'null');
      if (saved && Array.isArray(saved)) return saved;
    } catch (e) {}
    return [1, 8];
  }
  function setAddedAiIds(ids) {
    lsSet('study_im_ai_added', JSON.stringify(ids));
  }""")

# E3: imLoadPrefs 读取
E(CL, 315, 315,
  ["var v = JSON.parse(localStorage.getItem(CHAT_PREFS_KEY) || '{}');"],
  r"""      var v = JSON.parse(lsGet(CHAT_PREFS_KEY) || '{}');""")

# E4: imChatPrefs.set 写入
E(CL, 428, 428,
  ["localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(p))"],
  r"""      lsSet(CHAT_PREFS_KEY, JSON.stringify(p));""")

# E5: getAiConfig / loadData / saveData
E(CL, 438, 446,
  ["function getAiConfig()", "function loadData()", "function saveData(data)"],
  r"""  function getAiConfig() {
    /* Bug4（R72）：真实 AI 配置写在 lsKey(AI_CFG_KEY)（app.js），裸键已被迁移删除，
       旧实现只读裸键 → 恒为 null → AI 好友永远走演示兜底。改为前缀优先、裸键回退。 */
    try { var raw = lsGet(AI_CFG_KEY); if (raw) return JSON.parse(raw); } catch (e) { }
    return null;
  }
  function loadData() {
    try { var raw = lsGet(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) { }
    return { chats: {}, messages: {} };
  }
  function saveData(data) {
    try { localStorage.setItem(lsK(STORAGE_KEY), JSON.stringify(data)); }
    catch (e) { console.warn('[chat-local] 聊天数据本地存储失败（可能超配额）:', e); }
  }""")

# E9: loadServerFriends mapping 增加 peerRemark（line 1121-1126）
E(CL, 1121, 1126,
  ["nickname: u.nickname || '用户',", "motto: u.motto || '',", "isServer: true"],
  r"""          nickname: u.nickname || '用户',
          username: u.username || '',
          avatar: u.avatarUrl || '',
          motto: u.motto || '',
          peerRemark: u.peerRemark || '',
          isServer: true
        };""")

# E10: loadChats 重构（831-859）
E(CL, 831, 859,
  ["function loadChats() {", "var allFriends = getActiveAiFriends().concat(SERVER_FRIENDS);",
   "回填动态生成的非好友服务器会话"],
  r"""  /* R72（Bug1）：优先以服务端「全部会话」为准重建；接口失败回落本地逻辑（可用性不降级）。 */
  function loadChats() {
    var token = getToken();
    if (token) {
      fetch(apiBase() + '/api/chat/conversations', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.items) imBuildChatsFromConversations(d.items);
          else imBuildLocalChats();
        })
        .catch(function () { imBuildLocalChats(); });
    } else {
      imBuildLocalChats();
    }
  }

  /* 备注显示名：有备注 → 「备注名（原名）」；无备注 / 与原名相同 → 原名。 */
  function imDisplayName(remark, nickname) {
    var r = (remark == null ? '' : String(remark)).trim();
    var n = (nickname == null ? '' : String(nickname));
    if (r && r !== n) return r + '（' + n + '）';
    return n;
  }

  /* 离线 / 接口不可用时的本地构建（旧逻辑，行为保持不变）。 */
  function imBuildLocalChats() {
    var data = loadData();
    var allFriends = getActiveAiFriends().concat(SERVER_FRIENDS);
    S.chats = allFriends.map(function (f) {
      var chat = data.chats[f.id] || { id: f.id, nickname: f.nickname, avatar: f.avatar, last: f.motto, unread: 0, time: 0, isServer: !!f.isServer, serverId: f.serverId };
      // 补全信息（如果data.chats里没有avatar）
      if (!chat.avatar) chat.avatar = f.avatar;
      if (!chat.nickname) chat.nickname = f.nickname;
      chat.isServer = !!f.isServer;
      chat.serverId = f.serverId;
      return chat;
    });
    imBackfillLocalServerChats(data);
    S.chats.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    renderList();
  }

  /* R39（2026-09-14）：回填动态生成的非好友服务器会话（如管理员来信）。
     S.chats 平时只从 allFriends 重建，动态会话不在 SERVER_FRIENDS 里会被丢弃；
     这里从持久化 data.chats 里把 isServer 且不在列表里的会话补回来（已读归零也保留行），
     再统一按时间排序 —— 刷新页面后动态会话仍在。 */
  function imBackfillLocalServerChats(data) {
    Object.keys(data.chats || {}).forEach(function (k) {
      var c = data.chats[k];
      if (!c || !c.isServer || !c.serverId) return;
      if (S.chats.some(function (x) { return x.id === c.id; })) return;
      S.chats.push({
        id: c.id, serverId: c.serverId, isServer: true,
        nickname: c.nickname || ('用户' + c.serverId), avatar: c.avatar || '',
        last: c.last || '', unread: c.unread || 0, time: c.time || 0,
        peerRemark: c.peerRemark || ''
      });
    });
  }

  /* R72（Bug1）：以 GET /api/chat/conversations 为准构建 S.chats。
     - 保留 id = 10000 + peerId 的 server 会话合成规则与既有字段名（isServer/serverId/last/unread/time），
       因此 imEnsureServerChat() / imOpenChatWithUser() 产生的会话在列、可点开，行为不破坏；
     - 本地 AI 好友仍并入（不受服务端会话影响）；
     - 无消息的好友沿用其签名(motto)作预览占位，与旧行为一致。 */
  function imBuildChatsFromConversations(items) {
    var data = loadData();
    var out = [];
    var seen = {};
    var dirty = false;
    getActiveAiFriends().forEach(function (f) {
      var chat = data.chats[f.id] || { id: f.id, nickname: f.nickname, avatar: f.avatar, last: f.motto, unread: 0, time: 0, isServer: !!f.isServer, serverId: f.serverId };
      if (!chat.avatar) chat.avatar = f.avatar;
      if (!chat.nickname) chat.nickname = f.nickname;
      chat.isServer = !!f.isServer;
      chat.serverId = f.serverId;
      out.push(chat);
      seen[chat.id] = 1;
    });
    (items || []).forEach(function (it) {
      var pid = Number(it && it.peerId);
      if (!pid) return;
      var fid = 10000 + pid;
      if (seen[fid]) return;
      seen[fid] = 1;
      var lm = it.lastMessage || null;
      var lastTxt = lm ? previewText(lm.kind, lm.content) : '';
      var fr = (SERVER_FRIENDS || []).filter(function (x) { return x.serverId === pid; })[0];
      if (!lastTxt && fr && fr.motto) lastTxt = fr.motto;
      var t = 0;
      if (lm && lm.createdAt) { var tt = new Date(lm.createdAt).getTime(); if (!isNaN(tt)) t = tt; }
      var remark = it.peerRemark || '';
      out.push({
        id: fid, serverId: pid, isServer: true,
        nickname: it.peerNickname || (fr && fr.nickname) || ('用户' + pid),
        avatar: it.peerAvatar || (fr && fr.avatar) || '',
        last: lastTxt, unread: Number(it.unreadCount) || 0, time: t,
        lastId: lm ? lm.id : 0, peerRemark: remark
      });
      data.chats = data.chats || {};
      var prev = data.chats[fid];
      if (!prev || prev.nickname !== out[out.length - 1].nickname ||
          prev.avatar !== out[out.length - 1].avatar || prev.last !== lastTxt ||
          (prev.peerRemark || '') !== remark) {
        data.chats[fid] = {
          id: fid, serverId: pid, isServer: true,
          nickname: out[out.length - 1].nickname, avatar: out[out.length - 1].avatar,
          last: lastTxt, unread: 0, time: t, peerRemark: remark
        };
        dirty = true;
      }
    });
    Object.keys(data.chats || {}).forEach(function (k) {
      var c = data.chats[k];
      if (!c || !c.isServer || !c.serverId) return;
      if (out.some(function (x) { return x.id === c.id; })) return;
      out.push({
        id: c.id, serverId: c.serverId, isServer: true,
        nickname: c.nickname || ('用户' + c.serverId), avatar: c.avatar || '',
        last: c.last || '', unread: c.unread || 0, time: c.time || 0,
        peerRemark: c.peerRemark || ''
      });
    });
    if (dirty) saveData(data);
    S.chats = out;
    S.chats.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    renderList();
  }""")

# E13: imRenderGroupRows 管理员只读（925-927）
E(CL, 925, 927,
  ["var active = S.group && S.group.id === g.id;", "onclick=\"imOpenGroup(' + g.id + ')\""],
  r"""      var active = S.group && S.group.id === g.id;
      // Bug2（R72）：管理员视图行只读 —— 不挂进入群会话的 onclick（非成员点入会被后端 403）
      var isAdminView = (g.role === 'admin-view');
      var rowClick = isAdminView ? '' : (' onclick="imOpenGroup(' + g.id + ')"');
      var rowTitle = isAdminView ? ' title="管理员视图（只读）"' : '';
      return '<div class="im-swipe" data-tid="' + esc(gk) + '">' +
        '<div class="im-sess' + (active ? ' on' : '') + '" data-tid="' + esc(gk) + '"' + rowClick + rowTitle + '>' +""")

# E14: renderGroupsTab 标题（895）
E(CL, 895, 895,
  ["var head = '<div class=\"im-group-title\">👥 我的群聊 (' + groups.length + ')</div>';"],
  r"""    // Bug2（R72）：管理员看到的是全部群（只读），标题明示「管理员视图 · 只读」避免误操作
    var head = S.isAdmin
      ? '<div class="im-group-title">👥 全部群聊 (' + groups.length + ') <span style="font-size:11px;color:#999;font-weight:400">（管理员视图 · 只读）</span></div>'
      : '<div class="im-group-title">👥 我的群聊 (' + groups.length + ')</div>';""")

# E11: renderChats 会话行显示备注（965）
E(CL, 965, 965,
  ["<div class=\"im-n\">' + esc(c.nickname) + (c.pinned ?"],
  r"""        '<div class="im-si"><div class="im-n">' + esc(imDisplayName(c.peerRemark, c.nickname)) + (c.pinned ? ' <span class="im-pin-tag" title="已置顶">📌</span>' : '') + '</div><div class="im-sub">' + esc(c.last || '') + '</div></div>' +""")

# E12: imRegFriendsHtml 好友行显示备注（1264）
E(CL, 1264, 1264,
  ["esc(f.nickname) + ' <span"],
  r"""        '<div class="im-si"><div class="im-n" style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">' + esc(imDisplayName(f.peerRemark, f.nickname)) + ' <span style="font-size:11px;color:#999">@' + esc(f.username) + '</span></div>' +""")

# E15: callFriendAi 走统一 AI 底座（2097-2098）
E(CL, 2097, 2098,
  ["function callFriendAi(friend, historyMsgs, callback) {", "var aiCfg = getAiConfig();"],
  r"""  // 取最近一条用户文本（AI 兜底回复 / 兜底文案标注共用）
  function imLastUserText(historyMsgs) {
    var list = historyMsgs || [];
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].role === 'user') return String(list[i].content || '');
    }
    return '';
  }
  // 离线兜底回复：标注「离线兜底」，避免用户误以为 AI 真答了
  function imOfflineFallback(friend, historyMsgs) {
    return generateDemoReply(imLastUserText(historyMsgs), (friend && friend.personality) || 'ai') +
      '\n\n（离线兜底回复：未接入 AI 服务，以上为本地演示内容）';
  }

  function callFriendAi(friend, historyMsgs, callback) {
    /* Bug4（R72）：优先走统一 AI 底座 assets/ai-service.js 的 window.callAI
       （与首页卡片 / AI.html 同一套模型配置 / 密钥优先级 / 降级 / 限频）。
       底座不可用（文件未加载）时回退旧的直连配置；都没有才走离线兜底。 */
    if (typeof window.callAI === 'function') {
      var baseMsgs = [{ role: 'system', content: friend.systemPrompt }];
      (historyMsgs || []).slice(-12).forEach(function (m) { baseMsgs.push({ role: m.role, content: m.content }); });
      Promise.resolve(window.callAI('auto', baseMsgs, {})).then(function (res) {
        var reply = '';
        if (typeof res === 'string') reply = res;
        else if (res && typeof res.text === 'string') reply = res.text;
        else if (res && typeof res.content === 'string') reply = res.content;
        reply = reply ? String(reply).trim() : '';
        if (reply) { callback(reply); return; }
        callback(imOfflineFallback(friend, historyMsgs));
      }).catch(function (err) {
        console.warn('[chat-local] AI 底座调用失败，回落本地兜底：', err && (err.message || err));
        callback(imOfflineFallback(friend, historyMsgs));
      });
      return;
    }
    var aiCfg = getAiConfig();""")

# E16: 兜底 setTimeout（2104）
E(CL, 2104, 2104,
  ["setTimeout(function () { callback(generateDemoReply(lastUserText, friend.personality)); }"],
  r"""      setTimeout(function () { callback(imOfflineFallback(friend, historyMsgs)); }, 800 + Math.random() * 1200);""")

# E17: 直连失败兜底文案（2125）
E(CL, 2125, 2125,
  ["AI 连接失败，已切换为本地演示回复"],
  r"""      console.warn('[chat-local] 直连 AI 服务商失败，回落本地兜底：', err && (err.message || err));
      callback(generateDemoReply(imLastUserText(historyMsgs), friend.personality) +
        '\n\n（离线兜底回复：AI 连接失败，已切换为本地演示内容。请到「设置 → AI 服务商配置」检查密钥/地址。）');""")

# E18: imShowUserProfile 底部按钮（2781）
E(CL, 2781, 2781,
  ["id=\"imUserProfileChatBtn\" disabled>发消息</button></div>' +"],
  r"""      '<div class="im-group-foot" style="justify-content:flex-end">' +
      '<button class="btn btn-outline" id="imUserProfileRemarkBtn">备注</button>' +
      '<button class="btn btn-primary" id="imUserProfileChatBtn" disabled>发消息</button></div>' +""")

# E19: imShowUserProfile 绑定备注入口（2783-2785）
E(CL, 2783, 2785,
  ["document.body.appendChild(ov);", "window.imCloseUserProfile(); };", "bindModalEsc();"],
  r"""    document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) window.imCloseUserProfile(); };
    bindModalEsc();
    // Bug3（R72）：好友资料卡「备注」入口（页内自建小弹窗，禁原生 prompt）
    var rmkBtnInit = ov.querySelector('#imUserProfileRemarkBtn');
    if (rmkBtnInit) rmkBtnInit.onclick = function () { window.imOpenRemarkEditor(uid, ''); };""")

# E20: imShowUserProfile 加载后绑定备注（2826-2830）
E(CL, 2826, 2830,
  ["var btn = $id('imUserProfileChatBtn');", "window.imOpenChatWithUser(uid, nickname,"],
  r"""        var btn = $id('imUserProfileChatBtn');
        if (btn) { btn.disabled = false; btn.onclick = function () {
          window.imCloseUserProfile();
          window.imOpenChatWithUser(uid, nickname, u.avatarUrl || u.avatar || '');
        }; }
        var rmkBtn = $id('imUserProfileRemarkBtn');
        if (rmkBtn) rmkBtn.onclick = function () { window.imOpenRemarkEditor(uid, nickname); };""")

# E21: imCloseUserProfile 后追加备注编辑器（2838-2842）
E(CL, 2838, 2842,
  ["window.imCloseUserProfile = function () {"],
  r"""  window.imCloseUserProfile = function () {
    var ov = $id('imUserProfileModal');
    if (ov) ov.remove();
    unbindModalEscIfIdle();
  };

  /* ==================== R72（Bug3）：好友备注（会话行 / 好友行显示「备注名（原名）」） ====================
     数据落库：PUT /api/friends/{peerId}/remark（优先 api.js 的 apiSetFriendRemark 封装；未加载时本地 fetch 兜底）。
     入口：好友资料卡 imShowUserProfile() 的「备注」按钮 → 页内自建小弹窗（禁原生 prompt，ADR-3 轻交互）。 */
  function imRemarkOf(serverId) {
    var uid = Number(serverId);
    if (!uid) return '';
    var c = (S.chats || []).filter(function (x) { return x.isServer && x.serverId === uid; })[0];
    if (c && c.peerRemark) return c.peerRemark;
    var f = (SERVER_FRIENDS || []).filter(function (x) { return x.serverId === uid; })[0];
    return (f && f.peerRemark) || '';
  }
  function imApplyRemarkLocal(serverId, remark) {
    var uid = Number(serverId);
    var val = remark || '';
    (S.chats || []).forEach(function (c) { if (c.isServer && c.serverId === uid) c.peerRemark = val; });
    (SERVER_FRIENDS || []).forEach(function (f) { if (f.serverId === uid) f.peerRemark = val; });
    try {
      var data = loadData();
      var fid = 10000 + uid;
      if (data.chats && data.chats[fid]) { data.chats[fid].peerRemark = val; saveData(data); }
    } catch (e) { /* 忽略：内存态已更新 */ }
  }
  window.imOpenRemarkEditor = function (serverId, nickname) {
    var uid = Number(serverId);
    if (!uid) return;
    var cur = imRemarkOf(uid) || '';
    var old = $id('imRemarkModal');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'im-overlay';
    ov.id = 'imRemarkModal';
    ov.innerHTML = '<div class="im-modal">' +
      '<div class="im-modal-head"><div style="font-size:16px;font-weight:700">设置备注</div>' +
      '<div style="cursor:pointer;color:#999;font-size:18px" onclick="imCloseRemarkEditor()">✕</div></div>' +
      '<div class="im-group-body">' +
        '<div class="im-gs-field"><div class="im-gs-label">备注名（最多 20 字）</div>' +
        '<input class="form-input im-gs-input" id="imRemarkInput" maxlength="20" placeholder="' + esc(nickname || '好友') + '" value="' + esc(cur) + '"></div>' +
        '<div class="im-gs-hint">留空保存 = 清除备注，恢复显示对方昵称</div>' +
      '</div>' +
      '<div class="im-group-foot"><button class="btn btn-outline" onclick="imCloseRemarkEditor()">取消</button>' +
      '<button class="btn btn-primary" id="imRemarkSaveBtn">保存</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) window.imCloseRemarkEditor(); };
    bindModalEsc();
    var btn = ov.querySelector('#imRemarkSaveBtn');
    if (btn) btn.onclick = function () { window.imSaveRemark(uid); };
    var inp = ov.querySelector('#imRemarkInput');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
  };
  window.imCloseRemarkEditor = function () {
    var ov = $id('imRemarkModal');
    if (ov) ov.remove();
    unbindModalEscIfIdle();
  };
  window.imSaveRemark = function (serverId) {
    var uid = Number(serverId);
    if (!uid) return;
    var inp = $id('imRemarkInput');
    var val = inp ? String(inp.value || '').trim() : '';
    if (val.length > 20) val = val.slice(0, 20);
    var btn = $id('imRemarkSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    var done = function (remark) {
      imApplyRemarkLocal(uid, remark);
      window.imCloseRemarkEditor();
      toast(remark ? '✅ 备注已保存' : '✅ 已清除备注');
      if (S.tab === 'friends' && !S.isAdmin) renderFriends($id('imList'));
      loadChats();
    };
    var fail = function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '保存'; }
      toast('保存失败：' + ((e && e.message) || '网络错误'));
    };
    if (typeof window.apiSetFriendRemark === 'function') {
      window.apiSetFriendRemark(uid, val).then(function (d) {
        done((d && typeof d.peerRemark === 'string') ? d.peerRemark : val);
      }).catch(fail);
      return;
    }
    fetch(apiBase() + '/api/friends/' + uid + '/remark', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ remark: val })
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '保存失败'); return d; }); })
      .then(function (d) { done((d && typeof d.peerRemark === 'string') ? d.peerRemark : val); })
      .catch(fail);
  };""")

# E22: 测试钩子（3586-3588）
E(CL, 3586, 3588,
  ["imTopNotify: imTopNotify,", "SERVER_FRIENDS_REF: function () { return SERVER_FRIENDS; }"],
  r"""    imTopNotify: imTopNotify,
    SERVER_FRIENDS_REF: function () { return SERVER_FRIENDS; },
    /* R72（Bug1/Bug2/Bug4）：本批次新增校验钩子（仅测试引用，零运行时行为影响） */
    imBuildChatsFromConversations: imBuildChatsFromConversations,
    imBuildLocalChats: imBuildLocalChats,
    imDisplayName: imDisplayName,
    imRemarkOf: imRemarkOf,
    lsK: lsK,
    imOfflineFallback: imOfflineFallback,
    getAiConfig: getAiConfig
  };""")

# ============================================================ api.js
AJ = r"assets\api.js"
E(AJ, 1189, 1191,
  ["var chatUnread = 0;", "async function loadChatUnread() {"],
  r"""var chatUnread = 0;
var chatUnreadPrev = -1;

/* ---------- R72（Bug1/Bug3）：好友私信 —— 会话列表 / 好友备注封装 ----------
   与上面的 api() 同一套封装：自动带 Bearer、401 静默刷新一次、非 2xx 抛 Error(detail)。
   chat-local.js 优先调用这些封装，拿不到时自行 fetch 兜底（本文件未加载 / 老缓存场景）。 */
async function apiGetChatConversations(limit) {
  var q = (limit != null) ? ('?limit=' + encodeURIComponent(limit)) : '';
  return api('/api/chat/conversations' + q);
}
async function apiSetFriendRemark(peerId, remark) {
  return api('/api/friends/' + Number(peerId) + '/remark', {
    method: 'PUT',
    body: { remark: (remark == null ? '' : String(remark)) }
  });
}
window.apiGetChatConversations = apiGetChatConversations;
window.apiSetFriendRemark = apiSetFriendRemark;

async function loadChatUnread() {""")


def apply():
    by_file = {}
    for (rel, start, end, expect, block) in EDITS:
        by_file.setdefault(rel, []).append((start, end, expect, block))

    # 1) 全量校验（只读，不落盘）
    texts = {}
    ok = True
    for rel, edits in by_file.items():
        text = open(os.path.join(ROOT, rel), "rb").read().decode("utf-8")
        texts[rel] = text
        lines = text.split("\r\n")
        for (start, end, expect, block) in edits:
            seg = "\r\n".join(lines[start - 1:end])
            miss = [s for s in expect if s not in seg]
            if miss:
                print("FAIL %s [%d-%d] 缺少签名: %r | got=%r" % (rel, start, end, miss, seg[:90]))
                ok = False
    if not ok:
        print("RESULT: FAIL（未落盘）")
        sys.exit(1)

    # 2) 应用并写回（CRLF 精确保持）
    for rel, edits in by_file.items():
        lines = texts[rel].split("\r\n")
        edits.sort(key=lambda e: e[0], reverse=True)  # 降序：前面的行号不失效
        for (start, end, expect, block) in edits:
            lines[start - 1:end] = block.split("\n")
            print("PATCH ok: %s [%d-%d]" % (rel, start, end))
        out = "\r\n".join(lines)
        open(os.path.join(ROOT, rel), "wb").write(out.encode("utf-8"))
    print("RESULT: OK all frontend patches applied")


if __name__ == "__main__":
    apply()
