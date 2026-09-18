/* B1 因果证明：临时禁用本页覆盖规则，验证页面是否恢复"不可滚动" */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  var doc = document.documentElement;

  function scrollProbe(tag) {
    scrollTo(0, 0);
    var o = {};
    o.tag = tag;
    o.docScrollHeight = doc.scrollHeight;
    o.docClientHeight = doc.clientHeight;
    o.overflowY = getComputedStyle(doc).overflowY;
    o.bodyOverflowY = getComputedStyle(document.body).overflowY;
    o.height = getComputedStyle(doc).height;
    scrollTo(0, 400);
    o.scrollTopAfterScrollTo = doc.scrollTop;
    o.canScroll = doc.scrollTop > 0;
    return o;
  }

  R.withFix = scrollProbe('with-fix');

  // 临时把本页覆盖规则干掉（模拟修复前），看是否恢复不可滚动
  var removed = [];
  Array.prototype.forEach.call(document.querySelectorAll('style'), function (st) {
    var t = st.textContent || '';
    if (body_has(t)) {
      var newT = t
        .replace(/(html\s*\{[^}]*?)(overflow-y\s*:\s*auto)/g, '$1/*QA-OFF*/')
        .replace(/(body\.theme-home\s*\{[^}]*?)(overflow-y\s*:\s*auto)/g, '$1/*QA-OFF*/');
      if (newT !== t) { st.textContent = newT; removed.push(st.textContent.length); }
    }
  });
  R.rulesNeutralized = removed.length;

  // 同样禁用 common.css 里的 ... 无法直接改 link；改为注入一条等效的反向规则模拟原状
  var kill = document.createElement('style');
  kill.textContent = 'html{height:100%!important;overflow:hidden!important}body.theme-home{height:100%!important;overflow:hidden!important}';
  document.head.appendChild(kill);

  R.withoutFix = scrollProbe('without-fix');
  return R;

  function body_has(t) { return /body\.theme-home\s*\{[^}]*overflow-y\s*:\s*auto/.test(t); }
})();
