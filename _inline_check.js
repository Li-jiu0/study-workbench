window.__XT_PROD__=true;
;

/* 设置页兜底实现（只在本页内联，不改动 app.js）：
   本页的内联脚本在「解析期」同步执行，而 app.js 是 defer 加载的，此刻
   loadAllSettings / getSetting / setSetting 尚未定义，初始化 IIFE 会抛 ReferenceError，
   导致设置项回填失败、按钮点击无响应。
   这里按 app.js 的同一份约定（localStorage key: study_workbench_settings + 默认值）
   提供轻量实现；等 app.js 执行完毕后，会由它的正式实现覆盖（函数声明覆盖属性）。
   全部 try/catch：任何读取/写入失败都静默降级为默认值，绝不抛异常。 */
(function () {
  if (typeof window === 'undefined') return;
  var SETTINGS_KEY_FALLBACK = 'study_workbench_settings';
  var FALLBACK_DEFAULTS = {
    theme: 'light', color: 'blue', fontSize: 'normal',
    dailyNew: 50, dailyReview: 20, focusMinutes: 25,
    studyLimitOn: true, studyLimitHours: 4, studyLimitWarn: true,
    autoSpeak: true, voiceRate: 0.9, voiceLang: 'en-US',
    chatNotify: true, studyRemind: false, reviewRemind: true,
    keepScreen: false, cardAutoPlay: true,
    notesPublic: true, canSearch: true, studyPublic: false,
    blogCat: 'cet', blogPrivacy: 'public', blogTags: '',
    readerFont: 'normal', reduceMotion: false, compact: false, remindTime: '20:00',
    aiTemp: '', aiMax: '', aiStream: true, aiContext: true,
    aiAvatar: '\uD83E\uDD16', aiPanelWidth: 'normal'
  };
  function readAll() {
    var o = {}, k;
    for (k in FALLBACK_DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(FALLBACK_DEFAULTS, k)) o[k] = FALLBACK_DEFAULTS[k];
    }
    try {
      var raw = window.localStorage ? window.localStorage.getItem(SETTINGS_KEY_FALLBACK) : null;
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          for (k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k]; }
        }
      }
    } catch (e) { }
    return o;
  }
  if (typeof window.loadAllSettings !== 'function') {
    window.loadAllSettings = function () { try { return readAll(); } catch (e) { return {}; } };
  }
  if (typeof window.getSetting !== 'function') {
    window.getSetting = function (k, def) {
      try {
        var v = readAll()[k];
        return (typeof v === 'undefined' || v === null) ? def : v;
      } catch (e) { return def; }
    };
  }
  if (typeof window.setSetting !== 'function') {
    window.setSetting = function (k, v) {
      try {
        var o = readAll();
        o[k] = v;
        if (window.localStorage) window.localStorage.setItem(SETTINGS_KEY_FALLBACK, JSON.stringify(o));
      } catch (e) { return; }
      try { if (typeof applySettings === 'function') applySettings(); } catch (e2) { }
    };
  }
  if (typeof window.saveSetting !== 'function' && typeof window.setSetting === 'function') {
    window.saveSetting = window.setSetting;
  }
})();

;

/* 单机离线版（如安卓 APK，未打包 assets/api.js）适配：
   ① 隐藏依赖后端的「本地发贴迁移」卡片；
   ② AI 卡片改为「本地直连 / 演示」配置（app.js 的 renderAiProviderForm，密钥仅存本机 localStorage）。
   在线多人版（加载了 api.js）不受影响，仍走服务端密钥表单。 */
(function () {
  if (typeof loadCurrentUser !== 'function') {
    var mig = document.getElementById('migrateCard');
    if (mig) mig.style.display = 'none';
    var aiCard = document.getElementById('aiServerCard');
    if (aiCard) {
      aiCard.style.display = '';
      var t = document.getElementById('aiServerCardTitle');
      if (t) t.innerHTML = '<span class="title-icon" data-icon="sparkles"></span>AI 助手（本地直连 / 演示）';
      if (typeof lucideAutoRender === 'function') lucideAutoRender();
      var note = document.getElementById('aiServerNoteRow');
      if (note) note.style.display = 'none';
      var badge = document.getElementById('aiProviderBadge');
      if (badge) badge.textContent = '密钥仅存本机';
      if (typeof renderAiProviderForm === 'function') renderAiProviderForm();
    }
  }
})();

;

/* 设置页：把控件初始化为已保存值；开关用 theme-option 双按钮 */
function stToggle(key, val, el) {
  setSetting(key, val);
  var wrap = el.parentElement;
  wrap.querySelectorAll('.theme-option').forEach(function (b) {
    b.classList.toggle('active', (b.getAttribute('data-val') === '1') === !!val);
  });
  showToast('✅ 设置已保存');
}
(function initSettingsUI() {
  var set = loadAllSettings();
  var pick = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
  pick('stDailyNew', set.dailyNew);
  pick('stDailyReview', set.dailyReview == null ? 20 : set.dailyReview);
  pick('stAiTemp', set.aiTemp == null ? '' : set.aiTemp);
  pick('stAiMax', set.aiMax == null ? '' : set.aiMax);
  pick('stFocus', set.focusMinutes);
  pick('stVoiceRate', set.voiceRate);
  pick('stVoiceLang', set.voiceLang);
  var apply = function (id, on) {
    var wrap = document.getElementById(id); if (!wrap) return;
    wrap.querySelectorAll('.theme-option').forEach(function (b) {
      b.classList.toggle('active', (b.getAttribute('data-val') === '1') === !!on);
    });
  };
  apply('swAutoSpeak', set.autoSpeak);
  apply('swChatNotify', set.chatNotify);
})();

;

/* 外观配色皮肤：激活态高亮 */
function __applySkinUI() {
  if (typeof currentSkin === 'undefined') return;
  document.querySelectorAll('[data-skin]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-skin') === currentSkin);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__applySkinUI, 200); });
else setTimeout(__applySkinUI, 200);

;

/* ===================================================================
   设置页 · 【9/11 新增】实用功能脚本
   -------------------------------------------------------------------
   包含：分段控件 / 发贴默认偏好 / 数据总览 / 每日学习提醒 /
         缓存清理 / 外观重置 / 账号与安全（本地单机版可改密码、注销）
   说明：只调用 app.js 已有函数（setSetting/loadAllSettings/exportData/doLogout…），
         不改动任何既有逻辑；在线模式下需要后端接口的能力标注为【后续扩展点】。
   =================================================================== */

/* ---------- 通用：分段控件（字号类） ---------- */
function stSeg(key, val, el) {
  setSetting(key, val);
  var wrap = el.parentElement;
  if (wrap) wrap.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-v') === val);
  });
  showToast('✅ 已保存');
}
function stApplySegUI() {
  var set = loadAllSettings();
  var apply = function (id, v) {
    var wrap = document.getElementById(id); if (!wrap) return;
    wrap.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-v') === v);
    });
  };
  apply('stFontSize', set.fontSize || 'normal');
  apply('stReaderFont', set.readerFont || 'normal');
}

/* ---------- 发贴默认偏好 ---------- */
function stFillBlogCat() {
  var sel = document.getElementById('stBlogCat'); if (!sel) return;
  var cats = [];
  try { cats = (typeof BLOG_CATS !== 'undefined' && BLOG_CATS) ? BLOG_CATS : []; } catch (e) { cats = []; }
  if (!cats || !cats.length) cats = [
    { id: 'cet', name: '英语' }, { id: 'exam', name: '行测' },
    { id: 'comm', name: '表达' }, { id: 'interview', name: '面测' },
    { id: 'ppt', name: '演示' }, { id: 'other', name: '其他' }
  ];
  sel.innerHTML = cats.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
  sel.value = getSetting('blogCat') || 'cet';
  var pv = document.getElementById('stBlogPrivacy'); if (pv) pv.value = getSetting('blogPrivacy') || 'public';
  var tg = document.getElementById('stBlogTags'); if (tg) tg.value = getSetting('blogTags') || '';
}
function stSaveBlogTags() {
  var el = document.getElementById('stBlogTags'); if (!el) return;
  var tags = el.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
  el.value = tags.join(', ');
  setSetting('blogTags', el.value);
  showToast('✅ 常用标签已保存');
}

