/* R97 QA 严过关：jsdom 真渲染 + 真事件派发验证脚本（只读验证，不改源码）
   用法：cd C:\Users\ATM\.workbuddy\binaries\node\workspace
         node "D:\下载的文件\学习工作台\_r97_qa_node.js" > "D:\下载的文件\学习工作台\_r97_qa_node.txt" 2>&1
*/
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var ROOT = 'D:\\下载的文件\\学习工作台';
var JSP = path.join(ROOT, 'assets', 'xt-profile.js');
var CSSP = path.join(ROOT, 'assets', 'xt-profile.css');
var HTMLP = path.join(ROOT, '个人资料.html');

var L = [];
function p(s) { L.push(s === undefined ? '' : String(s)); }
function ok(b) { return b ? 'PASS' : 'FAIL'; }
function clsOf(el) { return el ? String(el.className || '') : ''; }

/* 结果统计 */
var RES = { A: [], B: [], C: [], D: [], E: [] };
function rec(sec, item, measured, verdict) { RES[sec].push({ item: item, measured: measured, verdict: verdict }); }

/* 行尾统计（直接按字节判定，不依赖解码）
   lf = 0x0A 总数（既含 CRLF 的 LF，也含纯 LF）
   crlf = 0x0D 0x0A 组合数
   bareLf = 纯 LF 行数 = lf - crlf  ← 这是「是否纯 CRLF」的判定依据
   bareCr = 孤立 CR 数 */
function eolBuf(buf) {
  var lf = 0, crlf = 0, bareLf = 0, bareCr = 0;
  for (var i = 0; i < buf.length; i++) {
    var c = buf[i];
    if (c === 0x0A) { lf++; if (i > 0 && buf[i - 1] === 0x0D) { crlf++; } else { bareLf++; } }
    else if (c === 0x0D) { if (!(i + 1 < buf.length && buf[i + 1] === 0x0A)) { bareCr++; } }
  }
  return { lf: lf, crlf: crlf, bareLf: bareLf, crOnly: bareCr };
}

var jsBuf = fs.readFileSync(JSP), cssBuf = fs.readFileSync(CSSP);
var js = jsBuf.toString('utf8'), css = cssBuf.toString('utf8');
p('##### R97 QA 严过关 · 原始输出（机器可读）#####');
p('baseline: xt-profile.js bytes=' + jsBuf.length + '  xt-profile.css bytes=' + cssBuf.length);
var b1 = eolBuf(jsBuf), b2 = eolBuf(cssBuf);
p('EOL-js : lf=' + b1.lf + ' crlf=' + b1.crlf + ' bareLf=' + b1.bareLf + ' bareCr=' + b1.crOnly);
p('EOL-css: lf=' + b2.lf + ' crlf=' + b2.crlf + ' bareLf=' + b2.bareLf + ' bareCr=' + b2.crOnly);
p('');

/* ================================================================
   2. 启动 jsdom + 注入 CSS + 注入脚本
   ================================================================ */
var html = fs.readFileSync(HTMLP, 'utf8');
var dom = new JSDOM(html, { url: 'http://localhost/%E4%B8%AA%E4%BA%BA%E8%B5%84%E6%96%99.html', runScripts: 'outside-only', pretendToBeVisual: true });
var win = dom.window, doc = win.document;

p('### 环境');
p('PointerEvent: ' + typeof win.PointerEvent + ' | TouchEvent: ' + typeof win.TouchEvent + ' | navigator.maxTouchPoints=' + win.navigator.maxTouchPoints);
p('页内 <script> 标签数（jsdom 不执行，仅统计）: ' + doc.querySelectorAll('script').length);
p('页内 <link rel=stylesheet> 数: ' + doc.querySelectorAll('link[rel="stylesheet"]').length);
p('');

/* 把真实 CSS 注入（用于 ::after content 的存在性检查，见 E 段源码扫描；此处额外确认 style 注入不报错） */
var st = doc.createElement('style');
st.textContent = css;
doc.head.appendChild(st);

/* --- localStorage 桩（jsdom 在 about/opaque 源下会抛） --- */
var LS = {};
Object.defineProperty(win, 'localStorage', {
  configurable: true,
  value: {
    get length() { return Object.keys(LS).length; },
    key: function (i) { return Object.keys(LS)[i] || null; },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : null; },
    setItem: function (k, v) { LS[k] = String(v); },
    removeItem: function (k) { delete LS[k]; },
    clear: function () { LS = {}; }
  }
});

/* --- 舞台尺寸桩：jsdom 不跑布局（offsetHeight/getBoundingClientRect 全 0），
       会让 fitStage() 把 STAGE 降级成 (0,0)/ring=120。这里给出确定性的 340x340 舞台几何，
       使手势/裁剪的数值断言具备可复算的参照系（这是测具能力补足，不是改产品逻辑）。 --- */
var STAGE_W = 340, STAGE_H = 340;
Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: function () { return String(this.className || '').indexOf('xtp-crop-topbar') >= 0 ? 48 : 0; }
});
win.HTMLElement.prototype.getBoundingClientRect = function () {
  var idd = String(this.id || '');
  if (idd === 'xtpCropStage') { return { left: 0, top: 0, right: STAGE_W, bottom: STAGE_H, width: STAGE_W, height: STAGE_H, x: 0, y: 0 }; }
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
};

/* --- Image 自然尺寸桩：jsdom 未安装 canvas 包时 naturalWidth 恒为 0，
       会让 STATE.natW 变成 NaN，全部几何断言失去意义。给一个确定性的 1000x1000 图源。 --- */
