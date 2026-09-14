/* =============================================================================
 * assets/cet-translate.js —— A2「四级 · 翻译专项」真内容渲染器（R48 第 2 批 / T22）
 * -----------------------------------------------------------------------------
 * 加载位置：assets/xt-content.js → assets/data-cet-translate.js → 本文件。
 * 注册方式：XTC.registerView('CETV2', 'cet-translate', fn)（等价 window.CETV2['cet-translate'] = fn）
 *          分发由宿主页 四级备考.html（T20 一次性预埋）负责，本文件不改任何 HTML。
 * 结构：单句翻译 6 句 / 段落翻译 2 段（中文 → 用户写英文 → 参考译文 + 关键词命中评分 + 解析）
 *       + 表达积累（沿用原有 10 道表达辨析题，降级为 tab）。
 * 兼容：ES5 语法，不用箭头函数 / 可选链 / 空值合并。
 * 约束：不调 saveData()；localStorage 键前缀 xtc:lib:cettrans:（XTC.storage 内部自动 lsKey 包装）；
 *       图标走 data-icon（icon-map.js），每次 innerHTML 后补 XTC.renderIcons()；
 *       内容资产页内全屏视图承载，禁止弹窗（ADR-3）。
 * 版本戳：20260914e
 * ========================================================================== */
