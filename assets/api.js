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

/* ---------- 头像统一取值 / 渲染工具（2026-09-16 修复「头像加载不出来」） ----------
   背景：在线模式头像早已改为文件上传 URL（字段 avatarUrl），本地模式仍是 base64（字段 avatarImg）。
        过去各判据一律用 /^data:image\// 一票否决 → 在线模式必然回退首字头像。
        现统一：先取 avatarUrl、再取 avatarImg；src 一律过 apiFileUrl()；<img> 统一带 onerror 兜底；
        data: 开头的本地 base64 会被 apiFileUrl 原样返回，本地模式行为不变。
        全部走 window.xxx + typeof 守卫，避免与其它文件顶层声明冲突。 */
if (typeof window.apiAvatarText !== 'function') {
  window.apiAvatarText = function (s) {
    var t = (s === null || s === undefined) ? '' : String(s);
    if (typeof window.esc === 'function') return window.esc(t);
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}
if (typeof window.apiAvatarSrcOf !== 'function') {
  /* 统一取值：有头像则返回已过 apiFileUrl 的地址，无头像返回空串（调用方回退首字） */
  window.apiAvatarSrcOf = function (obj) {
    var o = obj || {};
    var raw = (o.avatarUrl && typeof o.avatarUrl === 'string') ? o.avatarUrl
      : ((o.avatarImg && typeof o.avatarImg === 'string') ? o.avatarImg : '');
    if (!raw) return '';
    if (/^(javascript:|vbscript:)/i.test(raw)) return '';
    try { return (typeof window.apiFileUrl === 'function') ? (window.apiFileUrl(raw) || '') : raw; } catch (e) { return raw; }
  };
}
if (typeof window.apiAvatarFallback !== 'function') {
  /* <img onerror> 兜底：图片 404 / 解码失败时把容器还原成昵称首字，避免留裂图 */
  window.apiAvatarFallback = function (img, letter) {
    try {
      if (!img) return;
      var box = img.parentNode;
      if (!box) return;
      box.innerHTML = '';
      box.textContent = (letter && String(letter).length) ? String(letter) : '学';
    } catch (e) { }
  };
}
if (typeof window.apiAvatarHtml !== 'function') {
  /* 头像 HTML：有头像 → <img src="apiFileUrl(...)" onerror=回退首字>；无头像 → 转义后的首字文本 */
  window.apiAvatarHtml = function (obj, fallbackText, extraAttr) {
    var src = window.apiAvatarSrcOf(obj);
    var fb = (fallbackText === null || fallbackText === undefined || fallbackText === '') ? '学' : String(fallbackText);
    if (!src) return window.apiAvatarText(fb);
    var letter = fb.replace(/['"\\\r\n]/g, '').slice(0, 4);
    return '<img src="' + window.apiAvatarText(src) + '" alt="头像"' + (extraAttr ? ' ' + extraAttr : '') + ' onerror="window.apiAvatarFallback(this, \'' + window.apiAvatarText(letter) + '\')">';
  };
}

/* ---------- 好友展示名统一取值（需求D，2026-09-17）：备注名 > 昵称 > 兜底 ----------
   背景：好友自己设的「昵称」与「我给对方设的」备注名并存时，各页面曾分别用 nickname /
         「备注名（原名）」拼接等写法渲染，同一好友在不同位置叫法不一致。
   规则（全站唯一）：备注名 trim 后非空 → 一律只显示备注名（不再拼原名，也不重复拼接）；
         备注名为空 / 仅空白字符 → 回退昵称；
         昵称也为空 → 回退兜底值（对象式第 2 参 / 参数式第 3 参）；
         兜底值未传 → '未设置昵称'；显式传 '' → 返回 ''（保留调用方原有的空串语义）。
   数据：备注名字段固定为 peerRemark（server/routers/friends.py、server/routers/chat.py 均返回）。
   调用：friendDisplayName(friendObj, fallback)         —— 对象式（推荐）
         friendDisplayName(remark, nickname, fallback)  —— 参数式（兼容旧 imDisplayName 调用点）
   风格：window.xxx + typeof 守卫，与上方头像工具一致，避免与其它文件顶层声明冲突。 */
if (typeof window.friendDisplayName !== 'function') {
  window.friendDisplayName = function (friend, nickname, fallback) {
    var remark = '';
    var nick = '';
    var fb;
    if (friend !== null && typeof friend === 'object') {
      // 对象式：备注 peerRemark（兼容别名 remark）、昵称 nickname；第 2 参即兜底值
      remark = (friend.peerRemark != null) ? friend.peerRemark : ((friend.remark != null) ? friend.remark : '');
      nick = (friend.nickname != null) ? friend.nickname : '';
      fb = (typeof nickname === 'undefined') ? undefined : nickname;
    } else {
      // 参数式：friend = 备注名，nickname = 昵称，fallback = 兜底值
      remark = (friend == null) ? '' : friend;
      nick = (typeof nickname === 'undefined') ? '' : nickname;
      fb = (typeof fallback === 'undefined') ? undefined : fallback;
    }
    var r = (typeof remark === 'string' || typeof remark === 'number') ? String(remark).replace(/^\s+|\s+$/g, '') : '';
    if (r) return r;                                   // ① 备注名非空 → 只显示备注名
    var n = (typeof nick === 'string' || typeof nick === 'number') ? String(nick).replace(/^\s+|\s+$/g, '') : '';
    if (n) return n;                                   // ② 未设备注 → 显示昵称
    return (fb === undefined || fb === null) ? '未设置昵称' : String(fb); // ③ 兜底
  };
}
if (typeof window.getFriendDisplayName !== 'function') {
  /* 命名习惯兼容：与 friendDisplayName 完全同义，方便调用方按习惯取名 */
  window.getFriendDisplayName = function (friend, nickname, fallback) {
    return window.friendDisplayName(friend, nickname, fallback);
  };
}

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

/* ---------- R3b-B / N1：请求超时（AbortController）----------
   背景：api() 原先直接 fetch，无超时 → 服务器不响应时 Promise 永远 pending，按钮一直转圈、无提示无重试。
   设计：默认 15s；按「路径 / 选项」可放宽或不设超时；超时抛明确错误「网络超时，请检查网络后重试」。
   与 401 续期协同：AbortController 触发的 abort 只作用于当次请求，不会与 401 分支混淆；
   重放（_retried）时每次请求使用独立计时器与 signal，_retried 在 401 分支设置、重试成功后自然保留。 */
var API_TIMEOUT_MS = 15000;              // 普通接口默认超时（15s）
var API_LONG_TIMEOUT_MS = 300000;        // 上传/长任务放宽（5min）
var API_UPLOAD_HINT = /upload/i;         // 路径含 upload（如 /api/uploads、/api/users/me/avatar、/api/chat/upload…）→ 放宽
var API_STREAM_HINT = /(stream|sse|events|chat)$/i; // 仅兜底；真正的流式走 apiAuthedFetch，不受本超时约束

/* 超时判定（按优先级）：
   ① opts.noTimeout === true / opts.timeout === 0 → 不设超时（返回 0）
   ② opts.timeout 为正数 → 用该值（ms）
   ③ opts.longTimeout === true → API_LONG_TIMEOUT_MS
   ④ 路径命中上传/流式特征 → API_LONG_TIMEOUT_MS（防误杀慢上传）
   ⑤ 其余 → API_TIMEOUT_MS（默认 15s） */
function apiTimeoutFor(path, opts) {
  opts = opts || {};
  if (opts.noTimeout === true || opts.timeout === 0) return 0;
  if (typeof opts.timeout === 'number' && opts.timeout > 0) return opts.timeout;
  if (opts.longTimeout === true) return API_LONG_TIMEOUT_MS;
  var p = String(path || '');
  if (API_UPLOAD_HINT.test(p) || API_STREAM_HINT.test(p)) return API_LONG_TIMEOUT_MS;
  return API_TIMEOUT_MS;
}
/* 合并「外部传入 signal」与「内部超时 signal」。
   返回 { signal, cleanup }。外部 signal 若已 abort，立即生效。 */
function apiMakeSignal(externalSignal, timeoutMs) {
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = null;
  var timedOut = false;
  function onExternalAbort() { try { if (ctrl) ctrl.abort(); } catch (e) { } }
  if (ctrl && timeoutMs > 0) {
    timer = setTimeout(function () { timedOut = true; try { ctrl.abort(); } catch (e) { } }, timeoutMs);
  }
  if (!ctrl && externalSignal) {
    // 老内核无 AbortController：退化为仅透传外部 signal（无超时能力），不报错
    return { signal: externalSignal, cleanup: function () { }, isTimeout: function () { return false; } };
  }
  if (externalSignal) {
    if (externalSignal.aborted) { onExternalAbort(); }
    else if (externalSignal.addEventListener) { externalSignal.addEventListener('abort', onExternalAbort); }
  }
  return {
    signal: ctrl ? ctrl.signal : undefined,
    cleanup: function () { if (timer) { clearTimeout(timer); timer = null; } if (externalSignal && externalSignal.removeEventListener) { externalSignal.removeEventListener('abort', onExternalAbort); } },
    isTimeout: function () { return timedOut; }
  };
}

async function api(path, opts) {
  opts = opts || {};
  // R3b-B / N2：离线时快速失败（避免触发 fetch 后长时间 pending）；契约不变——仍抛 Error。
  if (!opts._allowOffline && typeof window.xtNetIsOffline === 'function' && window.xtNetIsOffline()) {
    if (typeof window.xtNetCheck === 'function') window.xtNetCheck(false);
    throw new Error('网络不可用，请检查网络连接');
  }
  var headers = Object.assign({}, opts.headers || {});
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  var t = apiGetToken(); if (t) headers['Authorization'] = 'Bearer ' + t;

  var timeoutMs = apiTimeoutFor(path, opts);
  var sig = apiMakeSignal(opts.signal, timeoutMs);
  var res;
  try {
    res = await fetch(window.API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body instanceof FormData ? opts.body : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: sig.signal
    });
  } catch (err) {
    sig.cleanup();
    // 超时中止：抛明确文案；外部主动取消：尊重原 error；其它网络错误：友好提示
    if (sig.isTimeout()) throw new Error('网络超时，请检查网络后重试');
    if (err && err.name === 'AbortError') throw err;
    throw new Error('网络异常，请检查网络后重试');
  }
  sig.cleanup();

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
function gotoBlogMine() { location.href = '社区.html#mine'; }
function renderHomeOnlineNav() {
  var el = document.getElementById('homeOnlineNav'); if (!el) return;
  if (!isOnlineSession()) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 2px">' +
    '<span style="font-size:13px;font-weight:700;color:var(--text);display:inline-flex;align-items:center;gap:4px"><span class="nav-icon" data-icon="message-square" data-icon-size="14"></span> 在线互动</span>' +
    '<span style="font-size:11px;color:var(--text-secondary)">多人在线（好友私信 / 博客 / AI）</span></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<a class="chip" href="私聊.html" style="text-decoration:none"><span class="nav-icon" data-icon="message-square" data-icon-size="12"></span> 好友私信</a>' +
    '<a class="chip" href="社区.html#mine" style="text-decoration:none"><span class="nav-icon" data-icon="inbox" data-icon-size="12"></span> 我的发贴·回收站</a>' +
    '<a class="chip" href="社区.html#favorite" style="text-decoration:none"><span class="nav-icon" data-icon="bookmark" data-icon-size="12"></span> 我的收藏</a>' +
    '<a class="chip" href="社区.html" style="text-decoration:none"><span class="nav-icon" data-icon="globe" data-icon-size="12"></span> 社区</a>' +
    '</div>';
  if (window.lucideAutoRender) window.lucideAutoRender(); // K6：动态插入的 data-icon 图标重渲染
}

/* ---------- 当前登录用户（服务端资料，替代 appData.profile） ---------- */
var CURRENT_USER = null; // {id, username, nickname, motto, avatarUrl, stats:{...}, unread}
async function loadCurrentUser() {
  CURRENT_USER = await api('/api/auth/me');
  updateProfileUI();
  renderNotifyBadge();
  return CURRENT_USER;
}

/* ---------- 在线状态（批次二 需求6，2026-09-11）：相对时间格式化（纯函数，jsdom 可断言） ----------
   输入：lastSeenAt —— 服务端 last_seen_at（'YYYY-MM-DD HH:MM:SS'，users.last_seen_at，60s 节流刷新）；
        online —— 服务端按 ONLINE_THRESHOLD_SECONDS 计算的布尔；
        now（可选）—— 注入当前时间，便于边界测试；缺省取本机时间。
   规则：在线 → 「在线」（绿点由 CSS 类 .on 渲染）；字段缺失/无法解析 → ''（调用方不显示，绝不造假）；
        <5 分钟 → 「刚刚在线」；5 分钟~1 小时 → 「N分钟前」；跨自然日（昨天）→ 「昨天 HH:MM」；
        1~24 小时 → 「N小时前」；更久 → 「N天前」。 */
function formatPresence(lastSeenAt, online, now) {
  if (online) return '在线';
  if (!lastSeenAt) return '';
  var t = new Date(String(lastSeenAt).replace(' ', 'T'));
  if (isNaN(t.getTime())) return '';
  var ref = now ? new Date(now) : new Date();
  if (isNaN(ref.getTime())) ref = new Date();
  var diffMs = ref.getTime() - t.getTime();
  if (diffMs < 0) diffMs = 0; // 客户端时钟略慢于服务端时，按「刚刚」处理，绝不显示未来时间
  var diffMin = diffMs / 60000;
  if (diffMin < 5) return '刚刚在线';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // 跨自然日判定用 Date 回退一天再比对年月日（dayKey 数字减法会在月初/月初边界出错）
  var yesterday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 1);
  if (t.getFullYear() === yesterday.getFullYear() && t.getMonth() === yesterday.getMonth() && t.getDate() === yesterday.getDate()) {
    return '昨天 ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
  }
  if (diffMin < 60) return Math.floor(diffMin) + '分钟前';
  if (diffMin < 60 * 24) return Math.floor(diffMin / 60) + '小时前';
  return Math.floor(diffMin / (60 * 24)) + '天前';
}
window.formatPresence = formatPresence;

/* ---------- 个人中心：侧栏头像 / 页面渲染（含他人公开主页） ---------- */
function updateProfileUI() {
  var u = CURRENT_USER; if (!u) return;
  var av = document.querySelector('.user-card .user-avatar');
  if (av) {
    if (window.apiAvatarSrcOf(u)) av.innerHTML = window.apiAvatarHtml(u, (u.nickname || u.username || '学').slice(0, 1));
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
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="user" data-icon-size="18"></span></span>个人资料</div><div class="card-action">@${esc(u.username)}</div></div>
      <div style="display:flex;align-items:center;gap:16px;padding:6px 0;flex-wrap:wrap">
        <div class="profile-avatar-lg">${window.apiAvatarHtml(u, (u.nickname || '学').slice(0, 1))}</div>
        <div style="flex:1;min-width:180px"><div style="font-size:18px;font-weight:800;color:var(--text)">${esc(u.nickname)}</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${esc(u.motto || '')}</div></div>
        <button class="btn btn-outline" onclick="editProfile()"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 编辑资料</button>
        <button class="btn btn-danger" onclick="doLogout()"><span class="nav-icon" data-icon="logout" data-icon-size="14"></span> 退出登录</button>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">✅ 多用户在线版：资料保存在服务器数据库；头像为文件上传（不再 base64 入库）。</div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>发贴统计</div></div>
      <div class="profile-grid">
        ${[['pen', s.published || 0, '已发布'], ['save', s.draft || 0, '草稿'], ['inbox', s.archived || 0, '已归档'], ['thumbs-up', s.likes || 0, '总点赞'], ['message-square', s.comments || 0, '总评论'], ['eye', s.views || 0, '总阅读']].map(function (x) {
          return '<div class="profile-stat"><div class="ps-num"><span class="nav-icon" data-icon="' + x[0] + '" data-icon-size="14"></span> ' + x[1] + '</div><div class="ps-label">' + x[2] + '</div></div>';
        }).join('')}
      </div>
      <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px"><span class="nav-icon" data-icon="book-open" data-icon-size="14"></span> 发贴分类分布</div>${catBars}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportAllNotesMd()"><span class="nav-icon" data-icon="download" data-icon-size="14"></span> 导出全部 Markdown</button>
        <button class="btn btn-outline" onclick="navigateTo('blog')"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 去写发贴</button>
      </div>
    </div>`;
  if (window.lucideAutoRender) window.lucideAutoRender(); // J 批次：动态 data-icon span 重渲染
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
    actionBtns += ' <button class="btn btn-outline" onclick="chatWithUser(' + userId + ',\'' + esc(u.nickname) + '\')"><span class="nav-icon" data-icon="message-square" data-icon-size="14"></span> 发消息</button>';
    actionBtns += ' <button class="btn btn-danger" onclick="removeFriend(' + userId + ',\'' + esc(u.nickname) + '\')"><span class="nav-icon" data-icon="delete" data-icon-size="14"></span> 删除好友</button>';
  } else {
    actionBtns += ' <button class="btn btn-primary" onclick="addFriend(' + userId + ')"><span class="nav-icon" data-icon="user" data-icon-size="14"></span> 加为好友</button>';
  }
  var s = u.stats || {};
  
  box.innerHTML =
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="user" data-icon-size="18"></span></span>TA 的主页</div><div class="card-action">公开发贴 ' + u.notes.length + ' 篇</div></div>' +
      '<div style="display:flex;align-items:flex-start;gap:16px;padding:6px 0;flex-wrap:nowrap">' +
        '<div class="profile-avatar-lg" style="flex-shrink:0">' + window.apiAvatarHtml(u, (u.nickname || '学').slice(0, 1)) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:18px;font-weight:800;color:var(--text);word-break:break-word">' + esc(u.nickname) + '</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">@' + esc(u.username) + '</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5">' + esc(u.motto || '这个人很懒，什么都没写~') + '</div>' +
          (u.bio ? '<div style="font-size:13px;color:var(--text);margin-top:8px;line-height:1.7">' + esc(u.bio) + '</div>' : '') +
          // 批次二 需求6：公开主页响应自带 presence 白名单字段（lastSeenAt/online），有则显示相对时间；无后端/字段缺失时整行不渲染
          ((u.lastSeenAt || u.online) && typeof formatPresence === 'function'
            ? '<div style="font-size:12px;margin-top:6px;display:inline-flex;align-items:center;gap:5px"' + (u.online ? ' class="presence-line on"' : ' class="presence-line"') + '><span class="presence-dot' + (u.online ? ' on' : '') + '"></span>' + esc(formatPresence(u.lastSeenAt, u.online)) + '</div>'
            : '') +
          _profileMeta(u.gender, u.birthday, u.city) +
          (u.createdAt ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">📅 加入于 ' + esc(String(u.createdAt).slice(0, 10)) + '</div>' : '') +
          _tagChips(u.tags) + _goalLine(u.goal) +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">' + actionBtns + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">🔒 出于隐私保护：性别 / 生日不对外展示；草稿、私密、归档发贴不可见。</div>' +
    '</div>' +

    // ===== 创作数据（服务端可核算；学习时长等本机数据不对外） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>创作数据</div></div>' +
    '<div class="profile-grid">' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> ' + (s.published || 0) + '</div><div class="ps-label">公开发贴</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="thumbs-up" data-icon-size="14"></span> ' + (s.likes || 0) + '</div><div class="ps-label">获赞</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="eye" data-icon-size="14"></span> ' + (s.views || 0) + '</div><div class="ps-label">总阅读</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="message-square" data-icon-size="14"></span> ' + (s.comments || 0) + '</div><div class="ps-label">获评论</div></div>' +
    '</div></div>' +

    // ===== 成就徽章墙（按公开创作数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="trophy" data-icon-size="18"></span></span>TA 的成就</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🌱</div><div style="font-size:12px;margin-top:4px">初学者</div></div>' +
    ((s.published || 0) >= 1 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">✍️</div><div style="font-size:12px;margin-top:4px">处女作</div></div>' : '') +
    ((s.published || 0) >= 5 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">📚</div><div style="font-size:12px;margin-top:4px">勤于笔耕</div></div>' : '') +
    ((s.likes || 0) >= 10 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">👍</div><div style="font-size:12px;margin-top:4px">人气博主</div></div>' : '') +
    '</div></div>' +
    
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="pen" data-icon-size="18"></span></span>公开发贴</div></div>' +
      '<div class="blog-grid">' + cards + '</div>' +
    '</div>';
  if (window.lucideAutoRender) window.lucideAutoRender(); // J 批次：动态 data-icon span 重渲染
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
  /* 任务二十六·续（2026-09-17）：全站「看他人资料」入口统一到 个人资料.html?user=<uid>。
     旧的 个人中心.html?user= 作为兜底仍可用（renderUserHome，见本文件 261 行），一行可回退。 */
  if (document.getElementById('page-profile')) { location.href = '个人资料.html?user=' + uid; }
  else location.href = '个人资料.html?user=' + uid;
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
  if (window.apiAvatarSrcOf({ avatarUrl: apiAvatarTemp })) el.innerHTML = window.apiAvatarHtml({ avatarUrl: apiAvatarTemp }, ((u.nickname || u.username || '学') || '学').slice(0, 1));
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
  uiConfirm('确定要退出登录吗？', '退出').then(function (ok) { if (ok) apiForceLogout(); });
}
function closeLogoutConfirm() {
  var m = document.getElementById('logoutConfirmModal'); if (m) m.classList.remove('active');
}
function confirmLogout() { closeLogoutConfirm(); apiForceLogout(); }

/* R88-H / T04：位置 chip 渲染助手（只读 location 字符串；空值不渲染；绝不渲染坐标） */
function blogLocChipHtml(n) {
  var t = (n && n.location) ? String(n.location).trim() : '';
  if (!t) return '';
  return '<span class="blog-loc-chip" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--primary);background:color-mix(in srgb, var(--primary) 12%, transparent);border-radius:999px;padding:2px 8px;max-width:200px"><span class="nav-icon" data-icon="map-pin" data-icon-size="12"></span><span class="blog-loc-text" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t) + '</span></span>';
}

/* ---------- 发贴卡片（增加作者行 / 修正评论计数） ---------- */
function noteCardHtml(n, opts) {
  opts = opts || {};
  var cat = noteCat(n.category);
  var tags = (n.tags || []).map(function (t) {
    return '<span class="nc-tag" onclick="event.stopPropagation();blogTagFilter=\'' + esc(t) + '\';showBlogView(\'list\')">#' + esc(t) + '</span>';
  }).join('');
  var cmt = (n.commentsCount != null) ? n.commentsCount : ((n.comments || []).length);
  var stats = '<span><span class="nav-icon" data-icon="eye" data-icon-size="12"></span> ' + (n.views || 0) + '</span><span><span class="nav-icon" data-icon="thumbs-up" data-icon-size="12"></span> ' + (n.likes || 0) + '</span><span><span class="nav-icon" data-icon="message-square" data-icon-size="12"></span> ' + cmt + '</span>';
  var author = '';
  if (n.author && (!CURRENT_USER || n.author.id !== CURRENT_USER.id)) {
    var avUrl = n.author.avatarUrl ? apiFileUrl(n.author.avatarUrl) : '';
    var avHtml = avUrl
      ? '<img src="' + avUrl + '" style="width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;cursor:pointer" onclick="event.stopPropagation();openUserHome(' + n.author.id + ')">'
      : '<span style="cursor:pointer" onclick="event.stopPropagation();openUserHome(' + n.author.id + ')"><span class="nav-icon" data-icon="user" data-icon-size="14"></span> </span>';
    author = '<span onclick="event.stopPropagation();openUserHome(' + n.author.id + ')" style="cursor:pointer">' + avHtml + esc(n.author.nickname) + '</span>';
  }
  var acts = '';
  if (opts.mine) {
    var arch = n.status === 'archived';
    acts = '<div class="nc-actions" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">' +
      '<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();startEditNote(' + n.id + ')"><span class="nav-icon" data-icon="pen" data-icon-size="12"></span> 编辑</button>' +
      '<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();' + (arch ? 'unarchiveNote' : 'archiveNote') + '(' + n.id + ')">' + (arch ? '<span class="nav-icon" data-icon="send" data-icon-size="12"></span> 恢复' : '<span class="nav-icon" data-icon="inbox" data-icon-size="12"></span> 归档') + '</button>' +
      '<button class="btn btn-danger" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();deleteNote(' + n.id + ')"><span class="nav-icon" data-icon="delete" data-icon-size="12"></span> 删除</button></div>';
  }
  return '<div class="note-card" onclick="openBlogDetail(' + n.id + ')">' +
    noteCoverHtml(n) +
    '<div class="note-body">' +
    '<div class="nc-title">' + esc(n.title) + '</div>' +
    '<div class="nc-excerpt">' + esc(n.excerpt) + '</div>' +
    '<div class="nc-meta"><span class="nc-cat">' + cat.icon + ' ' + cat.name + '</span>' + author + blogLocChipHtml(n) + '<span>' + fmtTime(n.createdAt) + '</span></div>' +
    (tags ? '<div class="nc-tags">' + tags + '</div>' : '') +
    '<div class="nc-actions">' + stats + '</div>' + acts +
    '</div></div>';
}

/* ---------- 社区 / 我的文章 ---------- */
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
    if (window.lucideAutoRender) window.lucideAutoRender(); // K6：卡片统计行 data-icon 重渲染
    var empty = document.getElementById('blogListEmpty'); if (empty) empty.style.display = d.total ? 'none' : 'block';
    observeBlogSentinel();
  } catch (e) {
    grid.innerHTML = '';
    var empty2 = document.getElementById('blogListEmpty'); if (empty2) empty2.style.display = 'block';
    showToast('⚠️ 社区加载失败：' + e.message);
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
    var labels = [['all', '全部'], ['published', '<span class="nav-icon" data-icon="send" data-icon-size="12"></span> 已发布'], ['draft', '<span class="nav-icon" data-icon="save" data-icon-size="12"></span> 草稿'], ['archived', '<span class="nav-icon" data-icon="inbox" data-icon-size="12"></span> 归档'], ['favorite', '<span class="nav-icon" data-icon="bookmark" data-icon-size="12"></span> 收藏'], ['trash', '<span class="nav-icon" data-icon="delete" data-icon-size="12"></span> 回收站']];
    tabs.innerHTML = labels.map(function (x) {
      return '<span class="chip ' + (blogMineType === x[0] ? 'active' : '') + '" onclick="blogMineType=\'' + x[0] + '\';renderBlogMine()">' + x[1] + ' ' + counts[x[0]] + '</span>';
    }).join('');
    if (window.lucideAutoRender) window.lucideAutoRender(); // K6：动态插入的 data-icon 图标重渲染
    if (blogMineType === 'trash') {
      grid.innerHTML = trashItems.map(function (n) { return trashCardHtml(n); }).join('') ||
        '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px;grid-column:1/-1">回收站是空的，删除的发贴会在这里，可恢复或彻底删除</div>';
      if (window.lucideAutoRender) window.lucideAutoRender();
      return;
    }
    var arr = (blogMineType === 'favorite') ? fav.items : (blogMineType === 'all' ? items : items.filter(function (n) { return n.status === blogMineType; }));
    grid.innerHTML = arr.map(function (n) { return noteCardHtml(n, { mine: n.userId === (CURRENT_USER && CURRENT_USER.id) }); }).join('') ||
      '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px;grid-column:1/-1">还没有相关的发贴</div>';
    if (window.lucideAutoRender) window.lucideAutoRender();
  } catch (e) { showToast('⚠️ 我的文章加载失败：' + e.message); }
}

/* ---------- 回收站（软删除）：恢复 / 彻底删除 ---------- */
function trashCardHtml(n) {
  return '<div class="note-card" style="cursor:default;opacity:.86">' +
    noteCoverHtml(n) +
    '<div class="note-body">' +
    '<div class="nc-title">' + esc(n.title) + '</div>' +
    '<div class="nc-excerpt">' + esc(n.excerpt) + '</div>' +
    '<div class="nc-meta"><span><span class="nav-icon" data-icon="delete" data-icon-size="12"></span> 删除于 ' + fmtTime(n.deletedAt || n.updatedAt) + '</span></div>' +
    '<div class="nc-actions" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:8px">' +
    '<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="restoreTrashNote(' + n.id + ')"><span class="nav-icon" data-icon="rotate-ccw" data-icon-size="12"></span> 恢复</button>' +
    '<button class="btn btn-danger" style="padding:5px 10px;font-size:12px;flex:1" onclick="purgeTrashNote(' + n.id + ')"><span class="nav-icon" data-icon="delete" data-icon-size="12"></span> 彻底删除</button></div>' +
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
  // K5-云贴评论渲染重构（批次 20260913K）：
  // (a) 头像 bug 根因修复——服务端 comments 一直带 avatarUrl（c.author.avatar），
  //     旧渲染只取 nickname 首字符导致头像永远显示不出来；现 avatarUrl 存在优先 <img>，空值兜底首字符。
  // (b) replyTo 嵌套——兼容 c.replyTo（昵称）与 c.parentId（服务端字段）双通道，
  //     子楼层渲染为被回复评论下方缩进楼层（class="bc-item bc-reply"），多级回复统一挂到顶层祖先。
  // (c) 评论总数 >5 条折叠——默认显示前 3 条 + 「展开全部 N 条评论」按钮（class="bc-fold-btn"）。
  var rawComments = (n.comments || []).slice();
  var commentById = {};
  rawComments.forEach(function (c) { commentById[c.id] = c; });
  // 计算每条评论的被回复对象（只按昵称/parentId 匹配，找不到则视为顶层）
  var parentMap = {};
  var replyNameOf = function (c) {
    if (c.replyTo) return c.replyTo;
    if (c.parentId != null && commentById[c.parentId]) return commentById[c.parentId].nickname || '';
    return '';
  };
  rawComments.forEach(function (c) {
    var t = replyNameOf(c);
    if (!t) { parentMap[c.id] = null; return; }
    var hit = null;
    for (var i = 0; i < rawComments.length; i++) {
      var p = rawComments[i];
      if (p.id !== c.id && (p.nickname || '') === t) { hit = p; break; }
    }
    parentMap[c.id] = hit;
  });
  var topComments = [], childMap = {};
  rawComments.forEach(function (c) {
    var p = parentMap[c.id], guard = 0;
    while (p && parentMap[p.id] && guard++ < 10) p = parentMap[p.id]; // 多级回复收敛到顶层
    if (p && p.id !== c.id) { (childMap[p.id] = childMap[p.id] || []).push(c); }
    else topComments.push(c);
  });
  var canDelOf = function (c) { return CURRENT_USER && (c.userId === CURRENT_USER.id || isMine); };
  var bcItemHtml = function (c, nested) {
    var avUrl = c.avatarUrl ? apiFileUrl(c.avatarUrl) : '';
    var avatarHtml = avUrl
      ? '<img src="' + avUrl + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">'
      : esc((c.nickname || '学').slice(0, 1));
    // 顶层评论若带回复标记（replyTo 未匹配到楼层时）保留「回复 @xx」提示
    var replyMark = (!nested && !parentMap[c.id] && replyNameOf(c))
      ? '<span style="font-size:11px;color:var(--text-muted);margin:0 4px">回复 @' + esc(replyNameOf(c)) + '</span>' : '';
    var kids = (childMap[c.id] || []).map(function (k) { return bcItemHtml(k, true); }).join('');
    return '<div class="bc-item' + (nested ? ' bc-reply' : '') + '"' + (nested ? ' style="margin-left:34px"' : '') + '>' +
      '<div class="bc-avatar" style="cursor:pointer;overflow:hidden" onclick="openUserHome(' + c.userId + ')">' + avatarHtml + '</div>' +
      '<div class="bc-body"><div class="bc-head"><span style="cursor:pointer" onclick="openUserHome(' + c.userId + ')">' + esc(c.nickname) + '</span>' + replyMark + '<span>' + fmtTime(c.time) + '</span></div>' +
      '<div class="bc-text">' + esc(c.text) + '</div>' + kids + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">' +
      '<button style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:11px;padding:0" onclick="setReplyTo(' + c.id + ',\'' + esc(c.nickname) + '\')">回复</button>' +
      (canDelOf(c) ? '<button style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:11px;padding:0" onclick="deleteBlogComment(' + c.id + ')">删除</button>' : '') +
      '</div></div>';
  };
  var comments;
  if (!topComments.length) {
    comments = '<div style="color:var(--text-secondary);font-size:12px;padding:6px 0">暂无评论，来抢沙发～</div>';
  } else {
    var visibleHtml = topComments.slice(0, 3).map(function (c) { return bcItemHtml(c, false); }).join('');
    var restHtml = topComments.slice(3).map(function (c) { return bcItemHtml(c, false); }).join('');
    if (rawComments.length > 5 && restHtml) {
      comments = visibleHtml +
        '<div id="bcFoldedBox" style="display:none">' + restHtml + '</div>' +
        '<button class="bc-fold-btn" data-total="' + rawComments.length + '" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:12px;padding:6px 0" onclick="toggleBcFold()">展开全部 ' + rawComments.length + ' 条评论</button>';
    } else {
      comments = visibleHtml + restHtml;
    }
  }
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
        <span style="cursor:pointer" onclick="openUserHome(${n.author ? n.author.id : 0})"><span class="nav-icon" data-icon="user" data-icon-size="12"></span> ${n.author ? esc(n.author.nickname) : '未知'}</span>
        <span><span class="nav-icon" data-icon="eye" data-icon-size="12"></span> ${n.views || 0} 次阅读</span>
        <span><span class="nav-icon" data-icon="clock" data-icon-size="12"></span> 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>
        ${blogLocChipHtml(n)}
        <span>${n.privacy === 'private' ? '<span class="nav-icon" data-icon="locked" data-icon-size="12"></span> 私密' : '<span class="nav-icon" data-icon="globe" data-icon-size="12"></span> 公开'}</span>
      </div>
      <div class="note-interact">
        <button class="ni-btn ${n.liked ? 'active' : ''}" onclick="toggleNoteLike()"><span class="nav-icon" data-icon="thumbs-up" data-icon-size="14"></span> 赞 ${n.likes || 0}</button>
        <button class="ni-btn ${fav ? 'active' : ''}" onclick="toggleNoteFavorite()">${fav ? '★ 已收藏' : '☆ 收藏'}</button>
        <button class="ni-btn" onclick="exportCurrentNoteMd()"><span class="nav-icon" data-icon="download" data-icon-size="14"></span> 导出 Markdown</button>
        ${isMine ? '<button class="ni-btn" onclick="startEditNote(' + n.id + ')"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 编辑</button>' : ''}
        <div class="spacer" style="flex:1"></div>
      </div>
      ${tags ? '<div class="note-detail-tags">' + tags + '</div>' : ''}
    </div>
    <div class="note-detail-box"><div class="nd-content">${reactMarkdown(n.content)}</div></div>
    ${pager}
    <div class="blog-comments">
      <div class="bc-title"><span class="nav-icon" data-icon="message-square" data-icon-size="16"></span> 评论区（${(n.comments || []).length}）</div>
      <div class="bc-input-row">
        <div id="replyHint" style="display:none;font-size:12px;color:var(--primary);margin-bottom:4px">回复 @<span id="replyToName"></span> <a href="javascript:void(0)" onclick="cancelReply()" style="color:var(--text-muted);margin-left:8px">取消</a></div>
        <input type="text" id="bcInput" placeholder="留言讨论知识点，共同学得更牢…">
        <button class="btn btn-primary" onclick="addBlogComment()">发送</button>
      </div>
      <div class="bc-list">${comments}</div>
    </div>`;
  var inp = document.getElementById('bcInput');
  if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addBlogComment(); });
  if (window.lucideAutoRender) window.lucideAutoRender(); // K6：动态插入的 data-icon 图标重渲染
}

/* K5：评论区折叠展开（配合 renderBlogDetail 的 bc-fold-btn） */
function toggleBcFold() {
  var box = document.getElementById('bcFoldedBox');
  if (!box) return;
  var btn = document.querySelector('.bc-fold-btn');
  var opening = box.style.display === 'none';
  box.style.display = opening ? 'block' : 'none';
  if (btn) {
    var total = btn.getAttribute('data-total') || '';
    btn.textContent = opening ? '收起评论' : '展开全部 ' + total + ' 条评论';
  }
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
    document.getElementById('blogEditStatus').textContent = '正在编辑：' + n.title + '（创建于 ' + fmtTime(n.createdAt) + '）';
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
  var payload = { title: title, content: content, category: cat, privacy: privacy, status: status, cover: cover, tags: tags, location: (document.getElementById('blogLocChip') && document.getElementById('blogLocChip').getAttribute('data-loc')) || '' };
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
/* 离线/未登录（或 CURRENT_USER 尚未拉取完成）时的本机统计兜底：
   否则 api.js 版 renderBlogStats 会直接 return，统计视图只剩空壳（橙色空白）。 */
function blogLocalStats() {
  var ns = (typeof appData !== 'undefined' && appData && appData.notes) || [];
  var pub = ns.filter(function (n) { return n.status === 'published'; });
  var cat = {};
  ns.forEach(function (n) { var id = noteCat(n.category).id; cat[id] = (cat[id] || 0) + 1; });
  return {
    published: pub.length,
    draft: ns.filter(function (n) { return n.status === 'draft'; }).length,
    archived: ns.filter(function (n) { return n.status === 'archived'; }).length,
    likes: pub.reduce(function (a, n) { return a + (n.likes || 0); }, 0),
    comments: pub.reduce(function (a, n) { return a + ((n.comments || []).length); }, 0),
    views: pub.reduce(function (a, n) { return a + (n.views || 0); }, 0),
    catCount: cat
  };
}
function renderBlogStats() {
  var box = document.getElementById('blogStatsBox'); if (!box) return;
  var s = CURRENT_USER ? (CURRENT_USER.stats || {}) : blogLocalStats();
  var catCount = s.catCount || {};
  var maxCat = Math.max(1, ...Object.values(catCount));
  var catBars = BLOG_CATS.filter(function (c) { return catCount[c.id]; }).map(function (c) {
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="width:110px;font-size:12px;color:var(--text-secondary)">' + c.icon + ' ' + c.name + '</span>' +
      '<div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:' + Math.round(catCount[c.id] / maxCat * 100) + '%;background:linear-gradient(90deg,' + noteColors(c.id)[0] + ',' + noteColors(c.id)[1] + ')"></div></div>' +
      '<span style="width:60px;font-size:12px;color:var(--text-secondary)">' + catCount[c.id] + ' 篇</span></div>';
  }).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有发贴，去“✍️ 写发贴”试试吧</div>';
  box.innerHTML = `
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>帖子数据统计</div></div>
      <div class="blog-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        ${[['pen', s.published || 0, '已发布'], ['save', s.draft || 0, '草稿'], ['inbox', s.archived || 0, '已归档'], ['thumbs-up', s.likes || 0, '总点赞'], ['message-square', s.comments || 0, '总评论'], ['eye', s.views || 0, '总阅读']].map(function (x) {
          return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--text)"><span class="nav-icon" data-icon="' + x[0] + '" data-icon-size="16"></span> ' + x[1] + '</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + x[2] + '</div></div>';
        }).join('')}
      </div>
      <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px"><span class="nav-icon" data-icon="book-open" data-icon-size="14"></span> 发贴分类分布</div>${catBars}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="location.href='个人中心.html'"><span class="nav-icon" data-icon="user" data-icon-size="14"></span> 前往个人中心</button>
        <button class="btn btn-outline" onclick="exportAllNotesMd()"><span class="nav-icon" data-icon="download" data-icon-size="14"></span> 导出全部 Markdown</button>
      </div>
    </div>`;
  if (window.lucideAutoRender) window.lucideAutoRender(); // J 批次：动态 data-icon span 重渲染
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
  dd.innerHTML = '<div class="gs-empty"><span class="nav-icon" data-icon="search" data-icon-size="16"></span> 搜索中…</div>';
  if (window.lucideAutoRender) window.lucideAutoRender();
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
      return { icon: '<span class="nav-icon" data-icon="pen" data-icon-size="16"></span>', title: n.title, desc: desc, action: "if(document.getElementById('page-blog')){closeGsDropdown();openBlogDetail(" + n.id + ");}else{location.href='社区.html#note=" + n.id + "';}" };
    });
    var noteCount = results.length;
    MODULE_INDEX.forEach(function (m) {
      if ((m.title + ' ' + m.kw + ' ' + m.desc).toLowerCase().includes(kw)) {
        results.push({ icon: m.icon, title: m.title, desc: m.desc, action: "navigateTo('" + m.page + "');closeGsDropdown()" });
      }
    });
    var shown = results.slice(0, 9);
    var html = '';
    if (noteCount > 0) html += '<div class="gs-group"><span class="nav-icon" data-icon="book-open" data-icon-size="14"></span> 公开发贴（' + noteCount + '）</div>';
    html += shown.slice(0, noteCount).map(function (r) {
      return '<div class="gs-item" onclick="' + r.action.replace(/"/g, '&quot;') + '"><div class="gs-item-icon">' + r.icon + '</div><div class="gs-item-main"><div class="gs-item-title">' + gsHighlight(r.title, kw) + '</div><div class="gs-item-desc">' + gsEscape(r.desc) + '</div></div></div>';
    }).join('');
    if (shown.length > noteCount) html += '<div class="gs-group"><span class="nav-icon" data-icon="map" data-icon-size="14"></span> 学习模块</div>';
    html += shown.slice(noteCount).map(function (r) {
      return '<div class="gs-item" onclick="navigateTo(\'' + (MODULE_INDEX.find(function (m) { return m.title === r.title; }) || {}).page + '\');closeGsDropdown()"><div class="gs-item-icon">' + r.icon + '</div><div class="gs-item-main"><div class="gs-item-title">' + gsHighlight(r.title, kw) + '</div><div class="gs-item-desc">' + gsEscape(r.desc) + '</div></div></div>';
    }).join('');
    if (!shown.length) html = '<div class="gs-empty">没有找到「' + gsEscape(kw) + '」相关内容<br>试试：四级 / 行测 / 面试 / PPT / 发贴关键词</div>';
    else if (results.length > 9) html += '<div class="gs-empty">还有 ' + (results.length - 9) + ' 条结果未显示，换个更具体的关键词试试</div>';
    dd.innerHTML = html;
    if (window.lucideAutoRender) window.lucideAutoRender(); // K6：搜索结果 data-icon 重渲染
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
  /* 需求B（2026-09-22，主理人补完）：aiStream「流式输出」开关端到端接线。
     本函数才是真正生效的 AI 聊天路径——api.js 在 app.js 之后加载，同名全局
     function sendAiMsg 覆盖了 app.js 那一版，所以前缀侧渲染门控必须落在这里。
     读：getSetting('aiStream')，缺省 true（保持历史行为不变）；
     写：随请求体下发 stream 字段（协议留痕，服务端未声明该字段时会忽略）；
     消费：false 时不再做逐字递增渲染，整段返回后一次性渲染；true 时沿用
           reader 增量渲染（打字机观感）。 */
  var aiStreamOn = true;
  try { if (typeof getSetting === 'function') aiStreamOn = (getSetting('aiStream') !== false); } catch (e0) { aiStreamOn = true; }
  try {
    var res = await apiAuthedFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiGetToken() },
      body: JSON.stringify((function () { var o = { provider: modelId, messages: buildAiContextMessages(), stream: aiStreamOn }; try { if (typeof getSetting === 'function') { var t = getSetting('aiTemp'); if (t !== '' && t != null) o.temperature = Math.min(2, Math.max(0, +t)); var mx = getSetting('aiMax'); if (mx !== '' && mx != null) o.maxTokens = Math.min(8192, Math.max(64, +mx)); } } catch (e) {} return o; })())
    });
    if (!res.ok) {
      var detail = '';
      try { detail = (await res.json()).detail || ''; } catch (e) { }
      throw new Error(detail || ('HTTP ' + res.status));
    }
    if (aiStreamOn) {
      var reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var acc = '';
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        acc += decoder.decode(r.value, { stream: true });
        bubble.textContent = acc;   // 增量渲染：打字机观感
        scrollAiMessages();
      }
      if (!acc) acc = '(模型返回了空回复)';
      finishStreaming('ai', acc);
    } else {
      // 关闭「流式输出」：读满整段再一次性渲染，不再逐字递增（光标态同步撤掉）
      var full = await res.text();
      if (!full) full = '(模型返回了空回复)';
      try { bubble.classList.remove('typing'); } catch (e2) { }
      bubble.textContent = full;
      scrollAiMessages();
      finishStreaming('ai', full);
    }
  } catch (e) {
    finishStreaming('ai', '⚠️ AI 服务连接失败：' + e.message + '\n\n请确认：① 后端已启动（uvicorn main:app --port 8000）② server/.env 里已配置对应模型的 API Key。');
  }
}

