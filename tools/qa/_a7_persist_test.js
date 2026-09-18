/**
 * A7 验证：个人中心.html —— N9-4「我的作品集」收藏持久化 + B1 feed-btn 挪位
 *
 * 方法：jsdom 加载【真实页面文件】，只取页面自身的 5 段内联脚本逐段执行
 *       （外链 assets/*.js 不从磁盘加载：本机静态服务会把 ?v= 后缀当成不存在的文件，
 *        会产生大量噪声；且本任务明确不碰 assets/app.js、assets/api.js）。
 *       资料卡 #profileBox 用与真实 app.js renderProfilePage() / api.js 同构的动作条填充，
 *       以复现 feed-btn 的真实归位目标。
 *
 * 输出：_tmp_a7_jsdom_out.txt（UTF-8），避免中文控制台 GBK 崩溃。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM_PATH = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
var JSDOM = require(JSDOM_PATH).JSDOM;

var ROOT = 'D:\\下载的文件\\学习工作台';
var PAGE = path.join(ROOT, '个人中心.html');
var OUT = path.join(ROOT, '_tmp_a7_jsdom_out.txt');

var log = [];
function P(s) { log.push(s); try { fs.writeFileSync(OUT, log.join('\n'), 'utf8'); } catch (e) { /* 忽略 */ } }
process.on('uncaughtException', function (e) {
  log.push('');
  log.push('!!! UNCAUGHT: ' + (e && e.stack ? e.stack : e));
  try { fs.writeFileSync(OUT, log.join('\n'), 'utf8'); } catch (e2) {}
  process.exitCode = 1;
});
function H(t) { log.push(''); log.push('================ ' + t + ' ================'); }
function ok(b, msg) { log.push((b ? '  [PASS] ' : '  [FAIL] ') + msg); return b; }

var RESULTS = { pass: 0, fail: 0 };
function assert(b, msg) { if (ok(b, msg)) RESULTS.pass++; else RESULTS.fail++; }

/* ---------------- 1. 读取页面 & 切分内联脚本 ---------------- */
var html = fs.readFileSync(PAGE, 'utf8');
P('页面路径: ' + PAGE);
P('页面字节: ' + Buffer.byteLength(html, 'utf8'));

var scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
var inlineScripts = [];
var m;
while ((m = scriptRe.exec(html))) inlineScripts.push(m[1]);
P('内联脚本段数: ' + inlineScripts.length);
inlineScripts.forEach(function (b, i) {
  P('   #' + (i + 1) + ' ' + b.length + ' chars' + (/\bxtFolio\b|folio/.test(b) ? '   <-- 作品集' : '') + (/\bupdateProfileFeedBtn\b/.test(b) ? '  <-- feed-btn' : ''));
});
var folioIdx = -1, feedIdx = -1;
inlineScripts.forEach(function (b, i) {
  if (b.indexOf('xtFolioToggleFav') >= 0) folioIdx = i;
  if (b.indexOf('updateProfileFeedBtn') >= 0) feedIdx = i;
});
assert(folioIdx >= 0, '找到作品集内联脚本段（#index=' + folioIdx + '）');
assert(feedIdx >= 0, '找到 feed-btn 内联脚本段（#index=' + feedIdx + '）');

/* ---------------- 2. 构造 jsdom 实例 ---------------- */
var dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8913/个人中心.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
var win = dom.window;
var doc = win.document;