/* ---------- 数据总览 ---------- */
function stFmtSize(b) {
  return b < 1024 ? (b + ' B') : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
}
function stRefreshOverview(notify) {
  var box = document.getElementById('stOverview'); if (!box) return;
  var totalBytes = 0, keyCount = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i); if (!k) continue;
      var v = localStorage.getItem(k) || '';
      totalBytes += (k.length + v.length) * 2; keyCount++;
    }
  } catch (e) { }
  var notes = 0, drafts = 0, wrong = 0, tasks = 0, tasksDone = 0, vocab = 0, favs = 0;
  try {
    var d = JSON.parse(localStorage.getItem('study_workbench_data') || '{}');
    notes = (d.notes || []).length;
    drafts = (d.notes || []).filter(function (n) { return n.status === 'draft' || n.status === 'archived'; }).length;
    wrong = (d.wrongQuestions || []).length;
    tasks = (d.tasks || []).length;
    tasksDone = (d.tasks || []).filter(function (t) { return t.done; }).length;
    vocab = (d.vocabLearned || []).length;
    favs = (d.favoriteNotes || []).length;
  } catch (e) { }
  var qbank = 0;
  try {
    var q = JSON.parse(localStorage.getItem('study_workbench_custom') || '{}');
    qbank = Object.keys(q).reduce(function (a, k2) { return a + (Array.isArray(q[k2]) ? q[k2].length : 0); }, 0);
  } catch (e) { }
  var items = [
    { n: notes, t: '发贴总数' }, { n: drafts, t: '草稿/归档' }, { n: wrong, t: '错题' },
    { n: tasksDone + '/' + tasks, t: '今日任务' }, { n: vocab, t: '已学词汇' },
    { n: qbank, t: '自建题目' }, { n: favs, t: '收藏发贴' }, { n: keyCount, t: '本机数据项' }
  ];
  box.innerHTML = items.map(function (it) {
    return '<div class="st-ov-item"><b>' + it.n + '</b><span>' + it.t + '</span></div>';
  }).join('');
  var limit = 5 * 1024 * 1024;   // 浏览器 localStorage 常见上限约 5MB
  var pct = Math.min(100, Math.round(totalBytes / limit * 100));
  var bar = document.getElementById('stStorageBar'); if (bar) bar.style.width = pct + '%';
  var tx = document.getElementById('stStorageTx');
  if (tx) tx.textContent = '本机存储占用约 ' + stFmtSize(totalBytes) + ' / 约 5 MB（' + pct + '%）。' +
    '数据只保存在本机浏览器，清理浏览器数据会一并清除，请定期点「立即备份」。';
  if (notify) showToast('📊 数据总览已刷新');
}

/* ---------- 每日学习提醒 ---------- */
function requestNotifyPermission() {
  if (typeof Notification === 'undefined') { showToast('⚠️ 当前环境不支持网页通知'); return; }
  if (Notification.permission === 'granted') { showToast('✅ 通知权限已开启'); return; }
  if (Notification.permission === 'denied') { showToast('⚠️ 通知权限被拒绝，请在浏览器/系统设置中允许'); return; }
  try {
    Notification.requestPermission().then(function (p) {
      showToast(p === 'granted' ? '✅ 通知权限已开启' : '⚠️ 未获得通知权限');
    });
  } catch (e) { showToast('⚠️ 通知授权失败'); }
}
function applyStudyReminder() {
  var s = loadAllSettings();
  if (window.__stRemindTimer) { clearInterval(window.__stRemindTimer); window.__stRemindTimer = null; }
  if (!s.studyRemind) return;
  var tick = function () {
    var now = new Date();
    var hm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var dk = now.toDateString();
    if (hm === (s.remindTime || '20:00') && window.__stRemindDay !== dk) {
      window.__stRemindDay = dk;
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('🚀 星途 · 学习提醒', { body: '该打卡学习啦，今天的任务完成了吗？' });
        } else {
          showToast('⏰ 学习提醒：该打卡学习啦！');
        }
      } catch (e) { showToast('⏰ 学习提醒：该打卡学习啦！'); }
    }
  };
  window.__stRemindTimer = setInterval(tick, 30000);
  tick();
}

/* ---------- 维护：清理缓存 / 重置外观 ---------- */
/* 全站禁用原生 confirm/prompt/alert：统一走 app.js 的 uiConfirm / uiPrompt / uiAlert（轻量页内层） */
function stClearCache() {
  uiConfirm('将清理错误日志、未完成的发贴草稿、AI 悬浮球位置等临时数据。\n学习记录、发贴、错题等业务数据不会被删除。确定继续吗？', '清理').then(function (ok) {
    if (!ok) return;
    var keys = ['study_workbench_errors', 'study_workbench_editor_draft_v1', 'study_workbench_ai_fab_pos'];
    var n = 0;
    keys.forEach(function (k) {
      try { if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); n++; } } catch (e) { }
    });
    try { sessionStorage.clear(); } catch (e) { }
    var bar = document.getElementById('edDraftBar'); if (bar) bar.style.display = 'none';
    stRefreshOverview();
    showToast('已清理 ' + n + ' 项临时数据');
  });
}
function stResetAppearance() {
  uiConfirm('将把主题、配色、字号、动效、紧凑模式等外观偏好恢复为默认值（不影响学习数据）。确定吗？', '恢复默认').then(function (ok) {
    if (!ok) return;
    resetAppearanceNow();
  });
}
function resetAppearanceNow() {
  ['fontSize', 'readerFont', 'reduceMotion', 'compact'].forEach(function (k) {
    try { setSetting(k, DEFAULT_SETTINGS[k]); } catch (e) { }
  });
  try { if (typeof setSkin === 'function') setSkin('default'); } catch (e) { }
  try { if (typeof setTheme === 'function') setTheme('light'); } catch (e) { }
  stApplySegUI();
  var s2 = loadAllSettings();
  var apply = function (id, on) {
    var w = document.getElementById(id); if (!w) return;
    w.querySelectorAll('.theme-option').forEach(function (b) { b.classList.toggle('active', (b.getAttribute('data-val') === '1') === !!on); });
  };
  apply('swReduceMotion', s2.reduceMotion);
  apply('swCompact', s2.compact);
  showToast('外观与偏好已恢复默认');
}

/* ---------- 账号与安全 ---------- */
function stEsc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
function stCurAccount() {
  var acct = '';
  try {
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) acct = CURRENT_USER.nickname || CURRENT_USER.username || '';
    if (!acct) { acct = (JSON.parse(localStorage.getItem('study_workbench_auth') || '{}').account) || ''; }
    if (!acct) { acct = (JSON.parse(localStorage.getItem('study_workbench_auth') || '{}').nickname) || ''; }
  } catch (e) { }
  return acct;
}
function stIsOnline() {
  try { return (typeof apiGetToken === 'function') && !!apiGetToken(); } catch (e) { return false; }
}
var ST_ACCT_RETRIES = 0; // R34：账号检测延迟重试计数（最多 2 次）
function stInitAccount() {
  var desc = document.getElementById('stAcctDesc');
  var mode = document.getElementById('stAcctMode');
  var online = stIsOnline();
  var acct = stCurAccount();
  /* R34 加固（2026-09-15）：CURRENT_USER 由 api.js 的 async loadCurrentUser 异步填充，
     DOMContentLoaded 时可能尚未就绪。若在线（apiGetToken 有值，说明必然有账号）但此时
     取不到 CURRENT_USER，则 600ms 后再刷一次，最多重试 2 次，避免误显示「访客态」。 */
  if (ST_ACCT_RETRIES < 2 && online && (typeof CURRENT_USER === 'undefined' || !CURRENT_USER)) {
    ST_ACCT_RETRIES++;
    setTimeout(function () { try { stInitAccount(); } catch (e) { } }, 600);
  }
  if (mode) mode.textContent = online ? '🌐 在线模式（服务器）' : '📱 本地单机模式';
  if (desc) desc.innerHTML = acct
    ? ('账号：<b>' + stEsc(acct) + '</b>　' + (online ? '数据存于服务器，可多端同步' : '账号与数据仅保存在本机浏览器'))
    : '未获取到登录账号（可能为访客状态）';
}
function stSimpleHash(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
  return 'h' + h.toString(36);
}
/* ---------- 密码强度（P0-B 需求22：前端规则与后端 server/schemas.py 对齐） ----------
   后端唯一规则：正则 ^(?=.*[A-Za-z])(?=.*\d).{8,64}$（≥8 位且同时含字母与数字，最长 64 位）
                 + 弱密码黑名单（大小写精确匹配）。
   前端必须在提交前用同一套规则拦截，否则用户只能在后端 422 之后才知道密码不合规。 */
