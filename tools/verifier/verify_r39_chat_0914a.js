// R39+R40 验证脚本（2026-09-14a）：
//   R39 非好友来信动态会话（imEnsureServerChat / loadChats 回填 / 已读保留 / getFriend 回退 / 渲染）
//   R40 管理员「全部用户」分组（imAdminUsersHtml / imFmtLastActive / isAdmin 分支与降级）
// 模式：chat-local.js 与测试代码拼进同一段 eval；IIFE 内部符号经 window.__IM_TEST__ 暴露（既有惯例）。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
const chatjs = fs.readFileSync(path.join(ROOT, 'assets/chat-local.js'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

// jsdom 无 fetch：stub 一个可控假 fetch（Node 侧 let 变量，用例内可整体替换）
let __fetchStub = function () { return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({}); } }); };
w.fetch = function () { return __fetchStub.apply(null, arguments); };

const harness = `
;(function(){
  const results = [];
  function check(name, fn){ try { fn(); results.push('PASS ' + name); } catch(e){ results.push('FAIL ' + name + ' :: ' + e.message); } }
  function assert(cond, msg){ if (!cond) throw new Error(msg); }
  function flush(){ window.__R39_RESULTS = results.join('\\n'); }

  var T = window.__IM_TEST__;
  if (!T) { results.push('FAIL setup :: __IM_TEST__ missing'); flush(); return; }
  var S = T.S, loadChats = T.loadChats, renderChats = T.renderChats, renderFriends = T.renderFriends;
  var imEnsureServerChat = T.imEnsureServerChat, getFriend = T.getFriend;
  var loadData = T.loadData, saveData = T.saveData;
  var imFmtLastActive = T.imFmtLastActive, imAdminUsersHtml = T.imAdminUsersHtml;

  var list = document.getElementById('imList');
  if (!list) { results.push('FAIL setup :: #imList missing'); flush(); return; }

  // renderFriends 的 token 早退门：必须先放一个假 token 才能走到好友/管理员分支
  window.localStorage.setItem('study_workbench_token', 'test-token-0914');

  function localStamp(msAgo) {
    var d = new Date(Date.now() - (msAgo || 0));
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // ---------- R39-1：S.chats 为空 + 一条 unread item → 合并后出现会话行 ----------
  check('R39_ensure_creates_chat', function(){
    S.chats = [];
    var item = { peerId: 6, count: 2, lastId: 99, last: '你好，我是管理员', nickname: '管理员', avatar: '' };
    var chat = imEnsureServerChat(item);
    assert(!!chat, 'imEnsureServerChat 返回空');
    assert(chat.id === 10006, 'chat.id 应为 10006，实际 ' + chat.id);
    assert(chat.serverId === 6, 'chat.serverId 应为 6');
    assert(chat.isServer === true, 'chat.isServer 应为 true');
    assert(chat.nickname === '管理员', 'nickname 应取 unread 返回值');
    assert(chat.unread === 2, 'unread 应为 2，实际 ' + chat.unread);
    assert(chat.last === '你好，我是管理员', 'last 应为未读预览');
    assert(S.chats.length === 1, 'S.chats 应有 1 条');
  });

  // ---------- R39-2：动态会话写入本地持久化 ----------
  check('R39_persisted_to_localStorage', function(){
    var data = loadData();
    var c = data.chats['10006'];
    assert(!!c, 'data.chats[10006] 不存在（未持久化）');
    assert(c.isServer === true && c.serverId === 6, '持久化形状缺 isServer/serverId');
    assert(c.nickname === '管理员', '持久化 nickname 错误');
  });

  // ---------- R39-3：avatar 字段名映射（unread 的 avatar vs 好友列表 avatarUrl） ----------
  check('R39_avatar_field_mapping', function(){
    S.chats = [];
    var chat = imEnsureServerChat({ peerId: 7, count: 1, lastId: 100, last: 'hi', nickname: '张三', avatar: '/uploads/avatars/u7_1.png' });
    assert(chat.avatar === '/uploads/avatars/u7_1.png', 'avatar 未按 unread 接口字段映射');
    S.chats = [];
    var chat2 = imEnsureServerChat({ peerId: 8, count: 1, lastId: 101, last: 'x', nickname: '李四' });
    assert(chat2.avatar === '', 'avatar 缺失时应兜底空串（renderAvatar 回退昵称首字）');
  });

  // ---------- R39-4：模拟刷新（S.chats 清空 + loadChats）→ 动态会话回填、不重复 ----------
  check('R39_rehydrated_after_reload', function(){
    S.chats = [];
    loadChats();
    var rows = S.chats.filter(function (c) { return c.serverId === 6; });
    assert(rows.length === 1, '刷新后应恰好回填 1 条管理员会话，实际 ' + rows.length);
    assert(rows[0].id === 10006 && rows[0].isServer === true, '回填形状错误');
  });

  // ---------- R39-5：已读归零后会话行保留 ----------
  check('R39_row_kept_after_read', function(){
    var c = S.chats.find(function (x) { return x.serverId === 6; });
    c.unread = 0;
    var data = loadData(); data.chats['10006'].unread = 0; saveData(data);
    loadChats();
    var still = S.chats.find(function (x) { return x.serverId === 6; });
    assert(!!still, '已读归零后动态会话行被删（应保留）');
    assert(still.unread === 0, '已读后 unread 应为 0');
  });

  // ---------- R39-6：getFriend 回退（imOpenChat 第一道门） ----------
  check('R39_getFriend_fallback', function(){
    var f = getFriend(10006);
    assert(!!f, 'getFriend(10006) 返回空 → imOpenChat 会直接 return，点不开');
    assert(f.isServer === true && f.serverId === 6 && f.nickname === '管理员', '回退对象形状错误');
  });

  // ---------- R39-7：会话 tab 渲染出可点开的行 ----------
  check('R39_renderChats_row_clickable', function(){
    loadChats();
    renderChats(list);
    var html = list.innerHTML;
    assert(html.indexOf('管理员') !== -1, '会话列表未渲染「管理员」行');
    assert(html.indexOf('imOpenChat(10006)') !== -1, '会话行缺 imOpenChat(10006) 入口');
  });

  // ---------- R39-8：轮询合并路径（全新 peerId 走「匹配不到→创建」分支） ----------
  check('R39_polling_merge_path', function(){
    S.chats = [];
    loadChats();
    var item = { peerId: 9, count: 3, lastId: 205, last: '在吗', nickname: '王五', avatar: '' };
    var chat = S.chats.find(function (c) { return c.isServer && c.serverId === item.peerId; });
    if (!chat) chat = imEnsureServerChat(item);
    assert(!!chat, '轮询合并路径仍丢未读');
    assert(chat.unread === 3 && chat.nickname === '王五', '轮询合并数据错误');
  });

  // ---------- R40-1：lastActive 格式化（本地时间串，空串 → —） ----------
  check('R40_fmtLastActive', function(){
    assert(imFmtLastActive('') === '—', '空串应显示 —');
    assert(imFmtLastActive(null) === '—', 'null 应显示 —');
    assert(imFmtLastActive('not-a-date') === '—', '非法串应显示 —');
    assert(imFmtLastActive('2999-01-01 00:00:00') === '刚刚', '未来时间按刚刚处理');
    var s5 = localStamp(5 * 60000);
    assert(/分钟前$/.test(imFmtLastActive(s5)), '5 分钟前格式错误: ' + imFmtLastActive(s5));
    var s2h = localStamp(2 * 3600 * 1000);
    assert(/小时前$/.test(imFmtLastActive(s2h)), '2 小时前格式错误: ' + imFmtLastActive(s2h));
    var s3d = localStamp(3 * 24 * 3600 * 1000);
    assert(/天前$/.test(imFmtLastActive(s3d)), '3 天前格式错误: ' + imFmtLastActive(s3d));
  });

  // ---------- R40-2：管理员分组渲染（stub /api/admin/users 成功，异步断言） ----------
  check('R40_admin_users_render', function(){
    S.isAdmin = true;
    var stamp = localStamp(2 * 3600 * 1000);
    __fetchStub = function () {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ total: 3, items: [
          { id: 6, username: '管理员', nickname: '管理员', isAdmin: true, isOnline: true, lastActive: stamp },
          { id: 7, username: 'tuser', nickname: '普通用户', isAdmin: false, isOnline: false, lastActive: stamp },
          { id: 8, username: 'old', nickname: '很久没来', isAdmin: false, isOnline: false, lastActive: '' }
        ] });
      } });
    };
    renderFriends(list);
    setTimeout(function () {
      try {
        var html = list.innerHTML;
        assert(html.indexOf('全部用户 (3)') !== -1, '缺「全部用户 (3)」分组标题');
        assert(html.indexOf('imOpenChat(10006)') !== -1, '管理员行缺 imOpenChat(10006)');
        assert(html.indexOf('imOpenChat(10007)') !== -1, '用户行缺 imOpenChat(10007)');
        assert(html.indexOf('[管理员]') !== -1, 'is_admin 行未标注「管理员」');
        assert(html.indexOf('● 在线') !== -1, 'isOnline 未显示在线徽标');
        assert(html.indexOf('小时前') !== -1, 'lastActive 未格式化为 x 小时前');
        assert(html.indexOf('最近活跃 —') !== -1, 'lastActive 空串未显示 —');
        results.push('PASS R40_admin_users_render_async');
      } catch (e) {
        results.push('FAIL R40_admin_users_render_async :: ' + e.message);
      }
      flush();
    }, 60);
  });

  // ---------- R40-3：普通用户行为不变（S.isAdmin=false 仍走 /api/friends） ----------
  check('R40_normal_user_unchanged', function(){
    S.isAdmin = false;
    var called = [];
    __fetchStub = function (url) { called.push(String(url)); return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ items: [] }); } }); };
    renderFriends(list);
    setTimeout(function () {
      try {
        assert(called.some(function (u) { return u.indexOf('/api/friends') !== -1; }), '普通用户应仍请求 /api/friends');
        assert(!called.some(function (u) { return u.indexOf('/api/admin/users') !== -1; }), '普通用户不应请求 /api/admin/users');
        results.push('PASS R40_normal_user_unchanged_async');
      } catch (e) {
        results.push('FAIL R40_normal_user_unchanged_async :: ' + e.message);
      }
      flush();
    }, 110);
  });

  // ---------- R40-4：管理员拉取失败（403）→ 降级回好友列表 ----------
  check('R40_degrade_on_failure', function(){
    S.isAdmin = true;
    var called = [];
    __fetchStub = function (url) {
      called.push(String(url));
      if (String(url).indexOf('/api/admin/users') !== -1) return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({ detail: '仅管理员可访问' }); } });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ items: [] }); } });
    };
    renderFriends(list);
    setTimeout(function () {
      try {
        assert(called.some(function (u) { return u.indexOf('/api/admin/users') !== -1; }), '管理员应先请求 /api/admin/users');
        assert(called.some(function (u) { return u.indexOf('/api/friends') !== -1; }), '403 后未降级请求 /api/friends');
        results.push('PASS R40_degrade_on_failure_async');
      } catch (e) {
        results.push('FAIL R40_degrade_on_failure_async :: ' + e.message);
      }
      flush();
    }, 160);
  });

  flush();
})();
`;

try { w.eval(chatjs + '\n' + harness); }
catch (e) {
  console.log('EVAL_THROW', e.message);
  fs.writeFileSync(path.join(ROOT, 'tools/verifier/_r39_out.txt'), 'EVAL_THROW ' + e.message + '\n' + (e.stack || ''));
  process.exit(1);
}

// 等全部异步断言写回后输出（最后一段在 ~160ms + 渲染链）
setTimeout(function () {
  const out = w.__R39_RESULTS || '(no results)';
  console.log(out);
  fs.writeFileSync(path.join(ROOT, 'tools/verifier/_r39_out.txt'), out + '\n');
  process.exit(0);
}, 600);
