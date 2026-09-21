/* ==================== R48 T00 · PPTV2 注册表预埋（20260914e，一次性冻结 · F12 时序修正） ====================
   ADR-2：宿主页只在此处预埋一次注册表与分发逻辑，之后 T11(模板库)/T12(设计课堂)/第3批(技巧练习)
   只调用 XTC.registerView('PPTV2', id, fn) 注册渲染函数，**禁止再改本 HTML**（规避并行覆盖）。
   铁律 1：未命中注册表的 id 一律原样透传旧的 openPptPanel / openMiniQuiz 逻辑，一行未删。
   挂载点沿用既有 #pptPanel .ppt-view-slot（全屏页内视图，非弹窗），不新建容器。

   ★ F12 时序修正（两条硬约束）：
     1) 代理必须包进 DOMContentLoaded：本页内联脚本在解析期执行，早于所有 defer 脚本与页尾
        DOMContentLoaded 回调；只有在 DOMContentLoaded 里取到的 window.openPptPanel 才是最终实现。
     2) #pptPanelSlot 每次调用时重新取：面板子节点可能被重建，缓存引用会写进已被丢弃的旧节点
        （表现为「面板空白」）。
     注：注册表对象 PPTV2 仍必须在解析期同步创建 —— defer 的业务脚本早于 DOMContentLoaded 注册。 */
(function () {
  'use strict';
  /* ① 解析期同步建表：tpl-preview.js / design-class.js 等 defer 脚本早于 DOMContentLoaded 执行 */
  window.PPTV2 = window.PPTV2 || {};   // { 'ppt-templates': fn(slotEl), 'ppt-design': fn(slotEl), ... }
  window.__pptV2Active = false;        // V2 视图打开标记（供上方 MutationObserver 判断）

  function $id(x) { return document.getElementById(x); }

  /* 挂载点：优先 id，退回 class —— 每次现取，绝不缓存 */
  function findSlot() {
    var byId = $id('pptPanelSlot');
    if (byId) return byId;
    var panel = $id('pptPanel');
    return panel ? panel.querySelector('.ppt-view-slot') : null;
  }

  function fallback(_legacy, id) {
    if (typeof _legacy === 'function') return _legacy.call(window, id);
    if (typeof window.openMiniQuiz === 'function') return window.openMiniQuiz(id);
    if (window.console && console.warn) console.warn('[PPTV2] openPptPanel / openMiniQuiz 均不可用：' + id);
    return undefined;
  }

  function boot() {
    var _legacy = window.openPptPanel;          // ★ 此处才拿得到最终实现
    var _legacyClose = window.closePptPanel;
    if (typeof _legacy !== 'function') {
      // 不静默吞掉：拿不到就明确告警并停止包装，避免又是一个零报错的坑
      if (window.console && console.warn) console.warn('[PPTV2] legacy openPptPanel 未就绪，跳过包装');
      return;
    }
    if (window.console && console.log) {
      console.log('[PPTV2] 已接管 openPptPanel；typeof _legacy = ' + typeof _legacy +
        '；已注册视图 = ' + Object.keys(window.PPTV2 || {}).join(',') );
    }

    window.openPptPanel = function (id) {
      var fn = (window.PPTV2 || {})[id];
      var panel = $id('pptPanel');
      var slot = findSlot();                    // ★ 每次重取（mk()/面板重建后 id 节点可能是新的）
      if (typeof fn !== 'function' || !panel || !slot) {
        window.__pptV2Active = false;           // 未命中 → 原样透传旧逻辑
        return fallback(_legacy, id);
      }
      window.__pptV2Active = true;
      try {
        slot.innerHTML = '';
        var body = $id('pptPanelBody');
        if (body) body.scrollTop = 0;
        panel.classList.add('open');
        if (typeof window.openAppModal === 'function') {
          try { window.openAppModal('pptPanel'); } catch (e) { /* 锁滚动失败不影响展示 */ }
        }
        fn(slot);
        if (window.XTC && typeof window.XTC.renderIcons === 'function') {
          try { window.XTC.renderIcons(slot); } catch (e) { /* 忽略 */ }
        }
        return true;
      } catch (err) {
        // 异常自动回退旧路径，绝不白屏
        window.__pptV2Active = false;
        if (window.console && console.error) console.error('[PPTV2] ' + id + ' 渲染失败，回退旧逻辑', err);
        slot.innerHTML = '';
        return fallback(_legacy, id);
      }
    };

    if (typeof _legacyClose === 'function') {
      window.closePptPanel = function () {
        window.__pptV2Active = false;
        return _legacyClose.apply(this, arguments);
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();