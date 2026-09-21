/* assets/mock-engine.js — P0-B T03-02
 * -------------------------------------------------------------------
 * 真题模考引擎 · 状态机 + 9 题型 renderQuestion + Timer + AnswerCard +
 * StageProgress + 主观题草稿持久化 + beforeunload 轻量提示
 *
 * 架构决策（架构 §12 决策 A + B）：
 *   - Timer 用 Date.now() 差值（不存计数）；持久化字段 = startedAt + totalSeconds
 *   - renderQuestion(q, state, callbacks) 显式注入；render* 函数体内零 localStorage
 *
 * localStorage 键（架构 §3.3 + PRD §6.1）：
 *   - <user>_study_workbench_mockexam_<paperId>_state       考试态
 *   - <user>_study_workbench_mockexam_<paperId>_draft_<qid> 主观题草稿
 *   - <user>_study_workbench_mockexam_<paperId>_runs        历史成绩数组
 *
 * 所有 localStorage 调用经 window.lsKey() 前缀化（PRD §7.7 红线）
 * 主观题 (scored === false) 不调 gradeObjective（PRD §7.2 + 架构 §8.9）
 *
 * 暴露：window.MockEngine = { start, resume, submit, tick, state, saveDraft,
 *   loadDrafts, renderQuestion, renderAnswerCard, renderStageProgress,
 *   gradeObjective, advance, currentQuestion, buildRenderState, rebase, ... }
 * -------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.MockEngine) return; // 防重复注入

  /* ====================================================================
   * 工具函数
   * ==================================================================== */

  function lsKey(name) {
    return (typeof window.lsKey === 'function') ? window.lsKey(name) : name;
  }

  function pad2(n) {
    n = Math.floor(Number(n) || 0);
    return n < 10 ? '0' + n : '' + n;
  }

  function fmtMMSS(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ====================================================================
   * 数据查找
   * ==================================================================== */

  function findPaper(paperId) {
    var data = window.MOCK_PAPERS_DATA;
    if (!data) return null;
    var cats = ['cet4', 'exam'];
    for (var i = 0; i < cats.length; i++) {
      var cat = data[cats[i]];
      if (!cat || !cat.papers) continue;
      for (var j = 0; j < cat.papers.length; j++) {
        if (cat.papers[j].id === paperId) return cat.papers[j];
      }
    }
    return null;
  }

  function findPaperCategory(paperId) {
    var data = window.MOCK_PAPERS_DATA;
    if (!data) return null;
    if (data.cet4 && data.cet4.papers) {
      for (var i = 0; i < data.cet4.papers.length; i++) {
        if (data.cet4.papers[i].id === paperId) return 'cet4';
      }
    }
    if (data.exam && data.exam.papers) {
      for (var k = 0; k < data.exam.papers.length; k++) {
        if (data.exam.papers[k].id === paperId) return 'exam';
      }
    }
    return null;
  }

  function findQuestionByQid(paper, qid) {
    if (!paper || !paper.questions) return null;
    for (var i = 0; i < paper.questions.length; i++) {
      if (paper.questions[i].id === qid) return paper.questions[i];
    }
    return null;
  }

  /* ====================================================================
   * localStorage 键管理（封装，避免泄露到 render*）
   * ==================================================================== */

  function stateKey(paperId) {
    return 'study_workbench_mockexam_' + paperId + '_state';
  }
  function draftKey(paperId, qid) {
    return 'study_workbench_mockexam_' + paperId + '_draft_' + qid;
  }
  function runsKey(paperId) {
    return 'study_workbench_mockexam_' + paperId + '_runs';
  }

  function persist(state) {
    try {
      localStorage.setItem(lsKey(stateKey(state.paperId)), JSON.stringify(state));
    } catch (e) { /* quota / private mode 静默 */ }
  }

  function restore(paperId) {
    try {
      var raw = localStorage.getItem(lsKey(stateKey(paperId)));
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || obj.paperId !== paperId) return null;
      return obj;
    } catch (e) { return null; }
  }

  function clearState(paperId) {
    try {
      localStorage.removeItem(lsKey(stateKey(paperId)));
    } catch (e) { /* 静默 */ }
  }

  function saveDraftToStorage(paperId, qid, value) {
    try {
      localStorage.setItem(lsKey(draftKey(paperId, qid)), String(value == null ? '' : value));
    } catch (e) { /* 静默 */ }
  }

  function loadDraftFromStorage(paperId, qid) {
    try {
      var v = localStorage.getItem(lsKey(draftKey(paperId, qid)));
      return v == null ? null : v;
    } catch (e) { return null; }
  }

  function appendRun(paperId, run) {
    try {
      var key = lsKey(runsKey(paperId));
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      list.push(run);
      // 限制最多 50 次，防止 localStorage 膨胀
      if (list.length > 50) list = list.slice(-50);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { /* 静默 */ }
  }

  function getRuns(paperId) {
    try {
      var raw = localStorage.getItem(lsKey(runsKey(paperId)));
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function getBestRun(paperId) {
    var runs = getRuns(paperId);
    if (!runs.length) return null;
    var best = runs[0];
    for (var i = 1; i < runs.length; i++) {
      if ((Number(runs[i].score) || 0) > (Number(best.score) || 0)) best = runs[i];
    }
    return best;
  }

  /* ====================================================================
   * 引擎状态（私有）
   * ==================================================================== */

  var _state = null;     // 当前 ExamState
  var _paper = null;     // 当前 Paper

  function ensureExamStarted(paperId) {
    if (_state && _state.paperId === paperId) return _state;
    var restored = restore(paperId);
    if (restored && restored.status === 'running') {
      _state = restored;
      _paper = findPaper(paperId);
      return _state;
    }
    return null;
  }

  function newState(paperId, paper) {
    var total = Math.max(1, Number(paper.minutes) || 15) * 60;
    var firstQid = (paper.questions && paper.questions[0]) ? paper.questions[0].id : '';
    return {
      paperId: paperId,
      status: 'running',       // idle | running | submitted | result
      startedAt: Date.now(),   // Date.now() ms
      totalSeconds: total,
      currentQid: firstQid,
      answers: {},             // { [qid]: any }
      submittedAt: null,
      runId: null,
      usedSeconds: 0,
      // 引擎内部统计（交卷时清空 localStorage _state 前快照）
      _correctCount: 0,
      _totalScored: 0,
      _stageStats: {}          // { [stage]: { correct, total } }
    };
  }

  /* ====================================================================
   * 公共 API
   * ==================================================================== */

  function start(paperId) {
    _paper = findPaper(paperId);
    if (!_paper) throw new Error('Paper not found: ' + paperId);
    var restored = restore(paperId);
    if (restored && restored.status === 'running' && restored.paperId === paperId) {
      // 恢复态
      _state = restored;
    } else {
      // 新态；先清旧 state 防残留
      clearState(paperId);
      _state = newState(paperId, _paper);
      // 恢复主观题草稿到 answers
      for (var i = 0; i < _paper.questions.length; i++) {
        var q = _paper.questions[i];
        if (q.scored === false) {
          var d = loadDraftFromStorage(paperId, q.id);
          if (d != null && d !== '') _state.answers[q.id] = d;
        }
      }
      persist(_state);
    }
    installBeforeUnload();
    return _state;
  }

  function resume(paperId) {
    return start(paperId);
  }

  function state() {
    return _state ? Object.assign({}, _state) : null;
  }

  /**
   * 计算剩余秒数（基于 Date.now() 差值；架构 §12 决策 A）
   */
  function remaining() {
    if (!_state) return 0;
    var elapsed = Math.floor((Date.now() - _state.startedAt) / 1000);
    return Math.max(0, _state.totalSeconds - elapsed);
  }

  /**
   * 用户主动操作时重置基线，防止系统时钟跳变（架构 §12 决策 A 风险点）
   */
  function rebase() {
    if (!_state || _state.status !== 'running') return;
    var rem = remaining();
    _state.startedAt = Date.now() - (_state.totalSeconds - rem) * 1000;
    persist(_state);
  }

  /**
   * tick() 每秒调一次：返回 { remaining, expired, status }
   */
  function tick() {
    if (!_state) return { remaining: 0, expired: true, status: 'idle' };
    var rem = remaining();
    if (rem <= 0 && _state.status === 'running') {
      // 倒计时归零，自动交卷（PRD §4.3.2 AC-3.2.13）
      submit(true);
      return { remaining: 0, expired: true, status: 'submitted' };
    }
    return { remaining: rem, expired: false, status: _state.status };
  }

  /**
   * 记录客观题答案（外部 onAnswer 调）
   */
  function recordAnswer(qid, value) {
    if (!_state || _state.status !== 'running') return;
    _state.answers[qid] = value;
    rebase();
    persist(_state);
  }

  /**
   * 切到指定题（答题卡点击）
   */
  function advance(qid) {
    if (!_state || _state.status !== 'running') return false;
    if (!findQuestionByQid(_paper, qid)) return false;
    _state.currentQid = qid;
    rebase();
    persist(_state);
    return true;
  }

  function currentQuestion() {
    if (!_state || !_paper) return null;
    return findQuestionByQid(_paper, _state.currentQid);
  }

  /**
   * 构造 RenderState 给 renderQuestion(q, state, callbacks)
   */
  function buildRenderState(qid) {
    if (!_state) return { value: null, disabled: false, isCurrent: true, isAnswered: false };
    return {
      value: _state.answers[qid] != null ? _state.answers[qid] : null,
      disabled: _state.status !== 'running',
      isCurrent: qid === _state.currentQid,
      isAnswered: _state.answers[qid] != null
    };
  }

  /**
   * 主观题草稿持久化（PRD §4.3.2 AC-3.2.7/8 + 架构 §1.3）
   * state.answers[qid] 也同步更新（供交卷时用）
   */
  function saveDraft(qid, value) {
    if (!_state || !_paper) return;
    _state.answers[qid] = String(value == null ? '' : value);
    saveDraftToStorage(_state.paperId, qid, _state.answers[qid]);
    rebase();
  }

  function loadDrafts() {
    if (!_state || !_paper) return {};
    var drafts = {};
    for (var i = 0; i < _paper.questions.length; i++) {
      var q = _paper.questions[i];
      if (q.scored === false) {
        var d = loadDraftFromStorage(_state.paperId, q.id);
        if (d != null && d !== '') drafts[q.id] = d;
      }
    }
    return drafts;
  }

  /**
   * 客观题判分（PRD §7.2 红线：主观题 scored=false 不允许调用本函数）
   */
  function gradeObjective(q, answer) {
    if (!q) return { correct: false, explanation: '' };
    if (q.scored === false) {
      // 主观题走 referenceAnswer 路径，不返自动分
      return { scored: false, correct: null, referenceAnswer: q.referenceAnswer || '', userAnswer: answer == null ? '' : answer };
    }
    var correct = false;
    if (q.type === 'single_choice' || q.type === 'true_false' || q.type === 'listening') {
      correct = (Number(answer) === Number(q.a));
    } else if (q.type === 'multiple_choice') {
      var ansArr = Array.isArray(answer) ? answer.slice().sort() : [];
      var keyArr = Array.isArray(q.a) ? q.a.slice().sort() : [];
      if (ansArr.length === keyArr.length) {
        correct = true;
        for (var i = 0; i < ansArr.length; i++) {
          if (Number(ansArr[i]) !== Number(keyArr[i])) { correct = false; break; }
        }
      }
    } else if (q.type === 'cloze' || q.type === 'fill_blank') {
      if (Array.isArray(answer) && Array.isArray(q.blanks)) {
        correct = true;
        for (var j = 0; j < q.blanks.length; j++) {
          var u = (answer[j] == null ? '' : answer[j]);
          var k = q.blanks[j].answer;
          if (q.blanks[j].blankType === 'select') {
            if (Number(u) !== Number(k)) { correct = false; break; }
          } else {
            // text：宽松匹配（trim 后大小写不敏感）
            if (String(u).trim().toLowerCase() !== String(k).trim().toLowerCase()) { correct = false; break; }
          }
        }
      }
    } else if (q.type === 'reading') {
      // reading 总题由 subQ 各自的 gradeObjective 处理；这里只看是否有 subQ 全部正确
      var subs = q.subQ || [];
      if (subs.length && Array.isArray(answer)) {
        correct = true;
        for (var s = 0; s < subs.length; s++) {
          var subRes = gradeObjective(subs[s], answer[s]);
          if (!subRes.correct) { correct = false; break; }
        }
      }
    }
    return { scored: true, correct: correct, explanation: q.x || '' };
  }

  /**
   * 交卷（auto=true 来自倒计时归零）
   * 返回 runId；写入 _runs 后跳 result 页
   */
  function submit(auto) {
    if (!_state || _state.status !== 'running') return null;
    _state.status = 'submitted';
    _state.submittedAt = Date.now();
    _state.usedSeconds = Math.floor((_state.submittedAt - _state.startedAt) / 1000);

    // 客观题判分聚合
    var correctCount = 0;
    var totalScored = 0;
    var stageStats = {};
    for (var i = 0; i < _paper.questions.length; i++) {
      var q = _paper.questions[i];
      if (q.scored === false) continue; // 主观题不入分母
      totalScored++;
      var stage = q.stage || 'reading';
      if (!stageStats[stage]) stageStats[stage] = { correct: 0, total: 0 };
      stageStats[stage].total++;
      var ans = _state.answers[q.id];
      var res = gradeObjective(q, ans);
      if (res.correct) {
        correctCount++;
        stageStats[stage].correct++;
      }
    }
    _state._correctCount = correctCount;
    _state._totalScored = totalScored;
    _state._stageStats = stageStats;

    // 算分（百分比）
    var score = totalScored ? Math.round((correctCount / totalScored) * 100) : 0;

    // 组装 run 写入 _runs
    var runId = uid();
    _state.runId = runId;
    var run = {
      runId: runId,
      paperId: _state.paperId,
      paperTitle: _paper.title || _state.paperId,
      score: score,
      correct: correctCount,
      total: totalScored,
      accuracy: score,
      usedSeconds: _state.usedSeconds,
      submittedAt: new Date(_state.submittedAt).toISOString(),
      answers: Object.assign({}, _state.answers),
      stageStats: stageStats
    };
    appendRun(_state.paperId, run);

    // 删 _state（防再次恢复 stale 态）；保留草稿
    clearState(_state.paperId);
    _state.status = 'result';

    // 连续打卡（如有）
    try {
      if (window.Streak && typeof window.Streak.bump === 'function') {
        window.Streak.bump();
      }
    } catch (e) { /* 静默 */ }

    return runId;
  }

  /* ====================================================================
   * beforeunload 轻量提示（PRD §4.3.2 AC-3.2.18）
   * ==================================================================== */

  function installBeforeUnload() {
    if (window.__mockEngineUnloadInstalled) return;
    window.__mockEngineUnloadInstalled = true;
    window.addEventListener('beforeunload', function (e) {
      if (_state && _state.status === 'running') {
        e.preventDefault();
        e.returnValue = ''; // 触发浏览器轻量提示
        return '';
      }
    });
  }

  /* ====================================================================
   * renderQuestion 分发（架构 §1.3 / §3.1 / §12 决策 B）
   * render* 函数体内零 localStorage 调用
   * ==================================================================== */

  function renderQuestion(q, state, callbacks) {
    if (!q) return renderUnknown({ q: '未知题目' }, state, callbacks);
    var fn = RENDERERS[q.type] || renderUnknown;
    return fn(q, state, callbacks);
  }

  var RENDERERS = {};

  /** 公共工具：题干区 */
  function renderStem(q) {
    var html = '<div class="mock-stem">' + escHtml(q.q || '') + '</div>';
    return html;
  }

  /** 公共工具：阶段 / 题型 / 不计分 pill */
  function renderMetaPills(q) {
    var stageLabel = {
      writing: '写作', listening: '听力', reading: '阅读', translation: '翻译'
    };
    var typeLabel = {
      single_choice: '单选', multiple_choice: '多选', true_false: '判断',
      reading: '阅读', cloze: '完形填空', essay: '写作',
      translation: '翻译', listening: '听力', fill_blank: '填空'
    };
    var html = '<div class="mock-meta">';
    html += '<span class="mock-pill mock-pill-stage">' + (stageLabel[q.stage] || q.stage || '通用') + '</span>';
    html += '<span class="mock-pill mock-pill-type">' + (typeLabel[q.type] || q.type) + '</span>';
    if (q.scored === false) {
      html += '<span class="mock-pill mock-pill-subjective">不计分</span>';
    }
    html += '</div>';
    return html;
  }

  /** ---------- single_choice ---------- */
  RENDERERS.single_choice = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-single';
    var html = renderMetaPills(q);
    html += renderStem(q);
    html += '<div class="sc-options" role="radiogroup" aria-label="' + escHtml(q.q || 'single choice') + '">';
    var opts = Array.isArray(q.o) ? q.o : [];
    for (var i = 0; i < opts.length; i++) {
      var picked = state.value === i;
      var okCls = '';
      if (state.disabled && state.isAnswered) {
        if (i === Number(q.a)) okCls = ' sc-ok';
        else if (picked) okCls = ' sc-bad';
      }
      html += '<button type="button" class="sc-op' + (picked && !state.disabled ? ' sc-picked' : '') + okCls + '"' +
        (state.disabled ? ' disabled' : '') +
        ' data-i="' + i + '">' +
        '<span class="sc-letter">' + 'ABCD'[i] + '</span>' +
        '<span class="sc-text">' + escHtml(opts[i]) + '</span>' +
        '</button>';
    }
    html += '</div>';
    if (state.disabled && state.isAnswered) {
      html += '<div class="mock-feedback">' +
        (state.value === q.a ? '<b class="mf-ok">回答正确</b>' : '<b class="mf-bad">回答错误，正确答案 ' + 'ABCD'[q.a] + '</b>') +
        (q.x ? '<div class="mf-x">' + escHtml(q.x) + '</div>' : '') +
        '</div>';
    }
    wrap.innerHTML = html;
    if (!state.disabled && cb && cb.onAnswer) {
      wrap.querySelectorAll('.sc-op').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-i'));
          cb.onAnswer(q.id, idx);
        });
      });
    }
    return wrap;
  };

  /** ---------- multiple_choice ---------- */
  RENDERERS.multiple_choice = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-mc';
    var html = renderMetaPills(q);
    html += renderStem(q);
    var arr = Array.isArray(state.value) ? state.value : [];
    html += '<div class="mc-options" role="group">';
    var opts = Array.isArray(q.o) ? q.o : [];
    for (var i = 0; i < opts.length; i++) {
      var sel = arr.indexOf(i) >= 0;
      var cls = 'mc-op' + (sel ? ' mc-picked' : '');
      if (state.disabled && state.isAnswered) {
        var keyArr = Array.isArray(q.a) ? q.a : [];
        if (keyArr.indexOf(i) >= 0) cls += ' mc-ok';
        else if (sel) cls += ' mc-bad';
      }
      html += '<button type="button" class="' + cls + '"' +
        (state.disabled ? ' disabled' : '') +
        ' data-i="' + i + '">' +
        '<span class="mc-letter">' + 'ABCD'[i] + '</span>' +
        '<span class="mc-text">' + escHtml(opts[i]) + '</span>' +
        '<span class="mc-mark">' + (sel ? '✓' : '') + '</span>' +
        '</button>';
    }
    html += '</div>';
    if (!state.disabled) {
      html += '<button type="button" class="xt-btn xt-btn-primary mock-mc-submit" data-act="mc-submit">提交所选</button>';
    }
    if (state.disabled && state.isAnswered) {
      var keyArr2 = Array.isArray(q.a) ? q.a : [];
      var gotAll = keyArr2.length === arr.length && keyArr2.every(function (k) { return arr.indexOf(k) >= 0; });
      html += '<div class="mock-feedback">' +
        (gotAll ? '<b class="mf-ok">回答正确（全对才得分）</b>' : '<b class="mf-bad">未全对，正确选项 ' + keyArr2.map(function (k) { return 'ABCD'[k]; }).join('') + '</b>') +
        (q.x ? '<div class="mf-x">' + escHtml(q.x) + '</div>' : '') +
        '</div>';
    }
    wrap.innerHTML = html;
    if (!state.disabled) {
      var current = arr.slice();
      wrap.querySelectorAll('.mc-op').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-i'));
          var pos = current.indexOf(idx);
          if (pos >= 0) current.splice(pos, 1); else current.push(idx);
          current.sort(function (a, b) { return a - b; });
          btn.classList.toggle('mc-picked');
          var mark = btn.querySelector('.mc-mark');
          if (mark) mark.textContent = btn.classList.contains('mc-picked') ? '✓' : '';
        });
      });
      var submitBtn = wrap.querySelector('[data-act="mc-submit"]');
      if (submitBtn && cb && cb.onAnswer) {
        submitBtn.addEventListener('click', function () {
          if (!current.length) return;
          cb.onAnswer(q.id, current.slice());
        });
      }
    }
    return wrap;
  };

  /** ---------- true_false ---------- */
  RENDERERS.true_false = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-tf';
    var html = renderMetaPills(q);
    html += renderStem(q);
    var ans = state.value;
    var labels = ['✓ 正确', '✗ 错误'];
    var valids = [0, 1];
    html += '<div class="tf-options">';
    for (var i = 0; i < 2; i++) {
      var picked = ans === valids[i];
      var cls = 'tf-op' + (picked && !state.disabled ? ' tf-picked' : '');
      if (state.disabled && state.isAnswered) {
        if (valids[i] === Number(q.a)) cls += ' tf-ok';
        else if (picked) cls += ' tf-bad';
      }
      html += '<button type="button" class="' + cls + '"' +
        (state.disabled ? ' disabled' : '') +
        ' data-i="' + valids[i] + '">' + labels[i] + '</button>';
    }
    html += '</div>';
    if (state.disabled && state.isAnswered) {
      html += '<div class="mock-feedback">' +
        (Number(ans) === Number(q.a) ? '<b class="mf-ok">回答正确</b>' : '<b class="mf-bad">回答错误</b>') +
        (q.x ? '<div class="mf-x">' + escHtml(q.x) + '</div>' : '') +
        '</div>';
    }
    wrap.innerHTML = html;
    if (!state.disabled && cb && cb.onAnswer) {
      wrap.querySelectorAll('.tf-op').forEach(function (btn) {
        btn.addEventListener('click', function () {
          cb.onAnswer(q.id, Number(btn.getAttribute('data-i')));
        });
      });
    }
    return wrap;
  };

  /** ---------- reading（passage + subQ）---------- */
  RENDERERS.reading = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-reading';
    var html = renderMetaPills(q);
    html += renderStem(q);
    html += '<div class="rd-layout">';
    html += '<div class="rd-passage">' + escHtml(q.passage || '') + '</div>';
    html += '<div class="rd-subs" data-rd-subs></div>';
    html += '</div>';
    wrap.innerHTML = html;
    var subsContainer = wrap.querySelector('[data-rd-subs]');
    var subs = Array.isArray(q.subQ) ? q.subQ : [];
    var answersArr = Array.isArray(state.value) ? state.value : [];
    // 占位：subsContainer 中的每个 subQ 渲染 mini renderQuestion
    // 父题 onAnswer 在收集所有 subQ 后调用
    function parentCollect() {
      var collected = [];
      subs.forEach(function (sq, idx) {
        var input = subsContainer.querySelector('[data-subwrap="' + sq.id + '"]');
        if (input && input.__collect) collected[idx] = input.__collect();
        else collected[idx] = answersArr[idx];
      });
      return collected;
    }
    subs.forEach(function (sq, idx) {
      var subWrap = document.createElement('div');
      subWrap.className = 'rd-sub-item';
      subWrap.setAttribute('data-subwrap', sq.id);
      var subState = {
        value: answersArr[idx] != null ? answersArr[idx] : null,
        disabled: state.disabled,
        isCurrent: true,
        isAnswered: answersArr[idx] != null
      };
      var subCallbacks = {
        onAnswer: function (subQid, val) {
          answersArr[idx] = val;
          // 局部更新 subWrap（不重渲染整个父题）
          var inner = window.MockEngine.renderQuestion(sq, {
            value: val,
            disabled: true,
            isCurrent: true,
            isAnswered: true
          }, { onAnswer: function () {} });
          subWrap.innerHTML = '';
          subWrap.appendChild(inner);
          subWrap.__collect = function () { return answersArr[idx]; };
          if (cb && cb.onAnswer) cb.onAnswer(q.id, parentCollect());
        }
      };
      var subNode = window.MockEngine.renderQuestion(sq, subState, subCallbacks);
      subWrap.appendChild(subNode);
      subWrap.__collect = function () { return answersArr[idx]; };
      subsContainer.appendChild(subWrap);
    });
    return wrap;
  };

  /** ---------- cloze（passage + select 填空）---------- */
  RENDERERS.cloze = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-cloze';
    var html = renderMetaPills(q);
    html += renderStem(q);
    var arr = Array.isArray(state.value) ? state.value : [];
    var blanks = Array.isArray(q.blanks) ? q.blanks : [];
    var passage = String(q.passage || '');
    // 把 passage 按 {{i}} 切分
    var tokens = passage.split(/(\{\{\d+\}\})/);
    var selIndex = 0;
    html += '<div class="cl-passage">';
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      var m = /^\{\{(\d+)\}\}$/.exec(tok);
      if (m) {
        var bIdx = Number(m[1]) - 1; // 1-based → 0-based
        var blank = blanks.find(function (b) { return Number(b.index) === Number(m[1]); }) || blanks[bIdx];
        if (!blank) {
          html += '<span class="cl-blank cl-blank-missing">[?]</span>';
        } else if (blank.blankType === 'select') {
          var curVal = arr[blank.index - 1];
          html += '<select class="cloze-sel" data-bi="' + (blank.index) + '" data-btype="select"' +
            (state.disabled ? ' disabled' : '') + '>';
          html += '<option value="">— 选择 —</option>';
          var opts = blank.options || [];
          for (var oi = 0; oi < opts.length; oi++) {
            var sel = Number(curVal) === oi;
            html += '<option value="' + oi + '"' + (sel ? ' selected' : '') + '>' + escHtml(opts[oi]) + '</option>';
          }
          html += '</select>';
        } else {
          html += '<input type="text" class="cloze-inp" data-bi="' + (blank.index) + '" data-btype="text"' +
            (state.disabled ? ' disabled' : '') +
            ' value="' + escHtml(arr[blank.index - 1] || '') + '" placeholder="填入答案"/>';
        }
      } else {
        html += escHtml(tok);
      }
    }
    html += '</div>';
    if (state.disabled && state.isAnswered) {
      // 显示每空反馈
      html += '<div class="mock-feedback">';
      blanks.forEach(function (b) {
        var u = arr[b.index - 1];
        var k = b.answer;
        var ok;
        if (b.blankType === 'select') ok = (Number(u) === Number(k));
        else ok = (String(u || '').trim().toLowerCase() === String(k).trim().toLowerCase());
        html += '<div class="cl-fb-row">第 ' + b.index + ' 空：' +
          (ok ? '<b class="mf-ok">正确</b>' : '<b class="mf-bad">错误</b>') +
          '</div>';
      });
      html += (q.x ? '<div class="mf-x">' + escHtml(q.x) + '</div>' : '') + '</div>';
    } else {
      html += '<button type="button" class="xt-btn xt-btn-primary mock-mc-submit" data-act="cloze-submit">提交答案</button>';
    }
    wrap.innerHTML = html;
    if (!state.disabled) {
      function collect() {
        var collected = [];
        blanks.forEach(function (b) {
          collected[b.index - 1] = (arr[b.index - 1] != null) ? arr[b.index - 1] : '';
        });
        return collected;
      }
      var submitBtn = wrap.querySelector('[data-act="cloze-submit"]');
      if (submitBtn) {
        submitBtn.addEventListener('click', function () {
          // 把所有 select/input 当前值写入 arr
          wrap.querySelectorAll('[data-bi]').forEach(function (el) {
            var bi = Number(el.getAttribute('data-bi'));
            var v = el.value;
            if (el.getAttribute('data-btype') === 'select') v = Number(v);
            arr[bi - 1] = v;
          });
          if (cb && cb.onAnswer) cb.onAnswer(q.id, arr.slice());
        });
      }
      wrap.querySelectorAll('[data-bi]').forEach(function (el) {
        el.addEventListener('change', function () {
          var bi = Number(el.getAttribute('data-bi'));
          var v = el.value;
          if (el.getAttribute('data-btype') === 'select') v = v === '' ? null : Number(v);
          arr[bi - 1] = v;
        });
        el.addEventListener('input', function () {
          var bi = Number(el.getAttribute('data-bi'));
          arr[bi - 1] = el.value;
        });
      });
    }
    return wrap;
  };

  /** ---------- essay（textarea + 字数 + 5s autosave）---------- */
  RENDERERS.essay = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-essay';
    var html = renderMetaPills(q);
    html += renderStem(q);
    var cur = state.value || '';
    html += '<div class="es-wrap">';
    html += '<textarea class="es-textarea" data-qid="' + escHtml(q.id) + '" placeholder="请在此作答..."' +
      (state.disabled ? ' disabled' : '') + '>' + escHtml(cur) + '</textarea>';
    html += '<div class="es-meta">';
    html += '<span class="es-count">字数 <b>' + countChars(cur) + '</b></span>';
    if (q.minWords) html += '<span class="es-target">建议 ≥ ' + q.minWords + ' 字</span>';
    html += '<span class="es-save">草稿每 5 秒自动保存</span>';
    html += '</div></div>';
    if (q.referenceAnswer) {
      html += '<details class="mock-ra"><summary>查看参考答案（仅成绩页展示，这里提示存在）</summary>' +
        '<div class="mock-ra-body">' + escHtml(q.referenceAnswer) + '</div></details>';
    }
    wrap.innerHTML = html;
    var ta = wrap.querySelector('textarea');
    var countEl = wrap.querySelector('.es-count b');
    var debounceTimer = null;
    var lastFlush = Date.now();
    function flushNow() {
      if (cb && cb.onDraft) cb.onDraft(q.id, ta.value);
      else saveDraft(q.id, ta.value);
      lastFlush = Date.now();
    }
    if (!state.disabled) {
      ta.addEventListener('input', function () {
        if (countEl) countEl.textContent = String(countChars(ta.value));
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushNow, 1000);
        // 强制 5s flush
        var sinceFlush = Date.now() - lastFlush;
        if (sinceFlush > 4500) flushNow();
      });
    }
    return wrap;
  };

  /** ---------- translation（中文 + textarea + 字数）---------- */
  RENDERERS.translation = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-translation';
    var html = renderMetaPills(q);
    html += renderStem(q);
    if (q.cn) {
      html += '<div class="tr-cn"><b>原文：</b>' + escHtml(q.cn) + '</div>';
    }
    var cur = state.value || '';
    html += '<div class="tr-wrap">';
    html += '<textarea class="tr-textarea" data-qid="' + escHtml(q.id) + '" placeholder="请在此作答..."' +
      (state.disabled ? ' disabled' : '') + '>' + escHtml(cur) + '</textarea>';
    html += '<div class="tr-meta">';
    html += '<span class="tr-count">字数 <b>' + countChars(cur) + '</b></span>';
    if (q.minWords) html += '<span class="tr-target">建议 ≥ ' + q.minWords + ' 字</span>';
    html += '<span class="tr-save">草稿每 5 秒自动保存</span>';
    html += '</div></div>';
    if (q.referenceAnswer) {
      html += '<details class="mock-ra"><summary>查看参考答案（仅成绩页展示）</summary>' +
        '<div class="mock-ra-body">' + escHtml(q.referenceAnswer) + '</div></details>';
    }
    wrap.innerHTML = html;
    var ta = wrap.querySelector('textarea');
    var countEl = wrap.querySelector('.tr-count b');
    var debounceTimer = null;
    var lastFlush = Date.now();
    function flushNow() {
      if (cb && cb.onDraft) cb.onDraft(q.id, ta.value);
      else saveDraft(q.id, ta.value);
      lastFlush = Date.now();
    }
    if (!state.disabled) {
      ta.addEventListener('input', function () {
        if (countEl) countEl.textContent = String(countChars(ta.value));
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushNow, 1000);
        var sinceFlush = Date.now() - lastFlush;
        if (sinceFlush > 4500) flushNow();
      });
    }
    return wrap;
  };

  /** ---------- listening（audio + options）---------- */
  RENDERERS.listening = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-listening';
    var html = renderMetaPills(q);
    html += renderStem(q);
    if (q.audioUrl) {
      html += '<audio controls preload="none" class="ls-audio" src="' + escHtml(q.audioUrl) + '"></audio>';
    } else {
      html += '<div class="ls-audio-placeholder">音频待补充（P1 阶段填入真题音频）</div>';
    }
    var ans = state.value;
    var opts = Array.isArray(q.o) ? q.o : [];
    html += '<div class="sc-options">';
    for (var i = 0; i < opts.length; i++) {
      var picked = ans === i;
      var okCls = '';
      if (state.disabled && state.isAnswered) {
        if (i === Number(q.a)) okCls = ' sc-ok';
        else if (picked) okCls = ' sc-bad';
      }
      html += '<button type="button" class="sc-op' + (picked && !state.disabled ? ' sc-picked' : '') + okCls + '"' +
        (state.disabled ? ' disabled' : '') +
        ' data-i="' + i + '">' +
        '<span class="sc-letter">' + 'ABCD'[i] + '</span>' +
        '<span class="sc-text">' + escHtml(opts[i]) + '</span>' +
        '</button>';
    }
    html += '</div>';
    if (state.disabled && state.isAnswered) {
      html += '<div class="mock-feedback">' +
        (Number(ans) === Number(q.a) ? '<b class="mf-ok">回答正确</b>' : '<b class="mf-bad">回答错误，正确答案 ' + 'ABCD'[q.a] + '</b>') +
        (q.x ? '<div class="mf-x">' + escHtml(q.x) + '</div>' : '') +
        '</div>';
    }
    wrap.innerHTML = html;
    if (!state.disabled && cb && cb.onAnswer) {
      wrap.querySelectorAll('.sc-op').forEach(function (btn) {
        btn.addEventListener('click', function () {
          cb.onAnswer(q.id, Number(btn.getAttribute('data-i')));
        });
      });
    }
    return wrap;
  };

  /** ---------- fill_blank（passage + 混合 text/select）---------- */
  RENDERERS.fill_blank = function (q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-fillblank';
    var html = renderMetaPills(q);
    html += renderStem(q);
    var arr = Array.isArray(state.value) ? state.value : [];
    var blanks = Array.isArray(q.blanks) ? q.blanks : [];
    var passage = String(q.passage || '');
    var tokens = passage.split(/(\{\{\d+\}\})/);
    html += '<div class="fb-passage">';
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      var m = /^\{\{(\d+)\}\}$/.exec(tok);
      if (m) {
        var blank = blanks.find(function (b) { return Number(b.index) === Number(m[1]); });
        if (!blank) {
          html += '<span class="fb-blank fb-blank-missing">[?]</span>';
        } else if (blank.blankType === 'select') {
          var curVal = arr[blank.index - 1];
          html += '<select class="fb-sel" data-bi="' + blank.index + '" data-btype="select"' +
            (state.disabled ? ' disabled' : '') + '>';
          html += '<option value="">— 选择 —</option>';
          var opts = blank.options || [];
          for (var oi = 0; oi < opts.length; oi++) {
            var sel = Number(curVal) === oi;
            html += '<option value="' + oi + '"' + (sel ? ' selected' : '') + '>' + escHtml(opts[oi]) + '</option>';
          }
          html += '</select>';
        } else {
          html += '<input type="text" class="fb-inp" data-bi="' + blank.index + '" data-btype="text"' +
            (state.disabled ? ' disabled' : '') +
            ' value="' + escHtml(arr[blank.index - 1] || '') + '" placeholder="填入答案"/>';
        }
      } else {
        html += escHtml(tok);
      }
    }
    html += '</div>';
    if (state.disabled && state.isAnswered) {
      html += '<div class="mock-feedback">';
      blanks.forEach(function (b) {
        var u = arr[b.index - 1];
        var k = b.answer;
        var ok;
        if (b.blankType === 'select') ok = (Number(u) === Number(k));
        else ok = (String(u || '').trim().toLowerCase() === String(k).trim().toLowerCase());
        html += '<div class="fb-fb-row">第 ' + b.index + ' 空：' +
          (ok ? '<b class="mf-ok">正确</b>' : '<b class="mf-bad">错误</b>') +
          (b.explanation ? ' — ' + escHtml(b.explanation) : '') +
          '</div>';
      });
      html += '</div>';
    } else {
      html += '<button type="button" class="xt-btn xt-btn-primary mock-mc-submit" data-act="fb-submit">提交答案</button>';
    }
    wrap.innerHTML = html;
    if (!state.disabled) {
      var submitBtn = wrap.querySelector('[data-act="fb-submit"]');
      if (submitBtn) {
        submitBtn.addEventListener('click', function () {
          wrap.querySelectorAll('[data-bi]').forEach(function (el) {
            var bi = Number(el.getAttribute('data-bi'));
            var v = el.value;
            if (el.getAttribute('data-btype') === 'select') v = v === '' ? null : Number(v);
            arr[bi - 1] = v;
          });
          if (cb && cb.onAnswer) cb.onAnswer(q.id, arr.slice());
        });
      }
      wrap.querySelectorAll('[data-bi]').forEach(function (el) {
        el.addEventListener('change', function () {
          var bi = Number(el.getAttribute('data-bi'));
          var v = el.value;
          if (el.getAttribute('data-btype') === 'select') v = v === '' ? null : Number(v);
          arr[bi - 1] = v;
        });
        el.addEventListener('input', function () {
          var bi = Number(el.getAttribute('data-bi'));
          arr[bi - 1] = el.value;
        });
      });
    }
    return wrap;
  };

  /** ---------- renderUnknown fallback（架构 §1.3：永远不崩）---------- */
  function renderUnknown(q, state, cb) {
    var wrap = document.createElement('div');
    wrap.className = 'mock-q mock-q-unknown';
    wrap.innerHTML = '<div class="mock-meta"><span class="mock-pill mock-pill-type">' +
      escHtml((q && q.type) || 'unknown') + '</span></div>' +
      '<div class="mock-stem">' + escHtml((q && q.q) || '该题型暂未支持，已跳过') + '</div>' +
      '<div class="xt-error" style="margin-top:12px"><div class="xt-error-msg">本题型未实现渲染器，可安全跳过。</div></div>';
    return wrap;
  }

  function countChars(s) {
    if (!s) return 0;
    var cjk = (String(s).match(/[一-龥]/g) || []).length;
    var ascii = String(s).replace(/[一-龥]/g, '').replace(/\s/g, '').length;
    return cjk * 2 + ascii;
  }

  /* ====================================================================
   * AnswerCard（架构 §1.3）
   * 按 stage 分组（写作/听力/阅读/翻译）；class 三种 .ac-unanswered /
   * .ac-answered / .ac-current；点击题号调 onJump(qid)
   * ==================================================================== */

  function renderAnswerCard(container, paper, options) {
    options = options || {};
    var onJump = options.onJump || function () {};
    var stages = ['writing', 'listening', 'reading', 'translation'];
    var stageLabels = { writing: '写作', listening: '听力', reading: '阅读', translation: '翻译' };
    var html = '<div class="ac-pane" data-ac-pane>';
    html += '<div class="ac-head">答题卡</div>';
    var totalAnswered = 0;
    var totalAll = 0;
    stages.forEach(function (stg) {
      var inStage = (paper.questions || []).filter(function (q) { return q.stage === stg; });
      if (!inStage.length) return;
      html += '<div class="ac-group" data-stage="' + stg + '">';
      html += '<div class="ac-group-head">' + stageLabels[stg] + ' <span class="ac-group-count" data-stage-count="' + stg + '">0/' + inStage.length + '</span></div>';
      html += '<div class="ac-group-grid">';
      inStage.forEach(function (q, idx) {
        totalAll++;
        var answered = (_state && _state.answers && _state.answers[q.id] != null);
        if (answered) totalAnswered++;
        var cls = 'ac-item';
        if (answered) cls += ' ac-answered'; else cls += ' ac-unanswered';
        if (_state && _state.currentQid === q.id) cls += ' ac-current';
        html += '<button type="button" class="' + cls + '" data-qid="' + escHtml(q.id) + '" aria-label="第 ' + (idx + 1) + ' 题">' + (idx + 1) + '</button>';
      });
      html += '</div></div>';
    });
    html += '<div class="ac-summary">已答 <b data-ac-answered>' + totalAnswered + '</b> / ' + totalAll + '</div>';
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.ac-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var qid = btn.getAttribute('data-qid');
        onJump(qid);
      });
    });
  }

  function refreshAnswerCard(container) {
    if (!container || !_state || !_paper) return;
    container.querySelectorAll('.ac-item').forEach(function (btn) {
      var qid = btn.getAttribute('data-qid');
      var answered = (_state.answers && _state.answers[qid] != null);
      btn.classList.remove('ac-unanswered', 'ac-answered', 'ac-current');
      if (answered) btn.classList.add('ac-answered'); else btn.classList.add('ac-unanswered');
      if (_state.currentQid === qid) btn.classList.add('ac-current');
    });
    // 更新汇总
    var answered = 0, total = 0;
    _paper.questions.forEach(function (q) {
      total++;
      if (_state.answers[q.id] != null) answered++;
    });
    var sumEl = container.querySelector('[data-ac-answered]');
    if (sumEl) sumEl.textContent = String(answered);
    // 更新每 stage 计数
    var stages = ['writing', 'listening', 'reading', 'translation'];
    stages.forEach(function (stg) {
      var inStage = _paper.questions.filter(function (q) { return q.stage === stg; });
      if (!inStage.length) return;
      var cnt = inStage.filter(function (q) { return _state.answers[q.id] != null; }).length;
      var cEl = container.querySelector('[data-stage-count="' + stg + '"]');
      if (cEl) cEl.textContent = cnt + '/' + inStage.length;
    });
  }

  /* ====================================================================
   * StageProgress（4 pill）
   * ==================================================================== */

  function renderStageProgress(container, currentStage) {
    var stages = ['writing', 'listening', 'reading', 'translation'];
    var labels = { writing: '写作', listening: '听力', reading: '阅读', translation: '翻译' };
    var orderIdx = stages.indexOf(currentStage);
    var html = '<div class="sp-pane" data-sp-pane>';
    stages.forEach(function (stg, i) {
      var cls = 'sp-pill';
      if (i < orderIdx) cls += ' sp-done';
      else if (i === orderIdx) cls += ' sp-active';
      else cls += ' sp-pending';
      html += '<span class="' + cls + '" data-sp="' + stg + '">' +
        '<span class="sp-i">' + (i + 1) + '</span>' +
        '<span class="sp-label">' + labels[stg] + '</span>' +
        '</span>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /* ====================================================================
   * 暴露
   * ==================================================================== */

  window.MockEngine = {
    start: start,
    resume: resume,
    submit: submit,
    tick: tick,
    state: state,
    saveDraft: saveDraft,
    loadDrafts: loadDrafts,
    renderQuestion: renderQuestion,
    renderAnswerCard: renderAnswerCard,
    refreshAnswerCard: refreshAnswerCard,
    renderStageProgress: renderStageProgress,
    gradeObjective: gradeObjective,
    advance: advance,
    currentQuestion: currentQuestion,
    buildRenderState: buildRenderState,
    recordAnswer: recordAnswer,
    rebase: rebase,
    remaining: remaining,
    fmtMMSS: fmtMMSS,
    getRuns: getRuns,
    getBestRun: getBestRun,
    findPaper: findPaper,
    findPaperCategory: findPaperCategory,
    countChars: countChars
  };

})();