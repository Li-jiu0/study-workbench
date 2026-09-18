/**
 * tools/qa/r73/apply_r73_edits.js
 * R73 需求3（图片全屏预览）+ 需求19（历史记录滚动被重置）补丁应用脚本。
 *
 * 铁律：assets/chat-local.js 与 assets/admin-contact.js 全 CRLF。
 * 本脚本以 latin1（字节级）读入 → 字符串替换（行数组用 '\r\n' 拼接）→ latin1 写回，
 * 保证 CR 数 == LF 数不被破坏。每一处替换都断言「恰好命中 1 次」，否则报错不写文件。
 *
 * 运行：node tools/qa/r73/apply_r73_edits.js
 */
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..', '..');
var CL = path.join(ROOT, 'assets', 'chat-local.js');
var AC = path.join(ROOT, 'assets', 'admin-contact.js');

function j(arr) { return arr.join('\r\n'); }

var edits = [];

/* ============ A. renderMsgs：重建前记录滚动位置（需求19） ============ */
edits.push({
  file: CL, desc: 'renderMsgs 记录 prevTop/prevH/atBottom',
  old: j([
    "    var key = imThreadKey();",
    "    box.innerHTML = S.msgs.map(function (m) {"
  ]),
  neu: j([
    "    var key = imThreadKey();",
    "    /* R73 需求19（2026-09-15）：整表重建前先记录滚动位置，重建后据「贴底与否」决定回滚策略，",
    "       避免 2s 轮询 / 服务端回包每次把用户从历史翻阅处甩回底部。 */",
    "    var prevTop = box.scrollTop;",
    "    var prevH = box.scrollHeight;",
    "    var atBottom = (prevH - prevTop - box.clientHeight) < 24;",
    "    box.innerHTML = S.msgs.map(function (m) {"
  ])
});

/* ============ B. renderMsgs：按高度差补偿 scrollTop（需求19） ============ */
edits.push({
  file: CL, desc: 'renderMsgs 恢复/补偿 scrollTop（替换无条件回底）',
  old: j([
    "    }).join('');",
    "    box.scrollTop = box.scrollHeight;",
    "  }"
  ]),
  neu: j([
    "    }).join('');",
    "    /* R73 需求19：贴底时保持贴底（原行为不变）；否则按重建前后的高度差平移 scrollTop，保住可视位置。",
    "       「向上加载更多」prepend 更早历史后，prevTop 较小 → atBottom=false → scrollTop 自动加上新增长度，视口不跳动。 */",
    "    if (atBottom) {",
    "      box.scrollTop = box.scrollHeight;",
    "    } else {",
    "      box.scrollTop = prevTop + (box.scrollHeight - prevH);",
    "    }",
    "  }"
  ])
});