var PW_STRONG_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
var PW_WEAK_DENYLIST = ['test123456', 'password', 'qwerty', 'qwerty123', '12345678',
  '11111111', 'abc12345', 'admin123', 'iloveyou', '123456789'];

/**
 * 判断密码是否满足后端强度规则（≥8 位且同时含字母与数字，≤64 位）。
 * @param {string} v 密码明文。
 * @returns {boolean} 满足返回 true，否则 false。
 */
function pwStrongEnough(v) {
  return PW_STRONG_RE.test(v || '');
}

/**
 * 判断密码是否命中后端弱密码黑名单（精确匹配，与后端实现一致）。
 * @param {string} v 密码明文。
 * @returns {boolean} 命中返回 true，否则 false。
 */
function pwTooCommon(v) {
  return PW_WEAK_DENYLIST.indexOf(v || '') >= 0;
}

/**
 * 新密码统一前置校验：不合规时直接用页面已有 showToast 轻提示，不改变任何交互形态。
 * @param {string} np 新密码明文。
 * @returns {boolean} 校验通过返回 true；失败时已提示并返回 false。
 */
function stCheckNewPassword(np) {
  if (!pwStrongEnough(np)) { showToast('⚠️ 密码强度不足：需至少 8 位，且同时包含字母和数字'); return false; }
  if (pwTooCommon(np)) { showToast('⚠️ 该密码过于常见，请更换为更复杂的密码'); return false; }
  return true;
}

function stChangePassword() {
  /* ADR-3：在线态不再弹遮罩，改为页面内区块展开/收起（再次点击同一按钮即收起） */
  if (stIsOnline()) {
    var panel = document.getElementById('stPwdModal');
    if (panel && panel.classList.contains('active')) { stClosePwdModal(); return; }
    stOpenPwdModal();
    return;
  }
  var acct = stCurAccount();
  if (!acct) { showToast('⚠️ 未获取到当前账号'); return; }
  var users = {};
  try { users = JSON.parse(localStorage.getItem('study_workbench_users') || '{}'); } catch (e) { users = {}; }
  if (!users[acct]) { showToast('⚠️ 本机未找到该账号记录'); return; }
  /* 全站禁用原生 prompt：改用 uiPrompt（取消返回 null，与原生一致） */
  uiPrompt('修改密码 · 请输入当前密码：', '').then(function (oldP) {
    if (oldP === null) return;
    if (users[acct].pass !== stSimpleHash(oldP)) { showToast('当前密码不正确'); return; }
    uiPrompt('请输入新密码（至少 8 位，且同时包含字母和数字）：', '').then(function (np) {
      if (np === null) return;
      if (!stCheckNewPassword(np)) return;
      uiPrompt('请再次输入新密码：', '').then(function (np2) {
        if (np2 === null) return;
        if (np !== np2) { showToast('两次输入不一致'); return; }
        users[acct].pass = stSimpleHash(np);
        try { localStorage.setItem('study_workbench_users', JSON.stringify(users)); } catch (e) { showToast('保存失败'); return; }
        showToast('密码已修改，请牢记新密码');
      });
    });
  });
}

/* ---------- A6：在线账号修改密码（前端表单 → POST /api/auth/change-password） ---------- */
/* ADR-3（2026-09-15）：显隐函数签名不变，函数体改为切换页面内区块 .st-pwd-panel 的显隐，
   不再有 .modal-overlay 遮罩；依赖 #stPwdModal.active 的校验脚本行为保持不变。 */
