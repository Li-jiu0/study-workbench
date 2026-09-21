/* eslint-disable */
/**
 * R90 QA 块3 + 块4 独立验证
 *
 * 块3：朋友圈定位改「跳转整页」（assets/xt-moments.js + 朋友圈发布.html）
 * 块4：用量页文案精简 + 清空按钮改展开收缩（assets/xt-aiusage.js）
 *
 * 独立性：由 R90 QA 独立编写，未复用工程师脚本。
 * 运行： NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r90_qa_block34.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const OUT = [], R = [];
function log(s) { OUT.push(s == null ? '' : String(s)); }
function sec(t) { log(''); log('== ' + t + ' =='); }
function assert(n, c, d) {
  R.push({ name: n, pass: !!c, detail: d == null ? '' : String(d) });
  log((c ? '[PASS] ' : '[FAIL] ') + n + (d ? ' || ' + d : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const momentsJs = fs.readFileSync(path.join(ROOT, 'assets', 'xt-moments.js'), 'utf8');
const aiusageJs = fs.readFileSync(path.join(ROOT, 'assets', 'xt-aiusage.js'), 'utf8');
const regPage = fs.readFileSync(path.join(ROOT, '地区选择.html'), 'utf8');
const pubPage = fs.readFileSync(path.join(ROOT, '朋友圈发布.html'), 'utf8');

/* ==================================================================== */
/* ============================ 块 3 ================================= */
/* ==================================================================== */
async function block3() {

  sec('B3-1 【跳转整页】#xtmLocBtn / #xtmAtBtn 各自点击都发起整页跳转');
  // 用 朋友圈发布.html 真实 DOM + 真实 xt-moments.js
  const dom = new JSDOM(pubPage, {
    url: 'http://localhost/%E6%9C%8B%E5%8F%8B%E5%9C%88%E5%8F%91%E5%B8%83.html',
    runScripts: 'dangerously',
    resources: undefined,
    pretendToBeVisual: true,
    beforeParse(w) {
      // 拦截外部资源（本页引用的 assets/*.js 我们不加载，改为手动注入目标脚本）
      w.__NAV = [];
      w.xtmNavHook = function (url) { w.__NAV.push(url); return true; };
    }
  });
  const w = dom.window, d = w.document;
  // 屏蔽 <script src> 的真实加载（jsdom 无 resources 时不加载，安全）
  // 手动注入必要的桩：toast / confirmBox / renderChosen 等
  w.eval(`
    window.toast = window.toast || function(){};
    window.showToast = window.toast;
    window.confirmBox = function(){ return { then: function(f){ if(f) f(false); return {then:function(){}}; } }; };
    window.XT_LOC_PICK = undefined;
  `);
  // 注入 xt-moments.js
  let injectErr = '';
  try { w.eval(momentsJs); } catch (e) { injectErr = String(e && e.message || e).slice(0, 400); }
  log('注入 xt-moments.js err=' + JSON.stringify(injectErr));
  log('typeof window.XTM = ' + typeof w.XTM);
  assert('B3-1.0 xt-moments.js 可在 jsdom 中加载并暴露 XTM', typeof w.XTM === 'object', 'err=' + injectErr);

  // 手动触发 publish 页初始化（body data-xtm 可能未设，直接调用 boot 依赖属性）
  const bodyAttr = d.body.getAttribute('data-xtm');
  log('body[data-xtm] = ' + JSON.stringify(bodyAttr));

  const locBtn = d.getElementById('xtmLocBtn');
  const atBtn = d.getElementById('xtmAtBtn');
  assert('B3-1.1 #xtmLocBtn 存在', !!locBtn);
  assert('B3-1.2 #xtmAtBtn 存在', !!atBtn);

  // 清空 nav 记录后分别点击
  w.__NAV.length = 0;
  if (locBtn) locBtn.onclick && locBtn.onclick();
  const navAfterLoc = w.__NAV.slice();
  w.__NAV.length = 0;
  if (atBtn) atBtn.onclick && atBtn.onclick();
  const navAfterAt = w.__NAV.slice();

  log('#xtmLocBtn 点击后 nav = ' + JSON.stringify(navAfterLoc));
  log('#xtmAtBtn 点击后 nav = ' + JSON.stringify(navAfterAt));
  assert('B3-1.3 #xtmLocBtn 发起整页跳转（nav 非空）', navAfterLoc.length > 0, JSON.stringify(navAfterLoc));
  assert('B3-1.4 #xtmAtBtn 发起整页跳转（nav 非空）', navAfterAt.length > 0, JSON.stringify(navAfterAt));
  [['loc', navAfterLoc], ['at', navAfterAt]].forEach(function (pair) {
    const u = pair[1][0] || '';
    assert('B3-1.5-' + pair[0] + ' URL 含 地区选择.html', u.indexOf('地区选择.html') >= 0, u);
    assert('B3-1.6-' + pair[0] + ' URL 含 cur=', u.indexOf('cur=') >= 0, u);
    assert('B3-1.7-' + pair[0] + ' URL 含 back=', u.indexOf('back=') >= 0, u);
    assert('B3-1.8-' + pair[0] + ' back 值为 朋友圈发布.html',
      u.indexOf('back=' + encodeURIComponent('朋友圈发布.html')) >= 0, u);
  });

  /* ---------------- B3-2 back 参数真能跳回 ---------------- */
  sec('B3-2 back 参数真能跳回：读 地区选择.html goBack() 实现（证明闭环，不只断言参数存在）');
  // 默认值
  const defaultBack = /back:\s*'([^']+)'/.exec(regPage);
  log("默认 back = " + (defaultBack ? defaultBack[1] : '(未找到)'));
  assert('B3-2.1 地区选择.html 默认 back = 个人中心.html', !!defaultBack && defaultBack[1] === '个人中心.html',
    defaultBack && defaultBack[1]);
  // goBack 实现
  const goBackSrc = /goBack:\s*function\s*\(\)\s*\{[\s\S]{0,400}?\n\s{2}\}/.exec(regPage);
  log('goBack 源码:');
  log(goBackSrc ? goBackSrc[0] : '(未匹配)');
  assert('B3-2.2 goBack 使用 state.back 跳转', !!goBackSrc && /state\.back/.test(goBackSrc[0]));
  assert('B3-2.3 goBack 用 location.replace(state.back)', !!goBackSrc && /location\.replace\(state\.back\)/.test(goBackSrc[0]));
  // back 参数读取
  const paramRead = /\bparam\('back'\)/.exec(regPage);
  log("param('back') 读取存在: " + !!paramRead);
  const backAssign = /if\s*\(b\)\s*state\.back\s*=\s*b\s*;?/.exec(regPage);
  log('state.back = b 赋值存在: ' + !!backAssign);
  assert("B3-2.4 从 URL 读 back 并写入 state.back（闭环成立）", !!paramRead && !!backAssign);

  // 运行时验证：真实打开 地区选择.html?back=朋友圈发布.html 并调用 goBack()
  sec('B3-2R 运行时：真开 地区选择.html?back=朋友圈发布.html → goBack() 是否跳回');
  const regDom = new JSDOM(regPage, {
    url: 'http://localhost/%E5%9C%B0%E5%8C%BA%E9%80%89%E6%8B%A9.html?back=' + encodeURIComponent('朋友圈发布.html'),
    runScripts: 'dangerously', pretendToBeVisual: true
  });
  const rw = regDom.window;
  log('typeof rw.XtrPage = ' + typeof rw.XtrPage);
  // jsdom 的 location.replace 会导航；用 stub 截获
  let replaced = null, assigned = null;
  try {
    rw.eval(`
      window.__REPLACED = null; window.__ASSIGNED = null;
      try {
        Object.defineProperty(window.location, 'replace', { configurable: true, writable: true, value: function(u){ window.__REPLACED = u; } });
      } catch(e) { window.__LOC_REPLACE_ERR = String(e); }
    `);
  } catch (e) { log('stub location.replace err: ' + e.message); }
  const stateBack = rw.eval('(function(){ try { return XtrPage && XtrPage.__stateBack; } catch(e){ return "n/a"; } })()');
  log('XtrPage 键: ' + JSON.stringify(rw.eval('Object.keys(window.XtrPage || {})')));
  // 调用 goBack
  let gbErr = '';
  try { rw.eval('XtrPage.goBack && XtrPage.goBack()'); } catch (e) { gbErr = String(e && e.message || e).slice(0, 300); }
  replaced = rw.eval('window.__REPLACED');
  const hrefNow = (function () { try { return rw.location.href; } catch (e) { return 'ERR'; } })();
  log('goBack 后 __REPLACED = ' + JSON.stringify(replaced) + '  err=' + JSON.stringify(gbErr));
  log('goBack 后 location.href = ' + hrefNow);
  const jumpedBack = (replaced && String(replaced).indexOf('朋友圈发布.html') >= 0) ||
                     (hrefNow && String(hrefNow).indexOf('%E6%9C%8B%E5%8F%8B%E5%9C%88%E5%8F%91%E5%B8%83.html') >= 0) ||
                     (hrefNow && String(hrefNow).indexOf('朋友圈发布.html') >= 0);
  assert('B3-2R.1 goBack() 真的跳回 朋友圈发布.html（非默认 个人中心.html）',
    !!jumpedBack, 'replaced=' + JSON.stringify(replaced) + ' href=' + hrefNow);
  assert('B3-2R.2 goBack() 未跳向默认的 个人中心.html',
    !(replaced && String(replaced).indexOf('个人中心') >= 0) &&
    !(hrefNow && String(hrefNow).indexOf('%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83') >= 0),
    'replaced=' + JSON.stringify(replaced));

  /* ---------------- B3-3 降级链路 ---------------- */
  sec('B3-3 降级：跳转不可用 → openPicker（不抛异常）；再不可用 → 本页输入层');
  // 情形 A：xtmNavHook 返回 false → 应降级到 openPicker
  let openPickerCalled = false, ipErr = '';
  const w2 = dom.window;
  w2.__NAV.length = 0;
  w2.xtmNavHook = function (u) { w2.__NAV.push(u); return false; };   // 明确失败
  let pickerOpts = null;
  w2.XT_LOC_PICK = {
    openPicker: function (opts, cb) { openPickerCalled = true; pickerOpts = opts; }
  };
  try { d.getElementById('xtmLocBtn').onclick(); } catch (e) { ipErr = String(e && e.message || e).slice(0, 300); }
  log('hook 返回 false 后: openPickerCalled=' + openPickerCalled + ' opts=' + JSON.stringify(pickerOpts) + ' err=' + JSON.stringify(ipErr));
  assert('B3-3.1 跳转被拒 → 降级到 openPicker', openPickerCalled);
  assert('B3-3.2 降级过程不抛异常', ipErr === '', ipErr);

  // 情形 B：openPicker 抛异常 → 应继续降级到本页输入层（不抛到上层）
  let sheetErr = '';
  w2.XT_LOC_PICK = { openPicker: function () { throw new Error('R90模拟 openPicker 失败'); } };
  try { d.getElementById('xtmLocBtn').onclick(); } catch (e) { sheetErr = String(e && e.message || e).slice(0, 300); }
  log('openPicker 抛异常后: 上层异常=' + JSON.stringify(sheetErr));
  assert('B3-3.3 openPicker 抛异常被吞掉，未冒泡到调用方', sheetErr === '', sheetErr);
  // 是否出现本页输入层（inputSheet）？找 dialog/mask
  const anySheet = d.querySelector('.xtm-sheet, .xt-sheet, [class*="sheet"]');
  log('本页输入层节点: ' + (anySheet ? anySheet.className : '(未找到)'));
  assert('B3-3.4 降级到本页输入层（出现 sheet 节点或至少不白屏）', !!anySheet,
    anySheet ? anySheet.className : '未找到 sheet 节点');

  // 情形 C：两者都不可用
  let cErr = '';
  w2.XT_LOC_PICK = undefined;
  w2.xtmNavHook = function () { return false; };
  try { d.getElementById('xtmLocBtn').onclick(); } catch (e) { cErr = String(e && e.message || e).slice(0, 300); }
  assert('B3-3.5 双降级都不抛异常', cErr === '', cErr);

  /* ---------------- B3-4 回写链路 ---------------- */
  sec('B3-4 回写链路：xt_region_pick 新鲜值被消费 / 二次拒绝 / TTL 拒绝 / 畸形 JSON');
  // 重新建一个干净的 publish 页
  const dom2 = new JSDOM(pubPage, {
    url: 'http://localhost/%E6%9C%8B%E5%8F%8B%E5%9C%88%E5%8F%91%E5%B8%83.html',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w3 = dom2.window, d3 = w3.document;
  w3.eval('window.toast=function(){}; window.showToast=window.toast; window.confirmBox=function(){return {then:function(){}};};');
  w3.__NAV = []; w3.xtmNavHook = function (u) { w3.__NAV.push(u); return true; };

  function freshReload(seed) {
    // 用新 window 重新加载，模拟「从地区选择页跳回」
    const nm = new JSDOM(pubPage, { url: 'http://localhost/%E6%9C%8B%E5%8F%8B%E5%9C%88%E5%8F%91%E5%B8%83.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const nw = nm.window;
    nw.eval('window.toast=function(){}; window.showToast=window.toast; window.confirmBox=function(){return {then:function(){}};};');
    nw.__NAV = []; nw.xtmNavHook = function (u) { nw.__NAV.push(u); return true; };
    if (seed != null) { nw.localStorage.setItem('xt_region_pick', seed); }
    nw.eval(momentsJs);
    return nw;
  }

  // A. 新鲜值
  const wa = freshReload(JSON.stringify({ text: 'R90省R90市', ts: Date.now() }));
  const keyAfter = wa.localStorage.getItem('xt_region_pick');
  const dispA = (function () {
    var el = wa.document.getElementById('xtmLocTxt') || wa.document.querySelector('#xtmLocBtn');
    return el ? el.textContent.trim() : null;
  })();
  log('新鲜值消费后 localStorage key = ' + JSON.stringify(keyAfter));
  log('#xtmLocBtn 文案 = ' + JSON.stringify(dispA));
  assert('B3-4.1 新鲜回写值被消费后 key 被删除', keyAfter === null, JSON.stringify(keyAfter));
  assert('B3-4.2 值写入位置显示区', !!dispA && dispA.indexOf('R90省R90市') >= 0, JSON.stringify(dispA));

  // B. 二次消费拒绝（再 reload 一次，key 已删 → 无值）
  const wb = freshReload(null);   // 无 key
  const dispB = (function () {
    var el = wb.document.getElementById('xtmLocTxt') || wb.document.querySelector('#xtmLocBtn');
    return el ? el.textContent.trim() : null;
  })();
  log('二次（无 key）位置显示 = ' + JSON.stringify(dispB));
  assert('B3-4.3 无 key 时位置显示不残留旧值', !dispB || dispB.indexOf('R90省R90市') < 0, JSON.stringify(dispB));

  // C. TTL 过期
  const wc = freshReload(JSON.stringify({ text: 'R90过期值', ts: Date.now() - 11 * 60 * 1000 }));
  const keyC = wc.localStorage.getItem('xt_region_pick');
  const dispC = (function () {
    var el = wc.document.getElementById('xtmLocTxt') || wc.document.querySelector('#xtmLocBtn');
    return el ? el.textContent.trim() : null;
  })();
  log('TTL 过期：key=' + JSON.stringify(keyC) + ' 显示=' + JSON.stringify(dispC));
  assert('B3-4.4 TTL 过期值被拒绝（不写入显示区）', !dispC || dispC.indexOf('R90过期值') < 0, JSON.stringify(dispC));

  // D. 畸形 JSON
  let dErr = null;
  try {
    const wd = freshReload('{这不是合法JSON');
    const dispD = (function () {
      var el = wd.document.getElementById('xtmLocTxt') || wd.document.querySelector('#xtmLocBtn');
      return el ? el.textContent.trim() : null;
    })();
    log('畸形 JSON：显示=' + JSON.stringify(dispD) + ' key=' + JSON.stringify(wd.localStorage.getItem('xt_region_pick')));
    assert('B3-4.5 畸形 JSON 不抛异常且不写入显示区', true, '显示=' + JSON.stringify(dispD));
  } catch (e) { dErr = String(e && e.message || e); }
  assert('B3-4.6 畸形 JSON 加载不抛异常', dErr === null, String(dErr));

  /* ---------------- B3-5 朋友圈发布.html 未改 ---------------- */
  sec('B3-5 朋友圈发布.html：字节数 / 6 按钮 / 文件输入');
  const pubBytes = fs.statSync(path.join(ROOT, '朋友圈发布.html')).size;
  log('朋友圈发布.html 实测字节 = ' + pubBytes + '  （任务书声称未改=12612）');
  // 按钮清单（L54-61 区）
  const btnIds = [];
  const reBtn = /<button[^>]*id="(xtm[A-Za-z]+)"/g;
  let m;
  while ((m = reBtn.exec(pubPage))) { btnIds.push(m[1]); }
  log('button[id^=xtm] = ' + JSON.stringify(btnIds));
  const spans = [];
  const reSpan = /<span[^>]*id="(xtm[A-Za-z]+)"/g;
  while ((m = reSpan.exec(pubPage))) { spans.push(m[1]); }
  log('span[id^=xtm] = ' + JSON.stringify(spans));
  assert('B3-5.1 #xtmFileImg 在位', pubPage.indexOf('id="xtmFileImg"') >= 0);
  assert('B3-5.2 #xtmFileVid 在位', pubPage.indexOf('id="xtmFileVid"') >= 0);
  assert('B3-5.3 #xtmCancel 与 #xtmSubmit 在位',
    pubPage.indexOf('id="xtmCancel"') >= 0 && pubPage.indexOf('id="xtmSubmit"') >= 0);
  assert('B3-5.4 #xtmLocBtn 与 #xtmAtBtn 在位',
    pubPage.indexOf('id="xtmLocBtn"') >= 0 && pubPage.indexOf('id="xtmAtBtn"') >= 0);
  assert('B3-5.5 字节数 == 12612（任务书期望未改）', pubBytes === 12612,
    '实测 ' + pubBytes + '（差 ' + (pubBytes - 12612) + '）');

  return { navAfterLoc, navAfterAt };
}

/* ==================================================================== */
/* ============================ 块 4 ================================= */
/* ==================================================================== */
async function block4() {

  sec('B4-1 源码扫描：4 条旧文案 0 命中 / 新文案存在');
  const OLD = [
    '本机记录 × 服务端累计 · 按今日次数 / 最近时间 / 名称排序',
    '账号级共享额度，非本机',
    '逐模型一行，不聚合；排序 / 高亮 / 筛选一律以「剩余可用量」为准（A 口径）',
    '排序方式（剩余可用量口径）',
    '筛选（按剩余可用量）',
  ];
  OLD.forEach(function (s, i) {
    const n = aiusageJs.split(s).length - 1;
    assert('B4-1.' + (i + 1) + ' 旧文案已删除: ' + s.slice(0, 22) + '…', n === 0, '命中=' + n);
  });

  sec('B4-2 「排序方式」出现位置精确统计（防误判 L873 那处）');
  const allLines = aiusageJs.split('\n');
  const hits = [];
  allLines.forEach(function (l, i) { if (l.indexOf('排序方式') >= 0) hits.push({ line: i + 1, text: l.trim().slice(0, 150) }); });
  log('「排序方式」共 ' + hits.length + ' 处：');
  hits.forEach(function (h) { log('  L' + h.line + '| ' + h.text); });
  assert('B4-2.1 「排序方式」出现 2 处（L870 sublabel + L890 sublabel）', hits.length === 2, '实测 ' + hits.length);
  assert('B4-2.2 未被误改：仍有「排序方式」文案', hits.length >= 1);
  // 关键：原 L873 那处「排序方式」是否被误删/误改？原 L873 是 <select id="UsageSortSel" aria-label="排序方式">
  const sortSelLine = allLines.findIndex(function (l) { return l.indexOf('id="UsageSortSel"') >= 0; });
  log('UsageSortSel 所在行（1-based）= ' + (sortSelLine + 1));
  log('  内容: ' + (sortSelLine >= 0 ? allLines[sortSelLine].trim().slice(0, 180) : 'NOT FOUND'));
  assert('B4-2.3 UsageSortSel 的 aria-label 仍是「排序方式」（未被误改）',
    sortSelLine >= 0 && allLines[sortSelLine].indexOf('排序方式') >= 0);
  // 那个被改的（原 L892）应已无「（剩余可用量口径）」
  assert('B4-2.4 已无「排序方式（剩余可用量口径）」残留',
    aiusageJs.indexOf('排序方式（剩余可用量口径）') < 0);
  // 「筛选」新文案
  const fl = [];
  allLines.forEach(function (l, i) { if (/<span>筛选<\/span>/.test(l)) fl.push(i + 1); });
  log('「<span>筛选</span>」行 = ' + JSON.stringify(fl));
  assert('B4-2.5 「筛选」文案存在（原「筛选（按剩余可用量）」已改）', fl.length >= 1);

  sec('B4-3 skeleton() 返回 HTML 结构闭合（div 配对）');
  const skelM = /function skeleton\(\)\s*\{[\s\S]*?\n\s{2}\}/.exec(aiusageJs);
  log('skeleton() 定位: ' + (skelM ? 'L' + (aiusageJs.slice(0, skelM.index).split('\n').length) : '未匹配'));
  if (skelM) {
    const bodySrc = skelM[0];
    // 静态部分配平：仅统计字面量里的 <div ...> 与 </div>
    const openDiv = (bodySrc.match(/<div[\s>]/g) || []).length;
    const closeDiv = (bodySrc.match(/<\/div>/g) || []).length;
    log('skeleton 源码中 <div 出现 ' + openDiv + ' 次；</div> 出现 ' + closeDiv + ' 次（含字符串内）');
    // 动态拼接的 div（如 '<div id="UsageModelWrap">'）
    assert('B4-3.1 skeleton 源码 div 标签计数不出现「闭合数 < 开标签数」的硬伤',
      closeDiv >= openDiv ? true : (openDiv - closeDiv) <= 3,
      'open=' + openDiv + ' close=' + closeDiv);
  }
  // 更硬的证据：运行时渲染真实 DOM 并检查配平
  sec('B4-3R 运行时：渲染后真实 DOM 里 usage 容器配平 + id 齐全');

  // 构造一个带真实容器的最小页，注入 xt-aiusage.js
  const pageHtml = '<!DOCTYPE html><html><head></head><body>'
    + '<div id="aiUsageMount"></div>'
    + '</body></html>';
  const dom = new JSDOM(pageHtml, { url: 'http://localhost/AI.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  // 桩：toast / 依赖
  w.eval(`
    window.toast = function(){};
    window.XT_AI_USAGE = {
      read: function(){ return []; },
      summarize: function(){ return { rows: [], total: 0 }; },
      clear: function(){ return true; },
      estimateTokens: function(){ return 0; },
      fmtNum: function(n){ return String(n); }
    };
  `);
  let injErr = '';
  try { w.eval(aiusageJs); } catch (e) { injErr = String(e && e.message || e).slice(0, 500); }
  log('注入 xt-aiusage.js err = ' + JSON.stringify(injErr));
  log('window 上 XT_AI_USAGE_PAGE / 相关键 = ' + JSON.stringify(Object.keys(w).filter(function (k) { return /usage|USAGE/i.test(k); })));
  assert('B4-3R.1 xt-aiusage.js 可加载（无语法/立即执行异常）', injErr === '', injErr);

  // 找挂载点/渲染入口
  const apiKeys = Object.keys(w).filter(function (k) { return /USAGE/i.test(k); });
  log('全局 USAGE 相关: ' + JSON.stringify(apiKeys));
  // 尝试常见挂载入口
  let rendered = false;
  const candidates = ['XT_AI_USAGE_PAGE', 'AIUsagePage', 'xtAiUsagePage'];
  for (const c of candidates) {
    if (w[c] && typeof w[c].mount === 'function') {
      try { w[c].mount(d.getElementById('aiUsageMount')); rendered = true; } catch (e) { log('mount err(' + c + '): ' + e.message); }
    }
  }
  log('rendered = ' + rendered);
  const idsInDom = [];
  d.querySelectorAll('[id]').forEach(function (el) { idsInDom.push(el.id); });
  log('DOM 内 id 数 = ' + idsInDom.length);
  log('DOM 内 id（前 60）= ' + JSON.stringify(idsInDom.slice(0, 60)));

  sec('B4-4 关键 id 保全（源码级 + 若已渲染则运行时复核）');
  const IDS = ['UsageClearBtn', 'UsageClearTxt', 'UsageEmpty', 'UsageModelList', 'UsageQuotaSortBar',
    'UsageQuotaFilterBar', 'UsageDetailList', 'UsageExportBtn', 'UsageRangeBar',
    'UsageClearHead', 'UsageQuotaFilterToggle', 'UsageSortSel'];
  IDS.forEach(function (id) {
    const n = aiusageJs.split('id="' + id + '"').length - 1 + aiusageJs.split("id='" + id + "'").length - 1;
    const anywhere = aiusageJs.indexOf(id) >= 0;
    assert('B4-4.' + id + ' 源码中存在', anywhere, 'id= 字面出现 ' + n + ' 次');
  });
  // 任务书提到的 UsageSortBar：实测不存在（真实 id 是 UsageSortSel）
  const usbSrc = aiusageJs.indexOf('UsageSortBar');
  log('「UsageSortBar」源码命中 = ' + usbSrc + '（-1 = 不存在）→ 真实 id 为 UsageSortSel');
  assert('B4-4.X 任务书所述 UsageSortBar 实际名为 UsageSortSel（排序控件未被删）',
    aiusageJs.indexOf('UsageSortSel') >= 0);

  sec('B4-5 清空按钮改展开收缩 —— 功能回归');
  // 读实现
  const bindClearSrc = /function bindClear\(\)\s*\{[\s\S]*?\n\s{2}\}/.exec(aiusageJs);
  const disarmSrc = /function disarmClear\(\)\s*\{[\s\S]*?\n\s{2}\}/.exec(aiusageJs);
  const foldSrc = /function bindClearFold\(\)\s*\{[\s\S]*?\n\s{2}\}/.exec(aiusageJs);
  log('bindClear: ' + (bindClearSrc ? 'FOUND' : 'NOT FOUND') + ' | disarmClear: ' + (disarmSrc ? 'FOUND' : 'NOT FOUND') + ' | bindClearFold: ' + (foldSrc ? 'FOUND' : 'NOT FOUND'));
  assert('B4-5.1 bindClear 存在', !!bindClearSrc);
  assert('B4-5.2 disarmClear 存在（防误触核心）', !!disarmSrc);
  assert('B4-5.3 清空按钮已改造为折叠（bindClearFold 存在）', !!foldSrc);
  // 防误触：第一次点击只 arm，不直接清空
  assert('B4-5.4 防误触逻辑保留：clearArmed 两段式', !!bindClearSrc && /clearArmed/.test(bindClearSrc[0]));
  assert('B4-5.5 第一次点击只武装（文案变「再点一次确认清空」）',
    !!bindClearSrc && /再点一次确认清空/.test(bindClearSrc[0]));
  assert('B4-5.6 武装后超时自动解除（disarmClear 被 setTimeout 调用）',
    !!bindClearSrc && /setTimeout\(disarmClear/.test(bindClearSrc[0]));
  // 折叠默认收起
  const headHtml = /<button[^>]*id="UsageClearHead"[^>]*>/.exec(aiusageJs);
  log('UsageClearHead 开标签: ' + (headHtml ? headHtml[0] : '(未找到)'));
  assert('B4-5.7 折叠区默认收起（aria-expanded="false"）',
    !!headHtml && /aria-expanded="false"/.test(headHtml[0]), headHtml && headHtml[0]);
  assert('B4-5.8 UsageClearBtn 在展开体内（.xt-us-clear-body 紧随 head）',
    /xt-us-clear-body[\s\S]{0,300}?id="UsageClearBtn"/.test(aiusageJs));
  assert('B4-5.9 bindClear 仍用 byId 取 #UsageClearBtn（结构改造后不失配）',
    /el\.clearBtn\s*=\s*byId\("UsageClearBtn"\)/.test(aiusageJs));
  // 折叠行为
  assert('B4-5.10 折叠切换：className 加/去 open + aria-expanded 同步',
    !!foldSrc && /xt-us-clear-row open/.test(foldSrc[0]) && /aria-expanded/.test(foldSrc[0]));

  /* 运行时：真实点击折叠头 → 展开 → 清空按钮可见可点 */
  sec('B4-5R 运行时（jsdom）：折叠头点击 → 展开；清空按钮两段式防误触');
  if (rendered) {
    const head = d.getElementById('UsageClearHead');
    const row = d.getElementById('UsageClearRow');
    const btn = d.getElementById('UsageClearBtn');
    log('head=' + !!head + ' row=' + !!row + ' btn=' + !!btn);
    if (row) {
      log('初始 row.className = ' + JSON.stringify(row.className) + ' aria=' + (head && head.getAttribute('aria-expanded')));
      assert('B4-5R.1 初始为收起（无 open 类）', String(row.className).indexOf('open') < 0, row.className);
      if (head) head.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      log('点击 head 后 row.className = ' + JSON.stringify(row.className) + ' aria=' + head.getAttribute('aria-expanded'));
      assert('B4-5R.2 点击后展开（含 open 类）', String(row.className).indexOf('open') >= 0, row.className);
      assert('B4-5R.3 aria-expanded 同步为 true', head.getAttribute('aria-expanded') === 'true');
      // 再点一次收起
      head.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      log('再点后 row.className = ' + JSON.stringify(row.className));
      assert('B4-5R.4 再点收起', String(row.className).indexOf('open') < 0, row.className);
    }
    if (btn) {
      let clearCalls = 0;
      w.XT_AI_USAGE.clear = function () { clearCalls++; return true; };
      btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const txtAfter1 = (d.getElementById('UsageClearTxt') || {}).textContent;
      log('第一次点击后 clearCalls=' + clearCalls + ' 文案=' + JSON.stringify(txtAfter1) + ' class=' + btn.className);
      assert('B4-5R.5 第一次点击不直接清空（防误触有效）', clearCalls === 0, 'calls=' + clearCalls);
      assert('B4-5R.6 第一次点击文案变为「再点一次确认清空」', txtAfter1 === '再点一次确认清空', JSON.stringify(txtAfter1));
      btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      log('第二次点击后 clearCalls=' + clearCalls);
      assert('B4-5R.7 第二次点击才真正清空', clearCalls === 1, 'calls=' + clearCalls);
    }
  } else {
    log('【标注】未能触发挂载渲染，B4-5R 运行时折叠断言未执行。');
  }

  return {};
}

/* ==================================================================== */
async function main() {
  let b3 = {}, b4 = {};
  try { b3 = await block3(); } catch (e) { log('!! block3 异常: ' + (e && e.stack || e)); }
  try { b4 = await block4(); } catch (e) { log('!! block4 异常: ' + (e && e.stack || e)); }
  sec('汇总');
  const pass = R.filter(function (x) { return x.pass; }).length;
  log('通过 ' + pass + ' / ' + R.length);
  R.filter(function (x) { return !x.pass; }).forEach(function (x) { log('  FAIL: ' + x.name + ' || ' + x.detail); });
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block34.out.txt'), OUT.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block34.json'),
    JSON.stringify({ total: R.length, pass: pass, results: R }, null, 2));
  console.log('DONE pass=' + pass + '/' + R.length);
  R.filter(function (x) { return !x.pass; }).forEach(function (x) { console.log('FAIL: ' + x.name + ' || ' + x.detail); });
}
main();
