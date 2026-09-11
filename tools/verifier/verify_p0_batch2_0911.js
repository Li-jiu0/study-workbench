/**
 * tools/verifier/verify_p0_batch2_0911.js
 * 批次二 P0（2026-09-11h）jsdom 真实渲染断言。
 * 运行：node tools/verifier/verify_p0_batch2_0911.js
 *
 * 覆盖：
 *   [0] 四个被改页面 file:///http 加载零未捕获异常 + showToast 可用（共用 DOM 齐全的硬规矩）
 *   [1] 需求3：添加好友弹窗内不再有指向 好友申请.html 的链接 / 「后续扩展点」字样
 *   [2] 需求9：群消息头像/昵称绑定 openUserHome 点击；自己的消息不渲染头像
 *   [3] 需求6：formatPresence 边界值（在线/59s/6min/3h/昨天/跨月昨天/5天/空字段）+ 会话列表右侧 + 他人主页
 *   [4] 需求11：好友行 / 搜索结果行无「删除」按钮、有「发消息」；主页删除入口（uiConfirm 二次确认）仍在
 *   [5] 需求7：.ed-actions-bar 吸底 CSS（源码断言：jsdom 不计算 fixed 布局，特此注明）
 *   [6] 需求2：置顶/免打扰/隐藏偏好 → 排序 / 未读计数 / 渲染 / 展开-收起 / 删除
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// jsdom 已知伪影（非本项目缺陷）：app.js 顶层 `let blogCatFilter` 等在 w.eval 的独立词法作用域里
// 对后续 eval 的 api.js 不可见 → apiBoot 异步 rejected。真实浏览器共享全局词法环境，生产无此问题。
// 这里兜底记录，避免后台异步伪影杀掉断言进程；「零未捕获异常」以 [0] 的同步加载窗口为准。
process.on('unhandledRejection', function (e) {
  console.log('  [后台异步·jsdom伪影] 未处理 rejection: ' + (e && e.message));
});
process.on('uncaughtException', function (e) {
  console.log('  [后台异步·jsdom伪影] 未捕获异常: ' + (e && e.message));
});

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + label + (detail ? '  → ' + detail : '')); }
  else { fail++; console.log('  ✘ ' + label + '  *** 失败 ***' + (detail ? '  → ' + detail : '')); }
}
function sec(t) { console.log('\n========== ' + t + ' =========='); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 真渲染模式（BUG-1 回归用，搬自 tools/qa/ed_independent_0911h.js 的 harness）：
// outside-only 模式 jsdom 不执行内联 onclick 属性，「点击 → 内联 handler」断言必须用本模式。
// 本地 HTTP 服务 + runScripts:'dangerously' + resources:'usable'（端口与 QA harness 错开，避免并行冲突）。
const http = require('http');
const VR_PORT = 8131;
const vrServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.writeHead(200, { 'content-type': ct }); res.end(buf);
  });
});
let vrServerReady = null;
function ensureVrServer() {
  if (!vrServerReady) vrServerReady = new Promise(res => vrServer.listen(VR_PORT, '127.0.0.1', res));
  return vrServerReady;
}
async function loadReal(page) {
  await ensureVrServer();
  const vcErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => vcErrors.push(String((e && e.message) || e)));
  let wRef = null;
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + VR_PORT + '/' + page,
    virtualConsole: vc,
    beforeParse(w) {
      wRef = w;
      w.fetch = function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }); };
      try {
        w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
        w.localStorage.setItem('study_workbench_token', 'test-token');
      } catch (e) { }
    },
  });
  await sleep(600); // 等同步脚本链执行完
  return { w: wRef, d: wRef.document, vcErrors };
}

// 载入一个页面：按 <script> 顺序 eval（src 读文件 / 内联读文本），并捕获未捕获异常
function load(page, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('[jsdom] ' + (e && e.message)));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/' + page,
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.addEventListener('error', e => errors.push('[error] ' + (e && (e.message || e.type))));
  w.addEventListener('unhandledrejection', e => errors.push('[reject] ' + (e && e.reason && e.reason.message)));
  // 统一 fetch mock：任何端点返回 ok:true + {}（离线语义由各用例按需覆写）
  w.fetch = function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
  };
  // 预置登录态（app.js 登录门禁，避免 jsdom 导航报错）
  try {
    w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
    w.localStorage.setItem('study_workbench_token', 'test-token');
  } catch (e) { }
  if (opts.preset) { try { opts.preset(w); } catch (e) { errors.push('[preset] ' + e.message); } }

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const srcM = attrs.match(/\bsrc="([^"]+)"/);
    try {
      if (srcM) {
        const rel = srcM[1].split('?')[0];
        const fp = path.join(ROOT, rel);
        if (fs.existsSync(fp)) w.eval(fs.readFileSync(fp, 'utf8'));
        else errors.push('[missing src] ' + rel);
      } else if (m[2].trim()) {
        w.eval(m[2]);
      }
    } catch (e) {
      errors.push('[eval ' + (srcM ? srcM[1] : 'inline') + '] ' + e.message);
    }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  return { w, d: w.document, errors };
}

/* ========== [0] 页面加载零异常 + showToast ========== */
sec('[0] 被改页面加载：零未捕获异常 + showToast 可用');
const PAGES = ['私聊.html', '好友申请.html', '学习博客.html', '个人中心.html'];
const loaded = {};
PAGES.forEach(page => {
  const r = load(page);
  loaded[page] = r;
  check(page + ' 打开零未捕获异常', r.errors.length === 0, r.errors.length ? r.errors.join(' | ').slice(0, 300) : '无');
  const hasAppJs = fs.readFileSync(path.join(ROOT, page), 'utf8').includes('assets/app.js?v=');
  if (hasAppJs) {
    check(page + ' window.showToast 为函数', typeof r.w.showToast === 'function');
    let ok = true; try { r.w.showToast('测试'); } catch (e) { ok = false; }
    check(page + ' 调用 showToast 不抛错', ok);
  } else {
    check(page + ' 不引 app.js（独立页，自带 afToast）→ 校验自身脚本存活', typeof r.w.doSearch === 'function');
  }
});