function stOpenPwdModal() {
  if (!stIsOnline()) { showToast('⚠️ 当前未登录在线账号'); return; }
  var ids = ['stPwdOld', 'stPwdNew', 'stPwdNew2'];
  ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var m = document.getElementById('stPwdModal');
  if (m) m.classList.add('active');
  var first = document.getElementById('stPwdOld');
  if (first) setTimeout(function () {
    try { if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    first.focus();
  }, 80);
}
function stClosePwdModal() {
  var m = document.getElementById('stPwdModal');
  if (m) m.classList.remove('active');
}
function stSubmitPwd() {
  var oldP = (document.getElementById('stPwdOld') || {}).value || '';
  var np = (document.getElementById('stPwdNew') || {}).value || '';
  var np2 = (document.getElementById('stPwdNew2') || {}).value || '';
  if (!oldP) { showToast('⚠️ 请输入当前密码'); return; }
  if (!stCheckNewPassword(np)) return;
  if (np !== np2) { showToast('⚠️ 两次输入的新密码不一致'); return; }
  if (np === oldP) { showToast('⚠️ 新密码不能与当前密码相同'); return; }
  var btn = document.getElementById('stPwdSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
  var doReq = (typeof api === 'function')
    ? api('/api/auth/change-password', { method: 'POST', body: { oldPassword: oldP, newPassword: np } })
    : Promise.reject(new Error('接口不可用（assets/api.js 未加载）'));
  doReq.then(function () {
    stClosePwdModal();
    showToast('✅ 密码已修改，其他设备需重新登录');
  }).catch(function (e) {
    showToast('❌ ' + ((e && e.message) || '修改失败，请稍后重试'));
  }).finally(function () {
    if (btn) { btn.disabled = false; btn.textContent = '确认修改'; }
  });
}
function stDeleteAccount() {
  if (stIsOnline()) { showToast('ℹ️ 在线账号注销需后端接口支持（【后续扩展点】）'); return; }
  var acct = stCurAccount();
  if (!acct) { showToast('⚠️ 未获取到当前账号'); return; }
  /* 全站禁用原生 confirm：两次确认均走 uiConfirm */
  uiConfirm('确定注销本机账号「' + acct + '」吗？\n账号记录将被删除，学习数据仍保留在本机。', '注销').then(function (ok1) {
    if (!ok1) return;
    uiConfirm('再次确认：注销后需重新注册该账号才能登录。继续吗？', '确认注销').then(function (ok2) {
      if (!ok2) return;
      try {
        var users = JSON.parse(localStorage.getItem('study_workbench_users') || '{}');
        delete users[acct];
        localStorage.setItem('study_workbench_users', JSON.stringify(users));
      } catch (e) { }
      showToast('本机账号已注销，即将返回登录页…');
      setTimeout(function () {
        try { localStorage.removeItem('study_workbench_auth'); } catch (e) { }
        location.replace('登录.html');
      }, 1200);
    });
  });
}

/* ==================== 任务 E：绑定与认证（2026-09-16 新增） ====================
   ADR-3：一律使用页面内可展开区块（#stBindPanel.active），不使用任何遮罩弹窗。
   三项绑定：手机号 / 微信号 / 邮箱号，各自显示「未绑定」或脱敏值，每行一个操作按钮。

   数据源与接口契约（前端不写死任何后端假设）：
     ① 本地单机模式（stIsOnline() === false）：
        - 绑定状态存本机 localStorage，键名 'study_workbench_bindings'（经 window.lsKey 前缀化）。
        - 结构（JSON 字符串）：
            { "phone": { "value": "13800005678", "at": 1710000000000 },
              "email": { "value": "ab@qq.com",     "at": 1710000000000 },
              "wechat":{ "value": "alex_wx",        "at": 1710000000000 } }
          未绑定的项字段缺失或 value 为空串。
        - 验证码为本地模拟：固定 6 位数字规则，任意 6 位数字即视为通过（注释已注明）。
     ② 在线模式（stIsOnline() === true）：
        - 约定接口（后端尚未实现，失败时 UI 明确提示为「后续扩展点」，绝不静默失败/假装成功）：
            发送验证码  POST /api/auth/bind/send-code
                        body: { "channel": "phone" | "email", "target": "<号码或邮箱>" }
                        resp: { "ok": true, "ttl": 60 }
            提交绑定    POST /api/auth/bind
                        body: { "channel": "phone" | "email" | "wechat", "target": "<值>", "code": "<验证码，wechat 可空>" }
                        resp: { "ok": true, "channel": "phone", "masked": "138****5678" }
            查询绑定    GET  /api/auth/bindings
                        resp: { "items": { "phone": {"masked":"138****5678"}, "email": {...}, "wechat": {...} } }
        - 请求统一走全站封装 api('/api/...', { method, body })（assets/api.js），401 由其内部自动刷新。
   ============================================================================ */

var ST_BIND_CHANNELS = ['phone', 'wechat', 'email'];
var ST_BIND_META = {
  phone:  { name: '手机号', icon: 'smartphone', ph: '请输入 11 位手机号' },
  wechat: { name: '微信号', icon: 'message-circle', ph: '请输入微信号（字母开头，6-20 位）' },
  email:  { name: '邮箱号', icon: 'mail', ph: '请输入邮箱地址' }
};
/* 当前正在编辑的绑定渠道（null 表示面板收起） */
var stBindEditing = null;
/* 验证码倒计时句柄：全局唯一，保证任何时刻最多一个 timer，幂等可清理 */
var stBindCodeTimer = null;

/** 统一读取本机绑定表（键名 study_workbench_bindings，经 lsKey 前缀化）。 */
function stBindReadLocal() {
  var raw = null;
  try {
    var key = (typeof window.lsKey === 'function') ? window.lsKey('study_workbench_bindings') : 'study_workbench_bindings';
    raw = localStorage.getItem(key);
  } catch (e) { raw = null; }
  var obj = {};
  try { obj = raw ? JSON.parse(raw) : {}; } catch (e2) { obj = {}; }
  if (!obj || typeof obj !== 'object') obj = {};
  return obj;
}

/** 统一写入本机绑定表（键名 study_workbench_bindings，经 lsKey 前缀化）。 */
function stBindWriteLocal(obj) {
  try {
    var key = (typeof window.lsKey === 'function') ? window.lsKey('study_workbench_bindings') : 'study_workbench_bindings';
    localStorage.setItem(key, JSON.stringify(obj || {}));
    return true;
  } catch (e) { return false; }
}

/**
 * 对绑定值做脱敏显示。
 * @param {string} channel phone | email | wechat
 * @param {string} value 原始值
 * @returns {string} 脱敏后的展示串（空值返回空串）
 */
function stBindMask(channel, value) {
  var v = String(value == null ? '' : value);
  if (!v) return '';
  if (channel === 'phone') {
    // 138****5678：保留前 3 后 4
    if (v.length >= 7) return v.slice(0, 3) + '****' + v.slice(v.length - 4);
    return '****';
  }
  if (channel === 'email') {
    // ab***@qq.com：本地部分保留前 1-2 位，域名完整
    var at = v.indexOf('@');
    if (at <= 0) return '***';
    var local = v.slice(0, at);
    var domain = v.slice(at);
    var keep = local.length >= 2 ? local.slice(0, 2) : local.slice(0, 1);
    return keep + '***' + domain;
  }
  // wechat：部分打码，保留前 2 位与后 1 位
  if (v.length <= 3) return v.slice(0, 1) + '***';
  return v.slice(0, 2) + '***' + v.slice(v.length - 1);
}

/**
 * 校验绑定目标值是否合法（前端强校验，不只依赖后端）。
 * @param {string} channel phone | email | wechat
 * @param {string} v 输入值
 * @returns {boolean}
 */
function stBindValidateTarget(channel, v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return false;
  if (channel === 'phone') return /^1[3-9]\d{9}$/.test(s);
  if (channel === 'email') return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
  if (channel === 'wechat') return /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(s);
  return false;
}

/** 渲染「绑定与认证」三项列表（状态真实反映数据，不使用占位文案）。 */
function stRenderBindings() {
  var list = document.getElementById('stBindList');
  if (!list) return;
  var local = stBindReadLocal();
  var html = '';
  for (var i = 0; i < ST_BIND_CHANNELS.length; i++) {
    var ch = ST_BIND_CHANNELS[i];
    var meta = ST_BIND_META[ch];
    var rec = local[ch];
    var val = (rec && rec.value) ? String(rec.value) : '';
    var shown = val ? stBindMask(ch, val) : '未绑定';
    var valCls = val ? 'st-bind-item-val' : 'st-bind-item-val none';
    var actions = val
      ? ('<button class="btn btn-outline" type="button" onclick="stOpenBindPanel(\'' + ch + '\')">更换</button>'
         + '<button class="btn btn-outline" type="button" onclick="stUnbind(\'' + ch + '\')">解绑</button>')
      : ('<button class="btn btn-outline" type="button" onclick="stOpenBindPanel(\'' + ch + '\')">绑定</button>');
    html += '<div class="st-bind-item">'
      + '<div class="st-bind-item-info">'
      +   '<div class="st-bind-item-name"><span class="nav-icon" data-icon="' + meta.icon + '" data-icon-size="14"></span> ' + stEsc(meta.name) + '</div>'
      +   '<div class="' + valCls + '">' + stEsc(shown) + '</div>'
      + '</div>'
      + '<div class="st-bind-item-actions">'
      +   actions
      + '</div>'
      + '</div>';
  }
  list.innerHTML = html;
  if (typeof window.renderIcons === 'function') { try { window.renderIcons(list); } catch (e) { } }
}

/** 清理验证码倒计时句柄（幂等，可重复调用）。 */
function stBindClearTimer() {
  if (stBindCodeTimer) {
    clearInterval(stBindCodeTimer);
    stBindCodeTimer = null;
  }
}

/** 复位「获取验证码」按钮为可点状态。 */
function stBindResetCodeBtn() {
  var btn = document.getElementById('stBindCodeBtn');
  if (btn) { btn.disabled = false; btn.textContent = '获取验证码'; }
}

/**
 * 60 秒幂等倒计时：任何时刻只有一个 timer，重复点击不会叠加。
 * @param {HTMLButtonElement} btn 触发按钮
 */
function stBindStartCountdown(btn) {
  stBindClearTimer();
  var remain = 60;
  if (btn) { btn.disabled = true; btn.textContent = remain + ' 秒后重试'; }
  stBindCodeTimer = setInterval(function () {
    remain--;
    if (remain <= 0) {
      stBindClearTimer();
      stBindResetCodeBtn();
      return;
    }
    var b = document.getElementById('stBindCodeBtn');
    if (b) { b.disabled = true; b.textContent = remain + ' 秒后重试'; }
  }, 1000);
}

/**
 * 打开绑定面板（页面内可展开区块）。
 * @param {string} channel phone | wechat | email
 */
function stOpenBindPanel(channel) {
  if (ST_BIND_CHANNELS.indexOf(channel) < 0) return;
  var meta = ST_BIND_META[channel];
  var local = stBindReadLocal();
  var rec = local[channel];
  var hasVal = !!(rec && rec.value);

  stBindEditing = channel;
  /* 若已绑定，打开面板即为「更换/解绑」操作，先给出解绑入口（用二次确认） */
  stBindClearTimer();
  stBindResetCodeBtn();

  var title = document.getElementById('stBindPanelTitle');
  if (title) {
    title.innerHTML = '<span class="nav-icon" data-icon="' + meta.icon + '" data-icon-size="16"></span> '
      + (hasVal ? ('更换 / 解绑' + stEsc(meta.name)) : ('绑定' + stEsc(meta.name)));
  }
  var hint = document.getElementById('stBindPanelHint');
  var needCode = (channel === 'phone' || channel === 'email');
  if (hint) {
    hint.textContent = needCode
      ? ('请输入' + meta.name + '，点击「获取验证码」后填写收到的 6 位数字验证码。')
      : ('请输入' + meta.name + '（字母开头，6-20 位，可含字母/数字/下划线/短横线），无需验证码。');
  }
  /* 验证码相关控件仅手机号/邮箱可见 */
  var valueLabel = document.getElementById('stBindValueLabel');
  if (valueLabel) valueLabel.textContent = ('绑定' + meta.name);
  var valueInput = document.getElementById('stBindValue');
  if (valueInput) { valueInput.value = ''; valueInput.placeholder = meta.ph; }
  var codeGroup = document.getElementById('stBindCodeGroup');
  if (codeGroup) codeGroup.style.display = needCode ? '' : 'none';
  var codeInput = document.getElementById('stBindCode');
  if (codeInput) codeInput.value = '';
  var codeBtn = document.getElementById('stBindCodeBtn');
  if (codeBtn) codeBtn.style.display = needCode ? '' : 'none';
  var submit = document.getElementById('stBindSubmitBtn');
  if (submit) { submit.disabled = false; submit.textContent = hasVal ? '确认更换' : '确认绑定'; }

  var panel = document.getElementById('stBindPanel');
  if (panel) {
    panel.classList.add('active');
    if (panel.scrollIntoView) { try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { } }
  }
  if (valueInput) setTimeout(function () { try { valueInput.focus(); } catch (e) { } }, 80);
  if (typeof window.renderIcons === 'function') { try { window.renderIcons(panel || document); } catch (e) { } }
}

/** 收起绑定面板（并清理倒计时，幂等）。 */
function stCloseBindPanel() {
  stBindClearTimer();
  stBindResetCodeBtn();
  stBindEditing = null;
  var panel = document.getElementById('stBindPanel');
  if (panel) panel.classList.remove('active');
}

/**
 * 发送验证码（手机号/邮箱）：先做前端格式校验，再走本地模拟或约定接口。
 * 幂等：倒计时期间按钮禁用，不会叠加多个 timer。
 */
function stSendBindCode() {
  var ch = stBindEditing;
  if (ch !== 'phone' && ch !== 'email') { showToast('⚠️ 当前渠道无需验证码'); return; }
  var input = document.getElementById('stBindValue');
  var target = input ? String(input.value || '').trim() : '';
  if (!stBindValidateTarget(ch, target)) {
    showToast(ch === 'phone' ? '⚠️ 请输入正确的 11 位手机号' : '⚠️ 请输入正确的邮箱地址');
    return;
  }
  var btn = document.getElementById('stBindCodeBtn');
  /* 立即进入倒计时，重复点击无效（按钮已禁用 + 幂等清理） */
  stBindStartCountdown(btn);

  if (!stIsOnline()) {
    /* 本地模拟：不发真实短信/邮件，仅提示；验证码规则为任意 6 位数字 */
    showToast('📱 验证码已发送（本地模拟，任意 6 位数字均可通过）');
    return;
  }
  /* 在线模式：调用约定接口，失败明确告知「后续扩展点」，不静默失败、不假装成功 */
  var doReq = (typeof api === 'function')
    ? api('/api/auth/bind/send-code', { method: 'POST', body: { channel: ch, target: target } })
    : Promise.reject(new Error('接口不可用（assets/api.js 未加载）'));
  doReq.then(function () {
    showToast('📨 验证码已发送，请查收');
  }).catch(function (e) {
    /* 失败即恢复按钮，避免用户被错误锁在倒计时里 */
    stBindClearTimer();
    stBindResetCodeBtn();
    var msg = (e && e.message) ? String(e.message) : '';
    showToast('❌ 发送失败：' + (msg || '该功能需要后端接口支持，已记录为后续扩展点'));
  });
}

/**
 * 提交绑定（手机号/邮箱需验证码，微信号仅需格式校验）。
 * 本地模式写 localStorage（study_workbench_bindings），刷新后状态仍在；
 * 在线模式调用约定接口，失败明确提示，不静默失败、不假装成功。
 */
function stSubmitBind() {
  var ch = stBindEditing;
  if (!ch) { showToast('⚠️ 请先选择要绑定的项目'); return; }
  var input = document.getElementById('stBindValue');
  var target = input ? String(input.value || '').trim() : '';
  if (!stBindValidateTarget(ch, target)) {
    if (ch === 'phone') showToast('⚠️ 请输入正确的 11 位手机号（1 开头）');
    else if (ch === 'email') showToast('⚠️ 请输入正确的邮箱地址');
    else showToast('⚠️ 微信号需以字母开头，6-20 位，可含字母/数字/下划线/短横线');
    return;
  }
  var code = '';
  if (ch === 'phone' || ch === 'email') {
    var codeEl = document.getElementById('stBindCode');
    code = codeEl ? String(codeEl.value || '').trim() : '';
    if (!code) { showToast('⚠️ 请先输入验证码'); return; }
    /* 本地模式下验证码规则为 6 位数字（本地模拟，非真实短信校验） */
    if (ch === 'phone' || ch === 'email') {
      if (!/^\d{6}$/.test(code)) { showToast('⚠️ 验证码应为 6 位数字'); return; }
    }
  }
  var btn = document.getElementById('stBindSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

  var finishOk = function (channel, value) {
    var local = stBindReadLocal();
    local[channel] = { value: String(value), at: Date.now() };
    var saved = stBindWriteLocal(local);
    if (!saved) { showToast('❌ 本机保存失败，请检查浏览器存储权限'); }
    stClearBindCodeGroup();
    stCloseBindPanel();
    stRenderBindings();
    showToast(saved ? ('✅ ' + ST_BIND_META[channel].name + '已绑定') : '⚠️ 已提交但未能保存');
  };
  var finishFail = function (e) {
    if (btn) { btn.disabled = false; btn.textContent = '确认绑定'; }
    var msg = (e && e.message) ? String(e.message) : '';
    showToast('❌ 绑定失败：' + (msg || '该功能需要后端接口支持，已记录为后续扩展点'));
  };

  if (!stIsOnline()) {
    /* 本地模式：直接写本机存储 */
    finishOk(ch, target);
    return;
  }
  var doReq = (typeof api === 'function')
    ? api('/api/auth/bind', { method: 'POST', body: { channel: ch, target: target, code: code } })
    : Promise.reject(new Error('接口不可用（assets/api.js 未加载）'));
  doReq.then(function () {
    finishOk(ch, target);
  }).catch(finishFail);
}

/** 解绑某一渠道（二次确认，走 uiConfirm）。 */
function stUnbind(channel) {
  if (ST_BIND_CHANNELS.indexOf(channel) < 0) return;
  var meta = ST_BIND_META[channel];
  uiConfirm('确定解绑' + meta.name + '吗？解绑后将无法用其找回账号。', '解绑').then(function (ok) {
    if (!ok) return;
    var local = stBindReadLocal();
    delete local[channel];
    var saved = stBindWriteLocal(local);
    if (stBindEditing === channel) stCloseBindPanel();
    stRenderBindings();
    showToast(saved ? ('已解绑' + meta.name) : '⚠️ 解绑未能保存，请重试');
  });
}

/** 清空验证码输入（提交成功后调用）。 */
function stClearBindCodeGroup() {
  var codeEl = document.getElementById('stBindCode');
  if (codeEl) codeEl.value = '';
}

/* ---------- 隐私与安全 · 黑名单（T01 增量 2026-09-11） ----------
   列表：GET /api/friends/blocked（字段 id/nickname/avatarUrl/motto/since，接口 _peer_brief 不含 username）；
   移出：DELETE /api/friends/block/{uid}。地址统一走 assets/config.js。 */
function stPrivacyBase() {
  return (typeof window.getApiBase === 'function') ? window.getApiBase()
    : (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : '');
}
function stPrivacyToken() {
  try { if (typeof apiGetToken === 'function') return apiGetToken() || ''; } catch (e) { }
  return localStorage.getItem('study_workbench_token') || '';
}
function stAvatarFallback(name) {
  var s = String(name == null ? '' : name).trim();
  return s ? s.slice(0, 1) : '？';
}
function stLoadBlocked() {
  var box = document.getElementById('stBlockedList');
  if (!box) return;
  var token = stPrivacyToken();
  if (!token) { box.innerHTML = '<div class="privacy-empty">登录后可管理黑名单</div>'; return; }
  box.innerHTML = '<div class="privacy-empty">加载中…</div>';
  fetch(stPrivacyBase() + '/api/friends/blocked', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var items = (d && d.items) || [];
      if (!items.length) { box.innerHTML = '<div class="privacy-empty">黑名单为空，暂时没有拉黑的用户</div>'; return; }
      // 接口 _peer_brief 不返回 username，行内只展示头像 + 昵称，避免出现空白 @账号
      box.innerHTML = items.map(function (u) {
        var name = u.nickname || ('用户 ' + u.id);
        var av = u.avatarUrl
          ? '<img class="privacy-av" src="' + stEsc(u.avatarUrl) + '" alt="">'
          : '<div class="privacy-av privacy-av-text">' + stEsc(stAvatarFallback(name)) + '</div>';
        return '<div class="privacy-row privacy-item">' + av +
          '<div class="privacy-row-main"><div class="privacy-row-name">' + stEsc(name) + '</div>' +
          '<div class="privacy-row-sub">已拉黑</div></div>' +
          '<button class="btn btn-outline privacy-row-btn" onclick="stUnblock(' + u.id + ')">移出</button>' +
          '</div>';
      }).join('');
    })
    .catch(function () { box.innerHTML = '<div class="privacy-empty">黑名单需联网查看（后端暂不可用）</div>'; });
}
function stUnblock(uid) {
  if (!uid) return;
  var token = stPrivacyToken();
  if (!token) { if (typeof showToast === 'function') showToast('请先登录'); return; }
  fetch(stPrivacyBase() + '/api/friends/block/' + uid, {
    method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '移出失败'); return d; }); })
    .then(function () {
      if (typeof showToast === 'function') showToast('✅ 已移出黑名单');
      stLoadBlocked();
    })
    .catch(function (e) {
      if (typeof showToast === 'function') showToast('移出失败：' + (e.message || ''));
      else if (typeof uiAlert === 'function') uiAlert('移出失败');
    });
}
/* ---------- 隐私与安全 · 可见性三控件（T05 接线 2026-09-11） ----------
   读取：GET /api/auth/me 的 privacy；保存：PUT /api/users/me/privacy（部分更新，只传变更字段）。
   契约：momentVisibility ∈ public/friends/private；friendAllow ∈ everyone/need_confirm/nobody；searchable 为 bool。
   保存失败 → 回滚 UI 到保存前的值 + toast，避免「UI 已改、后端没存」不一致。 */
