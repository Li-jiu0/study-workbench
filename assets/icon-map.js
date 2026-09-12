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
    ),

    /* ===========================================================
       T04-00（2026-09-12）补齐：22 个操作类图标
       全部来自 lucide.dev 官方（MIT 协议），viewBox 24x24
       - 单动作键（play/pause/check/close/clock/search/plus/star/
         fire/trophy/headphones/pen/mic/languages/chart/settings/
         logout/locked/done）继续沿用单段名
       - 复合键（含连字符/空格）在 JS 端映射为下划线，
         HTML 端 data-icon 写连字符，例如：
           <span data-icon="arrow-left"> ... data-icon="in-progress">
       - SVG 模板固定属性已由 SVG_TPL 提供（fill="none" /
         stroke="currentColor" / stroke-width="2" / linecap=round /
         linejoin=round / viewBox="0 0 24 24"），禁自创 wrapper
       =========================================================== */
    // —— 操作类（播放 / 暂停）——
    "play": svg(
      '<polygon points="6 3 20 12 6 21 6 3"/>'
    ),
    "pause": svg(
      '<rect x="6" y="4" width="4" height="16"/>' +
      '<rect x="14" y="4" width="4" height="16"/>'
    ),
    // —— 操作类（确认 / 关闭）——
    "check": svg(
      '<polyline points="20 6 9 17 4 12"/>'
    ),
    "close": svg(
      '<line x1="18" y1="6" x2="6" y2="18"/>' +
      '<line x1="6" y1="6" x2="18" y2="18"/>'
    ),
    // —— 箭头类（下划线 JS 标识符 + 连字符 HTML data-icon）——
    "arrow_left": svg(
      '<line x1="19" y1="12" x2="5" y2="12"/>' +
      '<polyline points="12 19 5 12 12 5"/>'
    ),
    "arrow-right": svg(
      '<path d="M5 12h14"/>' +
      '<path d="m12 5 7 7-7 7"/>'
    ),
    // —— 时间 / 编辑 / 删除 ——（clock / search / plus / settings 见既有）
    "clock": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<polyline points="12 6 12 12 16 14"/>'
    ),
    "edit": svg(
      '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'
    ),
    "delete": svg(
      '<polyline points="3 6 5 6 21 6"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" y1="11" x2="10" y2="17"/>' +
      '<line x1="14" y1="11" x2="14" y2="17"/>'
    ),
    "search": svg(
      '<circle cx="11" cy="11" r="8"/>' +
      '<path d="m21 21-4.3-4.3"/>'
    ),
    "plus": svg(
      '<path d="M5 12h14"/>' +
      '<path d="M12 5v14"/>'
    ),
    // —— 标识类（星 / 火 / 奖杯 / 收藏）——
    "star": svg(
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
    ),
    "fire": svg(
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'
    ),
    "trophy": svg(
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>' +
      '<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>' +
      '<path d="M4 22h16"/>' +
      '<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>' +
      '<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>' +
      '<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'
    ),
    // —— 多媒体（耳机 / 笔 / 麦克风）——
    "headphones": svg(
      '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/>' +
      '<path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'
    ),
    "pen": svg(
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
      '<path d="m15 5 4 4"/>'
    ),
    "mic": svg(
      '<rect x="9" y="2" width="6" height="12" rx="3"/>' +
      '<path d="M19 10v1a7 7 0 0 1-14 0v-1"/>' +
      '<line x1="12" y1="18" x2="12" y2="22"/>'
    ),
    // —— 数据 / 设置 / 账户类 ——
    "languages": svg(
      '<path d="m5 8 6 6"/>' +
      '<path d="m4 14 6-6 2-3"/>' +
      '<path d="M2 5h12"/>' +
      '<path d="M7 2h1"/>' +
      '<path d="m22 22-5-10-5 10"/>' +
      '<path d="M14 18h6"/>'
    ),
    "chart": svg(
      '<line x1="12" y1="20" x2="12" y2="10"/>' +
      '<line x1="18" y1="20" x2="18" y2="4"/>' +
      '<line x1="6" y1="20" x2="6" y2="14"/>'
    ),
    "settings": svg(
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
      '<circle cx="12" cy="12" r="3"/>'
    ),
    "logout": svg(
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/>' +
      '<line x1="21" y1="12" x2="9" y2="12"/>'
    ),
    "locked": svg(
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
      '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
    ),
    // —— 任务状态（完成 / 进行中）——
    "done": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="m9 12 2 2 4-4"/>'
    ),
    "in_progress": svg(
      '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'
    ),
    // —— kebab-case 别名（HTML 端 data-icon 写连字符时走这里）——
    "in-progress": svg(
      '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'
    ),
    "arrow-left": svg(
      '<line x1="19" y1="12" x2="5" y2="12"/>' +
      '<polyline points="12 19 5 12 12 5"/>'
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