Object.defineProperty(win.HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: function () { return 1000; } });
Object.defineProperty(win.HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: function () { return 1000; } });

/* --- canvas 桩：记录裁剪绘制调用（D 段） --- */
var canvasCalls = [];
var lastCanvasDataUrlArgs = null;
win.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind !== '2d') { return null; }
  var rec = { kind: '2d', ops: [], ctx: null };
  canvasCalls.push(rec);
  var ctx = {
    fillStyle: '', save: function () { rec.ops.push(['save']); }, restore: function () { rec.ops.push(['restore']); },
    beginPath: function () { rec.ops.push(['beginPath']); }, closePath: function () { rec.ops.push(['closePath']); },
    fillRect: function (a, b, c, d) { rec.ops.push(['fillRect', a, b, c, d]); },
    arc: function (x, y, r, s, e) { rec.ops.push(['arc', x, y, r, s, e]); },
    clip: function () { rec.ops.push(['clip']); },
    drawImage: function () { var a = Array.prototype.slice.call(arguments); rec.ops.push(['drawImage'].concat(a.slice(1))); }
  };
  rec.ctx = ctx;
  return ctx;
};
win.HTMLCanvasElement.prototype.toDataURL = function () {
  lastCanvasDataUrlArgs = Array.prototype.slice.call(arguments);
  return 'data:image/jpeg;base64,STUB';
};

/* --- file input click 记录 --- */
var inputClicks = [];
var createdFileInputs = [];
var origCreateElement = doc.createElement.bind(doc);
doc.createElement = function (tag) {
  var el = origCreateElement(tag);
  if (String(tag).toLowerCase() === 'input') {
    var meta = { accept: null, capture: null, type: null, inDomAtClick: null, el: el };
    var origClick = el.click ? el.click.bind(el) : function () { };
    el.click = function () {
      meta.accept = el.accept; meta.capture = el.getAttribute('capture'); meta.type = el.type;
      meta.inDomAtClick = !!el.parentNode;
      if (el.type === 'file') { inputClicks.push(meta); }
      createdFileInputs.push(meta);
      try { return origClick(); } catch (e) { return undefined; }
    };
    return el;
  }
  return el;
};

/* --- prompt/alert/confirm 运行期监视 --- */
win.prompt = function () { win.__promptCalls = (win.__promptCalls || 0) + 1; return null; };
win.alert = function () { win.__alertCalls = (win.__alertCalls || 0) + 1; };
win.confirm = function () { win.__confirmCalls = (win.__confirmCalls || 0) + 1; return false; };

/* --- 注入 xt-profile.js（真实执行） --- */
var loadErr = null;
try {
  win.eval(js);
} catch (e) {
  loadErr = e;
}
p('### 脚本注入');
p('xt-profile.js 执行: ' + (loadErr ? ('抛异常 -> ' + loadErr.message) : '无顶层异常'));
if (!loadErr) {
  p('window.xtpPickAvatar 可用: ' + (typeof win.xtpPickAvatar));
  p('window.xtpCloseModal 可用: ' + (typeof win.xtpCloseModal));
  p('window.xtpEditProfile 可用: ' + (typeof win.xtpEditProfile));
  p('window.xtpSaveProfile 可用: ' + (typeof win.xtpSaveProfile));
}
p('');

/* ================================================================
   A. 删除项确认为空
   ================================================================ */
p('======= A. 删除项 =======');
function aCheck(item, present, detail) {
  rec('A', item, detail + ' -> ' + (present ? '存在' : '不存在'), present ? 'FAIL' : 'PASS');
  p('[A] ' + item + ' : ' + detail + ' -> ' + (present ? 'FAIL(仍存在)' : 'PASS(已移除)'));
}

/* 先进入「编辑」视图，让裁剪台具备可打开的上下文（部分实现在 x 视图下才可用） */
var editTab = doc.querySelector('#xtpViewTab_edit') || doc.querySelector('[data-view="edit"]');
p('[A] 编辑页入口 #xtpViewTab_edit: ' + (editTab ? '有' : '无') + ' | #xtpView_edit: ' + (doc.querySelector('#xtpView_edit') ? '有' : '无'));
p('[A] #xtpModalHost: ' + (doc.querySelector('#xtpModalHost') ? '有' : '无'));

/* 直接打开裁剪台：需要一张 dataURL；用 1x1 PNG */
var PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* openCropper 不在 window 上；通过 xtpPickAvatar -> sheet -> album -> input change 走真实链路，
   但 jsdom 无文件选择。改用「真实链路」打开 sheet 后直接验证 DOM 结构（B 段），
   裁剪台则通过 xtpPickAvatar 链路内部的 openCropper 触发：这里用 change 事件 + 伪造 files 属性。 */

/* 先做 B 段的面板验证（需要先打开 sheet） */
p('');
p('======= B. 头像来源底部弹窗 =======');
/* 清空记录 */
inputClicks.length = 0; createdFileInputs.length = 0;

win.xtpPickAvatar();
var sheet = doc.querySelector('#xtpAvatarSheet');
p('[B] 调用 xtpPickAvatar() 后 #xtpAvatarSheet: ' + (sheet ? '出现' : '未出现'));
p('[B] 面板外壳 id=xtpMask: ' + (doc.querySelector('#xtpMask') ? '出现' : '未出现'));
rec('B', '调 xtpPickAvatar() 后出现 #xtpAvatarSheet', sheet ? '出现' : '未出现', sheet ? 'PASS' : 'FAIL');

