// R72 任务一（聊天域）前端行为验证脚本（2026-09-17）：
//   Bug1 会话列表以 /api/chat/conversations 为准重建（loadChats / imBuildChatsFromConversations）+ 离线兜底
//   Bug3 好友备注显示「备注名（原名）」+ 备注编辑器（禁原生 prompt）+ imRemarkOf
//   Bug4/统一存储 多账号 localStorage 前缀（lsK/lsGet/lsSet）+ getAiConfig 前缀优先、裸键回退
//   Bug2 群 tab 管理员视图只读渲染（role=admin-view 不挂 imOpenGroup）
// 模式：chat-local.js 与测试代码拼进同一段 eval；IIFE 内部符号经 window.__IM_TEST__ 暴露（沿用 R39 惯例）。
// 异步 fetch 用例：由 Node 侧驱动假 fetch（node stub），逐相位断言，避免 window/Node 作用域歧义。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
const chatjs = fs.readFileSync(path.join(ROOT, 'assets/chat-local.js'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

// Node 侧可控假 fetch：每个相位前重新赋值 __fetchStub；__nodeCalls 记录所有被请求的 URL。
const __nodeCalls = [];
let __fetchStub = function () { return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({}); } }); };
w.fetch = function () { __nodeCalls.push(String(arguments[0])); return __fetchStub.apply(null, arguments); };

// 模拟 app.js 的 window.lsKey（多账号前缀）——eval chat-local.js 之前挂好。
w.lsKey = function (k) { return 'acctA::' + k; };
w.STUDY_API_BASE = '';
w.localStorage.setItem('study_workbench_token', 'r72-test-token');

const results = [];

