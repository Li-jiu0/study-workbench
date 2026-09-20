/* =============================================================
 * 能力模块：视觉理解（Vision / OCR）
 * -------------------------------------------------------------
 * 端点：走 chat/completions（与文本对话同一条链路）
 * 为什么 build() 返回 null：
 *   视觉请求本质就是多模态的 chat/completions，ai-service.js 里的
 *   buildMessages() 已经支持 content:[{type:'image_url'},{type:'text'}]，
 *   ai-page.js 也有完整的「上传 → base64 → 送模型」通路。
 *   所以本模块「不接管请求构造」，只负责把用量口径标注清楚，
 *   让视觉请求能从账本里被单独统计出来（这是原来做不到的）。
 *
 * ⚠ types 必须是 "image" 而不是 "vision"：
 *   "vision" 是 funcType（功能链）命名空间的键，两者不是一套东西。
 *   如果这里写成 "vision"，ai-service.js:739 的视觉链首判定会失效。
 *
 * 实测（2026-09-18，PaddleOCR-VL-1.5 识别 1024x512 中文图）：
 *   0.6 秒返回，4 行文字全中，usage = {prompt_tokens:686, completion_tokens:34, total_tokens:720}
 * 约束：ES2017，不弹 alert/confirm/prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;

  var CAP = {
    key: 'vision',
    label: '视觉理解',
    types: ['image'],          // 复用既有 type 值，不要新造
    timeout: 60000,
    modes: [{ id: 'ocr', label: '识图 · OCR', available: true, needImage: true }],
    defaultMode: 'ocr',

    /** 返回 null：交给 ai-service 既有的 chat/completions 链路处理 */
    build: function (ctx) { return null; },

    /**
     * 只从 chat 响应里取用量与正文。
     * 各家字段名不同（OpenAI 系 prompt_tokens / completion_tokens，
     * Gemini 系 promptTokenCount / candidatesTokenCount），这里都兼容。
     */
    parse: function (json, ctx) {
      var u = (json && json.usage) ? json.usage : null;
      var pin = 0, pout = 0, exact = 0;
      if (u) {
        pin = Number(u.prompt_tokens != null ? u.prompt_tokens
          : (u.input_tokens != null ? u.input_tokens
            : (u.promptTokenCount != null ? u.promptTokenCount : 0))) || 0;
        pout = Number(u.completion_tokens != null ? u.completion_tokens
          : (u.output_tokens != null ? u.output_tokens
            : (u.candidatesTokenCount != null ? u.candidatesTokenCount : 0))) || 0;
        exact = 3;
      }
      var content = '';
      try {
        if (json && json.choices && json.choices[0] && json.choices[0].message) {
          content = String(json.choices[0].message.content || '');
        }
      } catch (e) { content = ''; }

      return {
        ok: true,
        result: { text: content },
        usage: R.usage({
          kind: 'vision',
          n: 1,                 // 视觉请求次数：一次调用记 1
          inTok: pin,
          outTok: pout,
          exact: exact
        })
      };
    }
  };

  /* ---------- 探针工具（cap.probe 用；ES2017，兼容老 WebView） ---------- */
  // 说明：probe 由 ai-service.js 健康检查分派调用（T02 工线接线），
  //   ctx = { modelCfg, provider, timeout }；返回 Promise<{ ok, err, detail }>。
  //   探针一律不写 recordCall、不进 10 次/分钟限频（健康检查本就不计）。
  // R131：不再从 provider.apiKey 取 Key（该字段已从 ai-config.js 全量删除，前端零密钥）。
  // 内置平台白名单：这些平台由服务端持钥并中转，也不允许用自备 Key 覆盖。
  var BUILTIN_PROVIDERS = ['zhipu', 'qianfan', 'ark', 'arkimage', 'openrouter', 'siliconflow', 'gemini'];

  function isBuiltinProvider(pname) {
    var s = String(pname == null ? '' : pname);
    for (var i = 0; i < BUILTIN_PROVIDERS.length; i++) {
      if (BUILTIN_PROVIDERS[i] === s) return true;
    }
    return false;
  }

  // 取 Key 只认「用户自备」两处：模型自带 apiKey / localStorage（后者仅对非内置平台生效）。
  function pKey(modelCfg) {
    var k = (modelCfg && typeof modelCfg.apiKey === 'string' && modelCfg.apiKey) ? modelCfg.apiKey : '';
    if (k) return k;
    var pname = (modelCfg && modelCfg.provider) ? String(modelCfg.provider) : '';
    if (!pname || isBuiltinProvider(pname)) return '';
    try {
      var uk = (global && global.localStorage) ? (global.localStorage.getItem('ai_user_key_' + pname) || '') : '';
      return uk ? uk : '';
    } catch (e) { return ''; }
  }
  function pHeaders(ctx, json) {
    var h = json ? { "Content-Type": "application/json" } : {};
    var srcs = [ctx.provider && ctx.provider.extraHeaders, ctx.modelCfg && ctx.modelCfg.extraHeaders];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (!s || typeof s !== "object") continue;
      for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) h[k] = s[k]; }
    }
    // R131：内置模型（取不到用户自备 Key）走服务端中转，其可用性以 GET /api/ai/models
    // 为权威源，探针不再要求任何平台 Key；自备 Key 的直连才拼 Bearer。
    var key = pKey(ctx.modelCfg);
    if (key && !h["Authorization"] && !h["authorization"]) h["Authorization"] = "Bearer " + key;
    return h;
  }
  function pShort(t) {
    var s = String(t == null ? "" : t).replace(/\s+/g, " ");
    return s.length > 200 ? s.slice(0, 200) : s;
  }
  // XHR 发送（兼容老 WebView）；multipart 时不要手写 Content-Type，交给浏览器带 boundary
  function pSend(url, opts) {
    return new Promise(function (resolve) {
      var xhr = null;
      try { xhr = new XMLHttpRequest(); }
      catch (e0) { resolve({ status: 0, err: "network", text: "" }); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { xhr.abort(); } catch (e1) { /* 忽略 */ }
        resolve({ status: 0, err: "timeout", text: "" });
      }, (opts.timeout > 0 ? opts.timeout : 15000));
      function settle(v) { if (done) return; done = true; clearTimeout(timer); resolve(v); }
      try {
        xhr.open(opts.method || "POST", url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          var text = "";
          var status = 0;
          try { text = String(xhr.responseText == null ? "" : xhr.responseText); } catch (e2) { /* 忽略 */ }
          try { status = Number(xhr.status) || 0; } catch (e3) { /* 忽略 */ }
          if (status === 0) { settle({ status: 0, err: "cors", text: text }); return; }
          settle({ status: status, err: null, text: text });
        };
        xhr.onerror = function () { settle({ status: 0, err: "network", text: "" }); };
        var hs = opts.headers || {};
        for (var k in hs) {
          if (!Object.prototype.hasOwnProperty.call(hs, k)) continue;
          try { xhr.setRequestHeader(k, hs[k]); } catch (e4) { /* 忽略非法头 */ }
        }
        xhr.send(opts.body == null ? null : opts.body);
      } catch (e5) { settle({ status: 0, err: "network", text: "" }); }
    });
  }
  // 统一把 XHR 结果映射到 §3.2 的 err 值域（http_XXX / cors / network / timeout / empty）
  function pClassify(r) {
    if (r.err === "timeout") return { ok: false, err: "timeout" };
    if (r.status === 0) return { ok: false, err: r.err || "network" };
    if (r.status >= 200 && r.status < 300) return { ok: true, err: null };
    return { ok: false, err: "http_" + r.status, detail: pShort(r.text) };
  }
  // 64×64 纯色 PNG（体积仍仅百余字节）。刻意不用 1×1：上游存在最小尺寸校验（有先例），
  //   过小的图可能被 400 拒掉 → 会误判视觉模型不可用并自动隐藏，故用「足够大」的纯色图。
  // 视觉探针走 chat 多模态：验证「模型确实能吃图」，而不是只验文本连通性。
  var PROBE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PMQ0AAAwDoEqv9ErYvQQckD4XAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAYHLAB8+AWnmfUycAAAAAElFTkSuQmCC";

  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    var url = (ctx.modelCfg && typeof ctx.modelCfg.apiUrl === "string" && ctx.modelCfg.apiUrl)
      ? ctx.modelCfg.apiUrl : ((ctx.provider && ctx.provider.apiUrl) ? ctx.provider.apiUrl : "");
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var mmBody = JSON.stringify({
      model: ctx.modelCfg.model,
      max_tokens: 1,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: PROBE_PNG } },
        { type: "text", text: "hi" }
      ] }]
    });
    // 多模态被 HTTP 400 拒绝（= 请求形态问题，不代表模型死了）→ 回落一次纯文本探针；
    // 两次都失败才判不可用。其余错误（401/403/404/网络/超时）不回落，直接判结果。
    function textFallback() {
      var tb = JSON.stringify({ model: ctx.modelCfg.model,
        messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: tb,
        timeout: ctx.timeout || CAP.probeTimeout })
        .then(pClassify);
    }
    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: mmBody,
      timeout: ctx.timeout || CAP.probeTimeout })
      .then(function (r) {
        if (r.status === 400) return textFallback();
        return pClassify(r);
      });
  };

  R.register(CAP);
})(window);
