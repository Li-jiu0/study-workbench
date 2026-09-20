/* ============================================================
 * xt-settings.js —— 用户偏好设置读写（全局单例，缺失时才补）
 * 背景：设置页/个人中心页调用 loadAllSettings / getSetting / setSetting，
 *       但这三个函数在 app.js 拆分过程中丢失，导致设置页初始化抛
 *       ReferenceError、所有开关点了没反应、已保存的设置读不出来。
 * 说明：
 *   - 全部挂到 window 上（不用顶层 var/const 声明），绝不会与任何
 *     页面里的 const/let 同名声明冲突（老 WebView 遇重复声明会整文件报废）。
 *   - 只在本文件 ES5 语法，老内核可解析。
 * ============================================================ */
(function () {
  var KEY = 'study_workbench_settings';
  try { if (typeof SETTINGS_KEY !== 'undefined' && SETTINGS_KEY) KEY = SETTINGS_KEY; } catch (e) {}

  var DEFAULTS = {
    theme: 'light', color: 'blue', fontSize: 'normal',
    dailyNew: 50, dailyReview: 20, focusMinutes: 25,
    studyLimitOn: true, studyLimitHours: 4,
    autoSpeak: true, voiceRate: 0.9, voiceLang: 'en-US',
    chatNotify: true, studyRemind: false,
    keepScreen: false,
    blogCat: 'cet', blogPrivacy: 'public', blogTags: '',
    readerFont: 'normal', reduceMotion: false, compact: false, remindTime: '20:00',
    aiTemp: '', aiMax: '', aiStream: true, aiContext: true,
    aiAvatar: '🤖', aiPanelWidth: 'normal'
  };
  /* 需求B（2026-09-22）键清理：reviewRemind / cardAutoPlay / studyLimitWarn /
     notesPublic / canSearch / studyPublic 六键从 DEFAULTS 删除——全项目无任何消费点，
     或已被服务端账号级隐私（User.searchable / moment_visibility / friend_allow）取代。
     老用户 localStorage 残留键无害：本文件 read() 按 hasOwnProperty(DEFAULTS) 合并，
     残留键不进 merged（app.js 的 loadAllSettings 用 Object.assign，残留键也只是
     多存一个无消费点的值），均无需迁移脚本。 */

  function read() {
    var o = {};
    try {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e2) {}
      if (raw) { try { o = JSON.parse(raw) || {}; } catch (e3) { o = {}; } }
    } catch (e) { o = {}; }
    var merged = {}, k;
    for (k in DEFAULTS) { if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) merged[k] = DEFAULTS[k]; }
    for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) merged[k] = o[k]; }
    return merged;
  }

  function load() {
    try { return read(); } catch (e) { var m = {}, k; for (k in DEFAULTS) m[k] = DEFAULTS[k]; return m; }
  }

  function get(k, def) {
    var v = load()[k];
    return (v === undefined || v === null) ? def : v;
  }

  function set(k, v) {
    try {
      var o = read();
      o[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e2) {}
      try { if (typeof applySettings === 'function') applySettings(); } catch (e3) {}
    } catch (e) {}
    return v;
  }

  // 缺失才补，绝不覆盖已有实现
  if (typeof window.DEFAULT_SETTINGS === 'undefined') window.DEFAULT_SETTINGS = DEFAULTS;
  if (typeof window.loadAllSettings !== 'function') window.loadAllSettings = load;
  if (typeof window.getSetting !== 'function') window.getSetting = get;
  if (typeof window.setSetting !== 'function') window.setSetting = set;
})();

/* ============================================================
 * R86-B：资料变更频率限制 —— 离线 / 本地单机模式的本地兜底
 * 背景：需求「每位用户每月最多变更一次」。服务端
 *       （server/routers/users.py  PUT /api/users/me）已有权威校验；
 *       这里只做「未登录 / 后端不可用」时的同口径本地兜底，避免离线被绕过。
 * 存储：复用 settings 的 profileChangeAt 字段，结构 { 字段名: 毫秒时间戳 }，
 *       与线上表 profile_change_log 语义一致。
 * 口径：首次修改（无记录）不受限；值未发生变化不计一次（幂等）。
 * 兼容：ES5 语法，全部挂 window，不使用 const/let/箭头函数。
 * ============================================================ */