var privacyState = { loaded: false, enabled: false, current: { momentVisibility: 'public', friendAllow: 'need_confirm', searchable: true } };
var MOMENT_SCOPE_LABEL = { public: '公开', friends: '仅好友', private: '仅自己' };
var FRIEND_POLICY_LABEL = { everyone: '所有人可直接加', need_confirm: '需要我验证', nobody: '不允许任何人' };

function stRenderSearchable(on) {
  var wrap = document.getElementById('stSearchableSeg');
  if (!wrap) return;
  wrap.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('active', (b.getAttribute('data-val') === '1') === !!on);
  });
}
function stRenderPrivacy(p) {
  p = p || {};
  var ms = document.getElementById('stMomentScope');
  if (ms && MOMENT_SCOPE_LABEL[p.momentVisibility]) ms.value = p.momentVisibility;
  var fp = document.getElementById('stFriendPolicy');
  if (fp && FRIEND_POLICY_LABEL[p.friendAllow]) fp.value = p.friendAllow;
  stRenderSearchable(p.searchable !== false);
}
function stPrivacySetEnabled(on) {
  privacyState.enabled = !!on;
  ['stMomentScope', 'stFriendPolicy'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.disabled = !on;
  });
  var wrap = document.getElementById('stSearchableSeg');
  if (wrap) wrap.querySelectorAll('button').forEach(function (b) { b.disabled = !on; });
}
function stLoadPrivacy() {
  var hint = document.getElementById('privacyOnlineHint');
  var token = stPrivacyToken();
  if (!token) {
    stPrivacySetEnabled(false);
    if (hint) { hint.textContent = '🔌 需登录后在线使用；当前为单机模式'; hint.style.display = 'block'; }
    return;
  }
  stPrivacySetEnabled(false); // 加载中先禁用，避免用未加载的默认值覆盖服务端设置
  fetch(stPrivacyBase() + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '读取失败'); return d; }); })
    .then(function (me) {
      var p = me && me.privacy;
      if (!p) { if (hint) { hint.textContent = '暂无法读取隐私设置（后端未就绪）'; hint.style.display = 'block'; } return; }
      privacyState.current = {
        momentVisibility: MOMENT_SCOPE_LABEL[p.momentVisibility] ? p.momentVisibility : 'public',
        friendAllow: FRIEND_POLICY_LABEL[p.friendAllow] ? p.friendAllow : 'need_confirm',
        searchable: p.searchable !== false
      };
      privacyState.loaded = true;
      if (hint) hint.style.display = 'none';
      stRenderPrivacy(privacyState.current);
      stPrivacySetEnabled(true);
    })
    .catch(function (e) {
      if (hint) { hint.textContent = '🔌 隐私设置需登录后在线使用'; hint.style.display = 'block'; }
      if (typeof showToast === 'function') showToast('隐私设置读取失败：' + ((e && e.message) || '网络错误'));
    });
}
function stSavePrivacy(patch) {
  var token = stPrivacyToken();
  var before = Object.assign({}, privacyState.current);
  if (!token) {
    stRenderPrivacy(before);
    if (typeof showToast === 'function') showToast('请先登录后使用');
    return;
  }
  fetch(stPrivacyBase() + '/api/users/me/privacy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(patch) // 部分更新：只传变更字段
  })
    .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.detail) || '保存失败'); return d; }); })
    .then(function (d) {
      // 契约：响应返回全量 privacy → 以服务端为准回填
      var next = {
        momentVisibility: MOMENT_SCOPE_LABEL[d.momentVisibility] ? d.momentVisibility : before.momentVisibility,
        friendAllow: FRIEND_POLICY_LABEL[d.friendAllow] ? d.friendAllow : before.friendAllow,
        searchable: d.searchable !== false
      };
      privacyState.current = next;
      stRenderPrivacy(next);
      if (typeof showToast === 'function') showToast('✅ 已保存');
    })
    .catch(function (e) {
      privacyState.current = before; // 回滚
      stRenderPrivacy(before);
      if (typeof showToast === 'function') showToast('⚠️ 保存失败：' + ((e && e.message) || '网络错误'));
    });
}
function stSetMomentScope(v) {
  if (!MOMENT_SCOPE_LABEL[v] || v === privacyState.current.momentVisibility) { stRenderPrivacy(privacyState.current); return; }
  stSavePrivacy({ momentVisibility: v });
}
function stSetFriendPolicy(v) {
  if (!FRIEND_POLICY_LABEL[v] || v === privacyState.current.friendAllow) { stRenderPrivacy(privacyState.current); return; }
  stSavePrivacy({ friendAllow: v });
}
function stSetSearchable(on) {
  on = !!on;
  stRenderSearchable(on); // 立即反映点击态，保存失败将回滚
  if (privacyState.loaded && on === privacyState.current.searchable) return;
  stSavePrivacy({ searchable: on });
}
if (typeof window !== 'undefined') {
  window.stLoadBlocked = stLoadBlocked;
  window.stUnblock = stUnblock;
  window.stLoadPrivacy = stLoadPrivacy;
  window.stSetMomentScope = stSetMomentScope;
  window.stSetFriendPolicy = stSetFriendPolicy;
  window.stSetSearchable = stSetSearchable;
}

