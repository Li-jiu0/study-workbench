/* =====================================================================
   ppt-works.js · R58「PPT · 我的作品集」P0 + P1（版本戳 20260914e）
   ---------------------------------------------------------------------
   定位：替换 PPT训练.html 里「只能填标题 + 一句话笔记」的旧作品集实现，
        P0 = 添加改 Modal（标题/类型/多图上传/设计说明/标签）+ 卡片缩略图；
        P1 = 查看大图预览（多图左右翻页 + 设计说明 + 标签）。

   契约（与 design-class.js / tpl-preview.js / ppt-tips.js 同构，ADR-2 注册表模式）：
     · 宿主 PPT训练.html 只提供 #pptFolioGrid + 两个 .app-modal 容器，本文件不改 HTML 结构；
     · 幂等注册 window.PPTV2['ppt-works']，可经 openPptPanel('ppt-works') 在全屏面板内复用；
     · 弹窗走 T19 统一 .app-modal 基础设施（openAppModal/closeAppModal：ESC + 点遮罩 + 锁滚动）；
     · 存储走 XTC.storage（内部自动 lsKeySafe 多账号隔离），键前缀严格用 xtc:lib:pptw:
       —— 严禁使用 xtc:learn: / xtc:quiz: 通用命名空间（历史撞车事故）；
     · 图标全部取自 icon-map.js 既有名（briefcase/image/plus/eye/trash/chevron-left/chevron-right/
       tag/close），动态 innerHTML 后统一 XTC.renderIcons()（内部即 window.lucideAutoRender）。

   【后续扩展点】
     P2 个人主页作品墙：load() 已可跨页取数，届时需暴露公开列表查询。
     P3 他人可见 / 隐私 / 分享：isPublic / authorId / authorName / likes / views 字段已预留，
        当前 UI 不消费（不做分享入口，不做隐私开关）。
   ===================================================================== */
