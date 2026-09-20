/* =====================================================================
   tools/qa/_r44_frontend_check.js · R44 前端修复静态 + 行为自查
   ---------------------------------------------------------------------
   只读校验，不改项目源文件。结果写入 tools/qa/_r44_frontend_check.log
   （本环境 stdout 不可见，一律落盘后 Read）。

   覆盖工单 5 条验收：
     ① loadChats 重建前后保留/合并 isServer 会话（静态 + 行为）
     ② getOrCreateChat / imSendText 写入含 isServer / serverId（行为 + 静态）
     ③ 未读轮询比较统一用 Number()（静态）
     ④ admin-contact.js 404 / 401 / 5xx 各自分支 + 各自文案（静态）
     ⑤ S.adminId 赋值不再是「无条件下清零」（静态）
   ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var LOG = [];
var pass = 0;
var fail = 0;

function L(s) { LOG.push(s); }
function ok(name, cond, extra) {
  if (cond) { pass++; L('  [PASS] ' + name); }
  else { fail++; L('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
  if (extra && cond) L('         ' + extra);
}

var chatSrc = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
var acSrc = fs.readFileSync(path.join(ROOT, 'assets', 'admin-contact.js'), 'utf8');

/* ---------------- 工具：按函数名抽取源码（花括号配平） ---------------- */
function extractFn(src, name) {
  var idx = src.indexOf('function ' + name + '(');
  if (idx < 0) return null;
  var start = src.indexOf('{', idx);
  if (start < 0) return null;
  var depth = 0, i = start;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(idx, i + 1); }
  }
  return null;
}

L('=== R44 前端修复自查 ' + new Date().toISOString() + ' ===');
L('');

/* ================= ① loadChats 保留 / 合并动态会话 ================= */
L('[①] loadChats 重建前后保留 / 合并 isServer 会话');

var loadChatsSrc = extractFn(chatSrc, 'loadChats');
ok('能抽取到 loadChats 源码', !!loadChatsSrc);
ok('①-静态 存在内存态动态会话快照变量 prevServerChats',
  !!loadChatsSrc && loadChatsSrc.indexOf('prevServerChats') >= 0);
// 注意：注释里也提到过 `S.chats = allFriends.map(...)`，这里必须用「真实代码行」做针，
// 否则会命中注释导致假阴性。
ok('①-静态 快照在重建语句 S.chats = allFriends.map 之前取值',
  !!loadChatsSrc &&
  loadChatsSrc.indexOf('var prevServerChats') >= 0 &&
  loadChatsSrc.indexOf('var prevServerChats') < loadChatsSrc.indexOf('S.chats = allFriends.map(function (f) {'));
ok('①-静态 重建后按 serverId 去重合并（Number 比较）',
  !!loadChatsSrc && loadChatsSrc.indexOf('Number(S.chats[i].serverId) === Number(c.serverId)') >= 0);

/* 行为测试：把 loadChats 放进沙箱跑一遍 */
if (loadChatsSrc) {
  var getFriendStub = function () { return undefined; };
  var factory = new Function(
    'loadData', 'getActiveAiFriends', 'SERVER_FRIENDS', 'S', 'renderList',
    loadChatsSrc + '\n return loadChats;'
  );

  // 场景 1：最坏情况 —— 内存里有动态会话，但 data.chats 完全没持久化（老版本裸场景）
  var store1 = { chats: {}, messages: {} };
  var S1 = {
    chats: [{ id: 10007, serverId: 7, isServer: true, nickname: '用户7', avatar: '', last: '你好', unread: 0, time: 1234 }]
  };
  var rendered1 = 0;
  var loadChats1 = factory(
    function () { return store1; },
    function () { return []; },          // 无 AI 好友
    [],                                   // 无服务器好友
    S1,
    function () { rendered1++; }
  );
  loadChats1();
  var kept1 = S1.chats.filter(function (c) { return Number(c.serverId) === 7; });
  ok('①-行为 无持久化时，动态会话在 loadChats() 后仍在列表里',
    kept1.length === 1, 'S.chats.length=' + S1.chats.length + ' matched=' + kept1.length);

  // 场景 2：持久化里已有同一 peer → 不能出现重复行
  var store2 = { chats: { 10007: { id: 10007, serverId: 7, isServer: true, nickname: '用户7', avatar: '', last: '持久化', unread: 0, time: 999 } }, messages: {} };
  var S2 = {
    chats: [{ id: 10007, serverId: 7, isServer: true, nickname: '用户7', avatar: '', last: '内存里更新的', unread: 0, time: 5555 }]
  };
  var loadChats2 = factory(
    function () { return store2; }, function () { return []; }, [], S2, function () { }
  );
  loadChats2();
  var dup2 = S2.chats.filter(function (c) { return Number(c.serverId) === 7; });
  ok('①-行为 持久化 + 内存态同 peer 时不产生重复行',
    dup2.length === 1, 'matched=' + dup2.length);
  ok('①-行为 合并时取较新的 time / last（内存态 5555 > 持久化 999）',
    dup2.length === 1 && dup2[0].time === 5555 && dup2[0].last === '内存里更新的',
    dup2.length ? ('time=' + dup2[0].time + ' last=' + dup2[0].last) : 'n/a');

  // 场景 3：普通本地会话（非 isServer）不应被快照逻辑污染
  var store3 = { chats: { 1: { id: 1, nickname: 'AI', last: '', unread: 0, time: 5 } }, messages: {} };
  var S3 = { chats: [{ id: 1, nickname: 'AI', last: '', unread: 0, time: 5 }] };
  var loadChats3 = factory(
    function () { return store3; },
    function () { return [{ id: 1, nickname: 'AI', avatar: '', motto: '', time: 5 }]; },
    [], S3, function () { }
  );
  loadChats3();
  ok('①-行为 非 isServer 会话不受影响（仍为 1 条）', S3.chats.length === 1, 'len=' + S3.chats.length);
} else {
  ok('①-行为 可执行（依赖抽取成功）', false, 'loadChats 抽取失败');
}

