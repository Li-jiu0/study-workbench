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
    /* ===========================================================
       V-polish（2026-09-21）：语音条专用实心图标（去字符 ▶ 定版规格）
       - 既有 outline play/pause 被设置页「开始专注」/英语页/voiceplayer/
         roleplay 共用，样式不能动 → 语音条另立实心键
       - 实心圆角三角：children 覆盖 fill="currentColor" + stroke-width="2"
         + stroke-linejoin="round"（三角三顶点圆角化，模板其余属性继承）
       - 实心双圆角竖条：rect rx=2 + fill="currentColor"
       =========================================================== */
    "play-solid": svg(
      '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    ),
    "pause-solid": svg(
      '<rect x="6" y="4" width="4.5" height="16" rx="2" fill="currentColor"/>' +
      '<rect x="13.5" y="4" width="4.5" height="16" rx="2" fill="currentColor"/>'
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
    ),
    /* ===========================================================
       T13（批次三 R4-1）补齐 ≤10 个图标（message-circle / wrench / menu /
       chart-bar / clipboard / bookmark / alert-triangle / package /
       inbox / info）—— 全部来自 lucide.dev 官方（MIT 协议），viewBox 24x24，
       复用既有 SVG_TPL（fill=none / stroke=currentColor / stroke-width=2）。
       —— 首行保留【后续扩展点：继续加图标】
       =========================================================== */
    "message-circle": svg(
      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'
    ),
    "wrench": svg(
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>'
    ),
    "menu": svg(
      '<line x1="4" x2="20" y1="12" y2="12"/>' +
      '<line x1="4" x2="20" y1="6" y2="6"/>' +
      '<line x1="4" x2="20" y1="18" y2="18"/>'
    ),
    "chart-bar": svg(
      '<line x1="12" y1="20" x2="12" y2="10"/>' +
      '<line x1="18" y1="20" x2="18" y2="4"/>' +
      '<line x1="6" y1="20" x2="6" y2="14"/>'
    ),
    "clipboard": svg(
      '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' +
      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'
    ),
    "bookmark": svg(
      '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'
    ),
    "alert-triangle": svg(
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>' +
      '<line x1="12" x2="12" y1="9" y2="13"/>' +
      '<line x1="12" x2="12" y1="17" y2="17"/>'
    ),
    "package": svg(
      '<path d="m7.5 4.27 9 5.15"/>' +
      '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
      '<path d="m3.3 7 8.7 5 8.7-5"/>' +
      '<path d="M12 22V12"/>'
    ),
    /* R88-I 增量（2026-09-18）：文件图标（私聊「发送文件」菜单项 / 文件消息卡片）。
       lucide 官方 file 路径，24x24 viewBox，仅 path 基础图元。 */
    "file": svg(
      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
      '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>'
    ),
    "inbox": svg(
      '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>' +
      '<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
    ),
    "info": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<line x1="12" x2="12" y1="16" y2="12"/>' +
      '<line x1="12" x2="12.01" y1="8" y2="8"/>'
    ),
    /* ===========================================================
       E1-R（2026-09-13）补齐：6 个图标，清零全站剩余 38 处 emoji 图标
       （E1 批次跳过 23 处 + 7 个未入批页面 15 处）
       全部来自 lucide-static v0.462.0 官方 SVG（ISC 协议），
       仅 path/rect/circle 基础图元，viewBox 24x24，
       复用既有 SVG_TPL（fill=none / stroke=currentColor /
       stroke-width=2 / linecap=round / linejoin=round），
       禁 mask/filter/symbol/use —— 老 WebView 可渲染。
       映射约定：互动广场📁/🗂️→inbox（对齐学习工作台底部导航既有约定）、
       穿越英语/快捷入口⚡→zap、PPT版式库/设置·阅读与界面📐→ruler、
       万能金句库✨→sparkles、商务礼仪知识库👔→briefcase、
       面试高频问题库❓→help-circle、行测刷题🧩→puzzle
       =========================================================== */
    "zap": svg(
      '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'
    ),
    "ruler": svg(
      '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/>' +
      '<path d="m14.5 12.5 2-2"/>' +
      '<path d="m11.5 9.5 2-2"/>' +
      '<path d="m8.5 6.5 2-2"/>' +
      '<path d="m17.5 15.5 2-2"/>'
    ),
    "sparkles": svg(
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>' +
      '<path d="M20 3v4"/>' +
      '<path d="M22 5h-4"/>' +
      '<path d="M4 17v2"/>' +
      '<path d="M5 18H3"/>'
    ),
    "briefcase": svg(
      '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' +
      '<rect width="20" height="14" x="2" y="6" rx="2"/>'
    ),
    "help-circle": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>' +
      '<path d="M12 17h.01"/>'
    ),
    "puzzle": svg(
      '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>'
    ),
    /* ===========================================================
       J 批次（20260913j）补齐：11 个缺口图标（kou-appjs 注册）
       - bot：AI 演示浮标 / AI 头像（kou-chatjs、各页 aiFab 共用）
       - map：功能中心标题（HOME_DEF 🛣️ → map）
       - eye / thumbs-up / message-circle(既有)：博客统计与帖子卡统计行
       - send：已发布 / 发送类语义（博客六宫格、聊天等备用）
       - smile：😊 表情（聊天页 🎤😊 升级备用）
       - image / video：图片 / 视频语义（发贴封面、媒体类备用）
       - brain / lightbulb：AI 助手外观四选一头像（🧠/💡）补齐
       - target：🎯 语义兜底（面试官、正确率等）
       全部来自 lucide v0.462 官方 SVG（ISC 协议），仅 path/rect/circle/
       line 基础图元，viewBox 24x24，复用 SVG_TPL（fill=none /
       stroke=currentColor / stroke-width=2 / linecap=round /
       linejoin=round），禁 mask/filter/symbol/use —— 老 WebView 可渲染。
       =========================================================== */
    "bot": svg(
      '<path d="M12 8V4H8"/>' +
      '<rect width="16" height="12" x="4" y="8" rx="2"/>' +
      '<path d="M2 14h2"/>' +
      '<path d="M20 14h2"/>' +
      '<path d="M15 13v2"/>' +
      '<path d="M9 13v2"/>'
    ),
    "map": svg(
      '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/>' +
      '<path d="M15 5.764v15"/>' +
      '<path d="M9 3.236v15"/>'
    ),
    "eye": svg(
      '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
      '<circle cx="12" cy="12" r="3"/>'
    ),
    "thumbs-up": svg(
      '<path d="M7 10v12"/>' +
      '<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>'
    ),
    "send": svg(
      '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>' +
      '<path d="m21.854 2.147-10.94 10.939"/>'
    ),
    "smile": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="M8 14s1.5 2 4 2 4-2 4-2"/>' +
      '<line x1="9" x2="9.01" y1="9" y2="9"/>' +
      '<line x1="15" x2="15.01" y1="9" y2="9"/>'
    ),
    "image": svg(
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>' +
      '<circle cx="9" cy="9" r="2"/>' +
      '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
    ),
    "video": svg(
      '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>' +
      '<rect x="2" y="6" width="14" height="12" rx="2"/>'
    ),
    "brain": svg(
      '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>' +
      '<path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>' +
      '<path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>' +
      '<path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>' +
      '<path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>' +
      '<path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>' +
      '<path d="M19.938 10.5a4 4 0 0 1 .585.396"/>' +
      '<path d="M6 18a4 4 0 0 1-1.967-.516"/>' +
      '<path d="M19.967 17.484A4 4 0 0 1 18 18"/>'
    ),
    "lightbulb": svg(
      '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
      '<path d="M9 18h6"/>' +
      '<path d="M10 22h4"/>'
    ),
    "target": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<circle cx="12" cy="12" r="6"/>' +
      '<circle cx="12" cy="12" r="2"/>'
    ),
    /* ===========================================================
       J 批次追加（20260913j 收尾）：3 个图标
       - upload / cloud：个人中心 pp-ic（📤 导出备份 / ☁️ 同步云端）
       - tag：全局搜索 PPT案例拆解 🏷️ 等标签语义
       来源与约束同上（lucide v0.462 官方，仅基础图元，禁 mask 等）。
       =========================================================== */
    "upload": svg(
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="17 8 12 3 7 8"/>' +
      '<line x1="12" x2="12" y1="3" y2="15"/>'
    ),
    "cloud": svg(
      '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'
    ),
    "tag": svg(
      '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>' +
      '<circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'
    ),
    /* ===========================================================
       K 批次（20260913K）补齐：19 个缺口图标（kou-k-appjs 注册）
       - sun / moon：主题切换按钮（themeToggle 🌙/☀️ → data-icon）
       - bell：通知铃铛；pin：倒计时置顶 📌；trash：🗑️ 删除
       - save：💾 草稿/保存；eraser：🧹 清理；rotate-ccw：↺ 重置
       - monitor：🖥️ 系统主题；ban：🚫 关闭态；download：📥 导入
       - calculator：🧮 做题数；calendar-days：📅 本周学习；award：🏅 成就
       - notebook：📒 错题本；file-text：📄 导出 Markdown；plug：🔌 测试连接
       - chevron-down / chevron-up：下拉/折叠箭头；archive：📁 归档
       全部来自 lucide v0.462 官方 SVG（ISC 协议），仅 path/rect/circle/
       line/polyline 基础图元，viewBox 24x24，复用 SVG_TPL（fill=none /
       stroke=currentColor / stroke-width=2 / linecap=round /
       linejoin=round），禁 mask/filter/symbol/use —— 老 WebView 可渲染。
       =========================================================== */
    "sun": svg(
      '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2"/>' +
      '<path d="M12 20v2"/>' +
      '<path d="m4.93 4.93 1.41 1.41"/>' +
      '<path d="m17.66 17.66 1.41 1.41"/>' +
      '<path d="M2 12h2"/>' +
      '<path d="M20 12h2"/>' +
      '<path d="m6.34 17.66-1.41 1.41"/>' +
      '<path d="m19.07 4.93-1.41 1.41"/>'
    ),
    "moon": svg(
      '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
    ),
    "bell": svg(
      '<path d="M10.268 21a2 2 0 0 0 3.464 0"/>' +
      '<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>'
    ),
    "pin": svg(
      '<path d="M12 17v5"/>' +
      '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'
    ),
    "trash": svg(
      '<path d="M3 6h18"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" x2="10" y1="11" y2="17"/>' +
      '<line x1="14" x2="14" y1="11" y2="17"/>'
    ),
    "save": svg(
      '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>' +
      '<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>' +
      '<path d="M7 3v4a1 1 0 0 0 1 1h7"/>'
    ),
    "eraser": svg(
      '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>' +
      '<path d="M22 21H7"/>' +
      '<path d="m5 11 9 9"/>'
    ),
    "rotate-ccw": svg(
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>' +
      '<path d="M3 3v5h5"/>'
    ),
    "monitor": svg(
      '<rect width="20" height="14" x="2" y="3" rx="2"/>' +
      '<line x1="8" x2="16" y1="21" y2="21"/>' +
      '<line x1="12" x2="12" y1="17" y2="21"/>'
    ),
    "ban": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="m4.9 4.9 14.2 14.2"/>'
    ),
    "download": svg(
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/>' +
      '<line x1="12" x2="12" y1="15" y2="3"/>'
    ),
    "calculator": svg(
      '<rect width="16" height="20" x="4" y="2" rx="2"/>' +
      '<line x1="8" x2="16" y1="6" y2="6"/>' +
      '<line x1="16" x2="16" y1="14" y2="18"/>' +
      '<path d="M16 10h.01"/>' +
      '<path d="M12 10h.01"/>' +
      '<path d="M8 10h.01"/>' +
      '<path d="M12 14h.01"/>' +
      '<path d="M8 14h.01"/>' +
      '<path d="M12 18h.01"/>' +
      '<path d="M8 18h.01"/>'
    ),
    "calendar-days": svg(
      '<path d="M8 2v4"/>' +
      '<path d="M16 2v4"/>' +
      '<rect width="18" height="18" x="3" y="4" rx="2"/>' +
      '<path d="M3 10h18"/>' +
      '<path d="M8 14h.01"/>' +
      '<path d="M12 14h.01"/>' +
      '<path d="M16 14h.01"/>' +
      '<path d="M8 18h.01"/>' +
      '<path d="M12 18h.01"/>' +
      '<path d="M16 18h.01"/>'
    ),
    "award": svg(
      '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/>' +
      '<circle cx="12" cy="8" r="6"/>'
    ),
    "notebook": svg(
      '<path d="M2 6h4v12H2z"/>' +
      '<path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6"/>' +
      '<path d="M9 8h6"/>' +
      '<path d="M9 12h6"/>' +
      '<path d="M9 16h6"/>'
    ),
    "file-text": svg(
      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
      '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>' +
      '<path d="M10 9H8"/>' +
      '<path d="M16 13H8"/>' +
      '<path d="M16 17H8"/>'
    ),
    "plug": svg(
      '<path d="M12 22v-5"/>' +
      '<path d="M9 8V2"/>' +
      '<path d="M15 8V2"/>' +
      '<path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>'
    ),
    "chevron-down": svg('<path d="m6 9 6 6 6-6"/>'),
    "chevron-up": svg('<path d="m18 15-6-6-6 6"/>'),
    "archive": svg(
      '<rect width="20" height="5" x="2" y="3" rx="1"/>' +
      '<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>' +
      '<path d="M10 12h4"/>'
    ),
    "volume-2": svg(
      '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>' +
      '<path d="M16 9a5 5 0 0 1 0 6"/>' +
      '<path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>'
    ),
    "pointer": svg(
      '<path d="M22 14a8 8 0 0 1-8 8"/>' +
      '<path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>' +
      '<path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/>' +
      '<path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/>' +
      '<path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
    ),
    "shuffle": svg(
      '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/>' +
      '<path d="m18 2 4 4-4 4"/>' +
      '<path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/>' +
      '<path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/>' +
      '<path d="m18 14 4 4-4 4"/>'
    ),
    "sprout": svg(
      '<path d="M7 20h10"/>' +
      '<path d="M10 20c5.5-2.5.8-6.4 3-10"/>' +
      '<path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>' +
      '<path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>'
    ),
    "arrow-left-right": svg(
      '<path d="M8 3 4 7l4 4"/>' +
      '<path d="M4 7h16"/>' +
      '<path d="m16 21 4-4-4-4"/>' +
      '<path d="M20 17H4"/>'
    ),
    "rocket": svg(
      '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>' +
      '<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>' +
      '<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>' +
      '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'
    ),
    /* ===========================================================
       R32（20260913m）补齐：场景话术库 / 万能金句库 emoji 图标升级
       - megaphone：📢 向上沟通；banknote：💰 争取资源/加薪
       - wine：🍷 拒绝应酬；hand：👋 自我介绍；heart：🤗 安慰人
       - bow：🙇 道歉（自绘弓身人形，仅 circle+path 基础图元）
       - scene：🎬 场景（clapperboard）；x-circle：❌ 低情商回答
       - check-circle：✅ 高情商回答（与 done 同形别名，语义自明）
       复用既有 SVG_TPL（fill=none / stroke=currentColor / stroke-width=2 /
       linecap=round / linejoin=round / viewBox 24x24），
       禁 mask/filter/symbol/use —— 老 WebView 可渲染。
       =========================================================== */
    "megaphone": svg(
      '<path d="m3 11 18-5v12L3 14v-3z"/>' +
      '<path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'
    ),
    "banknote": svg(
      '<rect width="20" height="12" x="2" y="6" rx="2"/>' +
      '<circle cx="12" cy="12" r="2"/>' +
      '<path d="M6 12h.01"/>' +
      '<path d="M18 12h.01"/>'
    ),
    "wine": svg(
      '<path d="M8 22h8"/>' +
      '<path d="M7 10h10"/>' +
      '<path d="M12 15v7"/>' +
      '<path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>'
    ),
    "hand": svg(
      '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>' +
      '<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/>' +
      '<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/>' +
      '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
    ),
    "heart": svg(
      '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z"/>'
    ),
    "bow": svg(
      '<circle cx="18" cy="6" r="2"/>' +
      '<path d="M3 20c2.5-5.5 7-9.5 13-11"/>' +
      '<path d="M3 20h13"/>'
    ),
    "scene": svg(
      '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/>' +
      '<path d="m6.2 5.3 3.1 3.9"/>' +
      '<path d="m12.4 3.4 3.1 4"/>' +
      '<path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'
    ),
    "x-circle": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="m15 9-6 6"/>' +
      '<path d="m9 9 6 6"/>'
    ),
    "check-circle": svg(
      '<circle cx="12" cy="12" r="10"/>' +
      '<path d="m9 12 2 2 4-4"/>'
    ),
    /* ===========================================================
       需求02 遗留 + 需求06 弹药（20260913o）补齐：20 个语义图标
       - shield：安全 / 管理后台（更多.html、管理员.html 已引用未注册）
       - shield-check / badge-check：认证 / 审核 / 成就徽章
       - utensils：餐饮礼仪 🍽；smartphone / phone / mail：通讯礼仪 📱📞✉
       - graduation-cap：学历 / 毕业 🎓；id-card：名片 / 身份
       - presentation：会议 / 汇报 📽；calendar-clock：日程 / 会议时间
       - clipboard-list：面试 / 待办清单；shirt：着装礼仪 👔/👗
       - skip-back / skip-forward / timer：播放控制与计时 ⏮⏭⏱
       - coffee：情景 / 休闲 ☕；eye-off：隐私切换 / 隐藏
       - building：公司 / 单位 🏢；quote：引用 ❝
       复用既有 SVG_TPL（fill=none / stroke=currentColor / stroke-width=2 /
       linecap=round / linejoin=round / viewBox 24x24），lucide 风格路径，
       仅 path/rect/circle/line/polygon 基础图元，禁 mask/filter/symbol/use。
       =========================================================== */
    "shield": svg(
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>'
    ),
    "shield-check": svg(
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>' +
      '<path d="m9 12 2 2 4-4"/>'
    ),
    "utensils": svg(
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>' +
      '<path d="M7 2v20"/>' +
      '<path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/>' +
      '<path d="M21 15v7"/>'
    ),
    "smartphone": svg(
      '<rect width="14" height="20" x="5" y="2" rx="2"/>' +
      '<path d="M12 18h.01"/>'
    ),
    "phone": svg(
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'
    ),
    "mail": svg(
      '<rect width="20" height="16" x="2" y="4" rx="2"/>' +
      '<path d="m22 7-10 6L2 7"/>'
    ),
    "graduation-cap": svg(
      '<path d="M2 9.5 12 4l10 5.5-10 5.5L2 9.5Z"/>' +
      '<path d="M6 11.5V16c0 1.3 2.7 2.5 6 2.5s6-1.2 6-2.5v-4.5"/>' +
      '<path d="M22 9.5V17"/>'
    ),
    "id-card": svg(
      '<rect width="20" height="14" x="2" y="5" rx="2"/>' +
      '<circle cx="8" cy="12" r="2.5"/>' +
      '<path d="M16 10h2"/>' +
      '<path d="M16 14h2"/>'
    ),
    "presentation": svg(
      '<path d="M2 3h20"/>' +
      '<path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/>' +
      '<path d="m7 21 5-5 5 5"/>'
    ),
    "calendar-clock": svg(
      '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/>' +
      '<path d="M16 2v4"/>' +
      '<path d="M8 2v4"/>' +
      '<path d="M3 10h12"/>' +
      '<circle cx="18" cy="18" r="3"/>' +
      '<path d="M18 16.5V18l1.5.9"/>'
    ),
    "clipboard-list": svg(
      '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>' +
      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
      '<path d="M12 11h4"/>' +
      '<path d="M12 15h4"/>' +
      '<path d="M9 11h.01"/>' +
      '<path d="M9 15h.01"/>'
    ),
    "shirt": svg(
      '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>'
    ),
    "skip-back": svg(
      '<polygon points="19 20 9 12 19 4 19 20"/>' +
      '<line x1="5" x2="5" y1="19" y2="5"/>'
    ),
    "skip-forward": svg(
      '<polygon points="5 4 15 12 5 20 5 4"/>' +
      '<line x1="19" x2="19" y1="5" y2="19"/>'
    ),
    "timer": svg(
      '<line x1="10" x2="14" y1="2" y2="2"/>' +
      '<line x1="12" x2="15" y1="14" y2="11"/>' +
      '<circle cx="12" cy="14" r="8"/>'
    ),
    "coffee": svg(
      '<path d="M10 2v2"/>' +
      '<path d="M14 2v2"/>' +
      '<path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>' +
      '<path d="M6 2v2"/>'
    ),
    "eye-off": svg(
      '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
      '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
      '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
      '<path d="m2 2 20 20"/>'
    ),
    "building": svg(
      '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>' +
      '<path d="M9 22v-4h6v4"/>' +
      '<path d="M8 6h.01"/>' +
      '<path d="M16 6h.01"/>' +
      '<path d="M12 6h.01"/>' +
      '<path d="M12 10h.01"/>' +
      '<path d="M12 14h.01"/>' +
      '<path d="M16 10h.01"/>' +
      '<path d="M16 14h.01"/>' +
      '<path d="M8 10h.01"/>' +
      '<path d="M8 14h.01"/>'
    ),
    "badge-check": svg(
      '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>' +
      '<path d="m9 12 2 2 4-4"/>'
    ),
    "quote": svg(
      '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>' +
      '<path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h1.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'
    ),
    "map-pin": svg(
      '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
      '<circle cx="12" cy="10" r="3"/>'
    ),
    "navigation": svg(
      '<polygon points="3 11 22 2 13 21 11 13 3 11"/>'
    ),
    "camera": svg(
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>' +
      '<circle cx="12" cy="13" r="3"/>'
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