/* ---------------- 3. 装桩：站点全局 ---------------- */
win.CURRENT_ACCOUNT = 'shared';
win.lsKey = function (name) { return win.CURRENT_ACCOUNT ? name + '@' + win.CURRENT_ACCOUNT : name; };
win.showToast = function (msg) { TOASTS.push(String(msg)); };
win.xtToast = function (state, msg) { TOASTS.push(String(msg)); };
win.uiConfirm = function (msg) { return win.Promise.resolve(true); };
win.lucideAutoRender = function () {};
win.openAppModal = function (id) { var e = doc.getElementById(id); if (e) { e.classList.add('active'); doc.body.classList.add('modal-lock'); } };
win.closeAppModal = function (id) { var e = doc.getElementById(id); if (e) { e.classList.remove('active'); doc.body.classList.remove('modal-lock'); } };
var TOASTS = [];
win.__TOASTS = TOASTS;
// SubpageRouter 桩（本页首个内联脚本会调 init/onSubpageChange；真实实现不参与本次断言）
var NAVS = [];
win.SubpageRouter = {
  navigate: function (k) { NAVS.push(k); },
  init: function () {},
  onSubpageChange: function () {}
};
win.__NAVS = NAVS;

/* ---------------- 4. 逐段执行内联脚本 ---------------- */
var runErrors = [];
inlineScripts.forEach(function (b, i) {
  if (b.trim().length < 20) return;
  try {
    win.eval(b);
  } catch (e) {
    runErrors.push('#' + (i + 1) + ': ' + (e && e.message));
  }
});
/** 让页面的 boot() 真正跑完：脚本在 readyState==='loading' 时挂的是 DOMContentLoaded */
function fireReady(w) {
  try {
    if (w.document.readyState === 'loading') {
      var ev = w.document.createEvent('Event');
      ev.initEvent('DOMContentLoaded', true, true);
      w.document.dispatchEvent(ev);
      return 'dispatched DOMContentLoaded';
    }
    return 'readyState=' + w.document.readyState + '（boot 已同步执行）';
  } catch (e) { return 'ERR ' + (e && e.message); }
}
win.__readyInfo = fireReady(win);
P('');
P('boot 触发方式: ' + win.__readyInfo);
P('内联脚本执行错误: ' + (runErrors.length ? '\n   ' + runErrors.join('\n   ') : '无'));
assert(runErrors.length === 0, '全部内联脚本执行零异常');
assert(!!win.xtFolioToggleFav, '作品集全局 API 已挂载（window.xtFolioToggleFav 存在）');

/* ---------------- 5. 填充资料卡 #profileBox（与真实 renderProfilePage 同构） ---------------- */
P('');
P('---- 注入与 app.js/api.js 同构的资料卡动作区（含 onclick="editProfile()" 的「编辑资料」） ----');
function seedProfileBox() {
  var box = doc.getElementById('profileBox');
  box.innerHTML =
    '<div class="card">' +
      '<div class="card-header"><div class="card-title">个人资料</div></div>' +
      '<div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">' +
        '<div class="profile-avatar-lg">学</div>' +
        '<div style="flex:1;min-width:180px"><div>同学</div></div>' +
        '<button class="btn btn-outline" onclick="editProfile()">编辑资料</button>' +
        '<button class="btn btn-danger" onclick="doLogout()">退出登录</button>' +
      '</div>' +
    '</div>';
  return box.querySelector('button[onclick="editProfile()"]');
}
var editBtn = seedProfileBox();
P('已注入资料卡；「编辑资料」按钮存在 = ' + !!editBtn);
assert(!!editBtn, '资料卡内存在 button[onclick="editProfile()"]');

/* ============================================================
   第一批断言：B1 feed-btn 归位
   ============================================================ */
H('B1 feed-btn 挪位验证');

var feedRow = doc.getElementById('profileFeedBtnRow');
var feedBtn = doc.getElementById('profileFeedBtn');
var feedTxt = doc.getElementById('profileFeedBtnText');
P('HTML 阶段：');
P('  #profileFeedBtnRow 存在 = ' + !!feedRow + ' 初始 display=' + (feedRow ? feedRow.style.display || '(空)' : 'N/A'));
P('  #profileFeedBtn   存在 = ' + !!feedBtn + ' 初始 class=' + (feedBtn ? feedBtn.className : 'N/A'));
assert(!!feedRow && !!feedBtn, 'HTML 中存在 #profileFeedBtnRow / #profileFeedBtn');

