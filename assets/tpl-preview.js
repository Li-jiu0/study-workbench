/* =====================================================================
   tpl-preview.js · A7「PPT · 实战模板库」渲染器（v2）
   批次：2026-09-14 / R48「做真内容」/ 版本戳 20260914e
   ---------------------------------------------------------------------
   架构约定：
     · 注册 window.PPTV2['ppt-templates'] = function (slotEl) {...}
       宿主页面（演示.html）由 T00 预埋分发逻辑，本文件**不改任何 HTML**。
     · 数据来源：window.MINI_BANK['ppt-templates']（assets/data-ppt-templates.js）
     · 5 套模板 × 5 帧 = 25 个骨架预览，全部由 div + 内联 background 自绘，
       零外链图片、零 CDN、零 emoji。
     · 图标走 assets/icon-map.js：渲染完成后补一次 window.lucideAutoRender()
       （icon-map 的 [data-icon] 扫描只在 DOMContentLoaded 跑一次，见 F9）。
     · 不依赖 assets/xt-content.js；所需 helper 全部内联，统一 TP_ 前缀。
     · 不调用 saveData()；localStorage 键：xtc:ppt:tpl:<id>:fav / :learn
       统一经 window.lsKey() 前缀化（不存在时原样返回，防御式）。
     · ES5 语法：不用箭头函数、不用可选链/空值合并、不用模板字符串。
   ===================================================================== */