(function () {
  'use strict';

  var KEY = 'xtc:lib:pptw:works';                 // 新数据（受 lsKeySafe 多账号隔离）
  var LEGACY_KEY = 'study_workbench_ppt_portfolio'; // 旧数据（仅读取迁移，绝不清空）
  var TYPES = ['封面页', '目录页', '内容页', '数据页', '结束页', '整份稿件', '其他'];
  var MAX_IMAGES = 6;
  var MAX_EDGE = 1000;      // 图片压缩长边上限
  var KEEP_BELOW = 300 * 1024; // 小于该体积且无需缩放时保留原图
  var VIEW_ID = 'ppt-works';

  var pending = [];   // 添加弹窗里待保存的图片 base64
  var curId = '';     // 当前预览的作品 id
  var curImg = 0;     // 当前预览第几张
  var migrated = false;

  /* ---------------------------------------------------------------- 工具 */
  function $id(x) { return document.getElementById(x); }

  function esc(s) {
    if (window.XTC && typeof window.XTC.esc === 'function') return window.XTC.esc(s);
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ic(name, size) {
    if (window.XTC && typeof window.XTC.icon === 'function') return window.XTC.icon(name, size);
    return '<span class="nav-icon" data-icon="' + esc(name) + '" data-icon-size="' + (size || 18) + '"></span>';
  }

  /** 动态 innerHTML 之后补渲染 data-icon（icon-map.js 的 lucideAutoRender） */
  function icons(root) {
    if (window.XTC && typeof window.XTC.renderIcons === 'function') {
      try { window.XTC.renderIcons(root); } catch (e) { /* 忽略 */ }
      return;
    }
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e2) { /* 忽略 */ }
    }
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg); return; } catch (e) { /* 继续兜底 */ } }
    if (window.alert) window.alert(msg);
  }

  function rawKey(k) {
    try { if (typeof window.lsKey === 'function') return window.lsKey(k); } catch (e) { /* 忽略 */ }
    return k;
  }

  function openMask(id) {
    var m = $id(id);
    if (!m) return;
    if (typeof window.openAppModal === 'function') { try { window.openAppModal(id); return; } catch (e) { /* 继续兜底 */ } }
    m.classList.add('active');
    try { document.body.classList.add('modal-lock'); } catch (e2) { /* 忽略 */ }
  }

  function closeMask(id) {
    var m = $id(id);
    if (!m) return;
    if (typeof window.closeAppModal === 'function') { try { window.closeAppModal(id); return; } catch (e) { /* 继续兜底 */ } }
    m.classList.remove('active');
    try { document.body.classList.remove('modal-lock'); } catch (e2) { /* 忽略 */ }
  }

  function fmtDate(v) {
    if (!v) return '';
    if (typeof v === 'number') {
      try { return new Date(v).toLocaleDateString('zh-CN'); } catch (e) { return ''; }
    }
    var s = String(v);
    // 旧数据形如「2026/9/14」：原样显示，避免解析失败变 Invalid Date
    if (s.indexOf('-') < 0 && s.indexOf('/') >= 0) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('zh-CN');
  }

  /** 补齐全部字段，保证读旧数据 / 读新数据都结构一致 */
  function norm(o) {
    var x = o || {};
    var imgs = (x.images && Object.prototype.toString.call(x.images) === '[object Array]') ? x.images : [];
    return {
      id: x.id || ('w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      title: String(x.title || '未命名作品'),
      type: x.type || '其他',
      images: imgs,
      description: String(x.description || x.note || ''),
      tags: (x.tags && Object.prototype.toString.call(x.tags) === '[object Array]') ? x.tags : [],
      createdAt: x.createdAt || x.date || new Date().toISOString(),
      isPublic: !!x.isPublic,
      authorId: x.authorId || (window.CURRENT_ACCOUNT || ''),
      authorName: x.authorName || curName(),
      likes: x.likes || 0,
      views: x.views || 0
    };
  }

  function curName() {
    try {
      if (window.CURRENT_USER && window.CURRENT_USER.name) return window.CURRENT_USER.name;
      var el = document.querySelector('.user-card .user-name');
      return el ? String(el.textContent || '').trim() : '';
    } catch (e) { return ''; }
  }

  /* ---------------------------------------------------------------- 存储 */
  function load() {
    var list = null;
    if (window.XTC && window.XTC.storage) {
      list = window.XTC.storage.get(KEY, null);
    } else {
      try { list = JSON.parse(localStorage.getItem(rawKey(KEY)) || 'null'); } catch (e) { list = null; }
    }
    if (!list || Object.prototype.toString.call(list) !== '[object Array]') return [];
    return list;
  }

  function save(list) {
    if (window.XTC && window.XTC.storage) return window.XTC.storage.set(KEY, list);
    try { localStorage.setItem(rawKey(KEY), JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  /** 旧数据（标题 + 一句话笔记 + 日期[+缩略图]）一次性升迁；旧键保留不清空 */
  function migrate() {
    if (migrated) return;
    migrated = true;
    if (load().length) return;
    var old = null;
    try { old = JSON.parse(localStorage.getItem(rawKey(LEGACY_KEY)) || 'null'); } catch (e) { old = null; }
    if (!old || !old.length) {
      try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch (e2) { old = null; }
    }
    if (!old || !old.length) return;
    var out = [];
    for (var i = 0; i < old.length; i++) {
      var o = old[i] || {};
      if (!o.title) continue;
      out.push(norm({
        id: 'w_legacy_' + i + '_' + Date.now(),
        title: o.title,
        type: '其他',
        images: o.thumb ? [o.thumb] : [],
        description: o.note || '',
        tags: [],
        createdAt: o.date || '',
        isPublic: false, authorId: '', authorName: '', likes: 0, views: 0
      }));
    }
    if (out.length) save(out);
  }

  function findById(id) {
    var list = load();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return norm(list[i]);
    return null;
  }

  /** 写入；容量不足时降级为纯文本，再失败则放弃并提示 */
  function add(item) {
    var list = load();
    list.push(item);
    if (save(list)) return true;
    var lite = norm(item);
    lite.images = [];
    list[list.length - 1] = lite;
    if (save(list)) { toast('本地空间不足，已保存为纯文本（不含图片）'); return true; }
    list.pop();
    save(list);
    toast('本地空间不足，请先删除部分作品再试');
    return false;
  }

  /* ---------------------------------------------------------------- 图片压缩 */
  function readShrink(file, cb) {
    if (!window.FileReader) { cb(''); return; }
    var fr = new FileReader();
    fr.onload = function () { shrink(String(fr.result || ''), cb); };
    fr.onerror = function () { cb(''); };
    fr.readAsDataURL(file);
  }

  function shrink(dataUrl, cb) {
    if (!dataUrl) { cb(''); return; }
    if (!window.Image) { cb(dataUrl); return; }
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (!w || !h) { cb(dataUrl); return; }
      var scale = Math.min(1, MAX_EDGE / w, MAX_EDGE / h);
      if (scale >= 1 && dataUrl.length < KEEP_BELOW) { cb(dataUrl); return; }
      try {
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        cb(cv.toDataURL('image/jpeg', 0.72));
      } catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  /* ---------------------------------------------------------------- 卡片列表 */
  function renderInto(el) {
    if (!el) return;
    var items = load();
    if (!items.length) {
      el.innerHTML = '<div class="pptfolio-empty" style="grid-column:1/-1">还没有作品，点「+ 添加作品」记录你的仿写练习</div>';
      return;
    }
    var html = '';
    for (var i = items.length - 1; i >= 0; i--) {
      var w = norm(items[i]);
      var cover = w.images.length ? w.images[0] : '';
      html += '<div class="pptfolio-item pw-card" data-pw-id="' + esc(w.id) + '">' +
        (cover
          ? '<img class="pw-thumb" src="' + esc(cover) + '" alt="">'
          : '<div class="pw-thumb pw-thumb-ph">' + ic('image', 22) + '</div>') +
        '<div class="pw-body">' +
        '<div class="pw-title">' + esc(w.title) + '</div>' +
        '<div class="pw-meta">' + esc(fmtDate(w.createdAt)) + '</div>' +
        '<div class="pw-typeline"><span class="pw-type">' + esc(w.type) + '</span>' +
        (w.images.length ? '<span class="pw-imgcnt">' + ic('image', 12) + w.images.length + '</span>' : '') +
        '</div></div>' +
        '<div class="pw-hover">' +
        '<span class="pw-act" data-pw-act="view" data-pw-id="' + esc(w.id) + '">' + ic('eye', 14) + ' 查看</span>' +
        '<span class="pw-act pw-act-del" data-pw-act="del" data-pw-id="' + esc(w.id) + '">' + ic('trash', 14) + ' 删除</span>' +
        '</div></div>';
    }
    el.innerHTML = html;
    icons(el);
  }

  function render() {
    var nodes = document.querySelectorAll('.pptfolio-grid');
    if (!nodes.length) { renderInto($id('pptFolioGrid')); return; }
    for (var i = 0; i < nodes.length; i++) renderInto(nodes[i]);
  }

  /* ---------------------------------------------------------------- 添加弹窗 */
  function renderPending() {
    var box = $id('pwThumbs');
    if (!box) return;
    var html = '';
    for (var i = 0; i < pending.length; i++) {
      html += '<div class="pw-thumb-item"><img src="' + esc(pending[i]) + '" alt="">' +
        '<span class="pw-thumb-x" data-pw-rm="' + i + '">×</span></div>';
    }
    box.innerHTML = html;
    var xs = box.querySelectorAll('[data-pw-rm]');
    for (var k = 0; k < xs.length; k++) {
      (function (node) {
        node.addEventListener('click', function () {
          var idx = parseInt(node.getAttribute('data-pw-rm'), 10);
          if (!isNaN(idx)) { pending.splice(idx, 1); renderPending(); }
        });
      })(xs[k]);
    }
  }

  function openAdd() {
    migrate();
    pending = [];
    var t = $id('pwTitle'); if (t) t.value = '';
    var d = $id('pwDesc'); if (d) d.value = '';
    var g = $id('pwTags'); if (g) g.value = '';
    var s = $id('pwType'); if (s) s.value = TYPES[0];
    var f = $id('pwFiles'); if (f) f.value = '';
    renderPending();
    openMask('pptWorkModal');
  }

  function closeAdd() {
    closeMask('pptWorkModal');
  }

  function pickFiles(input) {
    var files = input && input.files ? input.files : [];
    if (!files.length) return;
    if (files.length + pending.length > MAX_IMAGES) toast('最多上传 ' + MAX_IMAGES + ' 张，多余的已忽略');
    for (var i = 0; i < files.length; i++) {
      if (pending.length >= MAX_IMAGES) break;
      (function () {
        readShrink(files[i], function (d) {
          if (d && pending.length < MAX_IMAGES) pending.push(d);
          renderPending();
        });
      })();
    }
  }

  function saveWork() {
    var title = String((($id('pwTitle') || {}).value) || '').trim();
    if (!title) { toast('请填写作品标题'); return; }
    var type = String((($id('pwType') || {}).value) || TYPES[0]);
    var desc = String((($id('pwDesc') || {}).value) || '').trim();
    var tagStr = String((($id('pwTags') || {}).value) || '').trim();
    var tags = [];
    if (tagStr) {
      var parts = tagStr.split(/[,，;；\s]+/);
      for (var i = 0; i < parts.length && tags.length < 6; i++) if (parts[i]) tags.push(parts[i]);
    }
    var item = norm({
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title: title.slice(0, 40),
      type: type,
      images: pending.slice(0, MAX_IMAGES),
      description: desc.slice(0, 300),
      tags: tags,
      createdAt: new Date().toISOString(),
      isPublic: false, authorId: (window.CURRENT_ACCOUNT || ''), authorName: curName(),
      likes: 0, views: 0
    });
    if (!add(item)) return;
    pending = [];
    closeAdd();
    render();
    toast('作品已保存');
    if (window.StudyStats && typeof window.StudyStats.track === 'function') {
      try { window.StudyStats.track('ppt', 'task', { type: 'portfolio_add' }); } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------------------------------------------------------------- 大图预览（P1） */
  function paintViewer() {
    var w = findById(curId);
    if (!w) return;
    var imgs = w.images || [];
    var img = $id('pwVImg');
    var cnt = $id('pwVCount');
    var prev = document.querySelector('#pptWorkView .pw-v-prev');
    var next = document.querySelector('#pptWorkView .pw-v-next');
    if (curImg < 0) curImg = 0;
    if (imgs.length && curImg > imgs.length - 1) curImg = imgs.length - 1;
    if (img) {
      if (imgs.length) { img.src = imgs[curImg]; img.style.display = 'block'; }
      else { img.removeAttribute('src'); img.style.display = 'none'; }
    }
    if (cnt) cnt.textContent = imgs.length ? ((curImg + 1) + ' / ' + imgs.length) : '暂无图片';
    var multi = imgs.length > 1;
    if (prev) prev.style.display = multi ? '' : 'none';
    if (next) next.style.display = multi ? '' : 'none';
  }

  function openView(id) {
    migrate();
    var w = findById(id);
    if (!w) { toast('作品不存在或已被删除'); return; }
    curId = id;
    curImg = 0;
    // 浏览数自增（P3 作品墙会用到，当前 UI 不展示）
    var list = load();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) { list[i] = norm(list[i]); list[i].views = (list[i].views || 0) + 1; save(list); break; }
    }
    var t = $id('pwVTitle'); if (t) t.textContent = w.title;
    var m = $id('pwVMeta'); if (m) m.textContent = fmtDate(w.createdAt) + ' · ' + w.type;
    var d = $id('pwVDesc'); if (d) d.textContent = w.description || '（暂无设计说明）';
    var tg = $id('pwVTags');
    if (tg) {
      var th = '';
      for (var k = 0; k < w.tags.length; k++) th += '<span class="pw-tag">' + esc(w.tags[k]) + '</span>';
      tg.innerHTML = th;
      icons(tg);
    }
    paintViewer();
    openMask('pptWorkView');
  }

  function closeView() {
    curId = '';
    curImg = 0;
    closeMask('pptWorkView');
  }

  function nav(delta) {
    var w = findById(curId);
    if (!w) return;
    var len = (w.images || []).length;
    if (!len) return;
    curImg = (curImg + delta + len) % len;
    paintViewer();
  }

  function del(id) {
    var w = findById(id);
    if (!w) return;
    if (!window.confirm('删除作品「' + w.title + '」？此操作不可恢复。')) return;
    var list = load();
    var next = [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id !== id) next.push(list[i]);
    save(next);
    if (curId === id) closeView();
    render();
    toast('已删除');
  }

  /* ---------------------------------------------------------------- 事件委托 */
  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var act = t.closest('[data-pw-act]');
      if (act) {
        var id = act.getAttribute('data-pw-id');
        if (act.getAttribute('data-pw-act') === 'del') del(id);
        else openView(id);
        return;
      }
      var card = t.closest('.pw-card');
      if (card) openView(card.getAttribute('data-pw-id'));
    });
    document.addEventListener('keydown', function (e) {
      var v = $id('pptWorkView');
      if (!v || !v.classList.contains('active')) return;
      if (e.key === 'ArrowLeft' || e.keyCode === 37) nav(-1);
      else if (e.key === 'ArrowRight' || e.keyCode === 39) nav(1);
    });
  }

  /* ---------------------------------------------------------------- 注册（幂等） */
  function panelView(slot) {
    if (!slot) return;
    var box = document.createElement('div');
    box.className = 'pptfolio-grid';
    slot.appendChild(box);
    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.cssText = 'font-size:var(--xt-font-sm);padding:5px 14px;margin-top:10px';
    btn.innerHTML = ic('plus', 14) + ' 添加作品';
    btn.addEventListener('click', function () { openAdd(); });
    slot.appendChild(btn);
    renderInto(box);
    icons(slot);
  }

  function register() {
    window.PPTV2 = window.PPTV2 || {};
    window.PPTV2[VIEW_ID] = panelView;
    if (window.XTC && typeof window.XTC.registerView === 'function') {
      window.XTC.registerView('PPTV2', VIEW_ID, panelView);
    }
  }

  function boot() {
    migrate();
    bind();
    render();
  }

  /* 对外 API：宿主页内联脚本与面板内按钮均可直接调用 */
  window.PPTWorks = {
    TYPES: TYPES,
    load: load,
    save: save,
    render: render,
    openAdd: openAdd,
    closeAdd: closeAdd,
    saveWork: saveWork,
    pickFiles: pickFiles,
    openView: openView,
    closeView: closeView,
    nav: nav,
    del: del
  };
  // onclick 直调别名（保持与页面既有写法一致）
  window.pptWorksOpenAdd = openAdd;
  window.pptWorksCloseAdd = closeAdd;
  window.pptWorksSave = saveWork;
  window.pptWorksPick = pickFiles;
  window.pptWorksOpenView = openView;
  window.pptWorksCloseView = closeView;
  window.pptWorksNav = nav;
  window.pptWorksDel = del;

  register();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
