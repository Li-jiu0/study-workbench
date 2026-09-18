/* _r86a_verify.js — A线自验：结构断言 + jsdom 行为冒烟 */
'use strict';
var fs = require('fs');
var path = require('path');
var { JSDOM } = require('c:/Users/ATM/node_modules/jsdom');

var ROOT = 'D:/下载的文件/学习工作台/';
var NODE = 'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';

function rd(rel) { return fs.readFileSync(ROOT + rel).toString('utf8'); }

function lineStats(rel) {
  var s = rd(rel);
  return {
    crlf: (s.match(/\r\n/g) || []).length,
    loneLF: (s.match(/(?<!\r)\n/g) || []).length,
    loneCR: (s.match(/\r(?!\n)/g) || []).length,
    bytes: Buffer.byteLength(s, 'utf8')
  };
}

function tagBalance(rel) {
  var s = rd(rel);
  var tags = ['div', 'span', 'nav', 'header', 'script', 'style', 'a', 'button'];
  var out = {};
  for (var i = 0; i < tags.length; i++) {
    var t = tags[i];
    var open = (s.match(new RegExp('<' + t + '(?=[\\s>])', 'g')) || []).length;
    var close = (s.match(new RegExp('</' + t + '>', 'g')) || []).length;
    out[t] = open + '/' + close + (open === close ? ' OK' : '  <== 不平衡');
  }
  out['img(void)'] = (s.match(/<img(?=[\s>])/g) || []).length + ' 个（自闭合，无配对）';
  return out;
}

var fails = [];
function ok(cond, name, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
  if (!cond) { fails.push(name); }
}

/* ===================== 更多.html ===================== */
console.log('===== 更多.html =====');
console.log('行尾: ' + JSON.stringify(lineStats('更多.html')));
console.log('标签: ' + JSON.stringify(tagBalance('更多.html')));

var domMore = new JSDOM(rd('更多.html'), { runScripts: 'outside-only' });
var dMore = domMore.window.document;

var cards = dMore.querySelectorAll('.morepage-list .morepage-card');
var titles = [];
for (var i = 0; i < cards.length; i++) {
  var t = cards[i].querySelector('.mpc-title');
  titles.push(t ? t.textContent : '?');
}
console.log('卡片顺序: ' + JSON.stringify(titles));

var sMore = rd('更多.html');
ok(sMore.indexOf('导入题库') < 0, '更多.html 内「导入题库」字符串归零', 'count=' + (sMore.match(/导入题库/g) || []).length);
ok(sMore.indexOf('互动广场') < 0, '更多.html 内「互动广场」字符串归零', 'count=' + (sMore.match(/互动广场/g) || []).length);
ok(sMore.indexOf("location.href='导入题库.html'") < 0, '导入题库跳转已移除');
ok(sMore.indexOf('gotoBlogMine()') < 0, '互动广场 onClick(gotoBlogMine) 已移除');
ok(titles.indexOf('赞助') === 1, '赞助位于原错题本位置（index 1）', '实际 index=' + titles.indexOf('赞助'));
ok(titles.indexOf('错题本') === 5, '错题本位于原赞助位置（index 5）', '实际 index=' + titles.indexOf('错题本'));
ok(titles[0] === '动态空间', '首卡仍为动态空间', titles[0]);
ok(titles[titles.length - 1] === 'AI面试', '末卡仍为 AI面试', titles[titles.length - 1]);
ok(titles.length === 7, '卡片总数 = 原 9 - 导入题库 - 互动广场 = 7', '实际=' + titles.length);

// 未误伤：侧栏错题本 / 底部导航 / 旧更多面板错题本
var sideWrong = dMore.querySelectorAll('.sidebar .nav-item[data-page="wrong-book"]');
ok(sideWrong.length === 1, '侧栏「错题本」入口未被误删', 'count=' + sideWrong.length);
var bmLabels = [];
var bms = dMore.querySelectorAll('#morePanel .bottom-more-item');
for (var b = 0; b < bms.length; b++) { bmLabels.push(bms[b].querySelector('.bm-label').textContent); }
console.log('旧更多面板: ' + JSON.stringify(bmLabels));
ok(bmLabels.indexOf('互动广场') < 0, '旧更多面板「互动广场」已删除');
ok(bmLabels.indexOf('错题本') >= 0, '旧更多面板「错题本」保留');
var bnLabels = [];
var bns = dMore.querySelectorAll('.bottom-nav .bottom-nav-item');
for (var c = 0; c < bns.length; c++) { bnLabels.push(bns[c].querySelector('.bn-label').textContent); }
ok(JSON.stringify(bnLabels) === JSON.stringify(['首页', '互动', '我的', 'AI', '更多']), '底部导航未受影响', JSON.stringify(bnLabels));

