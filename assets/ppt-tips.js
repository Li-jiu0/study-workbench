/* =====================================================================
   ppt-tips.js · B1「PPT · 技巧提升」学练闭环渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
   ---------------------------------------------------------------------
   挂载方式（ADR-2 注册表模式）：
     · 幂等注册 window.PPTV2['ppt-tips']（幂等：宿主页 PPT训练.html 已由 T00 预埋
       注册表分发逻辑，本文件**不改任何 HTML 结构**，挂载点沿用 #pptPanelSlot）。
     · 學练闭环三个 tab：技巧速览（原 5 张卡片原样保留 + 可展开深入）
                        → 技巧练习（每个技巧 2-3 题，共 13 题，全部带解析）
                        → 实战任务（6 项 checklist，可勾选留存）
     · 原 5 张卡的 title/body 逐字保留在 first tab（零删除）。
     · 不依赖 app.js / mini.js 的任何渲染函数；XTC 可用时优先复用其组件。
     · 不调用 saveData()；localStorage 键前缀 xtc:lib:pt:
       （★ 独立二级键 xtc:lib:，绝不使用 xtc:learn: 通用契约命名空间）。
     · 每次 innerHTML 后补一次 window.lucideAutoRender()（icon-map 只扫一次）。
     · ES5 语法：无箭头函数 / 无可选链 / 无模板字符串。
   ===================================================================== */
