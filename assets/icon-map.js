/* =====================================================================
   icon-map.js · lucide 图标字典与渲染函数
   批次五 T04（2026-09-12）
   ---------------------------------------------------------------------
   约束（架构设计 §3.3 契约）：
   1. SVG 模板固定属性：fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"，viewBox="0 0 24 24"
   2. 禁 mask / filter / symbol use（老 WebView 不支持）
   3. lucideIcon(name, size=20) 返回完整 <svg> 字符串；找不到 name 返回 ''
   4. 字典 ≥14 个 key；本批 19 个（侧栏 11 项 + 列表项右箭头 + 搜索/加号/倒计时
      + 侧栏扩展项 rss「动态」/ messages-square「互动广场」）
   5. 自动扫描含 data-icon 属性的元素（.nav-icon / .title-icon / .mpc-icon 等
      可选）并在 DOMContentLoaded 时把内层替换为对应 SVG —— 静态 HTML 写
      `data-icon="book-open"`，渲染层零 emoji、零 hardcoded SVG
   ===================================================================== */
(function () {
  "use strict";

  // SVG 模板：%BODY% 占位符处填各 icon 的 children 标记
  var SVG_TPL =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">%BODY%</svg>';

  function svg(body) { return SVG_TPL.replace("%BODY%", body); }

  // 17 个 lucide 图标；路径来源 lucide.dev 官方 SVG（MIT 协议），内联零 CDN
  window.LUCIDE_ICONS = {
    "globe": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<line x1="2" x2="22" y1="12" y2="12"/>' +
      '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
    ),
    "book-open": svg(
      '<path d="M12 7v14"/>' +
      '<path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'
    ),
    "pencil": svg(
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
      '<path d="m15 5 4 4"/>'
    ),
    "message-square": svg(
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
    ),
    "handshake": svg(
      '<path d="m11 17 2 2a1 1 0 1 0 3-3"/>' +
      '<path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.875a1 1 0 0 0-1.414 0l-3.879 3.875a1 1 0 1 0 3 3l2.5-2.5"/>' +
      '<path d="m8.5 8.5 1.5-1.5"/>' +
      '<path d="m14 8.5-1.5-1.5"/>' +
      '<path d="M4 8a2 2 0 0 1 2-2"/>' +
      '<path d="M4 14a2 2 0 0 0 2 2"/>' +
      '<path d="M16 6a2 2 0 0 1 2-2"/>' +
      '<path d="M16 18a2 2 0 0 0 2 2"/>'
    ),
    "palette": svg(
      '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>' +
      '<circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>' +
      '<circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>' +
      '<circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>' +
      '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'
    ),
    "clock": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<polyline points="12 6 12 12 16 14"/>'
    ),
    "chevron-right": svg('<path d="m9 18 6-6-6-6"/>'),
    "chevron-left": svg('<path d="m15 18-6-6 6-6"/>'),
    "arrow-right": svg(
      '<path d="M5 12h14"/>' +
      '<path d="m12 5 7 7-7 7"/>'
    ),
    "user": svg(
      '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>' +
      '<circle cx="12" cy="7" r="4"/>'
    ),
    "settings": svg(
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
      '<circle cx="12" cy="12" r="3"/>'
    ),
    "search": svg(
      '<circle cx="11" cy="11" r="8"/>' +
      '<path d="m21 21-4.3-4.3"/>'
    ),
    "plus": svg(
      '<path d="M5 12h14"/>' +
      '<path d="M12 5v14"/>'
    ),
    // ---- 侧栏 11 项额外补齐（首页 / 好友 / 错题本）----
    "home": svg(
      '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
      '<polyline points="9 22 9 12 15 12 15 22"/>'
    ),
    "users": svg(
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
      '<circle cx="9" cy="7" r="4"/>' +
      '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' +
      '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    ),
    "book": svg(
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
      '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
    ),
    // ---- 侧栏扩展项（动态 / 互动广场）：仅 path+circle 基础图元，老 WebView 可渲染 ----
    "rss": svg(
      '<path d="M4 11a9 9 0 0 1 9 9"/>' +
      '<path d="M4 4a16 16 0 0 1 16 16"/>' +
      '<circle cx="5" cy="19" r="1"/>'
    ),
    "messages-square": svg(
      '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5Z"/>' +
      '<path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>'
    )
  };

  // lucideIcon(name, size?) → 完整 <svg ...> 字符串（找不到 name 返回 ''）
  window.lucideIcon = function (name, size) {
    if (!name) return "";
    var raw = window.LUCIDE_ICONS[name];
    if (!raw) return "";
    var s = parseInt(size, 10);
    if (!s || s <= 0) s = 20;
    // 模板默认 width/height="20"，按调用方尺寸替换
    return raw
      .replace('width="20"', 'width="' + s + '"')
      .replace('height="20"', 'height="' + s + '"');
  };

  // 自动扫描：含 data-icon 的元素 → innerHTML 替换为 lucideIcon 输出
  // data-icon-size 可选，默认 20
  function autoRender() {
    if (typeof document === "undefined") return;
    var nodes = document.querySelectorAll("[data-icon]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var n = el.getAttribute("data-icon");
      if (!n || !window.LUCIDE_ICONS[n]) continue;
      var sz = parseInt(el.getAttribute("data-icon-size") || "20", 10);
      el.innerHTML = window.lucideIcon(n, sz);
    }
  }

  // 暴露给 HTML 调用方：手动触发（如动态插入新元素后）
  window.lucideAutoRender = autoRender;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoRender);
    } else {
      // icon-map.js 已在解析完成后才加载（body 末尾场景），立即跑一次
      autoRender();
    }
  }
})();