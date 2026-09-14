/* =====================================================================
   iv-prep.js · A4「面试 · 面试准备」渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
   ---------------------------------------------------------------------
   挂载方式（ADR-2 注册表模式）：
     · 注册 XTC.registerView('IVV2', 'iv-prep', fn)；宿主页只新增 script 引用。
     · 分发：本文件在 DOMContentLoaded 里包一层 window.ivQuizMount（链式包装，
       与同页 A5 的 iv-after.js 互不影响，装载顺序无所谓）：
       catId === 'iv-prep' 且数据就绪 → 渲染三件套；否则原样透传旧自测渲染器。
     · 承载形态：沿用宿主页既有的页面内视图 #page-iv-prep（内有 #ivPrepBody 挂载点），
       渲染在主内容区而非浮层，符合 ADR-3「内容资产禁止用弹窗承载」。
     · 原 8 道四选一（window.__IV_PREP_LEGACY__）在本视图底部保留为
       「准备知识自测 · 原 8 题」，题干/选项/答案/解析零删除。
     · 不调用 saveData()；localStorage 键前缀 xtc:lib:ip:<id>:ans / :chk
       （★ 独立二级键 xtc:lib:，绝不使用 xtc:learn: 通用契约命名空间）。
     · 每次 innerHTML 后补一次 window.lucideAutoRender()（icon-map 只扫一次）。
     · ES5 语法：无箭头函数 / 无可选链 / 无模板字符串。
   ===================================================================== */
