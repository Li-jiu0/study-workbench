/* r90_qa_probe_flexshrink.js — 判定 .xtlp-map 的 56px 是「媒体查询生效」还是「flex 收缩」 */
var R = { vp: { w: innerWidth, h: innerHeight } };
try { window.XT_LOC_PICK.openPicker({ title: 'R90' }, function () { }); } catch (e) { R.err = String(e); }
var lyr = document.querySelector('.xtlp');
R.found = !!lyr;
if (lyr) {
  var bodyEl = lyr.querySelector('.xtlp-body');
  var mp = lyr.querySelector('.xtlp-map');
  var lst = lyr.querySelector('.xtlp-list');
  var hd = lyr.querySelector('.xtlp-head');
  var sr = lyr.querySelector('.xtlp-search');
  var ft = lyr.querySelector('.xtlp-foot');
  function info(el, label) {
    if (!el) { return { label: label, found: false }; }
    var cs = getComputedStyle(el);
    return {
      label: label, found: true,
      cssHeight: cs.height, cssFlexBasis: cs.flexBasis, cssFlexGrow: cs.flexGrow,
      cssFlexShrink: cs.cssFloat === undefined ? null : cs.flexShrink,
      flexShrink: cs.flexShrink, flex: cs.flex,
      minHeight: cs.minHeight, maxHeight: cs.maxHeight,
      rectH: +el.getBoundingClientRect().height.toFixed(1),
      // style 属性上的 height（媒体规则命中会体现在 computed，但 inline 才是 override）
      inlineH: el.style && el.style.height ? el.style.height : ''
    };
  }
  R.parts = [info(hd, 'head'), info(sr, 'search'), info(mp, 'map'), info(lst, 'list'), info(ft, 'foot')];
  R.body = bodyEl ? {
    rectH: +bodyEl.getBoundingClientRect().height.toFixed(1),
    clientH: bodyEl.clientHeight, scrollH: bodyEl.scrollHeight,
    display: getComputedStyle(bodyEl).display, flexDir: getComputedStyle(bodyEl).flexDirection,
    overflowY: getComputedStyle(bodyEl).overflowY
  } : null;

  /* 直接断言媒体查询是否匹配：用 window.matchMedia */
  R.mq = {
    maxH560: window.matchMedia('(max-height:560px)').matches,
    maxH520: window.matchMedia('(max-height:520px)').matches,
    maxH450: window.matchMedia('(max-height:450px)').matches,
    innerHeight: innerHeight
  };

  /* 逐个块的真实求和 vs 视口 */
  var sum = 0, det = [];
  [hd, sr, mp, lst, ft].forEach(function (el) {
    if (!el) { return; }
    var r = el.getBoundingClientRect();
    sum += r.height;
    det.push((el.className || '') + '=' + r.height.toFixed(1));
  });
  R.sumOfBlocks = +sum.toFixed(1);
  R.blockDetail = det;

  /* 如果 map 真的被 flex 收缩，宽高比会变；直接比较「若不收缩应有的 168/110」 */
  R.mapVerdict = {
    observed: mp ? +mp.getBoundingClientRect().height.toFixed(1) : null,
    expectedIfMediaApplied_110: 110,
    expectedIfBase_168: 168,
    flexShrinkIs1: mp ? (getComputedStyle(mp).flexShrink === '1') : null,
    conclusion: ''
  };
  var obs = R.mapVerdict.observed;
  if (obs !== null) {
    R.mapVerdict.conclusion =
      Math.abs(obs - 110) < 1 ? '媒体规则生效(110)' :
      Math.abs(obs - 168) < 1 ? '基础规则生效(168)' :
      '被 flex 收缩到 ' + obs + 'px（既非 110 也非 168）';
  }

  /* list 的 min-height/max-height 冲突检查 */
  R.listConflict = lst ? {
    minH: getComputedStyle(lst).minHeight, maxH: getComputedStyle(lst).maxHeight,
    computedH: getComputedStyle(lst).height, clientH: lst.clientHeight,
    conflict: parseFloat(getComputedStyle(lst).minHeight) > parseFloat(getComputedStyle(lst).maxHeight)
  } : null;
}
return R;
