/* =====================================================================
   comm-cases.js · A3「高情商 · 案例拆解库」渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
   ---------------------------------------------------------------------
   挂载方式（ADR-2 注册表模式）：
     · 注册 XTC.registerView('GQV2', 'comm-cases', fn)，宿主页面不需要改结构；
       宿主页（高情商表达.html）只新增 script 引用即可（见 tools/qa/_r48b3_impl_note.md 改动清单）。
     · 分发：本文件自己在 DOMContentLoaded 里包装 window.openGqCasesView，
       命中 V2 且数据就绪 → 渲染新视图；否则原样透传旧的 mini.js 引擎路径，一行未删。
     · 不依赖 app.js / mini.js 的任何渲染函数；XTC 缺失时降级为本地 helper。
     · 不调用 saveData()；localStorage 键前缀 xtc:lib:cc:<id>:learn / :fav
       （★ 独立二级键 xtc:lib:，绝不使用 xtc:learn: 通用契约命名空间）。
     · 图标全部走 icon-map.js：每次 innerHTML 之后补一次 window.lucideAutoRender()
       （icon-map 的 [data-icon] 扫描只在 DOMContentLoaded 跑一次）。
     · 图标名取自 assets/icon-map.js 已注册名单，未注册的名字不会渲染也不会报错。
     · ES5 语法：无箭头函数 / 无可选链 / 无模板字符串。
   ===================================================================== */