var cam = doc.querySelector('#xtpSheetCamera');
var alb = doc.querySelector('#xtpSheetAlbum');
var can = doc.querySelector('#xtpSheetCancel');
var items = (sheet ? sheet.querySelectorAll('.xtp-sheet-item') : []);
p('[B] .xtp-sheet-item 数量: ' + items.length);
rec('B', '面板含恰好 3 个可点项', '.xtp-sheet-item=' + items.length, items.length === 3 ? 'PASS' : 'FAIL');
p('[B] #xtpSheetCamera 文案="' + (cam ? cam.textContent.trim() : '(无)') + '"');
p('[B] #xtpSheetAlbum  文案="' + (alb ? alb.textContent.trim() : '(无)') + '"');
p('[B] #xtpSheetCancel 文案="' + (can ? can.textContent.trim() : '(无)') + '"');
rec('B', '三项文案正确', 'cam=' + (cam ? cam.textContent.trim() : '-') + ' / album=' + (alb ? alb.textContent.trim() : '-') + ' / cancel=' + (can ? can.textContent.trim() : '-'),
  (cam && /拍照/.test(cam.textContent) && alb && /从手机相册选择/.test(alb.textContent) && can && can.textContent.trim() === '取消') ? 'PASS' : 'FAIL');

/* 确认此时没有直接触发 file input 的 click */
p('[B] 打开面板瞬间 file input click 次数: ' + inputClicks.length + ' | 创建的 input 次数: ' + createdFileInputs.length);
rec('B', '打开面板时未直接触发 file input click', 'inputClicks=' + inputClicks.length, inputClicks.length === 0 ? 'PASS' : 'FAIL');

/* 点遮罩空白（#xtpMask 自身）-> 面板消失 */
var maskEl = doc.querySelector('#xtpMask');
if (maskEl) {
  var ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  maskEl.dispatchEvent(ev);
}
p('[B] 点 #xtpMask 自身后 #xtpAvatarSheet: ' + (doc.querySelector('#xtpAvatarSheet') ? '仍在' : '已消失'));
rec('B', '点遮罩空白关闭面板', doc.querySelector('#xtpAvatarSheet') ? '仍在' : '已消失', doc.querySelector('#xtpAvatarSheet') ? 'FAIL' : 'PASS');

/* 关闭口一致性：closeModal() 能关掉 #xtpMask */
win.xtpPickAvatar();
var beforeClose = !!doc.querySelector('#xtpMask');
win.xtpCloseModal();
var afterClose = !!doc.querySelector('#xtpMask');
p('[B] closeModal 一致性: 打开后 #xtpMask=' + beforeClose + ' 关闭后 #xtpMask=' + afterClose);
rec('B', '#xtpMask 与统一关闭口 closeModal() 一致', 'open=' + beforeClose + ' afterClose=' + afterClose, (beforeClose && !afterClose) ? 'PASS' : 'FAIL');

/* 点 #xtpSheetCancel -> 面板消失 */
win.xtpPickAvatar();
var c1 = doc.querySelector('#xtpSheetCancel');
if (c1) { c1.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); }
p('[B] 点取消后 #xtpAvatarSheet: ' + (doc.querySelector('#xtpAvatarSheet') ? '仍在' : '已消失') + ' | inputClick=' + inputClicks.length);
rec('B', '点「取消」关闭面板且不创建 input', 'sheet=' + (doc.querySelector('#xtpAvatarSheet') ? '在' : '消失') + ' inputClicks=' + inputClicks.length,
  (!doc.querySelector('#xtpAvatarSheet') && inputClicks.length === 0) ? 'PASS' : 'FAIL');

/* 点 #xtpSheetAlbum -> 面板消失 + 创建 input(type=file, accept=image/*, 无 capture) */
createdFileInputs.length = 0; inputClicks.length = 0;
win.xtpPickAvatar();
var a1 = doc.querySelector('#xtpSheetAlbum');
if (a1) { a1.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); }
var albClick = inputClicks.length ? inputClicks[inputClicks.length - 1] : null;
p('[B] 点相册后 sheet: ' + (doc.querySelector('#xtpAvatarSheet') ? '仍在' : '已消失')
  + ' | inputClick记录=' + JSON.stringify(inputClicks.map(function (x) { return { type: x.type, accept: x.accept, capture: x.capture, inDom: x.inDomAtClick }; })));
rec('B', '点「从手机相册选择」关面板 + 创建 input 且 accept=image/* 无 capture',
  albClick ? ('type=' + albClick.type + ' accept=' + albClick.accept + ' capture=' + albClick.capture) : 'no input click',
  (!doc.querySelector('#xtpAvatarSheet') && albClick && albClick.type === 'file' && albClick.accept === 'image/*' && !albClick.capture) ? 'PASS' : 'FAIL');

/* 点 #xtpSheetCamera -> 创建 input 且 capture=environment */
createdFileInputs.length = 0; inputClicks.length = 0;
win.xtpPickAvatar();
var cm1 = doc.querySelector('#xtpSheetCamera');
if (cm1) { cm1.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); }
var camClick = inputClicks.length ? inputClicks[inputClicks.length - 1] : null;
p('[B] 点拍照后 sheet: ' + (doc.querySelector('#xtpAvatarSheet') ? '仍在' : '已消失')
  + ' | inputClick记录=' + JSON.stringify(inputClicks.map(function (x) { return { type: x.type, accept: x.accept, capture: x.capture, inDom: x.inDomAtClick }; })));