L('');

/* ================= ② 持久化形状统一 ================= */
L('[②] getOrCreateChat / imSendText 写入含 isServer / serverId');

var gocSrc = extractFn(chatSrc, 'getOrCreateChat');
ok('能抽取到 getOrCreateChat 源码', !!gocSrc);
if (gocSrc) {
  var gocFactory = new Function('loadData', 'saveData', 'getFriend', gocSrc + '\n return getOrCreateChat;');
  var st = { chats: {}, messages: {} };
  var goc = gocFactory(
    function () { return st; },
    function (d) { st = d; },
    function (id) { return { id: id, serverId: 42, isServer: true, nickname: '用户42', avatar: '', motto: 'hi' }; }
  );
  var rec = goc(10042);
  ok('②-行为 getOrCreateChat 写入 isServer', rec && rec.isServer === true, JSON.stringify(rec));
  ok('②-行为 getOrCreateChat 写入 serverId', rec && Number(rec.serverId) === 42, JSON.stringify(rec));

  // 老裸记录补齐场景
  var st2 = { chats: { 10043: { id: 10043, nickname: '用户43', last: '', unread: 0, time: 1 } }, messages: {} };
  var goc2 = gocFactory(
    function () { return st2; },
    function (d) { st2 = d; },
    function (id) { return { id: id, serverId: 43, isServer: true, nickname: '用户43', avatar: '', motto: '' }; }
  );
  var rec2 = goc2(10043);
  ok('②-行为 老「裸记录」被补齐 isServer/serverId',
    rec2 && rec2.isServer === true && Number(rec2.serverId) === 43, JSON.stringify(rec2));
}

var sendSrc = extractFn(chatSrc, 'imSendText') || (function () {
  // imSendText 是 window.imSendText = function () {...} 形式
  var idx = chatSrc.indexOf('window.imSendText = function');
  if (idx < 0) return null;
  var start = chatSrc.indexOf('{', idx);
  var depth = 0, i = start;
  for (; i < chatSrc.length; i++) {
    if (chatSrc[i] === '{') depth++;
    else if (chatSrc[i] === '}') { depth--; if (depth === 0) return chatSrc.slice(idx, i + 1); }
  }
  return null;
})();
ok('能抽取到 imSendText 源码', !!sendSrc);
ok('②-静态 imSendText 写入 data.chats[...].isServer = true',
  !!sendSrc && sendSrc.indexOf('isServer = true') >= 0);
ok('②-静态 imSendText 写入 data.chats[...].serverId = Number(S.peer.serverId)',
  !!sendSrc && sendSrc.indexOf('serverId = Number(S.peer.serverId)') >= 0);

var voiceSrc = extractFn(chatSrc, 'sendVoiceLocal');
ok('②-静态 sendVoiceLocal 同样补齐 isServer/serverId（同类路径一致性）',
  !!voiceSrc && voiceSrc.indexOf('isServer = true') >= 0 && voiceSrc.indexOf('serverId = Number(S.peer.serverId)') >= 0);

L('');

/* ================= ③ Number() 比较统一 ================= */
L('[③] 未读轮询比较统一用 Number()');
ok('③-静态 S.chats.find 用 Number(c.serverId) === Number(item.peerId)',
  chatSrc.indexOf('Number(c.serverId) === Number(item.peerId)') >= 0);
ok('③-静态 已读清零用 Number(x.peerId) === Number(c.serverId)',
  chatSrc.indexOf('Number(x.peerId) === Number(c.serverId)') >= 0);
// 同样用「完整旧表达式」做针：注释里引用过旧写法片段，短针会命中注释。
ok('③-静态 旧写法 c.isServer && c.serverId === item.peerId 已不存在',
  chatSrc.indexOf('c.isServer && c.serverId === item.peerId') < 0);
ok('③-静态 旧写法 x.peerId === c.serverId 已不存在',
  chatSrc.indexOf('x.peerId === c.serverId') < 0);