// ① 节点已从资料卡上方移到 #profileBox 之后
var secProfile = doc.querySelector('#page-profile [data-subpage="profile"]');
var boxEl = doc.getElementById('profileBox');
var order = [];
for (var c = 0; c < secProfile.children.length; c++) {
  var ch = secProfile.children[c];
  order.push(ch.id || ('<' + ch.tagName.toLowerCase() + '>'));
}
P('  [data-subpage="profile"] 子节点顺序: ' + order.join(' , '));
var iBox = order.indexOf('profileBox');
var iRow = order.indexOf('profileFeedBtnRow');
assert(iBox >= 0 && iRow > iBox, 'feed-btn 节点位于 #profileBox 之后（DOM 静态位置已挪出资料卡上方）');

// ② 按钮已降级 btn-outline（非 btn-primary）
P('  按钮 class = "' + feedBtn.className + '"');
assert(feedBtn.className.indexOf('btn-primary') < 0 && feedBtn.className.indexOf('btn-outline') >= 0,
  '按钮已从 btn-primary 降级为 btn-outline');

// ③ 设 uid 走自视角，调用 updateProfileFeedBtn() 触发归位
win.localStorage.setItem('study_workbench_uid', '10086');
TOASTS.length = 0;
P('');
P('调用 window.updateProfileFeedBtn()（self 视角，uid=10086）…');
win.updateProfileFeedBtn();

var rowNow = doc.getElementById('profileFeedBtnRow');
var btnNow = doc.getElementById('profileFeedBtn');
var actionHost = editBtn.parentNode;
P('  归位后 #profileFeedBtnRow.parentNode = <' + (rowNow.parentNode ? rowNow.parentNode.tagName.toLowerCase() : 'null') + '>');
P('  「编辑资料」按钮的父节点           = <' + actionHost.tagName.toLowerCase() + '>');
P('  两者同一节点 = ' + (rowNow.parentNode === actionHost));
P('  归位后 display = ' + (rowNow.style.display || '(空)'));
assert(rowNow.parentNode === actionHost, 'feed-btn 已搬进「编辑资料」所在的动作条（资料卡操作区）');
assert(rowNow.style.display === 'block', 'feed-btn 已显示（display=block）');
assert(feedTxt.textContent === '我的动态', '自视角文案 = 「我的动态」（实际 "' + feedTxt.textContent + '"）');
assert(btnNow.className.indexOf('btn-outline') >= 0, '运行时仍保持 btn-outline（未被外部样式拉回主按钮）');
assert(typeof btnNow.onclick === 'function', '按钮已绑定 onclick');

// ④ 资料卡被整块重渲染（模拟 renderProfilePage 重写 innerHTML）→ MutationObserver 自动归位
P('');
P('模拟 renderProfilePage() 整块重写 #profileBox.innerHTML …');
seedProfileBox();
var rowAfter = doc.getElementById('profileFeedBtnRow');
P('  重渲染瞬间 #profileFeedBtnRow 是否仍取到 = ' + !!rowAfter +
  (rowAfter ? ('，parentNode = ' + (rowAfter.parentNode ? '<' + rowAfter.parentNode.tagName.toLowerCase() + '>' : 'null（被冲掉）')) : '（节点已随 innerHTML 一起消失）'));
// 触发 observer 回调（jsdom 的 MutationObserver 在微任务中触发，需给它一个 tick）
var observerDone = false;
var t0 = Date.now();
win.Promise.resolve().then(function () {}).then(function () {});
// 用 setTimeout 让 jsdom 微任务队列跑完
setTimeout(function () { observerDone = true; runFeedObserverCheck(); }, 30);

