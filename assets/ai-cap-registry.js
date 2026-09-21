/* =============================================================
 * AI 能力注册表（星途 / 学习工作台）
 * -------------------------------------------------------------
 * 目的：把「生图 / 视觉理解 / 语音识别 / 嵌入 / 重排」这些不同能力
 *       拆成彼此独立的能力模块，各自负责自己的端点、参数、响应解析
 *       与用量口径；本文件只做登记与查询，不含任何业务逻辑。
 *
 * 新增一种能力 = 新建一个 assets/ai-cap-xxx.js，在里面调一次
 * XT_AI_CAPS.register({ … })，再在页面里加一个 script 标签即可，
 * 不需要改动 ai-service.js 的分派逻辑。
 *
 * 约束：ES2017（不用可选链、不用空值合并、不用 replaceAll / at）
 *       不弹 alert / confirm / prompt
 * ============================================================= */
(function (global) {
  'use strict';

  var CAPS = {};     // key   -> cap
  var BY_TYPE = {};  // type  -> cap（模型 types 数组里的取值）

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  var api = {
    /** 登记一个能力。cap.types 是它会接管的模型 types 取值 */
    register: function (cap) {
      if (!cap || !cap.key) return null;
      CAPS[cap.key] = cap;
      var ts = cap.types || [];
      for (var i = 0; i < ts.length; i++) BY_TYPE[ts[i]] = cap;
      return cap;
    },

    /** 按能力 key 或模型 type 取值查询 */
    get: function (keyOrType) {
      if (!keyOrType) return null;
      return CAPS[keyOrType] || BY_TYPE[keyOrType] || null;
    },

    /** 严格按模型 types 取值查询（避免 key 与 type 同名造成歧义） */
    byType: function (t) { return BY_TYPE[t] || null; },

    all: function () {
      var r = [];
      for (var k in CAPS) { if (hasOwn(CAPS, k)) r.push(CAPS[k]); }
      return r;
    },

    /**
     * 解析端点：优先读 provider 上该能力专属字段（如 imageUrl / audioUrl），
     * 读不到再退到能力自带的默认端点。
     * 这样「同一平台多端点」不必再拆成多个 provider key。
     */
    endpoint: function (cap, provider) {
      if (!cap) return '';
      if (provider) {
        if (cap.urlField && provider[cap.urlField]) return String(provider[cap.urlField]);
        var lk = cap.legacyKeys || [];
        for (var i = 0; i < lk.length; i++) {
          if (provider[lk[i]]) return String(provider[lk[i]]);
        }
      }
      return cap.defaultUrl || '';
    },

    /**
     * 统一用量结构。各能力只填自己有的字段，缺的补 0，
     * 保证账本里每条记录形状一致，展示层不会读到 undefined。
     */
    usage: function (o) {
      o = o || {};
      return {
        kind: o.kind || 'text',                                  // text|imagegen|vision|asr|embed|rerank
        n: Math.round(Number(o.n) || 0),                         // 张数 / 请求条数
        size: String(o.size == null ? '' : o.size),              // 生图分辨率
        inTok: Math.round(Number(o.inTok) || 0),
        outTok: Math.round(Number(o.outTok) || 0),
        exact: Number(o.exact) || 0,                             // 0 估算 1 输入实测 2 输出实测 3 都实测
        chars: Math.round(Number(o.chars) || 0),                 // 识别字符数
        seconds: Math.round((Number(o.seconds) || 0) * 1000) / 1000, // 音频秒（各家取整不同，如实记）
        dim: Math.round(Number(o.dim) || 0),                     // 向量维度
        docs: Math.round(Number(o.docs) || 0)                    // 嵌入/重排的文档条数
      };
    },

    /**
     * 统一错误解析。SiliconFlow 用 {code,message,data} 三件套，
     * OpenAI 系用 {error:{message}}，两家都要兼容。
     * 返回 '' 表示没解析出错误信息。
     */
    errText: function (json, fallback) {
      var s = '';
      try {
        if (!json) return fallback || '';
        if (json.message) s = String(json.message);
        else if (json.msg) s = String(json.msg);
        else if (json.error && json.error.message) s = String(json.error.message);
        if (json.code != null && s) s = '[' + json.code + '] ' + s;
      } catch (e) { s = ''; }
      return s || fallback || '';
    }
  };

  global.XT_AI_CAPS = api;
})(window);
