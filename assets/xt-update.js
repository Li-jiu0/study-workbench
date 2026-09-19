/* =========================================================================
   assets/xt-update.js —— 客户端「检测更新」（星途）
   -------------------------------------------------------------------------
   消费方：
     1) 设置.html：引入本脚本后，DOMContentLoaded 自动检测一次（12 小时节流），
        结果写回 #xtUpdateDesc / #xtUpdateBtn；有新版本时只提示一次。
     2) 更新.html：进入页面立即检测（不受节流限制），渲染三态 + 下载进度条。

   后端接口：
     GET {BASE}/api/app/version —— server/routers/update.py
     返回 {version, versionCode, apkUrl, notes: [], publishedAt, forced}

   对外 API（window.XTUpdate）：
     CURRENT_VERSION        当前版本号字符串（★ 发版必须同步修改 ★）
     checkAuto(cb)          自动检测，命中节流时直接返回不发请求
     checkManual(cb)        手动检测，忽略节流 + 3 秒防连点
     openUpdatePage()       跳转到更新页
     compareVersions(a,b)   版本号比较，返回 -1 / 0 / 1
     clearThrottle()        清掉节流记录（调试 / 冒烟用）

   兼容性约束：ES2017 语法；不使用可选链、空值合并、顶层 await、正则后行断言；
   不使用 alert / confirm / prompt（一律走 xtToast 或页面内提示）。
   ========================================================================= */
