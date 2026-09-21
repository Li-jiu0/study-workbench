/* A1 关键：.open 后 transform 是否真的变成 translateY(0)？ */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  ['imChat', 'imConv', 'imEmpty'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = (id === 'imConv') ? 'flex' : (id === 'imEmpty' ? 'none' : 'flex');
  });
  var m = document.querySelector('#imPlusMenu'), btn = document.querySelector('#imPlusBtn');
  function fire(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }

  R.before = { cls: m.className, transform: getComputedStyle(m).transform };
  fire(btn);
  R.immediately = { cls: m.className, transform: getComputedStyle(m).transform };
  return new Promise(function (res) {
    setTimeout(function () {
      R.after400ms = {
        cls: m.className,
        transform: getComputedStyle(m).transform,
        rect: (function (r) { return [Math.round(r.top), Math.round(r.bottom), Math.round(r.height)]; })(m.getBoundingClientRect()),
        transition: getComputedStyle(m).transition
      };
      R.openRule = (function () {
        var st = document.querySelector('#imPlusCss');
        for (var i = 0; i < st.sheet.cssRules.length; i++) {
          var t = st.sheet.cssRules[i].cssText;
          if (t.indexOf('.im-plus-menu.open') === 0 || t.indexOf('.im-plus-menu {') === 0) R['rule' + i] = t;
        }
        return 'see ruleN';
      })();
      // 检查 translateY(110%) 基类规则里有没有 open 覆盖
      var st = document.querySelector('#imPlusCss');
      var found = [];
      for (var i = 0; i < st.sheet.cssRules.length; i++) {
        var t = st.sheet.cssRules[i].cssText;
        if (t.indexOf('im-plus-menu') === 0) found.push(t);
      }
      R.menuRules = found;
      res(R);
    }, 400);
  });
})();
