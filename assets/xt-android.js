/* =====================================================================
   assets/xt-android.js —— 星途安卓壳「桥接胶水」（由 MainActivity 注入，无需页面 <script>）
   ---------------------------------------------------------------------
   为什么需要它：WebView 退到后台后页面 JS 会停摆，无法再轮询未读消息。
   本脚本只做一件事：把「后端地址 + 登录 token」交给原生侧，
   由 MsgPollService 前台服务在原生层轮询 /api/chat/unread 并弹系统通知。
   MainActivity 在每个页面 onPageFinished 时用 evaluateJavascript 注入本文件内容，
   因此「无需改动任何 html 页面」（页面归属其它线路，避免冲突）。

   安全：全程 try/catch；window.__XT_ANDROID_INJECTED__ 幂等守卫，重复注入不报错。
   语法铁律：ES2017 上限（禁可选链、空值合并、对象展开、fromEntries、at 等），老 WebView 可跑。
   ===================================================================== */
(function () {
  'use strict';
  var W = window;
  if (W.__XT_ANDROID_INJECTED__) return;
  W.__XT_ANDROID_INJECTED__ = 1;

  var SYNC_MS = 5000;
  var lastToken = null;

  /* 后端地址：与 notify.js / api.js 同口径（file:// 场景取 config.js 的 SERVER）。 */
  function apiBase() {
    try { if (typeof W.getApiBase === 'function') return String(W.getApiBase() || ''); } catch (e) { /* 继续 */ }
    try { if (W.STUDY_API_BASE !== null && W.STUDY_API_BASE !== undefined) return String(W.STUDY_API_BASE); } catch (e2) { /* 继续 */ }
    return '';
  }

  /* 登录 token（api.js 的 API_TOKEN_KEY）。 */
  function token() {
    try { return W.localStorage.getItem('study_workbench_token') || ''; } catch (e) { return ''; }
  }

  /* 把配置推给原生桥 → 写入 SharedPreferences 并启停 MsgPollService。 */
  function sync() {
    try {
      var br = W.AndroidBridge;
      if (!br || typeof br.setNotifyConfig !== 'function') return false;
      var t = token();
      br.setNotifyConfig(apiBase(), t);
      lastToken = t;
      return true;
    } catch (e) { return false; }
  }

  /* 立即同步一次；之后每 5s 检查 token 是否变化（登录/登出），变化才再推。 */
  sync();
  try {
    setInterval(function () {
      var t = token();
      if (t !== lastToken) sync();
    }, SYNC_MS);
  } catch (e) { /* 定时器不可用：仅初始同步 */ }

  W.XT_ANDROID = {
    version: '1.0.0',
    sync: sync,
    apiBase: apiBase,
    token: token,
    /* 可选：引导用户把本应用加入电池优化白名单（降低被系统冻结概率）。 */
    requestBatteryExempt: function () {
      try {
        if (W.AndroidBridge && typeof W.AndroidBridge.requestIgnoreBatteryOptimizations === 'function') {
          W.AndroidBridge.requestIgnoreBatteryOptimizations();
          return true;
        }
      } catch (e) { /* 静默 */ }
      return false;
    },
    /* 【批5/R104e】实时位置共享：转发到原生前台服务桥。
       契约：window.XTAppBridge.startLocationShare(shareId) / .stopLocationShare() → boolean。
       原生负责切后台/熄屏后持续上报（原生直接 POST /api/live/tick）；
       原生不支持时（老壳或 Web 端）返回 false，前端据此降级为纯 JS 前台模式。
       定位回调：原生经 window.__onLocationUpdate(JSON字符串) 推送，前端自行监听。 */
    hasLocationShare: function () {
      try { return !!(W.AndroidBridge && typeof W.AndroidBridge.startLocationShare === 'function'); }
      catch (e) { return false; }
    },
    startLocationShare: function (shareId) {
      try {
        if (W.AndroidBridge && typeof W.AndroidBridge.startLocationShare === 'function') {
          return !!W.AndroidBridge.startLocationShare(String(shareId == null ? '' : shareId));
        }
      } catch (e) { /* 静默 */ }
      return false;
    },
    stopLocationShare: function () {
      try {
        if (W.AndroidBridge && typeof W.AndroidBridge.stopLocationShare === 'function') {
          return !!W.AndroidBridge.stopLocationShare();
        }
      } catch (e) { /* 静默 */ }
      return false;
    }
  };
})();
