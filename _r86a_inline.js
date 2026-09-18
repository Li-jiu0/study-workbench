/* 赞助页收款码：点击放大预览 · 左右切换 · 保存下载（内联实现，不新增 js 文件） */
(function () {
  'use strict';

  var overlay = null;
  var bigImg = null;
  var countEl = null;
  var prevEl = null;
  var nextEl = null;
  var dlEl = null;
  var list = [];
  var index = 0;
  var startX = 0;
  var startY = 0;
  var moved = false;

  function notify(msg) {
    try {
      if (typeof window.xtToast === 'function') { window.xtToast('info', msg); return; }
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    } catch (e) { /* 无 toast 实现时静默 */ }
  }

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text) { n.textContent = text; }
    return n;
  }

  function fileName(src) {
    var s = String(src || '');
    var q = s.indexOf('?');
    if (q >= 0) { s = s.slice(0, q); }
    var seg = s.split('/');
    return seg[seg.length - 1] || 'sponsor.jpg';
  }

  function isOpen() {
    return !!overlay && overlay.className.indexOf('active') >= 0;
  }

  function openAt(i) {
    if (!list.length || !overlay) { return; }
    index = ((i % list.length) + list.length) % list.length;
    var cur = list[index];
    var src = cur.getAttribute('src') || '';
    bigImg.setAttribute('src', src);
    bigImg.setAttribute('alt', cur.getAttribute('alt') || '收款码');
    countEl.textContent = (index + 1) + ' / ' + list.length;
    dlEl.setAttribute('href', src);
    dlEl.setAttribute('download', fileName(src));
    overlay.className = 'sp-lb active';
    document.body.style.overflow = 'hidden';
  }

  function go(step) {
    if (!isOpen()) { return; }
    openAt(index + step);
  }

  function close() {
    if (!overlay) { return; }
    overlay.className = 'sp-lb';
    document.body.style.overflow = '';
  }

  function build() {
    overlay = make('div', 'sp-lb');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '收款码预览');

    var closeBtn = make('div', 'sp-lb-x', '\u2715');
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', '关闭预览');
    closeBtn.setAttribute('tabindex', '0');

    prevEl = make('div', 'sp-lb-nav sp-lb-prev', '\u2039');
    prevEl.setAttribute('role', 'button');
    prevEl.setAttribute('aria-label', '上一张');
    nextEl = make('div', 'sp-lb-nav sp-lb-next', '\u203a');
    nextEl.setAttribute('role', 'button');
    nextEl.setAttribute('aria-label', '下一张');

    bigImg = document.createElement('img');
    bigImg.className = 'sp-lb-img';
    bigImg.setAttribute('alt', '收款码大图');

    countEl = make('div', 'sp-lb-count', '');

    var bar = make('div', 'sp-lb-bar');
    dlEl = document.createElement('a');
    dlEl.className = 'sp-lb-btn';
    dlEl.textContent = '\u2913 \u4fdd\u5b58\u56fe\u7247';
    dlEl.setAttribute('role', 'button');
    bar.appendChild(dlEl);

    overlay.appendChild(closeBtn);
    overlay.appendChild(prevEl);
    overlay.appendChild(nextEl);
    overlay.appendChild(bigImg);
    overlay.appendChild(countEl);
    overlay.appendChild(bar);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      if (e.target === overlay) { close(); }
    });
    closeBtn.addEventListener('click', function (e) {
      if (e.stopPropagation) { e.stopPropagation(); }
      close();
    });
    prevEl.addEventListener('click', function (e) {
      if (e.stopPropagation) { e.stopPropagation(); }
      go(-1);
    });
    nextEl.addEventListener('click', function (e) {
      if (e.stopPropagation) { e.stopPropagation(); }
      go(1);
    });
    dlEl.addEventListener('click', function (e) {
      if (e.stopPropagation) { e.stopPropagation(); }
      notify('\u56fe\u7247\u5df2\u5f00\u59cb\u4fdd\u5b58');
    });
    overlay.addEventListener('touchstart', function (e) {
      moved = false;
      if (!e.touches || !e.touches.length) { return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, false);
    overlay.addEventListener('touchend', function (e) {
      var t = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : null;
      if (!t) { return; }
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        moved = true;
        go(dx < 0 ? 1 : -1);
      }
    }, false);

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) { return; }
      var key = e.key || '';
      if (key === 'Escape' || key === 'Esc' || e.keyCode === 27) { close(); return; }
      if (key === 'ArrowLeft' || e.keyCode === 37) { go(-1); return; }
      if (key === 'ArrowRight' || e.keyCode === 39) { go(1); }
    }, false);
  }

  function init() {
    var box = document.getElementById('spQr');
    if (!box || !document.body) { return; }
    var imgs = box.getElementsByTagName('img');
    for (var m = 0; m < imgs.length; m++) { list.push(imgs[m]); }
    if (!list.length) { return; }
    build();
    if (list.length < 2) {
      prevEl.style.display = 'none';
      nextEl.style.display = 'none';
      countEl.style.display = 'none';
    }
    for (var n = 0; n < list.length; n++) {
      (function (idx) {
        var node = list[idx];
        node.setAttribute('data-sp-index', String(idx));
        node.addEventListener('click', function (e) {
          if (e && e.preventDefault) { e.preventDefault(); }
          openAt(idx);
        });
      })(n);
    }
  }

  function boot() {
    try { init(); } catch (err) { /* 预览层为增强能力，失败不影响页面 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})();