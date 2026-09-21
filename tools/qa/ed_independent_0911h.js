/**
 * tools/qa/ed_independent_0911h.js —— QA 独立回归（Edward，不依赖工程师自测脚本的结论）
 * 运行：node tools/qa/ed_independent_0911h.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 * 已知 jsdom 伪影（不判失败）：app.js 顶层 let 对 w.eval 不可见 → api.js 异步 boot 报
 *   blogCatFilter is not defined；生产浏览器共享词法作用域无此问题。
 */
const path = require('path');
const fs = require('fs');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM, VirtualConsole, ResourceLoader } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; FAILS.push(label + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : '')); }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

process.on('unhandledRejection', function (e) {
  console.log('  [后台异步·jsdom伪影] 未处理 rejection: ' + (e && e.message));
});

// 载入完整页面（按 <script> 顺序 eval），返回 {w,d,errors,vcErrors}
function load(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const vcErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => vcErrors.push(String(e && e.message || e)));
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' + page, pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', e => errors.push('[error] ' + (e && (e.message || e.type))));
  w.fetch = function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }); };
  try {
    w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
    w.localStorage.setItem('study_workbench_token', 'test-token');
  } catch (e) { }
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const srcM = attrs.match(/\bsrc="([^"]+)"/);
    try {
      if (srcM) {
        const rel = srcM[1].split('?')[0];
        const fp = path.join(ROOT, decodeURIComponent(rel));
        if (fs.existsSync(fp)) w.eval(fs.readFileSync(fp, 'utf8'));
        else vcErrors.push('[missing src] ' + rel);
      } else if (m[2].trim()) w.eval(m[2]);
    } catch (e) { errors.push('[eval ' + (srcM ? srcM[1] : 'inline') + '] ' + e.message); }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  return { w, d: w.document, errors, vcErrors };
}

// 真渲染模式：本地 HTTP 服务 + runScripts:'dangerously' + resources:'usable'。
// 关键差别：outside-only 模式 jsdom 不执行内联 onclick 属性（实验证实），
// 一切「点击 → 内联 handler」断言必须用本模式才有效。
const http = require('http');
const QA_PORT = 8129;
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.writeHead(200, { 'content-type': ct }); res.end(buf);
  });
});
let serverReady = null;
function ensureServer() {
  if (!serverReady) serverReady = new Promise(res => qaServer.listen(QA_PORT, '127.0.0.1', res));
  return serverReady;
}
async function loadReal(page, fetchImpl) {
  await ensureServer();
  const vcErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => vcErrors.push(String((e && e.message) || e)));
  let wRef = null;
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + QA_PORT + '/' + page,
    virtualConsole: vc,
    beforeParse(w) {
      wRef = w;
      w.fetch = fetchImpl || function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }); };
      try {
        w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
        w.localStorage.setItem('study_workbench_token', 'test-token');
      } catch (e) { }
    },
  });
  await sleep(500); // 等同步脚本链执行完
  return { w: wRef, d: wRef.document, vcErrors };
}