/* 注意：assets/app.js 里有同名 editorAiAssist（支持服务商直连 + 本地演示兜底，更完备）。
   本函数曾因 api.js 后于 app.js 加载而覆盖掉它，导致无后端/无密钥时「AI 辅助写发贴」直接失败。
   现改名保留为纯后端通道实现，不再抢占全局名；页面 onclick 会解析到 app.js 那版。 */
async function editorAiAssistViaApi() {
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
  
  // 注意：aip* 表单由 app.js 动态渲染，当前页面未必存在，必须判空否则直接 TypeError
  var elSelect = document.getElementById('aipSelect');
  var elModel = document.getElementById('aipModel');
  var elBaseUrl = document.getElementById('aipBaseUrl');

  if (matchedProvider) {
    if (elSelect) elSelect.value = matchedProvider.id;
    if (elModel) elModel.value = modelId;
    if (elBaseUrl) elBaseUrl.value = matchedProvider.baseUrl;
    if (typeof onAiProviderChange === 'function') onAiProviderChange();
    showToast('✅ 已选择 ' + modelId + '，请填写API Key');
  } else {
    if (elModel) elModel.value = modelId;
    showToast('✅ 已选择 ' + modelId + '，请填写接口地址和API Key');
  }
}

// 保存前端直连配置
function saveAiProviderFormLocal() {
  // 同上：节点可能不存在（面板动态渲染），缺失时静默跳过，不抛错
  var elSelect = document.getElementById('aipSelect');
  var elModel = document.getElementById('aipModel');
  var elBaseUrl = document.getElementById('aipBaseUrl');
  var elKey = document.getElementById('aipKey');
  if (!elModel || !elBaseUrl || !elKey) return;
  var provider = elSelect ? elSelect.value : '';
  var model = elModel.value;
  var baseUrl = elBaseUrl.value;
  var apiKey = elKey.value;
  
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
  el.innerHTML = '<span class="nav-icon" data-icon="bell" data-icon-size="18"></span><span class="notify-badge" id="notifyBadge" style="display:none"></span>';
  el.addEventListener('click', function (e) { e.stopPropagation(); toggleNotifyPanel(); });
  var anchor = bar.querySelector('.topbar-stats');
  if (anchor) bar.insertBefore(el, anchor); else bar.appendChild(el);
  if (window.lucideAutoRender) window.lucideAutoRender(); // K6：动态插入的 data-icon 图标重渲染
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
      showToast('收到新的点赞 / 评论消息');
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
  panel.innerHTML = '<div class="gs-empty"><span class="nav-icon" data-icon="bell" data-icon-size="16"></span> 加载中…</div>';
  if (window.lucideAutoRender) window.lucideAutoRender();
  loadNotifications(true).then(function (d) { if (d) renderNotifyPanel(d.items); });
}
function renderNotifyPanel(items) {
  var panel = document.getElementById('notifyPanel'); if (!panel) return;
  var html = '<div class="notify-head"><b><span class="nav-icon" data-icon="bell" data-icon-size="16"></span> 消息通知</b><button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="markAllRead()">全部已读</button></div>';
  if (!items || !items.length) html += '<div class="gs-empty">暂无消息，收到点赞 / 评论会在这里提醒</div>';
  else html += items.map(function (x) {
    var icon = '<span class="nav-icon" data-icon="' + (x.type === 'like' ? 'thumbs-up' : 'message-square') + '" data-icon-size="14" style="vertical-align:-2px"></span>';
    var txt = icon + ' <b>' + esc(x.actor) + '</b> ' + (x.type === 'like' ? '赞了你的发贴' : '评论了你的发贴') + '《' + esc(x.noteTitle) + '》';
    return '<div class="notify-item' + (x.isRead ? '' : ' unread') + '" onclick="openNotifyNote(' + (x.noteId || 0) + ')">' +
      '<div class="notify-text">' + txt + '</div><div class="notify-time">' + fmtTime(x.createdAt) + '</div></div>';
  }).join('');
  panel.innerHTML = html;
  if (window.lucideAutoRender) window.lucideAutoRender(); // K6：动态插入的 data-icon 图标重渲染
}
function openNotifyNote(noteId) {
  var panel = document.getElementById('notifyPanel'); if (panel) panel.classList.remove('open');
  if (!noteId) return;
  if (document.getElementById('page-blog')) { openBlogDetail(noteId); }
  else location.href = '社区.html#note=' + noteId;
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
  el.innerHTML = '<span class="nav-icon" data-icon="message-square" data-icon-size="18"></span><span class="notify-badge" id="chatBadge" style="display:none"></span>';
  el.addEventListener('click', function () { location.href = '私聊.html'; });
  var anchor = bar.querySelector('.topbar-stats');
  if (anchor) bar.insertBefore(el, anchor); else bar.appendChild(el);
  if (window.lucideAutoRender) window.lucideAutoRender(); // K6：动态插入的 data-icon 图标重渲染
}
function renderChatBadge(n) {
  var b = document.getElementById('chatBadge'); if (!b) return;
  b.style.display = n ? 'inline-block' : 'none';
  b.textContent = n > 99 ? '99+' : n;
}
var chatUnread = 0;
var chatUnreadPrev = -1;

