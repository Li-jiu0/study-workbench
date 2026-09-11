/* =====================================================================
   hotnews.js —— 时政热点 · 网络自动获取
   ---------------------------------------------------------------------
   从多个免费热点 API 自动获取最新议题，带 1 小时缓存，支持手动刷新。
   用法：openHotNewsPanel()
   依赖：无（纯前端，fetch + localStorage）
   ===================================================================== */
(function () {
  'use strict';
  if (window.__HOTNEWS__) return;
  window.__HOTNEWS__ = 1;

  var CACHE_KEY = 'study_workbench_hotnews';
  var CACHE_TTL = 60 * 60 * 1000; // 1 小时

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') { showToast(m); return; } if (typeof alert === 'function') alert(m); }

  // 统一网络请求：APK 环境用原生层 fetchUrl 绕过 CORS，浏览器环境用 fetch
  function nativeFetch(url) {
    if (window.AndroidBridge && typeof window.AndroidBridge.fetchUrl === 'function') {
      try {
        var text = window.AndroidBridge.fetchUrl(url);
        if (text && text.length > 0) {
          // 原生层错误回显
          if (text.indexOf('__ERROR__:') === 0) {
            return Promise.reject(new Error(text.substring(10)));
          }
          return Promise.resolve({
            ok: true, status: 200,
            json: function () {
              try {
                return Promise.resolve(JSON.parse(text));
              } catch (e) {
                // 解析失败时回显前 200 字符，方便排查
                var preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
                return Promise.reject(new Error('JSON解析失败，返回内容: ' + preview));
              }
            },
            text: function () { return Promise.resolve(text); }
          });
        }
      } catch (e) { /* 原生请求失败，降级到浏览器 fetch */ }
    }
    return fetch(url, { cache: 'no-store' });
  }

  // ===== 数据源：逐个尝试，第一个成功的用 =====
  // 每个源返回 {ok, items, source}，items = [{title, hot, url}]
  var SOURCES = [
    // 主源：星途后端聚合 —— 后端代理中新网 RSS（无 CORS 头，浏览器不能直连），
    // 逐条带真实原文 URL；后端不可用/报错时抛错，自然落入下方降级循环退到 60s 直连
    {
      name: '星途后端聚合',
      fetch: async function () {
        var api = (window.STUDY_API_BASE != null) ? window.STUDY_API_BASE : '';
        var res = await nativeFetch(api + '/api/news/daily');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var text = await res.text();
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('JSON解析失败，原始返回前200字: ' + text.substring(0, 200));
        }
        if (!data || data.ok !== true || !Array.isArray(data.items) || !data.items.length) {
          throw new Error('后端聚合源不可用或无数据');
        }
        var items = data.items.map(function (it) {
          // url 可能为 null（降级到 60s 的后端响应），统一归一为 '' 以兼容旧渲染/旧缓存
          return { title: (it && it.title) || '', hot: (it && it.hot) || '', url: (it && it.url) || '' };
        }).filter(function (it) { return it.title; });
        if (!items.length) throw new Error('后端聚合源条目为空');
        var out = { ok: true, items: items.slice(0, 60), source: data.source || '星途后端聚合' };
        if (data.dailyLink) out.dailyLink = data.dailyLink;
        return out;
      }
    },
    // 降级源：60秒读懂世界（每天 60 条新闻，稳定可用，支持 CORS；逐条无链接）
    {
      name: '60秒读懂世界',
      fetch: async function () {
        var res = await nativeFetch('https://60s-api.viki.moe/v2/60s');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var text = await res.text();
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('JSON解析失败，原始返回前200字: ' + text.substring(0, 200));
        }
        var items = [];
        // 兼容多种返回格式
        var newsArr = null;
        if (data && data.data && Array.isArray(data.data.news)) newsArr = data.data.news;
        else if (data && Array.isArray(data.news)) newsArr = data.news;
        else if (data && Array.isArray(data.data)) newsArr = data.data;
        else if (data && Array.isArray(data.result)) newsArr = data.result;
        else if (Array.isArray(data)) newsArr = data;

        if (newsArr && newsArr.length) {
          newsArr.forEach(function (n) {
            // 元素可能是字符串，也可能是对象
            var t = (typeof n === 'string') ? n : (n && (n.title || n.news || n.content || n.text || '')) || '';
            if (t && t.trim()) items.push({ title: t.trim(), hot: '', url: '' });
          });
        }

        if (!items.length) {
          throw new Error('解析失败，未提取到新闻。返回结构: ' + JSON.stringify(data).substring(0, 200));
        }
        return { ok: true, items: items.slice(0, 60), source: '60秒读懂世界' };
      }
    }
  ];

  // ===== 缓存 =====
  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj.time || !obj.data) return null;
      if (Date.now() - obj.time > CACHE_TTL) return null;
      return obj;
    } catch (e) { return null; }
  }
  function setCache(data, source) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data: data, source: source }));
    } catch (e) { }
  }

  // ===== 获取热点（带缓存 + 多源降级） =====
  var fetching = false;
  async function fetchHotNews(forceRefresh) {
    if (!forceRefresh) {
      var cached = getCache();
      if (cached) return { ok: true, items: cached.data, source: cached.source, cached: true };
    }
    if (fetching) return { ok: false, msg: '正在获取中...' };
    fetching = true;
    var errors = [];
    for (var i = 0; i < SOURCES.length; i++) {
      try {
        var result = await SOURCES[i].fetch();
        if (result.ok && result.items.length) {
          setCache(result.items, result.source);
          fetching = false;
          var ret = { ok: true, items: result.items, source: result.source, cached: false };
          // dailyLink（微信早报整期链接）只随本次新鲜抓取透传，不写入缓存（缓存形状保持不变）
          if (result.dailyLink) ret.dailyLink = result.dailyLink;
          return ret;
        }
      } catch (e) {
        errors.push(SOURCES[i].name + ': ' + e.message);
      }
    }
    fetching = false;
    // 所有源都失败，尝试用过期缓存
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var old = JSON.parse(raw);
        if (old.data && old.data.length) {
          return { ok: true, items: old.data, source: old.source + '（缓存）', cached: true, stale: true };
        }
      }
    } catch (e) { }
    return { ok: false, msg: '所有热点源均不可用：' + errors.join('；') + '。请检查网络连接，或稍后重试。' };
  }

  // ===== UI =====
  function ensureCss() {
    if (document.getElementById('hnStyle')) return;
    var css = '.hn-mask{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:2400;display:flex;align-items:center;justify-content:center;padding:16px}.hn-box{background:var(--card);color:var(--text);width:min(720px,100%);max-height:90vh;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px -18px rgba(0,0,0,.4)}.hn-head{display:flex;align-items:center;gap:8px;padding:12px 16px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff}.hn-head b{flex:1;font-size:16px}.hn-refresh{background:rgba(255,255,255,.18);border:none;color:#fff;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:13px}.hn-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer}.hn-body{overflow-y:auto;padding:12px 16px;flex:1}.hn-item{display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;align-items:flex-start}.hn-item:hover{background:var(--primary-light)}.hn-rank{width:24px;height:24px;border-radius:6px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}.hn-rank.top1{background:#FF4D4F;color:#fff}.hn-rank.top2{background:#FA8C16;color:#fff}.hn-rank.top3{background:#FADB14;color:#333}.hn-title{flex:1;font-size:14px;line-height:1.5;min-width:0}.hn-hot{font-size:11px;color:var(--text-secondary);flex-shrink:0;white-space:nowrap}.hn-empty{text-align:center;padding:40px 16px;color:var(--text-secondary);font-size:14px}.hn-loading{text-align:center;padding:40px 16px;color:var(--text-secondary)}.hn-spinner{display:inline-block;width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:hn-spin .8s linear infinite;margin-bottom:12px}@keyframes hn-spin{to{transform:rotate(360deg)}}.hn-foot{padding:8px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center}.hn-switch{background:none;border:1px solid var(--border);color:var(--text-secondary);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px}.hn-daily{color:var(--primary);text-decoration:none;margin-right:auto;margin-left:10px}';
    var st = document.createElement('style'); st.id = 'hnStyle'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  }

  function closeHN() { var m = document.getElementById('hnMask'); if (m) m.remove(); }

  function renderList(items, source, stale, dailyLink) {
    var box = document.getElementById('hnBody');
    if (!box) return;
    if (!items || !items.length) {
      box.innerHTML = '<div class="hn-empty">暂无热点数据</div>';
      return;
    }
    var html = items.map(function (it, i) {
      var rankCls = i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : '';
      var title = esc(it.title);
      var hot = it.hot ? esc(String(it.hot)) : '';
      var url = it.url ? ' data-url="' + esc(it.url) + '"' : '';
      return '<div class="hn-item"' + url + '>' +
        '<div class="hn-rank' + rankCls + '">' + (i + 1) + '</div>' +
        '<div class="hn-title">' + title + '</div>' +
        (hot ? '<div class="hn-hot">' + hot + '</div>' : '') +
        '</div>';
    }).join('');
    box.innerHTML = html;
    // 点击条目打开链接
    box.querySelectorAll('.hn-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var url = el.getAttribute('data-url');
        if (url) {
          try { window.open(url, '_blank'); } catch (e) { location.href = url; }
        }
      });
    });
    // 底部信息（dailyLink 存在时追加「今日早报全文」链接；无则与原样完全一致）
    var foot = document.getElementById('hnFoot');
    if (foot) {
      var timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      var footHtml = '<span>来源：' + esc(source) + (stale ? '（过期缓存）' : '') + ' · 更新于 ' + timeStr + '</span>';
      if (dailyLink) {
        footHtml += '<a class="hn-daily" href="' + esc(dailyLink) + '" target="_blank" rel="noopener">📰 今日早报全文</a>';
      }
      footHtml += '<button class="hn-switch" onclick="closeHN();if(typeof openMiniQuiz===\'function\')openMiniQuiz(\'exam-politics\')">切换到题库模式</button>';
      foot.innerHTML = footHtml;
    }
  }

  async function loadAndRender(forceRefresh) {
    var box = document.getElementById('hnBody');
    if (box) box.innerHTML = '<div class="hn-loading"><div class="hn-spinner"></div><div>正在获取最新热点...</div></div>';
    var result = await fetchHotNews(forceRefresh);
    if (result.ok) {
      renderList(result.items, result.source, result.stale, result.dailyLink);
    } else {
      if (box) box.innerHTML = '<div class="hn-empty">⚠️ ' + esc(result.msg || '获取失败') + '</div>';
    }
  }

  function openHotNewsPanel() {
    ensureCss();
    // 关闭已存在的
    var old = document.getElementById('hnMask');
    if (old) old.remove();
    var m = document.createElement('div'); m.id = 'hnMask'; m.className = 'hn-mask';
    m.innerHTML = '<div class="hn-box">' +
      '<div class="hn-head"><b>🔥 时政热点 · 实时</b>' +
      '<button class="hn-refresh" id="hnRefresh">🔄 刷新</button>' +
      '<button class="hn-x" onclick="closeHN()">✕</button></div>' +
      '<div class="hn-body" id="hnBody"></div>' +
      '<div class="hn-foot" id="hnFoot"></div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeHN(); });
    // 刷新按钮
    var btn = document.getElementById('hnRefresh');
    if (btn) btn.addEventListener('click', function () { loadAndRender(true); });
    // 加载数据
    loadAndRender(false);
  }

  window.openHotNewsPanel = openHotNewsPanel;
  window.closeHN = closeHN;
  window.fetchHotNews = fetchHotNews;
})();
