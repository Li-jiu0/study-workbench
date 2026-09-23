/* =========================================================================
   assets/xt-announce.js —— 普通用户侧「全站公告」展示 + 未读提醒（星途）
   -------------------------------------------------------------------------
   引入方（仅这两个页面）：
     1) 学习工作台.html：首页内容区顶部 #xtAnnBanner 横幅（最新一条公告 +
        「查看全部(N)」+ 关闭）。无公告时容器保持空、不占位。
     2) 更多.html：新增「公告」入口（#xtAnnEntryDot 未读红点），点击打开弹层。

   后端契约（由 R170-A 落地）：
     GET  {BASE}/api/announcements      -> {items:[{id,title,content,createdAt}],
                                            latestAt:"YYYY-MM-DD HH:MM:SS"|"", unread:bool}
                                           （需登录；只返回已上线最近 20 条，倒序）
     POST {BASE}/api/announcements/read -> {ok:true, annReadAt}
                                           （需登录；把已读水位线推进到最新公告时间）

   设计要点：
     · 复用 assets/api.js 的 window.api()（自动带 Authorization 令牌 + 401 静默刷新），
       本文件不自己拼 fetch 与令牌；未登录（isOnlineSession() 为假）→ 直接静默跳过。
     · 公告是附属功能：401/403/网络失败一律静默（仅 console 记录），绝不弹错误 toast，
       不影响首页 / 更多页主流程。
     · 横幅「关闭」只写 sessionStorage，仅本次会话隐藏，下次会话未读仍会提示。
     · 时间显示用字符串截取分级（今天 HH:MM / MM-DD HH:MM / YYYY-MM-DD），
       不用 new Date() 解析 'YYYY-MM-DD HH:MM:SS'（老 WebView / Safari 解析不一致）。
     · 来自服务端的文本一律 esc() 转义后再拼进 innerHTML；正文 white-space:pre-wrap。

   兼容性：纯 ES5（无 let/const、箭头函数、模板字符串、可选链、async/await）；
           不使用 CSS clamp()/min()/max()；固定定位遮罩自接安全区（--xt-satop）。
   ========================================================================= */
