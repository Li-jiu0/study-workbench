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
    studyLimitOn: true, studyLimitHours: 4, studyLimitWarn: true,
    autoSpeak: true, voiceRate: 0.9, voiceLang: 'en-US',
    chatNotify: true, studyRemind: false, reviewRemind: true,
    keepScreen: false, cardAutoPlay: true,
    notesPublic: true, canSearch: true, studyPublic: false,
    blogCat: 'cet', blogPrivacy: 'public', blogTags: '',
    readerFont: 'normal', reduceMotion: false, compact: false, remindTime: '20:00',
    aiTemp: '', aiMax: '', aiStream: true, aiContext: true,
    aiAvatar: '🤖', aiPanelWidth: 'normal'
  };

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
