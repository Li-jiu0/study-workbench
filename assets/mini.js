/* =====================================================================
   mini.js —— 全站“小题库 / 知识卡”播放器
   ---------------------------------------------------------------------
   用法：openMiniQuiz(catId)
   数据：window.MINI_BANK[catId] = { t, mode:'quiz'|'info', q:[{q,o[],a,ans,x}] 或 items:[{title,body}] }
   进度/得分记入 localStorage('mini_stats')。
   依赖：继承所在页面的主题色变量（var(--primary)/--g2），深浅色自动适配。
   ===================================================================== */
(function () {
  'use strict';
  if (window.__MINI_LOADED__) return;
  window.__MINI_LOADED__ = 1;

  var BANK = window.MINI_BANK = window.MINI_BANK || {};
  /* T15：mini_stats 按账号前缀化（app.js 先于本文件加载；防御性回退原键名） */
  function LK(k) { return (typeof window.lsKey === 'function') ? window.lsKey(k) : k; }
  var ST = 'mini_stats';
  function loadStat() { try { return JSON.parse(localStorage.getItem(LK(ST))) || {}; } catch (e) { return {}; } }
  function saveStat(o) { localStorage.setItem(LK(ST), JSON.stringify(o)); }

  if (!document.getElementById('miniStyle')) {
    var css = '' +
      '.mz-mask{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;animation:mzIn .2s ease}' +
      '.mz-box{background:var(--card);color:var(--text);width:min(560px,100%);max-height:88vh;border-radius:18px;box-shadow:0 24px 60px -18px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;animation:mzPop .22s ease}' +
      '.mz-head{display:flex;align-items:center;gap:10px;padding:14px 18px;background:linear-gradient(135deg,var(--primary),var(--g2));color:#fff}' +
      '.mz-head b{flex:1;font-size:15px}' +
      '.mz-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:8px;font-size:15px;cursor:pointer;line-height:1}' +
      '.mz-body{overflow-y:auto;padding:18px;flex:1}' +
      '.mz-prog{display:flex;gap:8px;align-items:center;margin-bottom:12px}' +
      '.mz-pill{font-size:12px;padding:3px 10px;border-radius:20px;background:var(--primary-light);color:var(--primary);font-weight:600}' +
      '.mz-quest{font-size:15px;font-weight:600;line-height:1.6;margin-bottom:14px;white-space:pre-wrap}' +
      '.mz-op{display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:8px;border:1.5px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);font-size:14px;line-height:1.5;cursor:pointer;transition:.15s}' +
      '.mz-op:hover{border-color:var(--primary)}' +
      '.mz-op.ok{background:rgba(82,196,26,.12);border-color:var(--success)}' +
      '.mz-op.bad{background:rgba(255,107,107,.12);border-color:var(--danger)}' +
      '.mz-op:disabled{cursor:default;opacity:.9}' +
      '.mz-xp{background:var(--primary-light);border-left:3px solid var(--primary);border-radius:0 10px 10px 0;padding:10px 12px;font-size:13px;line-height:1.6;margin:6px 0 12px;white-space:pre-wrap}' +
      '.mz-xp b{color:var(--primary)}' +
      '.mz-acts{display:flex;gap:10px;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--border)}' +
      '.mz-btn{border:none;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer}' +
      '.mz-btn.primary{background:linear-gradient(135deg,var(--primary),var(--g2));color:#fff}' +
      '.mz-btn.ghost{background:var(--primary-light);color:var(--primary)}' +
      '.mz-score{text-align:center;padding:14px 0}' +
      '.mz-score .n{font-size:40px;font-weight:800;background:linear-gradient(135deg,var(--primary),var(--g2));-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '.mz-score .s{color:var(--text-secondary);margin-top:4px;font-size:13px}' +
      /* 知识卡 */
      '.mz-card{border:1px solid var(--border);border-radius:14px;margin-bottom:12px;overflow:hidden}' +
      '.mz-card-t{display:flex;align-items:center;gap:8px;padding:12px 14px;background:var(--primary-light);color:var(--primary);font-weight:700;font-size:14px;cursor:pointer}' +
      '.mz-card-b{padding:12px 14px;font-size:13px;line-height:1.7;color:var(--text-secondary);white-space:pre-wrap}' +
      '.mz-tip{font-size:12px;color:var(--text-muted);text-align:center;padding:2px 0 10px}' +
      /* 页面内视图（mz-inline）：去遮罩、占满宿主容器 */
      '.mz-mask.mz-inline{position:static;inset:auto;background:none;backdrop-filter:none;display:block;padding:0;animation:none}' +
      '.mz-mask.mz-inline .mz-box{width:100%;max-height:none;height:auto;min-height:360px}' +
      '@keyframes mzIn{from{opacity:0}to{opacity:1}}@keyframes mzPop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}';
    var st = document.createElement('style'); st.id = 'miniStyle'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  var S = null; // 当前会话
  function rand(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }

  function close() { var m = document.getElementById('mzMask'); if (m) m.remove(); S = null; }
  function removeMask() { var m = document.getElementById('mzMask'); if (m) m.remove(); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function begin(id, containerId) {
    // 【P0-B T03-06】真题模考类目（cet-mock / exam-mock）改跳独立页
    // （不再转发到已被删除的 assets/mock-exam.js）；其他类目保持原逻辑
    if (id === 'cet-mock' || id === 'exam-mock') {
      try {
        window.location.href = 'mock_exam.html?cat=' + encodeURIComponent(id);
      } catch (e) {
        if (window.showToast) window.showToast('页面跳转失败，请手动进入');
      }
      return;
    }
    var cat = BANK[id];
    if (!cat) { if (window.showToast) window.showToast('内容加载中，请稍后再试'); else alert('内容加载中'); return; }
    var qs = cat.mode === 'info' ? null : rand(cat.q || []);
    S = { id: id, cat: cat, qs: qs, i: 0, right: 0, infoIdx: 0, container: containerId || null };
    renderShell();
    if (cat.mode === 'info') renderInfo(); else renderQ();
  }

  function renderShell() {
    removeMask();
    var m = document.createElement('div');
    m.id = 'mzMask'; m.className = 'mz-mask';
    m.innerHTML = '<div class="mz-box"><div class="mz-head"><b>' + esc(S.cat.t) + '</b><button class="mz-x" onclick="openMiniQuiz.__close()">✕</button></div>' +
      '<div class="mz-body" id="mzBody"></div>' +
      '<div class="mz-acts" id="mzActs" style="display:none"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
  }

  function renderQ() {
    var body = document.getElementById('mzBody'), acts = document.getElementById('mzActs');
    var q = S.qs[S.i];
    var n = S.qs.length;
    body.innerHTML = '<div class="mz-prog"><span class="mz-pill">第 ' + (S.i + 1) + ' / ' + n + ' 题</span>' +
      '<span class="mz-pill" id="mzRightPill" style="margin-left:auto">已对 ' + S.right + '</span></div>' +
      '<div class="mz-quest">' + esc(q.q) + '</div>' +
      q.o.map(function (op, i) { return '<button class="mz-op" data-i="' + i + '" onclick="openMiniQuiz.__pick(' + i + ')"><b>' + 'ABCD'[i] + '.</b> ' + esc(op) + '</button>'; }).join('');
    acts.style.display = 'none';
  }

  function pick(i) {
    var q = S.qs[S.i];
    var opts = document.querySelectorAll('#mzBody .mz-op');
    opts.forEach(function (b) { b.disabled = true; });
    if (i === q.a) {
      S.right++;
      opts[i].classList.add('ok');
      // T18①：答对即时刷新「已对 X」胶囊（原实现只在下一题 renderQ 时才更新）
      var rp = document.getElementById('mzRightPill');
      if (rp) rp.textContent = '已对 ' + S.right;
    }
    else { opts[i].classList.add('bad'); if (q.a < opts.length) opts[q.a].classList.add('ok'); }
    var body = document.getElementById('mzBody');
    var xp = document.createElement('div'); xp.className = 'mz-xp';
    xp.innerHTML = '<b>' + (i === q.a ? '✅ 回答正确' : '❌ 回答错误，正确答案是 ' + 'ABCD'[q.a]) + '</b><br>' + esc(q.x || '');
    body.appendChild(xp);
    var acts = document.getElementById('mzActs');
    var last = S.i === S.qs.length - 1;
    acts.style.display = 'flex';
    acts.innerHTML = last ? '<button class="mz-btn ghost" onclick="openMiniQuiz.__again()">↺ 再来一组</button><button class="mz-btn primary" onclick="openMiniQuiz.__finish()">查看成绩</button>'
      : '<button class="mz-btn primary" onclick="openMiniQuiz.__next()">下一题 →</button>';
    acts.scrollIntoView({ block: 'nearest' });
    // T18②：小题库答题也算一次「学习动作」，推进全局连续打卡
    try { window.Streak && window.Streak.bump(); } catch (e) { /* 静默 */ }
  }

  function next() { S.i++; renderQ(); var b = document.getElementById('mzBody'); if (b) b.scrollTop = 0; }
  function again() { begin(S.id, S.container); }

  function finish() {
    var stat = loadStat(), key = S.id;
    var rec = stat[key] || { done: 0, correct: 0, n: S.qs.length };
    rec.done = S.qs.length; rec.correct = S.right; rec.n = S.qs.length;
    stat[key] = rec; saveStat(stat);
    var pct = Math.round(S.right / S.qs.length * 100);
    var body = document.getElementById('mzBody'), acts = document.getElementById('mzActs');
    body.innerHTML = '<div class="mz-score"><div class="n">' + pct + '%</div><div class="s">答对 ' + S.right + ' / ' + S.qs.length + ' 题</div></div>' +
      (pct >= 80 ? '<div class="mz-tip">🎉 掌握得不错！</div>' : pct >= 60 ? '<div class="mz-tip">还可以，把错题解析再看一遍~</div>' : '<div class="mz-tip">建议把解析都看一遍再练一次</div>');
    acts.style.display = 'flex';
    acts.innerHTML = '<button class="mz-btn ghost" onclick="openMiniQuiz.__again()">↺ 再来一组</button><button class="mz-btn primary" onclick="openMiniQuiz.__close()">完成</button>';
  }

  function renderInfo() {
    var body = document.getElementById('mzBody');
    var items = S.cat.items;
    body.innerHTML = items.map(function (it, i) {
      return '<div class="mz-card"><div class="mz-card-t" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
        (it.icon || '📌') + ' ' + esc(it.title) + '<span style="margin-left:auto;opacity:.7">▼</span></div>' +
        '<div class="mz-card-b" style="display:' + (i === 0 ? 'block' : 'none') + '">' + esc(it.body) + '</div></div>';
    }).join('');
    document.getElementById('mzActs').style.display = 'flex';
    document.getElementById('mzActs').innerHTML = '<button class="mz-btn primary" onclick="openMiniQuiz.__close()">完成</button>';
  }

  /* containerId 可选：传入容器 id 时在页面内渲染（mz-inline），不传保持浮层行为 */
  function openMiniQuiz(id, containerId) { begin(id, containerId); }
  openMiniQuiz.__pick = pick; openMiniQuiz.__next = next; openMiniQuiz.__again = again;
  openMiniQuiz.__finish = finish; openMiniQuiz.__close = close;
  window.openMiniQuiz = openMiniQuiz;
})();
