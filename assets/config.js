/* =====================================================================
   config.js —— 全站唯一的后端地址配置（星途）
   ---------------------------------------------------------------------
   为什么需要它：
     页面直接用 file:// 打开时（本地双击 / 安卓 App 的 WebView），
     `location.protocol` 是 file:，无法用相对路径访问 API，
     因此必须显式写死后端地址。

   怎么改：
     换服务器 / 换域名时，**只改下面 SERVER 一处**即可，全站生效。
     改完记得同步提升各页面引用它的版本号（tools/bump_versions_safe.py）。

   对外提供：
     window.STUDY_API_BASE  —— 后端根地址。http/https 场景返回 ''（走同源相对路径），
                              file: 场景返回 SERVER。
   ===================================================================== */
(function () {
  'use strict';

  /* ★ 后端地址：换服务器当前只改这一行 ★ */
  var SERVER = 'http://110.42.134.62:8000';

  function isWeb() {
    var p = location.protocol;
    return p === 'http:' || p === 'https:';
  }

  window.STUDY_API_SERVER = SERVER;
  window.STUDY_API_BASE = isWeb() ? '' : SERVER;

  /* 便利函数：需要每次求值的场景（如 SPA 中途切协议） */
  window.getApiBase = function () { return isWeb() ? '' : SERVER; };
})();
