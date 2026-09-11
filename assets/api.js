/* =====================================================================
   多人在线版覆盖层（assets/api.js）
   ---------------------------------------------------------------------
   本文件必须在 assets/app.js 之后加载（tools/inject-api.js 已注入除 登录.html 外的所有页面）。
   作用：把「用户 / 学习博客 / AI」原本读写 localStorage 的函数，
        原地重定义为调用 FastAPI 后端（server/，默认 http://110.42.134.62:8000）。
   其余学习模块（词汇 / 行测 / 错题本……）仍走本地 localStorage，互不影响。
   鉴权：JWT（登录后存 localStorage key: study_workbench_token，
        另写一个 study_workbench_auth 标记供 app.js 顶部登录门禁使用）。
   ===================================================================== */

/* ---------- 基础：API 地址 / token / 请求封装 ---------- */
window.API_BASE = (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : 'http://110.42.134.62:8000'));
var API_TOKEN_KEY = 'study_workbench_token';
var API_REFRESH_KEY = 'study_workbench_refresh';   // 长时效 refresh 令牌，仅在 access 过期时换新
var API_AI_MODEL_KEY = 'study_workbench_ai_model';

function apiGetToken() { return localStorage.getItem(API_TOKEN_KEY) || ''; }
function apiRefreshToken() { return localStorage.getItem(API_REFRESH_KEY) || ''; }
function apiFileUrl(u) { return (!u || /^(https?:|data:)/.test(u)) ? u : (window.API_BASE + u); }

/* ---- 静默续期：用 refresh 换新 access（成功即一起轮换 refresh）。并发 401 共享同一次刷新 ---- */
var _refreshBusy = null;
function _doRefresh() {
  var rt = apiRefreshToken();
  if (!rt) return Promise.resolve(false);
  return fetch(window.API_BASE + '/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: rt })
  }).then(function (res) {
    return res.json().then(function (d) { return { ok: res.ok, data: d }; });
  }).then(function (r) {
    if (!r.ok || !r.data || !r.data.token) return false;
    localStorage.setItem(API_TOKEN_KEY, r.data.token);
    if (r.data.refreshToken) localStorage.setItem(API_REFRESH_KEY, r.data.refreshToken);
    localStorage.setItem('study_workbench_auth', '1');
    return true;
  }).catch(function () { return false; });
}
function apiTryRefresh() {
  if (!_refreshBusy) {
    _refreshBusy = _doRefresh().then(function (ok) { _refreshBusy = null; return ok; });
  }
  return _refreshBusy;
}

async function api(path, opts) {
  opts = opts || {};
  var headers = Object.assign({}, opts.headers || {});
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  var t = apiGetToken(); if (t) headers['Authorization'] = 'Bearer ' + t;
  var res = await fetch(window.API_BASE + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body instanceof FormData ? opts.body : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined)
  });
  if (res.status === 401 && !opts._retried) {
    // access 过期：静默刷新一次再重放；刷新失败才强制登出
    if (await apiTryRefresh()) { opts._retried = true; return api(path, opts); }
    apiForceLogout();
    throw new Error('登录已过期，请重新登录');
  }
  var data = null;
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) throw new Error((data && data.detail) || ('HTTP ' + res.status));
  return data;
}
/* 带鉴权的原生 fetch（供 SSE 流式 AI 接口用）：401 时静默刷新一次并重试 */
async function apiAuthedFetch(path, init) {
  init = init || {};
  init.headers = Object.assign({}, init.headers || {});
  var t = apiGetToken(); if (t) init.headers['Authorization'] = 'Bearer ' + t;
  if (init.body && !(init.body instanceof FormData) && !init.headers['Content-Type']) {
    init.headers['Content-Type'] = 'application/json';
  }
  var res = await fetch(window.API_BASE + path, init);
  if (res.status === 401) {
    if (await apiTryRefresh()) {
      var t2 = apiGetToken(); if (t2) init.headers['Authorization'] = 'Bearer ' + t2;
      return fetch(window.API_BASE + path, init);
    }
    apiForceLogout();
    throw new Error('登录已过期，请重新登录');
  }
  return res;
}
function apiForceLogout() {
  localStorage.removeItem(API_TOKEN_KEY);
  localStorage.removeItem(API_REFRESH_KEY);
  localStorage.removeItem('study_workbench_auth');
  location.replace('登录.html');
}

/* ---------- 主页导航（在线互动入口） ---------- */
function isOnlineSession() { return !!(apiGetToken() || apiRefreshToken()); }
function gotoChat() {
  if (!isOnlineSession()) {
    if (typeof showToast === 'function') showToast('💬 好友私信是在线功能：请先启动后端并用账号在线登录');
    setTimeout(function () { location.href = '登录.html'; }, 900);
    return;
  }
  location.href = '私聊.html';
}
function gotoBlogMine() { location.href = '学习博客.html#mine'; }
function renderHomeOnlineNav() {
  var el = document.getElementById('homeOnlineNav'); if (!el) return;
  if (!isOnlineSession()) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 2px">' +
    '<span style="font-size:13px;font-weight:700;color:var(--text);display:inline-flex;align-items:center;gap:4px">💬 在线互动</span>' +
    '<span style="font-size:11px;color:var(--text-secondary)">多人在线（好友私信 / 博客 / AI）</span></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<a class="chip" href="私聊.html" style="text-decoration:none">💬 好友私信</a>' +
    '<a class="chip" href="学习博客.html#mine" style="text-decoration:none">🗂️ 我的发贴·回收站</a>' +
    '<a class="chip" href="学习博客.html#favorite" style="text-decoration:none">🔖 我的收藏</a>' +
    '<a class="chip" href="学习博客.html" style="text-decoration:none">🌍 广场</a>' +
    '</div>';
}

/* ---------- 当前登录用户（服务端资料，替代 appData.profile） ---------- */
var CURRENT_USER = null; // {id, username, nickname, motto, avatarUrl, stats:{...}, unread}
async function loadCurrentUser() {
  CURRENT_USER = await api('/api/auth/me');
  updateProfileUI();
  renderNotifyBadge();
  return CURRENT_USER;
}

/* ---------- 个人中心：侧栏头像 / 页面渲染（含他人公开主页） ---------- */
function updateProfileUI() {
  var u = CURRENT_USER; if (!u) return;
  var av = document.querySelector('.user-card .user-avatar');
  if (av) {
    if (u.avatarUrl) av.innerHTML = '<img src="' + apiFileUrl(u.avatarUrl) + '" alt="头像">';
    else av.textContent = (u.nickname || u.username || '学').slice(0, 1);
  }
  var nm = document.querySelector('.user-card .user-name'); if (nm) nm.textContent = u.nickname || u.username;
}

async function renderProfilePage() {
  var box = document.getElementById('profileBox'); if (!box) return;
  var params = new URLSearchParams(location.search);
  var otherId = params.get('user');
  if (otherId && CURRENT_USER && Number(otherId) !== CURRENT_USER.id) { renderUserHome(Number(otherId), box); return; }
  var u = CURRENT_USER; if (!u) return;
  var s = u.stats || {};
  var catCount = s.catCount || {};
  var maxCat = Math.max(1, ...Object.values(catCount));
  var catBars = BLOG_CATS.filter(function (c) { return catCount[c.id]; }).map(function (c) {
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="width:110px;font-size:12px;color:var(--text-secondary)">' + c.icon + ' ' + c.name + '</span>' +
      '<div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:' + Math.round(catCount[c.id] / maxCat * 100) + '%;background:linear-gradient(90deg,' + noteColors(c.id)[0] + ',' + noteColors(c.id)[1] + ')"></div></div>' +
      '<span style="width:60px;font-size:12px;color:var(--text-secondary)">' + catCount[c.id] + ' 篇</span></div>';
  }).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有发贴，去「学习博客 → ✍️ 写发贴」试试吧</div>';
  box.innerHTML = `
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">👤</span>个人资料</div><div class="card-action">@${esc(u.username)}</div></div>
      <div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">
        <div class="profile-avatar-lg">${u.avatarUrl ? '<img src="' + apiFileUrl(u.avatarUrl) + '" alt="头像">' : esc((u.nickname || '学').slice(0, 1))}</div>
        <div style="flex:1;min-width:180px"><div style="font-size:18px;font-weight:800;color:var(--text)">${esc(u.nickname)}</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${esc(u.motto || '')}</div></div>
        <button class="btn btn-outline" onclick="editProfile()">✏️ 编辑资料</button>
        <button class="btn btn-danger" onclick="doLogout()">🚪 退出登录</button>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">✅ 多用户在线版：资料保存在服务器数据库；头像为文件上传（不再 base64 入库）。</div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>发贴统计</div></div>
      <div class="profile-grid">
        ${[['📝', s.published || 0, '已发布'], ['💾', s.draft || 0, '草稿'], ['📁', s.archived || 0, '已归档'], ['👍', s.likes || 0, '总点赞'], ['💬', s.comments || 0, '总评论'], ['👁', s.views || 0, '总阅读']].map(function (x) {
          return '<div class="profile-stat"><div class="ps-num">' + x[0] + ' ' + x[1] + '</div><div class="ps-label">' + x[2] + '</div></div>';
        }).join('')}
      </div>
      <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 发贴分类分布</div>${catBars}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>
        <button class="btn btn-outline" onclick="navigateTo('blog')">📝 去写发贴</button>
      </div>
    </div>`;
}

