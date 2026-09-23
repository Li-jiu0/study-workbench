/* assets/mock-result.js — P0-B T03-05
 * -------------------------------------------------------------------
 * 真题模考 · 成绩页渲染器
 *
 * 公共 API：
 *   window.MockResult = {
 *     render(paperId, runId): void      // 渲染整页；纸 id + run id 来自 URL
 *     bestCompare(paperId, currentRun): { best, delta }  // 历史最佳对比
 *     renderScoreBanner(container, run, paper)
 *     renderStageBreakdown(container, run, paper)
 *     renderQuestionReview(container, run, paper)
 *     renderActionBar(container, paperId)
 *   }
 *
 * 数据来源：localStorage 经 lsKey()（PRD §6.1）：
 *   <user>_study_workbench_mockexam_<paperId>_runs
 *
 * 主观题不显示自动分（PRD §7.2 红线）；仅展示 userAnswer + referenceAnswer
 * 刷新页面数据从 _runs 恢复（PRD §4.3.3 AC-3.3.8）
 * -------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.MockResult) return;

  function lsKey(name) {
    return (typeof window.lsKey === 'function') ? window.lsKey(name) : name;
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { n = Math.floor(Number(n) || 0); return n < 10 ? '0' + n : '' + n; }
  function fmtMMSS(sec) { sec = Math.max(0, Math.floor(Number(sec) || 0)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }

  function getRuns(paperId) {
    try {
      var raw = localStorage.getItem(lsKey('study_workbench_mockexam_' + paperId + '_runs'));
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function findPaper(paperId) {
    return window.MockEngine ? window.MockEngine.findPaper(paperId) : null;
  }

  /** 历史最佳对比 */
  function bestCompare(paperId, currentRun) {
    var runs = getRuns(paperId);
    var best = null;
    runs.forEach(function (r) {
      if (r.runId === currentRun.runId) return; // 排除本次
      if (!best || (Number(r.score) || 0) > (Number(best.score) || 0)) best = r;
    });
    var delta = best ? (Number(currentRun.score) - Number(best.score)) : null;
    return { best: best, delta: delta };
  }

  /** 总分 banner */
  function renderScoreBanner(container, run) {
    var pct = Number(run.score) || 0;
    var cls = pct >= 80 ? 'rb-high' : (pct >= 60 ? 'rb-mid' : 'rb-low');
    var tip = pct >= 80 ? '掌握得不错' : (pct >= 60 ? '可以更好' : '建议复盘错题');
    var html = '' +
      '<div class="rb-score ' + cls + '">' +
        '<div class="rb-num">' + pct + '<span class="rb-unit">分</span></div>' +
        '<div class="rb-sub">答对 <b>' + (run.correct || 0) + '</b> / ' + (run.total || 0) + ' 题 · 用时 ' + fmtMMSS(run.usedSeconds || 0) + '</div>' +
        '<div class="rb-tip">' + tip + '</div>' +
      '</div>';
    container.innerHTML = html;
  }

  /** 各阶段表现卡 */
  function renderStageBreakdown(container, run, paper) {
    var stages = ['writing', 'listening', 'reading', 'translation'];
    var labels = { writing: '写作', listening: '听力', reading: '阅读', translation: '翻译' };
    var stats = run.stageStats || {};
    var html = '<div class="rb-stages">';
    stages.forEach(function (stg) {
      var s = stats[stg] || { correct: 0, total: 0 };
      var pct = s.total ? Math.round((s.correct / s.total) * 100) : null;
      var label = labels[stg];
      var cls = pct == null ? 'rb-skip' : (pct >= 80 ? 'rb-good' : (pct >= 60 ? 'rb-mid' : 'rb-low'));
      var advice;
      if (pct == null) advice = '本卷未涉及此阶段';
      else if (pct >= 80) advice = '稳定发挥，继续保持';
      else if (pct >= 60) advice = '建议多练此阶段真题';
      else advice = '需要补强此阶段基础';
      html += '' +
        '<div class="rb-stage-card ' + cls + '">' +
          '<div class="rb-stage-head">' + label + (pct == null ? '' : ' <span class="rb-stage-pct">' + pct + '%</span>') + '</div>' +
          '<div class="rb-stage-detail">' +
            '<div class="rb-bar"><div class="rb-bar-fill" style="width:' + (pct == null ? 0 : pct) + '%"></div></div>' +
            '<div class="rb-stage-count">' + s.correct + ' / ' + s.total + ' 正确</div>' +
          '</div>' +
          '<div class="rb-stage-advice">' + advice + '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /** 题目回顾列表 */
  function renderQuestionReview(container, run, paper) {
    var qs = paper.questions || [];
    var html = '<div class="rb-review">';
    qs.forEach(function (q, idx) {
      var isSubjective = q.scored === false;
      var tagClass = isSubjective ? 'rb-tag-subj' : 'rb-tag-obj';
      var tagText = isSubjective ? '主观' : '客观';
      var userAns = run.answers ? run.answers[q.id] : null;

      html += '<div class="rb-q-row">' +
        '<div class="rb-q-head">' +
          '<span class="rb-q-tag ' + tagClass + '">' + tagText + '</span>' +
          '<span class="rb-q-no">第 ' + (idx + 1) + ' 题</span>' +
          '<span class="rb-q-type">' + (q.type || '?') + '</span>' +
          '<span class="rb-q-stage">' + (q.stage || '?') + '</span>' +
        '</div>' +
        '<div class="rb-q-stem">' + escHtml(q.q || '') + '</div>';

      if (isSubjective) {
        // 主观题：userAnswer + referenceAnswer（不显示自动分）
        html += '<div class="rb-q-user"><b>你的答案：</b><div class="rb-q-user-body">' +
          (userAns && String(userAns).trim() ? escHtml(String(userAns)) : '<i class="rb-empty">（未作答）</i>') +
        '</div></div>';
        if (q.referenceAnswer) {
          html += '<div class="rb-q-ref"><b>参考答案：</b><div class="rb-q-ref-body">' +
            escHtml(q.referenceAnswer) + '</div></div>';
        }
      } else {
        // 客观题：你的答案 + 正确答案 + 解析
        var correctIdx = q.a;
        var userIdx = userAns;
        var isRight = false;
        if (q.type === 'single_choice' || q.type === 'true_false' || q.type === 'listening') {
          isRight = Number(userIdx) === Number(correctIdx);
        } else if (q.type === 'multiple_choice') {
          var arr = Array.isArray(userIdx) ? userIdx.slice().sort() : [];
          var key = Array.isArray(q.a) ? q.a.slice().sort() : [];
          isRight = arr.length === key.length && arr.every(function (x, i) { return Number(x) === Number(key[i]); });
        } else if (q.type === 'cloze' || q.type === 'fill_blank') {
          if (Array.isArray(userIdx) && Array.isArray(q.blanks)) {
            isRight = q.blanks.every(function (b, i) {
              var u = userIdx[b.index - 1];
              if (b.blankType === 'select') return Number(u) === Number(b.answer);
              return String(u || '').trim().toLowerCase() === String(b.answer).trim().toLowerCase();
            });
          }
        } else if (q.type === 'reading' && Array.isArray(q.subQ)) {
          // reading 子题对：每一项的 gradeObjective 比对（用 userIdx 数组）
          if (Array.isArray(userIdx)) {
            isRight = q.subQ.every(function (sq, si) {
              if (!userIdx[si]) return false;
              if (sq.type === 'single_choice' || sq.type === 'true_false') return Number(userIdx[si]) === Number(sq.a);
              return false;
            });
          }
        }
        var userText = (userIdx == null || userIdx === '' || (Array.isArray(userIdx) && userIdx.length === 0))
          ? '<i class="rb-empty">（未作答）</i>'
          : escHtml(formatAnswer(userIdx, q));
        var correctText = formatAnswer(correctIdx, q);
        html += '' +
          '<div class="rb-q-comp">' +
            '<div class="rb-q-user"><b>你的答案：</b> ' + userText +
              ' <span class="rb-q-mark ' + (isRight ? 'rb-mark-ok' : 'rb-mark-bad') + '">' + (isRight ? '✓ 正确' : '✗ 错误') + '</span>' +
            '</div>' +
            '<div class="rb-q-correct"><b>正确答案：</b> ' + correctText + '</div>' +
            (q.x ? '<div class="rb-q-x"><b>解析：</b>' + escHtml(q.x) + '</div>' : '') +
          '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function formatAnswer(v, q) {
    if (v == null) return '—';
    if (q.type === 'single_choice' || q.type === 'true_false' || q.type === 'listening') {
      var opts = q.o || [];
      if (typeof v === 'number' && opts[v] != null) {
        var letter = (q.type === 'true_false') ? ['✓正确', '✗错误'][v] : 'ABCD'[v];
        return letter + '. ' + escHtml(opts[v]);
      }
      return escHtml(String(v));
    }
    if (q.type === 'multiple_choice') {
      if (!Array.isArray(v)) return escHtml(String(v));
      return v.map(function (i) {
        var letter = 'ABCD'[Number(i)] || '?';
        var text = (q.o || [])[Number(i)] || '';
        return letter + '. ' + escHtml(text);
      }).join(' / ');
    }
    if (q.type === 'cloze' || q.type === 'fill_blank') {
      if (!Array.isArray(v) || !Array.isArray(q.blanks)) return escHtml(JSON.stringify(v));
      return q.blanks.map(function (b, i) {
        var u = v[b.index - 1];
        if (b.blankType === 'select') {
          var letter = 'ABCD'[Number(u)] || '?';
          return '#' + b.index + '=' + letter;
        }
        return '#' + b.index + '=' + escHtml(String(u || ''));
      }).join(' ');
    }
    if (q.type === 'reading' && Array.isArray(v)) {
      return v.map(function (sub, i) {
        return '(' + (i + 1) + ') ' + (sub == null ? '—' : escHtml(String(sub)));
      }).join(' ');
    }
    return escHtml(String(v));
  }

  /** 历史最佳对比 */
  function renderBestCompare(container, paperId, currentRun) {
    var cmp = bestCompare(paperId, currentRun);
    if (!cmp.best) {
      container.innerHTML = '<div class="rb-best rb-best-none">本次是你的首次挑战</div>';
      return;
    }
    var delta = cmp.delta || 0;
    var cls = delta > 0 ? 'rb-up' : (delta < 0 ? 'rb-down' : 'rb-same');
    var arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '=');
    var text = delta > 0 ? ('比历史最佳高 ' + delta + ' 分')
      : (delta < 0 ? ('比历史最佳低 ' + Math.abs(delta) + ' 分')
      : '与历史最佳持平');
    container.innerHTML = '' +
      '<div class="rb-best ' + cls + '">' +
        '<div class="rb-best-head">本次 vs 历史最佳</div>' +
        '<div class="rb-best-body">' +
          '<div class="rb-best-cur"><b>' + (Number(currentRun.score) || 0) + '</b> 分（本次）</div>' +
          '<div class="rb-best-prev"><b>' + (Number(cmp.best.score) || 0) + '</b> 分（最佳）</div>' +
          '<div class="rb-best-delta">' + arrow + ' ' + text + '</div>' +
        '</div>' +
      '</div>';
  }

  /** 操作按钮 */
  function renderActionBar(container, paperId) {
    /* R169-C（2026-09-23）：「返回选卷」改 location.replace —— 替换当前记录而非新增，
       避免成绩页残留在历史栈里，系统返回键撞回成绩/模考页退不出去。「再次挑战」是前进方向，保留 href。 */
    var html = '' +
      '<div class="rb-actions">' +
        '<a class="xt-btn xt-btn-secondary" href="mock_exam.html?cat=' + catFromPaper(paperId) + '" onclick="location.replace(this.href);return false">返回选卷</a>' +
        '<a class="xt-btn xt-btn-primary" href="mock_exam_run.html?paper=' + encodeURIComponent(paperId) + '">再次挑战</a>' +
      '</div>';
    container.innerHTML = html;
  }

  function catFromPaper(paperId) {
    if (!window.MockEngine || typeof window.MockEngine.findPaperCategory !== 'function') return 'cet-mock';
    var cat = window.MockEngine.findPaperCategory(paperId);
    if (cat === 'cet4') return 'cet-mock';
    if (cat === 'exam') return 'exam-mock';
    return 'cet-mock';
  }

  /** 整页渲染入口 */
  function render(paperId, runId) {
    var paper = findPaper(paperId);
    var runs = getRuns(paperId);
    var run = runs.find(function (r) { return r.runId === runId; });
    if (!paper) {
      var errEl = $('errorState');
      if (errEl) errEl.style.display = 'block';
      return;
    }
    if (!run) {
      // 找不到 run：取最后一次 run 作 fallback
      run = runs[runs.length - 1];
      if (!run) {
        // 真没数据：显示空状态
        var emptyEl = $('emptyState');
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }
    }

    // 隐藏 skeleton，显示主体
    var sk = $('skeletonState');
    if (sk) sk.style.display = 'none';
    var main = $('mainContent');
    if (main) main.style.display = 'block';

    // 设置页面标题
    if (typeof document !== 'undefined') {
      document.title = (run.paperTitle || paperId) + ' · 成绩单';
    }

    renderScoreBanner($('scoreBanner'), run);
    renderBestCompare($('bestCompare'), paperId, run);
    renderStageBreakdown($('stageBreakdown'), run, paper);
    renderQuestionReview($('questionReview'), run, paper);
    renderActionBar($('actionBar'), paperId);

    if (typeof window.lucideAutoRender === 'function') window.lucideAutoRender();
  }

  function $(id) { return document.getElementById(id); }

  window.MockResult = {
    render: render,
    bestCompare: bestCompare,
    renderScoreBanner: renderScoreBanner,
    renderStageBreakdown: renderStageBreakdown,
    renderQuestionReview: renderQuestionReview,
    renderActionBar: renderActionBar,
    getRuns: getRuns
  };
})();