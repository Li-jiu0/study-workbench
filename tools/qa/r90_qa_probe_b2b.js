/* r90_qa_probe_b2b.js — 块2 精测：.im-composer 溢出 + .xtlp 四档布局 + 因果对比
 * 页面内 eval，return JSON。
 */
var R = { vp: { w: innerWidth, h: innerHeight } };

function rect(el) {
  var r = el.getBoundingClientRect();
  return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) };
}

/* ================= A. 输入栏溢出 ================= */
var comp = document.querySelector('.im-composer');
R.composer = null;
if (comp) {
  var cr = comp.getBoundingClientRect();
  var kids = [];
  for (var i = 0; i < comp.children.length; i++) {
    var k = comp.children[i];
    var kr = k.getBoundingClientRect();
    var cs = getComputedStyle(k);
    kids.push({
      i: i, tag: k.tagName, id: k.id || '', cls: (k.className || '').toString().slice(0, 70),
      rect: rect(k), display: cs.display,
      title: k.getAttribute && k.getAttribute('title') || ''
    });
  }
  var compCS = getComputedStyle(comp);
  R.composer = {
    rect: rect(comp),
    scrollWidth: comp.scrollWidth, clientWidth: comp.clientWidth,
    overflowX: comp.scrollWidth - comp.clientWidth,
    display: compCS.display, flexWrap: compCS.flexWrap, overflowX_css: compCS.overflowX,
    gap: compCS.gap, padding: compCS.padding,
    childCount: comp.children.length,
    children: kids,
    // 每个孩子右边界是否超出 composer 右边界
    childrenBeyondRight: kids.filter(function (k) { return k.rect.right > cr.right + 0.6; }).map(function (k) { return k.id || k.cls; }),
    // 孩子之间是否重叠
    overlap: (function () {
      var o = [];
      for (var i = 1; i < kids.length; i++) {
        if (kids[i].rect.left < kids[i - 1].rect.right - 0.6 && kids[i].rect.w > 0 && kids[i - 1].rect.w > 0) {
          o.push(kids[i - 1].id || kids[i - 1].cls, '->', kids[i].id || kids[i].cls);
        }
      }
      return o;
    })()
  };
}
/* #imLocBtn 相关 */
var locBtn = document.getElementById('imLocBtn');
R.locBtn = locBtn ? {
  exists: true, rect: rect(locBtn), title: locBtn.getAttribute('title'),
  onclick: locBtn.getAttribute('onclick'), visible: (locBtn.getBoundingClientRect().width > 0),
  parentId: locBtn.parentNode && locBtn.parentNode.id,
  parentCls: locBtn.parentNode && (locBtn.parentNode.className || '').toString()
} : { exists: false };
/* 与「所在位置」语义入口的邻近度：找 composer 内所有带 title 的图标，报告其 x 顺序 */
R.composerIconOrder = [];
if (comp) {
  var ics = comp.querySelectorAll('.im-icon, button');
  for (var j = 0; j < ics.length; j++) {
    R.composerIconOrder.push({ id: ics[j].id || '', title: ics[j].getAttribute('title') || '',
      x: +ics[j].getBoundingClientRect().x.toFixed(1) });
  }
}

/* ================= B. .xtlp 位置层四档 ================= */
R.regionFn = {
  XTRegion: typeof window.XTRegion,
  keys: window.XTRegion ? Object.keys(window.XTRegion) : null,
  XT_LOC_PICK: typeof window.XT_LOC_PICK,
  locPickKeys: window.XT_LOC_PICK ? Object.keys(window.XT_LOC_PICK) : null,
  openPicker: typeof window.xtRegionOpenPicker
};
R.xtlpBeforeOpen = !!document.querySelector('.xtlp');

/* 打开位置选择层（.xtlp） */
var opened = false, openErr = '';
try {
  if (window.XT_LOC_PICK && typeof window.XT_LOC_PICK.openPicker === 'function') {
    window.XT_LOC_PICK.openPicker({ title: 'R90测试' }, function () { });
    opened = true;
  } else if (typeof window.xtRegionOpenPicker === 'function') {
    window.xtRegionOpenPicker({ title: 'R90测试' }, function () { });
    opened = true;
  }
} catch (e) { openErr = String(e && e.message || e).slice(0, 300); }
R.openAttempt = { opened: opened, err: openErr };

