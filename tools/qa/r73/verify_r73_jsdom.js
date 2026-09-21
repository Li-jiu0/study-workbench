/**
 * tools/qa/r73/verify_r73_jsdom.js
 * R73 需求3（图片全屏预览）+ 需求19（历史滚动被重置）机器验证（jsdom 真实渲染）。
 *
 * 范式沿用 tools/verifier/verify_p0_batch2_0911.js 的 loadReal：
 *   本地 HTTP 服务 + runScripts:'dangerously' + resources:'usable'，内联 onclick 可执行。
 *
 * 断言：
 *   ① kind='image' 消息渲染后，对 <img class="im-img"> 派发 click → 页面出现 .im-img-preview；点 ✕ 后消失。
 *   ② renderMsgs() 重建：scrollTop 记录在 500（非贴底）时保持 ≈500（证伪「重建即回顶」）；贴底时仍贴底。
 *   ③ 「加载更多」：mock fetch 返回 10 条更早消息 → S.msgs 增加 10 且顺序正确；URL 带 before_id + mark_read=0；
 *      重建后 scrollTop 按 scrollHeight 增量补偿（视口不跳动）。
 *
 * 运行：NODE_PATH=<项目>/tools/verifier/node_modules node tools/qa/r73/verify_r73_jsdom.js
 * 结果写入 tools/qa/r73/_jsdom_report.txt（本机 shell 吞 stdout，故写文件）。
 */
var path = require('path');
var fs = require('fs');
var http = require('http');
var ROOT = path.resolve(__dirname, '..', '..', '..');

var OUT = path.join(__dirname, '_jsdom_report.txt');
var lines = [];
function log(s) { lines.push(s); }
var pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; log('  [PASS] ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; log('  [FAIL] ' + label + (detail ? '  -> ' + detail : '')); }
}
function flush() { fs.writeFileSync(OUT, lines.join('\r\n')); }

process.on('unhandledRejection', function (e) { log('  [bg-rejection·jsdom伪影] ' + (e && e.message)); });
process.on('uncaughtException', function (e) { log('  [bg-exception·jsdom伪影] ' + (e && e.message)); });

var JSDOM, VirtualConsole;
try {
  var jd = require('jsdom');
  JSDOM = jd.JSDOM; VirtualConsole = jd.VirtualConsole;
} catch (e) {
  log('无法加载 jsdom: ' + e.message);
  log('结论: 运行时验证未执行（缺少 jsdom 依赖）');
  flush();
  process.exit(2);
}

var PAGE = '私聊.html';
var PORT = 8137;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function startServer(ready) {
  var srv = http.createServer(function (req, res) {
    var p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, function (e, buf) {
      if (e) { res.writeHead(404); res.end('nf'); return; }
      var ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
      res.writeHead(200, { 'content-type': ct }); res.end(buf);
    });
  });
  srv.listen(PORT, '127.0.0.1', function () { ready(srv); });
}

function loadReal(cb) {
  var vcErrors = [];
  var vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { vcErrors.push(String((e && e.message) || e)); });
  var html = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
  var wRef = null;
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + PORT + '/' + PAGE,
    virtualConsole: vc,
    beforeParse: function (w) {
      wRef = w;
      w.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); };
      try {
        w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
        w.localStorage.setItem('study_workbench_token', 'test-token');
      } catch (e) { }
    }
  });
  cb(wRef, vcErrors, dom);
}