rec('B', '点「拍照」创建 input 且 capture=environment',
  camClick ? ('type=' + camClick.type + ' accept=' + camClick.accept + ' capture=' + camClick.capture) : 'no input click',
  (camClick && camClick.type === 'file' && camClick.accept === 'image/*' && camClick.capture === 'environment') ? 'PASS' : 'FAIL');

/* 清理残留 input */
var leftover = doc.body.querySelectorAll('input[type=file]');
p('[B] 残留 file input 数: ' + leftover.length);

p('');

/* ================================================================
   打开裁剪台（走真实链路：input change -> FileReader -> openCropper）
   ================================================================ */
p('======= 打开裁剪台（真实链路）=======');
var cropReady = false;
try {
  win.xtpPickAvatar();
  var alb2 = doc.querySelector('#xtpSheetAlbum');
  alb2.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  var inp = doc.body.querySelector('input[type=file]');
  p('链路中取得 file input: ' + (inp ? 'YES' : 'NO'));
  if (inp) {
    /* 伪造 files + 触发 change，让 FileReader 读到 dataURL */
    var fakeFile = new win.Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    try { fakeFile.name = 't.png'; } catch (e) { }
    Object.defineProperty(inp, 'files', { configurable: true, value: [fakeFile] });
    /* FileReader 在 jsdom 可用 */
    inp.dispatchEvent(new win.Event('change', { bubbles: true }));
    cropReady = true;
  }
} catch (e) {
  p('链路异常: ' + e.message + '\n' + e.stack);
}

/* FileReader 是异步的：轮询等 #xtpCropStage 出现 */
function waitFor(cond, tries, cb) {
  var n = 0;
  function tick() {
    n++;
    if (cond()) { cb(true); return; }
    if (n >= tries) { cb(false); return; }
    if (typeof win.setTimeout === 'function') { win.setTimeout(tick, 10); } else { setTimeout(tick, 10); }
  }
  tick();
}