/* ============ C. 拉取主干：签名早退 + 合并更早历史 + 加载更多（需求3/19） ============ */
edits.push({
  file: CL, desc: 'fetchPeerMsgs/fetchGroupMsgs 签名早退 + 合并历史 + 新增分页加载',
  old: j([
    "  // —— 会话消息拉取（轮询主干；拉取即已读，后端 markRead 默认开启） ——",
    "  function fetchPeerMsgs(silent) {",
    "    if (!S.peer || !S.peer.isServer || !getToken()) return;",
    "    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      var items = d.items || [];",
    "      if (!items.length && silent) return;",
    "      var hadTyping = !!document.getElementById('typingIndicator');",
    "      S.msgs = items.map(function (m) {",
    "        return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };",
    "      });",
    "      if (hadTyping) return; // AI 正在输入时不整表重绘",
    "      renderMsgs();",
    "      if (!silent) renderList();",
    "    })",
    "    .catch(function () { /* 离线静默：保留本地消息 */ });",
    "  }",
    "",
    "  function fetchGroupMsgs(silent) {",
    "    if (!S.group || !getToken()) return;",
    "    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      S.msgs = (d.items || []).map(function (m) {",
    "        return { id: m.id, senderId: m.senderId, senderNickname: m.senderNickname, senderAvatar: m.senderAvatar, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true };",
    "      });",
    "      S.group.memberCount = S.group.memberCount || 0;",
    "      renderMsgs();",
    "      if (!silent) renderList();",
    "    })",
    "    .catch(function () { /* 离线静默 */ });",
    "  }"
  ]),
  neu: j([
    "  /* R73 需求19（2026-09-15）：消息列表快照签名 —— id 序列 + 条数 + 发送者 + kind + 已读 + content 首尾。",
    "     轮询结果与上次渲染完全一致时早退，消掉「每 2s 无条件整表重建」",
    "     （既是需求19 滚动被回滚的帮凶，也是需求3 图片气泡被反复 detach 的竞态主因）。 */",
    "  function imMsgsSig(list) {",
    "    var arr = list || [];",
    "    var out = 'n' + arr.length;",
    "    for (var i = 0; i < arr.length; i++) {",
    "      var m = arr[i] || {};",
    "      var c = String(m.content == null ? '' : m.content);",
    "      out += '#' + m.id + ':' + m.senderId + ':' + m.kind + ':' + (m.read ? 1 : 0) + ':' + c.length + ':' + c.slice(0, 16) + ':' + c.slice(-16);",
    "    }",
    "    return out;",
    "  }",
    "",
    "  /* R73 需求19：服务端只返回最新 50 条 —— 把本地已 prepend 的更早历史（id 更小）保留下来，",
    "     否则「向上加载更多」拉回的旧消息会被下一轮轮询抹掉。id 游标天然有序，无重叠。 */",
    "  function imMergeOlderMsgs(cur, fresh) {",
    "    fresh = fresh || [];",
    "    var oldest = fresh.length ? Number(fresh[0].id) : 0;",
    "    if (!oldest) return fresh;",
    "    var older = [];",
    "    for (var i = 0; i < (cur || []).length; i++) {",
    "      var m = cur[i];",
    "      var mid = Number(m && m.id);",
    "      if (mid && mid < oldest) older.push(m);",
    "    }",
    "    return older.length ? older.concat(fresh) : fresh;",
    "  }",
    "",
    "  var lastMsgsSig = '';        // 当前会话消息列表快照签名（无变化 → 不整表重建）",
    "  var imHasMore = false;       // 当前会话是否还有更早历史（服务端 hasMore）",
    "  var imLoadingMore = false;   // 「向上加载更多」在途标志（同一时刻只允许一个请求）",
    "",
    "  /* 切换会话时重置分页 / 签名状态（避免上一会话残留影响新会话） */",
    "  function imResetMsgPaging() { lastMsgsSig = ''; imHasMore = false; imLoadingMore = false; }",
    "",
    "  /* 加载更多（需求19 最后一公里）：滚动到顶且 hasMore 为真时，用 id 游标向前翻页。",
    "     ⚠️ 必须显式 mark_read=0：chat.py 的 mark_read 默认为 1（拉取即已读），",
    "     向上翻历史页若按默认会把「更早的一页」当成最新页推进已读水位线，造成未读丢失。 */",
    "  function imLoadMoreMsgs() {",
    "    if (imLoadingMore || !imHasMore) return;",
    "    if (!S.msgs || !S.msgs.length) return;",
    "    if (!getToken()) return;",
    "    var firstId = Number(S.msgs[0].id);",
    "    if (!firstId) return;",
    "    var url, mapper;",
    "    if (S.group) {",
    "      url = apiBase() + '/api/groups/' + S.group.id + '/messages?before_id=' + firstId + '&limit=30&mark_read=0';",
    "      mapper = function (m) { return { id: m.id, senderId: m.senderId, senderNickname: m.senderNickname, senderAvatar: m.senderAvatar, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true }; };",
    "    } else if (S.peer && S.peer.isServer) {",
    "      url = apiBase() + '/api/chat/' + S.peer.serverId + '/messages?before_id=' + firstId + '&limit=30&mark_read=0';",
    "      mapper = function (m) { return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read }; };",
    "    } else {",
    "      return;",
    "    }",
    "    imLoadingMore = true;",
    "    fetch(url, { headers: { 'Authorization': 'Bearer ' + getToken() } })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      var items = (d && d.items) || [];",
    "      var known = {};",
    "      for (var i = 0; i < S.msgs.length; i++) known[String(S.msgs[i].id)] = true;",
    "      var older = items.map(mapper).filter(function (m) { return !known[String(m.id)]; });",
    "      imHasMore = !!(d && d.hasMore);",
    "      if (older.length) {",
    "        S.msgs = older.concat(S.msgs); // prepend 更早历史",
    "        renderMsgs();                  // renderMsgs 内按高度差补偿 scrollTop → 视口不跳动",
    "        lastMsgsSig = (S.group ? 'g' + S.group.id : 'p' + (S.peer ? S.peer.serverId : 0)) + '|' + imMsgsSig(S.msgs);",
    "      }",
    "      imLoadingMore = false;",
    "    })",
    "    .catch(function () { imLoadingMore = false; /* 失败静默：下次滚动到顶再试 */ });",
    "  }",
    "",
    "  // —— 会话消息拉取（轮询主干；拉取即已读，后端 mark_read 默认开启） ——",
    "  function fetchPeerMsgs(silent) {",
    "    if (!S.peer || !S.peer.isServer || !getToken()) return;",
    "    fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      var items = d.items || [];",
    "      if (!items.length && silent) return;",
    "      var list = items.map(function (m) {",
    "        return { id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read };",
    "      });",
    "      // 保留已 prepend 的更早历史，避免被「最新 50 条」覆盖",
    "      var merged = imMergeOlderMsgs(S.msgs, list);",
    "      imHasMore = !!d.hasMore;",
    "      var hadTyping = !!document.getElementById('typingIndicator');",
    "      if (hadTyping) { S.msgs = merged; return; } // AI 正在输入时不整表重绘",
    "      var sig = 'p' + S.peer.serverId + '|' + imMsgsSig(merged);",
    "      if (sig === lastMsgsSig) return;            // 无变化：不重建 → 保住 scrollTop（需求19）",
    "      lastMsgsSig = sig;",
    "      S.msgs = merged;",
    "      renderMsgs();",
    "      if (!silent) renderList();",
    "    })",
    "    .catch(function () { /* 离线静默：保留本地消息 */ });",
    "  }",
    "",
    "  function fetchGroupMsgs(silent) {",
    "    if (!S.group || !getToken()) return;",
    "    fetch(apiBase() + '/api/groups/' + S.group.id + '/messages?limit=50&markRead=1', {",
    "      headers: { 'Authorization': 'Bearer ' + getToken() }",
    "    })",
    "    .then(function (r) { return r.json(); })",
    "    .then(function (d) {",
    "      var list = (d.items || []).map(function (m) {",
    "        return { id: m.id, senderId: m.senderId, senderNickname: m.senderNickname, senderAvatar: m.senderAvatar, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true };",
    "      });",
    "      var merged = imMergeOlderMsgs(S.msgs, list);",
    "      imHasMore = !!d.hasMore;",
    "      var sig = 'g' + S.group.id + '|' + imMsgsSig(merged);",
    "      if (sig === lastMsgsSig) return; // 无变化：不重建",
    "      lastMsgsSig = sig;",
    "      S.msgs = merged;",
    "      S.group.memberCount = S.group.memberCount || 0;",
    "      renderMsgs();",
    "      if (!silent) renderList();",
    "    })",
    "    .catch(function () { /* 离线静默 */ });",
    "  }"
  ])
});

