/* _r86a_mutate.js — A线：更多.html 入口调整 + 赞助.html 双图预览
 * 行尾铁律：二进制读 → 按 \r\n 切行 → 改 → 按 \r\n 拼回 → 二进制写。
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = 'D:/下载的文件/学习工作台/';
var CRLF = '\r\n';

function readLines(rel) {
  var buf = fs.readFileSync(ROOT + rel);
  var s = buf.toString('utf8');
  var lonelyLf = (s.match(/(?<!\r)\n/g) || []).length;
  if (lonelyLf !== 0) { throw new Error(rel + ' 存在 loneLF=' + lonelyLf + '，停止'); }
  return { lines: s.split(CRLF), raw: s };
}

function writeLines(rel, lines) {
  var out = lines.join(CRLF);
  fs.writeFileSync(ROOT + rel, Buffer.from(out, 'utf8'), { encoding: null });
}

function assertHas(line, needle, where) {
  if (line == null || line.indexOf(needle) < 0) {
    throw new Error('断言失败 @' + where + '：行内未找到 "' + needle + '"，实际=' + String(line));
  }
}

/* ============================================================
 * 一、更多.html
 * ============================================================ */
(function more() {
  var rel = '更多.html';
  var r = readLines(rel);
  var a = r.lines;
  var origCrLf = (r.raw.match(/\r\n/g) || []).length;

  /* 0-based 索引（Read 行号 - 1）
   * 126..130 : morepage-list 中的「互动广场」卡片（待删）
   * 131..135 : morepage-list 中的「错题本」卡片
   * 156..160 : morepage-list 中的「赞助」卡片
   * 161..165 : morepage-list 中的「导入题库」卡片（待删）
   * 208..210 : 旧更多面板中的「互动广场」bottom-more-item（待删）
   */
  assertHas(a[126], 'gotoBlogMine()', '更多 L127');
  assertHas(a[128], '>互动广场<', '更多 L129');
  assertHas(a[130], '</div>', '更多 L131');
  assertHas(a[131], "navigateTo('wrong-book')", '更多 L132');
  assertHas(a[133], '>错题本<', '更多 L134');
  assertHas(a[135], '</div>', '更多 L136');
  assertHas(a[156], "location.href='赞助.html'", '更多 L157');
  assertHas(a[158], '>赞助<', '更多 L159');
  assertHas(a[160], '</div>', '更多 L161');
  assertHas(a[161], "location.href='导入题库.html'", '更多 L162');
  assertHas(a[163], '>导入题库<', '更多 L164');
  assertHas(a[165], '</div>', '更多 L166');
  assertHas(a[208], 'gotoBlogMine()', '更多 L209');
  assertHas(a[209], '>互动广场<', '更多 L210');
  assertHas(a[210], '</div>', '更多 L211');

  // 从高索引往低索引删，避免索引漂移
  a.splice(208, 3);   // 旧更多面板「互动广场」
  a.splice(161, 5);   // 「导入题库」卡片
  a.splice(126, 5);   // 「互动广场」卡片

  // 交换「错题本」与「赞助」两张卡片（各 5 行，等长，直接互换内容）
  var i = -1, j = -1, k = 0;
  for (k = 0; k < a.length; k++) {
    if (a[k].indexOf('morepage-card') >= 0 && a[k].indexOf("navigateTo('wrong-book')") >= 0) { i = k; }
    if (a[k].indexOf('morepage-card') >= 0 && a[k].indexOf("location.href='赞助.html'") >= 0) { j = k; }
  }
  if (i < 0 || j < 0 || i === j) { throw new Error('未定位到错题本/赞助卡片：i=' + i + ' j=' + j); }
  var wb = a.slice(i, i + 5);
  var zs = a.slice(j, j + 5);
  a.splice(i, 5); a.splice(i, 0, zs[0], zs[1], zs[2], zs[3], zs[4]);
  a.splice(j, 5); a.splice(j, 0, wb[0], wb[1], wb[2], wb[3], wb[4]);

  writeLines(rel, a);

  var after = fs.readFileSync(ROOT + rel).toString('utf8');
  var report = {
    file: rel,
    crlf_before: origCrLf,
    crlf_after: (after.match(/\r\n/g) || []).length,
    loneLF_after: (after.match(/(?<!\r)\n/g) || []).length,
    导入题库_count: (after.match(/导入题库/g) || []).length,
    互动广场_count: (after.match(/互动广场/g) || []).length
  };
  console.log('[更多.html] ' + JSON.stringify(report));
})();

/* ============================================================
 * 二、赞助.html
 * ============================================================ */