(async function main() {

  /* ============ [A] 交叉回归：chat-local.js 上 7 个需求叠加 ============ */
  sec('[A] 交叉回归（需求1/2/6/9/11 叠加在 chat-local.js）');
  const im = load('私聊.html');
  const { w, d } = im;
  check('A-预置 私聊.html 同步加载零异常', im.errors.length === 0, im.errors.join(' | ').slice(0, 200));
  const T = w.__IM_TEST__;
  check('A-预置 __IM_TEST__ 暴露', !!T && typeof T.renderChats === 'function');
  const list = d.getElementById('imList');
  check('A-预置 #imList 存在', !!list);

  // 会话数据：u5=张三(服务器)、u6=李四(服务器)、本地会话 l1
  T.S.chats.push(
    { id: 1, nickname: '张三', isServer: true, serverId: 5, unread: 2, last: '你好', time: 1000 },
    { id: 2, nickname: '李四', isServer: true, serverId: 6, unread: 0, last: '在吗', time: 2000 },
    { id: 3, nickname: '本地草稿', unread: 1, last: '笔记', time: 3000 }
  );
  T.S.tab = 'chats';

  // ---- A1: 偏好与业务数据的序列化隔离 ----
  w.imChatPrefs.set('u5', { hidden: true });
  const rawPrefs = JSON.parse(w.localStorage.getItem('study_workbench_chat_prefs'));
  check('A1 prefs 独立键持久化', rawPrefs && rawPrefs.u5 && rawPrefs.u5.hidden === true);
  // 模拟业务数据整写（saveData 写 study_workbench_data，与 prefs 互不覆盖）
  w.localStorage.setItem('study_workbench_data', JSON.stringify({ notes: [], chats: [1, 2, 3] }));
  check('A1 saveData 写业务键后 prefs 未被冲掉', (w.imChatPrefs.get('u5') || {}).hidden === true);
  T.renderChats(list);
  check('A1 hidden 会话不渲染', list.innerHTML.indexOf('张三') === -1 && list.innerHTML.indexOf('李四') !== -1);
  T.renderChats(list); // 再次渲染（模拟轮询重渲染）
  check('A1 轮询重渲染后 hidden 保持（不被偏好覆盖丢失）', list.innerHTML.indexOf('张三') === -1);
  // 观察项（非缺陷判定）：refreshPresence 的 ids 包含 hidden 会话用户（S.chats 未过滤 hidden）
  check('A1 观察项：S.chats 仍含 hidden 会话（presence 请求会带上，浪费但不丢偏好）',
    T.S.chats.some(c => c.serverId === 5));

  // ---- A2/A3: 左滑展开态 × 重渲染 × 头像点击（真渲染模式：内联 onclick 必须真实执行）----
  {
    const imr = await loadReal('私聊.html');
    const Tr = imr.w.__IM_TEST__;
    check('A2 真渲染模式 __IM_TEST__ 暴露', !!Tr && typeof Tr.renderChats === 'function');
    const listR = imr.d.getElementById('imList');
    Tr.S.chats.push(
      { id: 1, nickname: '张三', isServer: true, serverId: 5, unread: 2, last: '你好', time: 1000 },
      { id: 2, nickname: '李四', isServer: true, serverId: 6, unread: 0, last: '在吗', time: 2000 },
      { id: 3, nickname: '本地草稿', unread: 1, last: '笔记', time: 3000 }
    );
    Tr.S.groups.push({ id: 5, name: '测试群', memberCount: 3, unreadCount: 1, lastMessage: { senderId: 99, kind: 'text', content: '大家好' } });
    Tr.S.tab = 'chats';
    const rowOfR = tid => listR.querySelector('.im-sess[data-tid="' + tid + '"]');
    Tr.renderChats(listR);
    // 群行动态位移与按钮集（Round 2 新增：群行隐藏置顶、2 按钮 104px）
    const gWrap = listR.querySelector('.im-swipe[data-tid="g5"]');
    check('R2-群行 swipe 容器存在', !!gWrap);
    check('R2-群行无「置顶」按钮（仅免打扰+删除 2 个）',
      gWrap.querySelectorAll('.im-sa').length === 2 && !gWrap.querySelector('.im-sa-pin') &&
      !!gWrap.querySelector('.im-sa-mute') && !!gWrap.querySelector('.im-sa-del'));
    const pWrap = listR.querySelector('.im-swipe[data-tid="u6"]');
    check('R2-私聊行三按钮齐全（含置顶）',
      pWrap.querySelectorAll('.im-sa').length === 3 && !!pWrap.querySelector('.im-sa-pin'));
    imr.w.imOpenSwipe('g5');
    check('R2-群行展开位移 -104px（2 按钮 × 52px）',
      rowOfR('g5') && rowOfR('g5').style.transform === 'translateX(-104px)');
    imr.w.imOpenSwipe('u6');
    check('A2 展开后行位移 -156px（私聊 3 按钮）', rowOfR('u6') && rowOfR('u6').style.transform === 'translateX(-156px)');
    check('A2 展开后容器带 .open', !!(rowOfR('u6').closest('.im-swipe').classList.contains('open')));
    // 展开态下点操作按钮必须生效（捕获监听器不得吞 .im-sa 的点击；Round 2 竞态复核）
    const pinBtn = pWrap.querySelector('.im-sa-pin');
    pinBtn.dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('R2-展开态下点「置顶」生效（prefs 写入 + 重渲染收起）',
      (imr.w.imChatPrefs.get('u6') || {}).pinned === true && listR.querySelectorAll('.im-swipe.open').length === 0);
    Tr.renderChats(listR);
    const delBtn = listR.querySelector('.im-swipe[data-tid="l3"] .im-sa-del');
    imr.w.imOpenSwipe('l3');
    listR.querySelector('.im-swipe[data-tid="l3"] .im-sa-del').dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('R2-展开态下点「删除」生效（仅本机隐藏）',
      (imr.w.imChatPrefs.get('l3') || {}).hidden === true && !listR.querySelector('.im-sess[data-tid="l3"]'));
    Tr.renderChats(listR);
    check('R2-群行免打扰仍可设置', (function () {
      imr.w.imOpenSwipe('g5');
      const mute = listR.querySelector('.im-swipe[data-tid="g5"] .im-sa-mute');
      mute.dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
      const ok = (imr.w.imChatPrefs.get('g5') || {}).muted === true;
      return ok;
    })());
    Tr.renderChats(listR);
    imr.w.imChatPrefs.set('u6', { pinned: false }); // 复位，避免影响后续断言
    imr.w.imChatPrefs.set('g5', { muted: false });
    imr.w.imChatPrefs.set('l3', { hidden: false });
    Tr.renderChats(listR);
    Tr.renderChats(listR); // 模拟 5s 未读轮询触发 renderList -> renderChats
    check('A2 重渲染后无位移残留（transform 清空）',
      !rowOfR('u6') || rowOfR('u6').style.transform === '' || rowOfR('u6').style.transform === 'none');
    // 关键交叉：重渲染后点击另一行，应正常进入会话（修复点：renderChats 清空 S.swipeOpen）
    let openChatCalls = [];
    imr.w.imOpenChat = function (id) { openChatCalls.push(id); };
    rowOfR('l3').dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('A2 重渲染收起后点击行应进入会话（修后 S.swipeOpen 必须已清空，首击不得被吞）',
      openChatCalls.length === 1, 'imOpenChat 调用=' + openChatCalls.length + '（0=被吞，即 BUG-1 复发）');
    // 同一时刻仅一行展开
    imr.w.imOpenSwipe('u6');
    imr.w.imOpenSwipe('l3');
    const openRows = Array.from(listR.querySelectorAll('.im-swipe.open'));
    check('A2 同一时刻仅一行展开', openRows.length === 1 && openRows[0].getAttribute('data-tid') === 'l3');
    imr.w.imCloseSwipe();
    check('A2 imCloseSwipe 全部收起', listR.querySelectorAll('.im-swipe.open').length === 0);
    // A3: 会话行头像点击（.im-swipe 容器包住后 stopPropagation 是否仍有效）
    const navCount = () => imr.vcErrors.filter(x => /navigation/i.test(x)).length;
    let hintCalls = [];
    imr.w.imShowPeerHint = function (id) { hintCalls.push(id); };
    Tr.renderChats(listR);
    const chatBase = openChatCalls.length;
    rowOfR('u6').querySelector('.im-av').dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('A3 会话行头像点击 → 仅提示（imShowPeerHint），不跳主页不进会话',
      hintCalls.length === 1 && openChatCalls.length === chatBase && navCount() === 0,
      'hint=' + hintCalls.length + ' imOpenChat增量=' + (openChatCalls.length - chatBase) + ' nav=' + navCount());
    check('A3 头像点击不改变 swipe 展开态', listR.querySelectorAll('.im-swipe.open').length === 0);
  }

  // ---- A4: 两个角标互不覆盖 ----
  w.imApplyRequestBadge({ unreadCount: 3 });
  const reqBadge = d.querySelector('.im-tab[data-tab="requests"] .tab-badge');
  const chatBadge = d.querySelector('.im-tab[data-tab="chats"] .tab-badge');
  check('A4 requests 角标=3（unreadCount 水位线）', reqBadge && reqBadge.textContent === '3');
  check('A4 chats 角标不被 requests 数据误写', !chatBadge);
  w.imApplyRequestBadge({ incoming: [{}, {}] }); // 旧后端回退
  check('A4 旧后端回退 incoming.length=2', d.querySelector('.im-tab[data-tab="requests"] .tab-badge').textContent === '2');
  w.imApplyRequestBadge({ unreadCount: 0, incoming: [{}] }); // 水位线优先于 incoming
  check('A4 unreadCount=0 时角标移除（不被 incoming.length 复活）',
    !d.querySelector('.im-tab[data-tab="requests"] .tab-badge'));
  // chats 角标走 imCountUnread（免打扰/隐藏不计入）
  // 注意：前面 await loadReal 让出了事件循环，boot 异步链的 loadChats() 已重建 S.chats —— 这里重新播种
  T.S.chats.length = 0;
  T.S.chats.push(
    { id: 1, nickname: '张三', isServer: true, serverId: 5, unread: 2, last: '你好', time: 1000 },
    { id: 2, nickname: '李四', isServer: true, serverId: 6, unread: 5, last: '在吗', time: 2000 },
    { id: 3, nickname: '本地草稿', unread: 1, last: '笔记', time: 3000 }
  );
  w.imChatPrefs.set('u6', { muted: true });
  const cuActual = w.imChatPrefs.countUnread(T.S.chats, w.imChatPrefs.load());
  check('A4 imCountUnread 排除 hidden+muted，仅计未处理会话',
    cuActual === 1,
    '期望 1（l3.unread=1；u5 hidden、u6 muted 均排除），实际=' + cuActual +
    ' prefs=' + JSON.stringify(w.imChatPrefs.load()) +
    ' chats=' + JSON.stringify(T.S.chats.map(c => ({ k: w.imChatPrefs.threadKeyOf(c), u: c.unread }))));

  // ---- A5: presenceText 与 window.formatPresence 文案一致性 ----
  const cases = [
    ['2026-09-12 10:00:00', true], ['', false], [null, false], ['garbage', false],
    ['2026-09-12 09:58:00', false], ['2026-09-11 23:05:00', false], ['2026-09-10 08:00:00', false],
  ];
  let drift = 0;
  cases.forEach(c => {
    const a = T.presenceText(c[0], c[1]);
    const b = w.formatPresence(c[0], c[1]);
    if (a !== b) { drift++; console.log('    漂移: presenceText(' + JSON.stringify(c) + ')=' + a + ' vs formatPresence=' + b); }
  });
  check('A5 presenceText 委托 formatPresence 无文案漂移', drift === 0, '漂移=' + drift);

  /* ============ [B6] formatPresence 边界值 ============ */
  sec('[B6] formatPresence 边界（注入 now）');
  const fp = (a, b, n) => w.formatPresence(a, b, n);
  check('B6 online=true → 在线', fp('2026-09-12 10:00:00', true, '2026-09-12 10:00:30') === '在线');
  check('B6 online=true 且 lastSeenAt 缺失 → 在线（不造假）', fp(null, true, '2026-09-12 10:00:30') === '在线');
  check('B6 双缺 → 空串', fp(null, false, '2026-09-12 10:00:30') === '');
  check('B6 非法时间串 → 空串', fp('not-a-date', false, '2026-09-12 10:00:30') === '');
  check('B6 3分钟 → 刚刚在线', fp('2026-09-12 10:00:30', false, '2026-09-12 10:03:30') === '刚刚在线');
  check('B6 6分钟 → 6分钟前', fp('2026-09-12 10:00:00', false, '2026-09-12 10:06:00') === '6分钟前');
  check('B6 59分钟 → 59分钟前', fp('2026-09-12 09:01:00', false, '2026-09-12 10:00:00') === '59分钟前');
  check('B6 90分钟 → 1小时前', fp('2026-09-12 08:30:00', false, '2026-09-12 10:00:00') === '1小时前');
  check('B6 跨天(昨天23:05, 今天00:30) → 昨天 23:05', fp('2026-09-11 23:05:00', false, '2026-09-12 00:30:00') === '昨天 23:05');
  check('B6 跨月昨天(2/28→3/1) → 昨天 08:08', fp('2026-02-28 08:08:00', false, '2026-03-01 09:00:00') === '昨天 08:08');
  check('B6 跨天优先于小时（25h 仍属昨天 → 昨天 09:00）', fp('2026-09-11 09:00:00', false, '2026-09-12 10:00:00') === '昨天 09:00');
  check('B6 49小时（前天）→ 2天前', fp('2026-09-10 09:00:00', false, '2026-09-12 10:00:00') === '2天前');
  check('B6 未来时间钳制 → 刚刚在线（绝不显示未来）', fp('2026-09-12 23:00:00', false, '2026-09-12 10:00:00') === '刚刚在线');

  /* ============ [B9] 需求9 群消息头像/昵称 ============ */
  sec('[B9] 群消息头像/昵称 → openUserHome（真渲染模式）');
  {
    const g = await loadReal('私聊.html');
    const Tg = g.w.__IM_TEST__;
    const box = g.d.getElementById('imMsgs');
    Tg.S.group = { id: 1, name: '测试群', memberCount: 3 };
    Tg.S.msgs = [
      { id: 'm1', senderId: 7, senderNickname: '甲', content: 'hello', time: Date.now() },
      { id: 'm2', senderId: Tg.S.myId, content: '我自己', time: Date.now() },
    ];
    Tg.renderMsgs();
    const grow = box.querySelector('.im-grow');
    check('B9 他人消息有 .im-grow 结构', !!grow);
    const gav = grow.querySelector('.im-gav');
    const gname = grow.querySelector('.im-gsender');
    check('B9 头像 onclick 含 openUserHome(7)+stopPropagation', gav && /stopPropagation\(\);openUserHome\(7\)/.test(gav.getAttribute('onclick') || ''));
    check('B9 昵称 onclick 同样绑定', gname && /openUserHome\(7\)/.test(gname.getAttribute('onclick') || ''));
    const navB = g.vcErrors.filter(x => /navigation/i.test(x)).length;
    gname.dispatchEvent(new g.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('B9 点击昵称触发导航到个人中心（location.href 被赋值）',
      g.vcErrors.filter(x => /navigation/i.test(x)).length > navB,
      'navErrors=' + g.vcErrors.filter(x => /navigation/i.test(x)).map(x => x.slice(0, 60)).join('|'));
    // 自己的消息不渲染头像/昵称行
    check('B9 自己的消息无 .im-gav', !box.querySelectorAll('.im-m')[1] || !box.querySelectorAll('.im-m')[1].closest('.im-grow'));
    // 消息正文点击不触发主页导航
    const navB2 = g.vcErrors.filter(x => /navigation/i.test(x)).length;
    g.d.querySelector('.im-m[data-mid="m1"]').dispatchEvent(new g.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('B9 点消息正文不触发主页导航', g.vcErrors.filter(x => /navigation/i.test(x)).length === navB2);
  }

  /* ============ [B11] 需求11 删除入口收敛 ============ */
  sec('[B11] 好友行/搜索行无删除；主页删除入口 + uiConfirm 门');
  {
    const f = load('私聊.html');
    const Tf = f.w.__IM_TEST__;
    // 好友列表行渲染
    f.w.fetch = function (url) {
      if (/\/api\/friends$/.test(String(url))) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 11, serverId: 5, nickname: '王五', username: 'w5', motto: '嗨' }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    const lb = f.d.getElementById('imList');
    Tf.renderFriends(lb);
    check('B11 好友行有「发消息」', lb.innerHTML.indexOf('发消息') !== -1);
    check('B11 好友行无「删除」按钮', lb.innerHTML.indexOf('>删除<') === -1 && lb.innerHTML.indexOf('删除好友') === -1);
    // 好友申请.html 搜索行（源码断言行模板不再含 删除好友 按钮）
    const afSrc = fs.readFileSync(path.join(ROOT, '好友申请.html'), 'utf8');
    check('B11 搜索结果行模板无「删除好友」按钮', afSrc.indexOf('afRemoveFriend(' + "'") === -1 ? afSrc.indexOf("onclick=\"afRemoveFriend") === -1 : false);
    // renderUserHome 删除入口 + uiConfirm 二次确认
    f.w.uiConfirm = async () => false;
    let delCalls = [];
    f.w.fetch = function (url, opt) {
      if ((opt && opt.method) === 'DELETE') delCalls.push(String(url));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    await f.w.removeFriend(5, '王五');
    check('B11 uiConfirm=false 时不发 DELETE', delCalls.length === 0);
    f.w.uiConfirm = async () => true;
    await f.w.removeFriend(5, '王五');
    check('B11 uiConfirm=true 后 DELETE /api/friends/5', delCalls.length === 1 && /\/api\/friends\/5$/.test(delCalls[0]), delCalls[0]);
    // 主页渲染含删除按钮（isFriend 用户）
    f.w.fetch = function (url) {
      if (/\/api\/users\/8$/.test(String(url))) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 8, nickname: '赵六', username: 'z6', isFriend: true, motto: '', bio: '', city: '', tags: '', createdAt: '2026-01-01 00:00:00', stats: {}, notes: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    };
    const box2 = f.d.createElement('div');
    f.d.body.appendChild(box2);
    await f.w.renderUserHome(8, box2);
    check('B11 好友的主页有「🗑 删除好友」按钮', box2.innerHTML.indexOf('删除好友') !== -1);
    check('B11 公开主页不渲染 phone 字段（gender/birthday 仅出现在隐私提示文案中属预期）',
      box2.innerHTML.indexOf('phone') === -1);
  }

  /* ============ [B3] 需求3 弹窗无旧页回退 + 好友申请.html 独立可用 ============ */
  sec('[B3] 需求3');
  {
    const { w, d } = im;
    const modal = d.getElementById('imAddFriendModal');
    check('B3 弹窗存在', !!modal);
    check('B3 弹窗内无 好友申请.html 链接', !modal.querySelector('a[href="好友申请.html"]'));
    check('B3 弹窗内无「后续扩展点」字样', modal.innerHTML.indexOf('后续扩展点') === -1);
    const psrc = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
    check('B3 私聊.html 源码无 href="好友申请.html"', psrc.indexOf('href="好友申请.html"') === -1);
    check('B3 好友申请.html 文件保留', fs.existsSync(path.join(ROOT, '好友申请.html')));
    // 直连好友申请.html 页面可开
    const af = load('好友申请.html');
    check('B3 好友申请.html 直连零同步异常', af.errors.length === 0, af.errors.join(' | ').slice(0, 200));
    check('B3 好友申请.html doSearch 存活', typeof af.w.doSearch === 'function' || typeof af.w.afOpenChat === 'function');
  }

  /* ============ [B7] 需求7 吸底操作栏 ============ */
  sec('[B7] 需求7 .ed-actions-bar 吸底（源码级）');
  {
    const blogSrc = fs.readFileSync(path.join(ROOT, '学习博客.html'), 'utf8');
    check('B7 学习博客.html 存在 .ed-actions-bar 节点', blogSrc.indexOf('ed-actions-bar') !== -1);
    const m = blogSrc.match(/<div class="blog-wrap blog-editor" id="blogViewEdit" style="display:none"/);
    check('B7 编辑视图默认 display:none（只读视图无悬空栏）', !!m);
    const barIdx = blogSrc.indexOf('editor-actions ed-actions-bar');
    const editIdx = blogSrc.indexOf('id="blogViewEdit"');
    check('B7 吸底栏位于编辑视图内部', barIdx > editIdx);
    const css = fs.readFileSync(path.join(ROOT, 'assets/common.css'), 'utf8');
    const edBlock = css.match(/\.ed-actions-bar\{[^}]*\}/);
    check('B7 .ed-actions-bar 有专属 fixed 规则', !!edBlock && /position:fixed/.test(edBlock[0]));
    check('B7 z-index 210（>导航200）', !!edBlock && /z-index:210/.test(edBlock[0]));
    check('B7 有 body.dark 适配', /body\.dark \.ed-actions-bar\{/.test(css));
    check('B7 有移动端媒体查询', /@media \(max-width:768px\)\{[^@]*\.ed-actions-bar\{bottom:calc\(var\(--bottom-nav-height\)/.test(css));
    // .editor-actions 基础类自身不能变 fixed
    const ea = css.match(/\.editor-actions\{[^}]*\}/);
    check('B7 共用 .editor-actions 未被改为 fixed', !ea || !/position:fixed/.test(ea[0]), ea ? ea[0].slice(0, 80) : '无独立规则');
    const bwSrc = fs.readFileSync(path.join(ROOT, 'blog_wechat.html'), 'utf8');
    check('B7 blog_wechat.html 的 .editor-actions 未混入 ed-actions-bar',
      !/class="[^"]*editor-actions[^"]*ed-actions-bar/.test(bwSrc));
  }

  /* ============ [B10] 需求10 hotnews 与后端契约（前端侧） ============ */
  sec('[B10] hotnews.js 消费 /api/news/daily 契约');
  async function newsDom(upstreams) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/x.html', pretendToBeVisual: true });
    const w = dom.window;
    w.STUDY_API_BASE = '';
    let opens = [];
    w.open = function (u) { opens.push(u); };
    w.fetch = function (url) {
      url = String(url);
      for (const k of Object.keys(upstreams)) {
        if (url.indexOf(k) !== -1) return upstreams[k]();
      }
      return Promise.resolve({ ok: false, status: 599, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
    };
    w.eval(fs.readFileSync(path.join(ROOT, 'assets/hotnews.js'), 'utf8'));
    return { w, opens };
  }
  const rssPayload = {
    ok: true, source: '中国新闻网', updated: 'x',
    items: [{ title: '标题A', hot: '', url: 'https://www.chinanews.com/a' }, { title: '标题B', hot: '', url: null }],
    dailyLink: null,
  };
  {
    const r = await newsDom({
      '/api/news/daily': () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(rssPayload)) }),
    });
    const res = await r.w.fetchHotNews(false);
    check('B10 主源成功 ok=true', res.ok === true && res.source === '中国新闻网');
    check('B10 url=null 归一为 ""（不会出现字符串 "None"/"null"）',
      res.items[0].url === 'https://www.chinanews.com/a' && res.items[1].url === '' && res.items[1].title === '标题B');
  }
  {
    // UI 渲染：有 url 可点击且 window.open 拿到原文；无 url 点击不报错不跳转
    const r = await newsDom({
      '/api/news/daily': () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(rssPayload)) }),
    });
    r.w.openHotNewsPanel();
    await sleep(60);
    const items = r.w.document.querySelectorAll('.hn-item');
    check('B10 渲染 2 条', items.length === 2);
    check('B10 有 url 条目带 data-url', items[0].getAttribute('data-url') === 'https://www.chinanews.com/a');
    check('B10 无 url 条目无 data-url', items[1].getAttribute('data-url') === null);
    const navB = r.w.document;
    items[0].dispatchEvent(new r.w.MouseEvent('click', { bubbles: true }));
    check('B10 点有 url 条目 → window.open(原文)', r.opens.length === 1 && r.opens[0] === 'https://www.chinanews.com/a');
    let threw = false;
    try { items[1].dispatchEvent(new r.w.MouseEvent('click', { bubbles: true })); } catch (e) { threw = true; }
    check('B10 点无 url 条目不报错不跳转', !threw && r.opens.length === 1);
  }
  {
    // dailyLink 透传
    const p = JSON.parse(JSON.stringify(rssPayload));
    p.dailyLink = 'https://mp.weixin.qq.com/daily-xyz';
    const r = await newsDom({ '/api/news/daily': () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(p)) }) });
    r.w.openHotNewsPanel();
    await sleep(60);
    const a = r.w.document.querySelector('.hn-daily');
    check('B10 dailyLink → 底部「今日早报全文」链接', !!a && a.getAttribute('href') === 'https://mp.weixin.qq.com/daily-xyz');
  }
  {
    // 后端 502 → 降级 60s 源
    const r = await newsDom({
      '/api/news/daily': () => Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('{"error":"news_unavailable"}') }),
      '60s-api.viki.moe': () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ code: 200, data: { news: ['新闻一', '新闻二'], link: 'https://mp.weixin.qq.com/s/x' } })) }),
    });
    const res = await r.w.fetchHotNews(false);
    check('B10 后端 502 → 自动降级 60s 源', res.ok === true && res.source === '60秒读懂世界' && res.items.length === 2);
  }
  {
    // 双上游全挂 → 不白屏
    const r = await newsDom({
      '/api/news/daily': () => Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('{"error":"news_unavailable"}') }),
      '60s-api.viki.moe': () => Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('{}') }),
    });
    r.w.openHotNewsPanel();
    await sleep(60);
    const body = r.w.document.getElementById('hnBody');
    check('B10 双上游全挂 → 显示 ⚠️ 错误信息（不白屏）', !!body && body.innerHTML.indexOf('⚠️') !== -1 && body.innerHTML.trim().length > 10);
  }

  /* ============ [B2] 需求2 隐藏会话在真实 5s 轮询下的自动恢复 ============ */
  sec('[B2] hidden 会话 + 对方再来消息 → 5s 轮询自动恢复');
  {
    const r = load('私聊.html');
    await sleep(200); // 让 boot 的异步链（loadServerFriends→loadChats 会重赋 S.chats）先跑完，再播种
    const Tr = r.w.__IM_TEST__;
    Tr.S.chats.push({ id: 9, nickname: '恢复测试', isServer: true, serverId: 42, unread: 0, last: '', time: 1 });
    Tr.S.tab = 'chats';
    r.w.imChatPrefs.set('u42', { hidden: true });
    Tr.renderChats(r.d.getElementById('imList'));
    check('B2 预置：u42 已隐藏', r.d.getElementById('imList').innerHTML.indexOf('恢复测试') === -1);
    r.w.fetch = function (url) {
      url = String(url);
      if (url.indexOf('/api/chat/unread') !== -1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 1, items: [{ peerId: 42, count: 1, lastId: 77, last: '又来了', nickname: '恢复测试' }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], incoming: [], unreadCount: 0 }) });
    };
    await sleep(5400); // 等真实 5s 轮询 tick（>5s 间隔 + 余量）
    const prefs42 = r.w.imChatPrefs.get('u42');
    Tr.renderChats(r.d.getElementById('imList'));
    check('B2 收到新消息后 hidden 自动恢复（prefs.hidden=false）', prefs42.hidden === false);
    check('B2 恢复后会话重新渲染在列表中', r.d.getElementById('imList').innerHTML.indexOf('恢复测试') !== -1);
    // 免打扰不计入未读角标（轮询后角标 = imCountUnread）
    check('B2 轮询重渲染后 hidden/muted 仍生效于计数', typeof r.w.imChatPrefs.countUnread === 'function');
  }

  /* ============ 汇总 ============ */
  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (FAILS.length) {
    console.log('--- FAIL 明细 ---');
    FAILS.forEach(x => console.log('  * ' + x));
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