/* ============ D. renderChats：会话列表滚动位置保存/恢复（需求19） ============ */
edits.push({
  file: CL, desc: 'renderChats 保存/恢复列表 scrollTop',
  old: j([
    "    box.innerHTML = groupHtml + chatHtml;"
  ]),
  neu: j([
    "    /* R73 需求19：会话列表同缺陷 —— innerHTML 重建会重置滚动位置，先记后恢复（避免轮询时列表弹回顶部）。 */",
    "    var prevListTop = box.scrollTop;",
    "    box.innerHTML = groupHtml + chatHtml;",
    "    box.scrollTop = prevListTop;"
  ])
});

/* ============ E. imRecallPressStart：图片气泡不参与长按（需求3 次因） ============ */
edits.push({
  file: CL, desc: 'imRecallPressStart 命中 img 时不启动长按',
  old: j([
    "  window.imRecallPressStart = function (id, e, el) {",
    "    imClearPress();"
  ]),
  neu: j([
    "  window.imRecallPressStart = function (id, e, el) {",
    "    /* R73 需求3（2026-09-15）：图片气泡不参与长按菜单 —— 否则慢点一下会被吞成「撤回/删除本端」菜单",
    "       而非打开图片预览（需求3 的次因）。命中 img 直接不启动长按计时。 */",
    "    if (e && e.target && String(e.target.tagName || '').toUpperCase() === 'IMG') return;",
    "    imClearPress();"
  ])
});