(function () {
  var FIELDS = ['nickname', 'motto', 'bio', 'gender', 'birthday', 'city', 'phone', 'goal', 'tags'];
  var KEY = 'profileChangeAt';
  var DAY = 24 * 60 * 60 * 1000;

  function readMap() {
    var o = {};
    try {
      var raw = localStorage.getItem('study_workbench_settings');
      if (raw) {
        var s = JSON.parse(raw) || {};
        o = s[KEY] || {};
      }
    } catch (e) { o = {}; }
    if (!o || typeof o !== 'object') o = {};
    return o;
  }

  function writeMap(m) {
    try {
      var s = {};
      var raw = localStorage.getItem('study_workbench_settings');
      if (raw) { try { s = JSON.parse(raw) || {}; } catch (e2) { s = {}; } }
      s[KEY] = m;
      localStorage.setItem('study_workbench_settings', JSON.stringify(s));
    } catch (e) { /* 隐私模式下 setItem 可能抛异常，忽略即可 */ }
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function isoOf(ms) {
    try {
      var d = new Date(ms);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  /** 本地锁定态：{ 字段: { locked, changedAt, nextAvailableAt } } */
  window.xtLocalLocks = function (cooldownDays) {
    var days = cooldownDays || 30;
    var m = readMap();
    var now = Date.now();
    var out = {};
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      var at = parseInt(m[f], 10);
      if (!at) { out[f] = { locked: false, changedAt: '', nextAvailableAt: '' }; continue; }
      var next = at + days * DAY;
      out[f] = { locked: now < next, changedAt: isoOf(at), nextAvailableAt: isoOf(next) };
    }
    return out;
  };

  /** 记录本次变更：仅对传入字段写入当前时间 */
  window.xtLocalRecord = function (fields) {
    var m = readMap();
    var now = Date.now();
    var list = fields || [];
    for (var i = 0; i < list.length; i++) { m[list[i]] = now; }
    writeMap(m);
    return window.xtLocalLocks(30);
  };

  /** 清掉指定字段的本地变更记录（以服务端为准纠偏时用） */
  window.xtLocalClear = function (fields) {
    var m = readMap();
    var list = fields || [];
    for (var i = 0; i < list.length; i++) { delete m[list[i]]; }
    writeMap(m);
  };

  window.XT_PROFILE_LOCK_FIELDS = FIELDS;
  window.XT_PROFILE_COOLDOWN_DAYS = 30;
})();

/* ============================================================
 * 需求B（2026-09-22）：每日学习提醒 applyStudyReminder —— 从 设置.html 迁入
 * 背景：原实现只在设置页内注册（setInterval 30s + 开关切换时调用），离开设置页
 *       定时器随页面销毁——站点为多独立 HTML 页，提醒基本永远不响。
 * 现挂到 window，由 app.js 页面加载（boot）时无条件调用：每次跳转 app.js 重新
 *       执行 → 定时器随页面重新注册。
 * 行为保持与原实现一致：studyRemind 开启时，每 30s 对表一次，到达 remindTime 且
 *       当天未提醒过 → Notification（前置 Notification.permission==='granted'），
 *       无通知权限时回退页面内 toast。补文案「提醒需 App 处于打开状态」如实标注
 *       纯前端定时提醒的到达率受页面存活限制（平台限制）。
 * 兼容：ES5 语法；toast 优先复用页面 showToast / xtToast，均缺失时静默跳过。
 * 注意：设置.html 内同名旧函数暂保留（由负责该页面的并行线在删页面代码时一并清理），
 *       页面内声明仅作用于该页且行为一致，不产生冲突。
 * ============================================================ */
(function () {
  function pickToast() {
    if (typeof window.showToast === 'function') {
      return function (m) { try { window.showToast(m); } catch (e) {} };
    }
    if (typeof window.xtToast === 'function') {
      return function (m) { try { window.xtToast('info', m); } catch (e) {} };
    }
    return null;
  }
  window.applyStudyReminder = function () {
    var s = (typeof window.loadAllSettings === 'function') ? window.loadAllSettings() : {};
    try {
      if (window.__stRemindTimer) { clearInterval(window.__stRemindTimer); window.__stRemindTimer = null; }
    } catch (e) {}
    if (!s.studyRemind) return;
    var toastFn = pickToast();
    var tick = function () {
      var now = new Date();
      var hm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
      var dk = now.toDateString();
      if (hm === (s.remindTime || '20:00') && window.__stRemindDay !== dk) {
        window.__stRemindDay = dk;
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('🚀 星途 · 学习提醒', { body: '该打卡学习啦，今天的任务完成了吗？' });
          } else if (toastFn) {
            toastFn('⏰ 学习提醒：该打卡学习啦！（提醒需 App 处于打开状态）');
          }
        } catch (e) { if (toastFn) toastFn('⏰ 学习提醒：该打卡学习啦！'); }
      }
    };
    try { window.__stRemindTimer = setInterval(tick, 30000); } catch (e) {}
    tick();
  };
})();
