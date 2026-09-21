/* =====================================================================
   iv-after.js · A5「面试 · 面试后」输入式复盘渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
   ---------------------------------------------------------------------
   挂载方式（ADR-2 注册表模式）：
     · 注册 XTC.registerView('IVV2', 'iv-after', fn)；宿主页只新增 script 引用。
     · 分发：DOMContentLoaded 里链式包装 window.ivQuizMount，
       catId === 'iv-after' 且数据就绪 → 渲染输入式复盘；否则原样透传旧自测渲染器。
       （与同页 A4 的 iv-prep.js 互不覆盖，装载顺序无关。）
     · 承载形态：沿用宿主页既有页面内视图 #page-iv-after（内含 #ivAfterBody），
       渲染在主内容区而非浮层，符合 ADR-3。
     · 原 6 道复盘选择题（window.__IV_AFTER_LEGACY__）在底部保留为
       「复盘知识自测 · 原 6 题」，题干 / 选项 / 答案 / 解析零删除。
     · 不调用 saveData()；localStorage 键前缀 xtc:lib:ia:recs / :cur / :done
       （★ 独立二级键 xtc:lib:，绝不使用 xtc:learn: 通用契约命名空间）。
     · 每次 innerHTML 后补一次 window.lucideAutoRender()。
     · ES5 语法：无箭头函数 / 无可选链 / 无模板字符串。
   ===================================================================== */