/* ============ F. imPreviewImage → 单例查看器（需求3 主修） ============ */
edits.push({
  file: CL, desc: 'imPreviewImage 重写为单例缩放查看器',
  old: j([
    "  // 点击图片气泡 → 全屏预览（点任意处关闭）",
    "  window.imPreviewImage = function (src) {",
    "    if (!src) return;",
    "    var ov = document.createElement('div');",
    "    ov.className = 'im-img-preview';",
    "    ov.innerHTML = '<img src=\"' + esc(src) + '\" alt=\"图片预览\">';",
    "    ov.onclick = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };",
    "    document.body.appendChild(ov);",
    "  };"
  ]),
  neu: j([
    "  /* R73 需求3（2026-09-15）：图片全屏预览 —— 单例查看器（重写）。",
    "     旧实现每次点击都新建浮层 + 「点任意处关闭」，且没有放大/缩小/✕/Esc（用户诉求「无法放大查看」）。",
    "     现改为：只创建一次浮层节点并复用；✕ 按钮 / Esc 键 / 点击背景三种方式关闭；",
    "     点击图片本体不关闭（避免与拖动平移冲突）；＋/－ 按钮 + 滚轮 + 双击缩放（0.5×–4×）；",
    "     放大后可鼠标/触摸拖动平移。全部 ES2017 祖先语法（var/function），样式随脚本在 boot() 注入。 */",
    "  var _IV = null; // 单例查看器状态：{ ov, img, scale, tx, ty, dragging }",
    "  function imClosePreview() {",
    "    if (_IV && _IV.ov && _IV.ov.parentNode) _IV.ov.parentNode.removeChild(_IV.ov);",
    "  }",
    "  window.imClosePreview = imClosePreview;",
    "",
    "  function imPreviewImage(src) {",
    "    if (!src) return;",
    "    if (!_IV) imIvBuild();",
    "    _IV.img.setAttribute('src', src);",
    "    _IV.scale = 1; _IV.tx = 0; _IV.ty = 0; _IV.applyT();",
    "    if (!_IV.ov.parentNode) document.body.appendChild(_IV.ov);",
    "  }",
    "  window.imPreviewImage = imPreviewImage;",
    "",
    "  function imIvBuild() {",
    "    var ov = document.createElement('div');",
    "    ov.className = 'im-img-preview im-iv';",
    "    ov.innerHTML = '<div class=\"im-iv-tools\">' +",
    "      '<span class=\"im-iv-btn\" data-act=\"out\">－</span>' +",
    "      '<span class=\"im-iv-btn\" data-act=\"in\">＋</span>' +",
    "      '<span class=\"im-iv-btn\" data-act=\"close\">✕</span>' +",
    "      '</div>' +",
    "      '<img class=\"im-iv-img\" alt=\"图片预览\">';",
    "    var img = ov.querySelector('.im-iv-img');",
    "    var st = { ov: ov, img: img, scale: 1, tx: 0, ty: 0, dragging: false, sx: 0, sy: 0 };",
    "    st.applyT = function () {",
    "      img.style.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.scale + ')';",
    "      if (st.scale > 1.001) ov.classList.add('im-iv-zoomed');",
    "      else ov.classList.remove('im-iv-zoomed');",
    "    };",
    "    st.setScale = function (next) {",
    "      var s = Math.max(0.5, Math.min(4, next));",
    "      if (s === st.scale) return;",
    "      st.scale = s;",
    "      if (s <= 1.001) { st.tx = 0; st.ty = 0; }",
    "      st.applyT();",
    "    };",
    "    // ＋ / － / ✕ 工具条",
    "    ov.querySelector('.im-iv-tools').addEventListener('click', function (e) {",
    "      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();",
    "      var t = e && e.target;",
    "      var act = (t && t.getAttribute) ? t.getAttribute('data-act') : '';",
    "      if (act === 'in') st.setScale(st.scale * 1.25);",
    "      else if (act === 'out') st.setScale(st.scale / 1.25);",
    "      else if (act === 'close') imClosePreview();",
    "    });",
    "    // 点击背景关闭；点图片本体不关闭",
    "    ov.addEventListener('click', function (e) { if (e.target === ov) imClosePreview(); });",
    "    // 滚轮缩放",
    "    ov.addEventListener('wheel', function (e) {",
    "      if (e && typeof e.preventDefault === 'function') e.preventDefault();",
    "      st.setScale((e && e.deltaY > 0) ? st.scale / 1.15 : st.scale * 1.15);",
    "    }, { passive: false });",
    "    // 双击在 1× / 2× 间切换",
    "    img.addEventListener('dblclick', function (e) {",
    "      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();",
    "      st.setScale(st.scale > 1.001 ? 1 : 2);",
    "    });",
    "    // 鼠标拖动平移（仅放大后）",
    "    img.addEventListener('mousedown', function (e) {",
    "      if (st.scale <= 1.001) return;",
    "      st.dragging = true; st.sx = e.clientX - st.tx; st.sy = e.clientY - st.ty;",
    "      if (typeof e.preventDefault === 'function') e.preventDefault();",
    "    });",
    "    document.addEventListener('mousemove', function (e) {",
    "      if (!st.dragging) return;",
    "      st.tx = e.clientX - st.sx; st.ty = e.clientY - st.sy; st.applyT();",
    "    });",
    "    document.addEventListener('mouseup', function () { st.dragging = false; });",
    "    // 触摸拖动平移",
    "    img.addEventListener('touchstart', function (e) {",
    "      if (st.scale <= 1.001 || !e.touches || !e.touches.length) return;",
    "      st.dragging = true; st.sx = e.touches[0].clientX - st.tx; st.sy = e.touches[0].clientY - st.ty;",
    "    }, { passive: true });",
    "    img.addEventListener('touchmove', function (e) {",
    "      if (!st.dragging || !e.touches || !e.touches.length) return;",
    "      st.tx = e.touches[0].clientX - st.sx; st.ty = e.touches[0].clientY - st.sy; st.applyT();",
    "      if (typeof e.preventDefault === 'function') e.preventDefault();",
    "    }, { passive: false });",
    "    img.addEventListener('touchend', function () { st.dragging = false; });",
    "    // 键盘：Esc 关闭，＋/－ 缩放",
    "    document.addEventListener('keydown', function (e) {",
    "      if (!_IV || !_IV.ov || !_IV.ov.parentNode) return;",
    "      var k = e && e.key;",
    "      if (k === 'Escape' || k === 'Esc') imClosePreview();",
    "      else if (k === '+' || k === '=') st.setScale(st.scale * 1.25);",
    "      else if (k === '-') st.setScale(st.scale / 1.25);",
    "    });",
    "    _IV = st;",
    "  }"
  ])
});