(function () {
  'use strict';

  var VIEW_ID = 'iv-prep';
  var REG_NAME = 'IVV2';
  var STYLE_ID = 'iv-prep-style-v2';
  var LS_PREFIX = 'xtc:lib:ip:';
  var MIN_ANSWER = 20;         // 计入「已练」的最少字数
  var OPEN_MAP = {};           // 手风琴展开态（会话内）

  /* ==================== helper（IP_ 前缀） ==================== */

  function IP_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function IP_icon(name, size, cls) {
    if (!name) return '';
    return '<span class="nav-icon ' + (cls || '') + '" data-icon="' + IP_esc(name) +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  function IP_hydrate(root) {
    try {
      if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); return; }
    } catch (e) { /* 忽略 */ }
    var X = window.XTC;
    if (X && typeof X.renderIcons === 'function') {
      try { X.renderIcons(root || document); } catch (e2) { /* 忽略 */ }
    }
  }

  function IP_key(id, kind) {
    var k = LS_PREFIX + String(id) + ':' + kind;
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { /* 忽略 */ }
    }
    return k;
  }

  function IP_get(key, def) {
    try {
      var v = window.localStorage.getItem(key);
      if (v === null || v === '') return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }

  function IP_set(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function IP_answer(id) {
    var v = IP_get(IP_key(id, 'ans'), null);
    if (!v || typeof v !== 'object') return { text: '', ts: 0 };
    return { text: String(v.text || ''), ts: parseInt(v.ts, 10) || 0 };
  }

  function IP_chk(id, len) {
    var v = IP_get(IP_key(id, 'chk'), []);
    var arr = [];
    for (var i = 0; i < len; i++) arr.push(v[i] ? 1 : 0);
    return arr;
  }

  function IP_countDone(items) {
    var done = 0, i;
    for (i = 0; i < items.length; i++) {
      if (IP_answer(items[i].id).text.replace(/\s/g, '').length >= MIN_ANSWER) done++;
    }
    return done;
  }

  function IP_toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); return; }
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 朗读（Web Speech API，不可用时降级为提示） ---------- */

  var SPEAKING_ID = '';

  function IP_speakSupported() {
    return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  }

  function IP_speak(text, id, btn) {
    if (!IP_speakSupported()) { IP_toast('当前浏览器不支持朗读，可直接阅读或复制文本'); return; }
    try {
      if (SPEAKING_ID === id) {
        window.speechSynthesis.cancel();
        SPEAKING_ID = '';
        if (btn) btn.className = 'ip-btn';
        return;
      }
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(String(text || ''));
      u.lang = 'zh-CN';
      u.rate = 1;
      u.pitch = 1;
      u.onend = function () {
        SPEAKING_ID = '';
        if (btn) btn.className = 'ip-btn';
      };
      u.onerror = function () {
        SPEAKING_ID = '';
        if (btn) btn.className = 'ip-btn';
        IP_toast('朗读失败，可直接阅读或复制文本');
      };
      SPEAKING_ID = id;
      if (btn) btn.className = 'ip-btn on';
      window.speechSynthesis.speak(u);
    } catch (e) {
      IP_toast('朗读失败，可直接阅读或复制文本');
    }
  }

  function IP_stopSpeak() {
    if (IP_speakSupported()) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
    }
    SPEAKING_ID = '';
  }

  function IP_copy(text) {
    var ok = false;
    try {
      if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
        window.navigator.clipboard.writeText(String(text || '')).then(
          function () { IP_toast('示范回答已复制到剪贴板'); },
          function () { ok = IP_fallbackCopy(text); IP_toast(ok ? '示范回答已复制' : '复制失败，请手动选中复制'); }
        );
        return;
      }
    } catch (e) { /* file:// 下 clipboard 常不可用 */ }
    ok = IP_fallbackCopy(text);
    IP_toast(ok ? '示范回答已复制' : '复制失败，请手动选中复制');
  }

  function IP_fallbackCopy(text) {
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

  /* ==================== 数据 ==================== */

  function IP_data() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[VIEW_ID];
    if (!d || d.v !== 2 || !d.items || !d.items.length) return null;
    return d;
  }

  /* ==================== 样式 ==================== */

  var CSS = [
    '.ip-root{display:flex;flex-direction:column;gap:12px}',
    '.ip-hero{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px}',
    '.ip-hero h3{margin:0 0 6px;font-size:16px;display:flex;align-items:center;gap:8px}',
    '.ip-hero p{margin:0;font-size:13px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.ip-hero-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.ip-item{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;overflow:hidden}',
    '.ip-head{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;cursor:pointer}',
    '.ip-head:hover{background:var(--bg,#F5F7FA)}',
    '.ip-ic{flex:none;width:34px;height:34px;border-radius:10px;background:var(--primary-light,#E6F0FF);color:var(--primary,#5B8DEF);display:inline-flex;align-items:center;justify-content:center}',
    '.ip-hmain{flex:1;min-width:0}',
    '.ip-q{font-size:14px;font-weight:600;line-height:1.6;color:var(--text,#1F2937)}',
    '.ip-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}',
    '.ip-tag{font-size:11.5px;padding:2px 8px;border-radius:8px;background:var(--primary-light,#E6F0FF);color:var(--primary-dark,#3D6FD6)}',
    '.ip-tag.g{background:#E8F5E9;color:#2E7D32}',
    '.ip-fold{flex:none;font-size:12px;color:var(--text-secondary,#9CA3AF);display:flex;align-items:center;gap:3px}',
    '.ip-body{border-top:1px dashed var(--border,#E8ECF0);padding:12px 14px 14px}',
    '.ip-sec{margin-bottom:14px}',
    '.ip-sec-h{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:7px;color:var(--text,#1F2937)}',
    '.ip-sec-h .nav-icon{color:var(--primary,#5B8DEF)}',
    '.ip-abbr{font-size:12px;color:var(--text-secondary,#9CA3AF);margin-left:6px;font-weight:400}',
    '.ip-ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.ip-sample{background:var(--bg,#F5F7FA);border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.85;color:var(--text,#1F2937);white-space:pre-wrap}',
    '.ip-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '.ip-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border,#E8ECF0);background:var(--card,#fff);color:var(--text-secondary,#6B7280);border-radius:9px;padding:5px 11px;font-size:12.5px;cursor:pointer;line-height:1.4}',
    '.ip-btn em{font-style:normal}',
    '.ip-btn:hover{border-color:var(--primary,#5B8DEF);color:var(--primary,#5B8DEF)}',
    '.ip-btn.on{background:var(--primary-light,#E6F0FF);border-color:var(--primary,#5B8DEF);color:var(--primary-dark,#3D6FD6)}',
    '.ip-ta{width:100%;min-height:110px;border:1px solid var(--border,#E8ECF0);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.8;color:var(--text,#1F2937);background:var(--card,#fff);resize:vertical;box-sizing:border-box;font-family:inherit}',
    '.ip-ta:focus{outline:none;border-color:var(--primary,#5B8DEF)}',
    '.ip-hint{font-size:11.5px;color:var(--text-secondary,#9CA3AF);margin-top:6px}',
    '.ip-chk{display:flex;gap:9px;align-items:flex-start;padding:7px 10px;border:1px solid var(--border,#E8ECF0);border-radius:10px;margin-bottom:6px;cursor:pointer;font-size:12.5px;line-height:1.6;color:var(--text,#1F2937);background:var(--card,#fff)}',
    '.ip-chk:hover{border-color:var(--primary,#5B8DEF)}',
    '.ip-chk.on{background:#E8F5E9;border-color:#2E7D32}',
    '.ip-box{flex:none;width:16px;height:16px;border-radius:5px;border:1px solid var(--border,#E8ECF0);display:inline-flex;align-items:center;justify-content:center;margin-top:1px}',
    '.ip-chk.on .ip-box{background:#2E7D32;border-color:#2E7D32;color:#fff}',
    '.ip-from{font-size:11.5px;color:var(--text-secondary,#9CA3AF);margin-top:8px}',
    '.ip-guide{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px}',
    '.ip-guide h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:7px}',
    '.ip-guide p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--text-secondary,#6B7280)}',
    '.ip-guide ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9;color:var(--text-secondary,#6B7280)}',
    '.ip-legacy{border-top:1px dashed var(--border,#E8ECF0);padding-top:12px}',
    '.ip-credit{font-size:12px;line-height:1.6;color:var(--text-secondary,#9CA3AF)}'
  ].join('\n');

  function IP_injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') st.styleSheet.cssText = CSS;
    else st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 片段 ==================== */

  function IP_itemHtml(it, idx, expanded) {
    var ans = IP_answer(it.id);
    var chks = IP_chk(it.id, (it.checklist || []).length);
    var chkDone = 0;
    var i;
    for (i = 0; i < chks.length; i++) if (chks[i]) chkDone++;

    var h = '';
    h += '<div class="ip-item" data-id="' + IP_esc(it.id) + '" data-open="' + (expanded ? '1' : '0') + '">';
    h += '<div class="ip-head" data-act="fold" data-id="' + IP_esc(it.id) + '">';
    h += '<span class="ip-ic">' + IP_icon(it.icon || 'mic', 17) + '</span>';
    h += '<div class="ip-hmain"><div class="ip-q">' + (idx + 1) + '. ' + IP_esc(it.q || '') + '</div>';
    h += '<div class="ip-meta">';
    h += '<span class="ip-tag">' + IP_esc(it.cat || '') + '</span>';
    h += '<span class="ip-tag">' + IP_esc(it.framework ? it.framework.name : '框架') + '</span>';
    if (ans.text.replace(/\s/g, '').length >= MIN_ANSWER) h += '<span class="ip-tag g">已自答 ' + ans.text.replace(/\s/g, '').length + ' 字</span>';
    h += '<span class="ip-tag' + (chkDone === chks.length && chks.length ? ' g' : '') + '">自查 ' + chkDone + '/' + chks.length + '</span>';
    h += '</div></div>';
    h += '<span class="ip-fold">' + IP_icon(expanded ? 'chevron-up' : 'chevron-down', 15) + '</span>';
    h += '</div>';

    if (expanded) {
      h += '<div class="ip-body">';

      /* ① 参考框架 */
      if (it.framework) {
        h += '<div class="ip-sec">';
        h += '<div class="ip-sec-h">' + IP_icon('file-text', 15) + '① 参考框架：' + IP_esc(it.framework.name || '') +
          '<span class="ip-abbr">' + IP_esc(it.framework.abbr || '') + '</span></div>';
        var steps = it.framework.steps || [];
        h += '<ol class="ip-ol">';
        for (i = 0; i < steps.length; i++) h += '<li>' + IP_esc(steps[i]) + '</li>';
        h += '</ol></div>';
      }

      /* ② 示范回答 */
      h += '<div class="ip-sec">';
      h += '<div class="ip-sec-h">' + IP_icon('volume-2', 15) + '② 示范回答（可朗读）</div>';
      h += '<div class="ip-sample" data-sample="' + IP_esc(it.id) + '">' + IP_esc(it.sample || '') + '</div>';
      h += '<div class="ip-acts">';
      h += '<button type="button" class="ip-btn" data-act="speak" data-id="' + IP_esc(it.id) + '">' +
        IP_icon('volume-2', 14) + '<em>朗读示范</em></button>';
      h += '<button type="button" class="ip-btn" data-act="copy" data-id="' + IP_esc(it.id) + '">' +
        IP_icon('clipboard', 14) + '<em>复制文本</em></button>';
      h += '<button type="button" class="ip-btn" data-act="ai" data-id="' + IP_esc(it.id) + '">' +
        IP_icon('bot', 14) + '<em>去 AI 模拟面试练这道题</em></button>';
      h += '</div></div>';

      /* ③ 我来答 */
      h += '<div class="ip-sec">';
      h += '<div class="ip-sec-h">' + IP_icon('pencil', 15) + '③ 我来答（输入后保存在本机）</div>';
      h += '<textarea class="ip-ta" data-ans="' + IP_esc(it.id) + '" placeholder="按上面的框架写一遍自己的版本，建议不少于 ' + MIN_ANSWER + ' 字…">' + IP_esc(ans.text) + '</textarea>';
      h += '<div class="ip-hint" data-ansinfo="' + IP_esc(it.id) + '">' + IP_esc(IP_answerInfo(ans)) + '</div>';
      h += '<div class="ip-acts">';
      h += '<button type="button" class="ip-btn" data-act="saveAns" data-id="' + IP_esc(it.id) + '">' +
        IP_icon('save', 14) + '<em>保存我的回答</em></button>';
      h += '<button type="button" class="ip-btn" data-act="clearAns" data-id="' + IP_esc(it.id) + '">' +
        IP_icon('eraser', 14) + '<em>清空</em></button>';
      h += '</div></div>';

      /* ④ 自查清单 */
      var list = it.checklist || [];
      h += '<div class="ip-sec" style="margin-bottom:0">';
      h += '<div class="ip-sec-h">' + IP_icon('clipboard-list', 15) + '④ 自查清单（<span data-chkcount="' + IP_esc(it.id) + '">' + chkDone + '/' + list.length + '</span>）</div>';
      for (i = 0; i < list.length; i++) {
        h += '<div class="ip-chk' + (chks[i] ? ' on' : '') + '" data-act="chk" data-id="' + IP_esc(it.id) + '" data-ci="' + i + '">' +
          '<span class="ip-box">' + IP_icon(chks[i] ? 'check' : '', 12) + '</span>' +
          '<span>' + IP_esc(list[i]) + '</span></div>';
      }
      h += '<div class="ip-from">' + IP_esc(it.from || '') + '</div>';
      h += '</div>';

      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function IP_answerInfo(ans) {
    if (!ans || !ans.text) return '还没动笔。写一遍比看十遍有用。';
    var n = ans.text.replace(/\s/g, '').length;
    var extra = ans.ts ? ' · 保存于 ' + new Date(ans.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return '已写 ' + n + ' 字' + (n >= MIN_ANSWER ? '（已计入练习进度）' : '（不足 ' + MIN_ANSWER + ' 字，暂未计入）') + extra;
  }

  /* ==================== 主渲染 ==================== */

  function IP_render(bodyEl) {
    if (!bodyEl) return;
    IP_injectStyle();
    IP_stopSpeak();

    var data = IP_data();
    if (!data) {
      bodyEl.innerHTML = '<div class="ip-root"><div class="ip-hero">' +
        '<p>面试准备数据未加载（请确认 assets/data-iv-prep.js 已在 assets/mini-interview.js 之后引入）</p></div></div>';
      IP_hydrate(bodyEl);
      return;
    }
    var items = data.items || [];
    var X = window.XTC;
    var i;

    var html = '';
    html += '<div class="ip-root">';
    html += '<div class="ip-hero" id="ipHero"></div>';
    html += '<div id="ipProgBox"></div>';
    html += '<div id="ipList"></div>';
    if (data.guide) {
      html += '<div class="ip-guide">' +
        '<h4>' + IP_icon(data.guide.icon || 'lightbulb', 16) + IP_esc(data.guide.title || '') + '</h4>' +
        '<p>' + IP_esc(data.guide.body || '') + '</p><ol>';
      var steps = data.guide.steps || [];
      for (i = 0; i < steps.length; i++) html += '<li>' + IP_esc(steps[i]) + '</li>';
      html += '</ol></div>';
    }
    html += '<div class="ip-legacy"><div id="ipLegacyQuiz"></div></div>';
    html += '<div class="ip-credit">' + IP_esc(data.credit || '') + '</div>';
    html += '</div>';
    bodyEl.innerHTML = html;

    /* 头部 */
    var heroEl = document.getElementById('ipHero');
    if (heroEl) {
      if (X && typeof X.hero === 'function') {
        try {
          X.hero(heroEl, {
            icon: 'clipboard-list',
            title: data.t || '面试准备',
            sub: data.intro || '',
            tags: [items.length + ' 道高频题 · 三件套'],
            credit: false
          });
        } catch (e) { heroEl.innerHTML = '<h3>' + IP_esc(data.t || '') + '</h3>'; }
      } else {
        heroEl.innerHTML = '<h3>' + IP_icon('clipboard-list', 18) + IP_esc(data.t || '') + '</h3>' +
          '<p>' + IP_esc(data.intro || '') + '</p>';
      }
      heroEl.innerHTML += '<div class="ip-hero-acts">' +
        '<button type="button" class="ip-btn" data-act="ai" data-id="__all__">' +
        IP_icon('bot', 14) + '<em>去 AI 模拟面试，把这 8 题连着练一遍</em></button>' +
        '<button type="button" class="ip-btn" data-act="foldAll" data-id="__all__">' +
        IP_icon('chevron-down', 14) + '<em>全部收起</em></button>' +
        '</div>';
    }

    /* 列表 */
    var listEl = document.getElementById('ipList');
    if (listEl) IP_renderList(listEl, items);

    /* 原 8 道四选一（零删除） */
    var legacyBox = document.getElementById('ipLegacyQuiz');
    if (legacyBox) {
      var legacy = data.legacyQuiz || window.__IV_PREP_LEGACY__ || [];
      var rendered = false;
      if (X && typeof X.renderQuiz === 'function' && legacy.length) {
        try {
          X.renderQuiz(legacyBox, legacy, {
            title: '准备知识自测 · 原 8 题（保留题库）',
            credit: false
          });
          rendered = true;
        } catch (e) { rendered = false; }
      }
      if (!rendered) {
        legacyBox.innerHTML = legacy.length
          ? '<div class="ip-hint">共 ' + legacy.length + ' 道原题（渲染器尚未就绪）</div>'
          : '<div class="ip-hint">原题库未加载</div>';
      }
    }

    IP_renderProgress(data);
    IP_hydrate(bodyEl);
  }

  function IP_renderList(listEl, items) {
    var h = '', i;
    for (i = 0; i < items.length; i++) {
      var open = OPEN_MAP[items[i].id];
      if (open === undefined) open = (i === 0);
      h += IP_itemHtml(items[i], i, !!open);
    }
    listEl.innerHTML = h;
    IP_bindList(listEl, items);
  }

  function IP_bindList(listEl, items) {
    if (listEl.getAttribute('data-bound')) return;
    listEl.setAttribute('data-bound', '1');

    listEl.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      var node = null;
      while (t && t !== listEl) {
        if (t.getAttribute && t.getAttribute('data-act')) { node = t; break; }
        t = t.parentNode;
      }
      if (!node) return;
      var act = node.getAttribute('data-act');
      var id = node.getAttribute('data-id');
      var it = null, i;
      for (i = 0; i < items.length; i++) { if (items[i].id === id) it = items[i]; }

      if (act === 'fold') {
        if (!it) return;
        OPEN_MAP[id] = !OPEN_MAP[id];
        IP_renderList(listEl, items);
        IP_renderProgress(IP_data());
        return;
      }
      if (act === 'foldAll') {
        for (i = 0; i < items.length; i++) OPEN_MAP[items[i].id] = false;
        var hero = document.getElementById('ipHero');
        if (hero) hero.scrollIntoView({ block: 'nearest' });
        IP_renderList(listEl, items);
        return;
      }
      if (act === 'speak') {
        if (!it) return;
        IP_speak(it.sample, id, node);
        return;
      }
      if (act === 'copy') {
        if (it) IP_copy(it.sample);
        return;
      }
      if (act === 'ai') {
        IP_gotoAI(it ? it.q : '');
        return;
      }
      if (act === 'saveAns') {
        if (!it) return;
        var ta = listEl.querySelector('[data-ans="' + id + '"]');
        if (!ta) return;
        var saved = IP_set(IP_key(id, 'ans'), { text: ta.value || '', ts: Date.now() });
        var info = listEl.querySelector('[data-ansinfo="' + id + '"]');
        if (info) info.textContent = IP_answerInfo(IP_answer(id));
        IP_toast(saved ? '已保存「' + it.cat + '」的自答，只存在这台设备' : '保存失败，可能是存储空间已满');
        IP_renderList(listEl, items);
        IP_renderProgress(IP_data());
        return;
      }
      if (act === 'clearAns') {
        if (!it) return;
        IP_set(IP_key(id, 'ans'), { text: '', ts: 0 });
        IP_toast('已清空自答内容');
        IP_renderList(listEl, items);
        IP_renderProgress(IP_data());
        return;
      }
      if (act === 'chk') {
        if (!it) return;
        var ci = parseInt(node.getAttribute('data-ci'), 10);
        var list = it.checklist || [];
        var arr = IP_chk(id, list.length);
        arr[ci] = arr[ci] ? 0 : 1;
        IP_set(IP_key(id, 'chk'), arr);
        IP_renderList(listEl, items);
        return;
      }
    });
  }

  function IP_renderProgress(data) {
    var box = document.getElementById('ipProgBox');
    if (!box || !data) return;
    var items = data.items || [];
    var done = IP_countDone(items);
    var X = window.XTC;
    if (X && typeof X.progressBar === 'function') {
      try {
        X.progressBar(box, {
          done: done, total: items.length,
          label: '已自答 ' + done + ' / ' + items.length + ' 题（≥' + MIN_ANSWER + ' 字计入）'
        });
        IP_hydrate(box);
        return;
      } catch (e) { /* 本地兜底 */ }
    }
    var pct = items.length ? Math.round(done * 100 / items.length) : 0;
    box.innerHTML = '<div class="ip-hero" style="padding:12px 14px">' +
      '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-secondary,#6B7280);margin-bottom:6px">' +
      '<span>已自答 ' + done + ' / ' + items.length + ' 题</span><span>' + pct + '%</span></div>' +
      '<div style="height:8px;border-radius:99px;background:var(--border,#E5E7EB);overflow:hidden">' +
      '<div style="height:100%;width:' + pct + '%;border-radius:99px;background:linear-gradient(90deg,var(--primary,#5B8DEF),var(--g2,#7BA5F5))"></div></div></div>';
  }

  /** 与 AI 模拟面试衔接：优先站内同页模拟面试，其次跳 AI 模拟面试页 */
  function IP_gotoAI(question) {
    IP_stopSpeak();
    try {
      if (typeof window.openInterviewDemo === 'function') {
        window.openInterviewDemo();
        IP_toast('已打开模拟面试，可以把刚才的自答讲一遍');
        return;
      }
    } catch (e) { /* 继续跳页 */ }
    try {
      var url = 'AI模拟面试.html';
      if (question) url += '?q=' + encodeURIComponent(question);
      window.location.href = url;
    } catch (e2) {
      IP_toast('无法跳转 AI 模拟面试页，请从首页进入');
    }
  }

  /* ==================== 注册 + 分发（ADR-2） ==================== */

  function IP_register() {
    if (window.XTC && typeof window.XTC.registerView === 'function') {
      window.XTC.registerView(REG_NAME, VIEW_ID, IP_render);
    } else {
      window.IVV2 = window.IVV2 || {};
      window.IVV2[VIEW_ID] = IP_render;
    }
  }

  IP_register();

  function IP_openV2(bodyEl) {
    if (!bodyEl) return false;
    if (window.XTC && typeof window.XTC.dispatchView === 'function') {
      return window.XTC.dispatchView(REG_NAME, VIEW_ID, bodyEl);
    }
    if (window.IVV2 && typeof window.IVV2[VIEW_ID] === 'function') {
      try { bodyEl.innerHTML = ''; window.IVV2[VIEW_ID](bodyEl); return true; } catch (e) { return false; }
    }
    return false;
  }

  function IP_boot() {
    /* 链式包装 window.ivQuizMount：只接管 'iv-prep'，其余类目原样透传。
       同页 A5（iv-after.js）也会包一层，两者互不覆盖，装载顺序无关。 */
    var legacy = window.ivQuizMount;
    if (typeof legacy !== 'function') {
      if (window.console && console.warn) console.warn('[IVV2] legacy ivQuizMount 未就绪，跳过 iv-prep 包装');
      return;
    }
    window.ivQuizMount = function (catId, bodyId) {
      if (catId === VIEW_ID) {
        var body = document.getElementById(bodyId);
        if (body) {
          body.dataset.ivqMounted = '1';
          try {
            if (IP_openV2(body)) {
              var cnt = document.getElementById(bodyId === 'ivPrepBody' ? 'ivPrepCount' : '');
              if (cnt) cnt.textContent = '8 题三件套';
              if (typeof window.StudyStats !== 'undefined' && window.StudyStats && window.StudyStats.track) {
                try { window.StudyStats.track('etiquette', 'view', { type: 'iv_prep_v2' }); } catch (e) { /* 忽略 */ }
              }
              return true;
            }
          } catch (e) {
            if (window.console && console.error) console.error('[IVV2] iv-prep 渲染失败，回退旧路径', e);
          }
        }
      }
      return legacy.apply(this, arguments);
    };
    window.ivQuizMount.__ivpPatched = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', IP_boot);
  else IP_boot();

  window.IvPrep = {
    version: '2.0.0',
    render: IP_render,
    open: IP_openV2,
    keys: { prefix: LS_PREFIX, reg: REG_NAME, view: VIEW_ID }
  };
})();
