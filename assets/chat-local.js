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
      systemPrompt: '你是星途，学习工作台里的 AI 助手，专业、高效、乐于助人。你擅长回答四级备考、行测技巧、央国企笔试、面试准备、PPT制作、学习方法等方面的问题。语气专业友好，回答结构化（先给结论，再分要点），但不要太生硬。如果用户问学习问题，给出具体可执行的建议；如果用户闲聊，也会友好回应。适当用emoji，但不要过度。回复要实用，不要空泛。'
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

  var S = { tab: 'chats', peer: null, chats: [], msgs: [], myId: 999, aiBusy: false };

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
    if (S.chats.length === 0) { box.innerHTML = '<div class="im-empty2">还没有会话，去好友列表找个朋友聊聊吧</div>'; return; }
    box.innerHTML = S.chats.map(function (c) {
      var active = S.peer && S.peer.id === c.id;
      // 头像点击：服务器好友打开主页，AI好友不处理
      var avClick = c.isServer && c.serverId
        ? 'event.stopPropagation();openUserHome(' + c.serverId + ')'
        : 'event.stopPropagation()';
      return '<div class="im-sess' + (active ? ' on' : '') + '" onclick="imOpenChat(' + c.id + ')">' +
        '<div class="im-av" style="cursor:' + (c.isServer ? 'pointer' : 'default') + '" onclick="' + avClick + '">' + renderAvatar(c.avatar, c.nickname) + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(c.nickname) + '</div><div class="im-sub">' + esc(c.last || '') + '</div></div>' +
        (c.unread > 0 ? '<div class="im-badge">' + c.unread + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // 服务器好友列表缓存
  var SERVER_FRIENDS = [];

  function apiBase() {
    return (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';
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
        return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
          '<div class="im-av">' + av + '</div>' +
          '<div class="im-si"><div class="im-n" style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.id + ')">' + esc(f.nickname) + ' <span style="font-size:11px;color:#999">@' + esc(f.username) + '</span></div>' +
          '<div class="im-sub">' + esc(f.motto) + '</div></div>' +
          '<div style="color:#667eea;font-size:12px;cursor:pointer" onclick="event.stopPropagation();imOpenChat(' + f.id + ')">发消息</div>' +
          '</div>';
      }).join('');
      box.innerHTML = aiHtml + '<div style="font-size:13px;font-weight:600;color:#333;padding:12px 0 4px">👥 注册好友</div>' + srvHtml;
    });
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

  function renderRequests(box) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';
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
    var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';
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
    var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';
    fetch(API_BASE + '/api/friends/requests/' + rid + '/accept', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.json(); })
    .then(function () { toast('✅ 已加为好友'); renderRequests($id('imList')); loadChats(); })
    .catch(function (e) { toast('失败：' + (e.message || '')); });
  };
  window.imDeclineRequest = function (rid) {
    var token = localStorage.getItem('study_workbench_token');
    var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';
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
      return { id: i + 1, senderId: m.senderId, content: m.content, kind: m.kind, time: m.time };
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
            return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime() };
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
    var conv = $id('imConv');
    if (conv) conv.style.display = 'none';
    var empty = $id('imEmpty');
    if (empty) empty.style.display = 'flex';
  }
  window.imBackToList = backToList;
  window.imBackList = backToList; // 兼容 HTML 里的 imBackList()

  function renderMsgs() {
    var box = $id('imMsgs');
    if (!box) return;
    if (S.msgs.length === 0) {
      box.innerHTML = '<div class="im-empty2">开始和' + esc(S.peer.nickname) + '聊天吧</div>';
      return;
    }
    box.innerHTML = S.msgs.map(function (m) {
      var isMe = m.senderId === S.myId;
      var time = new Date(m.time);
      var timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');
      if (m.kind === 'image') {
        return '<div class="im-m ' + (isMe ? 'me' : 'ot') + '"><img src="' + esc(m.content) + '" style="max-width:200px;border-radius:8px"><div class="im-mt">' + timeStr + '</div></div>';
      }
      return '<div class="im-m ' + (isMe ? 'me' : 'ot') + '">' + esc(m.content) + '<div class="im-mt">' + timeStr + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

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
    if (!text || !S.peer) return;
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
        }).catch(function () {});
      }
      return;
    }

    triggerAiReply(text);
  };

  window.imSwitchTab = function (tab) {
    S.tab = tab;
    document.querySelectorAll('.im-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });
    renderList();
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
    var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';

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
      var serverHtml = serverUsers.map(function (u) {
        var av = (u.avatarUrl && /^(https?:|\/uploads\/|data:)/.test(u.avatarUrl))
          ? '<img src="' + (u.avatarUrl.startsWith('http') ? u.avatarUrl : API_BASE + u.avatarUrl) + '" alt="">'
          : esc((u.nickname || '友').slice(0, 1));
        var btn = u.isFriend
          ? '<span style="font-size:12px;color:#999">已是好友</span>'
          : '<button class="btn btn-primary" style="font-size:12px;padding:4px 10px" onclick="imAddServerFriend(' + u.id + ')">加好友</button>';
        return '<div class="im-sess">' +
          '<div class="im-av">' + av + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(u.nickname) + ' <span style="font-size:11px;color:#999">@' + esc(u.username) + '</span></div>' +
          '<div class="im-sub">' + esc(u.motto || '') + '</div></div>' + btn + '</div>';
      }).join('');
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
    var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000';
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
        loadServerFriends(function () { loadChats(); });
      });
    } else {
      loadChats();
    }

    // 每 5 秒轮询未读消息
    setInterval(function () {
      var token = getToken();
      if (!token) return;
      fetch(apiBase() + '/api/chat/unread', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = d.items || [];
        var totalUnread = 0;
        items.forEach(function (item) {
          var cnt = item.count || 0;
          totalUnread += cnt;
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
            }
          }
        });
        // 没有任何未读的会话要清零红点（已读就不再显示）
        S.chats.forEach(function (c) {
          if (c.isServer && !items.some(function (x) { return x.peerId === c.serverId; })) c.unread = 0;
        });
        // 重新渲染会话列表（红点：未读显示、已读消失）
        renderList();
        // 顶栏 💬 角标由 assets/api.js 的 loadChatUnread() 轮询维护，这里不再越权改写
      })
      .catch(function () {});
    }, 5000);
  }

  function $ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  $ready(boot);
})();