/* ---------- 初始化 ---------- */
(function stInit() {
  stFillBlogCat();
  stApplySegUI();
  var s = loadAllSettings();
  var rt = document.getElementById('stRemindTime');
  if (rt && s.remindTime) rt.value = s.remindTime;
  var apply = function (id, on) {
    var w = document.getElementById(id); if (!w) return;
    w.querySelectorAll('.theme-option').forEach(function (b) { b.classList.toggle('active', (b.getAttribute('data-val') === '1') === !!on); });
  };
  apply('swReduceMotion', s.reduceMotion);
  apply('swCompact', s.compact);
  apply('swStudyRemind', s.studyRemind);
  stRefreshOverview();
  applyStudyReminder();
  stLoadBlocked();
  stLoadPrivacy();
})();

/* R34（寇豆码 2026-09-15）：账号检测原在解析期 IIFE 内「同步」调用 stInitAccount()，
   但本页内联脚本先于 defer 脚本（app.js/api.js/config.js）执行，此时 CURRENT_USER /
   apiGetToken 尚不存在，导致卡片永远停在「检测中… / —」。
   修复：延后到依赖就绪后再调用。defer 脚本在 DOMContentLoaded 之前已执行完毕，
   故挂 DOMContentLoaded 最稳妥；若事件已过（readyState 已非 loading）则立即执行兜底。
   进入「账号与安全」子页时由下方 T02 区块的 onSubpageChange 再刷新一次。 */