/* 他人公开主页：只展示对方公开发贴（草稿 / 私密 / 归档服务端一律不返回） */
async function renderUserHome(userId, box) {
  box.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">加载中…</div>';
  var u;
  try { u = await api('/api/users/' + userId); }
  catch (e) { box.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--text-secondary)">⚠️ ' + esc(e.message) + '</div>'; return; }
  if (u.isMe) { location.replace('个人中心.html'); return; }
  // 好友关系：优先消费服务端 /api/users/{id} 已计算好的 isFriend 字段；
  // 仅当其缺失时才回退查询 /api/friends，并兼容 {items:[...]} 与裸数组两种返回结构
  // （旧实现误用 f.user.id，且未处理对象返回，导致一直是 false —— A4）。
  var isFriend = (typeof u.isFriend === 'boolean') ? u.isFriend : false;
  if (typeof u.isFriend !== 'boolean') {
    try {
      var fr = await api('/api/friends');
      var list = Array.isArray(fr) ? fr : (fr && Array.isArray(fr.items) ? fr.items : []);
      isFriend = list.some(function(f) { return Number(f.id) === Number(userId); });
    } catch(e) { /* 关系未知时按「非好友」渲染，避免误显删除按钮 */ }
  }
  var cards = u.notes.map(function (n) { return noteCardHtml(n); }).join('') ||
    '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);font-size:13px">TA 还没有公开发贴</div>';
  var actionBtns = '<button class="btn btn-outline" onclick="location.href=' + "'个人中心.html'" + '">← 回我的主页</button>';
  if (isFriend) {
    actionBtns += ' <button class="btn btn-outline" onclick="chatWithUser(' + userId + ',\'' + esc(u.nickname) + '\')">💬 发消息</button>';
    actionBtns += ' <button class="btn btn-danger" onclick="removeFriend(' + userId + ',\'' + esc(u.nickname) + '\')">🗑 删除好友</button>';
  } else {
    actionBtns += ' <button class="btn btn-primary" onclick="addFriend(' + userId + ')">👤 加为好友</button>';
  }
  var s = u.stats || {};
  
  box.innerHTML =
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">👤</span>TA 的主页</div><div class="card-action">公开发贴 ' + u.notes.length + ' 篇</div></div>' +
      '<div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">' +
        '<div class="profile-avatar-lg">' + (u.avatarUrl ? '<img src="' + apiFileUrl(u.avatarUrl) + '" alt="头像">' : esc((u.nickname || '学').slice(0, 1))) + '</div>' +
        '<div style="flex:1;min-width:180px">' +
          '<div style="font-size:18px;font-weight:800;color:var(--text)">' + esc(u.nickname) + '</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">' + esc(u.motto || '这个人很懒，什么都没写~') + '</div>' +
          (u.bio ? '<div style="font-size:13px;color:var(--text);margin-top:6px;line-height:1.6">' + esc(u.bio) + '</div>' : '') +
          _profileMeta(u.gender, u.birthday, u.city) +
          (u.createdAt ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">📅 加入于 ' + esc(String(u.createdAt).slice(0, 10)) + '</div>' : '') +
          _tagChips(u.tags) + _goalLine(u.goal) +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + actionBtns + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">🔒 出于隐私保护：性别 / 生日不对外展示；草稿、私密、归档发贴不可见。</div>' +
    '</div>' +

    // ===== 创作数据（服务端可核算；学习时长等本机数据不对外） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>创作数据</div></div>' +
    '<div class="profile-grid">' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">📝 ' + (s.published || 0) + '</div><div class="ps-label">公开发贴</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">👍 ' + (s.likes || 0) + '</div><div class="ps-label">获赞</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">👁 ' + (s.views || 0) + '</div><div class="ps-label">总阅读</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">💬 ' + (s.comments || 0) + '</div><div class="ps-label">获评论</div></div>' +
    '</div></div>' +

    // ===== 成就徽章墙（按公开创作数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">🏅</span>TA 的成就</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🌱</div><div style="font-size:12px;margin-top:4px">初学者</div></div>' +
    ((s.published || 0) >= 1 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">✍️</div><div style="font-size:12px;margin-top:4px">处女作</div></div>' : '') +
    ((s.published || 0) >= 5 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">📚</div><div style="font-size:12px;margin-top:4px">勤于笔耕</div></div>' : '') +
    ((s.likes || 0) >= 10 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">👍</div><div style="font-size:12px;margin-top:4px">人气博主</div></div>' : '') +
    '</div></div>' +
    
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">🗒️</span>公开发贴</div></div>' +
      '<div class="blog-grid">' + cards + '</div>' +
    '</div>';
}
async function addFriend(userId) {
  try {
    await api('/api/friends/requests', { method: 'POST', body: { toUserId: userId } });
    showToast('📨 好友请求已发送');
  } catch(e) { showToast('⚠️ ' + e.message); }
}
async function removeFriend(userId, name) {
  if (!await uiConfirm('确定要删除好友「' + name + '」吗？')) return;
  try {
    await api('/api/friends/' + userId, { method: 'DELETE' });
    showToast('🗑 已删除好友');
    renderUserHome(userId, document.getElementById('profileBox'));
  } catch(e) { showToast('⚠️ ' + e.message); }
}
function chatWithUser(userId, name) {
  location.href = '私聊.html?uid=' + userId + '&name=' + encodeURIComponent(name);
}
function openUserHome(uid) {
  if (document.getElementById('page-profile')) { location.href = '个人中心.html?user=' + uid; }
  else location.href = '个人中心.html?user=' + uid;
}

/* ---------- 编辑资料弹窗（头像走服务器文件上传） ---------- */
var apiAvatarTemp = null; // 已上传头像的服务器 URL；null = 默认（避免与 app.js 顶层 let apiAvatarTemp 冲突）
function editProfile() {
  var m = document.getElementById('profileEditModal'); if (!m || !CURRENT_USER) return;
  document.getElementById('peName').value = CURRENT_USER.nickname || '';
  document.getElementById('peMotto').value = CURRENT_USER.motto || '';
  apiAvatarTemp = CURRENT_USER.avatarUrl || null;
  renderPeAvatarPreview();
  m.classList.add('active');
}
function renderPeAvatarPreview() {
  var el = document.getElementById('peAvatarPreview'); if (!el) return;
  var u = CURRENT_USER || {};
  if (apiAvatarTemp && /^(https?:|\/uploads\/|data:)/.test(apiAvatarTemp)) el.innerHTML = '<img src="' + apiFileUrl(apiAvatarTemp) + '" alt="头像预览">';
  else el.textContent = ((u.nickname || u.username || '学') || '学').slice(0, 1);
}
async function onProfileAvatarFile(input) {
  var file = input.files && input.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) { showToast('⚠️ 请选择图片文件'); input.value = ''; return; }
  if (file.size > 8 * 1024 * 1024) { showToast('⚠️ 图片超过 8MB'); input.value = ''; return; }
  showToast('📷 上传中…');
  var fd = new FormData(); fd.append('file', file);
  try {
    var r = await api('/api/users/me/avatar', { method: 'POST', body: fd });
    apiAvatarTemp = r.avatarUrl;      // 上传成功即写入服务器（文件存 uploads/avatars/）
    renderPeAvatarPreview();
    showToast('📷 头像已上传，点「保存」更新资料');
  } catch (e) { showToast('⚠️ 上传失败：' + e.message); }
  input.value = '';
}
async function resetProfileAvatar() {
  try { await api('/api/users/me/avatar', { method: 'DELETE' }); } catch (e) { showToast('⚠️ ' + e.message); return; }
  apiAvatarTemp = null;
  renderPeAvatarPreview();
  showToast('↩️ 已恢复默认头像');
}
async function saveProfileEditor() {
  var nickname = document.getElementById('peName').value.trim();
  var motto = document.getElementById('peMotto').value.trim();
  try {
    await api('/api/users/me', { method: 'PUT', body: { nickname: nickname, motto: motto } });
    await loadCurrentUser();
    closeProfileEditor();
    renderProfilePage();
    showToast('👤 个人资料已更新');
  } catch (e) { showToast('⚠️ 保存失败：' + e.message); }
}
function closeProfileEditor() {
  var m = document.getElementById('profileEditModal'); if (m) m.classList.remove('active');
}

/* ---------- 退出登录（清 JWT，弹窗确认逻辑沿用） ---------- */
function doLogout() {
  var m = document.getElementById('logoutConfirmModal');
  if (m) { m.classList.add('active'); return; }
  if (!confirm('确定要退出登录吗？')) return;
  apiForceLogout();
}
function closeLogoutConfirm() {
  var m = document.getElementById('logoutConfirmModal'); if (m) m.classList.remove('active');
}
function confirmLogout() { closeLogoutConfirm(); apiForceLogout(); }

/* ---------- 发贴卡片（增加作者行 / 修正评论计数） ---------- */
function noteCardHtml(n, opts) {
  opts = opts || {};
  var cat = noteCat(n.category);
  var tags = (n.tags || []).map(function (t) {
    return '<span class="nc-tag" onclick="event.stopPropagation();blogTagFilter=\'' + esc(t) + '\';showBlogView(\'list\')">#' + esc(t) + '</span>';
  }).join('');
  var cmt = (n.commentsCount != null) ? n.commentsCount : ((n.comments || []).length);
  var stats = '<span>👁 ' + (n.views || 0) + '</span><span>👍 ' + (n.likes || 0) + '</span><span>💬 ' + cmt + '</span>';
  var author = '';
  if (n.author && (!CURRENT_USER || n.author.id !== CURRENT_USER.id)) {
    var avUrl = n.author.avatarUrl ? apiFileUrl(n.author.avatarUrl) : '';
    var avHtml = avUrl
      ? '<img src="' + avUrl + '" style="width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;cursor:pointer" onclick="event.stopPropagation();openUserHome(' + n.author.id + ')">'
      : '<span style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + n.author.id + ')">👤 </span>';
    author = '<span onclick="event.stopPropagation();openUserHome(' + n.author.id + ')" style="cursor:pointer">' + avHtml + esc(n.author.nickname) + '</span>';
  }
  var acts = '';
  if (opts.mine) {
    var arch = n.status === 'archived';
    acts = '<div class="nc-actions" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">' +
      '<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();startEditNote(' + n.id + ')">✏️ 编辑</button>' +
      '<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();' + (arch ? 'unarchiveNote' : 'archiveNote') + '(' + n.id + ')">' + (arch ? '📤 恢复' : '📁 归档') + '</button>' +
      '<button class="btn btn-danger" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();deleteNote(' + n.id + ')">🗑️ 删除</button></div>';
  }
  return '<div class="note-card" onclick="openBlogDetail(' + n.id + ')">' +
    noteCoverHtml(n) +
    '<div class="note-body">' +
    '<div class="nc-title">' + esc(n.title) + '</div>' +
    '<div class="nc-excerpt">' + esc(n.excerpt) + '</div>' +
    '<div class="nc-meta"><span class="nc-cat">' + cat.icon + ' ' + cat.name + '</span>' + author + '<span>' + fmtTime(n.createdAt) + '</span></div>' +
    (tags ? '<div class="nc-tags">' + tags + '</div>' : '') +
    '<div class="nc-actions">' + stats + '</div>' + acts +
    '</div></div>';
}

/* ---------- 广场 / 我的文章 ---------- */
var blogFeed = { list: [], page: 0, hasMore: true, loading: false };
var blogObs = null;
async function renderBlogList(reset) {
  if (reset === undefined) reset = true;
  renderBlogFilters();
  var grid = document.getElementById('blogGrid'); if (!grid) return;
  var kw = (document.getElementById('blogSearchInput').value || '').trim();
  var params = new URLSearchParams();
  if (blogCatFilter !== 'all') params.set('category', blogCatFilter);
  if (blogTagFilter) params.set('tag', blogTagFilter);
  if (kw) params.set('q', kw);
  if (reset) blogFeed = { list: [], page: 0, hasMore: true, loading: false };
  if (blogFeed.loading) return;
  blogFeed.loading = true;
  try {
    params.set('page', String(blogFeed.page + 1)); params.set('page_size', '20');
    var d = await api('/api/notes?scope=plaza&' + params.toString());
    blogFeed.page += 1;
    blogFeed.hasMore = d.hasMore;
    blogFeed.list = reset ? (d.items || []) : blogFeed.list.concat(d.items || []);
    var html = blogFeed.list.map(function (n) { return noteCardHtml(n); }).join('');
    if (blogFeed.hasMore) html += '<div id="blogSentinel" style="grid-column:1/-1;text-align:center;padding:16px;color:var(--text-secondary);font-size:13px">加载更多…</div>';
    grid.innerHTML = html;
    var empty = document.getElementById('blogListEmpty'); if (empty) empty.style.display = d.total ? 'none' : 'block';
    observeBlogSentinel();
  } catch (e) {
    grid.innerHTML = '';
    var empty2 = document.getElementById('blogListEmpty'); if (empty2) empty2.style.display = 'block';
    showToast('⚠️ 广场加载失败：' + e.message);
  }
  blogFeed.loading = false;
}
function observeBlogSentinel() {
  if (blogObs) blogObs.disconnect();
  var s = document.getElementById('blogSentinel'); if (!s) return;
  blogObs = new IntersectionObserver(function (es) {
    if (es[0].isIntersecting && blogFeed.hasMore && !blogFeed.loading) renderBlogList(false);
  }, { rootMargin: '300px' });
  blogObs.observe(s);
}
function resetBlogFeed() { blogFeed = { list: [], page: 0, hasMore: true, loading: false }; }

async function renderBlogMine() {
  var tabs = document.getElementById('blogMineTabs');
  var grid = document.getElementById('blogMineGrid');
  if (!tabs || !grid) return;
  try {
    var mine = await api('/api/notes?scope=mine&page_size=0');
    var fav = await api('/api/notes?scope=favorite&page_size=0');
    var trash = await api('/api/notes/trash');
    var items = mine.items.slice();
    var trashItems = trash.items || [];
    var counts = {
      all: items.length,
      published: items.filter(function (n) { return n.status === 'published'; }).length,
      draft: items.filter(function (n) { return n.status === 'draft'; }).length,
      archived: items.filter(function (n) { return n.status === 'archived'; }).length,
      favorite: fav.items.length,
      trash: trashItems.length
    };
    var labels = [['all', '全部'], ['published', '📤 已发布'], ['draft', '💾 草稿'], ['archived', '📁 归档'], ['favorite', '🔖 收藏'], ['trash', '🗑️ 回收站']];
    tabs.innerHTML = labels.map(function (x) {
      return '<span class="chip ' + (blogMineType === x[0] ? 'active' : '') + '" onclick="blogMineType=\'' + x[0] + '\';renderBlogMine()">' + x[1] + ' ' + counts[x[0]] + '</span>';
    }).join('');
    if (blogMineType === 'trash') {
      grid.innerHTML = trashItems.map(function (n) { return trashCardHtml(n); }).join('') ||
        '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px;grid-column:1/-1">回收站是空的，删除的发贴会在这里，可恢复或彻底删除</div>';
      return;
    }
    var arr = (blogMineType === 'favorite') ? fav.items : (blogMineType === 'all' ? items : items.filter(function (n) { return n.status === blogMineType; }));
    grid.innerHTML = arr.map(function (n) { return noteCardHtml(n, { mine: n.userId === (CURRENT_USER && CURRENT_USER.id) }); }).join('') ||
      '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px;grid-column:1/-1">还没有相关的发贴</div>';
  } catch (e) { showToast('⚠️ 我的文章加载失败：' + e.message); }
}

/* ---------- 回收站（软删除）：恢复 / 彻底删除 ---------- */
function trashCardHtml(n) {
  return '<div class="note-card" style="cursor:default;opacity:.86">' +
    noteCoverHtml(n) +
    '<div class="note-body">' +
    '<div class="nc-title">' + esc(n.title) + '</div>' +
    '<div class="nc-excerpt">' + esc(n.excerpt) + '</div>' +
    '<div class="nc-meta"><span>🗑️ 删除于 ' + fmtTime(n.deletedAt || n.updatedAt) + '</span></div>' +
    '<div class="nc-actions" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:8px">' +
    '<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="restoreTrashNote(' + n.id + ')">♻️ 恢复</button>' +
    '<button class="btn btn-danger" style="padding:5px 10px;font-size:12px;flex:1" onclick="purgeTrashNote(' + n.id + ')">🗑️ 彻底删除</button></div>' +
    '</div></div>';
}
async function restoreTrashNote(id) {
  if (!await uiConfirm('恢复这篇发贴吗？')) return;
  try { await api('/api/notes/' + id + '/restore', { method: 'POST' }); showToast('♻️ 已从回收站恢复'); renderBlogMine(); }
  catch (e) { showToast('⚠️ ' + e.message); }
}
async function purgeTrashNote(id) {
  if (!await uiConfirm('彻底删除后不可恢复，确定删除吗？')) return;
  try { await api('/api/notes/trash/' + id, { method: 'DELETE' }); showToast('🗑️ 已彻底删除'); renderBlogMine(); }
  catch (e) { showToast('⚠️ ' + e.message); }
}

/* ---------- 发贴详情 / 点赞 / 收藏 / 评论 ---------- */
var NOTE_DETAIL = null;
var REPLY_TO_COMMENT = null; // 当前回复的评论ID和昵称
async function openBlogDetail(id) {
  try {
    NOTE_DETAIL = await api('/api/notes/' + id);
    currentNoteId = NOTE_DETAIL.id;
    renderBlogDetail();
    showBlogView('detail');
  } catch (e) { showToast('⚠️ ' + e.message); }
}
function renderBlogDetail() {
  var n = NOTE_DETAIL;
  var box = document.getElementById('blogDetailBox');
  if (!n || !box) { if (box) box.innerHTML = ''; return; }
  var cat = noteCat(n.category);
  var fav = !!n.favorited;
  var isMine = CURRENT_USER && n.userId === CURRENT_USER.id;
  var tags = (n.tags || []).map(function (t) {
    return '<span class="nd-tag" onclick="openBlogTag(\'' + esc(t) + '\')">#' + esc(t) + '</span>';
  }).join('');
  var comments = (n.comments || []).map(function (c) {
    var canDel = CURRENT_USER && (c.userId === CURRENT_USER.id || isMine);
    var replyMark = c.replyTo ? '<span style="font-size:11px;color:var(--text-muted);margin:0 4px">回复 @' + esc(c.replyTo) + '</span>' : '';
    return '<div class="bc-item"><div class="bc-avatar" style="cursor:pointer" onclick="openUserHome(' + c.userId + ')">' + esc((c.nickname || ' ').slice(0, 1)) + '</div>' +
      '<div class="bc-body"><div class="bc-head"><span style="cursor:pointer" onclick="openUserHome(' + c.userId + ')">' + esc(c.nickname) + '</span>' + replyMark + '<span>' + fmtTime(c.time) + '</span></div>' +
      '<div class="bc-text">' + esc(c.text) + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">' +
      '<button style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:11px;padding:0" onclick="setReplyTo(' + c.id + ',\'' + esc(c.nickname) + '\')">回复</button>' +
      (canDel ? '<button style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:11px;padding:0" onclick="deleteBlogComment(' + c.id + ')">删除</button>' : '') +
      '</div></div>';
  }).join('') || '<div style="color:var(--text-secondary);font-size:12px;padding:6px 0">暂无评论，来抢沙发～</div>';
  var pg = function (nd, dir) {
    return '<button ' + (nd ? '' : 'disabled') + ' onclick="' + (nd ? 'openBlogDetail(' + nd.id + ')' : '') + '">' +
      '<span class="pg-label">' + (dir === 'prev' ? '← 上一篇' : '下一篇 →') + '</span><span class="pg-title">' + (nd ? esc(nd.title) : '已到尽头') + '</span></button>';
  };
  var pager = '<div class="note-pager">' + pg(n.prev, 'prev') + pg(n.next, 'next') + '</div>';
  box.innerHTML = `
    <div class="note-detail-hero">
      <div class="nd-title">${esc(n.title)}</div>
      <div class="nd-meta">
        <span class="nd-cat">${cat.icon} ${cat.name}</span>
        <span style="cursor:pointer" onclick="openUserHome(${n.author ? n.author.id : 0})">👤 ${n.author ? esc(n.author.nickname) : '未知'}</span>
        <span>👁 ${n.views || 0} 次阅读</span>
        <span>🕒 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>
        <span>${n.privacy === 'private' ? '🔒 私密' : '🌍 公开'}</span>
      </div>
      <div class="note-interact">
        <button class="ni-btn ${n.liked ? 'active' : ''}" onclick="toggleNoteLike()">👍 赞 ${n.likes || 0}</button>
        <button class="ni-btn ${fav ? 'active' : ''}" onclick="toggleNoteFavorite()">${fav ? '★ 已收藏' : '☆ 收藏'}</button>
        <button class="ni-btn" onclick="exportCurrentNoteMd()">📄 导出 Markdown</button>
        ${isMine ? '<button class="ni-btn" onclick="startEditNote(' + n.id + ')">✏️ 编辑</button>' : ''}
        <div class="spacer" style="flex:1"></div>
      </div>
      ${tags ? '<div class="note-detail-tags">' + tags + '</div>' : ''}
    </div>
    <div class="note-detail-box"><div class="nd-content">${reactMarkdown(n.content)}</div></div>
    ${pager}
    <div class="blog-comments">
      <div class="bc-title">💬 评论区（${(n.comments || []).length}）</div>
      <div class="bc-input-row">
        <div id="replyHint" style="display:none;font-size:12px;color:var(--primary);margin-bottom:4px">回复 @<span id="replyToName"></span> <a href="javascript:void(0)" onclick="cancelReply()" style="color:var(--text-muted);margin-left:8px">取消</a></div>
        <input type="text" id="bcInput" placeholder="留言讨论知识点，共同学得更牢…">
        <button class="btn btn-primary" onclick="addBlogComment()">发送</button>
      </div>
      <div class="bc-list">${comments}</div>
    </div>`;
  var inp = document.getElementById('bcInput');
  if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addBlogComment(); });
}