(function () {
  'use strict';

  if (window.XTANN) {
    return;  // 防重复注入
  }

  var API_LIST = '/api/announcements';
  var API_READ = '/api/announcements/read';
  var SS_BANNER_CLOSED = 'xt_ann_banner_closed';
  var STYLE_ID = 'xtAnnStyle';
  var MODAL_ID = 'xtAnnModal';
  var LONG_CONTENT_LEN = 90;  // 超过该长度才显示「展开全文」

  var state = {
    items: [],
    latestAt: '',
    unread: false,
    loaded: false
  };

  var modalEl = null;
  var scrollLockPrev = null;

  /* ------------------------------ 基础工具 ------------------------------ */

  function $(id) { return document.getElementById(id); }

  /** 统一转义来自服务端的文本（内容安全：任何外部文本都不得直插 innerHTML）。 */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 静默记录：只写 console.warn，绝不弹 toast（公告是附属功能）。 */
  function logSilent(where, e) {
    try {
      if (window.console && console.warn) {
        console.warn('[XTANN] ' + where + ': ' + ((e && e.message) ? e.message : e));
      }
    } catch (e2) { /* 忽略 */ }
  }

  function ssGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function ssSet(key, val) {
    try { window.sessionStorage.setItem(key, val); } catch (e) { /* 存不了就退化成「每次都展示」 */ }
  }

  /* ------------------------------ 登录态 & 数据 ------------------------------ */

  /** 是否处于在线登录会话：优先复用 api.js 的 isOnlineSession()，缺失时按令牌自判。 */
  function loggedIn() {
    try {
      if (typeof window.isOnlineSession === 'function') {
        return !!window.isOnlineSession();
      }
      var t = '';
      if (typeof window.apiGetToken === 'function') { t = window.apiGetToken(); }
      var r = '';
      if (typeof window.apiRefreshToken === 'function') { r = window.apiRefreshToken(); }
      return !!(t || r);
    } catch (e) {
      return false;
    }
  }

  function normalizeData(d) {
    var items = (d && d.items && d.items.length) ? d.items : [];
    state.items = items;
    state.latestAt = (d && d.latestAt) ? String(d.latestAt) : '';
    // unread 缺省时按「有公告即未读」兜底（服务端契约里该字段必有，这里仅防御）
    state.unread = (d && typeof d.unread === 'boolean') ? d.unread : (items.length > 0);
  }

  /**
   * 拉取公告列表。cb 在「成功 / 失败 / 静默跳过」后都会且只会被调用一次。
   * 未登录 / 无 window.api / 网络异常 → 静默（视为空数据，不报错）。
   */
  function fetchAnnouncements(cb) {
    var done = (typeof cb === 'function') ? cb : function () {};
    if (!loggedIn()) { state.loaded = true; done(); return; }
    if (typeof window.api !== 'function') { state.loaded = true; done(); return; }

    var p;
    try {
      p = window.api(API_LIST);
    } catch (e) {
      logSilent('GET ' + API_LIST, e);  // 例如离线快速失败
      state.loaded = true;
      done();
      return;
    }
    if (!p || typeof p.then !== 'function') { state.loaded = true; done(); return; }

    p.then(function (d) {
      normalizeData(d);
      state.loaded = true;
      renderBanner();
      refreshBadge();
      done();
    }, function (e) {
      logSilent('GET ' + API_LIST, e);  // 401 / 403 / 网络失败：静默
      state.loaded = true;
      done();
    });
  }

  /** 把服务端已读水位线推进到最新公告时间（打开弹层时调用）。失败静默。 */
  function markRead() {
    if (!loggedIn() || typeof window.api !== 'function') { return; }
    var p;
    try {
      p = window.api(API_READ, { method: 'POST' });
    } catch (e) {
      logSilent('POST ' + API_READ, e);
      return;
    }
    if (p && typeof p.then === 'function') {
      p.then(function () { /* 服务端已推进，无需回写 */ }, function (e) {
        logSilent('POST ' + API_READ, e);  // 静默
      });
    }
  }

  /** 数据未就绪时先拉取，再回调（点击入口早于首屏请求完成时兜底）。 */
  function ensureData(cb) {
    if (state.loaded) { cb(); return; }
    fetchAnnouncements(function () { cb(); });
  }

  /* ------------------------------ 时间显示 ------------------------------ */

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 'YYYY-MM-DD HH:MM:SS' → 今天 HH:MM / MM-DD HH:MM / YYYY-MM-DD（纯字符串截取）。 */
  function fmtTime(s) {
    var raw = String(s === null || s === undefined ? '' : s);
    if (!raw) { return ''; }
    var sp = raw.indexOf(' ');
    var datePart = sp >= 0 ? raw.slice(0, sp) : raw;
    var timePart = sp >= 0 ? raw.slice(sp + 1) : '';
    var hm = timePart.length >= 5 ? timePart.slice(0, 5) : '';
    if (datePart === todayStr()) {
      return hm ? ('今天 ' + hm) : '今天';
    }
    var year = datePart.slice(0, 4);
    var curYear = String(new Date().getFullYear());
    if (year === curYear && datePart.length >= 10) {
      return datePart.slice(5) + (hm ? (' ' + hm) : '');
    }
    return datePart;
  }

  /* ------------------------------ 样式注入 ------------------------------ */

  function ensureStyle() {
    if ($(STYLE_ID)) { return; }
    var css =
      '.xt-ann-banner{position:relative;margin:0 0 14px;padding:12px 14px 12px 16px;' +
        'background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);' +
        'box-shadow:var(--shadow);}' +
      '.xt-ann-banner-main{display:flex;align-items:flex-start;gap:10px;cursor:pointer;' +
        'padding-right:22px;}' +
      '.xt-ann-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:#F43F35;' +
        'margin-top:6px;}' +
      '.xt-ann-flex{flex:1 1 auto;min-width:0;}' +
      '.xt-ann-banner-title{font-size:var(--xt-font-base);font-weight:600;color:var(--text);' +
        'line-height:1.4;word-break:break-word;}' +
      '.xt-ann-bold{font-weight:800;}' +
      '.xt-ann-banner-summary{margin-top:4px;font-size:var(--xt-font-xs);color:var(--text-secondary);' +
        'line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:hidden;' +
        'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;}' +
      '.xt-ann-banner-foot{margin-top:10px;display:flex;align-items:center;justify-content:space-between;' +
        'gap:10px;}' +
      '.xt-ann-more{font-size:var(--xt-font-xs);font-weight:700;color:var(--primary);' +
        'background:none;border:0;padding:0;cursor:pointer;}' +
      '.xt-ann-banner-close{position:absolute;top:4px;right:6px;width:26px;height:26px;' +
        'line-height:26px;text-align:center;border:0;background:none;color:var(--text-muted);' +
        'font-size:14px;cursor:pointer;padding:0;}' +
      '.xt-ann-overlay{padding-top:var(--xt-satop, env(safe-area-inset-top, 0px));' +
        'padding-bottom:env(safe-area-inset-bottom, 0px);box-sizing:border-box;}' +
      '.xt-ann-modal{max-width:440px;width:92%;max-height:82vh;overflow:hidden;padding:0;' +
        'display:flex;flex-direction:column;}' +
      '.xt-ann-modal-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;' +
        'gap:8px;padding:16px 16px 12px;border-bottom:1px solid var(--border);}' +
      '.xt-ann-modal-title{margin:0;display:flex;align-items:center;gap:6px;}' +
      '.xt-ann-modal-close{width:30px;height:30px;line-height:30px;text-align:center;border:0;' +
        'background:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:0;}' +
      '.xt-ann-list{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'padding:14px 16px 18px;}' +
      '.xt-ann-item{padding:12px 0 14px;border-bottom:1px solid var(--border);}' +
      '.xt-ann-item:last-child{border-bottom:0;}' +
      '.xt-ann-item-title{font-size:var(--xt-font-base);font-weight:700;color:var(--text);' +
        'line-height:1.45;word-break:break-word;}' +
      '.xt-ann-item-time{margin-top:3px;font-size:var(--xt-font-xs);color:var(--text-muted);}' +
      '.xt-ann-item-body{margin-top:8px;font-size:var(--xt-font-base);color:var(--text-secondary);' +
        'line-height:1.65;white-space:pre-wrap;word-break:break-word;}' +
      '.xt-ann-item-body.xt-ann-clamp{overflow:hidden;display:-webkit-box;' +
        '-webkit-box-orient:vertical;-webkit-line-clamp:4;}' +
      '.xt-ann-toggle{margin-top:6px;font-size:var(--xt-font-xs);font-weight:700;color:var(--primary);' +
        'background:none;border:0;padding:0;cursor:pointer;}' +
      '.xt-ann-empty{padding:22px 0;text-align:center;font-size:var(--xt-font-base);' +
        'color:var(--text-muted);}';
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(st);
  }

  /** 动态插入的 [data-icon] 需手动补渲染（icon-map.js 只在 DCL 自动渲染一次）。 */
  function renderIcons() {
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
    }
  }

  /* ------------------------------ 首页横幅 ------------------------------ */

  /** 关闭横幅：仅本次会话隐藏（写 sessionStorage），下次会话未读仍会提示。 */
  function bannerClose() {
    var items = state.items;
    if (items && items.length) {
      ssSet(SS_BANNER_CLOSED, String(items[0].id === null || items[0].id === undefined ? '' : items[0].id));
    }
    var host = $('xtAnnBanner');
    if (host) {
      host.style.display = 'none';
      host.innerHTML = '';
    }
  }

  function renderBanner() {
    var host = $('xtAnnBanner');
    if (!host) { return; }
    host.innerHTML = '';
    host.style.display = 'none';
    var items = state.items;
    if (!items || !items.length) { return; }  // 无公告：容器保持空、不占位

    var latest = items[0] || {};
    var latestId = String(latest.id === null || latest.id === undefined ? '' : latest.id);
    // 本次会话已点过关闭 → 不再展示（读取即隐藏，无需重渲染）
    if (ssGet(SS_BANNER_CLOSED) === latestId) { return; }

    var unread = !!state.unread;
    var dotAttr = unread ? '' : ' style="display:none"';
    var titleCls = 'xt-ann-banner-title' + (unread ? ' xt-ann-bold' : '');
    var html =
      '<div class="xt-ann-banner">' +
        '<button class="xt-ann-banner-close" id="xtAnnBannerClose" type="button" aria-label="关闭公告">✕</button>' +
        '<div class="xt-ann-banner-main" id="xtAnnBannerOpen" role="button" tabindex="0">' +
          '<span class="xt-ann-dot" id="xtAnnBannerDot"' + dotAttr + '></span>' +
          '<div class="xt-ann-flex">' +
            '<div class="' + titleCls + '" id="xtAnnBannerTitle">' + esc(latest.title || '公告') + '</div>' +
            '<div class="xt-ann-banner-summary">' + esc(latest.content || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="xt-ann-banner-foot">' +
          '<button class="xt-ann-more" id="xtAnnBannerMore" type="button">查看全部(' + items.length + ')</button>' +
          '<span class="xt-ann-item-time">' + esc(fmtTime(latest.createdAt)) + '</span>' +
        '</div>' +
      '</div>';
    host.innerHTML = html;
    host.style.display = '';

    var openBtn = $('xtAnnBannerOpen');
    if (openBtn) {
      openBtn.addEventListener('click', function () { open(); });
      openBtn.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    }
    var moreBtn = $('xtAnnBannerMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        open();
      });
    }
    var closeBtn = $('xtAnnBannerClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        bannerClose();
      });
    }
    renderIcons();
  }

  /**
   * 统一刷新「所有红点」：横幅红点 + 标题加粗 + 更多页入口红点。
   * 弹层打开（已读）后调用一次即可同时熄灭全部红点。
   */
  function refreshBadge() {
    var dot = $('xtAnnBannerDot');
    if (dot) { dot.style.display = state.unread ? '' : 'none'; }
    var title = $('xtAnnBannerTitle');
    if (title) {
      title.className = state.unread ? 'xt-ann-banner-title xt-ann-bold' : 'xt-ann-banner-title';
    }
    var entryDot = $('xtAnnEntryDot');
    if (entryDot) { entryDot.hidden = !state.unread; }
  }

  /* ------------------------------ 弹层（公告列表） ------------------------------ */

  function buildListHtml() {
    var items = state.items;
    if (!items || !items.length) {
      return '<div class="xt-ann-empty">暂无公告</div>';
    }
    var out = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var content = String(it.content === null || it.content === undefined ? '' : it.content);
      var isLong = content.length > LONG_CONTENT_LEN;
      out += '<div class="xt-ann-item">' +
        '<div class="xt-ann-item-title">' + esc(it.title || '公告') + '</div>' +
        '<div class="xt-ann-item-time">' + esc(fmtTime(it.createdAt)) + '</div>' +
        (content
          ? ('<div class="xt-ann-item-body' + (isLong ? ' xt-ann-clamp' : '') + '">' + esc(content) + '</div>' +
             (isLong ? '<button class="xt-ann-toggle" type="button" data-ann-toggle="1">展开全文</button>' : ''))
          : '') +
        '</div>';
    }
    return out;
  }

  function wireListToggles() {
    var list = $('xtAnnList');
    if (!list) { return; }
    var btns = list.getElementsByTagName('button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-ann-toggle') === '1') {
        bindToggle(btns[i]);
      }
    }
  }

  function bindToggle(btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentNode;
      var body = item ? item.querySelector('.xt-ann-item-body') : null;
      if (!body) { return; }
      var clamped = body.className.indexOf('xt-ann-clamp') >= 0;
      if (clamped) {
        body.className = body.className.replace(/\s*xt-ann-clamp/, '');
        btn.textContent = '收起';
      } else {
        body.className = body.className + ' xt-ann-clamp';
        btn.textContent = '展开全文';
      }
    });
  }

  function ensureModal() {
    if (modalEl && modalEl.parentNode) { return modalEl; }
    modalEl = $(MODAL_ID);
    if (modalEl) { return modalEl; }
    modalEl = document.createElement('div');
    modalEl.id = MODAL_ID;
    modalEl.className = 'modal-overlay xt-ann-overlay';
    modalEl.innerHTML =
      '<div class="modal xt-ann-modal" role="dialog" aria-modal="true" aria-label="全站公告">' +
        '<div class="xt-ann-modal-head">' +
          '<div class="modal-title xt-ann-modal-title">' +
            '<span class="nav-icon" data-icon="bell" data-icon-size="18"></span> 全站公告</div>' +
          '<button class="xt-ann-modal-close" id="xtAnnModalClose" type="button" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="xt-ann-list" id="xtAnnList"></div>' +
      '</div>';
    document.body.appendChild(modalEl);
    modalEl.addEventListener('click', function (ev) {
      if (ev.target === modalEl) { close(); }  // 点遮罩关闭
    });
    var closeBtn = $('xtAnnModalClose');
    if (closeBtn) { closeBtn.addEventListener('click', function () { close(); }); }
    return modalEl;
  }

  function lockScroll() {
    try {
      scrollLockPrev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';  // 弹层期间页面滚动不穿透
    } catch (e) { /* 忽略 */ }
  }

  function unlockScroll() {
    try { document.body.style.overflow = (scrollLockPrev === null ? '' : scrollLockPrev); }
    catch (e) { /* 忽略 */ }
    scrollLockPrev = null;
  }

  /** 打开公告弹层：列表全部公告 → 立即清红点 → POST 推进服务端已读水位线。 */
  function open() {
    ensureData(function () {
      var overlay = ensureModal();
      var list = $('xtAnnList');
      if (list) {
        list.innerHTML = buildListHtml();
        wireListToggles();
      }
      overlay.classList.add('active');
      var scroller = $('xtAnnList');
      if (scroller) { scroller.scrollTop = 0; }
      lockScroll();
      renderIcons();
      // 打开即视为已读：本地立即清红点（含更多页入口），再静默推进服务端水位线
      state.unread = false;
      refreshBadge();
      markRead();
    });
  }

  function close() {
    var overlay = $(MODAL_ID);
    if (overlay) { overlay.classList.remove('active'); }
    unlockScroll();
  }

  /* ------------------------------ 页面自启动 ------------------------------ */

  function boot() {
    try {
      var host = $('xtAnnBanner');
      var entryDot = $('xtAnnEntryDot');
      if (!host && !entryDot) { return; }  // 本页无公告 UI
      ensureStyle();
      if (host) { host.style.display = 'none'; }  // 取到数据前不占位（失败路径也保持不占位）
      if (!host && entryDot) { entryDot.hidden = true; }  // 默认隐藏，等数据判定
      if (!loggedIn()) { return; }  // 未登录：静默跳过（横幅保持空、红点保持隐藏）
      fetchAnnouncements();
    } catch (e) {
      logSilent('boot', e);  // 初始化异常也静默，不影响主流程
    }
  }

  /* ------------------------------ 对外暴露 ------------------------------ */

  window.XTANN = {
    open: open,
    close: close,
    refreshBadge: refreshBadge,
    reload: function (cb) { state.loaded = false; fetchAnnouncements(cb); },
    getState: function () {
      return {
        items: state.items,
        latestAt: state.latestAt,
        unread: state.unread,
        loaded: state.loaded
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
