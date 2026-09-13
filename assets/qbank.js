/* =====================================================================
   qbank.js —— “我的题库 / 内容管理”通用能力
   ---------------------------------------------------------------------
   能力：手动添加题目/内容、删除自定义项、从本地 JSON 批量导入、导出 JSON。
   存储：localStorage['study_workbench_custom'] = { <lib>: [items] }
   注入：把“自定义项”合并进对应内置数组(如 EXAM_BANK)，使刷题/列表立即可见。
   用法：openQBank('exam')  打开某库的管理面板（配置见下方 REGISTRY）。
   JSON 格式：
     导出完整库： { app, lib, label, items: [内置+自定义原始对象] }
     导出自定义： { app, lib, label, custom: [仅自定义对象] }
     导入：接受 { custom:[...] } 或 纯数组（对象需通过该库的校验）。
   ===================================================================== */
(function () {
  'use strict';
  if (window.__QBANK__) return;
  window.__QBANK__ = 1;

  var STORE = 'study_workbench_custom';

  function readMap() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function getCustom(lib) { return (readMap()[lib] || []).slice(); }
  function setCustom(lib, arr) { var m = readMap(); m[lib] = arr; localStorage.setItem(STORE, JSON.stringify(m)); }

  /* ---------- 库注册表（新增库只需在此加一项） ---------- */
  var REG = {
    exam: {
      label: '行测刷题',
      live: function () { return (typeof EXAM_BANK !== 'undefined') ? EXAM_BANK : null; },
      refresh: function () { try { if (typeof filterExamType === 'function') filterExamType('全部'); } catch (e) { } },
      maxId: function (live) { var mx = 0; (live || []).forEach(function (o) { if (typeof o.id === 'number' && o.id > mx) mx = o.id; }); return mx; },
      validate: function (it) {
        if (!it || !(it.q || '').trim()) return '题干不能为空';
        if (!Array.isArray(it.options) || it.options.length < 2) return '至少填写 2 个选项';
        if (typeof it.answer !== 'number' || it.answer < 0 || it.answer >= it.options.length) return '请选择正确的答案项';
        return null;
      },
      toItem: function (f) {
        var lines = (f.options || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
        return {
          type: (f.type || '').trim() || '言语理解', sub: (f.sub || '').trim() || '自定义',
          diff: [1, 2, 3].indexOf(+(f.diff || 2)) >= 0 ? +(f.diff || 2) : 2,
          q: (f.q || '').trim(), options: lines,
          answer: ['A', 'B', 'C', 'D'].indexOf((f.answer || 'A').trim()),
          exp: (f.exp || '').trim(), tip: (f.tip || '').trim()
        };
      },
      formTitle: '添加一道行测题',
      formHtml: function () {
        return '<div class="qb-row"><label>题型</label><input class="form-input qb-t" data-f="type" placeholder="如：言语理解 / 数量关系（不填默认言语理解）"></div>' +
          '<div class="qb-row"><label>小题型</label><input class="form-input qb-t" data-f="sub" placeholder="如：位置类 / 工程问题（可留空）"></div>' +
          '<div class="qb-row"><label>难度</label><select class="form-input qb-t" data-f="diff"><option value="1">简单</option><option value="2" selected>中等</option><option value="3">困难</option></select></div>' +
          '<div class="qb-row"><label>题干</label><textarea class="form-input qb-t" data-f="q" rows="3" placeholder="题目内容"></textarea></div>' +
          '<div class="qb-row"><label>选项（每行一个，2-4 个）</label><textarea class="form-input qb-t" data-f="options" rows="4" placeholder="选项A&#10;选项B&#10;选项C&#10;选项D"></textarea></div>' +
          '<div class="qb-row"><label>正确答案</label><select class="form-input qb-t" data-f="answer"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>' +
          '<div class="qb-row"><label>解析</label><textarea class="form-input qb-t" data-f="exp" rows="3" placeholder="答案解析（写清楚为什么对/为什么错）"></textarea></div>' +
          '<div class="qb-row"><label>提示（可选）</label><input class="form-input qb-t" data-f="tip" placeholder="答题小技巧"></div>';
      }
    },
    cet: {
      label: '四级词汇',
      live: function () { return (typeof CET_VOCAB !== 'undefined') ? CET_VOCAB : null; },
      refresh: function () { try { if (typeof renderVocab === 'function') renderVocab(); } catch (e) { } },
      maxId: function () { return 900000; },
      validate: function (it) {
        if (!it || !(it.word || '').trim()) return '单词不能为空';
        if (!(it.meaning || '').trim()) return '释义不能为空';
        return null;
      },
      toItem: function (f) {
        return { word: (f.word || '').trim(), phonetic: (f.phonetic || '').trim(), meaning: (f.meaning || '').trim(), example: (f.example || '').trim() };
      },
      formTitle: '添加一个单词',
      formHtml: function () {
        return '<div class="qb-row"><label>单词</label><input class="form-input qb-t" data-f="word" placeholder="如：abandon"></div>' +
          '<div class="qb-row"><label>音标</label><input class="form-input qb-t" data-f="phonetic" placeholder="如：/ə\'bændən/（可留空）"></div>' +
          '<div class="qb-row"><label>释义</label><textarea class="form-input qb-t" data-f="meaning" rows="2" placeholder="如：v. 放弃；抛弃"></textarea></div>' +
          '<div class="qb-row"><label>例句(可空)</label><input class="form-input qb-t" data-f="example" placeholder="一句话例句"></div>';
      }
    },
    iv: {
      label: '面试题库',
      live: function () { return (typeof INTERVIEW_QUESTIONS !== 'undefined') ? INTERVIEW_QUESTIONS : null; },
      refresh: function () { try { if (typeof renderIvQuestions === 'function') renderIvQuestions(); } catch (e) { } },
      maxId: function (live) { var mx = 0; (live || []).forEach(function (o) { if (typeof o.id === 'number' && o.id > mx) mx = o.id; }); return mx; },
      validate: function (it) {
        if (!it || !(it.question || '').trim()) return '题目不能为空';
        return null;
      },
      toItem: function (f) {
        return { type: (f.type || '').trim() || '面试', question: (f.question || '').trim(), framework: (f.framework || '').trim(), tips: (f.tips || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean), sample: (f.sample || '').trim() };
      },
      formTitle: '添加一道面试题',
      formHtml: function () {
        return '<div class="qb-row"><label>分类</label><input class="form-input qb-t" data-f="type" placeholder="如：自我介绍 / 求职动机（可留空）"></div>' +
          '<div class="qb-row"><label>题目</label><textarea class="form-input qb-t" data-f="question" rows="2" placeholder="面试问题"></textarea></div>' +
          '<div class="qb-row"><label>答题框架</label><input class="form-input qb-t" data-f="framework" placeholder="如：PREP法则 / 总分总（可空）"></div>' +
          '<div class="qb-row"><label>要点(每行一个)</label><textarea class="form-input qb-t" data-f="tips" rows="3" placeholder="要点1&#10;要点2"></textarea></div>' +
          '<div class="qb-row"><label>参考回答</label><textarea class="form-input qb-t" data-f="sample" rows="4" placeholder="一段参考回答"></textarea></div>';
      }
    }
  };

  // —— 内容库（仅“我的自定义内容”管理，不合入内置图文引擎，避免破坏版式/队列）——
  function contentCfg(label) {
    return {
      label: label, live: null, maxId: function () { return 0; },
      validate: function (it) { return (it && (it.text || it.content || '').trim()) ? null : '内容不能为空'; },
      toItem: function (f) { return { text: ((f.content || f.text) || '').trim() }; },
      formTitle: '添加一条内容',
      formHtml: function () { return '<div class="qb-row"><label>内容</label><textarea class="form-input qb-t" data-f="content" rows="5" placeholder="一段文字内容"></textarea></div>'; }
    };
  }
  Object.assign(REG, {
    quotes: contentCfg('万能金句'),
    scenes: contentCfg('场景话术'),
    etiquet: contentCfg('商务礼仪'),
    layouts: contentCfg('PPT版式'),
    cases: contentCfg('PPT案例')
  });

  function liveOf(key) { var cfg = REG[key]; if (!cfg || !cfg.live) return null; try { return cfg.live(); } catch (e) { return null; } }

  function validateImport(item, cfg) { return cfg.validate ? cfg.validate(item) : null; }

  /* 启动注入：把自定义项并入内置数组（已存在的跳过） */
  function inject() {
    Object.keys(REG).forEach(function (key) {
      var cfg = REG[key], live = liveOf(key);
      if (!live) return;
      var have = {}; live.forEach(function (o) { if (o && o.id != null) have['' + o.id] = 1; });
      getCustom(key).forEach(function (it) {
        if (it && it.id != null && !have['' + it.id]) { live.push(it); have['' + it.id] = 1; }
      });
    });
  }

  /* ---------- 覆盖层与渲染 ---------- */
  function ensureCss() {
    if (document.getElementById('qbStyle')) return;
    var css = '.qb-mask{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:2200;display:flex;align-items:center;justify-content:center;padding:16px}.qb-box{background:var(--card);color:var(--text);width:min(640px,100%);max-height:88vh;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px -18px rgba(0,0,0,.4)}.qb-head{display:flex;align-items:center;gap:8px;padding:12px 16px;background:linear-gradient(135deg,var(--primary),var(--g2));color:#fff}.qb-head b{flex:1}.qb-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer}.qb-body{overflow-y:auto;padding:16px;flex:1}.qb-stats{font-size:12px;color:var(--text-secondary);margin-bottom:12px}.qb-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.qb-item{border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start}.qb-item .qi-main{flex:1;min-width:0}.qb-item .qi-q{font-size:13px;line-height:1.6}.qb-item .qi-tag{display:inline-block;font-size:11px;background:var(--primary-light);color:var(--primary);border-radius:6px;padding:1px 6px;margin:2px 4px 0 0}.qb-empty{color:var(--text-muted);text-align:center;padding:18px}.qb-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.qb-row label{width:76px;font-size:12px;color:var(--text-secondary);padding-top:8px;flex-shrink:0}.qb-row .qb-t{flex:1;min-width:0}.qb-acts{display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--border)}';
    var st = document.createElement('style'); st.id = 'qbStyle'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  }

  var cur = null; // {key,cfg,custom,view}
  function closeQ() { var m = document.getElementById('qbMask'); if (m) m.remove(); cur = null; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') { showToast(m); return; } if (typeof alert === 'function') alert(m); }

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  function openQ(key) {
    var cfg = REG[key];
    if (!cfg) { toast('该题库暂未开放自定义'); return; }
    ensureCss();
    cur = { key: key, cfg: cfg, custom: getCustom(key), live: liveOf(key) };
    var m = document.createElement('div'); m.id = 'qbMask'; m.className = 'qb-mask';
    m.innerHTML = '<div class="qb-box"><div class="qb-head"><b>' + esc(cfg.label) + ' · 我的题库</b><button class="qb-x" onclick="window.__qbClose()">✕</button></div>' +
      '<div class="qb-body" id="qbBody"></div>' +
      '<div class="qb-acts"><button class="btn btn-outline" onclick="window.__qbClose()">关闭</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeQ(); });
    renderList();
  }
  function renderList() {
    var cfg = cur.cfg, live = liveOf(cur.key), custom = cur.custom;
    var box = document.getElementById('qbBody'); if (!box) return;
    var items = (custom || []).map(function (it, i) {
      var head = esc((it.q || it.text || it.content || it.word || it.quote || it.question || it.title || ('自定义项 ' + (i + 1))).slice(0, 60));
      var tag = it.type ? '<span class="qi-tag">' + esc(it.type) + '</span>' : '';
      var spk = (cur.key === 'cet' && it.word) ? '<button class="btn btn-outline btn-sm" style="margin-right:6px" onclick="event.stopPropagation();' + (typeof window.speakWordNow === 'function' ? 'speakWordNow' : 'window.speakWordNow') + '(' + "'" + String(it.word).replace(/'/g, "\\'") + "'" + ')">🔊</button>' : '';
      return '<div class="qb-item"><div class="qi-main"><div class="qi-q">' + head + '</div>' + tag + '</div>' +
        spk +
        '<button class="btn btn-danger btn-sm" onclick="window.__qbDel(' + i + ')">删除</button></div>';
    }).join('');
    box.innerHTML =
      '<div class="qb-stats">内置题目 <b>' + ((live || []).length - (custom || []).length) + '</b> 题 · 我的自定义 <b>' + (custom || []).length + '</b> 题 · 自定义内容保存在本机，可导出备份后在多台设备导入。</div>' +
      '<div class="qb-tools">' +
      '<button class="btn btn-primary btn-sm" onclick="window.__qbAdd()">＋ 添加题目</button>' +
      '<button class="btn btn-outline btn-sm" onclick="window.__qbImport()">📥 导入 JSON</button>' +
      '<button class="btn btn-outline btn-sm" onclick="window.__qbExport(1)">📤 导出(自定义)</button>' +
      '<button class="btn btn-outline btn-sm" onclick="window.__qbExport(0)">📤 导出(完整题库)</button>' +
      ((custom || []).length ? '<button class="btn btn-danger btn-sm" onclick="window.__qbClear()">清空自定义</button>' : '') +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);line-height:1.7;margin-bottom:12px">导入格式：JSON 数组，或 {custom:[…]}。对象字段与该库内置题目一致（行测题见添加表单）。</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px">🧩 我的自定义</div>' +
      (items || '<div class="qb-empty">还没有自定义题目，点「＋ 添加题目」或导入 JSON。</div>');
  }

  function addFormView() {
    var cfg = cur.cfg;
    var box = document.getElementById('qbBody');
    box.innerHTML = '<div style="font-size:14px;font-weight:700;margin-bottom:12px">' + esc(cfg.formTitle) + '</div>' + cfg.formHtml() +
      '<div class="qb-tools" style="justify-content:flex-end;margin:4px 0 0">' +
      '<button class="btn btn-outline btn-sm" onclick="window.__qbBack()">← 返回</button>' +
      '<button class="btn btn-primary btn-sm" onclick="window.__qbSave()">保存</button></div>';
  }
  function collectForm() {
    var o = {};
    document.querySelectorAll('#qbBody .qb-t').forEach(function (el) { o[el.getAttribute('data-f')] = el.value; });
    return o;
  }
  function addItem(item) {
    var cfg = cur.cfg, live = cur.live;
    var err = validateImport(item, cfg);
    if (err) { toast(err); return false; }
    var mx = cfg.maxId ? cfg.maxId(live) : 0;
    cur.custom.forEach(function (it) { if (it && typeof it.id === 'number' && it.id > mx) mx = it.id; });
    var id = mx + 1;
    if (item.id == null) item.id = id;
    // 去重（按 id）
    var dup = cur.custom.some(function (it) { return it && it.id != null && String(it.id) === String(item.id); });
    if (dup) { toast('已存在同 id 的自定义项，已跳过'); return false; }
    cur.custom.push(item);
    setCustom(cur.key, cur.custom);
    if (live) live.push(item);   // 无内置数组的内容库仅存管理
    if (cfg.refresh) cfg.refresh();
    return true;
  }
  function afterImport(n, skip) {
    if (n > 0) { setCustom(cur.key, cur.custom); if (cur.cfg.refresh) cur.cfg.refresh(); toast('已导入 ' + n + ' 项' + (skip ? '，跳过 ' + skip : '')); }
    else { toast(skip ? '没有可导入的新条目（可能都已存在）' : '没有可导入的有效条目，请检查 JSON 格式'); }
    renderList();
  }

  /* window 入口 */
  window.openQBank = openQ;
  window.__qbClose = function () { closeQ(); };
  window.__qbBack = function () { renderList(); };
  window.__qbAdd = function () { addFormView(); };
  window.__qbSave = function () {
    var cfg = cur.cfg;
    var item = cfg.toItem(collectForm());
    if (addItem(item)) { toast('✅ 已添加并进入刷题列表'); renderList(); }
  };
  window.__qbDel = function (i) {
    var it = cur.custom[i]; if (!it) return;
    if (!confirm('删除这条自定义内容？')) return;
    cur.custom.splice(i, 1); setCustom(cur.key, cur.custom);
    var live = cur.live;
    if (live) {
      var idx = live.findIndex(function (o) { return o && o.id != null && String(o.id) === String(it.id); });
      if (idx >= 0) live.splice(idx, 1);
    }
    if (cur.cfg.refresh) cur.cfg.refresh();
    renderList(); toast('已删除');
  };
  window.__qbClear = function () {
    if (!confirm('清空该题库的全部自定义内容？')) return;
    var live = cur.live;
    if (live) {
      cur.custom.forEach(function (it) {
        var idx = live.findIndex(function (o) { return o && o.id != null && String(o.id) === String(it.id); });
        if (idx >= 0) live.splice(idx, 1);
      });
    }
    cur.custom = []; setCustom(cur.key, []);
    if (cur.cfg.refresh) cur.cfg.refresh();
    renderList(); toast('已清空自定义内容');
  };
  window.__qbExport = function (onlyCustom) {
    var live = cur.live;
    var data = { app: '学习工作台', lib: cur.key, label: cur.cfg.label, exportedAt: new Date().toISOString().slice(0, 10) };
    if (onlyCustom || !live) data.custom = cur.custom.slice();
    else data.items = live.slice();
    download(cur.key + '-' + (onlyCustom ? '自定义' : '完整') + '.json', JSON.stringify(data, null, 2));
    toast('📤 已导出 JSON');
  };
  window.__qbImport = function () {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var j = JSON.parse(ev.target.result);
          var arr = Array.isArray(j) ? j : (j && Array.isArray(j.custom) ? j.custom : (j && Array.isArray(j.items) ? j.items : null));
          if (!arr) { toast('无法识别的 JSON：应为数组或 {custom:[…]} / {items:[…]}'); return; }
          var n = 0, skip = 0;
          arr.forEach(function (it) {
            if (!it || typeof it !== 'object') { skip++; return; }
            if (addItem(it)) n++; else skip++;
          });
          afterImport(n, skip);
        } catch (e) { toast('JSON 解析失败：' + e.message); }
      };
      reader.readAsText(file, 'utf-8');
    };
    inp.click();
  };

  window.__qbImportRaw = function (key, items) {
    var cfg = REG[key];
    if (!cfg) return { ok: false, msg: '该题库未开放自定义' };
    var live = liveOf(key);   // 可为 null（内容库仅存管理，不合入内置引擎）
    var custom = getCustom(key);
    var n = 0, skip = 0;
    (items || []).forEach(function (it) {
      if (!it || typeof it !== 'object') { skip++; return; }
      var err = cfg.validate ? cfg.validate(it) : null;
      if (err) { skip++; return; }
      var mx = cfg.maxId ? cfg.maxId(live) : 0;
      custom.forEach(function (x) { if (x && typeof x.id === 'number' && x.id > mx) mx = x.id; });
      var id = (it.id != null) ? it.id : (mx + 1);
      var dup = custom.some(function (x) { return x && x.id != null && String(x.id) === String(id); }) ||
        (live ? live.some(function (x) { return x && x.id != null && String(x.id) === String(id); }) : false);
      if (dup) { skip++; return; }
      var copy = JSON.parse(JSON.stringify(it));
      if (copy.id == null) copy.id = id;
      custom.push(copy); if (live) live.push(copy);
      n++;
    });
    if (n) { setCustom(key, custom); if (cfg.refresh) cfg.refresh(); }
    return { ok: true, n: n, skip: skip };
  };
  window.__qbReg = function () { var o = {}; for (var k in REG) { o[k] = REG[k].label; } return o; };

  inject();   // 页面加载即把已保存的自定义并入对应内置数组

  /* 按页面注入顶部「我的题库」入口（🧠） */
  (function () {
    var map = {
      '四级词汇.html': 'cet', '面试题库.html': 'iv', '商务礼仪.html': 'etiquet',
      '场景话术库.html': 'scenes', '万能金句库.html': 'quotes', 'PPT版式库.html': 'layouts',
      'PPT案例拆解.html': 'cases', '行测刷题.html': 'exam', '央国企笔试.html': 'exam'
    };
    var name = decodeURIComponent(location.pathname.split('/').pop());
    var key = map[name];
    if (!key || !REG[key]) return;
    var tt = document.querySelector('.topbar');
    if (!tt || document.getElementById('qbTopBtn')) return;
    var anchor = document.getElementById('themeToggle') || null;
    var b = document.createElement('button');
    b.id = 'qbTopBtn'; b.innerHTML = '<span class="nav-icon" data-icon="brain" data-icon-size="18"></span>'; b.title = '我的题库 · 自定义/导入管理';
    b.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;padding:2px 4px;line-height:1';
    b.onclick = function () { openQBank(key); };
    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(b, anchor);
    else tt.appendChild(b);
  })();
})();