(function () {
  'use strict';

  var VIEW_ID = 'comm-cases';
  var REG_NAME = 'GQV2';
  var SLOT_ID = 'gqCasesSlot';
  var PANEL_ID = 'gqCasesView';
  var STYLE_ID = 'cc-cases-style-v2';
  var LS_PREFIX = 'xtc:lib:cc:';

  /* ==================== helper（CC_ 前缀，避免全局污染） ==================== */

  function CC_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function CC_icon(name, size, cls) {
    if (!name) return '';
    return '<span class="nav-icon ' + (cls || '') + '" data-icon="' + CC_esc(name) +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  /** 每次动态写入 DOM 后补一次图标渲染（F9） */
  function CC_hydrate(root) {
    try {
      if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); return; }
    } catch (e) { /* 继续本地兜底 */ }
    var X = window.XTC;
    if (X && typeof X.renderIcons === 'function') {
      try { X.renderIcons(root || document); } catch (e2) { /* 忽略 */ }
    }
  }

  function CC_key(id, kind) {
    var k = LS_PREFIX + String(id) + ':' + kind;
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { /* 忽略，退回原键 */ }
    }
    return k;
  }

  function CC_get(key, def) {
    try {
      var v = window.localStorage.getItem(key);
      if (v === null || v === '') return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }

  function CC_set(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function CC_isLearned(id) { return CC_get(CC_key(id, 'learn'), 0) === 1; }
  function CC_isFav(id) { return CC_get(CC_key(id, 'fav'), 0) === 1; }

  function CC_toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); return; }
    } catch (e) { /* 忽略 */ }
  }

  function CC_listHtml(arr, cls) {
    var list = arr || [];
    if (!list.length) return '';
    var h = '<ul class="cc-ul ' + CC_esc(cls || '') + '">';
    for (var i = 0; i < list.length; i++) h += '<li>' + CC_esc(list[i]) + '</li>';
    return h + '</ul>';
  }

  /* ==================== 数据 ==================== */

  function CC_data() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[VIEW_ID];
    if (!d || d.v !== 2 || !d.items || !d.items.length) return null;
    return d;
  }

  /* ==================== 样式 ==================== */

  var CSS = [
    '.cc-root{max-width:900px;margin:0 auto;color:var(--text,#1F2937)}',
    '#gqCasesSlot.cc-v2{overflow-y:auto;padding:14px 14px 28px}',
    '#gqCasesSlot.cc-v2::-webkit-scrollbar{width:6px}',
    '.cc-hero{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.cc-hero h3{margin:0 0 6px;font-size:17px;display:flex;align-items:center;gap:8px}',
    '.cc-hero p{margin:0;font-size:13px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.cc-bar-wrap{margin-top:12px}',
    '.cc-case{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px 16px;margin-top:14px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.cc-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}',
    '.cc-ic{flex:none;width:36px;height:36px;border-radius:10px;background:var(--primary-light,#E6FBFA);color:var(--primary,#36CFC9);display:inline-flex;align-items:center;justify-content:center}',
    '.cc-hmain{flex:1;min-width:200px}',
    '.cc-hmain b{font-size:15px;display:block;margin-bottom:4px;line-height:1.5}',
    '.cc-from{font-size:11.5px;color:var(--text-secondary,#9CA3AF)}',
    '.cc-acts{display:flex;gap:6px;flex-wrap:wrap}',
    '.cc-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border,#E8ECF0);background:var(--bg,#F5F7FA);color:var(--text-secondary,#6B7280);border-radius:9px;padding:5px 10px;font-size:12px;cursor:pointer;line-height:1.4}',
    '.cc-btn em{font-style:normal}',
    '.cc-btn:hover{border-color:var(--primary,#36CFC9);color:var(--primary,#36CFC9)}',
    '.cc-btn.on{background:var(--primary-light,#E6FBFA);border-color:var(--primary,#36CFC9);color:var(--primary-dark,#2AB5AF)}',
    '.cc-sec{margin-top:12px;border-top:1px dashed var(--border,#E8ECF0);padding-top:12px}',
    '.cc-sec-h{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px;color:var(--text,#1F2937)}',
    '.cc-sec-h .nav-icon{color:var(--primary,#36CFC9)}',
    '.cc-step{display:flex;align-items:center;gap:7px;margin-bottom:8px;font-size:12.5px;color:var(--text-secondary,#6B7280)}',
    '.cc-body{font-size:13px;line-height:1.8;color:var(--text-secondary,#6B7280);white-space:pre-wrap}',
    '.cc-wrong{font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.cc-wrong b{display:block;color:var(--danger,#C62828);font-weight:600;margin-bottom:2px}',
    '.cc-reply{background:var(--primary-light,#E6FBFA);border-left:3px solid var(--primary,#36CFC9);border-radius:0 10px 10px 0;padding:10px 12px;font-size:13px;line-height:1.8;color:var(--text,#1F2937);white-space:pre-wrap}',
    '.cc-no{display:inline-block;min-width:18px;height:18px;line-height:18px;text-align:center;border-radius:5px;background:var(--primary,#36CFC9);color:#fff;font-size:11px;font-weight:700;margin-right:6px}',
    '.cc-formula{margin-top:12px;background:var(--bg,#F5F7FA);border:1px solid var(--border,#E8ECF0);border-radius:12px;padding:11px 13px;font-size:13px;line-height:1.8;color:var(--text,#1F2937)}',
    '.cc-formula b{color:var(--primary,#36CFC9);margin-right:6px}',
    '.cc-ul{margin:0;padding-left:20px;font-size:12.5px;line-height:1.85;color:var(--text-secondary,#6B7280)}',
    '.cc-verify{margin-top:12px;border-top:1px dashed var(--border,#E8ECF0);padding-top:12px}',
    '.cc-guide{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;margin-top:14px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.cc-guide h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:7px}',
    '.cc-guide p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.cc-guide ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.cc-credit{margin-top:12px;font-size:12px;line-height:1.6;color:var(--text-secondary,#9CA3AF)}'
  ].join('\n');

  function CC_injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') st.styleSheet.cssText = CSS;
    else st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 片段渲染 ==================== */

  function CC_section(iconName, title, inner) {
    return '<div class="cc-sec">' +
      '<div class="cc-sec-h">' + CC_icon(iconName, 15) + CC_esc(title) + '</div>' +
      inner + '</div>';
  }

  function CC_wrongHtml(it) {
    var arr = it.wrong || [];
    var h = '';
    for (var i = 0; i < arr.length; i++) {
      h += '<div class="cc-wrong" style="margin-bottom:6px"><b>不当做法 ' + (i + 1) + '</b>' + CC_esc(arr[i]) + '</div>';
    }
    h += '<div class="cc-wrong"><b>为什么会这样</b>' + CC_esc(it.wrongWhy || '') + '</div>';
    return h;
  }

  function CC_actionHtml(it) {
    var arr = it.action || [];
    var h = '';
    for (var i = 0; i < arr.length; i++) {
      h += '<div class="cc-step"><span class="cc-no">' + (i + 1) + '</span>' + CC_esc(arr[i]) + '</div>';
    }
    if (it.reply) {
      h += '<div class="cc-reply" style="margin-top:10px">' + CC_esc(it.reply) + '</div>';
    }
    return h;
  }

  function CC_pointsHtml(it) {
    var h = CC_listHtml(it.points, 'cc-pts');
    h += '<div class="cc-formula"><b>可复用公式</b>' + CC_esc(it.formula || '') + '</div>';
    return h;
  }

  function CC_renderItem(it) {
    var h = '';
    h += '<div class="cc-case" data-id="' + CC_esc(it.id) + '">';
    h += '<div class="cc-head">';
    h += '<span class="cc-ic">' + CC_icon(it.icon || 'scene', 18) + '</span>';
    h += '<div class="cc-hmain"><b>' + CC_esc(it.title || '') + '</b>';
    h += '<div class="cc-from">' + CC_esc(it.from || '') + '</div></div>';
    h += '<div class="cc-acts">';
    h += '<button type="button" class="cc-btn" data-act="fav" data-id="' + CC_esc(it.id) + '">' +
      CC_icon('star', 14) + '<em>收藏</em></button>';
    h += '<button type="button" class="cc-btn" data-act="learn" data-id="' + CC_esc(it.id) + '">' +
      CC_icon('check-circle', 14) + '<em>标记已学</em></button>';
    h += '</div></div>';

    h += CC_section('book-open', '① 背景', '<div class="cc-body">' + CC_esc(it.bg || '') + '</div>');
    h += CC_section('alert-triangle', '② 冲突', '<div class="cc-body">' + CC_esc(it.conflict || '') + '</div>' + CC_wrongHtml(it));
    h += CC_section('check-circle', '③ 处理', CC_actionHtml(it));
    h += CC_section('lightbulb', '④ 拆解要点', CC_pointsHtml(it));
    h += '<div class="cc-verify" data-quiz="' + CC_esc(it.id) + '"></div>';
    h += '</div>';
    return h;
  }

  /* ---------- 验证题：优先复用 XTC.renderQuiz，缺失时本地最小实现 ---------- */

  function CC_renderVerify(host, quiz, caseTitle) {
    if (!host) return;
    var X = window.XTC;
    if (X && typeof X.renderQuiz === 'function') {
      try {
        X.renderQuiz(host, quiz, {
          title: '情景验证 · ' + caseTitle,
          credit: false
        });
        CC_hydrate(host);
        return;
      } catch (e) { /* 继续本地兜底 */ }
    }
    CC_miniQuiz(host, quiz);
  }

  function CC_miniQuiz(host, quiz) {
    var list = quiz || [];
    if (!list.length) { host.innerHTML = ''; return; }
    var h = '<div class="cc-formula" style="margin-top:0"><b>情景验证</b>' + CC_esc(list[0].q) + '</div>';
    for (var j = 0; j < list[0].o.length; j++) {
      h += '<div class="cc-step" style="color:var(--text,#1F2937)" data-cc-opt="' + j + '">' +
        '<span class="cc-no">' + 'ABCD'.charAt(j) + '</span>' + CC_esc(list[0].o[j]) + '</div>';
    }
    h += '<div class="cc-wrong" style="margin-top:8px"><b>解析</b>' + CC_esc(list[0].x || '') + '</div>';
    host.innerHTML = h;
    CC_hydrate(host);
  }

  /* ==================== 进度条 ==================== */

  function CC_renderProgress(data) {
    var box = document.getElementById('ccProgBox');
    if (!box || !data) return;
    var items = data.items || [];
    var learned = 0, faved = 0, i;
    for (i = 0; i < items.length; i++) {
      if (CC_isLearned(items[i].id)) learned++;
      if (CC_isFav(items[i].id)) faved++;
    }
    var total = items.length;
    var pct = total ? Math.round(learned * 100 / total) : 0;
    var X = window.XTC;
    if (X && typeof X.progressBar === 'function') {
      try {
        X.progressBar(box, {
          done: learned, total: total,
          label: '已拆解 ' + learned + ' / ' + total + ' 个案例',
          fav: faved
        });
        CC_hydrate(box);
        return;
      } catch (e) { /* 本地兜底 */ }
    }
    box.innerHTML = '<div class="cc-bar-wrap">' +
      '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-secondary,#6B7280);margin-bottom:6px">' +
      '<span>已拆解 ' + learned + ' / ' + total + ' 个案例</span><span>' + pct + '% · 收藏 ' + faved + '</span></div>' +
      '<div style="height:8px;border-radius:99px;background:var(--border,#E5E7EB);overflow:hidden">' +
      '<div style="height:100%;width:' + pct + '%;border-radius:99px;background:linear-gradient(90deg,var(--primary,#36CFC9),var(--g2,#5B8DEF))"></div></div></div>';
  }

  /* ==================== 主渲染 ==================== */

  function CC_render(slotEl) {
    if (!slotEl) return;
    CC_injectStyle();

    var data = CC_data();
    if (!data) {
      slotEl.innerHTML = '<div class="cc-root"><div class="cc-hero">' +
        '<p>案例数据未加载（请确认 assets/data-comm-cases.js 已在 assets/mini-comm.js 之后引入）</p></div></div>';
      CC_hydrate(slotEl);
      return;
    }
    var items = data.items || [];
    var X = window.XTC;
    var i;

    slotEl.className = (slotEl.className ? slotEl.className + ' ' : '') + 'cc-v2';
    var html = '';
    html += '<div class="cc-root">';

    /* 头部：优先复用 XTC.hero */
    if (X && typeof X.hero === 'function') {
      html += '<div class="cc-hero" id="ccHero"></div>';
    } else {
      html += '<div class="cc-hero">' +
        '<h3>' + CC_icon('scene', 18) + CC_esc(data.t || '案例拆解库') + '</h3>' +
        '<p>' + CC_esc(data.intro || '') + '</p></div>';
    }
    html += '<div id="ccProgBox"></div>';
    html += '<div id="ccList"></div>';

    if (data.guide) {
      html += '<div class="cc-guide">' +
        '<h4>' + CC_icon(data.guide.icon || 'lightbulb', 16) + CC_esc(data.guide.title || '') + '</h4>' +
        '<p>' + CC_esc(data.guide.body || '') + '</p><ol>';
      var steps = data.guide.steps || [];
      for (i = 0; i < steps.length; i++) html += '<li>' + CC_esc(steps[i]) + '</li>';
      html += '</ol></div>';
    }
    html += '<div class="cc-credit">' + CC_esc(data.credit || '') + '</div>';
    html += '</div>';
    slotEl.innerHTML = html;

    var heroEl = document.getElementById('ccHero');
    if (heroEl && X && typeof X.hero === 'function') {
      try {
        X.hero(heroEl, {
          icon: 'scene',
          title: data.t || '案例拆解库',
          sub: data.intro || '',
          tags: [(data.meta && data.meta.total ? data.meta.total : items.length) + ' 个案例 · 四段式拆解'],
          credit: false
        });
      } catch (e) { heroEl.innerHTML = '<h3>' + CC_esc(data.t || '') + '</h3>'; }
    }

    /* 案例卡 */
    var listEl = document.getElementById('ccList');
    if (listEl) {
      var lh = '';
      for (i = 0; i < items.length; i++) lh += CC_renderItem(items[i]);
      listEl.innerHTML = lh;

      /* 每卡一张验证题（原 mini-comm.js 8 道情景题，零删除） */
      var boxes = listEl.querySelectorAll('.cc-verify');
      for (i = 0; i < boxes.length; i++) {
        var cid = boxes[i].getAttribute('data-quiz');
        var item = null;
        for (var k = 0; k < items.length; k++) { if (items[k].id === cid) item = items[k]; }
        if (item && item.quiz) CC_renderVerify(boxes[i], item.quiz, item.title || '');
      }

      /* 收藏 / 已学按钮态 */
      for (i = 0; i < items.length; i++) CC_syncBtns(listEl, items[i].id);

      /* 事件委托 */
      if (!listEl.getAttribute('data-bound')) {
        listEl.setAttribute('data-bound', '1');
        listEl.addEventListener('click', function (ev) {
          var t = ev.target || ev.srcElement;
          var btn = null;
          while (t && t !== listEl) {
            if (t.getAttribute && t.getAttribute('data-act')) { btn = t; break; }
            t = t.parentNode;
          }
          if (!btn) return;
          var act = btn.getAttribute('data-act');
          var id = btn.getAttribute('data-id');
          var name = '';
          for (var k = 0; k < items.length; k++) { if (items[k].id === id) name = items[k].title; }
          if (act === 'fav') {
            var nextFav = !CC_isFav(id);
            CC_set(CC_key(id, 'fav'), nextFav ? 1 : 0);
            CC_syncBtns(listEl, id);
            CC_toast(nextFav ? '已收藏「' + name + '」' : '已取消收藏');
            CC_renderProgress(data);
          } else if (act === 'learn') {
            var nextLearn = !CC_isLearned(id);
            CC_set(CC_key(id, 'learn'), nextLearn ? 1 : 0);
            CC_syncBtns(listEl, id);
            CC_toast(nextLearn ? '已标记「' + name + '」拆解完成' : '已取消完成标记');
            CC_renderProgress(data);
          }
        });
      }
    }

    CC_renderProgress(data);
    CC_hydrate(slotEl);
  }

  function CC_syncBtns(root, id) {
    var card = root.querySelector('.cc-case[data-id="' + id + '"]');
    if (!card) return;
    var fav = card.querySelector('[data-act="fav"]');
    var learn = card.querySelector('[data-act="learn"]');
    if (fav) fav.className = 'cc-btn' + (CC_isFav(id) ? ' on' : '');
    if (learn) learn.className = 'cc-btn' + (CC_isLearned(id) ? ' on' : '');
  }

  /* ==================== 注册 + 分发（ADR-2） ==================== */

  function CC_register() {
    if (window.XTC && typeof window.XTC.registerView === 'function') {
      window.XTC.registerView(REG_NAME, VIEW_ID, CC_render);
    } else {
      window.GQV2 = window.GQV2 || {};
      window.GQV2[VIEW_ID] = CC_render;
    }
  }

  CC_register();

  function CC_openV2() {
    var slot = document.getElementById(SLOT_ID);
    if (!slot) return false;
    var ok = false;
    if (window.XTC && typeof window.XTC.dispatchView === 'function') {
      ok = window.XTC.dispatchView(REG_NAME, VIEW_ID, slot);
    } else if (window.GQV2 && typeof window.GQV2[VIEW_ID] === 'function') {
      try { slot.innerHTML = ''; window.GQV2[VIEW_ID](slot); ok = true; } catch (e) { ok = false; }
    }
    return ok;
  }

  function CC_boot() {
    /* 守卫开关：V2 视图激活期置 true，供宿主页 MutationObserver 判断是否接管
       （宿主页观察 body.childList，缺守卫会在插入节点时误判为“引擎已关闭”并关掉面板） */
    window.__gqV2Active = false;

    var legacyOpen = window.openGqCasesView;
    var legacyClose = window.closeGqCasesView;

    if (typeof legacyOpen === 'function' && !legacyOpen.__ccPatched) {
      window.openGqCasesView = function () {
        window.__gqV2Active = true;
        if (CC_openV2()) {
          var p = document.getElementById(PANEL_ID);
          if (p) p.classList.add('open');
          if (typeof window.openAppModal === 'function') {
            try { window.openAppModal(PANEL_ID); } catch (e) { /* 锁滚动失败不影响展示 */ }
          }
          var s = document.getElementById(SLOT_ID);
          if (s) s.scrollTop = 0;
          return true;
        }
        window.__gqV2Active = false;   // 未命中 → 原样透传旧引擎路径
        return legacyOpen.apply(this, arguments);
      };
      window.openGqCasesView.__ccPatched = true;
    } else if (typeof legacyOpen !== 'function') {
      if (window.console && console.warn) console.warn('[GQV2] legacy openGqCasesView 未就绪，跳过包装');
    }

    if (typeof legacyClose === 'function' && !legacyClose.__ccPatched) {
      window.closeGqCasesView = function () {
        window.__gqV2Active = false;
        var slot = document.getElementById(SLOT_ID);
        if (slot) {
          slot.className = String(slot.className || '').replace(/\bcc-v2\b/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
          slot.innerHTML = '';
        }
        return legacyClose.apply(this, arguments);
      };
      window.closeGqCasesView.__ccPatched = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', CC_boot);
  else CC_boot();

  /* 对外接口：便于 QA 与宿主页直接调用 */
  window.CommCases = {
    version: '2.0.0',
    render: CC_render,
    open: CC_openV2,
    keys: { prefix: LS_PREFIX, reg: REG_NAME, view: VIEW_ID }
  };
})();