/* ============ G. boot()：查看器样式（随脚本注入） ============ */
edits.push({
  file: CL, desc: 'boot() 注入单例查看器样式',
  old: j([
    "      '.im-img-preview img{max-width:100%;max-height:100%;border-radius:8px}' +"
  ]),
  neu: j([
    "      '.im-img-preview img{max-width:100%;max-height:100%;border-radius:8px}' +",
    "      /* R73 需求3（2026-09-15）：单例图片查看器（缩放 + 工具条）。样式随脚本注入，不改 common.css。 */",
    "      '.im-img-preview.im-iv{padding:0;overflow:hidden;touch-action:none}' +",
    "      '.im-img-preview .im-iv-img{max-width:96vw;max-height:88vh;border-radius:8px;transform-origin:center center;transition:transform .12s ease;will-change:transform;user-select:none;-webkit-user-select:none;touch-action:none}' +",
    "      '.im-iv-zoomed .im-iv-img{cursor:grab;transition:none}' +",
    "      '.im-iv-zoomed .im-iv-img:active{cursor:grabbing}' +",
    "      '.im-iv-tools{position:absolute;top:16px;right:16px;display:flex;gap:10px;z-index:2}' +",
    "      '.im-iv-btn{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;cursor:pointer;user-select:none;-webkit-user-select:none}' +",
    "      '.im-iv-btn:active{background:rgba(255,255,255,.34)}' +"
  ])
});

