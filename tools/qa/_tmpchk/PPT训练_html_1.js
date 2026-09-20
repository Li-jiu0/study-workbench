/* ==================== K4：设计基础/实战模板库/技巧提升 → 页面内全屏视图（20260913K） ====================
   原三入口经 openMiniQuiz 生成居中弹窗（#mzMask），现改由本页 #pptPanel 全屏面板承载：
   顶部返回栏 + ESC 退出 + 锁滚动，面板骨架与内容版式对齐「PPT版式库」呈现风格（样式见 <style> 区）。
   题目渲染/判分/解析/学习数据联动逻辑全部保留在 assets/mini.js（openMiniQuiz 引擎），零改动；
   本脚本只做「呈现载体」替换与入口包装（非本页类目照常透传原引擎）。 */
(function () {
  'use strict';
  var PANEL_ID = 'pptPanel', SLOT_ID = 'pptPanelSlot';
  var CATS = {
    'ppt-design': {
      t: '设计基础', icon: 'star', tag: '3 节课 · 10 组正反例 · 课后小测',
      desc: '按「学 → 看 → 练」走：四原则、配色系统、字体系统 3 节课，每节配正反例对照（代码自绘，不外链图片），课中随堂测即时判分并给解析，最后有课后小测验收。先学后练，不再一进来就考试。'
    },
    'ppt-templates': {
      t: '实战模板库', icon: 'clipboard', tag: '5 套模板 · 25 帧骨架预览 · 可一键套用',
      desc: '通用八件套 / 商务汇报风 / 教育培训风 / 数据分析风 / 模板选用方法论共 5 套，每套含 5 帧骨架预览（封面、目录、内容双栏、数据页、结束页）、4 色配色方案与标题正文字体搭配，可一键复制 HTML 骨架直接套用。'
    },
    'ppt-tips': {
      t: '技巧提升', icon: 'zap', tag: '5 专题 · 13 道练习 · 6 项实战任务',
      desc: '学练闭环三个环节：①技巧速览保留原有 5 个专题卡片（可展开深入说明）；②技巧练习按专题配 13 道题，即时判分带解析；③实战任务 6 项 checklist，对着自己的 PPT 逐条打勾。'
    }
  };
  var engineFn = null; // mini.js 引擎原函数（未包装前的引用，防自递归）

  function $id(x) { return document.getElementById(x); }
  function panelOpen() { var p = $id(PANEL_ID); return !!(p && p.classList.contains('open')); }

  /* 把引擎生成的 #mzMask 迁入全屏面板（仅移动 DOM 节点，不改引擎内部状态） */
  function mountMask() {
    var m = $id('mzMask'), slot = $id(SLOT_ID);
    if (m && slot && m.parentElement !== slot) slot.appendChild(m);
  }
  function hidePanel() {
    var p = $id(PANEL_ID);
    if (p) {
      p.classList.remove('open');
      var s = $id(SLOT_ID);
      if (s) s.innerHTML = '';
    }
    if (window.closeAppModal) { try { window.closeAppModal(PANEL_ID); } catch (e) { /* 忽略 */ } }
  }

  /* 入口：本页「设计基础」「实战模板库」「技巧提升」三卡片调用（其余类目透传原引擎） */
  window.openPptPanel = function (id) {
    var cat = CATS[id];
    if (!cat) { if (window.openMiniQuiz) window.openMiniQuiz(id); return; }
    var engine = engineFn || window.openMiniQuiz;
    if (!engine || engine.__pptPatched) { if (window.showToast) window.showToast('内容加载中，请稍后再试'); return; }
    var t = $id('pptPanelTitle'); if (t) t.textContent = 'PPT · ' + cat.t;
    var tag = $id('pptPanelTag'); if (tag) tag.textContent = cat.tag;
    var desc = $id('pptPanelDesc'); if (desc) desc.textContent = cat.desc;
    var ic = $id('pptPanelIcon');
    if (ic) ic.innerHTML = (window.lucideIcon ? window.lucideIcon(cat.icon, 18) : '');
    var body = $id('pptPanelBody'); if (body) body.scrollTop = 0;
    var p = $id(PANEL_ID); if (p) p.classList.add('open');
    if (window.openAppModal) { try { window.openAppModal(PANEL_ID); } catch (e) { /* 忽略 */ } } // 锁滚动，与听力面板一致
    engine(id);   // 引擎照常渲染题目/解析/判分（逻辑零改动）
    mountMask();  // 呈现载体迁入全屏面板
  };

  window.closePptPanel = function () {
    if (window.openMiniQuiz && window.openMiniQuiz.__close) window.openMiniQuiz.__close(); // 引擎清理会话/移除 mzMask
    hidePanel();
  };

  /* 需求07：综合功能模块容器开关（只收拢入口；子模块内容仍由上方三个 feature-card 承载） */
  window.openPptHub = function () {
    var h = $id('pptHub');
    if (!h) return;
    h.classList.add('open');
    var b = h.querySelector('.ppt-view-body'); if (b) b.scrollTop = 0;
    if (window.openAppModal) { try { window.openAppModal('pptHub'); } catch (e) { /* 忽略 */ } } // 锁滚动，与既有面板一致
  };
  window.closePptHub = function () {
    var h = $id('pptHub');
    if (h) h.classList.remove('open');
    if (window.closeAppModal) { try { window.closeAppModal('pptHub'); } catch (e) { /* 忽略 */ } }
  };

  function setup() {
    // 入口改指新视图：包装 openMiniQuiz，本页三个类目转由全屏面板承载，其余类目透传
    var raw = window.openMiniQuiz;
    if (raw && !raw.__pptPatched) {
      engineFn = raw;
      var wrapped = function (id) {
        if (CATS[id]) window.openPptPanel(id);
        else raw(id);
      };
      wrapped.__pick = raw.__pick;
      wrapped.__next = raw.__next;
      wrapped.__again = raw.__again;
      wrapped.__finish = raw.__finish;
      wrapped.__close = raw.__close;
      wrapped.__pptPatched = true;
      window.openMiniQuiz = wrapped;
    }
    // 兜底同步：引擎内部可能重建（再来一组）或移除（点关闭）#mzMask，观察 body 统一联动
    if (window.MutationObserver) {
      new MutationObserver(function () {
        // R48 T00：V2 渲染期（window.__pptV2Active）不接管面板，避免 body 子节点变动误关 V2 视图
        if (!panelOpen() || window.__pptV2Active) return;
        if ($id('mzMask')) mountMask();
        else hidePanel();
      }).observe(document.body, { childList: true });
    }
    // ESC 退出：先关子面板，再关综合模块容器（层级由内到外）
    document.addEventListener('keydown', function (e) {
      if (!(e.key === 'Escape' || e.keyCode === 27)) return;
      if (panelOpen()) { window.closePptPanel(); return; }
      var h = $id('pptHub');
      if (h && h.classList.contains('open')) window.closePptHub();
    });
  }

  if (document.readyState !== 'loading') setup();
  else document.addEventListener('DOMContentLoaded', setup);
})();