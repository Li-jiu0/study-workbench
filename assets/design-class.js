/* =============================================================================
 * assets/design-class.js —— B2「PPT · 设计基础」课堂渲染器（v2）
 * -----------------------------------------------------------------------------
 * 加载位置：必须在 assets/data-ppt-class.js 与 assets/icon-map.js 之后。
 * 注册方式：window.PPTV2['ppt-design'] = function (slotEl) { ... }
 *          分发逻辑由宿主页（演示.html，T00 预埋）负责，本文件不改任何 HTML。
 * 结构：3 节课堂（可切换）→ 课后小测（复用 mini-ppt.js 原有 8 题）。
 * 兼容：ES5 语法为主，不用可选链 / 箭头函数 / 空值合并，兼容老 WebView。
 * 约束：不调 saveData()；localStorage 键前缀 xtc:ppt:class: 且经 lsKey() 包装；
 *       图标全部走 data-icon（icon-map.js），渲染后补一次 lucideAutoRender()；
 *       正反例一律用纯 HTML + CSS 自绘，不引任何外链图片。
 * 版本戳：20260914e
 * ========================================================================== */
(function () {
  'use strict';

  window.PPTV2 = window.PPTV2 || {};

  /* ------------------------------------------------------------------ 常量 */
  var KEY_PREFIX = 'xtc:ppt:class:';
  var FINAL_ID = 'final';
  var STYLE_ID = 'dc-style-v2';
  var DEMO_TYPES = ['compare', 'swatch', 'type', 'none'];
  var TAB_FINAL = 3;
  var TAB_CASES = 4;          /* 正反例浏览页签（P0-3：正反例做成可点入口） */

  /* ------------------------------------------------------ 极简 helper 区 */
  /* 不依赖 assets/xt-content.js（另一条线并行开发），全部内联并加 DC_ 前缀 */

  /** HTML 转义，防数据中的尖括号破坏结构 */
  function DC_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 图标：优先 data-icon 自动扫描（F9 需要渲染后补 hydration），此处生成 span */
  function DC_icon(name, size, cls) {
    if (!name) return '';
    return '<span class="nav-icon ' + (cls || '') + '" data-icon="' + DC_esc(name) +
      '" data-icon-size="' + (size || 16) + '"></span>';
  }

  /** 立即取图标 SVG 字符串（icon-map.js 未就绪时返回空串，不报错） */
  function DC_iconRaw(name, size) {
    if (!name || typeof window.lucideIcon !== 'function') return '';
    return window.lucideIcon(name, size || 16);
  }

  /** localStorage 键：统一前缀 + lsKey() 防御式包装 */
  function DC_key(id) {
    var k = KEY_PREFIX + String(id);
    if (typeof window.lsKey === 'function') {
      try { return window.lsKey(k); } catch (e) { /* 忽略，退回原键 */ }
    }
    return k;
  }

  function DC_read(id) {
    try {
      var raw = window.localStorage.getItem(DC_key(id));
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }

  function DC_write(id, obj) {
    try { window.localStorage.setItem(DC_key(id), JSON.stringify(obj)); } catch (e) { /* 容量/隐私模式忽略 */ }
  }

  function DC_isLearned(id) {
    var o = DC_read(id);
    return !!(o && o.learned);
  }

  function DC_markLearned(id) {
    var o = DC_read(id) || {};
    o.learned = 1;
    o.learnedAt = new Date().getTime();
    DC_write(id, o);
  }

  function DC_saveBest(id, score, total) {
    var o = DC_read(id) || {};
    if (typeof o.best !== 'number' || score > o.best) {
      o.best = score;
      o.total = total;
      o.ts = new Date().getTime();
    } else {
      o.total = total;
    }
    DC_write(id, o);
    return o;
  }

  /** 数字钳制 + 缺省值，用于 demo 坐标安全化 */
  function DC_num(v, def, min, max) {
    var n = parseFloat(v);
    if (isNaN(n)) n = def;
    if (typeof min === 'number' && n < min) n = min;
    if (typeof max === 'number' && n > max) n = max;
    return n;
  }

  /** 颜色值白名单校验（只接受 #rgb / #rrggbb / 常见英文色名，防注入） */
  function DC_color(v, def) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (/^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
    return def;
  }

  /** 动态插入含 data-icon 的片段后必须补一次 hydration（F9） */
  function DC_hydrateIcons() {
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
    }
  }

  /**
   * P0-4 关键句高亮：hl 必须是 p 的原文子串，命中才加粗，未命中原样输出。
   * 只做"包一层 <b>"，不改动、不截断任何一个原文字符。
   */
  function DC_highlight(p, hl) {
    var text = (p === null || p === undefined) ? '' : String(p);
    var key = (hl === null || hl === undefined) ? '' : String(hl);
    if (!key) return DC_esc(text);
    var i = text.indexOf(key);
    if (i < 0) return DC_esc(text);
    return DC_esc(text.slice(0, i)) +
      '<b class="dc-hl">' + DC_esc(key) + '</b>' +
      DC_esc(text.slice(i + key.length));
  }

  /** 找到真正产生滚动的祖先容器（面板是 #pptPanelBody，找不到则回退 window） */
  function DC_findScroller(el) {
    var p = el ? el.parentNode : null;
    while (p && p.nodeType === 1 && p !== document.body) {
      var oy = '';
      try {
        if (window.getComputedStyle) oy = window.getComputedStyle(p).overflowY || '';
      } catch (e) { oy = ''; }
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
      p = p.parentNode;
    }
    return null;
  }

  /* ---- P0-2 阅读进度：绑定 / 解绑（重绘前必须解绑，避免监听器堆积） ---- */
  var DC_progOff = null;

  function DC_unbindProgress() {
    if (typeof DC_progOff === 'function') {
      try { DC_progOff(); } catch (e) { /* 忽略 */ }
    }
    DC_progOff = null;
  }

  function DC_bindProgress(wrap) {
    DC_unbindProgress();
    if (!wrap) return;
    var ticking = false;

    function upd() {
      ticking = false;
      var w = document.getElementById('dc-wrap');
      var bar = document.getElementById('dc-prog-i');
      if (!w || !bar || !w.getBoundingClientRect) return;
      var rect = w.getBoundingClientRect();
      if (!rect || !rect.height) return;
      var top = 0;
      var sc = DC_findScroller(w);
      if (sc && sc.getBoundingClientRect) top = sc.getBoundingClientRect().top;
      var pct = (top - rect.top) / rect.height;
      if (pct < 0) pct = 0;
      if (pct > 1) pct = 1;
      bar.style.width = Math.round(pct * 100) + '%';
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.setTimeout(upd, 30);
    }

    var target = DC_findScroller(wrap) || window;
    if (target.addEventListener) target.addEventListener('scroll', onScroll, false);
    else if (target.attachEvent) target.attachEvent('onscroll', onScroll);
    if (window.addEventListener) window.addEventListener('resize', onScroll, false);

    DC_progOff = function () {
      if (target.removeEventListener) target.removeEventListener('scroll', onScroll, false);
      else if (target.detachEvent) target.detachEvent('onscroll', onScroll);
      if (window.removeEventListener) window.removeEventListener('resize', onScroll, false);
    };
    upd();
  }

  /* ------------------------------------------------------------------ 样式 */
  var CSS =
    '.dc-wrap{width:100%;max-width:960px;margin:0 auto;color:var(--text,#1F2937);font-size:14px;line-height:1.7}' +
    '.dc-hero{background:linear-gradient(135deg,#1F4E79,#2E75B6);color:#fff;border-radius:14px;padding:16px 18px;margin-bottom:14px}' +
    '.dc-hero-t{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700;line-height:1.4}' +
    '.dc-hero-s{font-size:12.5px;opacity:.9;margin-top:6px;line-height:1.6}' +
    '.dc-hero-m{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
    '.dc-chip{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22);color:#fff;border-radius:999px;padding:4px 11px;font-size:12px;line-height:1.5}' +
    '.dc-chip.on{background:#fff;color:#1F4E79;border-color:#fff;font-weight:600}' +
    '.dc-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;margin-bottom:12px;-webkit-overflow-scrolling:touch}' +
    '.dc-tab{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;background:var(--card,#fff);border:1px solid var(--border,#E3E8EF);border-radius:10px;padding:8px 13px;font-size:13px;color:var(--text-secondary,#6B7280);cursor:pointer;line-height:1.4;white-space:nowrap}' +
    '.dc-tab.on{background:#1F4E79;border-color:#1F4E79;color:#fff;font-weight:600}' +
    '.dc-tab .nav-icon{display:inline-flex;vertical-align:-3px}' +
    '.dc-card{background:var(--card,#fff);border:1px solid var(--border,#E3E8EF);border-radius:14px;padding:16px;margin-bottom:14px}' +
    '.dc-sec{margin-bottom:18px}' +
    '.dc-sec:last-child{margin-bottom:0}' +
    '.dc-h{display:flex;align-items:flex-start;gap:8px;font-size:15px;font-weight:700;line-height:1.5;margin:0 0 8px;color:var(--text,#1F2937)}' +
    '.dc-h .nav-icon{flex:0 0 auto;margin-top:2px;color:#2E75B6}' +
    '.dc-p{font-size:14px;line-height:1.85;color:var(--text,#333);margin:0}' +
    '.dc-eg{list-style:none;margin:10px 0 0;padding:0}' +
    '.dc-eg li{position:relative;padding-left:18px;font-size:13px;line-height:1.75;color:var(--text-secondary,#5A6472);margin-bottom:4px}' +
    '.dc-eg li:before{content:"";position:absolute;left:4px;top:9px;width:5px;height:5px;border-radius:50%;background:#2E75B6}' +
    '.dc-gb{border:1px solid var(--border,#E3E8EF);border-radius:12px;padding:14px;margin-bottom:16px;background:var(--bg,#F7F9FC)}' +
    '.dc-gb-t{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;margin-bottom:10px}' +
    '.dc-gb-t .nav-icon{color:#E67E22}' +
    '.dc-gb-n{font-size:13px;line-height:1.8;color:var(--text-secondary,#5A6472);margin-top:10px;padding-top:10px;border-top:1px dashed var(--border,#D8DEE8)}' +
    '.dc-pair{display:flex;gap:12px;flex-wrap:wrap}' +
    '.dc-side{flex:1 1 260px;min-width:0}' +
    '.dc-cap{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;margin-bottom:6px}' +
    '.dc-cap.g{color:#1E8449}' +
    '.dc-cap.b{color:#C0392B}' +
    '.dc-stage{position:relative;width:100%;padding-bottom:56.25%;background:#fff;border:1px solid var(--border,#E3E8EF);border-radius:8px;overflow:hidden}' +
    '.dc-stage-in{position:absolute;left:0;top:0;right:0;bottom:0}' +
    '.dc-guide{position:absolute;top:0;bottom:0;width:0;border-left:1px dashed #E67E22;opacity:.75}' +
    '.dc-blk{position:absolute;box-sizing:border-box;background:#1F4E79;color:#fff;border-radius:4px;font-size:11px;line-height:1.3;display:flex;align-items:center;justify-content:center;text-align:center;padding:2px 4px;overflow:hidden}' +
    '.dc-sw{display:flex;width:100%;height:64px;border-radius:8px;overflow:hidden;border:1px solid var(--border,#E3E8EF)}' +
    '.dc-sw-i{display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1.25;text-align:center;padding:2px;color:#fff;overflow:hidden;box-sizing:border-box}' +
    '.dc-tp{width:100%;min-height:96px;border:1px solid var(--border,#E3E8EF);border-radius:8px;padding:14px 14px;box-sizing:border-box;overflow:hidden}' +
    '.dc-tp-l{margin:0;word-break:break-word}' +
    '.dc-q{border:1px solid var(--border,#E3E8EF);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--card,#fff)}' +
    '.dc-q:last-child{margin-bottom:0}' +
    '.dc-q-t{font-size:14px;font-weight:600;line-height:1.7;margin-bottom:10px}' +
    '.dc-q-no{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;background:#1F4E79;color:#fff;border-radius:6px;font-size:12px;margin-right:8px}' +
    '.dc-opt{display:block;width:100%;text-align:left;background:var(--bg,#F7F9FC);border:1px solid var(--border,#E3E8EF);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13.5px;line-height:1.6;color:var(--text,#333);cursor:pointer;font-family:inherit}' +
    '.dc-opt:last-child{margin-bottom:0}' +
    '.dc-opt .dc-k{display:inline-block;min-width:20px;font-weight:700;color:var(--text-secondary,#6B7280);margin-right:8px}' +
    '.dc-opt.right{background:#E8F6EE;border-color:#1E8449;color:#145A32}' +
    '.dc-opt.right .dc-k{color:#1E8449}' +
    '.dc-opt.wrong{background:#FDECEA;border-color:#C0392B;color:#7B241C}' +
    '.dc-opt.wrong .dc-k{color:#C0392B}' +
    '.dc-opt.dim{opacity:.62;cursor:default}' +
    '.dc-an{margin-top:10px;padding:11px 12px;background:#FFF8E7;border:1px solid #F0D9A8;border-radius:10px;font-size:13px;line-height:1.8;color:#6B4E10}' +
    '.dc-an b{color:#8A5A00}' +
    '.dc-an-l{display:flex;align-items:center;gap:6px;font-weight:700;margin-bottom:5px}' +
    '.dc-sum{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:var(--bg,#F7F9FC);border:1px dashed var(--border,#D8DEE8);border-radius:12px;padding:12px 14px;margin-top:12px;font-size:13.5px}' +
    '.dc-sum b{color:#1F4E79;font-size:16px}' +
    '.dc-btn{display:inline-flex;align-items:center;gap:6px;background:#1F4E79;color:#fff;border:none;border-radius:10px;padding:9px 15px;font-size:13.5px;cursor:pointer;line-height:1.4;font-family:inherit}' +
    '.dc-btn.ghost{background:transparent;color:#1F4E79;border:1px solid #1F4E79}' +
    '.dc-btn.done{background:#E8F6EE;color:#1E8449;border:1px solid #1E8449}' +
    '.dc-nav{display:flex;justify-content:space-between;gap:10px;margin-top:4px}' +
    '.dc-foot{font-size:12px;color:var(--text-secondary,#8A93A2);text-align:center;padding:8px 0 2px;line-height:1.7}' +
    '.dc-empty{padding:24px;text-align:center;color:var(--text-secondary,#8A93A2);font-size:13.5px}' +
    /* ===== P0-2 顶部阅读进度条（随滚动更新，页内区块，非弹窗） ===== */
    '.dc-prog{position:sticky;top:0;z-index:6;height:4px;border-radius:999px;background:var(--border,#E3E8EF);overflow:hidden;margin:0 0 10px}' +
    '.dc-prog i{display:block;height:100%;width:0;background:#2E75B6;border-radius:999px}' +
    /* ===== P0-3 可点入口：hero 上的计数 chip 变按钮 ===== */
    '.dc-chip-lk{font-family:inherit;cursor:pointer}' +
    '.dc-chip-lk:active{background:#fff;color:#1F4E79}' +
    /* ===== P0-4 正文卡片化：小节可折叠卡片 + 要点小卡 + 关键句高亮 ===== */
    '.dc-sec{border:1px solid var(--border,#E3E8EF);border-radius:12px;padding:12px 14px;background:var(--card,#fff)}' +
    '.dc-h-btn{-webkit-appearance:none;appearance:none;width:100%;background:none;border:none;padding:0;margin:0;cursor:pointer;font-family:inherit;text-align:left;display:flex;align-items:flex-start;gap:8px}' +
    '.dc-sec-b{margin-top:8px}' +
    '.dc-sec.fold .dc-sec-b{display:none}' +
    '.dc-p b.dc-hl{color:#1F4E79;background:#FFF3D6;padding:1px 3px;border-radius:3px}' +
    '.dc-pt{display:flex;gap:7px;align-items:flex-start;background:var(--bg,#F7F9FC);border:1px solid var(--border,#E3E8EF);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:13px;line-height:1.7;color:var(--text-secondary,#5A6472)}' +
    '.dc-pt .nav-icon{flex:0 0 auto;margin-top:3px;color:#2E75B6}' +
    /* ===== P0-3 正反例翻页浏览 ===== */
    '.dc-case-m{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;font-size:13px;color:var(--text-secondary,#6B7280);margin-bottom:12px}' +
    '.dc-case-m>span{display:inline-flex;align-items:center;gap:6px}' +
    '.dc-case-m .nav-icon{color:#2E75B6}' +
    '.dc-btn[disabled]{opacity:.45;cursor:default}' +
    '@media (max-width:560px){' +
    '.dc-blk{font-size:9px}' +
    '.dc-sw{height:54px}' +
    '.dc-sw-i{font-size:9px}' +
    '.dc-tabs{gap:6px}' +
    '.dc-tab{padding:7px 10px;font-size:12.5px}' +
    '}';

  function DC_ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.type = 'text/css';
    st.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------- demo 渲染（自绘） */

  /** compare：按百分比坐标在 16:9 舞台上摆色块（可带对齐参考线） */
  function DC_renderCompare(spec) {
    if (!spec) return '';
    var out = '<div class="dc-stage"><div class="dc-stage-in">';
    var guides = spec.guides || [];
    var i;
    for (i = 0; i < guides.length; i++) {
      out += '<i class="dc-guide" style="left:' + DC_num(guides[i], 0, 0, 100) + '%"></i>';
    }
    var blocks = spec.blocks || [];
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i] || {};
      var bg = DC_color(b.c, '#1F4E79');
      var fc = DC_color(b.fc, '#FFFFFF');
      var st = 'left:' + DC_num(b.x, 0, 0, 100) + '%;' +
        'top:' + DC_num(b.y, 0, 0, 100) + '%;' +
        'width:' + DC_num(b.w, 10, 0, 100) + '%;' +
        'height:' + DC_num(b.h, 10, 0, 100) + '%;' +
        'background:' + bg + ';color:' + fc + ';' +
        'border-radius:' + DC_num(b.r, 4, 0, 40) + 'px;' +
        'font-size:' + DC_num(b.fs, 11, 6, 40) + 'px;';
      out += '<div class="dc-blk" style="' + st + '">' + DC_esc(b.t || '') + '</div>';
    }
    out += '</div></div>';
    return out;
  }

  /** swatch：按面积比例铺色带（演示 6:3:1 与"五色平分"） */
  function DC_renderSwatch(spec) {
    if (!spec) return '';
    var colors = spec.colors || [];
    if (!colors.length) return '';
    var out = '<div class="dc-sw">';
    for (var i = 0; i < colors.length; i++) {
      var c = colors[i] || {};
      var bg = DC_color(c.c, '#CCCCCC');
      var fc = DC_color(c.fc, '#FFFFFF');
      out += '<div class="dc-sw-i" style="width:' + DC_num(c.w, 20, 0, 100) + '%;background:' + bg +
        ';color:' + fc + '">' + DC_esc(c.t || '') + '</div>';
    }
    out += '</div>';
    return out;
  }

  /** type：按指定字号/字重/颜色/行距渲染文字块（演示字号层级与行距） */
  function DC_renderType(spec) {
    if (!spec) return '';
    var lines = spec.lines || [];
    var bg = DC_color(spec.bg, '#FFFFFF');
    var out = '<div class="dc-tp" style="background:' + bg + '">';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i] || {};
      var st = 'font-size:' + DC_num(l.fs, 13, 6, 60) + 'px;' +
        'font-weight:' + DC_num(l.fw, 400, 100, 900) + ';' +
        'color:' + DC_color(l.c, '#333333') + ';' +
        'line-height:' + DC_num(l.lh, 1.35, 0.6, 3) + ';';
      if (l.ff) st += 'font-family:' + String(l.ff).replace(/[;{}<>]/g, '') + ';';
      if (l.italic) st += 'font-style:italic;';
      out += '<p class="dc-tp-l" style="' + st + '">' + DC_esc(l.t || '') + '</p>';
    }
    out += '</div>';
    return out;
  }

  /** demo 分发：type 走白名单，未知类型安全返回空串 */
  function DC_renderDemo(type, spec) {
    var t = 'none';
    for (var i = 0; i < DEMO_TYPES.length; i++) {
      if (DEMO_TYPES[i] === type) { t = type; break; }
    }
    if (t === 'compare') return DC_renderCompare(spec);
    if (t === 'swatch') return DC_renderSwatch(spec);
    if (t === 'type') return DC_renderType(spec);
    return '';
  }

  /** 正反例对比块：good 左 / bad 右，下面一行讲清楚差在哪 */
  function DC_renderGoodBad(item) {
    if (!item) return '';
    var type = item.demo;
    var out = '<div class="dc-gb">';
    out += '<div class="dc-gb-t">' + DC_icon('lightbulb', 16) + '<span>' + DC_esc(item.title || '正反例') + '</span></div>';
    out += '<div class="dc-pair">';
    out += '<div class="dc-side">';
    out += '<div class="dc-cap g">' + DC_iconRaw('check-circle', 14) + DC_esc((item.good && item.good.caption) || '好例子') + '</div>';
    out += DC_renderDemo(type, item.good);
    out += '</div>';
    out += '<div class="dc-side">';
    out += '<div class="dc-cap b">' + DC_iconRaw('x-circle', 14) + DC_esc((item.bad && item.bad.caption) || '坏例子') + '</div>';
    out += DC_renderDemo(type, item.bad);
    out += '</div>';
    out += '</div>';
    if (item.note) {
      out += '<div class="dc-gb-n">' + DC_icon('eye', 14) + ' ' + DC_esc(item.note) + '</div>';
    }
    out += '</div>';
    return out;
  }

  /* ------------------------------------------------------------ 题库渲染 */

  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /**
   * 渲染一组题目（随堂测 / 课后小测共用）
   * @param {string} qid   存储键后缀，如 'l1' / 'final'
   * @param {Array}  quiz  题目数组 [{q,o,a,x}]
   * @param {Object} state 本次会话的作答状态 { answers:{} }
   */
  function DC_renderQuizHTML(qid, quiz, state) {
    if (!quiz || !quiz.length) return '<div class="dc-empty">本节暂无练习题。</div>';
    var out = '';
    for (var i = 0; i < quiz.length; i++) {
      var it = quiz[i] || {};
      var opts = it.o || [];
      var chosen = state.answers[i];
      var locked = (typeof chosen === 'number');
      out += '<div class="dc-q" data-qi="' + i + '">';
      out += '<div class="dc-q-t"><span class="dc-q-no">' + (i + 1) + '</span>' + DC_esc(it.q || '') + '</div>';
      for (var j = 0; j < opts.length; j++) {
        var cls = 'dc-opt';
        if (locked) {
          cls += ' dim';
          if (j === it.a) cls += ' right';
          else if (j === chosen) cls += ' wrong';
        }
        out += '<button type="button" class="' + cls + '" data-q="' + i + '" data-o="' + j + '"' +
          (locked ? ' data-locked="1"' : '') + '>' +
          '<span class="dc-k">' + (LETTERS[j] || (j + 1)) + '</span>' + DC_esc(opts[j]) + '</button>';
      }
      if (locked) {
        var ok = (chosen === it.a);
        out += '<div class="dc-an">';
        out += '<div class="dc-an-l">' + DC_iconRaw(ok ? 'check-circle' : 'x-circle', 15) +
          '<span>' + (ok ? '答对了' : '再想想') + '　正确答案：' + (LETTERS[it.a] || '') + '</span></div>';
        out += '<div><b>解析：</b>' + DC_esc(it.x || '（本题暂无解析）') + '</div>';
        out += '</div>';
      }
      out += '</div>';
    }
    out += DC_renderSummaryHTML(qid, quiz, state);
    return out;
  }

  function DC_renderSummaryHTML(qid, quiz, state) {
    var total = quiz.length;
    var answered = 0, right = 0;
    for (var i = 0; i < total; i++) {
      var c = state.answers[i];
      if (typeof c === 'number') {
        answered++;
        if (c === quiz[i].a) right++;
      }
    }
    /* 全部答完才写最好成绩，避免中途退出污染统计；先写再读，保证本次成绩可见 */
    if (answered === total && total > 0) DC_saveBest(qid, right, total);
    var saved = DC_read(qid);
    var best = (saved && typeof saved.best === 'number') ? saved.best : null;
    var out = '<div class="dc-sum" id="dc-sum-' + qid + '">';
    out += '<div>已答 <b>' + answered + '</b> / ' + total + '　答对 <b>' + right + '</b> 题' +
      (best !== null ? '　（历史最好 ' + best + '/' + total + '）' : '') + '</div>';
    out += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    out += '<button type="button" class="dc-btn ghost" data-act="redo" data-qid="' + DC_esc(qid) + '">' +
      DC_iconRaw('rotate-ccw', 14) + '重做本组</button>';
    out += '</div>';
    out += '</div>';
    if (answered === total && total > 0) {
      var pct = Math.round(right * 100 / total);
      var tip = pct >= 80 ? '掌握得不错，可以进下一节了。'
        : (pct >= 60 ? '基本过关，建议把答错的解析再读一遍。' : '建议回到上面把对应小节重看一遍，再来做一次。');
      out += '<div class="dc-an" style="margin-top:10px"><div class="dc-an-l">' + DC_iconRaw('award', 15) +
        '<span>本组成绩：' + right + ' / ' + total + '（' + pct + '%）</span></div>' +
        '<div>' + DC_esc(tip) + '</div></div>';
    }
    return out;
  }

  /** 绑定一组题目的点击与重做事件（ES5 闭包，不用箭头函数） */
  function DC_bindQuiz(root, qid, quiz, state) {
    var btns = root.querySelectorAll('.dc-opt');
    var i;
    for (i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (btn.getAttribute('data-locked') === '1') return;
          var qi = parseInt(btn.getAttribute('data-q'), 10);
          var oi = parseInt(btn.getAttribute('data-o'), 10);
          if (isNaN(qi) || isNaN(oi)) return;
          state.answers[qi] = oi;
          DC_repaintQuiz(root, qid, quiz, state);
        });
      })(btns[i]);
    }
    var acts = root.querySelectorAll('[data-act="redo"]');
    for (i = 0; i < acts.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          state.answers = {};
          DC_repaintQuiz(root, qid, quiz, state);
        });
      })(acts[i]);
    }
  }

  /** 局部重绘：只换题库容器的 innerHTML，保留滚动位置附近的结构 */
  function DC_repaintQuiz(root, qid, quiz, state) {
    var box = root.querySelector('.dc-quiz-body');
    if (!box) return;
    box.innerHTML = DC_renderQuizHTML(qid, quiz, state);
    DC_hydrateIcons();
    DC_bindQuiz(box, qid, quiz, state);
  }

  /* ------------------------------------------------------------------ 主体 */

  var DesignClass = {
    slot: null,
    data: null,
    tab: 0,
    states: {},
    folds: {},          /* P0-4 小节折叠态：key = tab:index，只存内存，不落 localStorage */
    caseIdx: 0,         /* P0-3 正反例浏览：当前组序号 */

    /** 入口：由 PPTV2 注册表调用 */
    render: function (slotEl) {
      if (!slotEl) return;
      DC_ensureStyle();
      this.slot = slotEl;
      this.data = (window.MINI_BANK && window.MINI_BANK['ppt-design']) ? window.MINI_BANK['ppt-design'] : null;
      this.states = this.states || {};
      if (!this.data) {
        slotEl.innerHTML = '<div class="dc-wrap"><div class="dc-card dc-empty">课堂数据未加载，请刷新页面后重试。</div></div>';
        return;
      }
      this.tab = 0;
      this.paint();
    },

    /** 整块重绘（顶部 hero + 页签 + 当前页内容） */
    paint: function () {
      var slot = this.slot;
      var d = this.data;
      if (!slot || !d) return;
      var lessons = d.lessons || [];
      var learned = 0, i;
      for (i = 0; i < lessons.length; i++) {
        if (DC_isLearned(lessons[i].id)) learned++;
      }
      var finalQuiz = d.finalQuiz || [];

      var html = '<div class="dc-wrap" id="dc-wrap">';

      /* ⓪ P0-2 顶部阅读进度条（随滚动更新；位置固定在面板顶部） */
      html += '<div class="dc-prog" id="dc-prog"><i id="dc-prog-i"></i></div>';

      /* ① hero */
      html += '<div class="dc-hero">';
      html += '<div class="dc-hero-t">' + DC_icon('graduation-cap', 20) + '<span>PPT · 设计基础 · 前置课堂</span></div>';
      html += '<div class="dc-hero-s">先学三节课（四原则 / 配色 / 字体），每节都有正反例对比和随堂测；学完再做课后小测检验。内容为原创讲解，看得懂、照着做就行。</div>';
      html += '<div class="dc-hero-m">';
      html += '<span class="dc-chip' + (learned === lessons.length && lessons.length ? ' on' : '') + '">' +
        DC_icon('badge-check', 14) + '已学 ' + learned + ' / ' + lessons.length + ' 节</span>';
      /* P0-3：这两个计数不再是死标签，点一下直接进对应视图 */
      html += '<button type="button" class="dc-chip dc-chip-lk" data-go="' + TAB_FINAL + '">' +
        DC_icon('clipboard-list', 14) + '课后小测 ' + finalQuiz.length + ' 题</button>';
      html += '<button type="button" class="dc-chip dc-chip-lk" data-go="' + TAB_CASES + '">' +
        DC_icon('presentation', 14) + '正反例 ' + DC_countGoodBad(lessons) + ' 组</button>';
      html += '</div>';
      html += '</div>';

      /* ② 页签 */
      html += '<div class="dc-tabs">';
      for (i = 0; i < lessons.length; i++) {
        var ls = lessons[i];
        var on = (this.tab === i);
        /* 已学的章节标签打标记：全站 data-icon 体系，不用 emoji */
        var done = DC_isLearned(ls.id) ? DC_icon('badge-check', 13) : '';
        html += '<button type="button" class="dc-tab' + (on ? ' on' : '') + '" data-tab="' + i + '">' +
          DC_icon(ls.icon || 'book-open', 15) + '<span>第' + (i + 1) + '节 ' + DC_esc(ls.title) + '</span>' + done + '</button>';
      }
      html += '<button type="button" class="dc-tab' + (this.tab === TAB_FINAL ? ' on' : '') + '" data-tab="' + TAB_FINAL + '">' +
        DC_icon('clipboard-list', 15) + '<span>课后小测</span></button>';
      html += '<button type="button" class="dc-tab' + (this.tab === TAB_CASES ? ' on' : '') + '" data-tab="' + TAB_CASES + '">' +
        DC_icon('presentation', 15) + '<span>正反例</span></button>';
      html += '</div>';

      /* ③ 当前页内容 */
      html += '<div id="dc-body">';
      if (this.tab === TAB_FINAL) {
        html += this.renderFinalQuiz(finalQuiz);
      } else if (this.tab === TAB_CASES) {
        html += this.renderCases();
      } else {
        html += this.renderLesson(lessons[this.tab]);
      }
      html += '</div>';

      html += '<div class="dc-foot">原创讲解 · 进度只保存在本机浏览器　|　' + DC_esc(d.credit || '') + '</div>';
      html += '</div>';

      slot.innerHTML = html;
      DC_hydrateIcons();
      this.bind();
      DC_bindProgress(document.getElementById('dc-wrap'));
    },

    /** 渲染一节课：小节讲解 → 正反例 → 随堂测 */
    renderLesson: function (lesson) {
      if (!lesson) return '<div class="dc-card dc-empty">本节内容暂缺。</div>';
      var out = '';
      var i;

      /* 课头 */
      out += '<div class="dc-card">';
      out += '<div class="dc-hero-t" style="color:var(--text,#1F2937)">' + DC_icon(lesson.icon || 'book-open', 18) +
        '<span>第 ' + (this.tab + 1) + ' 节 · ' + DC_esc(lesson.title) + '</span></div>';
      out += '<div class="dc-hero-s" style="color:var(--text-secondary,#6B7280)">' +
        DC_esc(lesson.tagline || '') + '　·　约 ' + DC_num(lesson.minutes, 5, 1, 120) + ' 分钟　·　' + DC_esc(lesson.sub || '') + '</div>';
      out += '</div>';

      /* 讲解小节 */
      var secs = lesson.sections || [];
      if (secs.length) {
        out += '<div class="dc-card">';
        for (i = 0; i < secs.length; i++) {
          var s = secs[i] || {};
          var fkey = String(this.tab) + ':' + i;
          var folded = this.isFolded(fkey, i);
          /* P0-4：每个小节一张卡，标题行可点折叠（默认只展开第一个，其余折叠） */
          out += '<div class="dc-sec' + (folded ? ' fold' : '') + '">';
          out += '<button type="button" class="dc-h dc-h-btn" data-sec="' + i + '">' +
            DC_icon(folded ? 'chevron-right' : 'chevron-down', 15) +
            '<span>' + DC_esc(s.h || '') + '</span></button>';
          out += '<div class="dc-sec-b">';
          out += '<p class="dc-p">' + DC_highlight(s.p, s.hl) + '</p>';
          if (s.examples && s.examples.length) {
            for (var k = 0; k < s.examples.length; k++) {
              out += '<div class="dc-pt">' + DC_icon('check-circle', 13) +
                '<span>' + DC_esc(s.examples[k]) + '</span></div>';
            }
          }
          out += '</div>';
          out += '</div>';
        }
        out += '</div>';
      }

      /* 正反例 */
      var gb = lesson.goodBad || [];
      if (gb.length) {
        out += '<div class="dc-card">';
        out += '<h4 class="dc-h" style="margin-bottom:12px">' + DC_icon('eye', 16) +
          '<span>正反例对比（共 ' + gb.length + ' 组，全部由代码绘制，无外链图片）</span></h4>';
        for (i = 0; i < gb.length; i++) out += DC_renderGoodBad(gb[i]);
        out += '</div>';
      }

      /* 随堂测 */
      var quiz = lesson.quiz || [];
      var st = this.ensureState(lesson.id);
      out += '<div class="dc-card">';
      out += '<h4 class="dc-h" style="margin-bottom:12px">' + DC_icon('help-circle', 16) +
        '<span>随堂测 · ' + quiz.length + ' 题（选完即时出解析）</span></h4>';
      out += '<div class="dc-quiz-body" data-qid="' + DC_esc(lesson.id) + '">' +
        DC_renderQuizHTML(lesson.id, quiz, st) + '</div>';
      out += '</div>';

      /* 底部：标记已学 + 上一节/下一节 */
      var isDone = DC_isLearned(lesson.id);
      out += '<div class="dc-nav">';
      if (this.tab > 0) {
        out += '<button type="button" class="dc-btn ghost" data-go="' + (this.tab - 1) + '">' +
          DC_iconRaw('chevron-left', 14) + '上一节</button>';
      } else {
        out += '<span></span>';
      }
      out += '<button type="button" class="dc-btn' + (isDone ? ' done' : '') + '" data-learn="' + DC_esc(lesson.id) + '">' +
        DC_iconRaw(isDone ? 'badge-check' : 'check', 15) + (isDone ? '本节已学完' : '标记本节已学') + '</button>';
      if (this.tab < (this.data.lessons.length - 1)) {
        out += '<button type="button" class="dc-btn" data-go="' + (this.tab + 1) + '">下一节' +
          DC_iconRaw('chevron-right', 14) + '</button>';
      } else {
        out += '<button type="button" class="dc-btn" data-go="' + TAB_FINAL + '">去做课后小测' +
          DC_iconRaw('chevron-right', 14) + '</button>';
      }
      out += '</div>';

      return out;
    },

    /** 渲染课后小测：复用 mini-ppt.js 原有 8 题 */
    renderFinalQuiz: function (quiz) {
      var st = this.ensureState(FINAL_ID);
      var out = '<div class="dc-card">';
      out += '<h4 class="dc-h" style="margin-bottom:6px">' + DC_icon('clipboard-list', 16) +
        '<span>课后小测 · ' + (quiz ? quiz.length : 0) + ' 题</span></h4>';
      out += '<p class="dc-p" style="margin-bottom:14px;color:var(--text-secondary,#6B7280);font-size:13px">' +
        '这一组是本模块原有的 8 道自测题，原样保留。全部答完后会给出成绩与历史最好成绩，每题答完即时显示解析。</p>';
      out += '<div class="dc-quiz-body" data-qid="' + FINAL_ID + '">' +
        DC_renderQuizHTML(FINAL_ID, quiz || [], st) + '</div>';
      out += '</div>';
      out += '<div class="dc-nav">';
      out += '<button type="button" class="dc-btn ghost" data-go="' + (this.data.lessons.length - 1) + '">' +
        DC_iconRaw('chevron-left', 14) + '回到第 3 节</button>';
      out += '<button type="button" class="dc-btn ghost" data-go="0">' + DC_iconRaw('chevron-left', 14) + '从头再看一遍</button>';
      out += '</div>';
      return out;
    },

    /** P0-4：小节默认折叠（除本节第一个），展开过的按用户选择记在内存里 */
    isFolded: function (key, idx) {
      if (typeof this.folds[key] === 'boolean') return this.folds[key];
      return idx > 0;
    },

    /** P0-3：把所有课的正反例摊平成一维数组，供翻页浏览 */
    allCases: function () {
      var list = [];
      var lessons = (this.data && this.data.lessons) ? this.data.lessons : [];
      for (var i = 0; i < lessons.length; i++) {
        var gb = lessons[i].goodBad || [];
        for (var j = 0; j < gb.length; j++) list.push({ item: gb[j], li: i, gi: j });
      }
      return list;
    },

    /** P0-3：正反例浏览视图 —— 一屏一组，上一组 / 下一组翻页（页内区块，非弹窗） */
    renderCases: function () {
      var list = this.allCases();
      if (!list.length) return '<div class="dc-card dc-empty">暂无正反例。</div>';
      if (this.caseIdx < 0) this.caseIdx = 0;
      if (this.caseIdx > list.length - 1) this.caseIdx = list.length - 1;
      var cur = list[this.caseIdx];
      var lessons = (this.data && this.data.lessons) ? this.data.lessons : [];
      var lesson = lessons[cur.li] || {};
      var out = '<div class="dc-card">';
      out += '<div class="dc-case-m">';
      out += '<span>' + DC_icon('presentation', 15) + '<span>第 ' + (this.caseIdx + 1) + ' / ' + list.length +
        ' 组　·　第 ' + (cur.li + 1) + ' 节 ' + DC_esc(lesson.title || '') + '</span></span>';
      out += '<span>' + DC_icon('target', 14) + '<span>' + DC_esc(lesson.sub || '') + '</span></span>';
      out += '</div>';
      out += DC_renderGoodBad(cur.item);
      out += '<div class="dc-nav">';
      out += '<button type="button" class="dc-btn ghost" data-case="-1"' +
        (this.caseIdx <= 0 ? ' disabled="disabled"' : '') + '>' + DC_iconRaw('chevron-left', 14) + '上一组</button>';
      out += '<button type="button" class="dc-btn ghost" data-go="0">' + DC_iconRaw('book-open', 14) + '回到课程</button>';
      out += '<button type="button" class="dc-btn" data-case="1"' +
        (this.caseIdx >= list.length - 1 ? ' disabled="disabled"' : '') + '>下一组' +
        DC_iconRaw('chevron-right', 14) + '</button>';
      out += '</div>';
      out += '</div>';
      return out;
    },

    /** P0-3：翻页（不触发 go()，避免每次都 scrollIntoView 跳回顶部） */
    caseStep: function (d) {
      var list = this.allCases();
      var n = this.caseIdx + (parseInt(d, 10) || 0);
      if (n < 0) n = 0;
      if (n > list.length - 1) n = list.length - 1;
      if (n === this.caseIdx) return;
      this.caseIdx = n;
      this.paint();
    },

    /** 取（或建）某一组的作答状态 */
    ensureState: function (qid) {
      if (!this.states[qid]) this.states[qid] = { answers: {} };
      return this.states[qid];
    },

    /** 切换页签 */
    go: function (i) {
      var max = (this.data && this.data.lessons) ? this.data.lessons.length : 0;
      if (isNaN(i) || i < 0 || i > TAB_CASES) return;
      if (i !== TAB_CASES && i > max) return;
      this.tab = i;
      this.paint();
      if (this.slot && this.slot.scrollIntoView) {
        try { this.slot.scrollIntoView({ block: 'start' }); } catch (e) { /* 老浏览器忽略 */ }
      }
    },

    /** 事件绑定：页签 / 上一节下一节 / 标记已学 */
    bind: function () {
      var self = this;
      var slot = this.slot;
      if (!slot) return;

      function each(sel, fn) {
        var nodes = slot.querySelectorAll(sel);
        for (var i = 0; i < nodes.length; i++) fn(nodes[i]);
      }

      each('[data-tab]', function (el) {
        el.addEventListener('click', function () {
          self.go(parseInt(el.getAttribute('data-tab'), 10));
        });
      });
      each('[data-go]', function (el) {
        el.addEventListener('click', function () {
          self.go(parseInt(el.getAttribute('data-go'), 10));
        });
      });
      each('[data-learn]', function (el) {
        el.addEventListener('click', function () {
          var id = el.getAttribute('data-learn');
          DC_markLearned(id);
          if (typeof window.showToast === 'function') {
            try { window.showToast('已标记本节学完'); } catch (e) { /* 忽略 */ }
          }
          self.paint();
        });
      });

      /* P0-4：小节卡片折叠 / 展开（只切 class 与图标，不整页重绘） */
      each('[data-sec]', function (el) {
        el.addEventListener('click', function () {
          var idx = parseInt(el.getAttribute('data-sec'), 10);
          if (isNaN(idx)) return;
          var key = String(self.tab) + ':' + idx;
          var wasFolded = self.isFolded(key, idx);
          self.folds[key] = !wasFolded;
          var sec = el.parentNode;
          if (!sec) return;
          if (!wasFolded) sec.className = sec.className + ' fold';
          else sec.className = String(sec.className).replace(/\bfold\b/g, '');
          var ic = el.querySelector ? el.querySelector('[data-icon]') : null;
          if (ic && typeof window.lucideIcon === 'function') {
            try {
              ic.innerHTML = window.lucideIcon(!wasFolded ? 'chevron-right' : 'chevron-down', 15);
            } catch (e) { /* 忽略 */ }
          }
          DC_bindProgress(document.getElementById('dc-wrap'));
        });
      });

      /* P0-3：正反例浏览翻页 */
      each('[data-case]', function (el) {
        el.addEventListener('click', function () {
          if (el.getAttribute('disabled')) return;
          self.caseStep(el.getAttribute('data-case'));
        });
      });

      /* 随堂测 / 课后小测的作答与重做 */
      each('.dc-quiz-body', function (box) {
        var qid = box.getAttribute('data-qid');
        var quiz = null;
        if (qid === FINAL_ID) quiz = self.data.finalQuiz || [];
        else {
          var lessons = self.data.lessons || [];
          for (var i = 0; i < lessons.length; i++) {
            if (lessons[i].id === qid) { quiz = lessons[i].quiz || []; break; }
          }
        }
        if (!quiz) return;
        DC_bindQuiz(box, qid, quiz, self.ensureState(qid));
      });
    }
  };

  /** 统计正反例组数（hero 展示用） */
  function DC_countGoodBad(lessons) {
    var n = 0;
    for (var i = 0; i < (lessons || []).length; i++) {
      n += ((lessons[i].goodBad || []).length);
    }
    return n;
  }

  /* ------------------------------------------------- 注册到 PPTV2 注册表 */
  window.DesignClass = DesignClass;
  window.PPTV2['ppt-design'] = function (slotEl) {
    try {
      DesignClass.render(slotEl);
    } catch (err) {
      if (slotEl) {
        slotEl.innerHTML = '<div class="dc-wrap"><div class="dc-card dc-empty">课堂渲染出错：' +
          DC_esc(err && err.message ? err.message : String(err)) + '</div></div>';
      }
    }
  };
})();