function mainAfterCrop(okReached) {
  p('裁剪台出现: ' + okReached);
  var stage = doc.querySelector('#xtpCropStage');
  var img = doc.querySelector('#xtpCropImg');
  p('#xtpCropStage: ' + (stage ? 'YES' : 'NO') + ' | #xtpCropImg: ' + (img ? 'YES' : 'NO')
    + ' | #xtpCropFrame: ' + (doc.querySelector('#xtpCropFrame') ? 'YES' : 'NO')
    + ' | #xtpCropHole: ' + (doc.querySelector('#xtpCropHole') ? 'YES' : 'NO'));
  p('');

  /* ---------- A 段：裁剪台 DOM 内不得有删除项 ---------- */
  var cropRoot = doc.querySelector('#xtpCropStage') ? doc.querySelector('.xtp-cropper') : null;
  var cropHtml = cropRoot ? cropRoot.outerHTML : '';
  aCheck('#xtpCropZoom', !!doc.querySelector('#xtpCropZoom'), 'document.querySelector(#xtpCropZoom)');
  aCheck('input[type=range]（滑杆残留）', doc.querySelectorAll('.xtp-cropper input[type=range]').length > 0, '范围内 range input 数=' + doc.querySelectorAll('.xtp-cropper input[type=range]').length);
  aCheck('.xtp-crop-bottom', !!doc.querySelector('.xtp-crop-bottom'), 'document.querySelector(.xtp-crop-bottom)');
  aCheck('.xtp-crop-zi', !!doc.querySelector('.xtp-crop-zi'), 'document.querySelector(.xtp-crop-zi)');
  aCheck('.xtp-crop-zoom', !!doc.querySelector('.xtp-crop-zoom'), 'document.querySelector(.xtp-crop-zoom)');
  var hintHit = /拖动|双指缩放|调整头像/.test(cropHtml);
  aCheck('裁剪台文案「拖动/双指缩放/调整头像」', hintHit, 'cropRoot.outerHTML 命中=' + hintHit);
  /* CSS 源码：.xtp-crop-topbar::after 应已删除 */
  var topbarAfter = /\.xtp-crop-topbar\s*::after/.test(css);
  aCheck('.xtp-crop-topbar::after（源码 CSS）', topbarAfter, 'css.indexOf(".xtp-crop-topbar::after")=' + css.indexOf('.xtp-crop-topbar::after'));
  p('');

  /* ---------- C 段：顶栏按钮 ---------- */
  p('======= C. 顶栏与手势 =======');
  var topbar = doc.querySelector('#xtpCropTopbar');
  var btns = topbar ? topbar.querySelectorAll('button') : [];
  var btnTxt = [];
  for (var bi = 0; bi < btns.length; bi++) { btnTxt.push(btns[bi].textContent.trim()); }
  p('[C] 顶栏 button 数=' + btns.length + ' 文案=' + JSON.stringify(btnTxt));
  rec('C', '顶栏恰好 2 个按钮', 'count=' + btns.length + ' texts=' + JSON.stringify(btnTxt), btns.length === 2 ? 'PASS' : 'FAIL');
  var cOk = doc.querySelector('#xtpCropOk'), cCancel = doc.querySelector('#xtpCropCancel');
  p('[C] #xtpCropCancel="' + (cCancel ? cCancel.textContent.trim() : '-') + '"  #xtpCropOk="' + (cOk ? cOk.textContent.trim() : '-') + '"  ok.class="' + clsOf(cOk) + '"');
  rec('C', '按钮文案「取消」「完成」且 #xtpCropOk 带 primary 类',
    'cancel=' + (cCancel ? cCancel.textContent.trim() : '-') + ' ok=' + (cOk ? cOk.textContent.trim() : '-') + ' okClass=' + clsOf(cOk),
    (cCancel && cCancel.textContent.trim() === '取消' && cOk && cOk.textContent.trim() === '完成' && /(^|\s)primary(\s|$)/.test(clsOf(cOk))) ? 'PASS' : 'FAIL');

  /* 舞台尺寸 / 图片尺寸 */
  p('[C] stage.style=' + (stage ? stage.style.width + 'x' + stage.style.height : '-'));
  p('[C] img.style=' + (img ? img.style.width + 'x' + img.style.height + ' left=' + img.style.left + ' top=' + img.style.top + ' data-scale=' + img.getAttribute('data-scale') : '-'));

  /* jsdom 下 stage.getBoundingClientRect() 全 0，会给 zoomAt 传 (0,0) 锚点，
     这与真实浏览器语义一致（锚点在左上角），不影响 scale 变化断言。这里显式打印实测 rect。 */
  var rect = stage.getBoundingClientRect();
  p('[C] stage.getBoundingClientRect()=' + JSON.stringify({ l: rect.left, t: rect.top, w: rect.width, h: rect.height }));

  function scale() { return parseFloat(img.getAttribute('data-scale') || 'NaN'); }
  function px(v) { return parseFloat(String(v).replace('px', '')) || 0; }

  /* --- 单指拖动 --- */
  function dispatchPointer(type, o) {
    var e = new win.Event(type, { bubbles: true, cancelable: true });
    e.pointerId = o.pointerId; e.clientX = o.clientX; e.clientY = o.clientY;
    e.pointerType = o.pointerType || 'touch'; e.isPrimary = !!o.isPrimary;
    try { Object.defineProperty(e, 'pointerId', { value: o.pointerId }); } catch (er) { }
    stage.dispatchEvent(e);
    return e;
  }

  if (typeof win.PointerEvent === 'function') {
    var leftBefore = px(img.style.left), topBefore = px(img.style.top);
    var d0 = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', isPrimary: true });
    stage.dispatchEvent(d0);
    var m0 = new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, clientX: 160, clientY: 115, pointerType: 'touch', isPrimary: true });
    stage.dispatchEvent(m0);
    var leftAfter = px(img.style.left), topAfter = px(img.style.top);
    p('[C] 单指拖动: left ' + leftBefore + ' -> ' + leftAfter + ' ; top ' + topBefore + ' -> ' + topAfter);
    var dU = new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, clientX: 160, clientY: 115, pointerType: 'touch', isPrimary: true });
    stage.dispatchEvent(dU);

    /* --- 双指捏合放大 --- */
    var s0 = scale();
    var pa = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 11, clientX: 100, clientY: 100, pointerType: 'touch' });
    var pb = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 12, clientX: 200, clientY: 200, pointerType: 'touch' });
    stage.dispatchEvent(pa); stage.dispatchEvent(pb);
    var mv1 = new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 11, clientX: 40, clientY: 40, pointerType: 'touch' });
    var mv2 = new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 12, clientX: 260, clientY: 260, pointerType: 'touch' });
    stage.dispatchEvent(mv1); stage.dispatchEvent(mv2);
    var s1 = scale();
    p('[C] 双指捏合放大: data-scale ' + s0 + ' -> ' + s1 + '  (两指距离 141.4 -> 311.1, 理论 ×2.2)');
    rec('C', '双指捏合放大使 data-scale 增大', s0 + ' -> ' + s1, s1 > s0 ? 'PASS' : 'FAIL');
    var upA = new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 11, clientX: 40, clientY: 40, pointerType: 'touch' });
    var upB = new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 12, clientX: 260, clientY: 260, pointerType: 'touch' });
    stage.dispatchEvent(upA); stage.dispatchEvent(upB);

    /* --- 双指捏合缩小 --- */
    var s2a = scale();
    var pc = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 21, clientX: 40, clientY: 40, pointerType: 'touch' });
    var pd = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 22, clientX: 260, clientY: 260, pointerType: 'touch' });
    stage.dispatchEvent(pc); stage.dispatchEvent(pd);
    var mv3 = new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 21, clientX: 120, clientY: 120, pointerType: 'touch' });
    var mv4 = new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 22, clientX: 180, clientY: 180, pointerType: 'touch' });
    stage.dispatchEvent(mv3); stage.dispatchEvent(mv4);
    var s2b = scale();
    p('[C] 双指捏合缩小: data-scale ' + s2a + ' -> ' + s2b);
    rec('C', '双指捏合缩小使 data-scale 减小', s2a + ' -> ' + s2b, s2b < s2a ? 'PASS' : 'FAIL');
    stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 21, clientX: 120, clientY: 120, pointerType: 'touch' }));
    stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 22, clientX: 180, clientY: 180, pointerType: 'touch' }));

    /* --- clamp 上限 [1,5] --- */
    var guard = 0;
    while (guard++ < 60) {
      var qa = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 31, clientX: 150, clientY: 150, pointerType: 'touch' });
      var qb = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 32, clientX: 151, clientY: 150, pointerType: 'touch' });
      stage.dispatchEvent(qa); stage.dispatchEvent(qb);
      stage.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 31, clientX: -3000, clientY: -3000, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 32, clientX: 3000, clientY: 3000, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 31, clientX: -3000, clientY: -3000, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 32, clientX: 3000, clientY: 3000, pointerType: 'touch' }));
      if (scale() >= 5) { break; }
    }
    var sMax = scale();
    p('[C] 拼命放大 ' + guard + ' 轮后 data-scale=' + sMax);
    rec('C', '缩放上限 clamp 到 5', 'data-scale=' + sMax, (sMax <= 5 + 1e-9 && sMax > 4.9) ? 'PASS' : 'FAIL');

    var guard2 = 0;
    while (guard2++ < 80) {
      var ra = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 41, clientX: -3000, clientY: -3000, pointerType: 'touch' });
      var rb = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 42, clientX: 3000, clientY: 3000, pointerType: 'touch' });
      stage.dispatchEvent(ra); stage.dispatchEvent(rb);
      stage.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 41, clientX: 149, clientY: 149, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 42, clientX: 151, clientY: 151, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 41, clientX: 149, clientY: 149, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 42, clientX: 151, clientY: 151, pointerType: 'touch' }));
      if (scale() <= 1 + 1e-9) { break; }
    }
    var sMin = scale();
    p('[C] 拼命缩小 ' + guard2 + ' 轮后 data-scale=' + sMin);
    rec('C', '缩放下限 clamp 到 1', 'data-scale=' + sMin, (sMin >= 1 - 1e-9 && sMin <= 1.001) ? 'PASS' : 'FAIL');

    /* --- 拖动边界 clamp --- */
    var sw = px(stage.style.width), sh = px(stage.style.height);
    var natW = img.naturalWidth || 1, natH = img.naturalHeight || 1;
    p('[C] 边界参数: stage=' + sw + 'x' + sh + '  图片 natural=' + natW + 'x' + natH + '  data-scale=' + scale());
    /* 生成大量单向拖动，观察是否越界 */
    var oob = 0;
    for (var k = 0; k < 40; k++) {
      var da = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 51, clientX: 0, clientY: 0, pointerType: 'touch' });
      stage.dispatchEvent(da);
      stage.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 51, clientX: -5000, clientY: -5000, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 51, clientX: -5000, clientY: -5000, pointerType: 'touch' }));
    }
    var xL = px(img.style.left), yT = px(img.style.top);
    p('[C] 向左上拼命拖动后 left=' + xL + ' top=' + yT);
    for (var k2 = 0; k2 < 80; k2++) {
      var db = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 52, clientX: 0, clientY: 0, pointerType: 'touch' });
      stage.dispatchEvent(db);
      stage.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 52, clientX: 5000, clientY: 5000, pointerType: 'touch' }));
      stage.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 52, clientX: 5000, clientY: 5000, pointerType: 'touch' }));
    }
    var xR = px(img.style.left), yB = px(img.style.top);
    p('[C] 向右下拼命拖动后 left=' + xR + ' top=' + yB);

    /* 用代码里的 clamp 公式复算边界，核对实测是否落在合法区间 */
    var total = scale();
    var cover = Math.max(sw / natW, sh / natH);
    var tw = natW * total, th = natH * total;
    var crop = Math.min(sw, sh);
    var minX = (sw - crop) / 2 - (tw - crop) / 2, maxX = -minX;
    var minY = (sh - crop) / 2 - (th - crop) / 2, maxY = -minY;
    p('[C] 复算边界: x∈[' + minX.toFixed(2) + ',' + maxX.toFixed(2) + ']  y∈[' + minY.toFixed(2) + ',' + maxY.toFixed(2) + ']');
    var inX = (xL >= minX - 0.51 && xL <= maxX + 0.51) && (xR >= minX - 0.51 && xR <= maxX + 0.51);
    var inY = (yT >= minY - 0.51 && yT <= maxY + 0.51) && (yB >= minY - 0.51 && yB <= maxY + 0.51);
    rec('C', '拖动被 clamp 在边界内（图片始终覆盖裁剪圆）',
      'left∈[' + xL + ',' + xR + '] top∈[' + yT + ',' + yB + '] 复算界 x∈[' + minX.toFixed(1) + ',' + maxX.toFixed(1) + '] y∈[' + minY.toFixed(1) + ',' + maxY.toFixed(1) + ']',
      (inX && inY) ? 'PASS' : 'FAIL');
    p('[C] 拖动边界判定: xIn=' + inX + ' yIn=' + inY);
  } else {
    p('[C] 环境无 PointerEvent —— 走兼容分支');
  }

  /* --- TouchEvent 兜底路径 --- */
  p('');
  p('[C] --- TouchEvent 兜底路径 ---');
  p('[C] window.TouchEvent 存在: ' + (typeof win.TouchEvent === 'function'));
  /* 直接用源码里的 touch 路径：即使 window.PointerEvent 存在，源码也不会绑定 touch 监听（if/else）。
     为验证 touch 分支可用，另建一个「无 PointerEvent」的 jsdom 实例。 */
  runTouchOnly();

  p('');

  /* ---------- D 段：完成逻辑回归 ---------- */
  p('======= D. 「完成」回归 =======');
  /* 先记录 saveProfile/renderPage 的调用（通过 localStorage 落盘 + DOM 重渲染间接判定） */
  var lsBefore = Object.assign({}, LS);
  canvasCalls.length = 0; lastCanvasDataUrlArgs = null;
  var okBtn = doc.querySelector('#xtpCropOk');
  var toastTexts = [];
  var origAppend = doc.body.appendChild.bind(doc.body);
  /* 记录 toast 文案：toast 会往 body 追加 .xtp-toast */
  doc.body.appendChild = function (el) {
    var r = origAppend(el);
    try { if (el && el.className && String(el.className).indexOf('xtp-toast') >= 0) { toastTexts.push(el.textContent); } } catch (e) { }
    return r;
  };

  var maskBeforeD = !!doc.querySelector('#xtpMask');
  if (okBtn) { okBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); }
  var maskAfterD = !!doc.querySelector('#xtpMask');
  p('[D] 点「完成」前 #xtpMask=' + maskBeforeD + ' 后=' + maskAfterD);
  rec('D', '点「完成」后面板关闭', '#xtpMask ' + maskBeforeD + ' -> ' + maskAfterD, (!maskAfterD) ? 'PASS' : 'FAIL');

  var dataArgs = lastCanvasDataUrlArgs;
  p('[D] canvas.toDataURL 调用参数: ' + JSON.stringify(dataArgs));
  rec('D', "canvas.toDataURL('image/jpeg', 0.92)", JSON.stringify(dataArgs), (dataArgs && dataArgs[0] === 'image/jpeg' && dataArgs[1] === 0.92) ? 'PASS' : 'FAIL');

  p('[D] getContext("2d") 调用次数=' + canvasCalls.length);
  var ops = canvasCalls.length ? canvasCalls[0].ops : [];
  p('[D] 裁剪绘制序列: ' + JSON.stringify(ops));
  var hasClipArc = ops.some(function (o) { return o[0] === 'arc'; }) && ops.some(function (o) { return o[0] === 'clip'; });
  var di = ops.filter(function (o) { return o[0] === 'drawImage'; });
  p('[D] drawImage 参数=' + JSON.stringify(di));
  rec('D', 'canvas 裁剪矩形参数（stub 2d ctx）',
    'arc+clip=' + hasClipArc + ' drawImage=' + JSON.stringify(di),
    (hasClipArc && di.length === 1) ? 'PASS' : 'FAIL');

  /* 校验 drawImage 参数是否与 STATE 推导一致 */
  var dArgs = di.length ? di[0] : null;
  if (dArgs) {
    var tot = scale();
    var sw2 = px(stage.style.width), sh2 = px(stage.style.height);
    var crop2 = Math.min(sw2, sh2);
    var expSx = (((sw2 - crop2) / 2) - px(img.style.left)) / tot;
    var expSy = (((sh2 - crop2) / 2) - px(img.style.top)) / tot;
    var expSize = crop2 / tot;
    p('[D] 期望 sx=' + expSx.toFixed(3) + ' sy=' + expSy.toFixed(3) + ' sSize=' + expSize.toFixed(3) + '（源域）');
    p('[D] 实收 sx=' + dArgs[1] + ' sy=' + dArgs[2] + ' sSize=' + dArgs[3] + '  dst=(' + dArgs[4] + ',' + dArgs[5] + ',' + dArgs[6] + ',' + dArgs[7] + ')');
    rec('D', 'drawImage 源矩形与 STATE 推导一致',
      'exp(' + expSx.toFixed(2) + ',' + expSy.toFixed(2) + ',' + expSize.toFixed(2) + ') got(' + dArgs[1] + ',' + dArgs[2] + ',' + dArgs[3] + ')',
      (Math.abs(dArgs[1] - expSx) < 0.01 && Math.abs(dArgs[2] - expSy) < 0.01 && Math.abs(dArgs[3] - expSize) < 0.01) ? 'PASS' : 'FAIL');
  } else {
    rec('D', 'drawImage 源矩形与 STATE 推导一致', '无 drawImage 调用（裁剪未执行）', 'FAIL');
  }

  /* saveProfile 是否落盘 */
  var newAvatarKeys = Object.keys(LS).filter(function (k) { return /avatar/i.test(k); });
  p('[D] localStorage 含 avatar 的键: ' + JSON.stringify(newAvatarKeys));
  p('[D] avatar 值前缀: ' + (LS[newAvatarKeys[0]] ? String(LS[newAvatarKeys[0]]).slice(0, 40) : '(无)'));
  rec('D', 'saveProfile({avatarImg}) 已落盘', JSON.stringify(newAvatarKeys) + ' value=' + (LS[newAvatarKeys[0]] ? String(LS[newAvatarKeys[0]]).slice(0, 32) : '-'),
    newAvatarKeys.length > 0 ? 'PASS' : 'FAIL');

  p('[D] 期间 toast 文案: ' + JSON.stringify(toastTexts));
  p('[D] 期间 prompt/alert/confirm 调用: ' + (win.__promptCalls || 0) + '/' + (win.__alertCalls || 0) + '/' + (win.__confirmCalls || 0));

  finish();
}