(function () {
  'use strict';

  window.PPTV2 = window.PPTV2 || {};

  var DATA_KEY = 'ppt-templates';
  var LS_PREFIX = 'xtc:ppt:tpl:';
  var STYLE_ID = 'tpl-preview-style';
  var LAYOUTS = ['cover', 'toc', 'two-col', 'kpi', 'end'];
  /* skeleton 白名单标签（其余标签连同内容一并丢弃，只保留 class 属性） */
  var TAG_WL = ['div', 'span', 'h3', 'p', 'ul', 'li', 'b', 'strong', 'br'];
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var QUIZ_MAP = {};

  /* ==================== 极简 helper（TP_ 前缀，避免全局污染） ==================== */

  function TP_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function TP_lsKey(k) {
    return typeof window.lsKey === 'function' ? window.lsKey(k) : k;
  }

  function TP_storeGet(key, def) {
    try {
      var v = window.localStorage.getItem(TP_lsKey(key));
      if (v === null || v === '') return def;
      return JSON.parse(v);
    } catch (e) {
      return def;
    }
  }

  function TP_storeSet(key, val) {
    try {
      window.localStorage.setItem(TP_lsKey(key), JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 校验并规范化 hex 颜色，非法值回退到 fallback。 */
  function TP_color(hex, fallback) {
    var h = String(hex || '').replace('#', '').replace(/\s/g, '');
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
    return '#' + h.toUpperCase();
  }

  /** hex → rgba(…) 字符串，用于做浅色底与半透明块。 */
  function TP_rgba(hex, a) {
    var h = String(TP_color(hex, '#000000')).replace('#', '');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /** 亮度（0-255），用于决定叠在 main 色上的文字取白还是取深。 */
  function TP_lum(hex) {
    var h = String(TP_color(hex, '#FFFFFF')).replace('#', '');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /** 轻提示：优先复用宿主页 toast，逐级回退。 */
  function TP_toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); return; }
      var t = document.getElementById('toast');
      if (t) {
        t.textContent = msg;
        t.className = 'toast show';
        window.setTimeout(function () { t.className = 'toast'; }, 2200);
        return;
      }
    } catch (e) { /* 忽略，最后回退 xtToast */ }
    if (typeof window.xtToast === 'function') { try { window.xtToast('info', msg); } catch (e2) { /* 忽略 */ } }
  }

  /**
   * 骨架字符串消毒：只保留白名单标签，且只保留 class 属性。
   * 用于「套用框架」复制前，防止畸形/注入内容进入用户剪贴板。
   */
  function TP_sanitize(html) {
    var s = String(html === null || html === undefined ? '' : html);
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|img|a|svg|form|input|button)\b[\s\S]*?>/gi, '');
    s = s.replace(/<[^>]*>/g, function (tok) {
      var m = /^<\s*(\/?)\s*([a-zA-Z0-9]+)/.exec(tok);
      if (!m) return '';
      var name = m[2].toLowerCase();
      if (TAG_WL.indexOf(name) === -1) return '';
      if (name === 'br') return '<br />';
      var cm = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tok);
      var cls = cm ? (cm[2] || cm[3] || '') : '';
      cls = cls.replace(/[^A-Za-z0-9_\- ]/g, '');
      return '<' + m[1] + name + (cls ? ' class="' + cls + '"' : '') + '>';
    });
    return s;
  }

  /** 复制文本：navigator.clipboard 优先，失败回退 textarea + execCommand。 */
  function TP_copyText(text, cb) {
    var ok = false;
    try {
      if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
        window.navigator.clipboard.writeText(text).then(
          function () { cb(true); },
          function () { cb(TP_fallbackCopy(text)); }
        );
        return;
      }
    } catch (e) { /* file:// 下 clipboard 常不可用，走兜底 */ }
    ok = TP_fallbackCopy(text);
    cb(ok);
  }

  function TP_fallbackCopy(text) {
    var ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
      return false;
    }
  }

  /* ==================== 数据访问 ==================== */

  function TP_getData() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[DATA_KEY];
    if (!d || !d.items || !d.items.length || d.v !== 2) return null;
    return d;
  }

  function TP_findItem(items, id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /* ==================== 帧骨架自绘 ==================== */

  function TP_abs(x, y, w, h) {
    return 'position:absolute;left:' + x + '%;top:' + y + '%;width:' + w + '%;height:' + h + '%;';
  }

  function TP_bar(x, y, w, h, bg, radius) {
    return '<span class="tpv-b" style="' + TP_abs(x, y, w, h) + 'background:' + bg +
      ';border-radius:' + radius + '"></span>';
  }

  function TP_txt(x, y, w, size, color, weight, align, text) {
    return '<span class="tpv-t" style="' + TP_abs(x, y, w, 0) + 'font-size:' + size + 'px;color:' + color +
      ';font-weight:' + weight + ';text-align:' + align + ';line-height:1.25">' + TP_esc(text) + '</span>';
  }

  function TP_firstBlock(blocks, type) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i] && blocks[i].type === type) return blocks[i];
    }
    return null;
  }

  /** 每帧下方的一行说明文字（帧名 + 主要内容）。 */
  function TP_frameCaption(frame, layout) {
    var out = [];
    var b;
    if (layout === 'cover' || layout === 'end') {
      b = TP_firstBlock(frame.blocks, 'title');
      if (b) out.push(b.text);
      b = TP_firstBlock(frame.blocks, 'sub');
      if (b) out.push(b.text);
    } else if (layout === 'toc') {
      b = TP_firstBlock(frame.blocks, 'list');
      if (b && b.items) out = out.concat(b.items);
    } else if (layout === 'two-col') {
      b = TP_firstBlock(frame.blocks, 'h');
      if (b) out.push(b.text);
      b = TP_firstBlock(frame.blocks, 'col');
      if (b && b.items) out = out.concat(b.items);
    } else if (layout === 'kpi') {
      b = TP_firstBlock(frame.blocks, 'kpi');
      if (b && b.items) {
        for (var i = 0; i < b.items.length; i++) out.push(b.items[i].v + ' ' + b.items[i].k);
      }
      out.push('配一张柱状图 + 一句结论');
    }
    return out.join(' · ');
  }

  /**
   * 渲染单帧骨架（纯 div + 内联样式自绘，无外链图片）。
   * @param {Object} frame   帧数据 {name, layout, blocks}
   * @param {Object} palette {main, accent, bg, text}
   * @param {Object} font    {title, body, note}
   * @param {string} shape   'sharp' | 'round' | 'pill'
   * @return {string} HTML 片段
   */
  function TP_renderFrame(frame, palette, font, shape) {
    if (!frame) frame = { name: '空白页', layout: 'two-col', blocks: [] };
    var layout = LAYOUTS.indexOf(frame.layout) === -1 ? 'two-col' : frame.layout;
    var pal = palette || {};
    var main = TP_color(pal.main, '#333333');
    var accent = TP_color(pal.accent, '#888888');
    var bg = TP_color(pal.bg, '#FFFFFF');
    var text = TP_color(pal.text, '#333333');
    var radius = shape === 'round' ? '5px' : (shape === 'pill' ? '10px' : '1px');
    var onMain = TP_lum(main) < 150 ? '#FFFFFF' : '#1A1A1A';
    var blocks = frame.blocks || [];
    var b, items, i;

    var h = '';
    h += '<div class="tpv-canvas" style="background:' + bg + ';border-color:' + TP_rgba(main, 0.22) + '">';

    if (layout === 'cover') {
      b = TP_firstBlock(blocks, 'title');
      var sub = TP_firstBlock(blocks, 'sub');
      h += TP_bar(0, 0, 100, 58, main, '0 0 ' + radius + ' ' + radius);
      h += TP_txt(8, 15, 84, 9, onMain, 700, 'left', b ? b.text : '主标题');
      h += TP_txt(8, 33, 80, 6.5, TP_rgba(onMain, 0.78), 400, 'left', sub ? sub.text : '副标题 / 部门 / 日期');
      h += TP_bar(8, 63, 18, 1.6, accent, radius);
      h += TP_bar(8, 72, 26, 2.2, TP_rgba(text, 0.32), radius);
      h += TP_bar(8, 78, 20, 2.2, TP_rgba(text, 0.22), radius);
      h += TP_bar(8, 84, 30, 2.2, TP_rgba(text, 0.22), radius);

    } else if (layout === 'toc') {
      b = TP_firstBlock(blocks, 'list');
      items = (b && b.items) ? b.items : ['一、…', '二、…', '三、…'];
      h += TP_bar(7, 8, 34, 6.5, main, radius);
      h += TP_bar(7, 18, 14, 1.2, accent, radius);
      var step = Math.min(15, Math.floor(66 / Math.max(items.length, 1)));
      for (i = 0; i < items.length && i < 5; i++) {
        var y = 26 + i * step;
        h += TP_bar(7, y, 4.5, 6.5, TP_rgba(main, 0.16), radius);
        h += TP_txt(13.5, y, 79, 6.5, text, 400, 'left', items[i]);
      }
      h += TP_bar(7, 88, 44, 2.4, TP_rgba(text, 0.18), radius);

    } else if (layout === 'two-col') {
      b = TP_firstBlock(blocks, 'h');
      var col = TP_firstBlock(blocks, 'col');
      items = (col && col.items) ? col.items : ['左栏要点', '右栏要点'];
      h += TP_bar(6, 6, 46, 7, main, radius);
      h += TP_bar(6, 16, 14, 1.2, accent, radius);
      for (i = 0; i < 2; i++) {
        var x = i === 0 ? 6 : 53;
        h += TP_bar(x, 23, 41, 60, TP_rgba(main, 0.06), radius);
        h += TP_bar(x, 23, 41, 2.4, accent, radius);
        h += TP_txt(x + 3, 31, 35, 6.2, text, 400, 'left', items[i] || '要点');
        h += TP_bar(x + 3, 46, 32, 1.6, TP_rgba(text, 0.18), radius);
        h += TP_bar(x + 3, 52, 27, 1.6, TP_rgba(text, 0.14), radius);
        h += TP_bar(x + 3, 58, 30, 1.6, TP_rgba(text, 0.14), radius);
      }

    } else if (layout === 'kpi') {
      b = TP_firstBlock(blocks, 'kpi');
      items = (b && b.items) ? b.items : [{ v: '128%', k: '同比' }, { v: '32', k: '项目数' }, { v: '+18%', k: '增长' }];
      h += TP_bar(6, 6, 40, 6.5, main, radius);
      h += TP_bar(6, 15, 14, 1.2, accent, radius);
      var n = Math.min(items.length, 3);
      var w = Math.floor(88 / n) - 3;
      for (i = 0; i < n; i++) {
        var kx = 6 + i * (w + 3);
        h += TP_bar(kx, 22, w, 24, TP_rgba(accent, 0.16), radius);
        h += TP_txt(kx, 25, w, 11, main, 700, 'center', items[i].v);
        h += TP_txt(kx, 39, w, 6, text, 400, 'center', items[i].k);
      }
      h += TP_bar(6, 79, 88, 0.7, TP_rgba(text, 0.3), '0');
      var heights = [18, 27, 14, 31, 22];
      for (i = 0; i < heights.length; i++) {
        h += TP_bar(8 + i * 16.5, 79 - heights[i], 11, heights[i], i === 3 ? main : TP_rgba(accent, 0.75), '1px 1px 0 0');
      }

    } else { /* end */
      b = TP_firstBlock(blocks, 'title');
      var esub = TP_firstBlock(blocks, 'sub');
      h += TP_bar(0, 0, 100, 100, main, '0');
      h += TP_txt(0, 30, 100, 11, onMain, 700, 'center', b ? b.text : '谢谢');
      h += TP_bar(42, 49, 16, 1, accent, radius);
      h += TP_txt(0, 57, 100, 6.5, TP_rgba(onMain, 0.82), 400, 'center', esub ? esub.text : '问答环节');
    }

    h += '</div>';
    h += '<div class="tpv-fname">' + TP_esc(frame.name || '页面') + '</div>';
    h += '<div class="tpv-fcap">' + TP_esc(TP_frameCaption(frame, layout)) + '</div>';
    return h;
  }

  /* ==================== 卡片渲染 ==================== */

  function TP_swatches(pal) {
    var defs = [
      { k: 'main', n: '主色' },
      { k: 'accent', n: '强调色' },
      { k: 'bg', n: '底色' },
      { k: 'text', n: '文字色' }
    ];
    var h = '';
    for (var i = 0; i < defs.length; i++) {
      var c = TP_color(pal[defs[i].k], '#CCCCCC');
      h += '<span class="tpv-sw"><i class="tpv-sw-d" style="background:' + c +
        ';border-color:' + TP_rgba('#000000', 0.12) + '"></i>' +
        '<span class="tpv-sw-t"><b>' + defs[i].n + '</b>' + TP_esc(c) + '</span></span>';
    }
    return h;
  }

  function TP_renderItem(it) {
    var pal = it.palette || {};
    var f = it.font || it.fonts || {};
    var frames = it.frames || [];
    var i;

    var h = '';
    h += '<div class="tpv-card" data-id="' + TP_esc(it.id) + '">';

    /* 头部：图标 + 名称 + 摘要 + 操作按钮 */
    h += '<div class="tpv-head">';
    h += '<span class="nav-icon tpv-ic" data-icon="' + TP_esc(it.icon || 'file-text') + '" data-icon-size="18"></span>';
    h += '<div class="tpv-hmain"><b>' + TP_esc(it.name) + '</b>';
    h += '<div class="tpv-sum">' + TP_esc(it.summary) + '</div></div>';
    h += '<div class="tpv-acts">';
    h += '<button type="button" class="tpv-btn" data-act="fav" data-id="' + TP_esc(it.id) + '">' +
      '<span class="nav-icon" data-icon="star" data-icon-size="14"></span><em>收藏</em></button>';
    h += '<button type="button" class="tpv-btn" data-act="learn" data-id="' + TP_esc(it.id) + '">' +
      '<span class="nav-icon" data-icon="check-circle" data-icon-size="14"></span><em>标记已学</em></button>';
    h += '<button type="button" class="tpv-btn tpv-btn-p" data-act="copy" data-id="' + TP_esc(it.id) + '">' +
      '<span class="nav-icon" data-icon="clipboard" data-icon-size="14"></span><em>套用框架</em></button>';
    h += '</div></div>';

    /* 适用场景 */
    h += '<div class="tpv-row"><span class="tpv-lb"><span class="nav-icon" data-icon="target" data-icon-size="13"></span>适用场景</span>';
    var scene = it.scene || [];
    for (i = 0; i < scene.length; i++) h += '<span class="tpv-tag">' + TP_esc(scene[i]) + '</span>';
    h += '</div>';

    /* 5 帧骨架预览 */
    h += '<div class="tpv-row"><span class="tpv-lb"><span class="nav-icon" data-icon="monitor" data-icon-size="13"></span>5 帧骨架预览</span></div>';
    h += '<div class="tpv-frames">';
    for (i = 0; i < 5; i++) {
      h += '<div class="tpv-f">' + TP_renderFrame(frames[i], pal, f, it.shape) + '</div>';
    }
    h += '</div>';

    /* 配色规范 */
    h += '<div class="tpv-row"><span class="tpv-lb"><span class="nav-icon" data-icon="palette" data-icon-size="13"></span>配色规范</span>' + TP_swatches(pal) + '</div>';

    /* 字体规范 */
    h += '<div class="tpv-row tpv-fontrow"><span class="tpv-lb"><span class="nav-icon" data-icon="file-text" data-icon-size="13"></span>字体规范</span>';
    h += '<span class="tpv-font"><b>标题</b>' + TP_esc(f.title || '—') + '</span>';
    h += '<span class="tpv-font"><b>正文</b>' + TP_esc(f.body || '—') + '</span>';
    h += '<span class="tpv-font tpv-font-note"><b>备注</b>' + TP_esc(f.note || '—') + '</span>';
    h += '</div>';

    /* 页面骨架清单 */
    var st = it.structure || [];
    if (st.length) {
      h += '<div class="tpv-sec"><div class="tpv-lb"><span class="nav-icon" data-icon="clipboard-list" data-icon-size="13"></span>页面骨架清单</div>';
      h += '<ol class="tpv-ol">';
      for (i = 0; i < st.length; i++) h += '<li>' + TP_esc(st[i]) + '</li>';
      h += '</ol></div>';
    }

    /* 随堂自测 */
    if (it.practice && it.practice.length) {
      h += '<div class="tpv-sec"><div class="tpv-lb"><span class="nav-icon" data-icon="help-circle" data-icon-size="13"></span>随堂自测（' + it.practice.length + ' 题）</div>';
      h += '<div class="tpv-quiz" data-qid="' + TP_esc(it.id) + '"></div></div>';
    }

    h += '</div>';
    return h;
  }

  /** renderList(el, items)：把 5 套模板卡写入容器并绑定交互。 */
  function TP_renderList(el, items) {
    var h = '';
    for (var i = 0; i < items.length; i++) h += TP_renderItem(items[i]);
    el.innerHTML = h;

    /* 逐张卡渲染自测题 */
    var boxes = el.querySelectorAll('.tpv-quiz');
    for (var k = 0; k < boxes.length; k++) {
      var qid = boxes[k].getAttribute('data-qid');
      var item = TP_findItem(items, qid);
      if (item) TP_renderQuiz(boxes[k], item.practice);
    }

    /* 刷新收藏 / 已学按钮态 */
    for (var m = 0; m < items.length; m++) TP_syncBtns(el, items[m].id);

    /* 事件委托：套用框架 / 收藏 / 标记已学 */
    if (!el.getAttribute('data-bound')) {
      el.setAttribute('data-bound', '1');
      el.addEventListener('click', function (ev) {
        var t = ev.target || ev.srcElement;
        var btn = null;
        while (t && t !== el) {
          if (t.getAttribute && t.getAttribute('data-act')) { btn = t; break; }
          t = t.parentNode;
        }
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        var id = btn.getAttribute('data-id');
        var it = TP_findItem(items, id);
        if (!it) return;
        if (act === 'copy') {
          TplPreview.copySkeleton(it);
        } else if (act === 'fav') {
          var fav = !TP_isFav(id);
          TP_storeSet(LS_PREFIX + id + ':fav', fav ? 1 : 0);
          TP_syncBtns(el, id);
          TP_toast(fav ? '已收藏「' + it.name + '」' : '已取消收藏');
          TP_renderProgress();
        } else if (act === 'learn') {
          var done = !TP_isLearned(id);
          TP_storeSet(LS_PREFIX + id + ':learn', done ? 1 : 0);
          TP_syncBtns(el, id);
          TP_toast(done ? '已标记「' + it.name + '」为已学' : '已取消已学标记');
          TP_renderProgress();
        }
      });
    }
  }

  function TP_isFav(id) { return TP_storeGet(LS_PREFIX + id + ':fav', 0) === 1; }
  function TP_isLearned(id) { return TP_storeGet(LS_PREFIX + id + ':learn', 0) === 1; }

  function TP_syncBtns(root, id) {
    var card = root.querySelector('.tpv-card[data-id="' + id + '"]');
    if (!card) return;
    var fav = card.querySelector('[data-act="fav"]');
    var learn = card.querySelector('[data-act="learn"]');
    if (fav) fav.className = 'tpv-btn' + (TP_isFav(id) ? ' on' : '');
    if (learn) learn.className = 'tpv-btn' + (TP_isLearned(id) ? ' on' : '');
  }

  /* ==================== 自测题 ==================== */

  function TP_renderQuiz(el, quiz) {
    if (!quiz || !quiz.length) return;
    QUIZ_MAP[el.getAttribute('data-qid')] = quiz;
    var h = '';
    for (var i = 0; i < quiz.length; i++) {
      h += '<div class="tpv-q">';
      h += '<div class="tpv-qt"><b>' + (i + 1) + '.</b> ' + TP_esc(quiz[i].q) + '</div>';
      for (var j = 0; j < quiz[i].o.length; j++) {
        h += '<div class="tpv-qo" data-i="' + i + '" data-j="' + j + '">' +
          '<span class="tpv-qk">' + LETTERS[j] + '</span>' + TP_esc(quiz[i].o[j]) + '</div>';
      }
      h += '<div class="tpv-qx" style="display:none"></div>';
      h += '</div>';
    }
    el.innerHTML = h;

    var opts = el.querySelectorAll('.tpv-qo');
    for (var k = 0; k < opts.length; k++) {
      TP_bindOption(opts[k], quiz);
    }
  }

  function TP_bindOption(node, quiz) {
    node.addEventListener('click', function () {
      var i = parseInt(node.getAttribute('data-i'), 10);
      var j = parseInt(node.getAttribute('data-j'), 10);
      var q = quiz[i];
      if (!q) return;
      var wrap = node.parentNode;
      var all = wrap.querySelectorAll('.tpv-qo');
      for (var m = 0; m < all.length; m++) {
        var mj = parseInt(all[m].getAttribute('data-j'), 10);
        var cls = 'tpv-qo';
        if (mj === q.a) cls += ' ok';
        else if (mj === j) cls += ' no';
        all[m].className = cls;
      }
      var x = wrap.querySelector('.tpv-qx');
      if (x) {
        x.innerHTML = (j === q.a
          ? '<b class="tpv-ok">回答正确</b> · '
          : '<b class="tpv-no">再想想</b> · ') + TP_esc(q.x);
        x.style.display = 'block';
      }
    });
  }

  /* ==================== 进度条 ==================== */

  function TP_renderProgress() {
    var data = TP_getData();
    var box = document.getElementById('tpvProg');
    if (!box || !data) return;
    var learned = 0, faved = 0;
    for (var i = 0; i < data.items.length; i++) {
      if (TP_isLearned(data.items[i].id)) learned++;
      if (TP_isFav(data.items[i].id)) faved++;
    }
    var total = data.items.length;
    var pct = total ? Math.round(learned * 100 / total) : 0;
    box.innerHTML =
      '<div class="tpv-prog-t"><span>已学 <b>' + learned + '</b> / ' + total + ' 套</span>' +
      '<span>收藏 <b>' + faved + '</b> 套</span><span>' + TP_esc(data.credit || '') + '</span></div>' +
      '<div class="tpv-prog-bar"><i style="width:' + pct + '%"></i></div>';
  }

  /* ==================== 样式（一次性注入） ==================== */

  var CSS = [
    '.tpv-wrap{max-width:960px;margin:0 auto;color:var(--text,#2D3436)}',
    '.tpv-hero{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06));margin-bottom:14px}',
    '.tpv-hero h3{margin:0 0 6px;font-size:17px;display:flex;align-items:center;gap:8px}',
    '.tpv-hero p{margin:0;font-size:13px;line-height:1.7;color:var(--text-secondary,#636E72)}',
    '.tpv-prog-t{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--text-secondary,#636E72);margin-top:12px}',
    '.tpv-prog-t b{color:var(--text,#2D3436)}',
    '.tpv-prog-bar{height:6px;border-radius:6px;background:var(--border,#E8ECF0);overflow:hidden;margin-top:8px}',
    '.tpv-prog-bar i{display:block;height:100%;background:linear-gradient(90deg,#36CFC9,#5B8DEF);border-radius:6px}',
    '.tpv-card{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px 16px;margin-bottom:14px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.tpv-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}',
    '.tpv-ic{flex:none;width:34px;height:34px;border-radius:10px;background:var(--primary-light,#E6FBFA);color:var(--primary,#36CFC9);display:inline-flex;align-items:center;justify-content:center}',
    '.tpv-hmain{flex:1;min-width:200px}',
    '.tpv-hmain b{font-size:15px;display:block;margin-bottom:4px}',
    '.tpv-sum{font-size:12.5px;line-height:1.65;color:var(--text-secondary,#636E72)}',
    '.tpv-acts{display:flex;gap:6px;flex-wrap:wrap}',
    '.tpv-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border,#E8ECF0);background:var(--bg,#F5F7FA);color:var(--text-secondary,#636E72);border-radius:9px;padding:5px 10px;font-size:12px;cursor:pointer;line-height:1.4}',
    '.tpv-btn em{font-style:normal}',
    '.tpv-btn:hover{border-color:var(--primary,#36CFC9);color:var(--primary,#36CFC9)}',
    '.tpv-btn.on{background:var(--primary-light,#E6FBFA);border-color:var(--primary,#36CFC9);color:var(--primary-dark,#2AB5AF)}',
    '.tpv-btn-p{background:var(--primary,#36CFC9);border-color:var(--primary,#36CFC9);color:#fff}',
    '.tpv-btn-p:hover{background:var(--primary-dark,#2AB5AF);border-color:var(--primary-dark,#2AB5AF);color:#fff}',
    '.tpv-row{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-top:12px;font-size:12.5px}',
    '.tpv-lb{display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary,#636E72);font-size:12px;flex:none}',
    '.tpv-tag{display:inline-block;background:var(--primary-light,#E6FBFA);color:var(--primary-dark,#2AB5AF);border-radius:8px;padding:2px 8px;font-size:12px}',
    '.tpv-frames{display:flex;gap:10px;overflow-x:auto;padding:2px 0 6px;margin-top:6px}',
    '.tpv-f{flex:0 0 176px}',
    '.tpv-canvas{position:relative;width:100%;height:0;padding-top:56.25%;border:1px solid;border-radius:4px;overflow:hidden}',
    '.tpv-b{display:block}',
    '.tpv-t{display:block;word-break:break-all;overflow:hidden}',
    '.tpv-fname{margin-top:6px;font-size:12px;font-weight:600}',
    '.tpv-fcap{margin-top:2px;font-size:11px;line-height:1.5;color:var(--text-secondary,#636E72)}',
    '.tpv-sw{display:inline-flex;align-items:center;gap:5px;margin-right:10px}',
    '.tpv-sw-d{width:22px;height:22px;border-radius:6px;border:1px solid;display:inline-block}',
    '.tpv-sw-t{font-size:11.5px;color:var(--text-secondary,#636E72)}',
    '.tpv-sw-t b{color:var(--text,#2D3436);margin-right:4px}',
    '.tpv-fontrow .tpv-font{display:inline-block;background:var(--bg,#F5F7FA);border-radius:8px;padding:3px 9px;font-size:11.5px;color:var(--text-secondary,#636E72);margin-right:6px}',
    '.tpv-fontrow .tpv-font b{color:var(--text,#2D3436);margin-right:4px}',
    '.tpv-sec{margin-top:14px;border-top:1px solid var(--border,#E8ECF0);padding-top:12px}',
    '.tpv-sec .tpv-lb{margin-bottom:8px}',
    '.tpv-ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.85;color:var(--text,#2D3436)}',
    '.tpv-q{margin-bottom:12px}',
    '.tpv-qt{font-size:13px;line-height:1.6;margin-bottom:6px}',
    '.tpv-qo{border:1px solid var(--border,#E8ECF0);border-radius:9px;padding:7px 10px;font-size:12.5px;margin-bottom:5px;cursor:pointer;background:var(--bg,#F5F7FA);display:flex;gap:7px;align-items:flex-start}',
    '.tpv-qo:hover{border-color:var(--primary,#36CFC9)}',
    '.tpv-qk{flex:none;width:18px;height:18px;border-radius:5px;background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);font-size:11px;display:inline-flex;align-items:center;justify-content:center;color:var(--text-secondary,#636E72)}',
    '.tpv-qo.ok{border-color:#2E7D32;background:#E8F5E9}',
    '.tpv-qo.ok .tpv-qk{background:#2E7D32;color:#fff;border-color:#2E7D32}',
    '.tpv-qo.no{border-color:#C62828;background:#FDECEA}',
    '.tpv-qo.no .tpv-qk{background:#C62828;color:#fff;border-color:#C62828}',
    '.tpv-qx{margin-top:4px;font-size:12px;line-height:1.7;color:var(--text-secondary,#636E72);background:var(--bg,#F5F7FA);border-radius:9px;padding:8px 10px}',
    '.tpv-ok{color:#2E7D32}',
    '.tpv-no{color:#C62828}',
    '.tpv-guide{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,.06))}',
    '.tpv-guide h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:7px}',
    '.tpv-guide p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--text-secondary,#636E72)}',
    '.tpv-guide ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.9}',
    '.tpv-empty{padding:30px;text-align:center;color:var(--text-secondary,#636E72);font-size:13px}'
  ].join('\n');

  function TP_injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') {
      st.styleSheet.cssText = CSS;
    } else {
      st.appendChild(document.createTextNode(CSS));
    }
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 对外接口 ==================== */

  var TplPreview = {
    /**
     * 渲染模板卡列表。
     * @param {HTMLElement} el    容器
     * @param {Array}       items 模板数组
     */
    renderList: function (el, items) {
      if (!el) return;
      TP_renderList(el, items || []);
    },

    /**
     * 渲染单帧骨架，返回 HTML 字符串。
     * @param {Object} frame   {name, layout, blocks}
     * @param {Object} palette {main, accent, bg, text}
     * @param {Object} font    {title, body, note}
     * @param {string} shape   'sharp' | 'round' | 'pill'
     * @return {string}
     */
    renderFrame: function (frame, palette, font, shape) {
      return TP_renderFrame(frame, palette, font, shape);
    },

    /**
     * 「套用框架」：把白名单消毒后的 HTML 骨架写入剪贴板。
     * @param {Object} item 模板对象
     */
    copySkeleton: function (item) {
      if (!item) return;
      var raw = item.skeleton ? String(item.skeleton) : '';
      if (!raw) { TP_toast('该模板暂未提供骨架代码'); return; }
      var clean = TP_sanitize(raw);
      TP_copyText(clean, function (ok) {
        if (ok) TP_toast('骨架已复制（' + clean.length + ' 字符），粘贴到 HTML 后替换文字即可');
        else TP_toast('复制失败，请长按选择后手动复制');
      });
    }
  };

  window.TplPreview = TplPreview;

  /* ==================== 注册到 PPTV2 ==================== */

  window.PPTV2[DATA_KEY] = function (slotEl) {
    if (!slotEl) return;
    TP_injectStyle();

    var data = TP_getData();
    if (!data) {
      slotEl.innerHTML = '<div class="tpv-empty">模板数据未加载（请确认 data-ppt-templates.js 已在 mini-ppt.js 之后引入）</div>';
      return;
    }

    var html = '';
    html += '<div class="tpv-wrap">';
    html += '<div class="tpv-hero">';
    html += '<h3><span class="nav-icon" data-icon="package" data-icon-size="18"></span>' + TP_esc(data.t || 'PPT · 实战模板库') + '</h3>';
    html += '<p>' + TP_esc('每套模板含 5 帧骨架预览（封面 / 目录 / 内容双栏 / 数据页 / 结束页）、配色与字体规范、页面骨架清单和随堂自测。点「套用框架」可直接复制 HTML 骨架。') + '</p>';
    html += '<div id="tpvProg"></div>';
    html += '</div>';
    html += '<div id="tpvList"></div>';
    if (data.guide) {
      html += '<div class="tpv-guide">';
      html += '<h4><span class="nav-icon" data-icon="' + TP_esc(data.guide.icon || 'lightbulb') + '" data-icon-size="16"></span>' + TP_esc(data.guide.title || '使用建议') + '</h4>';
      html += '<p>' + TP_esc(data.guide.body || '') + '</p>';
      html += '<ol>';
      var steps = data.guide.steps || [];
      for (var i = 0; i < steps.length; i++) html += '<li>' + TP_esc(steps[i]) + '</li>';
      html += '</ol></div>';
    }
    html += '</div>';
    slotEl.innerHTML = html;

    TplPreview.renderList(document.getElementById('tpvList'), data.items);
    TP_renderProgress();

    /* F9：icon-map 的 [data-icon] 扫描只在 DOMContentLoaded 跑一次，动态渲染后必须补扫 */
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e) { /* 图标缺失不影响内容 */ }
    }
  };
})();

