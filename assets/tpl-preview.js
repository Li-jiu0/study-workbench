/* =====================================================================
   tpl-preview.js · A7「PPT · 实战模板库」渲染器（v2）
   批次：2026-09-14 / R48「做真内容」/ 版本戳 20260914e
   ---------------------------------------------------------------------
   架构约定：
     · 注册 window.PPTV2['ppt-templates'] = function (slotEl) {...}
       宿主页面（PPT训练.html）由 T00 预埋分发逻辑，本文件**不改任何 HTML**。
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
    } catch (e) { /* 忽略，最后回退 alert */ }
    window.alert(msg);
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
