/* =====================================================================
   assets/notify.js —— 全局消息通知（轮询 + toast + 跳转）· 批次九 N9-3
   R72-5：优先走安卓原生通知横幅（window.AndroidBridge.notify），无桥时回落页内 toast。
   ---------------------------------------------------------------------
   定位：全站共用的「入站消息提醒」薄层。整个文件包在一个 IIFE 里，
   **顶层 0 个声明**；对外只做「守卫赋值」（typeof 判空后才挂 window），
   因此绝不会与 app.js / chat-local.js / xt-toast.js 抢全局名，
   也不会因为被重复注入而报 SyntaxError。

   干三件事：
     1) 轮询 —— 本地优先（localStorage 的 study_im_local_data，按账号前缀），
        在线且无人接管时补一次 GET {apiBase}/api/chat/unread；
        页面不可见时整轮跳过，切回前台立刻补一次。
     2) toast —— 自己在页面里建 DOM（右上角堆叠卡片，点击进入会话，
        4 秒自动消失，同屏最多 3 张，超出排队）；
        轻提示优先复用 window.xtToast / window.showToast，不另起一套。
     3) 跳转 —— 优先 window.imOpenChatWithUser(uid, name, avatar)，
        否则 location.href = '私聊.html?uid=..&name=..'。

   与既有实现的协作（重复弹窗是本项最大风险，必须遵守）：
     · app.js 的 R60 层已实现 window.xtNotifyMessage / window.xtSetUnread
       以及 /api/chat/unread 的 8 秒轮询，并置 window.__xtPollStarted = true。
       本文件只在**它没接管**时才开 HTTP 轮询；一旦探测到
       __xtPollStarted === true 或 __xtChatTransportActive === true，
       立即把自己的 HTTP 轮询永久关掉（remoteOff），只保留本地 storage
       轮询与「被调方」能力 —— 同一条消息绝不弹两次。
     · 私聊页（chat-local.js）自己渲染顶端通知条，本文件在该页不抢、不弹。
     · window.currentChatUserId 指向的会话（正在聊的对象）一律不打扰。
     · 首次轮询只建基线，不补弹历史未读（避免一进页面狂弹）。

   语法铁律（安卓 APK 老 WebView / Chrome 50~58）：
     禁 ?. ?? .replaceAll( Object.fromEntries .at( 顶层 await、
     正则后行断言 (?<= (?<!、对象展开 {...obj}、对象剩余解构、指数 **、
     可选 catch 绑定 catch {}；本文件一律 var / function / 字符串拼接。
     禁原生 alert / confirm / prompt。
   加载方式：<script src="assets/notify.js?v=版本号" defer></script>
   ===================================================================== */