async function toggleNoteLike() {
  if (!currentNoteId) return;
  try {
    var r = await api('/api/notes/' + currentNoteId + '/like', { method: 'POST' });
    showToast(r.liked ? '👍 已点赞' : '已取消点赞');
    openBlogDetail(currentNoteId);
  } catch (e) { showToast('⚠️ ' + e.message); }
}
async function toggleNoteFavorite() {
  if (!currentNoteId) return;
  try {
    var r = await api('/api/notes/' + currentNoteId + '/favorite', { method: 'POST' });
    showToast(r.favorited ? '🔖 已收藏' : '已取消收藏');
    openBlogDetail(currentNoteId);
  } catch (e) { showToast('⚠️ ' + e.message); }
}
function setReplyTo(cid, name) {
  REPLY_TO_COMMENT = { id: cid, name: name };
  var hint = document.getElementById('replyHint');
  var toName = document.getElementById('replyToName');
  if (hint && toName) { hint.style.display = 'block'; toName.textContent = name; }
  var inp = document.getElementById('bcInput');
  if (inp) { inp.placeholder = '回复 ' + name + '…'; inp.focus(); }
}
function cancelReply() {
  REPLY_TO_COMMENT = null;
  var hint = document.getElementById('replyHint');
  if (hint) hint.style.display = 'none';
  var inp = document.getElementById('bcInput');
  if (inp) inp.placeholder = '留言讨论知识点，共同学得更牢…';
}
async function addBlogComment() {
  var inp = document.getElementById('bcInput');
  var text = inp.value.trim();
  if (!text || !currentNoteId) return;
  var body = { content: text };
  if (REPLY_TO_COMMENT) body.parent_id = REPLY_TO_COMMENT.id;
  try {
    await api('/api/notes/' + currentNoteId + '/comments', { method: 'POST', body: body });
    showToast('💬 评论已发布');
    cancelReply();
    openBlogDetail(currentNoteId);
  } catch (e) { showToast('⚠️ ' + e.message); }
}
async function deleteBlogComment(commentId) {
  if (!await uiConfirm('确定删除这条评论吗？')) return;
  try {
    await api('/api/comments/' + commentId, { method: 'DELETE' });
    showToast('评论已删除');
    if (currentNoteId) openBlogDetail(currentNoteId);
  } catch (e) { showToast('⚠️ ' + e.message); }
}

