/* =====================================================================
   2026-09-15 批次八（ADR-3）：群设置 / 联系管理员 —— 遮罩弹窗 → 右栏「页面内视图」
   ---------------------------------------------------------------------
   #imGroupSettingsModal 与 #acPanel 已搬进 #imChat，与 #imEmpty / #imConv 平级。
   本脚本只做「视图互斥切换」的包装：原函数（imOpenGroupSettings / imCloseGroupSettings /
   xtOpenAdminChat / acClose）函数名与内部逻辑全部保留，仅在打开后隐藏会话、关闭后还原会话。
   id 与内部控件 id 一个未动，chat-local.js / admin-contact.js 按 id 照常命中，无死链。
   ===================================================================== */
(function () {
  'use strict';

  var BASE = ['imEmpty', 'imConv'];  // 右栏基础视图（空态 / 会话）
  var cur = null;    // 当前激活视图 id（null = 基础视图在显示）
  var saved = null;  // 进入视图前的基础视图 display 快照

  function $id(x) { return document.getElementById(x); }

  function hideBase() {
    saved = { mobile: document.body.classList.contains('im-mobile') };
    BASE.forEach(function (id) {
      var el = $id(id);
      saved[id] = el ? el.style.display : '';
      if (el) el.style.display = 'none';
    });
  }

  function restoreBase() {
    if (!saved) return;
    BASE.forEach(function (id) {
      var el = $id(id);
      if (el) el.style.display = saved[id];
    });
    if (saved.mobile) document.body.classList.add('im-mobile');
    else document.body.classList.remove('im-mobile');
    saved = null;
  }

  function showView(id) {
    if (cur === id) return;
    if (cur) { var prev = $id(cur); if (prev) prev.style.display = 'none'; }
    else hideBase();
    cur = id;
    var v = $id(id);
    if (v) v.style.display = 'flex';
    /* 窄屏右栏默认隐藏（.im-chat{display:none}），切视图时确保可见 */
    document.body.classList.add('im-mobile');
  }

  function hideView(id) {
    var v = $id(id);
    if (v) v.style.display = 'none';
    if (cur === id) { cur = null; restoreBase(); }
  }

  /* 打开类：原函数跑完再判断是否真的打开了（失败路径只 toast 不改 display） */
  function wrapAfter(name, after) {
    if (typeof window[name] !== 'function' || window[name].__imViewPatched) return;
    var fn = window[name];
    var w = function () { var r = fn.apply(this, arguments); after(); return r; };
    w.__imViewPatched = true;
    window[name] = w;
  }

  /* 关闭类：先收起视图再让原函数走（顺序无关，统一放后面即可） */
  function wrapBefore(name, before) {
    if (typeof window[name] !== 'function' || window[name].__imViewPatched) return;
    var fn = window[name];
    var w = function () { before(); return fn.apply(this, arguments); };
    w.__imViewPatched = true;
    window[name] = w;
  }

  function init() {
    wrapAfter('imOpenGroupSettings', function () {
      var m = $id('imGroupSettingsModal');
      if (m && m.style.display !== 'none') showView('imGroupSettingsModal');
    });
    wrapAfter('imCloseGroupSettings', function () { hideView('imGroupSettingsModal'); });

    wrapAfter('xtOpenAdminChat', function () {
      var p = $id('acPanel');
      if (p && p.style.display !== 'none') showView('acPanel');
    });
    wrapAfter('acClose', function () { hideView('acPanel'); });

    /* 在视图里点左侧会话 → 先收起视图，避免两个视图同时占位 */
    wrapBefore('imOpenChat', function () { if (cur) hideView(cur); });
    wrapBefore('imBackToList', function () { if (cur) hideView(cur); });

    /* admin-contact.js 的 Esc 分支直接调内部 closePanel()（不走 window.acClose），
       这里补一刀还原基础视图；其监听器注册在前，此时面板已 display:none。 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && cur === 'acPanel') hideView('acPanel');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();