(function () {
  'use strict';

  if (window.XTUpdate) {
    return;  // 防重复注入
  }

  /* =======================================================================
     ★★★ 当前版本号：每次发包必须同步修改这里 ★★★
     必须与 android/AndroidManifest.xml 的 android:versionName 一致。
     APK / WebView 前端读不到 manifest，所以这里是唯一的版本来源。
     ======================================================================= */
  var CURRENT_VERSION = '1.29';

  var API_PATH = '/api/app/version';
  var LS_CHECK = 'xt_update_last_check';    // JSON: {at: 毫秒时间戳, version: 当前版本}
  var LS_RESULT = 'xt_update_last_result';  // JSON: 上一次成功检测到的版本信息（首屏秒渲染）
  var THROTTLE_MS = 12 * 60 * 60 * 1000;    // 自动检测节流窗口：12 小时
  var TAP_GUARD_MS = 3000;                  // 手动检测防连点窗口：3 秒
  var DETECT_TIMEOUT_MS = 8000;             // 版本检测超时

  var lastTapAt = 0;
  var detecting = false;
  var downloadXhr = null;
  var lastState = null;   // 最近一次判定结果 {state, data, message}

  /* ------------------------------ 基础工具 ------------------------------ */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(id) {
    return document.getElementById(id);
  }

  /** 轻量提示：优先复用全站 xtToast，未加载时自建一次性 DOM 提示（不用 alert）。 */
  function toast(state, msg) {
    if (typeof window.xtToast === 'function') {
      window.xtToast(state, msg);
      return;
    }
    var old = document.getElementById('xtUpMiniToast');
    if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }
    var el = document.createElement('div');
    el.id = 'xtUpMiniToast';
    el.textContent = String(msg === null || msg === undefined ? '' : msg);
    el.setAttribute('style',
      'position:fixed;left:50%;top:24px;transform:translateX(-50%);' +
      'background:#2D3436;color:#fff;padding:10px 18px;border-radius:10px;' +
      'font-size:13px;line-height:1.5;z-index:9999;max-width:86%;text-align:center;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.22)');
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 2200);
  }

  /** localStorage 安全读写：file:// 或隐私模式下可能抛异常，一律吞掉。 */
  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch (e) {
      /* 忽略：存不了就退化成不做节流 */
    }
  }

  function lsRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* 忽略 */
    }
  }

  function jsonParse(raw) {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /** 后端根地址：优先复用 config.js 的约定，其次按协议自行推断。
   *
   * 回收（R88-M2）：config.js 未加载（两个全局均缺失）且协议为 file: 时，
   *       无法构造合法后端地址。此前静默返回 ''，
   *       导致 fetch('/api/app/version') 变成 file:///.../api/app/version 而必然失败，
   *       用户只看到“卡片消失”而无法知道原因。
   *       现在显式记录错误（getBaseError），让问题可见。 */
  var lastBaseError = null;

  function getBaseError() { return lastBaseError; }

  function getApiBase() {
    lastBaseError = null;
    if (typeof window.getApiBase === 'function') {
      return String(window.getApiBase() || '');
    }
    if (typeof window.STUDY_API_BASE === 'string') {
      return window.STUDY_API_BASE;
    }
    var p = '';
    try {
      p = String(window.location.protocol || '');
    } catch (e) {
      p = '';
    }
    if (p === 'http:' || p === 'https:') {
      return '';
    }
    if (typeof window.STUDY_API_SERVER === 'string' && window.STUDY_API_SERVER) {
      return window.STUDY_API_SERVER;
    }
    // 这里到达：config.js 未加载（两个全局缺失）且非 http/https。
    // 不再静默返回 ''，而是记录明确错误。
    lastBaseError = '检测服务地址未配置：页面未加载 assets/config.js（缺 STUDY_API_BASE / STUDY_API_SERVER），无法访问检测服务。';
    return '';
  }

  function resolveUrl(path) {
    var s = String(path || '');
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) {
      return s;
    }
    if (s.charAt(0) !== '/') {
      s = '/' + s;
    }
    return getApiBase() + s;
  }

  /* ------------------------------ 版本号比较 ------------------------------ */

  /**
   * 比较两个点分版本号。非数字段按 0 处理，长度不等时补 0。
   * @returns {number} a > b 返回 1，a < b 返回 -1，相等返回 0
   */
  function compareVersions(a, b) {
    var pa = String(a || '').replace(/^v/i, '').split('.');
    var pb = String(b || '').replace(/^v/i, '').split('.');
    var len = Math.max(pa.length, pb.length);
    for (var i = 0; i < len; i++) {
      var na = parseInt(pa[i], 10);
      var nb = parseInt(pb[i], 10);
      if (isNaN(na)) { na = 0; }
      if (isNaN(nb)) { nb = 0; }
      if (na > nb) { return 1; }
      if (na < nb) { return -1; }
    }
    return 0;
  }

  /**
   * 把接口返回整理成四态之一：starting / new / latest / error。
   *
   * 注意区分「冷启动」与「真故障」：
   *   status === 'starting' —— 进程在跑但版本清单还没加载出来（首次启动约 30 秒），
   *                            是暂时状态，不能按“服务器开小差了”来报错。
   *   只有 fetch 本身失败 / 非 JSON / 网关 502 才落到 'error'。
   */
  function evaluate(data) {
    if (!data || typeof data !== 'object') {
      return { state: 'error', code: 'bad_body',
        message: '检测失败：服务器返回的内容无法解析（返回体异常）' };
    }
    if (data.status === 'starting') {
      return { state: 'starting', data: data };
    }
    var v = String(data.version || '');
    if (!v) {
      return { state: 'error', code: 'no_version',
        message: '检测失败：服务器返回体中缺少版本号字段（返回体异常）' };
    }
    if (compareVersions(v, CURRENT_VERSION) > 0) {
      var st = { state: 'new', data: data };
      // 有新版本但安装包地址为空：明确给出原因，供设置页 / 更新页提示
      // （这属于「服务端未就位」，不是网络检测失败，仍归入 new 态并在 UI 说清理由）
      if (!data.apkUrl) {
        st.reason = 'no_apk';
        st.reasonText = (data.apkReady === false)
          ? '服务端尚未放好本次安装包（apkReady=false）'
          : '服务端未返回安装包下载地址（apkUrl 为空）';
      }
      return st;
    }
    return { state: 'latest', data: data };
  }

  /* ------------------------------ 节流控制 ------------------------------ */

  /**
   * 自动检测是否被节流命中。
   * 节流按「当前版本」记账：换了本地版本号（= 用户已升级）后立刻重新放行。
   */
  function isThrottled() {
    var rec = jsonParse(lsGet(LS_CHECK));
    if (!rec || !rec.at) {
      return false;
    }
    if (rec.version && rec.version !== CURRENT_VERSION) {
      return false;
    }
    var elapsed = Date.now() - Number(rec.at);
    if (isNaN(elapsed)) {
      return false;
    }
    return elapsed >= 0 && elapsed < THROTTLE_MS;
  }

  function markChecked() {
    lsSet(LS_CHECK, JSON.stringify({ at: Date.now(), version: CURRENT_VERSION }));
  }

  function clearThrottle() {
    lsRemove(LS_CHECK);
    lsRemove(LS_RESULT);
  }

  function rememberResult(data) {
    lastState = data;
    lsSet(LS_RESULT, JSON.stringify({ at: Date.now(), version: CURRENT_VERSION, data: data }));
  }

  function readCachedResult() {
    var rec = jsonParse(lsGet(LS_RESULT));
    if (!rec || !rec.data) {
      return null;
    }
    if (rec.version && rec.version !== CURRENT_VERSION) {
      return null;
    }
    return rec.data;
  }

  /* ------------------------------ 网络请求 ------------------------------ */

  /**
   * 拉取版本信息。
   * @param {function} cb 回调 cb(errMessage|null, data|null)
   */
  function requestVersion(cb) {
    var base = getApiBase();
    var baseErr = getBaseError();
    if (baseErr) {
      // 配置缺失：直接给出明确失败原因，不发出注定会失败的请求
      cb('检测失败：' + baseErr, null, 'config_missing');
      return;
    }
    var url = base + API_PATH;
    var settled = false;
    // cb(errMsg|null, data|null, reasonCode|null)
    //   reasonCode ∈ 'http_<code>' | 'network' | 'timeout' | 'bad_body'（检测失败必带原因）
    var done = function (err, data, code) {
      if (settled) { return; }
      settled = true;
      cb(err, data, code);
    };

    // 优先 fetch（全站标准写法），缺失时退回 XMLHttpRequest（老 WebView）。
    // 失败文案必须带明确原因：HTTP 状态码 / 网络不可达 / 请求超时 / 返回体异常。
    // 注意：服务器刚启动、清单还没加载出来时走 status='starting'（HTTP 200），
    // 不走这里的失败分支，不应显示“开小差了”这种故障文案。
    if (typeof window.fetch === 'function') {
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        done('检测失败：请求超时（服务器无响应或网络不可达，超过 ' +
          Math.round(DETECT_TIMEOUT_MS / 1000) + ' 秒）', null, 'timeout');
      }, DETECT_TIMEOUT_MS);
      var ctrl = null;
      var opts = { method: 'GET', headers: { 'Accept': 'application/json' } };
      if (typeof window.AbortController === 'function') {
        ctrl = new window.AbortController();
        opts.signal = ctrl.signal;
      }
      try {
        window.fetch(url, opts).then(function (resp) {
          clearTimeout(timer);
          if (!resp.ok) {
            done('检测失败：服务器返回 HTTP ' + resp.status + '，请稍后再试', null,
              'http_' + resp.status);
            return null;
          }
          // 返回体不是合法 JSON 时，不抛异常穿透到网络分支，改判为「返回体异常」
          return resp.json().catch(function () {
            return undefined;
          });
        }).then(function (json) {
          if (settled) { return; }  // 上一分支已回调（HTTP 错误）
          if (json === undefined || json === null) {
            done('检测失败：服务器返回的内容无法解析（返回体异常，可能被网关改写）', null,
              'bad_body');
            return;
          }
          done(null, json, null);
        }).catch(function (e) {
          clearTimeout(timer);
          if (settled) { return; }
          if (timedOut) { return; }  // 超时回调已给出带原因的错误
          done('检测失败：网络不可达，请检查网络连接后重试', null, 'network');
        });
      } catch (e) {
        clearTimeout(timer);
        requestVersionByXhr(url, DETECT_TIMEOUT_MS, done);
      }
      return;
    }
    requestVersionByXhr(url, DETECT_TIMEOUT_MS, done);
  }

  function requestVersionByXhr(url, timeout, done) {
    var xhr;
    try {
      xhr = new XMLHttpRequest();
    } catch (e) {
      done('检测失败：当前环境不支持网络请求', null, 'unsupported');
      return;
    }
    var settled = false;
    var finish = function (err, data, code) {
      if (settled) { return; }
      settled = true;
      done(err, data, code);
    };
    try {
      xhr.open('GET', url, true);
      xhr.timeout = timeout;
      xhr.setRequestHeader('Accept', 'application/json');
    } catch (e) {
      finish('检测失败：请求初始化失败', null, 'init');
      return;
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status >= 200 && xhr.status < 300) {
        var json = jsonParse(xhr.responseText);
        if (!json) {
          finish('检测失败：服务器返回的内容无法解析（返回体异常）', null, 'bad_body');
          return;
        }
        finish(null, json, null);
        return;
      }
      finish('检测失败：服务器返回 HTTP ' + xhr.status + '，请稍后再试', null,
        'http_' + xhr.status);
    };
    xhr.onerror = function () {
      finish('检测失败：网络不可达，请检查网络连接后重试', null, 'network');
    };
    xhr.ontimeout = function () {
      finish('检测失败：请求超时（服务器无响应或网络不可达）', null, 'timeout');
    };
    try {
      xhr.send(null);
    } catch (e) {
      finish('检测失败：网络不可达，请检查网络连接后重试', null, 'network');
    }
  }

  /* ------------------------------ 检测动作 ------------------------------ */

  /**
   * 执行一次检测并归一化结果。
   * @param {Object} opts {throttle:boolean, silentFail:boolean, reason:string}
   * @param {function} cb  cb(state) —— state 形如 {state, data, message}
   */
  function runCheck(opts, cb) {
    var o = opts || {};
    if (o.throttle && isThrottled()) {
      var cached = readCachedResult();
      if (cached) {
        var st = evaluate(cached);
        st.throttled = true;   // 命中节流：调用方据此不再重复弹提示
        fire(cb, st);
      }
      return;  // 节流窗口内：不发请求
    }
    if (detecting) {
      return;  // 同一时刻只允许一个检测请求
    }
    detecting = true;
    requestVersion(function (err, data, code) {
      detecting = false;
      if (err) {
        var errState = { state: 'error', message: err, code: code || 'unknown' };
        lastState = errState;
        fire(cb, errState);
        return;
      }
      markChecked();
      rememberResult(data);
      fire(cb, evaluate(data));
    });
  }

  function fire(cb, state) {
    lastState = state;
    if (typeof cb === 'function') {
      cb(state);
    }
  }

  /** 自动检测：12 小时节流。 */
  function checkAuto(cb) {
    runCheck({ throttle: true }, cb);
  }

  /**
   * 手动检测：忽略 12 小时节流，但 3 秒内重复点击直接忽略并轻提示。
   * @returns {boolean} 是否真正发起了检测
   */
  function checkManual(cb) {
    var now = Date.now();
    if (now - lastTapAt < TAP_GUARD_MS) {
      toast('info', '正在检测，请稍候…');
      return false;
    }
    lastTapAt = now;
    runCheck({ throttle: false }, cb);
    return true;
  }

  function openUpdatePage() {
    window.location.href = '更新.html';
  }

  /* ------------------------------ 设置页渲染 ------------------------------ */

  function bootSettings() {
    var desc = $('xtUpdateDesc');
    if (!desc) {
      return;  // 不在设置页
    }
    var throttled = isThrottled();
    desc.textContent = throttled
      ? '当前版本 v' + CURRENT_VERSION + ' · 12 小时内已检测完毕'
      : '当前版本 v' + CURRENT_VERSION + ' · 正在检测新版本…';

    checkAuto(function (state) {
      applySettingsState(state);
      // 节流窗口内的自动检测只刷新文案，不重复打扰用户
      if (state.state === 'new' && !state.throttled) {
        toast('info', '发现新版本 v' + state.data.version + '，去「检测更新」升级');
      }
    });
  }

  /** 把检测结果写回设置页入口。 */
  function applySettingsState(state) {
    var desc = $('xtUpdateDesc');
    var btn = $('xtUpdateBtn');
    if (!desc) {
      return;
    }
    if (state.state === 'new') {
      var descNew = '发现新版本 v' + (state.data && state.data.version ? state.data.version : '') +
        '（当前 v' + CURRENT_VERSION + '）';
      if (state.reason === 'no_apk') {
        descNew += ' · 安装包暂不可用：' + (state.reasonText || '服务端未提供下载地址');
      } else {
        descNew += ' · 可下载更新';
      }
      desc.textContent = descNew;
      if (btn) {
        btn.className = 'btn btn-primary';
        btn.innerHTML = '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> 去更新';
        paintIcons();
      }
      return;
    }
    if (state.state === 'latest') {
      desc.textContent = '已是「最新版本」· 当前 v' +
        (state.data && state.data.version ? state.data.version : CURRENT_VERSION) +
        '（无需更新）';
      if (btn) {
        btn.className = 'btn btn-outline';
        btn.innerHTML = '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> 检测更新';
        paintIcons();
      }
      return;
    }
    if (state.state === 'starting') {
      desc.textContent = '当前版本 v' + CURRENT_VERSION + ' · 更新服务启动中，请稍候重试';
      if (btn) {
        btn.className = 'btn btn-outline';
        btn.innerHTML = '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> 检测更新';
        paintIcons();
      }
      return;
    }
    // 检测失败：必须带原因（message 已包含 HTTP 状态码 / 网络不可达 / 超时 / 返回体异常等）
    desc.textContent = '当前版本 v' + CURRENT_VERSION + ' · ' +
      (state.message || '检测失败：未知原因（未取得具体失败信息）');
    if (btn) {
      btn.className = 'btn btn-outline';
      btn.innerHTML = '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> 重新检测';
      paintIcons();
    }
  }

  /* ------------------------------ 更新页渲染 ------------------------------ */

  var rootId = 'xtUpdateRoot';

  /* R91-F：状态卡圆圈 / 动作按钮均为运行时 innerHTML 动态注入，icon-map.js 的
     自动渲染只在 DOMContentLoaded 跑一次，覆盖不到后注入的 [data-icon] 节点。
     这里显式补一次渲染：与 更新.html 顶部品牌块（静态 HTML，首渲染已覆盖）
     走同一条 data-icon -> lucideIcon 管线，配色/尺寸仍由既有 CSS 体系管理。 */
  function paintIcons() {
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e) {}
    }
  }

  function notesHtml(notes) {
    if (!notes || !notes.length) {
      return '<div class="xt-up-note xt-up-note-empty">本次为常规更新。</div>';
    }
    var out = '';
    for (var i = 0; i < notes.length; i++) {
      out += '<div class="xt-up-note"><span class="xt-up-note-dot"></span><span>' +
        esc(notes[i]) + '</span></div>';
    }
    return out;
  }

  /**
   * 「本次更新内容」小节 —— 位于状态卡内部、操作按钮之前。
   * @param {Object} data 服务端返回的 release
   * @param {boolean} isNew 是否处于「有新版本」态（失败态不调用本函数）
   */
  function updateContentHtml(data, isNew) {
    var head = '<div class="xt-up-block-head">' +
      '<div class="xt-up-block-title">' +
        '<span class="nav-icon" data-icon="clock" data-icon-size="14"></span> 本次更新内容' +
      '</div>';
    if (!isNew) {
      head += '<button class="xt-up-link" onclick="XTUpdate.showChangelog()">查看历史更新日志</button>';
    }
    head += '</div>';
    var body = isNew
      ? '<div class="xt-up-notes">' + notesHtml(data && data.notes) + '</div>'
      : '<div class="xt-up-note xt-up-note-empty">已是最新版本，暂无新的更新内容。</div>';
    return '<div class="xt-up-block">' + head + body + '</div>';
  }

  /** 安装包未就位时不给会 404 的下载按钮，改为明确提示 + 重新检测。 */
  function actionHtml(data) {
    var missing = !data || data.apkReady === false || !data.apkUrl;
    if (missing) {
      return '<div class="xt-up-guide xt-up-guide-tip"><b>安装包暂时不可用</b><br>' +
          '服务器还没放好这次的安装包，请稍后再试；也可以先点「重新检测」确认。' +
        '</div>' +
        '<button class="btn btn-outline btn-block" onclick="XTUpdate.recheck()">' +
          '<span class="nav-icon" data-icon="rotate-ccw" data-icon-size="14"></span> 重新检测' +
        '</button>';
    }
    return '<button class="btn btn-primary btn-block" id="xtUpDownloadBtn" ' +
        'onclick="XTUpdate.startDownload()">' +
        '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> 下载更新' +
      '</button>';
  }

  /** 把服务端 changelog 渲染到页面下方的「更新日志」卡片。 */
  function renderChangelogCard(list) {
    var box = $('xtUpChangelog');
    if (!box) { return; }
    if (!list || !list.length) {
      box.innerHTML = '<div class="xt-up-note xt-up-note-empty">暂无历史更新日志。</div>';
      return;
    }
    var out = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i] || {};
      var ver = String(it.version || '');
      // version.json 里版本号自带 v 前缀；老数据可能不带，统一补上避免显示成「vv2.4」
      if (ver && ver.charAt(0) !== 'v') { ver = 'v' + ver; }
      // date 可能为空字符串（如 v2.3 及更早没有可靠日期）——有才渲染，绝不编造
      var head = (ver ? '<span class="xt-up-log-ver">' + esc(ver) + '</span>' : '') +
        (it.date ? '<span class="xt-up-log-date">' + esc(it.date) + '</span>' : '');
      var body = '';
      var items = it.notes || [];
      if (items.length) {
        for (var j = 0; j < items.length; j++) {
          body += '<div class="xt-up-note"><span class="xt-up-note-dot"></span><span>' +
            esc(items[j]) + '</span></div>';
        }
      } else {
        body = '<div class="xt-up-note xt-up-note-empty">该版本暂无说明。</div>';
      }
      out += '<div class="xt-up-log-item">' +
          '<div class="xt-up-log-head">' + head + '</div>' +
          '<div class="xt-up-notes">' + body + '</div>' +
        '</div>';
    }
    box.innerHTML = out;
  }

  /** 「查看历史更新日志」：平滑滚动到页面下方的更新日志卡片（老内核降级为直接滚动）。 */
  function showChangelog() {
    var card = $('xtUpChangelogCard');
    if (!card) { return; }
    try {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      // 老 WebView 不支持 options 参数，退化成无动画版本
      try {
        card.scrollIntoView();
      } catch (e2) {
        /* 放弃滚动，卡片仍可手动划到 */
      }
    }
  }

  function metaHtml(data) {
    var parts = [];
    if (data.publishedAt) {
      parts.push('发布于 ' + esc(String(data.publishedAt).slice(0, 10)));
    }
    if (data.versionCode) {
      parts.push('构建号 ' + esc(data.versionCode));
    }
    if (data.forced) {
      parts.push('<b style="color:var(--danger)">强制更新</b>');
    }
    if (!parts.length) {
      return '';
    }
    return '<div class="xt-up-meta">' + parts.join(' · ') + '</div>';
  }

  function renderLoading() {
    var root = $(rootId);
    if (!root) { return; }
    root.innerHTML =
      '<div class="xt-up-state">' +
        '<div class="xt-up-spin" aria-label="检测中"></div>' +
        '<div class="xt-up-title">正在检测新版本…</div>' +
        '<div class="xt-up-sub">当前版本 v' + esc(CURRENT_VERSION) + '</div>' +
      '</div>';
  }

  function renderNew(data) {
    var root = $(rootId);
    if (!root) { return; }
    root.innerHTML =
      '<div class="xt-up-vers">' +
        '<div class="xt-up-ver"><div class="xt-up-ver-k">当前版本</div>' +
          '<div class="xt-up-ver-v">v' + esc(CURRENT_VERSION) + '</div></div>' +
        '<div class="xt-up-arrow">→</div>' +
        '<div class="xt-up-ver xt-up-ver-new"><div class="xt-up-ver-k">最新版本</div>' +
          '<div class="xt-up-ver-v">v' + esc(data.version) + '</div></div>' +
      '</div>' +
      metaHtml(data) +
      updateContentHtml(data, true) +
      '<div class="xt-up-actions">' +
        actionHtml(data) +
      '</div>' +
      '<div class="xt-up-progress" id="xtUpProgress" hidden>' +
        '<div class="xt-up-bar" id="xtUpBar"><i id="xtUpBarFill"></i></div>' +
        '<div class="xt-up-progress-tx" id="xtUpProgressTx">正在准备下载…</div>' +
      '</div>' +
      '<div class="xt-up-guide" id="xtUpGuide" hidden></div>';
    paintIcons();
  }

  function renderLatest(data) {
    var root = $(rootId);
    if (!root) { return; }
    root.innerHTML =
      '<div class="xt-up-state">' +
        '<div class="xt-up-icon xt-up-icon-ok">' +
          '<span class="nav-icon" data-icon="check-circle" data-icon-size="26"></span></div>' +
        '<div class="xt-up-title">已是最新版本</div>' +
        '<div class="xt-up-sub">当前版本 v' + esc(data && data.version ? data.version : CURRENT_VERSION) +
          '，无需更新</div>' +
      '</div>' +
      metaHtml(data || {}) +
      updateContentHtml(data, false) +
      '<div class="xt-up-actions">' +
        '<button class="btn btn-outline btn-block" onclick="XTUpdate.recheck()">' +
          '<span class="nav-icon" data-icon="rotate-ccw" data-icon-size="14"></span> 重新检测' +
        '</button>' +
      '</div>';
    paintIcons();
  }

  /** 冷启动：进程在但版本清单还没加载出来。不是故障，所以不用「失败」的视觉。 */
  function renderStarting(data) {
    var root = $(rootId);
    if (!root) { return; }
    var hint = (data && data.hint) ? String(data.hint) : '首次启动约 30 秒';
    root.innerHTML =
      '<div class="xt-up-state">' +
        '<div class="xt-up-spin" aria-label="启动中"></div>' +
        '<div class="xt-up-title">更新服务启动中</div>' +
        '<div class="xt-up-sub">' + esc(hint) + '，请稍候重试</div>' +
      '</div>' +
      '<div class="xt-up-actions">' +
        '<button class="btn btn-primary btn-block" onclick="XTUpdate.recheck()">' +
          '<span class="nav-icon" data-icon="rotate-ccw" data-icon-size="14"></span> 重新检测' +
        '</button>' +
      '</div>' +
      '<div class="xt-up-guide xt-up-guide-tip">这是服务刚启动时的正常现象，' +
        '不是故障，也不会影响已保存的学习数据。</div>';
    paintIcons();
  }

  function renderError(message) {
    var root = $(rootId);
    if (!root) { return; }
    root.innerHTML =
      '<div class="xt-up-state">' +
        '<div class="xt-up-icon xt-up-icon-bad">' +
          '<span class="nav-icon" data-icon="book-open" data-icon-size="26"></span></div>' +
        '<div class="xt-up-title">检测失败</div>' +
        '<div class="xt-up-sub">' + esc(message) + '</div>' +
      '</div>' +
      '<div class="xt-up-actions">' +
        '<button class="btn btn-primary btn-block" id="xtUpRetryBtn" onclick="XTUpdate.recheck()">' +
          '<span class="nav-icon" data-icon="rotate-ccw" data-icon-size="14"></span> 重试' +
        '</button>' +
      '</div>' +
      '<div class="xt-up-guide xt-up-guide-tip">若多次失败，可稍后再试或前往「设置 → 检测更新」重新检测。</div>';
    paintIcons();
  }

  function renderState(state) {
    if (state.state === 'new') {
      renderNew(state.data);
      renderChangelogCard(state.data && state.data.changelog);
      return;
    }
    if (state.state === 'latest') {
      renderLatest(state.data);
      renderChangelogCard(state.data && state.data.changelog);
      return;
    }
    if (state.state === 'starting') {
      renderStarting(state.data);
      return;  // 失败态之外才有更新内容小节；启动中也不渲染更新日志卡片
    }
    renderError(state.message || '未知错误');
  }

  /** 更新页：进入立即检测（不受节流限制），有缓存先秒渲染。 */
  function bootUpdatePage() {
    var root = $(rootId);
    if (!root) {
      return;  // 不在更新页
    }
    var cached = readCachedResult();
    if (cached) {
      renderState(evaluate(cached));
    } else {
      renderLoading();
    }
    runCheck({ throttle: false }, function (state) {
      renderState(state);
    });
  }

  /** 更新页「重新检测 / 重试」按钮。 */
  function recheck() {
    var ok = checkManual(function (state) {
      renderState(state);
      if (state.state === 'latest') {
        toast('success', '已是最新版本');
      }
    });
    if (ok) {
      renderLoading();
    }
  }

  /* ------------------------------ 下载与安装 ------------------------------ */

  function fileNameOf(url, data) {
    var s = String(url || '').split('?')[0];
    var seg = s.split('/');
    var last = seg[seg.length - 1] || '';
    if (last && /\.[a-zA-Z0-9]{2,5}$/.test(last)) {
      return decodeURIComponent(last);
    }
    return '星途-v' + (data && data.version ? data.version : CURRENT_VERSION) + '.apk';
  }

  /** 已下载内容的保存触发（不静默：随后由调用方给出安装引导）。 */
  function saveBlob(blob, filename) {
    var objUrl = null;
    try {
      objUrl = window.URL.createObjectURL(blob);
    } catch (e) {
      objUrl = null;
    }
    if (!objUrl) {
      return false;
    }
    try {
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
    } catch (e) {
      return false;
    }
    setTimeout(function () {
      try {
        window.URL.revokeObjectURL(objUrl);
      } catch (e2) {
        /* 忽略 */
      }
    }, 5000);
    return true;
  }

  function setProgress(percent, text, indeterminate) {
    var wrap = $('xtUpProgress');
    var fill = $('xtUpBarFill');
    var tx = $('xtUpProgressTx');
    if (wrap) {
      wrap.hidden = false;
      wrap.style.display = 'block';
    }
    if (fill) {
      if (indeterminate || percent === null) {
        fill.className = 'xt-up-bar-fill xt-up-bar-indet';
        fill.style.width = '35%';
      } else {
        fill.className = 'xt-up-bar-fill';
        fill.style.width = percent + '%';
      }
    }
    if (tx) {
      tx.textContent = text;
    }
  }

  function showGuide(html) {
    var g = $('xtUpGuide');
    if (!g) { return; }
    g.hidden = false;
    g.style.display = 'block';
    g.innerHTML = html;
  }

  /**
   * 下载安装包。能拿到 Content-Length 就显示真实百分比，
   * 拿不到就显示不确定态进度条（不伪造百分比）。
   */
  function startDownload() {
    var state = lastState;
    if (!state || state.state !== 'new' || !state.data || !state.data.apkUrl) {
      toast('warning', '没有可下载的安装包');
      return;
    }
    var data = state.data;
    var url = resolveUrl(data.apkUrl);
    var btn = $('xtUpDownloadBtn');
    var filename = fileNameOf(url, data);

    // R101：安卓 App 环境 —— 直接交给系统下载器后台下载（退出本页面不中断，通知栏看进度）
    if (window.AndroidBridge && typeof window.AndroidBridge.downloadApk === 'function') {
      try {
        window.AndroidBridge.downloadApk(url, filename);
        setProgress(null, '已开始后台下载，可在通知栏查看进度', true);
        showGuide('<div class="xt-up-guide-title">正在后台下载新版本</div>' +
          '<div class="xt-up-guide-row">安装包：<b>' + esc(filename) + '</b></div>' +
          '<div class="xt-up-guide-row">下载由系统接管：退出本页面、切换到其他应用都不会中断。</div>' +
          '<div class="xt-up-guide-row">下载完成后将自动弹出安装界面；若未弹出，可在通知栏或「Download」目录点击安装包安装。</div>');
        toast('success', '已开始后台下载');
        return;
      } catch (e) {
        /* 原生调用失败：降级走下方网页下载 */
      }
    }

    if (downloadXhr) {
      toast('info', '正在下载中，请稍候…');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> 下载中…';
      paintIcons();
    }
    setProgress(null, '正在建立连接…', true);

    var xhr;
    try {
      xhr = new XMLHttpRequest();
    } catch (e) {
      restoreBtn(btn);
      showGuide('<b>下载失败</b>：当前环境不支持下载，请到浏览器中打开本页面后重试。');
      return;
    }

    downloadXhr = xhr;
    var settled = false;

    var finish = function (ok, msg) {
      downloadXhr = null;
      settled = true;
      restoreBtn(btn, ok ? '重新下载' : '下载更新');
      if (!ok) {
        setProgress(0, msg, false);
        showGuide('<b>下载失败</b>：' + esc(msg) + '<br>可重试，或前往「设置 → 检测更新」再次尝试。');
      }
    };

    try {
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
    } catch (e) {
      downloadXhr = null;
      finish(false, '下载请求初始化失败');
      return;
    }

    xhr.onprogress = function (e) {
      if (settled) { return; }
      if (e.lengthComputable && e.total > 0) {
        var pct = Math.floor((e.loaded / e.total) * 100);
        if (pct > 100) { pct = 100; }
        if (pct < 0) { pct = 0; }
        setProgress(pct, '已下载 ' + pct + '%（' + fmtSize(e.loaded) + ' / ' + fmtSize(e.total) + '）', false);
      } else {
        // 无 Content-Length：不确定态，绝不伪造百分比
        setProgress(null, '正在下载…（' + fmtSize(e.loaded) + '）', true);
      }
    };

    xhr.onload = function () {
      if (settled) { return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(false, '服务器返回异常（HTTP ' + xhr.status + '）');
        return;
      }
      var blob = null;
      try {
        blob = xhr.response;
      } catch (e) {
        blob = null;
      }
      if (!blob) {
        finish(false, '没有收到安装包内容');
        return;
      }
      setProgress(100, '下载完成（' + fmtSize(blob.size || 0) + '）', false);
      downloadXhr = null;
      settled = true;
      restoreBtn(btn, '重新下载');
      var saved = saveBlob(blob, filename);
      showGuide('<div class="xt-up-guide-title">下载完成，请安装新版本</div>' +
        '<div class="xt-up-guide-row">安装包：<b>' + esc(filename) + '</b></div>' +
        '<div class="xt-up-guide-row">' +
          (saved
            ? '请到通知栏或下载目录中找到该安装包并点击安装；若系统未自动弹出安装界面，请手动打开安装包完成安装。'
            : '当前环境无法直接调起安装，已尝试打开下载地址，请在浏览器中完成下载与安装。') +
        '</div>' +
        '<div class="xt-up-guide-row">安装时需允许「未知来源应用」权限（安卓 8+ 会提示授权）。</div>');
      toast('success', '下载完成，请安装更新');
      if (!saved) {
        try {
          window.open(url, '_blank');
        } catch (e2) {
          /* 忽略 */
        }
      }
    };

    xhr.onerror = function () {
      if (settled) { return; }
      finish(false, '网络中断，下载未完成');
    };
    xhr.onabort = function () {
      if (settled) { return; }
      finish(false, '下载已取消');
    };

    try {
      xhr.send(null);
    } catch (e) {
      downloadXhr = null;
      finish(false, '网络连接失败');
    }
  }

  function restoreBtn(btn, label) {
    if (!btn) { return; }
    btn.disabled = false;
    btn.innerHTML = '<span class="nav-icon" data-icon="download" data-icon-size="14"></span> ' +
      esc(label || '下载更新');
    paintIcons();
  }

  function fmtSize(n) {
    var b = Number(n || 0);
    if (isNaN(b) || b <= 0) {
      return '0 KB';
    }
    if (b < 1024 * 1024) {
      return (b / 1024).toFixed(0) + ' KB';
    }
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ------------------------------ 对外暴露 ------------------------------ */

  var api = {
    CURRENT_VERSION: CURRENT_VERSION,
    THROTTLE_MS: THROTTLE_MS,
    TAP_GUARD_MS: TAP_GUARD_MS,
    compareVersions: compareVersions,
    evaluate: evaluate,
    checkAuto: checkAuto,
    checkManual: checkManual,
    clearThrottle: clearThrottle,
    openUpdatePage: openUpdatePage,
    recheck: recheck,
    startDownload: startDownload,
    showChangelog: showChangelog,
    getLastState: function () { return lastState; }
  };

  window.XTUpdate = api;

  /* ------------------------------ 页面自启动 ------------------------------ */

  function boot() {
    // R88-M2：全程 try/catch。任何初始化错误都不应表现为“入口/卡片完全不见”，
    //   而要在卡片位置渲染明确的失败态。
    try {
      // 更新页优先：有 #xtUpdateRoot 就是更新页
      if ($(rootId)) {
        bootUpdatePage();
        return;
      }
      // 否则若在设置页，走自动检测（12 小时节流）
      if ($('xtUpdateDesc')) {
        bootSettings();
        return;
      }
      // 否则若在「更多」页，写回入口的版本号（R88-G / R88-M2）
      if ($('xtMoreUpdateVer')) {
        bootMoreEntry();
      }
    } catch (e) {
      bootFail(e);
    }
  }

  /** 「更多」页检测更新入口：至少写回当前版本号，不让入口显示占位符。 */
  function bootMoreEntry() {
    var el = $('xtMoreUpdateVer');
    if (!el) { return; }
    el.textContent = '当前版本 v' + CURRENT_VERSION + ' · 查看是否有新版本';
  }

  /** 初始化失败：在卡片位置渲染失败态，绝不静默消失。 */
  function bootFail(e) {
    var msg = (e && e.message) ? String(e.message) : '未知错误';
    try {
      if ($(rootId)) {
        renderError('检测更新初始化失败：' + msg);
        return;
      }
      var desc = $('xtUpdateDesc');
      if (desc) {
        desc.textContent = '当前版本 v' + CURRENT_VERSION + ' · 检测更新初始化失败：' + msg;
      }
    } catch (e2) {
      /* 失败态渲染再出错就放弃 */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