/* ========== [1] 需求3：加好友弹窗移除「后续扩展点：旧页回退」 ========== */
sec('[1] 需求3：添加好友弹窗无 好友申请.html 入口');
{
  const { w, d } = loaded['私聊.html'];
  const modal = d.getElementById('imAddFriendModal');
  check('A3 #imAddFriendModal 存在', !!modal);
  check('需求3 弹窗 DOM 内无指向 好友申请.html 的链接', !modal.querySelector('a[href="好友申请.html"]'));
  check('需求3 弹窗 DOM 内无「后续扩展点」字样', modal.innerHTML.indexOf('后续扩展点') === -1, modal.innerHTML.slice(-120));
  check('需求3 全页无「【后续扩展点：旧页回退】」字样', d.documentElement.innerHTML.indexOf('【后续扩展点：旧页回退】') === -1);
  const src = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
  check('需求3 源码断言：私聊.html 不再含指向 好友申请.html 的链接', src.indexOf('href="好友申请.html"') === -1);
  check('需求3 好友申请.html 文件仍保留（直连后门）', fs.existsSync(path.join(ROOT, '好友申请.html')));
  // 弹窗仍可正常打开 / 关闭（移除 footer 不影响功能）
  w.localStorage.setItem('study_workbench_token', 't');
  w.imOpenAddFriendModal();
  check('需求3 弹窗仍可打开', modal.style.display === 'flex');
  w.imCloseAddFriendModal();
  check('需求3 弹窗仍可关闭', modal.style.display === 'none');
}

/* ========== [2] 需求9：群消息头像/昵称 → 用户主页 ========== */
sec('[2] 需求9：群消息头像/昵称点击打开用户主页');
{
  const { w, d } = loaded['私聊.html'];
  const T = w.__IM_TEST__;
  check('测试钩子 __IM_TEST__ 存在', !!T && typeof T.renderMsgs === 'function');
  check('需求9 openUserHome 已由 api.js 提供', typeof w.openUserHome === 'function');
  T.S.group = { id: 1, name: '四级冲刺群', memberCount: 3 };
  T.S.peer = null;
  T.S.myId = 999;
  T.S.msgs = [
    { id: 1, senderId: 2, senderNickname: '小明', senderAvatar: '', content: '大家好', kind: 'text', time: Date.now() },
    { id: 2, senderId: 999, senderNickname: '我', senderAvatar: '', content: '我自己', kind: 'text', time: Date.now() },
  ];
  T.renderMsgs();
  const box = d.getElementById('imMsgs');
  const gavs = box.querySelectorAll('.im-gav');
  check('需求9 他人消息渲染 .im-gav 头像（仅 1 个：自己的消息不渲染）', gavs.length === 1, 'count=' + gavs.length);
  const gav = gavs[0];
  check('需求9 头像绑定 openUserHome(2) 点击', !!gav && /openUserHome\(2\)/.test(gav.getAttribute('onclick') || ''), gav && gav.getAttribute('onclick'));
  check('需求9 头像 onclick 阻止冒泡', !!gav && /stopPropagation/.test(gav.getAttribute('onclick') || ''));
  const gs = box.querySelector('.im-gsender');
  check('需求9 昵称同样绑定 openUserHome(2)', !!gs && /openUserHome\(2\)/.test(gs.getAttribute('onclick') || ''));
  check('需求9 自己的消息无头像（点击自己头像的场景不存在）', box.textContent.indexOf('我自己') !== -1 && gavs.length === 1);
  // 点击派发不抛错（jsdom 不真正导航，location.href 赋值在 jsdom 中是静默/no-op 报 warning，用 try 包住验证处理器可达）
  let clickOk = true;
  try {
    gav.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  } catch (e) { clickOk = false; }
  check('需求9 派发头像 click 不抛异常', clickOk);
}

