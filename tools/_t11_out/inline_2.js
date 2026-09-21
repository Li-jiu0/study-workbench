
/* ============ C18 · 错题本 AI 分析（接 assets/ai-service.js 的 window.callAI） ============
 * 数据来源：localStorage 真实错题（study_workbench_data@账号 的 wrongQuestions 只存题 id，
 *           正文回表 EXAM_BANK 还原；错因在 study_workbench_wrong_reasons@账号）。
 * 调用口径：window.callAI(funcType, messages, opts)，与 AI 页 / 首页小助手同一套底座。
 * 限频：公共 Key 10 次/分钟 → 只在用户点按钮时调 AI，结果本地缓存，可「重新分析」强制刷新。
 * 老 WebView（Chrome 50~58 / ES2017）语法约束：无可选链、无空值合并、无对象展开、
 *   无 replaceAll、无 Object.fromEntries、无 Array.at、无顶层 await、无正则后行断言。
 * 不改 assets/app.js / assets/ai-service.js / assets/ai-config.js / assets/api.js。
 */
(function () {
  'use strict';

  var CACHE_KEY = 'xt_wrongbook_ai';

  /* ---------- 基础工具 ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 题干清洗：图片标记换成占位，压缩空白，避免把 [IMG:xxx] 原样喂给模型 */
  function plain(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/\[IMG:[^\]]*\]/g, '［图］')
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '');
  }
  function toast(msg) {
    try { if (typeof window.xtToast === 'function') { window.xtToast('info', msg); return; } } catch (e) { /* 忽略 */ }
    try { if (typeof window.showToast === 'function') { window.showToast(msg); return; } } catch (e2) { /* 忽略 */ }
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 账号隔离的 localStorage 键（复用 app.js 的 window.lsKey，缺失时自建同名规则） */
  function akey(name) {
    try { if (typeof window.lsKey === 'function') return window.lsKey(name); } catch (e) { /* 忽略 */ }
    var acct = '';
    try { acct = window.CURRENT_ACCOUNT || ''; } catch (e2) { /* 忽略 */ }
    if (!acct) { try { var a = JSON.parse(localStorage.getItem('study_workbench_auth')); if (a && a.account) acct = a.account; } catch (e3) { /* 忽略 */ } }
    if (!acct) { try { acct = localStorage.getItem('study_workbench_last_account') || ''; } catch (e4) { /* 忽略 */ } }
    if (!acct) acct = 'shared';
    return name + '@' + acct;
  }
  function lsGetRaw(name) {
    try {
      var v = localStorage.getItem(akey(name));
      if (v === null || v === undefined) v = localStorage.getItem(name);
      return (v === null || v === undefined) ? null : v;
    } catch (e) { return null; }
  }
  function lsSetRaw(name, val) {
    try { localStorage.setItem(akey(name), val); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 分析结果缓存（公共 Key 限频，能省一次是一次） ---------- */
  function cacheRead(key) {
    try {
      var raw = lsGetRaw(CACHE_KEY);
      if (!raw) return '';
      var o = JSON.parse(raw);
      return (o && o[key] && o[key].t) ? String(o[key].t) : '';
    } catch (e) { return ''; }
  }
  function cacheWrite(key, text) {
    try {
      var o = {};
      var raw = lsGetRaw(CACHE_KEY);
      if (raw) { var p = JSON.parse(raw); if (p && typeof p === 'object') o = p; }
      o[key] = { t: String(text), at: Date.now() };
      lsSetRaw(CACHE_KEY, JSON.stringify(o));
    } catch (e) { /* 忽略 */ }
  }
  function cacheTime(key) {
    try {
      var raw = lsGetRaw(CACHE_KEY);
      if (!raw) return '';
      var o = JSON.parse(raw);
      var it = o ? o[key] : null;
      if (!it || !it.at) return '';
      var d = new Date(it.at);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
        + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    } catch (e) { return ''; }
  }

  /* ---------- 错题库读取（真实 localStorage 数据） ---------- */
  function bank() {
    var b = null;
    try { if (typeof window.EXAM_BANK !== 'undefined' && window.EXAM_BANK) b = window.EXAM_BANK; } catch (e) { /* 忽略 */ }
    if (!b) { try { if (typeof EXAM_BANK !== 'undefined' && EXAM_BANK) b = EXAM_BANK; } catch (e2) { /* 忽略 */ } }
    return b || [];
  }
  function reasonOf(qid) {
    try {
      var raw = lsGetRaw('study_workbench_wrong_reasons');
      if (!raw) return '';
      var o = JSON.parse(raw);
      return (o && o[qid]) ? String(o[qid]) : '';
    } catch (e) { return ''; }
  }
  function wrongIds() {
    try {
      var raw = lsGetRaw('study_workbench_data');
      if (!raw) return [];
      var d = JSON.parse(raw);
      var arr = (d && d.wrongQuestions) ? d.wrongQuestions : [];
      return arr ? arr : [];
    } catch (e) { return []; }
  }
  function allQuestions() {
    var out = [];
    var used = false;
    if (typeof window.getWrongDetails === 'function') {
      try {
        var d = window.getWrongDetails(500);
        if (d && d.length) {
          for (var i = 0; i < d.length; i++) { if (d[i]) out.push(d[i]); }
          used = true;
        }
      } catch (e) { /* 忽略 */ }
    }
    if (!used) {
      var ids = wrongIds();
      var bk = bank();
      var map = {};
      for (var k = 0; k < bk.length; k++) { map[bk[k].id] = bk[k]; }
      for (var n = 0; n < ids.length; n++) {
        var q = map[ids[n]];
        if (!q) continue;
        out.push({
          id: ids[n], q: q.q, type: q.type || '', sub: q.sub || '',
          o: q.o || [], a: q.a, x: q.x || '', reason: reasonOf(ids[n])
        });
      }
    }
    out.reverse(); // 与列表一致：后加入的排前面
    return out;
  }
  function findQuestion(qid) {
    var list = allQuestions();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(qid)) return list[i];
    }
    var bk = bank();
    for (var j = 0; j < bk.length; j++) {
      if (String(bk[j].id) === String(qid)) {
        var q = bk[j];
        return {
          id: q.id, q: q.q, type: q.type || '', sub: q.sub || '',
          o: q.o || [], a: q.a, x: q.x || '', reason: reasonOf(qid)
        };
      }
    }
    return null;
  }

  /* ---------- 极简 Markdown（先转义再渲染，杜绝注入） ---------- */
  function inlineMd(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function md(text) {
    var lines = String(text === null || text === undefined ? '' : text).split('\n');
    var html = '';
    var inUl = false;
    for (var i = 0; i < lines.length; i++) {
      var t = String(lines[i]).replace(/^\s+/, '').replace(/\s+$/, '');
      if (!t) { if (inUl) { html += '</ul>'; inUl = false; } continue; }
      var mh = /^(#{1,4})\s*(.*)$/.exec(t);
      if (mh) { if (inUl) { html += '</ul>'; inUl = false; } html += '<div class="wb-ai-h">' + inlineMd(mh[2]) + '</div>'; continue; }
      var mu = /^([-*•])\s*(.*)$/.exec(t);
      if (mu) { if (!inUl) { html += '<ul>'; inUl = true; } html += '<li>' + inlineMd(mu[2]) + '</li>'; continue; }
      var mo = /^(\d+)[.、)]\s*(.*)$/.exec(t);
      if (mo) { if (inUl) { html += '</ul>'; inUl = false; } html += '<div>' + inlineMd(mo[1] + '. ' + mo[2]) + '</div>'; continue; }
      if (inUl) { html += '</ul>'; inUl = false; }
      html += '<div>' + inlineMd(t) + '</div>';
    }
    if (inUl) html += '</ul>';
    return html;
  }
  function renderOut(el, text, metaText, retryOnclick) {
    if (!el) return;
    var h = md(text);
    if (metaText || retryOnclick) {
      h += '<div class="wb-ai-meta"><span>' + esc(metaText || '') + '</span>';
      if (retryOnclick) {
        h += '<button type="button" class="btn btn-outline btn-sm" onclick="' + esc(retryOnclick) + '">重新分析</button>';
      }
      h += '</div>';
    }
    el.innerHTML = h;
    el.style.display = 'block';
  }

  /* ---------- 提示词 ---------- */
  var LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  function buildOnePrompt(item) {
    var o = item.o || [];
    var opts = '';
    for (var i = 0; i < o.length; i++) {
      opts += '\n' + (LABELS[i] || String(i + 1)) + '. ' + plain(o[i]);
    }
    var ans = '';
    if (typeof item.a === 'number' && item.a >= 0) {
      ans = (LABELS[item.a] || String(item.a + 1)) + '. ' + plain(o[item.a]);
    }
    var s = '你是考试辅导老师。请分析下面这道错题，严格按四个小标题输出：\n'
      + '### 错因\n最可能做错的原因（结合题目特征，1 句话）\n'
      + '### 考点\n考查的核心知识点或解题方法（1 句话）\n'
      + '### 避坑\n下次遇到同类题要注意的点（2~3 条，每条用 - 开头）\n'
      + '### 变式题\n出 1~2 道同类变式题，每题只给「题干 + 选项 + 答案」，不要长解析\n\n'
      + '【题型】' + (item.type || '未分类') + ' · ' + (item.sub || '未分类') + '\n'
      + '【题干】' + plain(item.q) + (opts ? '\n【选项】' + opts : '')
      + (ans ? '\n【正确答案】' + ans : '')
      + '\n【官方解析】' + (plain(item.x) || '（无）') + '\n'
      + '【用户自评错因】' + (item.reason ? String(item.reason) : '未填写') + '\n\n'
      + '要求：简体中文，条目化，总字数 400 字以内，不要复述题干，不要客套话。';
    return s;
  }
  function buildModulePrompt(name, list) {
    var n = Math.min(list.length, 12);
    var s = '下面是我在「' + name + '」的错题记录（共 ' + list.length + ' 道，最多列出 ' + n + ' 道）：\n';
    for (var i = 0; i < n; i++) {
      var it = list[i];
      s += (i + 1) + '. [' + (it.type || '未分类') + '·' + (it.sub || '') + '] '
        + plain(it.q).substring(0, 80)
        + (it.reason ? '（自评错因：' + String(it.reason) + '）' : '') + '\n';
    }
    s += '\n请输出该模块【最该补的 3 个考点】，每条按这个格式写：\n'
      + '1. 考点名 —— 为什么它是短板（结合上面的错题，一句话）｜怎么补：20 分钟的具体做法\n\n'
      + '要求：简体中文，只输出这 3 条，不要客套话，总字数 300 字以内。';
    return s;
  }

  /* ---------- AI 调用（流式守卫 + 降级不白屏） ---------- */
  function canStream() {
    try {
      return typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined' && typeof window.fetch === 'function';
    } catch (e) { return false; }
  }
  function failOut(el, err, retryOnclick, localTip) {
    if (!el) return;
    var reason = '网络异常或 AI 服务不可用';
    if (err && err.rateLimited) reason = '提问太频繁了（公共 Key 限 10 次/分钟），请休息 1 分钟再试';
    else if (err && err.message) reason = String(err.message);
    var h = '<div class="wb-ai-thinking">AI 暂时不可用：' + esc(reason) + '</div>'
      + '<div class="wb-ai-empty">' + esc(localTip || '可以先自己复盘：重做一遍 → 对照解析找出卡住的那一步 → 归纳考点 → 找 2 道同类题练手。') + '</div>';
    if (retryOnclick) {
      h += '<div class="wb-ai-meta"><button type="button" class="btn btn-outline btn-sm" onclick="' + esc(retryOnclick) + '">重试</button></div>';
    }
    el.innerHTML = h;
    el.style.display = 'block';
    toast('AI 暂时不可用，已给出本地复盘建议');
  }
  /* cfg: { funcType, messages, outEl, cacheKey, retryOnclick, localTip } */
  function runAI(cfg) {
    var el = cfg.outEl;
    if (!el) return;
    if (typeof window.callAI !== 'function') {
      failOut(el, new Error('AI 底座（assets/ai-service.js）尚未就绪'), cfg.retryOnclick,
        '请刷新页面后重试；若仍不可用，可在「设置 / AI 页设置」里填写自己的模型 Key。');
      return;
    }
    var stream = canStream();
    var settled = false;
    var buf = '';
    el.innerHTML = '<div class="wb-ai-thinking">AI 正在思考…</div>';
    el.style.display = 'block';
    // 软看门狗：20 秒还没结果就更新文案（不取消请求，用户可随时重试）
    var wd = setTimeout(function () {
      if (!settled) el.innerHTML = '<div class="wb-ai-thinking">AI 还在思考…（响应较慢，可稍后重试）</div>';
    }, 20000);
    var opts = {};
    if (stream) {
      // 有流式能力才逐字渲染；老内核（无 ReadableStream / TextDecoder）走整段返回
      opts.onChunk = function (piece, full) {
        if (full !== null && full !== undefined && full !== '') buf = String(full);
        else buf += String(piece === null || piece === undefined ? '' : piece);
        el.innerHTML = md(buf);
      };
    }
    var p = null;
    try {
      p = window.callAI(cfg.funcType, cfg.messages, opts);
    } catch (e1) {
      clearTimeout(wd);
      settled = true;
      failOut(el, e1, cfg.retryOnclick, cfg.localTip);
      return;
    }
    Promise.resolve(p).then(function (res) {
      clearTimeout(wd);
      if (settled) return;
      settled = true;
      var text = (res && (res.text || res.content)) ? String(res.text || res.content) : buf;
      if (!text) { failOut(el, new Error('AI 返回了空内容'), cfg.retryOnclick, cfg.localTip); return; }
      if (cfg.cacheKey) cacheWrite(cfg.cacheKey, text);
      var meta = '';
      if (res && res.degraded) meta = '网络不佳或未配置 Key，以下为本地参考';
      else if (res && res.modelUsedName) meta = '由 ' + String(res.modelUsedName) + ' 生成';
      renderOut(el, text, meta, cfg.retryOnclick);
      if (res && res.degraded) toast('网络不佳，以下为本地参考');
    }).catch(function (err) {
      clearTimeout(wd);
      if (settled) return;
      settled = true;
      failOut(el, err, cfg.retryOnclick, cfg.localTip);
    });
  }

  /* ---------- 对外入口：单题分析 ---------- */
  if (typeof window.xtWbAnalyzeOne !== 'function') {
    window.xtWbAnalyzeOne = function (qid, force) {
      var out = document.getElementById('xtWbAi_' + qid);
      if (!out) { toast('分析区域未就绪，请刷新页面重试'); return; }
      var item = findQuestion(qid);
      if (!item) { toast('没有找到这道错题的数据'); return; }
      var ck = 'q_' + qid;
      var retry = 'xtWbAnalyzeOne(' + qid + ',1)';
      if (!force) {
        var cached = cacheRead(ck);
        if (cached) {
          renderOut(out, cached, '本地缓存的分析 · ' + (cacheTime(ck) || '未知时间'), retry);
          return;
        }
      }
      runAI({
        // ai-config.js 现无错题分析专属 funcType，讲题类用最接近的 reasoning
        funcType: 'reasoning',
        messages: [{ role: 'user', content: buildOnePrompt(item) }],
        outEl: out,
        cacheKey: ck,
        retryOnclick: retry,
        localTip: '单题复盘四步：不看解析重做一遍 → 找出卡住的那一步 → 归纳考点 → 马上找 2 道同类题练手。'
      });
    };
  }

  /* ---------- 对外入口：模块级分析 ---------- */
  if (typeof window.xtWbAnalyzeModule !== 'function') {
    window.xtWbAnalyzeModule = function (force) {
      var out = document.getElementById('wbAiModuleOut');
      if (!out) { toast('分析区域未就绪，请刷新页面重试'); return; }
      var list = allQuestions();
      if (!list.length) {
        out.innerHTML = '<div class="wb-ai-empty">错题本还是空的，先去行测刷题，做错的题会自动收录到这里，再来做 AI 分析。</div>';
        out.style.display = 'block';
        toast('还没有错题可分析');
        return;
      }
      var sel = document.getElementById('wbAiModuleSel');
      var type = sel ? String(sel.value || '') : '';
      var picked = [];
      for (var i = 0; i < list.length; i++) {
        if (type === '' || type === '__all__' || (list[i].type || '其他') === type) picked.push(list[i]);
      }
      if (!picked.length) picked = list;
      var key = 'm_' + (type || '__all__');
      var retry = 'xtWbAnalyzeModule(1)';
      if (!force) {
        var cached = cacheRead(key);
        if (cached) {
          renderOut(out, cached, '本地缓存的分析 · ' + (cacheTime(key) || '未知时间'), retry);
          return;
        }
      }
      runAI({
        funcType: 'general',
        messages: [{ role: 'user', content: buildModulePrompt((type === '__all__' || type === '') ? '全部模块' : type, picked) }],
        outEl: out,
        cacheKey: key,
        retryOnclick: retry,
        localTip: '模块复盘思路：把错题按考点归类，出现次数最多的那个考点就是最该补的；先补它，再刷 10 道同类题验收。'
      });
    };
  }

  /* ---------- 把「AI 分析」按钮注入到 app.js 渲染的错题卡片（不改 app.js） ---------- */
  function enhanceList() {
    var list = document.getElementById('wrongList');
    if (!list) return;
    var cards = list.children;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card || card.getAttribute('data-xt-ai')) continue;
      card.setAttribute('data-xt-ai', '1');
      var btns = card.getElementsByTagName('button');
      var qid = '';
      var row = null;
      for (var j = 0; j < btns.length; j++) {
        var oc = btns[j].getAttribute('onclick') || '';
        var m = /redoWrongQuestion\((\d+)\)/.exec(oc);
        if (m) { qid = m[1]; row = btns[j].parentNode; }
      }
      if (!row || !qid) { card.setAttribute('data-xt-ai', 'skip'); continue; }
      var ab = document.createElement('button');
      ab.setAttribute('type', 'button');
      ab.className = 'btn btn-outline btn-sm';
      ab.setAttribute('onclick', 'xtWbAnalyzeOne(' + qid + ')');
      ab.textContent = cacheRead('q_' + qid) ? '查看分析' : 'AI 分析';
      row.appendChild(ab);
      var slot = document.createElement('div');
      slot.className = 'xt-wb-ai-slot';
      slot.id = 'xtWbAi_' + qid;
      slot.style.display = 'none';
      card.appendChild(slot);
    }
  }
  function refreshModuleSel() {
    var sel = document.getElementById('wbAiModuleSel');
    if (!sel) return;
    var list = allQuestions();
    var counter = {};
    var order = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i].type || '其他';
      if (!counter[t]) { counter[t] = 0; order.push(t); }
      counter[t] = counter[t] + 1;
    }
    var cur = sel.value;
    var h = '';
    if (!order.length) {
      h = '<option value="">（暂无错题）</option>';
    } else {
      h += '<option value="__all__">全部模块（' + list.length + ' 题）</option>';
      for (var j = 0; j < order.length; j++) {
        h += '<option value="' + esc(order[j]) + '">' + esc(order[j]) + '（' + counter[order[j]] + ' 题）</option>';
      }
    }
    sel.innerHTML = h;
    if (cur) { sel.value = cur; }
    if (!sel.value) sel.selectedIndex = 0;
  }
  function enhance() {
    try { enhanceList(); } catch (e) { /* 一处失败不影响另一处 */ }
    try { refreshModuleSel(); } catch (e2) { /* 忽略 */ }
  }

  /* 包装 renderWrongBook：保留原实现与函数名，渲染完再补 AI 按钮，不删任何既有功能 */
  function init() {
    var orig = window.renderWrongBook;
    if (typeof orig === 'function' && !orig.__xtWb) {
      var patched = function () {
        var r = orig.apply(this, arguments);
        try { enhance(); } catch (e) { /* 忽略 */ }
        return r;
      };
      patched.__xtWb = true;
      window.renderWrongBook = patched;
    }
    enhance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load', function () { try { enhance(); } catch (e) { /* 忽略 */ } });
})();