// ---------------- 同步用例（与 chat-local.js 同一段 eval） ----------------
const syncHarness = `
;(function(){
  function assert(cond, msg){ if (!cond) throw new Error(msg); }
  var T = window.__IM_TEST__;
  var R = [];
  if (!T) { window.__R72T1_SYNC = 'FAIL setup :: __IM_TEST__ missing'; return; }
  function check(name, fn){ try { fn(); R.push('PASS ' + name); } catch(e){ R.push('FAIL ' + name + ' :: ' + e.message); } }
  var S = T.S;
  var LS_KEY_LOCAL = 'acctA::study_im_local_data';
  var LS_KEY_BARE = 'study_im_local_data';
  var LS_KEY_AI_PREFIX = 'acctA::study_workbench_ai_config';
  var LS_KEY_AI_BARE = 'study_workbench_ai_config';

  // R72-1：imBuildChatsFromConversations 按服务端会话重建行
  check('R72_build_from_conversations', function(){
    S.chats = [];
    T.imBuildChatsFromConversations([
      { peerId: 6, peerNickname: '管理员', peerAvatar: '', peerRemark: '', unreadCount: 0,
        updatedAt: '2026-09-17 10:00:00',
        lastMessage: { id: 501, kind: 'text', content: '收到，我来处理', createdAt: '2026-09-17 10:00:00' } },
      { peerId: 7, peerNickname: '张三', peerAvatar: '/uploads/a.png', peerRemark: '阿三', unreadCount: 2,
        updatedAt: '2026-09-17 11:00:00',
        lastMessage: { id: 503, kind: 'text', content: '在吗', createdAt: '2026-09-17 11:00:00' } }
    ]);
    var c6 = S.chats.filter(function(x){ return x.serverId === 6; })[0];
    var c7 = S.chats.filter(function(x){ return x.serverId === 7; })[0];
    assert(!!c6, 'peerId=6 会话行缺失');
    assert(c6.id === 10006 && c6.isServer === true, '会话行合成 id/isServer 错误');
    assert(c6.last === '收到，我来处理', 'lastMessage 预览错误: ' + c6.last);
    assert(!!c7, 'peerId=7 会话行缺失');
    assert(c7.peerRemark === '阿三', 'peerRemark 未带上: ' + c7.peerRemark);
    assert(c7.unread === 2 && c7.nickname === '张三', 'unread/nickname 错误');
    assert(S.chats.some(function(x){ return !x.isServer; }), '本地 AI 好友应并入会话列表');
  });

  // R72-2：备注显示名「备注名（原名）」
  check('R72_display_name', function(){
    assert(T.imDisplayName('阿三', '张三') === '阿三（张三）', '有备注未拼接原名: ' + T.imDisplayName('阿三','张三'));
    assert(T.imDisplayName('', '张三') === '张三', '无备注应显示原名');
    assert(T.imDisplayName('张三', '张三') === '张三', '备注==原名应只显示一次');
    assert(T.imDisplayName(null, '张三') === '张三', 'null 备注应显示原名');
  });

  // R72-3：imRemarkOf 从会话行读备注
  check('R72_remark_of', function(){
    S.chats = [{ id: 10007, serverId: 7, isServer: true, peerRemark: '阿三' }];
    assert(T.imRemarkOf(7) === '阿三', 'imRemarkOf 未读到会话行备注');
    assert(T.imRemarkOf(999) === '', '未知 peer 应返回空串');
  });

  // R72-4：saveData 写「账号前缀键」，不写裸键
  check('R72_storage_account_prefix', function(){
    window.localStorage.removeItem(LS_KEY_LOCAL);
    window.localStorage.removeItem(LS_KEY_BARE);
    T.saveData({ chats: {}, messages: {} });
    assert(window.localStorage.getItem(LS_KEY_LOCAL) !== null, '未写入账号前缀键 ' + LS_KEY_LOCAL);
    assert(window.localStorage.getItem(LS_KEY_BARE) === null, '不应再写裸键 ' + LS_KEY_BARE + '（会被 app.js 迁移清掉）');
  });

  // R72-5：getAiConfig 前缀优先 + 裸键回退
  check('R72_get_ai_config', function(){
    window.localStorage.setItem(LS_KEY_AI_PREFIX, JSON.stringify({ apiKey: 'K1', baseUrl: 'http://x', model: 'm1' }));
    var c1 = T.getAiConfig();
    assert(c1 && c1.apiKey === 'K1', '前缀键 AI 配置未读到');
    window.localStorage.removeItem(LS_KEY_AI_PREFIX);
    window.localStorage.setItem(LS_KEY_AI_BARE, JSON.stringify({ apiKey: 'K2', baseUrl: 'http://y' }));
    var c2 = T.getAiConfig();
    assert(c2 && c2.apiKey === 'K2', '裸键回退失败');
    window.localStorage.removeItem(LS_KEY_AI_BARE);
  });

  // R72-6：群 tab 管理员视图只读（role=admin-view 不挂 imOpenGroup）
  check('R72_group_admin_view_readonly', function(){
    var box = document.getElementById('imList');
    S.isAdmin = true; S._groupsFetched = true;
    S.groups = [{ id: 5, name: 'R72群', avatar: '', role: 'admin-view', memberCount: 2, unreadCount: 0, lastMessage: null }];
    T.renderGroupsTab(box);
    assert(box.innerHTML.indexOf('管理员视图 · 只读') !== -1, '管理员视图缺「管理员视图 · 只读」标题');
    assert(box.innerHTML.indexOf('imOpenGroup(5)') === -1, '管理员视图行不应挂 imOpenGroup 入口');
    S.isAdmin = false;
    S.groups = [{ id: 5, name: 'R72群', avatar: '', role: 'member', memberCount: 2, unreadCount: 0, lastMessage: null }];
    T.renderGroupsTab(box);
    assert(box.innerHTML.indexOf('imOpenGroup(5)') !== -1, '普通成员群行应保留 imOpenGroup 入口');
  });

  // R72-7：备注编辑器为页内弹窗，禁用原生 prompt/confirm/alert
  check('R72_remark_editor_no_native', function(){
    var nativeUsed = false;
    var op = window.prompt, oc = window.confirm, oa = window.alert;
    window.prompt = function(){ nativeUsed = true; return null; };
    window.confirm = function(){ nativeUsed = true; return false; };
    window.alert = function(){ nativeUsed = true; };
    try {
      window.imOpenRemarkEditor(7, '张三');
      var ov = document.getElementById('imRemarkModal');
      assert(!!ov, '备注弹窗未创建');
      assert(!!document.getElementById('imRemarkInput'), '备注输入框缺失');
      assert(!nativeUsed, '禁止使用原生 prompt/confirm/alert');
      window.imCloseRemarkEditor();
      assert(!document.getElementById('imRemarkModal'), '关闭后应移除弹窗');
    } finally {
      window.prompt = op; window.confirm = oc; window.alert = oa;
    }
  });

  window.__R72T1_SYNC = R.join('\\n');
})();
`;

