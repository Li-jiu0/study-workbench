/* ==================== T7 增量（P0-8/P0-13）：统计卡 + 作品集 ====================
   【20260913K】原三关卡闯关卡（含进度持久化 localStorage 键）已随卡片下线删除，无死引用。 */
(function () {
  'use strict';
  function $id(x) { return document.getElementById(x); }
  /* R58（20260914e）：作品集 P0（Modal 添加 + 缩略图卡片）/ P1（大图预览 + 说明 + 标签）
     已下沉到 assets/ppt-works.js —— 存储键 xtc:lib:pptw:works（经 XTC.storage 自动 lsKeySafe 多账号隔离），
     旧键 study_workbench_ppt_portfolio 由该模块一次性升迁读取且**保留不清空**。
     此处只保留转发，保证页面既有 onclick 与其它脚本的调用不失效（行为不回退）。 */
  function W() { return window.PPTWorks; }

  function loadFolio() { return W() ? W().load() : []; }
  function renderFolio() { if (W()) W().render(); }

  window.pptAddWork = function () { if (W()) W().openAdd(); };

  window.pptViewWork = function (idx) {
    var w = loadFolio()[idx];
    if (w && W()) W().openView(w.id);
  };

  window.pptDelWork = function (idx) {
    var w = loadFolio()[idx];
    if (w && W()) W().del(w.id);
  };

  /* ===== ADR-3（20260915adr3）：#pptWorkModal / #pptWorkView 由遮罩弹窗改为页面内布局 =====
     assets/ppt-works.js（不可改）内部统一走 openMask/closeMask → window.openAppModal/closeAppModal，
     而 app.js 的原实现只认 .app-modal-mask 且会锁 body 滚动，已不适用于页面内区块。
     故在此对这两个 id 做拦截：仅切 .active 显隐（不锁滚动），其余弹窗仍透传给 app.js 原始实现。
     .active 必须保留 —— ppt-works.js 的 ← → 翻页判活与 openMask 兜底分支都依赖该类名。 */
  var PW_INLINE = { pptWorkModal: 1, pptWorkView: 1 };
  var PW_LIST = 'pptWorkList';

  function pwShowList() {
    var l = $id(PW_LIST);
    if (l) l.style.display = '';
  }

  function pwShow(id) {
    var m = $id(id);
    if (!m) return;
    // 两个页面内区块互斥；展开添加表单时若停在详情视图则先回到列表
    var v = $id('pptWorkView'), a = $id('pptWorkModal');
    if (id === 'pptWorkView') { if (a) a.classList.remove('active'); }
    else { if (v) v.classList.remove('active'); pwShowList(); }
    m.classList.add('active');
    if (id === 'pptWorkView') { var l = $id(PW_LIST); if (l) l.style.display = 'none'; }
  }

  function pwHide(id) {
    var m = $id(id);
    if (m) m.classList.remove('active');
    pwShowList();
  }

  /** 必须在 app.js 之后执行（defer 脚本全部跑完即 DOMContentLoaded），否则会被其函数声明覆盖 */
  function pwPatchAppModal() {
    var oOpen = window.openAppModal, oClose = window.closeAppModal;
    window.openAppModal = function (id) {
      if (PW_INLINE[id]) { pwShow(id); return; }
      if (typeof oOpen === 'function') oOpen(id);
    };
    window.closeAppModal = function (id) {
      if (PW_INLINE[id]) { pwHide(id); return; }
      if (typeof oClose === 'function') oClose(id);
    };
    // app.js 的全局 ESC 只收 .app-modal-mask，页面内区块在此自行接管
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.keyCode !== 27) return;
      if ($id('pptWorkView') && $id('pptWorkView').classList.contains('active')) { if (W()) W().closeView(); return; }
      if ($id('pptWorkModal') && $id('pptWorkModal').classList.contains('active')) { if (W()) W().closeAdd(); }
    });
  }
  document.addEventListener('DOMContentLoaded', pwPatchAppModal);

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
  function boot() {
    if (window.StudyStats) StudyStats.render('pptStatsCard', 'ppt');
    renderFolio();
  }
})();