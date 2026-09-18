/* r90_qa_probe_cssctx.js — 查 .xtlp-map / .xtlp-list 的生效规则与来源 */
var R = { vp: { w: innerWidth, h: innerHeight } };
function openLayer() {
  try {
    if (window.XT_LOC_PICK && typeof window.XT_LOC_PICK.openPicker === 'function') {
      window.XT_LOC_PICK.openPicker({ title: 'R90' }, function () { }); return true;
    }
  } catch (e) { R.openErr = String(e); }
  return false;
}
R.opened = openLayer();
var lyr = document.querySelector('.xtlp');
R.found = !!lyr;
if (lyr) {
  var mp = lyr.querySelector('.xtlp-map');
  var lst = lyr.querySelector('.xtlp-list');
  R.mapRect = mp ? { h: +mp.getBoundingClientRect().height.toFixed(1) } : null;
  R.mapCssHeight = mp ? getComputedStyle(mp).height : null;
  R.listCss = lst ? { h: getComputedStyle(lst).height, minH: getComputedStyle(lst).minHeight,
    maxH: getComputedStyle(lst).maxHeight, clientH: lst.clientHeight } : null;

  /* 枚举所有规则，找出选择器命中 .xtlp-map 的 */
  function matches(sel, el) {
    try { return el.matches(sel); } catch (e) { return false; }
  }
  R.mapRules = [];
  R.listRules = [];
  R.mediaConds = [];
  for (var si = 0; si < document.styleSheets.length; si++) {
    var sh = document.styleSheets[si];
    var rules; try { rules = sh.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (rule.type === 4) {
        var cond = rule.conditionText || (rule.media && rule.media.mediaText) || '';
        var innerRules = rule.cssRules || [];
        var innerHits = [];
        for (var ii = 0; ii < innerRules.length; ii++) {
          var ct = innerRules[ii].cssText || '';
          innerHits.push(ct.slice(0, 170));
        }
        R.mediaConds.push({ sheetIdx: si, cond: cond, matched: rule.matches ? rule.matches(window) : null,
          n: innerRules.length, rules: innerHits });
      } else if (rule.selectorText) {
        if (mp && matches(rule.selectorText, mp)) { R.mapRules.push({ sheetIdx: si, sel: rule.selectorText, css: rule.cssText.slice(0, 250) }); }
        if (lst && matches(rule.selectorText, lst)) { R.listRules.push({ sheetIdx: si, sel: rule.selectorText, css: rule.cssText.slice(0, 250) }); }
      }
    }
  }
  /* styleSheets 数量与来源 */
  R.sheets = [];
  for (var k = 0; k < document.styleSheets.length; k++) {
    var s2 = document.styleSheets[k];
    R.sheets.push({ idx: k, owner: s2.ownerNode ? s2.ownerNode.tagName + (s2.ownerNode.id ? '#' + s2.ownerNode.id : '') : '?',
      href: s2.href || '(inline)', ruleCount: (function () { try { return s2.cssRules.length; } catch (e) { return -1; } })() });
  }
}
return R;
