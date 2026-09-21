/**
 * tools/qa/r73/apply_r73_edits2.js
 * R73 追加项补丁：
 *   ① 会话切换竞态守卫（fetchPeerMsgs / fetchGroupMsgs 丢弃迟到响应 + 退出会话重置分页）
 *   ② 需求18③ 备注昵称入口（聊天头部「✎」按钮，复用 imOpenRemarkEditor；保存后刷新头部 + 列表）
 *   ③ __IM_TEST__ 追加测试钩子
 *
 * 铁律：CRLF 保持。utf8 读写（CR/LF 为单字节 ASCII，往返字节保真）。每处断言恰好命中 1 次。
 * 运行：node tools/qa/r73/apply_r73_edits2.js
 */
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..', '..', '..');
var CL = path.join(ROOT, 'assets', 'chat-local.js');
function j(arr) { return arr.join('\r\n'); }

var edits = [];

/* ①-1 fetchPeerMsgs 记录 want + 回调首行守卫 */
edits.push({
  desc: 'fetchPeerMsgs 会话切换守卫',
  old: j([
    "  function fetchPeerMsgs(silent) {",
    "    if (!S.peer || !S.peer.isServer || !getToken()) return;",
    "    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      var items = d.items || [];"
  ]),
  neu: j([
    "  function fetchPeerMsgs(silent) {",
    "    if (!S.peer || !S.peer.isServer || !getToken()) return;",
    "    var want = S.peer.serverId; // R73 需求19孪生：记录本次请求的目标会话（防快速切换串会话）",
    "    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      /* R73（2026-09-15）：快速连点两个好友时，先发起的响应可能后到；",
    "         若此时已切走会话，直接丢弃，避免「头部显示 B、消息列表却是 A」。 */",
    "      if (!S.peer || S.peer.serverId !== want) return;",
    "      var items = d.items || [];"
  ])
});

/* ①-2 fetchGroupMsgs 记录 want + 回调首行守卫 */
edits.push({
  desc: 'fetchGroupMsgs 会话切换守卫',
  old: j([
    "  function fetchGroupMsgs(silent) {",
    "    if (!S.group || !getToken()) return;",
    "    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      var list = (d.items || []).map(function (m) {"
  ]),
  neu: j([
    "  function fetchGroupMsgs(silent) {",
    "    if (!S.group || !getToken()) return;",
    "    var want = S.group.id; // R73 需求19孪生：记录目标群（防快速切换串会话）",
    "    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      if (!S.group || S.group.id !== want) return; // R73：切走后丢弃迟到响应",
    "      var list = (d.items || []).map(function (m) {"
  ])
});

/* ①-3 backToList（退出会话）重置分页状态 */
edits.push({
  desc: 'backToList 退出会话重置分页状态',
  old: j([
    "    S.group = null; // T4 增量：退出群会话状态",
    "    xtSetChatUser(null); // R60：离开会话 → 清掉当前会话对象"
  ]),
  neu: j([
    "    S.group = null; // T4 增量：退出群会话状态",
    "    imResetMsgPaging(); // R73 需求19：退出会话一并重置分页 / 签名状态",
    "    xtSetChatUser(null); // R60：离开会话 → 清掉当前会话对象"
  ])
});

/* ②-1 备注入口函数（置于 renderChatHeader 之前） */
edits.push({
  desc: '新增 imEnsureRemarkBtn / imOpenRemarkForCurrentChat',
  old: j([
    "  function renderChatHeader() {",
    "    var avEl = $id('imCAv');"
  ]),
  neu: j([
    "  /* R73 需求18③（2026-09-15）：普通用户可达的备注入口（聊天头部「✎」按钮）。",
    "     复用既有 imOpenRemarkEditor，不另写弹窗；保存后由 imSaveRemark 刷新头部 + 列表。 */",
    "  function imEnsureRemarkBtn(show) {",
    "    var nameEl = $id('imCName');",
    "    if (!nameEl || !nameEl.parentNode) return;",
    "    var btn = $id('imRemarkBtn');",
    "    if (!show) { if (btn) btn.style.display = 'none'; return; }",
    "    if (!btn) {",
    "      btn = document.createElement('button');",
    "      btn.id = 'imRemarkBtn';",
    "      btn.className = 'im-icon';",
    "      btn.type = 'button';",
    "      btn.title = '设置备注';",
    "      btn.textContent = '✎';",
    "      btn.onclick = function () { imOpenRemarkForCurrentChat(); };",
    "      nameEl.parentNode.insertBefore(btn, nameEl.nextSibling);",
    "    }",
    "    btn.style.display = 'block';",
    "  }",
    "  function imOpenRemarkForCurrentChat() {",
    "    if (S.group) return;                                   // 群聊无备注",
    "    if (!S.peer || !S.peer.isServer) { toast('仅服务器好友支持设置备注'); return; }",
    "    window.imOpenRemarkEditor(S.peer.serverId, S.peer.nickname || '');",
    "  }",
    "",
    "  function renderChatHeader() {",
    "    var avEl = $id('imCAv');"
  ])
});