var lyr = document.querySelector('.xtlp');
R.xtlpExists = !!lyr;
if (lyr) {
  var lcs = getComputedStyle(lyr);
  R.xtlp = {
    rect: rect(lyr),
    position: lcs.position, inset: lcs.inset, top: lcs.top, left: lcs.left, right: lcs.right, bottom: lcs.bottom,
    display: lcs.display, flexDirection: lcs.flexDirection, zIndex: lcs.zIndex,
    overflow: lcs.overflow
  };
  var bodyEl = lyr.querySelector('.xtlp-body');
  R.xtlpBody = null;
  if (bodyEl) {
    var bcs = getComputedStyle(bodyEl);
    R.xtlpBody = {
      rect: rect(bodyEl), display: bcs.display, flexDirection: bcs.flexDirection,
      overflowY: bcs.overflowY, minHeight: bcs.minHeight, height: bcs.height,
      scrollHeight: bodyEl.scrollHeight, clientHeight: bodyEl.clientHeight,
      overflowYpx: bodyEl.scrollHeight - bodyEl.clientHeight
    };
  }
  function part(sel, label) {
    var el = lyr.querySelector(sel);
    if (!el) { return { sel: sel, label: label, found: false }; }
    var cs = getComputedStyle(el);
    return {
      sel: sel, label: label, found: true, rect: rect(el),
      height: cs.height, minHeight: cs.minHeight, maxHeight: cs.maxHeight,
      overflowY: cs.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight
    };
  }
  R.parts = {
    head: part('.xtlp-head', '头部'),
    search: part('.xtlp-search', '搜索'),
    map: part('.xtlp-map', '地图'),
    list: part('.xtlp-list', '列表'),
    foot: part('.xtlp-foot', '底部')
  };
  /* ★ 核心断言：foot.bottom <= innerHeight */
  var foot = lyr.querySelector('.xtlp-foot');
  var listEl = lyr.querySelector('.xtlp-list');
  R.core = {
    innerHeight: innerHeight,
    footBottom: foot ? +foot.getBoundingClientRect().bottom.toFixed(1) : null,
    footOverflowPx: foot ? +(foot.getBoundingClientRect().bottom - innerHeight).toFixed(1) : null,
    footVisible: foot ? foot.getBoundingClientRect().bottom <= innerHeight + 0.5 : null,
    listClientHeight: listEl ? listEl.clientHeight : null,
    listMinOK: listEl ? listEl.clientHeight >= 180 : null,
    listScrollable: listEl ? (listEl.scrollHeight > listEl.clientHeight) : null
  };
  /* 列表真实可滚动性 */
  if (listEl) {
    var before = listEl.scrollTop;
    listEl.scrollTop = 9999;
    var after = listEl.scrollTop;
    R.core.listScrollTopBefore = before;
    R.core.listScrollTopAfter = after;
    R.core.listScrollReallyWorks = (after > before) || (listEl.scrollHeight <= listEl.clientHeight);
    listEl.scrollTop = before;
  }
  /* 高度累加核算 */
  R.overheadAbove = (function () {
    var s = 0, order = ['.xtlp-head', '.xtlp-search', '.xtlp-map'];
    var prevBottom = null, gaps = [];
    var lyrTop = lyr.getBoundingClientRect().top;
    order.forEach(function (sel) {
      var el = lyr.querySelector(sel);
      if (!el) { return; }
      var r = el.getBoundingClientRect();
      if (prevBottom !== null) { gaps.push(+(r.top - prevBottom).toFixed(1)); }
      s += r.height;
      prevBottom = r.bottom;
    });
    var listTop = listEl ? listEl.getBoundingClientRect().top : null;
    return { sumBlocks: +s.toFixed(1), gaps: gaps, fromLayerTopToListTop: listTop !== null ? +(listTop - lyrTop).toFixed(1) : null };
  })();
  R.xtlpClass = lyr.className;
  R.xtlpHtmlHead = lyr.outerHTML.slice(0, 900);

  /* ---------- 因果对比：禁用断点规则，看是否溢出 ---------- */
  R.causal = {};
  try {
    // 记录修复态
    var fixedFootBottom = foot ? foot.getBoundingClientRect().bottom : null;
    // 收集所有样式表规则里含 .xtlp 的媒体查询断点
    var breakpoints = [];
    for (var si = 0; si < document.styleSheets.length; si++) {
      var sh = document.styleSheets[si];
      var rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var ri = 0; ri < rules.length; ri++) {
        var rule = rules[ri];
        if (rule.type === 4 /* MEDIA_RULE */) {
          var txt = rule.conditionText || rule.media.mediaText || '';
          var inner = rule.cssRules ? rule.cssRules : [];
          var hits = [];
          for (var ii = 0; ii < inner.length; ii++) {
            var s2 = inner[ii].cssText || '';
            if (s2.indexOf('.xtlp') >= 0) { hits.push(s2.slice(0, 160)); }
          }
          if (hits.length) { breakpoints.push({ cond: txt, sel: (parseInt(txt.replace(/\D/g, ''), 10) || 0), rules: hits }); }
        }
      }
    }
    R.causal.mediaBreakpointsWithXtlp = breakpoints;
    // 禁用所有含 .xtlp 的 media 规则 → 模拟「无修复」
    var disabled = [];
    for (var si2 = 0; si2 < document.styleSheets.length; si2++) {
      var sh2 = document.styleSheets[si2];
      var rr; try { rr = sh2.cssRules; } catch (e) { continue; }
      if (!rr) continue;
      for (var ri2 = 0; ri2 < rr.length; ri2++) {
        var rl = rr[ri2];
        if (rl.type === 4 && (rl.conditionText || '').indexOf('xtlp') < 0) {
          var hitsAll = [];
          for (var k2 = 0; k2 < rl.cssRules.length; k2++) { if ((rl.cssRules[k2].cssText || '').indexOf('.xtlp') >= 0) hitsAll.push(k2); }
          if (hitsAll.length) {
            try {
              // 媒体规则整体禁用（按条件匹配的断点）
              var cond = rl.conditionText || rl.media.mediaText;
              var maxW = /max-width:\s*(\d+)px/.exec(cond);
              var maxH = /max-height:\s*(\d+)px/.exec(cond);
              var matches = false;
              if (maxW && innerWidth <= parseInt(maxW[1], 10)) matches = true;
              if (maxH && innerHeight <= parseInt(maxH[1], 10)) matches = true;
              if (matches) {
                // 改成不匹配的条件来「禁用」
                if (rl.media && rl.media.mediaText !== undefined && rl.media.mediaText !== null) {
                  rl.media.mediaText = 'screen and (min-width:99999px)';
                }
                disabled.push(cond);
              }
            } catch (e) { }
          }
        }
      }
    }
    R.causal.disabledConds = disabled;
    // 重测
    var foot2 = lyr.querySelector('.xtlp-foot');
    var list3 = lyr.querySelector('.xtlp-list');
    R.causal.afterDisable = {
      footBottom: foot2 ? +foot2.getBoundingClientRect().bottom.toFixed(1) : null,
      footOverflowPx: foot2 ? +(foot2.getBoundingClientRect().bottom - innerHeight).toFixed(1) : null,
      footOverflowing: foot2 ? foot2.getBoundingClientRect().bottom > innerHeight + 0.5 : null,
      listClientHeight: list3 ? list3.clientHeight : null,
      mapHeight: (function () { var mp = lyr.querySelector('.xtlp-map'); return mp ? +mp.getBoundingClientRect().height.toFixed(1) : null; })(),
      headHeight: (function () { var mp = lyr.querySelector('.xtlp-head'); return mp ? +mp.getBoundingClientRect().height.toFixed(1) : null; })(),
      footHeight: (function () { var mp = lyr.querySelector('.xtlp-foot'); return mp ? +mp.getBoundingClientRect().height.toFixed(1) : null; })()
    };
    R.causal.beforeDisable = {
      footBottom: fixedFootBottom === null ? null : +fixedFootBottom.toFixed(1),
      footOverflowing: fixedFootBottom === null ? null : fixedFootBottom > innerHeight + 0.5,
      mapHeight: R.parts.map.found ? R.parts.map.rect.h : null,
      headHeight: R.parts.head.found ? R.parts.head.rect.h : null,
      footHeight: R.parts.foot.found ? R.parts.foot.rect.h : null,
      listClientHeight: R.core.listClientHeight
    };
  } catch (e) { R.causal.err = String(e && e.message || e).slice(0, 300); }
}

return R;