/* =====================================================================
   tpl-preview.js · B2 / N9-12「PPT版式库升级」渲染器（v3）
   批次：2026-09-16 / 版本戳 20260916（本波不 bump）
   ---------------------------------------------------------------------
   独立 IIFE，**不改动上面 A7「实战模板库」渲染器的任何字节**。
   数据来源：window.MINI_BANK['ppt-layout-lib']（assets/data-ppt-templates.js）
   对外接口：
     · window.XtPptLib.mount(rootEl)   —— 把版式库完整 UI 渲染进 rootEl
     · window.PPTV2['ppt-layout-lib'] —— 与 A7 同构的注册方式，供分发器调用
   需求对应（《需求文档-PPT版式库升级-豆包-20260915.md》）：
     · 第二行分类页签：全部 / 封面页 / 目录页 / 过渡页 / 内容页 / ⭐我的收藏
     · 搜索框：实时过滤，匹配 名称 + 适用场景 + 设计要点，不区分大小写
     · 卡片 4 层：预览图 → 名称 → 适用场景(最多2行) → 三按钮(收藏/预览/下载)
     · 预览遮罩层：✕ / 点空白 / ESC 三种关闭；左侧大图（占位降级），
       右侧适用场景 + 设计要点；底部下载 / 收藏 / 返回
     · 收藏：localStorage['ppt_favorites']（字符串数组），读取失败默认全未收藏
     · 下载：pptFile 为 null → 按钮置灰显示「制作中」，不可点击、不弹窗
     · 全程无 alert / confirm / prompt
  图片策略（重点）：
     · previewImage 为空 → 走内联 SVG 占位骨架（按 item.ph 画不同版式示意图），
       绝不引用 assets/images/ppt-templates/ 下不存在的文件，零 404。
     · 真图补上后：把数据里 previewImage 填成真实路径即可，渲染器自动改用 <img>。
  语法：ES5（不用箭头函数 / 可选链 / 模板字符串 / 对象展开）。
   ===================================================================== */
