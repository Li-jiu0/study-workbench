/* L5 验证：三种题型右栏是否出现空卡片 */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom').JSDOM;

var ROOT = 'D:/下载的文件/学习工作台';
var out = [];

function load(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

var dom = new JSDOM('<!doctype html><html><head></head><body><div id="slot"></div></body></html>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
var win = dom.window;

// 伪造 XTC 缺失时的 icon 函数（老 webview 场景模拟）
win.eval(load('assets/data-cet-read.js'));
win.eval(load('assets/xt-content.js'));
win.eval(load('assets/cet-read.js'));

if (!win.CET_READ || !win.CET_READ.passages) { out.push('FATAL: data not loaded'); console.log(out.join('\n')); process.exit(1); }

out.push('passages = ' + win.CET_READ.passages.map(function (p) {
  return p.id + ':' + p.type;
}).join(' , '));
win.CET_READ.passages.forEach(function (p) {
  out.push('  ' + p.id + ' type=' + p.type +
    ' blanks=' + ((p.blanks || []).length) +
    ' stats=' + ((p.stats || []).length) +
    ' qs=' + ((p.qs || []).length) +
    ' options=' + ((p.options || []).length) +
    ' paras=' + ((p.paras || []).length));
});

var slot = win.document.getElementById('slot');

function isEmpty(n) {
  if (!n) return true;
  var txt = (n.textContent || '').replace(/\s+/g, '');
  if (txt.length > 0) return false;
  return n.children.length === 0;
}

function inspectRightCol(label) {
  var grid = slot.querySelector('.cr-grid');
  if (!grid) { out.push('[' + label + '] NO .cr-grid'); return; }
  var right = grid.querySelector('.cr-col-quiz');
  if (!right) { out.push('[' + label + '] NO .cr-col-quiz'); return; }
  out.push('[' + label + '] gridClass="' + grid.className + '" rightChildren=' + right.children.length);
  for (var i = 0; i < right.children.length; i++) {
    var c = right.children[i];
    var cls = c.className || '(no-class)';
    var html = c.innerHTML || '';
    var empty = isEmpty(c);
    out.push('    child#' + i + ' tag=' + c.tagName + ' id=' + (c.id || '-') +
      ' cls=' + cls + ' htmlLen=' + html.length +
      ' visibleEmpty=' + (empty ? 'YES <<<< EMPTY CARD' : 'no'));
    if (empty) {
      out.push('        >>> innerHTML=[' + html + ']');
    }
  }
  // 任何带 .cr-quiz-card 外观的空白卡片
  var cards = right.querySelectorAll('.cr-quiz-card');
  for (var k = 0; k < cards.length; k++) {
    if (isEmpty(cards[k])) out.push('    !!!! .cr-quiz-card EMPTY at index ' + k);
  }
}

// 首渲染（默认 tab=cloze）
win.CETV2['cet-read'](slot);
inspectRightCol('cloze');

// 切 tab：match
var tabs = slot.querySelectorAll('#crTabs .xt-tab');
out.push('tabs found = ' + tabs.length + ' -> ' + Array.prototype.map.call(tabs, function (t) {
  return t.getAttribute('data-xt-tab');
}).join(','));

function clickTab(id) {
  var found = null;
  var ts = slot.querySelectorAll('#crTabs .xt-tab');
  for (var i = 0; i < ts.length; i++) if (ts[i].getAttribute('data-xt-tab') === id) found = ts[i];
  if (!found) { out.push('tab ' + id + ' not found'); return false; }
  found.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  return true;
}

clickTab('match');
inspectRightCol('match');

clickTab('careful');
inspectRightCol('careful #1');

// 仔细阅读有子 tab，切到第 2 篇
var subs = slot.querySelectorAll('#crSubTabs .xt-tab');
out.push('subtabs = ' + subs.length + ' -> ' + Array.prototype.map.call(subs, function (t) {
  return t.getAttribute('data-xt-tab');
}).join(','));
if (subs.length > 1) {
  subs[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  inspectRightCol('careful #2 (after subtab switch)');
}

// tips tab
clickTab('tips');
out.push('[tips] ' + (slot.querySelector('#crBody') ? 'rendered' : 'no body'));

/* ---------- 边界用例：数据缺字段 / 题量为 0 时右栏是否仍是空卡片 ---------- */
function renderFresh(mutate) {
  slot.innerHTML = '';
  win.CET_READ.passages = JSON.parse(JSON.stringify(RAW));
  if (mutate) mutate(win.CET_READ.passages);
  try {
    win.CETV2['cet-read'](slot);
  } catch (e) {
    out.push('    !! render threw: ' + e.message);
    return;
  }
}
var RAW = JSON.parse(JSON.stringify(win.CET_READ.passages));

out.push('');
out.push('=== EDGE 1: cloze 缺 blanks/options ===');
renderFresh(function (ps) { delete ps[0].blanks; delete ps[0].options; });
clickTab('cloze');
inspectRightCol('cloze(no blanks/options)');

out.push('=== EDGE 2: cloze blanks=[] ===');
renderFresh(function (ps) { ps[0].blanks = []; });
clickTab('cloze');
inspectRightCol('cloze(blanks=[])');

out.push('=== EDGE 3: match 缺 paras/stats ===');
renderFresh(function (ps) { delete ps[1].paras; delete ps[1].stats; });
clickTab('match');
inspectRightCol('match(no paras/stats)');

out.push('=== EDGE 4: careful qs=[] （第 1 篇） ===');
renderFresh(function (ps) { ps[2].qs = []; });
clickTab('careful');
inspectRightCol('careful(qs=[])');

out.push('=== EDGE 5: XTC 整体缺失（脚本加载失败模拟） ===');
renderFresh(null);
clickTab('cloze');
win.XTC = undefined;
slot.innerHTML = '';
try { win.CETV2['cet-read'](slot); } catch (e) { out.push('    !! threw: ' + e.message); }
inspectRightCol('no-XTC cloze');

fs.writeFileSync(path.join(ROOT, '_t5_out.txt'), out.join('\n'), 'utf8');
console.log('OK');