if (typeof stInitAccount === 'function') {
  if (document.readyState !== 'loading') {
    stInitAccount();
  } else {
    window.addEventListener('DOMContentLoaded', stInitAccount);
  }
}

;

/* ==================== 帮助与反馈（T6 增量 2026-09-11） ====================
   FAQ 手风琴：纯前端，离线可用。
   反馈提交：POST /api/feedbacks（≥10 字前端拦截；服务端限频 10 分钟 1 条 / 每天 5 条）。
   成功 → toast 显示编号 #id 并刷新「我的反馈」；失败 → 暂存 study_workbench_feedback_outbox。
   【后续扩展点：反馈处理台】管理员查询/标记已处理接口（后端 feedbackAdmin() 留空）。 */
(function () {
  'use strict';
  function $id(x) { return document.getElementById(x); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // 地址统一走 assets/config.js（本页禁止硬编码 IP）
  function apiBase() { return (typeof window.getApiBase === 'function') ? window.getApiBase() : (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ''); }
  function tok() { return localStorage.getItem('study_workbench_token') || ''; }
  var OUTBOX_KEY = 'study_workbench_feedback_outbox';
  /* 需求01：我提交过的反馈本地账本（含未登录提交的公开反馈），用于回查管理员回复。
     结构：[{id, source:'public'|'account', type, content, createdAt}]，最多留 20 条。 */
  var MY_FB_KEY = 'xt_my_feedback_ids';

  function loadMyFbLedger() {
    try {
      var raw = JSON.parse(localStorage.getItem(MY_FB_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function saveMyFbLedger(list) {
    try { localStorage.setItem(MY_FB_KEY, JSON.stringify((list || []).slice(-20))); } catch (e) { /* 无痕模式忽略 */ }
  }
  function rememberMyFb(rec) {
    if (!rec || rec.id === undefined || rec.id === null) return;
    var list = loadMyFbLedger();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(rec.id)) { list[i] = rec; saveMyFbLedger(list); return; }
    }
    list.push(rec);
    saveMyFbLedger(list);
  }
  var FB_TYPE_TEXT = { bug: '功能异常', suggest: '体验建议', content: '内容问题', other: '其他' };
  var FB_STATUS_TEXT = { pending: '待处理', replied: '已回复' };

  window.fbToggleFaq = function (q) {
    var item = q.parentElement;
    if (item) item.classList.toggle('open');
  };

  // 字数提示（≥10 字才能提交）
  var contentEl = $id('fbContent');
  if (contentEl) {
    contentEl.addEventListener('input', function () {
      var n = (contentEl.value || '').trim().length;
      var tip = $id('fbLenTip');
      if (tip) {
        tip.textContent = n + ' / 10 字';
        tip.style.color = n >= 10 ? '#22c55e' : '';
      }
    });
  }

  window.fbSubmit = function () {
    var content = (($id('fbContent') || {}).value || '').trim();
    if (content.length < 10) { if (typeof showToast === 'function') showToast('反馈描述至少 10 个字'); else if (typeof uiAlert === 'function') uiAlert('反馈描述至少 10 个字'); return; }
    var body = {
      type: ($id('fbType') || {}).value || 'other',
      content: content,
      anonymous: !!($id('fbAnonymous') || {}).checked
    };
    var btn = $id('fbSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
    fetch(apiBase() + '/api/feedbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok() },
      body: JSON.stringify(body)
    })
    .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.detail || '提交失败'); return d; }); })
    .then(function (d) {
      if (typeof showToast === 'function') showToast('✅ 已收到，编号 #' + d.id);
      // 需求01：记住编号，便于在「我的反馈」里回查管理员回复
      rememberMyFb({ id: d.id, source: 'account', type: body.type, content: content, createdAt: d.createdAt || d.created_at || '' });
      $id('fbContent').value = '';
      loadMine();
    })
    .catch(function (e) {
      // 离线降级：本地暂存待补发【后续扩展点：反馈 outbox 自动补发】
      try {
        var box = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
        box.push(body);
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(box.slice(-10)));
      } catch (er) { }
      if (typeof showToast === 'function') showToast('反馈暂未送达，请稍后重试（已暂存本地）');
      else if (typeof uiAlert === 'function') uiAlert('反馈暂未送达，请稍后重试：' + (e.message || ''));
    })
    .finally(function () { if (btn) { btn.disabled = false; btn.textContent = '提交反馈'; } });
  };

  /* 需求01：我的反馈 = 服务端回查（含管理员 reply）∪ 本地提交账本。
     主接口 GET /api/feedback/mine（带 token）；后端尚未兑现时回退旧 GET /api/feedbacks/mine。
     有 reply 显著展示「管理员回复」，没有则显示「等待回复」。 */
  function fetchMineFromServer() {
    var t = tok();
    if (!t) return Promise.resolve([]);
    var headers = { 'Authorization': 'Bearer ' + t };
    return fetch(apiBase() + '/api/feedback/mine', { headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error('mine not ready');
        return r.json();
      })
      .then(function (d) {
        var items = Array.isArray(d) ? d : (d.items || []);
        return items.map(function (f) { return { id: f.id, source: 'server', type: f.type, content: f.content, createdAt: f.createdAt || f.created_at || '', status: f.status, reply: f.reply || '' }; });
      })
      .catch(function () {
        // 新接口未就绪 → 回退旧接口（结构：{items:[{id,type,content,createdAt,status}]}）
        return fetch(apiBase() + '/api/feedbacks/mine', { headers: headers })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var items = Array.isArray(d) ? d : (d.items || []);
            return items.map(function (f) { return { id: f.id, source: 'server', type: f.type, content: f.content, createdAt: f.createdAt || f.created_at || '', status: f.status, reply: f.reply || '' }; });
          })
          .catch(function () { return null; });   // null = 后端不可用，仅用本地账本
      });
  }

  function renderMine(items) {
    var box = $id('fbMineList');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = tok() ? '还没有提交过反馈' : '提交过的反馈会显示在这里（登录后还能看到管理员回复）';
    } else {
      box.innerHTML = items.slice(0, 10).map(function (f) {
        var replied = !!(f.reply && String(f.reply).trim()) || f.status === 'replied';
        var replyHtml = replied
          ? '<div class="fb-mine-reply"><b>管理员回复：</b>' + esc(f.reply || '（已处理）') + '</div>'
          : '<div class="fb-mine-wait">等待回复</div>';
        return '<div class="fb-mine-item">' +
          '<div class="fb-mine-top">' +
            '<span class="fb-mine-status ' + (replied ? 'ok' : 'wait') + '">' + (replied ? '已回复' : '待处理') + '</span>' +
            '<span class="fb-mine-id">#' + esc(f.id) + ' · ' + esc(FB_TYPE_TEXT[f.type] || f.type) + ' · ' + esc(f.createdAt || '') + '</span>' +
          '</div>' +
          '<div class="fb-mine-content">' + esc(f.content) + '</div>' +
          replyHtml +
          '</div>';
      }).join('');
    }
    var pending = items.filter(function (x) { return !(x.reply && String(x.reply).trim()) && x.status !== 'replied'; }).length;
    var badge = $id('fbStatusBadge');
    if (badge) badge.textContent = pending ? pending + ' 条待处理' : (items.length ? '无待处理' : '');
  }

  function loadMine() {
    var box = $id('fbMineList');
    if (!box) return;
    fetchMineFromServer().then(function (serverItems) {
      var ledger = loadMyFbLedger();
      var byId = {};
      var out = [];
      var i;
      if (serverItems) {
        for (i = 0; i < serverItems.length; i++) {
          byId[String(serverItems[i].id)] = serverItems[i];
          out.push(serverItems[i]);
        }
      }
      // 本地账本补位：未登录提交的公开反馈 / 服务端未返回的条目
      for (i = 0; i < ledger.length; i++) {
        var rec = ledger[i] || {};
        var key = String(rec.id);
        if (!byId[key]) {
          out.push({ id: rec.id, source: rec.source || 'public', type: rec.type, content: rec.content, createdAt: rec.createdAt || '', status: 'pending', reply: '' });
        } else if (!byId[key].content && rec.content) {
          byId[key].content = rec.content;
          byId[key].createdAt = byId[key].createdAt || rec.createdAt || '';
        }
      }
      out.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
      renderMine(out);
      if (serverItems === null && !ledger.length) {
        box.innerHTML = '反馈需联网查看（后端不可用）';
      }
    });
  }
  // 供「给创作者提优化建议」提交成功后刷新
  window.xtLoadMyFeedback = loadMine;

  if (document.readyState !== 'loading') loadMine();
  else document.addEventListener('DOMContentLoaded', loadMine);
})();