(function () {
  'use strict';

  var LIB_KEY = 'ppt-layout-lib';
  var LIB_STYLE_ID = 'xt-pptlib-style';
  var FAV_LS_KEY = 'ppt_favorites';
  var MODAL_ID = 'xtPptLibModal';
  var CAT_ALL = '全部';
  var CAT_FAV = '⭐ 我的收藏';
  var PH_W = 320;   /* 占位骨架 viewBox 宽 */
  var PH_H = 180;   /* 占位骨架 viewBox 高（16:9） */

  /* 渲染上下文（每次 mount 重置） */
  var CTX = {
    root: null,      /* 挂载根 (.xtpl-wrap) */
    items: [],       /* 全量数据 */
    cat: CAT_ALL,    /* 当前分类页签 */
    kw: '',          /* 当前搜索词（小写） */
    bound: false     /* 是否已绑定根级事件 */
  };

  /* ==================== 极简 helper（Xt_ 前缀，零全局污染） ==================== */

  function Xt_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 校验并规范化 hex 颜色，非法值回退 fallback。 */
  function Xt_color(hex, fallback) {
    var h = String(hex || '').replace('#', '').replace(/\s/g, '');
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
    return '#' + h.toUpperCase();
  }

  /** hex → rgba 字符串。 */
  function Xt_rgba(hex, a) {
    var h = String(Xt_color(hex, '#000000')).replace('#', '');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /** 轻提示：优先 window.xtToast，逐级回退；找不到载体时静默（绝不 alert）。 */
  function Xt_toast(msg) {
    try {
      if (typeof window.xtToast === 'function') { window.xtToast('info', msg); return; }
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      var t = document.getElementById('toast');
      if (t) {
        t.textContent = msg;
        t.className = 'toast show';
        window.setTimeout(function () { t.className = 'toast'; }, 2200);
      }
    } catch (e) { /* 提示失败不影响功能 */ }
  }

  /** localStorage 前缀化（复用宿主 lsKey，不存在时原样返回）。 */
  function Xt_lsKey(k) {
    return typeof window.lsKey === 'function' ? window.lsKey(k) : k;
  }

  /** 读取收藏数组；任何异常都回退为空数组（需求：读取失败默认全未收藏）。 */
  function Xt_getFav() {
    try {
      var raw = window.localStorage.getItem(Xt_lsKey(FAV_LS_KEY));
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!arr || typeof arr.length !== 'number') return [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (typeof arr[i] === 'string') out.push(arr[i]);
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  function Xt_isFav(id) {
    return Xt_getFav().indexOf(id) !== -1;
  }

  /** 写入收藏状态，返回写入后的布尔值（true=已收藏）。 */
  function Xt_toggleFav(id) {
    var arr = Xt_getFav();
    var idx = arr.indexOf(id);
    var nowFav;
    if (idx === -1) { arr.push(id); nowFav = true; }
    else { arr.splice(idx, 1); nowFav = false; }
    try {
      window.localStorage.setItem(Xt_lsKey(FAV_LS_KEY), JSON.stringify(arr));
    } catch (e) { /* 写失败不影响本次交互 */ }
    return nowFav;
  }

  function Xt_getData() {
    var bank = window.MINI_BANK;
    if (!bank) return null;
    var d = bank[LIB_KEY];
    if (!d || !d.items || !d.items.length) return null;
    return d;
  }

  /* ==================== 内联 SVG 占位骨架（16:9 版式示意） ==================== */

  function Xt_bar(x, y, w, h, fill, rx) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" rx="' + (rx || 2) + '" fill="' + fill + '"/>';
  }

  /**
   * 按占位骨架键绘制版式示意图（纯内联 SVG，无外链）。
   * 所有元素使用 viewBox 0 0 320 180，自适应容器宽度。
   * @param {string} ph      占位骨架键，见 data-ppt-templates.js 各 item.ph
   * @param {Object} palette {main, accent, bg, text}
   * @return {string} <svg>…</svg>
   */
  function Xt_placeholderSvg(ph, palette) {
    var pal = palette || {};
    var main = Xt_color(pal.main, '#5B8DEF');
    var accent = Xt_color(pal.accent, '#36CFC9');
    var bg = Xt_color(pal.bg, '#FFFFFF');
    var text = Xt_color(pal.text, '#333333');
    var line = Xt_rgba(text, 0.22);
    var lineLight = Xt_rgba(text, 0.12);
    var tintMain = Xt_rgba(main, 0.14);
    var tintAcc = Xt_rgba(accent, 0.18);

    var body = '';
    switch (ph) {
      case 'cover-center':
        body = Xt_bar(0, 0, 320, 180, main, 0) +
          Xt_bar(70, 62, 180, 14, '#FFFFFF', 3) +
          Xt_bar(100, 86, 120, 7, Xt_rgba('#FFFFFF', 0.7), 2) +
          Xt_bar(130, 104, 60, 4, accent, 2) +
          Xt_bar(120, 140, 80, 4, Xt_rgba('#FFFFFF', 0.5), 2);
        break;
      case 'cover-left':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(36, 56, 150, 14, main, 3) +
          Xt_bar(36, 80, 110, 7, line, 2) +
          Xt_bar(36, 96, 60, 3, accent, 2) +
          Xt_bar(36, 140, 90, 4, lineLight, 2);
        break;
      case 'cover-dark':
        body = Xt_bar(0, 0, 320, 180, main, 0) +
          Xt_bar(30, 66, 200, 16, '#FFFFFF', 3) +
          Xt_bar(30, 92, 150, 7, Xt_rgba('#FFFFFF', 0.72), 2) +
          Xt_bar(30, 140, 44, 10, accent, 3) +
          Xt_bar(84, 143, 120, 4, Xt_rgba('#FFFFFF', 0.4), 2);
        break;
      case 'cover-rule':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(28, 30, 70, 5, Xt_rgba(main, 0.4), 2) +
          Xt_bar(40, 68, 170, 14, main, 3) +
          Xt_bar(40, 94, 240, 2, accent, 1) +
          Xt_bar(40, 108, 120, 7, line, 2) +
          Xt_bar(40, 146, 70, 4, lineLight, 2);
        break;
      case 'toc-number':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(28, 22, 60, 8, main, 3) +
          Xt_bar(28, 38, 30, 3, accent, 2) +
          Xt_bar(28, 60, 18, 12, tintMain, 3) + Xt_bar(54, 63, 170, 5, line, 2) +
          Xt_bar(28, 86, 18, 12, tintMain, 3) + Xt_bar(54, 89, 150, 5, line, 2) +
          Xt_bar(28, 112, 18, 12, tintMain, 3) + Xt_bar(54, 115, 180, 5, line, 2) +
          Xt_bar(28, 138, 18, 12, tintMain, 3) + Xt_bar(54, 141, 130, 5, line, 2);
        break;
      case 'toc-twocol':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(28, 22, 60, 8, main, 3) +
          Xt_bar(28, 38, 30, 3, accent, 2) +
          Xt_bar(28, 64, 14, 10, tintMain, 2) + Xt_bar(48, 66, 96, 5, line, 2) +
          Xt_bar(28, 92, 14, 10, tintMain, 2) + Xt_bar(48, 94, 80, 5, line, 2) +
          Xt_bar(28, 120, 14, 10, tintMain, 2) + Xt_bar(48, 122, 90, 5, line, 2) +
          Xt_bar(176, 64, 14, 10, tintMain, 2) + Xt_bar(196, 66, 96, 5, line, 2) +
          Xt_bar(176, 92, 14, 10, tintMain, 2) + Xt_bar(196, 94, 80, 5, line, 2) +
          Xt_bar(176, 120, 14, 10, tintMain, 2) + Xt_bar(196, 122, 90, 5, line, 2);
        break;
      case 'toc-sidebar':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(0, 0, 92, 180, main, 0) +
          Xt_bar(16, 30, 56, 6, '#FFFFFF', 2) +
          Xt_bar(16, 52, 60, 5, Xt_rgba('#FFFFFF', 0.85), 2) +
          Xt_bar(16, 76, 50, 5, Xt_rgba('#FFFFFF', 0.7), 2) +
          Xt_bar(16, 100, 54, 5, Xt_rgba('#FFFFFF', 0.7), 2) +
          Xt_bar(16, 124, 44, 5, Xt_rgba('#FFFFFF', 0.55), 2) +
          Xt_bar(120, 60, 170, 6, line, 2) +
          Xt_bar(120, 78, 140, 6, line, 2) +
          Xt_bar(120, 96, 160, 6, lineLight, 2);
        break;
      case 'section-big':
        body = Xt_bar(0, 0, 320, 180, main, 0) +
          Xt_bar(30, 48, 60, 30, Xt_rgba('#FFFFFF', 0.24), 4) +
          Xt_bar(30, 96, 170, 14, '#FFFFFF', 3) +
          Xt_bar(30, 122, 44, 4, accent, 2);
        break;
      case 'section-band':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(0, 62, 320, 56, main, 0) +
          Xt_bar(40, 80, 150, 12, '#FFFFFF', 3) +
          Xt_bar(40, 100, 60, 4, accent, 2);
        break;
      case 'section-left':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(30, 50, 58, 34, tintMain, 5) +
          Xt_bar(104, 58, 150, 11, main, 3) +
          Xt_bar(104, 80, 180, 5, line, 2) +
          Xt_bar(104, 96, 140, 4, lineLight, 2) +
          Xt_bar(96, 50, 2, 84, Xt_rgba(main, 0.3), 1);
        break;
      case 'content-lr':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(24, 24, 90, 9, main, 3) +
          Xt_bar(24, 42, 34, 3, accent, 2) +
          Xt_bar(24, 62, 116, 4, line, 2) +
          Xt_bar(24, 78, 100, 4, line, 2) +
          Xt_bar(24, 94, 110, 4, line, 2) +
          Xt_bar(24, 110, 88, 4, lineLight, 2) +
          Xt_bar(160, 30, 136, 120, tintMain, 5) +
          Xt_bar(196, 70, 64, 40, tintAcc, 4);
        break;
      case 'content-3col':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(24, 20, 80, 8, main, 3) +
          Xt_bar(22, 46, 82, 112, tintMain, 5) +
          Xt_bar(119, 46, 82, 112, Xt_rgba(accent, 0.16), 5) +
          Xt_bar(216, 46, 82, 112, Xt_rgba(main, 0.09), 5) +
          Xt_bar(40, 60, 46, 6, main, 2) + Xt_bar(34, 78, 58, 3, line, 2) + Xt_bar(34, 88, 50, 3, line, 2) +
          Xt_bar(137, 60, 46, 6, accent, 2) + Xt_bar(131, 78, 58, 3, line, 2) + Xt_bar(131, 88, 50, 3, line, 2) +
          Xt_bar(234, 60, 46, 6, main, 2) + Xt_bar(228, 78, 58, 3, line, 2) + Xt_bar(228, 88, 50, 3, line, 2);
        break;
      case 'content-grid':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(24, 18, 80, 8, main, 3) +
          Xt_bar(24, 40, 130, 60, tintMain, 5) +
          Xt_bar(166, 40, 130, 60, Xt_rgba(accent, 0.16), 5) +
          Xt_bar(24, 110, 130, 60, Xt_rgba(accent, 0.16), 5) +
          Xt_bar(166, 110, 130, 60, tintMain, 5) +
          Xt_bar(38, 52, 40, 5, main, 2) + Xt_bar(38, 66, 70, 3, line, 2) +
          Xt_bar(180, 52, 40, 5, main, 2) + Xt_bar(180, 66, 70, 3, line, 2) +
          Xt_bar(38, 122, 40, 5, main, 2) + Xt_bar(38, 136, 70, 3, line, 2) +
          Xt_bar(180, 122, 40, 5, main, 2) + Xt_bar(180, 136, 70, 3, line, 2);
        break;
      case 'content-timeline':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(24, 22, 90, 8, main, 3) +
          Xt_bar(34, 88, 252, 3, line, 1) +
          '<circle cx="60" cy="89" r="8" fill="' + main + '"/>' +
          '<circle cx="140" cy="89" r="8" fill="' + accent + '"/>' +
          '<circle cx="220" cy="89" r="8" fill="' + Xt_rgba(main, 0.4) + '"/>' +
          Xt_bar(40, 106, 40, 4, main, 2) + Xt_bar(40, 116, 50, 3, line, 2) +
          Xt_bar(120, 106, 40, 4, main, 2) + Xt_bar(120, 116, 50, 3, line, 2) +
          Xt_bar(200, 106, 40, 4, main, 2) + Xt_bar(200, 116, 50, 3, line, 2);
        break;
      case 'content-chart':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(24, 20, 150, 8, main, 3) +
          Xt_bar(24, 36, 40, 3, accent, 2) +
          Xt_bar(24, 56, 180, 108, Xt_rgba(text, 0.05), 4) +
          Xt_bar(44, 110, 18, 40, main, 3) +
          Xt_bar(72, 92, 18, 58, main, 3) +
          Xt_bar(100, 74, 18, 76, accent, 3) +
          Xt_bar(128, 100, 18, 50, main, 3) +
          Xt_bar(156, 84, 18, 66, main, 3) +
          Xt_bar(220, 60, 80, 6, line, 2) +
          Xt_bar(220, 76, 70, 4, lineLight, 2) +
          Xt_bar(220, 90, 74, 4, lineLight, 2) +
          Xt_bar(220, 120, 80, 24, tintAcc, 4);
        break;
      case 'content-compare':
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(22, 22, 130, 136, tintMain, 5) +
          Xt_bar(168, 22, 130, 136, Xt_rgba(accent, 0.16), 5) +
          Xt_bar(38, 38, 46, 6, main, 2) +
          Xt_bar(38, 56, 100, 4, line, 2) + Xt_bar(38, 70, 86, 4, line, 2) + Xt_bar(38, 84, 96, 4, line, 2) +
          Xt_bar(184, 38, 46, 6, main, 2) +
          Xt_bar(184, 56, 100, 4, line, 2) + Xt_bar(184, 70, 86, 4, line, 2) + Xt_bar(184, 84, 96, 4, line, 2) +
          '<circle cx="160" cy="90" r="13" fill="#FFFFFF" stroke="' + line + '" stroke-width="1.5"/>' +
          '<text x="160" y="94" text-anchor="middle" font-size="10" fill="' + text + '">VS</text>';
        break;
      default:
        /* 未知 ph：画一张通用"标题 + 正文 + 配图"示意，保证不空白 */
        body = Xt_bar(0, 0, 320, 180, bg, 0) +
          Xt_bar(24, 24, 100, 10, main, 3) +
          Xt_bar(24, 44, 40, 3, accent, 2) +
          Xt_bar(24, 66, 120, 4, line, 2) +
          Xt_bar(24, 82, 104, 4, line, 2) +
          Xt_bar(24, 98, 112, 4, lineLight, 2) +
          Xt_bar(180, 40, 116, 110, tintMain, 5);
        break;
    }

    return '<svg class="xtpl-ph-svg" viewBox="0 0 ' + PH_W + ' ' + PH_H + '" ' +
      'preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="版式占位示意图">' + body + '</svg>';
  }

  /**
   * 预览图区域：有 previewImage 用 <img>；为空或加载失败 → 内联 SVG 占位。
   * 供卡片与预览大图共用；大图模式用 mode='large' 调样式。
   */
  function Xt_previewBox(it, mode) {
    var cls = 'xtpl-pv' + (mode === 'large' ? ' xtpl-pv-lg' : '');
    var src = it.previewImage ? String(it.previewImage) : '';
    if (src) {
      /* 真图存在时才输出 img；onerror 回退占位（data-ph 由事件委托处理） */
      return '<div class="' + cls + '">' +
        '<img class="xtpl-pv-img" src="' + Xt_esc(src) + '" alt="' + Xt_esc(it.name) + '" ' +
        'data-ph="' + Xt_esc(it.ph || '') + '" data-id="' + Xt_esc(it.id) + '">' +
        '</div>';
    }
    return '<div class="' + cls + '" data-ph="' + Xt_esc(it.ph || '') + '" data-id="' + Xt_esc(it.id) + '">' +
      Xt_placeholderSvg(it.ph, it.palette) + '</div>';
  }

  /* ==================== 过滤 ==================== */

  function Xt_matchKw(it, kw) {
    if (!kw) return true;
    var hay = (it.name || '') + ' ' + (it.useCase || '') + ' ' +
      ((it.designPoints || []).join(' '));
    return hay.toLowerCase().indexOf(kw) !== -1;
  }

  function Xt_filtered() {
    var out = [];
    var favs = Xt_getFav();
    for (var i = 0; i < CTX.items.length; i++) {
      var it = CTX.items[i];
      if (CTX.cat === CAT_FAV) {
        if (favs.indexOf(it.id) === -1) continue;
      } else if (CTX.cat !== CAT_ALL) {
        if (it.category !== CTX.cat) continue;
      }
      if (!Xt_matchKw(it, CTX.kw)) continue;
      out.push(it);
    }
    return out;
  }

  /* ==================== 卡片渲染 ==================== */

  function Xt_renderCard(it) {
    var fav = Xt_isFav(it.id);
    var hasFile = !!it.pptFile;
    var dl = hasFile
      ? '<a class="xtpl-btn xtpl-btn-dl" href="' + Xt_esc(it.pptFile) + '" download="' +
          Xt_esc(Xt_fileName(it)) + '">' +
          '<span class="nav-icon" data-icon="download" data-icon-size="14"></span><em>下载</em></a>'
      : '<button type="button" class="xtpl-btn xtpl-btn-dl xtpl-btn-dis" disabled ' +
          'title="该版式暂未提供 .pptx 文件">' +
          '<span class="nav-icon" data-icon="download" data-icon-size="14"></span><em>制作中</em></button>';

    var h = '';
    h += '<div class="xtpl-card" data-id="' + Xt_esc(it.id) + '">';
    h += Xt_previewBox(it, 'card');
    h += '<div class="xtpl-name">' + Xt_esc(it.name) + '</div>';
    h += '<div class="xtpl-usecase">' + Xt_esc(it.useCase || '') + '</div>';
    h += '<div class="xtpl-acts">';
    h += '<button type="button" class="xtpl-btn xtpl-btn-fav' + (fav ? ' on' : '') + '" ' +
      'data-act="fav" data-id="' + Xt_esc(it.id) + '" ' +
      'title="' + (fav ? '取消收藏' : '收藏此版式') + '" aria-pressed="' + (fav ? 'true' : 'false') + '">' +
      '<span class="nav-icon" data-icon="star" data-icon-size="14"></span><em>' + (fav ? '已收藏' : '收藏') + '</em></button>';
    h += '<button type="button" class="xtpl-btn" data-act="preview" data-id="' + Xt_esc(it.id) + '">' +
      '<span class="nav-icon" data-icon="eye" data-icon-size="14"></span><em>预览</em></button>';
    h += dl;
    h += '</div>';
    h += '</div>';
    return h;
  }

  function Xt_fileName(it) {
    if (it.pptFile) {
      var parts = String(it.pptFile).split('/');
      return parts[parts.length - 1] || (it.name + '.pptx');
    }
    return (it.name || 'template') + '.pptx';
  }

  /* ==================== 空状态 ==================== */

  function Xt_emptyHtml() {
    var isFav = CTX.cat === CAT_FAV;
    var msg = isFav ? '还没有收藏的版式，去逛逛吧' : '未找到匹配的版式，换个关键词试试';
    var btn = isFav
      ? '<button type="button" class="xtpl-btn xtpl-btn-p" data-act="gotoall">查看全部版式</button>'
      : '<button type="button" class="xtpl-btn" data-act="clear">清空搜索</button>';
    var icon = isFav ? 'inbox' : 'search';
    return '<div class="xtpl-empty">' +
      '<span class="nav-icon xtpl-empty-ic" data-icon="' + icon + '" data-icon-size="34"></span>' +
      '<div class="xtpl-empty-t">' + Xt_esc(msg) + '</div>' +
      '<div class="xtpl-empty-a">' + btn + '</div>' +
      '</div>';
  }

  /* ==================== 列表 / 页签重绘 ==================== */

  function Xt_renderChips() {
    var data = Xt_getData();
    var cats = (data && data.cats) ? data.cats : ['封面页', '目录页', '过渡页', '内容页'];
    var list = [CAT_ALL].concat(cats).concat([CAT_FAV]);
    var h = '<div class="xtpl-chips">';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      h += '<button type="button" class="xtpl-chip' + (c === CTX.cat ? ' on' : '') + '" ' +
        'data-act="cat" data-val="' + Xt_esc(c) + '">' + Xt_esc(c) + '</button>';
    }
    h += '</div>';
    return h;
  }

  function Xt_renderList() {
    var listEl = CTX.root ? CTX.root.querySelector('.xtpl-list') : null;
    if (!listEl) return;
    var arr = Xt_filtered();
    var h = '';
    if (!arr.length) {
      h = Xt_emptyHtml();
    } else {
      h = '<div class="xtpl-grid">';
      for (var i = 0; i < arr.length; i++) h += Xt_renderCard(arr[i]);
      h += '</div>';
    }
    listEl.innerHTML = h;
    Xt_renderCount(arr.length);
    if (window.lucideAutoRender) { try { window.lucideAutoRender(); } catch (e) { /* 图标缺失不阻塞 */ } }
  }

  function Xt_renderCount(n) {
    var el = CTX.root ? CTX.root.querySelector('.xtpl-count') : null;
    if (!el) return;
    var total = CTX.items.length;
    var favs = Xt_getFav().length;
    el.innerHTML = '<span>当前显示 <b>' + n + '</b> / ' + total + ' 种</span>' +
      '<span>已收藏 <b>' + favs + '</b> 种</span>';
  }

  /* ==================== 预览遮罩层 ==================== */

  function Xt_ensureModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) return m;
    m = document.createElement('div');
    m.id = MODAL_ID;
    m.className = 'xtpl-modal';
    m.innerHTML =
      '<div class="xtpl-modal-mask" data-act="close"></div>' +
      '<div class="xtpl-modal-box" role="dialog" aria-modal="true">' +
        '<div class="xtpl-modal-head">' +
          '<div class="xtpl-modal-title"></div>' +
          '<button type="button" class="xtpl-modal-x" data-act="close" title="关闭" aria-label="关闭">' +
            '<span class="nav-icon" data-icon="close" data-icon-size="16"></span></button>' +
        '</div>' +
        '<div class="xtpl-modal-body">' +
          '<div class="xtpl-modal-media"></div>' +
          '<div class="xtpl-modal-side">' +
            '<div class="xtpl-side-lb"><span class="nav-icon" data-icon="target" data-icon-size="13"></span>适用场景</div>' +
            '<div class="xtpl-side-uc"></div>' +
            '<div class="xtpl-side-lb"><span class="nav-icon" data-icon="check-circle" data-icon-size="13"></span>设计要点</div>' +
            '<div class="xtpl-side-pts"></div>' +
          '</div>' +
        '</div>' +
        '<div class="xtpl-modal-foot">' +
          '<span class="xtpl-foot-dl"></span>' +
          '<button type="button" class="xtpl-btn xtpl-btn-fav" data-act="mfav" data-id="">' +
            '<span class="nav-icon" data-icon="star" data-icon-size="14"></span><em>收藏</em></button>' +
          '<button type="button" class="xtpl-btn" data-act="close"><em>← 返回</em></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    /* 关闭：点遮罩空白（data-act=close）才关；点白色内容面板不关 */
    m.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      var act = t && t.getAttribute ? t.getAttribute('data-act') : null;
      if (act === 'close') { Xt_closeModal(); return; }
      if (act === 'mfav') { Xt_modalFav(t); return; }
    });

    /* ESC 关闭 */
    if (!window.__xtPptLibEscBound) {
      window.__xtPptLibEscBound = true;
      document.addEventListener('keydown', function (ev) {
        var k = ev.key || ev.keyCode;
        if ((k === 'Escape' || k === 'Esc' || k === 27)) {
          var cur = document.getElementById(MODAL_ID);
          if (cur && cur.className.indexOf('show') !== -1) Xt_closeModal();
        }
      });
    }
    return m;
  }

  function Xt_find(id) {
    for (var i = 0; i < CTX.items.length; i++) {
      if (CTX.items[i].id === id) return CTX.items[i];
    }
    return null;
  }

  function Xt_openModal(id) {
    var it = Xt_find(id);
    if (!it) return;
    var m = Xt_ensureModal();
    m.querySelector('.xtpl-modal-title').textContent = it.name || '';
    m.querySelector('.xtpl-modal-media').innerHTML = Xt_previewBox(it, 'large');
    m.querySelector('.xtpl-side-uc').textContent = it.useCase || '—';
    var pts = it.designPoints || [];
    var ph = '';
    for (var i = 0; i < pts.length; i++) {
      ph += '<div class="xtpl-side-pt"><span class="xtpl-dot"></span>' + Xt_esc(pts[i]) + '</div>';
    }
    m.querySelector('.xtpl-side-pts').innerHTML = ph || '<div class="xtpl-side-pt">—</div>';

    /* 底部按钮 */
    var favBtn = m.querySelector('[data-act="mfav"]');
    favBtn.setAttribute('data-id', it.id);
    Xt_paintModalFav(favBtn, it.id);

    var dlBox = m.querySelector('.xtpl-foot-dl');
    if (it.pptFile) {
      dlBox.innerHTML = '<a class="xtpl-btn xtpl-btn-dl" href="' + Xt_esc(it.pptFile) + '" download="' +
        Xt_esc(Xt_fileName(it)) + '">' +
        '<span class="nav-icon" data-icon="download" data-icon-size="14"></span><em>下载模板</em></a>';
    } else {
      dlBox.innerHTML = '<button type="button" class="xtpl-btn xtpl-btn-dl xtpl-btn-dis" disabled>' +
        '<span class="nav-icon" data-icon="download" data-icon-size="14"></span><em>制作中</em></button>';
    }

    m.className = 'xtpl-modal show';
    if (window.lucideAutoRender) { try { window.lucideAutoRender(); } catch (e) { /* 图标缺失不阻塞 */ } }
  }

  function Xt_paintModalFav(btn, id) {
    var fav = Xt_isFav(id);
    btn.className = 'xtpl-btn xtpl-btn-fav' + (fav ? ' on' : '');
    var em = btn.querySelector('em');
    if (em) em.textContent = fav ? '已收藏' : '收藏';
    btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
  }

  function Xt_modalFav(btn) {
    var id = btn.getAttribute('data-id');
    if (!id) return;
    var nowFav = Xt_toggleFav(id);
    Xt_paintModalFav(btn, id);
    Xt_toast(nowFav ? '已收藏' : '已取消收藏');
    Xt_renderList(); /* 若当前在「我的收藏」页签，立即刷新列表 */
  }

  function Xt_closeModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.className = 'xtpl-modal';
  }

  /* ==================== 事件绑定（根级委托，绑一次） ==================== */

  function Xt_bindRoot() {
    if (CTX.bound || !CTX.root) return;
    CTX.bound = true;

    CTX.root.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      var node = t;
      while (node && node !== CTX.root && !(node.getAttribute && node.getAttribute('data-act'))) {
        node = node.parentNode;
      }
      var act = (node && node.getAttribute) ? node.getAttribute('data-act') : null;
      if (!act) {
        /* 点卡片预览图 = 点「预览」按钮（需求 二.第1层） */
        var pv = t;
        while (pv && pv !== CTX.root && !(pv.getAttribute && pv.getAttribute('data-id') &&
          (pv.className || '').indexOf('xtpl-pv') !== -1)) {
          pv = pv.parentNode;
        }
        if (pv && pv.className && (' ' + pv.className + ' ').indexOf(' xtpl-pv ') !== -1 &&
            (' ' + pv.className + ' ').indexOf(' xtpl-pv-lg ') === -1) {
          Xt_openModal(pv.getAttribute('data-id'));
        }
        return;
      }
      if (act === 'cat') {
        CTX.cat = node.getAttribute('data-val') || CAT_ALL;
        Xt_renderChipsInto();
        Xt_renderList();
      } else if (act === 'fav') {
        var id = node.getAttribute('data-id');
        if (!id) return;
        var nowFav = Xt_toggleFav(id);
        /* 就地更新按钮态，避免整列表重绘丢滚动位置 */
        node.className = 'xtpl-btn xtpl-btn-fav' + (nowFav ? ' on' : '');
        var em = node.querySelector('em');
        if (em) em.textContent = nowFav ? '已收藏' : '收藏';
        node.setAttribute('aria-pressed', nowFav ? 'true' : 'false');
        node.setAttribute('title', nowFav ? '取消收藏' : '收藏此版式');
        Xt_toast(nowFav ? '已收藏' : '已取消收藏');
        Xt_renderCount(Xt_filtered().length);
        /* 在「我的收藏」页签下取消收藏 → 该卡立即消失 */
        if (CTX.cat === CAT_FAV) Xt_renderList();
      } else if (act === 'preview') {
        Xt_openModal(node.getAttribute('data-id'));
      } else if (act === 'gotoall') {
        CTX.cat = CAT_ALL;
        Xt_renderChipsInto();
        Xt_renderList();
      } else if (act === 'clear') {
        CTX.kw = '';
        var inp = CTX.root.querySelector('.xtpl-search-input');
        if (inp) inp.value = '';
        Xt_renderList();
      }
    });

    /* 搜索：实时过滤（oninput） */
    var si = CTX.root.querySelector('.xtpl-search-input');
    if (si) {
      si.addEventListener('input', function () {
        CTX.kw = String(si.value || '').toLowerCase().replace(/^\s+|\s+$/g, '');
        Xt_renderList();
      });
      si.addEventListener('keydown', function (ev) {
        var k = ev.key || ev.keyCode;
        if (k === 'Escape' || k === 'Esc' || k === 27) { si.value = ''; CTX.kw = ''; Xt_renderList(); }
      });
    }

    /* 真图加载失败 → 换回内联 SVG 占位（防裂图） */
    CTX.root.addEventListener('error', function (ev) {
      var t = ev.target || ev.srcElement;
      if (t && t.tagName === 'IMG' && (t.className || '').indexOf('xtpl-pv-img') !== -1) {
        var box = t.parentNode;
        if (box && box.className && box.className.indexOf('xtpl-pv') !== -1) {
          box.innerHTML = Xt_placeholderSvg(t.getAttribute('data-ph'), null);
        }
      }
    }, true);
  }

  function Xt_renderChipsInto() {
    var el = CTX.root ? CTX.root.querySelector('.xtpl-chips-host') : null;
    if (el) el.innerHTML = Xt_renderChips();
  }

  /* ==================== 样式（一次性注入） ==================== */

  var LIB_CSS = [
    '.xtpl-wrap{font-size:13px;color:var(--text,#2D3436)}',
    '.xtpl-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}',
    '.xtpl-search{position:relative;flex:0 0 auto}',
    '.xtpl-search-input{width:220px;box-sizing:border-box;padding:8px 12px;border:1px solid var(--border,#E8ECF0);border-radius:20px;background:var(--bg,#F5F7FA);font-size:12.5px;color:var(--text,#2D3436);outline:none}',
    '.xtpl-search-input:focus{border-color:var(--primary,#36CFC9);background:var(--card,#fff)}',
    '.xtpl-count{margin-left:auto;display:flex;gap:14px;font-size:12px;color:var(--text-secondary,#636E72)}',
    '.xtpl-count b{color:var(--text,#2D3436)}',
    '.xtpl-chips-host{margin-bottom:14px}',
    '.xtpl-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.xtpl-chip{border:1px solid var(--border,#E8ECF0);background:var(--bg,#F5F7FA);color:var(--text-secondary,#636E72);border-radius:20px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;line-height:1.4}',
    '.xtpl-chip:hover{border-color:var(--primary,#36CFC9);color:var(--primary,#36CFC9)}',
    '.xtpl-chip.on{background:var(--primary,#36CFC9);border-color:var(--primary,#36CFC9);color:#fff}',
    '.xtpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}',
    '.xtpl-card{background:var(--card,#fff);border:1px solid var(--border,#E8ECF0);border-radius:12px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.05);display:flex;flex-direction:column}',
    '.xtpl-pv{position:relative;width:100%;border-radius:8px;overflow:hidden;border:1px solid var(--border,#E8ECF0);cursor:pointer;background:#F5F7FA}',
    '.xtpl-pv-svg{display:block;width:100%;height:auto;aspect-ratio:16/9}',
    '.xtpl-pv-img{display:block;width:100%;height:auto}',
    '.xtpl-pv-lg{cursor:default}',
    '.xtpl-pv-lg .xtpl-ph-svg{max-height:46vh}',
    '.xtpl-name{font-weight:700;font-size:14px;margin:10px 0 4px}',
    '.xtpl-usecase{font-size:12px;line-height:1.55;color:var(--text-secondary,#636E72);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:34px}',
    '.xtpl-acts{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}',
    '.xtpl-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border,#E8ECF0);background:var(--bg,#F5F7FA);color:var(--text-secondary,#636E72);border-radius:9px;padding:5px 10px;font-size:12px;cursor:pointer;line-height:1.4;text-decoration:none;transition:transform .12s ease}',
    '.xtpl-btn em{font-style:normal}',
    '.xtpl-btn:hover{border-color:var(--primary,#36CFC9);color:var(--primary,#36CFC9)}',
    '.xtpl-btn-fav:hover{transform:scale(1.1)}',
    '.xtpl-btn-fav.on{background:#FFF7DB;border-color:#F2B705;color:#B07A00}',
    '.xtpl-btn-fav.on .nav-icon{color:#F2B705}',
    '.xtpl-btn-p{background:var(--primary,#36CFC9);border-color:var(--primary,#36CFC9);color:#fff}',
    '.xtpl-btn-p:hover{background:var(--primary-dark,#2AB5AF);border-color:var(--primary-dark,#2AB5AF);color:#fff}',
    '.xtpl-btn-dl{background:#2E75B6;border-color:#2E75B6;color:#fff}',
    '.xtpl-btn-dl:hover{background:#1F4E79;border-color:#1F4E79;color:#fff}',
    '.xtpl-btn-dis{background:var(--bg,#F0F1F3);border-color:var(--border,#E8ECF0);color:#AAB1B8;cursor:not-allowed}',
    '.xtpl-btn-dis:hover{background:var(--bg,#F0F1F3);border-color:var(--border,#E8ECF0);color:#AAB1B8}',
    '.xtpl-empty{padding:44px 20px;text-align:center;color:var(--text-secondary,#636E72)}',
    '.xtpl-empty-ic{color:var(--border,#C9D2DA)}',
    '.xtpl-empty-t{margin:12px 0 16px;font-size:13px}',
    '.xtpl-empty-a{display:flex;justify-content:center}',
    '.xtpl-modal{display:none}',
    '.xtpl-modal.show{display:block;position:fixed;left:0;top:0;right:0;bottom:0;z-index:3000}',
    '.xtpl-modal-mask{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.7)}',
    '.xtpl-modal-box{position:relative;margin:6vh auto;width:80%;max-width:1000px;max-height:88vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);display:flex;flex-direction:column}',
    '.xtpl-modal-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #EEF1F4}',
    '.xtpl-modal-title{flex:1;font-weight:700;font-size:15px;color:#2D3436}',
    '.xtpl-modal-x{border:none;background:transparent;cursor:pointer;color:#8895A0;padding:4px;line-height:0}',
    '.xtpl-modal-x:hover{color:#C62828}',
    '.xtpl-modal-body{display:flex;gap:18px;padding:16px;flex-wrap:wrap}',
    '.xtpl-modal-media{flex:1 1 46%;min-width:240px}',
    '.xtpl-modal-side{flex:1 1 40%;min-width:220px}',
    '.xtpl-side-lb{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#2D3436;margin:0 0 8px}',
    '.xtpl-side-uc{font-size:13px;line-height:1.7;color:#5A6672;margin-bottom:16px}',
    '.xtpl-side-pt{position:relative;font-size:12.5px;line-height:1.8;color:#5A6672;padding-left:14px}',
    '.xtpl-dot{position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:#36CFC9}',
    '.xtpl-modal-foot{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid #EEF1F4;flex-wrap:wrap}',
    '.xtpl-foot-dl{display:inline-flex}',
    '.xtpl-modal-foot .xtpl-btn{margin-right:auto}',
    '.xtpl-modal-foot .xtpl-btn ~ .xtpl-btn{margin-right:0}'
  ].join('\n');

  function Xt_injectStyle() {
    if (document.getElementById(LIB_STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = LIB_STYLE_ID;
    st.setAttribute('type', 'text/css');
    if (st.styleSheet && typeof st.styleSheet.cssText === 'string') {
      st.styleSheet.cssText = LIB_CSS;
    } else {
      st.appendChild(document.createTextNode(LIB_CSS));
    }
    (document.head || document.documentElement).appendChild(st);
  }

  /* ==================== 对外挂载 ==================== */

  function Xt_mount(rootEl) {
    if (!rootEl) return;
    Xt_injectStyle();

    var data = Xt_getData();
    if (!data) {
      rootEl.innerHTML = '<div class="xtpl-empty"><div class="xtpl-empty-t">' +
        '版式数据未加载（请确认 assets/data-ppt-templates.js 已在本脚本之前引入）</div></div>';
      return;
    }

    /* 重置上下文 */
    CTX.root = null;
    CTX.items = data.items || [];
    CTX.cat = CAT_ALL;
    CTX.kw = '';
    CTX.bound = false;

    var cats = data.cats || ['封面页', '目录页', '过渡页', '内容页'];
    var h = '';
    h += '<div class="xtpl-wrap">';
    h += '<div class="xtpl-toolbar">';
    h += '<div class="xtpl-search">' +
      '<input type="text" class="xtpl-search-input" placeholder="搜索版式名称/关键词" ' +
      'autocomplete="off" aria-label="搜索版式"></div>';
    h += '<div class="xtpl-count"></div>';
    h += '</div>';
    h += '<div class="xtpl-chips-host"></div>';
    h += '<div class="xtpl-list"></div>';
    h += '</div>';
    rootEl.innerHTML = h;

    CTX.root = rootEl.querySelector('.xtpl-wrap');

    /* 初始页签（含分类计数前缀提示，仅全部与收藏不带计数） */
    CTX.cat = CAT_ALL;
    Xt_renderChipsInto();
    Xt_bindRoot();
    Xt_renderList();

    /* 顶级兜底：确保 CTX.cat 一定落在有效页签内 */
    if ([CAT_ALL, CAT_FAV].indexOf(CTX.cat) === -1 && cats.indexOf(CTX.cat) === -1) {
      CTX.cat = CAT_ALL;
      Xt_renderChipsInto();
      Xt_renderList();
    }
  }

  /* 对外接口 + PPTV2 注册（与 A7 同构，便于统一分发器调用） */
  window.XtPptLib = {
    mount: Xt_mount,
    openPreview: Xt_openModal,
    placeholderSvg: Xt_placeholderSvg,
    filtered: Xt_filtered
  };

  window.PPTV2 = window.PPTV2 || {};
  window.PPTV2[LIB_KEY] = function (slotEl) { Xt_mount(slotEl); };
})();
