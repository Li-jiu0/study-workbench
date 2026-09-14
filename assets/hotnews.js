/* =====================================================================
   hotnews.js —— 时政热点 · 网络自动获取 + 独立页渲染器
   ---------------------------------------------------------------------
   【ADR-3 2026-09-15】原实现用全屏遮罩弹窗（#hnMask / .hn-box）承载热点
   列表，属于「内容资产用弹窗承载」，违规。现改为：
     · 数据层（SOURCES / 缓存 / fetchHotNews）原样保留；
     · 渲染层宿主换为独立页 时政热点.html 的页面内容器，无遮罩、无弹窗；
     · openHotNewsPanel() 降级为「跳转兼容入口」，不再创建任何弹窗。
   用法：时政热点.html 内自动 mount()；外部入口调 openHotNewsPanel() 跳转。
   依赖：无（纯前端，fetch + localStorage）
   ===================================================================== */
(function () {
  'use strict';
  if (window.__HOTNEWS__) return;
  window.__HOTNEWS__ = 1;

  var CACHE_KEY = 'study_workbench_hotnews';
  var CACHE_TTL = 60 * 60 * 1000; // 1 小时
  var SEEN_KEY = 'study_workbench_hotnews_seen';  // id -> 首次收录时间戳
  var FAV_KEY = 'study_workbench_hotnews_fav';    // 收藏快照数组
  var PAGE = '时政热点.html';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) {
    try { if (typeof window.xtToast === 'function') { window.xtToast('info', m); return; } } catch (e) { /* 继续兜底 */ }
    try { if (typeof showToast === 'function') { showToast(m); return; } } catch (e) { /* 继续兜底 */ }
    var t = document.getElementById('toast');
    if (t) {
      t.textContent = m;
      t.style.transform = 'translateX(-50%) translateY(0)';
      setTimeout(function () { t.style.transform = 'translateX(-50%) translateY(-100px)'; }, 2000);
    }
  }

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

  /* =====================================================================
     独立页渲染层（宿主：时政热点.html）
     核心内容全部走页面内布局，仅保留 ADR-3 允许的「删除二次确认」轻弹层
     ===================================================================== */

  var CATS = ['时政', '经济', '科技', '民生', '国际', '社会', '文体'];
  var CAT_KW = {
    '时政': ['政治局', '国务院', '常委会', '全国人大', '政协', '总书记', '主席', '总理', '部长', '省委', '市委', '政府', '部署', '印发', '条例', '法规', '督查', '巡视', '代表', '委员', '外交', '访问', '会晤', '会谈', '联合声明', '白皮书', '座谈会'],
    '经济': ['经济', 'GDP', '增长', '市场', '金融', '银行', '利率', '股市', 'A股', '投资', '消费', '贸易', '关税', '出口', '进口', '汇率', '财政', '税收', '降准', '企业', '产业', '制造', '房地产', '楼市', '就业', '物价', '油价', '营收', '上市', 'IPO', '基金', '订单'],
    '科技': ['科技', '航天', '卫星', '火箭', '飞船', '探测器', '芯片', '半导体', '人工智能', '大模型', '算力', '量子', '数字', '5G', '6G', '机器人', '新能源', '电池', '光伏', '科研', '院士', '发射', '操作系统', '无人机', '技术', '互联网'],
    '民生': ['民生', '教育', '高考', '中考', '学校', '教师', '医疗', '医院', '医保', '养老', '社保', '退休', '住房', '公积金', '食品', '药品', '交通', '地铁', '高铁', '航班', '补贴', '收入', '工资', '燃气', '供暖', '学生'],
    '国际': ['国际', '全球', '世界', '联合国', '美国', '美方', '俄罗斯', '俄方', '乌克兰', '欧盟', '欧洲', '日本', '韩国', '朝鲜', '印度', '以色列', '巴勒斯坦', '伊朗', '澳大利亚', '加拿大', '巴西', '非洲', '东南亚', '外长', '制裁', '停火', '维和', '峰会'],
    '社会': ['事故', '坍塌', '火灾', '地震', '暴雨', '台风', '洪涝', '干旱', '预警', '气温', '救援', '失联', '案件', '通报', '调查', '处罚', '查处', '立案', '判决', '审判', '抓获', '谣言', '辟谣', '监管', '抽检', '召回', '安全'],
    '文体': ['奥运', '亚运', '世界杯', '赛事', '冠军', '联赛', '运动员', '电影', '票房', '演唱会', '演出', '文艺', '文化', '文物', '考古', '博物馆', '旅游', '景区', '非遗', '春晚', '开幕', '闭幕', '球队']
  };

  function hnHash(s) {
    var h = 5381, str = String(s || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function hnIdOf(it) { return 'hn_' + hnHash(it && it.title); }
  function hnCatOf(it) {
    var t = String((it && it.title) || ''), i, j, kws;
    for (i = 0; i < CATS.length; i++) {
      kws = CAT_KW[CATS[i]] || [];
      for (j = 0; j < kws.length; j++) {
        if (t.indexOf(kws[j]) >= 0) return CATS[i];
      }
    }
    return '其他';
  }
  function hnHotNum(it) {
    var raw = String((it && it.hot) || '');
    var n = parseFloat(raw.replace(/[^\d.]/g, ''));
    if (!isFinite(n)) return -1;
    if (raw.indexOf('万') >= 0) n *= 10000;
    return n;
  }

  /* ---------- localStorage：收录时间 / 收藏 ---------- */
  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return (v === null || v === undefined) ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  function hnMarkSeen(items) {
    var m = lsGet(SEEN_KEY, {}), now = Date.now(), i;
    if (!m || typeof m !== 'object') m = {};
    for (i = 0; i < items.length; i++) {
      var id = hnIdOf(items[i]);
      if (!m[id]) m[id] = now;
    }
    lsSet(SEEN_KEY, m);
    return m;
  }
  function hnSeenAt(id) { var m = lsGet(SEEN_KEY, {}) || {}; return Number(m[id]) || 0; }

  function hnFavs() { var a = lsGet(FAV_KEY, []); return Object.prototype.toString.call(a) === '[object Array]' ? a : []; }
  function hnSaveFavs(a) { lsSet(FAV_KEY, a); }
  function hnFavIndex(id) {
    var a = hnFavs(), i;
    for (i = 0; i < a.length; i++) if (a[i] && a[i].id === id) return i;
    return -1;
  }
  function hnIsFav(id) { return hnFavIndex(id) >= 0; }
  function hnToggleFav(it) {
    var a = hnFavs(), i = hnFavIndex(hnIdOf(it));
    if (i >= 0) { a.splice(i, 1); hnSaveFavs(a); return false; }
    a.unshift({
      id: hnIdOf(it), title: String(it.title || ''), hot: String(it.hot || ''),
      url: String(it.url || ''), cat: hnCatOf(it), at: Date.now()
    });
    hnSaveFavs(a);
    return true;
  }

  /* ---------- 状态 ---------- */
  var HN = {
    items: [], source: '', stale: false, dailyLink: '', updatedAt: 0,
    tab: 'list', cat: '全部', range: '全部', sort: 'rank', kw: '',
    curId: '', loading: false, mounted: false, errMsg: '', confirmCb: null
  };

  function hnIcons() {
    try { if (typeof window.lucideAutoRender === 'function') window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
  }
  function hnEl(id) { return document.getElementById(id); }

  function hnByID(id) {
    var i;
    for (i = 0; i < HN.items.length; i++) if (hnIdOf(HN.items[i]) === id) return HN.items[i];
    return null;
  }

  function hnFiltered() {
    var out = [], now = Date.now(), day = 86400000, i;
    var limits = { '今日': day, '近3天': 3 * day, '近7天': 7 * day };
    var lim = limits[HN.range] || 0;
    var kw = String(HN.kw || '').trim();
    for (i = 0; i < HN.items.length; i++) {
      var it = HN.items[i];
      if (HN.cat !== '全部' && hnCatOf(it) !== HN.cat) continue;
      if (lim) {
        var at = hnSeenAt(hnIdOf(it));
        if (!at || (now - at) > lim) continue;
      }
      if (kw && String(it.title || '').indexOf(kw) < 0) continue;
      out.push(it);
    }
    if (HN.sort === 'hot') {
      out.sort(function (a, b) { return hnHotNum(b) - hnHotNum(a); });
    } else if (HN.sort === 'time') {
      out.sort(function (a, b) { return hnSeenAt(hnIdOf(b)) - hnSeenAt(hnIdOf(a)); });
    }
    return out;
  }

  function hnRankCls(i) { return i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : ''; }
  function hnFmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 视图切换 ---------- */
  function hnShow(v) {
    HN.tab = v;
    var map = { list: 'hnViewList', fav: 'hnViewFav', detail: 'hnViewDetail' };
    var k;
    for (k in map) {
      var el = hnEl(map[k]);
      if (el) el.style.display = (k === v) ? '' : 'none';
    }
    var tList = hnEl('hnTabList'), tFav = hnEl('hnTabFav');
    if (tList) tList.classList.toggle('active', v === 'list' || v === 'detail');
    if (tFav) tFav.classList.toggle('active', v === 'fav');
    if (v === 'list') hnRenderList();
    else if (v === 'fav') hnRenderFav();
    else hnRenderDetail();
  }

  /* ---------- 列表视图 ---------- */
  function hnChips(name, values, cur) {
    var html = '', i;
    for (i = 0; i < values.length; i++) {
      var val = values[i], label = val;
      if (Object.prototype.toString.call(val) === '[object Array]') { label = val[1]; val = val[0]; }
      html += '<span class="hn-chip' + (cur === val ? ' active' : '') + '" data-act="' + name + '" data-v="' + esc(val) + '">' + esc(label) + '</span>';
    }
    return html;
  }
  function hnRenderList() {
    var box = hnEl('hnListBody');
    if (!box) return;
    if (HN.loading) {
      box.innerHTML = '<div class="hn-loading"><div class="hn-spinner"></div><div>正在获取最新热点…</div></div>';
      hnIcons();
      return;
    }
    if (!HN.items.length) {
      box.innerHTML = '<div class="hn-empty">' +
        '<div class="hn-ei"><span class="nav-icon" data-icon="search" data-icon-size="42"></span></div>' +
        '<div class="hn-et">暂无热点数据</div>' +
        '<div class="hn-ed">' + esc(HN.errMsg || '点「刷新」重新获取，或稍后再试。') + '</div></div>';
      hnIcons();
      hnRenderFoot();
      return;
    }
    var list = hnFiltered(), i, rows = '';
    for (i = 0; i < list.length; i++) {
      var it = list[i], id = hnIdOf(it), fav = hnIsFav(id);
      rows += '<div class="hn-item">' +
        '<div class="hn-rank' + hnRankCls(i) + '">' + (i + 1) + '</div>' +
        '<div class="hn-main">' +
        '<div class="hn-title" data-act="open" data-id="' + esc(id) + '">' + esc(it.title) + '</div>' +
        '<div class="hn-meta">' +
        '<span class="tag tag-primary">' + esc(hnCatOf(it)) + '</span>' +
        (it.hot ? '<span class="tag tag-warning">' + esc(it.hot) + '</span>' : '') +
        '<span class="hn-time">收录 ' + esc(hnFmtTime(hnSeenAt(id))) + '</span>' +
        '</div></div>' +
        '<div class="hn-ops">' +
        '<button class="hn-mini' + (fav ? ' on' : '') + '" type="button" data-act="fav" data-id="' + esc(id) + '">' +
        '<span class="nav-icon" data-icon="star" data-icon-size="14"></span>' + (fav ? '已收藏' : '收藏') + '</button>' +
        (it.url ? '<button class="hn-mini" type="button" data-act="src" data-id="' + esc(id) + '">' +
          '<span class="nav-icon" data-icon="globe" data-icon-size="14"></span>原文</button>' : '') +
        '<button class="hn-mini" type="button" data-act="open" data-id="' + esc(id) + '">' +
        '<span class="nav-icon" data-icon="chevron-right" data-icon-size="14"></span>详情</button>' +
        '</div></div>';
    }
    if (!rows) {
      rows = '<div class="hn-empty">' +
        '<div class="hn-ei"><span class="nav-icon" data-icon="search" data-icon-size="40"></span></div>' +
        '<div class="hn-et">没有符合条件的热点</div>' +
        '<div class="hn-ed">换个分类或时间范围试试</div></div>';
    }
    box.innerHTML =
      '<div class="hn-filters">' +
      '<div class="hn-row"><span class="hn-lab">分类</span><div class="hn-chips">' +
      hnChips('f-cat', ['全部'].concat(CATS, ['其他']), HN.cat) + '</div></div>' +
      '<div class="hn-row"><span class="hn-lab">时间</span><div class="hn-chips">' +
      hnChips('f-range', ['全部', '今日', '近3天', '近7天'], HN.range) + '</div></div>' +
      '<div class="hn-row"><span class="hn-lab">排序</span><div class="hn-chips">' +
      hnChips('f-sort', [['rank', '榜序'], ['hot', '热度'], ['time', '收录时间']], HN.sort) + '</div>' +
      '<span class="hn-count">共 ' + list.length + ' 条 / 全部 ' + HN.items.length + ' 条</span></div>' +
      '</div>' +
      '<div class="hn-list">' + rows + '</div>';
    hnIcons();
    hnRenderFoot();
  }

  function hnRenderFoot() {
    var foot = hnEl('hnFoot');
    if (!foot) return;
    var html = '<span class="hn-src">来源：' + esc(HN.source || '—') + (HN.stale ? '（过期缓存）' : '') +
      ' · 更新于 ' + esc(hnFmtTime(HN.updatedAt)) + '</span>';
    if (HN.dailyLink) {
      html += '<a class="hn-daily" href="' + esc(HN.dailyLink) + '" target="_blank" rel="noopener">' +
        '<span class="nav-icon" data-icon="rss" data-icon-size="14"></span>今日早报全文</a>';
    }
    html += '<button class="hn-switch" type="button" data-act="quiz">' +
      '<span class="nav-icon" data-icon="clipboard" data-icon-size="14"></span>切换到题库模式</button>';
    foot.innerHTML = html;
    hnIcons();
  }

  /* ---------- 收藏视图 ---------- */
  function hnRenderFav() {
    var box = hnEl('hnFavBody');
    if (!box) return;
    var favs = hnFavs(), i, html = '';
    if (!favs.length) {
      html = '<div class="hn-empty">' +
        '<div class="hn-ei"><span class="nav-icon" data-icon="star" data-icon-size="42"></span></div>' +
        '<div class="hn-et">还没有收藏</div>' +
        '<div class="hn-ed">在热点列表点「收藏」，之后即使热点下榜也能在这里回看。</div>' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="go-list">去热点榜</button></div>';
    } else {
      html = '<div class="hn-favbar"><span class="hn-count">共 ' + favs.length + ' 条收藏</span>' +
        '<button class="btn btn-outline btn-sm" type="button" data-act="clear-fav">清空收藏</button></div>';
      for (i = 0; i < favs.length; i++) {
        var f = favs[i] || {};
        html += '<div class="hn-fav">' +
          '<div class="hn-main">' +
          '<div class="hn-title" data-act="fav-open" data-id="' + esc(f.id) + '">' + esc(f.title) + '</div>' +
          '<div class="hn-meta"><span class="tag tag-primary">' + esc(f.cat || '其他') + '</span>' +
          (f.hot ? '<span class="tag tag-warning">' + esc(f.hot) + '</span>' : '') +
          '<span class="hn-time">收藏 ' + esc(hnFmtTime(f.at)) + '</span></div>' +
          '</div>' +
          '<div class="hn-ops">' +
          (f.url ? '<button class="hn-mini" type="button" data-act="fav-src" data-id="' + esc(f.id) + '">' +
            '<span class="nav-icon" data-icon="globe" data-icon-size="14"></span>原文</button>' : '') +
          '<button class="hn-mini" type="button" data-act="fav-copy" data-id="' + esc(f.id) + '">' +
          '<span class="nav-icon" data-icon="clipboard" data-icon-size="14"></span>复制</button>' +
          '<button class="hn-mini" type="button" data-act="fav-del" data-id="' + esc(f.id) + '">' +
          '<span class="nav-icon" data-icon="trash" data-icon-size="14"></span>删除</button>' +
          '</div></div>';
      }
    }
    box.innerHTML = html;
    hnIcons();
  }

  /* ---------- 详情视图（页面内二级区域，非弹窗） ---------- */
  function hnClauses(title) {
    var parts = String(title || '').split(/[，,。；;：:！!？?、]/);
    var out = [], i;
    for (i = 0; i < parts.length; i++) {
      var t = String(parts[i] || '').trim();
      if (t.length >= 4) out.push(t);
    }
    return out;
  }
  function hnRenderDetail() {
    var box = hnEl('hnDetailBody');
    if (!box) return;
    var it = hnByID(HN.curId);
    if (!it) {
      box.innerHTML = '<div class="hn-empty"><div class="hn-et">这条热点已不在当前榜单</div>' +
        '<button class="btn btn-outline btn-sm" type="button" data-act="go-list">返回热点榜</button></div>';
      hnIcons();
      return;
    }
    var idx = -1, i;
    for (i = 0; i < HN.items.length; i++) if (hnIdOf(HN.items[i]) === HN.curId) idx = i;
    var id = HN.curId, fav = hnIsFav(id);
    var clauses = hnClauses(it.title);

    var rel = '', n = 0;
    for (i = 0; i < HN.items.length && n < 5; i++) {
      var o = HN.items[i];
      if (hnIdOf(o) === id) continue;
      if (hnCatOf(o) !== hnCatOf(it)) continue;
      n++;
      rel += '<div class="hn-rel" data-act="open" data-id="' + esc(hnIdOf(o)) + '">' +
        '<span class="hn-rel-rk">' + n + '</span><span class="hn-rel-t">' + esc(o.title) + '</span></div>';
    }
    if (!rel) rel = '<div class="hn-ed">当前榜单里没有同分类的其他热点。</div>';

    box.innerHTML =
      '<div class="hn-dhead">' +
      '<span class="hn-back" data-act="go-list"><span class="nav-icon" data-icon="arrow-left" data-icon-size="18"></span> 返回热点榜</span>' +
      '<div class="hn-dtitle">热点详情</div>' +
      '<button class="btn ' + (fav ? 'btn-secondary' : 'btn-outline') + ' btn-sm" type="button" data-act="fav-here" data-id="' + esc(id) + '">' +
      '<span class="nav-icon" data-icon="star" data-icon-size="14"></span> ' + (fav ? '取消收藏' : '收藏') + '</button>' +
      '</div>' +
      '<div class="hn-dwrap">' +
      '<div class="hn-dmain">' +
      '<div class="hn-dtags">' +
      '<span class="hn-rank' + hnRankCls(idx) + '">' + (idx >= 0 ? idx + 1 : '—') + '</span>' +
      '<span class="tag tag-primary">' + esc(hnCatOf(it)) + '</span>' +
      (it.hot ? '<span class="tag tag-warning">热度 ' + esc(it.hot) + '</span>' : '') +
      '<span class="tag">首次收录 ' + esc(hnFmtTime(hnSeenAt(id))) + '</span>' +
      '</div>' +
      '<h2 class="hn-dh2">' + esc(it.title) + '</h2>' +
      '<div class="hn-dsec"><div class="hn-dsub"><span class="nav-icon" data-icon="file-text" data-icon-size="16"></span>标题要点</div>' +
      (clauses.length >= 2
        ? '<ol class="hn-dol">' + clauses.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>'
        : '<div class="hn-box">这条热点是单句标题，要点即标题本身；有原文链接时可直接查看完整报道。</div>') +
      '</div>' +
      '<div class="hn-dsec"><div class="hn-dsub"><span class="nav-icon" data-icon="tag" data-icon-size="16"></span>相关热点（同分类）</div>' +
      '<div class="hn-rellist">' + rel + '</div></div>' +
      '</div>' +
      '<div class="hn-dside">' +
      '<div class="hn-box"><b>数据来源</b><br>' + esc(HN.source || '—') + (HN.stale ? '（过期缓存）' : '') +
      '<br><span class="hn-time">更新于 ' + esc(hnFmtTime(HN.updatedAt)) + '</span></div>' +
      '<div class="hn-dacts">' +
      '<button class="btn btn-primary btn-sm" type="button" data-act="d-src" data-id="' + esc(id) + '"' + (it.url ? '' : ' disabled') + '>' +
      '<span class="nav-icon" data-icon="globe" data-icon-size="14"></span> ' + (it.url ? '打开原文' : '无原文链接') + '</button>' +
      '<button class="btn btn-outline btn-sm" type="button" data-act="d-copy" data-id="' + esc(id) + '">' +
      '<span class="nav-icon" data-icon="clipboard" data-icon-size="14"></span> 复制标题</button>' +
      '<button class="btn btn-outline btn-sm" type="button" data-act="d-prev">' +
      '<span class="nav-icon" data-icon="chevron-left" data-icon-size="14"></span> 上一条</button>' +
      '<button class="btn btn-outline btn-sm" type="button" data-act="d-next">下一条 ' +
      '<span class="nav-icon" data-icon="chevron-right" data-icon-size="14"></span></button>' +
      '</div>' +
      '<div class="hn-box"><b>怎么用</b><br>时政热点常作为申论材料与面试话题的背景。遇到高频议题，' +
      '可回到「申论刷题 · 阅读积累」把规范表述存进积累本。</div>' +
      '</div></div>';
    hnIcons();
  }

  function hnNeighbor(step) {
    if (!HN.items.length) return;
    var idx = -1, i;
    for (i = 0; i < HN.items.length; i++) if (hnIdOf(HN.items[i]) === HN.curId) idx = i;
    if (idx < 0) { toast('这条热点已不在榜单'); return; }
    idx += step;
    if (idx < 0) { toast('已经是第一条'); return; }
    if (idx >= HN.items.length) { toast('已经是最后一条'); return; }
    HN.curId = hnIdOf(HN.items[idx]);
    hnShow('detail');
  }

  /* ---------- 数据加载 ---------- */
  function hnApply(items, source, stale, dailyLink) {
    HN.items = items || [];
    HN.source = source || '';
    HN.stale = !!stale;
    HN.dailyLink = dailyLink || '';
    HN.updatedAt = Date.now();
    HN.errMsg = '';
    hnMarkSeen(HN.items);
  }
  async function hnLoad(force) {
    if (HN.loading) return;
    HN.loading = true;
    HN.errMsg = '';
    hnShow(HN.tab);
    var res = await fetchHotNews(force);
    HN.loading = false;
    if (res && res.ok) hnApply(res.items, res.source, res.stale, res.dailyLink);
    else { HN.items = []; HN.errMsg = (res && res.msg) ? res.msg : '获取失败'; }
    hnShow(HN.tab);
  }

  /* ---------- 复制 / 打开原文 ---------- */
  function hnCopy(text) {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('已复制'); }, function () { hnCopyFallback(text); });
        return;
      }
    } catch (e) { /* 继续兜底 */ }
    hnCopyFallback(text);
  }
  function hnCopyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      toast(ok ? '已复制' : '复制失败，请手动选择文本');
    } catch (e) { toast('复制失败，请手动选择文本'); }
  }
  function hnOpenUrl(url) {
    if (!url) { toast('这条热点没有原文链接'); return; }
    try { if (window.open(url, '_blank')) return; } catch (e) { /* 继续兜底 */ }
    try { location.href = url; } catch (e2) { toast('无法打开链接'); }
  }

  /* ---------- ADR-3 允许的唯一轻弹层：删除二次确认 ---------- */
  function hnConfirm(title, msg, okText, cb) {
    HN.confirmCb = cb;
    var ov = hnEl('hnConfirmOv'), t = hnEl('hnConfirmTitle'), m = hnEl('hnConfirmMsg'), ok = hnEl('hnConfirmOk');
    if (t) t.textContent = title;
    if (m) m.textContent = msg;
    if (ok) ok.textContent = okText || '确定';
    if (ov) ov.classList.add('on');
  }
  function hnCloseConfirm() {
    var ov = hnEl('hnConfirmOv');
    if (ov) ov.classList.remove('on');
    HN.confirmCb = null;
  }

  /* ---------- 事件委托 ---------- */
  function hnResolve(e) {
    var node = e.target;
    while (node && node !== document) {
      if (node.getAttribute) {
        var a = node.getAttribute('data-act');
        if (a) return { el: node, act: a };
      }
      node = node.parentNode;
    }
    return { el: null, act: null };
  }
  function hnFavById(id) {
    var a = hnFavs(), i;
    for (i = 0; i < a.length; i++) if (a[i] && a[i].id === id) return a[i];
    return null;
  }
  function hnOnClick(e) {
    var r = hnResolve(e);
    if (!r.el) return;
    var el = r.el, act = r.act;
    var id = el.getAttribute('data-id') || '';
    var v = el.getAttribute('data-v') || '';
    var it = hnByID(id);
    switch (act) {
      case 'tab':
        hnShow(v); break;
      case 'refresh':
        hnLoad(true); break;
      case 'f-cat':
        HN.cat = v; hnRenderList(); break;
      case 'f-range':
        HN.range = v; hnRenderList(); break;
      case 'f-sort':
        HN.sort = v; hnRenderList(); break;
      case 'open':
        HN.curId = id; hnShow('detail'); break;
      case 'go-list':
        hnShow('list'); break;
      case 'fav':
        if (!it) break;
        toast(hnToggleFav(it) ? '已收藏' : '已取消收藏');
        hnRenderList(); break;
      case 'fav-here':
        if (!it) break;
        toast(hnToggleFav(it) ? '已收藏' : '已取消收藏');
        hnRenderDetail(); break;
      case 'src':
      case 'd-src':
        if (it) hnOpenUrl(it.url); break;
      case 'quiz':
        try {
          if (typeof openMiniQuiz === 'function') { openMiniQuiz('exam-politics'); break; }
        } catch (err) { /* 继续兜底 */ }
        toast('题库模式暂不可用'); break;
      case 'fav-open': {
        var f = hnFavById(id);
        if (!f) { toast('这条收藏已失效'); break; }
        if (hnByID(id)) HN.curId = id;
        else HN.items.unshift({ title: f.title, hot: f.hot, url: f.url });
        HN.curId = id;
        hnShow('detail');
        break;
      }
      case 'fav-src': {
        var g = hnFavById(id);
        if (g) hnOpenUrl(g.url);
        break;
      }
      case 'fav-copy': {
        var h = hnFavById(id);
        if (h) hnCopy(h.title);
        break;
      }
      case 'fav-del':
        hnConfirm('删除这条收藏？', '删除后不可恢复。', '删除', function () {
          var a = hnFavs(), i;
          for (i = 0; i < a.length; i++) {
            if (a[i] && a[i].id === id) { a.splice(i, 1); break; }
          }
          hnSaveFavs(a);
          toast('已删除');
          hnRenderFav();
        });
        break;
      case 'clear-fav':
        hnConfirm('清空全部收藏？', '将删除所有已收藏热点，删除后不可恢复。', '清空', function () {
          hnSaveFavs([]);
          toast('已清空收藏');
          hnRenderFav();
        });
        break;
      case 'd-copy':
        if (it) hnCopy(it.title); break;
      case 'd-prev':
        hnNeighbor(-1); break;
      case 'd-next':
        hnNeighbor(1); break;
      case 'confirm-cancel':
        hnCloseConfirm(); break;
      default:
        break;
    }
  }

  /* ---------- mount ---------- */
  function mount() {
    if (HN.mounted) return;
    if (!document.getElementById('hnListBody')) return;
    HN.mounted = true;

    document.addEventListener('click', hnOnClick);
    document.addEventListener('input', function (e) {
      var r = hnResolve(e);
      if (!r.el || r.act !== 'search') return;
      HN.kw = r.el.value || '';
      if (HN.tab === 'list') hnRenderList();
    });

    var ok = hnEl('hnConfirmOk');
    if (ok) {
      ok.addEventListener('click', function () {
        var cb = HN.confirmCb;
        hnCloseConfirm();
        if (typeof cb === 'function') cb();
      });
    }
    var ov = hnEl('hnConfirmOv');
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) hnCloseConfirm(); });

    var tt = hnEl('topbarTitle');
    if (tt) tt.textContent = '时政热点';

    hnLoad(false);
  }

  /* ---------- 兼容入口：原弹窗函数降级为跳转（不再创建任何弹窗） ---------- */
  function openHotNewsPanel() {
    try { location.href = encodeURI(PAGE); return; } catch (e) { /* 继续兜底 */ }
    try { location.href = PAGE; } catch (e2) { /* 忽略 */ }
  }

  window.fetchHotNews = fetchHotNews;
  window.openHotNewsPanel = openHotNewsPanel;
  window.HotNews = {
    fetch: fetchHotNews,
    mount: mount,
    classify: hnCatOf,
    idOf: hnIdOf,
    favorites: hnFavs,
    page: PAGE
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})();