function runFeedObserverCheck() {
  var r2 = doc.getElementById('profileFeedBtnRow');
  var e2 = doc.querySelector('#profileBox button[onclick="editProfile()"]');
  var host2 = e2 ? e2.parentNode : null;
  P('  重渲染后 #profileFeedBtnRow 重新出现 = ' + !!r2);
  P('  重渲染后 row.parentNode = ' + (r2 && r2.parentNode ? '<' + r2.parentNode.tagName.toLowerCase() + '>' : 'null'));
  P('  重渲染后 row.parentNode === 新动作条 = ' + !!(host2 && r2 && r2.parentNode === host2));
  P('  重渲染后 display = ' + (r2 ? (r2.style.display || '(空)') : 'N/A'));
  assert(!!r2, '资料卡重渲染后 feed-btn 节点被 MutationObserver 重新归位（节点重新挂回 DOM）');
  assert(host2 && r2 && r2.parentNode === host2, '资料卡重渲染后 feed-btn 自动重新归位到新动作条');
  assert(r2 && r2.style.display === 'block', '重渲染后 feed-btn 仍可见');

  // ⑤ 去重：动作区已有同义「动态」按钮时应自动隐藏
  P('');
  P('去重验证：动作区已存在同义「我的动态」按钮时（在线自视角 api.js 已渲染该按钮）…');
  var e3 = doc.querySelector('#profileBox button[onclick="editProfile()"]');
  var host3 = e3.parentNode;
  var dup = doc.createElement('button');
  dup.className = 'btn btn-outline';
  dup.textContent = '我的动态';
  host3.appendChild(dup);
  win.updateProfileFeedBtn();
  var r3 = doc.getElementById('profileFeedBtnRow');
  P('  #profileFeedBtnRow 是否仍存在于资料卡内 = ' + !!(r3 && r3.parentNode && r3.parentNode.getAttribute('onclick') ? '??' : (r3 && r3.parentNode ? '在' : '已脱开')));
  P('  #profileFeedBtnRow display = ' + (r3 ? (r3.style.display || '(空)') : 'N/A'));
  assert(r3 && r3.style.display === 'none', '检测到同义按钮时自动隐藏本按钮，避免重复');
  host3.removeChild(dup);

  // ⑥ 回到 list 子页（未在 profile）不应报错
  P('');
  P('回归：再次调用 updateProfileFeedBtn() 不抛异常 …');
  var threw = null;
  try { win.updateProfileFeedBtn(); } catch (e) { threw = e && e.message; }
  assert(!threw, '重复调用 updateProfileFeedBtn() 不抛异常' + (threw ? '（' + threw + '）' : ''));

  phase2Favorites();
}

/* ============================================================
   第二批断言：N9-4 收藏持久化
   ============================================================ */
