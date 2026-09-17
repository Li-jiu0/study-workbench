/* =====================================================================
   assets/company-lib.js —— 企业定向库独立页渲染器（T10 / A6）
   批次：R48 做真内容（2026-09-14） · 版本戳 20260914e
   ---------------------------------------------------------------------
   依赖：
     1. assets/data-exam-company.js（后置覆盖 EXAM['exam-company']，v2 富结构）
     2. assets/icon-map.js（data-icon 自动渲染，可选；缺失时图标降级为空）
   不依赖：
     - assets/xt-content.js（该文件由另一条线并行开发，本文件自带极简
       helper，统一加 CL_ 前缀避免全局污染）
   硬约束：
     - 不调用 saveData()，不写任何用户既有数据键
     - 所有 localStorage 键经 lsKey() 前缀化（window.lsKey 不存在时原样使用）
     - 全部图标走 data-icon + icon-map.js，禁 emoji / mask / symbol / use
     - ES5 语法为主，不用可选链与空值合并（file:// + 老 WebView 兼容）

   ★ 键命名空间（重要，勿改）
     本组件**独占** `xtc:lib:ent:` 前缀，共 3 组键：
       xtc:lib:ent:<id>         已学标记（1 / 0）
       xtc:lib:ent:<id>:fav     收藏标记（1 / 0）
       xtc:lib:ent:<id>:quiz    自测最好成绩 {best, total, ts}
     **禁止**写入 `xtc:learn:*` / `xtc:fav:*` / `xtc:quiz:*` —— 那是
     assets/xt-content.js（T00 通用契约，模式 `xtc:learn:<bankId>:<itemId>`）
     的地盘。两套结构在同一命名空间下会互相覆盖，且故障要等用户数据莫名
     丢失才暴露，故此处一律不双写、不回退读取。
   ===================================================================== */
