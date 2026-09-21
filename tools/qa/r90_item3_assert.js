/**
 * R90 item3 jsdom assertions.
 *
 * T1  私聊.html 动作1： #imPlusMenu 仍存在，但「定位」项已删除；.im-plus-item 计数 = 3
 * T2  私聊.html 动作2： #imLocBtn 存在、class 含 im-icon、onclick 走 imPlusPickLocation
 *      （jsdom 不做布局，故 320px 不换行用「窄屏 @media 规则已写入页面 <style>」+ 结构断言）
 * T3  私聊.html 动作2b：窄屏 @media (max-width:360px) 收紧 .im-composer 规则存在
 * T4  assets/xt-region.js 动作3： openPicker 注入样式含溢出兜底 + 矮屏 @media
 *      (.xtlp overflow:hidden / .xtlp-list flex:1 1 auto + min-height:180px /
 *       @media (max-height:560px) 含 map 110px、head 7px 10px、foot 8px 12px 10px)
 * T5  向后兼容：openPicker(opts,cb) 签名不变，不传参/只传 title/全参均不抛
 * T6  R89-B 未回退：.xtlp-body 结构性修复仍在（position:absolute;inset:0;display:flex;column）
 *
 * Assertion strategy: jsdom does not compute layout. "不被截断" / "不换行" are proven by
 * (a) real-Chrome CDP four-viewport run (external), and here by (b) authored-CSS text
 * assertions proving the fix rules are actually injected, plus the structural invariants.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var ROOT = path.resolve(__dirname, '..', '..');
var pass = 0, fail = 0, lines = [];
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('  PASS  ' + name); }
  else { fail++; lines.push('  FAIL  ' + name + (extra ? ('  << ' + extra) : '')); }
}
function section(t) { lines.push(''); lines.push('== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function newDom(rel) {
  var html = read(rel);
  return new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/')
  });
}

/* ============================================================
 * T1..T3  私聊.html
 * ============================================================ */