/* ============ H. boot()：消息区一次性事件委托（滚动加载 + 图片点击）（需求3/19） ============ */
edits.push({
  file: CL, desc: 'boot() 绑定 #imMsgs scroll + click 委托',
  old: j([
    "    // 批次二 需求2：会话列表左滑 / 右键操作（事件委托，只绑一次）",
    "    imBindSwipeGestures();"
  ]),
  neu: j([
    "    // 批次二 需求2：会话列表左滑 / 右键操作（事件委托，只绑一次）",
    "    imBindSwipeGestures();",
    "",
    "    /* R73 需求19/3（2026-09-15）：消息区只绑一次的两类监听（事件委托，innerHTML 重建不影响）。",
    "       (1) 向上滚动到顶 → 加载更早历史；",
    "       (2) 点击图片气泡 → 打开单例查看器（此前仅靠内联 onclick，重建竞态下移动端会丢合成 click）。 */",
    "    var msgsBox = $id('imMsgs');",
    "    if (msgsBox) {",
    "      msgsBox.addEventListener('scroll', function () {",
    "        if (msgsBox.scrollTop < 48) imLoadMoreMsgs();",
    "      });",
    "      msgsBox.addEventListener('click', function (e) {",
    "        var t = e && e.target;",
    "        if (!t || !t.tagName) return;",
    "        if (String(t.tagName).toUpperCase() !== 'IMG') return;",
    "        if (!t.className || String(t.className).indexOf('im-img') < 0) return;",
    "        var s = t.getAttribute('src');",
    "        if (s) imPreviewImage(s);",
    "      });",
    "    }"
  ])
});

/* ============ I. imOpenChat：切换会话重置分页状态 + 记录 hasMore ============ */
edits.push({
  file: CL, desc: 'imOpenChat 重置分页状态',
  old: j([
    "    S.peer = friend;",
    "    // R60：告诉 app.js 当前会话对象（本地/AI 好友没有 serverId → null，避免误报）"
  ]),
  neu: j([
    "    S.peer = friend;",
    "    imResetMsgPaging(); // R73 需求19：切换会话重置分页 / 签名状态",
    "    // R60：告诉 app.js 当前会话对象（本地/AI 好友没有 serverId → null，避免误报）"
  ])
});

edits.push({
  file: CL, desc: 'imOpenChat 首屏拉取记录 hasMore',
  old: j([
    "      .then(function (d) {",
    "        var items = d.items || [];",
    "        if (items.length > 0) {"
  ]),
  neu: j([
    "      .then(function (d) {",
    "        var items = d.items || [];",
    "        imHasMore = !!d.hasMore; // R73 需求19：记录是否还有更早历史，供滚动加载更多",
    "        if (items.length > 0) {"
  ])
});

/* ============ J. imOpenGroup：切换会话重置分页状态 ============ */
edits.push({
  file: CL, desc: 'imOpenGroup 重置分页状态',
  old: j([
    "    renderChatHeader();",
    "    S.msgs = [];",
    "    renderMsgs();",
    "    renderList();",
    "    fetchGroupMsgs(false);"
  ]),
  neu: j([
    "    renderChatHeader();",
    "    imResetMsgPaging(); // R73 需求19：切换会话重置分页 / 签名状态",
    "    S.msgs = [];",
    "    renderMsgs();",
    "    renderList();",
    "    fetchGroupMsgs(false);"
  ])
});

