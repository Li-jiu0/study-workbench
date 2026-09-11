(function () {
  'use strict';
  if (window.__IM_LOADED__) return;
  window.__IM_LOADED__ = true;

  // toast 提示（私聊页独立实现，不依赖 app.js）
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);background:#333;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;z-index:9999;transition:transform 0.3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.2);max-width:90%;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.transform = 'translateX(-50%) translateY(-100px)'; }, 2500);
  }
  window.toast = toast;

  // 渲染头像：如果是URL就用img，否则用emoji/文字
  function renderAvatar(avatar, nickname) {
    if (!avatar) {
      return '<span>' + (nickname ? esc(nickname.slice(0, 1)) : '👤') + '</span>';
    }
    // 判断是不是图片URL
    if (/^(https?:|\/uploads\/|data:)/.test(avatar)) {
      var url = avatar.startsWith('http') ? avatar : apiBase() + avatar;
      return '<img src="' + url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    }
    // 否则当emoji/文字
    return '<span>' + esc(avatar) + '</span>';
  }

  var STORAGE_KEY = 'study_im_local_data';
  var AI_CFG_KEY = 'study_workbench_ai_config';

  // 预设AI好友（默认启用2个，其余在AI商店里可选添加）
  var PRESET_FRIENDS = [
    {
      id: 1, nickname: '学习搭子·小星', avatar: '⭐', motto: '一起学习，共同进步！', personality: 'encouraging',
      systemPrompt: '你叫小星，是用户的学习搭子，积极向上、充满正能量。你和用户一起备考四级、行测、央国企笔试等。语气热情鼓励，会主动关心用户的学习进度，看到用户偷懒会温柔提醒，用户取得进步会真心夸奖。回复简洁自然，像身边真实的学习伙伴，不要长篇大论讲道理，多用短句和感叹号，适当用emoji。如果用户问学习问题，给出具体可执行的建议；如果用户闲聊，就轻松回应。'
    },
    {
      id: 8, nickname: 'AI助手·星途', avatar: '🤖', motto: '有什么我可以帮你的？', personality: 'ai',
      systemPrompt: '你是「星途」学习平台的 AI 助手，专业、高效、乐于助人。你擅长回答四级备考、行测技巧、央国企笔试、面试准备、PPT制作、学习方法等方面的问题。语气专业友好，回答结构化（先给结论，再分要点），但不要太生硬。如果用户问学习问题，给出具体可执行的建议；如果用户闲聊，也会友好回应。适当用emoji，但不要过度。回复要实用，不要空泛。'
    }
  ];

  // AI商店：可选添加的AI角色
  var AI_STORE = [
    { id: 101, nickname: '室友·阿杰', avatar: '🎮', motto: '今晚开黑吗？', personality: 'casual',
      systemPrompt: '你叫阿杰，是用户的大学室友，性格随意、接地气、爱打游戏。你和用户住一个宿舍，日常聊游戏、吃饭、逃课、熬夜、女生等话题。语气非常口语化，像真实室友聊天，会用"哈哈""卧槽""兄弟""走啊"等词，回复简短，经常一句话带过。不要太正式，不要讲道理，不要给学习建议（除非用户主动问），就是一个普通室友的感觉。' },
    { id: 102, nickname: '班长·小雨', avatar: '📋', motto: '有通知我会第一时间说', personality: 'formal',
      systemPrompt: '你叫小雨，是用户班级的班长，认真负责、做事有条理。你负责传达学校和学院的通知，组织班级活动，关心同学的学习和生活。语气正式但亲切，像靠谱的学生干部。回复会用"收到""请大家注意""我已经确认过了"等表达。' },
    { id: 103, nickname: '社团好友·小美', avatar: '🎨', motto: '周末一起去看展吧', personality: 'friendly',
      systemPrompt: '你叫小美，是用户在社团认识的好朋友，性格开朗、热爱生活、喜欢艺术和美食。你经常约用户看展、逛街、喝咖啡、拍照。语气友好热情，像闺蜜一样聊天，会用"哇""好棒呀""太可爱了"等表达，适当用emoji。' },
    { id: 104, nickname: '实习同事·老王', avatar: '💼', motto: '有问题随时问我', personality: 'professional',
      systemPrompt: '你叫老王，是用户实习时的同事，职场经验丰富、为人稳重。你比用户大几岁，像职场前辈一样照顾用户，会给用户职场建议、工作技巧、人情世故方面的指导。语气专业但不生硬。' },
    { id: 105, nickname: '高中同学·大刘', avatar: '🏀', motto: '兄弟最近咋样', personality: 'bro',
      systemPrompt: '你叫大刘，是用户的高中同学，铁哥们，性格直爽、讲义气、爱运动。你们一起打球、喝酒、吹牛，关系非常铁。语气豪爽接地气，会用"兄弟""咋了""走一个""包在我身上""必须的"等表达，回复简短有力。' },
    { id: 106, nickname: '图书馆偶遇·小雅', avatar: '📚', motto: '这本书推荐给你', personality: 'gentle',
      systemPrompt: '你叫小雅，是用户在图书馆偶遇认识的朋友，性格温柔安静、爱读书、有文艺气息。你们经常在图书馆一起学习，互相推荐书籍。语气温柔细腻，会用"呢""呀""真的很值得一读"等表达，适当用emoji但不要太多。' }
  ];

  // 用户已添加的AI好友ID（从localStorage读，默认包含预设的1和8）
  function getAddedAiIds() {
    try {
      var saved = JSON.parse(localStorage.getItem('study_im_ai_added') || 'null');
      if (saved && Array.isArray(saved)) return saved;
    } catch (e) {}
    return [1, 8];
  }
  function setAddedAiIds(ids) {
    localStorage.setItem('study_im_ai_added', JSON.stringify(ids));
  }
  // 获取当前启用的AI好友
  function getActiveAiFriends() {
    var added = getAddedAiIds();
    var all = PRESET_FRIENDS.concat(AI_STORE);
    return all.filter(function (f) { return added.indexOf(f.id) !== -1; });
  }

  // 本地演示模式：各性格的回复模板
  var REPLIES = {
    encouraging: ['加油！你一定可以的💪', '今天学习了吗？坚持就是胜利！', '有什么不懂的我们一起讨论呀', '你已经很棒了，继续保持！', '累了就休息一下，劳逸结合嘛'],
    casual: ['哈哈哈哈笑死我了', '今晚有空吗？一起吃饭啊', '你说的这个我也遇到过', '666，厉害啊兄弟', '先不说了，我在打游戏'],
    formal: ['收到，我会尽快处理的', '这个通知我已经转发给大家了', '请问还有什么需要补充的吗？', '好的，我记下了', '这个事情需要和辅导员确认一下'],
    friendly: ['哇！这个好棒啊😍', '周末一起出去玩吧！', '你今天看起来心情不错呀', '这个我也喜欢！我们品味一样', '下次有活动叫上我呀'],
    professional: ['这个问题我建议你这样处理...', '在工作中，沟通很重要', '你可以先整理一下思路，然后再行动', '这个方案我觉得可行，但是需要注意细节', '有问题随时找我，我很乐意帮忙'],
    bro: ['兄弟，最近忙啥呢？', '有空出来喝酒啊', '你说的这个事包在我身上', '哈哈，你还是老样子', '有事说话，兄弟挺你'],
    gentle: ['这本书真的很值得一读呢', '你也喜欢这个作者吗？', '图书馆今天人不多，很安静', '慢慢来，不着急的', '能和你一起讨论书真好'],
    ai: ['我是星途AI助手，有什么可以帮你的吗？', '关于学习问题，我可以给你一些建议', '你可以问我四级备考、行测技巧、PPT制作等问题', '让我想想...这个问题我是这样看的', '希望我的回答对你有帮助！']
  };

  var KEYWORD_REPLIES = [
    { keywords: ['你好', 'hi', 'hello', '在吗'], reply: '你好呀！很高兴和你聊天😊' },
    { keywords: ['四级', '英语', '单词'], reply: '四级备考要坚持每天背单词哦，有什么不懂的可以问我！' },
    { keywords: ['行测', '笔试', '考公'], reply: '行测要多刷题，总结题型规律，加油！' },
    { keywords: ['面试', '简历', '求职'], reply: '面试前要充分准备，多模拟练习，你一定可以的！' },
    { keywords: ['ppt', 'PPT', '演示'], reply: 'PPT制作要简洁大方，一页一个核心观点哦' },
    { keywords: ['谢谢', '感谢', 'thx'], reply: '不客气！能帮到你我很开心😊' },
    { keywords: ['再见', '拜拜', 'bye'], reply: '再见！下次再聊呀👋' },
    { keywords: ['累', '压力', '焦虑'], reply: '累了就休息一下，不要给自己太大压力，你已经很棒了💪' }
  ];

  var S = { tab: 'chats', peer: null, group: null, chats: [], groups: [], presence: {}, msgs: [], myId: 999, aiBusy: false, swipeOpen: null };

  /* ==================== 批次二 需求2（2026-09-11h）：会话列表左滑操作（置顶 / 免打扰 / 删除） ====================
     - 偏好持久化：localStorage key = study_workbench_chat_prefs，形如 { threadKey: {pinned, muted, hidden} }
       （file:// 同源全页共享；纯本地行为，无后端 / 断网时照常可用）。
     - threadKey：服务器私聊 'u<serverId>'；本地/AI 会话 'l<id>'；群聊 'g<id>'。
     - 「删除」仅从本机会话列表隐藏（hidden），云端聊天记录保留；对方再发新消息时自动恢复显示
       （与项目「删除好友默认保留聊天记录」口径一致）。
     - 「免打扰」：行内 🔕 标识，且不计入「会话」tab 顶部未读角标总数。
     - 「置顶」：置顶会话稳定排在列表最前，重启页面后保持（localStorage 持久化）。
     - 触摸左滑 / 桌面右键均可展开操作；点击列表其他位置收起；同一时刻只允许一行展开。 */
  var CHAT_PREFS_KEY = 'study_workbench_chat_prefs';
  function imLoadPrefs() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAT_PREFS_KEY) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }
  function threadKeyOfChat(c) {
    if (!c) return 'l0';
    if (c.__isGroup) return 'g' + c.id;
    if (c.isServer && c.serverId) return 'u' + c.serverId;
    return 'l' + c.id;
  }
  /* 纯函数：按偏好过滤 / 排序会话（抽出来供 jsdom 直接断言）。
     返回新数组：hidden 剔除；pinned 稳定置顶；其余按 time 降序；每项浅拷贝并附 muted/pinned 布尔。 */
  function imApplyChatPrefs(chats, prefs) {
    var visible = [];
    (chats || []).forEach(function (c) {
      var pf = (prefs || {})[threadKeyOfChat(c)] || {};
      if (pf.hidden) return;
      visible.push(Object.assign({}, c, { muted: !!pf.muted, pinned: !!pf.pinned }));
    });
    var byTime = function (a, b) { return (b.time || 0) - (a.time || 0); };
    var pinned = visible.filter(function (c) { return c.pinned; }).sort(byTime);
    var rest = visible.filter(function (c) { return !c.pinned; }).sort(byTime);
    return pinned.concat(rest);
  }
  /* 纯函数：会话 tab 未读角标总数 = 未隐藏、未免打扰会话的 unread 之和（抽出来供 jsdom 直接断言） */
  function imCountUnread(chats, prefs) {
    var total = 0;
    (chats || []).forEach(function (c) {
      var pf = (prefs || {})[threadKeyOfChat(c)] || {};
      if (pf.hidden || pf.muted) return;
      total += (c.unread || 0);
    });
    return total;
  }
  window.imChatPrefs = {
    load: imLoadPrefs,
    threadKeyOf: threadKeyOfChat,
    get: function (k) { return imLoadPrefs()[k] || {}; },
    set: function (k, patch) {
      var p = imLoadPrefs();
      p[k] = Object.assign({}, p[k] || {}, patch);
      try { localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(p)); } catch (e) { }
      return p[k];
    },
    apply: imApplyChatPrefs,
    countUnread: imCountUnread
  };

  function $id(x) { return document.getElementById(x); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function getAiConfig() {
    try { var raw = localStorage.getItem(AI_CFG_KEY); if (raw) return JSON.parse(raw); } catch (e) { }
    return null;
  }
  function loadData() {
    try { var raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) { }
    return { chats: {}, messages: {} };
  }
  function saveData(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { } }
  function getFriend(id) {
    var all = getActiveAiFriends();
    var f = all.find(function (x) { return x.id === id; });
    if (f) return f;
    return SERVER_FRIENDS.find(function (x) { return x.id === id; });
  }

  function getOrCreateChat(friendId) {
    var data = loadData();
    if (!data.chats[friendId]) {
      var friend = getFriend(friendId);
      data.chats[friendId] = { id: friendId, nickname: friend.nickname, avatar: friend.avatar, last: friend.motto, unread: 0, time: Date.now() };
      saveData(data);
    }
    return data.chats[friendId];
  }

  function loadChats() {
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
    }).sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    renderList();
  }

  function renderList() {
    var box = $id('imList');
    if (!box) return;
    if (S.tab === 'chats') renderChats(box);
    else if (S.tab === 'friends') renderFriends(box);
    else renderRequests(box);
  }

  function renderChats(box) {
    var prefs = imLoadPrefs();
    // 需求2：被「删除」的群会话同样仅本机隐藏
    var groups = (S.groups || []).filter(function (g) { return !((prefs['g' + g.id] || {}).hidden); });
    var chatList = imApplyChatPrefs(S.chats, prefs);
    if (chatList.length === 0 && groups.length === 0) { box.innerHTML = '<div class="im-empty2">还没有会话，去好友列表找个朋友聊聊吧</div>'; return; }
    // T4 增量：群聊会话置顶展示（带未读角标）；批次二：包一层 .im-swipe 支持左滑操作
    var groupHtml = groups.map(function (g) {
      var gk = 'g' + g.id;
      var gp = prefs[gk] || {};
      var active = S.group && S.group.id === g.id;
      return '<div class="im-swipe" data-tid="' + esc(gk) + '">' +
        '<div class="im-sess' + (active ? ' on' : '') + '" data-tid="' + esc(gk) + '" onclick="imOpenGroup(' + g.id + ')">' +
        '<div class="im-av" style="position:relative"><span>👥</span>' +
        (g.unreadCount > 0 ? '<span class="im-av-badge">' + (g.unreadCount > 99 ? '99+' : g.unreadCount) + '</span>' : '') + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(g.name) + ' <span style="font-size:11px;color:#999">(' + g.memberCount + ')</span></div>' +
        '<div class="im-sub">' + esc(g.lastMessage ? ((g.lastMessage.senderId === S.myId ? '我：' : '') + previewText(g.lastMessage.kind, g.lastMessage.content)) : '') + '</div></div>' +
        (gp.muted ? '<div class="im-mute-tag" title="免打扰">🔕</div>' : '') +
        (g.unreadCount > 0 ? '<div class="im-badge">' + (g.unreadCount > 99 ? '99+' : g.unreadCount) + '</div>' : '') +
        '</div>' + imSwipeActionsHtml(gk, gp) + '</div>';
    }).join('');
    var chatHtml = chatList.map(function (c) {
      var ck = threadKeyOfChat(c);
      var active = S.peer && S.peer.id === c.id;
      // A2 加固：头像点击不再直接跳对方主页（避免误触），改为提示；点整行才进入会话
      var avClick = c.isServer && c.serverId
        ? 'event.stopPropagation();imShowPeerHint(' + c.serverId + ')'
        : 'event.stopPropagation()';
      // 批次二 需求6：会话列表右侧在线状态。仅服务器会话且 presence 缓存命中时显示（值来自服务端 lastSeenAt）；
      // 无后端 / file:// / 字段缺失时整段为空字符串，绝不显示假时间。
      var p = (c.isServer && c.serverId) ? S.presence[c.serverId] : null;
      var presHtml = (p && presenceText(p.lastSeenAt, p.online))
        ? '<div class="im-presence im-presence-side' + (p.online ? ' on' : '') + '" data-uid="' + c.serverId + '">' + esc(presenceText(p.lastSeenAt, p.online)) + '</div>'
        : '';
      return '<div class="im-swipe" data-tid="' + esc(ck) + '">' +
        '<div class="im-sess' + (active ? ' on' : '') + '" data-tid="' + esc(ck) + '" onclick="imOpenChat(' + c.id + ')">' +
        '<div class="im-av" style="position:relative;cursor:' + (c.isServer ? 'pointer' : 'default') + '" onclick="' + avClick + '">' + renderAvatar(c.avatar, c.nickname) +
        (c.unread > 0 ? '<span class="im-av-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '') + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(c.nickname) + (c.pinned ? ' <span class="im-pin-tag" title="已置顶">📌</span>' : '') + '</div><div class="im-sub">' + esc(c.last || '') + '</div></div>' +
        (c.muted ? '<div class="im-mute-tag" title="免打扰">🔕</div>' : '') +
        presHtml +
        (c.unread > 0 ? '<div class="im-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</div>' : '') +
        '</div>' + imSwipeActionsHtml(ck, prefs[ck] || {}) + '</div>';
    }).join('');
    box.innerHTML = groupHtml + chatHtml;
  }

  /* 单行的左滑操作按钮（置于 .im-swipe 容器内、行内容下层，左滑行内容后露出） */
  function imSwipeActionsHtml(key, pf) {
    pf = pf || {};
    return '<div class="im-swipe-actions">' +
      '<div class="im-sa im-sa-pin" onclick="imSwipeAct(\'' + key + '\',\'pin\')">' + (pf.pinned ? '取消置顶' : '置顶') + '</div>' +
      '<div class="im-sa im-sa-mute" onclick="imSwipeAct(\'' + key + '\',\'mute\')">' + (pf.muted ? '提醒' : '免打扰') + '</div>' +
      '<div class="im-sa im-sa-del" onclick="imSwipeAct(\'' + key + '\',\'del\')">删除</div>' +
      '</div>';
  }

  /* 消息预览文案（A7）：text→原文；image→[图片]；voice→[语音]；未知 kind 一律按文本 */
  function previewText(kind, content) {
    if (kind === 'image') return '[图片]';
    if (kind === 'voice') return '[语音]';
    return content || '';
  }

  /* ==================== 批次二 需求2：左滑展开 / 收起与操作入口 ==================== */
  var SWIPE_PX = 156; // 三个操作按钮总宽（3 × 52px），与 common.css .im-sa 宽度保持一致
  var SW = { x: 0, y: 0, tid: null, dx: 0, tracking: false };

  window.imOpenSwipe = function (tid) {
    S.swipeOpen = tid;
    var box = $id('imList');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.im-swipe'), function (wEl) {
      var open = wEl.getAttribute('data-tid') === tid;
      wEl.classList.toggle('open', open);
      var row = wEl.querySelector('.im-sess');
      if (row) row.style.transform = open ? 'translateX(-' + SWIPE_PX + 'px)' : '';
    });
  };
  window.imCloseSwipe = function () {
    if (!S.swipeOpen) return;
    S.swipeOpen = null;
    var box = $id('imList');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.im-swipe'), function (wEl) {
      wEl.classList.remove('open');
      var row = wEl.querySelector('.im-sess');
      if (row) row.style.transform = '';
    });
  };
  window.imToggleSwipe = function (tid) {
    if (S.swipeOpen === tid) window.imCloseSwipe();
    else window.imOpenSwipe(tid);
  };
  /* 左滑三个操作按钮的统一入口：置顶 / 免打扰 / 删除（均为纯本地偏好写 localStorage + 重渲染） */
  window.imSwipeAct = function (key, act) {
    var cur = imLoadPrefs()[key] || {};
    if (act === 'pin') {
      window.imChatPrefs.set(key, { pinned: !cur.pinned });
      toast(cur.pinned ? '已取消置顶' : '📌 已置顶该会话');
    } else if (act === 'mute') {
      window.imChatPrefs.set(key, { muted: !cur.muted });
      toast(cur.muted ? '已取消免打扰' : '🔕 已免打扰（不计入未读角标）');
    } else if (act === 'del') {
      // 仅从本机会话列表隐藏；云端聊天记录保留，对方再发消息会自动恢复显示
      window.imChatPrefs.set(key, { hidden: true });
      toast('已从列表移除（云端聊天记录保留）');
    }
    S.swipeOpen = null;
    if (S.tab === 'chats') renderChats($id('imList'));
  };
  /* 手势绑定（事件委托在 #imList 上，只需绑一次；触摸左滑 / 桌面右键 / 点击空白收起） */
  function imBindSwipeGestures() {
    var list = $id('imList');
    if (!list || list.getAttribute('data-swipe-bound')) return;
    list.setAttribute('data-swipe-bound', '1');
    list.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      var row = (t && e.target && e.target.closest) ? e.target.closest('.im-sess[data-tid]') : null;
      SW.tracking = !!row;
      SW.tid = row ? row.getAttribute('data-tid') : null;
      SW.x = t ? t.clientX : 0;
      SW.y = t ? t.clientY : 0;
      SW.dx = 0;
    }, { passive: true });
    list.addEventListener('touchmove', function (e) {
      if (!SW.tracking || !SW.tid) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      var dx = t.clientX - SW.x, dy = t.clientY - SW.y;
      if (Math.abs(dy) > Math.abs(dx)) { SW.tracking = false; return; } // 纵向滚动让路
      SW.dx = dx;
      if (dx < 0 && e.cancelable) e.preventDefault(); // 阻止横向滚动，交给滑动展开
      var row = $id('imList').querySelector('.im-sess[data-tid="' + SW.tid + '"]');
      if (row && dx < 0) row.style.transform = 'translateX(' + Math.max(dx, -SWIPE_PX) + 'px)';
    }, { passive: false });
    list.addEventListener('touchend', function () {
      if (SW.tracking && SW.tid) {
        if (SW.dx <= -40) window.imOpenSwipe(SW.tid);
        else window.imCloseSwipe();
      }
      SW.tracking = false;
      SW.dx = 0;
    });
    // 桌面等价入口：右键（长按）展开 / 收起
    list.addEventListener('contextmenu', function (e) {
      var row = (e.target && e.target.closest) ? e.target.closest('.im-sess[data-tid]') : null;
      if (row) { e.preventDefault(); window.imToggleSwipe(row.getAttribute('data-tid')); }
    });
    // 点击空白处 / 其他行收起（捕获阶段拦截，避免同一击又触发进入会话）
    list.addEventListener('click', function (e) {
      if (!S.swipeOpen) return;
      if (e.target && e.target.closest && e.target.closest('.im-sa')) return; // 操作按钮自行处理
      e.stopPropagation();
      window.imCloseSwipe();
    }, true);
  }

  /* A2：点会话头像时的提示（不再误跳对方主页） */
  window.imShowPeerHint = function (serverId) {
    var f = (SERVER_FRIENDS || []).find(function (x) { return x.serverId === serverId; });
    toast('「' + (f ? f.nickname : '好友') + '」点整行开始聊天 · 查看资料请到好友列表');
  };

  // 服务器好友列表缓存
  var SERVER_FRIENDS = [];

  function apiBase() {
    return (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
  }
  function getToken() { return localStorage.getItem('study_workbench_token'); }

  // 加载服务器好友列表
  function loadServerFriends(cb) {
    var token = getToken();
    if (!token) { if (cb) cb([]); return; }
    fetch(apiBase() + '/api/friends', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      SERVER_FRIENDS = (d.items || []).map(function (u) {
        return {
          id: 10000 + u.id,  // 用大ID区分服务器好友
          serverId: u.id,
          nickname: u.nickname || '用户',
          username: u.username || '',
          avatar: u.avatarUrl || '',
          motto: u.motto || '',
          isServer: true
        };
      });
      if (cb) cb(SERVER_FRIENDS);
    })
    .catch(function () { if (cb) cb([]); });
  }

  function renderFriends(box) {
    var token = getToken();
    // AI好友分组（可折叠）
    var activeAi = getActiveAiFriends();
    var aiExpanded = S.aiExpanded !== false; // 默认展开
    var aiArrow = aiExpanded ? '▼' : '▶';
    var aiHtml = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 4px;cursor:pointer" onclick="window.toggleAiGroup()">' +
      '<span style="font-size:13px;font-weight:600;color:#333">🤖 AI伙伴 (' + activeAi.length + ')</span>' +
      '<span style="font-size:11px;color:#999">' + aiArrow + '</span></div>';
    if (aiExpanded) {
      aiHtml += activeAi.map(function (f) {
        return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
          '<div class="im-av">' + f.avatar + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(f.nickname) + '</div><div class="im-sub">' + esc(f.motto) + '</div></div>' +
          '<div style="color:#667eea;font-size:12px;cursor:pointer" onclick="event.stopPropagation();imOpenChat(' + f.id + ')">发消息</div>' +
          '</div>';
      }).join('');
      // 添加AI按钮
      aiHtml += '<div class="im-sess" style="cursor:pointer" onclick="window.openAiStore()">' +
        '<div class="im-av" style="background:#f0f0f0;color:#999">+</div>' +
        '<div class="im-si"><div class="im-n" style="color:#667eea">添加AI伙伴</div><div class="im-sub">选择更多AI角色</div></div>' +
        '</div>';
    }

    var token = getToken();
    if (!token) {
      box.innerHTML = aiHtml + '<div style="font-size:13px;font-weight:600;color:#333;padding:12px 0 4px">👥 注册好友</div><div class="im-empty2">登录后可添加注册用户为好友</div>';
      return;
    }

    box.innerHTML = aiHtml + '<div style="font-size:13px;font-weight:600;color:#333;padding:12px 0 4px">👥 注册好友</div><div class="im-empty2">加载中…</div>';

    loadServerFriends(function (friends) {
      if (friends.length === 0) {
        box.innerHTML = aiHtml + '<div style="font-size:13px;font-weight:600;color:#333;padding:12px 0 4px">👥 注册好友</div><div class="im-empty2">还没有注册好友<br>在上方搜索框输入用户名找人加好友</div>';
        return;
      }
      var srvHtml = friends.map(function (f) {
        var av = f.avatarUrl || f.avatar
          ? '<img src="' + (function(u){ return (u.startsWith('http') ? u : apiBase() + u); })(f.avatarUrl || f.avatar) + '" alt="" style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">'
          : '<span style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">' + esc((f.nickname || '友').slice(0, 1)) + '</span>';
        /* 批次二 需求11（2026-09-11h）：好友行只保留「发消息」，删除好友入口统一收敛到
           对方公开主页（个人中心.html?user=id → api.js renderUserHome 的「🗑 删除好友」，uiConfirm 二次确认）。 */
        return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
          '<div class="im-av" style="position:relative">' + av + '<span class="im-dot" data-uid="' + f.serverId + '"></span></div>' +
          '<div class="im-si"><div class="im-n" style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">' + esc(f.nickname) + ' <span style="font-size:11px;color:#999">@' + esc(f.username) + '</span></div>' +
          '<div class="im-sub">' + esc(f.motto) + ' <span class="im-presence" data-uid="' + f.serverId + '"></span></div></div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
            '<div style="color:#667eea;font-size:12px;cursor:pointer" onclick="event.stopPropagation();imOpenChat(' + f.id + ')">发消息</div>' +
          '</div>' +
          '</div>';
      }).join('');
      box.innerHTML = aiHtml + '<div style="font-size:13px;font-weight:600;color:#333;padding:12px 0 4px">👥 注册好友</div>' + srvHtml;
    });
  }

  /* ============ A5：删除好友（二次确认含昵称；可选清空本机聊天记录） ============ */
  window.imRemoveFriend = function (serverId) {
    var f = (SERVER_FRIENDS || []).find(function (x) { return x.serverId === serverId; });
    var name = f ? f.nickname : '该好友';
    var ov = document.createElement('div');
    ov.className = 'im-overlay';
    ov.innerHTML = '<div class="im-modal">' +
      '<div class="im-modal-head"><div style="font-size:16px;font-weight:700">删除好友</div>' +
      '<div style="cursor:pointer;color:#999;font-size:18px" onclick="this.closest(\'.im-overlay\').remove()">✕</div></div>' +
      '<div class="im-group-body">' +
        '<div style="font-size:14px;line-height:1.7">确定删除好友「<b>' + esc(name) + '</b>」吗？删除后双方互不可见，且无法继续私聊。</div>' +
        '<label class="im-del-row"><input type="checkbox" id="imDelClearLocal"> 同时清空本机聊天记录（服务端历史保留）</label>' +
      '</div>' +
      '<div class="im-group-foot"><button class="btn btn-outline" onclick="this.closest(\'.im-overlay\').remove()">取消</button>' +
      '<button class="btn btn-danger" id="imDelConfirmBtn">🗑 删除</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    bindModalEsc();
    var bt = ov.querySelector('#imDelConfirmBtn');
    if (bt) bt.onclick = function () { imDoRemoveFriend(serverId, ov); };
  };

  function imDoRemoveFriend(serverId, ov) {
    var token = getToken();
    if (!token) { toast('删除好友需要联网'); return; }
    var cb = ov && ov.querySelector('#imDelClearLocal');
    var clearLocal = !!(cb && cb.checked);
    fetch(apiBase() + '/api/friends/' + serverId, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (!res.ok) { toast((res.d && res.d.detail) || '删除失败'); return; }
      if (clearLocal) {
        var fid = 10000 + Number(serverId);
        var data = loadData();
        if (data.messages) delete data.messages[fid];
        if (data.chats) delete data.chats[fid];
        saveData(data);
        if (S.peer && S.peer.id === fid) backToList();
      }
      if (ov) ov.remove();
      unbindModalEscIfIdle();
      toast('🗑 已删除好友');
      loadServerFriends(function () {
        if (S.tab === 'friends') renderFriends($id('imList'));
      });
      loadChats();
    })
    .catch(function (e) { toast('删除失败：' + (e.message || '网络错误')); });
  }

  // 折叠/展开AI分组
  window.toggleAiGroup = function () {
    S.aiExpanded = S.aiExpanded === false;
    renderFriends($id('imList'));
  };

  // AI商店弹窗
  window.openAiStore = function () {
    var added = getAddedAiIds();
    var storeHtml = AI_STORE.map(function (a) {
      var isAdded = added.indexOf(a.id) !== -1;
      return '<div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #f0f0f0">' +
        '<div style="width:44px;height:44px;border-radius:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:22px;margin-right:12px">' + a.avatar + '</div>' +
        '<div style="flex:1"><div style="font-size:14px;font-weight:500">' + esc(a.nickname) + '</div>' +
        '<div style="font-size:12px;color:#999">' + esc(a.motto) + '</div></div>' +
        (isAdded
          ? '<button style="font-size:12px;padding:4px 12px;border:1px solid #ddd;background:#fff;color:#999;border-radius:6px" onclick="toggleAiFriend(' + a.id + ')">已添加</button>'
          : '<button style="font-size:12px;padding:4px 12px;border:none;background:#07c160;color:#fff;border-radius:6px" onclick="toggleAiFriend(' + a.id + ')">添加</button>') +
        '</div>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:9998;display:flex;align-items:flex-end;';
    overlay.innerHTML = '<div style="background:#fff;width:100%;max-width:500px;margin:0 auto;border-radius:16px 16px 0 0;max-height:70vh;overflow-y:auto;padding:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<div style="font-size:16px;font-weight:600">AI商店</div>' +
      '<div style="font-size:20px;cursor:pointer;color:#999" onclick="this.closest(\'div[style*=fixed]\').remove()">✕</div></div>' +
      storeHtml + '</div>';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  };

  window.toggleAiFriend = function (id) {
    var ids = getAddedAiIds();
    var idx = ids.indexOf(id);
    if (idx >= 0) {
      ids.splice(idx, 1);
      toast('已移除');
    } else {
      ids.push(id);
      toast('已添加');
    }
    setAddedAiIds(ids);
    // 刷新弹窗
    var old = document.querySelector('div[style*="z-index: 9998"]');
    if (old) old.remove();
    window.openAiStore();
    // 刷新好友列表
    renderFriends($id('imList'));
  };

  /* 需求1（2026-09-11h）：申请 tab 角标值计算与应用（抽出为全局函数，jsdom 可直接断言）。
     新后端优先消费 unreadCount 水位线；旧后端无该字段 → 回退为 incoming.length（旧行为）。 */
  window.imApplyRequestBadge = function (rd) {
    var n = (rd && typeof rd.unreadCount === 'number') ? rd.unreadCount : ((rd && rd.incoming) ? rd.incoming.length : 0);
    updateTabBadge('requests', n);
    return n;
  };

  /* 需求1（2026-09-11h）：申请列表成功渲染（用户已真正看到列表）后，把「已读水位线」推到服务端。
     - 只在打开/渲染申请列表时触发（renderRequests 内），绝不在 5s 轮询里调，避免高频打接口；
     - POST /api/friends/requests/seen 幂等，可安全重复调用；
     - 失败静默降级：不弹错误 toast、不影响列表渲染，下一次轮询会拿到旧值，行为退化为现状。 */
  function markRequestsSeen(token, apiBase) {
    fetch(apiBase + '/api/friends/requests/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        updateTabBadge('requests', (d && typeof d.unreadCount === 'number') ? d.unreadCount : 0);
      })
      .catch(function () { /* 静默降级：不打扰用户 */ });
  }

  function renderRequests(box) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
    if (!token) {
      box.innerHTML = '<div class="im-empty2">暂无好友申请<br><span style="font-size:12px;color:#999">登录后可添加注册用户为好友</span></div>';
      return;
    }
    box.innerHTML = '<div class="im-empty2">加载中…</div>';
    fetch(API_BASE + '/api/friends/requests', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var inc = d.incoming || [];
      var out = d.outgoing || [];
      // 需求1：列表数据已成功取回并即将渲染（含空列表，用户都算看到了）→ 推已读水位线
      markRequestsSeen(token, API_BASE);
      var all = inc.concat(out);
      if (all.length === 0) {
        box.innerHTML = '<div class="im-empty2">暂无好友申请<br><span style="font-size:12px;color:#999">在上方搜索框输入用户名找人加好友</span></div>';
        return;
      }
      // 状态标签
      function statusTag(st, fromMe) {
        if (st === 'pending') return fromMe
          ? '<span style="font-size:11px;color:#e6a23c">⏳ 已发出</span>'
          : '<span style="font-size:11px;color:#409eff">📩 待处理</span>';
        if (st === 'accepted') return '<span style="font-size:11px;color:#67c23a">✅ 已同意</span>';
        if (st === 'declined') return '<span style="font-size:11px;color:#909399">❌ 已拒绝</span>';
        return '';
      }
      // 操作按钮
      function actionBtns(r) {
        if (r.fromMe) {
          // 我发出的：只能删除
          return '<button class="btn" style="font-size:12px;padding:4px 10px;background:#f56c6c;color:#fff" onclick="imDeleteRequest(' + r.id + ')">删除</button>';
        }
        if (r.status === 'pending') {
          // 收到的待处理：同意/拒绝/删除
          return '<button class="btn btn-primary" style="font-size:12px;padding:4px 10px;margin-right:4px" onclick="imAcceptRequest(' + r.id + ')">同意</button>' +
            '<button class="btn" style="font-size:12px;padding:4px 10px;background:#eee;color:#666" onclick="imDeclineRequest(' + r.id + ')">拒绝</button>';
        }
        // 收到的已处理：只能删除
        return '<button class="btn" style="font-size:12px;padding:4px 10px;background:#f56c6c;color:#fff" onclick="imDeleteRequest(' + r.id + ')">删除</button>';
      }
      box.innerHTML = all.map(function (r) {
        var u = r.user || {};
        var av = (u.avatarUrl && /^(https?:|\/uploads\/|data:)/.test(u.avatarUrl))
          ? '<img src="' + (u.avatarUrl.startsWith('http') ? u.avatarUrl : API_BASE + u.avatarUrl) + '" alt="">'
          : esc((u.nickname || '友').slice(0, 1));
        var me = r.fromMe ? ' <span style="font-size:11px;color:#999">（我发出的）</span>' : '';
        return '<div class="im-sess">' +
          '<div class="im-av">' + av + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(u.nickname || '用户') + me + ' <span style="font-size:11px;color:#999">@' + esc(u.username || '') + '</span> ' + statusTag(r.status, r.fromMe) + '</div>' +
          '<div class="im-sub">' + esc(u.motto || '') + '</div></div>' +
          actionBtns(r) +
          '</div>';
      }).join('');
    })
    .catch(function (e) {
      box.innerHTML = '<div class="im-empty2">加载失败：' + esc(e.message || '网络错误') + '</div>';
    });
  }

  // 删除好友申请记录
  window.imDeleteRequest = function (rid) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
    if (!confirm('确定删除这条申请记录吗？')) return;
    fetch(API_BASE + '/api/friends/requests/' + rid, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.json(); })
    .then(function () { toast('已删除'); renderRequests($id('imList')); })
    .catch(function (e) { toast('失败：' + (e.message || '')); });
  }

  // 同意/拒绝好友申请
  window.imAcceptRequest = function (rid) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
    fetch(API_BASE + '/api/friends/requests/' + rid + '/accept', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.json(); })
    .then(function () { toast('✅ 已加为好友'); renderRequests($id('imList')); loadChats(); })
    .catch(function (e) { toast('失败：' + (e.message || '')); });
  };
  window.imDeclineRequest = function (rid) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
    fetch(API_BASE + '/api/friends/requests/' + rid + '/decline', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function () { toast('已拒绝'); renderRequests($id('imList')); })
    .catch(function (e) { toast('失败：' + (e.message || '')); });
  };

  // 打开聊天（适配当前 HTML：imConv 容器默认隐藏，需要显示）
  window.imOpenChat = function (friendId) {
    var friend = getFriend(friendId);
    if (!friend) return;
    S.peer = friend;
    getOrCreateChat(friendId);

    var data = loadData();
    if (data.chats[friendId]) { data.chats[friendId].unread = 0; saveData(data); }

    S.msgs = (data.messages[friendId] || []).map(function (m, i) {
      return { id: i + 1, senderId: m.senderId, content: m.content, kind: m.kind, time: m.time, duration: m.duration };
    });

    // 显示聊天区域，隐藏空状态
    var empty = $id('imEmpty');
    if (empty) empty.style.display = 'none';
    var conv = $id('imConv');
    if (conv) conv.style.display = 'flex';

    document.body.classList.add('im-mobile');

    renderChatHeader();
    renderMsgs();
    renderList();

    // 服务器好友：从服务器加载历史消息，并标记已读
    if (S.peer.isServer && getToken()) {
      fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50', {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = d.items || [];
        if (items.length > 0) {
          S.msgs = items.map(function (m) {
            return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };
          });
          renderMsgs();
          // 标记最后一条消息为已读
          var lastMsg = items[items.length - 1];
          if (lastMsg) {
            fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
              body: JSON.stringify({ upToId: lastMsg.id })
            }).catch(function () {});
          }
        }
        // 清除本地未读计数
        var chat = S.chats.find(function (c) { return c.id === S.peer.id; });
        if (chat) { chat.unread = 0; }
        renderList();
        // 立即刷新顶栏 💬 角标（不用等 30s 轮询）
        if (typeof window.loadChatUnread === 'function') window.loadChatUnread();
      })
      .catch(function () {});
    }

    // 聚焦输入框
    var inp = $id('imInput');
    if (inp) setTimeout(function () { inp.focus(); }, 100);
  };

  // 渲染聊天头部（适配当前 HTML：操作 imCAv/imCName/imBack 元素）
  function renderChatHeader() {
    var avEl = $id('imCAv');
    var nameEl = $id('imCName');
    if (S.group) {
      // T4 增量：群会话头部（群名 + 成员数）
      if (avEl) avEl.innerHTML = '<span>👥</span>';
      if (nameEl) nameEl.innerHTML = esc(S.group.name) +
        '<span style="font-size:10px;color:#667eea;background:#EEF1FF;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:400">' + esc(String(S.group.memberCount || '')) + '人群</span>';
      var backBtn = $id('imBack');
      if (backBtn) backBtn.style.display = window.innerWidth <= 760 ? 'block' : 'none';
      return;
    }
    if (avEl) avEl.innerHTML = renderAvatar(S.peer.avatar, S.peer.nickname);
    var nameEl = $id('imCName');
    if (nameEl) {
      var aiCfg = getAiConfig();
      var tag = aiCfg && aiCfg.apiKey
        ? '<span style="font-size:10px;color:#4caf50;background:#E8F5E9;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:400">AI在线</span>'
        : '<span style="font-size:10px;color:#ff9800;background:#FFF3E0;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:400">演示模式</span>';
      nameEl.innerHTML = esc(S.peer.nickname) + tag;
    }
    // 手机端显示返回按钮
    var backBtn = $id('imBack');
    if (backBtn) backBtn.style.display = window.innerWidth <= 760 ? 'block' : 'none';
  }

  // 返回会话列表（适配当前 HTML：隐藏 imConv，显示 imEmpty）
  function backToList() {
    document.body.classList.remove('im-mobile');
    S.peer = null;
    S.group = null; // T4 增量：退出群会话状态
    var conv = $id('imConv');
    if (conv) conv.style.display = 'none';
    var empty = $id('imEmpty');
    if (empty) empty.style.display = 'flex';
  }
  window.imBackToList = backToList;
  window.imBackList = backToList; // 兼容 HTML 里的 imBackList()

  // 消息文本渲染（T4 增量）：先 esc 再把 [emoji:xx] 替换为表情字符（防注入：先转义后替换）
  function renderContent(text) {
    var safe = esc(text);
    return safe.replace(/\[emoji:([a-zA-Z0-9_]+)\]/g, function (all, code) {
      var item = (window.STUDY_EMOJI && window.STUDY_EMOJI.map) ? window.STUDY_EMOJI.map[code] : null;
      return item ? '<span class="im-emoji">' + item.char + '</span>' : all;
    });
  }

  function renderMsgs() {
    var box = $id('imMsgs');
    if (!box) return;
    var title = S.group ? S.group.name : (S.peer ? S.peer.nickname : '好友');
    if (S.msgs.length === 0) {
      box.innerHTML = '<div class="im-empty2">开始和' + esc(title) + '聊天吧</div>';
      return;
    }
    var isGroup = !!S.group;
    box.innerHTML = S.msgs.map(function (m) {
      var isMe = m.senderId === S.myId;
      var time = new Date(m.time);
      var timeStr = isNaN(time) ? '' : time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');
      // 已读角标（T4 增量）：仅服务器私聊消息展示 ✓已发送 / ✓✓已读
      var readTag = '';
      if (isMe && !isGroup && m.server) {
        readTag = '<div class="im-read' + (m.read ? ' ok' : '') + '">' + (m.read ? '✓✓ 已读' : '✓ 已发送') + '</div>';
      }
      var body;
      if (m.kind === 'image') {
        var src = /^(https?:|data:)/.test(m.content) ? m.content : apiBase() + m.content;
        body = '<div class="im-m ' + (isMe ? 'me' : 'ot') + '" data-mid="' + esc(m.id || '') + '"><img src="' + esc(src) + '" style="max-width:200px;border-radius:8px"><div class="im-mt">' + timeStr + '</div>' + readTag + '</div>';
      } else if (m.kind === 'voice') {
        // A7：语音条（点击播放/暂停/续播；进度条随时间更新；显示时长）
        var vsrc = /^(https?:|data:)/.test(m.content) ? m.content : apiBase() + m.content;
        body = '<div class="im-m ' + (isMe ? 'me' : 'ot') + '" data-mid="' + esc(m.id || '') + '">' +
          '<div class="im-voice" onclick="imTogglePlayVoice(this,this.dataset.src)" data-src="' + esc(vsrc) + '">' +
          '<span class="im-voice-ic">▶</span><span class="im-voice-bar"><i></i></span>' +
          '<span class="im-voice-dur">' + (m.duration ? m.duration + '″' : '语音') + '</span></div>' +
          '<div class="im-mt">' + timeStr + '</div>' + readTag + '</div>';
      } else {
        body = '<div class="im-m ' + (isMe ? 'me' : 'ot') + '" data-mid="' + esc(m.id || '') + '">' + renderContent(m.content) + '<div class="im-mt">' + timeStr + '</div>' + readTag + '</div>';
      }
      // 群聊：他人消息左侧加发送者小头像 + 昵称（自己的消息保持右侧绿底）
      // 批次二 需求9（2026-09-11h）：头像/昵称点击 → 打开该用户公开主页（复用 api.js openUserHome，
      // 与私聊好友列表点头像行为一致；非好友主页只有「加为好友」，好友主页有「发消息」；
      // 自己的消息本就不渲染头像/昵称，点击自己头像的场景不存在，无异常路径）。
      // stopPropagation 防止冒泡触发消息区其他行为。
      if (isGroup && !isMe) {
        var uhClick = 'event.stopPropagation();openUserHome(' + Number(m.senderId || 0) + ')';
        var av = '<div class="im-gav" style="cursor:pointer" onclick="' + uhClick + '">' + renderAvatar(m.senderAvatar, m.senderNickname) + '</div>';
        var name = '<div class="im-gsender" style="cursor:pointer" onclick="' + uhClick + '">' + esc(m.senderNickname || '') + '</div>';
        return '<div class="im-grow">' + av + '<div class="im-gcol">' + name + body + '</div></div>';
      }
      return body;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  /* 【后续扩展点：群消息逐人已读回执】群内只保证自己未读数准确（last_read_msg_id 游标），不渲染逐条已读。 */
  function groupReadReceipt() { /* 空实现：预留群已读回执扩展 */ }

  // 发送图片（适配 HTML 里的 imSendImage(this)）
  window.imSendImage = function (input) {
    if (!S.peer || !input.files || !input.files[0]) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var now = Date.now();
      var msg = { id: S.msgs.length + 1, senderId: S.myId, content: dataUrl, kind: 'image', time: now };
      S.msgs.push(msg);
      var data = loadData();
      if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
      data.messages[S.peer.id].push({ senderId: S.myId, content: dataUrl, kind: 'image', time: now });
      data.chats[S.peer.id].last = '[图片]';
      data.chats[S.peer.id].time = now;
      saveData(data);
      renderMsgs();
      loadChats();
      input.value = '';
      // 图片也触发 AI 回复
      triggerAiReply('发了一张图片');
    };
    reader.readAsDataURL(file);
  };

  /* ==================== A7（2026-09-11）：语音消息（录制 / 上传 / 播放 / 降级） ====================
     约束：≤60s 自动停、≤2MB；在线走 POST /api/uploads/voice 上传后发 kind=voice；
     离线（无 token）存 dataURL 到 study_im_local_data（仅本地）；环境不支持时优雅降级。 */
  var VR = { rec: null, chunks: [], start: 0, timer: null, stream: null };
  var MAX_VOICE_MS = 60000;
  var MAX_VOICE_BYTES = 2 * 1024 * 1024;

  function voiceSupported() {
    return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.Blob);
  }

  window.imToggleRecord = function () {
    if (!voiceSupported()) { toast('当前环境不支持录音，请用 Chrome 并检查麦克风权限'); return; }
    if (S.group) { toast('语音消息仅支持私聊'); return; }
    if (!S.peer) { toast('请先选择一位好友再录音'); return; }
    if (VR.rec && VR.rec.state === 'recording') { imStopRecord(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        VR.stream = stream;
        var mime = '';
        var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
        for (var i = 0; i < cands.length; i++) {
          if (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cands[i])) { mime = cands[i]; break; }
        }
        try { VR.rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
        catch (e) { VR.rec = new MediaRecorder(stream); }
        VR.chunks = [];
        VR.start = Date.now();
        VR.rec.ondataavailable = function (e) { if (e.data && e.data.size) VR.chunks.push(e.data); };
        VR.rec.onstop = onRecordStop;
        VR.rec.start();
        toast('🎤 录音中…再次点击结束（最长 60 秒）');
        VR.timer = setTimeout(function () { imStopRecord(); }, MAX_VOICE_MS);
      })
      .catch(function () { toast('无法访问麦克风，请检查权限'); });
  };

  function imStopRecord() {
    if (VR.timer) { clearTimeout(VR.timer); VR.timer = null; }
    if (VR.rec && VR.rec.state === 'recording') { try { VR.rec.stop(); } catch (e) { } }
  }

  function onRecordStop() {
    var dur = Math.max(1, Math.round((Date.now() - VR.start) / 1000));
    var type = (VR.rec && VR.rec.mimeType) || 'audio/webm';
    var blob = new Blob(VR.chunks, { type: type });
    if (VR.stream) { VR.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { } }); VR.stream = null; }
    VR.rec = null; VR.chunks = [];
    if (!blob.size) { toast('录音失败，请重试'); return; }
    if (blob.size > MAX_VOICE_BYTES) { toast('语音超过 2MB，请录短一点'); return; }
    if (S.peer && S.peer.isServer && getToken()) {
      uploadVoice(blob, dur);
    } else {
      var rd = new FileReader();
      rd.onload = function (e) { sendVoiceLocal(e.target.result, dur); };
      rd.readAsDataURL(blob);
    }
  }

  function uploadVoice(blob, dur) {
    var fd = new FormData();
    var ext = blob.type.indexOf('ogg') >= 0 ? 'ogg' : (blob.type.indexOf('mp4') >= 0 ? 'm4a' : 'webm');
    fd.append('file', blob, 'voice.' + ext);
    fetch(apiBase() + '/api/uploads/voice', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.url) { toast((res.d && res.d.detail) || '语音上传失败'); return; }
        postVoiceMsg(res.d.url, dur);
      })
      .catch(function (e) { toast('语音上传失败：' + (e.message || '网络错误')); });
  }

  function postVoiceMsg(url, dur) {
    var now = Date.now();
    S.msgs.push({ id: S.msgs.length + 1, senderId: S.myId, content: url, kind: 'voice', time: now, duration: dur });
    renderMsgs();
    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ content: url, kind: 'voice' })
    })
      .then(function (r) { return r.json(); })
      .then(function (m) {
        if (m && m.id) {
          S.msgs.push({ id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read, duration: dur });
          renderMsgs();
        }
        fetchPeerMsgs(true);
      })
      .catch(function () { });
  }

  function sendVoiceLocal(dataUrl, dur) {
    var now = Date.now();
    S.msgs.push({ id: S.msgs.length + 1, senderId: S.myId, content: dataUrl, kind: 'voice', time: now, duration: dur });
    var data = loadData();
    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
    data.messages[S.peer.id].push({ senderId: S.myId, content: dataUrl, kind: 'voice', time: now, duration: dur });
    if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};
    data.chats[S.peer.id].last = '[语音]';
    data.chats[S.peer.id].time = now;
    saveData(data);
    renderMsgs();
    loadChats();
  }

  // 语音播放：单例 Audio，播放/暂停/续播互斥，进度条随 timeupdate 更新
  var _va = null, _vaEl = null;
  window.imTogglePlayVoice = function (el, src) {
    if (!src) return;
    if (_va && _vaEl === el && !_va.paused) { _va.pause(); return; }
    if (_va) { try { _va.pause(); } catch (e) { } }
    if (!_va || _va.src !== src) { _va = new Audio(src); }
    _vaEl = el;
    var ic = el.querySelector('.im-voice-ic');
    var bar = el.querySelector('.im-voice-bar i');
    _va.onplay = function () { el.classList.add('playing'); if (ic) ic.textContent = '⏸'; };
    _va.onpause = function () { el.classList.remove('playing'); if (ic) ic.textContent = '▶'; };
    _va.onended = function () { el.classList.remove('playing'); if (ic) ic.textContent = '▶'; if (bar) bar.style.width = '0'; };
    _va.ontimeupdate = function () { if (bar && _va.duration) bar.style.width = Math.round(_va.currentTime / _va.duration * 100) + '%'; };
    _va.play().catch(function () { toast('无法播放语音'); });
  };

  function generateDemoReply(text, personality) {
    var lowerText = text.toLowerCase();
    for (var i = 0; i < KEYWORD_REPLIES.length; i++) {
      var kr = KEYWORD_REPLIES[i];
      for (var j = 0; j < kr.keywords.length; j++) {
        if (lowerText.indexOf(kr.keywords[j].toLowerCase()) !== -1) return kr.reply;
      }
    }
    var replies = REPLIES[personality] || REPLIES.ai;
    return replies[Math.floor(Math.random() * replies.length)];
  }

  function callFriendAi(friend, historyMsgs, callback) {
    var aiCfg = getAiConfig();
    if (!aiCfg || !aiCfg.apiKey || !aiCfg.baseUrl) {
      var lastUserText = '';
      for (var i = historyMsgs.length - 1; i >= 0; i--) {
        if (historyMsgs[i].role === 'user') { lastUserText = historyMsgs[i].content; break; }
      }
      setTimeout(function () { callback(generateDemoReply(lastUserText, friend.personality)); }, 800 + Math.random() * 1200);
      return;
    }
    var messages = [{ role: 'system', content: friend.systemPrompt }];
    historyMsgs.slice(-12).forEach(function (m) { messages.push({ role: m.role, content: m.content }); });
    var reqBody = { model: aiCfg.model || 'deepseek-chat', messages: messages, stream: false };
    fetch(aiCfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiCfg.apiKey },
      body: JSON.stringify(reqBody)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('HTTP ' + res.status + '：' + (t || '').slice(0, 200)); });
      return res.json();
    }).then(function (data) {
      var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      callback(reply ? reply.trim() : '（AI 返回了空回复，请检查模型名是否正确）');
    }).catch(function (err) {
      var lastUserText = '';
      for (var i = historyMsgs.length - 1; i >= 0; i--) {
        if (historyMsgs[i].role === 'user') { lastUserText = historyMsgs[i].content; break; }
      }
      callback(generateDemoReply(lastUserText, friend.personality) + '\n\n（AI 连接失败，已切换为本地演示回复。请到「设置 → AI 服务商配置」检查密钥/地址。）');
    });
  }

  // 触发 AI 回复（共用逻辑，文字和图片发送后都调用）
  function triggerAiReply(lastText) {
    if (S.aiBusy) return;
    S.aiBusy = true;

    var typingEl = document.createElement('div');
    typingEl.id = 'typingIndicator';
    typingEl.className = 'im-m ot';
    typingEl.innerHTML = '<span style="display:inline-block;animation:typing 1.4s infinite">正在输入...</span>';
    var box = $id('imMsgs');
    if (box) { box.appendChild(typingEl); box.scrollTop = box.scrollHeight; }

    var historyMsgs = S.msgs.map(function (m) {
      return { role: m.senderId === S.myId ? 'user' : 'assistant', content: m.kind === 'image' ? '[图片]' : m.content };
    });

    callFriendAi(S.peer, historyMsgs, function (reply) {
      var typing = document.getElementById('typingIndicator');
      if (typing) typing.remove();
      var replyTime = Date.now();
      var replyMsg = { id: S.msgs.length + 1, senderId: S.peer.id, content: reply, kind: 'text', time: replyTime };
      S.msgs.push(replyMsg);
      var data2 = loadData();
      data2.messages[S.peer.id].push({ senderId: S.peer.id, content: reply, kind: 'text', time: replyTime });
      data2.chats[S.peer.id].last = reply;
      data2.chats[S.peer.id].time = replyTime;
      saveData(data2);
      S.aiBusy = false;
      renderMsgs();
      loadChats();
    });
  }

  // 发送文字消息
  window.imSendText = function () {
    if (S.aiBusy) return;
    var inp = $id('imInput');
    var text = (inp.value || '').trim();
    if (!text) return;
    // T4 增量：群会话发送分支
    if (S.group) { imSendGroupText(text); return; }
    if (!S.peer) return;
    inp.value = '';

    var now = Date.now();
    var msg = { id: S.msgs.length + 1, senderId: S.myId, content: text, kind: 'text', time: now };
    S.msgs.push(msg);

    var data = loadData();
    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
    data.messages[S.peer.id].push({ senderId: S.myId, content: text, kind: 'text', time: now });
    if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};
    data.chats[S.peer.id].last = text;
    data.chats[S.peer.id].time = now;
    data.chats[S.peer.id].nickname = S.peer.nickname;
    data.chats[S.peer.id].avatar = S.peer.avatar;
    saveData(data);

    renderMsgs();
    loadChats();

    // 服务器好友：调 API 发消息，不触发本地 AI 回复
    if (S.peer.isServer) {
      var token = getToken();
      if (token) {
        fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ content: text, kind: 'text' })
        })
        .then(function (r) { return r.json(); })
        .then(function (m) {
          // T4 增量：发送成功即本地渲染（带 server 标记，等待对方已读）
          if (m && m.id) {
            S.msgs.push({ id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read });
            renderMsgs();
          }
          // 发送后立即拉取一次消息列表 + 未读（不等下一轮轮询）
          fetchPeerMsgs(true);
          if (typeof window.loadChatUnread === 'function') window.loadChatUnread();
        })
        .catch(function () {});
      }
      return;
    }

    triggerAiReply(text);
  };

  window.imSwitchTab = function (tab) {
    S.tab = tab;
    document.querySelectorAll('.im-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });
    renderList();
    // 批次二 需求6：切到会话/好友 tab 时立即拉一次在线状态（批量单请求），不等 30s 轮询
    if (tab === 'chats' || tab === 'friends') refreshPresence();
  };

  window.imDoSearch = function () {
    var inp = $id('imSearch');
    var keyword = (inp.value || '').trim().toLowerCase();
    if (!keyword) { loadChats(); return; }
    var box = $id('imList');

    // 1. 搜预设 AI 好友
    var presetResults = getActiveAiFriends().filter(function (f) {
      return f.nickname.toLowerCase().indexOf(keyword) !== -1 || f.motto.toLowerCase().indexOf(keyword) !== -1;
    });

    // 2. 同时搜服务器注册用户（如果已登录）
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));

    if (!token) {
      // 未登录，只显示预设好友
      if (presetResults.length === 0) { box.innerHTML = '<div class="im-empty2">没有找到相关好友<br><span style="font-size:11px">登录后可搜索其他注册用户</span></div>'; return; }
      box.innerHTML = presetResults.map(function (f) {
        return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
          '<div class="im-av">' + f.avatar + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(f.nickname) + '</div><div class="im-sub">' + esc(f.motto) + '</div></div>' +
          '</div>';
      }).join('');
      return;
    }

    // 已登录，先显示预设好友，再异步加载服务器搜索结果
    var html = presetResults.map(function (f) {
      return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
        '<div class="im-av">' + f.avatar + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(f.nickname) + '</div><div class="im-sub">' + esc(f.motto) + '</div></div>' +
        '</div>';
    }).join('');
    box.innerHTML = html + '<div class="im-empty2">🔍 正在搜索注册用户…</div>';

    fetch(API_BASE + '/api/friends/search?q=' + encodeURIComponent(keyword), {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var serverUsers = data.items || [];
      if (serverUsers.length === 0) {
        if (presetResults.length === 0) {
          box.innerHTML = '<div class="im-empty2">没有找到相关好友</div>';
        } else {
          // 保留预设好友结果
          box.innerHTML = html + '<div class="im-empty2" style="padding:8px">服务器上没有找到匹配的注册用户</div>';
        }
        return;
      }
      var serverHtml = imRenderFriendRows(serverUsers);
      box.innerHTML = (presetResults.length ? '<div style="font-size:11px;color:#999;padding:8px 0 4px">🤖 AI好友</div>' + html : '') +
        (serverUsers.length ? '<div style="font-size:11px;color:#999;padding:8px 0 4px">👥 注册用户</div>' + serverHtml : '');
    })
    .catch(function (e) {
      if (presetResults.length === 0) {
        box.innerHTML = '<div class="im-empty2">搜索失败：' + esc(e.message || '网络错误') + '</div>';
      }
    });
  };

  // 加服务器用户为好友
  window.imAddServerFriend = function (uid) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
    if (!token) { toast('请先登录'); return; }
    fetch(API_BASE + '/api/friends/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ toUserId: uid })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.autoAccepted) {
        toast('✅ 你们已是好友，可以聊天了');
      } else if (d.ok) {
        toast('✅ 好友申请已发送，等待对方同意');
      } else {
        toast(d.detail || '操作失败');
      }
    })
    .catch(function (e) { toast('失败：' + (e.message || '网络错误')); });
  };

  /* ==================== A3（2026-09-11）：加好友模态 + 公共结果行渲染 ====================
     状态判定统一规则（三处复用：本页模态 / 页面内搜索 / 旧整页 好友申请.html）：
       isFriend → 「发消息」；已发送(requested) → 禁灰「已发送」；
       blockedMe → 禁灰「不可添加」；否则 → 「加好友」。 */
  function imRenderFriendRows(items) {
    items = items || [];
    if (!items.length) return '<div class="im-empty2">没有找到用户，试试别的关键词</div>';
    return items.map(function (u) {
      var av = (u.avatarUrl && /^(https?:|\/uploads\/|data:)/.test(u.avatarUrl))
        ? '<img src="' + (u.avatarUrl.indexOf('http') === 0 ? u.avatarUrl : apiBase() + u.avatarUrl) + '" alt="">'
        : esc((u.nickname || '友').slice(0, 1));
      var act;
      if (u.isFriend) {
        act = '<button class="im-af-btn" onclick="window.imAfOpenChat(' + u.id + ')">💬 发消息</button>';
      } else if (u.requested) {
        act = '<button class="im-af-btn gray" disabled>已发送</button>';
      } else if (u.blockedMe) {
        act = '<button class="im-af-btn gray" disabled>不可添加</button>';
      } else {
        act = '<button class="im-af-btn" onclick="window.imAfSendRequest(' + u.id + ',this)">➕ 加好友</button>';
      }
      return '<div class="im-sess">' +
        '<div class="im-av">' + av + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(u.nickname || '用户') + ' <span style="font-size:11px;color:#999">@' + esc(u.username || '') + '</span></div>' +
        '<div class="im-sub">' + esc(u.motto || '') + '</div></div>' + act + '</div>';
    }).join('');
  }
  window.imRenderFriendRows = imRenderFriendRows;

  // 打开「添加好友」模态（与群聊弹层同源；离线置灰）
  window.imOpenAddFriendModal = function () {
    if (!getToken()) { toast('加好友需要联网，请先登录'); return; }
    var m = $id('imAddFriendModal');
    if (!m) { location.href = '好友申请.html'; return; } // 兼容：新页未加载时回退旧整页
    var q = $id('imAfInput'); if (q) q.value = '';
    var res = $id('imAfResults'); if (res) res.innerHTML = '<div class="im-empty2">输入昵称或 @账号开始搜索</div>';
    m.style.display = 'flex';
    bindModalEsc();
    if (q) setTimeout(function () { q.focus(); }, 60);
  };
  window.imCloseAddFriendModal = function () {
    var m = $id('imAddFriendModal');
    if (m) m.style.display = 'none';
    unbindModalEscIfIdle();
  };

  // 搜索（300ms 防抖）
  var _afTimer = null;
  window.imAfSearch = function (kw) {
    var res = $id('imAfResults');
    if (!res) return;
    clearTimeout(_afTimer);
    var q = (kw || '').trim();
    if (!q) { res.innerHTML = '<div class="im-empty2">输入昵称或 @账号开始搜索</div>'; return; }
    _afTimer = setTimeout(function () {
      res.innerHTML = '<div class="im-empty2">搜索中…</div>';
      fetch(apiBase() + '/api/friends/search?q=' + encodeURIComponent(q), {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { res.innerHTML = imRenderFriendRows(d.items || []); })
        .catch(function (e) { res.innerHTML = '<div class="im-empty2">搜索失败：' + esc(e.message || '网络错误') + '</div>'; });
    }, 300);
  };

  // 发好友申请（保持在模态内，不改整页）
  window.imAfSendRequest = function (uid, btn) {
    var token = getToken();
    if (!token) { toast('加好友需要联网，请先登录'); return; }
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    fetch(apiBase() + '/api/friends/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ toUserId: uid })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        var d = res.d || {};
        if (d.autoAccepted) toast('✅ 你们已是好友，可以聊天了');
        else if (d.ok) toast('✅ 好友申请已发送，等待对方同意');
        else toast(d.detail || '操作失败');
        if (btn) { btn.className = 'im-af-btn gray'; btn.disabled = true; btn.textContent = d.autoAccepted ? '已是好友' : '已发送'; }
      })
      .catch(function (e) {
        toast('失败：' + (e.message || '网络错误'));
        if (btn) { btn.disabled = false; btn.textContent = '➕ 加好友'; }
      });
  };

  // 已是好友 → 关模态并进入会话（复用 imOpenChat；朋友不在本地缓存时先补拉）
  window.imAfOpenChat = function (serverId) {
    window.imCloseAddFriendModal();
    var fid = 10000 + Number(serverId);
    if (getFriend(fid)) { imOpenChat(fid); return; }
    loadServerFriends(function () {
      if (getFriend(fid)) imOpenChat(fid);
      else toast('请先加对方为好友');
    });
  };

  /* ==================== T4 增量（2026-09-11）：群聊 / 表情包 / 已读同步 / 在线状态 ==================== */

  // —— 会话消息拉取（轮询主干；拉取即已读，后端 markRead 默认开启） ——
  function fetchPeerMsgs(silent) {
    if (!S.peer || !S.peer.isServer || !getToken()) return;
    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50&markRead=1', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var items = d.items || [];
      if (!items.length && silent) return;
      var hadTyping = !!document.getElementById('typingIndicator');
      S.msgs = items.map(function (m) {
        return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };
      });
      if (hadTyping) return; // AI 正在输入时不整表重绘
      renderMsgs();
      if (!silent) renderList();
    })
    .catch(function () { /* 离线静默：保留本地消息 */ });
  }

  function fetchGroupMsgs(silent) {
    if (!S.group || !getToken()) return;
    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages?limit=50&markRead=1', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      S.msgs = (d.items || []).map(function (m) {
        return { id: m.id, senderId: m.senderId, senderNickname: m.senderNickname, senderAvatar: m.senderAvatar, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true };
      });
      S.group.memberCount = S.group.memberCount || 0;
      renderMsgs();
      if (!silent) renderList();
    })
    .catch(function () { /* 离线静默 */ });
  }

  // —— 群列表（会话 tab 置顶展示，含未读角标） ——
  function loadGroups() {
    var token = getToken();
    if (!token) { S.groups = []; return; }
    fetch(apiBase() + '/api/groups', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.json(); })
    .then(function (d) { S.groups = d.items || []; if (S.tab === 'chats') renderChats($id('imList')); })
    .catch(function () { S.groups = S.groups || []; });
  }

  // 打开群会话
  window.imOpenGroup = function (gid) {
    if (!getToken()) { toast('群聊需要联网'); return; }
    var g = (S.groups || []).find(function (x) { return x.id === gid; });
    S.peer = null;
    S.group = g ? { id: g.id, name: g.name, memberCount: g.memberCount } : { id: gid, name: '群聊', memberCount: 0 };
    var empty = $id('imEmpty');
    if (empty) empty.style.display = 'none';
    var conv = $id('imConv');
    if (conv) conv.style.display = 'flex';
    document.body.classList.add('im-mobile');
    renderChatHeader();
    S.msgs = [];
    renderMsgs();
    renderList();
    fetchGroupMsgs(false);
    var inp = $id('imInput');
    if (inp) setTimeout(function () { inp.focus(); }, 100);
  };

  // 发送群消息（发送后立即拉取，不等下一轮轮询）
  function imSendGroupText(text) {
    var inp = $id('imInput');
    if (inp) inp.value = '';
    var token = getToken();
    if (!token) { toast('群聊需要联网'); return; }
    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content: text, kind: 'text' })
    })
    .then(function (r) { return r.json(); })
    .then(function (m) {
      if (m && m.id) {
        S.msgs.push({ id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true });
        renderMsgs();
      }
      fetchGroupMsgs(true);
    })
    .catch(function (e) { toast('发送失败：' + (e.message || '网络错误')); });
  }

  // —— 发起群聊弹层（好友多选 → 命名 → 创建） ——
  var GC = { step: 1, selected: [] }; // 弹层状态

  /* A1：统一 Esc 关闭（群聊弹层 / 加好友模态 / 删除好友弹层）。
     打开时绑定、关闭时若无其它弹层则解绑，避免监听泄漏。 */
  function imEscClose(e) {
    if (e.key !== 'Escape') return;
    var gm = $id('imGroupModal');
    if (gm && gm.style.display !== 'none') { window.imCloseGroupCreator(); return; }
    var am = $id('imAddFriendModal');
    if (am && am.style.display !== 'none') { window.imCloseAddFriendModal(); return; }
    var ovs = document.querySelectorAll('.im-overlay');
    for (var i = ovs.length - 1; i >= 0; i--) {
      if (ovs[i].style.display !== 'none') { ovs[i].remove(); break; }
    }
  }
  function bindModalEsc() {
    document.removeEventListener('keydown', imEscClose);
    document.addEventListener('keydown', imEscClose);
  }
  function unbindModalEscIfIdle() {
    var gm = $id('imGroupModal'), am = $id('imAddFriendModal');
    var anyOpen = (gm && gm.style.display !== 'none') || (am && am.style.display !== 'none') ||
      document.querySelector('.im-overlay[style*="flex"]');
    if (!anyOpen) document.removeEventListener('keydown', imEscClose);
  }

  window.imOpenGroupCreator = function () {
    if (!getToken()) { toast('群聊需要联网'); return; }
    GC.step = 1;
    GC.selected = [];
    var modal = $id('imGroupModal');
    if (!modal) { toast('弹层未加载'); return; }
    modal.style.display = 'flex';
    bindModalEsc();
    loadServerFriends(function (friends) {
      GC.friends = friends || [];
      renderGroupStep1();
    });
  };

  function renderGroupStep1() {
    var modal = $id('imGroupModal');
    if (!modal) return;
    var body = modal.querySelector('.im-group-body');
    var foot = modal.querySelector('.im-group-foot');
    if (!body || !foot) return;
    var kw = (GC.kw || '').toLowerCase();
    var list = (GC.friends || []).filter(function (f) { return !kw || (f.nickname || '').toLowerCase().indexOf(kw) >= 0 || (f.username || '').toLowerCase().indexOf(kw) >= 0; });
    var listHtml = list.length === 0
      ? '<div class="im-empty2">没有可邀请的好友</div>'
      : list.map(function (f) {
          var idx = GC.selected.indexOf(f.serverId);
          return '<div class="im-sess" onclick="window.imToggleGroupMember(' + f.serverId + ')">' +
            '<div class="im-av" onclick="event.stopPropagation();window.imToggleGroupMember(' + f.serverId + ')">' + renderAvatar(f.avatarUrl || f.avatar, f.nickname) + '</div>' +
            '<div class="im-si"><div class="im-n">' + esc(f.nickname) + ' <span style="font-size:11px;color:#999">@' + esc(f.username || '') + '</span></div></div>' +
            '<div class="im-gcheck' + (idx >= 0 ? ' on' : '') + '">' + (idx >= 0 ? '✓' : '') + '</div></div>';
        }).join('');
    var selHtml = GC.selected.length === 0
      ? '<div style="font-size:12px;color:#999;padding:4px 0">至少选择 2 位好友</div>'
      : GC.selected.map(function (uid) {
          var f = (GC.friends || []).find(function (x) { return x.serverId === uid; }) || {};
          return '<div class="im-gsel">' + renderAvatar(f.avatarUrl || f.avatar, f.nickname) + '<span onclick="window.imToggleGroupMember(' + uid + ')">✕</span></div>';
        }).join('');
    body.innerHTML = '<div class="im-gsearch"><input id="imGroupKw" placeholder="搜索好友…" value="' + esc(GC.kw || '') + '" oninput="window.imGroupFilter(this.value)"></div>' +
      '<div class="im-gsel-row">' + selHtml + '</div>' +
      '<div class="im-glist">' + listHtml + '</div>';
    foot.innerHTML = '<button class="btn btn-outline" onclick="window.imCloseGroupCreator()">取消</button>' +
      '<button class="btn btn-primary" id="imGroupNext" ' + (GC.selected.length >= 2 ? '' : 'disabled') + ' onclick="window.imGroupNextStep()">下一步</button>';
  }

  window.imToggleGroupMember = function (uid) {
    var idx = GC.selected.indexOf(uid);
    if (idx >= 0) GC.selected.splice(idx, 1); else GC.selected.push(uid);
    renderGroupStep1();
  };

  window.imGroupFilter = function (v) {
    GC.kw = v;
    // 只重渲染列表部分，避免输入框失焦
    var list = (GC.friends || []).filter(function (f) {
      var kw = (v || '').toLowerCase();
      return !kw || (f.nickname || '').toLowerCase().indexOf(kw) >= 0 || (f.username || '').toLowerCase().indexOf(kw) >= 0;
    });
    var modal = $id('imGroupModal');
    var listEl = modal && modal.querySelector('.im-glist');
    if (listEl) {
      listEl.innerHTML = list.length === 0 ? '<div class="im-empty2">没有可邀请的好友</div>' : list.map(function (f) {
        var idx = GC.selected.indexOf(f.serverId);
        return '<div class="im-sess" onclick="window.imToggleGroupMember(' + f.serverId + ')">' +
          '<div class="im-av" onclick="event.stopPropagation();window.imToggleGroupMember(' + f.serverId + ')">' + renderAvatar(f.avatarUrl || f.avatar, f.nickname) + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(f.nickname) + ' <span style="font-size:11px;color:#999">@' + esc(f.username || '') + '</span></div></div>' +
          '<div class="im-gcheck' + (idx >= 0 ? ' on' : '') + '">' + (idx >= 0 ? '✓' : '') + '</div></div>';
      }).join('');
    }
    var nextBtn = $id('imGroupNext');
    if (nextBtn) nextBtn.disabled = GC.selected.length < 2;
  };

  window.imGroupNextStep = function () {
    if (GC.selected.length < 2) { toast('至少选择 2 位好友'); return; }
    GC.step = 2;
    var modal = $id('imGroupModal');
    var body = modal.querySelector('.im-group-body');
    var foot = modal.querySelector('.im-group-foot');
    var selNames = GC.selected.map(function (uid) {
      var f = (GC.friends || []).find(function (x) { return x.serverId === uid; }) || {};
      return esc(f.nickname || '');
    }).join('、');
    body.innerHTML = '<div class="im-gname-tip">已选 ' + GC.selected.length + ' 位成员：' + selNames + '</div>' +
      '<div class="form-group"><div class="form-label">群名称（≤20 字）</div>' +
      '<input type="text" class="form-input" id="imGroupName" maxlength="20" placeholder="如：四级冲刺打卡群"></div>';
    foot.innerHTML = '<button class="btn btn-outline" onclick="window.imOpenGroupCreator()">上一步</button>' +
      '<button class="btn btn-primary" onclick="window.imGroupCreate()">创建群聊</button>';
    var nameInp = $id('imGroupName');
    if (nameInp) setTimeout(function () { nameInp.focus(); }, 50);
  };

  window.imGroupCreate = function () {
    var name = (($id('imGroupName') || {}).value || '').trim();
    if (!name) { toast('请输入群名称'); return; }
    if (name.length > 20) { toast('群名称最长 20 字'); return; }
    var token = getToken();
    fetch(apiBase() + '/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: name, memberIds: GC.selected })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.id) {
        window.imCloseGroupCreator();
        toast('✅ 群聊已创建');
        loadGroups();
        setTimeout(function () { window.imOpenGroup(d.id); }, 200);
      } else {
        toast(d.detail || '创建失败');
      }
    })
    .catch(function (e) { toast('创建失败：' + (e.message || '网络错误')); });
  };

  window.imCloseGroupCreator = function () {
    var modal = $id('imGroupModal');
    if (modal) modal.style.display = 'none';
    unbindModalEscIfIdle();
  };

  // —— 表情面板（[emoji:xx] 文本语法，Unicode 渲染，离线可用） ——
  var EMOJI_FAV_KEY = 'study_workbench_emoji_fav';
  var EMOJI_RECENT_KEY = 'study_workbench_emoji_recent';

  function emojiArr(key, max) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.slice(0, max || 16) : [];
    } catch (e) { return []; }
  }

  window.imToggleEmoji = function () {
    var panel = $id('imEmojiPanel');
    if (!panel) return;
    if (panel.style.display === 'none') { renderEmojiPanel('all'); panel.style.display = 'block'; }
    else panel.style.display = 'none';
  };

  window.imEmojiTab = function (tab) {
    renderEmojiPanel(tab);
  };

  function renderEmojiPanel(tab) {
    var panel = $id('imEmojiPanel');
    if (!panel || !window.STUDY_EMOJI) return;
    var codes;
    if (tab === 'recent') codes = emojiArr(EMOJI_RECENT_KEY, 16);
    else if (tab === 'fav') codes = emojiArr(EMOJI_FAV_KEY, 16);
    else codes = window.STUDY_EMOJI.list.map(function (e) { return e.code; });
    var grid = codes.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;color:#999;font-size:12px;padding:12px 0">' + (tab === 'fav' ? '还没有收藏表情，点🌟收藏' : '暂无最近使用') + '</div>'
      : codes.map(function (code) {
          var e = window.STUDY_EMOJI.map[code];
          if (!e) return '';
          var fav = emojiArr(EMOJI_FAV_KEY, 16).indexOf(code) >= 0;
          return '<div class="im-emoji-item" onclick="window.imPickEmoji(\'' + code + '\')" title="' + esc(e.name) + '">' + e.char +
            '<span class="im-emoji-fav' + (fav ? ' on' : '') + '" onclick="event.stopPropagation();window.imFavEmoji(\'' + code + '\')">🌟</span></div>';
        }).join('');
    panel.innerHTML = '<div class="im-emoji-tabs">' +
      '<span class="im-emoji-tab' + (tab === 'recent' ? ' on' : '') + '" onclick="window.imEmojiTab(\'recent\')">最近</span>' +
      '<span class="im-emoji-tab' + (tab === 'all' ? ' on' : '') + '" onclick="window.imEmojiTab(\'all\')">全部</span>' +
      '<span class="im-emoji-tab' + (tab === 'fav' ? ' on' : '') + '" onclick="window.imEmojiTab(\'fav\')">收藏</span>' +
      '<span style="flex:1"></span>' +
      '<span class="im-emoji-tab" onclick="window.imToggleEmoji()">收起</span></div>' +
      '<div class="im-emoji-grid">' + grid + '</div>';
  }

  window.imPickEmoji = function (code) {
    var inp = $id('imInput');
    if (inp) inp.value = (inp.value || '') + '[emoji:' + code + ']';
    // 记录最近使用（去重，最多 16 个）
    var recent = emojiArr(EMOJI_RECENT_KEY, 16).filter(function (c) { return c !== code; });
    recent.unshift(code);
    try { localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(recent.slice(0, 16))); } catch (e) { }
    var panel = $id('imEmojiPanel');
    if (panel && panel.style.display !== 'none') {
      var cur = panel.querySelector('.im-emoji-tab.on');
      renderEmojiPanel(cur ? (cur.textContent === '最近' ? 'recent' : cur.textContent === '收藏' ? 'fav' : 'all') : 'all');
    }
  };

  window.imFavEmoji = function (code) {
    var fav = emojiArr(EMOJI_FAV_KEY, 16);
    var idx = fav.indexOf(code);
    if (idx >= 0) fav.splice(idx, 1); else fav.unshift(code);
    try { localStorage.setItem(EMOJI_FAV_KEY, JSON.stringify(fav.slice(0, 16))); } catch (e) { }
    var panel = $id('imEmojiPanel');
    if (panel && panel.style.display !== 'none') {
      var cur = panel.querySelector('.im-emoji-tab.on');
      renderEmojiPanel(cur ? (cur.textContent === '最近' ? 'recent' : cur.textContent === '收藏' ? 'fav' : 'all') : 'all');
    }
  };

  // —— 在线状态（presence）：好友列表 30s 刷新一次 ——
  /* 批次二 需求6：相对时间统一由 api.js 的 formatPresence 产出（纯函数，jsdom 可断言边界）。
     规则：在线→「在线」（绿点由 .on 类渲染）；字段缺失/解析失败→''（调用方整段不显示，绝不造假）；
     <5 分钟→「刚刚在线」；5 分钟~1 小时→「N分钟前」；跨自然日→「昨天 HH:MM」；1~24 小时→「N小时前」；更久→「N天前」。
     api.js 未加载时保留旧实现兜底。 */
  function presenceText(lastSeenAt, online) {
    if (typeof window.formatPresence === 'function') return window.formatPresence(lastSeenAt, online);
    if (online) return '在线';
    if (!lastSeenAt) return '';
    var t = new Date(lastSeenAt.replace(' ', 'T'));
    if (isNaN(t)) return '';
    var diff = (Date.now() - t.getTime()) / 60000; // 分钟
    if (diff < 1) return '刚刚在线';
    if (diff < 60) return Math.floor(diff) + ' 分钟前在线';
    if (diff < 60 * 24) return Math.floor(diff / 60) + ' 小时前在线';
    return Math.floor(diff / (60 * 24)) + ' 天前在线';
  }

  function refreshPresence() {
    // 批次二 需求6：会话 tab 与好友 tab 都显示相对在线时间；一次批量请求（绝不做每行一请求）
    if (!getToken()) return;
    if (S.tab !== 'friends' && S.tab !== 'chats') return;
    var idSet = {};
    (SERVER_FRIENDS || []).forEach(function (f) { if (f.serverId) idSet[f.serverId] = true; });
    (S.chats || []).forEach(function (c) { if (c.isServer && c.serverId) idSet[c.serverId] = true; });
    var ids = Object.keys(idSet);
    if (!ids.length) return;
    fetch(apiBase() + '/api/users/presence?ids=' + ids.join(','), {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      (d.items || []).forEach(function (p) {
        S.presence[p.id] = p;
        var dot = document.querySelector('.im-dot[data-uid="' + p.id + '"]');
        if (dot) dot.className = 'im-dot' + (p.online ? ' on' : '');
        var txt = document.querySelector('.im-presence[data-uid="' + p.id + '"]');
        if (txt) {
          var label = presenceText(p.lastSeenAt, p.online);
          // 会话列表右侧是独立元素（不带 · 分隔符）；好友列表嵌在签名后（带 · 分隔符）
          txt.textContent = label ? (txt.classList.contains('im-presence-side') ? label : '· ' + label) : '';
          txt.className = (txt.classList.contains('im-presence-side') ? 'im-presence im-presence-side' : 'im-presence') + (p.online ? ' on' : '');
        }
      });
    })
    .catch(function () { /* 失败显示 -- ：占位符留空即可 */ });
  }

  // —— 会话轮询（2.5s 主干）：当前会话可见时高频拉取，页面隐藏暂停 ——
  function startConvPoll() {
    setInterval(function () {
      if (document.visibilityState !== 'visible' || !getToken()) return;
      if (S.group) { fetchGroupMsgs(true); return; }
      if (S.peer && S.peer.isServer) fetchPeerMsgs(true);
    }, 2500);
    // 群列表 + 好友在线状态：30s
    setInterval(function () {
      if (document.visibilityState !== 'visible' || !getToken()) return;
      loadGroups();
      refreshPresence();
    }, 30000);
  }

  /* 支持通过 ?uid= 直接进入与某位服务器好友的会话（A3/A5 深链：好友申请页「发消息」） */
  function maybeAutoOpenChat() {
    var uid = 0, name = '';
    try {
      var p = new URLSearchParams(location.search);
      uid = Number(p.get('uid') || 0);
      name = p.get('name') || '';
    } catch (e) { }
    if (!uid) return;
    var fid = 10000 + uid;
    if (getFriend(fid)) { imOpenChat(fid); }
    else if (name) { toast('「' + name + '」还不是你的好友，先加为好友再聊'); }
  }

  function boot() {
    var style = document.createElement('style');
    style.textContent = '@keyframes typing{0%,60%,100%{opacity:.3}30%{opacity:1}}';
    document.head.appendChild(style);

    // 绑定回车发送（HTML 已有 imInput）
    var inp = $id('imInput');
    if (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.imSendText(); }
      });
    }

    // 批次二 需求2：会话列表左滑 / 右键操作（事件委托，只绑一次）
    imBindSwipeGestures();

    // 先获取当前用户ID（用于区分消息左右），再加载会话和好友
    var token = getToken();
    if (token) {
      fetch(apiBase() + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        if (me && me.id) S.myId = me.id;
      })
      .catch(function () {})
      .finally(function () {
        // 加载服务器好友后再渲染会话
        loadServerFriends(function () { loadChats(); refreshPresence(); maybeAutoOpenChat(); });
      });
    } else {
      loadChats();
      maybeAutoOpenChat();
    }

    // T4 增量：群列表加载 + 会话/在线状态轮询
    loadGroups();
    startConvPoll();

    // 每 5 秒轮询未读消息
    setInterval(function () {
      var token = getToken();
      if (!token) return;
      fetch(apiBase() + '/api/chat/unread', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = d.items || [];
        items.forEach(function (item) {
          var cnt = item.count || 0;
          // 找到对应的会话（后端字段：peerId / last / lastId）
          var chat = S.chats.find(function (c) { return c.isServer && c.serverId === item.peerId; });
          if (chat) {
            // 如果当前正在和对方聊天，把新消息追加进去
            if (S.peer && S.peer.isServer && S.peer.serverId === item.peerId) {
              var exists = S.msgs.some(function (m) { return m.id === item.lastId; });
              if (!exists && item.last) {
                S.msgs.push({
                  id: item.lastId,
                  senderId: item.peerId,
                  content: item.last,
                  kind: 'text',
                  time: Date.now()
                });
                renderMsgs();
              }
              // 正在聊天，标记已读
              chat.unread = 0;
              fetch(apiBase() + '/api/chat/' + item.peerId + '/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ upToId: item.lastId })
              }).catch(function () {});
            } else {
              chat.unread = cnt;
              chat.last = item.last || chat.last;
              chat.time = Date.now();
              // 批次二 需求2：被「删除」隐藏的会话，对方再发新消息时自动恢复显示（云端记录一直都在）
              var hk = 'u' + item.peerId;
              if ((imLoadPrefs()[hk] || {}).hidden) window.imChatPrefs.set(hk, { hidden: false });
            }
          }
        });
        // 没有任何未读的会话要清零红点（已读就不再显示）
        S.chats.forEach(function (c) {
          if (c.isServer && !items.some(function (x) { return x.peerId === c.serverId; })) c.unread = 0;
        });
        // 重新渲染会话列表（红点：未读显示、已读消失）
        renderList();
        // tab 按钮角标：会话=未读消息总数（批次二 需求2：免打扰 / 已隐藏会话不计入）
        updateTabBadge('chats', imCountUnread(S.chats, imLoadPrefs()));
        // 待处理好友申请数 → 申请 tab 角标（需求1，2026-09-11h）：
        // 优先消费后端未读水位线字段 unreadCount（created_at > last_request_seen_at 的 pending 条数），
        // 修复旧逻辑「角标 = incoming.length，查看后刷新必复发」的 Bug；旧后端无该字段时回退为旧行为。
        fetch(apiBase() + '/api/friends/requests', { headers: { 'Authorization': 'Bearer ' + token } })
          .then(function (r) { return r.json(); })
          .then(function (rd) { window.imApplyRequestBadge(rd); })
          .catch(function () { });
        // 顶栏 💬 角标由 assets/api.js 的 loadChatUnread() 轮询维护，这里不再越权改写
      })
      .catch(function () {});
    }, 5000);
  }

  /* tab 按钮角标：n>0 显示红色数字，n<=0 移除 */
  function updateTabBadge(tab, n) {
    var btn = document.querySelector('.im-tab[data-tab="' + tab + '"]');
    if (!btn) return;
    var b = btn.querySelector('.tab-badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
    } else if (b) { b.remove(); }
  }

  function $ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* 批次二（2026-09-11h）：仅供 tools/verifier jsdom 校验器使用的内部引用（零运行时行为影响） */
  window.__IM_TEST__ = {
    S: S,
    renderChats: renderChats,
    renderMsgs: renderMsgs,
    renderFriends: renderFriends,
    renderRequests: renderRequests,
    presenceText: presenceText,
    loadChats: loadChats,
    SWIPE_PX: SWIPE_PX
  };

  $ready(boot);
})();