(function () {
  'use strict';

  var W = window;
  var D = document;

  /* ---------------- 配置 ---------------- */
  var MAX_LIVE = 3;         // 同屏最多 3 张卡片
  var TOAST_MS = 4000;      // 单卡存活时长
  var POLL_MS = 8000;       // 轮询间隔
  var FADE_MS = 220;        // 退场动画时长
  var ENDPOINT = '/api/chat/unread';
  var STORE_KEY = 'study_im_local_data';
  var STYLE_ID = 'xt-notify-style';
  var LAYER_ID = 'xtNotifyLayer';

  var layer = null;
  var styleReady = false;
  var live = [];
  var queue = [];
  var seen = {};
  var baseline = false;
  var started = false;
  var remoteOff = false;
  var pollTimer = null;
  var unread = 0;

  /* ---------------- 小工具 ---------------- */

  /** 按账号隔离的 localStorage 键（与 app.js 的 lsKey 同口径；缺失时回退裸键） */
  function lsk(k) {
    try { if (typeof W.lsKey === 'function') return W.lsKey(k); } catch (e) { /* 回退裸键 */ }
    return k;
  }

  /** 读 JSON；任何异常一律返回 null，绝不向上抛 */
  function readJSON(key) {
    try {
      var raw = W.localStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }

  /** 安全取数：非有限数字回退 dft */
  function num(v, dft) {
    var n = Number(v);
    if (typeof n === 'number' && isFinite(n)) return n;
    return (typeof dft === 'number') ? dft : 0;
  }

  /** 安全取串：null/undefined → '' */
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }

  /** 同时兼容数组与对象的遍历（老内核没有 Object.values / Array.isArray 也无所谓） */
  function eachIn(obj, cb) {
    if (!obj) return;
    var i, k;
    if (typeof obj.length === 'number') {
      for (i = 0; i < obj.length; i++) cb(obj[i], String(i));
      return;
    }
    for (k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) cb(obj[k], k);
    }
  }

  /** 后端地址：统一走 config.js；取不到且是 file:// 时返回 null（不硬编码 IP，直接放弃远程轮询） */
  function apiBase() {
    try { if (typeof W.getApiBase === 'function') return String(W.getApiBase()); } catch (e) { /* 继续 */ }
    if (W.STUDY_API_BASE !== null && W.STUDY_API_BASE !== undefined) return String(W.STUDY_API_BASE);
    try {
      var p = String(location.protocol || '');
      if (p === 'http:' || p === 'https:') return '';
    } catch (e2) { /* 继续 */ }
    return null;
  }

  function token() {
    try { return W.localStorage.getItem('study_workbench_token') || ''; } catch (e) { return ''; }
  }

  function visible() {
    try {
      if (typeof D.visibilityState === 'string') return D.visibilityState === 'visible';
    } catch (e) { /* 老内核无该属性：当作可见 */ }
    return true;
  }

  /* ---------------- 样式（随脚本注入，不依赖外部容器 / 不改全站 CSS） ---------------- */
  function ensureStyle() {
    if (styleReady) return;
    if (D.getElementById(STYLE_ID)) { styleReady = true; return; }
    var css = '';
    css += '.xt-notify-layer{position:fixed;top:12px;right:12px;z-index:2147483000;';
    css += 'display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-orient:vertical;';
    css += '-webkit-flex-direction:column;flex-direction:column;-webkit-box-align:end;align-items:flex-end;';
    css += 'pointer-events:none;width:86vw;max-width:340px;}';
    css += '.xt-notify-card{pointer-events:auto;display:-webkit-box;display:-webkit-flex;display:flex;';
    css += '-webkit-box-align:flex-start;align-items:flex-start;gap:10px;width:100%;box-sizing:border-box;';
    css += 'background:var(--card,#ffffff);color:var(--text,#1a1b1c);border:1px solid var(--border,#e5e7eb);';
    css += 'border-radius:14px;padding:10px 12px;box-shadow:0 8px 24px rgba(15,23,42,.16);';
    css += 'cursor:pointer;opacity:1;-webkit-transform:translateX(0);transform:translateX(0);';
    css += '-webkit-transition:opacity .22s ease,-webkit-transform .22s ease;';
    css += 'transition:opacity .22s ease,transform .22s ease;}';
    css += '.xt-notify-card.xt-notify-in{opacity:0;-webkit-transform:translateX(24px);transform:translateX(24px);}';
    css += '.xt-notify-card.xt-notify-out{opacity:0;-webkit-transform:translateX(24px);transform:translateX(24px);}';
    css += '.xt-notify-av{width:34px;height:34px;flex:0 0 34px;border-radius:50%;';
    css += 'background:var(--primary-soft,#EDF3FF);color:var(--primary,#2F6BFF);';
    css += 'font-size:14px;font-weight:700;line-height:34px;text-align:center;overflow:hidden;}';
    css += '.xt-notify-body{-webkit-box-flex:1;flex:1;min-width:0;}';
    css += '.xt-notify-title{font-size:14px;font-weight:700;line-height:1.3;}';
    css += '.xt-notify-text{font-size:12px;color:var(--text-secondary,#6b7280);line-height:1.5;';
    css += 'margin-top:2px;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;';
    css += '-webkit-box-orient:vertical;overflow:hidden;}';
    css += '.xt-notify-x{flex:0 0 18px;width:18px;height:18px;border-radius:50%;color:var(--text-secondary,#9ca3af);';
    css += 'font-size:14px;line-height:18px;text-align:center;}';
    css += '.xt-unread-badge{position:absolute;top:2px;right:2px;min-width:16px;height:16px;';
    css += 'padding:0 4px;box-sizing:border-box;border-radius:8px;background:#E05040;color:#fff;';
    css += 'font-size:11px;line-height:16px;text-align:center;font-weight:700;z-index:5;}';
    css += '@media (max-width:640px){.xt-notify-layer{left:12px;right:12px;width:auto;max-width:none;}}';
    try {
      var st = D.createElement('style');
      st.id = STYLE_ID;
      st.setAttribute('type', 'text/css');
      if (st.styleSheet) { st.styleSheet.cssText = css; } else { st.appendChild(D.createTextNode(css)); }
      var head = D.head || (D.getElementsByTagName('head')[0]);
      if (head) head.appendChild(st);
      styleReady = true;
    } catch (e) { /* 样式注入失败不影响功能 */ }
  }

  function ensureLayer() {
    if (layer && layer.parentNode) return layer;
    ensureStyle();
    layer = D.getElementById(LAYER_ID);
    if (!layer) {
      layer = D.createElement('div');
      layer.id = LAYER_ID;
      layer.className = 'xt-notify-layer';
      layer.setAttribute('role', 'status');
      layer.setAttribute('aria-live', 'polite');
      var mount = D.body || D.documentElement;
      if (mount) mount.appendChild(layer);
    }
    return layer;
  }

  /* ---------------- 卡片 ---------------- */

  function dismiss(item) {
    if (!item || item.closed || !item.el) return;
    item.closed = true;
    if (item.timer) { clearTimeout(item.timer); item.timer = null; }
    var el = item.el;
    try { el.className = 'xt-notify-card xt-notify-out'; } catch (e) { /* 忽略 */ }
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, FADE_MS);
    var idx = live.indexOf(item);
    if (idx >= 0) live.splice(idx, 1);
    drain();
  }

  function schedule(item) {
    if (item.timer) { clearTimeout(item.timer); item.timer = null; }
    item.timer = setTimeout(function () { dismiss(item); }, TOAST_MS);
  }

  function drain() {
    while (live.length < MAX_LIVE && queue.length) {
      mount(queue.shift());
    }
  }

  function mount(item) {
    var host = ensureLayer();
    if (!host) return;
    var el = D.createElement('div');
    el.className = 'xt-notify-card xt-notify-in';

    var av = D.createElement('div');
    av.className = 'xt-notify-av';
    var initial = item.title ? item.title.charAt(0) : '息';
    av.appendChild(D.createTextNode(initial));
    el.appendChild(av);

    var body = D.createElement('div');
    body.className = 'xt-notify-body';

    var t = D.createElement('div');
    t.className = 'xt-notify-title';
    t.appendChild(D.createTextNode(item.title || '新消息'));
    body.appendChild(t);

    if (item.text) {
      var x = D.createElement('div');
      x.className = 'xt-notify-text';
      x.appendChild(D.createTextNode(item.text));
      body.appendChild(x);
    }
    el.appendChild(body);

    var closeBtn = D.createElement('div');
    closeBtn.className = 'xt-notify-x';
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.appendChild(D.createTextNode('×'));
    closeBtn.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      dismiss(item);
    };
    el.appendChild(closeBtn);

    el.onclick = function () {
      dismiss(item);
      if (item.peerId !== null && item.peerId !== undefined) openChat(item.peerId, item.title, item.avatar);
    };

    host.appendChild(el);
    item.el = el;
    live.push(item);
    // 下一帧去掉 in 类，触发滑入过渡
    setTimeout(function () {
      try { el.className = 'xt-notify-card'; } catch (e) { /* 忽略 */ }
    }, 16);
    schedule(item);
  }

  /**
   * 【R72-5】原生通知出口：有安卓桥就走系统横幅，无桥/报错则静默（页内 toast 照旧）。
   * 便于测试：window.xtNativeNotify(title,text) 直接调用此逻辑。title 空 → 「星途」，text 截断 100 字。
   */
  function emitNative(title, text) {
    try {
      var t = str(title);
      if (!t) t = '星途';
      var x = str(text);
      if (x.length > 100) x = x.slice(0, 100);
      var br = W.AndroidBridge;
      if (br && typeof br.notify === 'function') {
        try { br.notify(t, x); } catch (e1) { /* 原生调用失败：忽略，页内仍弹 */ }
      }
      return { title: t, text: x };
    } catch (e2) { return null; }
  }

  /**
   * 弹一条通知。
   * msg: { senderId/peerId, senderName/nickname/name, avatar, text/content/last }
   * peerId 为空 → 纯提示卡（不可点击跳转）。
   */
  function push(msg) {
    try {
      var m = msg || {};
      var peerId = (m.senderId !== null && m.senderId !== undefined) ? m.senderId : m.peerId;
      if (peerId !== null && peerId !== undefined) {
        // 正在跟对方聊天：不打扰
        if (W.currentChatUserId !== null && W.currentChatUserId !== undefined
          && String(peerId) === String(W.currentChatUserId)) return;
        // 私聊页自己渲染顶端通知条：本层不抢
        if (W.__xtChatTransportActive === true) return;
      }
      var name = str(m.senderName || m.nickname || m.name);
      if (!name) name = (peerId !== null && peerId !== undefined) ? ('用户' + peerId) : '提示';
      var text = str((m.text !== null && m.text !== undefined) ? m.text
        : ((m.content !== null && m.content !== undefined) ? m.content : m.last));
      // R72-5：先走原生系统横幅（有 AndroidBridge 时），页内 toast 行为完全保留
      emitNative(name, text);
      var item = {
        peerId: (peerId === undefined) ? null : peerId,
        title: name,
        text: text.slice(0, 120),
        avatar: str(m.avatar || m.avatarUrl)
      };
      if (live.length < MAX_LIVE) mount(item);
      else queue.push(item);
    } catch (e) { /* 通知失败绝不影响主流程 */ }
  }

  /** 轻提示：优先复用全站 toast，避免同时出现两套提示 */
  function toast(msg, state) {
    var text = str(msg);
    if (!text) return;
    try {
      if (typeof W.xtToast === 'function') { W.xtToast(state || 'info', text); return; }
    } catch (e) { /* 落下一个 */ }
    try {
      if (typeof W.showToast === 'function') { W.showToast(text); return; }
    } catch (e2) { /* 落到自建卡片 */ }
    push({ senderName: '提示', text: text });
  }

  /* ---------------- 未读红点 ---------------- */

  function applyBadge(node, n, label) {
    var b = null;
    try { b = node.querySelector ? node.querySelector('.xt-unread-badge') : null; } catch (e) { b = null; }
    if (n <= 0) {
      if (b && b.parentNode) b.parentNode.removeChild(b);
      return;
    }
    if (!b) {
      b = D.createElement('span');
      b.className = 'xt-unread-badge';
      node.appendChild(b);
    }
    b.textContent = label;
    var needPos = true;
    try {
      if (W.getComputedStyle) needPos = (W.getComputedStyle(node).position === 'static');
    } catch (e2) { needPos = true; }
    if (needPos) node.style.position = 'relative';
  }

  /** 给「消息 / 好友 / 互动」入口注入未读红点；n<=0 时移除 */
  function setUnread(n) {
    try {
      unread = num(n, 0);
      W.__xtUnread = unread;
      var label = unread > 99 ? '99+' : String(unread);
      var sels = [
        '.nav-item[onclick*="gotoChat"]',
        '.bottom-nav-item[onclick*="gotoChat"]',
        '.nav-item[data-page="friends"]',
        '.nav-item[data-page="chat"]'
      ];
      for (var s = 0; s < sels.length; s++) {
        var nodes = D.querySelectorAll(sels[s]);
        if (!nodes) continue;
        for (var i = 0; i < nodes.length; i++) applyBadge(nodes[i], unread, label);
      }
    } catch (e) { /* 静默 */ }
  }

  /* ---------------- 跳转 ---------------- */
  function openChat(uid, name, avatar) {
    if (uid === null || uid === undefined || String(uid) === '') return;
    try {
      if (typeof W.imOpenChatWithUser === 'function') {
        W.imOpenChatWithUser(uid, name || '', avatar || '');
        return;
      }
    } catch (e) { /* 落到深链 */ }
    try {
      location.href = '私聊.html?uid=' + encodeURIComponent(String(uid))
        + '&name=' + encodeURIComponent(str(name));
    } catch (e2) { /* 静默 */ }
  }

  /* ---------------- 数据源 1：本地 IM 存档 ---------------- */
  function localSnapshot() {
    var total = 0;
    var news = [];
    var data = readJSON(lsk(STORE_KEY));
    if (!data) return { total: 0, news: news };

    eachIn(data.chats, function (c, k) {
      var n = num(c && c.unread, 0);
      total += n;
      var key = 'c' + k + ':' + n + ':' + str(c && c.lastId) + ':' + str(c && c.last);
      if (n > 0 && !seen[key]) {
        seen[key] = true;
        news.push({
          peerId: (c && c.serverId !== null && c.serverId !== undefined) ? c.serverId : k,
          senderName: str(c && (c.nickname || c.name)) || ('用户' + k),
          avatar: str(c && c.avatar),
          text: str(c && c.last)
        });
      }
    });

    eachIn(data.groups, function (g, k) {
      var n = num(g && g.unreadCount, 0);
      total += n;
      var lm = (g && g.lastMessage) ? g.lastMessage : null;
      var key = 'g' + k + ':' + n + ':' + str(lm && lm.id);
      if (n > 0 && !seen[key]) {
        seen[key] = true;
        news.push({
          peerId: 'g' + k,
          senderName: str(g && g.name) || ('群聊 ' + k),
          avatar: str(g && g.avatar),
          text: str(lm && ((lm.content !== null && lm.content !== undefined) ? lm.content : lm.text))
        });
      }
    });

    return { total: total, news: news };
  }

  /* ---------------- 数据源 2：后端未读（仅在无人接管时才开） ---------------- */
  function pollRemote(done) {
    if (remoteOff) { done(0, []); return; }
    if (W.__xtPollStarted === true || W.__xtChatTransportActive === true) {
      remoteOff = true;   // app.js R60 / 私聊页已在轮询：本层退场，杜绝重复弹窗
      done(0, []);
      return;
    }
    var tk = token();
    var base = apiBase();
    if (!tk || base === null || typeof W.fetch !== 'function') { done(0, []); return; }

    var opt = { headers: { 'Authorization': 'Bearer ' + tk } };
    try {
      W.fetch(base + ENDPOINT, opt).then(function (r) {
        if (!r || typeof r.json !== 'function') return null;
        return r.json();
      }).then(function (d) {
        if (!d) { done(0, []); return; }
        var items = (d.items && typeof d.items.length === 'number') ? d.items : [];
        var total = num(d.total, 0);
        var news = [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i] || {};
          var cnt = num(it.count, 0);
          if (cnt > total) total = cnt;
          var key = 'r' + str(it.peerId) + ':' + str(it.lastId);
          if (cnt > 0 && !seen[key]) {
            seen[key] = true;
            news.push({
              peerId: it.peerId,
              senderName: str(it.nickname || it.name) || ('用户' + str(it.peerId)),
              avatar: str(it.avatar),
              text: str(it.last)
            });
          }
        }
        done(total, news);
      })['catch'](function () { done(0, []); });
    } catch (e) { done(0, []); }
  }

  /* ---------------- 轮询主循环 ---------------- */
  function apply(total, news) {
    setUnread(total);
    if (!baseline) { baseline = true; return; }   // 首次只建基线，不补弹历史未读
    for (var i = 0; i < news.length; i++) push(news[i]);
  }

  function poll() {
    try {
      if (!visible()) return;
      var snap = localSnapshot();
      var total = snap.total;
      var news = snap.news;
      pollRemote(function (rTotal, rNews) {
        if (rTotal > total) total = rTotal;
        for (var i = 0; i < rNews.length; i++) news.push(rNews[i]);
        apply(total, news);
      });
    } catch (e) { /* 轮询异常绝不影响页面 */ }
  }

  function start(opts) {
    if (started) return false;
    if (W.__xtChatTransportActive === true) return false;  // 私聊页自己来
    started = true;
    try {
      if (opts) {
        var ms = num(opts.pollMs, 0);
        if (ms >= 1000) POLL_MS = ms;
      }
    } catch (e) { /* 保持默认 */ }
    poll();
    pollTimer = setInterval(poll, POLL_MS);
    if (D.addEventListener) {
      D.addEventListener('visibilitychange', function () {
        if (visible()) poll();
      }, false);
    }
    return true;
  }

  function stop() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    started = false;
  }

  function closeAll() {
    var arr = live.slice(0);
    for (var i = 0; i < arr.length; i++) dismiss(arr[i]);
    queue.length = 0;
  }

  function status() {
    return {
      started: started,
      live: live.length,
      queued: queue.length,
      unread: unread,
      remoteOff: remoteOff,
      baseline: baseline,
      pollMs: POLL_MS
    };
  }

  /* ---------------- 自启动 ---------------- */
  function boot() {
    try {
      if (D.readyState === 'loading') {
        D.addEventListener('DOMContentLoaded', function () { start(); }, false);
      } else {
        start();
      }
    } catch (e) {
      try { start(); } catch (e2) { /* 静默 */ }
    }
  }

  /* ---------------- 对外：全部守卫赋值，零全局声明冲突 ---------------- */
  if (typeof W.xtNotify !== 'object' || W.xtNotify === null) {
    W.xtNotify = {
      version: '1.0.0',
      push: push,
      toast: toast,
      unread: setUnread,
      start: start,
      stop: stop,
      status: status,
      open: openChat,
      closeAll: closeAll
    };
  }
  if (typeof W.xtNotifyMessage !== 'function') W.xtNotifyMessage = function (msg) { push(msg); };
  if (typeof W.xtSetUnread !== 'function') W.xtSetUnread = function (n) { setUnread(n); };
  if (typeof W.xtNotifyToast !== 'function') W.xtNotifyToast = function (msg, state) { toast(msg, state); };
  if (typeof W.xtNativeNotify !== 'function') W.xtNativeNotify = function (title, text) { return emitNative(title, text); };
  if (typeof W.xtNotifyOpen !== 'function') W.xtNotifyOpen = function (uid, name, avatar) { openChat(uid, name, avatar); };
  if (typeof W.xtNotifyStart !== 'function') W.xtNotifyStart = function (opts) { return start(opts); };
  if (typeof W.xtNotifyStop !== 'function') W.xtNotifyStop = function () { stop(); };
  if (typeof W.xtNotifyCloseAll !== 'function') W.xtNotifyCloseAll = function () { closeAll(); };
  if (!W.__xtNotifyReady) W.__xtNotifyReady = true;

  boot();
})();
