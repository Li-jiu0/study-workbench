/* =====================================================================
   tools/qa/_r44_qa_sandbox_page.js —— 页内沙箱脚本（由 _r44_qa_sandbox.js
   在 jsdom 中 eval）。R44 第二层 QA 独立构造的最小 DOM 沙箱：
     · 链路：管理员回复用户 → imSendText → loadChats() → 会话列表行还在
     · 快照兜底：即使持久化被写成老「裸记录」，内存态快照仍把行合并回来
     · adminPeer 四重门控：逐条件证伪（含 roleResolved 时序窗口、myId 兜底）
   只读，不改业务代码。
   ===================================================================== */
(async function () {
  var R = [];
  function a(cond, msg) { if (!cond) throw new Error(msg); }
  function ckA(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(function () { R.push('PASS ' + name); },
        function (e) { R.push('FAIL ' + name + ' :: ' + e.message); });
  }
  function ok(body) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } }); }
  function setFetch(fn) { window.__setFetch(fn); }
  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 40); }); }
  var T = window.__IM_TEST__;
  if (!T) { window.__R44QA_RESULTS = 'FAIL setup :: __IM_TEST__ missing'; return; }
  var S = T.S;
  var list = document.getElementById('imList');

  window.localStorage.setItem('study_workbench_token', 'tok-r44qa');
  window.localStorage.removeItem('xt_admin_user_id');
  setFetch(function () { return ok({ items: [] }); });
  await tick(60);

  /* ---------- 0. 记录 boot 之后的关键状态（用于判断断言是否“为真通过”） ---------- */
  R.push('INFO boot.state roleResolved=' + S.roleResolved + ' isAdmin=' + S.isAdmin + ' myId=' + S.myId + ' chats=' + S.chats.length);

  /* ---------- 1. 管理员回复用户 → loadChats() → 会话列表行还在 ---------- */
  await ckA('S1_admin_reply_row_survives_loadChats', async function () {
    S.tab = 'chats';
    S.group = null;
    S.aiBusy = false;
    S.myId = 10;
    S.isAdmin = true;
    S.roleResolved = true;
    S.chats = [];
    // 管理员视角：用户 7 来信 → 动态服务器会话（模拟 imEnsureServerChat 的产物）
    var chat = { id: 10007, serverId: 7, isServer: true, nickname: '用户7', avatar: '', last: '在吗', unread: 1, time: 1000 };
    S.chats.push(chat);
    S.peer = chat;
    S.msgs = [];
    // 让持久化处于「老版本裸记录」最坏态：没有 isServer / serverId
    var d0 = T.loadData();
    d0.chats = d0.chats || {};
    d0.chats['10007'] = { id: 10007, nickname: '用户7', avatar: '', last: '在吗', unread: 1, time: 1000 };
    T.saveData(d0);
    setFetch(function (url) {
      if (String(url).indexOf('/messages') >= 0) return ok({ id: 1, senderId: 10, content: '收到', kind: 'text', time: Date.now() });
      return ok({ items: [] });
    });
    var inp = document.getElementById('imInput');
    a(!!inp, '#imInput 不存在，无法驱动 imSendText');
    inp.value = '你好，我是管理员';
    window.imSendText();
    await tick(60);
    var rows = S.chats.filter(function (c) { return Number(c.serverId) === 7; });
    a(rows.length === 1, '回复后会话行数量异常: ' + rows.length);
    a(rows[0].isServer === true, '回复后 isServer 丢失');
    a(rows[0].last === '你好，我是管理员', '回复后 last 未更新: ' + rows[0].last);
    var html = list ? list.innerHTML : '';
    a(html.indexOf('用户7') !== -1, '会话列表未渲染出「用户7」（行真的丢了），htmlLen=' + html.length);
    R.push('INFO S1 listHtmlHasRow=' + (html.indexOf('用户7') !== -1) + ' listLen=' + html.length);
    // 持久化形状：imSendText 应补写 isServer/serverId
    var d1 = T.loadData();
    a(d1.chats['10007'] && d1.chats['10007'].isServer === true && Number(d1.chats['10007'].serverId) === 7,
      '持久化仍为裸记录: ' + JSON.stringify(d1.chats['10007']));
  });

  /* ---------- 2. 快照兜底：持久化被写成裸记录时，内存态快照仍把行合并回来 ---------- */
  await ckA('S2_snapshot_merge_rescues_bare_persist', async function () {
    S.chats = [{ id: 10007, serverId: 7, isServer: true, nickname: '用户7', avatar: '', last: '内存态最新', unread: 2, time: 8888 }];
    var d = T.loadData();
    d.chats['10007'] = { id: 10007, nickname: '用户7', avatar: '', last: '裸记录', unread: 0, time: 1 }; // 无 isServer/serverId
    T.saveData(d);
    T.loadChats();
    var rows = S.chats.filter(function (c) { return Number(c.serverId) === 7; });
    a(rows.length === 1, '裸持久化场景下会话行丢失/重复: ' + rows.length);
    a(rows[0].time === 8888, '合并应取较新的 time，got ' + rows[0].time);
    var html = list ? list.innerHTML : '';
    a(html.indexOf('用户7') !== -1, '裸持久化场景下列表未渲染该行');
  });

  /* ---------- 3. 冷启动（内存态为空）时，裸持久化仍会丢行 —— 记录两个机制各自覆盖的窗口 ---------- */
  await ckA('S3_cold_start_bare_persist_informational', async function () {
    S.chats = [];
    var d = T.loadData();
    d.chats['10007'] = { id: 10007, nickname: '用户7', avatar: '', last: '裸记录', unread: 0, time: 1 };
    T.saveData(d);
    T.loadChats();
    var rows = S.chats.filter(function (c) { return Number(c.serverId) === 7; });
    R.push('INFO S3 coldStartRows=' + rows.length + '（预期 0：内存快照为空时只能靠 data.chats 回补，这正是“持久化形状修复”的必要性）');
    a(true, '');
  });

  /* ---------- 4. adminPeer 四重门控逐条证伪（普通用户视角必须与改动前一致） ---------- */
  await ckA('S4_adminPeer_gating_matrix', async function () {
    var fns = (window.__intervals || []).filter(function (x) { return x.ms === 5000; });
    a(fns.length >= 1, '未捕获 5s 未读轮询回调');
    var poll = fns[0].fn;
    function runPoll(peerId) {
      S.chats = [];
      setFetch(function (url) {
        if (String(url).indexOf('/api/chat/unread') >= 0) return ok({ items: [{ peerId: peerId, count: 2, lastId: 50, last: 'm', nickname: 'n' }] });
        return ok({ items: [] });
      });
      poll();
      return tick(60).then(function () {
        return S.chats.filter(function (c) { return c.isServer && Number(c.serverId) === Number(peerId); }).length;
      });
    }
    window.localStorage.setItem('xt_admin_user_id', '10'); // 管理员账号 id = 10

    // 4a 普通用户 + 角色已落地：管理员来信 → 抑制（与改动前一致）
    S.roleResolved = true; S.isAdmin = false; S.myId = 7;
    var n1 = await runPoll(10);
    a(n1 === 0, '4a 普通用户应抑制管理员来信行，got ' + n1);

    // 4b 普通用户：非管理员来信 → 照旧建行
    S.roleResolved = true; S.isAdmin = false; S.myId = 7;
    var n2 = await runPoll(9);
    a(n2 === 1, '4b 普通用户应照旧建行，got ' + n2);

    // 4c 普通用户 + 角色未落地（/api/auth/me 还在飞）：保守按非管理员处理 → 仍抑制
    S.roleResolved = false; S.isAdmin = false; S.myId = 7;
    var n3 = await runPoll(10);
    a(n3 === 0, '4c 角色未落地时应保守抑制，got ' + n3);

    // 4d 管理员本人 + 角色已落地：peerId 等于自己 → myId 兜底，不抑制
    S.roleResolved = true; S.isAdmin = true; S.myId = 10;
    var n4 = await runPoll(10);
    a(n4 === 1, '4d 管理员自己这条不能被抑制（myId 兜底），got ' + n4);

    // 4e 管理员 + 角色已落地 + 普通用户来信：建行
    S.roleResolved = true; S.isAdmin = true; S.myId = 10;
    var n5 = await runPoll(7);
    a(n5 === 1, '4e 管理员收到普通用户来信应建行，got ' + n5);

    // 4f 管理员 + 角色未落地 + myId 已落地：peerId 等于自己 → myId 兜底生效，仍建行
    S.roleResolved = false; S.isAdmin = true; S.myId = 10;
    var n6 = await runPoll(10);
    a(n6 === 1, '4f myId 兜底失效，got ' + n6);

    // 4g 管理员 + 角色未落地 + myId 未落地（999）+ 普通用户来信：peerId != 管理员id → 建行
    S.roleResolved = false; S.isAdmin = true; S.myId = 999;
    var n7 = await runPoll(7);
    a(n7 === 1, '4g 时序窗口内普通用户来信应建行，got ' + n7);

    R.push('INFO S4 matrix 4a=' + n1 + ' 4b=' + n2 + ' 4c=' + n3 + ' 4d=' + n4 + ' 4e=' + n5 + ' 4f=' + n6 + ' 4g=' + n7);
    S.roleResolved = true; S.isAdmin = false; S.myId = 7;
    window.localStorage.removeItem('xt_admin_user_id');
  });

  /* ---------- 5. 字符串 peerId（后端若返回字符串）不再击穿 Number() 统一比较 ---------- */
  await ckA('S5_string_peerId_no_duplicate_rows', async function () {
    var fns = (window.__intervals || []).filter(function (x) { return x.ms === 5000; });
    var poll = fns[0].fn;
    S.roleResolved = true; S.isAdmin = true; S.myId = 10;
    S.chats = [];
    setFetch(function (url) {
      if (String(url).indexOf('/api/chat/unread') >= 0) return ok({ items: [{ peerId: '7', count: 3, lastId: 61, last: 'str', nickname: 'n' }] });
      return ok({ items: [] });
    });
    poll();
    await tick(60);
    poll();
    await tick(60);
    var rows = S.chats.filter(function (c) { return c.isServer && Number(c.serverId) === 7; });
    a(rows.length === 1, '字符串 peerId 造成重复行: ' + rows.length);
    R.push('INFO S5 rowsAfterTwoPolls=' + rows.length);
  });

  window.__R44QA_RESULTS = R.join('\n');
})();
