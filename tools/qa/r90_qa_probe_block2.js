/* r90_qa_probe_block2.js — 块2 探针：私聊页加号菜单 + 输入栏 + .xtlp 位置层
 * 在页面内求值，return JSON。
 */
var R = {};

/* ---------- 1. 加号菜单项 ---------- */
var menu = document.getElementById('imPlusMenu');
R.menuFound = !!menu;
if (menu) {
  var items = menu.querySelectorAll('.im-plus-item');
  R.plusItemCount = items.length;
  R.plusItems = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    R.plusItems.push({
      idx: i,
      text: (it.textContent || '').replace(/\s+/g, ' ').trim(),
      id: it.id || '',
      cls: it.className,
      raw: it.outerHTML.slice(0, 260)
    });
  }
  R.menuHasLocText = (menu.textContent || '').indexOf('定位') >= 0;
  R.menuHtmlHead = menu.outerHTML.slice(0, 1500);
}

/* ---------- 2. 「所在位置」附近按钮 ---------- */
R.locWords = {};
['所在位置', '位置', '定位', '地区'].forEach(function (w) {
  var hits = [];
  var all = document.querySelectorAll('button,div,span,a');
  for (var i = 0; i < all.length && hits.length < 8; i++) {
    var el = all[i];
    if (el.children.length) continue;               // 只看叶子
    var tx = (el.textContent || '').trim();
    if (tx === w) {
      var r = el.getBoundingClientRect();
      hits.push({
        tag: el.tagName, id: el.id || '', cls: (el.className || '').toString().slice(0, 90),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        visible: r.width > 0 && r.height > 0
      });
    }
  }
  R.locWords[w] = hits;
});

/* ---------- 3. 输入栏那一排图标的溢出测量 ---------- */
function overflowReport(sel, label) {
  var el = document.querySelector(sel);
  if (!el) { return { sel: sel, found: false }; }
  var r = el.getBoundingClientRect();
  var cs = getComputedStyle(el);
  return {
    sel: sel, label: label, found: true,
    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    overflowX: el.scrollWidth - el.clientWidth,
    rect: { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) },
    display: cs.display, overflowX_css: cs.overflowX, flexWrap: cs.flexWrap,
    childCount: el.children.length
  };
}
R.inputBarCands = [];
['#imInputBar', '.im-input-bar', '.im-bar', '.im-tools', '#imTools', '.im-input-tools',
  '.im-input', '#imInputWrap', '.im-send-row'].forEach(function (s) {
    if (document.querySelector(s)) { R.inputBarCands.push(overflowReport(s, s)); }
  });
// 兜底：找含「发送」按钮的行
(function () {
  var btns = document.querySelectorAll('button,a,div');
  for (var i = 0; i < btns.length; i++) {
    var t = (btns[i].textContent || '').trim();
    if (t === '发送' && btns[i].parentNode) {
      R.sendRow = overflowReport('#' + (btns[i].parentNode.id || '__noid'), '发送按钮父元素');
      if (!btns[i].parentNode.id) {
        var pr = btns[i].parentNode.getBoundingClientRect();
        var pcs = getComputedStyle(btns[i].parentNode);
        R.sendRow.rect = { x: Math.round(pr.x), w: Math.round(pr.width), h: Math.round(pr.height) };
        R.sendRow.cls = (btns[i].parentNode.className || '').toString();
        R.sendRow.children = btns[i].parentNode.children.length;
        R.sendRow.scrollWidth = btns[i].parentNode.scrollWidth;
        R.sendRow.clientWidth = btns[i].parentNode.clientWidth;
        R.sendRow.overflowX = btns[i].parentNode.scrollWidth - btns[i].parentNode.clientWidth;
        R.sendRow.display = pcs.display;
        R.sendRow.flexWrap = pcs.flexWrap;
      }
      break;
    }
  }
})();

/* ---------- 4. openPicker / imPlusPickLocation 可达性 ---------- */
R.fn = {
  xtRegionOpenPicker: typeof (window.xtRegionOpenPicker || (window.XTRegion && window.XTRegion.openPicker)),
  xtRegionObj: typeof window.XTRegion,
  xtRegionKeys: window.XTRegion ? Object.keys(window.XTRegion) : null,
  imPlusPickLocation: typeof window.imPlusPickLocation,
  xtmNavHook: typeof window.xtmNavHook,
  pickerOpenPickerPath: ''
};
try {
  if (window.XTRegion && typeof window.XTRegion.openPicker === 'function') {
    R.fn.pickerOpenPickerPath = String(window.XTRegion.openPicker).slice(0, 400);
  }
} catch (e) { R.fn.pickErr = String(e); }

R.viewport = { w: innerWidth, h: innerHeight };

/* ---------- 5. 尝试打开加号菜单，看真实渲染 ---------- */
(function () {
  var trigger = document.querySelector('#imPlusBtn, .im-plus-btn, [data-act="plus"]');
  R.plusTriggerFound = !!trigger;
  if (trigger) {
    trigger.click();
    R.menuAfterClickOpen = !!(menu && (menu.classList.contains('on') || menu.style.display !== 'none'));
    if (menu) {
      var items2 = menu.querySelectorAll('.im-plus-item');
      R.plusItemCountAfterClick = items2.length;
      R.plusTextsAfterClick = [];
      for (var i = 0; i < items2.length; i++) {
        R.plusTextsAfterClick.push((items2[i].textContent || '').replace(/\s+/g, ' ').trim());
      }
    }
  }
})();

return R;