/* 无 PointerEvent 的独立实例，验证 touch 兜底分支 */
function runTouchOnly() {
  var d2 = new JSDOM(html, { url: 'http://localhost/p.html', runScripts: 'outside-only', pretendToBeVisual: true });
  var w2 = d2.window, doc2 = w2.document;
  /* 删掉 PointerEvent 以强制走 else 分支 */
  try { delete w2.PointerEvent; } catch (e) { }
  w2.PointerEvent = undefined;
  Object.defineProperty(w2, 'localStorage', {
    configurable: true, value: { length: 0, key: function () { return null; }, getItem: function () { return null; }, setItem: function () { }, removeItem: function () { }, clear: function () { } }
  });
  w2.HTMLCanvasElement.prototype.getContext = function () { return null; };
  var err2 = null;
  try { w2.eval(js); } catch (e) { err2 = e; }
  p('[C-touch] 无 PointerEvent 实例 脚本执行: ' + (err2 ? '异常 ' + err2.message : 'OK'));
  p('[C-touch] typeof window.PointerEvent=' + typeof w2.PointerEvent);
  /* 直接构造裁剪台：走 xtpPickAvatar -> album -> change 太绕，这里改用内部 openCropper 不可达，
     因此复用「有 PointerEvent」实例无法验证；改为纯逻辑复算。 */
  p('[C-touch] 源码绑定分支判定 window.PointerEvent=' + (typeof w2.PointerEvent) + ' -> 走 else(触摸兜底) 分支');
  p('[C-touch] 说明：jsdom 的 TouchEvent 构造器不支持 touches 数组语义，故本条以「源码分支可达性 + 逻辑复算」判定，见报告「未覆盖」段。');
}

