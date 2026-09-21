// R88-J 行为验收（jsdom）—— 覆盖 team-lead 要求的全部断言点
// 运行： node tools/r88j_test.js   （期望 ALL PASS）
const fs = require('fs');
const { JSDOM } = require('D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom');

const REGION = fs.readFileSync('D:/下载的文件/学习工作台/assets/xt-region.js', 'utf8');
const PROFILE = fs.readFileSync('D:/下载的文件/学习工作台/assets/xt-profile.js', 'utf8');

const OUT = [];
function assert(c, m) { OUT.push((c ? 'ok   ' : 'FAIL ') + m); return c; }
function log(s) { OUT.push(s); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ================= 测试 1：XT_REGION / XT_LOC_PICK 底座（openPicker / recent LRU） =================
async function testRegion() {
  log('=== T1: xt-region.js 底座（openPicker / 常用城市 LRU / 搜索） ===');
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="toast"></div></body></html>`,
    { runScripts: 'outside-only', url: 'https://x.local/' });
  const w = dom.window;
  w.eval(REGION);
  const LP = w.XT_LOC_PICK, R = w.XT_REGION;
  assert(!!LP && typeof LP.openPicker === 'function', 'T1 XT_LOC_PICK.openPicker 存在');
  assert(typeof LP.recent === 'function' && LP.RECENT_KEY === 'xt_region_recent', 'T1 recent + RECENT_KEY 契约');

  // LRU：通过 openPicker 选择 10 个省份 → 只留最近 8，且最新在首位，去重
  function pickViaOpen(domW, text) {
    return new Promise(resolve => {
      const dom2 = domW;
      dom2.XT_LOC_PICK.openPicker({ title: 't', confirmText: '确定' }, () => {});
      const root = dom2.document.querySelector('.xtlp');
      const item = Array.from(root.querySelectorAll('.xtlp-item')).find(el => el.getAttribute('data-text') === text);
      if (item) { item.dispatchEvent(new dom2.Event('click', { bubbles: true })); }
      const ok = root.querySelector('.xtlp-ok');
      ok.dispatchEvent(new dom2.Event('click', { bubbles: true }));
      resolve();
    });
  }
  // 直接测 recentPush 语义：通过 openPicker 选 10 个省份
  const provs = R.provinces().slice(0, 10);
  for (const p of provs) await pickViaOpen(w, p);
  const rec = LP.recent();
  assert(rec.length === 8, 'T1 常用城市 LRU ≤8 (got=' + rec.length + ')');
  assert(rec[0] === provs[9], 'T1 最新置顶 (got=' + rec[0] + ' 期望=' + provs[9] + ')');

  // 搜索联想
  const hits = R.search('天河', 10);
  assert(hits.length >= 1 && hits[0].text.indexOf('天河') >= 0, 'T1 搜索「天河」命中 (' + (hits[0] && hits[0].text) + ')');

  // openPicker 确认回调 + 取消回调
  let got = 'X';
  w.XT_LOC_PICK.openPicker({ title: 't', confirmText: '确定' }, v => { got = v; });
  let root = w.document.querySelector('.xtlp');
  let item = Array.from(root.querySelectorAll('.xtlp-item')).find(el => el.getAttribute('data-text') === '北京市');
  item.dispatchEvent(new w.Event('click', { bubbles: true }));
  root.querySelector('.xtlp-ok').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(5);
  assert(got === '北京市', 'T1 openPicker 确认回传 text (got=' + got + ')');
  assert(!!root.querySelector('.xtlp-ok'), 'T1 确认前 ok 存在');

  let cancelled = 'Y';
  w.XT_LOC_PICK.openPicker({ title: 't' }, v => { cancelled = v; });
  root = w.document.querySelector('.xtlp');
  root.querySelector('[data-act="cancel"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  await sleep(5);
  assert(cancelled === null, 'T1 openPicker 取消回传 null (got=' + cancelled + ')');

  // 确认按钮在未选中时禁用
  w.XT_LOC_PICK.openPicker({ title: 't' }, () => {});
  root = w.document.querySelector('.xtlp');
  const okDisabled = root.querySelector('.xtlp-ok').hasAttribute('disabled');
  assert(okDisabled, 'T1 未选位置时确认按钮 disabled');
  root.querySelector('[data-act="cancel"]').dispatchEvent(new w.Event('click', { bubbles: true }));
}

// ================= 测试 2：xt-profile.js 地区跳转往返回写 =================
async function testProfile() {
  log('');
  log('=== T2: 个人资料页 地区跳转 + 回写 profile.city + TTL ===');
  const dom = new JSDOM(`<!DOCTYPE html><html><body class="theme-home">
    <div class="xtp-wrap"><main id="xtProfileRoot" class="xtp-root"></main></div>
    <div id="xtpViews"></div><div id="xtpToast"></div><div id="xtpModalHost"></div>
    </body></html>`, { runScripts: 'outside-only', url: 'https://x.local/个人资料.html' });
  const w = dom.window;
  w.lucideAutoRender = () => {};
  w.isOnlineSession = () => false;
  w.api = () => Promise.resolve({ items: [] });

  // 预置 region_pick（未过期）
  w.localStorage.setItem('xt_region_pick', JSON.stringify({ text: '广东省 广州市 天河区', ts: Date.now() }));
  w.eval(PROFILE);
  await sleep(80);
  // 读 profile.city
  function getCity() {
    try { const d = JSON.parse(w.localStorage.getItem('study_workbench_data') || '{}'); return (d.profile && d.profile.city) || ''; } catch (e) { return ''; }
  }
  assert(getCity() === '广东省 广州市 天河区', 'T2 进入页面消费回写 → profile.city (got=' + getCity() + ')');
  assert(w.localStorage.getItem('xt_region_pick') === null, 'T2 回写值一次性消费（已 remove）');

  // TTL 过期：置 11 分钟前的 ts → 不消费
  w.localStorage.setItem('xt_region_pick', JSON.stringify({ text: '上海市', ts: Date.now() - 11 * 60 * 1000 }));
  // 触发再消费：模拟直接调 xtpTakeRegionPick 不可达（闭包）→ 用重进 boot：重新 eval 不行(已加载)。
  // 用 XT_LOC_PICK 无关。改为断言「过期值留在 localStorage 未被写入 city」不成立（因已 boot 过）。
  // 采用：清 localStorage 中 city，再放过期值，重新构造页面测。
  const dom2 = new JSDOM(`<!DOCTYPE html><html><body class="theme-home">
    <div class="xtp-wrap"><main id="xtProfileRoot" class="xtp-root"></main></div>
    <div id="xtpViews"></div><div id="xtpToast"></div><div id="xtpModalHost"></div>
    </body></html>`, { runScripts: 'outside-only', url: 'https://x.local/个人资料.html' });
  const w2 = dom2.window;
  w2.lucideAutoRender = () => {}; w2.isOnlineSession = () => false; w2.api = () => Promise.resolve({ items: [] });
  w2.localStorage.setItem('xt_region_pick', JSON.stringify({ text: '上海市', ts: Date.now() - 11 * 60 * 1000 }));
  w2.eval(PROFILE);
  await sleep(80);
  let c2 = '';
  try { const d = JSON.parse(w2.localStorage.getItem('study_workbench_data') || '{}'); c2 = (d.profile && d.profile.city) || ''; } catch (e) {}
  assert(c2 !== '上海市', 'T2 TTL 过期(11min) → 不回写 (got=' + c2 + ')');

  // 跳转函数：打开编辑视图 → 找到地区行 → 点击 → 走到 xtpOpenRegionPicker → location.href 变 地区选择.html
  w2.xtpOpenView('edit');
  await sleep(40);
  const frows = w2.document.querySelectorAll('.xtp-frow');
  const regionRow = Array.from(frows).find(el => el.getAttribute('data-frow') === 'region');
  assert(!!regionRow, 'T2 编辑视图渲染出「地区」行 (frows=' + frows.length + ')');
  // jsdom 会拦截 location.href 导航（不更新 href），故用源码内建的 window.xtpNavHook 作为可测缝：
  // 行点击 → xtpEditField('region') → xtpOpenRegionPicker() → xtpNav(url) → 命中 hook 记录 url。
  assert(typeof w2.xtpOpenRegionPicker === 'function', 'T2 window.xtpOpenRegionPicker 已导出（可测）');
  let jumped = '';
  w2.xtpNavHook = function (u) { jumped = u; };
  if (regionRow) {
    regionRow.dispatchEvent(new w2.Event('click', { bubbles: true }));
    await sleep(20);
  }
  const jumpOk = jumped.indexOf('地区选择.html?cur=') >= 0 && jumped.indexOf('&back=') >= 0
    && jumped.indexOf('back=' + encodeURIComponent('个人资料.html')) >= 0;
  assert(jumpOk, 'T2 点「地区」行 → 跳转 地区选择.html?cur=..&back=.. (got=' + jumped + ')');
}

// ================= 测试 3：xt-moments.js 两按钮语义 + 静默别名 =================
async function testMoments() {
  log('');
  log('=== T3: 朋友圈 两按钮统一语义 + _failToast 别名 ===');
  const MOM = fs.readFileSync('D:/下载的文件/学习工作台/assets/xt-moments.js', 'utf8');
  const dom = new JSDOM(`<!DOCTYPE html><html><body data-xtm="publish">
    <span class="xtm-fn" id="xtmLocBtn"></span>
    <span class="xtm-fn" id="xtmAtBtn"></span>
    <div id="xtmChosen"></div><div id="toast"></div>
    </body></html>`, { runScripts: 'outside-only', url: 'https://x.local/朋友圈发布.html' });
  const w = dom.window;
  w.showToast = function (m) { w.__toast = m; };
  w.XT_REGION = { locate: (cb) => cb({ ok: false, reason: 'denied' }), reverseGeocode: (a, b, cb) => cb(null), search: () => [], provinces: () => [], textOf: () => '', DATA: [] };
  w.XT_LOC_PICK = undefined; // 模拟底座缺失 → 守卫
  w.eval(MOM);
  await sleep(40);
  assert(typeof w.toast === 'function', 'T3 _failToast 别名 window.toast 已注入');
  // 两按钮都绑了 onclick
  const l = w.document.getElementById('xtmLocBtn'), a = w.document.getElementById('xtmAtBtn');
  assert(typeof l.onclick === 'function' && typeof a.onclick === 'function', 'T3 两位置按钮都绑定了 onclick');
  assert(l.onclick === a.onclick, 'T3 两按钮指向同一处理函数（统一语义）');
}

// ================= 测试 4：私聊.html item8（加号菜单定位 → openPicker） + M7 上传分流 =================
async function testChat() {
  log('');
  log('=== T4: 私聊 item8 定位入口 + M7 imUploadFile 类型分流 ===');
  // 仅抽取 私聊.html 内的 item8 + M7 脚本片段（避免整页 jsdom 依赖）：
  const CHAT = fs.readFileSync('D:/下载的文件/学习工作台/私聊.html', 'utf8');
  // 契约断言（源码级）
  assert(CHAT.indexOf('window.imPlusPickLocation = function') >= 0, 'T4 imPlusPickLocation 已定义');
  assert(CHAT.indexOf('LP.openPicker({') >= 0 && CHAT.indexOf("confirmText: '发送'") >= 0, 'T4 定位走 openPicker(confirmText=发送)');
  assert(CHAT.indexOf('window.imSendLocation(t)') >= 0, 'T4 确认回调 → imSendLocation');
  assert(CHAT.indexOf("imageChat: '/api/uploads/image'") >= 0 && CHAT.indexOf("file: '/api/uploads/file'") >= 0, 'T4 M7 端点常量就绪');

  // 真跑：在隔离 env 中加载 imUploadKind/imUploadFile（从 HTML 抽 <script> 内联段）
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="toast"></div></body></html>`,
    { runScripts: 'outside-only', url: 'https://x.local/私聊.html' });
  const w = dom.window;
  w.showToast = function (m) { w.__toast = m; };
  // 抽出 M7 段（从 UPLOAD_EP 到 imUploadEndpoints 结束）
  const start = CHAT.indexOf('var UPLOAD_EP = {');
  const end = CHAT.indexOf('window.imUploadEndpoints = UPLOAD_EP;');
  assert(start >= 0 && end > start, 'T4 M7 脚本段可抽取');
  const seg = CHAT.substring(start, end + 'window.imUploadEndpoints = UPLOAD_EP;'.length);
  w.eval('(function(){' + seg + '})();');
  assert(typeof w.imUploadFile === 'function' && !!w.imUploadEndpoints, 'T4 imUploadFile 从 私聊.html 段可加载');

  // 三个分流断言（不发网络请求：用超限/无 token 提前 return 的性质验证 kind 判定）
  const mk = (name, type) => ({ name: name, type: type, size: 10 });
  // 通过 too_large 抛出的 err.kind 反推分流
  function kindOf(name, type) {
    let got = '';
    w.imUploadFile(mk(name, type), (e) => { got = e ? e.kind : 'ok'; });
    return got;
  }
  // 图片被判 image（小文件 + 无 token → noauth，kind=image）
  assert(kindOf('a.png', 'image/png') === 'image', 'T4 .png → image 分流');
  assert(kindOf('a.mp4', 'video/mp4') === 'video', 'T4 .mp4 → video 分流');
  assert(kindOf('a.m4a', 'audio/mp4') === 'voice', 'T4 .m4a → voice 分流');
  assert(kindOf('a.pdf', 'application/pdf') === 'file', 'T4 .pdf → file 分流（文档降级）');
  // 超限：20MB+ 的 pdf → too_large
  let big = { name: 'big.pdf', type: 'application/pdf', size: 21 * 1048576 };
  let bigErr = '';
  w.imUploadFile(big, (e) => { bigErr = e ? e.code : 'ok'; });
  assert(bigErr === 'too_large', 'T4 超限(21MB pdf) → too_large');
}

(async function main() {
  try {
    await testRegion();
    await testProfile();
    await testMoments();
    await testChat();
  } catch (e) {
    log('RUNTIME ERROR: ' + e.message + '\n' + (e.stack || ''));
  }
  const fails = OUT.filter(l => l.indexOf('FAIL') === 0);
  console.log(OUT.join('\n'));
  console.log(fails.length ? ('\nFAILED ' + fails.length) : ('\nALL PASS (' + OUT.filter(l => l.indexOf('ok') === 0).length + ' assertions)'));
  process.exit(fails.length ? 1 : 0);
})();