function phase2Favorites() {
  H('N9-4 我的作品集 · 收藏持久化实测');
  var KEY_WORKS = 'xtc:lib:pf:folio:works';
  var KEY_FAV = 'xtc:lib:pf:folio:fav';
  var KEY_PPT = 'xtc:lib:pptw:works';
  var ACC = win.CURRENT_ACCOUNT || 'shared';

  // ---- 键名与其它页一致：裸 key + lsKey() 前缀（项目约定）----
  P('键名口径（项目约定：裸 key，经 window.lsKey() 加账号后缀）:');
  P('  lsKey("' + KEY_FAV + '") = ' + win.lsKey(KEY_FAV));
  assert(win.lsKey(KEY_FAV) === KEY_FAV + '@' + ACC, '收藏表使用裸 key 并经 lsKey() 前缀化（未自创前缀）');
  assert(KEY_FAV.indexOf('xtc:lib:pf:folio:') === 0, '收藏键前缀与本页作品键同族 xtc:lib:pf:folio:');

  // ---- 准备两个来源的作品：本页新增 + 演示页只读聚合 ----
  var mineWorks = [
    { id: 'f_test_1', title: '秋招简历 V3', type: '简历', images: [], link: '', desc: '一页纸版本', tags: ['秋招', '简历'], createdAt: '2026-09-15T10:00:00.000Z' },
    { id: 'f_test_2', title: '四级冲刺 PPT', type: 'PPT', images: [], link: '', desc: '词汇高频', tags: ['四级'], createdAt: '2026-09-16T08:00:00.000Z' }
  ];
  var pptWorks = [
    { id: 'ppt_test_1', title: '演示页作品 A', type: 'PPT', images: [], description: '来自演示页', tags: ['演示'], createdAt: '2026-09-14T09:00:00.000Z' }
  ];
  win.localStorage.setItem(win.lsKey(KEY_WORKS), JSON.stringify(mineWorks));
  win.localStorage.setItem(win.lsKey(KEY_PPT), JSON.stringify(pptWorks));
  win.localStorage.removeItem(win.lsKey(KEY_FAV));
  P('');
  P('已预置 localStorage（模拟真实使用）：');
  P('  ' + win.lsKey(KEY_WORKS) + ' -> ' + mineWorks.length + ' 件（本页新增）');
  P('  ' + win.lsKey(KEY_PPT) + '   -> ' + pptWorks.length + ' 件（演示页只读聚合）');
  P('  ' + win.lsKey(KEY_FAV) + '     -> 已清空（未收藏）');

  // ---- 渲染列表 ----
  var grid = doc.getElementById('xtFolioGrid');
  var bar = doc.getElementById('xtFolioBar');
  assert(!!grid && !!bar, '作品集 DOM（#xtFolioGrid / #xtFolioBar）存在');
  win.xtFolioRender();
  var items0 = grid.querySelectorAll('.xtf-item');
  P('');
  P('首次渲染：卡片数 = ' + items0.length + '（期望 3 = 本页 2 + 演示 1）');
  P('  分页条 HTML 摘要: ' + String(bar.textContent).replace(/\s+/g, ' ').trim().slice(0, 90));
  assert(items0.length === 3, '两个来源已聚合渲染（本页 2 + 演示页 1 = 3 张卡片）');

  var favBefore = grid.querySelectorAll('.xtf-fav.on').length;
  P('  收藏态卡片数 = ' + favBefore + '（期望 0）');
  assert(favBefore === 0, '初始无任何收藏（☆ 全为空心）');
  assert(win.localStorage.getItem(win.lsKey(KEY_FAV)) === null, '初始 localStorage 中无收藏键（未写入空壳）');

  // ---- 模拟「用户产生收藏动作」：点击某卡片的 ☆ 收藏钮（走绑定的 click 委托）----
  P('');
  P('>> 模拟用户收藏：点击 id=f_test_2（四级冲刺 PPT）卡片右上角 ☆ …');
  var targetFav = grid.querySelector('.xtf-fav[data-xf-fav="f_test_2"]');
  assert(!!targetFav, '找到测试卡片的收藏按钮 .xtf-fav[data-xf-fav="f_test_2"]');
  P('  点击前按钮 class = "' + targetFav.className + '" 文案="' + targetFav.textContent + '"');
  TOASTS.length = 0;
  targetFav.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  var favRaw = win.localStorage.getItem(win.lsKey(KEY_FAV));
  P('');
  P('写入断言：');
  P('  toast 提示 = ' + JSON.stringify(TOASTS));
  P('  localStorage["' + win.lsKey(KEY_FAV) + '"] = ' + favRaw);
  assert(favRaw !== null, '收藏动作已写入 localStorage（键 ' + win.lsKey(KEY_FAV) + '）');
  var favObj = {};
  try { favObj = JSON.parse(favRaw); } catch (e) {}
  assert(favObj && favObj.f_test_2 === 1, '收藏表内容正确：{"f_test_2":1}（实际 ' + JSON.stringify(favObj) + '）');

  // ---- 顺手收藏一个演示页作品，验证对两个来源都生效 ----
  P('');
  P('>> 再收藏一个演示页作品 id=ppt_test_1（只读来源也应可收藏）…');
  var pptFav = grid.querySelector('.xtf-fav[data-xf-fav="ppt_test_1"]');
  assert(!!pptFav, '找到演示页来源卡片的收藏按钮');
  pptFav.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  favObj = JSON.parse(win.localStorage.getItem(win.lsKey(KEY_FAV)) || '{}');
  P('  收藏表 = ' + JSON.stringify(favObj));
  assert(favObj.ppt_test_1 === 1 && favObj.f_test_2 === 1, '收藏对「本页新增」与「演示页聚合」两个来源都生效');

  // ---- 演示页只读键必须未被回写 ----
  var pptRaw = win.localStorage.getItem(win.lsKey(KEY_PPT));
  assert(JSON.parse(pptRaw).length === pptWorks.length, '只读聚合键 xtc:lib:pptw:works 未被本页改写（仍 ' + pptWorks.length + ' 件）');

  // ---- 视图内收藏（查看弹窗）也写入 ----
  P('');
  P('>> 打开查看弹窗并从弹窗内收藏 id=f_test_1 …');
  win.xtFolioOpenView('f_test_1');
  var vModal = doc.getElementById('xtFolioViewModal');
  var vFav = doc.getElementById('xfVFav');
  P('  弹窗 class 含 active = ' + (vModal.className.indexOf('active') >= 0));
  P('  弹窗收藏按钮文案（收藏前）= "' + vFav.textContent + '"');
  vFav.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  favObj = JSON.parse(win.localStorage.getItem(win.lsKey(KEY_FAV)) || '{}');
  P('  弹窗收藏后 收藏表 = ' + JSON.stringify(favObj));
  P('  弹窗收藏按钮文案（收藏后）= "' + vFav.textContent + '"');
  assert(favObj.f_test_1 === 1, '查看弹窗内收藏同样写入 localStorage');
  assert(vFav.textContent.indexOf('已收藏') >= 0, '弹窗按钮即时回显「★ 已收藏」');
  win.xtFolioCloseView();

  // ---- 收藏筛选 tab ----
  P('');
  P('>> 切到「★ 收藏」筛选 tab …');
  win.xtFolioFilter('fav');
  var favItems = grid.querySelectorAll('.xtf-item');
  P('  收藏筛选下卡片数 = ' + favItems.length + '（期望 3）');
  assert(favItems.length === 3, '收藏筛选正确列出 3 件已收藏作品');
  win.xtFolioFilter('all');

  // ============================================================
  // 关键：重新加载页面 → 断言收藏状态被正确恢复并渲染回原位
  // ============================================================
  H('重新加载页面 → 收藏状态恢复断言');
  var dom2 = new JSDOM(html, {
    url: 'http://127.0.0.1:8913/个人中心.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  var win2 = dom2.window;
  var doc2 = win2.document;

  // 把「上次会话」的 localStorage 整体搬迁到新实例（模拟同一浏览器同一账号）
  var dump = {};
  for (var li = 0; li < win.localStorage.length; li++) {
    var lk = win.localStorage.key(li);
    dump[lk] = win.localStorage.getItem(lk);
  }
  Object.keys(dump).forEach(function (k) { win2.localStorage.setItem(k, dump[k]); });
  P('搬迁 localStorage 键 ' + Object.keys(dump).length + ' 个：');
  Object.keys(dump).forEach(function (k) { P('   ' + k + ' = ' + String(dump[k]).slice(0, 70)); });

  // 重新装桩
  win2.CURRENT_ACCOUNT = 'shared';
  win2.lsKey = function (name) { return win2.CURRENT_ACCOUNT ? name + '@' + win2.CURRENT_ACCOUNT : name; };
  win2.showToast = function () {};
  win2.xtToast = function () {};
  win2.uiConfirm = function () { return win2.Promise.resolve(true); };
  win2.lucideAutoRender = function () {};
  win2.openAppModal = function (id) { var e2 = doc2.getElementById(id); if (e2) e2.classList.add('active'); };
  win2.closeAppModal = function (id) { var e2 = doc2.getElementById(id); if (e2) e2.classList.remove('active'); };
  win2.SubpageRouter = { navigate: function () {}, init: function () {}, onSubpageChange: function () {} };

  var runErrors2 = [];
  inlineScripts.forEach(function (b, i) {
    if (b.trim().length < 20) return;
    try { win2.eval(b); } catch (e) { runErrors2.push('#' + (i + 1) + ': ' + (e && e.message)); }
  });
  P('');
  P('重载后 boot 触发方式: ' + fireReady(win2));
  P('重载后内联脚本执行错误: ' + (runErrors2.length ? runErrors2.join(' | ') : '无'));
  assert(runErrors2.length === 0, '重载后内联脚本执行零异常');

  // boot() 在 DOMContentLoaded 前已直接执行；保险起见再显式渲染一次
  win2.xtFolioRender();
  var grid2 = doc2.getElementById('xtFolioGrid');
  var restoredOn = grid2.querySelectorAll('.xtf-fav.on').length;
  var restoredItems = grid2.querySelectorAll('.xtf-item').length;
  P('');
  P('重载后渲染：卡片数 = ' + restoredItems + '，收藏态（★ on）卡片数 = ' + restoredOn + '（期望 3）');
  assert(restoredItems === 3, '重载后作品列表完整恢复（3 件）');
  assert(restoredOn === 3, '重载后 3 件作品的收藏态全部恢复（★ 高亮回到原卡片，位置未串）');

  // 逐卡核对「哪一张是收藏的」——位置不能串
  var idOnMap = {};
  var allFavBtns = grid2.querySelectorAll('.xtf-fav');
  for (var q = 0; q < allFavBtns.length; q++) {
    var id = allFavBtns[q].getAttribute('data-xf-fav');
    idOnMap[id] = allFavBtns[q].className.indexOf('on') >= 0;
  }
  P('  逐卡收藏态: ' + JSON.stringify(idOnMap));
  assert(idOnMap.f_test_1 === true && idOnMap.f_test_2 === true && idOnMap.ppt_test_1 === true,
    '重载后收藏状态与卡片一一对应（渲染回原位，未错位）');

  // 重载后取消收藏 → 再重载 → 确认取消也被持久化
  P('');
  P('>> 重载后取消收藏 id=f_test_2，再重载一次，确认「取消」同样持久化 …');
  var cancelBtn = grid2.querySelector('.xtf-fav[data-xf-fav="f_test_2"]');
  cancelBtn.dispatchEvent(new win2.MouseEvent('click', { bubbles: true }));
  var afterCancel = JSON.parse(win2.localStorage.getItem(win2.lsKey(KEY_FAV)) || '{}');
  P('  取消后收藏表 = ' + JSON.stringify(afterCancel));
  assert(!afterCancel.f_test_2, '取消收藏已从 localStorage 移除该 id');

  var dom3 = new JSDOM(html, { url: 'http://127.0.0.1:8913/个人中心.html', runScripts: 'outside-only', pretendToBeVisual: true });
  var win3 = dom3.window;
  var doc3 = win3.document;
  for (var li2 = 0; li2 < win2.localStorage.length; li2++) {
    var lk2 = win2.localStorage.key(li2);
    win3.localStorage.setItem(lk2, win2.localStorage.getItem(lk2));
  }
  win3.CURRENT_ACCOUNT = 'shared';
  win3.lsKey = function (n) { return win3.CURRENT_ACCOUNT ? n + '@' + win3.CURRENT_ACCOUNT : n; };
  win3.showToast = function () {}; win3.xtToast = function () {};
  win3.uiConfirm = function () { return win3.Promise.resolve(true); };
  win3.lucideAutoRender = function () {};
  win3.openAppModal = function () {}; win3.closeAppModal = function () {};
  win3.SubpageRouter = { navigate: function () {}, init: function () {}, onSubpageChange: function () {} };
  inlineScripts.forEach(function (b) { if (b.trim().length >= 20) { try { win3.eval(b); } catch (e) {} } });
  fireReady(win3);
  win3.xtFolioRender();
  var g3 = doc3.getElementById('xtFolioGrid');
  var on3 = g3.querySelectorAll('.xtf-fav.on').length;
  var on3Map = {};
  var bs3 = g3.querySelectorAll('.xtf-fav');
  for (var q3 = 0; q3 < bs3.length; q3++) on3Map[bs3[q3].getAttribute('data-xf-fav')] = bs3[q3].className.indexOf('on') >= 0;
  P('  第三次加载后收藏态: ' + JSON.stringify(on3Map) + '  ★数=' + on3);
  assert(on3 === 2, '第三次加载 ★ 数为 2（f_test_1、ppt_test_1）');
  assert(on3Map.f_test_2 === false, '已取消的 f_test_2 保持未收藏（取消动作同样持久化）');

  // ---- 多账号隔离回归：换账号 → 读到的是该账号自己的收藏 ----
  P('');
  P('>> 多账号隔离回归：CURRENT_ACCOUNT 改为 u777，确认读到独立空间（不串号）…');
  var dom4 = new JSDOM(html, { url: 'http://127.0.0.1:8913/个人中心.html', runScripts: 'outside-only', pretendToBeVisual: true });
  var win4 = dom4.window;
  var doc4 = win4.document;
  win4.CURRENT_ACCOUNT = 'u777';
  win4.lsKey = function (n) { return win4.CURRENT_ACCOUNT ? n + '@' + win4.CURRENT_ACCOUNT : n; };
  win4.showToast = function () {}; win4.xtToast = function () {};
  win4.uiConfirm = function () { return win4.Promise.resolve(true); };
  win4.lucideAutoRender = function () {}; win4.openAppModal = function () {}; win4.closeAppModal = function () {};
  win4.SubpageRouter = { navigate: function () {}, init: function () {}, onSubpageChange: function () {} };
  win4.localStorage.setItem('xtc:lib:pf:folio:works@u777', JSON.stringify([
    { id: 'u777_1', title: 'u777 自己的作品', type: '设计', images: [], tags: [], createdAt: '2026-09-16T00:00:00.000Z' }
  ]));
  win4.localStorage.setItem('xtc:lib:pf:folio:fav@u777', JSON.stringify({ u777_1: 1 }));
  inlineScripts.forEach(function (b) { if (b.trim().length >= 20) { try { win4.eval(b); } catch (e) {} } });
  fireReady(win4);
  win4.xtFolioRender();
  var g4 = doc4.getElementById('xtFolioGrid');
  var b4 = g4.querySelectorAll('.xtf-fav');
  var on4 = g4.querySelectorAll('.xtf-fav.on').length;
  var ids4 = [];
  for (var q4 = 0; q4 < b4.length; q4++) ids4.push(b4[q4].getAttribute('data-xf-fav'));
  P('  u777 视角卡片 id = ' + JSON.stringify(ids4) + '  ★数=' + on4);
  assert(ids4.length === 1 && ids4[0] === 'u777_1' && on4 === 1,
    '多账号隔离正确：u777 只看到自己的作品与其收藏，未串到 shared 账号');

  finish();
}

function finish() {
  H('汇总');
  P('PASS = ' + RESULTS.pass + '   FAIL = ' + RESULTS.fail);
  P(RESULTS.fail === 0 ? 'VERDICT: ALL_PASS' : 'VERDICT: HAS_FAILURE');
  fs.writeFileSync(OUT, log.join('\n'), 'utf8');
  console.log('A7_JSDOM_DONE pass=' + RESULTS.pass + ' fail=' + RESULTS.fail + ' -> ' + OUT);
}