/* ========== [3] 需求6：formatPresence 边界 + 会话列表右侧 + 他人主页 ========== */
sec('[3] 需求6：好友/会话最近在线时间（真数据，不造假）');
{
  const { w, d } = loaded['私聊.html'];
  const fp = w.formatPresence;
  check('需求6 window.formatPresence 为函数（api.js 提供）', typeof fp === 'function');
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDT(dt) {
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
  }
  const NOW = new Date(2026, 8, 11, 12, 0, 0); // 2026-09-11 12:00:00 本地
  const ago = (ms) => fmtDT(new Date(NOW.getTime() - ms));
  check('在线 → 「在线」', fp('whatever', true, NOW) === '在线');
  check('在线优先于缺失字段', fp('', true, NOW) === '在线');
  check('59 秒前 → 「刚刚在线」', fp(ago(59 * 1000), false, NOW) === '刚刚在线');
  check('4 分 59 秒 → 「刚刚在线」', fp(ago(299 * 1000), false, NOW) === '刚刚在线');
  check('6 分钟前 → 「6分钟前」', fp(ago(6 * 60 * 1000), false, NOW) === '6分钟前');
  check('59 分钟 → 「59分钟前」', fp(ago(59 * 60 * 1000), false, NOW) === '59分钟前');
  check('3 小时前 → 「3小时前」', fp(ago(3 * 3600 * 1000), false, NOW) === '3小时前');
  check('昨天（同时刻 -24h）→ 「昨天 12:00」', /^昨天 12:00$/.test(fp(ago(24 * 3600 * 1000), false, NOW)), fp(ago(24 * 3600 * 1000), false, NOW));
  // 跨月边界：3月1日 12:00 看 2月28日 12:00 仍是「昨天」（回归：dayKey 数字减法会在此出错）
  const MAR1 = new Date(2026, 2, 1, 12, 0, 0);
  check('跨月昨天（3/1 看 2/28）→ 「昨天 12:00」', /^昨天 12:00$/.test(fp('2026-02-28 12:00:00', false, MAR1)), fp('2026-02-28 12:00:00', false, MAR1));
  // 跨天优先于小时桶：昨天 23:57 → 今天 00:02 仍显示「昨天 23:57」（>5min 才走跨天）
  const MID = new Date(2026, 8, 11, 0, 2, 0);
  check('跨午夜 5 分钟 → 「昨天 23:57」', fp('2026-09-10 23:57:00', false, MID) === '昨天 23:57', fp('2026-09-10 23:57:00', false, MID));
  check('跨午夜 3 分钟 → 「刚刚在线」（5 分钟内优先）', fp('2026-09-10 23:59:00', false, MID) === '刚刚在线');
  check('5 天前 → 「5天前」', fp(ago(5 * 24 * 3600 * 1000), false, NOW) === '5天前', fp(ago(5 * 24 * 3600 * 1000), false, NOW));
  check('字段为空 → 返回空串（调用方不显示，绝不造假）', fp('', false, NOW) === '' && fp(null, false, NOW) === '');
  check('字段非法 → 返回空串', fp('abc', false, NOW) === '');
  // 与真实时钟对齐（presenceText 不带 now 注入，走 Date.now()）
  const agoReal = (ms) => fmtDT(new Date(Date.now() - ms));
  check('chat-local presenceText 委托 formatPresence', w.__IM_TEST__.presenceText(agoReal(6 * 60 * 1000), false) === '6分钟前');

  // 会话列表右侧：presence 缓存命中才显示；缺失整段不渲染
  const T = w.__IM_TEST__;
  T.S.tab = 'chats';
  T.S.peer = null; T.S.group = null;
  T.S.chats = [{ id: 10007, isServer: true, serverId: 7, nickname: '甲', avatar: '', last: 'hi', unread: 0, time: 1 }];
  T.S.presence = { 7: { id: 7, lastSeenAt: agoReal(6 * 60 * 1000), online: false } };
  T.renderChats(d.getElementById('imList'));
  let el = d.querySelector('.im-presence-side[data-uid="7"]');
  check('需求6 会话列表右侧渲染相对时间（服务端值）', !!el && el.textContent === '6分钟前', el && el.textContent);
  check('需求6 离线状态无绿点类', !!el && !el.classList.contains('on'));
  T.S.presence = { 7: { id: 7, lastSeenAt: agoReal(30 * 1000), online: true } };
  T.renderChats(d.getElementById('imList'));
  el = d.querySelector('.im-presence-side[data-uid="7"]');
  check('需求6 在线 → 绿点类 on + 「在线」', !!el && el.classList.contains('on') && el.textContent === '在线', el && el.textContent);
  T.S.presence = {};
  T.renderChats(d.getElementById('imList'));
  check('需求6 无后端/字段缺失 → 该行不渲染（优雅降级，无假时间）', !d.querySelector('.im-presence-side'));
  check('需求6 CSS：绿点样式已声明', /\.im-presence\.on::before/.test(fs.readFileSync(path.join(ROOT, 'assets', 'common.css'), 'utf8')));
}

