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
