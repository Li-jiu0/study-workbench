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

  /* ==================== R60（2026-09-14）：与 app.js（线1）的跨文件钩子 ====================
     契约（线1 在 app.js 消费，线2 只负责产出）：
       - window.currentChatUserId：当前打开的会话对象 userId（私聊=对方 serverId；群聊/无会话=null）
       - window.__xtChatTransportActive：本页已持有聊天轮询（HTTP），app.js 看到 true 就不要再另开轮询
       - window.xtNotifyMessage(msg)：入站消息通知（msg = {peerId,nickname,avatar,preview,count}）
         —— 2026-09-15 批次八起，本页不再转发它，改由本文件的 imTopNotify 渲染顶端通知条（见下方）；
            该钩子继续供 app.js 在其它页面使用，本文件只是不再调用。
       - window.xtSetUnread(n)：未读总数变化
     容错铁律：app.js 尚未落地 / 加载失败 / 抛异常，一律静默跳过，绝不影响本页聊天。 */
  function xtSetChatUser(uid) {
    try { window.currentChatUserId = uid || null; } catch (e) { /* 无 window 场景忽略 */ }
  }
  function xtTransport(active) {
    try { window.__xtChatTransportActive = !!active; } catch (e) { /* 同上 */ }
  }
  /* 2026-09-15 批次八（notify-fix1）：本页改由自己渲染「页面顶端通知条」（见下方 imTopNotify）。
     不再转发 window.xtNotifyMessage，原因：① 那是右上角堆叠小卡片，不是用户要的顶端横条；
     ② 它只读 text/content/last，读不到本文件抛的 preview 字段 → 内容摘要恒为空，看着就像没弹；
     ③ 本页置了 __xtChatTransportActive=true，app.js 那条 8s 轮询在本页根本不启动，转发只会导致
        同一条消息在本页弹两次。app.js 那份继续服务其它页面（该文件未改动）。 */
  function xtNotify(msg) { imTopNotify(msg); }
  function xtUnread(n) {
    try { if (typeof window.xtSetUnread === 'function') window.xtSetUnread(Number(n) || 0); } catch (e) { /* 同上 */ }
  }

  /* ==================== 2026-09-15 批次八：页面顶端入站消息通知条（微信式） ====================
     用户反馈「收消息没有微信式页面顶端弹窗提醒」。落地形态：
       - fixed 顶部居中横条：圆形头像 + 昵称 + 内容摘要（最多 2 行省略）+ 关闭按钮；
       - 点击直达该会话（复用 imOpenChatWithUser）；关闭按钮 / 向上向下滑动可关；4 秒自动消失；
       - 同一会话连发 → 原地合并计数并续命，不同会话最多同时 2 条、其余排队（不叠成一堆）。
     ADR-3 合规：轻交互浮层，容器 pointer-events:none 只让横条本身可点，**无全屏遮罩**。
     样式随脚本注入（与 R51/R55 同一处 style 注入），变量全部复用 common.css，不新增依赖。 */
  var TN_MAX = 2;      // 同屏最多 2 条
  var TN_MS = 4000;    // 自动消失
  var TN_SWIPE_PX = 24;
  var tnWrap = null, tnLive = [], tnQueue = [];

  function tnEnsureWrap() {
    if (tnWrap && tnWrap.parentNode) return tnWrap;
    tnWrap = document.getElementById('imTopNotifyWrap');
    if (!tnWrap) {
      tnWrap = document.createElement('div');
      tnWrap.id = 'imTopNotifyWrap';
      tnWrap.className = 'im-tn-wrap';
      document.body.appendChild(tnWrap);
    }
    return tnWrap;
  }

  function tnDrain() {
    while (tnLive.length < TN_MAX && tnQueue.length) tnMount(tnQueue.shift());
  }

  function tnSchedule(item) {
    if (item.timer) { clearTimeout(item.timer); item.timer = null; }
    item.startedAt = Date.now();
    item.timer = setTimeout(function () { tnClose(item); }, item.remaining);
  }

  function tnClose(item) {
    if (!item || item.closed) return;
    item.closed = true;
    if (item.timer) { clearTimeout(item.timer); item.timer = null; }
    var i = tnLive.indexOf(item);
    if (i >= 0) tnLive.splice(i, 1);
    if (item.el) {
      var el = item.el;
      el.classList.remove('show');
      setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 280);
    }
    tnDrain();
  }

  function tnOpenPeer(item) {
    var uid = Number(item.peerId);
    if (!uid) return;
    try {
      if (typeof window.imOpenChatWithUser === 'function') { window.imOpenChatWithUser(uid, item.name, item.avatar); return; }
    } catch (e) { /* 落到下面的兜底 */ }
    if (typeof window.imOpenChat === 'function') window.imOpenChat(10000 + uid);
  }

  function tnMount(item) {
    var host = tnEnsureWrap();
    var el = document.createElement('div');
    el.className = 'im-tn';
    el.setAttribute('role', 'alert');
    el.innerHTML =
      '<span class="im-tn-av"></span>' +
      '<span class="im-tn-body">' +
        '<span class="im-tn-name"></span>' +
        '<span class="im-tn-text"></span>' +
      '</span>' +
      '<span class="im-tn-close" title="关闭" aria-label="关闭">✕</span>';
    el.querySelector('.im-tn-av').innerHTML = renderAvatar(item.avatar, item.name);
    el.querySelector('.im-tn-name').textContent = item.name;
    el.querySelector('.im-tn-text').textContent = item.text;
    host.appendChild(el);
    item.el = el;
    tnLive.push(item);

    // 下一帧加 .show 触发下滑 + 淡入
    if (window.requestAnimationFrame) window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { el.classList.add('show'); });
    });
    else setTimeout(function () { el.classList.add('show'); }, 16);

    // 悬停暂停倒计时，移出按剩余时间续命
    el.addEventListener('mouseenter', function () {
      if (item.timer) { clearTimeout(item.timer); item.timer = null; }
      item.remaining -= Math.max(0, Date.now() - (item.startedAt || Date.now()));
    });
    el.addEventListener('mouseleave', function () { if (!item.closed) tnSchedule(item); });

    el.querySelector('.im-tn-close').addEventListener('click', function (e) {
      e.stopPropagation();
      tnClose(item);
    });
    el.addEventListener('click', function () {
      tnClose(item);
      tnOpenPeer(item);
    });

    // 向上 / 向下滑动关闭（移动端微信同款手势）
    var sy = 0, tracking = false;
    el.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      if (!t) return;
      sy = t.clientY; tracking = true;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!tracking) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientY - sy) >= TN_SWIPE_PX) { tracking = false; tnClose(item); }
    }, { passive: true });
    el.addEventListener('touchend', function () { tracking = false; });

    item.remaining = TN_MS;
    tnSchedule(item);
  }

  /** 弹一条顶端通知。msg: {peerId, nickname, avatar, preview, count}
      非当前会话才弹；同会话已在屏则合并计数并续命；超出同屏上限排队。 */
  function imTopNotify(msg) {
    try {
      msg = msg || {};
      var peerId = msg.peerId != null ? msg.peerId : msg.senderId;
      if (peerId == null) return;
      if (window.currentChatUserId != null && String(peerId) === String(window.currentChatUserId)) return; // 正在跟对方聊：不打扰
      var name = imFriendName({ peerRemark: msg.peerRemark, nickname: (msg.nickname || msg.senderName || msg.name) }, '用户' + peerId);
      var raw = msg.preview != null ? msg.preview : (msg.text != null ? msg.text : (msg.content != null ? msg.content : (msg.last || '')));
      var text = String(raw).slice(0, 140);
      var count = Number(msg.count) || 1;
      // 合并：同一会话连发多条 → 原地更新摘要 + 计数，并续命（不叠成一堆）
      for (var i = 0; i < tnLive.length; i++) {
        if (String(tnLive[i].peerId) === String(peerId)) {
          var it = tnLive[i];
          it.text = text;
          it.count += count;
          it.remaining = TN_MS;
          var tx = it.el && it.el.querySelector('.im-tn-text');
          if (tx) tx.textContent = (it.count > 1 ? '[' + it.count + '条] ' : '') + text;
          tnSchedule(it);
          return;
        }
      }
      var item = { peerId: peerId, name: name, avatar: msg.avatar || '', text: text, count: count, remaining: TN_MS };
      if (tnLive.length < TN_MAX) tnMount(item);
      else tnQueue.push(item);
    } catch (e) { /* 通知失败不打断聊天 */ }
  }
  window.imTopNotify = imTopNotify;

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

  /* R53（2026-09-14）：群头像渲染（三选一取值统一走这里，避免群列表/会话头/设置面板各写一套）。
     取值约定（与后端 server/routers/groups.py PATCH /{gid} 的 avatar 校验一致）：
       - '/uploads/…' 或 http(s) 开头 → 图片
       - 'color:#RRGGBB'              → 纯色块（不想传图时的低成本方案）
       - 其它短文本（emoji / 单字）    → 文字兜底
       - 空                            → 沿用原默认 👥（未设头像的群视觉与改造前一致，避免无谓变更） */
  function imGroupAvatarHtml(avatar, name) {
    var a = (avatar == null ? '' : String(avatar));
    if (/^(https?:|\/uploads\/|data:)/.test(a)) {
      var url = a.indexOf('http') === 0 ? a : apiBase() + a;
      return '<img src="' + esc(url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    }
    if (a.indexOf('color:') === 0) {
      return '<span style="display:block;width:100%;height:100%;border-radius:50%;background:' + esc(a.slice(6)) + '"></span>';
    }
    if (a) return '<span>' + esc(a) + '</span>';
    return '<span>👥</span>';
  }

  var STORAGE_KEY = 'study_im_local_data';
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
  }

  // 预设AI好友（默认启用2个，其余在AI商店里可选添加）
  var PRESET_FRIENDS = [
    {
      id: 1, nickname: '学习搭子·小星', avatar: '⭐', motto: '一起学习，共同进步！', personality: 'encouraging',
      systemPrompt: '你叫小星，是用户的学习搭子，积极向上、充满正能量。你和用户一起备考四级、行测等。语气热情鼓励，会主动关心用户的学习进度，看到用户偷懒会温柔提醒，用户取得进步会真心夸奖。回复简洁自然，像身边真实的学习伙伴，不要长篇大论讲道理，多用短句和感叹号，适当用emoji。如果用户问学习问题，给出具体可执行的建议；如果用户闲聊，就轻松回应。'
    },
    {
      id: 8, nickname: 'AI助手·星途', avatar: '🤖', motto: '有什么我可以帮你的？', personality: 'ai',
      systemPrompt: '你是「星途」学习平台的 AI 助手，专业、高效、乐于助人。你擅长回答英语、行测技巧、行测、面试准备、PPT制作、学习方法等方面的问题。语气专业友好，回答结构化（先给结论，再分要点），但不要太生硬。如果用户问学习问题，给出具体可执行的建议；如果用户闲聊，也会友好回应。适当用emoji，但不要过度。回复要实用，不要空泛。'
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
      var saved = JSON.parse(lsGet('study_im_ai_added') || 'null');
      if (saved && Array.isArray(saved)) return saved;
    } catch (e) {}
    return [1, 8];
  }
  function setAddedAiIds(ids) {
    lsSet('study_im_ai_added', JSON.stringify(ids));
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
    ai: ['我是星途AI助手，有什么可以帮你的吗？', '关于学习问题，我可以给你一些建议', '你可以问我英语、行测技巧、PPT制作等问题', '让我想想...这个问题我是这样看的', '希望我的回答对你有帮助！']
  };

  var KEYWORD_REPLIES = [
    { keywords: ['你好', 'hi', 'hello', '在吗'], reply: '你好呀！很高兴和你聊天😊' },
    { keywords: ['四级', '英语', '单词'], reply: '英语要坚持每天背单词哦，有什么不懂的可以问我！' },
    { keywords: ['行测', '笔试', '考公'], reply: '行测要多刷题，总结题型规律，加油！' },
    { keywords: ['面试', '简历', '求职'], reply: '面试前要充分准备，多模拟练习，你一定可以的！' },
    { keywords: ['ppt', 'PPT', '演示'], reply: 'PPT制作要简洁大方，一页一个核心观点哦' },
    { keywords: ['谢谢', '感谢', 'thx'], reply: '不客气！能帮到你我很开心😊' },
    { keywords: ['再见', '拜拜', 'bye'], reply: '再见！下次再聊呀👋' },
    { keywords: ['累', '压力', '焦虑'], reply: '累了就休息一下，不要给自己太大压力，你已经很棒了💪' }
  ];

  var S = { tab: 'chats', peer: null, group: null, chats: [], groups: [], presence: {}, msgs: [], myId: 999, isAdmin: false, aiBusy: false, swipeOpen: null };

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
      var v = JSON.parse(lsGet(CHAT_PREFS_KEY) || '{}');
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

  /* R46（2026-09-14e）：会话列表渲染签名 —— 5s 未读轮询靠它判断「列表视觉是否真的变了」。
     纳入字段（都会直接改变某一行的外观）：行集合与顺序、未读数 unread、最后一条消息 last、最后一条消息 id、
     置顶 pinned、免打扰 muted、在线标记、当前选中会话/群，以及群行的未读数/最后消息/人数/免打扰。
     刻意不纳入：chat.time（每轮询被改写成 Date.now()）与 presence 相对时间文案（随秒数自然漂移）——
     二者纳入会让签名每次都不同，等于没做比对。presence 只取 online 布尔（新行补渲染靠 30s refreshPresence）。 */
  /* R46（2026-09-14e）：好友 tab 渲染签名（与 imChatsSig 同思路，按好友行真正会变的东西逐项取）。
     覆盖：登录态 / 管理员身份 / AI 分组展开态 / AI 好友行（集合·顺序·id·昵称·签名·头像）/
     群行（id·群名·未读·最后消息·人数·免打扰·加载失败态）/
     注册好友行（id·serverId·昵称·用户名·头像·签名·在线标记）。
     好友新增或删除、上下线、改昵称换头像、群数据变化都会改签名 → 照旧重建；
     只有全都没变才跳过渲染。（好友行本身不展示未读，故未读不参与好友签名。） */
  var lastFriendsSig = '';
  function imFriendsSig() {
    var prefs = imLoadPrefs();
    var out = [];
    var i;
    out.push('tok' + (getToken() ? 1 : 0));
    out.push('adm' + (S.isAdmin ? 1 : 0));
    out.push('aix' + (S.aiExpanded !== false ? 1 : 0));
    var ai = getActiveAiFriends() || [];
    out.push('ain' + ai.length);
    for (i = 0; i < ai.length; i++) {
      out.push('a' + ai[i].id + ':' + (ai[i].nickname || '') + ':' + (ai[i].motto || '') + ':' + (ai[i].avatar || ''));
    }
    out.push('glf' + (S.groupsLoadFailed ? 1 : 0));
    var groups = (S.groups || []).filter(function (g) { return !((prefs['g' + g.id] || {}).hidden); });
    out.push('gn' + groups.length);
    for (i = 0; i < groups.length; i++) {
      var g = groups[i] || {};
      var gp = prefs['g' + g.id] || {};
      out.push('g' + g.id + ':' + (g.name || '') + ':' + (g.unreadCount || 0) + ':' + ((g.lastMessage && g.lastMessage.id) || 0) + ':' +
        (g.memberCount || 0) + ':' + (gp.muted ? 1 : 0));
    }
    var sf = SERVER_FRIENDS || [];
    out.push('sfn' + sf.length);
    for (i = 0; i < sf.length; i++) {
      var f = sf[i] || {};
      var p = f.serverId ? S.presence[f.serverId] : null;
      out.push('u' + f.id + ':' + (f.serverId || 0) + ':' + (f.nickname || '') + ':' + (f.username || '') + ':' +
        (f.avatar || '') + ':' + (f.motto || '') + ':' + (p ? (p.online ? 1 : 0) : 0));
    }
    return out.join('|');
  }

  var lastChatsSig = '';
  /* R46：/api/friends/requests 的 30s 节流时间戳（0 = 从未拉取，进页面后第一次轮询立即拉） */
  var lastReqFetchAt = 0;
  function imChatsSig() {
    var prefs = imLoadPrefs();
    var out = [];
    var i, c, p;
    var list = imApplyChatPrefs(S.chats, prefs);
    for (i = 0; i < list.length; i++) {
      c = list[i] || {};
      p = (c.isServer && c.serverId) ? S.presence[c.serverId] : null;
      out.push('c' + c.id + ':' + (c.unread || 0) + ':' + (c.last || '') + ':' + (c.lastId || 0) + ':' +
        (c.pinned ? 1 : 0) + ':' + (c.muted ? 1 : 0) + ':' + (p ? (p.online ? 1 : 0) : 0));
    }
    var groups = (S.groups || []).filter(function (g) { return !((prefs['g' + g.id] || {}).hidden); });
    for (i = 0; i < groups.length; i++) {
      var g = groups[i] || {};
      var gp = prefs['g' + g.id] || {};
      // 群名也纳入：群设置里改名后 loadGroups() 必须重绘行（否则列表会停留在旧群名）
      // R53：群头像同样纳入（改头像后列表行必须重绘，否则停留旧头像）
      out.push('g' + g.id + ':' + (g.name || '') + ':' + (g.avatar || '') + ':' + (g.unreadCount || 0) + ':' + ((g.lastMessage && g.lastMessage.id) || 0) + ':' +
        (g.memberCount || 0) + ':' + (gp.muted ? 1 : 0));
    }
    out.push('@' + (S.peer ? S.peer.id : 0) + ':' + (S.group ? S.group.id : 0));
    return out.join('|');
  }

  window.imChatPrefs = {
    load: imLoadPrefs,
    threadKeyOf: threadKeyOfChat,
    get: function (k) { return imLoadPrefs()[k] || {}; },
    set: function (k, patch) {
      var p = imLoadPrefs();
      p[k] = Object.assign({}, p[k] || {}, patch);
      lsSet(CHAT_PREFS_KEY, JSON.stringify(p));
      return p[k];
    },
    apply: imApplyChatPrefs,
    countUnread: imCountUnread
  };

  function $id(x) { return document.getElementById(x); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function getAiConfig() {
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
  }

  /* ==================== 批次八（2026-09-15）：消息撤回 ====================
     约束与说明：
       - 仅本人发出的私聊消息可撤回；2 分钟时限；轻量确认气泡（非全屏 modal，符合 ADR-3）。
       - 撤回采用「持久化撤回集合」+「占位记录」双保险：
         data.recalled[threadKey][msgId]=1 保证跨刷新 / 跨轮询仍隐藏；
         data.messages 内对应消息标记 recalled:true 占位，时间线不塌。
       - 本地 / AI 好友消息完全本地生效；服务器好友消息因后端无撤回接口，仅本端隐藏，
         不会同步到对方 / 服务端（详见交付说明）。 */
  var RECALL_MS = 2 * 60 * 1000;

  function genMsgId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function imThreadKey() {
    if (S.group) return 'g' + S.group.id;
    if (S.peer) return String(S.peer.id);
    return '';
  }

  function imIsRecalled(key, id) {
    if (!key || id == null) return false;
    var data = loadData();
    return !!(data.recalled && data.recalled[key] && data.recalled[key][String(id)]);
  }

  function imMarkRecalled(key, id) {
    var data = loadData();
    if (!data.recalled) data.recalled = {};
    if (!data.recalled[key]) data.recalled[key] = {};
    data.recalled[key][String(id)] = 1;
    saveData(data);
  }

  /* N9-17（2026-09-15 批次九）：「删除本端」独立持久化集合。
     绝不能复用 data.recalled —— 撤回是双向语义（对方也看不到、时间线留「xx 撤回了一条消息」占位），
     删除本端只是本机不显示这条，两者状态必须分开存，否则删除会被渲染成撤回提示。 */
  function imIsDeleted(key, id) {
    if (!key || id == null) return false;
    var data = loadData();
    return !!(data.deleted && data.deleted[key] && data.deleted[key][String(id)]);
  }
  function imMarkDeleted(key, id) {
    var data = loadData();
    if (!data.deleted) data.deleted = {};
    if (!data.deleted[key]) data.deleted[key] = {};
    data.deleted[key][String(id)] = 1;
    saveData(data);
  }

  /* 每条消息气泡带上定位属性 data-msg-id（稳定唯一 id）/ data-self（是否自己发的）；
     所有消息统一挂载长按手势 + 桌面右键，均指向同一个消息菜单（N9-17 微信式交互）。 */
  function imMsgAttrs(m, isMe) {
    var a = ' data-msg-id="' + esc(m.id) + '" data-self="' + (isMe ? '1' : '0') + '"';
    a += ' ontouchstart="imRecallPressStart(\'' + esc(m.id) + '\',event,this)"' +
      ' ontouchend="imRecallPressEnd()" ontouchmove="imRecallPressMove(event)"' +
      ' oncontextmenu="return imContextMsg(event,\'' + esc(m.id) + '\',this)"';
    return a;
  }

  /* N9-17：撤回资格的唯一判定入口 —— 菜单「撤回」项是否显露、imAskRecall 弹确认前、
     imDoRecall 落库前三处共用同一套条件，避免判定散落各处导致菜单显了却撤不回。
     条件：本人消息 + 非群聊 + 未超过 2 分钟 + 尚未撤回。 */
  function imRecallEligible(m) {
    if (!m) return false;
    if (m.senderId !== S.myId) return false;
    if (S.group) return false;
    if ((Date.now() - (m.time || 0)) > RECALL_MS) return false;
    if (imIsRecalled(imThreadKey(), m.id)) return false;
    return true;
  }

  /* 不合格时的提示：只有「超时」才值得提示，其它情形（他人的消息 / 群聊 / 已撤回）静默 */
  function imRecallDeny(m) {
    if (!m || m.senderId !== S.myId || S.group) return;
    if (imIsRecalled(imThreadKey(), m.id)) return;
    if ((Date.now() - (m.time || 0)) > RECALL_MS) toast('消息已超过 2 分钟，无法撤回');
  }

  var _recallPress = null;
  var _pressOrigin = null;
  var PRESS_MS = 500;       // 长按判定：500ms（与微信一致）
  var PRESS_SLOP = 10;      // 容许抖动半径（px），超过视为滑动滚动 → 取消长按

  function imClearPress() {
    if (_recallPress) { clearTimeout(_recallPress); _recallPress = null; }
    _pressOrigin = null;
  }
  window.imRecallPressStart = function (id, e, el) {
    /* R73 需求3（2026-09-15）：图片气泡不参与长按菜单 —— 否则慢点一下会被吞成「撤回/删除本端」菜单
       而非打开图片预览（需求3 的次因）。命中 img 直接不启动长按计时。 */
    if (e && e.target && String(e.target.tagName || '').toUpperCase() === 'IMG') return;
    imClearPress();
    var t = (e && e.touches && e.touches.length) ? e.touches[0] : null;
    _pressOrigin = t ? { x: t.pageX, y: t.pageY } : { x: 0, y: 0 };
    _recallPress = setTimeout(function () {
      _recallPress = null;
      _pressOrigin = null;
      window.__imRecallHandled = Date.now();
      var anchor = el;
      if (!anchor || !anchor.parentNode) {
        anchor = document.querySelector('[data-msg-id="' + String(id).replace(/"/g, '\\"') + '"]');
      }
      imShowMsgMenu(imFindMsg(id), anchor);
    }, PRESS_MS);
  };
  window.imRecallPressMove = function (e) {
    if (!_recallPress) return;
    var t = (e && e.touches && e.touches.length) ? e.touches[0] : null;
    if (!t || !_pressOrigin) { imClearPress(); return; }
    var dx = t.pageX - _pressOrigin.x;
    var dy = t.pageY - _pressOrigin.y;
    if (dx * dx + dy * dy > PRESS_SLOP * PRESS_SLOP) imClearPress();
  };
  window.imRecallPressEnd = function () {
    if (_recallPress) { clearTimeout(_recallPress); _recallPress = null; }
    _pressOrigin = null;
  };

  /* 桌面右键 → 同一菜单（阻止系统右键菜单） */
  window.imContextMsg = function (e, id, el) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    imShowMsgMenu(imFindMsg(id), el || null);
    return false;
  };

  function imFindMsg(id) {
    var list = S.msgs || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  /* ==================== N9-17（2026-09-15 批次九）：微信式消息菜单 ====================
     形态：气泡旁的非模态浮层（ADR-3 合规，无遮罩、不锁滚动），点外部 / Esc 关闭。
     菜单项：撤回（仅本人 + 私聊 + 2 分钟内）/ 复制 / 删除本端；转发、收藏本次不做，故不显露。
     撤回仍复用既有 imAskRecall → imDoRecall 链路（二次确认气泡保留），只换入口。 */
  var MENU_ID = 'imMsgMenu';

  window.imCloseMsgMenu = function () {
    var el = document.getElementById(MENU_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    imMenuUnbind();
  };
  function imMenuUnbind() {
    document.removeEventListener('mousedown', imMenuDocClose, true);
    document.removeEventListener('touchstart', imMenuDocClose, true);
    document.removeEventListener('keydown', imMenuEscClose, true);
  }
  function imMenuDocClose(ev) {
    var c = document.getElementById(MENU_ID);
    if (!c) { imMenuUnbind(); return; }
    var t = ev && ev.target;
    if (!t || t === c || (c.contains && c.contains(t))) return;
    imCloseMsgMenu();
  }
  function imMenuEscClose(ev) {
    var k = (ev && (ev.keyCode || ev.which)) || 0;
    if (k === 27) imCloseMsgMenu();
  }
  function imPlaceFloat(box, anchorEl) {
    var bw = box.offsetWidth || 120;
    var bh = box.offsetHeight || 60;
    var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 320;
    var vh = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 480;
    var left, top;
    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
      var r = anchorEl.getBoundingClientRect();
      left = r.left + r.width / 2 - bw / 2;
      top = r.top - bh - 6;
      if (top < 8) top = r.bottom + 6;
    } else {
      left = (vw - bw) / 2;
      top = (vh - bh) / 2;
    }
    left = Math.max(8, Math.min(vw - bw - 8, left));
    top = Math.max(8, Math.min(vh - bh - 8, top));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  window.imShowMsgMenu = function (m, anchorEl) {
    if (!m) return;
    imCloseMsgMenu();
    imCloseRecallConfirm();
    var canRecall = imRecallEligible(m);
    var txt = (m.kind === 'image' || m.kind === 'voice' || m.kind === 'location' || m.kind === 'file') ? '' : (m.content || '');
    var html = '';
    if (canRecall) html += '<div class="im-menu-item" onclick="imMenuRecall(\'' + esc(m.id) + '\')">撤回</div>';
    if (txt) html += '<div class="im-menu-item" onclick="imMenuCopy(\'' + esc(m.id) + '\')">复制</div>';
    html += '<div class="im-menu-item im-menu-danger" onclick="imMenuDelete(\'' + esc(m.id) + '\')">删除本端</div>';
    var box = document.createElement('div');
    box.id = MENU_ID;
    box.className = 'im-msg-menu';
    box.innerHTML = html;
    document.body.appendChild(box);
    imPlaceFloat(box, anchorEl);
    // 延后一帧再挂监听，避免打开菜单的那一次触摸/点击立刻把它关掉
    setTimeout(function () {
      if (!document.getElementById(MENU_ID)) return;
      document.addEventListener('mousedown', imMenuDocClose, true);
      document.addEventListener('touchstart', imMenuDocClose, true);
      document.addEventListener('keydown', imMenuEscClose, true);
    }, 0);
  };

  window.imMenuRecall = function (id) {
    imCloseMsgMenu();
    imAskRecall(id);
  };

  /* 复制：优先 navigator.clipboard（可能不存在 / 非安全上下文），失败回退 textarea + execCommand */
  function imCopyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;padding:0;border:0;';
      document.body.appendChild(ta);
      var ua = (window.navigator && window.navigator.userAgent) ? window.navigator.userAgent : '';
      if (/iPad|iPhone|iPod/i.test(ua)) {
        ta.contentEditable = 'true';
        ta.setSelectionRange(0, 999999);
      } else {
        ta.select();
      }
      var done = false;
      try { done = document.execCommand('copy'); } catch (e2) { done = false; }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      return !!done;
    } catch (e) { return false; }
  }
  function imCopyText(text, cb) {
    try {
      if (window.navigator && window.navigator.clipboard && typeof window.navigator.clipboard.writeText === 'function') {
        window.navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(imCopyFallback(text)); });
        return;
      }
    } catch (e) { /* clipboard 不可用 / 抛异常 → 走兜底 */ }
    cb(imCopyFallback(text));
  }

  window.imMenuCopy = function (id) {
    imCloseMsgMenu();
    var m = imFindMsg(id);
    if (!m) return;
    var txt = (m.kind === 'image' || m.kind === 'voice' || m.kind === 'location' || m.kind === 'file') ? '' : (m.content || '');
    if (!txt) { toast('这条消息没有可复制的文字'); return; }
    imCopyText(txt, function (ok) { toast(ok ? '已复制' : '复制失败'); });
  };

  window.imMenuDelete = function (id) {
    imCloseMsgMenu();
    var key = imThreadKey();
    var m = imFindMsg(id);
    if (!key || !m) return;
    imMarkDeleted(key, id);
    m.deleted = true;
    // 会话列表预览同步剔除本条（否则删掉的消息还挂在列表最后一句）
    var data = loadData();
    var pid = S.peer ? S.peer.id : null;
    if (pid != null && data.messages && data.messages[pid] && data.chats && data.chats[pid]) {
      var dset = (data.deleted && data.deleted[key]) || {};
      var arr = data.messages[pid] || [];
      var lastReal = null;
      for (var i = arr.length - 1; i >= 0; i--) {
        var mm = arr[i];
        if (dset[String(mm.id)] || imIsRecalled(key, mm.id)) continue;
        lastReal = mm;
        break;
      }
      data.chats[pid].last = lastReal
        ? (lastReal.kind === 'image' ? '[图片]' : (lastReal.kind === 'voice' ? '[语音]' : (lastReal.kind === 'location' ? '[位置]' : (lastReal.kind === 'file' ? '[文件]' : (lastReal.content || '')))))
        : '';
    }
    saveData(data);
    renderMsgs();
    toast('已删除');
  };

  window.imCloseRecallConfirm = function () {
    var el = document.getElementById('imRecallConfirm');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  /* 轻量确认气泡（非全屏 modal，符合 ADR-3）："确定撤回这条消息？[取消][撤回]"
     本体与 imDoRecall 保持分离 —— 二次确认是 ADR-3 的防误触要求，不能合并掉。 */
  window.imAskRecall = function (id) {
    var msg = imFindMsg(id);
    if (!imRecallEligible(msg)) { imRecallDeny(msg); return; }
    imCloseRecallConfirm();
    var box = document.createElement('div');
    box.id = 'imRecallConfirm';
    box.className = 'im-recall-confirm';
    box.innerHTML = '<div class="im-rc-txt">确定撤回这条消息？</div>' +
      '<div class="im-rc-btns"><button class="im-rc-cancel" onclick="imCloseRecallConfirm()">取消</button>' +
      '<button class="im-rc-ok" onclick="imDoRecall(\'' + esc(id) + '\')">撤回</button></div>';
    document.body.appendChild(box);
    var el = document.querySelector('[data-msg-id="' + String(id).replace(/"/g, '\\"') + '"]');
    if (el) {
      var r = el.getBoundingClientRect();
      var bw = box.offsetWidth || 200;
      var bh = box.offsetHeight || 70;
      var left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
      var top = r.top - bh - 8;
      if (top < 8) top = r.bottom + 8;
      box.style.left = left + 'px';
      box.style.top = top + 'px';
    } else {
      box.style.left = '50%';
      box.style.top = '50%';
      box.style.transform = 'translate(-50%,-50%)';
    }
    // 点击气泡外部关闭
    setTimeout(function () {
      var docClose = function (ev) {
        var c = document.getElementById('imRecallConfirm');
        if (!c) { document.removeEventListener('click', docClose, true); return; }
        if (!c.contains(ev.target)) { imCloseRecallConfirm(); document.removeEventListener('click', docClose, true); }
      };
      document.addEventListener('click', docClose, true);
    }, 0);
  };

  /* 执行撤回：走与 imAskRecall 同一个 imRecallEligible 判定，落库隐藏并刷新会话列表。
     本体与 imAskRecall 保持分离：确认气泡负责防误触，本函数负责落库。 */
  window.imDoRecall = function (id) {
    imCloseRecallConfirm();
    var key = imThreadKey();
    var msg = imFindMsg(id);
    if (!imRecallEligible(msg)) { imRecallDeny(msg); return; }
    imMarkRecalled(key, id);
    // 本地存储内对应消息标记占位（时间线不塌），并刷新会话列表预览
    var data = loadData();
    var pid = S.peer ? S.peer.id : null;
    var rset = (data.recalled && data.recalled[key]) || {};
    if (pid != null && data.messages && data.messages[pid]) {
      /* 占位标记：S.msgs 是 data.messages[pid] 按下标一一映射的视图（本地消息载入时 id 会被重排
         为下标+1），故按下标 / 按 id / 按撤回集合三路命中，避免 id 重排后占位与预览刷新失效。 */
      var hitIdx = -1;
      (S.msgs || []).forEach(function (m, i) { if (String(m.id) === String(id)) hitIdx = i; });
      var hidden = [];
      (data.messages[pid] || []).forEach(function (m2, i) {
        var hit = (i === hitIdx) || String(m2.id) === String(id) || !!rset[String(m2.id)];
        if (hit) { m2.recalled = true; if (m2.content != null) m2.content = ''; }
        hidden[i] = hit;
      });
      if (data.chats && data.chats[pid]) {
        var arr = data.messages[pid] || [];
        var lastReal = null;
        for (var i = arr.length - 1; i >= 0; i--) { if (!hidden[i]) { lastReal = arr[i]; break; } }
        data.chats[pid].last = lastReal
          ? (lastReal.kind === 'image' ? '[图片]' : (lastReal.kind === 'voice' ? '[语音]' : (lastReal.kind === 'location' ? '[位置]' : (lastReal.kind === 'file' ? '[文件]' : (lastReal.content || '')))))
          : '你撤回了一条消息';
      }
    }
    saveData(data);
    S.msgs.forEach(function (m3) { if (String(m3.id) === String(id)) m3.recalled = true; });
    renderMsgs();
    loadChats();
  };
  function getFriend(id) {
    var all = getActiveAiFriends();
    var f = all.find(function (x) { return x.id === id; });
    if (f) return f;
    f = SERVER_FRIENDS.find(function (x) { return x.id === id; });
    if (f) return f;
    /* R39（2026-09-14）：动态生成的非好友服务器会话（如管理员来信）也要能被
       imOpenChat 打开 —— imOpenChat 第一行 getFriend(friendId) 拿不到就 return，
       这里补一层 S.chats 回退，会话行才能点开进服务器分支。 */
    var c = (S.chats || []).find(function (x) { return x.isServer && x.id === id; });
    if (c) return { id: c.id, serverId: c.serverId, nickname: c.nickname, avatar: c.avatar, motto: '', isServer: true };
    return undefined;
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

  /* R72（Bug1）：优先以服务端「全部会话」为准重建；接口失败回落本地逻辑（可用性不降级）。 */
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

  /* 需求D（2026-09-17）：好友展示名统一取值 —— 备注名 > 昵称 > 兜底。
     旧行为「有备注 → 备注名（原名）」已按需求废弃：设备注后一律只显示备注名，不再拼原名。
     统一走 api.js 的公共封装 window.friendDisplayName；api.js 未加载时降级为本地同逻辑实现，
     两处取值顺序完全一致，绝不出现「列表显示备注、标题显示昵称」的撕裂。
     签名：imFriendName(friendObj, fallback) / imFriendName(remark, nickname, fallback) */
  function imFriendName(friend, nickname, fallback) {
    if (typeof window.friendDisplayName === 'function') {
      return window.friendDisplayName(friend, nickname, fallback);
    }
    var r = '';
    var n = '';
    var fb;
    if (friend !== null && typeof friend === 'object') {
      r = (friend.peerRemark == null ? '' : String(friend.peerRemark)).replace(/^\s+|\s+$/g, '');
      n = (friend.nickname == null ? '' : String(friend.nickname)).replace(/^\s+|\s+$/g, '');
      fb = (typeof nickname === 'undefined') ? undefined : nickname;
    } else {
      r = (friend == null ? '' : String(friend)).replace(/^\s+|\s+$/g, '');
      n = (nickname == null ? '' : String(nickname)).replace(/^\s+|\s+$/g, '');
      fb = (typeof fallback === 'undefined') ? undefined : fallback;
    }
    if (r) return r;
    if (n) return n;
    return (fb === undefined || fb === null) ? '未设置昵称' : String(fb);
  }
  /* 需求D：接口未回 peerRemark 的位置（/api/friends/search、/api/friends/requests、
     /api/users/{id}、/api/admin/users 等），回落到本地备注缓存 imRemarkOf 再取值。
     仅「服务器实体」才查缓存：AI 伙伴 / 本地好友没有 serverId 与 username，
     拿它们的本地小号 id 去查会把同号服务器用户的备注错配过去。 */
  function imFriendNameOf(u, fallback) {
    var o = u || {};
    var r = (o.peerRemark != null && o.peerRemark !== '') ? o.peerRemark : '';
    if (!r) {
      var sid = Number(o.serverId || ((o.username || o.userId) ? (o.id || o.userId) : 0) || 0);
      if (sid) r = imRemarkOf(sid);
    }
    return imFriendName({ peerRemark: r, nickname: o.nickname }, fallback);
  }
  /* 备注显示名（保留旧函数名与全部旧调用点）：有备注 → 备注名；无备注 → 昵称。 */
  function imDisplayName(remark, nickname) {
    return imFriendName(remark, nickname, '');
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
  }

  function renderList() {
    var box = $id('imList');
    if (!box) return;
    if (S.tab === 'chats') renderChats(box);
    else if (S.tab === 'friends') renderFriends(box);
    else if (S.tab === 'groups') renderGroupsTab(box); // R56：群聊 tab = 「我的群聊」列表
    else renderRequests(box);
  }

  /* R56（2026-09-14）：「我的群聊」分组从好友 tab 迁到「群聊」tab。
     - 好友 tab 只剩 AI伙伴 + 我的好友（顺带消掉 R49「每 30s 重建整表」的一半来源）
     - 群行复用 imRenderGroupRows()（与会话 tab 同源，视觉/未读角标/左滑行为一致）
     - 顶部「+ 发起群聊」复用既有 imOpenGroupCreator()（弹层，关闭后仍留在本 tab）
     - 未登录 / 加载失败给出明确提示与重试入口，不给空白面板 */
  var lastGroupsSig = '';
  function imGroupsSig() {
    var prefs = imLoadPrefs();
    var parts = (S.groups || []).filter(function (g) { return !((prefs['g' + g.id] || {}).hidden); })
      .map(function (g) {
        var gp = prefs['g' + g.id] || {};
        return g.id + ':' + (g.name || '') + ':' + (g.avatar || '') + ':' + (g.unreadCount || 0) + ':' +
          ((g.lastMessage && g.lastMessage.id) || 0) + ':' + (g.memberCount || 0) + ':' + (gp.muted ? 1 : 0);
      });
    return parts.join('|') + '#lf' + (S.groupsLoadFailed ? 1 : 0) + '#tok' + (getToken() ? 1 : 0);
  }
  function renderGroupsTab(box) {
    if (!box) return;
    lastGroupsSig = imGroupsSig();
    if (!getToken()) {
      box.innerHTML = '<div class="im-empty2">登录后可查看和发起群聊</div>';
      return;
    }
    var prefs = imLoadPrefs();
    var groups = (S.groups || []).filter(function (g) { return !((prefs['g' + g.id] || {}).hidden); });
    // Bug2（R72）：管理员看到的是全部群（只读），标题明示「管理员视图 · 只读」避免误操作
    var head = S.isAdmin
      ? '<div class="im-group-title">👥 全部群聊 (' + groups.length + ') <span style="font-size:11px;color:#999;font-weight:400">（管理员视图 · 只读）</span></div>'
      : '<div class="im-group-title">👥 我的群聊 (' + groups.length + ')</div>';
    var createBtn = '<div class="im-sess" style="cursor:pointer" onclick="window.imOpenGroupCreator()">' +
      '<div class="im-av" style="background:#f0f0f0;color:#999">+</div>' +
      '<div class="im-si"><div class="im-n" style="color:#667eea">发起群聊</div>' +
      '<div class="im-sub">选择 2 位以上好友创建一个新的群聊</div></div></div>';
    var rows = imRenderGroupRows(groups, prefs);
    if (!rows) {
      var state = S.groupsLoadFailed
        ? '<span style="color:#e05040">加载失败</span>，<a style="color:var(--primary);cursor:pointer" onclick="loadGroups()">点此重试</a>'
        : ((S.groups || []).length ? '群聊已全部被隐藏（左滑可恢复）' : '加载中…');
      box.innerHTML = head + createBtn + '<div class="im-empty2" style="padding:6px 0 6px 14px">' + state + '</div>';
      if (!S._groupsFetched) { S._groupsFetched = true; loadGroups(); }
      return;
    }
    box.innerHTML = head + createBtn + rows;
  }
  window.imRenderGroupsTab = renderGroupsTab;

  /* T03 增量（2026-09-12）：群行共用渲染函数
     - 会话 tab（renderChats）与好友 tab（renderFriends）共用同一份 HTML，避免双份维护漂移
     - 入参：groups = S.groups 全量；prefs = imLoadPrefs() 全量
     - 出参：完整 HTML 字符串（已含 .im-swipe 外壳 + 左滑操作）
     - 复用 previewText() 渲染最后一条消息预览（image→[图片] / voice→[语音]） */
  function imRenderGroupRows(groups, prefs) {
    groups = groups || [];
    prefs = prefs || {};
    if (groups.length === 0) return '';
    return groups.map(function (g) {
      var gk = 'g' + g.id;
      var gp = prefs[gk] || {};
      var active = S.group && S.group.id === g.id;
      // Bug2（R72）：管理员视图行只读 —— 不挂进入群会话的 onclick（非成员点入会被后端 403）
      var isAdminView = (g.role === 'admin-view');
      var rowClick = isAdminView ? '' : (' onclick="imOpenGroup(' + g.id + ')"');
      var rowTitle = isAdminView ? ' title="管理员视图（只读）"' : '';
      return '<div class="im-swipe" data-tid="' + esc(gk) + '">' +
        '<div class="im-sess' + (active ? ' on' : '') + '" data-tid="' + esc(gk) + '"' + rowClick + rowTitle + '>' +
        '<div class="im-av" style="position:relative">' + imGroupAvatarHtml(g.avatar, g.name) +
        (g.unreadCount > 0 ? '<span class="im-av-badge">' + (g.unreadCount > 99 ? '99+' : g.unreadCount) + '</span>' : '') + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(g.name) + ' <span style="font-size:11px;color:#999">(' + g.memberCount + ')</span></div>' +
        '<div class="im-sub">' + esc(g.lastMessage ? ((g.lastMessage.senderId === S.myId ? '我：' : '') + previewText(g.lastMessage.kind, g.lastMessage.content)) : '') + '</div></div>' +
        (gp.muted ? '<div class="im-mute-tag" title="免打扰">🔕</div>' : '') +
        (g.unreadCount > 0 ? '<div class="im-badge">' + (g.unreadCount > 99 ? '99+' : g.unreadCount) + '</div>' : '') +
        '</div>' + imSwipeActionsHtml(gk, gp, true) + '</div>';
    }).join('');
  }

  function renderChats(box) {
    var prefs = imLoadPrefs();
    // R46：记下本次渲染所对应的状态签名，供 5s 未读轮询做「无变化不重建」判断
    lastChatsSig = imChatsSig();
    // 需求2：被「删除」的群会话同样仅本机隐藏
    var groups = (S.groups || []).filter(function (g) { return !((prefs['g' + g.id] || {}).hidden); });
    var chatList = imApplyChatPrefs(S.chats, prefs);
    if (chatList.length === 0 && groups.length === 0) { box.innerHTML = '<div class="im-empty2">还没有会话，去好友列表找个朋友聊聊吧</div>'; return; }
    // T4 增量：群聊会话置顶展示（带未读角标）；批次二：包一层 .im-swipe 支持左滑操作
    var groupHtml = imRenderGroupRows(groups, prefs);
    var chatHtml = chatList.map(function (c) {
      var ck = threadKeyOfChat(c);
      var active = S.peer && S.peer.id === c.id;
      // 缺口3修复（2026-09-17）：私聊会话列表点对方头像 → 直接进入对方公开主页（openUserHome →
      // 个人资料.html?user=<id>）。openUserHome 未加载时（极少数轻量页）由 imOpenPeerHome 兜底跳转，
      // 仍无 serverId 时回退到原提示，绝不留死链。
      var avClick = c.isServer && c.serverId
        ? 'event.stopPropagation();imOpenPeerHome(' + c.serverId + ')'
        : 'event.stopPropagation()';
      // 批次二 需求6：会话列表右侧在线状态。仅服务器会话且 presence 缓存命中时显示（值来自服务端 lastSeenAt）；
      // 无后端 / file:// / 字段缺失时整段为空字符串，绝不显示假时间。
      var p = (c.isServer && c.serverId) ? S.presence[c.serverId] : null;
      var presHtml = (p && presenceText(p.lastSeenAt, p.online))
        ? '<div class="im-presence im-presence-side' + (p.online ? ' on' : '') + '" data-uid="' + c.serverId + '">' + esc(presenceText(p.lastSeenAt, p.online)) + '</div>'
        : '';
      return '<div class="im-swipe" data-tid="' + esc(ck) + '">' +
        '<div class="im-sess' + (active ? ' on' : '') + '" data-tid="' + esc(ck) + '" onclick="imOpenChat(' + c.id + ')">' +
        '<div class="im-av" style="position:relative;cursor:' + (c.isServer ? 'pointer' : 'default') + '" onclick="' + avClick + '">' + renderAvatar(c.avatar, imFriendNameOf(c)) +
        (c.unread > 0 ? '<span class="im-av-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '') + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(c)) + (c.pinned ? ' <span class="im-pin-tag" title="已置顶">📌</span>' : '') + '</div><div class="im-sub">' + esc(c.last || '') + '</div></div>' +
        (c.muted ? '<div class="im-mute-tag" title="免打扰">🔕</div>' : '') +
        presHtml +
        (c.unread > 0 ? '<div class="im-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</div>' : '') +
        '</div>' + imSwipeActionsHtml(ck, prefs[ck] || {}) + '</div>';
    }).join('');
    /* R73 需求19：会话列表同缺陷 —— innerHTML 重建会重置滚动位置，先记后恢复（避免轮询时列表弹回顶部）。 */
    var prevListTop = box.scrollTop;
    box.innerHTML = groupHtml + chatHtml;
    box.scrollTop = prevListTop;
    // BUG-1（QA Round1，2026-09-11h）：innerHTML 重建后左滑展开态的 DOM（transform/.open）已随旧节点销毁，
    // 但 S.swipeOpen 若残留，捕获阶段 click 监听器会误判「有展开态」→ stopPropagation 吞掉第一次点击。
    // 这里必须显式清空：重渲染即视为收起（每 5s 未读轮询都会重渲染，重放展开态反而会让操作栏常挂）。
    // 不要"优化"掉这一行 —— imCloseSwipe 开头的 !S.swipeOpen 早退与它不冲突（先 null 再调用只是无害空转）。
    S.swipeOpen = null;
  }

  /* 单行的左滑操作按钮（置于 .im-swipe 容器内、行内容下层，左滑行内容后露出）。
     群聊行（isGroup=true）不提供「置顶」：群会话本就固定在列表顶部展示，
     写 pinned 无任何视觉变化，只会让「📌 已置顶」toast 误导用户 —— 直接隐藏该按钮。 */
  function imSwipeActionsHtml(key, pf, isGroup) {
    pf = pf || {};
    return '<div class="im-swipe-actions">' +
      (isGroup ? '' : '<div class="im-sa im-sa-pin" onclick="imSwipeAct(\'' + key + '\',\'pin\')">' + (pf.pinned ? '取消置顶' : '置顶') + '</div>') +
      '<div class="im-sa im-sa-mute" onclick="imSwipeAct(\'' + key + '\',\'mute\')">' + (pf.muted ? '提醒' : '免打扰') + '</div>' +
      '<div class="im-sa im-sa-del" onclick="imSwipeAct(\'' + key + '\',\'del\')">删除</div>' +
      '</div>';
  }

  /* 消息预览文案（A7）：text→原文；image→[图片]；voice→[语音]；未知 kind 一律按文本 */
  function previewText(kind, content) {
    if (kind === 'image') return '[图片]';
    if (kind === 'voice') return '[语音]';
    if (kind === 'location') return '[位置]';
    if (kind === 'file') return '[文件]';
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
      if (row) {
        // 位移 = 该行操作按钮数 × 52px（群聊行无「置顶」只有 2 个按钮，避免多滑出 52px 空隙）
        row.style.transform = open ? 'translateX(-' + (52 * wEl.querySelectorAll('.im-sa').length) + 'px)' : '';
      }
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

  /* A2：点会话头像时的提示（缺口3修复后仅作为 openUserHome 缺失 / serverId 非法时的兜底） */
  window.imShowPeerHint = function (serverId) {
    var f = (SERVER_FRIENDS || []).find(function (x) { return x.serverId === serverId; });
    if (!f) f = (S.chats || []).find(function (x) { return x.isServer && x.serverId === serverId; });
    toast('「' + (f ? imFriendNameOf(f, '好友') : '好友') + '」点整行开始聊天 · 查看资料请到好友列表');
  };

  /* 缺口3修复（2026-09-17）：会话列表点对方头像 → 打开其公开主页。
     优先用 api.js 的 openUserHome（私聊.html 已按顺序加载 api.js）；缺失时同义兜底跳转；
     serverId 非法（0/空）才回退到 imShowPeerHint 提示，绝不留死链。 */
  window.imOpenPeerHome = function (serverId) {
    var uid = Number(serverId);
    if (uid && typeof window.openUserHome === 'function') { window.openUserHome(uid); return; }
    if (uid) { location.href = '个人资料.html?user=' + encodeURIComponent(uid); return; }
    window.imShowPeerHint(serverId);
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
          peerRemark: u.peerRemark || '',
          isServer: true
        };
      });
      if (cb) cb(SERVER_FRIENDS);
    })
    .catch(function () { if (cb) cb([]); });
  }

  /* R39（2026-09-14）：非好友来信（如管理员私信）→ 动态补一条服务器会话。
     背景：S.chats 只从好友列表构建，未读轮询里 peerId 匹配不到就把整条未读静默丢弃，
     管理员看得到顶栏角标却无会话可点。修复：匹配不到时按服务器好友形状动态创建并入列。
     字段映射注意：/api/chat/unread 返回 avatar（好友列表 /api/friends 是 avatarUrl），缺失兜底默认头像。
     同时写入本地持久化（与现有服务器会话同一 data.chats 键空间），刷新后由 loadChats 回填；
     已读归零后会话行保留（管理员要能继续这个对话），生命周期由用户手动删除。 */
  function imEnsureServerChat(item) {
    if (!item || !item.peerId) return null;
    var peerId = Number(item.peerId);
    var fid = 10000 + peerId;
    var chat = {
      id: fid,
      serverId: peerId,
      nickname: item.nickname || ('用户' + peerId),
      avatar: item.avatar || '',
      last: item.last || '',
      unread: item.count || 0,
      time: Date.now(),
      isServer: true
    };
    S.chats.push(chat);
    try {
      var data = loadData();
      data.chats[fid] = {
        id: fid, serverId: peerId, isServer: true,
        nickname: chat.nickname, avatar: chat.avatar,
        last: chat.last, unread: 0, time: chat.time
      };
      saveData(data);
    } catch (e) { /* localStorage 满 / 隐私模式：内存态仍可用 */ }
    return chat;
  }

  /* R43（2026-09-14）：普通用户侧解析「管理员 id」（与 admin-contact.js 共用 localStorage 缓存键
     xt_admin_user_id）。用于未读轮询：管理员来信统一走「联系管理员」入口 + 角标，
     不在此动态建会话行，避免入口与角标分离 / 重复会话。 */
  var IM_ADMIN_ID_KEY = 'xt_admin_user_id';
  var _imAdminId = 0;
  function imCachedAdminId() {
    if (_imAdminId) return _imAdminId;
    try { var c = localStorage.getItem(IM_ADMIN_ID_KEY) || ''; if (/^\d+$/.test(c)) _imAdminId = Number(c); } catch (e) { /* 忽略 */ }
    return _imAdminId;
  }
  function imResolveAdminId() {
    var id = imCachedAdminId();
    if (id) return Promise.resolve(id);
    var tk = getToken();
    if (!tk) return Promise.resolve(0);
    return fetch(apiBase() + '/api/admin/contact', { headers: { 'Authorization': 'Bearer ' + tk } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var v = Number(d && (d.id !== undefined ? d.id : d.userId)) || 0;
        if (v) { _imAdminId = v; try { localStorage.setItem(IM_ADMIN_ID_KEY, String(v)); } catch (e) { /* 忽略 */ } }
        return v;
      })
      .catch(function () { return 0; });
  }

  /* R40（2026-09-14）：最近活跃时间轻量格式化（管理员用户列表徽标用）。
     lastActive 为服务端 'YYYY-MM-DD HH:MM:SS' 串，可能为空 → 「—」。 */
  function imFmtLastActive(s) {
    if (!s) return '—';
    var t = new Date(String(s).replace(' ', 'T'));
    if (isNaN(t.getTime())) return '—';
    var diff = Date.now() - t.getTime();
    if (diff < 0) diff = 0;
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 7) return d + ' 天前';
    return ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }

  /* R40（2026-09-14）：管理员好友 tab「全部用户」分组渲染。
     数据源 GET /api/admin/users（仅管理员可调）；仅列表展示，不写好友表。
     行样式沿用注册好友行；昵称旁追加活跃徽标（在线=绿点，否则格式化 lastActive）。
     is_admin 行标注「管理员」且不隐藏自己。 */
  /* R41：把不可信字符串安全嵌入内联 onclick 的 JS 单引号字面量（先 HTML 转义 & < > "，再 JS 转义 \ '），
     避免昵称含引号时破坏 onclick 属性或 JS 语法。 */
  function imStrArg(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function imAdminUsersHtml(items) {
    var rows = (items || []).map(function (u) {
      var avSrc = u.avatarUrl || u.avatar || '';
      var av = avSrc
        ? '<img src="' + (function (x) { return (x.indexOf('http') === 0 ? x : apiBase() + x); })(avSrc) + '" alt="" style="cursor:pointer" onclick="event.stopPropagation();imShowUserProfile(' + u.id + ')">'
        : '<span style="cursor:pointer" onclick="event.stopPropagation();imShowUserProfile(' + u.id + ')">' + esc(imFriendNameOf(u, '友').slice(0, 1)) + '</span>';
      var fid = 10000 + u.id;
      var isAdminRow = !!(u.isAdmin || u.is_admin);
      var tag = isAdminRow ? ' <span style="font-size:11px;color:#e05040">[管理员]</span>' : '';
      var act = (u.isOnline === true)
        ? '<span style="font-size:11px;color:#0a8f4b;font-weight:600">● 在线</span>'
        : '<span style="font-size:11px;color:#999">最近活跃 ' + esc(imFmtLastActive(u.lastActive || u.last_active)) + '</span>';
      // R41：行 / 「发消息」按钮 → imOpenChatWithUser（合成 peer，非好友也能直接开聊）；昵称/头像安全内联
      var ocArgs = u.id + ', \'' + imStrArg(u.nickname) + '\', \'' + imStrArg(u.avatarUrl || u.avatar) + '\'';
      return '<div class="im-sess" onclick="imOpenChatWithUser(' + ocArgs + ')">' +
        '<div class="im-av" style="position:relative">' + av + '<span class="im-dot" data-uid="' + u.id + '"></span></div>' +
        '<div class="im-si"><div class="im-n" style="cursor:pointer" onclick="event.stopPropagation();imShowUserProfile(' + u.id + ')">' + esc(imFriendNameOf(u, '用户')) + tag + (u.username ? ' <span style="font-size:11px;color:#999;font-weight:400">@' + esc(u.username) + '</span>' : '') + '</div>' +
        '<div class="im-sub">' + act + '</div></div>' +
        '<div style="color:#667eea;font-size:12px;cursor:pointer" onclick="event.stopPropagation();imOpenChatWithUser(' + ocArgs + ')">发消息</div>' +
        '</div>';
    }).join('');
    return '<div class="im-group-title">👥 全部用户 (' + (items || []).length + ')</div>' + rows;
  }

  /* R57（2026-09-14）：分组标题「注册好友」→「我的好友」（与「我的群聊」措辞对齐）。
     R49：抽成纯函数，好友 tab 首次/轮询两条路径共用同一份 HTML，缓存命中时可同步渲染。 */
  function imRegFriendsHtml(friends) {
    var list = friends || [];
    if (!list.length) {
      return '<div class="im-group-title">👥 我的通讯录 (0)</div>' +
        '<div class="im-empty2">还没有好友<br>在上方搜索框输入用户名找人添加好友</div>';
    }
    var rows = list.map(function (f) {
      var av = f.avatarUrl || f.avatar
        ? '<img src="' + (function (u) { return (u.indexOf('http') === 0 ? u : apiBase() + u); })(f.avatarUrl || f.avatar) + '" alt="" style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">'
        : '<span style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">' + esc(imFriendNameOf(f, '友').slice(0, 1)) + '</span>';
      /* 批次二 需求11（2026-09-11h）：好友行只保留「发消息」，删除好友入口统一收敛到
         对方公开主页（个人中心.html?user=id → api.js renderUserHome 的「🗑 删除好友」，uiConfirm 二次确认）。 */
      return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
        '<div class="im-av" style="position:relative">' + av + '<span class="im-dot" data-uid="' + f.serverId + '"></span></div>' +
        '<div class="im-si"><div class="im-n" style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + f.serverId + ')">' + esc(imFriendNameOf(f)) + ' <span style="font-size:11px;color:#999">@' + esc(f.username) + '</span></div>' +
        '<div class="im-sub">' + esc(f.motto) + ' <span class="im-presence" data-uid="' + f.serverId + '"></span></div></div>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
          '<div style="color:#667eea;font-size:12px;cursor:pointer" onclick="event.stopPropagation();imOpenChat(' + f.id + ')">发消息</div>' +
        '</div>' +
        '</div>';
    }).join('');
    return '<div class="im-group-title">👥 我的通讯录 (' + list.length + ')</div>' + rows;
  }

  function renderFriends(box) {
    var token = getToken();
    // R46：记下本次渲染对应的好友状态签名，供 30s 群/好友轮询做「无变化不重建」判断
    lastFriendsSig = imFriendsSig();
    // AI好友分组（可折叠）
    var activeAi = getActiveAiFriends();
    var aiExpanded = S.aiExpanded !== false; // 默认展开
    var aiArrow = aiExpanded ? '▼' : '▶';
    var aiHtml = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0 4px;cursor:pointer" onclick="window.toggleAiGroup()">' +
      '<span style="font-size:13px;font-weight:600;color:#333;display:inline-flex;align-items:center;gap:4px"><span data-icon="bot" data-icon-size="14"></span>AI伙伴 (' + activeAi.length + ')</span>' +
      '<span style="font-size:11px;color:#999">' + aiArrow + '</span></div>';
    if (aiExpanded) {
      aiHtml += activeAi.map(function (f) {
        return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
          '<div class="im-av">' + f.avatar + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(f)) + '</div><div class="im-sub">' + esc(f.motto) + '</div></div>' +
          '<div style="color:#667eea;font-size:12px;cursor:pointer" onclick="event.stopPropagation();imOpenChat(' + f.id + ')">发消息</div>' +
          '</div>';
      }).join('');
      // 添加AI按钮
      aiHtml += '<div class="im-sess" style="cursor:pointer" onclick="window.openAiStore()">' +
        '<div class="im-av" style="background:#f0f0f0;color:#999">+</div>' +
        '<div class="im-si"><div class="im-n" style="color:#667eea">添加AI伙伴</div><div class="im-sub">选择更多AI角色</div></div>' +
        '</div>';
    }

    /* R56（2026-09-14）：「我的群聊」分组已迁到「群聊」tab（见 renderGroupsTab），好友 tab 不再渲染群行。
       R49（2026-09-14）：SERVER_FRIENDS 有缓存时**同步直接渲染**，绝不先写「加载中…」再异步覆盖 ——
       旧代码每次 renderFriends 都先把好友区清空成「加载中…」，而 30s loadGroups() 在好友 tab 下
       会触发 renderFriends()，于是用户每 30 秒看到一次列表闪空。现在只有「从未加载过」才显示占位。 */
    if (!token) {
      box.innerHTML = aiHtml + '<div class="im-group-title">👥 我的通讯录</div><div class="im-empty2">登录后可添加注册用户为好友</div>';
      if (window.lucideAutoRender) window.lucideAutoRender();
      return;
    }

    var cached = SERVER_FRIENDS || [];
    if (cached.length) {
      box.innerHTML = aiHtml + imRegFriendsHtml(cached);
      lastFriendsSig = imFriendsSig();   // R49：签名为准到「真正写进 DOM 的那一刻」
      if (window.lucideAutoRender) window.lucideAutoRender();
    } else {
      box.innerHTML = aiHtml + '<div class="im-group-title">👥 我的通讯录</div><div class="im-empty2">加载中…</div>';
      // 占位态哨兵：异步结果无论「有没有变化」都必须回写一次（否则 0 好友时永远停在「加载中…」）
      lastFriendsSig = '__pending__';
      if (window.lucideAutoRender) window.lucideAutoRender();
    }

    /* 原注册好友渲染抽成函数（R40）：管理员用户列表拉取失败时降级复用 */
    function renderRegFriends() {
      loadServerFriends(function (friends) {
        /* R49：异步结果只在「签名真的变了」时才回写 DOM。
           —— 有缓存（已同步渲染过）时无变化直接 return，列表绝不回退成「加载中…」；
           —— 占位态（lastFriendsSig === '__pending__'）必然与真实签名不同，保证回填一次。 */
        var sig2 = imFriendsSig();
        if (sig2 === lastFriendsSig) return;
        lastFriendsSig = sig2;
        box.innerHTML = aiHtml + imRegFriendsHtml(friends);
        if (window.lucideAutoRender) window.lucideAutoRender();
      });
    }

    /* R40（2026-09-14）：管理员登录时，「我的好友」分组改为渲染全量用户
       （数据源 GET /api/admin/users，仅管理员可调；仅列表展示，不写好友表）。
       分组标题「👥 全部用户 (N)」，昵称旁追加最近活跃徽标（在线=绿点 / lastActive 格式化）。
       点击行走现有 imOpenChat 服务器分支（isServer/serverId），后端 can_message 已放行
       管理员↔任意用户。拉取失败（403/网络）降级回 /api/friends 行为并 console.warn，不打断页面。 */
    if (S.isAdmin) {
      fetch(apiBase() + '/api/admin/users', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (res) {
        var items = (res.ok && res.d && res.d.items) ? res.d.items : null;
        if (!items) throw new Error('HTTP ' + res.status);
        box.innerHTML = aiHtml + imAdminUsersHtml(items);
        lastFriendsSig = imFriendsSig();   // R46：管理员「全部用户」分支同理
        if (window.lucideAutoRender) window.lucideAutoRender();
      })
      .catch(function (e) {
        console.warn('[chat-local] 管理员用户列表拉取失败，降级为好友列表', e);
        renderRegFriends();
      });
      return;
    }

    renderRegFriends();
  }

  /* ============ A5：删除好友（二次确认含昵称；可选清空本机聊天记录） ============ */
  window.imRemoveFriend = function (serverId) {
    var f = (SERVER_FRIENDS || []).find(function (x) { return x.serverId === serverId; });
    var name = f ? imFriendNameOf(f, '该好友') : '该好友';
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
        '<div style="flex:1"><div style="font-size:14px;font-weight:500">' + esc(imFriendNameOf(a)) + '</div>' +
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
        box.innerHTML = '<div class="im-empty2">暂无好友申请<br><span style="font-size:12px;color:#999">在上方搜索框输入用户名找人添加好友</span></div>';
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
          : esc(imFriendNameOf(u, '友').slice(0, 1));
        var me = r.fromMe ? ' <span style="font-size:11px;color:#999">（我发出的）</span>' : '';
        return '<div class="im-sess">' +
          '<div class="im-av">' + av + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(u, '用户')) + me + ' <span style="font-size:11px;color:#999">@' + esc(u.username || '') + '</span> ' + statusTag(r.status, r.fromMe) + '</div>' +
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
    window.uiConfirm('确定删除这条申请记录吗？', '删除').then(function (ok) {
      if (!ok) return;
      fetch(API_BASE + '/api/friends/requests/' + rid, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(function (r) { return r.json(); })
      .then(function () { toast('已删除'); renderRequests($id('imList')); })
      .catch(function (e) { toast('失败：' + (e.message || '')); });
    });
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
    imResetMsgPaging(); // R73 需求19：切换会话重置分页 / 签名状态
    // R60：告诉 app.js 当前会话对象（本地/AI 好友没有 serverId → null，避免误报）
    xtSetChatUser(S.peer.isServer ? S.peer.serverId : null);
    getOrCreateChat(friendId);

    var data = loadData();
    if (data.chats[friendId]) { data.chats[friendId].unread = 0; saveData(data); }

    S.msgs = (data.messages[friendId] || []).map(function (m, i) {
      return { id: i + 1, senderId: m.senderId, content: m.content, kind: m.kind, time: m.time, duration: m.duration, sub: m.sub, lat: m.lat, lng: m.lng };
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
        imHasMore = !!d.hasMore; // R73 需求19：记录是否还有更早历史，供滚动加载更多
        if (items.length > 0) {
          S.msgs = items.map(function (m) {
            return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, sub: m.sub, lat: m.lat, lng: m.lng, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };
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

  /* R41（2026-09-14）：管理员在「全部用户」列表点「给用户发消息」时，目标既非好友、
     也还没有会话 → getFriend() 查不到，imOpenChat 会静默 return（点击无反应）。
     这里用形参构造合成服务器 peer，确保其进入 S.chats 并持久化，再交给 imOpenChat 打开。 */
  window.imOpenChatWithUser = function (userId, nickname, avatar) {
    var uid = Number(userId);
    if (!uid) return;
    var fid = 10000 + uid;
    var existing = (S.chats || []).find(function (x) { return x.id === fid; });
    if (existing) {
      existing.serverId = uid;
      existing.isServer = true;
      if (nickname) existing.nickname = nickname;
      if (avatar) existing.avatar = avatar;
    } else {
      var chat = {
        id: fid, serverId: uid, isServer: true,
        nickname: nickname || ('用户' + uid), avatar: avatar || '',
        last: '', unread: 0, time: Date.now()
      };
      S.chats.push(chat);
      try {
        var data = loadData();
        data.chats[fid] = {
          id: fid, serverId: uid, isServer: true,
          nickname: chat.nickname, avatar: chat.avatar,
          last: '', unread: 0, time: chat.time
        };
        saveData(data);
      } catch (e) { /* localStorage 满 / 隐私模式：内存态仍可用 */ }
    }
    window.imOpenChat(fid);
  };

  // 渲染聊天头部（适配当前 HTML：操作 imCAv/imCName/imBack 元素）
  /* R73 需求18③（2026-09-15）：普通用户可达的备注入口（聊天头部「✎」按钮）。
     复用既有 imOpenRemarkEditor，不另写弹窗；保存后由 imSaveRemark 刷新头部 + 列表。 */
  function imEnsureRemarkBtn(show) {
    var nameEl = $id('imCName');
    if (!nameEl || !nameEl.parentNode) return;
    var btn = $id('imRemarkBtn');
    if (!show) { if (btn) btn.style.display = 'none'; return; }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'imRemarkBtn';
      btn.className = 'im-icon';
      btn.type = 'button';
      btn.title = '设置备注';
      btn.textContent = '✎';
      btn.onclick = function () { imOpenRemarkForCurrentChat(); };
      nameEl.parentNode.insertBefore(btn, nameEl.nextSibling);
    }
    btn.style.display = 'block';
  }
  function imOpenRemarkForCurrentChat() {
    if (S.group) return;                                   // 群聊无备注
    if (!S.peer || !S.peer.isServer) { toast('仅服务器好友支持设置备注'); return; }
    window.imOpenRemarkEditor(S.peer.serverId, S.peer.nickname || '');
  }

  function renderChatHeader() {
    var avEl = $id('imCAv');
    var nameEl = $id('imCName');
    if (S.group) {
      // T4 增量：群会话头部（群名 + 成员数）；R53：头像改渲染 group.avatar（无则回落群名首字）
      if (avEl) avEl.innerHTML = imGroupAvatarHtml(S.group.avatar, S.group.name);
      if (nameEl) nameEl.innerHTML = esc(S.group.name) +
        '<span style="font-size:10px;color:#667eea;background:#EEF1FF;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:400">' + esc(String(S.group.memberCount || '')) + '人群</span>';
      // T02 增量：群会话显示「⋯」群设置入口
      var gsBtnG = $id('imGSBtn');
      if (gsBtnG) gsBtnG.style.display = 'block';
      var backBtn = $id('imBack');
      if (backBtn) backBtn.style.display = window.innerWidth <= 760 ? 'block' : 'none';
      imEnsureRemarkBtn(false); // R73 需求18③：群聊不显示备注入口
      return;
    }
    if (avEl) avEl.innerHTML = renderAvatar(S.peer.avatar, imFriendNameOf(S.peer));
    var nameEl = $id('imCName');
    if (nameEl) {
      var aiCfg = getAiConfig();
      // 需求24：私聊是真实好友会话，不再挂「演示模式」误导标签；
      // 仅在已配置 AI 服务商时才显示绿色的「AI在线」，未配置则不显示任何标签。
      var tag = aiCfg && aiCfg.apiKey
        ? '<span style="font-size:10px;color:#4caf50;background:#E8F5E9;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:400">AI在线</span>'
        : '';
      /* 需求D：头部标题按「备注名 > 昵称」渲染（原「备注名（原名）」拼接已废弃），保存备注后即时反映。 */
      var dispName = imFriendNameOf(S.peer, '');
      nameEl.innerHTML = esc(dispName) + tag;
    }
    imEnsureRemarkBtn(!!(S.peer && S.peer.isServer)); // R73 需求18③：服务器好友显示「✎」备注入口
    // T02 增量：私聊会话隐藏「⋯」群设置入口
    var gsBtnP = $id('imGSBtn');
    if (gsBtnP) gsBtnP.style.display = 'none';
    // 手机端显示返回按钮
    var backBtn = $id('imBack');
    if (backBtn) backBtn.style.display = window.innerWidth <= 760 ? 'block' : 'none';
  }

  // 返回会话列表（适配当前 HTML：隐藏 imConv，显示 imEmpty）
  function backToList() {
    document.body.classList.remove('im-mobile');
    S.peer = null;
    S.group = null; // T4 增量：退出群会话状态
    imResetMsgPaging(); // R73 需求19：退出会话一并重置分页 / 签名状态
    xtSetChatUser(null); // R60：离开会话 → 清掉当前会话对象
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
    var title = S.group ? S.group.name : (S.peer ? imFriendNameOf(S.peer, '好友') : '好友');
    if (S.msgs.length === 0) {
      box.innerHTML = '<div class="im-empty2">开始和' + esc(title) + '聊天吧</div>';
      return;
    }
    var isGroup = !!S.group;
    /* 需求D（2026-09-17）：群消息发送者展示名也走「备注名 > 昵称」；
       备注查一次即缓存，避免每条消息重复扫描 S.chats / SERVER_FRIENDS。 */
    var _rmap = {};
    function gRemark(uid) {
      var k = String(uid || 0);
      if (!(k in _rmap)) _rmap[k] = imRemarkOf(uid);
      return _rmap[k];
    }
    var key = imThreadKey();
    /* R73 需求19（2026-09-15）：整表重建前先记录滚动位置，重建后据「贴底与否」决定回滚策略，
       避免 2s 轮询 / 服务端回包每次把用户从历史翻阅处甩回底部。 */
    var prevTop = box.scrollTop;
    var prevH = box.scrollHeight;
    var atBottom = (prevH - prevTop - box.clientHeight) < 24;
    box.innerHTML = S.msgs.map(function (m) {
      var isMe = m.senderId === S.myId;
      var time = new Date(m.time);
      var timeStr = isNaN(time) ? '' : time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');
      // 已读角标（T4 增量）：仅服务器私聊消息展示 ✓已发送 / ✓✓已读
      var readTag = '';
      if (isMe && !isGroup && m.server) {
        readTag = '<div class="im-read' + (m.read ? ' ok' : '') + '">' + (m.read ? '✓✓ 已读' : '✓ 已发送') + '</div>';
      }
      // N9-17：本端删除的消息直接从时间线移除（不占位，区别于撤回的灰色提示）
      if (imIsDeleted(key, m.id)) return '';
      // 撤回：已撤回消息渲染为灰色居中系统提示（保留时间线占位）
      if (imIsRecalled(key, m.id)) {
        var rtip = (m.senderId === S.myId) ? '你撤回了一条消息' : '对方撤回了一条消息';
        return '<div class="im-recall-tip">' + esc(rtip) + '</div>';
      }
      var inner;
      if (m.kind === 'image') {
        var src = /^(https?:|data:)/.test(m.content) ? m.content : apiBase() + m.content;
        /* R51（2026-09-14）：图片气泡 —— 限宽 200px + 圆角，点击全屏预览（imPreviewImage）。
           收到（他人）与发出（自己）走同一分支，服务端消息与离线 dataURL 都能渲染。 */
        inner = '<img class="im-img" src="' + esc(src) + '" alt="[图片]" onclick="imPreviewImage(this.getAttribute(\'src\'))">' +
          '<div class="im-mt">' + timeStr + '</div>' + readTag;
      } else if (m.kind === 'voice') {
        // A7：语音条（点击播放/暂停/续播；进度条随时间更新；显示时长）
        var vsrc = /^(https?:|data:)/.test(m.content) ? m.content : apiBase() + m.content;
        inner = '<div class="im-voice" onclick="imTogglePlayVoice(this,this.dataset.src)" data-src="' + esc(vsrc) + '">' +
          '<span class="im-voice-ic">▶</span><span class="im-voice-bar"><i></i></span>' +
          '<span class="im-voice-dur">' + (m.duration ? m.duration + '″' : '语音') + '</span></div>' +
          '<div class="im-mt">' + timeStr + '</div>' + readTag;
      } else if (m.kind === 'location') {
        /* R104 项3（2026-09-19，用户拍板解除 R88-I §7-7 红线）：位置消息 —— 有坐标渲染微信式地图卡，
           无坐标（旧消息）回退纯文字卡（向后兼容）。地图图片统一走后端 /api/geo/staticmap 代理，
           前端绝不经 apis.map.qq.com（Key 不落前端）；onerror 隐藏图片、文字仍在、不破版。 */
        var hasGeo = (typeof m.lat === 'number' && typeof m.lng === 'number' && isFinite(m.lat) && isFinite(m.lng));
        if (hasGeo) {
          var mapSrc = apiBase() + '/api/geo/staticmap?lat=' + encodeURIComponent(m.lat) +
                       '&lng=' + encodeURIComponent(m.lng) + '&zoom=16';
          var locSubHtml = m.sub ? '<div class="im-loc-sub">' + esc(m.sub) + '</div>' : '';
          inner = '<div class="im-loc-card">' +
              '<div class="im-loc-addr">' +
                '<div class="im-loc-title">' + esc(m.content || '位置') + '</div>' +
                locSubHtml +
              '</div>' +
              '<img class="im-loc-map" src="' + esc(mapSrc) + '" alt="地图" loading="lazy"' +
                ' onerror="this.style.display=\'none\'">' +
            '</div>' +
            '<div class="im-mt">' + timeStr + '</div>' + readTag;
        } else {
          /* 旧消息（无坐标）兼容：沿用纯文字卡（map-pin 图标，零 emoji），content 仅存文字地址。 */
          var locIcon = (typeof window.lucideIcon === 'function') ? window.lucideIcon('map-pin', 18) : '';
          inner = '<div class="im-loc-card im-loc-plain">' +
            '<span class="im-loc-ic">' + locIcon + '</span>' +
            '<span class="im-loc-text">' + esc(m.content || '') + '</span>' +
          '</div>' +
            '<div class="im-mt">' + timeStr + '</div>' + readTag;
        }
      } else if (m.kind === 'file') {
        /* R88-I 增量（2026-09-18）：文件消息 —— 本地元数据卡片（文件名 + 大小），无 emoji、不可跳转。
           ❗不读文件内容（不落 base64），仅存 name/size/type 元数据，避免撑爆 localStorage。 */
        var fileIcon = (typeof window.lucideIcon === 'function') ? window.lucideIcon('file', 20) : '';
        var fname = m.name || m.content || '文件';
        var fsize = (typeof m.size === 'number' && m.size >= 0) ? imFormatFileSize(m.size) : '';
        inner = '<div class="im-file-card">' +
          '<span class="im-file-ic">' + fileIcon + '</span>' +
          '<span class="im-file-meta">' +
            '<span class="im-file-name">' + esc(fname) + '</span>' +
            (fsize ? '<span class="im-file-size">' + esc(fsize) + '</span>' : '') +
          '</span>' +
        '</div>' +
          '<div class="im-mt">' + timeStr + '</div>' + readTag;
      } else {
        inner = renderContent(m.content) + '<div class="im-mt">' + timeStr + '</div>' + readTag;
      }
      /* N9-17：桌面 hover 的 .im-recall-btn 入口已删除（生成函数 imRecallEntryHtml 一并移除），
         撤回统一走长按 / 右键唤起的 imShowMsgMenu 菜单。 */
      var body = '<div class="im-m ' + (isMe ? 'me' : 'ot') + '"' + imMsgAttrs(m, isMe) + ' data-mid="' + esc(m.id || '') + '">' + inner + '</div>';
      // 群聊：他人消息左侧加发送者小头像 + 昵称（自己的消息保持右侧绿底）
      // 批次二 需求9（2026-09-11h）：头像/昵称点击 → 打开该用户公开主页（复用 api.js openUserHome，
      // 与私聊好友列表点头像行为一致；非好友主页只有「加为好友」，好友主页有「发消息」；
      // 自己的消息本就不渲染头像/昵称，点击自己头像的场景不存在，无异常路径）。
      // stopPropagation 防止冒泡触发消息区其他行为。
      if (isGroup && !isMe) {
        var uhClick = 'event.stopPropagation();openUserHome(' + Number(m.senderId || 0) + ')';
        var sndName = imFriendName({ peerRemark: gRemark(Number(m.senderId || 0)), nickname: m.senderNickname }, '');
        var av = '<div class="im-gav" style="cursor:pointer" onclick="' + uhClick + '">' + renderAvatar(m.senderAvatar, sndName) + '</div>';
        var name = '<div class="im-gsender" style="cursor:pointer" onclick="' + uhClick + '">' + esc(sndName) + '</div>';
        return '<div class="im-grow">' + av + '<div class="im-gcol">' + name + body + '</div></div>';
      }
      return body;
    }).join('');
    /* R73 需求19：贴底时保持贴底（原行为不变）；否则按重建前后的高度差平移 scrollTop，保住可视位置。
       「向上加载更多」prepend 更早历史后，prevTop 较小 → atBottom=false → scrollTop 自动加上新增长度，视口不跳动。 */
    if (atBottom) {
      box.scrollTop = box.scrollHeight;
    } else {
      box.scrollTop = prevTop + (box.scrollHeight - prevH);
    }
  }

  /* 【后续扩展点：群消息逐人已读回执】群内只保证自己未读数准确（last_read_msg_id 游标），不渲染逐条已读。 */
  function groupReadReceipt() { /* 空实现：预留群已读回执扩展 */ }

  /* ==================== R51（2026-09-14）：图片消息（上传 / 发送 / 预览） ====================
     在线：POST /api/uploads/image（FormData + Bearer，≤5MB，魔数白名单，返回 {url}）
           → 私聊 POST /api/chat/{serverId}/messages {content:url, kind:'image'}
           → 群聊 POST /api/groups/{gid}/messages      {content:url, kind:'image'}
           与语音（kind='voice'）完全同一模型：content 只存 URL，不存 base64。
     离线：本地 / AI 好友会话 → 沿用原 localStorage dataURL 路径（不连服务器，容量受限时静默失败）。 */
  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  function imUploadImage(file, cb) {
    var fd = new FormData();
    fd.append('file', file, file.name || 'image.png');
    fetch(apiBase() + '/api/uploads/image', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.url) {
          toast((res.d && res.d.detail) || '图片上传失败');
          if (cb) cb(null);
          return;
        }
        if (cb) cb(res.d.url);
      })
      .catch(function (e) { toast('图片上传失败：' + (e.message || '网络错误')); if (cb) cb(null); });
  }

  /* 上传成功后把 url 作为一条 kind='image' 消息发出去（群聊 / 私聊各一条分支）。
     发送成功后立刻重拉一次，服务端消息会覆盖掉先前的乐观气泡（与 postVoiceMsg 同节奏）。 */
  function imPostImageMsg(url) {
    if (S.group) {
      fetch(apiBase() + '/api/groups/' + S.group.id + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ content: url, kind: 'image' })
      })
        .then(function (r) { return r.json(); })
        .then(function (m) {
          if (m && m.id) {
            S.msgs.push({ id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true });
            renderMsgs();
          }
          fetchGroupMsgs(true);
        })
        .catch(function () { toast('图片发送失败，请重试'); });
      return;
    }
    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ content: url, kind: 'image' })
    })
      .then(function (r) { return r.json(); })
      .then(function (m) {
        if (m && m.id) {
          S.msgs.push({ id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read });
          renderMsgs();
        }
        fetchPeerMsgs(true);
      })
      .catch(function () { toast('图片发送失败，请重试'); });
  }

  /* 离线 / 本地 AI 好友：dataURL 存 localStorage（原 T03 之前的行为，完整保留） */
  function imSendImageLocal(file) {
    if (!S.peer) { toast('群聊图片需要联网'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      var now = Date.now();
      var uid = genMsgId();
      S.msgs.push({ id: uid, senderId: S.myId, content: dataUrl, kind: 'image', time: now });
      var data = loadData();
      if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
      data.messages[S.peer.id].push({ id: uid, senderId: S.myId, content: dataUrl, kind: 'image', time: now });
      if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};
      data.chats[S.peer.id].last = '[图片]';
      data.chats[S.peer.id].time = now;
      saveData(data);
      renderMsgs();
      loadChats();
      // 图片也触发 AI 回复
      triggerAiReply('发了一张图片');
    };
    reader.readAsDataURL(file);
  }

  /* 统一入口：图片按钮 / 粘贴板 / 其它调用方都走这里 */
  function imSendImageFile(file) {
    if (!file) return;
    if (!S.group && !S.peer) { toast('请先选择一个会话再发送图片'); return; }
    if (file.size && file.size > MAX_IMAGE_BYTES) { toast('图片超过 5MB，请压缩后再发'); return; }
    var online = !!getToken() && (!!S.group || !!(S.peer && S.peer.isServer));
    if (!online) { imSendImageLocal(file); return; }
    // 乐观渲染：先用本地 dataURL 顶上（上传有网络延迟），服务端消息回来后覆盖
    var rd = new FileReader();
    rd.onload = function (e) {
      S.msgs.push({ id: 'tmp' + Date.now(), senderId: S.myId, content: e.target.result, kind: 'image', time: Date.now() });
      renderMsgs();
    };
    rd.readAsDataURL(file);
    imUploadImage(file, function (url) { if (url) imPostImageMsg(url); });
  }
  window.imSendImageFile = imSendImageFile;

  // 发送图片（适配 HTML 里的 imSendImage(this)；file input 的 change 事件）
  window.imSendImage = function (input) {
    if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];
    try { input.value = ''; } catch (e) { /* 老 WebView 重置失败不影响发送 */ }
    imSendImageFile(file);
  };

  // 点击输入栏图片按钮 → 触发隐藏 file input（HTML 里 #imImgInput）
  window.imPickImage = function () {
    var inp = $id('imImgInput');
    if (!inp) { toast('当前页面不支持发送图片'); return; }
    try { inp.value = ''; } catch (e) { /* 同上 */ }
    inp.click();
  };

  /* R73 需求3（2026-09-15）：图片全屏预览 —— 单例查看器（重写）。
     旧实现每次点击都新建浮层 + 「点任意处关闭」，且没有放大/缩小/✕/Esc（用户诉求「无法放大查看」）。
     现改为：只创建一次浮层节点并复用；✕ 按钮 / Esc 键 / 点击背景三种方式关闭；
     点击图片本体不关闭（避免与拖动平移冲突）；＋/－ 按钮 + 滚轮 + 双击缩放（0.5×–4×）；
     放大后可鼠标/触摸拖动平移。全部 ES2017 祖先语法（var/function），样式随脚本在 boot() 注入。 */
  var _IV = null; // 单例查看器状态：{ ov, img, scale, tx, ty, dragging }
  function imClosePreview() {
    if (_IV && _IV.ov && _IV.ov.parentNode) _IV.ov.parentNode.removeChild(_IV.ov);
  }
  window.imClosePreview = imClosePreview;

  function imPreviewImage(src) {
    if (!src) return;
    if (!_IV) imIvBuild();
    _IV.img.setAttribute('src', src);
    _IV.scale = 1; _IV.tx = 0; _IV.ty = 0; _IV.applyT();
    if (!_IV.ov.parentNode) document.body.appendChild(_IV.ov);
  }
  window.imPreviewImage = imPreviewImage;

  function imIvBuild() {
    var ov = document.createElement('div');
    ov.className = 'im-img-preview im-iv';
    ov.innerHTML = '<div class="im-iv-tools">' +
      '<span class="im-iv-btn" data-act="out">－</span>' +
      '<span class="im-iv-btn" data-act="in">＋</span>' +
      '<span class="im-iv-btn" data-act="close">✕</span>' +
      '</div>' +
      '<img class="im-iv-img" alt="图片预览">';
    var img = ov.querySelector('.im-iv-img');
    var st = { ov: ov, img: img, scale: 1, tx: 0, ty: 0, dragging: false, sx: 0, sy: 0 };
    st.applyT = function () {
      img.style.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.scale + ')';
      if (st.scale > 1.001) ov.classList.add('im-iv-zoomed');
      else ov.classList.remove('im-iv-zoomed');
    };
    st.setScale = function (next) {
      var s = Math.max(0.5, Math.min(4, next));
      if (s === st.scale) return;
      st.scale = s;
      if (s <= 1.001) { st.tx = 0; st.ty = 0; }
      st.applyT();
    };
    // ＋ / － / ✕ 工具条
    ov.querySelector('.im-iv-tools').addEventListener('click', function (e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      var t = e && e.target;
      var act = (t && t.getAttribute) ? t.getAttribute('data-act') : '';
      if (act === 'in') st.setScale(st.scale * 1.25);
      else if (act === 'out') st.setScale(st.scale / 1.25);
      else if (act === 'close') imClosePreview();
    });
    // 点击背景关闭；点图片本体不关闭
    ov.addEventListener('click', function (e) { if (e.target === ov) imClosePreview(); });
    // 滚轮缩放
    ov.addEventListener('wheel', function (e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      st.setScale((e && e.deltaY > 0) ? st.scale / 1.15 : st.scale * 1.15);
    }, { passive: false });
    // 双击在 1× / 2× 间切换
    img.addEventListener('dblclick', function (e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      st.setScale(st.scale > 1.001 ? 1 : 2);
    });
    // 鼠标拖动平移（仅放大后）
    img.addEventListener('mousedown', function (e) {
      if (st.scale <= 1.001) return;
      st.dragging = true; st.sx = e.clientX - st.tx; st.sy = e.clientY - st.ty;
      if (typeof e.preventDefault === 'function') e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!st.dragging) return;
      st.tx = e.clientX - st.sx; st.ty = e.clientY - st.sy; st.applyT();
    });
    document.addEventListener('mouseup', function () { st.dragging = false; });
    // 触摸拖动平移
    img.addEventListener('touchstart', function (e) {
      if (st.scale <= 1.001 || !e.touches || !e.touches.length) return;
      st.dragging = true; st.sx = e.touches[0].clientX - st.tx; st.sy = e.touches[0].clientY - st.ty;
    }, { passive: true });
    img.addEventListener('touchmove', function (e) {
      if (!st.dragging || !e.touches || !e.touches.length) return;
      st.tx = e.touches[0].clientX - st.sx; st.ty = e.touches[0].clientY - st.sy; st.applyT();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }, { passive: false });
    img.addEventListener('touchend', function () { st.dragging = false; });
    // 键盘：Esc 关闭，＋/－ 缩放
    document.addEventListener('keydown', function (e) {
      if (!_IV || !_IV.ov || !_IV.ov.parentNode) return;
      var k = e && e.key;
      if (k === 'Escape' || k === 'Esc') imClosePreview();
      else if (k === '+' || k === '=') st.setScale(st.scale * 1.25);
      else if (k === '-') st.setScale(st.scale / 1.25);
    });
    _IV = st;
  }

  /* T03 增量（2026-09-12）+ R51（2026-09-14）：粘贴板图片
     - 旧行为：拦截 + toast「暂不支持图片消息」
     - 新行为：拦截后直接走上传发送流程（与图片按钮同一条 imSendImageFile 路径）
     - 只处理 type 以 'image' 开头的项；HTML/纯文本/表情 [emoji:xx] 一律放行
     - clipboardData 缺失、items 为空、取不到 File 都安全 no-op / toast，不抛错 */
  window.imOnPaste = function (e) {
    if (!e || !e.clipboardData || !e.clipboardData.items) return;
    var items = e.clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      var t = (items[i] && items[i].type) || '';
      if (t.indexOf('image') === 0) {
        try { e.preventDefault(); } catch (_e) { /* 老 WebView 无 preventDefault 也不致命 */ }
        var f = (items[i].getAsFile ? items[i].getAsFile() : null);
        if (!f) { toast('⚠️ 读取剪贴板图片失败，请改用图片按钮上传'); return; }
        imSendImageFile(f);
        return;
      }
    }
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

  // 取最近一条用户文本（AI 兜底回复 / 兜底文案标注共用）
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
    var aiCfg = getAiConfig();
    if (!aiCfg || !aiCfg.apiKey || !aiCfg.baseUrl) {
      var lastUserText = '';
      for (var i = historyMsgs.length - 1; i >= 0; i--) {
        if (historyMsgs[i].role === 'user') { lastUserText = historyMsgs[i].content; break; }
      }
      setTimeout(function () { callback(imOfflineFallback(friend, historyMsgs)); }, 800 + Math.random() * 1200);
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
      console.warn('[chat-local] 直连 AI 服务商失败，回落本地兜底：', err && (err.message || err));
      callback(generateDemoReply(imLastUserText(historyMsgs), friend.personality) +
        '\n\n（离线兜底回复：AI 连接失败，已切换为本地演示内容。请到「设置 → AI 服务商配置」检查密钥/地址。）');
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
      return { role: m.senderId === S.myId ? 'user' : 'assistant', content: m.kind === 'image' ? '[图片]' : (m.kind === 'location' ? '[位置] ' + (m.content || '') : (m.kind === 'file' ? '[文件] ' + (m.name || m.content || '') : m.content)) };
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
    // R55（2026-09-14）：帖子分享接收侧 —— 若带转发意图（来自帖子分享卡片），
    // 取 #note=ID 深链拼到正文并消费掉（私聊/群聊都走这里）；无转发时 __imConsumeForward 返回 ''。
    var _fwd = (typeof window.__imConsumeForward === 'function') ? window.__imConsumeForward() : '';
    if (_fwd) text = (text + ' ' + _fwd).trim();
    // T4 增量：群会话发送分支
    if (S.group) { imSendGroupText(text); return; }
    if (!S.peer) return;
    inp.value = '';

    var now = Date.now();
    var uid = genMsgId();
    var msg = { id: uid, senderId: S.myId, content: text, kind: 'text', time: now };
    S.msgs.push(msg);

    var data = loadData();
    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
    data.messages[S.peer.id].push({ id: uid, senderId: S.myId, content: text, kind: 'text', time: now });
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

  /* R104 项3（2026-09-19，经用户拍板解除 R88-I §7-7 红线）：发送位置消息（支持坐标）。
     入参兼容：loc 可为 String（旧调用 → 纯文字位置）或 Object { text, sub, lat, lng }。
     消息体 { id, senderId, kind:'location', content:text, sub, lat, lng, time }；坐标仅用于
     接收端地图缩略图（统一经后端 /api/geo/staticmap 代理，前端绝不直连地图服务商）。
     未选会话时沿用既有守卫 toast 并 return。 */
  window.imSendLocation = function (loc) {
    var o = (loc && typeof loc === 'object') ? loc : { text: loc };
    var t = (o.text == null) ? '' : String(o.text);
    t = t.replace(/^\s+|\s+$/g, '');
    if (!t) return;
    if (!S.group && !S.peer) { toast('请先选择一个会话再发送位置'); return; }
    // 群聊：与文字消息同走群发送分支（kind 由 imSendGroupText 内部决定，此处仅保证入口不炸）
    if (S.group) { toast('群聊暂不支持发送位置'); return; }
    if (!S.peer) return;

    // 坐标仅在经纬度均为有限数时携带；副地址仅在非空时携带（避免脏值进消息体）。
    var hasGeo = (typeof o.lat === 'number' && typeof o.lng === 'number' && isFinite(o.lat) && isFinite(o.lng));
    var sub = (o.sub == null) ? '' : String(o.sub);

    var now = Date.now();
    var uid = genMsgId();
    var msg = { id: uid, senderId: S.myId, content: t, kind: 'location', time: now };
    if (sub) msg.sub = sub;
    if (hasGeo) { msg.lat = o.lat; msg.lng = o.lng; }
    S.msgs.push(msg);

    var data = loadData();
    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
    var stored = { id: uid, senderId: S.myId, content: t, kind: 'location', time: now };
    if (sub) stored.sub = sub;
    if (hasGeo) { stored.lat = o.lat; stored.lng = o.lng; }
    data.messages[S.peer.id].push(stored);
    if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};
    data.chats[S.peer.id].last = '[位置] ' + t;
    data.chats[S.peer.id].time = now;
    data.chats[S.peer.id].nickname = S.peer.nickname;
    data.chats[S.peer.id].avatar = S.peer.avatar;
    saveData(data);

    renderMsgs();
    loadChats();

    // 服务器好友：同步到服务端（body 带 sub/lat/lng，服务端加列后跨端可显示地图卡）
    if (S.peer.isServer) {
      var token = getToken();
      if (token) {
        var payload = { content: t, kind: 'location' };
        if (sub) payload.sub = sub;
        if (hasGeo) { payload.lat = o.lat; payload.lng = o.lng; }
        fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(payload)
        })
        .then(function (r) { return r.json(); })
        .then(function (m) {
          if (m && m.id) {
            // 回包映射：优先用服务端回传坐标；老服务端未回传时回退本地值（保证卡片不丢坐标）
            var rsub = (m.sub != null) ? String(m.sub) : sub;
            var rlat = (typeof m.lat === 'number') ? m.lat : (hasGeo ? o.lat : null);
            var rlng = (typeof m.lng === 'number') ? m.lng : (hasGeo ? o.lng : null);
            var rec = { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };
            if (rsub) rec.sub = rsub;
            if (typeof rlat === 'number' && typeof rlng === 'number') { rec.lat = rlat; rec.lng = rlng; }
            S.msgs.push(rec);
            renderMsgs();
          }
          fetchPeerMsgs(true);
          if (typeof window.loadChatUnread === 'function') window.loadChatUnread();
        })
        .catch(function () {});
      }
      return;
    }
    triggerAiReply('发送了位置：' + t);
  };

  /* R88-I 增量（2026-09-18）：文件大小人性化（B/KB/MB）。 */
  function imFormatFileSize(n) {
    var s = Number(n) || 0;
    if (s < 1024) return s + ' B';
    if (s < 1024 * 1024) return (s / 1024).toFixed(1) + ' KB';
    return (s / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* R88-I 增量：发送文件消息（本地元数据卡片，kind:'file'）。
     ❗设计取舍：本批不动服务端，无通用文件上传接口（仅有 /api/uploads/image|voice），
        故文件消息【只发元数据 name/size/type】，不读文件内容、不落 base64、不写 localStorage 正文，
        避免大文件撑爆 localStorage（任务书硬约束）。接收侧展示为「文件名 + 大小」卡片，不含可下载正文。
     与 imSendImage 的适配点一致：输入为 file input 元素。 */
  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  window.imSendFile = function (input) {
    if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];
    try { input.value = ''; } catch (e) { /* 老 WebView 重置失败不影响发送 */ }
    imSendFileMeta(file);
  };

  function imSendFileMeta(file) {
    if (!file) return;
    if (!S.group && !S.peer) { toast('请先选择一个会话再发送文件'); return; }
    if (file.size && file.size > MAX_FILE_BYTES) { toast('文件超过 20MB，暂不支持发送'); return; }
    if (S.group) { toast('群聊暂不支持发送文件'); return; }
    if (!S.peer) return;
    var name = String(file.name || '文件');
    var size = (typeof file.size === 'number') ? file.size : 0;
    var ftype = String(file.type || '');
    var now = Date.now();
    var uid = genMsgId();
    var rec = { id: uid, senderId: S.myId, content: name, kind: 'file', name: name, size: size, type: ftype, time: now };
    S.msgs.push(rec);

    var data = loadData();
    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];
    data.messages[S.peer.id].push({ id: uid, senderId: S.myId, content: name, kind: 'file', name: name, size: size, type: ftype, time: now });
    if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};
    data.chats[S.peer.id].last = '[文件] ' + name;
    data.chats[S.peer.id].time = now;
    data.chats[S.peer.id].nickname = S.peer.nickname;
    data.chats[S.peer.id].avatar = S.peer.avatar;
    saveData(data);

    renderMsgs();
    loadChats();

    // 服务器好友：仅同步元数据文本（无二进制），失败静默（本地卡片仍在）
    if (S.peer.isServer) {
      var token = getToken();
      if (token) {
        fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ content: '[文件] ' + name, kind: 'text' })
        })
        .then(function (r) { return r.json(); })
        .then(function () { fetchPeerMsgs(true); })
        .catch(function () {});
      }
      return;
    }
    triggerAiReply('发送了文件：' + name);
  }

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
          '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(f)) + '</div><div class="im-sub">' + esc(f.motto) + '</div></div>' +
          '</div>';
      }).join('');
      return;
    }

    // 已登录，先显示预设好友，再异步加载服务器搜索结果
    var html = presetResults.map(function (f) {
      return '<div class="im-sess" onclick="imOpenChat(' + f.id + ')">' +
        '<div class="im-av">' + f.avatar + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(f)) + '</div><div class="im-sub">' + esc(f.motto) + '</div></div>' +
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
      box.innerHTML = (presetResults.length ? '<div style="font-size:11px;color:#999;padding:8px 0 4px;display:flex;align-items:center;gap:4px"><span data-icon="bot" data-icon-size="12"></span>AI好友</div>' + html : '') +
        (serverUsers.length ? '<div style="font-size:11px;color:#999;padding:8px 0 4px">👥 注册用户</div>' + serverHtml : '');
      if (window.lucideAutoRender) window.lucideAutoRender();
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
        : esc(imFriendNameOf(u, '友').slice(0, 1));
      var act;
      if (u.isFriend) {
        act = '<button class="im-af-btn" onclick="window.imAfOpenChat(' + u.id + ')">💬 发消息</button>';
      } else if (u.requested) {
        act = '<button class="im-af-btn gray" disabled>已发送</button>';
      } else if (u.blockedMe) {
        act = '<button class="im-af-btn gray" disabled>不可添加</button>';
      } else {
        act = '<button class="im-af-btn" onclick="window.imAfSendRequest(' + u.id + ',this)">➕ 添加好友</button>';
      }
      return '<div class="im-sess">' +
        '<div class="im-av">' + av + '</div>' +
        '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(u, '用户')) + ' <span style="font-size:11px;color:#999">@' + esc(u.username || '') + '</span></div>' +
        '<div class="im-sub">' + esc(u.motto || '') + '</div></div>' + act + '</div>';
    }).join('');
  }
  window.imRenderFriendRows = imRenderFriendRows;

  // 打开「添加好友」模态（与群聊弹层同源；离线置灰）
  window.imOpenAddFriendModal = function () {
    if (!getToken()) { toast('添加好友需要联网，请先登录'); return; }
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
    if (!token) { toast('添加好友需要联网，请先登录'); return; }
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
        if (btn) { btn.disabled = false; btn.textContent = '➕ 添加好友'; }
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

  /* R73 需求19（2026-09-15）：消息列表快照签名 —— id 序列 + 条数 + 发送者 + kind + 已读 + content 首尾。
     轮询结果与上次渲染完全一致时早退，消掉「每 2s 无条件整表重建」
     （既是需求19 滚动被回滚的帮凶，也是需求3 图片气泡被反复 detach 的竞态主因）。 */
  function imMsgsSig(list) {
    var arr = list || [];
    var out = 'n' + arr.length;
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i] || {};
      var c = String(m.content == null ? '' : m.content);
      out += '#' + m.id + ':' + m.senderId + ':' + m.kind + ':' + (m.read ? 1 : 0) + ':' + c.length + ':' + c.slice(0, 16) + ':' + c.slice(-16);
    }
    return out;
  }

  /* R73 需求19：服务端只返回最新 50 条 —— 把本地已 prepend 的更早历史（id 更小）保留下来，
     否则「向上加载更多」拉回的旧消息会被下一轮轮询抹掉。id 游标天然有序，无重叠。 */
  function imMergeOlderMsgs(cur, fresh) {
    fresh = fresh || [];
    var oldest = fresh.length ? Number(fresh[0].id) : 0;
    if (!oldest) return fresh;
    var older = [];
    for (var i = 0; i < (cur || []).length; i++) {
      var m = cur[i];
      var mid = Number(m && m.id);
      if (mid && mid < oldest) older.push(m);
    }
    return older.length ? older.concat(fresh) : fresh;
  }

  var lastMsgsSig = '';        // 当前会话消息列表快照签名（无变化 → 不整表重建）
  var imHasMore = false;       // 当前会话是否还有更早历史（服务端 hasMore）
  var imLoadingMore = false;   // 「向上加载更多」在途标志（同一时刻只允许一个请求）

  /* 切换会话时重置分页 / 签名状态（避免上一会话残留影响新会话） */
  function imResetMsgPaging() { lastMsgsSig = ''; imHasMore = false; imLoadingMore = false; }

  /* 加载更多（需求19 最后一公里）：滚动到顶且 hasMore 为真时，用 id 游标向前翻页。
     ⚠️ 必须显式 mark_read=0：chat.py 的 mark_read 默认为 1（拉取即已读），
     向上翻历史页若按默认会把「更早的一页」当成最新页推进已读水位线，造成未读丢失。 */
  function imLoadMoreMsgs() {
    if (imLoadingMore || !imHasMore) return;
    if (!S.msgs || !S.msgs.length) return;
    if (!getToken()) return;
    var firstId = Number(S.msgs[0].id);
    if (!firstId) return;
    var url, mapper;
    if (S.group) {
      url = apiBase() + '/api/groups/' + S.group.id + '/messages?before_id=' + firstId + '&limit=30&mark_read=0';
      mapper = function (m) { return { id: m.id, senderId: m.senderId, senderNickname: m.senderNickname, senderAvatar: m.senderAvatar, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true }; };
    } else if (S.peer && S.peer.isServer) {
      url = apiBase() + '/api/chat/' + S.peer.serverId + '/messages?before_id=' + firstId + '&limit=30&mark_read=0';
      mapper = function (m) { return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, sub: m.sub, lat: m.lat, lng: m.lng, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read }; };
    } else {
      return;
    }
    imLoadingMore = true;
    fetch(url, { headers: { 'Authorization': 'Bearer ' + getToken() } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var items = (d && d.items) || [];
      var known = {};
      for (var i = 0; i < S.msgs.length; i++) known[String(S.msgs[i].id)] = true;
      var older = items.map(mapper).filter(function (m) { return !known[String(m.id)]; });
      imHasMore = !!(d && d.hasMore);
      if (older.length) {
        S.msgs = older.concat(S.msgs); // prepend 更早历史
        renderMsgs();                  // renderMsgs 内按高度差补偿 scrollTop → 视口不跳动
        lastMsgsSig = (S.group ? 'g' + S.group.id : 'p' + (S.peer ? S.peer.serverId : 0)) + '|' + imMsgsSig(S.msgs);
      }
      imLoadingMore = false;
    })
    .catch(function () { imLoadingMore = false; /* 失败静默：下次滚动到顶再试 */ });
  }

  // —— 会话消息拉取（轮询主干；拉取即已读，后端 mark_read 默认开启） ——
  function fetchPeerMsgs(silent) {
    if (!S.peer || !S.peer.isServer || !getToken()) return;
    var want = S.peer.serverId; // R73 需求19孪生：记录本次请求的目标会话（防快速切换串会话）
    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50&markRead=1', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      /* R73（2026-09-15）：快速连点两个好友时，先发起的响应可能后到；
         若此时已切走会话，直接丢弃，避免「头部显示 B、消息列表却是 A」。 */
      if (!S.peer || S.peer.serverId !== want) return;
      var items = d.items || [];
      if (!items.length && silent) return;
      var list = items.map(function (m) {
        return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, sub: m.sub, lat: m.lat, lng: m.lng, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };
      });
      // 保留已 prepend 的更早历史，避免被「最新 50 条」覆盖
      var merged = imMergeOlderMsgs(S.msgs, list);
      imHasMore = !!d.hasMore;
      var hadTyping = !!document.getElementById('typingIndicator');
      if (hadTyping) { S.msgs = merged; return; } // AI 正在输入时不整表重绘
      var sig = 'p' + S.peer.serverId + '|' + imMsgsSig(merged);
      if (sig === lastMsgsSig) return;            // 无变化：不重建 → 保住 scrollTop（需求19）
      lastMsgsSig = sig;
      S.msgs = merged;
      renderMsgs();
      if (!silent) renderList();
    })
    .catch(function () { /* 离线静默：保留本地消息 */ });
  }

  function fetchGroupMsgs(silent) {
    if (!S.group || !getToken()) return;
    var want = S.group.id; // R73 需求19孪生：记录目标群（防快速切换串会话）
    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages?limit=50&markRead=1', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!S.group || S.group.id !== want) return; // R73：切走后丢弃迟到响应
      var list = (d.items || []).map(function (m) {
        return { id: m.id, senderId: m.senderId, senderNickname: m.senderNickname, senderAvatar: m.senderAvatar, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true };
      });
      var merged = imMergeOlderMsgs(S.msgs, list);
      imHasMore = !!d.hasMore;
      var sig = 'g' + S.group.id + '|' + imMsgsSig(merged);
      if (sig === lastMsgsSig) return; // 无变化：不重建
      lastMsgsSig = sig;
      S.msgs = merged;
      S.group.memberCount = S.group.memberCount || 0;
      renderMsgs();
      if (!silent) renderList();
    })
    .catch(function () { /* 离线静默 */ });
  }

  // —— 群列表（会话 tab 置顶展示，含未读角标） ——
  function loadGroups() {
    var token = getToken();
    if (!token) { S.groups = []; S.groupsLoadFailed = false; return; }
    fetch(apiBase() + '/api/groups', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      S.groups = d.items || [];
      S.groupsLoadFailed = false;          // T03：成功时清失败标志
      var list = $id('imList');
      if (!list) return;
      // T03：好友 tab 也要看到群行（与原 renderChats 同源重渲染）
      /* R46（2026-09-14e）：群列表路径同样走快照比对，消掉「每 30s 无条件 renderChats()」的残余整表重建。
         语义与 5s 未读轮询完全一致：先消费签名（lastChatsSig = gSig）再渲染，
         否则非会话 tab 下签名永不更新、每次都会被判成「有变化」。
         imChatsSig() 已纳入群行的 unreadCount / lastMessage.id / memberCount / muted，
         群数据真的变了照旧重建 —— 这里只拦「没变还重建」。 */
      if (S.tab === 'chats') {
        var gSig = imChatsSig();
        if (gSig === lastChatsSig) return;
        lastChatsSig = gSig;
        renderChats(list);
      }
      else if (S.tab === 'groups') {
        /* R56（2026-09-14）：群聊 tab 同样走快照比对（imGroupsSig 只取群行相关字段）。
           注意与好友 tab 的差别：这里直接 return 不会漏刷新 —— 群数据就来自本次 loadGroups()。 */
        var gsSig = imGroupsSig();
        if (gsSig === lastGroupsSig) return;
        renderGroupsTab(list);   // 内部会刷新 lastGroupsSig
      }
      else if (S.tab === 'friends') {
        /* R46（2026-09-14e）：好友 tab 同样走快照比对（先消费签名再渲染）。
           与会话 tab 的差别：好友数据要等 loadServerFriends() 回来才可知，若判定「无变化」就直接 return，
           新好友 / 上下线 / 改名都会漏掉（好友 tab 没有别的轮询源）。所以这里无变化时仍拉一次好友，
           只有拉取结果真的改变了签名才渲染 —— 既不闪，也不丢刷新。 */
        var fSig = imFriendsSig();
        if (fSig === lastFriendsSig) {
          loadServerFriends(function () {
            var sig2 = imFriendsSig();
            if (sig2 !== lastFriendsSig) { lastFriendsSig = sig2; renderFriends(list); }
          });
          return;
        }
        lastFriendsSig = fSig;
        renderFriends(list);
      }
    })
    .catch(function () {
      S.groupsLoadFailed = true;           // T03：失败时让 renderFriends 显示「加载失败，点此重试」
      S.groups = S.groups || [];
      var list = $id('imList');
      if (list && S.tab === 'friends') renderFriends(list);
      // R56：群聊 tab 同样需要把失败态渲染出来（「加载失败，点此重试」）
      if (list && S.tab === 'groups') { lastGroupsSig = ''; renderGroupsTab(list); }
    });
  }

  // 打开群会话
  window.imOpenGroup = function (gid) {
    if (!getToken()) { toast('群聊需要联网'); return; }
    var g = (S.groups || []).find(function (x) { return x.id === gid; });
    S.peer = null;
    // R53：群头像随会话状态一起带出来，renderChatHeader() 直接渲染
    S.group = g
      ? { id: g.id, name: g.name, memberCount: g.memberCount, avatar: g.avatar || '' }
      : { id: gid, name: '群聊', memberCount: 0, avatar: '' };
    // R60：群聊不是单人会话，清掉「当前会话对象」
    xtSetChatUser(null);
    var empty = $id('imEmpty');
    if (empty) empty.style.display = 'none';
    var conv = $id('imConv');
    if (conv) conv.style.display = 'flex';
    document.body.classList.add('im-mobile');
    renderChatHeader();
    imResetMsgPaging(); // R73 需求19：切换会话重置分页 / 签名状态
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
    var gsm = $id('imGroupSettingsModal');
    if (gsm && gsm.style.display !== 'none') { window.imCloseGroupSettings(); return; }
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
    var gm = $id('imGroupModal'), am = $id('imAddFriendModal'), gsm = $id('imGroupSettingsModal');
    var anyOpen = (gm && gm.style.display !== 'none') || (am && am.style.display !== 'none') ||
      (gsm && gsm.style.display !== 'none') ||
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
            '<div class="im-av" onclick="event.stopPropagation();window.imToggleGroupMember(' + f.serverId + ')">' + renderAvatar(f.avatarUrl || f.avatar, imFriendNameOf(f, '')) + '</div>' +
            '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(f, '')) + ' <span style="font-size:11px;color:#999">@' + esc(f.username || '') + '</span></div></div>' +
            '<div class="im-gcheck' + (idx >= 0 ? ' on' : '') + '">' + (idx >= 0 ? '✓' : '') + '</div></div>';
        }).join('');
    var selHtml = GC.selected.length === 0
      ? '<div style="font-size:12px;color:#999;padding:4px 0">至少选择 2 位好友</div>'
      : GC.selected.map(function (uid) {
          var f = (GC.friends || []).find(function (x) { return x.serverId === uid; }) || {};
          return '<div class="im-gsel">' + renderAvatar(f.avatarUrl || f.avatar, imFriendNameOf(f, '')) + '<span onclick="window.imToggleGroupMember(' + uid + ')">✕</span></div>';
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
          '<div class="im-av" onclick="event.stopPropagation();window.imToggleGroupMember(' + f.serverId + ')">' + renderAvatar(f.avatarUrl || f.avatar, imFriendNameOf(f, '')) + '</div>' +
          '<div class="im-si"><div class="im-n">' + esc(imFriendNameOf(f, '')) + ' <span style="font-size:11px;color:#999">@' + esc(f.username || '') + '</span></div></div>' +
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
      return esc(imFriendNameOf(f, ''));
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

  /* ==================== T02 增量 2026-09-11：群设置面板（D0 骨架 / D2 成员管理·踢人 / D3 免打扰 / D4 退群·解散） ====================
     数据来源：GET /api/groups/{gid}（members[].role 已存在；announcement/myRole/myGroupNickname/groupNickname 由 T04 补齐）。
     缺失兜底：myRole 缺失按 member 处理；昵称取 groupNickname || nickname || 「已注销用户」。
     踢人：DELETE /api/groups/{gid}/members/{uid}（仅群主）；退群/解散：POST /api/groups/{gid}/quit。
     免打扰：零后端，复用本地 study_workbench_chat_prefs（threadKey 'g<gid>'），与左滑免打扰同源。 */
  var GS = { gid: null, detail: null }; // 面板状态（模块级，不落 localStorage）

  function imGsThreadKey(gid) { return 'g' + gid; }
  /* 纯函数：解析「我在本群的权限」。myRole 存在时以其为准；缺失时用 ownerId 推导兜底
     （T02 补：批次1 的 GET /api/groups/{gid} 尚无 myRole，仅返回 ownerId）；都缺 → member。
     D6：权限判定统一 role in ('owner','admin')；【后续扩展点：设置管理员】 */
  function imResolveMyRole(g, myId) {
    var r = (g && g.myRole) || '';
    if (!r && g && g.ownerId != null && myId != null && myId !== '') {
      r = (String(g.ownerId) === String(myId)) ? 'owner' : 'member';
    }
    r = r || 'member';
    return (r === 'owner' || r === 'admin') ? r : 'member';
  }
  function imGsMyRole(d) { return imResolveMyRole(d, S.myId); }
  function imGsRoleTag(role) {
    if (role === 'owner') return '<span class="im-gs-role-tag owner">群主</span>';
    if (role === 'admin') return '<span class="im-gs-role-tag admin">管理员</span>'; // 【后续扩展点：设置管理员】
    return '<span class="im-gs-role-tag">成员</span>';
  }

  window.imOpenGroupSettings = function () {
    if (!getToken()) { toast('群设置需要联网'); return; }
    if (!S.group || !S.group.id) { toast('请先打开一个群聊'); return; }
    var modal = $id('imGroupSettingsModal');
    if (!modal) { toast('弹层未加载'); return; }
    GS.gid = S.group.id;
    GS.detail = null;
    modal.style.display = 'flex';
    bindModalEsc();
    var body = $id('imGsBody');
    if (body) body.innerHTML = '<div class="im-empty2" style="padding:20px 0;text-align:center;color:#999;font-size:13px">加载中…</div>';
    fetch(apiBase() + '/api/groups/' + GS.gid, { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '加载失败'); return d; }); })
      .then(function (d) { GS.detail = d; imRenderGroupSettings(d); })
      .catch(function (e) {
        toast('加载失败：' + ((e && e.message) || '网络错误'));
        window.imCloseGroupSettings();
        loadGroups();
      });
  };

  window.imCloseGroupSettings = function () {
    var modal = $id('imGroupSettingsModal');
    if (modal) modal.style.display = 'none';
    unbindModalEscIfIdle();
  };

  /* R42（2026-09-14）：管理员在「全部用户」列表点用户头像/昵称 → 在私聊页内弹资料卡，
     数据源优先 GET /api/admin/users/{userId}（后端 server/routers/admin.py 已就绪）；
     普通用户对该接口 403/401 → 自动回退公开接口 GET /api/users/{userId}（缺口4，2026-09-17）。
     注：原注释「个人中心.html 不解析 ?user=，会显示登录者自己的资料」与事实相反 —— 该限制
     已于 2026-09-15 修复（个人中心.html:914-917 自动跳 profile 子页 + api.js renderProfilePage 解析 ?user=）。 */
  window.imShowUserProfile = function (userId) {
    var uid = Number(userId);
    if (!uid) return;
    if (!getToken()) { toast('查看用户资料需要联网'); return; }
    var old = $id('imUserProfileModal');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'im-overlay';
    ov.id = 'imUserProfileModal';
    ov.innerHTML = '<div class="im-modal">' +
      '<div class="im-modal-head"><div style="font-size:var(--xt-font-md);font-weight:700">用户资料</div>' +
      '<div style="cursor:pointer;color:#999;font-size:var(--xt-font-2xl)" onclick="imCloseUserProfile()">✕</div></div>' +
      '<div class="im-group-body" id="imUserProfileBody"><div class="im-empty2" style="padding:20px 0;text-align:center;color:#999;font-size:13px">加载中…</div></div>' +
      '<div class="im-group-foot" style="justify-content:flex-end">' +
      '<button class="btn btn-outline" id="imUserProfileRemarkBtn">备注</button>' +
      '<button class="btn btn-primary" id="imUserProfileChatBtn" disabled>发消息</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) window.imCloseUserProfile(); };
    bindModalEsc();
    // Bug3（R72）：好友资料卡「备注」入口（页内自建小弹窗，禁原生 prompt）
    var rmkBtnInit = ov.querySelector('#imUserProfileRemarkBtn');
    if (rmkBtnInit) rmkBtnInit.onclick = function () { window.imOpenRemarkEditor(uid, ''); };

    // 缺口4修复（2026-09-17）：先试管理员接口；403/401（普通用户无权限）时自动回退公开接口
    // GET /api/users/{uid}（server/routers/users.py:156）。公开响应不含 phone/gender/birthday，
    // 下方渲染逻辑也从不渲染这些字段，故回退不会有隐私泄漏。
    function _imFetchProfile(url) {
      return fetch(url, { headers: { 'Authorization': 'Bearer ' + getToken() } })
        .then(function (r) {
          return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; },
                              function () { return { ok: r.ok, status: r.status, d: null }; });
        });
    }
    _imFetchProfile(apiBase() + '/api/admin/users/' + uid)
      .then(function (res) {
        var u = res.d || {};
        if (res.ok && u && (u.id || u.username || u.nickname)) return { ok: true, d: u };
        if (res.status === 403 || res.status === 401) {
          // 普通用户无权访问管理员接口 → 回退公开资料接口
          return _imFetchProfile(apiBase() + '/api/users/' + uid).then(function (res2) {
            var u2 = res2.d || {};
            if (res2.ok && u2 && (u2.id || u2.username || u2.nickname)) return { ok: true, d: u2 };
            return { ok: false, d: {} };
          });
        }
        return { ok: false, d: {} };
      })
      .then(function (res) {
        var body = $id('imUserProfileBody');
        if (!body) return;
        var u = res.d || {};
        if (!res.ok || !u || (!u.id && !u.username && !u.nickname)) {
          body.innerHTML = '<div class="im-empty2" style="padding:20px 0;text-align:center;color:#999;font-size:13px">资料加载失败</div>';
          return;
        }
        var username = u.username || '';
        var nickname = u.nickname || ('用户' + uid);
        /* 需求D：资料卡标题同样「备注名 > 昵称」；/api/users/{id} 不回 peerRemark，回落本地备注缓存。 */
        var dispName = imFriendName({ peerRemark: ((u && u.peerRemark) ? u.peerRemark : imRemarkOf(uid)), nickname: nickname }, '');
        var created = u.createdAt || u.created_at || '';
        var last = u.lastActive || u.last_active || '';
        var online = (u.isOnline === true || u.is_online === true);
        var isAdmin = !!(u.isAdmin || u.is_admin);
        var stats = u.stats || {};
        var notesN = (stats.notes != null) ? stats.notes : '—';
        var studyN = (stats.studyEvents != null) ? stats.studyEvents
          : (stats.study_events != null ? stats.study_events : '—');
        function row(k, v) {
          return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
            '<div style="flex:0 0 74px;color:var(--text-secondary);font-size:13px">' + k + '</div>' +
            '<div style="flex:1;font-size:13px;color:var(--text);word-break:break-all">' + v + '</div></div>';
        }
        body.innerHTML =
          '<div style="text-align:center;padding:6px 0 12px">' +
            '<div style="width:64px;height:64px;border-radius:50%;margin:0 auto 8px;overflow:hidden;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--primary)">' +
              renderAvatar(u.avatarUrl || u.avatar || '', dispName) + '</div>' +
            '<div style="font-size:16px;font-weight:700">' + esc(dispName) + (isAdmin ? ' <span style="font-size:11px;color:#e05040">[管理员]</span>' : '') + '</div>' +
            (username ? '<div style="font-size:12px;color:#999;margin-top:2px">@' + esc(username) + '</div>' : '') +
          '</div>' +
          row('账号', username ? ('@' + esc(username)) : '—') +
          row('注册时间', created ? esc(created) : '—') +
          row('最近活跃', online ? '<span style="color:#0a8f4b;font-weight:600">● 在线</span>' : esc(imFmtLastActive(last))) +
          row('笔记数', esc(String(notesN))) +
          row('学习事件', esc(String(studyN)));
        body.setAttribute('data-nick', dispName);
        body.setAttribute('data-avatar', u.avatarUrl || u.avatar || '');
        var btn = $id('imUserProfileChatBtn');
        if (btn) { btn.disabled = false; btn.onclick = function () {
          window.imCloseUserProfile();
          window.imOpenChatWithUser(uid, nickname, u.avatarUrl || u.avatar || '');
        }; }
        var rmkBtn = $id('imUserProfileRemarkBtn');
        if (rmkBtn) rmkBtn.onclick = function () { window.imOpenRemarkEditor(uid, nickname); };
      })
      .catch(function () {
        var body = $id('imUserProfileBody');
        if (body) body.innerHTML = '<div class="im-empty2" style="padding:20px 0;text-align:center;color:#999;font-size:13px">资料加载失败</div>';
      });
  };

  window.imCloseUserProfile = function () {
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
      /* R73 需求18③：保存后即时刷新头部标题 + 会话列表条目（loadChats 为异步，先同步刷一遍） */
      if (!S.group && S.peer && S.peer.isServer && Number(S.peer.serverId) === uid) renderChatHeader();
      if (S.tab === 'chats') renderList();
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
  };

  function imReloadGroupDetail() {
    if (!GS.gid) return;
    fetch(apiBase() + '/api/groups/' + GS.gid, { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.id) return;
        GS.detail = d;
        imRenderGroupSettings(d);
        if (S.group && S.group.id === GS.gid) {
          S.group.memberCount = (d.members || []).length;
          renderChatHeader();
        }
      })
      .catch(function () { });
  }

  function imRenderGroupSettings(d) {
    var body = $id('imGsBody');
    if (!body) return;
    if (!d || typeof d !== 'object') {
      body.innerHTML = '<div class="im-empty2" style="padding:20px 0;text-align:center;color:#999">群信息不可用</div>';
      return;
    }
    var gid = d.id || GS.gid;
    var myRole = imGsMyRole(d);
    var isOwner = (myRole === 'owner');
    var members = d.members || [];
    var gname = d.name || (S.group && S.group.name) || '群聊';
    var muted = !!(imLoadPrefs()[imGsThreadKey(gid)] || {}).muted;
    var myNick = d.myGroupNickname || '';

    // 段1：群信息（D1 接线 2026-09-11：PATCH /api/groups/{gid}，仅群主/管理员可改）
    var canEdit = (myRole === 'owner' || myRole === 'admin'); // D6：权限判定；【后续扩展点：设置管理员】
    /* R53（2026-09-14）：群头像（三选一：上传图片 / emoji / 色块），仅群主/管理员可改。
       取值直接落到 group.avatar，群列表行与会话头通过 imGroupAvatarHtml() 渲染。 */
    var avBtns;
    if (canEdit) {
      avBtns = '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="btn btn-outline im-gs-kick" onclick="imPickGroupAvatar()">上传图片</button>' +
          '<button class="btn btn-outline im-gs-kick" onclick="imToggleGroupAvatarPicker(\'emoji\')">Emoji</button>' +
          '<button class="btn btn-outline im-gs-kick" onclick="imToggleGroupAvatarPicker(\'color\')">色块</button>' +
        '</div>' +
        '<div id="imGsAvPicker"></div>' +
        '</div>';
    } else {
      avBtns = '<div class="im-gs-hint" style="margin:0">仅群主/管理员可以设置群头像</div>';
    }
    var secAv = '<div class="im-gs-field"><div class="im-gs-label">群头像</div>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<div class="im-av" id="imGsAvPrev" style="width:52px;height:52px;flex-shrink:0">' + imGroupAvatarHtml(d.avatar, gname) + '</div>' +
          avBtns +
        '</div></div>';

    var sec1 = '<div class="im-gs-sec">' +
        '<div class="im-gs-sec-title">群信息</div>' +
        secAv +
        '<div class="im-gs-field"><div class="im-gs-label">群名称</div>' +
          '<input class="form-input im-gs-input" id="imGsName" maxlength="20" value="' + esc(gname) + '"' + (canEdit ? '' : ' disabled') + ' placeholder="群名称"></div>' +
        '<div class="im-gs-field"><div class="im-gs-label">群公告</div>' +
          '<textarea class="form-input im-gs-input" id="imGsAnn" maxlength="300" rows="2"' + (canEdit ? '' : ' disabled') + ' placeholder="群主还没有发布公告">' + esc(d.announcement || '') + '</textarea></div>' +
        (canEdit
          ? '<div class="im-gs-soon-row"><button class="btn btn-primary" id="imGsSaveInfo" onclick="imSaveGroupInfo()">保存</button></div>'
          : '<div class="im-gs-hint">仅群主/管理员可以修改群名与公告</div>') +
      '</div>';

    // 段2：成员管理（D2）
    var memRows = members.map(function (m) {
      var nm = imFriendName({ peerRemark: imRemarkOf(Number(m.id || 0)), nickname: (m.groupNickname || m.nickname) }, '已注销用户');
      var uid = Number(m.id || 0);
      var canKick = isOwner && String(m.id) !== String(S.myId);
      /* R54（2026-09-14）：群主转让 —— 仅群主可见，且不能转给自己（自己本就是群主）。
         转让后后端把新群主 role 置 owner、原群主降 admin，imGsRoleTag 会立即体现。 */
      var canTransfer = canKick;
      return '<div class="im-gs-mem">' +
          '<div class="im-av im-gs-mem-av" onclick="event.stopPropagation();openUserHome(' + uid + ')" title="查看主页">' + renderAvatar(m.avatarUrl, nm) + '</div>' +
          '<div class="im-gs-mem-main"><div class="im-gs-mem-name">' + esc(nm) + '</div>' + imGsRoleTag(m.role) + '</div>' +
          (canTransfer ? '<button class="btn btn-outline im-gs-kick" onclick="imTransferOwner(' + uid + ')">转让</button>' : '') +
          (canKick ? '<button class="btn btn-outline im-gs-kick" onclick="imKickMember(' + uid + ')">移出</button>' : '') +
        '</div>';
    }).join('');
    var sec2 = '<div class="im-gs-sec">' +
        '<div class="im-gs-sec-title">群成员（' + members.length + '）</div>' +
        '<div class="im-gs-members">' + (memRows || '<div class="im-empty2" style="padding:10px 0;color:#999">暂无成员</div>') + '</div>' +
        (isOwner ? '' : '<div class="im-gs-hint">仅群主可以移除成员</div>') +
      '</div>';

    // 段3：消息免打扰（D3，零后端）
    var sec3 = '<div class="im-gs-sec">' +
        '<div class="im-gs-sec-title">消息免打扰</div>' +
        '<div class="im-gs-row">' +
          '<div class="im-gs-row-main"><div class="im-gs-mem-name">免打扰</div>' +
            '<div class="im-gs-hint" style="margin-top:2px">开启后新消息不计入未读角标（仅本机生效）</div></div>' +
          '<label class="st-switch" title="消息免打扰"><input type="checkbox" id="imGsMute"' + (muted ? ' checked' : '') + ' onchange="imToggleGroupMute(this.checked)"><span class="st-switch-slider"></span></label>' +
        '</div>' +
      '</div>';

    // 段4：群内昵称（D5 接线 2026-09-11：PATCH /api/groups/{gid}/me，空串=清除群名片）
    var sec4 = '<div class="im-gs-sec">' +
        '<div class="im-gs-sec-title">我在本群的昵称</div>' +
        '<div class="im-gs-field"><input class="form-input im-gs-input" id="imGsMyNick" maxlength="20" value="' + esc(myNick) + '" placeholder="留空则使用全局昵称"></div>' +
        '<div class="im-gs-soon-row"><button class="btn btn-primary" id="imGsSaveNick" onclick="imSaveGroupNickname()">保存</button></div>' +
        '<div class="im-gs-hint">留空保存 = 清除群名片，回退使用全局昵称</div>' +
      '</div>';

    // 段5：危险操作（D4）
    var sec5 = '<div class="im-gs-sec im-gs-danger-sec">' +
        '<div class="im-gs-sec-title">危险操作</div>' +
        '<div class="im-gs-hint">' + (isOwner ? '解散后群与全部群消息将被清除，不可恢复' : '退出后将不再接收该群消息') + '</div>' +
        '<button class="btn im-gs-danger" onclick="imQuitGroup()">' + (isOwner ? '🗑️ 解散群聊' : '🚪 退出群聊') + '</button>' +
      '</div>';

    body.innerHTML = sec1 + sec2 + sec3 + sec4 + sec5;
  }
  window.imRenderGroupSettings = imRenderGroupSettings;

  window.imKickMember = async function (uid) {
    uid = Number(uid || 0);
    if (!uid) return;
    var nm = '';
    try {
      var mm = ((GS.detail && GS.detail.members) || []).find(function (x) { return Number(x.id) === uid; });
      if (mm) nm = imFriendName({ peerRemark: imRemarkOf(uid), nickname: (mm.groupNickname || mm.nickname) }, '');
    } catch (e) { }
    var msg = '确定把「' + (nm || '该成员') + '」移出群聊吗？';
    var ok = await window.uiConfirm(msg, '移出');
    if (!ok) return;
    fetch(apiBase() + '/api/groups/' + GS.gid + '/members/' + uid, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getToken() }
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '移除失败'); return d; }); })
      .then(function () { toast('✅ 已移出该成员'); imReloadGroupDetail(); })
      .catch(function (e) { toast('移除失败：' + ((e && e.message) || '网络错误')); });
  };

  window.imToggleGroupMute = function (checked) {
    var gid = GS.gid || (S.group && S.group.id);
    if (!gid) return;
    window.imChatPrefs.set(imGsThreadKey(gid), { muted: !!checked });
    toast(checked ? '🔕 已开启免打扰（不计入未读角标）' : '已关闭免打扰');
    if (S.tab === 'chats') renderChats($id('imList'));
    updateTabBadge('chats', imCountUnread(S.chats, imLoadPrefs()));
  };

  window.imQuitGroup = async function () {
    var gid = GS.gid || (S.group && S.group.id);
    if (!gid) return;
    var isOwner = imGsMyRole(GS.detail) === 'owner';
    var msg = isOwner
      ? '确定解散该群聊吗？解散后群与全部群消息将被清除，不可恢复。'
      : '确定退出该群聊吗？退出后将不再接收该群消息。';
    var ok = await window.uiConfirm(msg, isOwner ? '解散' : '退出');
    if (!ok) return;
    fetch(apiBase() + '/api/groups/' + gid + '/quit', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '操作失败'); return d; }); })
      .then(function (d) {
        window.imCloseGroupSettings();
        backToList();
        loadGroups();
        toast((d && d.dissolved) ? '✅ 群聊已解散' : '✅ 已退出群聊');
      })
      .catch(function (e) { toast('操作失败：' + ((e && e.message) || '网络错误')); });
  };

  /* D1 接线：保存群名 + 群公告（PATCH /api/groups/{gid}；仅群主/管理员可改） */
  window.imSaveGroupInfo = function () {
    var gid = GS.gid || (S.group && S.group.id);
    if (!gid) return;
    if (imGsMyRole(GS.detail) === 'member') { toast('仅群主/管理员可以修改'); return; }
    var nameEl = $id('imGsName'), annEl = $id('imGsAnn');
    var name = nameEl ? String(nameEl.value || '').trim() : '';
    var ann = annEl ? String(annEl.value || '') : '';
    if (!name) { toast('群名称不能为空'); if (nameEl) nameEl.focus(); return; }
    if (name.length > 20) { toast('群名称最长 20 字'); return; }
    if (ann.length > 300) { toast('公告最长 300 字'); return; }
    var btn = $id('imGsSaveInfo');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    fetch(apiBase() + '/api/groups/' + gid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ name: name, announcement: ann }) // 部分更新
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '保存失败'); return d; }); })
      .then(function (d) {
        toast('✅ 群名与公告已更新');
        // 本地同步群名 + 头部 + 会话列表行内群名
        if (S.group && S.group.id === gid && d && d.name) { S.group.name = d.name; renderChatHeader(); }
        loadGroups();
        imReloadGroupDetail();
      })
      .catch(function (e) { toast('保存失败：' + ((e && e.message) || '网络错误')); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = '保存'; } });
  };

  /* D5 接线：保存群内昵称（PATCH /api/groups/{gid}/me；空串=清除群名片） */
  window.imSaveGroupNickname = function () {
    var gid = GS.gid || (S.group && S.group.id);
    if (!gid) return;
    var inp = $id('imGsMyNick');
    var nick = inp ? String(inp.value || '').trim() : '';
    if (nick.length > 20) { toast('群昵称最长 20 字'); return; }
    var btn = $id('imGsSaveNick');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    fetch(apiBase() + '/api/groups/' + gid + '/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ groupNickname: nick }) // 空串 = 清除
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '保存失败'); return d; }); })
      .then(function (d) {
        var saved = (d && typeof d.groupNickname === 'string') ? d.groupNickname : nick;
        if (GS.detail) GS.detail.myGroupNickname = saved;
        toast(saved ? '✅ 群昵称已更新' : '✅ 已清除群名片');
        imReloadGroupDetail(); // 重拉详情 → 成员列表群名片即时刷新
      })
      .catch(function (e) { toast('保存失败：' + ((e && e.message) || '网络错误')); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = '保存'; } });
  };

  /* ==================== R53（2026-09-14）：群头像设置（上传图片 / emoji / 色块） ==================== */
  var GS_AV_EMOJI = ['🎉', '📚', '🚀', '💡', '🎯', '🏆', '🍀', '🎨', '🐱', '🌟'];
  var GS_AV_COLOR = ['#5B8DEF', '#E05040', '#9B6BD9', '#D4A056', '#36CFC9', '#FF9F68', '#2E9E5B', '#667eea'];

  window.imToggleGroupAvatarPicker = function (kind) {
    var box = $id('imGsAvPicker');
    if (!box) return;
    if (GS.avPicker === kind) { box.innerHTML = ''; GS.avPicker = null; return; }
    GS.avPicker = kind;
    var html;
    if (kind === 'emoji') {
      html = GS_AV_EMOJI.map(function (em) {
        return '<span class="im-gs-av-opt" onclick="imSaveGroupAvatar(\'' + em + '\')">' + em + '</span>';
      }).join('');
    } else {
      html = GS_AV_COLOR.map(function (c) {
        return '<span class="im-gs-av-opt" style="background:' + c + '" onclick="imSaveGroupAvatar(\'color:' + c + '\')"></span>';
      }).join('');
    }
    box.innerHTML = '<div class="im-gs-av-pick">' + html + '</div>';
  };

  /* 上传图片做群头像：临时 file input → POST /api/uploads/image → PATCH avatar。
     与聊天图片走同一个上传端点（≤5MB / 魔数白名单），不另起一套上传逻辑。 */
  window.imPickGroupAvatar = function () {
    if (imGsMyRole(GS.detail) === 'member') { toast('仅群主/管理员可以设置'); return; }
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (!f) return;
      if (f.size && f.size > MAX_IMAGE_BYTES) { toast('图片超过 5MB，请换一张小一点的'); return; }
      toast('上传中…');
      imUploadImage(f, function (url) { if (url) imSaveGroupAvatar(url); });
    };
    inp.click();
  };

  /* 保存群头像：PATCH /api/groups/{gid} {avatar}（后端 R53 已支持 avatar 字段）。
     落库后同步三处：GS.detail（面板预览）/ S.group（会话头）/ S.groups（列表行）。 */
  window.imSaveGroupAvatar = function (value) {
    var gid = GS.gid || (S.group && S.group.id);
    if (!gid) return;
    if (imGsMyRole(GS.detail) === 'member') { toast('仅群主/管理员可以设置'); return; }
    var v = String(value == null ? '' : value);
    var prev = $id('imGsAvPrev');
    if (prev) prev.innerHTML = imGroupAvatarHtml(v, (GS.detail && GS.detail.name) || (S.group && S.group.name));
    fetch(apiBase() + '/api/groups/' + gid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ avatar: v })
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '保存失败'); return d; }); })
      .then(function (d) {
        var saved = (d && typeof d.avatar === 'string') ? d.avatar : v;
        if (GS.detail) GS.detail.avatar = saved;
        GS.avPicker = null;
        if (S.group && S.group.id === gid) { S.group.avatar = saved; renderChatHeader(); }
        var g = (S.groups || []).filter(function (x) { return x.id === gid; })[0];
        if (g) g.avatar = saved;
        toast('✅ 群头像已更新');
        loadGroups();
        imReloadGroupDetail();
      })
      .catch(function (e) { toast('保存失败：' + ((e && e.message) || '网络错误')); });
  };

  /* ==================== R54（2026-09-14）：群主转让 ====================
     POST /api/groups/{gid}/transfer {userId}：仅群主；新群主须是本群成员。
     转让后新群主 role=owner、原群主降 admin，UI 上「群主」角标与「转让/移出」按钮随之换位。 */
  window.imTransferOwner = async function (uid) {
    uid = Number(uid || 0);
    if (!uid) return;
    if (imGsMyRole(GS.detail) !== 'owner') { toast('仅群主可以转让群主'); return; }
    var nm = '';
    try {
      var mm = ((GS.detail && GS.detail.members) || []).filter(function (x) { return Number(x.id) === uid; })[0];
      if (mm) nm = imFriendName({ peerRemark: imRemarkOf(uid), nickname: (mm.groupNickname || mm.nickname) }, '');
    } catch (e) { /* 取不到昵称用占位 */ }
    var msg = '确定把群主转让给「' + (nm || '该成员') + '」吗？转让后你将变为管理员。';
    var ok = await window.uiConfirm(msg, '转让');
    if (!ok) return;
    fetch(apiBase() + '/api/groups/' + GS.gid + '/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ userId: uid })
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '转让失败'); return d; }); })
      .then(function () {
        toast('✅ 群主已转让');
        if (GS.detail) GS.detail.ownerId = uid;
        loadGroups();
        imReloadGroupDetail();
      })
      .catch(function (e) { toast('转让失败：' + ((e && e.message) || '网络错误')); });
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

  // —— 会话轮询（2s 主干）：当前会话可见时高频拉取，页面隐藏暂停 ——
  function startConvPoll() {
    setInterval(function () {
      if (document.visibilityState !== 'visible' || !getToken()) return;
      if (S.group) { fetchGroupMsgs(true); return; }
      if (S.peer && S.peer.isServer) fetchPeerMsgs(true);
    }, 2000);
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
    /* R51/R53（2026-09-14）：图片气泡 / 全屏预览 / 群头像选择器。
       样式随脚本注入，避免改 common.css（本批次该文件由其它线并行修改，杜绝覆盖风险）。 */
    style.textContent = '@keyframes typing{0%,60%,100%{opacity:.3}30%{opacity:1}}' +
      '.im-img{max-width:200px;max-height:260px;border-radius:8px;display:block;cursor:zoom-in;object-fit:cover}' +
      '.im-img-preview{position:fixed;left:0;top:0;right:0;bottom:0;z-index:3000;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}' +
      '.im-img-preview img{max-width:100%;max-height:100%;border-radius:8px}' +
      /* R73 需求3（2026-09-15）：单例图片查看器（缩放 + 工具条）。样式随脚本注入，不改 common.css。 */
      '.im-img-preview.im-iv{padding:0;overflow:hidden;touch-action:none}' +
      '.im-img-preview .im-iv-img{max-width:96vw;max-height:88vh;border-radius:8px;transform-origin:center center;transition:transform .12s ease;will-change:transform;user-select:none;-webkit-user-select:none;touch-action:none}' +
      '.im-iv-zoomed .im-iv-img{cursor:grab;transition:none}' +
      '.im-iv-zoomed .im-iv-img:active{cursor:grabbing}' +
      '.im-iv-tools{position:absolute;top:16px;right:16px;display:flex;gap:10px;z-index:2}' +
      '.im-iv-btn{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;cursor:pointer;user-select:none;-webkit-user-select:none}' +
      '.im-iv-btn:active{background:rgba(255,255,255,.34)}' +
      '.im-gs-av-pick{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
      '.im-gs-av-opt{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;border:1px solid var(--border);background:var(--bg-secondary,#f5f5f5)}' +
      '.im-gs-av-opt:active{transform:scale(.92)}' +
      /* R55（2026-09-14）：帖子分享接收侧转发卡片预览（落在输入框上方） */
      '.im-forward-card{margin:8px 10px 0;padding:8px 10px;background:var(--bg-secondary,#f7f7fb);border:1px solid var(--border,#eee);border-radius:10px;font-size:13px;color:var(--text,#333)}' +
      '.im-forward-tag{font-size:11px;color:#667eea;font-weight:600;margin-bottom:3px}' +
      '.im-forward-body{display:flex;align-items:flex-start;gap:8px;justify-content:space-between}' +
      '.im-forward-title{font-weight:600;line-height:1.4}' +
      '.im-forward-sum{color:var(--text-secondary,#999);font-size:12px;margin-top:2px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.im-forward-cancel{flex-shrink:0;margin-left:8px;color:#e05040;cursor:pointer;font-size:12px;white-space:nowrap}' +
      /* 2026-09-15 批次八（notify-fix1）：页面顶端入站消息通知条（.im-tn-*）。
         fixed 顶部居中；容器 pointer-events:none，只有横条本体可交互 —— 不遮挡输入框 / 底部导航，
         且无全屏遮罩（ADR-3 只允许轻交互浮层）。变量全部取自 common.css，不引入新库。 */
      '.im-tn-wrap{position:fixed;top:0;left:0;right:0;z-index:9998;display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px 0;pointer-events:none}' +
      '.im-tn{pointer-events:auto;width:100%;max-width:420px;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:var(--radius,12px);box-shadow:0 8px 24px rgba(0,0,0,.14);opacity:0;transform:translateY(-140%);transition:transform .28s cubic-bezier(.22,.68,.32,1),opacity .28s ease;cursor:pointer}' +
      '.im-tn.show{opacity:1;transform:translateY(0)}' +
      '.im-tn-av{flex:0 0 38px;width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--primary-light,#EEF1FF),#e9ecff);color:var(--primary,#5B8DEF);display:flex;align-items:center;justify-content:center;font-size:18px;overflow:hidden}' +
      '.im-tn-av img{width:100%;height:100%;object-fit:cover}' +
      '.im-tn-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
      '.im-tn-name{font-size:14px;font-weight:700;color:var(--text,#2D3436);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.im-tn-text{font-size:12px;line-height:1.5;color:var(--text-secondary,#636E72);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}' +
      '.im-tn-close{flex:0 0 auto;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-secondary,#999);cursor:pointer}' +
      '.im-tn-close:hover{background:var(--bg,#F5F7FA);color:var(--text,#2D3436)}' +
      'body.reduce-motion .im-tn{transition:none}' +
      /* R104 项3（2026-09-19）：私聊位置消息卡片 —— 有坐标=微信式地图卡（上地址 + 下缩略图），
         无坐标=纯文字卡（.im-loc-plain）。样式随脚本注入，不改 common.css；固定 px + @media，禁 clamp/min/max。 */
      '.im-loc-card{display:block;width:180px;max-width:60vw;overflow:hidden;background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:10px}' +
      '.im-loc-card.im-loc-plain{display:inline-flex;align-items:flex-start;gap:8px;width:auto;max-width:240px;padding:8px 12px}' +
      '.im-loc-addr{padding:8px 10px}' +
      '.im-loc-title{font-size:15px;font-weight:700;color:var(--text,#2D3436);line-height:1.35;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.im-loc-sub{font-size:12px;color:var(--text-secondary,#8a8f99);margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.im-loc-map{display:block;width:100%;height:110px;object-fit:cover;border-bottom-left-radius:10px;border-bottom-right-radius:10px;background:var(--bg,#F5F7FA)}' +
      '.im-loc-ic{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;color:var(--primary,#5B8DEF);margin-top:1px}' +
      '.im-loc-ic svg{width:18px;height:18px;display:block}' +
      '.im-loc-text{font-size:14px;line-height:1.5;color:var(--text,#2D3436);word-break:break-word;white-space:pre-wrap}' +
      /* R88-I 增量（2026-09-18）：文件消息卡片（元数据卡，无 emoji、不可跳转）。 */
      '.im-file-card{display:inline-flex;align-items:center;gap:10px;max-width:240px;padding:10px 12px;background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:10px}' +
      '.im-file-ic{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;color:var(--primary,#5B8DEF)}' +
      '.im-file-ic svg{width:20px;height:20px;display:block}' +
      '.im-file-meta{display:inline-flex;flex-direction:column;min-width:0}' +
      '.im-file-name{font-size:14px;line-height:1.4;color:var(--text,#2D3436);word-break:break-all}' +
      '.im-file-size{font-size:12px;line-height:1.4;color:var(--text-secondary,#8a8f99);margin-top:2px}';
    document.head.appendChild(style);

    /* R60：本页已持有聊天轮询（2.5s 会话 + 5s 未读 + 30s 群/在线），
       告诉 app.js 不要再为同一件事另开一套轮询，避免重复请求。页面隐藏/卸载时置 false。 */
    xtTransport(true);
    window.addEventListener('pagehide', function () { xtTransport(false); });

    // 绑定回车发送（HTML 已有 imInput）
    var inp = $id('imInput');
    if (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.imSendText(); }
      });
      // T03 增量（2026-09-12）：拦截粘贴图片（铁律 10），文字/HTML/表情 paste 放行
      inp.addEventListener('paste', window.imOnPaste || function () {});
    }

    // 批次二 需求2：会话列表左滑 / 右键操作（事件委托，只绑一次）
    imBindSwipeGestures();

    /* R73 需求19/3（2026-09-15）：消息区只绑一次的两类监听（事件委托，innerHTML 重建不影响）。
       (1) 向上滚动到顶 → 加载更早历史；
       (2) 点击图片气泡 → 打开单例查看器（此前仅靠内联 onclick，重建竞态下移动端会丢合成 click）。 */
    var msgsBox = $id('imMsgs');
    if (msgsBox) {
      msgsBox.addEventListener('scroll', function () {
        if (msgsBox.scrollTop < 48) imLoadMoreMsgs();
      });
      msgsBox.addEventListener('click', function (e) {
        var t = e && e.target;
        if (!t || !t.tagName) return;
        if (String(t.tagName).toUpperCase() !== 'IMG') return;
        if (!t.className || String(t.className).indexOf('im-img') < 0) return;
        var s = t.getAttribute('src');
        if (s) imPreviewImage(s);
      });
    }

    // 先获取当前用户ID（用于区分消息左右），再加载会话和好友
    var token = getToken();
    if (token) {
      fetch(apiBase() + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        if (me && me.id) {
          S.myId = me.id;
          /* R40（2026-09-14）：缓存管理员标记（camelCase + snake 双写取一），
             供好友 tab 判断是否渲染「全部用户」分组，避免重复请求 */
          S.isAdmin = !!(me.isAdmin || me.is_admin);
        }
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

    // R43（2026-09-14）：预解析管理员 id（普通用户），供未读轮询判断「管理员来信」
    imResolveAdminId();

    /* 2026-09-15 批次八：5s → 2s。未读轮询是「非当前会话来新消息」的唯一发现通道，
       5s 意味着平均 2.5s、最坏 5s 才看到，是用户反馈「收消息迟钝」的直接根因。
       R46（2026-09-14e）：visibilityState 守卫 —— 同一文件里 2s 会话轮询与 30s 群/在线轮询都有，唯独这条漏了 */
    var imUnreadBaseline = false;   // 首次成功轮询只建基线，不把历史未读一次性弹成通知条
    function imPollUnread() {
      var token = getToken();
      if (!token) return;
      if (document.visibilityState !== 'visible') return;
      fetch(apiBase() + '/api/chat/unread', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = d.items || [];
        items.forEach(function (item) {
          var cnt = item.count || 0;
          // 找到对应的会话（后端字段：peerId / last / lastId）
          var chat = S.chats.find(function (c) { return c.isServer && c.serverId === item.peerId; });
          /* R43（2026-09-14）：普通用户视角——管理员来信不动态建会话行，
             统一由「联系管理员」入口 + .ac-badge 角标承载（避免入口与角标分离 / 重复会话行）。 */
          var adminPeer = (!S.isAdmin && imCachedAdminId() && Number(item.peerId) === imCachedAdminId());
          /* R39（2026-09-14）：非好友发信人（如管理员）匹配不到 → 动态创建服务器会话，
             不再把整条未读静默丢弃；nickname/avatar 直接取未读接口返回值 */
          if (!chat && !adminPeer) chat = imEnsureServerChat(item);
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
              var idChanged = !!item.lastId && chat.lastId !== item.lastId;
              chat.unread = Number(cnt) || 0;
              if (item.last) chat.last = item.last;
              /* R46：只有「真来了新消息」（lastId 变化）才推进排序时间。
                 旧代码无条件 chat.time = Date.now()，排序键每次轮询都被改写，
                 会让列表反复重排（也是闪烁的帮凶之一）。 */
              if (idChanged) { chat.lastId = item.lastId; chat.time = Date.now(); }
              else if (!chat.time) chat.time = Date.now();
              /* R60：真来了新消息且不在该会话里 → 顶端通知条。
                 正在和对方聊天时不抛（本地已即时渲染并标记已读，再弹通知属于自扰）。
                 批次八：加 imUnreadBaseline 守卫，避免进页面时把历史未读一次性弹一排。 */
              if (idChanged && imUnreadBaseline) {
                xtNotify({
                  peerId: item.peerId,
                  nickname: imFriendNameOf(chat, item.nickname || ''),
                  peerRemark: chat.peerRemark || item.peerRemark || '',
                  avatar: chat.avatar || item.avatar || '',
                  preview: item.last || '',
                  count: Number(cnt) || 0
                });
              }
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
        /* R46（2026-09-14e）：快照比对 + 早退 —— 只有「会影响行外观」的字段变了才重建列表。
           旧代码无条件 renderList() → renderChats() 的 box.innerHTML = ... 整表销毁重建，
           头像重绘 + .im-sess 背景过渡重放 = 每 5 秒闪一下（本条 Bug 的正面修法）。
           注意先消费签名再渲染：非会话 tab（好友/申请）时 renderChats 不会执行，签名也必须更新，
           否则每次轮询都会判定「有变化」，好友列表照样 5 秒重建一次。 */
        var sig = imChatsSig();
        if (sig !== lastChatsSig) {
          lastChatsSig = sig;
          renderList();
        }
        // tab 按钮角标：会话=未读消息总数（批次二 需求2：免打扰 / 已隐藏会话不计入）
        var unreadTotal = imCountUnread(S.chats, imLoadPrefs());
        updateTabBadge('chats', unreadTotal);
        // R60：未读总数（私聊 + 群聊，同样跳过免打扰/已隐藏）抛给 app.js
        xtUnread(unreadTotal + imGroupUnread());
        // 待处理好友申请数 → 申请 tab 角标（需求1，2026-09-11h）：
        // 优先消费后端未读水位线字段 unreadCount（created_at > last_request_seen_at 的 pending 条数），
        // 修复旧逻辑「角标 = incoming.length，查看后刷新必复发」的 Bug；旧后端无该字段时回退为旧行为。
        // R46（可选项）：该接口原本每 5s 拉一次，降到 30s（与群列表轮询同频），减少无谓请求。
        if (Date.now() - lastReqFetchAt >= 30000) {
          lastReqFetchAt = Date.now();
          fetch(apiBase() + '/api/friends/requests', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(function (r) { return r.json(); })
            .then(function (rd) { window.imApplyRequestBadge(rd); })
            .catch(function () { });
        }
        /* 2026-09-15 批次八：首次成功轮询只建基线（chat.lastId 已在上面落库），
           历史未读不再一次性弹成通知条；下一轮起真有新消息才弹。 */
        imUnreadBaseline = true;
        // 顶栏 💬 角标由 assets/api.js 的 loadChatUnread() 轮询维护，这里不再越权改写
      })
      .catch(function () {});
    }
    setInterval(imPollUnread, 2000);

    /* 2026-09-15 批次八：切回前台立刻补拉一次（未读 + 当前会话）。
       旧逻辑只等下一个轮询周期，从后台切回最坏要干等一整轮才看到新消息。 */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !getToken()) return;
      imPollUnread();
      if (S.group) fetchGroupMsgs(true);
      else if (S.peer && S.peer.isServer) fetchPeerMsgs(true);
    });
  }

  /* R60：群聊未读总数（/api/chat/unread 只统计私聊，群未读来自 loadGroups 的 unreadCount）。
     与 imCountUnread 同口径：免打扰 / 已隐藏的群不计入。 */
  function imGroupUnread() {
    var prefs = imLoadPrefs();
    var total = 0;
    (S.groups || []).forEach(function (g) {
      var gp = prefs['g' + g.id] || {};
      if (gp.muted || gp.hidden) return;
      total += Number(g.unreadCount) || 0;
    });
    return total;
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
    SWIPE_PX: SWIPE_PX,
    imResolveMyRole: imResolveMyRole,
    /* R39/R40（2026-09-14a）：动态会话 + 管理员用户列表校验钩子（仅测试引用，零运行时行为影响） */
    imEnsureServerChat: imEnsureServerChat,
    getFriend: getFriend,
    loadData: loadData,
    saveData: saveData,
    imFmtLastActive: imFmtLastActive,
    imAdminUsersHtml: imAdminUsersHtml,
    /* R41/R42（2026-09-14b）：新增函数校验钩子（仅测试引用，零运行时行为影响） */
    imOpenChatWithUser: window.imOpenChatWithUser,
    imShowUserProfile: window.imShowUserProfile,
    imStrArg: imStrArg,
    imCachedAdminId: imCachedAdminId,
    /* R46（2026-09-14e）：列表渲染签名（jsdom 可断言「无变化时签名不变 → 不重建」） */
    imChatsSig: imChatsSig,
    getLastChatsSig: function () { return lastChatsSig; },
    imFriendsSig: imFriendsSig,
    getLastFriendsSig: function () { return lastFriendsSig; },
    /* R51/R53/R54/R56/R57（2026-09-14）：本批次新增函数的校验钩子（仅测试引用，零运行时行为影响） */
    imGroupAvatarHtml: imGroupAvatarHtml,
    renderGroupsTab: renderGroupsTab,
    imGroupsSig: imGroupsSig,
    getLastGroupsSig: function () { return lastGroupsSig; },
    imRegFriendsHtml: imRegFriendsHtml,
    imGroupUnread: imGroupUnread,
    imSendImageFile: imSendImageFile,
    imPreviewImage: window.imPreviewImage,
    imTransferOwner: window.imTransferOwner,
    imSaveGroupAvatar: window.imSaveGroupAvatar,
    /* 2026-09-15 批次八（notify-fix1）：顶端通知条（jsdom 直接触发，断言 DOM / 自动消失 / 点击跳转） */
    imTopNotify: imTopNotify,
    SERVER_FRIENDS_REF: function () { return SERVER_FRIENDS; },
    /* R72（Bug1/Bug2/Bug4）：本批次新增校验钩子（仅测试引用，零运行时行为影响） */
    imBuildChatsFromConversations: imBuildChatsFromConversations,
    imBuildLocalChats: imBuildLocalChats,
    imDisplayName: imDisplayName,
    imFriendName: imFriendName,
    imFriendNameOf: imFriendNameOf,
    imRemarkOf: imRemarkOf,
    lsK: lsK,
    imOfflineFallback: imOfflineFallback,
    /* R73 需求3/19（2026-09-15）：图片查看器 / 分页加载 / 消息快照签名 校验钩子（仅测试引用） */
    imClosePreview: window.imClosePreview,
    imPreviewImageFn: imPreviewImage,
    getPreviewEl: function () { return _IV ? _IV.ov : null; },
    imLoadMoreMsgs: imLoadMoreMsgs,
    imMsgsSig: imMsgsSig,
    imMergeOlderMsgs: imMergeOlderMsgs,
    getImHasMore: function () { return imHasMore; },
    setImHasMore: function (v) { imHasMore = !!v; },
    getLastMsgsSig: function () { return lastMsgsSig; },
    /* R73 追加（2026-09-15）：会话切换守卫 / 备注入口 校验钩子（仅测试引用） */
    fetchPeerMsgs: fetchPeerMsgs,
    fetchGroupMsgs: fetchGroupMsgs,
    renderChatHeader: renderChatHeader,
    imEnsureRemarkBtn: imEnsureRemarkBtn,
    getAiConfig: getAiConfig
  };

  $ready(boot);
})();