/* ---------- R72（Bug1/Bug3）：好友私信 —— 会话列表 / 好友备注封装 ----------
   与上面的 api() 同一套封装：自动带 Bearer、401 静默刷新一次、非 2xx 抛 Error(detail)。
   chat-local.js 优先调用这些封装，拿不到时自行 fetch 兜底（本文件未加载 / 老缓存场景）。 */
async function apiGetChatConversations(limit) {
  var q = (limit != null) ? ('?limit=' + encodeURIComponent(limit)) : '';
  return api('/api/chat/conversations' + q);
}
async function apiSetFriendRemark(peerId, remark) {
  return api('/api/friends/' + Number(peerId) + '/remark', {
    method: 'PUT',
    body: { remark: (remark == null ? '' : String(remark)) }
  });
}
window.apiGetChatConversations = apiGetChatConversations;
window.apiSetFriendRemark = apiSetFriendRemark;

async function loadChatUnread() {
  if (!apiGetToken()) return;
  try {
    var d = await api('/api/chat/unread');
    renderChatBadge(d.total || 0);
    // 收到新私信提醒（仅当前不在私聊页时，且「提醒与通知」里开启）
    var chatOn = !(typeof getSetting === 'function') || getSetting('chatNotify') !== false;
    if (chatOn && chatUnreadPrev >= 0 && (d.total || 0) > chatUnreadPrev && !location.pathname.endsWith('私聊.html')) {
      if (typeof showToast === 'function') showToast('收到新的私信，点右上角消息图标查看');
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
    // 需求15（数据按账号隔离）：写账号前缀键（app.js 定义 lsKey；本文件兜底）
    localStorage.setItem((typeof window.lsKey === 'function' ? window.lsKey('study_workbench_ai_chat') : 'study_workbench_ai_chat'), JSON.stringify(aiChatHistory));
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
  if (!await uiConfirm('将把本机 localStorage 中的 ' + local.length + ' 篇发贴上传到服务器（当前账号名下）。\n已迁移过的发贴会自动跳过，确定继续吗？')) return;
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
  return g ? '<div class="pp-goal"><span class="nav-icon" data-icon="target" data-icon-size="14" style="vertical-align:-2px"></span> 学习目标：<b>' + esc(g) + '</b></div>' : '';
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
  /* 缺口1修复（2026-09-17）：把「看他人主页」与「当前是否登录」拆开判定，
     否则未登录/离线时点别人头像会落到 _renderProfileLocal → 显示本机（自己）资料。
     顺序铁律：① 合法 user 参数但未登录 → 需登录空态；② 已登录且非本人 → renderUserHome；
     ③ 其余（无 user 参数，或 user 就是自己）→ 本人视角，行为完全不变。 */
  var okOther = !!otherId && /^\d+$/.test(String(otherId).trim());
  if (okOther && !CURRENT_USER) {
    box.innerHTML =
      '<div class="card" style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:16px;font-weight:700;color:var(--text)">需登录后查看 TA 的主页</div>' +
      '<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;line-height:1.7">登录后即可查看对方的公开资料与发贴（性别、生日等隐私信息不会对外展示）。</div>' +
      '<div style="margin-top:16px"><a class="btn btn-primary" href="登录.html">去登录</a></div>' +
      '</div>';
    return;
  }
  if (okOther && CURRENT_USER && Number(otherId) !== CURRENT_USER.id) { renderUserHome(Number(otherId), box); return; }
  var src = _peSource();
  if (src.online) { _renderProfileOnline(box, src.u); return; }
  _renderProfileLocal(box, src.p);
}

function _renderProfileLocal(box, p) {
  p = p || {};
  // 2026-09-15 用户反馈：资料卡布局重构，头像信息左右结构 + 操作区分层
  var avatar = window.apiAvatarHtml(p, (p.avatar || '学').slice(0, 1));
  /* 2026-09-16：头像渲染已统一到 window.apiAvatarHtml（avatarUrl / avatarImg 双兼容 + apiFileUrl 转换 + onerror 兜底），不再用 /^data:image\// 一票否决 */
  var metaParts = [_genderSym(p.gender), _ageOf(p.birthday), (p.city || '').trim(), (p.goal || '').trim() ? '目标 ' + p.goal.trim() : ''].filter(function (x) { return x; });
  var metaHtml = metaParts.length ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.6">' + esc(metaParts.join(' · ')) + '</div>' : '';
  box.innerHTML =
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="user" data-icon-size="18"></span></span>个人资料</div><div class="card-action">本地单机</div></div>' +
    '<div style="display:flex;align-items:flex-start;gap:16px;padding:6px 0;flex-wrap:nowrap">' +
    '<div class="profile-avatar-lg" style="flex-shrink:0">' + avatar + '</div>' +
    '<div style="flex:1;min-width:0">' +
    '<div style="font-size:18px;font-weight:800;color:var(--text);word-break:break-word">' + esc(p.name || '同学') + '</div>' +
    (p.motto ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5">' + esc(p.motto) + '</div>' : '') +
    (p.bio ? '<div style="font-size:13px;color:var(--text);margin-top:8px;line-height:1.7">' + esc(p.bio) + '</div>' : '') +
    metaHtml + _tagChips(p.tags) +
    '</div></div>' +
    // 操作区分层：编辑资料主按钮（本地模式不显示「我的动态」）
    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary" onclick="editProfile()"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 编辑资料</button></div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.8">📱 当前为本地单机模式，资料保存在本机浏览器。在线登录后资料/发贴会存到服务器并可多端同步。</div>' +
    // 退出登录降级为卡片底部文本链接（确认逻辑沿用 doLogout）
    '<div style="margin-top:12px"><a href="javascript:void(0)" onclick="doLogout()" style="font-size:13px;color:var(--danger);text-decoration:none"><span class="nav-icon" data-icon="logout" data-icon-size="13" style="vertical-align:-1px"></span> 退出登录</a></div>' +
    '</div>' +
    _localNotesCard();
  if (window.lucideAutoRender) window.lucideAutoRender(); // J 批次：动态 data-icon span 重渲染
}

function _localNotesCard() {
  var notes = (typeof appData !== 'undefined' && appData && appData.notes) || [];
  var pub = notes.filter(function (n) { return n.status === 'published'; });
  var draft = notes.filter(function (n) { return n.status === 'draft'; });
  var likes = pub.reduce(function (s, n) { return s + (n.likes || 0); }, 0);
  var views = pub.reduce(function (s, n) { return s + (n.views || 0); }, 0);
  var d = (typeof appData !== 'undefined' && appData && appData.stats) || {};
  var acc = d.totalQuestions > 0 ? Math.round(d.correctQuestions / d.totalQuestions * 100) : 0;
  return '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>本机发贴统计</div></div>' +
    '<div class="profile-grid">' +
    [['pen', pub.length, '已发布'], ['save', draft.length, '草稿'], ['thumbs-up', likes, '点赞'], ['eye', views, '阅读']].map(function (x) {
      return '<div class="profile-stat"><div class="ps-num"><span class="nav-icon" data-icon="' + x[0] + '" data-icon-size="14"></span> ' + x[1] + '</div><div class="ps-label">' + x[2] + '</div></div>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="exportAllNotesMd()"><span class="nav-icon" data-icon="download" data-icon-size="14"></span> 导出全部 Markdown</button>' +
    '<button class="btn btn-outline" onclick="location.href=' + "'社区.html'" + '"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 去写发贴</button></div></div>' +

    // ===== 今日学习时长（本机计时，与设置页上限联动）=====
    (function () {
      var st = (typeof loadAllSettings === 'function') ? loadAllSettings() : {};
      var txt = (typeof getTodayStudyText === 'function') ? getTodayStudyText() : '0 分钟';
      var on = st.studyLimitOn !== false;
      return '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="clock" data-icon-size="18"></span></span>今日学习时长</div>' +
        '<div class="card-action">上限 ' + (on ? (st.studyLimitHours || 4) + ' 小时' : '未启用') + '</div></div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0">' +
        '<span id="pcStudyTime" style="font-size:26px;font-weight:800;color:var(--primary)">' + txt + '</span>' +
        '<span id="pcStudyTimeTip" style="font-size:12px;color:var(--text-secondary)"></span></div>' +
        '<div class="pc-studytime-bar"><i id="pcStudyTimeBar"></i></div>' +
        '</div>';
    })() +

    // ===== 学习数据概览（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>学习数据</div></div>' +
    '<div class="profile-grid">' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="fire" data-icon-size="14"></span> ' + (d.streakDays || 0) + '</div><div class="ps-label">连续打卡</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="clock" data-icon-size="14"></span> ' + (d.totalHours || 0) + 'h</div><div class="ps-label">总学习时长</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="clipboard" data-icon-size="14"></span> ' + (d.totalQuestions || 0) + '</div><div class="ps-label">做题总数</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="target" data-icon-size="14"></span> ' + acc + '%</div><div class="ps-label">正确率</div></div>' +
    '</div></div>' +

    // ===== 成就徽章墙（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="trophy" data-icon-size="18"></span></span>我的成就</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🌱</div><div style="font-size:12px;margin-top:4px">初学者</div></div>' +
    ((d.streakDays || 0) >= 7 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🔥</div><div style="font-size:12px;margin-top:4px">坚持一周</div></div>' : '') +
    ((d.totalQuestions || 0) >= 100 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🧮</div><div style="font-size:12px;margin-top:4px">百题斩</div></div>' : '') +
    ((d.totalQuestions || 0) >= 500 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">💪</div><div style="font-size:12px;margin-top:4px">刷题达人</div></div>' : '') +
    '</div></div>' +

    // ===== 新增：学习模块快捷入口 =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="book-open" data-icon-size="18"></span></span>学习模块</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div onclick="location.href=' + "'错题本.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px"><span class="nav-icon" data-icon="book" data-icon-size="22"></span></div><div style="font-size:12px;margin-top:4px">错题本</div></div>' +
    '<div onclick="location.href=' + "'四级词汇.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px"><span class="nav-icon" data-icon="book-open" data-icon-size="22"></span></div><div style="font-size:12px;margin-top:4px">四级词汇</div></div>' +
    '<div onclick="location.href=' + "'行测.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px"><span class="nav-icon" data-icon="pen" data-icon-size="22"></span></div><div style="font-size:12px;margin-top:4px">行测刷题</div></div>' +
    '</div></div>';
  if (window.lucideAutoRender) window.lucideAutoRender(); // J 批次：动态 data-icon span 重渲染
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
  // 2026-09-15 用户反馈：资料卡布局重构，头像信息左右结构 + 操作区分层
  var metaParts = [(u.city || '').trim(), (u.goal || '').trim() ? '目标 ' + u.goal.trim() : '', u.createdAt ? '加入于 ' + u.createdAt : ''].filter(function (x) { return x; });
  var metaHtml = metaParts.length ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.6">' + esc(metaParts.join(' · ')) + '</div>' : '';
  box.innerHTML =
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="user" data-icon-size="18"></span></span>个人资料</div><div class="card-action">@' + esc(u.username) + '</div></div>' +
    '<div style="display:flex;align-items:flex-start;gap:16px;padding:6px 0;flex-wrap:nowrap">' +
    '<div class="profile-avatar-lg" style="flex-shrink:0">' + window.apiAvatarHtml(u, (u.nickname || '学').slice(0, 1)) + '</div>' +
    '<div style="flex:1;min-width:0">' +
    '<div style="font-size:18px;font-weight:800;color:var(--text);word-break:break-word">' + esc(u.nickname) + '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px">@' + esc(u.username) + '</div>' +
    (u.motto ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5">' + esc(u.motto) + '</div>' : '') +
    // 公开主页：性别/生日一律不传（即使服务端异常返回也不展示），只展示城市
    (u.bio ? '<div style="font-size:13px;color:var(--text);margin-top:8px;line-height:1.7">' + esc(u.bio) + '</div>' : '') +
    metaHtml + _tagChips(u.tags) +
    '</div></div>' +
    // 操作区分层：编辑资料主按钮 + 我的动态次按钮（自视角，跳动态页）
    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" onclick="editProfile()"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 编辑资料</button>' +
    '<button class="btn btn-outline" onclick="location.href=' + "'动态空间.html?user=" + u.id + "'" + '"><span class="nav-icon" data-icon="rss" data-icon-size="14"></span> 我的动态</button></div>' +
    // 退出登录降级为卡片底部文本链接（确认逻辑沿用 doLogout）
    '<div style="margin-top:12px"><a href="javascript:void(0)" onclick="doLogout()" style="font-size:13px;color:var(--danger);text-decoration:none"><span class="nav-icon" data-icon="logout" data-icon-size="13" style="vertical-align:-1px"></span> 退出登录</a></div>' +
    '</div>' +
    '<div class="card"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>发贴统计</div></div>' +
    '<div class="profile-grid">' +
    [['pen', s.published || 0, '已发布'], ['save', s.draft || 0, '草稿'], ['inbox', s.archived || 0, '归档'], ['thumbs-up', s.likes || 0, '总点赞'], ['message-square', s.comments || 0, '评论'], ['eye', s.views || 0, '阅读']].map(function (x) {
      return '<div class="profile-stat"><div class="ps-num"><span class="nav-icon" data-icon="' + x[0] + '" data-icon-size="14"></span> ' + x[1] + '</div><div class="ps-label">' + x[2] + '</div></div>';
    }).join('') + '</div>' +
    '<div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px"><span class="nav-icon" data-icon="book-open" data-icon-size="14"></span> 发贴分类分布</div>' + catBars + '</div>' +
    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="exportAllNotesMd()"><span class="nav-icon" data-icon="download" data-icon-size="14"></span> 导出全部 Markdown</button>' +
    '<button class="btn btn-outline" onclick="location.href=' + "'社区.html'" + '"><span class="nav-icon" data-icon="pen" data-icon-size="14"></span> 去写发贴</button></div></div>' +

    // ===== 今日学习时长（本机计时，与设置页上限联动）=====
    (function () {
      var st = (typeof loadAllSettings === 'function') ? loadAllSettings() : {};
      var txt = (typeof getTodayStudyText === 'function') ? getTodayStudyText() : '0 分钟';
      var on = st.studyLimitOn !== false;
      return '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="clock" data-icon-size="18"></span></span>今日学习时长</div>' +
        '<div class="card-action">上限 ' + (on ? (st.studyLimitHours || 4) + ' 小时' : '未启用') + '</div></div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0">' +
        '<span id="pcStudyTime" style="font-size:26px;font-weight:800;color:var(--primary)">' + txt + '</span>' +
        '<span id="pcStudyTimeTip" style="font-size:12px;color:var(--text-secondary)"></span></div>' +
        '<div class="pc-studytime-bar"><i id="pcStudyTimeBar"></i></div>' +
        '</div>';
    })() +

    // ===== 学习数据概览（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="chart-bar" data-icon-size="18"></span></span>学习数据</div></div>' +
    '<div class="profile-grid">' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="fire" data-icon-size="14"></span> ' + (d.streakDays || 0) + '</div><div class="ps-label">连续打卡</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="clock" data-icon-size="14"></span> ' + (d.totalHours || 0) + 'h</div><div class="ps-label">总学习时长</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="clipboard" data-icon-size="14"></span> ' + (d.totalQuestions || 0) + '</div><div class="ps-label">做题总数</div></div>' +
    '<div class="profile-stat"><div class="ps-num" style="color:var(--primary)"><span class="nav-icon" data-icon="target" data-icon-size="14"></span> ' + acc + '%</div><div class="ps-label">正确率</div></div>' +
    '</div></div>' +

    // ===== 成就徽章墙（本机设备数据） =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="trophy" data-icon-size="18"></span></span>我的成就</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🌱</div><div style="font-size:12px;margin-top:4px">初学者</div></div>' +
    ((d.streakDays || 0) >= 7 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🔥</div><div style="font-size:12px;margin-top:4px">坚持一周</div></div>' : '') +
    ((d.totalQuestions || 0) >= 100 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">🧮</div><div style="font-size:12px;margin-top:4px">百题斩</div></div>' : '') +
    ((d.totalQuestions || 0) >= 500 ? '<div style="padding:12px;background:var(--bg);border-radius:10px"><div style="font-size:24px">💪</div><div style="font-size:12px;margin-top:4px">刷题达人</div></div>' : '') +
    '</div></div>' +

    // ===== 新增：学习模块快捷入口 =====
    '<div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title"><span class="title-icon"><span class="nav-icon" data-icon="book-open" data-icon-size="18"></span></span>学习模块</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">' +
    '<div onclick="location.href=' + "'错题本.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px"><span class="nav-icon" data-icon="book" data-icon-size="22"></span></div><div style="font-size:12px;margin-top:4px">错题本</div></div>' +
    '<div onclick="location.href=' + "'四级词汇.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px"><span class="nav-icon" data-icon="book-open" data-icon-size="22"></span></div><div style="font-size:12px;margin-top:4px">四级词汇</div></div>' +
    '<div onclick="location.href=' + "'行测.html'" + '" style="padding:12px;background:var(--bg);border-radius:10px;cursor:pointer"><div style="font-size:24px"><span class="nav-icon" data-icon="pen" data-icon-size="22"></span></div><div style="font-size:12px;margin-top:4px">行测刷题</div></div>' +
    '</div></div>';
  if (window.lucideAutoRender) window.lucideAutoRender(); // J 批次：动态 data-icon span 重渲染
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
    apiAvatarTemp = window.apiAvatarSrcOf(src.p) || null;
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
  if (window.apiAvatarSrcOf({ avatarImg: apiAvatarTemp })) el.innerHTML = window.apiAvatarHtml({ avatarImg: apiAvatarTemp }, letter);
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
    if (apiAvatarTemp && typeof apiAvatarTemp === 'string') { p.avatarImg = apiAvatarTemp; } else { delete p.avatarImg; }   // 2026-09-16：临时头像可能是服务端 URL，不再限定 base64
    if (typeof saveData === 'function') saveData();
    try {
      var nm = document.querySelector('.user-card .user-name'); if (nm) nm.textContent = p.name;
      var av = document.querySelector('.user-card .user-avatar');
      if (av) { av.innerHTML = window.apiAvatarHtml(p, ((p.avatar || '学')).slice(0, 1)); }
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

/* =====================================================================
   R3b-B / N2：全局网络状态提示（断网 / 已恢复）
   ---------------------------------------------------------------------
   现状：仅个别页面（如朋友圈）有局部离线提示，IM / AI / 社区不统一。
   做法（纯前端，零原生依赖）：
     1) 监听 window 的 online / offline 事件，并结合 navigator.onLine 初值；
     2) 顶部统一横条 #xtNetBar：「网络不可用：请检查网络连接」/「网络已恢复」（2s 自动收起）；
     3) 离线时：任何 api() 调用在发起前快速失败并抛「网络不可用，请检查网络连接」，
        避免误触/慢等；同时 toast 去重提示（不改变 api() 既有「抛 Error」契约，调用方零改动）；
     4) 恢复时：广播 xt:net-online 事件 + 自动 reload 当前页；内置 unread 自动刷新
        （api() 对 /api/chat/unread 等未读接口轻量轮询；无此类定时器的页面由 reload 兜底），
        并额外派发 xt:net-online 供各页监听自有刷新逻辑。
   全站生效：本模块随 assets/api.js 注入全站（tools/inject-api.js），无需逐页接线。
   健壮性：样式同时写入 .im-modal 同款「双声明」，老内核仅靠内联样式也能显示；无 toast 时静默降级。
   ===================================================================== */
(function () {
  if (window.__xtNetStatusInited) return;      // 幂等：同一页只初始化一次
  window.__xtNetStatusInited = true;

  var OFFLINE_MSG = '网络不可用，请检查网络连接';
  var RECOVER_MSG = '网络已恢复';
  var lastToastTs = 0;
  var toastCooldownMs = 1500;                   // 短时间反复调用的去重窗口

  function isOffline() {
    try { return (navigator && navigator.onLine === false); } catch (e) { return false; }
  }

  function toastOnce(msg) {
    var now = Date.now();
    if (now - lastToastTs < toastCooldownMs) return;
    lastToastTs = now;
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.toast === 'function') { window.toast(msg); }
    } catch (e) { /* 静默 */ }
  }

  function ensureBar() {
    var bar = document.getElementById('xtNetBar');
    if (bar) return bar;
    if (!document.body) return null;
    bar = document.createElement('div');
    bar.id = 'xtNetBar';
    bar.className = 'xt-netbar';
    // 内联兜底样式：即使 common.css 未更新，老内核也能显示
    bar.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:2147483000;display:none;' +
      'padding:calc(8px + env(safe-area-inset-top, 0px)) 14px 8px;text-align:center;' +
      'font-size:13px;font-weight:600;color:#fff;background:#c0392b;box-shadow:0 2px 8px rgba(0,0,0,.18)');
    document.body.appendChild(bar);
    return bar;
  }

  function showBar(msg, kind) {
    var bar = ensureBar(); if (!bar) return;
    bar.textContent = msg;
    bar.className = 'xt-netbar' + (kind === 'online' ? ' xt-netbar-online' : ' xt-netbar-offline');
    bar.style.background = (kind === 'online') ? '#2e7d32' : '#c0392b';
    bar.style.display = 'block';
    try { document.body.classList.add('xt-net-offline'); } catch (e) { }
    if (kind === 'online') {
      try { document.body.classList.remove('xt-net-offline'); } catch (e) { }
      setTimeout(function () {
        try { if (bar.className.indexOf('xt-netbar-online') >= 0) bar.style.display = 'none'; } catch (e) { }
      }, 2000);
    }
  }

  function emit(name) {
    try {
      var ev = document.createEvent('Event');
      ev.initEvent(name, true, true);
      window.dispatchEvent(ev);
    } catch (e) { /* 静默 */ }
  }

  function setOffline() {
    showBar('⚠️ ' + OFFLINE_MSG, 'offline');
    toastOnce('⚠️ ' + OFFLINE_MSG);
    emit('xt:net-offline');
  }

  function setOnline(firstRun) {
    if (firstRun) return;                        // 首次加载且在线：不闪横条
    showBar('✅ ' + RECOVER_MSG, 'online');
    toastOnce('✅ ' + RECOVER_MSG);
    emit('xt:net-online');
    // 恢复后自动刷新当前页（推迟 1.2s，让「已恢复」横条可见）
    setTimeout(function () { try { location.reload(); } catch (e) { } }, 1200);
  }

  /* 供 api() 与外部调用：离线时快速失败，避免请求挂起 */
  window.xtNetIsOffline = function () { return isOffline(); };
  window.xtNetCheck = function (silent) {
    if (isOffline()) { if (!silent) toastOnce('⚠️ ' + OFFLINE_MSG); return false; }
    return true;
  };

  window.addEventListener('online', function () { setOnline(false); });
  window.addEventListener('offline', function () { setOffline(); });

  function boot() {
    if (isOffline()) setOffline();
    // 兜底：个别老内核 online/offline 事件不触发时，用轻量轮询纠正状态
    var wasOffline = isOffline();
    setInterval(function () {
      var nowOff = isOffline();
      if (nowOff !== wasOffline) { wasOffline = nowOff; if (nowOff) setOffline(); else setOnline(false); }
    }, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