/* ---------- 编辑 / 归档 / 删除发贴 ---------- */
async function startEditNote(id) {
  try {
    var n = await api('/api/notes/' + id);
    editingNoteId = n.id;
    document.getElementById('beTitle').value = n.title;
    document.getElementById('beCat').value = n.category;
    document.getElementById('bePrivacy').value = n.privacy || 'public';
    document.getElementById('beCover').value = n.cover || '';
    document.getElementById('beTags').value = (n.tags || []).join(', ');
    document.getElementById('blogEditorInput').value = n.content || '';
    document.getElementById('blogEditStatus').textContent = '✏️ 正在编辑：' + n.title + '（创建于 ' + fmtTime(n.createdAt) + '）';
    updateEditorPreview();
    showBlogView('edit');
  } catch (e) { showToast('⚠️ ' + e.message); }
}
async function saveBlogNote(status) {
  var title = document.getElementById('beTitle').value.trim();
  var content = document.getElementById('blogEditorInput').value;
  var cat = document.getElementById('beCat').value;
  var privacy = document.getElementById('bePrivacy').value;
  var cover = document.getElementById('beCover').value.trim();
  var tags = document.getElementById('beTags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
  if (!title) { showToast('⚠️ 请先填写标题'); document.getElementById('beTitle').focus(); return; }
  if (!content.trim()) { showToast('⚠️ 正文不能为空'); return; }
  var payload = { title: title, content: content, category: cat, privacy: privacy, status: status, cover: cover, tags: tags };
  try {
    if (editingNoteId) {
      await api('/api/notes/' + editingNoteId, { method: 'PUT', body: payload });
      showToast(status === 'draft' ? '💾 草稿已更新' : '📤 已发布');
    } else {
      await api('/api/notes', { method: 'POST', body: payload });
      showToast(status === 'draft' ? '💾 已存为草稿' : '📤 已发布');
    }
    clearEditorFields();
    renderBlogList(); renderBlogMine();
  } catch (e) { showToast('⚠️ 保存失败：' + e.message); }
}
async function archiveNote(id) {
  try { await api('/api/notes/' + id, { method: 'PATCH', body: { status: 'archived' } }); renderBlogMine(); showToast('📁 已归档到「归档箱」'); }
  catch (e) { showToast('⚠️ ' + e.message); }
}
async function unarchiveNote(id) {
  try { await api('/api/notes/' + id, { method: 'PATCH', body: { status: 'published' } }); renderBlogMine(); showToast('📤 已恢复为发布状态'); }
  catch (e) { showToast('⚠️ ' + e.message); }
}
async function deleteNote(id) {
  if (!await uiConfirm('确定删除这篇发贴吗？删除后将移入回收站，可在「回收站」恢复。')) return;
  try {
    await api('/api/notes/' + id, { method: 'DELETE' });
    renderBlogList(); renderBlogMine();
    if (currentNoteId === id) { currentNoteId = null; NOTE_DETAIL = null; showBlogView('list'); }
    if (editingNoteId === id) editingNoteId = null;
    showToast('🗑️ 已移入回收站');
  } catch (e) { showToast('⚠️ ' + e.message); }
}

/* ---------- 统计 / 导出 ---------- */
function renderBlogStats() {
  var box = document.getElementById('blogStatsBox'); if (!box || !CURRENT_USER) return;
  var s = CURRENT_USER.stats || {};
  var catCount = s.catCount || {};
  var maxCat = Math.max(1, ...Object.values(catCount));
  var catBars = BLOG_CATS.filter(function (c) { return catCount[c.id]; }).map(function (c) {
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="width:110px;font-size:12px;color:var(--text-secondary)">' + c.icon + ' ' + c.name + '</span>' +
      '<div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:' + Math.round(catCount[c.id] / maxCat * 100) + '%;background:linear-gradient(90deg,' + noteColors(c.id)[0] + ',' + noteColors(c.id)[1] + ')"></div></div>' +
      '<span style="width:60px;font-size:12px;color:var(--text-secondary)">' + catCount[c.id] + ' 篇</span></div>';
  }).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有发贴，去“✍️ 写发贴”试试吧</div>';
  box.innerHTML = `
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>博客数据统计</div></div>
      <div class="blog-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        ${[['📝', s.published || 0, '已发布'], ['💾', s.draft || 0, '草稿'], ['📁', s.archived || 0, '已归档'], ['👍', s.likes || 0, '总点赞'], ['💬', s.comments || 0, '总评论'], ['👁', s.views || 0, '总阅读']].map(function (x) {
          return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--text)">' + x[0] + ' ' + x[1] + '</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + x[2] + '</div></div>';
        }).join('')}
      </div>
      <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 发贴分类分布</div>${catBars}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="location.href='个人中心.html'">👤 前往个人中心</button>
        <button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>
      </div>
    </div>`;
}
function exportCurrentNoteMd() {
  var n = NOTE_DETAIL; if (!n) { showToast('找不到发贴'); return; }
  var cat = noteCat(n.category);
  var md = '# ' + n.title + '\n\n> 分类：' + cat.name + ' · 标签：' + (n.tags || []).join('、') + ' · 可见性：' + (n.privacy === 'private' ? '私密' : '公开') + ' · 创建于 ' + fmtTime(n.createdAt) + ' · 更新于 ' + fmtTime(n.updatedAt) + '\n\n' + n.content + '\n';
  downloadBlob((n.title || '发贴') + '.md', md, 'text/markdown;charset=utf-8');
  showToast('📄 已导出 Markdown');
}
async function exportAllNotesMd() {
  try {
    var d = await api('/api/notes?scope=mine&status=published&with_content=1&page_size=0');
    if (!d.items.length) { showToast('还没有已发布的发贴'); return; }
    var md = '# 发贴合集\n\n';
    d.items.forEach(function (n) { md += '\n---\n\n# ' + n.title + '\n\n> 分类：' + noteCat(n.category).name + ' · 创建于 ' + fmtTime(n.createdAt) + '\n\n' + n.content + '\n'; });
    downloadBlob('发贴合集.md', md, 'text/markdown;charset=utf-8');
    showToast('📄 已导出全部发贴');
  } catch (e) { showToast('⚠️ ' + e.message); }
}

/* ---------- 编辑器插图：上传服务器，返回 URL（不再 base64 入正文） ---------- */
async function editorInsertImage(event) {
  var file = event.target.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) { showToast('⚠️ 请选择图片文件'); event.target.value = ''; return; }
  if (file.size > 8 * 1024 * 1024) { showToast('⚠️ 图片超过 8MB'); event.target.value = ''; return; }
  showToast('🖼 上传中…');
  var fd = new FormData(); fd.append('file', file);
  try {
    var r = await api('/api/uploads', { method: 'POST', body: fd });
    var ta = document.getElementById('blogEditorInput');
    var s = ta.selectionStart;
    var md1 = '![截图](' + apiFileUrl(r.url) + ')';
    ta.value = ta.value.slice(0, s) + md1 + ta.value.slice(ta.selectionEnd);
    updateEditorPreview();
    showToast('🖼 已插入图片（存服务器）');
  } catch (e) { showToast('⚠️ 上传失败：' + e.message); }
  event.target.value = '';
}

