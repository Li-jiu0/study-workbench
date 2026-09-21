/* 量 .xtlp 内部各段的真实高度，供 r89b 定 maxH 常量 */
(function () {
  var R = { vp: innerWidth + 'x' + innerHeight };
  var LP = window.XT_LOC_PICK;
  if (!LP || typeof LP.openPicker !== 'function') { R.fatal = 'no openPicker'; return R; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rc(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; }

  return (async function () {
    LP.openPicker({ title: 'QA量尺', confirmText: '确定' }, function () { });
    await wait(300);

    var root = document.querySelector('.xtlp');
    if (!root) { R.fatal = 'no .xtlp'; return R; }
    var body = root.querySelector('.xtlp-body');
    var head = root.querySelector('.xtlp-head');
    var search = root.querySelector('.xtlp-search');
    var map = root.querySelector('.xtlp-map');
    var curline = root.querySelector('.xtlp-curline');
    var list = root.querySelector('.xtlp-list');
    var foot = root.querySelector('.xtlp-foot');

    R.rootRect = rc(root);
    R.bodyRect = rc(body);
    R.headRect = rc(head);
    R.searchRect = rc(search);
    R.mapRect = rc(map);
    R.curlineRect = rc(curline);
    R.listRect = rc(list);
    R.footRect = rc(foot);

    // 关键：list 上方累计高度
    if (list && foot) {
      R.listTop = Math.round(list.getBoundingClientRect().top);
      R.footTop = Math.round(foot.getBoundingClientRect().top);
      R.listHeight = Math.round(list.getBoundingClientRect().height);
      R.footHeight = Math.round(foot.getBoundingClientRect().height);
      // 视口可用高 = innerHeight；开销 = innerHeight - listHeight
      R.overheadAll = innerHeight - R.listHeight;              // 上下全算
      R.overheadAbove = R.listTop;                             // list 顶部以上
      R.overheadBelow = innerHeight - (R.listTop + R.listHeight); // list 底部以下
      R.configuredMaxH = list.style.maxHeight;
      R.cssMaxHCap = getComputedStyle(list).maxHeight;
      R.scrollH = list.scrollHeight; R.clientH = list.clientHeight;
      R.isActuallyCappedByStyle = parseFloat(R.configuredMaxH) <= R.clientH + 1;
      // head 下沿到 search 上沿的 margin、map 到 list 的 margin 等
      if (head && search) R.gapHeadSearch = Math.round(search.getBoundingClientRect().top - head.getBoundingClientRect().bottom);
      if (map && list) R.gapMapList = Math.round(list.getBoundingClientRect().top - map.getBoundingClientRect().bottom);
      if (search && map) R.gapSearchMap = Math.round(map.getBoundingClientRect().top - search.getBoundingClientRect().bottom);
    }
    return R;
  })();
})();
