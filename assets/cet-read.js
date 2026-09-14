/* =============================================================================
 * assets/cet-read.js —— A1「四级 · 阅读理解」真内容渲染器（R48 第 2 批 / T21）
 * -----------------------------------------------------------------------------
 * 加载位置：assets/xt-content.js → assets/data-cet-read.js → 本文件。
 * 注册方式：XTC.registerView('CETV2', 'cet-read', fn)（等价 window.CETV2['cet-read'] = fn）
 *          分发由宿主页 四级备考.html（T20 一次性预埋）负责，本文件不改任何 HTML。
 * 结构：技巧速览（沿用原有 10 道策略题，降级为 tab）+
 *       选词填空 1 篇 / 长篇匹配 1 篇 / 仔细阅读 2 篇（共 4 篇 30 题，每题带解析）。
 * 兼容：ES5 语法，不用箭头函数 / 可选链 / 空值合并。
 * 约束：不调 saveData()；localStorage 键前缀 xtc:lib:cetread: 且经 lsKey() 包装（XTC.storage 内部处理）；
 *       图标全部走 data-icon（icon-map.js），每次 innerHTML 后补 XTC.renderIcons() / lucideAutoRender()；
 *       内容资产一律页内全屏视图承载，禁止弹窗（ADR-3）。
 * 版本戳：20260915b
 * ========================================================================== */