(function () {
  'use strict';

  var VIEW_ID = 'iv-after';
  var REG_NAME = 'IVV2';
  var STYLE_ID = 'iv-after-style-v2';
  var LS_RECS = 'xtc:lib:ia:recs';
  var LS_CUR = 'xtc:lib:ia:cur';
  var LS_DONE = 'xtc:lib:ia:done';
  var MAX_RECS = 30;
  var DEBOUNCE = 500;

  var curKey = 'draft';
  var timer = null;

  /* ==================== helper（IA_ 前缀） ==================== */

  function IA_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function IA_icon(name, size, cls) {
    if (!name) return '';
    return '<span class="nav-icon ' + (cls || '') + '" data-icon="' + IA_esc(name) +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  function IA_hydrate(root) {
    try {
      if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); return; }
    } catch (e) { /* 忽略 */ }
    var X = window.XTC;
    if (X && typeof X.renderIcons === 'function') {
      try { X.renderIcons(root || document); } catch (e2) { /* 忽略 */ }
    }
  }

  function IA_key(k) {
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { /* 忽略 */ }
    }
    return k;
  }

  function IA_get(key, def) {
    try {
      var v = window.localStorage.getItem(IA_key(key));
      if (v === null || v === '') return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }

  function IA_set(key, val) {
    try { window.localStorage.setItem(IA_key(key), JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function IA_toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); return; }
    } catch (e) { /* 忽略 */ }
  }

  function IA_data() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[VIEW_ID];
    if (!d || d.v !== 2 || !d.fields || !d.fields.length) return null;
    return d;
  }

  /* ==================== 样式 ==================== */

  var CSS = [
    '.ia-root{display:flex;flex-direction:column;gap:12px}',
    '.ia-card{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px}',
    '.ia-card h3{margin:0 0 6px;font-size:16px;display:flex;align-items:center;gap:8px}',
    '.ia-card > p{margin:0;font-size:13px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.ia-field{margin-top:14px}',
    '.ia-lb{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--text,#1F2937);margin-bottom:6px}',
    '.ia-lb .nav-icon{color:var(--primary,#5B8DEF)}',
    '.ia-lb em{font-style:normal;font-size:11.5px;font-weight:400;color:var(--text-secondary,#9CA3AF)}',
    '.ia-ta{width:100%;border:1px solid var(--border,#E8ECF0);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.8;color:var(--text,#1F2937);background:var(--card,#fff);resize:vertical;box-sizing:border-box;font-family:inherit}',
    '.ia-ta:focus{outline:none;border-color:var(--primary,#5B8DEF)}',
    '.ia-tip{font-size:11.5px;color:var(--text-secondary,#9CA3AF);margin-top:5px;line-height:1.6}',
    '.ia-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
    '.ia-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border,#E8ECF0);background:var(--card,#fff);color:var(--text-secondary,#6B7280);border-radius:9px;padding:6px 12px;font-size:12.5px;cursor:pointer;line-height:1.4}',
    '.ia-btn em{font-style:normal}',
    '.ia-btn:hover{border-color:var(--primary,#5B8DEF);color:var(--primary,#5B8DEF)}',
    '.ia-btn.pri{background:var(--primary,#5B8DEF);border-color:var(--primary,#5B8DEF);color:#fff}',
    '.ia-btn.pri:hover{background:var(--primary-dark,#3D6FD6);color:#fff}',
    '.ia-rule{border:1px solid var(--border,#E8ECF0);border-radius:12px;padding:12px 14px;margin-top:10px;background:var(--card,#fff)}',
    '.ia-rule-h{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--text,#1F2937)}',
    '.ia-rule-h .nav-icon{color:var(--danger,#E05040)}',
    '.ia-rule-why{font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280);margin:6px 0 8px}',
    '.ia-act{display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border:1px solid var(--border,#E8ECF0);border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:12.5px;line-height:1.65;color:var(--text,#1F2937)}',
    '.ia-act:hover{border-color:var(--primary,#5B8DEF)}',
    '.ia-act.on{background:#E8F5E9;border-color:#2E7D32}',
    '.ia-box{flex:none;width:16px;height:16px;border-radius:5px;border:1px solid var(--border,#E8ECF0);display:inline-flex;align-items:center;justify-content:center;margin-top:2px}',
    '.ia-act.on .ia-box{background:#2E7D32;border-color:#2E7D32;color:#fff}',
    '.ia-act b{display:block;margin-bottom:2px}',
    '.ia-act span.d{color:var(--text-secondary,#6B7280)}',
    '.ia-empty{padding:18px 0;text-align:center;font-size:12.5px;color:var(--text-secondary,#9CA3AF)}',
    '.ia-rec{display:flex;gap:8px;align-items:center;border:1px solid var(--border,#E8ECF0);border-radius:10px;padding:8px 11px;margin-bottom:6px;font-size:12.5px;color:var(--text,#1F2937)}',
    '.ia-rec b{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ia-rec span.d{color:var(--text-secondary,#9CA3AF);font-size:11.5px;flex:none}',
    '.ia-mini{border:none;background:transparent;color:var(--text-secondary,#6B7280);font-size:12px;cursor:pointer;padding:2px 4px}',
    '.ia-mini:hover{color:var(--primary,#5B8DEF)}',
    '.ia-mini.dg:hover{color:var(--danger,#C62828)}',
    '.ia-guide{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px}',
    '.ia-guide h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:7px}',
    '.ia-guide p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.ia-guide ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.ia-legacy{border-top:1px dashed var(--border,#E8ECF0);padding-top:12px}',
    '.ia-credit{font-size:12px;line-height:1.6;color:var(--text-secondary,#9CA3AF)}',
    '.ia-sum{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text-secondary,#6B7280)}',
    '.ia-pill{background:var(--primary-light,#E6F0FF);color:var(--primary-dark,#3D6FD6);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600}'
  ].join('\n');

  function IA_injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') st.styleSheet.cssText = CSS;
    else st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 复盘记录存储 ==================== */

  function IA_recs() {
    var v = IA_get(LS_RECS, []);
    return (v && v.length) ? v : [];
  }

  function IA_fields() {
    var v = IA_get(LS_CUR, {});
    return (v && typeof v === 'object') ? v : {};
  }

  function IA_doneMap() {
    var v = IA_get(LS_DONE, {});
    return (v && typeof v === 'object') ? v : {};
  }

  function IA_isDone(akey) {
    var m = IA_doneMap();
    return !!(m[curKey + ':' + akey]);
  }

  function IA_toggleDone(akey) {
    var m = IA_doneMap();
    var k = curKey + ':' + akey;
    if (m[k]) delete m[k]; else m[k] = 1;
    IA_set(LS_DONE, m);
    return !!m[k];
  }

  /* ==================== 改进清单生成 ==================== */

  function IA_lines(text) {
    var arr = String(text || '').split(/\r?\n/);
    var out = [], i;
    for (i = 0; i < arr.length; i++) {
      var s = String(arr[i] || '').replace(/^\s*\d+[.、)]\s*/, '').replace(/^[-·•]\s*/, '').trim();
      if (s.length >= 2) out.push(s);
    }
    return out;
  }

  function IA_matchRules(fields, data) {
    var hay = String((fields.asked || '') + '\n' + (fields.stuck || '') + '\n' + (fields.improve || ''));
    var rules = data.rules || [];
    var hits = [], i, j;
    for (i = 0; i < rules.length; i++) {
      var kws = rules[i].kws || [];
      var hit = 0;
      for (j = 0; j < kws.length; j++) {
        if (hay.indexOf(kws[j]) !== -1) hit++;
      }
      if (hit) hits.push({ rule: rules[i], score: hit });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    /* 最多取 3 组专项，避免一次给出十几条反而没人执行 */
    return hits.slice(0, 3);
  }

  /** 生成改进清单：[{group:'标题', source, acts:[{key,t,d}]}] */
  function IA_buildPlan(fields, data) {
    var plan = [];
    var hits = IA_matchRules(fields, data);

    /* ① 自动命中专项规则 */
    if (hits.length) {
      var acts = [], i, j;
      for (i = 0; i < hits.length; i++) {
        var r = hits[i].rule;
        var list = r.actions || [];
        var sub = [];
        for (j = 0; j < list.length; j++) {
          sub.push({ key: r.id + ':' + j, t: list[j].t, d: list[j].d });
        }
        plan.push({ group: r.name, icon: r.icon || 'target', why: r.why, acts: sub });
      }
    } else {
      var fb = data.fallback;
      if (fb) {
        var fa = [], m;
        for (m = 0; m < (fb.actions || []).length; m++) {
          fa.push({ key: fb.id + ':' + m, t: fb.actions[m].t, d: fb.actions[m].d });
        }
        plan.push({ group: fb.name, icon: fb.icon || 'lightbulb', why: fb.why, acts: fa });
      }
    }

    /* ② 针对每一条卡壳题，落到具体的重写动作 */
    var stuckLines = IA_lines(fields.stuck);
    if (stuckLines.length) {
      var sa = [], k;
      for (k = 0; k < stuckLines.length && k < 6; k++) {
        sa.push({
          key: 'stuck:' + k,
          t: '重写「' + stuckLines[k].slice(0, 24) + '」的答案',
          d: '按 60 秒口述量写一版（200 字以内），写清"卡在哪一步"，然后找人说一遍——书面能写、开口就卡，说明还没练够。'
        });
      }
      plan.push({ group: '针对你记录的 ' + stuckLines.length + ' 处卡壳', icon: 'alert-triangle', why: '每一处卡壳都要落成一个可执行的重写动作，否则下一次还会在同一个地方掉链子。', acts: sa });
    }

    /* ③ 你自己写的三条（优先） */
    var myLines = IA_lines(fields.improve);
    if (myLines.length) {
      var ma = [], n;
      for (n = 0; n < myLines.length && n < 6; n++) {
        ma.push({
          key: 'mine:' + n,
          t: myLines[n].slice(0, 30),
          d: '这是你自己定的动作，优先级高于系统建议。给它加一个截止日期才算真正落地。'
        });
      }
      plan.push({ group: '你自己定的 ' + myLines.length + ' 条（最高优先级）', icon: 'pen', why: '你自己最清楚当时掉在哪个环节，这几条的执行率通常最高。', acts: ma });
    }

    /* ④ 兜底基础动作 */
    var base = data.baseActions || [];
    if (base.length) {
      var ba = [], b;
      for (b = 0; b < base.length; b++) {
        ba.push({ key: 'base:' + b, t: base[b].t, d: base[b].d });
      }
      plan.push({ group: '每次面试后都该做的三件事', icon: 'check-circle', why: '无论这次表现得如何，这三件事的固定收益最稳定。', acts: ba });
    }
    return plan;
  }

  function IA_planFlat(plan) {
    var all = [], i, j;
    for (i = 0; i < plan.length; i++) {
      for (j = 0; j < plan[i].acts.length; j++) all.push(plan[i].acts[j]);
    }
    return all;
  }

  function IA_planToText(fields, plan) {
    var lines = ['【面试复盘 · 改进清单】'];
    if (fields.meta) lines.push('面试：' + fields.meta);
    lines.push('生成时间：' + new Date().toLocaleString('zh-CN'));
    lines.push('');
    var i, j;
    for (i = 0; i < plan.length; i++) {
      lines.push('■ ' + plan[i].group);
      for (j = 0; j < plan[i].acts.length; j++) {
        lines.push('  □ ' + plan[i].acts[j].t);
        lines.push('    ' + plan[i].acts[j].d);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  /* ==================== 片段 ==================== */

  function IA_planHtml(plan) {
    var h = '', i, j;
    for (i = 0; i < plan.length; i++) {
      var g = plan[i];
      h += '<div class="ia-rule">';
      h += '<div class="ia-rule-h">' + IA_icon(g.icon, 15) + IA_esc(g.group) + '</div>';
      h += '<div class="ia-rule-why">' + IA_esc(g.why || '') + '</div>';
      for (j = 0; j < g.acts.length; j++) {
        var a = g.acts[j];
        var on = IA_isDone(a.key);
        h += '<div class="ia-act' + (on ? ' on' : '') + '" data-act="done" data-k="' + IA_esc(a.key) + '">' +
          '<span class="ia-box">' + IA_icon(on ? 'check' : '', 12) + '</span>' +
          '<div><b>' + IA_esc(a.t) + '</b><span class="d">' + IA_esc(a.d) + '</span></div></div>';
      }
      h += '</div>';
    }
    return h;
  }

  function IA_recsHtml(recs) {
    if (!recs.length) return '<div class="ia-empty">还没有保存的复盘。填完四栏点「保存这条复盘」，下次面试前回来翻一遍。</div>';
    var h = '', i;
    for (i = 0; i < recs.length; i++) {
      var r = recs[i] || {};
      var title = IA_esc(String(r.meta || '').trim() || '未命名的复盘');
      var d = r.ts ? new Date(r.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      h += '<div class="ia-rec">' +
        IA_icon('notebook', 14) +
        '<b title="' + title + '">' + title + '</b>' +
        '<span class="d">' + IA_esc(d) + '</span>' +
        '<button type="button" class="ia-mini" data-act="load" data-rid="' + IA_esc(r.id) + '">载入</button>' +
        '<button type="button" class="ia-mini dg" data-act="del" data-rid="' + IA_esc(r.id) + '">删除</button>' +
        '</div>';
    }
    return h;
  }

  /* ==================== 主渲染 ==================== */

  function IA_render(bodyEl) {
    if (!bodyEl) return;
    IA_injectStyle();

    var data = IA_data();
    if (!data) {
      bodyEl.innerHTML = '<div class="ia-root"><div class="ia-card">' +
        '<p>面试后复盘数据未加载（请确认 assets/data-iv-after.js 已在 assets/mini-interview.js 之后引入）</p></div></div>';
      IA_hydrate(bodyEl);
      return;
    }
    var X = window.XTC;
    var fields = data.fields || [];
    var saved = IA_fields();
    var i;

    var html = '';
    html += '<div class="ia-root">';
    html += '<div class="ia-card" id="iaHero"></div>';

    /* 表单 */
    html += '<div class="ia-card">';
    html += '<h3>' + IA_icon('edit', 17) + '这次面试，把四栏填完</h3>';
    for (i = 0; i < fields.length; i++) {
      var f = fields[i];
      html += '<div class="ia-field">';
      html += '<div class="ia-lb">' + IA_icon(f.icon, 15) + IA_esc(f.label) +
        (f.opt ? ' <em>（选填）</em>' : '') + '</div>';
      html += '<textarea class="ia-ta" data-f="' + IA_esc(f.k) + '" rows="' + (f.rows || 3) +
        '" maxlength="' + (f.max || 1000) + '" placeholder="' + IA_esc(f.ph || '') + '">' +
        IA_esc(saved[f.k] || '') + '</textarea>';
      if (f.tip) html += '<div class="ia-tip">' + IA_esc(f.tip) + '</div>';
      html += '</div>';
    }
    html += '<div class="ia-acts">';
    html += '<button type="button" class="ia-btn pri" data-act="save">' + IA_icon('save', 14) + '<em>保存这条复盘</em></button>';
    html += '<button type="button" class="ia-btn" data-act="gen">' + IA_icon('rotate-ccw', 14) + '<em>刷新改进清单</em></button>';
    html += '<button type="button" class="ia-btn" data-act="copy">' + IA_icon('clipboard', 14) + '<em>复制清单文本</em></button>';
    html += '<button type="button" class="ia-btn" data-act="new">' + IA_icon('plus', 14) + '<em>开一份新的</em></button>';
    html += '</div>';
    html += '<div class="ia-sum" id="iaSum"></div>';
    html += '</div>';

    /* 清单 */
    html += '<div class="ia-card">';
    html += '<h3>' + IA_icon('clipboard-list', 17) + '自动生成的改进清单</h3>';
    html += '<p>根据你填的第①、③栏关键词匹配规则库生成；点任意一条打勾，状态保存在本机。</p>';
    html += '<div id="iaPlan"></div>';
    html += '</div>';

    /* 历史记录 */
    html += '<div class="ia-card">';
    html += '<h3>' + IA_icon('notebook', 17) + '我的复盘记录（本机保存，最多 ' + MAX_RECS + ' 条）</h3>';
    html += '<div id="iaRecs"></div>';
    html += '</div>';

    if (data.guide) {
      html += '<div class="ia-guide">' +
        '<h4>' + IA_icon(data.guide.icon || 'lightbulb', 16) + IA_esc(data.guide.title || '') + '</h4>' +
        '<p>' + IA_esc(data.guide.body || '') + '</p><ol>';
      var steps = data.guide.steps || [];
      for (i = 0; i < steps.length; i++) html += '<li>' + IA_esc(steps[i]) + '</li>';
      html += '</ol></div>';
    }
    html += '<div class="ia-legacy"><div id="iaLegacyQuiz"></div></div>';
    html += '<div class="ia-credit">' + IA_esc(data.credit || '') + '</div>';
    html += '</div>';

    bodyEl.innerHTML = html;

    /* 头部 */
    var heroEl = document.getElementById('iaHero');
    if (heroEl) {
      if (X && typeof X.hero === 'function') {
        try {
          X.hero(heroEl, {
            icon: 'inbox',
            title: data.t || '面试后复盘',
            sub: data.intro || '',
            tags: ['输入式复盘 · 自动出改进清单'],
            credit: false
          });
        } catch (e) { heroEl.innerHTML = '<h3>' + IA_esc(data.t || '') + '</h3>'; }
      } else {
        heroEl.innerHTML = '<h3>' + IA_icon('inbox', 18) + IA_esc(data.t || '') + '</h3>' +
          '<p>' + IA_esc(data.intro || '') + '</p>';
      }
    }

    /* 原 6 道复盘选择题（零删除） */
    var legacyBox = document.getElementById('iaLegacyQuiz');
    if (legacyBox) {
      var legacy = data.legacyQuiz || window.__IV_AFTER_LEGACY__ || [];
      var okLegacy = false;
      if (X && typeof X.renderQuiz === 'function' && legacy.length) {
        try {
          X.renderQuiz(legacyBox, legacy, { title: '复盘知识自测 · 原 6 题（保留题库）', credit: false });
          okLegacy = true;
        } catch (e) { okLegacy = false; }
      }
      if (!okLegacy) {
        legacyBox.innerHTML = legacy.length
          ? '<div class="ia-tip">共 ' + legacy.length + ' 道原题（渲染器尚未就绪）</div>'
          : '<div class="ia-tip">原题库未加载</div>';
      }
    }

    IA_refresh(data);
    IA_bind(data);
    IA_hydrate(bodyEl);
  }

  function IA_readFields(data) {
    var out = {};
    var fields = data.fields || [];
    var i;
    for (i = 0; i < fields.length; i++) {
      var el = document.querySelector('.ia-root [data-f="' + fields[i].k + '"]');
      if (el) out[fields[i].k] = el.value || '';
      else out[fields[i].k] = (IA_fields()[fields[i].k] || '');
    }
    return out;
  }

  function IA_refresh(data) {
    var fields = IA_readFields(data);
    IA_set(LS_CUR, fields);
    var plan = IA_buildPlan(fields, data);
    var box = document.getElementById('iaPlan');
    if (box) box.innerHTML = plan.length ? IA_planHtml(plan) : '<div class="ia-empty">先在第③栏写下卡在哪，清单会自动生成。</div>';
    var recs = IA_recs();
    var rbox = document.getElementById('iaRecs');
    if (rbox) rbox.innerHTML = IA_recsHtml(recs);

    var flat = IA_planFlat(plan);
    var doneN = 0, i;
    for (i = 0; i < flat.length; i++) if (IA_isDone(flat[i].key)) doneN++;
    var sum = document.getElementById('iaSum');
    if (sum) {
      sum.innerHTML = '<span class="ia-pill">改进项 ' + flat.length + '</span>' +
        '<span class="ia-pill">已落实 ' + doneN + '</span>' +
        '<span class="ia-pill">复盘记录 ' + recs.length + '</span>';
    }
    IA_hydrate(box);
    return { fields: fields, plan: plan };
  }

  function IA_bind(data) {
    var root = document.querySelector('.ia-root');
    if (!root || root.getAttribute('data-bound')) return;
    root.setAttribute('data-bound', '1');

    /* 输入自动刷新（防抖，让清单"自动生成"） */
    root.addEventListener('input', function (ev) {
      var t = ev.target || ev.srcElement;
      if (!t || !t.getAttribute || !t.getAttribute('data-f')) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        timer = null;
        IA_refresh(data);
      }, DEBOUNCE);
    });

    root.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      var node = null;
      while (t && t !== root) {
        if (t.getAttribute && t.getAttribute('data-act')) { node = t; break; }
        t = t.parentNode;
      }
      if (!node) return;
      var act = node.getAttribute('data-act');

      if (act === 'done') {
        var k = node.getAttribute('data-k');
        IA_toggleDone(k);
        IA_refresh(data);
        return;
      }
      if (act === 'gen') {
        IA_refresh(data);
        IA_toast('已按当前内容重新生成改进清单');
        return;
      }
      if (act === 'new') {
        IA_set(LS_CUR, {});
        curKey = 'draft';
        var f = data.fields || [];
        for (var i = 0; i < f.length; i++) {
          var el = document.querySelector('.ia-root [data-f="' + f[i].k + '"]');
          if (el) el.value = '';
        }
        IA_refresh(data);
        IA_toast('已清空输入，可以开一份新的复盘');
        return;
      }
      if (act === 'copy') {
        IA_copy(IA_planToText(IA_readFields(data), IA_buildPlan(IA_readFields(data), data)));
        return;
      }
      if (act === 'save') {
        IA_save(data);
        return;
      }
      if (act === 'load') {
        IA_load(node.getAttribute('data-rid'), data);
        return;
      }
      if (act === 'del') {
        IA_del(node.getAttribute('data-rid'), data);
        return;
      }
    });
  }

  function IA_copy(text) {
    var doneOk = false;
    try {
      if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
        window.navigator.clipboard.writeText(String(text || '')).then(
          function () { IA_toast('改进清单已复制，可粘贴进备忘录'); },
          function () { doneOk = IA_fallbackCopy(text); IA_toast(doneOk ? '已复制' : '复制失败，请手动选择'); }
        );
        return;
      }
    } catch (e) { /* 忽略 */ }
    doneOk = IA_fallbackCopy(text);
    IA_toast(doneOk ? '改进清单已复制，可粘贴进备忘录' : '复制失败，请手动选择');
  }

  function IA_fallbackCopy(text) {
    var ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = String(text || '');
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, String(text || '').length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
      return false;
    }
  }

  function IA_save(data) {
    var fields = IA_readFields(data);
    var hasText = (fields.asked || '').trim() || (fields.stuck || '').trim() || (fields.good || '').trim() || (fields.improve || '').trim();
    if (!hasText) { IA_toast('至少填一栏再保存'); return; }
    var recs = IA_recs();
    var now = Date.now();
    var id = 'r-' + now;
    var rec = {
      id: id, ts: now,
      meta: String(fields.meta || '').trim() || ('复盘 ' + new Date(now).toLocaleDateString('zh-CN')),
      fields: fields
    };
    recs.unshift(rec);
    if (recs.length > MAX_RECS) recs = recs.slice(0, MAX_RECS);
    if (IA_set(LS_RECS, recs)) {
      curKey = id;
      IA_toast('已保存：' + rec.meta + '（本机存储，未上传）');
    } else {
      IA_toast('保存失败，可能是本地存储空间已满');
    }
    IA_refresh(data);
  }

  function IA_load(rid, data) {
    var recs = IA_recs(), i;
    for (i = 0; i < recs.length; i++) {
      if (recs[i].id === rid) {
        IA_set(LS_CUR, recs[i].fields || {});
        curKey = rid;
        var f = data.fields || [];
        for (var j = 0; j < f.length; j++) {
          var el = document.querySelector('.ia-root [data-f="' + f[j].k + '"]');
          if (el) el.value = (recs[i].fields || {})[f[j].k] || '';
        }
        IA_refresh(data);
        IA_toast('已载入：' + (recs[i].meta || ''));
        return;
      }
    }
    IA_toast('这条记录已不存在');
  }

  function IA_del(rid, data) {
    var recs = IA_recs();
    var next = [], i;
    for (i = 0; i < recs.length; i++) { if (recs[i].id !== rid) next.push(recs[i]); }
    if (next.length === recs.length) { IA_toast('这条记录已不存在'); return; }
    IA_set(LS_RECS, next);
    if (curKey === rid) { curKey = 'draft'; IA_set(LS_CUR, {}); }
    IA_refresh(data);
    IA_toast('已删除该条复盘记录');
  }

  /* ==================== 注册 + 分发（ADR-2） ==================== */

  function IA_register() {
    if (window.XTC && typeof window.XTC.registerView === 'function') {
      window.XTC.registerView(REG_NAME, VIEW_ID, IA_render);
    } else {
      window.IVV2 = window.IVV2 || {};
      window.IVV2[VIEW_ID] = IA_render;
    }
  }

  IA_register();

  function IA_openV2(bodyEl) {
    if (!bodyEl) return false;
    if (window.XTC && typeof window.XTC.dispatchView === 'function') {
      return window.XTC.dispatchView(REG_NAME, VIEW_ID, bodyEl);
    }
    if (window.IVV2 && typeof window.IVV2[VIEW_ID] === 'function') {
      try { bodyEl.innerHTML = ''; window.IVV2[VIEW_ID](bodyEl); return true; } catch (e) { return false; }
    }
    return false;
  }

  function IA_boot() {
    var legacy = window.ivQuizMount;
    if (typeof legacy !== 'function') {
      if (window.console && console.warn) console.warn('[IVV2] legacy ivQuizMount 未就绪，跳过 iv-after 包装');
      return;
    }
    window.ivQuizMount = function (catId, bodyId) {
      if (catId === VIEW_ID) {
        var body = document.getElementById(bodyId);
        if (body) {
          body.dataset.ivqMounted = '1';
          try {
            if (IA_openV2(body)) {
              var cnt = document.getElementById(bodyId === 'ivAfterBody' ? 'ivAfterCount' : '');
              if (cnt) cnt.textContent = '输入式复盘';
              return true;
            }
          } catch (e) {
            if (window.console && console.error) console.error('[IVV2] iv-after 渲染失败，回退旧路径', e);
          }
        }
      }
      return legacy.apply(this, arguments);
    };
    window.ivQuizMount.__ivaPatched = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', IA_boot);
  else IA_boot();

  window.IvAfter = {
    version: '2.0.0',
    render: IA_render,
    open: IA_openV2,
    buildPlan: function (fields, data) { return IA_buildPlan(fields || {}, data || IA_data() || {}); },
    keys: { recs: LS_RECS, cur: LS_CUR, done: LS_DONE, reg: REG_NAME, view: VIEW_ID }
  };
})();