/* ---------- 全局搜索：服务端公开发贴 + 本地模块 ---------- */
var gsTimer = null;
function globalSearch(kw) {
  var dd = document.getElementById('gsDropdown');
  if (!dd) return;
  kw = (kw || '').trim().toLowerCase();
  if (!kw) { dd.classList.remove('open'); dd.innerHTML = ''; return; }
  dd.innerHTML = '<div class="gs-empty">🔍 搜索中…</div>';
  dd.classList.add('open');
  clearTimeout(gsTimer);
  gsTimer = setTimeout(async function () {
    var noteResults = [];
    try {
      var d = await api('/api/notes/search?q=' + encodeURIComponent(kw));
      noteResults = d.items || [];
    } catch (e) { /* 后端不可用时仅搜模块 */ }
    var results = noteResults.map(function (n) {
      var ctx = (n.excerpt || (n.tags || []).join(' / ') || '');
      var hitIdx = (n.excerpt || '').toLowerCase().indexOf(kw);
      var desc = ctx + (n.author ? ' · 👤 ' + n.author.nickname : '');
      return { icon: '📝', title: n.title, desc: desc, action: "if(document.getElementById('page-blog')){closeGsDropdown();openBlogDetail(" + n.id + ");}else{location.href='学习博客.html#note=" + n.id + "';}" };
    });
    var noteCount = results.length;
    MODULE_INDEX.forEach(function (m) {
      if ((m.title + ' ' + m.kw + ' ' + m.desc).toLowerCase().includes(kw)) {
        results.push({ icon: m.icon, title: m.title, desc: m.desc, action: "navigateTo('" + m.page + "');closeGsDropdown()" });
      }
    });
    var shown = results.slice(0, 9);
    var html = '';
    if (noteCount > 0) html += '<div class="gs-group">📚 公开发贴（' + noteCount + '）</div>';
    html += shown.slice(0, noteCount).map(function (r) {
      return '<div class="gs-item" onclick="' + r.action.replace(/"/g, '&quot;') + '"><div class="gs-item-icon">' + r.icon + '</div><div class="gs-item-main"><div class="gs-item-title">' + gsHighlight(r.title, kw) + '</div><div class="gs-item-desc">' + gsEscape(r.desc) + '</div></div></div>';
    }).join('');
    if (shown.length > noteCount) html += '<div class="gs-group">🧭 学习模块</div>';
    html += shown.slice(noteCount).map(function (r) {
      return '<div class="gs-item" onclick="navigateTo(\'' + (MODULE_INDEX.find(function (m) { return m.title === r.title; }) || {}).page + '\');closeGsDropdown()"><div class="gs-item-icon">' + r.icon + '</div><div class="gs-item-main"><div class="gs-item-title">' + gsHighlight(r.title, kw) + '</div><div class="gs-item-desc">' + gsEscape(r.desc) + '</div></div></div>';
    }).join('');
    if (!shown.length) html = '<div class="gs-empty">没有找到「' + gsEscape(kw) + '」相关内容<br>试试：四级 / 行测 / 面试 / PPT / 发贴关键词</div>';
    else if (results.length > 9) html += '<div class="gs-empty">还有 ' + (results.length - 9) + ' 条结果未显示，换个更具体的关键词试试</div>';
    dd.innerHTML = html;
    dd.classList.add('open');
  }, 250);
}

/* ---------- AI：全部走后端中转（密钥只在 server/.env，前端零密钥） ---------- */
function getAiModelId() { return localStorage.getItem(API_AI_MODEL_KEY) || ''; }

async function sendAiMsg() {
  var input = document.getElementById('aiInput');
  var text = input.value.trim();
  if (!text || aiStreaming) return;
  input.value = '';
  pushAiMsg('user', text);
  aiStreaming = true;
  document.getElementById('aiSendBtn').style.opacity = '0.5';
  var modelId = getAiModelId();
  if (!modelId) {
    try {
      var ml = await api('/api/ai/models');
      if (ml.models && ml.models.length) { modelId = ml.models[0].id; localStorage.setItem(API_AI_MODEL_KEY, modelId); }
    } catch (e) { /* ignore */ }
  }
  var bubble = createStreamingBubble();
  try {
    var res = await apiAuthedFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiGetToken() },
      body: JSON.stringify((function () { var o = { provider: modelId, messages: buildAiContextMessages() }; try { if (typeof getSetting === 'function') { var t = getSetting('aiTemp'); if (t !== '' && t != null) o.temperature = Math.min(2, Math.max(0, +t)); var mx = getSetting('aiMax'); if (mx !== '' && mx != null) o.maxTokens = Math.min(8192, Math.max(64, +mx)); } } catch (e) {} return o; })())
    });
    if (!res.ok) {
      var detail = '';
      try { detail = (await res.json()).detail || ''; } catch (e) { }
      throw new Error(detail || ('HTTP ' + res.status));
    }
    var reader = res.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var acc = '';
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      acc += decoder.decode(r.value, { stream: true });
      bubble.textContent = acc;
      scrollAiMessages();
    }
    if (!acc) acc = '(模型返回了空回复)';
    finishStreaming('ai', acc);
  } catch (e) {
    finishStreaming('ai', '⚠️ AI 服务连接失败：' + e.message + '\n\n请确认：① 后端已启动（uvicorn main:app --port 8000）② server/.env 里已配置对应模型的 API Key。');
  }
}

async function editorAiAssist() {
  var title = document.getElementById('beTitle').value.trim() || '这篇发贴';
  var content = document.getElementById('blogEditorInput').value;
  var ta = document.getElementById('blogEditorInput');
  if (!content.trim()) { showToast('请先在编辑器里写点内容，AI 才能帮你总结'); return; }
  var prompt = '你是学习助手。请根据下面的发贴，生成一份【复习提纲】和【知识点总结】：1）用 Markdown 要点列出核心考点；2）给 3 条复习建议；3）简洁、便于复习。\n\n发贴标题：' + title + '\n发贴内容：\n' + content.slice(0, 1500);
  var modelId = getAiModelId();
  if (!modelId) {
    try {
      var ml = await api('/api/ai/models');
      if (ml.models && ml.models.length) { modelId = ml.models[0].id; localStorage.setItem(API_AI_MODEL_KEY, modelId); }
    } catch (e) { }
  }
  showToast('🤖 AI 生成中…');
  if (ta.value && !ta.value.endsWith('\n')) ta.value += '\n';
  ta.value += '## 🤖 AI 复习提纲（生成中…）\n';
  updateEditorPreview();
  try {
    var res = await apiAuthedFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiGetToken() },
      body: JSON.stringify({ provider: modelId, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) {
      var detail2 = '';
      try { detail2 = (await res.json()).detail || ''; } catch (e) { }
      throw new Error(detail2 || ('HTTP ' + res.status));
    }
    var reader2 = res.body.getReader();
    var dec2 = new TextDecoder('utf-8');
    var acc2 = '';
    while (true) {
      var r2 = await reader2.read();
      if (r2.done) break;
      acc2 += dec2.decode(r2.value, { stream: true });
    }
    ta.value = ta.value.replace('## 🤖 AI 复习提纲（生成中…）', acc2 ? ('## 🤖 AI 复习提纲\n\n' + acc2) : '');
    updateEditorPreview();
    showToast('🤖 AI 已生成复习提纲');
  } catch (e) {
    ta.value = ta.value.replace('## 🤖 AI 复习提纲（生成中…）', '## 🤖 AI 复习提纲\n\n⚠️ AI 生成失败：' + e.message + '（请确认后端已启动且 server/.env 已配置模型密钥）');
    updateEditorPreview();
    showToast('⚠️ AI 生成失败');
  }
}

/* 设置页：AI 卡片 = 模型下拉框（无密钥输入，密钥在后端 .env） */
// 快速选择常用模型
function quickSelectModel(modelId) {
  if (!modelId) return;
  
  // 根据模型ID自动填充服务商和接口地址
  var providers = (typeof AI_PROVIDERS !== 'undefined') ? AI_PROVIDERS : [];
  var matchedProvider = null;
  
  for (var i = 0; i < providers.length; i++) {
    if (modelId.indexOf(providers[i].model) !== -1 || modelId.indexOf(providers[i].id) !== -1) {
      matchedProvider = providers[i];
      break;
    }
  }
  
  if (matchedProvider) {
    document.getElementById('aipSelect').value = matchedProvider.id;
    document.getElementById('aipModel').value = modelId;
    document.getElementById('aipBaseUrl').value = matchedProvider.baseUrl;
    if (typeof onAiProviderChange === 'function') onAiProviderChange();
    showToast('✅ 已选择 ' + modelId + '，请填写API Key');
  } else {
    document.getElementById('aipModel').value = modelId;
    showToast('✅ 已选择 ' + modelId + '，请填写接口地址和API Key');
  }
}

// 保存前端直连配置
function saveAiProviderFormLocal() {
  var provider = document.getElementById('aipSelect').value;
  var model = document.getElementById('aipModel').value;
  var baseUrl = document.getElementById('aipBaseUrl').value;
  var apiKey = document.getElementById('aipKey').value;
  
  if (typeof saveAiProviderConfig === 'function') {
    saveAiProviderConfig({ provider: provider, model: model, baseUrl: baseUrl, apiKey: apiKey });
    showToast('✅ 直连配置已保存');
  }
}
async function saveAiProviderForm() {
  var sel = document.getElementById('aiModelSelect');
  if (sel) localStorage.setItem(API_AI_MODEL_KEY, sel.value);
  showToast('✅ 已选择模型：' + (sel && sel.value));
}
async function testAiConnection() {
  try {
    var r = await api('/api/ai/models');
    showToast(r.models.length ? '🔌 后端正常，可用模型 ' + r.models.length + ' 个' : '🔌 后端正常，但未配置密钥');
  } catch (e) { showToast('⚠️ 后端连接失败：' + e.message); }
}
function clearAiProviderConfig() {
  localStorage.removeItem(API_AI_MODEL_KEY);
  renderAiProviderForm();
  showToast('↺ 已恢复默认模型');
}

