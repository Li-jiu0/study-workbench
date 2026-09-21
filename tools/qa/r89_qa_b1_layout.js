/* B1 真实布局验证：地区选择.html 在矮窗口下能否滚动 */
(function () {
  var R = { vw: innerWidth, vh: innerHeight };
  function cs(el, p) { return el ? getComputedStyle(el).getPropertyValue(p) : null; }

  R.html_overflowY = cs(document.documentElement, 'overflow-y');
  R.html_height = cs(document.documentElement, 'height');
  R.body_class = document.body.className;
  R.body_overflowY = cs(document.body, 'overflow-y');
  R.body_height = cs(document.body, 'height');
  R.body_minHeight = cs(document.body, 'min-height');

  var doc = document.documentElement;
  R.docScrollHeight = doc.scrollHeight;
  R.docClientHeight = doc.clientHeight;
  // 关键：页面是否真的可滚动（内容高于视口）
  R.pageScrollable = doc.scrollHeight > doc.clientHeight;
  R.overflowYEffective = (cs(doc, 'overflow-y') === 'auto' || cs(doc, 'overflow-y') === 'scroll');

  // 尝试真实滚动
  var before = doc.scrollTop;
  scrollTo(0, 200);
  R.scrollTopAfterScrollTo = doc.scrollTop;
  R.scrollActuallyWorked = doc.scrollTop > before;

  // 底部内容是否可见（滚到底后）
  scrollTo(0, doc.scrollHeight);
  R.scrollTopAtBottom = doc.scrollTop;
  R.maxScroll = doc.scrollHeight - doc.clientHeight;

  // sticky 头
  var head = document.querySelector('.xtr-head');
  if (head) {
    R.xtr_head_position = cs(head, 'position');
    R.xtr_head_top = cs(head, 'top');
    R.xtr_head_rect_top = Math.round(head.getBoundingClientRect().top);
  } else { R.xtr_head_position = 'NOT_FOUND'; }

  // style/link 顺序（特异性决胜关键）
  var nodes = Array.prototype.slice.call(document.querySelectorAll('link[rel=stylesheet], style'));
  R.style_order = nodes.map(function (n, i) {
    var href = n.getAttribute('href') || '';
    return { i: i, tag: n.tagName.toLowerCase(), href: href, hasThemeHome: /\.theme-home/.test(n.textContent || '') };
  });
  var lastLinkIdx = -1, themeStyleIdx = -1;
  R.style_order.forEach(function (o) {
    if (o.tag === 'link') lastLinkIdx = o.i;
    if (o.hasThemeHome && themeStyleIdx < 0) themeStyleIdx = o.i;
  });
  R.style_after_link = themeStyleIdx > lastLinkIdx;
  R.themeStyleIdx = themeStyleIdx;
  R.lastLinkIdx = lastLinkIdx;

  // 页面内 <style> 里是否真有覆盖规则
  var inline = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
  R.inline_has_themehome_rule = /body\.theme-home\s*\{[^}]*overflow-y\s*:\s*auto/.test(inline);
  R.inline_has_html_rule = /html\s*\{[^}]*overflow-y\s*:\s*auto/.test(inline);

  // 整页是否有 clamp/min/max
  R.inline_has_css_math = /clamp\(|\bmin\(|\bmax\(/.test(inline);

  // 滚动容器链上的所有元素
  R.bodyRectTop = Math.round(document.body.getBoundingClientRect().top);

  // 实际能否看到页面底部元素
  var all = document.querySelectorAll('*');
  var lowest = null, lowestBottom = -1e9;
  for (var i = 0; i < all.length; i++) {
    var rc = all[i].getBoundingClientRect();
    if (rc.height > 0 && rc.bottom > lowestBottom) { lowestBottom = rc.bottom; lowest = all[i]; }
  }
  R.lowestElTag = lowest ? lowest.tagName + '.' + (lowest.className || '').toString().slice(0, 40) : null;
  R.lowestElBottomInViewport = Math.round(lowestBottom);

  return R;
})();