(function () {
  'use strict';

  /* ===================== 常量 ===================== */
  var MODULE_ID = 'exam-company';
  var CAT_ALL = '__all__';
  /* 本组件独占前缀；与 xt-content.js 的 xtc:learn:<bankId>:<itemId> 严格隔离 */
  var KEY_PREFIX = 'xtc:lib:ent:';

  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* ===================== 运行时状态 ===================== */
  var state = {
    cat: CAT_ALL,
    kw: '',
    detailId: ''
  };
  /** @type {Object.<string,{answers:Array<number>}>} 仅在本次会话内保留作答过程 */
  var quizState = {};

  /* ===================== 极简 helper（CL_ 前缀） ===================== */

  /** HTML 转义，防止数据中的尖括号破坏结构 */
  function CL_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** lsKey 防御式包装：app.js 未加载时原样返回 */
  function CL_lsKey(k) {
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { return k; }
    }
    return k;
  }

  /** 读 localStorage（JSON 容错，异常回落默认值） */
  function CL_read(k, def) {
    try {
      var v = window.localStorage.getItem(CL_lsKey(k));
      if (v === null || v === undefined) return def;
      return JSON.parse(v);
    } catch (e) {
      return def;
    }
  }

  /** 写 localStorage（静默失败，绝不抛错打断页面） */
  function CL_write(k, v) {
    try {
      window.localStorage.setItem(CL_lsKey(k), JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 图标 HTML：只产出 data-icon 占位，由 icon-map.js 统一渲染 */
  function CL_icon(name, size) {
    return '<span class="nav-icon" data-icon="' + CL_esc(name || 'package') +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  /** 动态插入 DOM 后补一次图标渲染 */
  function CL_renderIcons() {
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e) { /* 图标渲染失败不影响内容 */ }
    }
  }

  /** toast：优先用全站 showToast，缺失时静默 */
  function CL_toast(msg) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg); return; } catch (e) { /* noop */ }
    }
  }

  function CL_el(id) {
    return document.getElementById(id);
  }

  /* ===================== 数据访问 ===================== */

  /** 取 v2 富结构数据；结构不符时返回空数组，绝不抛错 */
  function CL_items() {
    try {
      var bank = window.MINI_BANK || {};
      var data = bank[MODULE_ID];
      if (!data || data.v !== 2 || !data.items || !data.items.length) return [];
      return data.items;
    } catch (e) {
      return [];
    }
  }

  function CL_meta() {
    try {
      var d = (window.MINI_BANK || {})[MODULE_ID];
      return (d && d.meta) ? d.meta : { unit: '类', total: 8, credit: '' };
    } catch (e) {
      return { unit: '类', total: 8, credit: '' };
    }
  }

  function CL_byId(id) {
    var items = CL_items();
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /** 分类列表：按数据出现顺序去重（用于分类筛选下拉，数据驱动，勿硬编码） */
  function CL_cats() {
    var items = CL_items();
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var c = items[i].cat || '未分类';
      if (!seen[c]) { seen[c] = 1; out.push(c); }
    }
    return out;
  }

  /** 当前关键词过滤 */
  function CL_filtered() {
    var items = CL_items();
    var kw = (state.kw || '').toLowerCase();
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (state.cat !== CAT_ALL && it.cat !== state.cat) continue;
      if (kw && !CL_match(it, kw)) continue;
      out.push(it);
    }
    return out;
  }

  /** 关键词匹配：名称 / 标语 / 分类 / 正文关键字段 */
  function CL_match(it, kw) {
    var pool = [it.name, it.tagline, it.cat];
    if (it.profile) {
      pool.push(it.profile.mission, it.profile.slogan);
      if (it.profile.mainBiz) pool = pool.concat(it.profile.mainBiz);
      if (it.profile.highlights) pool = pool.concat(it.profile.highlights);
    }
    if (it.examInfo) {
      pool.push(it.examInfo.form, it.examInfo.prepAdvice);
      if (it.examInfo.hotPoints) pool = pool.concat(it.examInfo.hotPoints);
    }
    if (it.sections) {
      for (var i = 0; i < it.sections.length; i++) {
        pool.push(it.sections[i].h, it.sections[i].body);
      }
    }
    if (it.quiz) {
      for (var j = 0; j < it.quiz.length; j++) pool.push(it.quiz[j].q);
    }
    var s = pool.join(' ').toLowerCase();
    return s.indexOf(kw) !== -1;
  }

  /* ===================== 学习进度 / 收藏 ===================== */

  /* 三组键全部收敛在 xtc:lib:ent: 前缀下，不写任何映射键、不双写 */
  function CL_learnKey(id) { return KEY_PREFIX + id; }
  function CL_favKey(id) { return KEY_PREFIX + id + ':fav'; }
  function CL_quizKey(id) { return KEY_PREFIX + id + ':quiz'; }

  /** 读取 1/0 标记：仅认 1/true/'1'，其余一律 false（不做任何跨命名空间回退） */
  function CL_flag(key) {
    var v = CL_read(key, null);
    return (v === 1 || v === true || v === '1');
  }

  function CL_setFlag(key, on) {
    CL_write(key, on ? 1 : 0);
  }

  function CL_isLearned(id) { return CL_flag(CL_learnKey(id)); }
  function CL_setLearned(id, on) { CL_setFlag(CL_learnKey(id), on); }

  function CL_isFav(id) { return CL_flag(CL_favKey(id)); }
  function CL_setFav(id, on) { CL_setFlag(CL_favKey(id), on); }

  function CL_learnedCount() {
    var items = CL_items();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (CL_isLearned(items[i].id)) n++;
    }
    return n;
  }

  function CL_favCount() {
    var items = CL_items();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (CL_isFav(items[i].id)) n++;
    }
    return n;
  }

  /** 自测最好成绩：{best, total, ts} */
  function CL_quizBest(id) {
    var v = CL_read(CL_quizKey(id), null);
    if (!v || typeof v !== 'object') return null;
    return v;
  }

  function CL_saveQuizBest(id, right, total) {
    var old = CL_quizBest(id);
    if (old && typeof old.best === 'number' && old.best >= right) return;
    CL_write(CL_quizKey(id), { best: right, total: total, ts: Date.now() });
  }

  /* ===================== 渲染：hero / 进度 / 页签 ===================== */

  function CL_renderHero() {
    var el = CL_el('clHero');
    if (!el) return;
    var meta = CL_meta();
    var html = '';
    html += '<div class="cl-hero">';
    html += '  <div class="cl-hero-icon">' + CL_icon('package', 26) + '</div>';
    html += '  <div class="cl-hero-main">';
    html += '    <div class="cl-hero-title">企业定向库</div>';
    html += '    <div class="cl-hero-sub">8 类定向内容 · 企业名片 + 笔试考情 + 考点自测 + 答题注意</div>';
    html += '  </div>';
    html += '  <button type="button" class="cl-btn cl-btn-ghost" onclick="CompanyLib.goXingce()">';
    html += CL_icon('pencil', 15) + '去行测刷题 · 企业定向</button>';
    html += '</div>';
    html += '<div class="cl-credit">' + CL_esc(meta.credit) + '</div>';
    el.innerHTML = html;
  }

  function CL_renderProgress() {
    var el = CL_el('clProgress');
    if (!el) return;
    var meta = CL_meta();
    var total = CL_items().length || meta.total || 8;
    var done = CL_learnedCount();
    var fav = CL_favCount();
    var pct = total > 0 ? Math.round(done * 100 / total) : 0;
    var html = '';
    html += '<div class="cl-prog">';
    html += '  <div class="cl-prog-head">';
    html += '    <span class="cl-prog-label">' + CL_icon('target', 15) + ' 学习进度</span>';
    html += '    <span class="cl-prog-num">已学 <b>' + done + '</b> / ' + total + ' ' +
      CL_esc(meta.unit || '类') + '　·　收藏 <b>' + fav + '</b></span>';
    html += '  </div>';
    html += '  <div class="cl-prog-bar"><i style="width:' + pct + '%"></i></div>';
    html += '  <div class="cl-prog-hint">点开任意一类，看完后点「标记已学」即可累计进度；收藏用于考前快速回看。</div>';
    html += '</div>';
    el.innerHTML = html;
  }

  /* ===================== 渲染：列表 ===================== */

  function CL_renderList() {
    var el = CL_el('clList');
    if (!el) return;
    var items = CL_filtered();
    if (!items.length) {
      el.innerHTML = '<div class="cl-empty">' + CL_icon('search', 18) +
        '<div>没有匹配的内容，换个关键词或切回「全部」看看。</div></div>';
      CL_renderIcons();
      return;
    }
    var html = '<div class="cl-grid">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var learned = CL_isLearned(it.id);
      var fav = CL_isFav(it.id);
      var qn = (it.quiz && it.quiz.length) ? it.quiz.length : 0;
      var best = CL_quizBest(it.id);
      html += '<div class="cl-card' + (learned ? ' is-learned' : '') + '">';
      html += '  <div class="cl-card-top" onclick="CompanyLib.open(\'' + it.id + '\')">';
      html += '    <div class="cl-card-icon">' + CL_icon(it.icon, 20) + '</div>';
      html += '    <div class="cl-card-head">';
      html += '      <div class="cl-card-name">' + CL_esc(it.name) + '</div>';
      html += '      <div class="cl-card-tagline">' + CL_esc(it.tagline || '') + '</div>';
      html += '    </div>';
      html += '  </div>';
      html += '  <div class="cl-card-meta">';
      html += '    <span class="cl-chip">' + CL_esc(it.cat) + '</span>';
      html += '    <span class="cl-chip">自测 ' + qn + ' 题</span>';
      if (best && typeof best.best === 'number') {
        html += '  <span class="cl-chip is-ok">最好 ' + best.best + '/' + best.total + '</span>';
      }
      if (learned) html += '<span class="cl-chip is-learned">' + CL_icon('check', 13) + '已学</span>';
      if (fav) html += '<span class="cl-chip is-fav">' + CL_icon('star', 13) + '收藏</span>';
      html += '  </div>';
      html += '  <div class="cl-card-ops">';
      html += '    <button type="button" class="cl-btn cl-btn-primary" onclick="CompanyLib.open(\'' + it.id + '\')">查看</button>';
      html += '    <button type="button" class="cl-btn" onclick="CompanyLib.toggleFav(\'' + it.id + '\')">' +
        (fav ? '取消收藏' : '收藏') + '</button>';
      html += '    <button type="button" class="cl-btn' + (learned ? ' is-on' : '') +
        '" onclick="CompanyLib.toggleLearned(\'' + it.id + '\')">' + (learned ? '已学 ✓' : '标记已学') + '</button>';
      html += '  </div>';
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    CL_renderIcons();
  }

  /* ===================== 渲染：详情（四段式 / 方法卡） ===================== */

  function CL_renderDetail() {
    var box = CL_el('clDetail');
    var listCard = CL_el('clListCard');
    if (!box) return;
    if (!state.detailId) {
      box.hidden = true;
      box.innerHTML = '';
      if (listCard) listCard.hidden = false;
      return;
    }
    var it = CL_byId(state.detailId);
    if (!it) {
      box.hidden = true;
      box.innerHTML = '';
      if (listCard) listCard.hidden = false;
      return;
    }
    box.hidden = false;
    if (listCard) listCard.hidden = true;

    var learned = CL_isLearned(it.id);
    var fav = CL_isFav(it.id);
    var html = '';

    html += '<div class="cl-item">';
    html += '  <div class="cl-head">';
    html += '    <div class="cl-head-icon">' + CL_icon(it.icon, 22) + '</div>';
    html += '    <div class="cl-head-main">';
    html += '      <div class="cl-head-name">' + CL_esc(it.name) + '</div>';
    html += '      <div class="cl-head-sub">' + CL_esc(it.tagline || '') + '</div>';
    html += '    </div>';
    html += '    <div class="cl-head-ops">';
    html += '      <button type="button" class="cl-btn' + (fav ? ' is-on' : '') +
      '" onclick="CompanyLib.toggleFav(\'' + it.id + '\')">' + CL_icon('bookmark', 14) +
      (fav ? '已收藏' : '收藏') + '</button>';
    html += '      <button type="button" class="cl-btn' + (learned ? ' is-on' : '') +
      '" onclick="CompanyLib.toggleLearned(\'' + it.id + '\')">' + CL_icon('check', 14) +
      (learned ? '已学' : '标记已学') + '</button>';
    html += '      <button type="button" class="cl-btn" onclick="CompanyLib.back()">' +
      CL_icon('arrow-left', 14) + '返回列表</button>';
    html += '    </div>';
    html += '  </div>';

    if (it.kind === 'company') {
      html += CL_renderProfile(it);
      html += CL_renderExamInfo(it);
    } else {
      html += CL_renderSections(it);
    }

    html += CL_renderQuizBlock(it);
    html += CL_renderTips(it);

    if (it.links && it.links.length) {
      html += '<div class="cl-links">';
      for (var i = 0; i < it.links.length; i++) {
        var lk = it.links[i];
        html += '<button type="button" class="cl-btn cl-btn-ghost" onclick="CompanyLib.go(\'' +
          CL_esc(lk.url) + '\')">' + CL_icon('arrow-right', 14) + CL_esc(lk.label) + '</button>';
      }
      html += '</div>';
    }

    html += '  <div class="cl-credit">' + CL_esc(CL_meta().credit) + '</div>';
    html += '</div>';

    box.innerHTML = html;
    CL_renderIcons();
  }

  /** ① 企业名片 */
  function CL_renderProfile(it) {
    var p = it.profile;
    if (!p) return '';
    var html = '<section class="cl-sec" data-sec="profile">';
    html += '<h4 class="cl-sec-h">' + CL_icon('id-card', 16) + '企业名片</h4>';
    html += '<div class="cl-row"><span class="cl-k">使命 / 定位</span><span class="cl-v">' +
      CL_esc(p.mission) + '</span></div>';
    if (p.mainBiz && p.mainBiz.length) {
      html += '<div class="cl-row"><span class="cl-k">主营业务</span><span class="cl-v"><ul class="cl-ul">';
      for (var i = 0; i < p.mainBiz.length; i++) {
        html += '<li>' + CL_esc(p.mainBiz[i]) + '</li>';
      }
      html += '</ul></span></div>';
    }
    html += '<div class="cl-row"><span class="cl-k">最新提法</span><span class="cl-v">' +
      CL_esc(p.slogan) + '</span></div>';
    if (p.highlights && p.highlights.length) {
      html += '<div class="cl-row"><span class="cl-k">近一年大事</span><span class="cl-v"><ul class="cl-ul">';
      for (var j = 0; j < p.highlights.length; j++) {
        html += '<li>' + CL_esc(p.highlights[j]) + '</li>';
      }
      html += '</ul></span></div>';
    }
    html += '</section>';
    return html;
  }

  /** ② 笔试考情 */
  function CL_renderExamInfo(it) {
    var e = it.examInfo;
    if (!e) return '';
    var html = '<section class="cl-sec" data-sec="examInfo">';
    html += '<h4 class="cl-sec-h">' + CL_icon('clipboard-list', 16) + '笔试考情</h4>';
    html += '<div class="cl-row"><span class="cl-k">考试形式</span><span class="cl-v">' +
      CL_esc(e.form) + '</span></div>';
    if (e.structure && e.structure.length) {
      html += '<div class="cl-row"><span class="cl-k">题型构成</span><span class="cl-v">';
      html += '<table class="cl-table"><thead><tr><th>模块</th><th>内容</th><th>常见占比</th></tr></thead><tbody>';
      for (var i = 0; i < e.structure.length; i++) {
        var s = e.structure[i];
        html += '<tr><td>' + CL_esc(s.block) + '</td><td>' + CL_esc(s.detail) +
          '</td><td class="cl-ratio">' + CL_esc(s.ratio) + '</td></tr>';
      }
      html += '</tbody></table>';
      html += '<div class="cl-note">占比为常见区间，非官方口径，仅供分配复习精力参考。</div>';
      html += '</span></div>';
    }
    if (e.hotPoints && e.hotPoints.length) {
      html += '<div class="cl-row"><span class="cl-k">高频考点</span><span class="cl-v"><ul class="cl-ul">';
      for (var k = 0; k < e.hotPoints.length; k++) {
        html += '<li>' + CL_esc(e.hotPoints[k]) + '</li>';
      }
      html += '</ul></span></div>';
    }
    if (e.prepAdvice) {
      html += '<div class="cl-row"><span class="cl-k">备考建议</span><span class="cl-v">' +
        CL_esc(e.prepAdvice) + '</span></div>';
    }
    html += '</section>';
    return html;
  }

  /** 方法卡：sections */
  function CL_renderSections(it) {
    var secs = it.sections || [];
    if (!secs.length) return '';
    var html = '<section class="cl-sec" data-sec="sections">';
    html += '<h4 class="cl-sec-h">' + CL_icon('file-text', 16) + '要点拆解</h4>';
    for (var i = 0; i < secs.length; i++) {
      html += '<div class="cl-block">';
      html += '  <div class="cl-block-h">' + CL_esc(secs[i].h) + '</div>';
      html += '  <div class="cl-block-b">' + CL_esc(secs[i].body) + '</div>';
      html += '</div>';
    }
    html += '</section>';
    return html;
  }

  /** ③ 考点自测（即时解析） */
  function CL_renderQuizBlock(it) {
    var qs = it.quiz || [];
    if (!qs.length) return '';
    var html = '<section class="cl-sec" data-sec="quiz">';
    html += '<h4 class="cl-sec-h">' + CL_icon('help-circle', 16) + '考点自测（' + qs.length + ' 题 · 答完即时出解析）</h4>';
    html += '<div id="clQuiz_' + it.id + '">' + CL_quizInner(it) + '</div>';
    html += '</section>';
    return html;
  }

  function CL_quizInner(it) {
    var qs = it.quiz || [];
    var st = quizState[it.id] || { answers: [] };
    var html = '';
    var answered = 0;
    var right = 0;

    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      var picked = st.answers[i];
      var has = (picked !== undefined && picked !== null);
      if (has) {
        answered++;
        if (picked === q.a) right++;
      }
      html += '<div class="cl-q" data-qi="' + i + '">';
      html += '  <div class="cl-q-stem">' + (i + 1) + '. ' + CL_esc(q.q) + '</div>';
      html += '  <div class="cl-q-opts">';
      for (var j = 0; j < q.o.length; j++) {
        var cls = 'cl-opt';
        if (has) {
          if (j === q.a) cls += ' is-right';
          else if (j === picked) cls += ' is-wrong';
          cls += ' is-locked';
        }
        html += '<button type="button" class="' + cls + '"' +
          (has ? ' disabled="disabled"' : '') +
          ' onclick="CompanyLib.answer(\'' + it.id + '\',' + i + ',' + j + ')">' +
          '<span class="cl-opt-l">' + LETTERS[j] + '</span>' +
          '<span class="cl-opt-t">' + CL_esc(q.o[j]) + '</span></button>';
      }
      html += '  </div>';
      if (has) {
        html += '<div class="cl-x' + (picked === q.a ? ' is-ok' : ' is-no') + '">' +
          '<b>' + (picked === q.a ? '答对了' : '答错了，正确答案 ' + LETTERS[q.a]) + '</b>　' +
          CL_esc(q.x) + '</div>';
      }
      html += '</div>';
    }

    var best = CL_quizBest(it.id);
    html += '<div class="cl-q-result">';
    if (answered === qs.length && qs.length > 0) {
      html += '本轮正确 <b>' + right + ' / ' + qs.length + '</b>';
      if (best && typeof best.best === 'number') {
        html += '　·　历史最好 <b>' + best.best + ' / ' + best.total + '</b>';
      }
      html += '　<button type="button" class="cl-btn" onclick="CompanyLib.resetQuiz(\'' + it.id + '\')">重做本组</button>';
    } else {
      html += '已作答 <b>' + answered + ' / ' + qs.length + '</b>　·　选中任意选项即可看到解析';
      if (best && typeof best.best === 'number') {
        html += '　·　历史最好 <b>' + best.best + ' / ' + best.total + '</b>';
      }
    }
    html += '</div>';
    return html;
  }

  /** ④ 面试 / 答题注意 */
  function CL_renderTips(it) {
    var t = it.tips;
    if (!t) return '';
    var hasBody = (t.wording && t.wording.length) || t.stance || (t.bonus && t.bonus.length);
    if (!hasBody) return '';
    var html = '<section class="cl-sec" data-sec="tips">';
    html += '<h4 class="cl-sec-h">' + CL_icon('badge-check', 16) + '面试 / 答题注意</h4>';
    if (t.wording && t.wording.length) {
      html += '<div class="cl-row"><span class="cl-k">规范用语</span><span class="cl-v"><ul class="cl-ul">';
      for (var i = 0; i < t.wording.length; i++) {
        html += '<li>' + CL_esc(t.wording[i]) + '</li>';
      }
      html += '</ul></span></div>';
    }
    if (t.stance) {
      html += '<div class="cl-row"><span class="cl-k">政治站位</span><span class="cl-v">' +
        CL_esc(t.stance) + '</span></div>';
    }
    if (t.bonus && t.bonus.length) {
      html += '<div class="cl-row"><span class="cl-k">加分点</span><span class="cl-v"><ul class="cl-ul">';
      for (var j = 0; j < t.bonus.length; j++) {
        html += '<li>' + CL_esc(t.bonus[j]) + '</li>';
      }
      html += '</ul></span></div>';
    }
    html += '</section>';
    return html;
  }

  /* ===================== 对外行为 ===================== */

  /** 渲染分类筛选下拉：数据驱动生成选项（不硬编码分类名），选中当前 state.cat */
  function CL_renderCatFilter() {
    var sel = CL_el('clCatSel');
    if (!sel) return;
    var cats = CL_cats();
    var html = '<option value="' + CL_esc(CAT_ALL) + '">全部分类</option>';
    for (var i = 0; i < cats.length; i++) {
      html += '<option value="' + CL_esc(cats[i]) + '">' + CL_esc(cats[i]) + '</option>';
    }
    sel.innerHTML = html;
    sel.value = state.cat;
    if (sel.selectedIndex < 0) sel.value = CAT_ALL;
  }

  function CL_rerender() {
    CL_renderProgress();
    CL_renderList();
  }

  var CompanyLib = {

    /** 页面入口：DOMContentLoaded 后调用 */
    init: function () {
      var self = this;
      if (!CL_el('clList')) return;
      CL_renderHero();
      CL_rerender();
      CL_renderDetail();

      var search = CL_el('clSearch');
      if (search && !search.getAttribute('data-cl-bound')) {
        search.setAttribute('data-cl-bound', '1');
        search.addEventListener('input', function () {
          state.kw = this.value || '';
          CL_renderList();
        });
      }

      // 分类筛选下拉：选项数据驱动渲染，change 复用既有的 setCat()（与搜索叠加筛选）
      CL_renderCatFilter();
      var catSel = CL_el('clCatSel');
      if (catSel && !catSel.getAttribute('data-cl-bound')) {
        catSel.setAttribute('data-cl-bound', '1');
        catSel.addEventListener('change', function () {
          self.setCat(this.value || CAT_ALL);
        });
      }
      // 兼容其它组件在页面加载完成后才写入数据的情况
      if (typeof window.lucideAutoRender === 'function') {
        try { window.lucideAutoRender(); } catch (e) { /* noop */ }
      }
      return self;
    },

    /** 切换分类 */
    setCat: function (cat) {
      state.cat = cat;
      state.detailId = '';
      CL_rerender();
      CL_renderDetail();
      // 同步下拉显示值（deep-link / 外部调用时防状态双源不同步）
      var sel = CL_el('clCatSel');
      if (sel && sel.value !== cat) sel.value = cat;
    },

    /** 搜索框（与 input 事件等价，供外部调用） */
    setKw: function (kw) {
      state.kw = kw || '';
      CL_renderList();
    },

    /** 打开某一类的详情 */
    open: function (id) {
      state.detailId = id;
      CL_renderDetail();
      var box = CL_el('clDetail');
      if (box && box.scrollIntoView) {
        try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* noop */ }
      }
    },

    /** 返回列表 */
    back: function () {
      state.detailId = '';
      CL_renderDetail();
      var listCard = CL_el('clListCard');
      if (listCard && listCard.scrollIntoView) {
        try { listCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* noop */ }
      }
    },

    /** 收藏开关 */
    toggleFav: function (id) {
      var on = !CL_isFav(id);
      CL_setFav(id, on);
      CL_toast(on ? '已收藏，考前可快速回看' : '已取消收藏');
      CL_rerender();
      if (state.detailId === id) CL_renderDetail();
    },

    /** 已学开关 */
    toggleLearned: function (id) {
      var on = !CL_isLearned(id);
      CL_setLearned(id, on);
      CL_toast(on ? '已标记已学，进度 +1' : '已取消已学标记');
      CL_rerender();
      if (state.detailId === id) CL_renderDetail();
    },

    /** 文档 §7.3 兼容命名：直接标记已学 */
    markLearned: function (id) {
      if (!CL_isLearned(id)) {
        CL_setLearned(id, true);
        CL_toast('已标记已学，进度 +1');
        CL_rerender();
        if (state.detailId === id) CL_renderDetail();
      }
    },

    isLearned: function (id) { return CL_isLearned(id); },
    isFav: function (id) { return CL_isFav(id); },

    /** 自测作答：选中即出解析，全部答完记录最好成绩 */
    answer: function (id, qi, oi) {
      var it = CL_byId(id);
      if (!it || !it.quiz || !it.quiz[qi]) return;
      var st = quizState[id] || { answers: [] };
      st.answers[qi] = oi;
      quizState[id] = st;

      var host = CL_el('clQuiz_' + id);
      if (host) {
        host.innerHTML = CL_quizInner(it);
        CL_renderIcons();
      }

      // 全部作答完毕 → 记录最好成绩
      var qs = it.quiz;
      var done = 0;
      var right = 0;
      for (var i = 0; i < qs.length; i++) {
        var p = st.answers[i];
        if (p === undefined || p === null) continue;
        done++;
        if (p === qs[i].a) right++;
      }
      if (done === qs.length) {
        CL_saveQuizBest(id, right, qs.length);
        CL_toast('本组完成：正确 ' + right + ' / ' + qs.length);
        CL_rerender();
      }
    },

    /** 重做本组自测 */
    resetQuiz: function (id) {
      quizState[id] = { answers: [] };
      var it = CL_byId(id);
      var host = CL_el('clQuiz_' + id);
      if (it && host) {
        host.innerHTML = CL_quizInner(it);
        CL_renderIcons();
      }
    },

    /** 站内跳转（统一走 location.href，不用 history.back()） */
    go: function (url) {
      window.location.href = encodeURI(url);
    },

    /** 联动：去行测刷题「企业定向」分类 */
    goXingce: function () {
      window.location.href = encodeURI('行测刷题.html?cat=company');
    },

    /** 刷新全部（数据被后置覆盖后可由外部调用） */
    refresh: function () {
      CL_renderHero();
      CL_rerender();
      CL_renderDetail();
    }
  };

  window.CompanyLib = CompanyLib;
})();