(function () {
  'use strict';

  window.CETV2 = window.CETV2 || {};

  /* ------------------------------------------------------------------ 常量 */
  var VIEW_ID = 'cet-translate';
  var KEY = 'xtc:lib:cettrans:';         // ★ 自有二级前缀，避开 xtc:learn:<bankId>:<id> 通用契约
  var STYLE_ID = 'cet-trans-style-v1';
  var DRAFT_SAVE_DELAY = 500;

  var state = { tab: 'sentence' };
  var draftTimer = null;

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

  /** 归一化：小写 + 非字母数字汉字转空格 + 折叠空白，用于关键词命中判断 */
  function norm(s) {
    return String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^ +| +$/g, '');
  }

  /* ------------------------------------------------------------------ 样式 */
  var CSS =
    '.ct-wrap{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 16px 48px}' +
    '.ct-wrap>div{margin-bottom:14px}' +
    '.ct-item{border:1px solid var(--border,#E5E7EB);border-radius:12px;padding:12px 14px;margin-bottom:12px;background:var(--card,transparent)}' +
    '.ct-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}' +
    '.ct-no{flex:none;min-width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background:var(--primary,#5B8DEF);color:#fff;font-size:12px;font-weight:700}' +
    '.ct-topic{font-size:12px;color:var(--text-secondary,#9CA3AF)}' +
    '.ct-sp{flex:1}' +
    '.ct-cn{font-size:14.5px;line-height:1.95;color:var(--text,#1F2937);margin-bottom:8px}' +
    '.ct-meta{font-size:12px;color:var(--text-secondary,#9CA3AF);margin-bottom:8px}' +
    '.ct-ta{width:100%;box-sizing:border-box;min-height:88px;padding:10px 12px;border:1px solid var(--border,#E5E7EB);border-radius:10px;background:var(--bg,#fff);color:var(--text,#1F2937);font-size:14px;line-height:1.8;font-family:inherit;resize:vertical}' +
    '.ct-ta:focus{outline:none;border-color:var(--primary,#5B8DEF)}' +
    '.ct-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '.ct-btn{border:1px solid var(--primary,#5B8DEF);background:var(--primary,#5B8DEF);color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;line-height:1.5}' +
    '.ct-btn.ghost{background:transparent;color:var(--primary,#5B8DEF)}' +
    '.ct-btn.plain{border-color:var(--border,#E5E7EB);background:transparent;color:var(--text-secondary,#6B7280)}' +
    '.ct-res{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg,#F9FAFB);border:1px dashed var(--border,#E5E7EB)}' +
    '.ct-score{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--primary,#5B8DEF);margin-bottom:8px}' +
    '.ct-score-s{font-size:12px;font-weight:400;color:var(--text-secondary,#9CA3AF)}' +
    '.ct-keys{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}' +
    '.ct-key{padding:3px 9px;border-radius:99px;font-size:12px;line-height:1.6;border:1px solid var(--border,#E5E7EB);color:var(--text-secondary,#6B7280)}' +
    '.ct-key.hit{border-color:var(--success,#2E7D32);background:rgba(46,125,50,.1);color:var(--success,#2E7D32)}' +
    '.ct-key.miss{border-color:var(--danger,#E05040);background:rgba(224,80,64,.08);color:var(--danger,#E05040)}' +
    '.ct-lab{font-size:12px;font-weight:700;color:var(--text,#1F2937);margin:8px 0 4px}' +
    '.ct-ref{font-size:13.5px;line-height:1.85;color:var(--text,#1F2937);white-space:pre-wrap}' +
    '.ct-tip{font-size:13px;line-height:1.8;color:var(--text-secondary,#6B7280);white-space:pre-wrap}' +
    '.ct-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg,#F9FAFB);font-size:13px;line-height:1.7;color:var(--text-secondary,#6B7280)}' +
    '.ct-empty{padding:30px 0;text-align:center;font-size:14px;color:var(--text-secondary,#9CA3AF)}';

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
  function items() {
    return (window.CET_TRANS && window.CET_TRANS.items) ? window.CET_TRANS.items : [];
  }

  function byId(id) {
    var a = items(), i;
    for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  function readProg() {
    var p = load('prog', {});
    return (p && typeof p === 'object') ? p : {};
  }

  function readDrafts() {
    var d = load('drafts', {});
    return (d && typeof d === 'object') ? d : {};
  }

  function legacyQuiz() {
    var b = window.MINI_BANK || {};
    var c = b['cet-translate'];
    return (c && c.q) ? c.q : [];
  }

  /* ------------------------------------------------------------ 关键词评分 */
  /**
   * 关键词命中评分：每组关键词内任一写法命中即算该组命中。
   * @return {Object} {hits:boolean[], n:number, total:number, score:number}
   */
  function scoreOf(item, text) {
    var t = norm(text);
    var groups = item.keys || [];
    var hits = [], n = 0, i, j;
    for (i = 0; i < groups.length; i++) {
      var g = groups[i] || [];
      var hit = false;
      for (j = 0; j < g.length; j++) {
        var k = norm(g[j]);
        if (k && t.indexOf(k) >= 0) { hit = true; break; }
      }
      hits.push(hit);
      if (hit) n++;
    }
    var total = groups.length || 1;
    return { hits: hits, n: n, total: total, score: Math.round(n * 100 / total) };
  }

  function gradeText(sc) {
    if (sc >= 90) return '要点基本全覆盖，表达到位';
    if (sc >= 70) return '主要要点已覆盖，个别表达可再打磨';
    if (sc >= 50) return '抓到一半要点，建议对照参考译文补齐句式';
    if (sc > 0) return '要点覆盖偏少，先背熟关键表达再重写一遍';
    return '未命中关键表达，建议先看解析与参考译文';
  }

  /* ------------------------------------------------------------ 单项渲染 */
  function itemHtml(item, idx, typeLabel) {
    var prog = readProg()[item.id];
    var best = prog ? '<span class="ct-topic">上次 ' + esc(prog.score) + ' 分</span>' : '';
    return '<div class="ct-item" data-id="' + esc(item.id) + '">' +
      '<div class="ct-h"><span class="ct-no">' + (idx + 1) + '</span>' +
      '<span class="ct-topic">' + esc(typeLabel) + ' · ' + esc(item.topic || '') + '</span>' +
      '<span class="ct-sp"></span>' + best + '</div>' +
      '<div class="ct-cn">' + esc(item.cn) + '</div>' +
      '<div class="ct-meta">建议 ' + esc(item.minutes) + ' 分钟 · 参考词数约 ' + esc(item.words) +
      ' · 关键表达 ' + ((item.keys || []).length) + ' 组</div>' +
      '<textarea class="ct-ta" placeholder="在这里写出你的英文译文…"></textarea>' +
      '<div class="ct-acts">' +
      '<button type="button" class="ct-btn" data-act="submit">提交评分</button>' +
      '<button type="button" class="ct-btn ghost" data-act="ref">看参考译文</button>' +
      '<button type="button" class="ct-btn plain" data-act="clear">清空</button>' +
      '</div>' +
      '<div class="ct-res" hidden></div>' +
      '</div>';
  }

  function resultHtml(item, sc) {
    var h = '<div class="ct-score">' + icon('target', 16) + '命中 ' + sc.n + ' / ' + sc.total +
      ' 组关键表达 · ' + sc.score + ' 分<span class="ct-score-s">' + esc(gradeText(sc.score)) + '</span></div>';
    h += '<div class="ct-keys">';
    for (var i = 0; i < (item.keys || []).length; i++) {
      var g = item.keys[i] || [];
      var cls = sc.hits[i] ? 'hit' : 'miss';
      h += '<span class="ct-key ' + cls + '">' + (sc.hits[i] ? '' : '') + esc(g[0] || '') + '</span>';
    }
    h += '</div>';
    h += '<div class="ct-lab">参考译文</div><div class="ct-ref">' + esc(item.ref) + '</div>';
    h += '<div class="ct-lab">解析 · 易错点</div><div class="ct-tip">' + esc(item.tips || '') + '</div>';
    return h;
  }

  function bindItem(host, item) {
    var root = host.querySelector('.ct-item[data-id="' + item.id + '"]');
    if (!root) return;
    var ta = root.querySelector('.ct-ta');
    var res = root.querySelector('.ct-res');
    var drafts = readDrafts();
    if (ta) ta.value = drafts[item.id] || '';

    if (ta) {
      ta.addEventListener('input', function () {
        if (draftTimer) clearTimeout(draftTimer);
        var v = ta.value;
        draftTimer = setTimeout(function () {
          var d = readDrafts();
          d[item.id] = v;
          store('drafts', d);
        }, DRAFT_SAVE_DELAY);
      });
    }

    var btns = root.querySelectorAll('.ct-acts .ct-btn');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.getAttribute('data-act');
          if (act === 'clear') {
            if (ta) ta.value = '';
            var d = readDrafts();
            delete d[item.id];
            store('drafts', d);
            res.hidden = true;
            res.innerHTML = '';
            return;
          }
          if (act === 'ref') {
            res.innerHTML = '<div class="ct-lab">参考译文</div><div class="ct-ref">' + esc(item.ref) + '</div>' +
              '<div class="ct-lab">解析 · 易错点</div><div class="ct-tip">' + esc(item.tips || '') + '</div>';
            res.hidden = false;
            icons(res);
            return;
          }
          // submit：评分 + 存档
          var text = ta ? ta.value : '';
          if (!text.replace(/\s+/g, '')) {
            res.innerHTML = '<div class="ct-tip">请先写出你的英文译文，再点「提交评分」。</div>';
            res.hidden = false;
            icons(res);
            return;
          }
          var sc = scoreOf(item, text);
          res.innerHTML = resultHtml(item, sc);
          res.hidden = false;
          icons(res);
          var prog = readProg();
          var old = prog[item.id];
          prog[item.id] = {
            score: (old && typeof old.score === 'number' && old.score > sc.score) ? old.score : sc.score,
            total: sc.total,
            ts: Date.now()
          };
          store('prog', prog);
          if (window.StudyStats && typeof window.StudyStats.track === 'function') {
            try { window.StudyStats.track('cet4', 'translate', { id: item.id, score: sc.score }); } catch (e) { /* 忽略 */ }
          }
          if (window.Streak && typeof window.Streak.bump === 'function') {
            try { window.Streak.bump(); } catch (e) { /* 忽略 */ }
          }
          renderBar();
        });
      })(btns[b]);
    }
  }

  /* --------------------------------------------------------- 翻译列表渲染 */
  function renderList(host, type, typeLabel) {
    var all = items(), list = [], i;
    for (i = 0; i < all.length; i++) if (all[i].type === type) list.push(all[i]);
    if (!list.length) { host.innerHTML = '<div class="ct-empty">' + esc(typeLabel) + '内容未加载</div>'; return; }
    var h = '<div class="ct-note">' + icon('pencil', 14) + ' 先自己写一版英文，再点「提交评分」：系统按关键表达命中组数给分，' +
      '并给出参考译文与逐条解析。草稿会自动保存在本机。</div>';
    for (i = 0; i < list.length; i++) h += itemHtml(list[i], i, typeLabel);
    host.innerHTML = h;
    icons(host);
    for (i = 0; i < list.length; i++) bindItem(host, list[i]);
  }

  /* ------------------------------------------------------- 表达积累渲染 */
  function renderTips(host) {
    var qs = legacyQuiz();
    host.innerHTML =
      '<div class="ct-note">' + icon('lightbulb', 14) + ' 原「翻译专项」入口下的 10 道表达辨析题完整保留在此，一行未删；' +
      '动笔训练请回到「单句翻译 / 段落翻译」。</div>' +
      '<div id="ctTipsQuiz"></div>';
    icons(host);
    var target = host.querySelector('#ctTipsQuiz');
    if (!qs.length) { target.innerHTML = '<div class="ct-empty">表达题库未加载</div>'; return; }
    if (window.XTC && typeof window.XTC.renderQuiz === 'function') {
      window.XTC.renderQuiz(target, qs, {
        title: '常用表达辨析',
        showAnalysis: true,
        credit: '原创命题 · 非官方真题，仅供自测',
        onDone: function (correct, total) {
          store('best:tips', { best: correct, total: total, ts: Date.now() });
        }
      });
    } else {
      target.innerHTML = '<div class="ct-empty">自测组件未加载（assets/xt-content.js 缺失）</div>';
    }
  }

  /* ------------------------------------------------------------ 主渲染 */
  var barEl = null;

  function renderBar() {
    if (!barEl) return;
    var all = items(), prog = readProg(), done = 0, sum = 0, i;
    for (i = 0; i < all.length; i++) {
      if (prog[all[i].id]) { done++; sum += prog[all[i].id].score || 0; }
    }
    var avg = done ? Math.round(sum / done) : 0;
    var label = '已练 ' + done + ' / ' + all.length + ' 题' + (done ? ' · 平均 ' + avg + ' 分' : '');
    if (window.XTC && typeof window.XTC.progressBar === 'function') {
      window.XTC.progressBar(barEl, { done: done, total: all.length, label: label });
    } else {
      barEl.innerHTML = '<div class="ct-note">' + esc(label) + '</div>';
    }
  }

  function render(slot) {
    if (!slot) return;
    injectStyle();
    var all = items();
    if (!all.length) {
      slot.innerHTML = '<div class="ct-wrap"><div class="ct-empty">翻译数据未加载（assets/data-cet-translate.js 缺失）</div></div>';
      return;
    }
    var nS = 0, nP = 0, i;
    for (i = 0; i < all.length; i++) {
      if (all[i].type === 'sentence') nS++;
      else if (all[i].type === 'para') nP++;
    }
    var tabs = [
      { id: 'sentence', label: '单句翻译', count: nS },
      { id: 'para', label: '段落翻译', count: nP },
      { id: 'tips', label: '表达积累', count: legacyQuiz().length }
    ];

    slot.innerHTML = '<div class="ct-wrap">' +
      '<div id="ctHero"></div>' +
      '<div id="ctBar"></div>' +
      '<div id="ctTabs"></div>' +
      '<div id="ctBody"></div>' +
      '</div>';

    var heroEl = slot.querySelector('#ctHero');
    barEl = slot.querySelector('#ctBar');
    var tabsEl = slot.querySelector('#ctTabs');
    var bodyEl = slot.querySelector('#ctBody');

    if (window.XTC && typeof window.XTC.hero === 'function') {
      window.XTC.hero(heroEl, {
        icon: 'languages',
        title: '四级 · 翻译专项',
        sub: nS + ' 个单句 + ' + nP + ' 个段落（中国文化 / 历史 / 经济话题）。先看中文自己写一版英文，' +
          '提交后按关键表达命中组数给分，并给出参考译文与逐条解析。',
        tags: ['原创改编', '非官方真题', '动笔 + 关键词命中评分'],
        credit: '原创改编 · 按四级汉译英难度与话题仿写，不抄录任何真题原文；评分为自测参考，非官方标准'
      });
    } else {
      heroEl.innerHTML = '<div class="ct-note">四级 · 翻译专项</div>';
      icons(heroEl);
    }

    renderBar();

    if (window.XTC && typeof window.XTC.tabs === 'function') {
      window.XTC.tabs(tabsEl, tabs, state.tab, function (id) {
        state.tab = id;
        renderBody(bodyEl);
      });
    } else {
      tabsEl.innerHTML = '';
    }

    renderBody(bodyEl);
  }

  function renderBody(host) {
    if (!host) return;
    host.innerHTML = '';
    if (state.tab === 'tips') { renderTips(host); return; }
    renderList(host, state.tab === 'para' ? 'para' : 'sentence', state.tab === 'para' ? '段落翻译' : '单句翻译');
  }

  /* ------------------------------------------------------------ 注册 */
  if (window.XTC && typeof window.XTC.registerView === 'function') {
    window.XTC.registerView('CETV2', VIEW_ID, render);
  } else {
    window.CETV2[VIEW_ID] = render;
  }

  window.CET_TRANS_VIEW = { render: render, scoreOf: scoreOf, norm: norm };
})();