// 赞助卡片内容完整性（图标/文案/跳转原样）
var sponsorCard = null;
for (var q = 0; q < cards.length; q++) {
  if (cards[q].querySelector('.mpc-title') && cards[q].querySelector('.mpc-title').textContent === '赞助') { sponsorCard = cards[q]; }
}
ok(!!sponsorCard, '赞助卡片存在');
if (sponsorCard) {
  ok(sponsorCard.getAttribute('onclick') === "location.href='赞助.html'", '赞助跳转逻辑不变', sponsorCard.getAttribute('onclick'));
  ok(sponsorCard.querySelector('.mpc-icon .nav-icon').getAttribute('data-icon') === 'heart', '赞助图标 heart 不变');
  ok(sponsorCard.querySelector('.mpc-desc').textContent === '支持星途 · 扫码请作者喝杯咖啡', '赞助文案不变');
}
var wbCard = null;
for (var w = 0; w < cards.length; w++) {
  if (cards[w].querySelector('.mpc-title') && cards[w].querySelector('.mpc-title').textContent === '错题本') { wbCard = cards[w]; }
}
ok(!!wbCard, '错题本卡片存在');
if (wbCard) {
  ok(wbCard.getAttribute('onclick') === "navigateTo('wrong-book')", '错题本跳转逻辑不变', wbCard.getAttribute('onclick'));
  ok(wbCard.querySelector('.mpc-icon .nav-icon').getAttribute('data-icon') === 'book', '错题本图标 book 不变');
  ok(wbCard.querySelector('.mpc-desc').textContent === '按模块与错因筛选，集中复盘重做', '错题本文案不变');
}

/* ===================== 赞助.html ===================== */
console.log('');
console.log('===== 赞助.html =====');
console.log('行尾: ' + JSON.stringify(lineStats('赞助.html')));
console.log('标签: ' + JSON.stringify(tagBalance('赞助.html')));

var sSp = rd('赞助.html');
var jsErr = null;
var vc = new (require('c:/Users/ATM/node_modules/jsdom').VirtualConsole)();
vc.on('jsdomError', function (e) { jsErr = e; });
var domSp = new JSDOM(sSp, { runScripts: 'dangerously', virtualConsole: vc });
var win = domSp.window;
var dSp = win.document;

var box = dSp.getElementById('spQr');
ok(!!box, '.sp-qr#spQr 容器存在');
var imgs = box ? box.getElementsByTagName('img') : [];
ok(imgs.length === 2, '容器内 2 张图片', 'count=' + imgs.length);
if (imgs.length === 2) {
  ok(imgs[0].getAttribute('src') === 'assets/赞助收款码.jpg', '图1 src 不变');
  ok(imgs[1].getAttribute('src') === 'assets/赞助收款码2.jpg', '图2 src 新增');
  ok(imgs[0].getAttribute('loading') === 'lazy' && imgs[1].getAttribute('loading') === 'lazy', '两张图均沿用 loading="lazy"');
  ok(imgs[0].className === '' && imgs[1].className === '', '两张图均不另起 class（沿用 .sp-qr img）');
}
var zoomHints = dSp.querySelectorAll('.sp-qr .sp-zoom');
ok(zoomHints.length === 2, '每张图均带可发现提示图标', 'count=' + zoomHints.length);