ok('③-静态 已读清零处不再出现未转换的 peerId 比较',
  !/c\.isServer\s+&&\s+!items\.some\(function \(x\) \{ return x\.peerId === /.test(chatSrc));
ok('③-静态 adminPeer 不再直接读裸 S.isAdmin（旧写法已移除）',
  chatSrc.indexOf('(!S.isAdmin && imCachedAdminId()') < 0);
ok('③-静态 adminPeer 改为「角色已落地 && 是管理员」才不抑制',
  chatSrc.indexOf('!(S.roleResolved && S.isAdmin)') >= 0);
ok('③-静态 adminPeer 保留 myId 兜底（不抑制自己）',
  chatSrc.indexOf('Number(item.peerId) !== Number(S.myId)') >= 0);
ok('③-静态 S 初始化含 roleResolved: false',
  chatSrc.indexOf('isAdmin: false, roleResolved: false') >= 0);
// 用正则忽略换行符差异（CRLF/LF），避免缩进/行尾导致的假阴性
ok('③-静态 .finally 中先置 S.roleResolved = true 再调用 imResolveAdminId()（顺序正确）',
  /S\.roleResolved = true;\s*imResolveAdminId\(\);/.test(chatSrc));
ok('③-静态 未登录分支也标记 roleResolved',
  chatSrc.indexOf('S.roleResolved = true;   // R44：未登录分支没有角色可查') >= 0);
ok('③-静态 /api/auth/me 失败不再静默（有 console.warn）',
  chatSrc.indexOf('S.isAdmin 保持未知') >= 0);
ok('③-静态 imResolveAdminId 已挪到 /api/auth/me 的 .finally 之后执行',
  chatSrc.indexOf('imResolveAdminId();\n        // 加载服务器好友后再渲染会话') >= 0 ||
  chatSrc.indexOf('imResolveAdminId();') > chatSrc.indexOf('S.isAdmin 保持未知'));

L('');

/* ================= ④ admin-contact.js 错误分流 ================= */
L('[④] admin-contact.js 404 / 401 / 5xx 各自分支');
ok('④-静态 404 分支', acSrc.indexOf("r.status === 404") >= 0);
ok('④-静态 401/403 分支', acSrc.indexOf('r.status === 401 || r.status === 403') >= 0);
ok('④-静态 5xx 分支', acSrc.indexOf('r.status >= 500') >= 0);
ok('④-静态 文案·该功能暂未开放（服务端未更新）', acSrc.indexOf('该功能暂未开放（服务端未更新）') >= 0);
ok('④-静态 文案·登录已失效，请重新登录', acSrc.indexOf('登录已失效，请重新登录') >= 0);
ok('④-静态 文案·服务异常，请稍后重试', acSrc.indexOf('服务异常，请稍后重试') >= 0);
ok('④-静态 文案·联系管理员失败，请稍后重试（网络兜底）', acSrc.indexOf('联系管理员失败，请稍后重试') >= 0);
ok('④-静态 错误码 → 文案映射表存在', acSrc.indexOf('var ERR_TEXT = {') >= 0);
ok('④-静态 失败原因有可观测日志', acSrc.indexOf('[admin-contact] 解析管理员 id 失败') >= 0);

L('');

/* ================= ⑤ S.adminId 不清零 + 退避 ================= */
L('[⑤] S.adminId 失败不清零 + 轮询退避');
// 用整行锚定：注释里引用过 `S.adminId = id || 0;`，普通 indexOf 会命中注释。
ok('⑤-静态 旧的 S.adminId = id || 0 已移除（整行锚定，排除注释引用）',
  !/^\s*S\.adminId = id \|\| 0;\s*$/m.test(acSrc));
ok('⑤-静态 改为「只有有效 id 才赋值」',
  (acSrc.match(/if \(id\) S\.adminId = id;/g) || []).length >= 2,
  '出现次数=' + (acSrc.match(/if \(id\) S\.adminId = id;/g) || []).length);
ok('⑤-静态 退避档位 5s → 15s → 60s', acSrc.indexOf('var BADGE_BACKOFF = [5000, 15000, 60000];') >= 0);
ok('⑤-静态 失败计数 + 复位', acSrc.indexOf('badgeFails = (hit < 0) ? (badgeFails + 1) : 0;') >= 0);
// 只针对「角标轮询」：文件里仍有 openPanel 的 10s 消息轮询 setInterval（那是预期保留的）。
ok('⑤-静态 角标轮询已改为 setTimeout 自调度（不再是固定 5s setInterval）',
  acSrc.indexOf('badgeTimer = setInterval') < 0 && acSrc.indexOf('badgeTimer = setTimeout') >= 0);
ok('⑤-静态 面板内 10s 消息轮询保留（未误伤）',
  acSrc.indexOf('S.timer = setInterval') >= 0);
ok('⑤-静态 refreshEntryBadge 失败返回 -1 供退避计数', acSrc.indexOf('return -1;') >= 0);

L('');
L('=== 结果：PASS=' + pass + '  FAIL=' + fail + ' ===');
L(fail === 0 ? 'IS_PASS: YES' : 'IS_PASS: NO');

var out = path.join(ROOT, 'tools', 'qa', '_r44_frontend_check.log');
fs.writeFileSync(out, LOG.join('\n') + '\n', 'utf8');