section('T1/T2/T3 私聊.html 动作1+2');
(function () {
  var dom = newDom('私聊.html');
  var win = dom.window, doc = win.document;

  var menu = doc.querySelector('#imPlusMenu');
  ok('#imPlusMenu 仍存在', !!menu);

  var items = doc.querySelectorAll('#imPlusMenu .im-plus-item');
  ok('#imPlusMenu .im-plus-item 计数 = 3（动作1 回归）', items.length === 3, 'count=' + items.length);

  // 菜单内文案不得再含「定位」（动作1 直接证据）
  var menuText = menu ? (menu.textContent || '') : '';
  ok('加号菜单内文案不再含「定位」', menuText.indexOf('定位') < 0, JSON.stringify(menuText));
  ok('加号菜单仍保留 相册发图/拍摄/发送文件', menuText.indexOf('相册发图') >= 0 && menuText.indexOf('拍摄') >= 0 && menuText.indexOf('发送文件') >= 0, JSON.stringify(menuText));

  // 加号菜单里不应再有 imPlusPickLocation 的 onclick
  ok('加号菜单不再有 imPlusPickLocation 入口', !/imPlusMenu[\s\S]*imPlusPickLocation/.test(doc.body.innerHTML) ||
    doc.querySelectorAll('#imPlusMenu [onclick*="imPlusPickLocation"]').length === 0);

  // 动作2：独立定位按钮
  var locBtn = doc.querySelector('#imLocBtn');
  ok('#imLocBtn 存在（动作2）', !!locBtn);
  ok('#imLocBtn class 含 im-icon（复用既有类，不新造样式）', !!locBtn && /(^|\s)im-icon(\s|$)/.test(locBtn.className), locBtn && locBtn.className);
  ok('#imLocBtn onclick 走 imPlusPickLocation', !!locBtn && (locBtn.getAttribute('onclick') || '').indexOf('imPlusPickLocation') >= 0, locBtn && locBtn.getAttribute('onclick'));
  ok('#imLocBtn 图标 data-icon="map-pin"', !!locBtn && !!locBtn.querySelector('[data-icon="map-pin"]'));
  ok('#imLocBtn 紧邻 #imPlusBtn（同在输入栏图标排）',
    !!locBtn && !!doc.querySelector('#imPlusBtn') &&
    locBtn.parentNode === doc.querySelector('#imPlusBtn').parentNode);

  // 动作2b：窄屏 @media 规则写进本页 <style>
  var pageCss = Array.prototype.slice.call(doc.querySelectorAll('style')).map(function (s) { return s.textContent || ''; }).join('\n');
  ok('本页 <style> 含 @media (max-width:360px) 收紧 .im-composer', /@media\s*\(max-width:360px\)[\s\S]*?\.im-composer/.test(pageCss));
  ok('窄屏规则含 .im-composer .im-icon 尺寸收紧', /\.im-composer\s+\.im-icon\s*\{[^}]*width:\s*38px/.test(pageCss));
  ok('本页 CSS 未使用 clamp()/min()/max()', !/\bclamp\s*\(/.test(pageCss) && !/\bmin\s*\(/.test(pageCss) && !/\bmax\s*\(/.test(pageCss));

  win.close();
})();

/* ============================================================
 * T4/T5/T6  assets/xt-region.js openPicker
 * ============================================================ */
section('T4/T5/T6 xt-region.js 动作3 + 兼容 + R89-B 未回退');
(function () {
  var dom = newDom('私聊.html');
  var win = dom.window, doc = win.document;
  win.eval(read('assets/xt-region.js'));

  ok('window.XT_LOC_PICK.openPicker 存在', !!(win.XT_LOC_PICK && typeof win.XT_LOC_PICK.openPicker === 'function'));

  var threw = null;
  try {
    win.XT_LOC_PICK.openPicker({ title: '发送位置', confirmText: '发送' });
  } catch (e) { threw = e; }
  ok('openPicker(opts) 不抛异常', threw === null, threw && threw.message);

  var root = doc.querySelector('.xtlp');
  var styleEl = root ? root.querySelector('style') : null;
  var css = styleEl ? styleEl.textContent : '';
  ok('注入 <style> 存在', !!styleEl);

  // C1: .xtlp overflow:hidden
  ok('.xtlp 含 overflow:hidden 兜底', /\.xtlp\{[^}]*overflow:\s*hidden/.test(css));
  // C2: list flex auto + min-height 180
  var listRule = (css.match(/\.xtlp-list\{[^}]*\}/) || [''])[0];
  ok('.xtlp-list flex:1 1 auto', /flex:\s*1\s+1\s+auto/.test(listRule), listRule);
  ok('.xtlp-list min-height:180px（下限口径）', /min-height:\s*180px/.test(listRule), listRule);
  ok('.xtlp-list 保留 overflow-y:auto（可滚）', /overflow-y:\s*auto/.test(listRule), listRule);
  // C3: @media max-height 560
  ok('注入样式含 @media (max-height:560px)', /@media\s*\(max-height:560px\)/.test(css));
  var media = (css.match(/@media\s*\(max-height:560px\)\{[\s\S]*?\}\s*['"]?\s*$/) || [''])[0];
  // 更稳妥：截取 media 段片段
  var mi = css.indexOf('@media (max-height:560px)');
  var seg = mi >= 0 ? css.slice(mi, mi + 400) : '';
  ok('矮屏断点内 .xtlp-map height:110px', /\.xtlp-map\{[^}]*height:\s*110px/.test(seg), seg);
  ok('矮屏断点内 .xtlp-head padding:7px 10px', /\.xtlp-head\{[^}]*padding:\s*7px\s+10px/.test(seg), seg);
  ok('矮屏断点内 .xtlp-foot padding:8px 12px 10px', /\.xtlp-foot\{[^}]*padding:\s*8px\s+12px\s+10px/.test(seg), seg);
  ok('矮屏断点内 .xtlp-search 收紧', /\.xtlp-search\{[^}]*margin:\s*7px/.test(seg), seg);
  ok('注入 CSS 未使用 clamp()/min()/max()', !/\bclamp\s*\(/.test(css) && !/\bmin\s*\(/.test(css) && !/\bmax\s*\(/.test(css));

  // T6: R89-B 结构性修复未回退
  ok('.xtlp-body 结构性修复仍在（position:absolute;inset:0;display:flex;column）',
    /\.xtlp-body\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*display:\s*flex[^}]*flex-direction:\s*column/.test(css), css.slice(0, 200));
  ok('.xtlp-body DOM 容器仍挂载', !!doc.querySelector('.xtlp-body'));

  // T5: 兼容——三种调用
  var calls = [
    function () { win.XT_LOC_PICK.openPicker(); },
    function () { win.XT_LOC_PICK.openPicker({ title: 't' }, function () {}); },
    function () { win.XT_LOC_PICK.openPicker({ title: 't', confirmText: '确定', current: '广州' }, function () {}); }
  ];
  var compatThrew = null;
  try { calls.forEach(function (f) { f(); }); } catch (e) { compatThrew = e; }
  ok('openPicker 三种调用（无参/只 title/全参）均不抛（向后兼容）', compatThrew === null, compatThrew && compatThrew.message);
  ok('openPicker 仍未改签名（函数 length 保留 2 形参）', win.XT_LOC_PICK.openPicker.length === 2, 'length=' + win.XT_LOC_PICK.openPicker.length);

  win.close();
})();

console.log(lines.join('\n'));
console.log('\n---------------------------------------------');
console.log('R90 item3 jsdom: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed');
console.log('---------------------------------------------');
process.exit(fail === 0 ? 0 : 1);
