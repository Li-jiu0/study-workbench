/* =====================================================================
   xt-content.js · 星途「做真内容」通用内容页基建（R48 / T00 / 20260914e）
   ---------------------------------------------------------------------
   定位：第 1 批（T10 企业定向库 / T11 模板骨架 / T12 设计课堂）共用契约层。
   约束（架构 ADR-1 / ADR-2 + 项目铁律）：
     1. 零框架、零 CDN、零构建；ES5 语法为主（不用箭头函数 / 可选链 / 空值合并），
        兼容老 WebView 与 file:// 直开。
     2. 只写自己的 localStorage 键（统一前缀 xtc:），「绝不调用 saveData()」（铁律 8）。
     3. 图标一律走 icon-map.js：lucideIcon(name,size) 内联，或 data-icon + lucideAutoRender；
        禁 mask / filter / symbol / use，禁 emoji。
     4. 不依赖 mini.js / app.js 的任何渲染函数；app.js 缺失时可降级运行。
   ---------------------------------------------------------------------
   ★ API 签名清单（T10/T11/T12 三条并行线请严格按此调用，变更需走 T00 冻结流程）

   基本工具
     XTC.esc(s)                       -> string        HTML 转义；null/undefined -> ''
     XTC.icon(name, size)             -> string        返回 <span class="nav-icon" data-icon=..>SVG</span>
     XTC.renderIcons(rootEl)          -> void          对 rootEl(默认 document) 重扫 data-icon
     XTC.lsKeySafe(k)                 -> string        typeof window.lsKey==='function' ? lsKey(k) : k
     XTC.credit(text)                 -> string        版权/免责行 HTML（缺省文案见 DEFAULT_CREDIT）

   存储（内部自动 lsKeySafe + JSON 容错，异常全部吞掉并返回缺省值）
     XTC.storage.get(key, def)        -> any           key 为已带 xtc: 前缀的原始键，def 默认 null
     XTC.storage.set(key, val)        -> boolean       写成功 true
     XTC.storage.del(key)             -> void

   进度 / 收藏（key = 模块键，如 'exam-company'；id = 条目 ASCII id，如 'sgcc'）
       实际落盘：映射键 xtc:learn:<key> / xtc:fav:<key>  -> {id:1,...}
                 镜像键 xtc:learn:<key>:<id> / xtc:fav:<key>:<id> -> '1'（双写，读取取或，兼容两种约定）
     XTC.readProgress(key)            -> Object        {sgcc:1,...}，永不返回 null
     XTC.readFav(key)                 -> Object        {sgcc:1,...}
     XTC.isLearned(key, id)           -> boolean
     XTC.setLearned(key, id, on)      -> boolean       显式置位，返回新状态
     XTC.markLearned(key, id)         -> boolean       「切换」已学标记，返回新状态（再次调用即取消）
     XTC.isFav(key, id)               -> boolean
     XTC.toggleFav(key, id)           -> boolean       切换收藏，返回新状态（true=已收藏）
     XTC.progress(key, idList)        -> {done,total,pct}  给进度条用；idList 为全部条目 id 数组
     XTC.saveQuizBest(key, id, correct, total) -> void  仅当刷新纪录才写 xtc:quiz:<key>:<id>
     XTC.readQuizBest(key, id)        -> {best,total,ts}|null

   视图注册表（ADR-2：宿主页只预埋一次，业务只注册不碰 HTML）
     XTC.registerView(regName, id, fn)     -> void     window[regName][id] = fn；fn(slotEl)
     XTC.dispatchView(regName, id, slotEl) -> boolean  命中则清空 slot 并 fn(slot)，返回 true；
                                                       未命中/缺参/fn 抛错 返回 false（由宿主页回退旧逻辑）
     XTC.hasView(regName, id)         -> boolean
     例：XTC.registerView('PPTV2', 'ppt-templates', function (slot) {…})

   UI 组件（均直接写入 el.innerHTML；el 为空则静默返回）
     XTC.hero(el, cfg)                -> void   cfg:{icon,title,sub,tags:[],credit}
     XTC.progressBar(el, cfg)         -> void   cfg:{done,total,label,fav,key}
     XTC.tabs(el, tabs, activeId, onSwitch) -> void
                                                 tabs:[{id,label,count}]；onSwitch(id)
     XTC.sectionsHtml(sections)       -> string  sections:[{h,body}] -> 小节 HTML 串
     XTC.listHtml(arr, cls)           -> string  string[] -> <ul>/<li> HTML 串
     XTC.empty(el, text)              -> void
     XTC.renderQuiz(slotEl, quizArr, opts) -> {el,total,answered,correct,reset()}
                                                 quizArr:[{q,o:[4],a:0,x:'解析'}]
                                                 opts:{title,bestKey,bestId,onDone(correct,total),
                                                       showAnalysis=true,credit}
                                                 交互：点选项即判分 + 展开解析 x；全部答完出成绩条 + 重做

   样式：本文件自带 injectStyle()，class 前缀统一 xt-，无需外部 CSS 文件（规避打包脚本改造）。
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 常量 */
  var P_LEARN = 'xtc:learn:';
  var P_FAV = 'xtc:fav:';
  var P_QUIZ = 'xtc:quiz:';
  var DEFAULT_CREDIT = '原创整理 · 非官方考纲，以当年招聘公告为准';
  var STYLE_ID = 'xtc-inline-style';
  var VERSION = '1.0.0';

  /* ---------------------------------------------------------------- 基础工具 */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function lsKeySafe(k) {
    try {
      if (typeof window.lsKey === 'function') return window.lsKey(k);
    } catch (e) { /* 忽略，退回原始键 */ }
    return k;
  }

  /** 图标：优先内联 lucideIcon；icon-map 未加载时退化为空的 data-icon 占位（后续可补扫） */
  function icon(name, size) {
    if (!name) return '';
    var s = parseInt(size, 10);
    if (!s || s <= 0) s = 18;
    var inner = '';
    if (typeof window.lucideIcon === 'function') {
      try { inner = window.lucideIcon(name, s); } catch (e) { inner = ''; }
    }
    return '<span class="nav-icon" data-icon="' + esc(name) + '" data-icon-size="' + s + '">' + inner + '</span>';
  }

  /** 对动态插入的节点补渲染图标（icon-map.js 暴露 lucideAutoRender） */
  function renderIcons(rootEl) {
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); return; } catch (e) { /* 继续本地兜底 */ }
    }
    var scope = rootEl || document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    var nodes = scope.querySelectorAll('[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var n = el.getAttribute('data-icon');
      var sz = parseInt(el.getAttribute('data-icon-size') || '20', 10);
      if (typeof window.lucideIcon === 'function') {
        el.innerHTML = window.lucideIcon(n, sz);
      }
    }
  }

  function credit(text) {
    return '<div class="xt-credit">' + esc(text || DEFAULT_CREDIT) + '</div>';
  }

  /* ---------------------------------------------------------------- 存储 */
  var storage = {
    get: function (key, def) {
      var fallback = (def === undefined) ? null : def;
      try {
        var raw = localStorage.getItem(lsKeySafe(key));
        if (raw === null || raw === '') return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try {
        localStorage.setItem(lsKeySafe(key), JSON.stringify(val));
        return true;
      } catch (e) { return false; }
    },
    del: function (key) {
      try { localStorage.removeItem(lsKeySafe(key)); } catch (e) { /* 忽略 */ }
    }
  };

  /* ------------------------------------------------- 进度 / 收藏（双写 + 或读） */
  function readProgress(key) {
    var map = storage.get(P_LEARN + key, {});
    if (!map || typeof map !== 'object') map = {};
    return map;
  }

  function readFav(key) {
    var map = storage.get(P_FAV + key, {});
    if (!map || typeof map !== 'object') map = {};
    return map;
  }

  function isLearned(key, id) {
    if (!id) return false;
    var map = readProgress(key);
    if (map[id]) return true;
    return storage.get(P_LEARN + key + ':' + id, '') === 1;
  }

  function isFav(key, id) {
    if (!id) return false;
    var map = readFav(key);
    if (map[id]) return true;
    return storage.get(P_FAV + key + ':' + id, '') === 1;
  }

  function setLearned(key, id, on) {
    if (!id) return false;
    var flag = !!on;
    var map = readProgress(key);
    if (flag) map[id] = 1; else delete map[id];
    storage.set(P_LEARN + key, map);
    if (flag) storage.set(P_LEARN + key + ':' + id, 1);
    else storage.del(P_LEARN + key + ':' + id);
    return flag;
  }

  /** 切换语义：已学 -> 取消；未学 -> 置为已学。返回切换后的状态。 */
  function markLearned(key, id) {
    return setLearned(key, id, !isLearned(key, id));
  }

  function toggleFav(key, id) {
    if (!id) return false;
    var next = !isFav(key, id);
    var map = readFav(key);
    if (next) map[id] = 1; else delete map[id];
    storage.set(P_FAV + key, map);
    if (next) storage.set(P_FAV + key + ':' + id, 1);
    else storage.del(P_FAV + key + ':' + id);
    return next;
  }

  function progress(key, idList) {
    var list = idList || [];
    var total = list.length, done = 0, i;
    for (i = 0; i < list.length; i++) {
      if (isLearned(key, list[i])) done++;
    }
    return { done: done, total: total, pct: total ? Math.round(done * 100 / total) : 0 };
  }

  function saveQuizBest(key, id, correct, total) {
    if (!key || !id) return;
    var prev = readQuizBest(key, id);
    if (prev && typeof prev.best === 'number' && prev.best >= correct) return;
    storage.set(P_QUIZ + key + ':' + id, { best: correct, total: total, ts: Date.now() });
  }

  function readQuizBest(key, id) {
    if (!key || !id) return null;
    var v = storage.get(P_QUIZ + key + ':' + id, null);
    if (!v || typeof v !== 'object') return null;
    return v;
  }

  /* ---------------------------------------------------------------- 视图注册表 */
  function regNameOk(name) {
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
  }

  function registerView(regName, id, fn) {
    if (!regNameOk(regName) || !id || typeof fn !== 'function') return;
    if (!window[regName] || typeof window[regName] !== 'object') window[regName] = {};
    window[regName][id] = fn;
  }

  function hasView(regName, id) {
    if (!regNameOk(regName) || !id) return false;
    var reg = window[regName];
    return !!(reg && typeof reg[id] === 'function');
  }

  /**
   * 分发：命中则清空 slotEl 并 fn(slotEl)。
   * @return {boolean} true=已由 V2 渲染；false=未命中或异常（宿主页应回退旧逻辑）
   */
  function dispatchView(regName, id, slotEl) {
    if (!hasView(regName, id) || !slotEl) return false;
    var fn = window[regName][id];
    try {
      slotEl.innerHTML = '';
      fn(slotEl);
      renderIcons(slotEl);
      return true;
    } catch (e) {
      if (window.console && console.error) {
        console.error('[XTC.dispatchView] ' + regName + '[' + id + '] 渲染失败，回退旧逻辑', e);
      }
      XTC.lastError = e;
      return false;
    }
  }

  /* ---------------------------------------------------------------- UI 组件 */
  function hero(el, cfg) {
    if (!el) return;
    var c = cfg || {};
    var tags = c.tags || [];
    var tagHtml = '';
    var i;
    for (i = 0; i < tags.length; i++) {
      tagHtml += '<span class="tag tag-primary">' + esc(tags[i]) + '</span>';
    }
    el.innerHTML =
      '<div class="xt-hero">' +
      (c.icon ? '<div class="xt-hero-icon">' + icon(c.icon, 22) + '</div>' : '') +
      '<div class="xt-hero-main">' +
      '<div class="xt-hero-title">' + esc(c.title || '') + '</div>' +
      (c.sub ? '<div class="xt-hero-sub">' + esc(c.sub) + '</div>' : '') +
      (tagHtml ? '<div class="xt-hero-tags">' + tagHtml + '</div>' : '') +
      '</div></div>' +
      (c.credit === false ? '' : credit(c.credit));
    renderIcons(el);
  }

  function progressBar(el, cfg) {
    if (!el) return;
    var c = cfg || {};
    var done = parseInt(c.done, 10) || 0;
    var total = parseInt(c.total, 10) || 0;
    var pct = total > 0 ? Math.round(done * 100 / total) : 0;
    var label = c.label || ('已完成 ' + done + ' / ' + total + ' 类');
    var favTxt = (c.fav === undefined || c.fav === null) ? '' : ' · 收藏 ' + c.fav;
    el.innerHTML =
      '<div class="xt-bar">' +
      '<div class="xt-bar-label"><span>' + esc(label) + '</span>' +
      '<span class="xt-bar-pct">' + pct + '%' + esc(favTxt) + '</span></div>' +
      '<div class="xt-bar-track"><div class="xt-bar-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
  }

  function tabs(el, tabsArr, activeId, onSwitch) {
    if (!el) return;
    var list = tabsArr || [];
    var html = '<div class="xt-tabs">';
    var i;
    for (i = 0; i < list.length; i++) {
      var t = list[i] || {};
      var on = (t.id === activeId) ? ' active' : '';
      var cnt = (t.count === undefined || t.count === null) ? '' : '<i>' + esc(t.count) + '</i>';
      html += '<div class="xt-tab' + on + '" data-xt-tab="' + esc(t.id) + '">' +
        esc(t.label) + cnt + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    var items = el.querySelectorAll('.xt-tab');
    for (i = 0; i < items.length; i++) {
      (function (node) {
        node.addEventListener('click', function () {
          var id = node.getAttribute('data-xt-tab');
          var all = el.querySelectorAll('.xt-tab');
          for (var k = 0; k < all.length; k++) all[k].classList.remove('active');
          node.classList.add('active');
          if (typeof onSwitch === 'function') onSwitch(id);
        });
      })(items[i]);
    }
  }

  function sectionsHtml(sections) {
    var list = sections || [];
    var html = '';
    var i;
    for (i = 0; i < list.length; i++) {
      var s = list[i] || {};
      html += '<section class="xt-sec">' +
        (s.h ? '<h4 class="xt-sec-h">' + esc(s.h) + '</h4>' : '') +
        '<div class="xt-sec-b">' + esc(s.body || '') + '</div>' +
        '</section>';
    }
    return html;
  }

  function listHtml(arr, cls) {
    var list = arr || [];
    if (!list.length) return '';
    var html = '<ul class="xt-list ' + esc(cls || '') + '">';
    var i;
    for (i = 0; i < list.length; i++) {
      html += '<li>' + esc(list[i]) + '</li>';
    }
    html += '</ul>';
    return html;
  }

  function empty(el, text) {
    if (!el) return;
    el.innerHTML = '<div class="xt-empty">' + esc(text || '暂无内容') + '</div>';
  }

  /* ---------------------------------------------------------------- 自测渲染 */
  var OPT_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /**
   * 渲染四选一自测并即时判分。
   * @param {HTMLElement} slotEl 容器
   * @param {Array} quizArr [{q,o:[...],a:0,x:'解析'}]
   * @param {Object} opts {title,bestKey,bestId,onDone(correct,total),showAnalysis,credit}
   * @return {Object} {el,total,answered,correct,reset()}
   */
  function renderQuiz(slotEl, quizArr, opts) {
    var o = opts || {};
    var quiz = quizArr || [];
    var handle = { el: slotEl, total: quiz.length, answered: 0, correct: 0, reset: function () { return renderQuiz(slotEl, quizArr, opts); } };
    if (!slotEl) return handle;
    if (!quiz.length) { slotEl.innerHTML = ''; return handle; }

    var showX = (o.showAnalysis === false) ? false : true;
    var title = o.title || '考点自测';
    var html = '<div class="xt-quiz">' +
      '<div class="xt-quiz-head"><span>' + icon('check', 16) + esc(title) + '</span>' +
      '<span class="xt-quiz-score">0 / ' + quiz.length + '</span></div>';
    var i, j;
    for (i = 0; i < quiz.length; i++) {
      var q = quiz[i] || {};
      var os = q.o || [];
      html += '<div class="xt-quiz-item" data-qi="' + i + '">' +
        '<div class="xt-quiz-q"><span class="xt-quiz-no">' + (i + 1) + '</span>' + esc(q.q || '') + '</div>' +
        '<div class="xt-quiz-opts">';
      for (j = 0; j < os.length; j++) {
        html += '<div class="xt-quiz-opt" data-oi="' + j + '">' +
          '<span class="xt-quiz-key">' + esc(OPT_KEYS[j] || (j + 1)) + '</span>' +
          '<span class="xt-quiz-txt">' + esc(os[j]) + '</span></div>';
      }
      html += '</div><div class="xt-quiz-exp" hidden></div></div>';
    }
    html += '<div class="xt-quiz-sum" hidden></div>';
    html += (o.credit === false ? '' : credit(typeof o.credit === 'string' ? o.credit : '原创命题 · 非官方真题，仅供自测'));
    html += '</div>';
    slotEl.innerHTML = html;
    renderIcons(slotEl);

    var items = slotEl.querySelectorAll('.xt-quiz-item');
    var answerRight = [];   // 每题是否已答对
    var i2;
    for (i2 = 0; i2 < quiz.length; i2++) answerRight.push(false);

    function refreshScore() {
      var sc = slotEl.querySelector('.xt-quiz-score');
      if (sc) sc.textContent = handle.correct + ' / ' + quiz.length;
    }

    function finish() {
      var sum = slotEl.querySelector('.xt-quiz-sum');
      if (!sum) return;
      var pct = Math.round(handle.correct * 100 / quiz.length);
      var tip = pct >= 80 ? '掌握得不错，可以进入下一类' : (pct >= 60 ? '基本到位，错题解析再看一遍' : '建议先回看要点，再来做一遍');
      sum.innerHTML = '<div class="xt-quiz-sum-t">本组正确率 ' + handle.correct + '/' + quiz.length +
        '（' + pct + '%）</div><div class="xt-quiz-sum-d">' + esc(tip) + '</div>' +
        '<button type="button" class="xt-quiz-redo">再做一次</button>';
      sum.hidden = false;
      var btn = sum.querySelector('.xt-quiz-redo');
      if (btn) {
        btn.addEventListener('click', function () {
          renderQuiz(slotEl, quizArr, opts);
        });
      }
      if (o.bestKey && o.bestId) saveQuizBest(o.bestKey, o.bestId, handle.correct, quiz.length);
      if (typeof o.onDone === 'function') {
        try { o.onDone(handle.correct, quiz.length); } catch (e) { /* 忽略回调异常 */ }
      }
    }

    for (i2 = 0; i2 < items.length; i2++) {
      (function (node, idx) {
        var q = quiz[idx] || {};
        var right = parseInt(q.a, 10);
        if (isNaN(right)) right = 0;
        var optsNodes = node.querySelectorAll('.xt-quiz-opt');
        var exp = node.querySelector('.xt-quiz-exp');
        var k;
        for (k = 0; k < optsNodes.length; k++) {
          (function (opNode, oi) {
            opNode.addEventListener('click', function () {
              if (node.getAttribute('data-done') === '1') return;
              node.setAttribute('data-done', '1');
              var ok = (oi === right);
              if (ok) {
                opNode.className += ' ok';
              } else {
                opNode.className += ' wrong';
                if (optsNodes[right]) optsNodes[right].className += ' ok';
              }
              answerRight[idx] = ok;
              handle.answered++;
              if (ok) handle.correct++;
              if (exp && showX && q.x) {
                exp.innerHTML = '<div class="xt-quiz-exp-t">' + (ok ? '回答正确' : '不正确') + ' · 解析</div>' +
                  '<div class="xt-quiz-exp-b">' + esc(q.x) + '</div>';
                exp.hidden = false;
              } else if (exp) {
                exp.hidden = true;
              }
              refreshScore();
              if (handle.answered >= quiz.length) finish();
            });
          })(optsNodes[k], k);
        }
      })(items[i2], i2);
    }
    return handle;
  }

  /* ---------------------------------------------------------------- 内联样式 */
  var CSS =
    '.xt-hero{display:flex;gap:14px;align-items:flex-start}' +
    '.xt-hero-icon{flex:none;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--bg,transparent);border:1px solid var(--border,#E5E7EB);color:var(--primary,#5B8DEF)}' +
    '.xt-hero-main{flex:1;min-width:0}' +
    '.xt-hero-title{font-size:17px;font-weight:700;line-height:1.4;color:var(--text,#1F2937)}' +
    '.xt-hero-sub{font-size:13px;line-height:1.7;margin-top:4px;color:var(--text-secondary,#6B7280)}' +
    '.xt-hero-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '.xt-bar{width:100%}' +
    '.xt-bar-label{display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary,#6B7280);margin-bottom:6px}' +
    '.xt-bar-pct{color:var(--primary,#5B8DEF);font-weight:600}' +
    '.xt-bar-track{height:8px;border-radius:99px;background:var(--border,#E5E7EB);overflow:hidden}' +
    '.xt-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--primary,#5B8DEF),var(--g2,#7BA5F5));transition:width .3s ease}' +
    '.xt-tabs{display:flex;flex-wrap:wrap;gap:8px}' +
    '.xt-tab{padding:6px 14px;border-radius:99px;font-size:13px;cursor:pointer;border:1px solid var(--border,#E5E7EB);color:var(--text-secondary,#6B7280);background:transparent;line-height:1.5}' +
    '.xt-tab i{font-style:normal;margin-left:5px;opacity:.75;font-size:12px}' +
    '.xt-tab.active{background:var(--primary,#5B8DEF);border-color:var(--primary,#5B8DEF);color:#fff}' +
    '.xt-sec{margin:0 0 14px}' +
    '.xt-sec-h{margin:0 0 6px;font-size:14px;font-weight:700;color:var(--text,#1F2937)}' +
    '.xt-sec-b{font-size:13px;line-height:1.8;color:var(--text-secondary,#6B7280);white-space:pre-wrap}' +
    '.xt-list{margin:6px 0;padding-left:20px;font-size:13px;line-height:1.8;color:var(--text-secondary,#6B7280)}' +
    '.xt-credit{margin-top:12px;font-size:12px;line-height:1.6;color:var(--text-secondary,#9CA3AF)}' +
    '.xt-empty{padding:24px 0;text-align:center;font-size:13px;color:var(--text-secondary,#9CA3AF)}' +
    '.xt-error{padding:12px;border-radius:10px;font-size:13px;color:var(--danger,#E05040);border:1px solid var(--danger,#E05040)}' +
    '.xt-quiz{margin-top:4px}' +
    '.xt-quiz-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:700;color:var(--text,#1F2937);margin-bottom:10px}' +
    '.xt-quiz-head .nav-icon{vertical-align:-3px;margin-right:4px;color:var(--primary,#5B8DEF)}' +
    '.xt-quiz-score{font-size:13px;font-weight:600;color:var(--primary,#5B8DEF)}' +
    '.xt-quiz-item{border:1px solid var(--border,#E5E7EB);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:var(--bg,transparent)}' +
    '.xt-quiz-q{font-size:14px;line-height:1.7;color:var(--text,#1F2937);margin-bottom:8px}' +
    '.xt-quiz-no{display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;background:var(--primary,#5B8DEF);color:#fff;font-size:12px;margin-right:6px}' +
    '.xt-quiz-opts{display:flex;flex-direction:column;gap:6px}' +
    '.xt-quiz-opt{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid var(--border,#E5E7EB);border-radius:10px;font-size:13px;line-height:1.6;cursor:pointer;color:var(--text,#1F2937)}' +
    '.xt-quiz-opt:hover{border-color:var(--primary,#5B8DEF)}' +
    '.xt-quiz-key{flex:none;width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;background:var(--bg,#F3F4F6);border:1px solid var(--border,#E5E7EB);font-size:12px;font-weight:700}' +
    '.xt-quiz-txt{flex:1;min-width:0}' +
    '.xt-quiz-opt.ok{border-color:var(--success,#2E7D32);background:rgba(46,125,50,.08)}' +
    '.xt-quiz-opt.ok .xt-quiz-key{background:var(--success,#2E7D32);border-color:var(--success,#2E7D32);color:#fff}' +
    '.xt-quiz-opt.wrong{border-color:var(--danger,#E05040);background:rgba(224,80,64,.08)}' +
    '.xt-quiz-opt.wrong .xt-quiz-key{background:var(--danger,#E05040);border-color:var(--danger,#E05040);color:#fff}' +
    '.xt-quiz-item[data-done="1"] .xt-quiz-opt{cursor:default}' +
    '.xt-quiz-exp{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg,#F9FAFB);border:1px dashed var(--border,#E5E7EB);font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280)}' +
    '.xt-quiz-exp-t{font-weight:700;color:var(--text,#1F2937);margin-bottom:4px}' +
    '.xt-quiz-sum{margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--border,#E5E7EB);text-align:center}' +
    '.xt-quiz-sum-t{font-size:15px;font-weight:700;color:var(--primary,#5B8DEF)}' +
    '.xt-quiz-sum-d{font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280);margin:4px 0 10px}' +
    '.xt-quiz-redo{border:1px solid var(--primary,#5B8DEF);background:transparent;color:var(--primary,#5B8DEF);padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;line-height:1.5}';

  function injectStyle() {
    try {
      if (!document.getElementById(STYLE_ID)) {
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.type = 'text/css';
        st.appendChild(document.createTextNode(CSS));
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (e) { /* 样式注入失败不影响功能 */ }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectStyle);
    } else {
      injectStyle();
    }
  }

  /* ---------------------------------------------------------------- 导出 */
  var XTC = {
    version: VERSION,
    // 工具
    esc: esc,
    icon: icon,
    renderIcons: renderIcons,
    lsKeySafe: lsKeySafe,
    credit: credit,
    // 存储
    storage: storage,
    // 进度 / 收藏
    readProgress: readProgress,
    readFav: readFav,
    isLearned: isLearned,
    setLearned: setLearned,
    markLearned: markLearned,
    isFav: isFav,
    toggleFav: toggleFav,
    progress: progress,
    saveQuizBest: saveQuizBest,
    readQuizBest: readQuizBest,
    // 注册表
    registerView: registerView,
    dispatchView: dispatchView,
    hasView: hasView,
    // UI
    hero: hero,
    progressBar: progressBar,
    tabs: tabs,
    sectionsHtml: sectionsHtml,
    listHtml: listHtml,
    empty: empty,
    renderQuiz: renderQuiz,
    // 样式
    injectStyle: injectStyle,
    lastError: null
  };

  window.XTC = XTC;
  // 兼容架构文档 §8.1 的命名（XTContent），两个名字指向同一对象
  window.XTContent = XTC;
})();
