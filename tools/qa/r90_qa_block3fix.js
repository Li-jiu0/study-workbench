/* eslint-disable */
/**
 * R90 QA 块3（v3）——朋友圈「位置/所在位置」跳整页 地区选择.html 闭环
 *
 * 手法：node 内置 http 起一个本地静态服务器（只服务本仓库 ROOT），
 *       jsdom 以真实 http://127.0.0.1:PORT/ 加载页面 → 所有 <script src> 真下载真执行
 *       → xt-moments.js 原生 boot 绑定处理器 → 点击真触发跳转（缝 xtmNavHook 截获）
 *       地区选择页也用真实 http 加载，goBack()/pick() 真写 location.href → 真断言闭环
 *
 * 运行： NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r90_qa_block3fix.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const OUT = [], R = [];
function log(s) { OUT.push(s == null ? '' : String(s)); }
function sec(t) { log(''); log('== ' + t + ' =='); }
function assert(n, c, d) {
  R.push({ name: n, pass: !!c, detail: d == null ? '' : String(d) });
  log((c ? '[PASS] ' : '[FAIL] ') + n + (d !== '' && d !== undefined ? ' || ' + d : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const momentsJs = fs.readFileSync(path.join(ROOT, 'assets', 'xt-moments.js'), 'utf8');
const regPageSrc = fs.readFileSync(path.join(ROOT, '地区选择.html'), 'utf8');
const pubPageSrc = fs.readFileSync(path.join(ROOT, '朋友圈发布.html'), 'utf8');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const servedLog = [];

function startServer() {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      let rel = '';
      try { rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''); } catch (e) { rel = ''; }
      if (!rel) rel = 'index.html';
      const fp = path.join(ROOT, rel);
      servedLog.push(rel);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      res.end(fs.readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', function () { resolve({ srv: srv, port: srv.address().port }); });
  });
}

/** 加载 朋友圈发布.html（真实 http，真实执行全部脚本） */
function loadPublishPage(origin, opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on('jsdomError', function () {});
  const bootTag = '<script>window.__R90_NAV=[];'
    + (opts.seed == null ? '' : 'try{localStorage.setItem("xt_region_pick",' + JSON.stringify(opts.seed) + ');}catch(e){}')
    + '</script>';
  const html = pubPageSrc.replace('<body class="theme-home" data-xtm="publish">',
    '<body class="theme-home" data-xtm="publish">' + bootTag);
  return new JSDOM(html, {
    url: origin + '/' + encodeURIComponent('朋友圈发布.html'),
    runScripts: 'dangerously',
    resources: 'usable',
    VirtualConsole: vc,
    pretendToBeVisual: true,
    beforeParse(w) {
      w.__R90_NAV = [];
      w.xtmNavHook = function (url) { w.__R90_NAV.push(url); return true; };
    }
  });
}

/** 加载 地区选择.html（真实 http） */
function loadRegionPage(origin, search, injectRegion) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', function () {});
  const dom = new JSDOM(regPageSrc, {
    url: origin + '/' + encodeURIComponent('地区选择.html') + (search || ''),
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    VirtualConsole: vc,
    beforeParse(w) { w.__R90_NAV = []; }
  });
  if (injectRegion) { try { dom.window.XT_REGION = injectRegion; } catch (e) {} }
  return dom;
}