function finish() {
  /* ================================================================
     E. 静态约束
     ================================================================ */
  p('');
  p('======= E. 静态约束 =======');
  var e1 = eol(js), e2 = eol(css);
  p('[E] xt-profile.js  lf=' + e1.lf + '  crlf=' + e1.crlf + '  loneCR=' + e1.crOnly);
  p('[E] xt-profile.css lf=' + e2.lf + '  crlf=' + e2.crlf + '  loneCR=' + e2.crOnly);
  rec('E', 'xt-profile.js 纯 CRLF（lf=0 且 crlf>0）', 'lf=' + e1.lf + ' crlf=' + e1.crlf, (e1.lf === 0 && e1.crlf > 0) ? 'PASS' : 'FAIL');
  rec('E', 'xt-profile.css 纯 CRLF（lf=0 且 crlf>0）', 'lf=' + e2.lf + ' crlf=' + e2.crlf, (e2.lf === 0 && e2.crlf > 0) ? 'PASS' : 'FAIL');

  /* 禁用 API：剔注释与字符串后扫真实调用 */
  function strip(s) {
    var res = [], i = 0, mode = null;
    while (i < s.length) {
      var c = s[i];
      if (mode === null) {
        if (s.substr(i, 2) === '/*') { mode = 'b'; i += 2; continue; }
        if (s.substr(i, 2) === '//') { mode = 'l'; i += 2; continue; }
        if (c === "'") { mode = 'sq'; i++; continue; }
        if (c === '"') { mode = 'dq'; i++; continue; }
        if (c === '`') { mode = 'tpl'; i++; continue; }
        res.push(c); i++; continue;
      } else if (mode === 'b') {
        if (s.substr(i, 2) === '*/') { mode = null; i += 2; continue; }
        if (c === '\n') { res.push('\n'); } i++; continue;
      } else if (mode === 'l') {
        if (c === '\n') { mode = null; res.push('\n'); } i++; continue;
      } else {
        if (c === '\\') { i += 2; continue; }
        if (c === '\n' && mode !== 'tpl') { mode = null; res.push('\n'); i++; continue; }
        if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) { mode = null; }
        i++; continue;
      }
    }
    return res.join('');
  }
  var codeJs = strip(js);
  function scan(label, pat) {
    var re = new RegExp(pat, 'g'), hits = [], m;
    while ((m = re.exec(codeJs)) !== null) {
      var ln = codeJs.slice(0, m.index).split('\n').length;
      hits.push('L' + ln + ':' + m[0]);
    }
    p('[E] ' + label + ' 真实调用数=' + hits.length + (hits.length ? ' ' + JSON.stringify(hits.slice(0, 5)) : ''));
    return hits.length;
  }
  var nPrompt = scan('prompt(', '(?<![\\w.$])prompt\\s*\\(');
  var nAlert = scan('alert(', '(?<![\\w.$])alert\\s*\\(');
  var nConfirm = scan('confirm(', '(?<![\\w.$])confirm\\s*\\(');
  rec('E', '无 prompt/alert/confirm 真实调用', 'prompt=' + nPrompt + ' alert=' + nAlert + ' confirm=' + nConfirm, (nPrompt + nAlert + nConfirm === 0) ? 'PASS' : 'FAIL');

  /* 打印全部结果 */
  p('');
  p('##### 汇总（供报告直接引用）#####');
  ['A', 'B', 'C', 'D', 'E'].forEach(function (sec) {
    var arr = RES[sec];
    var pass = arr.filter(function (x) { return x.verdict === 'PASS'; }).length;
    p('--- ' + sec + ' 段：' + pass + '/' + arr.length + ' PASS ---');
    arr.forEach(function (x) { p('  [' + x.verdict + '] ' + x.item + ' :: ' + x.measured); });
  });

  var p0 = 0, p1 = 0, p2 = 0;
  ['A', 'B', 'C', 'D', 'E'].forEach(function (sec) {
    RES[sec].forEach(function (x) { if (x.verdict === 'FAIL') { p1++; } });
  });
  p('');
  p('FAIL 总数=' + p1);

  fs.writeFileSync(path.join(ROOT, '_r97_qa_node.txt'), L.join('\r\n'), 'utf8');
  console.log('WROTE ' + path.join(ROOT, '_r97_qa_node.txt') + ' lines=' + L.length);
}

/* 等待裁剪台出现 */
waitFor(function () { return !!doc.querySelector('#xtpCropStage'); }, 200, function (reached) {
  mainAfterCrop(reached);
});