/* ============ K. __IM_TEST__ 钩子同步更新 ============ */
edits.push({
  file: CL, desc: '__IM_TEST__ 新增查看器/分页/签名钩子',
  old: j([
    "    imOfflineFallback: imOfflineFallback,",
    "    getAiConfig: getAiConfig",
    "  };"
  ]),
  neu: j([
    "    imOfflineFallback: imOfflineFallback,",
    "    /* R73 需求3/19（2026-09-15）：图片查看器 / 分页加载 / 消息快照签名 校验钩子（仅测试引用） */",
    "    imClosePreview: window.imClosePreview,",
    "    imPreviewImageFn: imPreviewImage,",
    "    getPreviewEl: function () { return _IV ? _IV.ov : null; },",
    "    imLoadMoreMsgs: imLoadMoreMsgs,",
    "    imMsgsSig: imMsgsSig,",
    "    imMergeOlderMsgs: imMergeOlderMsgs,",
    "    getImHasMore: function () { return imHasMore; },",
    "    setImHasMore: function (v) { imHasMore = !!v; },",
    "    getLastMsgsSig: function () { return lastMsgsSig; },",
    "    getAiConfig: getAiConfig",
    "  };"
  ])
});

/* ============ L. admin-contact.js：renderMsgs 滚动补偿（需求19 同源） ============ */
edits.push({
  file: AC, desc: 'admin-contact renderMsgs 保存/恢复 scrollTop',
  old: j([
    "    box.innerHTML = html;",
    "    box.scrollTop = box.scrollHeight;"
  ]),
  neu: j([
    "    /* R73 需求19（2026-09-15）：同源缺陷 —— 重建前记录位置；贴底才保持贴底，否则按高度差补偿，",
    "       避免 2s 轮询 / 拉取把用户从历史翻阅处甩回底部。 */",
    "    var prevTop = box.scrollTop;",
    "    var prevH = box.scrollHeight;",
    "    var atBottom = (prevH - prevTop - box.clientHeight) < 24;",
    "    box.innerHTML = html;",
    "    if (atBottom) box.scrollTop = box.scrollHeight;",
    "    else box.scrollTop = prevTop + (box.scrollHeight - prevH);"
  ])
});

/* ==================== 应用 ==================== */
var report = [];
var cache = {};
[CL, AC].forEach(function (f) { cache[f] = fs.readFileSync(f, 'utf8'); });

var okAll = true;
edits.forEach(function (ed, idx) {
  var src = cache[ed.file];
  var parts = src.split(ed.old);
  var cnt = parts.length - 1;
  if (cnt !== 1) {
    okAll = false;
    report.push('EDIT#' + idx + ' [' + path.basename(ed.file) + '] ' + ed.desc + ' → 命中 ' + cnt + ' 次（期望 1）✗');
    return;
  }
  cache[ed.file] = parts.join(ed.neu);
  report.push('EDIT#' + idx + ' [' + path.basename(ed.file) + '] ' + ed.desc + ' → 命中 1 次 ✓');
});

if (!okAll) {
  report.push('');
  report.push('!! 有替换未命中，未写任何文件（保持不变）');
  fs.writeFileSync(path.join(__dirname, '_apply_report.txt'), report.join('\n'));
  process.exit(1);
}

fs.writeFileSync(CL, cache[CL], 'utf8');
fs.writeFileSync(AC, cache[AC], 'utf8');

// 写回后校验行尾
[CL, AC].forEach(function (f) {
  var s = fs.readFileSync(f, 'utf8');
  var cr = (s.match(/\r/g) || []).length;
  var lf = (s.match(/\n/g) || []).length;
  report.push('LINEEND ' + path.basename(f) + ' CR=' + cr + ' LF=' + lf + (cr === lf ? ' ✓' : ' ✗ 行尾被破坏'));
});

report.push('');
report.push('DONE');
fs.writeFileSync(path.join(__dirname, '_apply_report.txt'), report.join('\n'));
process.exit(0);
