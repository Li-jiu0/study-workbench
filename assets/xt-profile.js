/* ============================================================================
 * xt-profile.js —— R73 v2「个人资料」页（微信 / QQ 风格移动端设置页）
 * ----------------------------------------------------------------------------
 * 页面：个人资料.html（根目录）。入口：个人中心.html →「个人资料」。
 *
 * 设计要点：
 *   1) 数据全部读本机 localStorage，**严禁虚构**：取不到就不显示（角标/小字），
 *      数字类无数据显示 0；
 *   2) 兼容老 WebView（ES2017 上限）：本文件只用 var / function / 字符串拼接，
 *      不用 ?. ?? 展开运算符 Object.fromEntries .at() 正则后行断言 ** 可选 catch；
 *   3) 复用既有全局（存在才用）：window.lucideAutoRender / window.saveData /
 *      window.setSetting / window.doLogout；
 *   4) 列表项落点全部指向真实存在的页面或页内子视图（见 GROUPS 定义）；
 *   5) 头像圆形裁剪沿用 v1 canvas 圆形输出能力。
 *
 * 暴露：window.xtProfile（对象）+ window.xtp*（若干动作，供内联 onclick 调用）。
 * ========================================================================== */
(function () {
  'use strict';

  /* 尽早应用深浅色主题，避免首屏闪烁（与 app.js 的 body.dark 口径一致）。
     原内联于 个人资料.html <body> 后的主题预执行块已迁移至此；全部 try 包裹，失败静默。 */
  try {
    var themeRaw = localStorage.getItem('study_workbench_theme') || 'light';
    var bootDark = (themeRaw === 'dark') || (themeRaw === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (bootDark && document.body) { document.body.classList.add('dark'); }
  } catch (e) { /* 忽略 */ }

  /* ==================================================================== 工具 */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ============================================================ localStorage */
  /** 与 app.js 的 lsKey 同口径：有登录账号则数据键带 @account 后缀 */
  function lsKey(name) {
    try {
      var a = JSON.parse(localStorage.getItem('study_workbench_auth') || 'null');
      if (a && a.account) return name + '@' + a.account;
    } catch (e) { /* 忽略 */ }
    try {
      var la = localStorage.getItem('study_workbench_last_account');
      if (la) return name + '@' + la;
    } catch (e2) { /* 忽略 */ }
    return name;
  }
  function getItem(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function setItem(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function readJSON(key, def) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') return def;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? def : v;
    } catch (e) { return def; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  /** 账号隔离键读取：先读 @account，再回退裸键（与 错题本.html / 我的文件.html 同口径） */
  function readAcctJSON(name, def) {
    try {
      var a = localStorage.getItem(lsKey(name));
      if (a === null || a === undefined) a = localStorage.getItem(name);
      if (a === null || a === undefined || a === '') return def;
      var v = JSON.parse(a);
      return (v === null || v === undefined) ? def : v;
    } catch (e) { return def; }
  }

  /* ================================================================ Toast */
  var toastTimer = null;
  function toast(msg, isErr) {
    var el = $('xtpToast');
    if (!el) { el = document.createElement('div'); el.id = 'xtpToast'; el.className = 'xtp-toast'; document.body.appendChild(el); }
    el.textContent = String(msg === null || msg === undefined ? '' : msg);
    el.className = 'xtp-toast';
    void el.offsetWidth;
    el.className = 'xtp-toast on' + (isErr ? ' err' : '');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { el.className = 'xtp-toast' + (isErr ? ' err' : ''); }, 1900);
  }

  /* ================================================== 数据读取层（真实源） */
  function getAppData() {
    var d = readAcctJSON('study_workbench_data', null);
    return (d && typeof d === 'object') ? d : {};
  }
  function getStats() {
    var d = getAppData();
    return (d.stats && typeof d.stats === 'object') ? d.stats : {};
  }
  function getProfile() {
    var d = getAppData();
    if (!d.profile || typeof d.profile !== 'object') { d.profile = {}; }
    return d.profile;
  }
  /** 局部更新 profile 并写回原本机数据键（保留其它字段） */
  function saveProfile(patch) {
    var d = getAppData();
    if (!d.profile || typeof d.profile !== 'object') { d.profile = {}; }
    for (var k in patch) { if (has(patch, k)) { d.profile[k] = patch[k]; } }
    writeJSON(lsKey('study_workbench_data'), d);
    try { if (typeof window.saveData === 'function') { window.saveData(); } } catch (e) { /* 忽略 */ }
  }
  function studyTimeMap() { return readAcctJSON('study_workbench_studytime', {}) || {}; }
  function studyStats() { return readAcctJSON('study_workbench_stats', {}) || {}; }
  function getSettings() { return readJSON('study_workbench_settings', {}) || {}; }
  function saveSetting(key, val) {
    var s = getSettings(); s[key] = val;
    writeJSON('study_workbench_settings', s);
    try { if (typeof window.setSetting === 'function') { window.setSetting(key, val); } } catch (e) { /* 忽略 */ }
  }

  /* ============================================================== 主题处理 */
  function themeMode() { return getItem('study_workbench_theme') || 'light'; }
  function isDarkNow() {
    var m = themeMode();
    if (m === 'dark') return true;
    if (m === 'auto' && window.matchMedia) {
      try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
    }
    return false;
  }
  function applyThemeClass() {
    if (!document.body) return;
    if (isDarkNow()) { document.body.classList.add('dark'); } else { document.body.classList.remove('dark'); }
    var btn = $('xtpThemeBtn');
    if (btn) {
      btn.innerHTML = '<span class="nav-icon" data-icon="' + (isDarkNow() ? 'sun' : 'moon') + '" data-icon-size="18"></span>';
      if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); }
    }
  }
  function toggleTheme() {
    var next = isDarkNow() ? 'light' : 'dark';
    setItem('study_workbench_theme', next);
    applyThemeClass();
    toast(next === 'dark' ? '已切换深色模式' : '已切换浅色模式');
  }

  /* ======================================================== 统计指标计算层 */
  function sumStudySeconds() {
    var o = studyTimeMap(), t = 0, k;
    for (k in o) { if (has(o, k)) { t += num(o[k]); } }
    return t;
  }
  function weekDates() {
    var now = new Date();
    var dow = now.getDay();                 // 0 = 周日
    var off = (dow === 0 ? 6 : dow - 1);    // 以周一为一周起点
    var out = [], i;
    for (i = 0; i < 7; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off + i);
      out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()));
    }
    return out;
  }
  function weekMinutesFromStudyStats() {
    var ss = studyStats();
    var mods = (ss && ss.modules) || {};
    var days = weekDates(), total = 0, m, i, rec;
    for (m in mods) {
      if (!has(mods, m)) continue;
      var mm = mods[m];
      if (!mm || !mm.days) continue;
      for (i = 0; i < days.length; i++) {
        rec = mm.days[days[i]];
        if (rec && rec.minutes) total += num(rec.minutes);
      }
    }
    return total;
  }
  function weekSecondsFromStudyTime() {
    var o = studyTimeMap(), days = weekDates(), total = 0, i;
    for (i = 0; i < days.length; i++) { total += num(o[days[i]]); }
    return total;
  }
  function questClearedCount() {
    var p = readAcctJSON('study_workbench_quest_progress', null);
    if (!p || typeof p !== 'object') { p = readJSON('study_workbench_quest_progress', {}) || {}; }
    var n = 0, k;
    var buckets = [p.levels, p.records, p];
    for (var b = 0; b < buckets.length; b++) {
      var box = buckets[b];
      if (!box || typeof box !== 'object') continue;
      for (k in box) {
        if (!has(box, k)) continue;
        var rec = box[k];
        if (rec && rec.cleared === true) n++;
      }
      if (n > 0) break;
    }
    return n;
  }
  function viewedContentCount() {
    var d = getAppData();
    var vc = (d && d.viewedContent) || {};
    var n = 0, k;
    for (k in vc) {
      if (has(vc, k) && isArr(vc[k])) { n += vc[k].length; }
    }
    return n;
  }
  function publishedNotesCount() {
    var d = getAppData();
    var notes = (d && d.notes) || [];
    if (!isArr(notes)) return 0;
    var n = 0, i;
    for (i = 0; i < notes.length; i++) { if (notes[i] && notes[i].status === 'published') { n++; } }
    return n;
  }
  function vocabLearnedCount() {
    var d = getAppData();
    var a = (d && d.vocabLearned) || [];
    return isArr(a) ? a.length : 0;
  }

  /** 汇总全部真实指标（无数据即 0，绝不虚构） */
  function metrics() {
    var st = getStats();
    var totalHours = num(st.totalHours);
    if (totalHours <= 0) { totalHours = Math.round(sumStudySeconds() / 3600 * 10) / 10; }
    var totalQuestions = Math.round(num(st.totalQuestions));
    var correct = Math.round(num(st.correctQuestions));
    var accuracy = totalQuestions > 0 ? Math.round(correct / totalQuestions * 100) : 0;

    var ss = studyStats();
    var streak = Math.max(Math.round(num(st.streakDays)), Math.round(num(ss.streak)));

    var weekMin = weekMinutesFromStudyStats();
    if (weekMin <= 0) { weekMin = weekSecondsFromStudyTime() / 60; }
    var weekHours = Math.round(weekMin / 60 * 10) / 10;

    var courses = questClearedCount();
    if (courses <= 0) { courses = viewedContentCount(); }

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      totalQuestions: totalQuestions,
      accuracy: accuracy,
      streak: streak,
      weekHours: weekHours,
      courses: courses,
      published: publishedNotesCount(),
      vocab: vocabLearnedCount(),
      todayMinutes: Math.round(num(st.todayMinutes)),
      hasAny: (totalHours > 0 || totalQuestions > 0 || streak > 0)
    };
  }

  /* ============================================================== 学习等级 */
  var LEVEL_NAMES = ['入门学者', '勤学学者', '进取学者', '进阶学者', '精进学者', '博学学者', '卓越学者', '领航学者', '学神'];
  var LEVEL_THRESHOLDS = [0, 80, 240, 480, 900, 1500, 2400, 3600, 5200];
  function levelOf(m) {
    // 经验值：每学习 1 小时记 6 分，每做 1 题记 1 分（均由真实数据推导）
    var score = Math.floor(m.totalHours) * 6 + Math.floor(m.totalQuestions);
    var i = 0;
    for (i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) { if (score >= LEVEL_THRESHOLDS[i]) break; }
    if (i < 0) i = 0;
    var next = (i + 1 < LEVEL_THRESHOLDS.length) ? LEVEL_THRESHOLDS[i + 1] : null;
    var pct = 100, gapText = '已达最高等级';
    if (next !== null) {
      var lo = LEVEL_THRESHOLDS[i];
      pct = clamp(Math.round((score - lo) / (next - lo) * 100), 0, 100);
      gapText = '距下一级还差 ' + (next - score) + ' 经验';
    }
    return { lv: i + 1, name: LEVEL_NAMES[i] || '学者', next: next, pct: pct, gapText: gapText, score: score };
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var s = String(iso);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
    return s.slice(0, 16).replace('T', ' ');
  }

  /* ============================================ 角标 / 右侧小字 真实数据源 */
  function notesArr() { var d = getAppData(); return isArr(d.notes) ? d.notes : []; }
  function favoriteArr() { var d = getAppData(); return isArr(d.favoriteQuestions) ? d.favoriteQuestions : []; }
  function aiChatArr() { var a = readJSON('ai_chat_history', []); return isArr(a) ? a : []; }


  /** 时间戳 → 'YYYY-MM-DD HH:MM' */
  function tsText(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  /** 本机 ai_chat_history 的消息总条数（会话结构：逐会话累加 messages.length） */
  function localChatCount() {
    var arr = aiChatArr(), n = 0, i;
    for (i = 0; i < arr.length; i++) {
      var ms = (arr[i] && isArr(arr[i].messages)) ? arr[i].messages : [];
      n += ms.length;
    }
    return n;
  }
  /** 是否可走服务端：api.js 已加载 + 有登录态（游客态请求必然 401，故直接跳过不发请求） */
  function aiApiReady() {
    if (typeof window.isOnlineSession !== 'function') { return false; }
    if (!window.isOnlineSession()) { return false; }
    return typeof window.api === 'function';
  }

  /* ============================ 个人信息编辑 · 扩展字段的真实数据源 ============================ */
  /* 三个既有字段直接复用 appData.profile（与 设置.html / 个人中心.html 的资料编辑同源，单一真相）：
       地区 = profile.city ｜ 生日 = profile.birthday ｜ 目标 = profile.goal
     两个后端无能力的纯自填字段写入本页自有键（按账号隔离，经 lsKey 前缀化）：
       手机号 / 邮箱 = xt_profile_fields_v1@<账号>                                        */
  var FIELDS_KEY = 'xt_profile_fields_v1';

  /** 读本页自填字段表（按账号隔离） */
  function profileFields() {
    var o = readAcctJSON(FIELDS_KEY, null);
    return (o && typeof o === 'object') ? o : {};
  }
  /** 写本页自填字段（空值即删除键，不留空串假数据） */
  function saveField(key, val) {
    var o = profileFields();
    var v = (val === null || val === undefined) ? '' : String(val).trim();
    if (!v) { delete o[key]; } else { o[key] = v; }
    try { localStorage.setItem(lsKey(FIELDS_KEY), JSON.stringify(o)); return true; }
    catch (e) { return false; }
  }
  /** 读 设置.html 的「绑定与认证」本机绑定表（同一键名 study_workbench_bindings，同样按账号隔离） */
  function bindingsLocal() {
    var o = readAcctJSON('study_workbench_bindings', null);
    return (o && typeof o === 'object') ? o : {};
  }
  function bindValue(channel) {
    var r = bindingsLocal()[channel];
    return (r && r.value) ? String(r.value) : '';
  }

  /** 地区 / 生日 / 目标：直接读既有 profile 字段 */
  function regionVal() { var p = getProfile(); return (p.city && String(p.city).trim()) || ''; }

  /* R88-J item1：地区选择跳转 + 回写消费（自建，不依赖个人中心.html 作用域）。 */
  var XTP_REGION_PICK_KEY = 'xt_region_pick';
  var XTP_REGION_TTL = 10 * 60 * 1000;   // 10 分钟 TTL（沿用既有协议）

  /** 页面跳转（可被测试覆写：window.xtpNavHook）。默认写 location.href。 */
  function xtpNav(url) {
    try {
      if (window.xtpNavHook && typeof window.xtpNavHook === 'function') { window.xtpNavHook(url); return; }
    } catch (e0) { /* 忽略 hook 异常，回退真实跳转 */ }
    location.href = url;
  }

  /** 跳转到「地区选择.html」，current=当前地区，back=本页文件名（供回跳）。 */
  function xtpOpenRegionPicker() {
    var back = '个人资料.html';
    try {
      var pn = location.pathname || '';
      var k = pn.lastIndexOf('/');
      if (k >= 0 && pn.length > k + 1) { back = decodeURIComponent(pn.substring(k + 1)); }
    } catch (e) { /* 保持默认 */ }
    var cur = regionVal();
    try {
      xtpNav('地区选择.html?cur=' + encodeURIComponent(cur) + '&back=' + encodeURIComponent(back));
    } catch (e2) {
      toast('无法打开地区选择页', true);
    }
  }

  /** 消费地区选择回写值（一次性 + 10 分钟 TTL），返回地区文本或 ''。 */
  function xtpTakeRegionPick() {
    var raw = '';
    try { raw = localStorage.getItem(XTP_REGION_PICK_KEY) || ''; } catch (e) { return ''; }
    if (!raw) return '';
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e2) { obj = null; }
    try { localStorage.removeItem(XTP_REGION_PICK_KEY); } catch (e3) { /* 忽略 */ }
    if (!obj || !obj.text) return '';
    try { if (obj.ts && (Date.now() - obj.ts > XTP_REGION_TTL)) return ''; } catch (e4) { return ''; }
    return String(obj.text).slice(0, 40);
  }
  function birthdayVal() { var p = getProfile(); return (p.birthday && String(p.birthday).trim()) || ''; }
  function goalVal() { var p = getProfile(); return (p.goal && String(p.goal).trim()) || ''; }
  /** 手机号：后端无手机号能力 → 本页自填优先，其次 设置页本地绑定表（同为“未验证”本地数据） */
  function phoneVal() {
    var f = profileFields();
    return (f.phone && String(f.phone).trim()) || bindValue('phone') || '';
  }
  /** 手机号宽松校验：11 位、1[3-9] 开头（允许 +86 / 空格 / 连字符） */
  function normPhone(v) {
    var s = String(v === null || v === undefined ? '' : v).replace(/[\s-]/g, '');
    if (s.indexOf('+86') === 0) s = s.slice(3);
    return s;
  }
  function phoneOk(s) { return /^1[3-9]\d{9}$/.test(s); }

  /* 邮箱：双态。服务端已绑定（GET /api/auth/me → email 非空）→「已绑定」只读 + 跳设置页；
     否则显示本地填写值（本页自填 优先，其次 设置页本地绑定表）并标记「未验证」，可编辑。 */
  var emailRemote = '';          // 服务端邮箱（'' = 未绑定 / 未拉到）
  var emailRemoteLoaded = false; // 是否已成功拉到服务端态
  function emailInfo() {
    var f = profileFields();
    var local = (f.email && String(f.email).trim()) || bindValue('email') || '';
    if (emailRemoteLoaded && emailRemote) { return { value: emailRemote, verified: true, editable: false }; }
    return { value: local, verified: false, editable: true };
  }
  function emailOk(s) { return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s); }
  /** 在线时读服务端真实绑定态（失败/离线静默保留本地态） */
  function loadRemoteEmail(cb) {
    try {
      if (typeof window.isOnlineSession !== 'function' || !window.isOnlineSession()) { if (cb) cb(); return; }
      if (typeof window.api !== 'function') { if (cb) cb(); return; }
      window.api('/api/auth/me', { method: 'GET' }).then(function (me) {
        emailRemote = (me && me.email) ? String(me.email) : '';
        emailRemoteLoaded = true;
        if (cb) cb();
      })['catch'](function () { if (cb) cb(); });
    } catch (e) { if (cb) cb(); }
  }

  function notesBadge() { var n = notesArr().length; return n > 0 ? String(n) : ''; }
  function favBadge() { var n = favoriteArr().length; return n > 0 ? String(n) : ''; }
  function chatBadge() {
    /* R91-A：角标改本机口径——不再读取服务端条数（AI_CHAT.total），只按本机会话数显示 */
    var n = localChatCount();
    return n > 0 ? String(n) : '';
  }
  /** 学习数据右侧小字：本周 X.Xh（真实值；0 或取不到则返回空 → 不显示） */
  function weekText(m) { return m.weekHours > 0 ? ('本周 ' + m.weekHours.toFixed(1) + 'h') : ''; }

  /* ============================================================ 用户与ID */
  function userName() {
    var p = getProfile();
    return (p.name && String(p.name).trim()) || (p.nickname && String(p.nickname).trim()) || '同学';
  }
  function userMotto() { var p = getProfile(); return (p.motto && String(p.motto).trim()) || ''; }
  function userGender() {
    var p = getProfile();
    var g = p.gender ? String(p.gender) : '';
    return (g === 'male' || g === 'female' || g === 'secret') ? g : 'secret';
  }
  function avatarSrc() {
    var p = getProfile();
    var u = p.avatarImg || p.avatarUrl || '';
    return u ? String(u) : '';
  }
  /** 6 位小写字母数字（base36）稳定派生：真实账号 id/username/account → 稳定；否则本地生成一次并持久化 */
  function derive6(base) {
    var s = String(base || ''), h = 2166136261, i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', out = '';
    for (i = 0; i < 6; i++) { out += chars.charAt(h % 36); h = Math.floor(h / 36) + 7 * (i + 1); }
    return out;
  }
  function userId() {
    var cached = getItem('xt_profile_uid_v2');
    if (cached) return cached;
    var base = '';
    // ① 真实来源：study_workbench_auth 里的 id / username / account
    try {
      var a = JSON.parse(localStorage.getItem('study_workbench_auth') || 'null');
      if (a && typeof a === 'object') {
        base = a.id || a.uid || a.userId || a.username || a.account || '';
      }
    } catch (e) { /* 忽略 */ }
    // ② 真实来源：上次登录账号
    if (!base) { base = getItem('study_workbench_last_account'); }
    // ③ 由真实身份稳定派生；无任何真实身份 → 生成一次并持久化（绝不每次刷新变一个）
    var id = base ? derive6(base) : derive6('local:' + Date.now() + ':' + Math.random());
    setItem('xt_profile_uid_v2', id);
    return id;
  }

  /* ================================================ TA 视角（查看他人资料） */
  /* 入口：个人资料.html?user=<服务端数字 uid>（不带 ?user= → 本人视角，行为完全不变）。
     ⚠️ 安全红线：TA 视角**只**渲染服务端公开白名单字段
     （nickname / avatarUrl / motto / bio / city / goal / createdAt / online /
       lastSeenAt / isFriend / stats / notes 条数）。
     以下敏感字段即使接口返回，也**绝不渲染**：
       phone / email / emailVerified / gender / birthday / privacy / username / token_version。 */
  /** 解析 URL 的 ?user=<uid>：仅接受纯数字（服务端 uid 为数字），
      非法值（含字母、% 编码、路径穿越）一律当「无参数」处理；整段 try/catch，老 WebView 不抛。 */
  function viewUid() {
    try {
      var q = String(location.search || '');
      var m = /[?&]user=([^&#]*)/.exec(q);
      if (!m) { return ''; }
      var raw = String(m[1] || '').replace(/\+/g, '');
      return /^\d+$/.test(raw) ? raw : '';
    } catch (e) { return ''; }
  }
  /** 是否处于「他人视角」 */
  function isOtherMode() { return viewUid() !== ''; }

  /** ISO 时间 → YYYY-MM-DD；取不到返回空串（由调用方决定是否渲染整行） */
  function fmtDate(iso) {
    if (!iso) { return ''; }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : '';
  }
  /** 相对时间（仅供在线状态文案）；取不到返回空串 */
  function relTime(iso) {
    if (!iso) { return ''; }
    var t = Date.parse(String(iso));
    if (!isFinite(t)) { return ''; }
    var diff = Date.now() - t;
    if (diff < 0) { diff = 0; }
    var min = Math.floor(diff / 60000);
    if (min < 1) { return '刚刚'; }
    if (min < 60) { return min + ' 分钟前'; }
    var hr = Math.floor(min / 60);
    if (hr < 24) { return hr + ' 小时前'; }
    var day = Math.floor(hr / 24);
    if (day < 30) { return day + ' 天前'; }
    return fmtDate(iso);
  }
  /** 在线状态文案：online===true → 「在线」；否则 → 「最后活跃 <相对时间>」；无数据 → 空串（整行不渲染） */
  function presenceText(online, lastSeenAt) {
    if (online === true) { return '在线'; }
    if (!lastSeenAt) { return ''; }
    var r = relTime(lastSeenAt);
    return r ? ('最后活跃 ' + r) : '';
  }

  /* R74-B TA 视角页状态（模块级缓存：渲染函数与事件委托统一读最新值，重绘不重复绑定） */
  var OTHER_UID = '';           // 当前查看的服务端数字 uid
  var OTHER_USER = null;        // GET /api/users/{uid} 返回的用户对象（公开白名单字段）
  var OTHER_REMARK = '';        // 好友备注名（仅好友态；来源 GET /api/friends 列表项 peerRemark）
  var OTHER_MOMENT_COUNT = -1;  // 动态条数（<0 = 未知，不显示数值）
  var OTHER_MOMENTS = null;     // null=加载中；'forbidden'=仅好友可见；'error'=加载失败；数组=最近动态

  /** TA hero：视觉与本人 hero 一致，但**不挂 data-act="edit"**、头像不可点、无右箭头。
      R74-B：右侧新增操作区（好友 = 发消息 + 删除好友；非好友 = 加好友）；
      ID 显示服务端数字 uid（GET /api/users/{uid} 的 id 字段，URL 参数兜底）；
      好友且已设置备注名时，昵称旁显示备注名胶囊。
      注意：不使用 id="xtpHero"/"xtpHeroAvatar"，故 bindHero() 在 TA 视角不会绑定任何行为。 */
  function otherHeroHtml(uid, u) {
    var name = String((u && u.nickname) || '').trim() || 'TA';
    var isFriend = !!(u && u.isFriend === true);
    var remark = isFriend ? String(OTHER_REMARK || '').trim() : '';
    var avSrc = '';
    try { if (typeof window.apiAvatarSrcOf === 'function') { avSrc = window.apiAvatarSrcOf(u) || ''; } } catch (e) { avSrc = ''; }
    if (!avSrc && u && typeof u.avatarUrl === 'string') { avSrc = u.avatarUrl; }
    var avInner = avSrc ? '<img src="' + esc(avSrc) + '" alt="">' : esc(name.slice(0, 1) || '学');
    var motto = String((u && (u.motto || u.bio)) || '').trim();
    var city = String((u && u.city) || '').trim();
    var created = fmtDate(u && u.createdAt);
    var ptxt = presenceText(u && u.online, u && u.lastSeenAt);
    var meta = [];
    if (city) { meta.push(city); }
    if (created) { meta.push('入驻于 ' + created); }
    if (ptxt) { meta.push(ptxt); }
    var metaHtml = meta.length
      ? '<div class="xtp-hero-id" style="color:var(--xtp-aux)">' + esc(meta.join(' · ')) + '</div>'
      : '';
    var remarkHtml = remark
      ? '<span class="xtp-hero-remark" title="好友备注名">备注：' + esc(remark) + '</span>'
      : '';
    var sid = (u && u.id && /^\d+$/.test(String(u.id))) ? String(u.id) : String(uid);
    return '<section class="xtp-hero xtp-hero-other" id="xtpHeroOther" style="cursor:default">' +
      '<div class="xtp-hero-avatar" id="xtpOtherAvatar" style="cursor:default">' + avInner + '</div>' +
      '<div class="xtp-hero-main">' +
        '<div class="xtp-hero-name-row"><div class="xtp-hero-name">' + esc(name) + '</div>' + remarkHtml + '</div>' +
        '<div class="xtp-hero-id">ID：<b>' + esc(sid) + '</b></div>' +
        (motto ? '<div class="xtp-hero-motto">' + esc(motto) + '</div>' : '') +
        metaHtml +
      '</div>' +
      otherHeroActsHtml(uid, u) +
      '</section>';
  }

  /** TA hero 右侧操作区（R74-B）：isFriend===true → 发消息 + 删除好友；false → 加好友；
      关系未知 → 不渲染。按钮统一 data-other-act，由 bindOtherActions 委托分发；
      样式 .xtp-hero-act（xt-profile.css）。 */
  function otherHeroActsHtml(uid, u) {
    var btns = '';
    if (u && u.isFriend === true) {
      btns += '<button class="xtp-hero-act" type="button" data-other-act="chat">' +
        '<span class="nav-icon" data-icon="message-square" data-icon-size="14"></span>发消息</button>';
      btns += '<button class="xtp-hero-act danger" type="button" data-other-act="delfriend">' +
        '<span class="nav-icon" data-icon="delete" data-icon-size="14"></span>删除好友</button>';
    } else if (u && u.isFriend === false) {
      btns += '<button class="xtp-hero-act primary" type="button" data-other-act="addfriend">' +
        '<span class="nav-icon" data-icon="user" data-icon-size="14"></span>加好友</button>';
    }
    if (!btns) { return ''; }
    return '<div class="xtp-hero-acts">' + btns + '</div>';
  }

  /* R74-B：原独立动作区（otherActionsHtml）已并入 hero 右侧操作区（otherHeroActsHtml）。 */

  /** TA 分组（仅公开白名单字段；空值行不渲染）。
      R74-B：好友态「TA 的资料」首行新增「备注名」（点击弹层设置）；
      「TA 的动态」改为列表模块（otherMomentsListHtml：最近若干条 + 查看全部入口）；
      非好友态隐藏「系统 → 关于」。momentCount < 0 表示条数未知 → 不显示数值。 */
  function otherGroupDefs(uid, u, momentCount, moments) {
    var city = String((u && u.city) || '').trim();
    var goal = String((u && u.goal) || '').trim();
    var created = fmtDate(u && u.createdAt);
    var ptxt = presenceText(u && u.online, u && u.lastSeenAt);
    var aboutRows = [];
    if (u && u.isFriend === true) {
      aboutRows.push({ icon: 'pen', title: '备注名', val: String(OTHER_REMARK || '').trim() || '未设置', oact: 'remark' });
    }
    if (city) { aboutRows.push({ icon: 'map', title: '地区', val: city, info: true }); }
    if (goal) { aboutRows.push({ icon: 'target', title: '目标', val: goal, info: true }); }
    if (created) { aboutRows.push({ icon: 'clock', title: '入驻时间', val: created, info: true }); }
    if (ptxt) { aboutRows.push({ icon: 'zap', title: '在线状态', val: ptxt, info: true }); }

    var notesCount = 0, hasNotes = false;
    if (u && isArr(u.notes)) { notesCount = u.notes.length; hasNotes = true; }
    else if (u && u.stats && typeof u.stats === 'object' && typeof u.stats.published === 'number') {
      notesCount = num(u.stats.published); hasNotes = true;
    }

    var contentRows = [
      { icon: 'file-text', title: 'TA 的公开贴', val: hasNotes ? String(notesCount) : '', href: '社区.html' }
    ];

    var out = [];
    if (aboutRows.length) { out.push({ title: 'TA 的资料', rows: aboutRows }); }
    out.push({ title: 'TA 的内容', rows: contentRows });
    out.push({ title: 'TA 的动态', html: otherMomentsListHtml(uid, momentCount, moments) });
    if (!(u && u.isFriend === false)) {
      out.push({ title: '系统', rows: [{ icon: 'info', title: '关于', act: 'about' }] });
    }
    return out;
  }

  /** TA 的动态列表模块（R74-B）：最近若干条（文案 + 时间 + 图片数，样式复用 .xtp-li 卡片行），
      尾行「查看全部动态」入口 → 动态空间.html?user=<uid>。
      moments：null=加载中；'forbidden'=仅好友可见（非好友 403）；'error'=加载失败；数组=动态列表。 */
  function otherMomentsListHtml(uid, momentCount, moments) {
    var body = '';
    if (moments === 'forbidden') {
      body = '<div class="xtp-li"><div class="xtp-li-meta">动态仅好友可见</div></div>';
    } else if (moments === 'error') {
      body = '<div class="xtp-li"><div class="xtp-li-meta">动态加载失败，请稍后重试</div></div>';
    } else if (moments === null || typeof moments === 'undefined') {
      body = '<div class="xtp-li"><div class="xtp-li-meta">加载中…</div></div>';
    } else if (!isArr(moments) || !moments.length) {
      body = '<div class="xtp-li"><div class="xtp-li-meta">TA 还没有发布动态</div></div>';
    } else {
      var max = moments.length < 5 ? moments.length : 5;
      for (var i = 0; i < max; i++) {
        var m = moments[i] || {};
        var txt = String(m.content || '').replace(/\s+/g, ' ').trim();
        if (txt.length > 60) { txt = txt.slice(0, 60) + '…'; }
        var imgN = (isArr(m.images) && m.images.length) ? (' · ' + m.images.length + ' 张图片') : '';
        body += '<div class="xtp-li xtp-li-tap" data-other-act="moments">' +
          '<div class="xtp-li-body">' + esc(txt || '（无文字内容）') + '</div>' +
          '<div class="xtp-li-meta">' + esc(fmtTime(m.createdAt) || '时间未知') + esc(imgN) + '</div>' +
          '</div>';
      }
    }
    var momentsVal = (typeof momentCount === 'number' && momentCount >= 0) ? String(momentCount) : '';
    var entry = cellHtml({ icon: 'rss', title: '查看全部动态', val: momentsVal, href: '动态空间.html?user=' + encodeURIComponent(uid) });
    return body + entry;
  }

  /** TA 视角整页绘制（与 renderPage() 并列）。
      TA 视角**不存在**：学习记录 / 我的笔记 / 我的收藏 / 学习数据 / 作品集 /
      AI对话记录 / 退出登录 —— 这些均为本人专属，groupDefs() 不会在此使用。
      R74-B：动作按钮并入 hero 右侧；「TA 的动态」为列表模块；
      moments 为可选参数（缺省沿用模块级缓存 OTHER_MOMENTS）。 */
  function paintOther(root, uid, u, momentCount, moments) {
    OTHER_UID = uid;
    OTHER_USER = u;
    if (typeof momentCount === 'number') { OTHER_MOMENT_COUNT = momentCount; }
    if (typeof moments !== 'undefined') { OTHER_MOMENTS = moments; }
    var groups = otherGroupDefs(uid, u, momentCount, moments);
    var html = otherHeroHtml(uid, u);
    for (var gi = 0; gi < groups.length; gi++) { html += groupHtml(groups[gi]); }
    html += '<div class="xtp-tip">资料来自服务端公开信息；性别 / 生日 / 手机号 / 邮箱等隐私字段不对外展示。</div>';
    root.innerHTML = html;
    bindOtherActions(root, uid, u);
    if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); }
    bindRoot();
  }

  /** TA 视角局部重绘（R74-B：备注名保存等无需重新拉取时使用，基于模块级缓存） */
  function otherRepaint() {
    var root = $('xtProfileRoot');
    if (!root || !OTHER_USER) { return; }
    paintOther(root, OTHER_UID, OTHER_USER, OTHER_MOMENT_COUNT, OTHER_MOMENTS);
  }

  /** 动作事件委托（R74-B：hero 右侧按钮 + 备注名行 + 动态列表行，统一 data-other-act）。
      绑定在持久容器 #xtProfileRoot 上（data-other-bound 防重复绑定），
      点击时读模块级缓存 OTHER_UID / OTHER_USER / OTHER_REMARK，保证重绘后行为最新；
      这些元素无 data-href/view/act，故与 bindRoot 的 if 链互不干扰。 */
  function bindOtherActions(root, uid, u) {
    OTHER_UID = uid;
    OTHER_USER = u;
    if (!root || root.getAttribute('data-other-bound') === '1') { return; }
    root.setAttribute('data-other-bound', '1');
    root.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== root) {
        if (el.getAttribute) {
          var a = el.getAttribute('data-other-act');
          if (a === 'chat') {
            var nm = String((OTHER_REMARK || (OTHER_USER && OTHER_USER.nickname)) || 'TA').trim() || 'TA';
            location.href = '私聊.html?uid=' + encodeURIComponent(OTHER_UID) + '&name=' + encodeURIComponent(nm);
            return;
          }
          if (a === 'addfriend') { otherAddFriend(OTHER_UID); return; }
          if (a === 'delfriend') { otherDelFriend(OTHER_UID, OTHER_USER); return; }
          if (a === 'remark') { otherSetRemark(OTHER_UID, OTHER_USER); return; }
          if (a === 'moments') { location.href = '动态空间.html?user=' + encodeURIComponent(OTHER_UID); return; }
        }
        el = el.parentNode;
      }
    });
  }

  /** 加好友（与 api.js addFriend 同端点：POST /api/friends/requests {toUserId}） */
  function otherAddFriend(uid) {
    try {
      if (typeof window.api !== 'function') { toast('网络组件未就绪，请稍后重试', true); return; }
      window.api('/api/friends/requests', { method: 'POST', body: { toUserId: Number(uid) } }).then(function () {
        toast('好友请求已发送');
      })['catch'](function (e) { toast('发送失败：' + ((e && e.message) ? e.message : e), true); });
    } catch (e2) { toast('发送失败，请稍后重试', true); }
  }

  /** TA 的最近动态 + 条数（R74-B：动态列表模块数据源）。
      onDone(count, moments)：count<0 = 条数未知；moments = 数组 / 'forbidden'（非好友 403，仅好友可见）/ 'error'。 */
  function loadOtherMoments(uid, onDone) {
    try {
      if (typeof window.api !== 'function') { if (onDone) { onDone(-1, 'error'); } return; }
      window.api('/api/moments/user/' + encodeURIComponent(uid) + '?limit=50', { method: 'GET' }).then(function (r) {
        var items = (r && isArr(r.items)) ? r.items : [];
        if (onDone) { onDone(items.length, items); }
      })['catch'](function (e) {
        var msg = String((e && e.message) || '');
        var forb = (msg.indexOf('403') >= 0 || msg.indexOf('好友') >= 0);
        if (onDone) { onDone(-1, forb ? 'forbidden' : 'error'); }
      });
    } catch (e2) { if (onDone) { onDone(-1, 'error'); } }
  }

  /** 好友备注名（R74-B，仅好友态拉取；来源 GET /api/friends 列表项的 peerRemark；失败静默为空） */
  function loadOtherRemark(uid, cb) {
    try {
      if (typeof window.api !== 'function') { if (cb) { cb(''); } return; }
      window.api('/api/friends', { method: 'GET' }).then(function (r) {
        var list = isArr(r) ? r : (r && isArr(r.items) ? r.items : []);
        var rmk = '';
        for (var i = 0; i < list.length; i++) {
          if (list[i] && Number(list[i].id) === Number(uid)) { rmk = String(list[i].peerRemark || ''); break; }
        }
        if (cb) { cb(rmk); }
      })['catch'](function () { if (cb) { cb(''); } });
    } catch (e) { if (cb) { cb(''); } }
  }

  /** 删除好友（R74-B）：uiConfirm 二次确认（本页未加载 app.js 时回退本页 confirmBox 弹层，
      绝不用原生 confirm）；DELETE /api/friends/{peer_id}；成功后重新拉取资料页
      （isFriend 变 false，hero 右侧切换为「加好友」）。 */
  function otherDelFriend(uid, u) {
    var nm = String((u && u.nickname) || 'TA');
    function doDel() {
      try {
        if (typeof window.api !== 'function') { toast('网络组件未就绪，请稍后重试', true); return; }
        window.api('/api/friends/' + encodeURIComponent(uid), { method: 'DELETE' }).then(function () {
          toast('已删除好友');
          OTHER_REMARK = '';
          setTimeout(function () { renderOtherPage(uid); }, 400);
        })['catch'](function (e) { toast('删除失败：' + ((e && e.message) ? e.message : e), true); });
      } catch (e2) { toast('删除失败，请稍后重试', true); }
    }
    var msg = '确定要删除好友「' + nm + '」吗？删除后将解除好友关系。';
    if (typeof window.uiConfirm === 'function') {
      window.uiConfirm(msg, '删除').then(function (ok) { if (ok) { doDel(); } });
    } else {
      confirmBox('删除好友', msg, '删除', true, doDel);
    }
  }

  /** 设置好友备注名（R74-B）：复用本页既有弹层输入 openFieldEditor（禁用原生 prompt）；
      PUT /api/friends/{peer_id}/remark（优先 api.js 的 apiSetFriendRemark 封装，最多 20 字符）；
      保存成功后昵称旁显示备注名（otherRepaint 局部重绘，不整页刷新）。 */
  function otherSetRemark(uid, u) {
    var nm = String((u && u.nickname) || 'TA');
    function afterSave(val) {
      OTHER_REMARK = String(val || '');
      toast(OTHER_REMARK ? '备注名已保存' : '备注名已清除');
      otherRepaint();
    }
    openFieldEditor({
      title: '好友备注名',
      value: String(OTHER_REMARK || ''),
      placeholder: '给「' + nm + '」设置备注名',
      maxLen: 20,
      note: '备注名仅自己可见，最多 20 个字符；留空保存即清除备注。',
      validate: function (v) { return v.length > 20 ? '备注名最多 20 个字符' : ''; },
      onSave: function (v) {
        var val = String(v || '').slice(0, 20);
        try {
          if (typeof window.apiSetFriendRemark === 'function') {
            window.apiSetFriendRemark(uid, val).then(function () { afterSave(val); })['catch'](function (e) { toast('保存失败：' + ((e && e.message) ? e.message : e), true); });
          } else if (typeof window.api === 'function') {
            window.api('/api/friends/' + encodeURIComponent(uid) + '/remark', { method: 'PUT', body: { remark: val } }).then(function () { afterSave(val); })['catch'](function (e) { toast('保存失败：' + ((e && e.message) ? e.message : e), true); });
          } else {
            toast('网络组件未就绪，请稍后重试', true);
          }
        } catch (e2) { toast('保存失败，请稍后重试', true); }
      }
    });
  }

  /** 未登录的 TA 视角：友好空态 + 「去登录」；**不发任何请求**、不渲染任何本人专属行项 */
  function renderOtherLogin() {
    var root = $('xtProfileRoot');
    if (!root) { return; }
    root.innerHTML =
      '<div class="xtp-empty" style="padding-bottom:2px"><b style="font-size:16px;color:var(--xtp-text)">TA 的资料</b></div>' +
      '<div class="xtp-empty" style="padding-top:2px">登录后可查看 TA 的个人资料</div>' +
      '<section class="xtp-sec"><div class="xtp-cell" role="button" tabindex="0" data-href="登录.html">' +
        '<span class="xtp-cell-ic"><span class="nav-icon" data-icon="user" data-icon-size="16"></span></span>' +
        '<div class="xtp-cell-title">去登录</div>' +
        '<div class="xtp-cell-right"><span class="xtp-cell-arrow"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></span></div>' +
      '</div></section>';
    if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); }
    bindRoot();
  }

  /** TA 视角渲染入口（需已登录）：拉 /api/users/{uid} → 绘制；isMe 则回本人视角。
      R74-B：好友态并行拉取备注名与最近动态列表，各自就绪后局部重绘（otherRepaint）。 */
  function renderOtherPage(uid) {
    var root = $('xtProfileRoot');
    if (!root) { return; }
    root.innerHTML = '<div class="xtp-empty">加载中…</div>';
    OTHER_UID = uid;
    OTHER_USER = null;
    OTHER_REMARK = '';
    OTHER_MOMENT_COUNT = -1;
    OTHER_MOMENTS = null;
    var done = false;
    function fail(msg) {
      if (done) { return; }
      done = true;
      root.innerHTML = '<div class="xtp-empty">' + esc(msg || '加载失败') + '</div>';
    }
    try {
      if (typeof window.api !== 'function') { fail('网络组件未就绪，请稍后重试'); return; }
      window.api('/api/users/' + encodeURIComponent(uid), { method: 'GET' }).then(function (u) {
        if (done) { return; }
        if (!u || typeof u !== 'object') { fail('用户不存在'); return; }
        // 服务端已算好 isMe（等价于用 /api/auth/me 的 id 与 viewUid() 比较）；
        // 是自己则回到不带参数的本人视角，避免历史里留两条。
        if (u.isMe === true) { done = true; location.replace('个人资料.html'); return; }
        done = true;
        OTHER_USER = u;
        otherRepaint();
        // 好友备注名（仅好友态拉取，失败静默不显示）
        if (u.isFriend === true) {
          loadOtherRemark(uid, function (rmk) {
            if (OTHER_USER === u) { OTHER_REMARK = String(rmk || ''); otherRepaint(); }
          });
        }
        // 最近动态列表（非好友 403 → 「仅好友可见」占位）
        loadOtherMoments(uid, function (count, moments) {
          if (OTHER_USER === u) { OTHER_MOMENT_COUNT = count; OTHER_MOMENTS = moments; otherRepaint(); }
        });
      })['catch'](function (e) { fail((e && e.message) ? e.message : '加载失败'); });
    } catch (e2) { fail('加载失败'); }
  }

  /** TA 视角总入口：未登录 → 空态（不发请求）；已登录 → 拉取资料 */
  function renderOtherEntry(uid) {
    if (!getItem('study_workbench_token')) { renderOtherLogin(); return; }
    renderOtherPage(uid);
  }

  /** 返回键：TA 视角优先回到来源（同源动态 / 社区页），绝不误落回「本人视角」 */
  function xtpBack() {
    try {
      if (isOtherMode()) {
        var ref = otherReferrer();
        if (ref) { location.href = ref; return; }
        if (history.length > 1) { history.back(); return; }
        location.href = '学习工作台.html'; return;
      }
    } catch (e) { /* 继续走本人视角兜底 */ }
    if (history.length > 1) { history.back(); } else { location.href = '个人中心.html'; }
  }
  /** 同源（或 file: 同目录）的 动态空间 / 社区 页 referrer；否则返回空串 */
  function otherReferrer() {
    var ref = String(document.referrer || '');
    if (!ref) { return ''; }
    if (!/动态空间\.html|社区\.html/.test(ref)) { return ''; }
    if (location.protocol === 'file:') { return ref; }
    if (location.origin && ref.indexOf(location.origin) === 0) { return ref; }
    return '';
  }

  /* ============================================================ 版本号来源 */
  var appVer = 'v2.3';   // 兜底：与 关于.html #aboutVersion 保持一致（fetch 不可用时使用）
  function loadAppVersion(cb) {
    try {
      if (typeof fetch !== 'function') { cb(appVer); return; }
      fetch('关于.html?v=20260917', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
        var m = /id="aboutVersion"[^>]*>([^<]+)</.exec(t);
        if (m && m[1] && m[1].trim()) { appVer = m[1].trim(); }
        cb(appVer);
      })['catch'](function () { cb(appVer); });
    } catch (e) { cb(appVer); }
  }

  /* ================================================================= 图标 */
  var QR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14h1"/><path d="M14 20h3"/><path d="M20 20h1"/><path d="M18 18h3"/></svg>';

  /* ================================================= 分组与列表项（真实落点） */
  /** 每项：icon / title / 右侧（badge 红点数字 或 小字） / 动作 */
  /* 事2：每组补一个视觉组标题（仅视觉层，不改信息架构 / 条目归属）。 */
  function groupDefs(m) {
    return [
      { title: '学习', rows: [
        { icon: 'calendar-clock', title: '学习记录', href: '学习概括.html' },
        { icon: 'notebook', title: '我的笔记', view: 'notes', badge: notesBadge() },
        { icon: 'star', title: '我的收藏', view: 'fav', badge: favBadge() }
      ] },
      { title: '成果', rows: [
        { icon: 'chart-bar', title: '学习数据', view: 'data', val: weekText(m) },
        { icon: 'briefcase', title: '作品集', href: '我的文件.html' },
        // 我的动态：本人发布的内容，与「作品集」同为“本人产出物”，故归入成果组（用户口头未指定组）。
        // 无真实角标来源，故不加角标 / 右侧小字。
        { icon: 'image', title: '我的动态', href: '我的动态.html' }
      ] },
      { title: '工具', rows: [
        { icon: 'bot', title: 'AI对话记录', view: 'chat', badge: chatBadge() }
      ] },
      { title: '系统', rows: [
        // 系统（用户要求删除「设置」，本组只剩「关于」一项）
        { icon: 'info', title: '关于', act: 'about' }
      ] }
    ];
  }

  function cellHtml(it) {
    var right = '';
    if (it.badge) { right += '<span class="xtp-badge">' + esc(it.badge) + '</span>'; }
    if (it.val) { right += '<span class="xtp-cell-val">' + esc(it.val) + '</span>'; }
    /* it.info=true：纯信息行（TA 视角「TA 的资料」用）→ 不显示右侧箭头、不可点；
       默认 false，本人视角的所有既有调用行为完全不变。 */
    var info = (it.info === true);
    if (!info) { right += '<span class="xtp-cell-arrow"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></span>'; }
    var attr = '';
    if (it.href) { attr = ' data-href="' + esc(it.href) + '"'; }
    else if (it.view) { attr = ' data-view="' + esc(it.view) + '"'; }
    else if (it.act) { attr = ' data-act="' + esc(it.act) + '"'; }
    else if (it.oact) { attr = ' data-other-act="' + esc(it.oact) + '"'; }
    return '<div class="xtp-cell"' + (info ? '' : ' role="button" tabindex="0"') + attr + '>' +
      '<span class="xtp-cell-ic"><span class="nav-icon" data-icon="' + esc(it.icon) + '" data-icon-size="16"></span></span>' +
      '<div class="xtp-cell-title">' + esc(it.title) + '</div>' +
      '<div class="xtp-cell-right">' + right + '</div>' +
      '</div>';
  }
  function groupHtml(g) {
    var title = (g && g.title) ? '<div class="xtp-group-title">' + esc(g.title) + '</div>' : '';
    /* R74-B：支持整组自定义行 HTML（TA 的动态列表模块用 .xtp-li 行，样式与本页卡片一致） */
    if (g && g.html) { return title + '<div class="xtp-group">' + g.html + '</div>'; }
    var rows = (g && g.rows) ? g.rows : [];
    var s = '', i;
    for (i = 0; i < rows.length; i++) { s += cellHtml(rows[i]); }
    return title + '<div class="xtp-group">' + s + '</div>';
  }

  /* ======================================================== 顶部个人信息栏 */
  function heroHtml(m) {
    var src = avatarSrc();
    var initial = userName().slice(0, 1) || '学';
    var avInner = src ? '<img src="' + esc(src) + '" alt="">' : esc(initial);
    var lv = levelOf(m);
    var lvChip = m.hasAny ? '<span class="xtp-hero-lv">Lv.' + lv.lv + '</span>' : '';
    var motto = userMotto();
    return '<section class="xtp-hero" id="xtpHero" data-act="edit">' +
      '<div class="xtp-hero-avatar" id="xtpHeroAvatar" title="点击更换头像">' + avInner + '</div>' +
      '<div class="xtp-hero-main">' +
        '<div class="xtp-hero-name-row">' +
          '<div class="xtp-hero-name" id="xtpHeroName">' + esc(userName()) + '</div>' + lvChip +
        '</div>' +
        '<div class="xtp-hero-id">ID：<b>' + esc(userId()) + '</b>' +
          '<span class="xtp-hero-qr" title="用户ID">' + QR_SVG + '</span></div>' +
        (motto ? '<div class="xtp-hero-motto">' + esc(motto) + '</div>' : '') +
      '</div>' +
      '<span class="xtp-hero-arrow"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></span>' +
      '</section>';
  }

  /* ================================================================ 渲染主页 */
  function renderPage() {
    var root = $('xtProfileRoot');
    if (!root) return;
    var m = metrics();
    var groups = groupDefs(m);
    var html = heroHtml(m), gi;
    for (gi = 0; gi < groups.length; gi++) { html += groupHtml(groups[gi]); }
    if (!isOtherMode() && getItem('study_workbench_token')) {
      html += '<div class="xtp-group"><div class="xtp-cell" role="button" tabindex="0" data-act="logout">' +
        '<span class="xtp-cell-ic"><span class="nav-icon" data-icon="logout" data-icon-size="16"></span></span>' +
        '<div class="xtp-cell-title" style="color:var(--xtp-danger,#ff4d4f)">退出登录</div>' +
        '<div class="xtp-cell-right"><span class="xtp-cell-arrow"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></span></div>' +
        '</div></div>';
    }
    root.innerHTML = html;
    bindHero();
    if (typeof window.lucideAutoRender === 'function') { window.lucideAutoRender(); }
    bindRoot();
  }

  /** 事件委托：整栏点击进编辑页 / 头像单独点击只上传 */
  function bindHero() {
    var hero = $('xtpHero');
    if (hero) {
      hero.addEventListener('click', function () { openView('edit'); });
    }
    var av = $('xtpHeroAvatar');
    if (av) {
      av.addEventListener('click', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        xtpPickAvatar();
      });
    }
  }
  /** 事件委托（委托根取 .xtp-wrap：同时涵盖顶栏「返回/主题」键与 #xtProfileRoot 内容区）：
      列表项 data-href / data-view / data-act（about/logout/back/theme/edit）统一在此分发。 */
  function bindRoot() {
    var root = document.querySelector('.xtp-wrap') || $('xtProfileRoot');
    if (!root || root.getAttribute('data-bound') === '1') return;
    root.setAttribute('data-bound', '1');
    root.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== root) {
        if (el.getAttribute) {
          var href = el.getAttribute('data-href');
          if (href) { location.href = href; return; }
          var view = el.getAttribute('data-view');
          if (view) { openView(view); return; }
          var act = el.getAttribute('data-act');
          if (act === 'about') { xtpAbout(); return; }
          if (act === 'logout') { xtpLogout(); return; }
          if (act === 'back') { xtpBack(); return; }
          if (act === 'theme') { toggleTheme(); return; }
          if (el.id === 'xtpHeroAvatar') { return; }   // 头像自处理
          if (act === 'edit') { return; }              // hero 自处理
        }
        el = el.parentNode;
      }
    });
  }

  /* ============================================================== 子视图层 */
  var viewStack = [];
  var pushOk = {};
  function ensureView(id) {
    var el = $('xtpView_' + id);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'xtp-view';
    el.id = 'xtpView_' + id;
    var host = $('xtpViews') || document.body;
    host.appendChild(el);
    return el;
  }
  function openView(id) {
    var el = ensureView(id);
    renderView(id, el);
    void el.offsetWidth;
    el.classList.add('on');
    viewStack.push(id);
    pushOk[id] = false;
    try { history.pushState({ xtp: viewStack.length }, ''); pushOk[id] = true; } catch (e) { /* 忽略 */ }
  }
  function hideView(id) {
    var el = $('xtpView_' + id);
    if (el) { el.classList.remove('on'); }
    var i = viewStack.lastIndexOf(id);
    if (i >= 0) { viewStack.splice(i, 1); }
  }
  function backView(id) {
    if (pushOk[id]) { try { history.back(); return; } catch (e) { /* 继续兜底 */ } }
    hideView(id);
  }
  window.addEventListener('popstate', function () {
    var id = viewStack.pop();
    if (id) { hideView(id); }
  });

  function viewBar(title, backId) {
    return '<div class="xtp-view-bar">' +
      '<button class="xtp-view-back" type="button" id="xtpViewBack_' + esc(backId) + '">' +
        '<span class="nav-icon" data-icon="arrow-left" data-icon-size="18"></span> 返回</button>' +
      '<div class="xtp-view-title">' + esc(title) + '</div>' +
      '<div class="xtp-view-gap"></div>' +
      '</div>';
  }
  function renderView(id, el) {
    var body = '';
    var title = '';
    if (id === 'edit') { title = '个人信息'; body = editBody(); }
    else if (id === 'notes') { title = '我的笔记'; body = notesBody(); }
    else if (id === 'fav') { title = '我的收藏'; body = favBody(); }
    else if (id === 'data') { title = '学习数据'; body = dataBody(); }
    else if (id === 'chat') { title = 'AI对话记录'; body = chatBody(); }
    el.innerHTML = viewBar(title, id) + '<div class="xtp-view-body">' + body + '</div>';
    var back = $('xtpViewBack_' + id);
    if (back) { back.addEventListener('click', function () { backView(id); }); }
    afterRenderView(id, el);
    if (window.lucideAutoRender) { window.lucideAutoRender(); }
  }
  function afterRenderView(id, el) {
    if (id === 'edit') { bindEditView(el); }
    if (id === 'data') { animateNumbers(el); }
    if (id === 'chat') { bindChatView(el); }
  }

  /* -------------------------------------------- 编辑页：扩展字段行（地区/手机号/邮箱/生日/目标） */
  /** 列表式字段行：左侧 label、右侧值（灰、右对齐）、行尾箭头、行高 50px */
  function frowHtml(key, label, value, note) {
    var v = value ? String(value) : '';
    return '<div class="xtp-frow" data-frow="' + esc(key) + '" role="button" tabindex="0">' +
      '<div class="xtp-frow-label">' + esc(label) + '</div>' +
      '<div class="xtp-frow-main">' +
        '<div class="xtp-frow-val' + (v ? '' : ' none') + '">' + esc(v || '未填写') + '</div>' +
        (note ? '<div class="xtp-frow-note">' + esc(note) + '</div>' : '') +
      '</div>' +
      '<span class="xtp-frow-arrow"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></span>' +
      '</div>';
  }
  function fieldsSection() {
    var em = emailInfo();
    return '<section class="xtp-sec">' +
      frowHtml('region', '地区', regionVal(), '') +
      frowHtml('phone', '手机号', phoneVal(), '仅本机保存 · 未验证') +
      frowHtml('email', '邮箱', em.value, em.verified ? '已绑定' : '未验证') +
      frowHtml('birthday', '生日', birthdayVal(), '') +
      frowHtml('goal', '目标', goalVal(), '') +
      '</section>';
  }

  /* -------------------------------------------------------- 个人信息编辑页 */
  function editBody() {
    var m = metrics();
    var lv = levelOf(m);
    var src = avatarSrc();
    var initial = userName().slice(0, 1) || '学';
    var avInner = src ? '<img src="' + esc(src) + '" alt="">' : esc(initial);
    var g = userGender();
    var lvRight = m.hasAny
      ? '<span class="xtp-lv-chip">Lv.' + lv.lv + ' ' + esc(lv.name) + '</span>'
      : '<span class="xtp-readval">暂无数据</span>';
    return '' +
      '<section class="xtp-sec">' +
        '<div class="xtp-avatar-row">' +
          '<div class="xtp-avatar-sm" id="xtpEditAvatar">' + avInner + '</div>' +
          '<div class="xtp-avatar-row-main">' +
            '<div class="xtp-li-title">头像</div>' +
            '<div class="xtp-li-meta">点击左侧头像上传本地图片</div>' +
          '</div>' +
          '<button class="xtp-mini-btn" type="button" id="xtpEditAvatarBtn">更换</button>' +
        '</div>' +
      '</section>' +
      '<section class="xtp-sec">' +
        '<div class="xtp-field">' +
          '<div class="xtp-field-label">昵称</div>' +
          '<div class="xtp-field-body"><input class="xtp-input" id="xtpEditName" maxlength="20" placeholder="请输入昵称" value="' + esc(userName() === '同学' ? '' : userName()) + '"></div>' +
        '</div>' +
        '<div class="xtp-field">' +
          '<div class="xtp-field-label">个性签名</div>' +
          '<div class="xtp-field-body"><input class="xtp-input" id="xtpEditMotto" maxlength="30" placeholder="这个人很懒，什么都没写" value="' + esc(userMotto()) + '"></div>' +
        '</div>' +
        '<div class="xtp-field">' +
          '<div class="xtp-field-label">性别</div>' +
          '<div class="xtp-field-body"><div class="xtp-seg" id="xtpEditGender">' +
            '<button type="button" data-g="male" class="' + (g === 'male' ? 'on' : '') + '">男</button>' +
            '<button type="button" data-g="female" class="' + (g === 'female' ? 'on' : '') + '">女</button>' +
            '<button type="button" data-g="secret" class="' + (g === 'secret' ? 'on' : '') + '">保密</button>' +
          '</div></div>' +
        '</div>' +
      '</section>' +
      fieldsSection() +
      '<section class="xtp-sec">' +
        '<div class="xtp-field">' +
          '<div class="xtp-field-label">用户ID</div>' +
          '<div class="xtp-field-body"><div class="xtp-readval" id="xtpEditUid">' + esc(userId()) + '</div></div>' +
          '<button class="xtp-mini-btn" type="button" id="xtpEditCopyUid">复制</button>' +
        '</div>' +
        '<div class="xtp-field">' +
          '<div class="xtp-field-label">学习等级</div>' +
          '<div class="xtp-field-body">' + lvRight + '</div>' +
        '</div>' +
      '</section>' +
      '<div class="xtp-sec">' +
        '<div class="xtp-field" style="flex-direction:column;align-items:stretch;gap:8px">' +
          '<div class="xtp-lv-line">' +
            '<span class="xtp-lv-chip">Lv.' + lv.lv + ' ' + esc(lv.name) + '</span>' +
            '<span class="xtp-lv-gap">' + esc(lv.gapText) + '</span>' +
          '</div>' +
          '<div class="xtp-bar"><i style="width:' + lv.pct + '%"></i></div>' +
        '</div>' +
      '</div>' +
      '<div class="xtp-tip">改动即时生效并保存到本机（localStorage）。用户ID / 等级 / 已绑定邮箱 只读；手机号仅本机保存、未经服务器验证。</div>';
  }
  function bindEditView(el) {
    var av = el.querySelector('#xtpEditAvatar');
    var avBtn = el.querySelector('#xtpEditAvatarBtn');
    function pick(ev) { if (ev) { ev.stopPropagation(); } xtpPickAvatar(); }
    if (av) { av.addEventListener('click', pick); }
    if (avBtn) { avBtn.addEventListener('click', pick); }

    var nameEl = el.querySelector('#xtpEditName');
    if (nameEl) {
      nameEl.addEventListener('change', function () {
        var v = String(nameEl.value || '').trim();
        if (!v) { toast('昵称不能为空', true); nameEl.value = userName() === '同学' ? '' : userName(); return; }
        saveProfile({ name: v });
        renderPage();
        toast('昵称已保存');
      });
    }
    var mottoEl = el.querySelector('#xtpEditMotto');
    if (mottoEl) {
      mottoEl.addEventListener('change', function () {
        saveProfile({ motto: String(mottoEl.value || '').trim().slice(0, 30) });
        renderPage();
        toast('个性签名已保存');
      });
    }
    var seg = el.querySelector('#xtpEditGender');
    if (seg) {
      seg.addEventListener('click', function (ev) {
        var b = ev.target;
        while (b && b !== seg && !b.getAttribute('data-g')) { b = b.parentNode; }
        if (!b || b === seg) return;
        var gv = b.getAttribute('data-g');
        var kids = seg.querySelectorAll('button'), i;
        for (i = 0; i < kids.length; i++) { kids[i].className = (kids[i] === b ? 'on' : ''); }
        saveProfile({ gender: gv });
        toast('性别已保存');
      });
    }
    var copy = el.querySelector('#xtpEditCopyUid');
    if (copy) { copy.addEventListener('click', function () { copyText(userId(), '用户ID'); }); }

    /* 扩展字段行（地区 / 手机号 / 邮箱 / 生日 / 目标）：点击进编辑 */
    var frows = el.querySelectorAll('.xtp-frow');
    for (var fi = 0; fi < frows.length; fi++) {
      frows[fi].addEventListener('click', function (ev) {
        var node = ev.currentTarget || ev.target;
        var key = node.getAttribute ? node.getAttribute('data-frow') : '';
        if (key) { xtpEditField(key); }
      });
    }
  }

  /* ------------------------------------------------------------ 我的笔记 */
  function notesBody() {
    var notes = notesArr();
    if (!notes.length) { return '<div class="xtp-empty">暂无笔记<br>在「动态 / 发贴」里发布后会自动出现在这里</div>'; }
    var s = '<section class="xtp-sec"><div class="xtp-list">', i;
    for (i = notes.length - 1; i >= 0 && i >= notes.length - 30; i--) {
      var n = notes[i] || {};
      var st = n.status === 'published' ? '已发布' : (n.status === 'draft' ? '草稿' : '本机');
      var t = n.updatedAt || n.createdAt || '';
      s += '<div class="xtp-li">' +
        '<div class="xtp-li-title">' + esc(n.title || '未命名笔记') + '</div>' +
        '<div class="xtp-li-meta">' + esc(st) + ' · ' + esc(fmtTime(t) || '时间未知') + '</div>' +
        '</div>';
    }
    s += '</div></section><div class="xtp-tip">共 ' + notes.length + ' 篇（数据来自本机 localStorage.notes）。</div>';
    return s;
  }

  /* ------------------------------------------------------------ 我的收藏 */
  function favBody() {
    var ids = favoriteArr();
    if (!ids.length) { return '<div class="xtp-empty">暂无收藏<br>在练习中点击收藏后会自动出现在这里</div>'; }
    var s = '<section class="xtp-sec"><div class="xtp-list">', i;
    for (i = ids.length - 1; i >= 0 && i >= ids.length - 30; i--) {
      s += '<div class="xtp-li">' +
        '<div class="xtp-li-title">题目 <span class="xtp-li-mono">#' + esc(String(ids[i])) + '</span></div>' +
        '<div class="xtp-li-meta">已收藏题目（题面需在练习页查看）</div>' +
        '</div>';
    }
    s += '</div></section>' +
      '<div class="xtp-tip">共 ' + ids.length + ' 道收藏题目（数据来自本机 localStorage.favoriteQuestions）。</div>' +
      '<section class="xtp-sec"><div class="xtp-cell" data-href="学习工作台.html" role="button" tabindex="0">' +
        '<span class="xtp-cell-ic"><span class="nav-icon" data-icon="book" data-icon-size="16"></span></span>' +
        '<div class="xtp-cell-title">前往练习页查看</div>' +
        '<div class="xtp-cell-right"><span class="xtp-cell-arrow"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></span></div>' +
      '</div></section>';
    return s;
  }

  /* ------------------------------------------------------------ 学习数据 */
  function dataBody() {
    var m = metrics();
    var h = m.totalHours.toFixed(1);
    var rows = [
      { v: h, u: 'h', l: '总学习时长' },
      { v: String(m.totalQuestions), u: '', l: '累计做题数' },
      { v: String(m.accuracy), u: '%', l: '平均正确率' },
      { v: String(m.streak), u: '天', l: '连续打卡' },
      { v: m.weekHours.toFixed(1), u: 'h', l: '本周学习' },
      { v: String(m.courses), u: '', l: '完成课程数' }
    ];
    var s = '<section class="xtp-sec"><div class="xtp-stats">', i;
    for (i = 0; i < rows.length; i++) {
      s += '<div class="xtp-stat">' +
        '<div class="xtp-stat-num" data-anim data-raw="' + rows[i].v + '">' + rows[i].v + '</div>' +
        '<div class="xtp-stat-label">' + rows[i].l + '</div>' +
        '</div>';
    }
    s += '</div></section>';
    s += '<div class="xtp-tip">数据全部读取自本机 localStorage，无数据显示 0，不做任何虚构。</div>';
    return s;
  }

  /* ---------------------------------------------------------- AI对话记录 */
  /** R91-A：服务端记录区块 chatServerHtml 已按产品要求整体移除——服务端聊天记录
   *  不再展示在「AI对话记录」页，本页仅保留 M5 本机会话管理；
   *  「清空全部」会同步调用 DELETE /api/ai/history 删除服务端记录。 */
  /** R91-A：不再有服务端三态（loading/err/guest），本视图只渲染 M5 本机会话管理面板，
   *  也不再发起 GET /api/ai/history 拉取（登录与否均可用）。 */
  function chatBodyHtml() {
    return m5PanelHtml();
  }
  /** 子视图 body：外壳固定，内容由 paintChat() 就地重绘（三态切换不重建视图） */
  function chatBody() { return '<div id="xtpChatBody">' + chatBodyHtml() + '</div>'; }
  /** 打开子视图后：本地渲染 M5 面板并同步一次主页「AI对话记录」角标（R91-A：不再拉服务端） */
  function bindChatView(el) {
    var box = el.querySelector('#xtpChatBody');
    if (!box) { return; }
    paintChat(box);
    renderPage();
  }
  function paintChat(box) {
    box.innerHTML = chatBodyHtml();
    m5Bind(box);
  }
  /* R91-A：prefetchAiChat 已移除——角标改本机口径，不再为角标预拉 GET /api/ai/history */
  /* ==================================================================== R88-M5
   * 个人资料页「AI 对话记录管理」（清空全部 / 分类标签 / 关键字搜索 / 单条删除 /
   * 批量删除 / 时间范围筛选 / 一键导出 / 本地备份与恢复 / 标记收藏）。
   * ---------------------------------------------------------------------------
   * 数据源与边界（调研结论，务必先读）：
   *   ① 本机 localStorage.ai_chat_history = 会话数组
   *      [{id:'chat_...', title, createdAt(ms), updatedAt(ms), messages:[{role,content,hasImage?}]}]
   *      （写入方 assets/ai-page.js:1286；最多 50 会话）。**有稳定 id** → 可单条删/打标/批量/导出/备份。
   *   ② 服务端 GET /api/ai/history 只返回**扁平消息**（无 id / 无标题 / 无标签），且服务端
   *      **有 GET + POST(chat) + DELETE(history)（R91-A 新增 DELETE）** → 前端可清空服务端记录。
   *      故本页「管理」作用于【本机会话】；服务端记录不再展示（R91-A 移除 chatServerHtml），
   *      仅在「清空全部」时同步调用 DELETE /api/ai/history。
   *   ③ 标签 / 收藏等扩展信息写入本页自有键 xt_ai_chat_meta_v1（按会话 id 索引），
   *      不污染 ai_chat_history 的既有结构（否则会破坏 ai-page.js 的读取）。
   * ---------------------------------------------------------------------------
   * 覆盖策略（备份恢复）：**按 id 合并**（导入中已存在的 id 以导入数据覆盖，不存在的新增）；
   *   理由：导入是「恢复备份」语义，合并可避免一键误操作把当前数据整体抹掉；同 id 覆盖保证
   *   备份里更新过的会话能还原。全量替换风险高（一次误点即丢全部现网数据），故不采用。
   * ------------------------------------------------------------------ */

  var META_KEY = 'xt_ai_chat_meta_v1';   // { [chatId]: { tags:[String], fav:Boolean } } */

  /** 会话列表（规范化，保证每条都有 id/title/createdAt/updatedAt/messages） */
  function chatSessions() {
    var arr = aiChatArr(), out = [], i;
    for (i = 0; i < arr.length; i++) {
      var c = arr[i] || {};
      if (!c || typeof c !== 'object') { continue; }
      var id = (c.id === undefined || c.id === null) ? '' : String(c.id);
      if (!id) { continue; }
      var msgs = isArr(c.messages) ? c.messages : [];
      var title = (c.title === undefined || c.title === null) ? '' : String(c.title);
      if (!title) { title = '未命名对话'; }
      out.push({
        id: id,
        title: title,
        createdAt: num(c.createdAt),
        updatedAt: num(c.updatedAt || c.createdAt),
        messages: msgs
      });
    }
    return out;
  }
  /** 会话最后活动时间（用于排序 / 时间筛选） */
  function sessionTs(s) { return num(s.updatedAt || s.createdAt); }
  /** 会话纯文本（标题 + 全部消息文本），用于关键字搜索 */
  function sessionText(s) {
    var t = (s.title || '') + ' ', ms = s.messages || [], i;
    for (i = 0; i < ms.length; i++) {
      var m = ms[i] || {};
      if (m.content) { t += String(m.content) + ' '; }
    }
    return t;
  }
  /** 会话预览（前 2 条消息各截 60 字） */
  function sessionPreview(s) {
    var ms = s.messages || [], out = [], i, n = 0;
    for (i = 0; i < ms.length && n < 2; i++) {
      var m = ms[i] || {};
      var txt = String(m.content || '').replace(/\s+/g, ' ').trim();
      if (!txt) { continue; }
      if (txt.length > 60) { txt = txt.slice(0, 60) + '…'; }
      out.push((m.role === 'user' ? '我：' : 'AI：') + txt);
      n++;
    }
    return out.length ? out.join(' / ') : '（无文本内容）';
  }
  /** 读会话扩展信息表 */
  function chatMetaAll() {
    var m = readJSON(META_KEY, {});
    return (m && typeof m === 'object' && !isArr(m)) ? m : {};
  }
  /** 取某会话扩展信息（始终返回对象，缺省 tags=[] fav=false） */
  function chatMetaOf(id) {
    var all = chatMetaAll(), k = String(id), e = all[k];
    if (!e || typeof e !== 'object') { e = {}; }
    return { tags: isArr(e.tags) ? e.tags : [], fav: !!e.fav };
  }
  /** 写某会话扩展信息（tags 去空去重、截断到 8 个；空标签与未收藏则删除该键，保持存储干净） */
  function chatMetaSet(id, patch) {
    var all = chatMetaAll(), k = String(id);
    var cur = chatMetaOf(k);
    if (patch && has(patch, 'tags')) {
      var t = [], seen = {}, i, j;
      var src = isArr(patch.tags) ? patch.tags : [];
      for (i = 0; i < src.length; i++) {
        var v = String(src[i] === null || src[i] === undefined ? '' : src[i]).trim();
        if (!v || v.length > 12) { continue; }
        var dup = false;
        for (j = 0; j < t.length; j++) { if (t[j] === v) { dup = true; break; } }
        if (!dup) { t.push(v); }
        if (t.length >= 8) { break; }
      }
      cur.tags = t;
    }
    if (patch && has(patch, 'fav')) { cur.fav = !!patch.fav; }
    if ((!cur.tags || !cur.tags.length) && !cur.fav) { delete all[k]; }
    else { all[k] = { tags: cur.tags || [], fav: !!cur.fav }; }
    writeJSON(META_KEY, all);
    return cur;
  }
  /** 清理扩展表中已不存在会话的孤儿键 */
  function chatMetaPrune(aliveIds) {
    var all = chatMetaAll(), keep = {}, i, k;
    for (i = 0; i < aliveIds.length; i++) { keep[String(aliveIds[i])] = true; }
    var next = {}, n = 0;
    for (k in all) {
      if (has(all, k) && keep[k]) { next[k] = all[k]; n++; }
    }
    writeJSON(META_KEY, next);
    return n;
  }
  /** 全部已用标签（去重、按出现顺序） */
  function chatAllTags(sessions) {
    var seen = {}, out = [], i, j;
    for (i = 0; i < sessions.length; i++) {
      var meta = chatMetaOf(sessions[i].id);
      for (j = 0; j < meta.tags.length; j++) {
        if (!seen[meta.tags[j]]) { seen[meta.tags[j]] = true; out.push(meta.tags[j]); }
      }
    }
    return out;
  }

  /* -------------------------------------------------- M5 视图状态（不跨会话持久化） */
  var M5 = {
    kw: '',            // 关键字
    tag: '',           // 标签筛选（'' = 全部）
    range: 'all',      // all | today | d7 | d30 | custom
    from: '',          // 自定义起始（YYYY-MM-DD）
    to: '',            // 自定义结束（YYYY-MM-DD）
    favOnly: false,    // 只看收藏
    selMode: false,    // 多选模式
    sel: {},           // 选中集合 { id:true }
    panel: ''          // '' | 'filter' | 'backup'
  };
  function m5Reset() { M5.sel = {}; }
  /** 时间范围 → [fromTs, toTs]（toTs 含当天末刻；0/-1 表示不限） */
  function m5RangeBounds() {
    var now = new Date();
    var endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(); // 明日 0 点（当天含）
    if (M5.range === 'today') {
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), to: endOfToday };
    }
    if (M5.range === 'd7') { return { from: endOfToday - 7 * 86400000, to: endOfToday }; }
    if (M5.range === 'd30') { return { from: endOfToday - 30 * 86400000, to: endOfToday }; }
    if (M5.range === 'custom') {
      return { from: m5DayTs(M5.from, false), to: m5DayTs(M5.to, true) };
    }
    return { from: 0, to: 0 };
  }
  /** 'YYYY-MM-DD' → 时间戳；endOfDay=true 取当天 23:59:59.999；空/非法返回 0（不限） */
  function m5DayTs(s, endOfDay) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) { return 0; }
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
      endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    var t = d.getTime();
    return isFinite(t) ? t : 0;
  }
  /** 过滤后的会话（最新在前） */
  function m5Filtered() {
    var all = chatSessions(), kw = M5.kw.trim().toLowerCase();
    var b = m5RangeBounds(), out = [], i;
    for (i = 0; i < all.length; i++) {
      var s = all[i], meta = chatMetaOf(s.id);
      if (M5.favOnly && !meta.fav) { continue; }
      if (M5.tag && meta.tags.indexOf(M5.tag) < 0) { continue; }
      if (b.from || b.to) {
        var ts = sessionTs(s);
        if (b.from && ts < b.from) { continue; }
        if (b.to && ts >= b.to) { continue; }
      }
      if (kw) {
        var hay = (sessionText(s) + ' ' + meta.tags.join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) { continue; }
      }
      out.push(s);
    }
    out.sort(function (a, c) { return sessionTs(c) - sessionTs(a); });
    return out;
  }

  /* -------------------------------------------------- M5 渲染 */
  function m5RangeLabel() {
    if (M5.range === 'today') { return '今天'; }
    if (M5.range === 'd7') { return '近 7 天'; }
    if (M5.range === 'd30') { return '近 30 天'; }
    if (M5.range === 'custom') {
      if (M5.from || M5.to) { return (M5.from || '…') + '~' + (M5.to || '…'); }
      return '自定义';
    }
    return '全部时间';
  }
  /** 顶部工具条：搜索 + 时间 + 标签 + 收藏 + 管理动作 */
  function m5ToolbarHtml() {
    var tags = chatAllTags(chatSessions());
    var tagOpts = '<option value="">全部标签</option>', i;
    for (i = 0; i < tags.length; i++) {
      tagOpts += '<option value="' + esc(tags[i]) + '"' + (M5.tag === tags[i] ? ' selected' : '') + '>' + esc(tags[i]) + '</option>';
    }
    var s = '<div class="xtp-m5-tools">' +
      '<div class="xtp-m5-search">' +
        '<span class="nav-icon" data-icon="search" data-icon-size="16"></span>' +
        '<input type="text" id="xtpM5Kw" placeholder="搜索标题 / 内容 / 标签" value="' + esc(M5.kw) + '">' +
        (M5.kw ? '<button type="button" class="xtp-m5-sclear" id="xtpM5Clear" title="清空">&times;</button>' : '') +
      '</div>' +
      '<div class="xtp-m5-filters">' +
        '<select id="xtpM5Range" class="xtp-m5-select" title="时间范围">' +
          '<option value="all"' + (M5.range === 'all' ? ' selected' : '') + '>全部时间</option>' +
          '<option value="today"' + (M5.range === 'today' ? ' selected' : '') + '>今天</option>' +
          '<option value="d7"' + (M5.range === 'd7' ? ' selected' : '') + '>近 7 天</option>' +
          '<option value="d30"' + (M5.range === 'd30' ? ' selected' : '') + '>近 30 天</option>' +
          '<option value="custom"' + (M5.range === 'custom' ? ' selected' : '') + '>自定义</option>' +
        '</select>' +
        '<select id="xtpM5Tag" class="xtp-m5-select" title="标签筛选">' + tagOpts + '</select>' +
        '<button type="button" class="xtp-m5-toggle' + (M5.favOnly ? ' on' : '') + '" id="xtpM5Fav"><span class="nav-icon" data-icon="star" data-icon-size="14"></span> 收藏</button>' +
        '<button type="button" class="xtp-m5-toggle' + (M5.selMode ? ' on' : '') + '" id="xtpM5SelBtn">' + (M5.selMode ? '取消多选' : '多选') + '</button>' +
      '</div>' +
      (M5.range === 'custom'
        ? '<div class="xtp-m5-custom">' +
            '<label>从 <input type="date" id="xtpM5From" value="' + esc(M5.from) + '"></label>' +
            '<label>到 <input type="date" id="xtpM5To" value="' + esc(M5.to) + '"></label>' +
          '</div>'
        : '') +
      '</div>';
    return s;
  }
  /** 底部动作条：清空全部 / 导出 / 备份 / 恢复（多选模式下换成批量操作条） */
  function m5ActionsHtml() {
    if (M5.selMode) {
      var cnt = m5SelCount();
      return '<div class="xtp-m5-batch">' +
        '<button type="button" class="xtp-m5-abtn" id="xtpM5SelAll">' + (m5AllSelected() ? '取消全选' : '全选') + '</button>' +
        '<span class="xtp-m5-selcnt">已选 ' + cnt + ' 条</span>' +
        '<button type="button" class="xtp-m5-abtn danger" id="xtpM5DelSel"' + (cnt ? '' : ' disabled') + '>删除所选</button>' +
        '</div>';
    }
    return '<div class="xtp-m5-actions">' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5Export"><span class="nav-icon" data-icon="download" data-icon-size="15"></span> 导出</button>' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5Backup"><span class="nav-icon" data-icon="save" data-icon-size="15"></span> 备份</button>' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5Restore"><span class="nav-icon" data-icon="upload" data-icon-size="15"></span> 恢复</button>' +
      '<button type="button" class="xtp-m5-abtn danger" id="xtpM5ClearAll"><span class="nav-icon" data-icon="trash" data-icon-size="15"></span> 清空全部</button>' +
      '</div>';
  }
  function m5SelCount() { var k, n = 0; for (k in M5.sel) { if (has(M5.sel, k) && M5.sel[k]) { n++; } } return n; }
  function m5AllSelected() {
    var list = m5Filtered(), i;
    if (!list.length) { return false; }
    for (i = 0; i < list.length; i++) { if (!M5.sel[list[i].id]) { return false; } }
    return true;
  }
  /** 单条会话卡 */
  function m5CardHtml(s) {
    var meta = chatMetaOf(s.id);
    var tagsHtml = '', i;
    for (i = 0; i < meta.tags.length; i++) {
      tagsHtml += '<span class="xtp-m5-tag">' + esc(meta.tags[i]) + '</span>';
    }
    var checked = M5.sel[s.id] ? ' checked' : '';
    var selBox = M5.selMode
      ? '<label class="xtp-m5-check"><input type="checkbox" class="xtpM5Cb" data-id="' + esc(s.id) + '"' + checked + '></label>'
      : '';
    var star = M5.selMode ? ''
      : '<button type="button" class="xtp-m5-icon' + (meta.fav ? ' on' : '') + ' xtpM5Fav" data-id="' + esc(s.id) + '" title="收藏"><span class="nav-icon" data-icon="star" data-icon-size="15"></span></button>';
    var tagBtn = M5.selMode ? ''
      : '<button type="button" class="xtp-m5-icon xtpM5Tag" data-id="' + esc(s.id) + '" title="标签"><span class="nav-icon" data-icon="tag" data-icon-size="15"></span></button>';
    var delBtn = M5.selMode ? ''
      : '<button type="button" class="xtp-m5-icon danger xtpM5Del" data-id="' + esc(s.id) + '" title="删除"><span class="nav-icon" data-icon="trash" data-icon-size="15"></span></button>';
    return '<div class="xtp-li xtp-m5-card" data-id="' + esc(s.id) + '">' +
      selBox +
      '<div class="xtp-m5-body">' +
        '<div class="xtp-li-title">' + esc(s.title) +
          '<span class="xtp-m5-cnt">' + esc(String((s.messages || []).length)) + ' 条</span></div>' +
        '<div class="xtp-li-meta">' + esc(fmtTime(tsText(sessionTs(s)))) + (tagsHtml ? '' : '') + '</div>' +
        '<div class="xtp-li-body">' + esc(sessionPreview(s)) + '</div>' +
        (tagsHtml ? '<div class="xtp-m5-tags">' + tagsHtml + '</div>' : '') +
      '</div>' +
      '<div class="xtp-m5-ops">' + star + tagBtn + delBtn + '</div>' +
      '</div>';
  }
  /** 快捷入口：跳转 AI 问答页（本页不会发起对话，推荐到 AI 页） */
  function m5QuickHtml() {
    return '<div class="xtp-m5-quick">' +
      '<button type="button" class="xtp-m5-abtn" id="xtpM5GoAi">'
        + '<span class="nav-icon" data-icon="message-circle" data-icon-size="15"></span> 去 AI 问答页对话</button>' +
      '<span class="xtp-m5-quicktip">「清空全部」会同时删除本机与服务端记录；单条/批量删除仅作用于本机会话。</span></div>';
  }
  /** 当前生效的筛选条件摘要（用于空态文案，消除「清不掉」的困惑） */
  function m5ActiveFilterLabel() {
    var parts = [];
    if (M5.range !== 'all') { parts.push(m5RangeLabel()); }
    if (M5.tag) { parts.push('标签' + M5.tag); }
    if (M5.favOnly) { parts.push('仅收藏'); }
    if (M5.kw.trim()) { parts.push('关键词「' + M5.kw.trim() + '」'); }
    return parts.length ? parts.join(' + ') : '无';
  }
  /** M5 管理列表（含工具条 + 列表 + 动作条） */
  function m5PanelHtml() {
    var list = m5Filtered(), i, s = '';
    for (i = 0; i < list.length; i++) { s += m5CardHtml(list[i]); }
    var total = chatSessions().length;
    var hasFilter = !!(M5.kw.trim() || M5.tag || M5.favOnly || M5.range !== 'all');
    var emptyTip = (total === 0)
      ? '本机暂无会话记录。去 AI 问答页对话后，会自动出现在这里。'
      : '没有符合条件的对话（当前筛选：' + esc(m5ActiveFilterLabel()) + '，本机共 ' + total + ' 条）。';
    var emptyExtra = (!list.length && total > 0 && hasFilter)
      ? '<div class="xtp-m5-emptyact"><button type="button" class="xtp-m5-abtn" id="xtpM5ResetFilter">查看全部本机记录（重置筛选）</button></div>'
      : '';
    return m5ToolbarHtml() +
      '<div class="xtp-chat-sub">本机对话记录<span>可管理 · 共 ' + total + ' 条 · 当前 ' + list.length + ' 条</span></div>' +
      m5QuickHtml() +
      (list.length
        ? '<section class="xtp-sec"><div class="xtp-list">' + s + '</div></section>'
        : '<div class="xtp-empty">' + esc(emptyTip) + '</div>' + emptyExtra) +
      m5ActionsHtml();
  }

  /* -------------------------------------------------- M5 动作 */
  /** 清空全部（二次确认，说明后果：不可恢复、条数；R91-A：同步删除服务端记录） */
  function m5ClearAll() {
    var n = chatSessions().length;
    var online = aiApiReady();
    if (!n && !online) { toast('本已无对话记录'); return; }
    var totalMsg = 0, arr = chatSessions(), i;
    for (i = 0; i < arr.length; i++) { totalMsg += (arr[i].messages || []).length; }
    var tip;
    if (n && online) {
      tip = '将删除本机全部 ' + n + ' 条会话（共 ' + totalMsg + ' 条消息），并同时删除服务端的全部对话记录，此操作不可恢复。\n建议先「备份」。确定继续吗？';
    } else if (n) {
      tip = '将删除本机全部 ' + n + ' 条会话（共 ' + totalMsg + ' 条消息），此操作不可恢复。\n（当前未登录，服务端记录无法在此删除）\n建议先「备份」。确定继续吗？';
    } else {
      tip = '本机已无会话记录。将删除服务端的全部对话记录，此操作不可恢复。确定继续吗？';
    }
    confirmBox('清空全部对话记录', tip, '清空', true, function () {
      localStorage.removeItem('ai_chat_history');
      writeJSON(META_KEY, {});
      m5Reset();
      m5Repaint();
      if (!online) { toast('已清空本机会话（未登录，服务端记录未处理）'); renderPage(); return; }
      /* R91-A：同步删除服务端记录；失败则降级为只清本机并在 toast 如实说明 */
      window.api('/api/ai/history', { method: 'DELETE' }).then(function () {
        toast(n ? '已清空本机与服务端对话记录' : '已清空服务端对话记录');
        renderPage();
      })['catch'](function () {
        toast(n ? '已清空本机会话；服务端记录删除失败，请稍后重试' : '服务端记录删除失败，请稍后重试');
        renderPage();
      });
    });
  }
  /** 单条删除（二次确认） */
  function m5DelOne(id) {
    var s = null, arr = chatSessions(), i;
    for (i = 0; i < arr.length; i++) { if (arr[i].id === String(id)) { s = arr[i]; break; } }
    if (!s) { return; }
    confirmBox('删除这条对话',
      '将删除「' + s.title + '」（' + (s.messages || []).length + ' 条消息），不可恢复。确定删除吗？',
      '删除', true, function () {
        var list = chatSessions(), out = [], j;
        for (j = 0; j < list.length; j++) { if (list[j].id !== String(id)) { out.push(list[j]); } }
        m5WriteSessions(out);
        var meta = chatMetaAll(); if (has(meta, String(id))) { delete meta[String(id)]; writeJSON(META_KEY, meta); }
        delete M5.sel[String(id)];
        m5Repaint();
        toast('已删除');
      });
  }
  /** 批量删除所选（二次确认） */
  function m5DelSelected() {
    var ids = [], k;
    for (k in M5.sel) { if (has(M5.sel, k) && M5.sel[k]) { ids.push(k); } }
    if (!ids.length) { toast('未选择任何对话'); return; }
    confirmBox('批量删除对话',
      '将删除所选 ' + ids.length + ' 条对话，此操作不可恢复。确定删除吗？',
      '删除', true, function () {
        var list = chatSessions(), out = [], i, j, del = {}, meta = chatMetaAll();
        for (i = 0; i < ids.length; i++) { del[ids[i]] = true; }
        for (i = 0; i < list.length; i++) { if (!del[list[i].id]) { out.push(list[i]); } }
        m5WriteSessions(out);
        for (j = 0; j < ids.length; j++) { if (has(meta, ids[j])) { delete meta[ids[j]]; } }
        writeJSON(META_KEY, meta);
        M5.sel = {};
        M5.selMode = false;
        m5Repaint();
        toast('已删除 ' + ids.length + ' 条');
      });
  }
  /** 打标（输入框弹层，逗号分隔） */
  function m5EditTags(id) {
    var s = null, arr = chatSessions(), i;
    for (i = 0; i < arr.length; i++) { if (arr[i].id === String(id)) { s = arr[i]; break; } }
    if (!s) { return; }
    var meta = chatMetaOf(s.id);
    var cur = meta.tags.join(', ');
    var mask = openModal(
      '<div class="xtp-modal-title">编辑标签</div>' +
      '<div class="xtp-modal-tip">为「' + esc(s.title) + '」设置标签，多个标签用逗号分隔（最多 8 个，每个 ≤12 字）。</div>' +
      '<input type="text" class="xtp-modal-input" id="xtpM5TagInput" style="margin-top:12px" value="' + esc(cur) + '" placeholder="如：学习 / 重要 / 待整理">' +
      '<div class="xtp-modal-actions"><button type="button" id="xtpM5TagCancel">取消</button>' +
      '<button type="button" class="primary" id="xtpM5TagOk">保存</button></div>'
    );
    var inp = mask.querySelector('#xtpM5TagInput');
    if (inp && inp.focus) { inp.focus(); }
    mask.querySelector('#xtpM5TagCancel').addEventListener('click', closeModal);
    mask.querySelector('#xtpM5TagOk').addEventListener('click', function () {
      var parts = String((inp && inp.value) || '').split(/[,，]/);
      chatMetaSet(s.id, { tags: parts });
      closeModal();
      m5Repaint();
      toast('标签已更新');
    });
  }
  /** 切换收藏 */
  function m5ToggleFav(id) {
    var meta = chatMetaOf(id);
    chatMetaSet(id, { fav: !meta.fav });
    m5Repaint();
  }

  /* -------------------------------------------------- 导出 / 备份 / 恢复 */
  function m5Stamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  /** 组装导出/备份包（exports：'full'=全部本机会话+元信息；'filtered'=当前筛选结果） */
  function m5Pack(scope) {
    var sessions = (scope === 'filtered') ? m5Filtered() : chatSessions();
    var meta = chatMetaAll(), metaOut = {}, i;
    for (i = 0; i < sessions.length; i++) {
      var id = sessions[i].id;
      if (has(meta, id)) { metaOut[id] = meta[id]; }
    }
    return {
      type: 'xt-ai-chat-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: sessions.length,
      sessions: sessions,
      meta: metaOut
    };
  }
  /** 触发浏览器下载（file:// 下 a[download] 亦可用；失败回退复制） */
  function m5Download(obj, filename) {
    var text = JSON.stringify(obj, null, 2);
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { } }, 0);
      toast('已导出：' + filename);
      return true;
    } catch (e) {
      // 老内核无 Blob/URL 或下载被拦：回退复制到剪贴板
      copyText(text, '导出数据');
      return false;
    }
  }
  function m5Export() {
    var all = chatSessions();
    if (!all.length) { toast('暂无可导出的记录'); return; }
    m5Download(m5Pack('full'), 'ai-chat-export_' + m5Stamp() + '.json');
  }
  function m5Backup() {
    var all = chatSessions();
    if (!all.length) { toast('暂无可备份的记录'); return; }
    m5Download(m5Pack('full'), 'ai-chat-backup_' + m5Stamp() + '.json');
  }
  /** 恢复：选择 JSON 文件 → 解析校验 → 二次确认（说明覆盖策略）→ 按 id 合并 */
  function m5Restore() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      try { document.body.removeChild(inp); } catch (e) { }
      if (!f) { return; }
      var rdr = new FileReader();
      rdr.onload = function () {
        var data = null;
        try { data = JSON.parse(String(rdr.result || '')); } catch (e) { data = null; }
        var sessions = (data && isArr(data.sessions)) ? data.sessions : null;
        if (!sessions) { toast('文件格式不正确，未导入', true); return; }
        // 校验：至少要有若干可用会话
        var ok = [], i;
        for (i = 0; i < sessions.length; i++) {
          var c = sessions[i] || {};
          if (c && typeof c === 'object' && (c.id !== undefined && c.id !== null) && String(c.id)) { ok.push(c); }
        }
        if (!ok.length) { toast('文件中没有可导入的对话记录', true); return; }
        var curN = chatSessions().length;
        confirmBox('恢复对话记录',
          '文件含 ' + ok.length + ' 条对话。将与本机现有 ' + curN + ' 条【按 id 合并】：' +
          '相同 id 以文件数据覆盖，新 id 追加。此操作会改写本机记录，确定导入吗？',
          '导入', false, function () {
            var merged = m5Merge(ok, data && data.meta);
            m5Repaint();
            toast('已导入，合并后共 ' + merged + ' 条');
          });
      };
      rdr.onerror = function () { toast('读取文件失败', true); };
      try { rdr.readAsText(f); } catch (e) { toast('无法读取该文件', true); }
    });
    inp.click();
  }
  /** 按 id 合并导入会话 + 元信息；返回合并后总条数 */
  function m5Merge(importSessions, importMeta) {
    var cur = chatSessions(), idx = {}, out = [], i;
    for (i = 0; i < cur.length; i++) { idx[cur[i].id] = i; out.push(cur[i]); }
    for (i = 0; i < importSessions.length; i++) {
      var c = importSessions[i] || {};
      var id = String(c.id);
      var msgs = isArr(c.messages) ? c.messages : [];
      var rec = {
        id: id,
        title: (c.title === undefined || c.title === null || c.title === '') ? '未命名对话' : String(c.title),
        createdAt: num(c.createdAt),
        updatedAt: num(c.updatedAt || c.createdAt),
        messages: msgs
      };
      if (has(idx, id)) { out[idx[id]] = rec; } else { idx[id] = out.length; out.push(rec); }
    }
    m5WriteSessions(out);
    // 合并元信息
    if (importMeta && typeof importMeta === 'object' && !isArr(importMeta)) {
      var all = chatMetaAll(), k;
      for (k in importMeta) {
        if (!has(importMeta, k)) { continue; }
        var e = importMeta[k] || {};
        var tags = isArr(e.tags) ? e.tags : [];
        var fav = !!e.fav;
        if (tags.length || fav) { all[k] = { tags: tags, fav: fav }; }
      }
      writeJSON(META_KEY, all);
    }
    // 清理孤儿元信息
    var ids = [], j;
    for (j = 0; j < out.length; j++) { ids.push(out[j].id); }
    chatMetaPrune(ids);
    return out.length;
  }
  /** 写回 ai_chat_history（仅用规范化字段，保持 ai-page.js 可读） */
  function m5WriteSessions(list) {
    writeJSON('ai_chat_history', list);
  }

  /* -------------------------------------------------- M5 重绘与事件绑定 */
  function m5Repaint() {
    var box = $('xtpChatBody');
    if (box) { paintChat(box); }
  }
  function m5Bind(root) {
    if (!root) { return; }
    // ⚠️ 事件处理器一律用局部 const el 捕获元素，绝不复用共享 var（否则闭包读到最后一个赋值元素）。
    // 搜索框（输入防抖 200ms）
    var kwEl = root.querySelector('#xtpM5Kw');
    if (kwEl) {
      var kwT = null;
      kwEl.addEventListener('input', function () {
        if (kwT) { clearTimeout(kwT); }
        kwT = setTimeout(function () {
          M5.kw = String(kwEl.value || '');
          m5Reset();
          m5Repaint();
          var nk = $('xtpM5Kw');
          if (nk && nk.focus && nk.setSelectionRange) {
            try { nk.focus(); nk.setSelectionRange(nk.value.length, nk.value.length); } catch (e) { /* 忽略 */ }
          }
        }, 200);
      });
    }
    var clearEl = root.querySelector('#xtpM5Clear');
    if (clearEl) { clearEl.addEventListener('click', function () { M5.kw = ''; m5Reset(); m5Repaint(); }); }
    var rangeEl = root.querySelector('#xtpM5Range');
    if (rangeEl) { rangeEl.addEventListener('change', function () { M5.range = rangeEl.value || 'all'; m5Reset(); m5Repaint(); }); }
    var tagEl = root.querySelector('#xtpM5Tag');
    if (tagEl) { tagEl.addEventListener('change', function () { M5.tag = tagEl.value || ''; m5Reset(); m5Repaint(); }); }
    var fromEl = root.querySelector('#xtpM5From');
    if (fromEl) { fromEl.addEventListener('change', function () { M5.from = fromEl.value || ''; m5Reset(); m5Repaint(); }); }
    var toEl = root.querySelector('#xtpM5To');
    if (toEl) { toEl.addEventListener('change', function () { M5.to = toEl.value || ''; m5Reset(); m5Repaint(); }); }
    var favEl = root.querySelector('#xtpM5Fav');
    if (favEl) { favEl.addEventListener('click', function () { M5.favOnly = !M5.favOnly; m5Reset(); m5Repaint(); }); }
    var selBtnEl = root.querySelector('#xtpM5SelBtn');
    if (selBtnEl) { selBtnEl.addEventListener('click', function () { M5.selMode = !M5.selMode; M5.sel = {}; m5Repaint(); }); }
    var selAllEl = root.querySelector('#xtpM5SelAll');
    if (selAllEl) { selAllEl.addEventListener('click', function () {
      if (m5AllSelected()) { M5.sel = {}; }
      else { var list = m5Filtered(), i; for (i = 0; i < list.length; i++) { M5.sel[list[i].id] = true; } }
      m5Repaint();
    }); }
    var delSelEl = root.querySelector('#xtpM5DelSel');
    if (delSelEl) { delSelEl.addEventListener('click', m5DelSelected); }
    var clearAllEl = root.querySelector('#xtpM5ClearAll');
    if (clearAllEl) { clearAllEl.addEventListener('click', m5ClearAll); }
    var goAiEl = root.querySelector('#xtpM5GoAi');
    if (goAiEl) { goAiEl.addEventListener('click', function () { location.href = 'AI.html'; }); }
    var resetFEl = root.querySelector('#xtpM5ResetFilter');
    if (resetFEl) { resetFEl.addEventListener('click', function () {
      M5.kw = ''; M5.tag = ''; M5.favOnly = false; M5.range = 'all'; M5.from = ''; M5.to = '';
      m5Reset(); m5Repaint();
    }); }
    var exportEl = root.querySelector('#xtpM5Export');
    if (exportEl) { exportEl.addEventListener('click', m5Export); }
    var backupEl = root.querySelector('#xtpM5Backup');
    if (backupEl) { backupEl.addEventListener('click', m5Backup); }
    var restoreEl = root.querySelector('#xtpM5Restore');
    if (restoreEl) { restoreEl.addEventListener('click', m5Restore); }
    // 列表内：多选框 / 收藏 / 标签 / 删除（用 currentTarget/闭包元素，避免共享变量）
    var boxes = root.querySelectorAll('.xtpM5Cb'), i;
    for (i = 0; i < boxes.length; i++) {
      boxes[i].addEventListener('change', function (ev) {
        var id = ev.target.getAttribute('data-id');
        if (ev.target.checked) { M5.sel[id] = true; } else { delete M5.sel[id]; }
        m5Repaint();
      });
    }
    var favs = root.querySelectorAll('.xtpM5Fav'), j;
    for (j = 0; j < favs.length; j++) {
      favs[j].addEventListener('click', function (ev) {
        ev.stopPropagation();
        m5ToggleFav(ev.currentTarget.getAttribute('data-id'));
      });
    }
    var tagbs = root.querySelectorAll('.xtpM5Tag'), m;
    for (m = 0; m < tagbs.length; m++) {
      tagbs[m].addEventListener('click', function (ev) {
        ev.stopPropagation();
        m5EditTags(ev.currentTarget.getAttribute('data-id'));
      });
    }
    var dels = root.querySelectorAll('.xtpM5Del'), p;
    for (p = 0; p < dels.length; p++) {
      dels[p].addEventListener('click', function (ev) {
        ev.stopPropagation();
        m5DelOne(ev.currentTarget.getAttribute('data-id'));
      });
    }
  }

  /* ================================================== 数字 0 → 真实值 动画 */
  function animateNumbers(scope) {
    var root = scope || document;
    var els = root.querySelectorAll('[data-anim]'), i;
    for (i = 0; i < els.length; i++) { runCount(els[i]); }
  }
  function runCount(el) {
    var raw = el.getAttribute('data-raw') || '';
    if (!raw) { raw = String(el.textContent || '').replace(/[^0-9.\-]/g, ''); el.setAttribute('data-raw', raw); }
    var target = parseFloat(raw);
    if (!isFinite(target)) { target = 0; }
    var dot = raw.indexOf('.');
    var dec = dot >= 0 ? (raw.length - dot - 1) : 0;
    if (!window.requestAnimationFrame) { return; }   // 老内核无 rAF：直接保留真值
    var dur = 700, t0 = null;
    function frame(ts) {
      if (t0 === null) { t0 = ts; }
      var p = clamp((ts - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      var v = target * e;
      el.textContent = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
      if (p < 1) { window.requestAnimationFrame(frame); }
      else { el.textContent = dec > 0 ? target.toFixed(dec) : String(Math.round(target)); }
    }
    el.textContent = dec > 0 ? (0).toFixed(dec) : '0';
    window.requestAnimationFrame(frame);
  }

  /* ============================================================== 通用弹层 */
  function openModal(innerHtml) {
    closeModal();
    var host = $('xtpModalHost') || document.body;
    var mask = document.createElement('div');
    mask.className = 'xtp-mask';
    mask.id = 'xtpMask';
    mask.innerHTML = '<div class="xtp-modal">' + innerHtml + '</div>';
    mask.addEventListener('click', function (ev) { if (ev.target === mask) { closeModal(); } });
    host.appendChild(mask);
    return mask;
  }
  function closeModal() {
    var m = $('xtpMask');
    if (m && m.parentNode) { m.parentNode.removeChild(m); }
  }
  function confirmBox(title, msg, okText, danger, onOk) {
    var mask = openModal(
      '<div class="xtp-modal-title">' + esc(title) + '</div>' +
      '<div class="xtp-modal-tip">' + esc(msg) + '</div>' +
      '<div class="xtp-modal-actions"><button type="button" id="xtpConfirmCancel">取消</button>' +
      '<button type="button" class="' + (danger ? 'danger' : 'primary') + '" id="xtpConfirmOk">' + esc(okText) + '</button></div>'
    );
    var cancel = mask.querySelector('#xtpConfirmCancel');
    var ok = mask.querySelector('#xtpConfirmOk');
    if (cancel) { cancel.addEventListener('click', closeModal); }
    if (ok) { ok.addEventListener('click', function () { closeModal(); if (onOk) { onOk(); } }); }
  }

  /* ========================================================= 复制工具 */
  function copyText(text, label) {
    var done = function () { toast((label || '内容') + '已复制：' + text); };
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { toast('复制失败，请手动复制：' + text, true); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
  }

  /* ============================================================ 头像裁剪
   * R97 微信头像设置页对标（只改 UI 与裁剪交互；状态管理、图片选取、落库逻辑不变）：
   *   1) 全屏暗色裁剪台：顶部仅左「取消」+ 右「完成」两个按钮，中间留空；
   *      裁剪区占满可用空间、四周留白压到最小（不再受 .xtp-modal 400px 限制）；
   *   2) 交互只保留：单指拖动移动图片、双指捏合缩放；桌面端额外保留滚轮缩放；
   *      已移除底部缩放滑杆与全部说明性文案，对齐微信极简观感；
   *   3) 正方形裁剪框内叠加 3x3 淡灰九宫格参考线（纯 CSS 绘制，便于对齐人脸）；
   *   4) 圆形头像遮罩（圆外暗色蒙层 + 白色内描边），点「完成」直接生成头像；
   *   5) 输出仍为正方形图片（正方形 canvas + 圆形 clip），与原实现一致。
   */
  var cropResizeFn = null;

  function openCropper(dataUrl) {
    closeModal();
    detachCropResize();
    var host = $('xtpModalHost') || document.body;
    var mask = document.createElement('div');
    mask.className = 'xtp-mask xtp-crop-mask';
    mask.id = 'xtpMask';   // 沿用统一关闭口 closeModal() / window.xtpCloseModal
    mask.innerHTML =
      '<div class="xtp-cropper">' +
        '<div class="xtp-crop-topbar" id="xtpCropTopbar">' +
          '<button class="xtp-crop-btn" type="button" id="xtpCropCancel">取消</button>' +
          '<button class="xtp-crop-btn primary" type="button" id="xtpCropOk">完成</button>' +
        '</div>' +
        '<div class="xtp-crop-stage" id="xtpCropStage">' +
          '<img id="xtpCropImg" src="' + String(dataUrl) + '" alt="">' +
          '<div class="xtp-crop-frame" id="xtpCropFrame"></div>' +
          '<div class="xtp-crop-hole" id="xtpCropHole"></div>' +
        '</div>' +
      '</div>';
    host.appendChild(mask);

    var stage = mask.querySelector('#xtpCropStage');
    var img = mask.querySelector('#xtpCropImg');
    var hole = mask.querySelector('#xtpCropHole');
    var frame = mask.querySelector('#xtpCropFrame');
    var topbar = mask.querySelector('#xtpCropTopbar');
    var ZMIN = 0.4, ZMAX = 5;                                   // 缩放比例上下限（0.4 允许明显缩小；5 为放大上限）
    var STATE = { scale: 1, x: 0, y: 0, natW: 0, natH: 0, stageW: 340, stageH: 340, ring: 292 };  // ring 现为「正方形裁剪边长」

    /* 裁剪区占满可用空间：整屏宽 ×（视口高 - 顶栏）。
       正方形边长由屏幕宽度决定（占满屏宽、上下各留 12px 呼吸），仅当可用高度不足时取高度兜底。 */
    function fitStage() {
      var vw = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 340;
      var vh = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 480;
      var topH = topbar ? (topbar.offsetHeight || 48) : 48;
      var sw = Math.max(160, Math.round(vw));
      var sh = Math.max(160, Math.round(vh - topH));   // 底栏已移除，可用高 = 视口高 - 顶栏
      var side = Math.max(120, Math.min(sw, Math.max(120, sh) - 24));  // 正方形边长：占满屏宽，上下各留 12px 呼吸
      STATE.stageW = sw; STATE.stageH = sh; STATE.ring = side;
      if (stage) { stage.style.width = sw + 'px'; stage.style.height = sh + 'px'; }
      if (hole) {
        hole.style.width = side + 'px';
        hole.style.height = side + 'px';
        hole.style.margin = (-side / 2) + 'px 0 0 ' + (-side / 2) + 'px';
      }
      if (frame) {
        frame.style.width = side + 'px';
        frame.style.height = side + 'px';
        frame.style.margin = (-side / 2) + 'px 0 0 ' + (-side / 2) + 'px';
      }
    }
    /* 基准缩放：cover 语义 —— 让图片在 scale=1 时恰好完全覆盖正方形裁剪区（取宽/高比例的较大者）。
       这样默认状态裁剪区不含黑边，且取样框正好等于原图短边（sSize<=natW 且 sSize<=natH）。
       配合 ZMIN<1，用户仍可在基准之下继续缩小（缩到小于裁剪区时由 layout 的退化分支居中锁定）。
       layout() 与 zoomAt() 共用此基准，保证锚点缩放不跳变。 */
    function baseScale() {
      if (!STATE.natW || !STATE.natH || !STATE.stageW || !STATE.stageH) { return 1; }
      return Math.max(STATE.stageW / STATE.natW, STATE.stageH / STATE.natH);
    }
    function layout() {
      var sw = STATE.stageW, sh = STATE.stageH;
      var total = baseScale() * STATE.scale;
      var w = STATE.natW * total, h = STATE.natH * total;
      var crop = STATE.ring;                            // 正方形裁剪边长
      var left = (sw - crop) / 2, top = (sh - crop) / 2;   // 裁剪区左上角（舞台坐标）
      /* 边界：图片完全覆盖裁剪区 —— 左/上边缘不得内缩，右/下边缘不得内缩 */
      var minX = left + crop - w;
      var maxX = left;
      var minY = top + crop - h;
      var maxY = top;
      /* 防御：若图片显示尺寸小于裁剪区（缩得很小时），区间会逆序 —— 退化为居中锁定，杜绝 NaN/钉死 */
      if (maxX < minX) { minX = left; maxX = left; }
      if (maxY < minY) { minY = top; maxY = top; }
      STATE.x = clamp(STATE.x, minX, maxX);
      STATE.y = clamp(STATE.y, minY, maxY);
      img.style.width = w + 'px';
      img.style.height = h + 'px';
      img.style.left = STATE.x + 'px';
      img.style.top = STATE.y + 'px';
      img.setAttribute('data-scale', String(total));
    }
    /* 以舞台坐标 (px,py) 为锚点缩放到 ns（锚点下的图像点保持不动），随后 layout() 统一 clamp 边界 */
    function zoomAt(ns, px, py) {
      if (!STATE.natW || !STATE.natH) { return; }
      ns = clamp(ns, ZMIN, ZMAX);
      var base = baseScale();
      var t0 = base * STATE.scale;
      var t1 = base * ns;
      if (t0 <= 0) { return; }
      var ux = (px - STATE.x) / t0;
      var uy = (py - STATE.y) / t0;
      STATE.scale = ns;
      STATE.x = px - ux * t1;
      STATE.y = py - uy * t1;
      layout();
    }
    img.onload = function () {
      STATE.natW = img.naturalWidth || img.width;
      STATE.natH = img.naturalHeight || img.height;
      STATE.x = 0; STATE.y = 0;
      fitStage();
      layout();
    };
    if (img.complete && img.naturalWidth) { img.onload(); }

    cropResizeFn = function () { fitStage(); layout(); };
    window.addEventListener('resize', cropResizeFn);

    var dragging = false, lastX = 0, lastY = 0;

    /* 单指 / 单指针拖动 */
    function down(px, py) { dragging = true; lastX = px; lastY = py; }
    function move(px, py) {
      if (!dragging) { return; }
      STATE.x += (px - lastX); STATE.y += (py - lastY);
      lastX = px; lastY = py;
      layout();
    }
    function up() { dragging = false; }

    /* 双击 / 双击触摸：在 1x 与 2x 间切换（以舞台中心为锚点） */
    var lastTapT = 0, downX = 0, downY = 0;
    function markDown(x, y) { downX = x; downY = y; }
    function tap(x, y) {
      var now = Date.now();
      var moved = Math.abs(x - downX) + Math.abs(y - downY);
      if (moved < 8) {
        if (now - lastTapT < 300) { toggleZoom(); lastTapT = 0; } else { lastTapT = now; }
      } else { lastTapT = 0; }
    }
    function toggleZoom() { zoomAt(STATE.scale > 1.5 ? 1 : 2, STATE.stageW / 2, STATE.stageH / 2); }

    /* 指针路径：单指拖动；双指捏合缩放（以两指中点为锚点） */
    var pointers = {}, pinch = null;
    function ptCount() { var n = 0, k; for (k in pointers) { if (has(pointers, k)) { n++; } } return n; }
    function ptIds() { var a = [], k; for (k in pointers) { if (has(pointers, k)) { a.push(k); } } return a; }
    function ptMid() { var ids = ptIds(); var a = pointers[ids[0]], b = pointers[ids[1]]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    function ptDist() { var ids = ptIds(); var a = pointers[ids[0]], b = pointers[ids[1]]; var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
    function pDown(e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { stage.setPointerCapture(e.pointerId); } catch (e2) { /* 忽略 */ }
      var n = ptCount();
      if (n === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; markDown(e.clientX, e.clientY); }
      else if (n === 2) { dragging = false; pinch = { d0: ptDist(), s0: STATE.scale }; }
    }
    function pMove(e) {
      if (!has(pointers, e.pointerId)) { return; }
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch && ptCount() >= 2) {
        var d = ptDist();
        if (pinch.d0 > 0) {
          var mid = ptMid(), rc = stage.getBoundingClientRect();
          zoomAt(pinch.s0 * (d / pinch.d0), mid.x - rc.left, mid.y - rc.top);
        }
        return;
      }
      if (dragging) { move(e.clientX, e.clientY); }
    }
    function pUp(e) {
      if (has(pointers, e.pointerId)) { delete pointers[e.pointerId]; }
      var n = ptCount();
      if (n < 2) { pinch = null; }
      if (n === 1) { var ids = ptIds(); dragging = true; lastX = pointers[ids[0]].x; lastY = pointers[ids[0]].y; }
      else if (n === 0) { dragging = false; tap(e.clientX, e.clientY); }
    }

    /* 触摸事件两指距离比兜底（无 PointerEvent 的老 WebView） */
    function tDist(e) { var a = e.touches[0], b = e.touches[1]; var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY; return Math.sqrt(dx * dx + dy * dy); }
    function tStart(e) {
      if (e.touches.length === 1) { down(e.touches[0].clientX, e.touches[0].clientY); markDown(e.touches[0].clientX, e.touches[0].clientY); }
      else if (e.touches.length === 2) { dragging = false; pinch = { d0: tDist(e), s0: STATE.scale }; }
    }
    function tMove(e) {
      if (e.touches.length >= 2 && pinch) {
        var d = tDist(e);
        if (pinch.d0 > 0) {
          var rc = stage.getBoundingClientRect();
          var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          zoomAt(pinch.s0 * (d / pinch.d0), cx - rc.left, cy - rc.top);
        }
      } else if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); }
      try { e.preventDefault(); } catch (e2) { /* 忽略 */ }
    }
    function tEnd(e) {
      if (e.touches.length === 0) {
        dragging = false; pinch = null;
        var t = e.changedTouches && e.changedTouches[0];
        if (t) { tap(t.clientX, t.clientY); }
      } else if (e.touches.length === 1) { pinch = null; down(e.touches[0].clientX, e.touches[0].clientY); }
    }

    if (window.PointerEvent) {
      stage.addEventListener('pointerdown', pDown);
      stage.addEventListener('pointermove', pMove);
      stage.addEventListener('pointerup', pUp);
      stage.addEventListener('pointercancel', pUp);
    } else {
      stage.addEventListener('mousedown', function (e) { down(e.clientX, e.clientY); });
      document.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
      document.addEventListener('mouseup', up);
      stage.addEventListener('dblclick', function (e) { try { e.preventDefault(); } catch (e2) { /* 忽略 */ } toggleZoom(); });
      stage.addEventListener('touchstart', tStart, { passive: true });
      stage.addEventListener('touchmove', tMove, { passive: false });
      stage.addEventListener('touchend', tEnd);
      stage.addEventListener('touchcancel', tEnd);
    }

    /* 滚轮缩放：以指针位置为锚点，preventDefault 包 try（避免 passive 警告） */
    stage.addEventListener('wheel', function (e) {
      if (!STATE.natW) { return; }
      var dy = e.deltaY || 0;
      if (!dy) { return; }
      var rc = stage.getBoundingClientRect();
      zoomAt(STATE.scale * (dy < 0 ? 1.1 : 1 / 1.1), e.clientX - rc.left, e.clientY - rc.top);
      try { e.preventDefault(); } catch (e2) { /* 忽略 */ }
    }, { passive: false });

    var cancel = mask.querySelector('#xtpCropCancel');
    if (cancel) {
      cancel.addEventListener('click', function () { detachCropResize(); closeModal(); });
    }
    var ok = mask.querySelector('#xtpCropOk');
    if (ok) {
      ok.addEventListener('click', function () {
        try {
          var total = num(img.getAttribute('data-scale')) || 1;
          var crop = STATE.ring, sw = STATE.stageW, sh = STATE.stageH;
          var out = clamp(Math.round(STATE.ring * (window.devicePixelRatio || 1) * 1.2), 320, 1024);
          var sx = (((sw - crop) / 2) - STATE.x) / total;
          var sy = (((sh - crop) / 2) - STATE.y) / total;
          var sSize = crop / total;
          /* R99-P1：缩小时 total 变小 → sSize 变大，可能超过原图；越界部分会被当作透明，
             叠加白色底后产出白边/白角。把正方形取样框整体夹进原图边界（尽量保持 sSize 不变，
             只平移 sx/sy）；若原图短边本身小于 sSize，则把 sSize 收到原图短边，杜绝白边。 */
          var nw = STATE.natW || img.naturalWidth || 0;
          var nh = STATE.natH || img.naturalHeight || 0;
          if (nw > 0 && nh > 0) {
            if (sSize > nw || sSize > nh) { sSize = Math.min(nw, nh); }  // 收到原图短边
            if (sx < 0) { sx = 0; }
            if (sy < 0) { sy = 0; }
            if (sx + sSize > nw) { sx = nw - sSize; }
            if (sy + sSize > nh) { sy = nh - sSize; }
            if (sx < 0) { sx = 0; }   // 二次兜底（sSize 已被收到短边时 sx 可能仍 <0）
            if (sy < 0) { sy = 0; }
          }
          var cv = document.createElement('canvas');
          cv.width = out; cv.height = out;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';                 // 白色底：防透明 PNG 出黑边
          ctx.fillRect(0, 0, out, out);
          ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, out, out);   // 全幅正方形，不做圆形裁剪
          var data = cv.toDataURL('image/jpeg', 0.92);
          saveProfile({ avatarImg: data });
          renderPage();
          var ev = $('xtpView_edit');
          if (ev && ev.classList.contains('on')) { renderView('edit', ev); }
          toast('头像已更新并保存到本机');
        } catch (e) {
          toast('头像处理失败，请换一张图片', true);
        } finally {
          detachCropResize();
          closeModal();   // 阻断bug修复：无论成功/失败都关闭全屏遮罩，杜绝残留导致整页不可点
        }
      });
    }
  }
  /** 摘掉裁剪台的 resize 监听（关闭弹层 / 重开裁剪台时调用，避免监听泄漏） */
  function detachCropResize() {
    if (cropResizeFn) {
      try { window.removeEventListener('resize', cropResizeFn); } catch (e) { /* 忽略 */ }
      cropResizeFn = null;
    }
  }

  /* ==================================================== 对外动作（window） */
  /** 通用字段编辑弹层：不带遮罩副作用，校验失败给行内提示（不静默接受） */
  function openFieldEditor(o) {
    var mask = openModal(
      '<div class="xtp-modal-title">' + esc(o.title) + '</div>' +
      '<input class="xtp-input xtp-modal-input" id="xtpFeInput" type="text" maxlength="' + num(o.maxLen) + '" placeholder="' + esc(o.placeholder || '') + '" value="' + esc(o.value || '') + '">' +
      '<div class="xtp-modal-err" id="xtpFeErr" style="display:none"></div>' +
      (o.note ? '<div class="xtp-modal-tip">' + esc(o.note) + '</div>' : '') +
      '<div class="xtp-modal-actions"><button type="button" id="xtpFeCancel">取消</button>' +
      '<button type="button" class="primary" id="xtpFeOk">保存</button></div>'
    );
    var inp = mask.querySelector('#xtpFeInput');
    var err = mask.querySelector('#xtpFeErr');
    var cancel = mask.querySelector('#xtpFeCancel');
    var ok = mask.querySelector('#xtpFeOk');
    if (cancel) { cancel.addEventListener('click', closeModal); }
    if (inp) { setTimeout(function () { try { inp.focus(); } catch (e) { /* 忽略 */ } }, 50); }
    if (ok) {
      ok.addEventListener('click', function () {
        var v = inp ? String(inp.value || '').trim() : '';
        var msg = (v && typeof o.validate === 'function') ? (o.validate(v) || '') : '';
        if (msg) { if (err) { err.textContent = msg; err.style.display = ''; } return; }
        if (typeof o.onSave === 'function') { o.onSave(v); }
        closeModal();
        var ev = $('xtpView_edit');
        if (ev && ev.classList.contains('on')) { renderView('edit', ev); }
      });
    }
  }

  /** 编辑某个扩展字段（供编辑页内联 onclick / 绑定调用） */
  function xtpEditField(key) {
    if (key === 'email') {
      var em = emailInfo();
      if (!em.editable) { location.href = '设置.html'; return; }   // 已绑定 → 改绑定只能走设置页
      openFieldEditor({
        title: '邮箱', value: em.value, placeholder: 'name@example.com', maxLen: 64,
        note: '保存后仅在本机记录，标记为「未验证」；如需验证绑定，请到「设置 → 绑定与认证」。',
        validate: function (v) { return emailOk(v) ? '' : '请输入有效的邮箱地址'; },
        onSave: function (v) { saveField('email', v); toast(v ? '邮箱已保存（未验证）' : '邮箱已清空'); }
      });
      return;
    }
    if (key === 'phone') {
      openFieldEditor({
        title: '手机号', value: phoneVal(), placeholder: '请输入 11 位手机号', maxLen: 16,
        note: '仅本机保存 · 未验证（后端暂无手机号能力，不会显示为已绑定）。',
        validate: function (v) { return phoneOk(normPhone(v)) ? '' : '请输入有效的 11 位手机号（可带 +86）'; },
        onSave: function (v) {
          var s = normPhone(v);
          saveField('phone', s);
          toast(s ? '手机号已保存（仅本机 · 未验证）' : '手机号已清空');
        }
      });
      return;
    }
    if (key === 'region') {
      /* R88-J item1：地区改为跳「地区选择.html」选择器（原为通用文本编辑层，无法跳转）。
         选中后经 localStorage['xt_region_pick'] 回写，本页 boot 时消费（10 分钟 TTL）。 */
      xtpOpenRegionPicker();
      return;
    }
    if (key === 'birthday') {
      openFieldEditor({
        title: '生日', value: birthdayVal(), placeholder: 'YYYY-MM-DD', maxLen: 10,
        validate: function (v) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { return '请按 YYYY-MM-DD 填写'; }
          var mo = parseInt(v.slice(5, 7), 10), da = parseInt(v.slice(8, 10), 10);
          return (mo < 1 || mo > 12 || da < 1 || da > 31) ? '日期不合法' : '';
        },
        onSave: function (v) { saveProfile({ birthday: v }); renderPage(); toast(v ? '生日已保存' : '生日已清空'); }
      });
      return;
    }
    if (key === 'goal') {
      openFieldEditor({
        title: '目标', value: goalVal(), placeholder: '如：2026 国考上岸', maxLen: 30,
        onSave: function (v) { saveProfile({ goal: v }); renderPage(); toast(v ? '目标已保存' : '目标已清空'); }
      });
    }
  }

  /* 底部选择弹窗（ActionSheet）：点「编辑头像」后先弹出「拍照 / 从手机相册选择 / 取消」三项，
     选定后再创建 file input 触发选图。选择来源后的处理链路复用原有 FileReader → openCropper(url)。
     自建遮罩：复用统一关闭口 id="xtpMask"（与 openModal 一致），关闭时整体摘除以杜绝「遮罩残留导致整页不可点」。 */
  function xtpOpenAvatarSheet() {
    closeModal();   // 先清理任何残留遮罩，避免叠加
    var host = $('xtpModalHost') || document.body;
    var mask = document.createElement('div');
    mask.className = 'xtp-mask xtp-sheet-mask';
    mask.id = 'xtpMask';   // 沿用统一关闭口 closeModal() / window.xtpCloseModal
    mask.innerHTML =
      '<div class="xtp-sheet" id="xtpAvatarSheet">' +
        '<div class="xtp-sheet-list">' +
          '<button class="xtp-sheet-item" type="button" id="xtpSheetCamera">拍照</button>' +
          '<button class="xtp-sheet-item" type="button" id="xtpSheetAlbum">从手机相册选择</button>' +
        '</div>' +
        '<div class="xtp-sheet-gap"></div>' +
        '<button class="xtp-sheet-item xtp-sheet-cancel" type="button" id="xtpSheetCancel">取消</button>' +
      '</div>';
    mask.addEventListener('click', function (ev) { if (ev.target === mask) { closeModal(); } });
    host.appendChild(mask);

    var cam = mask.querySelector('#xtpSheetCamera');
    var alb = mask.querySelector('#xtpSheetAlbum');
    var can = mask.querySelector('#xtpSheetCancel');
    if (cam) { cam.addEventListener('click', function () { xtpPickAvatarFile(true); }); }
    if (alb) { alb.addEventListener('click', function () { xtpPickAvatarFile(false); }); }
    if (can) { can.addEventListener('click', closeModal); }
  }

  /* 创建隐藏 file input 并触发选图；useCamera=true 时加 capture 调起相机（桌面浏览器忽略 capture，退化为普通选图，可接受）。
     useCamera=false 时不带 capture，走「从手机相册选择」。change 处理链路与原实现一致。 */
  function xtpPickAvatarFile(useCamera) {
    closeModal();   // 选毕先关面板，再打开裁剪台
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (useCamera) { inp.setAttribute('capture', 'environment'); }
    inp.style.display = 'none';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      try { if (inp.parentNode) { inp.parentNode.removeChild(inp); } } catch (e) { /* 忽略 */ }
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast('请选择图片文件', true); return; }
      var reader = new FileReader();
      reader.onload = function (e) {
        var url = e.target && e.target.result;
        if (url) { openCropper(url); } else { toast('图片读取失败', true); }
      };
      reader.onerror = function () { toast('图片读取失败', true); };
      reader.readAsDataURL(f);
    });
    document.body.appendChild(inp);
    inp.click();
  }

  /* 对外入口：点「编辑头像」先弹底部选择面板，而不是直接进相册。 */
  function xtpPickAvatar() {
    xtpOpenAvatarSheet();
  }

  function xtpCopyUid() { copyText(userId(), '用户ID'); }

  function xtpAbout() {
    openModal(
      '<div class="xtp-modal-title">星途 · 学习工作台</div>' +
      '<div class="xtp-modal-tip">版本：<b>' + esc(appVer) + '</b></div>' +
      '<div class="xtp-modal-tip">一款把学习、刷题、AI 助手与社区聚合在一处的本地优先学习工具。所有学习数据保存在本机，未登录也可使用。</div>' +
      '<div class="xtp-modal-actions">' +
        '<button type="button" id="xtpAboutFeedback">反馈入口</button>' +
        '<button type="button" class="primary" id="xtpAboutOk">知道了</button>' +
      '</div>'
    );
    var fb = $('xtpAboutFeedback');
    if (fb) { fb.addEventListener('click', function () { location.href = '关于.html'; }); }
    var ok = $('xtpAboutOk');
    if (ok) { ok.addEventListener('click', closeModal); }
  }

  function collectKeys() {
    var out = [], i, k;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (!k) continue;
        if (/^study_workbench_/.test(k) || /^xt_/.test(k) || /^xtc:/.test(k) || k === 'mini_stats' || /^study_im_/.test(k) || /^ai_/.test(k)) { out.push(k); }
      }
    } catch (e) { /* 忽略 */ }
    return out;
  }
  function xtpExport() {
    try {
      var keys = collectKeys();
      var dump = { _meta: { app: '星途 · 学习工作台', exportedAt: new Date().toISOString(), keys: keys.length } };
      var i;
      for (i = 0; i < keys.length; i++) { dump[keys[i]] = getItem(keys[i]); }
      var json = JSON.stringify(dump, null, 2);
      var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'study-workbench-data-' + Date.now() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* 忽略 */ } }, 1500);
      toast('数据已导出为 JSON');
    } catch (e) { toast('导出失败：' + (e && e.message ? e.message : e), true); }
  }
  function xtpClearCache() {
    confirmBox('清除缓存', '将清理临时队列与错误日志（不影响学习数据）。确定继续吗？', '清除', false, function () {
      var keys = ['study_workbench_stats_queue', 'study_workbench_errors', 'study_workbench_session'];
      var i;
      for (i = 0; i < keys.length; i++) { try { localStorage.removeItem(keys[i]); } catch (e) { /* 忽略 */ } }
      toast('缓存已清除');
    });
  }
  function xtpReset() {
    confirmBox('重置全部数据', '将清空本机全部学习数据（做题、时长、设置……），此操作不可恢复！确定重置吗？', '确认重置', true, function () {
      var keys = collectKeys(), i;
      for (i = 0; i < keys.length; i++) { try { localStorage.removeItem(keys[i]); } catch (e) { /* 忽略 */ } }
      toast('已重置，正在刷新…');
      setTimeout(function () { location.reload(); }, 900);
    });
  }
  function xtpLogout() {
    confirmBox('退出登录', '确定要退出当前账号吗？', '退出登录', true, function () {
      var keys = ['study_workbench_token', 'study_workbench_refresh', 'study_workbench_auth', 'study_workbench_user'];
      var i;
      for (i = 0; i < keys.length; i++) { try { localStorage.removeItem(keys[i]); } catch (e) { /* 忽略 */ } }
      try { if (typeof window.doLogout === 'function') { window.doLogout(); return; } } catch (e2) { /* 忽略 */ }
      location.href = '登录.html';
    });
  }

  /* ================================================== 暴露到 window */
  window.xtpPickAvatar = xtpPickAvatar;
  window.xtpEditField = xtpEditField;
  window.xtpCopyUid = xtpCopyUid;
  window.xtpAbout = xtpAbout;
  window.xtpExport = xtpExport;
  window.xtpClearCache = xtpClearCache;
  window.xtpReset = xtpReset;
  window.xtpLogout = xtpLogout;
  window.xtpCloseModal = closeModal;
  window.xtpOpenView = openView;
  window.xtpCloseView = backView;
  window.xtpOpenRegionPicker = xtpOpenRegionPicker;
  window.xtpTakeRegionPick = xtpTakeRegionPick;

  window.xtProfile = {
    render: renderPage,
    toggleTheme: toggleTheme,
    metrics: metrics,
    levelOf: levelOf,
    userId: userId
  };

  /* 系统主题变化时跟随（auto 模式） */
  if (window.matchMedia) {
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onSys = function () { if (themeMode() === 'auto') { applyThemeClass(); } };
      if (mq.addEventListener) { mq.addEventListener('change', onSys); }
      else if (mq.addListener) { mq.addListener(onSys); }
    } catch (e) { /* 忽略 */ }
  }

  function boot() {
    applyThemeClass();
    var otherUid = viewUid();
    if (otherUid) { renderOtherEntry(otherUid); } else { renderPage(); }
    /* R88-J item1：若从「地区选择.html」跳回，消费回写值 → 写入 profile.city。 */
    var pendingRegion = xtpTakeRegionPick();
    if (pendingRegion) {
      saveProfile({ city: pendingRegion });
      renderPage();
      toast('地区已更新：' + pendingRegion);
    }
    /* R91-A：不再预拉服务端对话记录（prefetchAiChat 已移除，角标改本机口径） */
    loadAppVersion(function () { /* 版本号就绪，供「关于」弹层使用 */ });
    loadRemoteEmail(function () {
      // 服务端邮箱态就绪：若编辑页正打开则刷新其状态（已绑定 → 只读）
      var ev = $('xtpView_edit');
      if (ev && ev.classList.contains('on')) { renderView('edit', ev); }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