/* ②-2 群分支隐藏备注入口 */
edits.push({
  desc: 'renderChatHeader 群分支隐藏备注入口',
  old: j([
    "      var backBtn = $id('imBack');",
    "      if (backBtn) backBtn.style.display = window.innerWidth <= 760 ? 'block' : 'none';",
    "      return;",
    "    }",
    "    if (avEl) avEl.innerHTML = renderAvatar(S.peer.avatar, S.peer.nickname);"
  ]),
  neu: j([
    "      var backBtn = $id('imBack');",
    "      if (backBtn) backBtn.style.display = window.innerWidth <= 760 ? 'block' : 'none';",
    "      imEnsureRemarkBtn(false); // R73 需求18③：群聊不显示备注入口",
    "      return;",
    "    }",
    "    if (avEl) avEl.innerHTML = renderAvatar(S.peer.avatar, S.peer.nickname);"
  ])
});

/* ②-3 私聊分支：标题按备注名渲染 + 显示备注入口 */
edits.push({
  desc: 'renderChatHeader 私聊标题用备注名 + 显示备注入口',
  old: j([
    "      nameEl.innerHTML = esc(S.peer.nickname) + tag;",
    "    }",
    "    // T02 增量：私聊会话隐藏「⋯」群设置入口",
    "    var gsBtnP = $id('imGSBtn');",
    "    if (gsBtnP) gsBtnP.style.display = 'none';"
  ]),
  neu: j([
    "      /* R73 需求18③：头部标题按「备注名（原名）」渲染，保存备注后即时反映。 */",
    "      var dispName = (S.peer && S.peer.isServer)",
    "        ? imDisplayName(imRemarkOf(S.peer.serverId), S.peer.nickname)",
    "        : S.peer.nickname;",
    "      nameEl.innerHTML = esc(dispName) + tag;",
    "    }",
    "    imEnsureRemarkBtn(!!(S.peer && S.peer.isServer)); // R73 需求18③：服务器好友显示「✎」备注入口",
    "    // T02 增量：私聊会话隐藏「⋯」群设置入口",
    "    var gsBtnP = $id('imGSBtn');",
    "    if (gsBtnP) gsBtnP.style.display = 'none';"
  ])
});

/* ②-4 保存后即时刷新头部 + 列表 */
edits.push({
  desc: 'imSaveRemark.done 保存后刷新头部 + 列表',
  old: j([
    "    var done = function (remark) {",
    "      imApplyRemarkLocal(uid, remark);",
    "      window.imCloseRemarkEditor();",
    "      toast(remark ? '✅ 备注已保存' : '✅ 已清除备注');",
    "      if (S.tab === 'friends' && !S.isAdmin) renderFriends($id('imList'));",
    "      loadChats();",
    "    };"
  ]),
  neu: j([
    "    var done = function (remark) {",
    "      imApplyRemarkLocal(uid, remark);",
    "      window.imCloseRemarkEditor();",
    "      toast(remark ? '✅ 备注已保存' : '✅ 已清除备注');",
    "      /* R73 需求18③：保存后即时刷新头部标题 + 会话列表条目（loadChats 为异步，先同步刷一遍） */",
    "      if (!S.group && S.peer && S.peer.isServer && Number(S.peer.serverId) === uid) renderChatHeader();",
    "      if (S.tab === 'chats') renderList();",
    "      if (S.tab === 'friends' && !S.isAdmin) renderFriends($id('imList'));",
    "      loadChats();",
    "    };"
  ])
});

/* ③ __IM_TEST__ 追加钩子 */
edits.push({
  desc: '__IM_TEST__ 追加守卫/备注 钩子',
  old: j([
    "    getLastMsgsSig: function () { return lastMsgsSig; },",
    "    getAiConfig: getAiConfig",
    "  };"
  ]),
  neu: j([
    "    getLastMsgsSig: function () { return lastMsgsSig; },",
    "    /* R73 追加（2026-09-15）：会话切换守卫 / 备注入口 校验钩子（仅测试引用） */",
    "    fetchPeerMsgs: fetchPeerMsgs,",
    "    fetchGroupMsgs: fetchGroupMsgs,",
    "    renderChatHeader: renderChatHeader,",
    "    imEnsureRemarkBtn: imEnsureRemarkBtn,",
    "    getAiConfig: getAiConfig",
    "  };"
  ])
});

/* ==================== 应用 ==================== */
var report = [];
var cache = fs.readFileSync(CL, 'utf8');
var okAll = true;
edits.forEach(function (ed, i) {
  var parts = cache.split(ed.old);
  var cnt = parts.length - 1;
  if (cnt !== 1) { okAll = false; report.push('EDIT#' + i + ' ' + ed.desc + ' → 命中 ' + cnt + ' 次（期望 1）✗'); return; }
  cache = parts.join(ed.neu);
  report.push('EDIT#' + i + ' ' + ed.desc + ' → 命中 1 次 ✓');
});
if (!okAll) {
  report.push('!! 有替换未命中，未写文件');
  fs.writeFileSync(path.join(__dirname, '_apply2_report.txt'), report.join('\n'));
  process.exit(1);
}
fs.writeFileSync(CL, cache, 'utf8');
var s = fs.readFileSync(CL, 'utf8');
var cr = (s.match(/\r/g) || []).length, lf = (s.match(/\n/g) || []).length;
report.push('LINEEND chat-local.js CR=' + cr + ' LF=' + lf + (cr === lf ? ' ✓' : ' ✗'));
report.push('DONE');
fs.writeFileSync(path.join(__dirname, '_apply2_report.txt'), report.join('\n'));
process.exit(0);