/* ========== [4]~[6] + 汇总（异步断言） ========== */
(async function () {
  // —— [3b] 他人公开主页：presence 白名单字段有则显示 ——
  sec('[3b] 需求6：他人公开主页 presence');
  {
    const { w: w2, d: d2 } = loaded['个人中心.html'];
    w2.CURRENT_USER = { id: 1, username: 'me', nickname: '我', stats: {} };
    const u = { id: 2, username: 'peer', nickname: '小明', motto: '你好', avatarUrl: null, notes: [], stats: {}, isMe: false };
    const agoReal = (ms) => {
      const t = new Date(Date.now() - ms);
      const p2 = (n) => (n < 10 ? '0' : '') + n;
      return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()) + ' ' + p2(t.getHours()) + ':' + p2(t.getMinutes()) + ':' + p2(t.getSeconds());
    };
    w2.api = function (p) {
      if (/\/api\/users\//.test(p)) {
        return Promise.resolve(Object.assign({}, u, { lastSeenAt: agoReal(6 * 60 * 1000), online: false }));
      }
      return Promise.resolve({});
    };
    const box = d2.createElement('div');
    d2.body.appendChild(box);
    await w2.renderUserHome(2, box);
    check('需求6 他人主页显示相对在线时间（6分钟前）', box.innerHTML.indexOf('6分钟前') !== -1);
    check('需求6 他人主页带 presence-dot 结构', box.innerHTML.indexOf('presence-dot') !== -1);
    // 无 presence 字段 → 整行不渲染
    w2.api = function (p) { return Promise.resolve(/\/api\/users\//.test(p) ? u : {}); };
    const box2 = d2.createElement('div');
    d2.body.appendChild(box2);
    await w2.renderUserHome(2, box2);
    check('需求6 他人主页无 presence 字段 → 不显示（不造假）', box2.innerHTML.indexOf('presence-line') === -1);
  }


/* ========== [4] 需求11：删除入口收敛到资料中心 ========== */
sec('[4] 需求11：好友行/搜索结果行无「删除」，主页删除入口保留');
  {
    const { w, d } = loaded['私聊.html'];
    // mock /api/friends 返回一个服务器好友
    w.fetch = function (url) {
      if (/\/api\/friends$/.test(String(url))) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [{ id: 7, nickname: '甲', username: 'jia', motto: '', avatarUrl: '' }] }); } });
      }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
    };
    const T = w.__IM_TEST__;
    T.S.tab = 'friends';
    T.renderFriends(d.getElementById('imList'));
    await new Promise(r => setTimeout(r, 80));
    const list = d.getElementById('imList');
    check('需求11 好友行渲染「发消息」', list.innerHTML.indexOf('发消息') !== -1);
    check('需求11 好友行无「删除」按钮（imRemoveFriend 入口已移除）', list.innerHTML.indexOf('imRemoveFriend(') === -1 && list.innerHTML.indexOf('>删除<') === -1);
    check('需求11 imRemoveFriend 函数保留（可回退/复用）', typeof w.imRemoveFriend === 'function');
  }
  {
    const { w, d } = loaded['好友申请.html'];
    w.fetch = function (url) {
      if (/\/api\/friends\/search/.test(String(url))) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [{ id: 7, nickname: '甲', username: 'jia', motto: '', isFriend: true }] }); } });
      }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ incoming: [] }); } });
    };
    d.getElementById('q').value = 'jia';
    w.doSearch();
    await new Promise(r => setTimeout(r, 80));
    const res = d.getElementById('results').innerHTML;
    check('需求11 搜索结果行（已是好友）有「发消息」', res.indexOf('发消息') !== -1);
    check('需求11 搜索结果行无「删除好友」', res.indexOf('删除好友') === -1 && res.indexOf('afRemoveFriend(') === -1);
    check('需求11 afRemoveFriend 函数保留（可回退）', typeof w.afRemoveFriend === 'function');
  }
  {
    // 删除好友的正式入口：他人公开主页（api.js renderUserHome），uiConfirm 二次确认仍在
    const apiSrc = fs.readFileSync(path.join(ROOT, 'assets', 'api.js'), 'utf8');
    check('需求11 主页删除好友入口存在（删除好友按钮）', apiSrc.indexOf('🗑 删除好友') !== -1);
    check('需求11 删除前 uiConfirm 二次确认存在', /uiConfirm\('确定要删除好友/.test(apiSrc));
    const { w } = loaded['个人中心.html'];
    w.CURRENT_USER = { id: 1, username: 'me', nickname: '我', stats: {} };
    w.api = function (p) {
      if (/\/api\/users\//.test(p)) return Promise.resolve({ id: 2, username: 'peer', nickname: '小明', motto: '', avatarUrl: null, notes: [], stats: {}, isMe: false, isFriend: true });
      return Promise.resolve({});
    };
    const box = w.document.createElement('div');
    w.document.body.appendChild(box);
    await w.renderUserHome(2, box).then(() => { });
    const html = box.innerHTML;
    check('需求11 好友主页：有「发消息」', html.indexOf('发消息') !== -1);
    check('需求11 好友主页：保留「删除好友」入口', html.indexOf('删除好友') !== -1);
  }

  /* ========== [5] 需求7：广场发布/存草稿按钮栏吸底（源码断言） ========== */
  sec('[5] 需求7：.ed-actions-bar 吸底（源码断言：jsdom 不计算 fixed 布局）');
  {
    const css = fs.readFileSync(path.join(ROOT, 'assets', 'common.css'), 'utf8');
    const m = css.match(/\/\* ---------- 需求7：广场「发布 \/ 存草稿」按钮栏吸底[\s\S]*?(?=\n\/\* ---------- 需求2)/);
    check('需求7 需求7 CSS 段存在', !!m);
    const block = m ? m[0] : '';
    check('需求7 .ed-actions-bar 声明 position:fixed', /\.ed-actions-bar\{[^}]*position:fixed/.test(block.replace(/\s+/g, '')));
    const flat = block.replace(/\s+/g, '');
    check('需求7 含 env(safe-area-inset-bottom) 适配', /padding-bottom:calc\(10px\+env\(safe-area-inset-bottom,0px\)\)/.test(flat));
    check('需求7 z-index 高于底部导航(200)', /z-index:210/.test(flat));
    check('需求7 移动端叠在底部导航之上（bottom 含 --bottom-nav-height）', /@media\(max-width:768px\)\{\.ed-actions-bar\{bottom:calc\(var\(--bottom-nav-height\)\+env\(safe-area-inset-bottom,0px\)\)/.test(flat));
    check('需求7 正文让位：.blog-editor padding-bottom 等高补偿', /\.blog-editor\{padding-bottom:calc\(56px/.test(flat));
    check('需求7 暗色主题显式适配 body.dark .ed-actions-bar', /body\.dark\.ed-actions-bar|body\.dark\s+\.ed-actions-bar/.test(block));
    // 基础类 .editor-actions 未被误改（blog_wechat.html 等页共用）
    check('需求7 基础类 .editor-actions 保持原样（未误伤其他页）', /\.editor-actions \{ display: flex; gap: 10px; flex-wrap: wrap; align-items: center; \}/.test(css));
    // 只在编辑视图：按钮栏位于 #blogViewEdit 与 #blogViewDetail 之间
    const blog = fs.readFileSync(path.join(ROOT, '学习博客.html'), 'utf8');
    const iEdit = blog.indexOf('id="blogViewEdit"');
    const iBar = blog.indexOf('editor-actions ed-actions-bar');
    const iDetail = blog.indexOf('id="blogViewDetail"');
    check('需求7 吸底栏仅存在于编辑视图内部（只读态不出现悬空栏）', iEdit !== -1 && iBar > iEdit && iBar < iDetail);
  }

  /* ========== [6] 需求2：会话左滑 置顶/免打扰/删除 ========== */
  sec('[6] 需求2：左滑操作（置顶/免打扰/删除，纯逻辑 + 渲染 + 交互）');
  {
    const { w, d } = loaded['私聊.html'];
    const T = w.__IM_TEST__;
    const P = w.imChatPrefs;
    check('需求2 window.imChatPrefs API 暴露', !!P && typeof P.apply === 'function' && typeof P.countUnread === 'function' && typeof P.set === 'function');

    // —— 纯函数：apply（过滤/置顶/标记） ——
    const chats = [
      { id: 1, nickname: 'A', unread: 3, time: 100 },
      { id: 10007, isServer: true, serverId: 7, nickname: 'B', unread: 5, time: 300 },
      { id: 3, nickname: 'C', unread: 2, time: 200 },
    ];
    const prefs = { 'u7': { pinned: true }, 'l1': { muted: true }, 'l3': { hidden: true } };
    const out = P.apply(chats, prefs);
    check('需求2 hidden 会话被剔除', out.length === 2);
    check('需求2 置顶会话排在最前', out[0].nickname === 'B' && out[1].nickname === 'A', out.map(x => x.nickname).join(','));
    check('需求2 pinned/muted 标记附加正确', out[0].pinned === true && out[1].muted === true && out[1].pinned === false);
    const out2 = P.apply(chats, {});
    check('需求2 无偏好时按 time 降序（B,C,A）', out2.map(x => x.nickname).join(',') === 'B,C,A', out2.map(x => x.nickname).join(','));

    // —— 纯函数：countUnread（免打扰/隐藏不计入） ——
    check('需求2 无偏好未读总数 = 10', P.countUnread(chats, {}) === 10);
    check('需求2 免打扰 + 隐藏不计入未读角标 → 5', P.countUnread(chats, prefs) === 5);
    check('需求2 仅置顶不影响未读计数', P.countUnread(chats, { 'u7': { pinned: true } }) === 10);

    // —— set 持久化到约定键 study_workbench_chat_prefs ——
    w.localStorage.removeItem('study_workbench_chat_prefs');
    P.set('u7', { pinned: true });
    P.set('u7', { muted: true });
    const stored = JSON.parse(w.localStorage.getItem('study_workbench_chat_prefs') || '{}');
    check('需求2 偏好写入 localStorage 键 study_workbench_chat_prefs', stored['u7'] && stored['u7'].pinned === true && stored['u7'].muted === true, JSON.stringify(stored));
    check('需求2 get 读取一致', P.get('u7').pinned === true && P.get('u7').muted === true);

    // —— 渲染：置顶排序 / 免打扰标识 / 隐藏剔除 / 操作按钮 ——
    w.localStorage.setItem('study_workbench_chat_prefs', JSON.stringify(prefs));
    T.S.tab = 'chats';
    T.S.peer = null; T.S.group = null; T.S.groups = [];
    T.S.chats = chats;
    T.S.presence = {};
    T.renderChats(d.getElementById('imList'));
    const rows = Array.from(d.querySelectorAll('#imList .im-sess[data-tid]'));
    check('需求2 渲染行序 = [u7, l1]（置顶在前、隐藏剔除）', rows.map(x => x.getAttribute('data-tid')).join(',') === 'u7,l1', rows.map(x => x.getAttribute('data-tid')).join(','));
    check('需求2 每行都包 .im-swipe 容器', d.querySelectorAll('#imList .im-swipe').length === 2);
    check('需求2 三个操作按钮（置顶/免打扰/删除）渲染', d.querySelectorAll('#imList .im-sa').length === 6);
    check('需求2 置顶态按钮文案「取消置顶」', d.querySelector('.im-swipe[data-tid="u7"] .im-sa-pin').textContent === '取消置顶');
    check('需求2 免打扰行有 🔕 标识', !!d.querySelector('.im-swipe[data-tid="l1"] .im-mute-tag'));
    check('需求2 隐藏行无任何渲染', !d.querySelector('.im-swipe[data-tid="l3"]'));

    // —— 展开 / 收起：同一时刻只允许一行展开 ——
    w.imOpenSwipe('u7');
    check('需求2 imOpenSwipe 展开目标行', d.querySelector('.im-swipe[data-tid="u7"]').classList.contains('open'));
    check('需求2 展开位移 = 156px（与操作区等宽）', d.querySelector('.im-swipe[data-tid="u7"] .im-sess').style.transform === 'translateX(-156px)');
    w.imOpenSwipe('l1');
    check('需求2 同一时刻只允许一行展开', d.querySelector('.im-swipe[data-tid="l1"]').classList.contains('open') && !d.querySelector('.im-swipe[data-tid="u7"]').classList.contains('open'));
    w.imCloseSwipe();
    check('需求2 imCloseSwipe 收起', !d.querySelector('.im-swipe.open') && T.S.swipeOpen === null);
    // 右键（桌面等价入口）展开
    const row = d.querySelector('.im-sess[data-tid="u7"]');
    row.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    check('需求2 右键行 → 展开该行操作', T.S.swipeOpen === 'u7' && d.querySelector('.im-swipe[data-tid="u7"]').classList.contains('open'));

    // —— 点击空白收起（捕获阶段拦截，不再触发进入会话） ——
    let opened = 0;
    const origOpen = w.imOpenChat;
    w.imOpenChat = function () { opened++; };
    row.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('需求2 展开态下点击行 → 收起且不进入会话', T.S.swipeOpen === null && opened === 0);
    w.imOpenChat = origOpen;

    // —— 操作：置顶 / 免打扰 / 删除 ——
    P.set('u7', { pinned: false }); P.set('l1', { muted: false });
    w.imSwipeAct('u7', 'pin');
    check('需求2 点「置顶」→ pinned 持久化', P.get('u7').pinned === true && JSON.parse(w.localStorage.getItem('study_workbench_chat_prefs'))['u7'].pinned === true);
    w.imSwipeAct('u7', 'mute');
    check('需求2 点「免打扰」→ muted 持久化', P.get('u7').muted === true);
    w.imSwipeAct('u7', 'del');
    check('需求2 点「删除」→ hidden 持久化（仅本机隐藏）', P.get('u7').hidden === true);
    check('需求2 删除后该会话不再渲染', !d.querySelector('.im-swipe[data-tid="u7"]'));
    // 云端记录保留语义：偏好只写 hidden，不触碰本地聊天记录数据源（源码断言：del 分支只调 imChatPrefs.set）
    check('需求2 删除仅写 hidden（不删本地聊天记录，云端语义保留）',
      /act === 'del'\)\s*\{\s*\/\/ 仅从本机会话列表隐藏[\s\S]*?imChatPrefs\.set\(key, \{ hidden: true \}\);/.test(fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8')));
    check('需求2 删除自动恢复逻辑存在（对方再发消息恢复显示，源码断言）', /imChatPrefs\.set\(hk, \{ hidden: false \}\)/.test(fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8')));

    // —— tab 角标接入 countUnread（源码断言） ——
    check('需求2 顶部未读角标改用 imCountUnread（免打扰不计入）', /updateTabBadge\('chats', imCountUnread\(S\.chats, imLoadPrefs\(\)\)\)/.test(fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8')));
  }

  /* ========== [7] 需求1：申请角标 unreadCount 水位线 + 查看即已读 ========== */
  sec('[7] 需求1：申请角标改 unreadCount + 打开列表即标记已读');
  {
    const { w, d } = loaded['私聊.html'];
    // 7.1 新后端：unreadCount（未读水位线）优先于 incoming.length
    check('需求1 window.imApplyRequestBadge 为函数', typeof w.imApplyRequestBadge === 'function');
    check('需求1 unreadCount=2 且 incoming 有 3 条 → 角标显示 2（不是 3）',
      w.imApplyRequestBadge({ incoming: [{}, {}, {}], unreadCount: 2 }) === 2
      && (d.querySelector('.im-tab[data-tab="requests"] .tab-badge') || {}).textContent === '2',
      (d.querySelector('.im-tab[data-tab="requests"] .tab-badge') || {}).textContent);
    // 7.2 旧后端兼容：无 unreadCount 字段 → 回退为 incoming.length
    check('需求1 旧后端（无 unreadCount）→ 回退 incoming.length=4',
      w.imApplyRequestBadge({ incoming: [{}, {}, {}, {}] }) === 4
      && d.querySelector('.im-tab[data-tab="requests"] .tab-badge').textContent === '4');
    check('需求1 unreadCount=0 → 角标移除',
      w.imApplyRequestBadge({ incoming: [{}], unreadCount: 0 }) === 0
      && !d.querySelector('.im-tab[data-tab="requests"] .tab-badge'));

    // 7.3 打开（渲染）申请列表 → POST seen + 角标归 0
    const calls = [];
    w.fetch = function (url, opts) {
      calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
      if (/\/api\/friends\/requests\/seen$/.test(String(url))) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true, unreadCount: 0 }); } });
      }
      if (/\/api\/friends\/requests$/.test(String(url))) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({
          incoming: [{ id: 3, fromMe: false, status: 'pending', user: { id: 7, nickname: '小明', username: 'xm', motto: '', avatarUrl: '' } }],
          outgoing: [], unreadCount: 1 }); } });
      }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
    };
    const T = w.__IM_TEST__;
    T.renderRequests(d.getElementById('imList'));
    await new Promise(r => setTimeout(r, 80));
    check('需求1 申请列表成功渲染（含申请方昵称）', d.getElementById('imList').innerHTML.indexOf('小明') !== -1);
    const seenCalls = calls.filter(c => /\/api\/friends\/requests\/seen$/.test(c.url) && c.method === 'POST');
    check('需求1 渲染后发出 POST /api/friends/requests/seen', seenCalls.length === 1, JSON.stringify(seenCalls));
    check('需求1 seen 成功（unreadCount:0）后角标归 0（badge 移除）', !d.querySelector('.im-tab[data-tab="requests"] .tab-badge'));

    // 7.4 seen 接口 500 → 列表照常渲染、无未捕获异常、无错误 toast（静默降级）
    w.fetch = function (url, opts) {
      if (/\/api\/friends\/requests\/seen$/.test(String(url))) {
        return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.reject(new Error('HTTP 500')); } });
      }
      if (/\/api\/friends\/requests$/.test(String(url))) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ incoming: [{ id: 5, fromMe: false, status: 'pending', user: { id: 8, nickname: '小红', username: 'xh', motto: '', avatarUrl: '' } }], outgoing: [], unreadCount: 1 }); } });
      }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
    };
    let threw = false;
    try { T.renderRequests(d.getElementById('imList')); } catch (e) { threw = true; }
    await new Promise(r => setTimeout(r, 80));
    check('需求1 seen 500 → 列表照常渲染（小红可见）', d.getElementById('imList').innerHTML.indexOf('小红') !== -1);
    check('需求1 seen 500 → 渲染调用不抛异常', !threw);
    const toastEl = d.getElementById('toast');
    check('需求1 seen 500 → 无错误 toast 打扰用户', !toastEl || (toastEl.textContent.indexOf('失败') === -1 && toastEl.textContent.indexOf('错误') === -1), toastEl && toastEl.textContent);

    // 7.5 seen 只在渲染列表时触发、绝不在轮询里（源码断言）
    const cl = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
    const pollEnd = cl.indexOf('}, 5000);');
    check('需求1 轮询体内不含 requests/seen（不会每 5 秒打接口）', pollEnd !== -1 && !cl.slice(Math.max(0, pollEnd - 2600), pollEnd).includes('requests/seen'));
    check('需求1 renderRequests 成功路径调用 markRequestsSeen', /\n      markRequestsSeen\(token, API_BASE\);/.test(cl));
  }

  /* ========== [8] BUG-1（QA Round1）：左滑展开态 × 5s 轮询重渲染 × 点击穿透（真渲染模式） ========== */
  sec('[8] BUG-1：重渲染即收起，S.swipeOpen 不残留，首次点击不被吞（真渲染模式）');
  {
    const imr = await loadReal('私聊.html');
    const Tr = imr.w.__IM_TEST__;
    check('BUG-1 真渲染模式 __IM_TEST__ 暴露', !!Tr && typeof Tr.renderChats === 'function');
    const listR = imr.d.getElementById('imList');
    Tr.S.tab = 'chats';
    Tr.S.peer = null; Tr.S.group = null; Tr.S.groups = [];
    Tr.S.chats = [
      { id: 10005, isServer: true, serverId: 5, nickname: '张三', unread: 2, last: '你好', time: 1000 },
      { id: 3, nickname: '本地草稿', unread: 1, last: '笔记', time: 3000 },
    ];
    Tr.S.presence = {};
    Tr.renderChats(listR);
    const rowOfR = tid => listR.querySelector('.im-sess[data-tid="' + tid + '"]');

    // 8.1 展开某行 → 手动触发一次重渲染（模拟 5s 轮询）→ S.swipeOpen 必须被清空
    imr.w.imOpenSwipe('u5');
    check('BUG-1 展开后 S.swipeOpen = u5（前置确认）', Tr.S.swipeOpen === 'u5');
    check('BUG-1 展开后行位移 156px', rowOfR('u5') && rowOfR('u5').style.transform === 'translateX(-156px)');
    Tr.renderChats(listR); // 模拟 5s 未读轮询 renderList → renderChats
    check('BUG-1 重渲染后 S.swipeOpen 被清空（状态不残留）', Tr.S.swipeOpen === null, 'S.swipeOpen=' + Tr.S.swipeOpen);
    check('BUG-1 重渲染后无位移残留', !rowOfR('u5') || rowOfR('u5').style.transform === '' || rowOfR('u5').style.transform === 'none');

    // 8.2 BUG-1 复现路径：展开 → 重渲染 → 点击会话行 → imOpenChat 必须被调用 1 次
    //     （修前：捕获阶段监听器只看 S.swipeOpen 残留 → stopPropagation 吞掉首次点击，调用 0 次）
    let openChatCalls = [];
    imr.w.imOpenChat = function (id) { openChatCalls.push(id); };
    imr.w.imOpenSwipe('u5');
    Tr.renderChats(listR);
    rowOfR('l3').dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('BUG-1 重渲染收起后点击行 → imOpenChat 被调用 1 次（修前为 0）', openChatCalls.length === 1, 'imOpenChat 调用=' + openChatCalls.length);

    // 8.3 无展开态时点击行照常进入会话（防回归：清空逻辑不误伤正常路径）
    rowOfR('l3').dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('BUG-1 无展开态点击行 → imOpenChat 再调用 1 次（累计 2）', openChatCalls.length === 2, 'imOpenChat 调用=' + openChatCalls.length);

    // 8.4 展开态下点击同一行 → 捕获阶段收起且不进会话（原防误触行为保留）
    imr.w.imOpenSwipe('u5');
    rowOfR('u5').dispatchEvent(new imr.w.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('BUG-1 展开态点击行 → 收起且不进会话（调用数不变）', Tr.S.swipeOpen === null && openChatCalls.length === 2);

    // 8.5 群行无「置顶」按钮（QA 观察项处置：隐藏，避免「已置顶」toast 误导）+ 位移随按钮数收缩
    Tr.S.groups = [{ id: 1, name: '四级冲刺群', memberCount: 3, unreadCount: 0 }];
    Tr.renderChats(listR);
    const gWrap = listR.querySelector('.im-swipe[data-tid="g1"]');
    check('BUG-1/观察项 群行不渲染「置顶」按钮（只有免打扰+删除）',
      !!gWrap && gWrap.querySelectorAll('.im-sa').length === 2 && !gWrap.querySelector('.im-sa-pin'));
    imr.w.imOpenSwipe('g1');
    check('BUG-1/观察项 群行展开位移 = 104px（2 按钮 × 52）', gWrap.querySelector('.im-sess').style.transform === 'translateX(-104px)');
    imr.w.imCloseSwipe();
  }

  console.log('\n========== 汇总 ==========');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项。');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('断言脚本异常：', e); process.exit(2); });