/* ---------- 消息通知：顶栏铃铛 + 轮询 ---------- */
var notifyLastUnread = -1;
function initNotifyBell() {
  var bar = document.querySelector('.topbar');
  if (!bar || document.getElementById('notifyBell')) return;
  var el = document.createElement('div');
  el.id = 'notifyBell'; el.className = 'notify-bell'; el.title = '消息通知';
  el.innerHTML = '🔔<span class="notify-badge" id="notifyBadge" style="display:none"></span>';
  el.addEventListener('click', function (e) { e.stopPropagation(); toggleNotifyPanel(); });
  var anchor = bar.querySelector('.topbar-stats');
  if (anchor) bar.insertBefore(el, anchor); else bar.appendChild(el);
}
function renderNotifyBadge() {
  var badge = document.getElementById('notifyBadge'); if (!badge || !CURRENT_USER) return;
  var n = CURRENT_USER.unread || 0;
  badge.style.display = n ? 'inline-block' : 'none';
  badge.textContent = n > 99 ? '99+' : n;
}
async function loadNotifications(manual) {
  try {
    var d = await api('/api/notifications');
    if (CURRENT_USER) { CURRENT_USER.unread = d.unread; renderNotifyBadge(); }
    if (!manual && notifyLastUnread >= 0 && d.unread > notifyLastUnread) {
      showToast('🔔 收到新的点赞 / 评论消息');
    }
    notifyLastUnread = d.unread;
    var panel = document.getElementById('notifyPanel');
    if (panel && panel.classList.contains('open')) renderNotifyPanel(d.items);
    return d;
  } catch (e) { /* 静默 */ }
}
function toggleNotifyPanel() {
  var panel = document.getElementById('notifyPanel');
  if (panel && panel.classList.contains('open')) { panel.classList.remove('open'); return; }
  panel = document.createElement('div');
  panel.id = 'notifyPanel'; panel.className = 'notify-panel open';
  document.body.appendChild(panel);
  document.addEventListener('click', function closePanel(e) {
    if (!panel.contains(e.target) && e.target.id !== 'notifyBell' && !e.target.closest('#notifyBell')) {
      panel.classList.remove('open');
      document.removeEventListener('click', closePanel);
    }
  });
  panel.innerHTML = '<div class="gs-empty">🔔 加载中…</div>';
  loadNotifications(true).then(function (d) { if (d) renderNotifyPanel(d.items); });
}
function renderNotifyPanel(items) {
  var panel = document.getElementById('notifyPanel'); if (!panel) return;
  var html = '<div class="notify-head"><b>🔔 消息通知</b><button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="markAllRead()">全部已读</button></div>';
  if (!items || !items.length) html += '<div class="gs-empty">暂无消息，收到点赞 / 评论会在这里提醒</div>';
  else html += items.map(function (x) {
    var icon = x.type === 'like' ? '👍' : '💬';
    var txt = icon + ' <b>' + esc(x.actor) + '</b> ' + (x.type === 'like' ? '赞了你的发贴' : '评论了你的发贴') + '《' + esc(x.noteTitle) + '》';
    return '<div class="notify-item' + (x.isRead ? '' : ' unread') + '" onclick="openNotifyNote(' + (x.noteId || 0) + ')">' +
      '<div class="notify-text">' + txt + '</div><div class="notify-time">' + fmtTime(x.createdAt) + '</div></div>';
  }).join('');
  panel.innerHTML = html;
}
function openNotifyNote(noteId) {
  var panel = document.getElementById('notifyPanel'); if (panel) panel.classList.remove('open');
  if (!noteId) return;
  if (document.getElementById('page-blog')) { openBlogDetail(noteId); }
  else location.href = '学习博客.html#note=' + noteId;
}
async function markAllRead() {
  try { await api('/api/notifications/read-all', { method: 'POST' }); await loadNotifications(true); showToast('✅ 已全部标记为已读'); }
  catch (e) { showToast('⚠️ ' + e.message); }
}

/* ---------- 私信入口：顶栏 💬 + 未读角标（私聊页为 私聊.html） ---------- */
function initChatEntry() {
  var bar = document.querySelector('.topbar');
  if (!bar || document.getElementById('chatEntry')) return;
  var el = document.createElement('div');
  el.id = 'chatEntry'; el.className = 'notify-bell'; el.title = '私信';
  el.innerHTML = '💬<span class="notify-badge" id="chatBadge" style="display:none"></span>';
  el.addEventListener('click', function () { location.href = '私聊.html'; });
  var anchor = bar.querySelector('.topbar-stats');
  if (anchor) bar.insertBefore(el, anchor); else bar.appendChild(el);
}
function renderChatBadge(n) {
  var b = document.getElementById('chatBadge'); if (!b) return;
  b.style.display = n ? 'inline-block' : 'none';
  b.textContent = n > 99 ? '99+' : n;
}
var chatUnread = 0;
var chatUnreadPrev = -1;
async function loadChatUnread() {
  if (!apiGetToken()) return;
  try {
    var d = await api('/api/chat/unread');
    renderChatBadge(d.total || 0);
    // 收到新私信提醒（仅当前不在私聊页时，且「提醒与通知」里开启）
    var chatOn = !(typeof getSetting === 'function') || getSetting('chatNotify') !== false;
    if (chatOn && chatUnreadPrev >= 0 && (d.total || 0) > chatUnreadPrev && !location.pathname.endsWith('私聊.html')) {
      if (typeof showToast === 'function') showToast('💬 收到新的私信，点右上角 💬 查看');
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('星途 · 新私信', { body: '有人给你发来新消息', tag: 'chat' });
        }
      } catch (e) { }
    }
    chatUnreadPrev = d.total || 0;
  } catch (e) { /* 静默 */ }
}

/* ---------- AI：多设备对话恢复（服务端 ai_logs） ---------- */
async function syncAiFromServer() {
  try {
    if (typeof aiChatHistory === 'undefined' || (aiChatHistory && aiChatHistory.length)) return; // 本机已有对话优先
    var d = await api('/api/ai/history?limit=100');
    var items = d.items || [];
    if (!items.length) return;
    aiChatHistory = items.map(function (m, i) {
      return { role: m.role === 'user' ? 'user' : 'ai', text: m.content, time: Date.now() + i };
    });
    localStorage.setItem('study_workbench_ai_chat', JSON.stringify(aiChatHistory));
    renderAiMessages();
  } catch (e) { /* 静默：不影响离线模式 */ }
}

/* ---------- 旧本地发贴一键迁移 ---------- */
async function migrateLocalNotes() {
  var local = [];
  try {
    var d = JSON.parse(localStorage.getItem('study_workbench_data') || '{}');
    local = d.notes || [];
  } catch (e) { }
  if (!local.length) { showToast('本地没有可迁移的发贴'); return; }
  if (!confirm('将把本机 localStorage 中的 ' + local.length + ' 篇发贴上传到服务器（当前账号名下）。\n已迁移过的发贴会自动跳过，确定继续吗？')) return;
  try {
    var r = await api('/api/migrate/notes', { method: 'POST', body: { notes: local } });
    showToast('📥 迁移完成：导入 ' + r.imported + ' 篇，跳过 ' + r.skipped + ' 篇');
    await loadCurrentUser();
    renderBlogList(); renderBlogMine();
  } catch (e) { showToast('⚠️ 迁移失败：' + e.message); }
}

/* ---------- 启动：拉取服务端数据并重渲染 ---------- */
(async function apiBoot() {
  // 无 JWT（离线单机模式登录，仅门禁标记）→ 不初始化在线功能，保留 app.js 本地行为
  if (!apiGetToken() && !apiRefreshToken()) return;
  initNotifyBell();
  initChatEntry();
  try { await loadCurrentUser(); }
  catch (e) { return; /* 401 已跳转登录 */ }
  renderHomeOnlineNav();
  if (document.getElementById('page-blog')) {
    renderBlogList();
    renderBlogMine();
    var h = location.hash.replace('#', '');
    if (h === 'favorite') { blogMineType = 'favorite'; showBlogView('mine'); }
    else if (h.indexOf('note=') === 0) openBlogDetail(Number(h.slice(5)));
    else if (['list', 'mine', 'edit', 'stats'].indexOf(h) >= 0) showBlogView(h);
  }
  if (document.getElementById('page-profile')) renderProfilePage();
  if (document.getElementById('aiProviderForm')) renderAiProviderForm();
  if (document.getElementById('aiMessages')) syncAiFromServer();
  loadNotifications();
  loadChatUnread();
  setInterval(function () { loadNotifications(); }, 60000); // 每分钟轮询新消息
  setInterval(function () { loadChatUnread(); }, 30000);    // 每 30s 刷新私信未读角标
})();

/* =====================================================================
   档案双模式增强（覆盖同名单函数）：在线用服务器资料，离线用本机 appData；
   新增「个人简介 bio」字段；导出在离线时导出本机发贴，不再失灵。
   ===================================================================== */

function _genderSym(g) { return g === 'male' ? '♂ 男' : (g === 'female' ? '♀ 女' : ''); }
function _ageOf(b) {
  if (!b) return '';
  var y = +b.slice(0, 4), m = +b.slice(5, 7), d = +b.slice(8, 10);
  if (!y) return '';
  var now = new Date(); var age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 ? age + '岁' : '';
}
function _profileMeta(g, b, c) {
  var parts = [_genderSym(g), _ageOf(b), (c || '').trim()].filter(function (x) { return x; });
  return parts.length ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">' + esc(parts.join(' · ')) + '</div>' : '';
}
/* 标签 chips / 学习目标 展示（自己主页与 TA 公开主页共用） */
function _tagChips(s) {
  if (!s) return '';
  // 兼容中文逗号（老数据/手工导入可能未规范化），去空、去重，最多 8 个
  var seen = {}, arr = [];
  String(s).replace(/，/g, ',').split(',').forEach(function (x) {
    x = x.trim();
    if (x && !seen[x] && arr.length < 8) { seen[x] = 1; arr.push(x); }
  });
  if (!arr.length) return '';
  return '<div class="pp-tags">' + arr.map(function (t) { return '<span class="pp-tag">' + esc(t) + '</span>'; }).join('') + '</div>';
}
function _goalLine(g) {
  g = (g || '').trim();
  return g ? '<div class="pp-goal">🎯 学习目标：<b>' + esc(g) + '</b></div>' : '';
}

function _peSource() {
  if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) return { u: CURRENT_USER, online: true };
  var p = (typeof appData !== 'undefined' && appData && appData.profile) || { name: '同学', avatar: '学', motto: '', bio: '' };
  return { u: null, online: false, p: p };
}