(function sponsor() {
  var rel = '赞助.html';
  var r = readLines(rel);
  var a = r.lines;
  var origCrLf = (r.raw.match(/\r\n/g) || []).length;

  // 定位锚点
  var idxSpNote = -1, idxMqQr = -1, idxQrOpen = -1, idxBodyEnd = -1, k = 0;
  for (k = 0; k < a.length; k++) {
    if (a[k].indexOf('.sp-note{') === 0) { idxSpNote = k; }
    if (a[k].indexOf('  .sp-qr{max-width:240px;}') >= 0) { idxMqQr = k; }
    if (a[k].indexOf('<div class="sp-qr">') >= 0) { idxQrOpen = k; }
    if (a[k].indexOf('</body>') >= 0) { idxBodyEnd = k; }
  }
  if (idxSpNote < 0 || idxMqQr < 0 || idxQrOpen < 0 || idxBodyEnd < 0) {
    throw new Error('赞助.html 锚点定位失败 ' + [idxSpNote, idxMqQr, idxQrOpen, idxBodyEnd].join(','));
  }
  assertHas(a[idxQrOpen + 1], 'assets/赞助收款码.jpg', '赞助 图1');
  assertHas(a[idxQrOpen + 2], '</div>', '赞助 sp-qr 闭合');

  /* --- 1) 图片区局部样式（sp- 前缀，沿用同一套写法） --- */
  var cssImg = [
    '.sp-qr-item{position:relative;display:block;}',
    '.sp-qr-item + .sp-qr-item{margin-top:14px;}',
    '.sp-qr img{cursor:zoom-in;-webkit-tap-highlight-color:transparent;}',
    '.sp-zoom{position:absolute;right:8px;bottom:8px;width:26px;height:26px;border-radius:50%;',
    '  background:rgba(17,24,39,0.55);color:#fff;font-size:14px;line-height:26px;text-align:center;pointer-events:none;}'
  ];

  /* --- 2) 大图预览层样式 --- */
  var cssLb = [
    '/* ===== 收款码大图预览：点击放大 · 左右切换 · 保存下载 ===== */',
    '.sp-lb{position:fixed;left:0;top:0;right:0;bottom:0;z-index:3000;display:none;background:rgba(0,0,0,0.88);',
    '  -webkit-box-orient:vertical;-webkit-box-direction:normal;flex-direction:column;',
    '  -webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;}',
    '.sp-lb.active{display:-webkit-box;display:flex;}',
    '.sp-lb-img{max-width:92vw;max-height:70vh;object-fit:contain;border-radius:10px;background:#fff;}',
    '.sp-lb-count{margin-top:12px;color:#fff;font-size:13px;opacity:0.85;}',
    '.sp-lb-x{position:absolute;right:14px;top:14px;width:40px;height:40px;border-radius:50%;',
    '  background:rgba(255,255,255,0.18);color:#fff;font-size:18px;line-height:40px;text-align:center;cursor:pointer;}',
    '.sp-lb-nav{position:absolute;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:50%;',
    '  background:rgba(255,255,255,0.18);color:#fff;font-size:22px;line-height:44px;text-align:center;cursor:pointer;}',
    '.sp-lb-prev{left:10px;}',
    '.sp-lb-next{right:10px;}',
    '.sp-lb-bar{margin-top:16px;display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;}',
    '.sp-lb-btn{display:inline-block;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,0.18);',
    '  color:#fff;font-size:14px;text-decoration:none;cursor:pointer;}',
    '@media (max-width:640px){',
    '  .sp-zoom{width:22px;height:22px;line-height:22px;font-size:12px;right:6px;bottom:6px;}',
    '  .sp-lb-img{max-height:60vh;}',
    '  .sp-lb-nav{width:38px;height:38px;line-height:38px;margin-top:-19px;font-size:20px;}',
    '}'
  ];

  /* --- 3) 图片区 markup：两张收款码，完全一致的类/属性写法 --- */
  var qrHtml = [
    '            <div class="sp-qr" id="spQr">',
    '              <span class="sp-qr-item">',
    '                <img src="assets/赞助收款码.jpg" alt="赞助收款码" loading="lazy">',
    '                <span class="sp-zoom" aria-hidden="true">\uD83D\uDD0D</span>',
    '              </span>',
    '              <span class="sp-qr-item">',
    '                <img src="assets/赞助收款码2.jpg" alt="赞助收款码2" loading="lazy">',
    '                <span class="sp-zoom" aria-hidden="true">\uD83D\uDD0D</span>',
    '              </span>',
    '            </div>'
  ];

  /* --- 4) 预览逻辑（ES2017，禁可选链/空值合并/顶层 await/alert） --- */
  var script = [
    '<script>',
    '/* 赞助页收款码：点击放大预览 · 左右切换 · 保存下载（内联实现，不新增 js 文件） */',
    '(function () {',
    "  'use strict';",
    '',
    '  var overlay = null;',
    '  var bigImg = null;',
    '  var countEl = null;',
    '  var prevEl = null;',
    '  var nextEl = null;',
    '  var dlEl = null;',
    '  var list = [];',
    '  var index = 0;',
    '  var startX = 0;',
    '  var startY = 0;',
    '  var moved = false;',
    '',
    '  function notify(msg) {',
    '    try {',
    "      if (typeof window.xtToast === 'function') { window.xtToast('info', msg); return; }",
    "      if (typeof window.showToast === 'function') { window.showToast(msg); return; }",
    '    } catch (e) { /* 无 toast 实现时静默 */ }',
    '  }',
    '',
    '  function make(tag, cls, text) {',
    '    var n = document.createElement(tag);',
    '    if (cls) { n.className = cls; }',
    '    if (text) { n.textContent = text; }',
    '    return n;',
    '  }',
    '',
    '  function fileName(src) {',
    "    var s = String(src || '');",
    "    var q = s.indexOf('?');",
    '    if (q >= 0) { s = s.slice(0, q); }',
    '    var seg = s.split(\'/\');',
    "    return seg[seg.length - 1] || 'sponsor.jpg';",
    '  }',
    '',
    '  function isOpen() {',
    '    return !!overlay && overlay.className.indexOf(\'active\') >= 0;',
    '  }',
    '',
    '  function openAt(i) {',
    '    if (!list.length || !overlay) { return; }',
    '    index = ((i % list.length) + list.length) % list.length;',
    '    var cur = list[index];',
    "    var src = cur.getAttribute('src') || '';",
    '    bigImg.setAttribute(\'src\', src);',
    "    bigImg.setAttribute('alt', cur.getAttribute('alt') || '收款码');",
    "    countEl.textContent = (index + 1) + ' / ' + list.length;",
    '    dlEl.setAttribute(\'href\', src);',
    '    dlEl.setAttribute(\'download\', fileName(src));',
    "    overlay.className = 'sp-lb active';",
    "    document.body.style.overflow = 'hidden';",
    '  }',
    '',
    '  function go(step) {',
    '    if (!isOpen()) { return; }',
    '    openAt(index + step);',
    '  }',
    '',
    '  function close() {',
    '    if (!overlay) { return; }',
    "    overlay.className = 'sp-lb';",
    "    document.body.style.overflow = '';",
    '  }',
    '',
    '  function build() {',
    "    overlay = make('div', 'sp-lb');",
    "    overlay.setAttribute('role', 'dialog');",
    "    overlay.setAttribute('aria-label', '收款码预览');",
    '',
    "    var closeBtn = make('div', 'sp-lb-x', '\\u2715');",
    "    closeBtn.setAttribute('role', 'button');",
    "    closeBtn.setAttribute('aria-label', '关闭预览');",
    "    closeBtn.setAttribute('tabindex', '0');",
    '',
    "    prevEl = make('div', 'sp-lb-nav sp-lb-prev', '\\u2039');",
    "    prevEl.setAttribute('role', 'button');",
    "    prevEl.setAttribute('aria-label', '上一张');",
    "    nextEl = make('div', 'sp-lb-nav sp-lb-next', '\\u203a');",
    "    nextEl.setAttribute('role', 'button');",
    "    nextEl.setAttribute('aria-label', '下一张');",
    '',
    "    bigImg = document.createElement('img');",
    "    bigImg.className = 'sp-lb-img';",
    "    bigImg.setAttribute('alt', '收款码大图');",
    '',
    "    countEl = make('div', 'sp-lb-count', '');",
    '',
    "    var bar = make('div', 'sp-lb-bar');",
    "    dlEl = document.createElement('a');",
    "    dlEl.className = 'sp-lb-btn';",
    "    dlEl.textContent = '\\u2913 \\u4fdd\\u5b58\\u56fe\\u7247';",
    "    dlEl.setAttribute('role', 'button');",
    "    bar.appendChild(dlEl);",
    '',
    '    overlay.appendChild(closeBtn);',
    '    overlay.appendChild(prevEl);',
    '    overlay.appendChild(nextEl);',
    '    overlay.appendChild(bigImg);',
    '    overlay.appendChild(countEl);',
    '    overlay.appendChild(bar);',
    '    document.body.appendChild(overlay);',
    '',
    '    overlay.addEventListener(\'click\', function (e) {',
    '      if (moved) { moved = false; return; }',
    '      if (e.target === overlay) { close(); }',
    '    });',
    "    closeBtn.addEventListener('click', function (e) {",
    '      if (e.stopPropagation) { e.stopPropagation(); }',
    '      close();',
    '    });',
    "    prevEl.addEventListener('click', function (e) {",
    '      if (e.stopPropagation) { e.stopPropagation(); }',
    '      go(-1);',
    '    });',
    "    nextEl.addEventListener('click', function (e) {",
    '      if (e.stopPropagation) { e.stopPropagation(); }',
    '      go(1);',
    '    });',
    "    dlEl.addEventListener('click', function (e) {",
    '      if (e.stopPropagation) { e.stopPropagation(); }',
    "      notify('\\u56fe\\u7247\\u5df2\\u5f00\\u59cb\\u4fdd\\u5b58');",
    '    });',
    "    overlay.addEventListener('touchstart', function (e) {",
    '      moved = false;',
    '      if (!e.touches || !e.touches.length) { return; }',
    '      startX = e.touches[0].clientX;',
    '      startY = e.touches[0].clientY;',
    '    }, false);',
    "    overlay.addEventListener('touchend', function (e) {",
    '      var t = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : null;',
    '      if (!t) { return; }',
    '      var dx = t.clientX - startX;',
    '      var dy = t.clientY - startY;',
    '      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {',
    '        moved = true;',
    '        go(dx < 0 ? 1 : -1);',
    '      }',
    '    }, false);',
    '',
    "    document.addEventListener('keydown', function (e) {",
    '      if (!isOpen()) { return; }',
    "      var key = e.key || '';",
    "      if (key === 'Escape' || key === 'Esc' || e.keyCode === 27) { close(); return; }",
    "      if (key === 'ArrowLeft' || e.keyCode === 37) { go(-1); return; }",
    "      if (key === 'ArrowRight' || e.keyCode === 39) { go(1); }",
    '    }, false);',
    '  }',
    '',
    '  function init() {',
    "    var box = document.getElementById('spQr');",
    '    if (!box || !document.body) { return; }',
    '    var imgs = box.getElementsByTagName(\'img\');',
    '    for (var m = 0; m < imgs.length; m++) { list.push(imgs[m]); }',
    '    if (!list.length) { return; }',
    '    build();',
    '    if (list.length < 2) {',
    "      prevEl.style.display = 'none';",
    "      nextEl.style.display = 'none';",
    "      countEl.style.display = 'none';",
    '    }',
    '    for (var n = 0; n < list.length; n++) {',
    '      (function (idx) {',
    '        var node = list[idx];',
    '        node.setAttribute(\'data-sp-index\', String(idx));',
    '        node.addEventListener(\'click\', function (e) {',
    '          if (e && e.preventDefault) { e.preventDefault(); }',
    '          openAt(idx);',
    '        });',
    '      })(n);',
    '    }',
    '  }',
    '',
    '  function boot() {',
    '    try { init(); } catch (err) { /* 预览层为增强能力，失败不影响页面 */ }',
    '  }',
    '',
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', boot, false);",
    '  } else {',
    '    boot();',
    '  }',
    '})();',
    '<' + '/script>'
  ];

  // 从高到低插入，避免索引漂移
  a.splice(idxBodyEnd, 0, script[0], script[1], script[2]);            // 占位，稍后整体替换
  a.splice(idxBodyEnd, 3);                                             // 撤销，改为一次性插入
  var arrScript = script.slice(0);
  a.splice.apply(a, [idxBodyEnd, 0].concat(arrScript));

  // 图片 markup 替换（3 行 → 10 行）
  var arrQr = qrHtml.slice(0);
  a.splice.apply(a, [idxQrOpen, 3].concat(arrQr));

  // 样式插入：先插大图预览样式（在 .sp-note 之后），再插图片区样式
  var idxNote = -1;
  for (k = 0; k < a.length; k++) { if (a[k].indexOf('.sp-note{') === 0) { idxNote = k; } }
  var block = cssImg.concat(cssLb);
  a.splice.apply(a, [idxNote + 1, 0].concat(block));

  writeLines(rel, a);

  var after = fs.readFileSync(ROOT + rel).toString('utf8');
  console.log('[赞助.html] ' + JSON.stringify({
    file: rel,
    crlf_before: origCrLf,
    crlf_after: (after.match(/\r\n/g) || []).length,
    loneLF_after: (after.match(/(?<!\r)\n/g) || []).length,
    img_count: (after.match(/<img /g) || []).length,
    has_img2: after.indexOf('assets/赞助收款码2.jpg') >= 0,
    has_lb: after.indexOf("class='sp-lb'") >= 0 || after.indexOf('sp-lb active') >= 0
  }));
})();

console.log('mutate done');