(function () {
  'use strict';

  var VIEW_ID = 'ppt-tips';
  var STYLE_ID = 'ppt-tips-style-v2';
  var LS_PREFIX = 'xtc:lib:pt:';
  var TAB_KEY = LS_PREFIX + 'tab';
  var TAB_SCAN = 'scan';
  var TAB_QUIZ = 'quiz';
  var TAB_TASK = 'task';
  var curTab = TAB_SCAN;

  /* ==================== helper（PT_ 前缀） ==================== */

  function PT_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function PT_icon(name, size, cls) {
    if (!name) return '';
    return '<span class="nav-icon ' + (cls || '') + '" data-icon="' + PT_esc(name) +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  function PT_hydrate(root) {
    try {
      if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); return; }
    } catch (e) { /* 忽略 */ }
    var X = window.XTC;
    if (X && typeof X.renderIcons === 'function') {
      try { X.renderIcons(root || document); } catch (e2) { /* 忽略 */ }
    }
  }

  function PT_key(id, kind) {
    var k = LS_PREFIX + String(id) + ':' + kind;
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { /* 忽略 */ }
    }
    return k;
  }

  function PT_get(key, def) {
    try {
      var v = window.localStorage.getItem(key);
      if (v === null || v === '') return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }

  function PT_set(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function PT_toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); return; }
    } catch (e) { /* 忽略 */ }
  }

  function PT_qBest(id) {
    var v = PT_get(PT_key(id, 'best'), null);
    if (!v || typeof v !== 'object') return null;
    return v;
  }

  function PT_taskDone(id) { return PT_get(PT_key(id, 'task'), 0) === 1; }

  function PT_data() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[VIEW_ID];
    if (!d || d.v !== 2 || !d.items || !d.items.length) return null;
    return d;
  }

  /* ==================== 样式 ==================== */

  var CSS = [
    '.pt-root{max-width:960px;margin:0 auto;color:var(--text,#1F2937)}',
    '.pt-hero{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-hero h3{margin:0 0 6px;font-size:17px;display:flex;align-items:center;gap:8px}',
    '.pt-hero p{margin:0;font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280)}',
    '.pt-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.pt-pill{background:var(--primary-light,#E6FBFA);color:var(--primary-dark,#2AB5AF);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600}',
    '.pt-pill.g{background:#E8F5E9;color:#2E7D32}',
    '.pt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0}',
    '.pt-card{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;margin-top:12px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;cursor:pointer}',
    '.pt-ic{flex:none;width:34px;height:34px;border-radius:10px;background:var(--primary-light,#E6FBFA);color:var(--primary,#36CFC9);display:inline-flex;align-items:center;justify-content:center}',
    '.pt-hmain{flex:1;min-width:200px}',
    '.pt-hmain b{font-size:15px;display:block;margin-bottom:4px}',
    '.pt-sum{font-size:12.5px;line-height:1.7;color:var(--text-secondary,#6B7280)}',
    '.pt-right{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
    '.pt-tag{font-size:11.5px;background:var(--bg,#F5F7FA);color:var(--text-secondary,#6B7280);border-radius:8px;padding:2px 8px}',
    '.pt-tag.g{background:#E8F5E9;color:#2E7D32}',
    '.pt-fold{font-size:12px;color:var(--text-secondary,#9CA3AF);display:flex;align-items:center;gap:3px}',
    '.pt-body{border-top:1px dashed var(--border,#E8ECF0);margin-top:12px;padding-top:12px}',
    '.pt-grp{margin-bottom:12px}',
    '.pt-grp-h{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px}',
    '.pt-grp-h .nav-icon{color:var(--primary,#36CFC9)}',
    '.pt-ul{margin:0;padding-left:20px;font-size:12.5px;line-height:1.85;color:var(--text-secondary,#6B7280)}',
    '.pt-quiz-host{margin-top:8px}',
    '.pt-task{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid var(--border,#E8ECF0);border-radius:11px;margin-bottom:8px;cursor:pointer;background:var(--card,#fff)}',
    '.pt-task:hover{border-color:var(--primary,#36CFC9)}',
    '.pt-task.on{background:#E8F5E9;border-color:#2E7D32}',
    '.pt-box{flex:none;width:17px;height:17px;border-radius:5px;border:1px solid var(--border,#E8ECF0);display:inline-flex;align-items:center;justify-content:center;margin-top:2px}',
    '.pt-task.on .pt-box{background:#2E7D32;border-color:#2E7D32;color:#fff}',
    '.pt-task b{display:block;font-size:13px;margin-bottom:2px}',
    '.pt-task span.d{font-size:12.5px;line-height:1.65;color:var(--text-secondary,#6B7280)}',
    '.pt-guide{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;margin-top:12px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.pt-guide h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:7px}',
    '.pt-guide p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.pt-guide ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.pt-empty{padding:18px 0;text-align:center;font-size:12.5px;color:var(--text-secondary,#9CA3AF)}',
    '.pt-credit{margin-top:12px;font-size:12px;line-height:1.6;color:var(--text-secondary,#9CA3AF)}'
  ].join('\n');

  function PT_injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') st.styleSheet.cssText = CSS;
    else st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 统计 ==================== */

  function PT_stats(data) {
    var items = data.items || [];
    var tasks = data.tasks || [];
    var learned = 0, quizDone = 0, quizPass = 0, quizTotal = 0, taskDone = 0, i;
    for (i = 0; i < items.length; i++) {
      var b = PT_qBest(items[i].id);
      quizTotal += (items[i].practice || []).length;
      if (b && b.best > 0) {
        quizDone += b.total;
        quizPass += b.best;
        if (b.best >= Math.ceil(b.total * 0.6)) learned++;
      }
    }
    for (i = 0; i < tasks.length; i++) if (PT_taskDone(tasks[i].id)) taskDone++;
    return {
      learned: learned, tips: items.length,
      quizDone: quizDone, quizPass: quizPass, quizTotal: quizTotal,
      taskDone: taskDone, tasks: tasks.length
    };
  }

  /* ==================== 各 tab 内容 ==================== */

  function PT_scanHtml(data) {
    var items = data.items || [];
    var h = '', i, j, k;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var openId = PT_get(LS_PREFIX + 'open', '');
      var open = (openId === it.id);
      h += '<div class="pt-card" data-id="' + PT_esc(it.id) + '">';
      h += '<div class="pt-head" data-act="fold" data-id="' + PT_esc(it.id) + '">';
      h += '<span class="pt-ic">' + PT_icon(it.icon || 'zap', 17) + '</span>';
      h += '<div class="pt-hmain"><b>' + PT_esc(it.name || '') + '</b>';
      h += '<div class="pt-sum">' + PT_esc(it.body || '') + '</div></div>';
      h += '<div class="pt-right">';
      var scene = it.scene || [];
      for (j = 0; j < scene.length; j++) h += '<span class="pt-tag">' + PT_esc(scene[j]) + '</span>';
      h += '<span class="pt-fold">' + PT_icon(open ? 'chevron-up' : 'chevron-down', 15) + '深入</span>';
      h += '</div></div>';

      if (open && it.detail) {
        h += '<div class="pt-body">';
        h += '<div class="pt-sum" style="margin-bottom:10px">' + PT_esc(it.detail.sum || '') + '</div>';
        var gs = it.detail.groups || [];
        for (j = 0; j < gs.length; j++) {
          h += '<div class="pt-grp">';
          h += '<div class="pt-grp-h">' + PT_icon('arrow-right', 14) + PT_esc(gs[j].h || '') + '</div>';
          h += '<ul class="pt-ul">';
          var lines = gs[j].lines || [];
          for (k = 0; k < lines.length; k++) h += '<li>' + PT_esc(lines[k]) + '</li>';
          h += '</ul></div>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    return h;
  }

  function PT_quizHtml(data) {
    var items = data.items || [];
    var h = '', i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var b = PT_qBest(it.id);
      h += '<div class="pt-card" data-id="' + PT_esc(it.id) + '">';
      h += '<div class="pt-head" style="cursor:default">';
      h += '<span class="pt-ic">' + PT_icon(it.icon || 'zap', 17) + '</span>';
      h += '<div class="pt-hmain"><b>' + PT_esc(it.name || '') + ' · 练习</b>';
      h += '<div class="pt-sum">' + PT_esc((it.detail && it.detail.sum) ? it.detail.sum : '') + '</div></div>';
      h += '<div class="pt-right">';
      h += '<span class="pt-tag">' + (it.practice || []).length + ' 题</span>';
      if (b) h += '<span class="pt-tag' + (b.best >= Math.ceil(b.total * 0.6) ? ' g' : '') + '">最佳 ' + b.best + '/' + b.total + '</span>';
      h += '</div></div>';
      h += '<div class="pt-quiz-host" data-quiz="' + PT_esc(it.id) + '"></div>';
      h += '</div>';
    }
    if (!items.length) h = '<div class="pt-empty">暂无练习题</div>';
    return h;
  }

  function PT_taskHtml(data) {
    var tasks = data.tasks || [];
    var h = '', i;
    for (i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var on = PT_taskDone(t.id);
      h += '<div class="pt-task' + (on ? ' on' : '') + '" data-act="task" data-id="' + PT_esc(t.id) + '">' +
        '<span class="pt-box">' + PT_icon(on ? 'check' : '', 13) + '</span>' +
        '<div style="flex:1;min-width:0"><b>' + (i + 1) + '. ' + PT_esc(t.t) + '</b>' +
        '<span class="d">' + PT_esc(t.d) + '</span></div></div>';
    }
    return h || '<div class="pt-empty">暂无任务</div>';
  }

  /* ==================== 主渲染 ==================== */

  function PT_setHeader(data) {
    var title = document.getElementById('pptPanelTitle');
    var tag = document.getElementById('pptPanelTag');
    var desc = document.getElementById('pptPanelDesc');
    var icon = document.getElementById('pptPanelIcon');
    if (title) title.textContent = 'PPT · 技巧提升';
    if (tag) {
      var m = data.meta || {};
      tag.textContent = '5 专题 · ' + (m.quiz || 0) + ' 道练习 · ' + (m.tasks || 0) + ' 项实战任务';
    }
    if (desc) desc.textContent = data.intro || '';
    if (icon && typeof window.lucideIcon === 'function') {
      try { icon.innerHTML = window.lucideIcon('zap', 18); } catch (e) { /* 忽略 */ }
    } else if (icon) {
      icon.innerHTML = PT_icon('zap', 18);
      PT_hydrate(icon);
    }
  }

  function PT_render(slotEl) {
    if (!slotEl) return;
    PT_injectStyle();

    var data = PT_data();
    if (!data) {
      slotEl.innerHTML = '<div class="pt-root"><div class="pt-hero">' +
        '<p>技巧提升数据未加载（请确认 assets/data-ppt-tips.js 已在 assets/mini-ppt.js 之后引入）</p></div></div>';
      PT_hydrate(slotEl);
      return;
    }
    var X = window.XTC;
    PT_setHeader(data);

    var savedTab = PT_get(TAB_KEY, '');
    if (savedTab === TAB_SCAN || savedTab === TAB_QUIZ || savedTab === TAB_TASK) curTab = savedTab;

    var html = '';
    html += '<div class="pt-root">';
    html += '<div class="pt-hero" id="ptHero"></div>';
    html += '<div id="ptTabs"></div>';
    html += '<div id="ptPane"></div>';
    if (data.guide) {
      html += '<div class="pt-guide">' +
        '<h4>' + PT_icon(data.guide.icon || 'lightbulb', 16) + PT_esc(data.guide.title || '') + '</h4>' +
        '<p>' + PT_esc(data.guide.body || '') + '</p><ol>';
      var steps = data.guide.steps || [];
      for (var s = 0; s < steps.length; s++) html += '<li>' + PT_esc(steps[s]) + '</li>';
      html += '</ol></div>';
    }
    html += '<div class="pt-credit">' + PT_esc(data.credit || '') + '</div>';
    html += '</div>';
    slotEl.innerHTML = html;

    /* hero */
    var heroEl = document.getElementById('ptHero');
    if (heroEl) {
      if (X && typeof X.hero === 'function') {
        try {
          X.hero(heroEl, {
            icon: 'zap',
            title: data.t || '技巧提升',
            sub: data.intro || '',
            tags: [(data.items || []).length + ' 个专题 · 学练闭环'],
            credit: false
          });
        } catch (e) { heroEl.innerHTML = '<h3>' + PT_esc(data.t || '') + '</h3>'; }
      } else {
        heroEl.innerHTML = '<h3>' + PT_icon('zap', 18) + PT_esc(data.t || '') + '</h3>' +
          '<p>' + PT_esc(data.intro || '') + '</p>';
      }
      heroEl.innerHTML += '<div class="pt-stats" id="ptStats"></div>';
    }

    /* tabs */
    var st = PT_stats(data);
    var tabsEl = document.getElementById('ptTabs');
    if (tabsEl) {
      var tabs = [
        { id: TAB_SCAN, label: '技巧速览', count: (data.items || []).length },
        { id: TAB_QUIZ, label: '技巧练习', count: data.meta ? data.meta.quiz : st.quizTotal },
        { id: TAB_TASK, label: '实战任务', count: (data.tasks || []).length }
      ];
      if (X && typeof X.tabs === 'function') {
        try {
          X.tabs(tabsEl, tabs, curTab, function (id) { PT_switch(id, data); });
          tabsEl.className = 'pt-tabs';
        } catch (e) {
          tabsEl.innerHTML = PT_tabsHtml(tabs);
          PT_bindTabs(tabsEl, data);
        }
      } else {
        tabsEl.innerHTML = PT_tabsHtml(tabs);
        PT_bindTabs(tabsEl, data);
      }
    }

    PT_renderPane(data);
    PT_renderStats(data);
    PT_bindPane(data);
    PT_hydrate(slotEl);
  }

  function PT_tabsHtml(tabs) {
    var h = '', i;
    for (i = 0; i < tabs.length; i++) {
      h += '<div class="xt-tab' + (tabs[i].id === curTab ? ' active' : '') + '" data-pt-tab="' +
        PT_esc(tabs[i].id) + '">' + PT_esc(tabs[i].label) + '<i>' + PT_esc(tabs[i].count) + '</i></div>';
    }
    return h;
  }

  function PT_bindTabs(tabsEl, data) {
    var nodes = tabsEl.querySelectorAll('[data-pt-tab]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        node.addEventListener('click', function () { PT_switch(node.getAttribute('data-pt-tab'), data); });
      })(nodes[i]);
    }
  }

  function PT_switch(tab, data) {
    curTab = tab;
    PT_set(LS_PREFIX + 'tab', tab);
    var tabsEl = document.getElementById('ptTabs');
    if (tabsEl) {
      var nodes = tabsEl.querySelectorAll('[data-pt-tab], .xt-tab');
      for (var i = 0; i < nodes.length; i++) {
        var id = nodes[i].getAttribute('data-pt-tab') || nodes[i].getAttribute('data-xt-tab');
        if (nodes[i].className.indexOf('active') === -1 && id === tab) nodes[i].className += ' active';
        else if (id !== tab) nodes[i].className = nodes[i].className.replace(/\bactive\b/g, '').replace(/\s+/g, ' ');
      }
    }
    PT_renderPane(data);
    PT_bindPane(data);
    PT_hydrate(document.getElementById('ptPane'));
  }

  function PT_renderPane(data) {
    var pane = document.getElementById('ptPane');
    if (!pane) return;
    if (curTab === TAB_QUIZ) pane.innerHTML = PT_quizHtml(data);
    else if (curTab === TAB_TASK) pane.innerHTML = PT_taskHtml(data);
    else pane.innerHTML = PT_scanHtml(data);

    if (curTab === TAB_QUIZ) PT_renderQuizzes(data);
    PT_renderStats(data);
  }

  function PT_renderQuizzes(data) {
    var X = window.XTC;
    var items = data.items || [];
    var i;
    for (i = 0; i < items.length; i++) {
      var host = document.querySelector('.pt-quiz-host[data-quiz="' + items[i].id + '"]');
      if (!host) continue;
      var quiz = items[i].practice || [];
      if (!quiz.length) { host.innerHTML = '<div class="pt-empty">本题暂无练习</div>'; continue; }
      /* 通过闭包绑定 onDone 的 tid —— XTC.renderQuiz 不支持透传自定义参数 */
      host.setAttribute('data-tip', items[i].id);
      if (X && typeof X.renderQuiz === 'function') {
        try {
          X.renderQuiz(host, quiz, {
            title: items[i].name + ' · 练习',
            credit: false,
            onDone: PT_makeOnDone(items[i].id, data)
          });
          continue;
        } catch (e) { /* 本地兜底 */ }
      }
      host.innerHTML = '<div class="pt-empty">共 ' + quiz.length + ' 道练习（渲染器尚未就绪）</div>';
    }
  }

  function PT_makeOnDone(tid, data) {
    return function (correct, total) {
      var prev = PT_qBest(tid);
      if (!prev || typeof prev.best !== 'number' || correct > prev.best) {
        PT_set(PT_key(tid, 'best'), { best: correct, total: total, ts: Date.now() });
      }
      var pct = total ? Math.round(correct * 100 / total) : 0;
      if (pct >= 60) PT_toast('本组 ' + correct + '/' + total + '，可以进下一组了');
      else PT_toast('本组 ' + correct + '/' + total + '，建议回「技巧速览」再看一遍');
      /* 刷新该组的成绩标记与整体统计 */
      var head = document.querySelector('.pt-card[data-id="' + tid + '"] .pt-right');
      if (head) {
        var b = PT_qBest(tid);
        var old = head.querySelector('[data-best]');
        if (old) old.parentNode.removeChild(old);
        if (b) {
          var sp = document.createElement('span');
          sp.setAttribute('data-best', '1');
          sp.className = 'pt-tag' + (b.best >= Math.ceil(b.total * 0.6) ? ' g' : '');
          sp.textContent = '最佳 ' + b.best + '/' + b.total;
          head.appendChild(sp);
        }
      }
      PT_renderStats(data);
    };
  }

  function PT_renderStats(data) {
    var box = document.getElementById('ptStats');
    if (!box || !data) return;
    var st = PT_stats(data);
    var pct = st.tasks ? Math.round(st.taskDone * 100 / st.tasks) : 0;
    box.innerHTML =
      '<span class="pt-pill">技巧速览 ' + st.tips + ' 个专题</span>' +
      '<span class="pt-pill' + (st.learned === st.tips ? ' g' : '') + '">练习达标 ' + st.learned + '/' + st.tips + ' 组</span>' +
      '<span class="pt-pill">累计答对 ' + st.quizPass + '/' + st.quizDone + ' 题' + (st.quizTotal ? '（总 ' + st.quizTotal + '）' : '') + '</span>' +
      '<span class="pt-pill' + (st.taskDone === st.tasks ? ' g' : '') + '">实战任务 ' + st.taskDone + '/' + st.tasks + ' 项（' + pct + '%）</span>';
  }

  /* ==================== 事件 ==================== */

  function PT_bindPane(data) {
    var pane = document.getElementById('ptPane');
    if (!pane || pane.getAttribute('data-bound')) return;
    pane.setAttribute('data-bound', '1');

    pane.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      var node = null;
      while (t && t !== pane) {
        if (t.getAttribute && t.getAttribute('data-act')) { node = t; break; }
        t = t.parentNode;
      }
      if (!node) return;
      var act = node.getAttribute('data-act');
      var id = node.getAttribute('data-id');

      if (act === 'fold') {
        var now = PT_get(LS_PREFIX + 'open', '');
        PT_set(LS_PREFIX + 'open', now === id ? '' : id);
        PT_renderPane(data);
        PT_hydrate(pane);
        return;
      }
      if (act === 'task') {
        var next = !PT_taskDone(id);
        PT_set(PT_key(id, 'task'), next ? 1 : 0);
        PT_renderPane(data);
        PT_renderStats(data);
        PT_hydrate(pane);
        var all = (data.tasks || []).length;
        if (next && PT_stats(data).taskDone === all) PT_toast('6 项实战任务全部打勾，这套流程你算是走完了');
        return;
      }
    });
  }

  /* ==================== 注册（幂等） ==================== */

  function PT_register() {
    window.PPTV2 = window.PPTV2 || {};
    window.PPTV2[VIEW_ID] = PT_render;
    if (window.XTC && typeof window.XTC.registerView === 'function') {
      window.XTC.registerView('PPTV2', VIEW_ID, PT_render);
    }
  }

  PT_register();

  window.PptTips = {
    version: '2.0.0',
    render: PT_render,
    stats: function () { return PT_stats(PT_data() || { items: [], tasks: [] }); },
    keys: { prefix: LS_PREFIX, view: VIEW_ID }
  };
})();