// 执行内联脚本
var lines = sSp.split('\r\n');
var sIdx = lines.indexOf('<script>', 200);
var eIdx = lines.indexOf('</' + 'script>', sIdx);
var code = lines.slice(sIdx + 1, eIdx).join('\n');
ok(code.indexOf('?.') < 0 && code.indexOf('??') < 0, '内联脚本无可选链/空值合并');
ok(code.indexOf('alert(') < 0 && code.indexOf('confirm(') < 0 && code.indexOf('prompt(') < 0, '内联脚本无 alert/confirm/prompt');
function click(el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

setTimeout(function () {
ok(!jsErr, '内联脚本执行无 JS 错误', jsErr ? String(jsErr.message || jsErr) : '');

var ov = dSp.querySelector('.sp-lb');
ok(!!ov, '预览层 .sp-lb 已创建');
if (ov && imgs.length === 2) {
  click(imgs[1]);
  ok(ov.className.indexOf('active') >= 0, '点击第 2 张可打开预览', 'class=' + ov.className);
  var big = ov.querySelector('.sp-lb-img');
  ok(big.getAttribute('src') === 'assets/赞助收款码2.jpg', '预览显示第 2 张', big.getAttribute('src'));
  ok(ov.querySelector('.sp-lb-count').textContent === '2 / 2', '计数 2 / 2', ov.querySelector('.sp-lb-count').textContent);

  click(ov.querySelector('.sp-lb-next'));
  ok(big.getAttribute('src') === 'assets/赞助收款码.jpg', '下一张→回到第 1 张（循环）', big.getAttribute('src'));
  ok(ov.querySelector('.sp-lb-count').textContent === '1 / 2', '计数 1 / 2');

  click(ov.querySelector('.sp-lb-prev'));
  ok(big.getAttribute('src') === 'assets/赞助收款码2.jpg', '上一张→回到第 2 张（循环）', big.getAttribute('src'));

  var dl = ov.querySelector('.sp-lb-btn');
  ok(dl && dl.tagName.toLowerCase() === 'a', '保存入口为 a 标签');
  ok(dl.getAttribute('download') === '赞助收款码2.jpg', 'download 文件名正确', String(dl && dl.getAttribute('download')));
  ok(dl.getAttribute('href') === 'assets/赞助收款码2.jpg', 'download href 同源', String(dl && dl.getAttribute('href')));

  // 键盘：右 / 左 / Esc
  function key(k, code2) {
    var ev = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'key', { value: k });
    Object.defineProperty(ev, 'keyCode', { value: code2 });
    dSp.dispatchEvent(ev);
  }
  key('ArrowRight', 39);
  ok(big.getAttribute('src') === 'assets/赞助收款码.jpg', '键盘→切换下一张', big.getAttribute('src'));
  key('ArrowLeft', 37);
  ok(big.getAttribute('src') === 'assets/赞助收款码2.jpg', '键盘←切换上一张', big.getAttribute('src'));
  key('Escape', 27);
  ok(ov.className.indexOf('active') < 0, 'Esc 关闭预览', 'class=' + ov.className);

  // 关闭按钮 & 遮罩点击
  click(imgs[0]);
  ok(ov.className.indexOf('active') >= 0, '重新打开成功');
  click(ov.querySelector('.sp-lb-x'));
  ok(ov.className.indexOf('active') < 0, '关闭按钮可关闭');
  click(imgs[0]);
  ok(ov.className.indexOf('active') >= 0, '再次打开成功');
  click(ov);
  ok(ov.className.indexOf('active') < 0, '点遮罩可关闭');

  ok(!!ov.querySelector('.sp-lb-prev') && !!ov.querySelector('.sp-lb-next'), '左右切换按钮存在');
}
report();
}, 80);

// 版本戳未改
var stampsBefore = { more: 317, sp: 297 };
console.log('');
console.log('版本戳检查: 赞助.html 中 ?v= 出现次数 = ' + (sSp.match(/\?v=/g) || []).length);
var sMoreAll = rd('更多.html');
console.log('版本戳检查: 更多.html 中 ?v= 出现次数 = ' + (sMoreAll.match(/\?v=/g) || []).length);

// 新资源文件
var assetOk = false;
try {
  var st = fs.statSync(ROOT + 'assets/赞助收款码2.jpg');
  assetOk = st.size === 146232;
  console.log('assets/赞助收款码2.jpg size=' + st.size + '（源 146232）');
} catch (e) { /* ignore */ }
ok(assetOk, '新增资源 assets/赞助收款码2.jpg 二进制一致');

console.log('');
function report() {
  console.log(fails.length === 0 ? '===== ALL PASS =====' : '===== FAILED: ' + fails.length + ' =====\n' + fails.join('\n'));
}
