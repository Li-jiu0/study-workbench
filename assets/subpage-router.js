/*!
 * assets/subpage-router.js —— 批次五 T02（寇豆码，2026-09-12）
 * 文档：docs/增量架构设计-图标与交互-2026-09-12.md §3.1
 * 运行：作为 <script src="assets/subpage-router.js?v=20260915b"></script> 在
 *   app.js / config.js / api.js 之后加载（铁律 8）。
 * 暴露：window.SubpageRouter（init / navigate / back / getCurrent / getParams / onSubpageChange）
 * 铁律约束：
 *   - 纯 JS，零 fetch；
 *   - file:// 直开支持（无 host 时不依赖 location.origin）；
 *   - hashchange + popstate 协调：popstate 后浏览器已更新 hash，hashchange 也会触发；
 *     用 _popping 标志避免重复 push 栈。
 */
(function () {
  'use strict';

  // ---------- hash 解析 / 序列化 ----------
  function parseHash(h) {
    h = String(h || '').replace(/^#/, '');
    var qi = h.indexOf('?');
    var key = qi >= 0 ? h.slice(0, qi) : h;
    var params = {};
    if (qi >= 0) {
      var qs = h.slice(qi + 1);
      if (qs) {
        qs.split('&').forEach(function (kv) {
          if (!kv) return;
          var eq = kv.indexOf('=');
          var k = eq >= 0 ? kv.slice(0, eq) : kv;
          var v = eq >= 0 ? kv.slice(eq + 1) : '';
          try { params[decodeURIComponent(k)] = decodeURIComponent(v); }
          catch (e) { params[k] = v; }
        });
      }
    }
    return { key: key, params: params };
  }

  function serializeParams(p) {
    if (!p) return '';
    var keys = Object.keys(p).filter(function (k) { return p[k] !== undefined && p[k] !== null; });
    if (!keys.length) return '';
    return keys.map(function (k) {
      var v = p[k];
      if (typeof v === 'object') v = JSON.stringify(v);
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(v));
    }).join('&');
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 路由状态 ----------
  function Router() { this._stack = []; this._popping = false; this._cb = null; this._state = null; }

  Router.prototype.init = function (opts) {
    opts = opts || {};
    var rootSelector = opts.rootSelector || 'body';
    var defaultSubpage = opts.defaultSubpage || 'list';
    var sectionsSelector = opts.sectionsSelector || '[data-subpage]';
    var breadcrumbSelector = opts.breadcrumbSelector || '.subpage-header';
    var pageTitle = opts.pageTitle || '';
    var rootHref = opts.rootHref || (function () {
      // 默认从 pageTitle 推断（设置/个人中心）
      return pageTitle === '设置' ? '设置.html'
           : pageTitle === '个人中心' ? '个人中心.html'
           : '#';
    })();

    var root = document.querySelector(rootSelector);
    if (!root) { if (window.console) console.warn('SubpageRouter.init: root not found', rootSelector); return; }

    var validKeys = {};
    var sects = root.querySelectorAll(sectionsSelector);
    for (var i = 0; i < sects.length; i++) {
      var k = sects[i].getAttribute('data-subpage');
      if (k) validKeys[k] = true;
    }
    validKeys[defaultSubpage] = true; // 'list' 视为合法兜底

    this._state = {
      rootSelector: rootSelector,
      root: root,
      defaultSubpage: defaultSubpage,
      sectionsSelector: sectionsSelector,
      breadcrumbSelector: breadcrumbSelector,
      pageTitle: pageTitle,
      rootHref: rootHref,
      validKeys: validKeys
    };

    // 初次渲染：依据当前 hash
    var init = parseHash(location.hash);
    var initKey = init.key && validKeys[init.key] ? init.key : defaultSubpage;
    this._render(initKey, init.params, true);

    // 监听
    var self = this;
    window.addEventListener('hashchange', function () { self._onHashChange(); });
    window.addEventListener('popstate', function () { self._popping = true; });
  };

  Router.prototype.navigate = function (key, params) {
    if (!this._state) { if (window.console) console.warn('SubpageRouter.navigate: not initialized'); return; }
    var st = this._state;
    // list / defaultSubpage 走 replaceState（不入栈）
    if (key === 'list' || key === st.defaultSubpage) {
      if (location.hash) {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      }
      this._render('list', null, false);
      return;
    }
    if (!st.validKeys[key]) {
      if (window.console) console.warn('SubpageRouter.navigate: unknown key, fallback to', st.defaultSubpage, key);
      this.navigate(st.defaultSubpage);
      return;
    }
    var qs = params ? serializeParams(params) : '';
    var newHash = '#' + key + (qs ? '?' + qs : '');
    if (location.hash === newHash) {
      this._render(key, params || {}, false);
      return;
    }
    this._popping = false;
    // 直接 push 兜底（jsdom 等环境下 hashchange 可能不同步触发；_render 内部有 last===key 去重）
    if (this._stack[this._stack.length - 1] !== key) this._stack.push(key);
    location.hash = newHash; // 触发 hashchange → _onHashChange → _render（去重后不重复 push）
  };

  Router.prototype.back = function () {
    if (window.history && history.back) history.back();
  };

  Router.prototype.getCurrent = function () {
    if (!this._state) return null;
    var p = parseHash(location.hash);
    return p.key && this._state.validKeys[p.key] ? p.key : this._state.defaultSubpage;
  };

  Router.prototype.getParams = function () {
    return parseHash(location.hash).params || {};
  };

  Router.prototype.onSubpageChange = function (cb) {
    this._cb = (typeof cb === 'function') ? cb : null;
  };

  // ---------- 内部 ----------
  Router.prototype._onHashChange = function () {
    if (!this._state) return;
    var p = parseHash(location.hash);
    var key = p.key && this._state.validKeys[p.key] ? p.key : this._state.defaultSubpage;
    var isPopping = this._popping;
    this._popping = false;
    this._render(key, p.params, isPopping);
  };

  Router.prototype._render = function (key, params, isPopping) {
    var st = this._state;
    if (!st) return;
    var root = st.root;

    // 隐藏所有 section
    var sects = root.querySelectorAll(st.sectionsSelector);
    for (var i = 0; i < sects.length; i++) sects[i].style.display = 'none';

    // 第一层分组卡列表（class="subpage-list"）
    var subpageList = root.querySelector('.subpage-list');

    var isList = (key === 'list' || key === st.defaultSubpage);
    if (isList) {
      if (subpageList) subpageList.style.display = '';
      this._renderBreadcrumb(null);
    } else {
      // 显示所有 data-subpage 等于 key 的 section（允许多个 section 同 key）
      for (var j = 0; j < sects.length; j++) {
        if (sects[j].getAttribute('data-subpage') === key) sects[j].style.display = '';
      }
      if (subpageList) subpageList.style.display = 'none';
      this._renderBreadcrumb(key);
    }

    // 栈：navigate 主动切（非 pop、非 init）且非 list 时 push
    if (!isPopping && !isList) {
      if (this._stack[this._stack.length - 1] !== key) this._stack.push(key);
    }
    // pop 到 list 时把栈清空（保持简单）
    if (isPopping && isList) this._stack = [];

    if (this._cb) {
      try { this._cb(key, params || {}); } catch (e) { if (window.console) console.warn('SubpageRouter onChange cb error', e); }
    }
  };

  Router.prototype._renderBreadcrumb = function (key) {
    var st = this._state;
    if (!st) return;
    var bc = st.root.querySelector(st.breadcrumbSelector);
    if (!bc) return;
    if (!key) {
      bc.style.display = 'none';
      bc.innerHTML = '';
      return;
    }
    bc.style.display = '';
    var label = this._groupLabel(key);
    bc.innerHTML =
      '<a class="subpage-crumb" href="' + escHtml(st.rootHref) + '" onclick="event.preventDefault();SubpageRouter.navigate(\'list\');return false;">' + escHtml(st.pageTitle) + '</a>' +
      '<span class="subpage-sep">›</span>' +
      '<span class="subpage-crumb current">' + escHtml(label) + '</span>';
  };

  Router.prototype._groupLabel = function (key) {
    var map = {
      appearance: '外观',
      account: '账号与安全',
      privacy: '隐私与安全',
      content: '发贴与学习',
      ai: 'AI 模型',
      about: '数据与关于',
      reading: '阅读与界面',
      voice: '语音与朗读',
      help: '帮助与反馈',
      profile: '个人资料',
      posts: '发贴统计',
      moments: '我的动态',
      prefs: '学习偏好',
      'local-data': '本机数据'
    };
    return map[key] || key;
  };

  // 单例
  window.SubpageRouter = new Router();
})();