function mustEval(code, label) {
  try { w.eval(code); }
  catch (e) { results.push('FAIL ' + label + ' :: EVAL_THROW ' + e.message); }
}
function assert(name, cond, detail) {
  results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : (' :: ' + detail)));
}

// 1) eval chat-local.js + 同步用例
mustEval(chatjs + '\n' + syncHarness, 'sync');
const syncOut = w.__R72T1_SYNC || 'FAIL sync :: no output';
syncOut.split('\n').forEach(function (l) { if (l) results.push(l); });

const T = w.__IM_TEST__;

// 2) 相位 A：loadChats 优先请求 /api/chat/conversations 并重建（Node 侧可控成功响应）
__fetchStub = function (url) {
  if (String(url).indexOf('/api/chat/conversations') !== -1) {
    return Promise.resolve({ ok: true, status: 200, json: function () {
      return Promise.resolve({ items: [
        { peerId: 9, peerNickname: '王五', peerAvatar: '', peerRemark: '小五', unreadCount: 1,
          updatedAt: '2026-09-17 12:00:00',
          lastMessage: { id: 600, kind: 'text', content: 'hi', createdAt: '2026-09-17 12:00:00' } }
      ] });
    } });
  }
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ items: [] }); } });
};
__nodeCalls.length = 0;
mustEval('(function(){ var S=window.__IM_TEST__.S; S.chats=[]; window.__IM_TEST__.loadChats(); })();', 'phaseA');

setTimeout(function () {
  assert('R72_loadChats_requests_conversations_endpoint',
    __nodeCalls.some(function (u) { return u.indexOf('/api/chat/conversations') !== -1; }),
    'called=' + __nodeCalls.join(','));
  var rows = (T.S.chats || []).filter(function (x) { return x.serverId === 9; });
  assert('R72_loadChats_row_from_conversations',
    rows.length === 1 && rows[0].peerRemark === '小五' && rows[0].unread === 1 && rows[0].last === 'hi',
    'rows=' + rows.length);

  // 3) 相位 B：接口不可用 → 离线兜底不抛、仍有本地/AI 会话
  __fetchStub = function () { return Promise.reject(new Error('offline')); };
  mustEval('(function(){ var S=window.__IM_TEST__.S; S.chats=[]; window.__IM_TEST__.loadChats(); })();', 'phaseB');
  setTimeout(function () {
    var chats = T.S.chats || [];
    assert('R72_loadChats_offline_fallback_keeps_local',
      chats.length > 0 && chats.some(function (x) { return !x.isServer; }),
      'len=' + chats.length);

    const out = results.join('\n');
    console.log(out);
    fs.writeFileSync(path.join(ROOT, 'tools/verifier/_r72t1_out.txt'), out + '\n');
    process.exit(results.some(function (l) { return l.indexOf('FAIL') === 0 || l.indexOf('\nFAIL') !== -1; }) ? 1 : 0);
  }, 220);
}, 90);
