/* =====================================================================
   assets/xt-applist.js —— 星途「应用白名单」页逻辑（需求D · 2026-09-28）
   ---------------------------------------------------------------------
   职责：读取本机「已安装应用列表」（走原生桥 window.XTAppBridge）并在
   应用白名单.html 中展示，供用户【手动勾选】，勾选结果【仅存本机】。

   原生桥契约（feature-detect，缺失即优雅降级；方法由 MainActivity 提供）：
     window.XTAppBridge.getInstalledAppsForWhitelist()  —— 同步返回 JSON 字符串
       成功：{"ok":true,"apps":[{"label":"微信","pkg":"com.tencent.mm","sys":false}, …]}
       失败：{"ok":false,"reason":"error"}
     · apps[] 按 label 升序；sys:true 表示系统应用（默认隐藏）；已排除本 App 自身；上限 500 条。
     · 桥不存在 / 方法不存在 / 返回 ok:false / JSON 解析失败 → 全部走降级分支，绝不抛错。

   本机落盘（零网络请求）：
     localStorage['xt_app_whitelist_v1'] = JSON.stringify(["com.tencent.mm", …])
     —— 只存【包名数组】；应用名等展示信息每次从桥取，不落盘。

   安全：所有来自原生桥的 label / pkg 均为不可信字符串，拼入 innerHTML 前
   一律经 alEsc() 转义（防 XSS）。

   语法铁律：ES5（var / function / indexOf / 手写 for；禁 let、const、箭头函数、
   模板串、可选链、数组遍历糖、对象合并、class、展开运算符）。老 WebView 可跑。
   全站禁用原生 confirm/alert：清空二次确认统一走 app.js 的 uiConfirm。
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var AL_KEY = 'xt_app_whitelist_v1';   // 本机白名单存储键（仅包名数组）
  var AL_MAX = 500;                     // 条数上限（与原生桥一致，防御性再截断）

  /* ---------- 运行态 ---------- */
  var alState = {
    ok: false,        // 桥是否可用且返回成功
    apps: [],         // 归一化后的应用对象数组 {label,pkg,sys}
    selected: [],     // 已勾选包名数组（与 localStorage 同步）
    keyword: '',      // 搜索关键字（本地过滤）
    showSys: false    // 是否显示系统应用（默认否）
  };
  var alListEl = null;

  /* ---------- 工具：HTML 转义（不可信字符串拼 innerHTML 前必用） ---------- */
  function alEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- 工具：应用名首字圆形底色的稳定色相（0-359） ---------- */
  function alHashHue(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 360; }
    return h;
  }

  /* ---------- 工具：Toast（app.js 未就绪时静默） ---------- */
  function alToast(msg) {
    try { if (typeof window.showToast === 'function') { window.showToast(msg); } } catch (e) { }
  }

  /* ===================================================================
     ① 本机持久化（仅包名数组）
     =================================================================== */
  function alLoadSelected() {
    var out = [];
    try {
      var raw = localStorage.getItem(AL_KEY);
      if (!raw) return out;
      var arr = JSON.parse(raw);
      if (!arr || typeof arr.length !== 'number') return out;
      for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (typeof v === 'string' && v && out.indexOf(v) === -1) out.push(v);
      }
    } catch (e) { out = []; }
    return out;
  }
  function alSaveSelected() {
    try { localStorage.setItem(AL_KEY, JSON.stringify(alState.selected)); } catch (e) { /* 无痕模式忽略 */ }
  }
  function alIsSelected(pkg) { return alState.selected.indexOf(pkg) !== -1; }
  function alCountSelected() { return alState.selected.length; }

  /* ===================================================================
     ② 原生桥：读取已安装应用列表（全分支返回统一结果对象，绝不抛错）
        { ok:true, apps:[…] } | { ok:false, reason:'nobridge'|'throw'|'empty'|'parse'|'notok' }
     =================================================================== */
  function alBridge() {
    try {
      if (window.XTAppBridge && typeof window.XTAppBridge.getInstalledAppsForWhitelist === 'function') return window.XTAppBridge;
      if (window.AndroidBridge && typeof window.AndroidBridge.getInstalledAppsForWhitelist === 'function') return window.AndroidBridge;
    } catch (e) { /* 桥访问异常按缺失处理 */ }
    return null;
  }
  function alFetchApps() {
    var br = alBridge();
    if (!br) return { ok: false, reason: 'nobridge', apps: [] };
    var raw;
    try { raw = br.getInstalledAppsForWhitelist(); }
    catch (e) { return { ok: false, reason: 'throw', apps: [] }; }
    if (raw === null || raw === undefined || raw === '') return { ok: false, reason: 'empty', apps: [] };
    var obj;
    try { obj = JSON.parse(String(raw)); }
    catch (e2) { return { ok: false, reason: 'parse', apps: [] }; }
    if (!obj || obj.ok !== true || !obj.apps || typeof obj.apps.length !== 'number') {
      return { ok: false, reason: (obj && obj.reason) ? String(obj.reason) : 'notok', apps: [] };
    }
    return { ok: true, reason: '', apps: obj.apps };
  }

  /* 归一化：字段强制字符串、剔除空包名、按 label 升序、上限截断 */
  function alAppsNormalize(list) {
    var out = [];
    if (!list || typeof list.length !== 'number') return out;
    for (var i = 0; i < list.length && out.length < AL_MAX; i++) {
      var a = list[i];
      if (!a) continue;
      var pkg = String(a.pkg == null ? '' : a.pkg);
      if (!pkg) continue;
      out.push({ label: String(a.label == null ? '' : a.label), pkg: pkg, sys: a.sys === true });
    }
    out.sort(function (x, y) {
      if (x.label < y.label) return -1;
      if (x.label > y.label) return 1;
      return 0;
    });
    return out;
  }

  /* ===================================================================
     ③ 过滤（本地：关键字 + 系统应用开关）
     =================================================================== */
  function alFiltered() {
    var out = [];
    var kw = alState.keyword ? alState.keyword.toLowerCase() : '';
    for (var i = 0; i < alState.apps.length; i++) {
      var a = alState.apps[i];
      if (a.sys && !alState.showSys) continue;
      if (kw) {
        var label = a.label.toLowerCase();
        var pkg = a.pkg.toLowerCase();
        if (label.indexOf(kw) === -1 && pkg.indexOf(kw) === -1) continue;
      }
      out.push(a);
    }
    return out;
  }

  /* ===================================================================
     ④ 渲染
     =================================================================== */
  function alEmptyHtml(kind, kw) {
    var title, desc, icon = 'inbox';
    if (kind === 'nobridge') {
      title = '当前环境不支持读取应用列表（请在 App 内打开本页）';
      desc = '浏览器 / 预览环境无法读取已安装应用；你在 App 内已保存的勾选仍保留在本机。';
      icon = 'smartphone';
    } else if (kind === 'none') {
      title = '未读取到任何应用';
      desc = '本机没有可展示的应用，或系统限制了读取权限。';
    } else {
      title = '没有匹配的应用';
      desc = '没有找到与「' + alEsc(kw) + '」相符的应用名或包名。';
    }
    return '<div class="xt-empty">'
      + '<div class="xt-empty-icon"><span class="nav-icon" data-icon="' + icon + '" data-icon-size="42"></span></div>'
      + '<div class="xt-empty-title">' + title + '</div>'
      + '<div class="xt-empty-desc">' + desc + '</div>'
      + '</div>';
  }

  function alRowHtml(a) {
    var pkg = a.pkg, label = a.label, sys = a.sys === true;
    var on = alIsSelected(pkg);
    var initial = label.length > 0 ? label.charAt(0) : '?';
    var hue = alHashHue(pkg);
    return '<div class="al-item' + (on ? ' on' : '') + '" data-pkg="' + alEsc(pkg) + '">'
      + '<div class="al-av" style="background:hsl(' + hue + ',60%,52%)">' + alEsc(initial) + '</div>'
      + '<div class="al-main">'
      + '<div class="al-name">' + alEsc(label.length > 0 ? label : pkg) + '</div>'
      + '<div class="al-pkg">' + alEsc(pkg) + (sys ? '<span class="al-sys">系统应用</span>' : '') + '</div>'
      + '</div>'
      + '<div class="al-check' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</div>'
      + '</div>';
  }

  function alRenderList() {
    if (!alListEl) alListEl = document.getElementById('alList');
    if (!alListEl) return;
    /* 降级：桥缺失 / 失败 —— 只显示友好提示，已保存勾选不丢（仍在本机 localStorage） */
    if (!alState.ok) { alListEl.innerHTML = alEmptyHtml('nobridge', ''); alRenderIcons(); return; }
    var list = alFiltered();
    if (!list.length) {
      alListEl.innerHTML = alEmptyHtml(alState.apps.length === 0 ? 'none' : 'filter', alState.keyword);
      alRenderIcons();
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) { html += alRowHtml(list[i]); }
    alListEl.innerHTML = html;
    alRenderIcons();
  }
  function alRenderIcons() {
    if (alListEl && typeof window.renderIcons === 'function') {
      try { window.renderIcons(alListEl); } catch (e) { }
    }
  }
  function alRenderCount() {
    var el = document.getElementById('alCount');
    if (!el) return;
    var n = alCountSelected();
    el.textContent = '已选 ' + n + ' 个';
    el.className = 'al-count' + (n > 0 ? ' on' : '');
  }
  function alSyncSysToggleUI() {
    var b = document.getElementById('alSysToggle');
    if (!b) return;
    b.className = 'theme-option' + (alState.showSys ? ' active' : '');
    b.setAttribute('aria-pressed', alState.showSys ? 'true' : 'false');
  }

  /* ===================================================================
     ⑤ 交互
     =================================================================== */
  /* 按行切换勾选：从事件目标向上找最近的 .al-item（带 data-pkg 的行） */
  function alFindItem(node) {
    var el = node;
    while (el && el.nodeType) {
      if (el.nodeType === 1 && el.getAttribute && el.getAttribute('data-pkg') !== null) return el;
      el = el.parentNode;
    }
    return null;
  }
  function alOnListClick(ev) {
    var item = alFindItem(ev && ev.target);
    if (!item) return;
    var pkg = item.getAttribute('data-pkg');
    if (pkg) alToggle(pkg);
  }
  function alToggle(pkg) {
    pkg = String(pkg == null ? '' : pkg);
    if (!pkg) return;
    var idx = alState.selected.indexOf(pkg);
    if (idx === -1) alState.selected.push(pkg);
    else alState.selected.splice(idx, 1);
    alSaveSelected();
    alUpdateRow(pkg);
    alRenderCount();
  }
  /* 只更新单行 DOM（避免整表重绘导致滚动跳动） */
  function alUpdateRow(pkg) {
    if (!alListEl) return;
    var items = alListEl.querySelectorAll('.al-item');
    var on = alIsSelected(pkg);
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-pkg') === pkg) {
        items[i].className = 'al-item' + (on ? ' on' : '');
        var chk = items[i].querySelector('.al-check');
        if (chk) { chk.className = 'al-check' + (on ? ' on' : ''); chk.textContent = on ? '✓' : ''; }
      }
    }
  }
  function alOnSearch() {
    var el = document.getElementById('alSearch');
    alState.keyword = el ? String(el.value || '') : '';
    alRenderList();
  }
  function alToggleSys() {
    alState.showSys = !alState.showSys;
    alSyncSysToggleUI();
    alRenderList();
  }
  function alSelectAll() {
    if (!alState.ok) { alToast('当前环境不支持读取应用列表'); return; }
    var list = alFiltered();
    if (!list.length) { alToast('当前没有可全选的应用'); return; }
    var added = 0, i;
    for (i = 0; i < list.length; i++) {
      if (alState.selected.indexOf(list[i].pkg) === -1) { alState.selected.push(list[i].pkg); added++; }
    }
    alSaveSelected();
    alRenderList();
    alRenderCount();
    alToast(added > 0 ? ('已选中当前筛选结果 ' + list.length + ' 个应用') : '当前筛选结果已全部选中');
  }
  function alClear() {
    if (alCountSelected() === 0) { alToast('还没有选中任何应用'); return; }
    var doClear = function () {
      alState.selected = [];
      alSaveSelected();
      alRenderList();
      alRenderCount();
      alToast('已清空白名单勾选');
    };
    try {
      if (typeof window.uiConfirm === 'function') {
        window.uiConfirm('将清空你已勾选的全部应用白名单（仅本机记录，不影响其它数据）。确定继续吗？', '清空')
          .then(function (ok) { if (ok) doClear(); });
        return;
      }
    } catch (e) { /* uiConfirm 异常则直接清空并提示 */ }
    doClear();
  }

  /* 显式回上级页（全站禁用 history.back，防历史栈乒乓）：解析 ?from=（仅白名单值），缺省回设置页
     R169-C（2026-09-23）：改 location.replace —— 替换当前记录而非新增，避免本页残留历史栈，
     系统返回键撞回本页退不出去（同 真题模考/企业定向库 死循环根因）。 */
  function alBack() {
    var m = /[?&]from=([^&]+)/.exec(location.search || '');
    var from = m ? decodeURIComponent(m[1]) : '';
    var ok = { '设置': 1 };
    location.replace((ok[from] ? from : '设置') + '.html');
  }

  /* ===================================================================
     ⑥ 绑定与初始化
     =================================================================== */
  function alBindEl(el, ev, fn) {
    if (!el || el.__alBound) return;
    try { el.addEventListener(ev, fn); el.__alBound = true; } catch (e) { }
  }
  function alBind() {
    alBindEl(document.getElementById('alSearch'), 'input', alOnSearch);
    alBindEl(document.getElementById('alSysToggle'), 'click', alToggleSys);
    alBindEl(document.getElementById('alSelectAll'), 'click', alSelectAll);
    alBindEl(document.getElementById('alClear'), 'click', alClear);
    alBindEl(alListEl, 'click', alOnListClick);
  }
  function alInit() {
    alState.selected = alLoadSelected();
    alState.keyword = '';
    alState.showSys = false;
    alListEl = document.getElementById('alList');
    var si = document.getElementById('alSearch'); if (si) si.value = '';
    alSyncSysToggleUI();
    alBind();
    var r = alFetchApps();
    alState.ok = r.ok;
    alState.apps = r.ok ? alAppsNormalize(r.apps) : [];
    alRenderList();
    alRenderCount();
  }

  /* 启动：defer 脚本（app.js 的 uiConfirm/showToast）就绪后再渲染 */
  (function alBoot() {
    var go = function () { try { alInit(); } catch (e) { /* 初始化失败不阻塞页面 */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  })();

  /* 页面 .morepage-back 用内联 onclick="alBack()" 调用，故 alBack 必须挂到 window 上 */
  window.alBack = alBack;

  /* 对外暴露（调试 / 联调 / 其它页复用；均为顶层函数声明的别名） */
  window.XTAppList = {
    version: '1.0.0',
    init: alInit,
    render: alRenderList,
    toggle: alToggle,
    toggleSys: alToggleSys,
    selectAll: alSelectAll,
    clear: alClear,
    back: alBack,
    state: function () { return alState; }
  };
})();