(function () {
  'use strict';

  window.CETV2 = window.CETV2 || {};

  /* ------------------------------------------------------------------ 常量 */
  var VIEW_ID = 'cet-read';
  var KEY = 'xtc:lib:cetread:';          // ★ 自有二级前缀，避开 xtc:learn:<bankId>:<id> 通用契约
  var STYLE_ID = 'cet-read-style-v1';
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  /* 模块级状态（面板关闭时由 T20 调 __hooks 清理计时器） */
  var state = { tab: 'cloze', seq: 'r3' };
  var timer = { id: null, sec: 0, el: null };
  var hooks = window.CETV2.__hooks || [];
  window.CETV2.__hooks = hooks;

  /* ------------------------------------------------------------ 极简 helper */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, size) {
    if (window.XTC && typeof window.XTC.icon === 'function') return window.XTC.icon(name, size);
    return '<span class="nav-icon" data-icon="' + esc(name) + '" data-icon-size="' + (size || 16) + '"></span>';
  }

  function icons(root) {
    if (window.XTC && typeof window.XTC.renderIcons === 'function') { window.XTC.renderIcons(root); return; }
    if (typeof window.lucideAutoRender === 'function') { try { window.lucideAutoRender(); } catch (e) { /* 忽略 */ } }
  }

  function store(k, v) {
    if (window.XTC && window.XTC.storage) return window.XTC.storage.set(KEY + k, v);
    return false;
  }

  function load(k, def) {
    if (window.XTC && window.XTC.storage) return window.XTC.storage.get(KEY + k, def);
    return def;
  }

  function mmss(sec) {
    var s = parseInt(sec, 10);
    if (isNaN(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (r < 10 ? '0' + r : '' + r);
  }

  /* ------------------------------------------------------------------ 计时 */
  function stopTimer() {
    if (timer.id) { clearInterval(timer.id); timer.id = null; }
  }

  function startTimer(el) {
    stopTimer();
    timer.sec = 0;
    timer.el = el || null;
    if (timer.el) timer.el.textContent = '00:00';
    timer.id = setInterval(function () {
      timer.sec++;
      if (timer.el) timer.el.textContent = mmss(timer.sec);
    }, 1000);
  }

  hooks.push(stopTimer);

  /* ------------------------------------------------------------------ 样式 */
  var CSS =
    '.cr-wrap{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:14px 16px 72px}' +
    '.cr-wrap>div{margin-bottom:14px}' +
    '.cr-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border,#E5E7EB);border-radius:10px;background:var(--card,#fff);font-size:13px;color:var(--text-secondary,#6B7280);position:sticky;top:0;z-index:5;box-shadow:0 1px 0 var(--border,#E5E7EB)}' +
    '.cr-toolbar .cr-tk{display:inline-flex;align-items:center;gap:4px;color:var(--primary,#5B8DEF);font-weight:700}' +
    '.cr-toolbar .cr-sp{flex:1}' +
    '.cr-btn{border:1px solid var(--primary,#5B8DEF);background:var(--primary,#5B8DEF);color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;line-height:1.5}' +
    '.cr-btn.ghost{background:transparent;color:var(--primary,#5B8DEF)}' +
    '.cr-btn:disabled{opacity:.55;cursor:default}' +
    '.cr-tip{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg,#F9FAFB);border:1px dashed var(--border,#E5E7EB);font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280)}' +
    '.cr-tip b{color:var(--text,#1F2937)}' +
    '.cr-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:6px}' +
    '.cr-h-t{font-size:15px;font-weight:700;color:var(--text,#1F2937);line-height:1.5}' +
    '.cr-h-s{font-size:12px;color:var(--text-secondary,#9CA3AF)}' +
    '.cr-opts{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}' +
    '.cr-opt{display:inline-flex;align-items:baseline;gap:5px;padding:5px 9px;border:1px solid var(--border,#E5E7EB);border-radius:8px;font-size:13px;line-height:1.5;background:var(--card,transparent);color:var(--text,#1F2937)}' +
    '.cr-opt b{color:var(--primary,#5B8DEF);font-size:12px}' +
    '.cr-opt i{font-style:normal;font-size:12px;color:var(--text-secondary,#9CA3AF)}' +
    '.cr-art{padding:14px 16px;border:1px solid var(--border,#E5E7EB);border-radius:var(--radius-sm,12px);background:var(--card,#fff);box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06));font-size:14.5px;line-height:2.05;color:var(--text,#1F2937)}' +
    '.cr-art p{margin:0 0 12px}' +
    '.cr-art p:last-child{margin-bottom:0}' +
    '.cr-para{display:flex;gap:8px;margin:0 0 12px}' +
    '.cr-para-k{flex:none;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background:var(--primary,#5B8DEF);color:#fff;font-size:12px;font-weight:700;margin-top:4px}' +
    '.cr-para-t{flex:1;min-width:0}' +
    '.cr-blank{display:inline-block;min-width:76px;margin:0 2px;padding:1px 4px;border:1px solid var(--primary,#5B8DEF);border-radius:6px;background:var(--primary-light,rgba(91,141,239,.1));color:var(--primary,#5B8DEF);font-size:13px;font-weight:700;line-height:1.8;vertical-align:baseline;cursor:pointer}' +
    '.cr-blank.ok{border-color:var(--success,#2E7D32);background:rgba(46,125,50,.1);color:var(--success,#2E7D32)}' +
    '.cr-blank.wrong{border-color:var(--danger,#E05040);background:rgba(224,80,64,.1);color:var(--danger,#E05040)}' +
    '.cr-blank:disabled{cursor:default;opacity:1;color:inherit}' +
    '.cr-stats{margin-top:14px}' +
    '.cr-stat{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border,#E5E7EB);border-radius:10px;background:var(--card,transparent)}' +
    '.cr-stat-n{flex:none;width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;background:var(--bg,#F3F4F6);border:1px solid var(--border,#E5E7EB);font-size:12px;font-weight:700;color:var(--text-secondary,#6B7280);margin-top:2px}' +
    '.cr-stat-t{flex:1;min-width:0;font-size:13.5px;line-height:1.7;color:var(--text,#1F2937)}' +
    '.cr-sel{flex:none;border:1px solid var(--border,#E5E7EB);border-radius:8px;padding:4px 6px;font-size:13px;background:var(--card,#fff);color:var(--text,#1F2937);line-height:1.4}' +
    '.cr-sel.ok{border-color:var(--success,#2E7D32);color:var(--success,#2E7D32)}' +
    '.cr-sel.wrong{border-color:var(--danger,#E05040);color:var(--danger,#E05040)}' +
    '.cr-res{margin-top:14px;padding:12px 14px;border:1px solid var(--border,#E5E7EB);border-radius:12px;background:var(--card,transparent)}' +
    '.cr-res-t{font-size:15px;font-weight:700;color:var(--primary,#5B8DEF);display:flex;align-items:center;gap:6px}' +
    '.cr-res-d{font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280);margin:4px 0 10px}' +
    '.cr-exp{border-top:1px dashed var(--border,#E5E7EB);padding:10px 0 0;margin-top:10px}' +
    '.cr-exp-i{padding:8px 0;border-bottom:1px dashed var(--border,#E5E7EB);font-size:13px;line-height:1.75;color:var(--text-secondary,#6B7280)}' +
    '.cr-exp-i:last-child{border-bottom:none}' +
    '.cr-exp-i b{color:var(--text,#1F2937)}' +
    '.cr-exp-i .cr-k{display:inline-block;padding:1px 7px;border-radius:6px;font-size:12px;font-weight:700;margin-right:6px;background:var(--primary-light,rgba(91,141,239,.12));color:var(--primary,#5B8DEF)}' +
    '.cr-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg,#F9FAFB);font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280)}' +
    /* 分栏：窄屏单列，宽屏左右分栏；minmax(0,·) + min-width:0 双保险，杜绝横向溢出 */
    '.cr-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}' +
    '.cr-col{min-width:0;max-width:100%}' +
    '.cr-col-art{min-width:0;max-width:100%}' +
    '.cr-col-quiz{min-width:0;max-width:100%}' +
    '.cr-quiz-card{border:1px solid var(--border,#E5E7EB);border-radius:var(--radius-sm,12px);background:var(--card,#fff);padding:12px 14px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}' +
    '.cr-empty{padding:30px 0;text-align:center;font-size:14px;color:var(--text-secondary,#9CA3AF)}' +
    /* 宽屏：左栏（文章）自吸顶并**内部独立纵向滚动**，右栏（题目/解析）随页面流滚动。
       ★ cr-has-topbar：当页面顶部还有一条 sticky 工具条时，左栏吸顶位置下移 52px 让位，
         否则文章顶部约 30px 会被工具条盖住。 */
    '@media(min-width:900px){' +
      '.cr-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);align-items:start;gap:20px}' +
      '.cr-col-art{position:sticky;top:8px;max-height:calc(100vh - 110px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-right:6px}' +
      '.cr-grid.cr-has-topbar .cr-col-art{top:52px;max-height:calc(100vh - 154px)}' +
    '}';

  function injectStyle() {
    try {
      if (document.getElementById(STYLE_ID)) return;
      var st = document.createElement('style');
      st.id = STYLE_ID;
      st.type = 'text/css';
      st.appendChild(document.createTextNode(CSS));
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* 样式失败不影响功能 */ }
  }

  /* ------------------------------------------------------------ 数据 / 存档 */
  function data() {
    return (window.CET_READ && window.CET_READ.passages) ? window.CET_READ.passages : [];
  }

  function byId(id) {
    var ps = data(), i;
    for (i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }

  function readProg() {
    var p = load('prog', {});
    return (p && typeof p === 'object') ? p : {};
  }

  function saveResult(id, correct, total, sec) {
    var p = readProg();
    var old = p[id];
    var rec = {
      best: (old && typeof old.best === 'number' && old.best > correct) ? old.best : correct,
      total: total,
      sec: sec,
      ts: Date.now()
    };
    p[id] = rec;
    store('prog', p);
    if (window.StudyStats && typeof window.StudyStats.track === 'function') {
      try { window.StudyStats.track('cet4', 'read_pass', { id: id, correct: correct, total: total }); } catch (e) { /* 忽略 */ }
    }
    if (window.Streak && typeof window.Streak.bump === 'function') {
      try { window.Streak.bump(); } catch (e) { /* 忽略 */ }
    }
  }

  function legacyQuiz() {
    var b = window.MINI_BANK || {};
    var c = b['cet-read'];
    return (c && c.q) ? c.q : [];
  }

  /* ------------------------------------------------------------ 组件片段 */
  function toolbarHtml(p, kindLabel) {
    return '<div class="cr-toolbar">' +
      '<span class="cr-tk">' + icon('timer', 14) + '<span id="crTimer">00:00</span></span>' +
      '<span>建议 ' + esc(p.minutes) + ' 分钟 · ' + esc(kindLabel) + '</span>' +
      '<span class="cr-sp"></span>' +
      '<button type="button" class="cr-btn" id="crSubmit">提交作答</button>' +
      '<button type="button" class="cr-btn ghost" id="crRedo">重做</button>' +
      '</div>';
  }

  function resultHtml(correct, total, sec, minutes, expItems) {
    var pct = total ? Math.round(correct * 100 / total) : 0;
    var tip = pct >= 80 ? '掌握得不错，可以进入下一篇'
      : (pct >= 60 ? '基本到位，把错题解析再看一遍' : '建议先回看文章与要点，再重做一次');
    var within = (sec <= minutes * 60) ? '用时在建议范围内' : '超出建议用时，下次可先限时再精读';
    var h = '<div class="cr-res"><div class="cr-res-t">' + icon('award', 16) +
      '答对 ' + correct + ' / ' + total + '（' + pct + '%）</div>' +
      '<div class="cr-res-d">用时 ' + mmss(sec) + '（建议 ' + esc(minutes) + ' 分钟）· ' + esc(within) + '。' + esc(tip) + '</div>';
    if (expItems && expItems.length) {
      h += '<div class="cr-exp">';
      for (var i = 0; i < expItems.length; i++) {
        var it = expItems[i];
        h += '<div class="cr-exp-i"><span class="cr-k">' + esc(it.k) + '</span><b>' + esc(it.ans) + '</b>　' + esc(it.x) + '</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  /* --------------------------------------------------------- 选词填空渲染 */
  function renderCloze(host, p) {
    var i, j;
    var optHtml = '';
    for (i = 0; i < p.options.length; i++) {
      var o = p.options[i];
      optHtml += '<span class="cr-opt"><b>' + esc(o.k) + '</b>' + esc(o.w) + ' <i>' + esc(o.p) + '</i></span>';
    }
    var selOpts = '<option value="">—</option>';
    for (i = 0; i < p.options.length; i++) {
      selOpts += '<option value="' + esc(p.options[i].k) + '">' + esc(p.options[i].k) + '. ' + esc(p.options[i].w) + '</option>';
    }

    var paras = String(p.body || '').split('\n\n');
    var artHtml = '';
    for (i = 0; i < paras.length; i++) {
      var line = esc(paras[i]).replace(/\{\{(\d+)\}\}/g, function (m, n) {
        return '<select class="cr-blank" data-no="' + n + '" aria-label="第' + n + '空">' + selOpts + '</select>';
      });
      artHtml += '<p>' + line + '</p>';
    }

    host.innerHTML =
      '<div class="cr-h"><span class="cr-h-t">' + esc(p.title) + '</span><span class="cr-h-s">' + esc(p.sub) + '</span></div>' +
      toolbarHtml(p, '15 选 10') +
      '<div class="cr-grid cr-has-topbar">' +
        '<div class="cr-col cr-col-art">' +
          '<div class="cr-tip"><b>做法：</b>' + esc(p.tip) + '</div>' +
          '<div class="cr-opts">' + optHtml + '</div>' +
          '<div class="cr-art">' + artHtml + '</div>' +
        '</div>' +
        '<div class="cr-col cr-col-quiz">' +
          '<div class="cr-quiz-card"><div id="crRes"></div></div>' +
        '</div>' +
      '</div>';
    icons(host);

    var timerEl = host.querySelector('#crTimer');
    startTimer(timerEl);

    host.querySelector('#crSubmit').addEventListener('click', function () {
      var sels = host.querySelectorAll('.cr-blank');
      var correct = 0, items = [], k;
      for (k = 0; k < p.blanks.length; k++) {
        var b = p.blanks[k];
        var node = host.querySelector('.cr-blank[data-no="' + b.no + '"]');
        var val = node ? node.value : '';
        var ok = (val === b.a);
        if (node) {
          node.className = 'cr-blank ' + (ok ? 'ok' : 'wrong');
          node.disabled = true;
          if (!ok) {
            for (j = 0; j < node.options.length; j++) {
              if (node.options[j].value === b.a) node.value = b.a;
            }
          }
        }
        if (ok) correct++;
        var word = '';
        for (j = 0; j < p.options.length; j++) if (p.options[j].k === b.a) word = p.options[j].w;
        items.push({ k: '第 ' + b.no + ' 空', ans: b.a + '. ' + word, x: b.x });
      }
      stopTimer();
      host.querySelector('#crSubmit').disabled = true;
      host.querySelector('#crRes').innerHTML = resultHtml(correct, p.blanks.length, timer.sec, p.minutes, items);
      icons(host);
      saveResult(p.id, correct, p.blanks.length, timer.sec);
      renderBar();
    });

    host.querySelector('#crRedo').addEventListener('click', function () {
      renderCloze(host, p);
    });
  }

  /* --------------------------------------------------------- 长篇匹配渲染 */
  function renderMatch(host, p) {
    var i, j;
    var artHtml = '';
    for (i = 0; i < p.paras.length; i++) {
      artHtml += '<div class="cr-para"><span class="cr-para-k">' + esc(p.paras[i].k) + '</span>' +
        '<span class="cr-para-t">' + esc(p.paras[i].t) + '</span></div>';
    }
    var selOpts = '<option value="">—</option>';
    for (i = 0; i < p.paras.length; i++) {
      selOpts += '<option value="' + esc(p.paras[i].k) + '">' + esc(p.paras[i].k) + '</option>';
    }
    var stHtml = '';
    for (i = 0; i < p.stats.length; i++) {
      stHtml += '<div class="cr-stat"><span class="cr-stat-n">' + (i + 1) + '</span>' +
        '<span class="cr-stat-t">' + esc(p.stats[i].t) + '</span>' +
        '<select class="cr-sel" data-no="' + p.stats[i].no + '" aria-label="第' + (i + 1) + '题">' + selOpts + '</select></div>';
    }

    host.innerHTML =
      '<div class="cr-h"><span class="cr-h-t">' + esc(p.title) + '</span><span class="cr-h-s">' + esc(p.sub) + '</span></div>' +
      toolbarHtml(p, '10 段匹配 10 题') +
      '<div class="cr-grid cr-has-topbar">' +
        '<div class="cr-col cr-col-art">' +
          '<div class="cr-tip"><b>做法：</b>' + esc(p.tip) + '</div>' +
          '<div class="cr-art">' + artHtml + '</div>' +
        '</div>' +
        '<div class="cr-col cr-col-quiz">' +
          '<div class="cr-quiz-card"><div class="cr-stats">' + stHtml + '</div><div id="crRes"></div></div>' +
        '</div>' +
      '</div>';
    icons(host);

    var timerEl = host.querySelector('#crTimer');
    startTimer(timerEl);

    host.querySelector('#crSubmit').addEventListener('click', function () {
      var correct = 0, items = [], k;
      for (k = 0; k < p.stats.length; k++) {
        var st = p.stats[k];
        var node = host.querySelector('.cr-sel[data-no="' + st.no + '"]');
        var val = node ? node.value : '';
        var ok = (val === st.a);
        if (node) {
          node.className = 'cr-sel ' + (ok ? 'ok' : 'wrong');
          node.disabled = true;
          if (!ok) node.value = st.a;
        }
        if (ok) correct++;
        items.push({ k: '第 ' + st.no + ' 题', ans: '答案 ' + st.a, x: st.x });
      }
      stopTimer();
      host.querySelector('#crSubmit').disabled = true;
      host.querySelector('#crRes').innerHTML = resultHtml(correct, p.stats.length, timer.sec, p.minutes, items);
      icons(host);
      saveResult(p.id, correct, p.stats.length, timer.sec);
      renderBar();
    });

    host.querySelector('#crRedo').addEventListener('click', function () {
      renderMatch(host, p);
    });
  }

  /* ------------------------------------------------------- 仔细阅读渲染 */
  function renderCareful(host) {
    var list = [], ps = data(), i;
    for (i = 0; i < ps.length; i++) if (ps[i].type === 'careful') list.push(ps[i]);
    if (!list.length) { host.innerHTML = '<div class="cr-empty">仔细阅读内容未加载</div>'; return; }
    var cur = byId(state.seq);
    if (!cur || cur.type !== 'careful') cur = list[0];
    state.seq = cur.id;

    var tabsHtml = '<div id="crSubTabs"></div>';
    host.innerHTML =
      '<div id="crSubTabsBox">' + tabsHtml + '</div>' +
      '<div id="crPass"></div>';
    var tabBox = host.querySelector('#crSubTabs');
    var subTabs = [];
    for (i = 0; i < list.length; i++) {
      subTabs.push({ id: list[i].id, label: '第 ' + (i + 1) + ' 篇', count: (list[i].qs || []).length });
    }
    if (window.XTC && typeof window.XTC.tabs === 'function') {
      window.XTC.tabs(tabBox, subTabs, cur.id, function (id) { state.seq = id; renderCareful(host); });
    } else {
      tabBox.innerHTML = '';
    }

    var box = host.querySelector('#crPass');
    var paras = String(cur.body || '').split('\n\n');
    var artHtml = '';
    for (i = 0; i < paras.length; i++) artHtml += '<p>' + esc(paras[i]) + '</p>';

    box.innerHTML =
      '<div class="cr-grid">' +
        '<div class="cr-col cr-col-art">' +
          '<div class="cr-h"><span class="cr-h-t">' + esc(cur.title) + '</span><span class="cr-h-s">' + esc(cur.sub) + '</span></div>' +
          '<div class="cr-toolbar"><span class="cr-tk">' + icon('timer', 14) + '<span id="crTimer2">00:00</span></span>' +
          '<span>建议 ' + esc(cur.minutes) + ' 分钟 · 5 题</span><span class="cr-sp"></span></div>' +
          '<div class="cr-tip"><b>做法：</b>' + esc(cur.tip) + '</div>' +
          '<div class="cr-art">' + artHtml + '</div>' +
        '</div>' +
        '<div class="cr-col cr-col-quiz">' +
          '<div id="crQuizHost"></div>' +
          '<div id="crQuizNote"></div>' +
        '</div>' +
      '</div>';
    icons(box);

    startTimer(box.querySelector('#crTimer2'));

    var qs = cur.qs || [];
    var opts = {
      title: '本篇 5 题（点选项即判分并展开解析）',
      showAnalysis: true,
      credit: '原创改编 · 非官方真题，按四级仔细阅读难度仿写',
      onDone: function (correct, total) {
        stopTimer();
        var note = box.querySelector('#crQuizNote');
        if (note) {
          note.innerHTML = '<div class="cr-note">' + icon('check-circle', 14) +
            ' 本篇用时 ' + mmss(timer.sec) + '（建议 ' + esc(cur.minutes) + ' 分钟）· ' +
            (timer.sec <= cur.minutes * 60 ? '节奏合适' : '略慢，下一篇可先限时再精读') + '</div>';
          icons(box);
        }
        saveResult(cur.id, correct, total, timer.sec);
        renderBar();
      }
    };
    if (window.XTC && typeof window.XTC.renderQuiz === 'function') {
      window.XTC.renderQuiz(box.querySelector('#crQuizHost'), qs, opts);
    } else {
      box.querySelector('#crQuizHost').innerHTML = '<div class="cr-empty">自测组件未加载（assets/xt-content.js 缺失）</div>';
    }
  }

  /* ------------------------------------------------------- 技巧速览渲染 */
  function renderTips(host) {
    var qs = legacyQuiz();
    host.innerHTML =
      '<div class="cr-h"><span class="cr-h-t">技巧速览 · 原有 10 道策略题</span>' +
      '<span class="cr-h-s">已降级为辅助 tab，完整文章训练见其余三个 tab</span></div>' +
      '<div class="cr-tip"><b>说明：</b>原「阅读理解」入口下的 10 道策略选择题完整保留在此，一行未删；' +
      '真文章训练（4 篇 30 题）请切换到「选词填空 / 长篇匹配 / 仔细阅读」。</div>' +
      '<div id="crTipsQuiz"></div>';
    icons(host);
    var target = host.querySelector('#crTipsQuiz');
    if (!qs.length) {
      target.innerHTML = '<div class="cr-empty">技巧题库未加载</div>';
      return;
    }
    if (window.XTC && typeof window.XTC.renderQuiz === 'function') {
      window.XTC.renderQuiz(target, qs, {
        title: '阅读策略自测',
        showAnalysis: true,
        credit: '原创命题 · 非官方真题，仅供自测',
        onDone: function (correct, total) {
          store('best:tips', { best: correct, total: total, ts: Date.now() });
        }
      });
    } else {
      target.innerHTML = '<div class="cr-empty">自测组件未加载（assets/xt-content.js 缺失）</div>';
    }
  }

  /* ------------------------------------------------------------ 主渲染 */
  var barEl = null;

  function renderBar() {
    if (!barEl) return;
    var ps = data(), prog = readProg(), done = 0, i;
    for (i = 0; i < ps.length; i++) if (prog[ps[i].id]) done++;
    if (window.XTC && typeof window.XTC.progressBar === 'function') {
      window.XTC.progressBar(barEl, { done: done, total: ps.length, label: '已完成 ' + done + ' / ' + ps.length + ' 篇' });
    } else {
      barEl.innerHTML = '<div class="cr-note">已完成 ' + done + ' / ' + ps.length + ' 篇</div>';
    }
  }

  function renderBody(host) {
    stopTimer();
    host.innerHTML = '';
    if (state.tab === 'tips') { renderTips(host); return; }
    if (state.tab === 'cloze') {
      var c = null, ps = data(), i;
      for (i = 0; i < ps.length; i++) if (ps[i].type === 'cloze') c = ps[i];
      if (c) renderCloze(host, c); else host.innerHTML = '<div class="cr-empty">选词填空内容未加载</div>';
      return;
    }
    if (state.tab === 'match') {
      var m = null, ps2 = data(), k;
      for (k = 0; k < ps2.length; k++) if (ps2[k].type === 'match') m = ps2[k];
      if (m) renderMatch(host, m); else host.innerHTML = '<div class="cr-empty">长篇匹配内容未加载</div>';
      return;
    }
    renderCareful(host);
  }

  function countOf(type) {
    var ps = data(), n = 0, i;
    for (i = 0; i < ps.length; i++) {
      if (ps[i].type === type) {
        if (type === 'cloze') n += (ps[i].blanks || []).length;
        else if (type === 'match') n += (ps[i].stats || []).length;
        else n += (ps[i].qs || []).length;
      }
    }
    return n;
  }

  function render(slot) {
    if (!slot) return;
    injectStyle();
    var ps = data();
    if (!ps.length) {
      slot.innerHTML = '<div class="cr-wrap"><div class="cr-empty">阅读数据未加载（assets/data-cet-read.js 缺失）</div></div>';
      return;
    }
    var totalQ = countOf('cloze') + countOf('match') + countOf('careful');
    var tabs = [
      { id: 'cloze', label: '选词填空', count: countOf('cloze') },
      { id: 'match', label: '长篇匹配', count: countOf('match') },
      { id: 'careful', label: '仔细阅读', count: countOf('careful') },
      { id: 'tips', label: '技巧速览', count: legacyQuiz().length }
    ];

    slot.innerHTML = '<div class="cr-wrap">' +
      '<div id="crHero"></div>' +
      '<div id="crBar"></div>' +
      '<div id="crTabs"></div>' +
      '<div id="crBody"></div>' +
      '</div>';

    var heroEl = slot.querySelector('#crHero');
    barEl = slot.querySelector('#crBar');
    var tabsEl = slot.querySelector('#crTabs');
    var bodyEl = slot.querySelector('#crBody');

    if (window.XTC && typeof window.XTC.hero === 'function') {
      window.XTC.hero(heroEl, {
        icon: 'book-open',
        title: '四级 · 阅读理解',
        sub: ps.length + ' 篇原创改编文章 · 共 ' + totalQ + ' 题，题题带解析。含选词填空、长篇匹配、仔细阅读三类；' +
          '先读文章、计时作答，交卷后逐题对照解析。建议顺序：仔细阅读 → 长篇匹配 → 选词填空。',
        tags: ['原创改编', '非官方真题', '文章 + 计时作答'],
        credit: '原创改编 · 按四级真题难度与篇幅仿写，不抄录任何真题原文'
      });
    } else {
      heroEl.innerHTML = '<div class="cr-h"><span class="cr-h-t">四级 · 阅读理解</span></div>';
      icons(heroEl);
    }

    renderBar();

    if (window.XTC && typeof window.XTC.tabs === 'function') {
      window.XTC.tabs(tabsEl, tabs, state.tab, function (id) { state.tab = id; renderBody(bodyEl); });
    } else {
      tabsEl.innerHTML = '';
    }

    renderBody(bodyEl);
  }

  /* ------------------------------------------------------------ 注册 */
  if (window.XTC && typeof window.XTC.registerView === 'function') {
    window.XTC.registerView('CETV2', VIEW_ID, render);
  } else {
    window.CETV2[VIEW_ID] = render;
  }

  window.CET_READ_VIEW = { render: render, stopTimer: stopTimer };
})();