/* ==================================================================== */
async function main() {
  const s0 = await startServer();
  const ORIGIN = 'http://127.0.0.1:' + s0.port;
  log('本地静态服务器: ' + ORIGIN + '（根 = ' + ROOT + '）');

  /* ================= B3-1 ================= */
  sec('B3-1 发布页真实加载：xt-moments.js 真执行 + 两按钮各自发起整页跳转');
  const d1 = loadPublishPage(ORIGIN);
  await sleep(2500);
  const w = d1.window, d = w.document;
  log('typeof window.XTM = ' + typeof w.XTM);
  log('typeof window.XT_LOC_PICK = ' + typeof w.XT_LOC_PICK);
  log('typeof window.XT_TOAST / toast = ' + typeof w.XT_TOAST + ' / ' + typeof w.toast);
  log('body[data-xtm] = ' + JSON.stringify(d.body.getAttribute('data-xtm')));
  log('服务器已服务文件数 = ' + servedLog.length + '，脚本类 = ' + servedLog.filter(function (x) { return /\.js$/.test(x); }).length);
  assert('B3-1.0 发布页真实加载，xt-moments.js 真执行并暴露 XTM', typeof w.XTM === 'object');

  const locBtn = d.getElementById('xtmLocBtn');
  const atBtn = d.getElementById('xtmAtBtn');
  assert('B3-1.1 #xtmLocBtn 存在', !!locBtn);
  assert('B3-1.2 #xtmAtBtn 存在', !!atBtn);
  assert('B3-1.2b #xtmLocBtn.onclick 是函数（原生 boot 已绑定）',
    !!locBtn && typeof locBtn.onclick === 'function', locBtn ? typeof locBtn.onclick : 'n/a');
  assert('B3-1.2c #xtmAtBtn.onclick 是函数（原生 boot 已绑定）',
    !!atBtn && typeof atBtn.onclick === 'function', atBtn ? typeof atBtn.onclick : 'n/a');

  w.__R90_NAV.length = 0;
  let e1 = '';
  try { locBtn.onclick(); } catch (e) { e1 = String(e && e.message || e).slice(0, 200); }
  const navLoc = w.__R90_NAV.slice();
  w.__R90_NAV.length = 0;
  let e2 = '';
  try { atBtn.onclick(); } catch (e) { e2 = String(e && e.message || e).slice(0, 200); }
  const navAt = w.__R90_NAV.slice();

  log('#xtmLocBtn 点击 → nav = ' + JSON.stringify(navLoc) + ' err=' + JSON.stringify(e1));
  log('#xtmAtBtn  点击 → nav = ' + JSON.stringify(navAt) + ' err=' + JSON.stringify(e2));

  assert('B3-1.3 #xtmLocBtn 发起整页跳转（URL 非空）', navLoc.length > 0, JSON.stringify(navLoc));
  assert('B3-1.4 #xtmAtBtn 发起整页跳转（URL 非空）', navAt.length > 0, JSON.stringify(navAt));
  const dec = function (s) { try { return decodeURIComponent(String(s)); } catch (e) { return String(s); } };
  [['loc', navLoc], ['at', navAt]].forEach(function (pr) {
    const u = pr[1][0] || '', t = 'B3-1.5-' + pr[0], du = dec(u);
    assert(t + '.1 URL 指向 地区选择.html', du.indexOf('地区选择.html') >= 0, du);
    assert(t + '.2 URL 带 cur= 参数', /[?&]cur=/.test(u), du);
    assert(t + '.3 URL 带 back= 参数', /[?&]back=/.test(u), du);
    assert(t + '.4 back 解码 = 朋友圈发布.html（回跳发表页，非默认 个人中心）',
      /\bback=/.test(u) && dec(u.split('back=')[1] || '').indexOf('朋友圈发布.html') >= 0, du);
  });
  assert('B3-1.6 两按钮产生完全相同的跳转 URL（共用同一处理器 xtmPickLocation）',
    !!navLoc[0] && navLoc[0] === navAt[0], navLoc[0] + ' VS ' + navAt[0]);
  assert('B3-1.7 首选是整页跳转而非页内弹层（XT_LOC_PICK 存在但未被调用）',
    typeof w.XT_LOC_PICK === 'object' && navLoc.length > 0,
    'XT_LOC_PICK=' + typeof w.XT_LOC_PICK + ' nav=' + JSON.stringify(navLoc));

  /* ================= B3-2 ================= */
  sec('B3-2 闭环证明：地区选择页 ?back=朋友圈发布.html → goBack()/pick() 真跳回');
  const lines = regPageSrc.split('\n');
  const gbLine = lines.findIndex(function (l) { return l.indexOf('goBack: function') >= 0; });
  const gbBlock = lines.slice(gbLine, gbLine + 5).join('\n');
  log('goBack 源码（L' + (gbLine + 1) + ' 起）:');
  gbBlock.split('\n').forEach(function (l) { log('   ' + l.trim().slice(0, 170)); });
  assert('B3-2.1 goBack 使用 state.back', /state\.back/.test(gbBlock));
  assert('B3-2.2 goBack 首选 location.replace(state.back)', /location\.replace\(state\.back\)/.test(gbBlock));
  assert('B3-2.3 默认 back = 个人中心.html（说明 back 参数非默认值）', /back:\s*'个人中心\.html'/.test(regPageSrc));
  assert("B3-2.4 boot 读 param('back') 覆盖 state.back",
    /param\('back'\)/.test(regPageSrc) && /if\s*\(b\)\s*state\.back\s*=\s*b/.test(regPageSrc));
  const pkLine = lines.findIndex(function (l) { return l.indexOf('function pick(text)') >= 0; });
  const pkBlock = lines.slice(pkLine, pkLine + 13).join('\n');
  log('pick() 源码（L' + (pkLine + 1) + ' 起，节选）:');
  pkBlock.split('\n').slice(0, 12).forEach(function (l) { log('   ' + l.trim().slice(0, 170)); });
  assert('B3-2.5 pick() 选中后也跳 state.back（回写+回跳一体）', /location\.replace\(state\.back\)/.test(pkBlock));
  assert('B3-2.6 pick() 把 {text,ts} 写入 localStorage（回写数据源）',
    /localStorage\.setItem\(\s*PICK_KEY\s*,\s*JSON\.stringify\(\{\s*text:/.test(pkBlock));

  // 运行时：带 back 参数 → goBack() 真跳（观察 location.href 变化）
  const rg = loadRegionPage(ORIGIN, '?back=' + encodeURIComponent('朋友圈发布.html'), {
    provinces: function () { return []; }, citiesOf: function () { return []; }, districtsOf: function () { return []; },
    textOf: function () { return ''; }, search: function () { return []; }, locate: function (cb) { cb({ ok: false }); }
  });
  await sleep(1200);
  log('typeof XtrPage = ' + typeof rg.window.XtrPage);
  let gbErr = '';
  try { rg.window.XtrPage.goBack(); } catch (e) { gbErr = String(e && e.message || e).slice(0, 200); }
  await sleep(600);
  let hrefNow = ''; try { hrefNow = rg.window.location.href; } catch (e) { hrefNow = 'ERR'; }
  log('goBack() 后 location.href = ' + hrefNow + '  err=' + JSON.stringify(gbErr));
  assert('B3-2R.1 goBack() 真跳回 朋友圈发布.html（闭环达成，非仅参数存在）',
    dec(hrefNow).indexOf('朋友圈发布.html') >= 0, hrefNow);
  assert('B3-2R.2 goBack() 未跳向默认 个人中心.html', dec(hrefNow).indexOf('个人中心.html') < 0, hrefNow);

  // 对照：不带 back → 默认 个人中心.html
  const rg2 = loadRegionPage(ORIGIN, '', {
    provinces: function () { return []; }, citiesOf: function () { return []; }, districtsOf: function () { return []; },
    textOf: function () { return ''; }, search: function () { return []; }, locate: function (cb) { cb({ ok: false }); }
  });
  await sleep(1200);
  try { rg2.window.XtrPage.goBack(); } catch (e) {}
  await sleep(600);
  let href2 = ''; try { href2 = rg2.window.location.href; } catch (e) {}
  log('（对照）无 back 参数 goBack() 后 href = ' + href2);
  assert('B3-2R.3 对照：无 back 参数时回跳默认 个人中心.html（证明 back 是决定因素）',
    dec(href2).indexOf('个人中心.html') >= 0, href2);

  // 对照 2：pick() 真写入 + 真回跳
  const rg3 = loadRegionPage(ORIGIN, '?cur=&back=' + encodeURIComponent('朋友圈发布.html'), {
    provinces: function () { return ['R90省']; }, citiesOf: function () { return []; }, districtsOf: function () { return []; },
    textOf: function (p, c, dd) { return [p, c, dd].filter(Boolean).join(' '); }, search: function () { return []; },
    locate: function (cb) { cb({ ok: false }); }
  });
  await sleep(1200);
  let pkErr = '';
  try { rg3.window.XtrPage.pick('R90省 R90市'); } catch (e) { pkErr = String(e && e.message || e).slice(0, 200); }
  const storedPick = rg3.window.localStorage.getItem('xt_region_pick');
  log('pick() 后 localStorage[xt_region_pick] = ' + JSON.stringify(storedPick) + ' err=' + JSON.stringify(pkErr));
  assert('B3-2R.4 pick() 真写入回写键 {text,ts}', !!storedPick && /"text"\s*:/.test(storedPick) && /"ts"\s*:/.test(storedPick), String(storedPick));
  await sleep(900);   // pick() 内 setTimeout 260ms 后跳转
  let href3 = ''; try { href3 = rg3.window.location.href; } catch (e) {}
  log('pick() 延迟后 href = ' + href3);
  assert('B3-2R.5 pick() 真回跳到 朋友圈发布.html（完整闭环：选→回写→回跳）',
    dec(href3).indexOf('朋友圈发布.html') >= 0, href3);

  /* ================= B3-3 降级 ================= */
  sec('B3-3 降级链路：跳转被拒 → openPicker（不抛）→ openPicker 挂 → 本页输入层');
  const d3 = loadPublishPage(ORIGIN);
  await sleep(2500);
  const w3 = d3.window, d3d = w3.document;
  let pickCalled = false, pickOpts = null, pickCb = null, aErr = '';
  w3.__R90_NAV.length = 0;
  w3.XT_LOC_PICK = { openPicker: function (opts, cb) { pickCalled = true; pickOpts = opts; pickCb = cb; } };
  w3.xtmNavHook = function (u) { w3.__R90_NAV.push(u); return false; };
  try { d3d.getElementById('xtmLocBtn').onclick(); } catch (e) { aErr = String(e && e.message || e).slice(0, 200); }
  log('A) hook=false → openPickerCalled=' + pickCalled + ' opts=' + JSON.stringify(pickOpts) + ' err=' + JSON.stringify(aErr));
  assert('B3-3.1 整页跳转被拒（hook 返回 false）→ 降级调用 openPicker', pickCalled);
  assert('B3-3.2 降级调用签名正确（opts 含 title/confirmText/current；第二参是回调）',
    !!pickOpts && 'title' in pickOpts && 'confirmText' in pickOpts && 'current' in pickOpts && typeof pickCb === 'function',
    JSON.stringify(pickOpts) + ' cb=' + typeof pickCb);
  assert('B3-3.3 降级过程不抛异常', aErr === '', aErr);
  if (pickCb) { try { pickCb('R90降级值'); } catch (e) {} }
  const chosenA = (d3d.getElementById('xtmChosen') || {}).textContent || '';
  const clsA = (d3d.getElementById('xtmLocBtn') || {}).className || '';
  log('A) 回调后 #xtmChosen = ' + JSON.stringify(chosenA.trim()) + ' class=' + JSON.stringify(clsA));
  assert('B3-3.4 降级回调真写入位置显示区（#xtmChosen 含值 + 按钮 on 态）',
    chosenA.indexOf('R90降级值') >= 0 && /(^|\s)xtm-fn on(\s|$)/.test(clsA), JSON.stringify(chosenA) + ' | ' + clsA);

  const d4 = loadPublishPage(ORIGIN);
  await sleep(2500);
  const w4 = d4.window, d4d = w4.document;
  w4.XT_LOC_PICK = { openPicker: function () { throw new Error('R90模拟 openPicker 失败'); } };
  w4.xtmNavHook = function (u) { w4.__R90_NAV.push(u); return false; };
  let bErr = '';
  try { d4d.getElementById('xtmLocBtn').onclick(); } catch (e) { bErr = String(e && e.message || e).slice(0, 200); }
  await sleep(120);
  const sheet = d4d.querySelector('.xtm-overlay');
  const disp = sheet ? String(sheet.style.display || '') : '';
  log('B) openPicker 抛异常 → 上层异常=' + JSON.stringify(bErr) + ' 弹层=' + (sheet ? sheet.className + ' display=' + disp : '(未找到)'));
  assert('B3-3.5 openPicker 异常被吞（未冒泡到调用方）', bErr === '', bErr);
  assert('B3-3.6 继续降级到本页输入层（真出现可见弹层，不白屏不静默）',
    !!sheet && disp !== 'none', sheet ? sheet.className + ' display=' + disp : '未找到 .xtm-overlay');

  const d5 = loadPublishPage(ORIGIN);
  await sleep(2500);
  const w5 = d5.window, d5d = w5.document;
  w5.XT_LOC_PICK = undefined;
  w5.xtmNavHook = function (u) { w5.__R90_NAV.push(u); return false; };
  let cErr = '';
  try { d5d.getElementById('xtmLocBtn').onclick(); } catch (e) { cErr = String(e && e.message || e).slice(0, 200); }
  await sleep(120);
  const sheetC = d5d.querySelector('.xtm-overlay');
  assert('B3-3.7 双降级都不可用时仍不抛异常（有兜底）', cErr === '', cErr);
  assert('B3-3.8 双降级时本页输入层仍出现', !!sheetC && String(sheetC.style.display || '') !== 'none',
    sheetC ? sheetC.className : '未找到');

  /* ================= B3-4 回写端到端 ================= */
  sec('B3-4 回写链路端到端：地区选择页真写入 → 回跳发布页真消费/回填');
  const seed = storedPick || JSON.stringify({ text: 'R90省 R90市', ts: Date.now() });
  log('种子（取自地区选择页 pick() 的真实写入）= ' + seed);

  const dD = loadPublishPage(ORIGIN, { seed: seed });
  await sleep(2500);
  const keyAfter = dD.window.localStorage.getItem('xt_region_pick');
  const chosenD = (dD.window.document.getElementById('xtmChosen') || {}).textContent || '';
  const clsD = (dD.window.document.getElementById('xtmLocBtn') || {}).className || '';
  log('回跳后：key=' + JSON.stringify(keyAfter) + ' #xtmChosen=' + JSON.stringify(chosenD.trim()) + ' class=' + JSON.stringify(clsD));
  assert('B3-4.1 新鲜回写值被消费（一次性：key 被删除）', keyAfter === null, JSON.stringify(keyAfter));
  assert('B3-4.2 值真回填到位置显示区（#xtmChosen 含地址）', chosenD.indexOf('R90省') >= 0, JSON.stringify(chosenD));
  assert('B3-4.3 位置按钮进入已选态（class 含 xtm-fn on）', /(^|\s)xtm-fn on(\s|$)/.test(clsD), clsD);

  const dE = loadPublishPage(ORIGIN, { seed: null });
  await sleep(2500);
  const chosenE = (dE.window.document.getElementById('xtmChosen') || {}).textContent || '';
  log('无 key 页 #xtmChosen = ' + JSON.stringify(chosenE.trim()));
  assert('B3-4.4 无 key 时不残留任何位置值（二次消费被拒）', chosenE.indexOf('R90') < 0, JSON.stringify(chosenE));

  const expired = JSON.stringify({ text: 'R90过期值', ts: Date.now() - 11 * 60 * 1000 });
  const dF = loadPublishPage(ORIGIN, { seed: expired });
  await sleep(2500);
  const chosenF = (dF.window.document.getElementById('xtmChosen') || {}).textContent || '';
  const keyF = dF.window.localStorage.getItem('xt_region_pick');
  log('TTL 过期页 #xtmChosen = ' + JSON.stringify(chosenF.trim()) + ' key=' + JSON.stringify(keyF));
  assert('B3-4.5 TTL 过期值被拒绝（不回填）', chosenF.indexOf('R90过期值') < 0, JSON.stringify(chosenF));
  assert('B3-4.6 TTL 过期值仍被消费掉（key 删除，不留脏数据）', keyF === null, JSON.stringify(keyF));

  const within = JSON.stringify({ text: 'R90边界内值', ts: Date.now() - 9 * 60 * 1000 });
  const dF2 = loadPublishPage(ORIGIN, { seed: within });
  await sleep(2500);
  const chosenF2 = (dF2.window.document.getElementById('xtmChosen') || {}).textContent || '';
  log('TTL 边界内（9 分钟）页 #xtmChosen = ' + JSON.stringify(chosenF2.trim()));
  assert('B3-4.7 对照：TTL 边界内（9 分钟）值被接受（证明 TTL 判断有效而非一刀切）',
    chosenF2.indexOf('R90边界内值') >= 0, JSON.stringify(chosenF2));

  let malErr = '', dG = null;
  try { dG = loadPublishPage(ORIGIN, { seed: '{这不是合法JSON' }); await sleep(2500); }
  catch (e) { malErr = String(e && e.message || e).slice(0, 200); }
  if (dG) {
    const chosenG = (dG.window.document.getElementById('xtmChosen') || {}).textContent || '';
    const keyG = dG.window.localStorage.getItem('xt_region_pick');
    log('畸形 JSON 页 #xtmChosen = ' + JSON.stringify(chosenG.trim()) + ' key=' + JSON.stringify(keyG) + ' err=' + JSON.stringify(malErr));
    assert('B3-4.8 畸形 JSON 不抛异常且不回填', malErr === '' && chosenG.indexOf('R90') < 0, malErr + ' | ' + JSON.stringify(chosenG));
    assert('B3-4.9 畸形 JSON 的 key 也被清掉（不留脏键）', keyG === null, JSON.stringify(keyG));
  } else {
    assert('B3-4.8 畸形 JSON 不抛异常且不回填', false, malErr);
    assert('B3-4.9 畸形 JSON 的 key 也被清掉', false, 'n/a');
  }

  /* ================= B3-5 ================= */
  sec('B3-5 朋友圈发布.html 变更审计（任务书声称未改 = 12612 字节）');
  const pubBytes = fs.statSync(path.join(ROOT, '朋友圈发布.html')).size;
  log('实测字节 = ' + pubBytes + '（任务书 12612，差 ' + (pubBytes - 12612) + '）');
  const ids = [];
  const reId = /id="(xtm[A-Za-z0-9]+)"/g; let mm;
  while ((mm = reId.exec(pubPageSrc))) ids.push(mm[1]);
  log('页面 id="xtm*" = ' + JSON.stringify(ids));
  assert('B3-5.1 #xtmFileImg 在位', ids.indexOf('xtmFileImg') >= 0);
  assert('B3-5.2 #xtmFileVid 在位', ids.indexOf('xtmFileVid') >= 0);
  assert('B3-5.3 #xtmCancel / #xtmSubmit 在位', ids.indexOf('xtmCancel') >= 0 && ids.indexOf('xtmSubmit') >= 0);
  assert('B3-5.4 #xtmLocBtn / #xtmAtBtn 在位', ids.indexOf('xtmLocBtn') >= 0 && ids.indexOf('xtmAtBtn') >= 0);
  assert('B3-5.5 功能栏 6 按钮齐全',
    ['xtmLocBtn', 'xtmVisBtn', 'xtmMentionBtn', 'xtmAtBtn', 'xtmVidBtn', 'xtmLinkBtn'].every(function (x) { return ids.indexOf(x) >= 0; }),
    JSON.stringify(ids));
  assert('B3-5.6 字节数 == 12612（任务书期望未改）', pubBytes === 12612,
    '实测 ' + pubBytes + '（差 ' + (pubBytes - 12612) + '）');

  s0.srv.close();
  sec('汇总（块3）');
  const pass = R.filter(function (x) { return x.pass; }).length;
  log('通过 ' + pass + ' / ' + R.length);
  R.filter(function (x) { return !x.pass; }).forEach(function (x) { log('  FAIL: ' + x.name + ' || ' + x.detail); });
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block3fix.out.txt'), OUT.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block3fix.json'),
    JSON.stringify({ total: R.length, pass: pass, results: R }, null, 2));
  console.log('DONE pass=' + pass + '/' + R.length);
  R.filter(function (x) { return !x.pass; }).forEach(function (x) { console.log('FAIL: ' + x.name + ' || ' + x.detail); });
}

main().catch(function (e) {
  log('!! 顶层异常: ' + (e && e.stack || e));
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block3fix.out.txt'), OUT.join('\n'));
  console.log('TOPLEVEL ERROR: ' + (e && e.message || e));
});