async function main() {
  log('R73 jsdom 验证 — ' + new Date().toISOString());
  await new Promise(function (res) { startServer(res); });
  log('HTTP 服务已起于 127.0.0.1:' + PORT);

  var w, d, vcErrors, t;
  await new Promise(function (res) { loadReal(function (ww, ve) { w = ww; vcErrors = ve; res(); }); });

  // 等 chat-local.js 加载 + boot 注册
  var tries = 0;
  while ((!w.__IM_TEST__) && tries < 60) { await sleep(100); tries++; }
  d = w.document;
  t = w.__IM_TEST__;
  check('chat-local.js 加载并导出 __IM_TEST__', !!t, tries + '×100ms');
  if (!t) { log('结论: 运行时验证未执行（__IM_TEST__ 未就绪）'); flush(); process.exit(1); }

  var box = d.getElementById('imMsgs');
  check('#imMsgs 存在', !!box);

  // 准备一个私聊图片会话上下文
  t.S.group = null;
  t.S.peer = { isServer: true, serverId: 12345, nickname: 'Tester', id: 10000 + 12345 };
  t.S.myId = 777;

  /* ============ ① 图片点击 → 单例查看器 ============ */
  log('');
  log('== 需求3 ①：点击图片气泡 → 打开查看器；点 ✕ 关闭 ==');
  t.S.msgs = [
    { id: 1, senderId: 777, content: 'http://127.0.0.1/x/a.png', kind: 'image', time: Date.now(), server: true, read: true }
  ];
  t.renderMsgs();
  var img = d.querySelector('#imMsgs img.im-img');
  check('img.im-img 已渲染', !!img, img ? img.getAttribute('src') : '未找到');
  check('点击前无 .im-img-preview', !d.querySelector('.im-img-preview'));
  if (img) {
    img.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  }
  var ov = d.querySelector('.im-img-preview');
  check('点击图片后出现 .im-img-preview（全屏浮层）', !!ov);
  var closeBtn = d.querySelector('.im-iv-btn[data-act="close"]');
  check('查看器含 ✕ 关闭按钮(.im-iv-btn[data-act=close])', !!closeBtn);
  check('查看器含 ＋/－ 缩放按钮', !!d.querySelector('.im-iv-btn[data-act="in"]') && !!d.querySelector('.im-iv-btn[data-act="out"]'));
  if (closeBtn) closeBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('点击 ✕ 后 .im-img-preview 消失', !d.querySelector('.im-img-preview'));

  // 再次打开 → 复用同一节点（单例）
  t.imPreviewImage('http://127.0.0.1/x/b.png');
  var ov1 = t.getPreviewEl();
  t.imClosePreview();
  t.imPreviewImage('http://127.0.0.1/x/c.png');
  var ov2 = t.getPreviewEl();
  check('查看器为单例（两次打开同一节点）', ov1 && ov1 === ov2);
  t.imClosePreview();

  // 长按图片不弹菜单：imRecallPressStart 命中 IMG 直接返回
  var menuBefore = d.querySelector('.im-msg-menu');
  t.S.msgs = [{ id: 2, senderId: 777, content: 'http://127.0.0.1/x/d.png', kind: 'image', time: Date.now(), server: true }];
  t.renderMsgs();
  var img2 = d.querySelector('#imMsgs img.im-img');
  if (img2) {
    // 模拟触摸长按起点（e.target = img）
    var ev = new w.Event('touchstart');
    ev.touches = [{ pageX: 5, pageY: 5 }];
    Object.defineProperty(ev, 'target', { value: img2 });
    w.imRecallPressStart('2', ev, img2);
    await sleep(650); // 超过 PRESS_MS(500)
    check('长按图片不弹出消息菜单（需求3 次因）', !d.querySelector('.im-msg-menu'), 'menuBefore=' + !!menuBefore);
    w.imRecallPressEnd();
  }

  /* ============ ② renderMsgs 重建不重置 scrollTop ============ */
  log('');
  log('== 需求19 ②：renderMsgs 重建保 scrollTop ==');
  var sh = 1000, st = 500, ch = 300;
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: function () { return sh; } });
  Object.defineProperty(box, 'clientHeight', { configurable: true, get: function () { return ch; } });
  Object.defineProperty(box, 'scrollTop', { configurable: true, get: function () { return st; }, set: function (v) { st = v; } });

  t.S.msgs = [{ id: 10, senderId: 777, content: 'hello', kind: 'text', time: Date.now(), server: true }];
  st = 500; // 非贴底
  sh = 1000;
  t.renderMsgs();
  check('非贴底时重建：scrollTop 保持 500（证伪「重建即回顶」）', st === 500, 'scrollTop=' + st);

  st = 700; // 贴底（1000-700-300=0 < 24）
  t.renderMsgs();
  check('贴底时重建：scrollTop 仍贴底 =1000（原行为不变）', st === 1000, 'scrollTop=' + st);

  st = 0; // 翻到顶
  t.renderMsgs();
  check('翻到顶时重建：scrollTop 保持 0', st === 0, 'scrollTop=' + st);

  /* ============ ③ 加载更多（before_id + mark_read=0 + 视口补偿） ============ */
  log('');
  log('== 需求19 ③：向上加载更多（mark_read=0）==');
  var lastUrl = '';
  w.fetch = function (url) {
    lastUrl = String(url);
    if (lastUrl.indexOf('before_id=') >= 0) {
      var items = [];
      for (var i = 41; i <= 50; i++) {
        items.push({ id: i, senderId: 999, content: 'old-' + i, kind: 'text', createdAt: new Date(1700000000000 + i * 1000).toISOString(), read: false });
      }
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: items, hasMore: true, nextBefore: 41 }); } });
    }
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [], hasMore: false }); } });
  };

  var base = [];
  for (var k = 51; k <= 100; k++) {
    base.push({ id: k, senderId: 888, content: 'new-' + k, kind: 'text', time: Date.now(), server: true, read: true });
  }
  t.S.msgs = base.slice();
  t.renderMsgs();
  var lenBefore = t.S.msgs.length;

  // scrollHeight 随「DOM 中已渲染的消息条数」增长（模拟真实排版：每多 1 条约 20px），以验证高度差补偿。
  // 注意必须用 DOM 计数而非 S.msgs.length —— 真实浏览器里 S.msgs 先变、DOM 后变，prevH 反映的是旧 DOM。
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: function () { return 1000 + (box.querySelectorAll('.im-m').length - 50) * 20; } });
  st = 20; // 滚动到接近顶部 → 触发条件 (<48)

  t.setImHasMore(true);
  t.imLoadMoreMsgs();
  await sleep(120); // 等 fetch 的 .then 链

  check('「加载更多」请求 URL 带 before_id=51', lastUrl.indexOf('before_id=51') >= 0, lastUrl);
  check('「加载更多」请求 URL 带 mark_read=0（关键：不推进已读水位线）', lastUrl.indexOf('mark_read=0') >= 0, lastUrl);
  check('URL 带 limit=30', lastUrl.indexOf('limit=30') >= 0, lastUrl);
  check('S.msgs 增加 10 条更早消息（50 -> 60）', t.S.msgs.length === 60, 'len=' + t.S.msgs.length + ' (before=' + lenBefore + ')');
  check('更早消息 prepend 到最前（首条 id=41）', t.S.msgs[0] && Number(t.S.msgs[0].id) === 41, 'first.id=' + (t.S.msgs[0] && t.S.msgs[0].id));
  check('原最新消息仍在末尾（末条 id=100）', t.S.msgs[t.S.msgs.length - 1] && Number(t.S.msgs[t.S.msgs.length - 1].id) === 100, 'last.id=' + (t.S.msgs[t.S.msgs.length - 1] && t.S.msgs[t.S.msgs.length - 1].id));
  // 补偿：prevTop=20, prevH=1000, 新 sh = 1000+(60-50)*20 = 1200 → scrollTop = 20 + 200 = 220
  check('重建后 scrollTop 按高度差补偿（20 -> 220，视口不跳动）', st === 220, 'scrollTop=' + st);

  /* ============ ④ 签名早退：内容不变不重建 ============ */
  log('');
  log('== 需求19 ④：轮询内容不变 → 不整表重建（签名早退）==');
  t.S.msgs = [
    { id: 1, senderId: 777, content: 'same', kind: 'text', time: 1, server: true, read: true },
    { id: 2, senderId: 999, content: 'same2', kind: 'text', time: 2, server: true, read: false }
  ];
  t.renderMsgs();
  var sigA = t.imMsgsSig(t.S.msgs);
  var sigB = t.imMsgsSig(t.S.msgs.slice());
  check('相同列表签名一致', sigA === sigB);
  var sigC = t.imMsgsSig([{ id: 1, senderId: 777, content: 'same', kind: 'text', time: 1, server: true, read: true }]);
  check('列表变化（少一条）签名不同', sigA !== sigC);

  /* ============ ⑤ 会话切换竞态守卫（需求19 孪生） ============ */
  log('');
  log('== 需求19-孪生 ⑤：快速切换会话，丢弃 A 的迟到响应 ==');
  t.S.group = null;
  t.S.peer = { isServer: true, serverId: 111, nickname: 'A' };
  t.S.msgs = [{ id: 'B1', senderId: 222, content: 'belongs-to-B', kind: 'text', time: 1, server: true }];
  var arrivedA = false;
  w.fetch = function () {
    return new Promise(function (res) {
      setTimeout(function () {
        arrivedA = true;
        res({ ok: true, json: function () { return Promise.resolve({ items: [{ id: 999, senderId: 111, content: 'a-msg', kind: 'text', createdAt: new Date(5).toISOString(), read: true }], hasMore: false }); } });
      }, 80);
    });
  };
  t.fetchPeerMsgs(true);                                        // 目标 = A(111)
  t.S.peer = { isServer: true, serverId: 222, nickname: 'B' };  // 立刻切到 B（模拟连点）
  await sleep(160);
  check('A 的响应确实返回了（用例非空跑）', arrivedA === true);
  check('A 的迟到响应未回写 S.msgs（peer 守卫生效）', t.S.msgs.length === 1 && t.S.msgs[0].id === 'B1', 'msgs[0].id=' + (t.S.msgs[0] && t.S.msgs[0].id));
  check('S.peer 仍为 B（未被串改）', !!t.S.peer && t.S.peer.serverId === 222);

  t.S.peer = null;
  t.S.group = { id: 777, name: 'G1', memberCount: 2 };
  t.S.msgs = [{ id: 'B2', senderId: 1, content: 'g-msg', kind: 'text', time: 1, server: true }];
  var arrivedG = false;
  w.fetch = function () {
    return new Promise(function (res) {
      setTimeout(function () {
        arrivedG = true;
        res({ ok: true, json: function () { return Promise.resolve({ items: [{ id: 888, senderId: 1, content: 'late-group', kind: 'text', createdAt: new Date(5).toISOString() }], hasMore: false }); } });
      }, 80);
    });
  };
  t.fetchGroupMsgs(true);
  t.S.group = { id: 778, name: 'G2', memberCount: 3 };
  await sleep(160);
  check('群会话迟到响应被丢弃（group 守卫生效）', arrivedG === true && t.S.msgs[0] && t.S.msgs[0].id === 'B2', 'msgs[0].id=' + (t.S.msgs[0] && t.S.msgs[0].id));

  /* ============ ⑥ 需求18③ 备注入口（普通用户可达）+ 保存后刷新 ============ */
  log('');
  log('== 需求18③ ⑥：头部 ✎ 备注入口 + 保存后刷新头部/列表 ==');
  var uid = 555;
  t.S.group = null;
  t.S.tab = 'chats';
  t.S.chats = [{ id: 10000 + uid, serverId: uid, isServer: true, nickname: 'Nick', peerRemark: '', last: 'hi', unread: 0, time: 10 }];
  t.S.peer = { isServer: true, serverId: uid, nickname: 'Nick', id: 10000 + uid };
  t.renderChatHeader();
  var rbtn = d.getElementById('imRemarkBtn');
  check('私聊头部出现「设置备注」按钮 #imRemarkBtn（普通用户可达）', !!rbtn, rbtn ? String(rbtn.outerHTML).slice(0, 90) : '未找到');
  check('头部初始显示昵称 Nick', d.getElementById('imCName').textContent.indexOf('Nick') >= 0, d.getElementById('imCName').textContent);
  w.imOpenRemarkEditor(uid, 'Nick');
  var inp2 = d.getElementById('imRemarkInput');
  check('备注弹窗复用既有 imOpenRemarkEditor（#imRemarkInput 存在）', !!inp2);
  if (inp2) inp2.value = '老师';
  w.apiSetFriendRemark = function (id, val) { return Promise.resolve({ peerRemark: val }); };
  w.fetch = function (url) {
    var u = String(url);
    if (u.indexOf('/api/chat/conversations') >= 0) {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [{ peerId: uid, peerNickname: 'Nick', peerRemark: '老师', lastMessage: { id: 1, kind: 'text', content: 'hi', createdAt: new Date(10).toISOString() }, unreadCount: 0 }] }); } });
    }
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
  };
  w.imSaveRemark(uid);
  await sleep(80);
  check('保存后头部标题反映备注（老师）', d.getElementById('imCName').textContent.indexOf('老师') >= 0, d.getElementById('imCName').textContent);
  var listTxt = (d.getElementById('imList') || {}).textContent || '';
  check('保存后会话列表条目反映备注（老师）', listTxt.indexOf('老师') >= 0, listTxt.replace(/\s+/g, ' ').slice(0, 80));
  check('S.chats 本地备注已更新', (t.S.chats[0] || {}).peerRemark === '老师', String((t.S.chats[0] || {}).peerRemark));
  t.S.group = { id: 900, name: 'G', memberCount: 1 };
  t.S.peer = null;
  t.renderChatHeader();
  var rbtn2 = d.getElementById('imRemarkBtn');
  check('群聊头部不显示备注入口', !rbtn2 || rbtn2.style.display === 'none');

  log('');
  log('== 汇总: PASS=' + pass + ' FAIL=' + fail + ' ==');
  log('jsdom 载入异常数: ' + vcErrors.length + (vcErrors.length ? ' : ' + vcErrors.slice(0, 3).join(' | ') : ''));
  flush();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(function (e) {
  log('RUN 异常: ' + (e && e.stack || e));
  flush();
  process.exit(3);
});