;

/* ==================== 给创作者提优化建议（20260913k） ====================
   轻量表单：POST /api/feedback，body { nickname, type, content }。
   type 三选一 chip：优化建议 / 问题反馈 / 新功能期望。
   昵称自动带入当前登录账号（可读则回填，可手改），成功/失败均 toast。 */
(function () {
  'use strict';
  function $id(x) { return document.getElementById(x); }
  // 地址统一走 assets/config.js（本页禁止硬编码 IP）
  function apiBase() { return (typeof window.getApiBase === 'function') ? window.getApiBase() : (window.STUDY_API_BASE != null ? window.STUDY_API_BASE : ''); }
  var cfType = '优化建议';

  window.cfPickType = function (btn) {
    if (!btn) return;
    var chips = document.querySelectorAll('#cfTypeChips .cf-chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
    btn.classList.add('active');
    cfType = btn.getAttribute('data-value') || '优化建议';
  };

  // 昵称自动带入：优先 CURRENT_USER / stCurAccount()，回退 localStorage 登录信息
  function cfPrefill() {
    var el = $id('cfNickname');
    if (!el || el.value) return;
    var name = '';
    try {
      if (typeof stCurAccount === 'function') name = stCurAccount() || '';
      if (!name) name = (JSON.parse(localStorage.getItem('study_workbench_auth') || '{}').nickname) || '';
    } catch (e) { /* 忽略解析失败，留空可手填 */ }
    if (name) el.value = name;
  }

  window.cfSubmit = function () {
    var content = (($id('cfContent') || {}).value || '').trim();
    if (!content) { if (typeof showToast === 'function') showToast('请先填写反馈内容'); return; }
    var body = {
      nickname: (($id('cfNickname') || {}).value || '').trim(),
      type: cfType,
      content: content
    };
    var btn = $id('cfSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
    fetch(apiBase() + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.detail || 'error'); return d; }); })
      .then(function (d) {
        if (d && d.ok === false) { if (typeof showToast === 'function') showToast('提交失败，请稍后再试'); return; }
        // 需求01：记住编号（公开反馈免登录提交，本地账本是回查回复的唯一凭据）
        var cfId = (d && (d.id !== undefined ? d.id : (d.data && d.data.id)));
        if (cfId !== undefined && cfId !== null) {
          rememberMyFb({
            id: cfId, source: 'public', type: cfType, content: content,
            createdAt: (d && (d.createdAt || d.created_at)) || ''
          });
          if (typeof showToast === 'function') showToast('已提交，感谢反馈（编号 #' + cfId + '）');
        } else if (typeof showToast === 'function') showToast('已提交，感谢反馈');
        $id('cfContent').value = '';
        if (typeof window.xtLoadMyFeedback === 'function') window.xtLoadMyFeedback();
      })
      .catch(function () {
        if (typeof showToast === 'function') showToast('提交失败，请稍后再试');
      })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = '提交'; } });
  };

  if (document.readyState !== 'loading') cfPrefill();
  else document.addEventListener('DOMContentLoaded', cfPrefill);
})();

;

/* T02 批次五（寇豆码 2026-09-12）：hash 路由初始化 */
(function () {
  function bootSubpage() {
    if (typeof SubpageRouter === 'undefined' || !SubpageRouter || typeof SubpageRouter.init !== 'function') return;
    SubpageRouter.init({
      rootSelector: '#page-settings',
      defaultSubpage: 'list',
      sectionsSelector: '[data-subpage]',
      breadcrumbSelector: '.subpage-header',
      pageTitle: '设置',
      rootHref: '设置.html'
    });
    SubpageRouter.onSubpageChange(function (key, params) {
      // privacy 子页面激活时拉取隐私三控件（批次四 T05 落地，stLoadPrivacy 保留）
      if (key === 'privacy') {
        try { if (typeof stLoadPrivacy === 'function') stLoadPrivacy(); } catch (e) { if (window.console) console.warn('stLoadPrivacy error', e); }
      }
      // R34（寇豆码 2026-09-15）：进入「账号与安全」子页时刷新一次账号检测，
      // 保证登录态（CURRENT_USER / apiGetToken）就绪后卡片显示正确账号，而非残留「检测中… / —」。
      if (key === 'account') {
        try { if (typeof stInitAccount === 'function') stInitAccount(); } catch (e) { if (window.console) console.warn('stInitAccount error', e); }
        /* 任务 E：进入「账号与安全」时刷新绑定状态（真实反映数据，不停留占位文案） */
        try { if (typeof stRenderBindings === 'function') stRenderBindings(); } catch (e) { if (window.console) console.warn('stRenderBindings error', e); }
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSubpage);
  else bootSubpage();
})();