function renderProfilePage() {
  var box = document.getElementById('profileBox');
  if (!box) return;
  // 处理?user=参数：查看他人主页
  var params = new URLSearchParams(location.search);
  var otherId = params.get('user');
  if (otherId && CURRENT_USER && Number(otherId) !== CURRENT_USER.id) { renderUserHome(Number(otherId), box); return; }
  var src = _peSource();
  if (src.online) { _renderProfileOnline(box, src.u); return; }
  _renderProfileLocal(box, src.p);
}

function _renderProfileLocal(box, p) {
  p = p || {};
  var avatar = (p.avatarImg && /^data:image\//.test(p.avatarImg))
    ? '<img src="' + p.avatarImg + '" alt="头像">' : esc((p.avatar || '学').slice(0, 1));
  box.innerHTML =
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">👤</span>个人资料</div><div class="card-action">本地单机</div></div>' +
    '<div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">' +
    '<div class="profile-avatar-lg">' + avatar + '</div>' +
    '<div style="flex:1;min-width:180px"><div style="font-size:18px;font-weight:800;color:var(--text)">' + esc(p.name || '同学') + '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px">' + esc(p.motto || '') + '</div>' +
    (p.bio ? '<div style="font-size:13px;color:var(--text);margin-top:6px;line-height:1.6">' + esc(p.bio) + '</div>' : '') + _profileMeta(p.gender, p.birthday, p.city) +
    _tagChips(p.tags) + _goalLine(p.goal) +
    '</div>' +
    '<button class="btn btn-outline" onclick="editProfile()">✏️ 编辑资料</button>' +
    '<button class="btn btn-danger" onclick="doLogout()">🚪 退出登录</button></div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">📱 当前为本地单机模式，资料保存在本机浏览器。在线登录后资料/发贴会存到服务器并可多端同步。</div></div>' +
    _localNotesCard();
}

function _localNotesCard() {
  var notes = (typeof appData !== 'undefined' && appData && appData.notes) || [];
  var pub = notes.filter(function (n) { return n.status === 'published'; });
  var draft = notes.filter(function (n) { return n.status === 'draft'; });
  var likes = pub.reduce(function (s, n) { return s + (n.likes || 0); }, 0);
  var views = pub.reduce(function (s, n) { return s + (n.views || 0); }, 0);
  var d = (typeof appData !== 'undefined' && appData && appData.stats) || {};
  var acc = d.totalQuestions > 0 ? Math.round(d.correctQuestions / d.totalQuestions * 100) : 0;
  return '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>本机发贴统计</div></div>' +
    '<div class="profile-grid">' +
    [['📝', pub.length, '已发布'], ['💾', draft.length, '草稿'], ['👍', likes, '点赞'], ['👁', views, '阅读']].map(function (x) {
      return '<div class="profile-stat"><div class="ps-num">' + x[0] + ' ' + x[1] + '</div><div class="ps-label">' + x[2] + '</div></div>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>' +
    '<button class="btn btn-outline" onclick="location.href=' + "'学习博客.html'" + '">📝 去写发贴</button></div></div>' +

    // ===== 今日学习时长（本机计时，与设置页上限联动）=====
    (function () {
      var st = (typeof loadAllSettings === 'function') ? loadAllSettings() : {};
      var txt = (typeof getTodayStudyText === 'function') ? getTodayStudyText() : '0 分钟';
      var on = st.studyLimitOn !== false;
      return '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">⏱</span>今日学习时长</div>' +
        '<div class="card-action">上限 ' + (on ? (st.studyLimitHours || 4) + ' 小时' : '未启用') + '</div></div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0">' +
        '<span id="pcStudyTime" style="font-size:26px;font-weight:800;color:var(--primary)">' + txt + '</span>' +
        '<span id="pcStudyTimeTip" style="font-size:12px;color:var(--text-secondary)"></span></div>' +
        '<div class="pc-studytime-bar"><i id="pcStudyTimeBar"></i></div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.6">💡 打开任意页面即开始计时，切到后台自动暂停；到上限只友好提醒，不打断学习。可在 <a href="设置.html" style="color:var(--primary);text-decoration:none;font-weight:600">设置</a> 修改。</div></div>';
    })() +

    // ===== 学习数据概览（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>学习数据</div></div>' +
    '<div class="profile-grid">' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">🔥 ' + (d.streakDays || 0) + '</div><div class="ps-label">连续打卡</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">⏱ ' + (d.totalHours || 0) + 'h</div><div class="ps-label">总学习时长</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">🧮 ' + (d.totalQuestions || 0) + '</div><div class="ps-label">做题总数</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">🎯 ' + acc + '%</div><div class="ps-label">正确率</div></div>' +
    '</div></div>' +

    // ===== 成就徽章墙（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">🏅</span>我的成就</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🌱</div><div style="font-size:12px;margin-top:4px">初学者</div></div>' +
    ((d.streakDays || 0) >= 7 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🔥</div><div style="font-size:12px;margin-top:4px">坚持一周</div></div>' : '') +
    ((d.totalQuestions || 0) >= 100 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🧮</div><div style="font-size:12px;margin-top:4px">百题斩</div></div>' : '') +
    ((d.totalQuestions || 0) >= 500 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">💪</div><div style="font-size:12px;margin-top:4px">刷题达人</div></div>' : '') +
    '</div></div>' +

    // ===== 新增：学习模块快捷入口 =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">📚</span>学习模块</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div onclick="location.href=' + "'错题本.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px">📒</div><div style="font-size:12px;margin-top:4px">错题本</div></div>' +
    '<div onclick="location.href=' + "'四级词汇.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px">📖</div><div style="font-size:12px;margin-top:4px">四级词汇</div></div>' +
    '<div onclick="location.href=' + "'央国企笔试.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px">📝</div><div style="font-size:12px;margin-top:4px">行测刷题</div></div>' +
    '</div></div>';
}

function _renderProfileOnline(box, u) {
  var s = u.stats || {};
  var d = (typeof appData !== 'undefined' && appData && appData.stats) || {};
  var acc = d.totalQuestions > 0 ? Math.round(d.correctQuestions / d.totalQuestions * 100) : 0;
  var catCount = s.catCount || {};
  var maxCat = 1;
  for (var k in catCount) { if (catCount[k] > maxCat) maxCat = catCount[k]; }
  var catBars = (typeof BLOG_CATS !== 'undefined' ? BLOG_CATS : []).filter(function (c) { return catCount[c.id]; }).map(function (c) {
    var cols = (typeof noteColors === 'function' ? noteColors(c.id) : ['#5B8DEF', '#8B5CF6']);
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="width:110px;font-size:12px;color:var(--text-secondary)">' + c.icon + ' ' + c.name + '</span>' +
      '<div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:' + Math.round(catCount[c.id] / maxCat * 100) + '%;background:linear-gradient(90deg,' + cols[0] + ',' + cols[1] + ')"></div></div>' +
      '<span style="width:60px;font-size:12px;color:var(--text-secondary)">' + catCount[c.id] + ' 篇</span></div>';
  }).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有发贴，去「学习博客 → ✍️ 写发贴」试试吧</div>';
  box.innerHTML =
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">👤</span>个人资料</div><div class="card-action">@' + esc(u.username) + '</div></div>' +
    '<div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">' +
    '<div class="profile-avatar-lg">' + (u.avatarUrl ? '<img src="' + apiFileUrl(u.avatarUrl) + '" alt="头像">' : esc((u.nickname || '学').slice(0, 1))) + '</div>' +
    '<div style="flex:1;min-width:180px"><div style="font-size:18px;font-weight:800;color:var(--text)">' + esc(u.nickname) + '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px">' + esc(u.motto || '') + '</div>' +
    // 公开主页：性别/生日一律不传（即使服务端异常返回也不展示），只展示城市
    (u.bio ? '<div style="font-size:13px;color:var(--text);margin-top:6px;line-height:1.6">' + esc(u.bio) + '</div>' : '') + _profileMeta('', '', u.city) +
    _tagChips(u.tags) + _goalLine(u.goal) +
    (u.createdAt ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">📅 加入于 ' + esc(u.createdAt) + '</div>' : '') +
    '</div>' +
    '<button class="btn btn-outline" onclick="editProfile()">✏️ 编辑资料</button>' +
    '<button class="btn btn-danger" onclick="doLogout()">🚪 退出登录</button></div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">✅ 多人在线：资料保存在服务器数据库，头像为文件上传。</div></div>' +
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>发贴统计</div></div>' +
    '<div class="profile-grid">' +
    [['📝', s.published || 0, '已发布'], ['💾', s.draft || 0, '草稿'], ['📁', s.archived || 0, '归档'], ['👍', s.likes || 0, '总点赞'], ['💬', s.comments || 0, '评论'], ['👁', s.views || 0, '阅读']].map(function (x) {
      return '<div class="profile-stat"><div class="ps-num">' + x[0] + ' ' + x[1] + '</div><div class="ps-label">' + x[2] + '</div></div>';
    }).join('') + '</div>' +
    '<div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 发贴分类分布</div>' + catBars + '</div>' +
    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>' +
    '<button class="btn btn-outline" onclick="location.href=' + "'学习博客.html'" + '">📝 去写发贴</button></div></div>' +

    // ===== 今日学习时长（本机计时，与设置页上限联动）=====
    (function () {
      var st = (typeof loadAllSettings === 'function') ? loadAllSettings() : {};
      var txt = (typeof getTodayStudyText === 'function') ? getTodayStudyText() : '0 分钟';
      var on = st.studyLimitOn !== false;
      return '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">⏱</span>今日学习时长</div>' +
        '<div class="card-action">上限 ' + (on ? (st.studyLimitHours || 4) + ' 小时' : '未启用') + '</div></div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0">' +
        '<span id="pcStudyTime" style="font-size:26px;font-weight:800;color:var(--primary)">' + txt + '</span>' +
        '<span id="pcStudyTimeTip" style="font-size:12px;color:var(--text-secondary)"></span></div>' +
        '<div class="pc-studytime-bar"><i id="pcStudyTimeBar"></i></div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.6">💡 打开任意页面即开始计时，切到后台自动暂停；到上限只友好提醒，不打断学习。可在 <a href="设置.html" style="color:var(--primary);text-decoration:none;font-weight:600">设置</a> 修改。</div></div>';
    })() +

    // ===== 学习数据概览（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>学习数据</div></div>' +
    '<div class="profile-grid">' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">🔥 ' + (d.streakDays || 0) + '</div><div class="ps-label">连续打卡</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">⏱ ' + (d.totalHours || 0) + 'h</div><div class="ps-label">总学习时长</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">🧮 ' + (d.totalQuestions || 0) + '</div><div class="ps-label">做题总数</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)">🎯 ' + acc + '%</div><div class="ps-label">正确率</div></div>' +
    '</div></div>' +

    // ===== 成就徽章墙（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">🏅</span>我的成就</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🌱</div><div style="font-size:12px;margin-top:4px">初学者</div></div>' +
    ((d.streakDays || 0) >= 7 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🔥</div><div style="font-size:12px;margin-top:4px">坚持一周</div></div>' : '') +
    ((d.totalQuestions || 0) >= 100 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🧮</div><div style="font-size:12px;margin-top:4px">百题斩</div></div>' : '') +
    ((d.totalQuestions || 0) >= 500 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">💪</div><div style="font-size:12px;margin-top:4px">刷题达人</div></div>' : '') +
    '</div></div>' +

    // ===== 新增：学习模块快捷入口 =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon">📚</span>学习模块</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div onclick="location.href=' + "'错题本.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px">📒</div><div style="font-size:12px;margin-top:4px">错题本</div></div>' +
    '<div onclick="location.href=' + "'四级词汇.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px">📖</div><div style="font-size:12px;margin-top:4px">四级词汇</div></div>' +
    '<div onclick="location.href=' + "'央国企笔试.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px">📝</div><div style="font-size:12px;margin-top:4px">行测刷题</div></div>' +
    '</div></div>';
}

function editProfile() {
  var m = document.getElementById('profileEditModal');
  if (!m) { showToast('请在个人中心页面编辑资料'); return; }
  var src = _peSource();
  var nameEl = document.getElementById('peName'), mottoEl = document.getElementById('peMotto'), bioEl = document.getElementById('peBio');
  var gEl = document.getElementById('peGender'), bEl = document.getElementById('peBirthday'), cEl = document.getElementById('peCity');
  var tagEl = document.getElementById('peTags'), goalEl = document.getElementById('peGoal');
  if (src.online) {
    apiAvatarTemp = src.u.avatarUrl || null;
    if (nameEl) nameEl.value = src.u.nickname || '';
    if (mottoEl) mottoEl.value = src.u.motto || '';
    if (bioEl) bioEl.value = src.u.bio || '';
    if (gEl) gEl.value = src.u.gender || 'secret';
    if (bEl) bEl.value = src.u.birthday || '';
    if (cEl) cEl.value = src.u.city || '';
    if (tagEl) tagEl.value = src.u.tags || '';
    if (goalEl) goalEl.value = src.u.goal || '';
  } else {
    apiAvatarTemp = (src.p.avatarImg && /^data:image\//.test(src.p.avatarImg)) ? src.p.avatarImg : null;
    if (nameEl) nameEl.value = src.p.name || '';
    if (mottoEl) mottoEl.value = src.p.motto || '';
    if (bioEl) bioEl.value = src.p.bio || '';
    if (gEl) gEl.value = src.p.gender || 'secret';
    if (bEl) bEl.value = src.p.birthday || '';
    if (cEl) cEl.value = src.p.city || '';
    if (tagEl) tagEl.value = src.p.tags || '';
    if (goalEl) goalEl.value = src.p.goal || '';
  }
  renderPeAvatarPreview();
  if (typeof window.peSyncUI === 'function') window.peSyncUI(); // 刷新标签chips/字数/完成度/预览
  m.classList.add('active');
  if (nameEl) nameEl.focus();
}

function renderPeAvatarPreview() {
  var el = document.getElementById('peAvatarPreview'); if (!el) return;
  var src = _peSource();
  var letter = src.online ? ((src.u.nickname || '学').slice(0, 1)) : (((src.p.name || src.p.avatar) || '学').slice(0, 1));
  if (apiAvatarTemp && /^(https?:|\/uploads\/|data:)/.test(apiAvatarTemp)) el.innerHTML = '<img src="' + apiFileUrl(apiAvatarTemp) + '" alt="头像预览">';
  else el.textContent = letter;
}

function onProfileAvatarFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { showToast('⚠️ 请选择图片文件'); input.value = ''; return; }
  if (file.size > 8 * 1024 * 1024) { showToast('⚠️ 图片超过 8MB'); input.value = ''; return; }
  var src = _peSource();
  if (src.online) {
    var fd = new FormData(); fd.append('file', file);
    showToast('📷 上传中…');
    api('/api/users/me/avatar', { method: 'POST', body: fd }).then(function (r) {
      apiAvatarTemp = r.avatarUrl;
      renderPeAvatarPreview();
      showToast('📷 头像已上传，点「保存」更新资料');
    }).catch(function (e) { showToast('⚠️ 上传失败：' + e.message); });
  } else {
    var reader = new FileReader();
    reader.onload = function (e2) {
      if (typeof compressAvatarImage === 'function') {
        compressAvatarImage(e2.target.result, 256, function (dataUrl) {
          apiAvatarTemp = dataUrl; renderPeAvatarPreview(); showToast('📷 已选择头像，点「保存」生效');
        });
      } else { apiAvatarTemp = e2.target.result; renderPeAvatarPreview(); showToast('📷 已选择头像，点「保存」生效'); }
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}

function resetProfileAvatar() {
  var src = _peSource();
  if (src.online) {
    api('/api/users/me/avatar', { method: 'DELETE' }).then(function () {
      apiAvatarTemp = null; renderPeAvatarPreview(); showToast('↩️ 已恢复默认头像，点「保存」更新');
    }).catch(function (e) { showToast('⚠️ ' + e.message); });
  } else {
    apiAvatarTemp = null; renderPeAvatarPreview(); showToast('↩️ 已恢复默认头像，点「保存」生效');
  }
}

function saveProfileEditor() {
  var nameEl = document.getElementById('peName'), mottoEl = document.getElementById('peMotto'), bioEl = document.getElementById('peBio');
  var gEl = document.getElementById('peGender'), bEl = document.getElementById('peBirthday'), cEl = document.getElementById('peCity');
  var tagEl = document.getElementById('peTags'), goalEl = document.getElementById('peGoal');
  var name = (nameEl && nameEl.value.trim()) || '';
  var motto = (mottoEl && mottoEl.value.trim()) || '';
  var bio = (bioEl && bioEl.value.trim()) || '';
  var gender = (gEl && gEl.value) || 'secret';
  var birthday = (bEl && bEl.value) || '';
  var city = (cEl && cEl.value.trim()) || '';
  var tags = (tagEl && tagEl.value) || '';
  var goal = (goalEl && goalEl.value.trim()) || '';
  var src = _peSource();
  var finish = function (okMsg) { closeProfileEditor(); renderProfilePage(); showToast(okMsg); };
  if (src.online) {
    if (!name) { showToast('⚠️ 昵称不能为空'); return; }
    api('/api/users/me', { method: 'PUT', body: { nickname: name, motto: motto, bio: bio, gender: gender, birthday: birthday, city: city, tags: tags, goal: goal } })
      .then(function () { return loadCurrentUser(); })
      .then(function () { finish('👤 个人资料已更新'); if (typeof renderHomeOnlineNav === 'function') renderHomeOnlineNav(); })
      .catch(function (e) { showToast('⚠️ 保存失败：' + e.message); });
  } else {
    var p = src.p;
    p.name = name || p.name; p.motto = motto; p.bio = bio; p.gender = gender; p.birthday = birthday; p.city = city;
    p.tags = tags; p.goal = goal;
    if (apiAvatarTemp) { p.avatarImg = apiAvatarTemp; } else { delete p.avatarImg; }
    if (typeof saveData === 'function') saveData();
    try {
      var nm = document.querySelector('.user-card .user-name'); if (nm) nm.textContent = p.name;
      var av = document.querySelector('.user-card .user-avatar');
      if (av) { av.innerHTML = (p.avatarImg && /^data:image\//.test(p.avatarImg)) ? '<img src="' + p.avatarImg + '" alt="头像">' : esc(((p.avatar || '学')).slice(0, 1)); }
    } catch (e2) { }
    finish('👤 个人资料已更新');
  }
}

function exportAllNotesMd() {
  var src = _peSource();
  if (src.online) {
    api('/api/notes?scope=mine&status=published&with_content=1&page_size=0').then(function (d) {
      if (!d.items || !d.items.length) { showToast('还没有已发布的发贴'); return; }
      var md = '# 发贴合集\n\n';
      d.items.forEach(function (n) {
        md += '\n---\n\n# ' + n.title + '\n\n> 分类：' + (typeof noteCat === 'function' ? noteCat(n.category).name : n.category) + ' · 创建于 ' + fmtTime(n.createdAt) + '\n\n' + n.content + '\n';
      });
      downloadBlob('发贴合集.md', md, 'text/markdown;charset=utf-8');
      showToast('📄 已导出全部发贴');
    }).catch(function (e) { showToast('⚠️ 导出失败：' + e.message); });
  } else {
    var notes = (typeof appData !== 'undefined' && appData && appData.notes) || [];
    var pubs = notes.filter(function (n) { return n.status === 'published'; });
    if (!pubs.length) { showToast('本机还没有已发布的发贴，先去写一篇吧'); return; }
    var md2 = '# 发贴合集（本地导出）\n\n';
    pubs.forEach(function (n) {
      md2 += '\n---\n\n# ' + (n.title || '未命名') + '\n\n> 创建于 ' + ((n.createdAt || '').toString().slice(0, 16).replace('T', ' ')) + '\n\n' + (n.content || '') + '\n';
    });
    downloadBlob('发贴合集-本地.md', md2, 'text/markdown;charset=utf-8');
    showToast('📄 已导出本机全部发贴');
  }
}
/* 离线首次进入个人中心时，也用新版双模式渲染（含性别/生日/城市元信息） */
(function () {
  var bootProfile = function () {
    try {
      if (!isOnlineSession() && !window.__offlineProfileDone) {
        window.__offlineProfileDone = 1;
        if (document.getElementById('profileBox')) renderProfilePage();
        if (typeof renderProfileOverview === 'function') renderProfileOverview();
      }
    } catch (e) { /* 静默 */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(bootProfile, 450); });
  else setTimeout(bootProfile, 450);
})();
