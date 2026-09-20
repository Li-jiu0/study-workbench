/* =============================================================
 * 能力模块：翻译（火山方舟 doubao-seed-translation 专用）
 * -------------------------------------------------------------
 * 为什么单独一个模块（实测取证，2026-09-18）：
 *   doubao-seed-translation-250915 「不是 chat 模型」，打 /chat/completions 会 400：
 *     "the requested model doubao-seed-translation-250915 does not support this api."
 *   它走的是 /responses 端点，而且参数结构很别扭，逐个试出来的：
 *     - input 是字符串        → 400 "input string is not supported by translation model."
 *     - content 是字符串      → 400 "missing `input.content` parameter."
 *     - 没有 translation_options → 400 "missing `input.content.translation_options` parameter."
 *     - translation_options 放顶层 → 400 'unknown field "translation_options"'
 *   正确姿势：input 是数组，元素是 {role, content:[{type,text,translation_options}]}，
 *            「translation_options 必须嵌在 content 数组元素里」，不能放顶层。
 *
 * 实测 200 的请求体：
 *   POST https://ark.cn-beijing.volces.com/api/v3/responses
 *   {
 *     "model": "doubao-seed-translation-250915",
 *     "input": [{
 *       "role": "user",
 *       "content": [{
 *         "type": "input_text",
 *         "text": "hi",
 *         "translation_options": { "target_language": "zh" }
 *       }]
 *     }]
 *   }
 * 响应：output[0].content[0].text
 * 用量：usage.{input_tokens, output_tokens, total_tokens}（注意不是 prompt/completion）
 *
 * 约束：ES2017（不用可选链、不用空值合并、不用 replaceAll / at / flat）
 *       不弹 alert / confirm / prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;
  var BASE = 'https://ark.cn-beijing.volces.com/api/v3';
  var DEFAULT_TARGET = 'zh';

  /* ---------- R131：Key 取用口径改为「只认用户自备」 ---------- */
  // provider.apiKey 已从 ai-config.js 全量删除（前端零密钥）：内置模型归服务端中转，
  // 其可用性以 GET /api/ai/models 为权威源；只有自备 Key 的自定义模型才本地直连。
  // 内置平台白名单：这批平台不得用自备 Key 覆盖。
  var BUILTIN_PROVIDERS = ['zhipu', 'qianfan', 'ark', 'arkimage', 'openrouter', 'siliconflow', 'gemini'];

  function isBuiltinProvider(pname) {
    var s = String(pname == null ? '' : pname);
    for (var i = 0; i < BUILTIN_PROVIDERS.length; i++) {
      if (BUILTIN_PROVIDERS[i] === s) return true;
    }
    return false;
  }

  function ownKey(modelCfg) {
    var k = (modelCfg && typeof modelCfg.apiKey === 'string' && modelCfg.apiKey) ? modelCfg.apiKey : '';
    if (k) return k;
    var pname = (modelCfg && modelCfg.provider) ? String(modelCfg.provider) : '';
    if (!pname || isBuiltinProvider(pname)) return '';
    try {
      var uk = (global && global.localStorage) ? (global.localStorage.getItem('ai_user_key_' + pname) || '') : '';
      return uk ? uk : '';
    } catch (e) { return ''; }
  }

  function authHeaders(modelCfg) {
    var h = { 'Content-Type': 'application/json' };
    var k = ownKey(modelCfg);
    if (k) { h['Authorization'] = 'Bearer ' + k; }
    return h;
  }

  /* 目标语言允许简写，这里做一次归一化，避免用户传 "中文" 之类直接 400 */
  var LANG_ALIAS = {
    'zh': 'zh', 'zh-cn': 'zh', '中文': 'zh', '汉语': 'zh', '中': 'zh', 'chinese': 'zh',
    'en': 'en', 'en-us': 'en', '英文': 'en', '英语': 'en', '英': 'en', 'english': 'en',
    'ja': 'ja', '日文': 'ja', '日语': 'ja', 'japanese': 'ja',
    'ko': 'ko', '韩文': 'ko', '韩语': 'ko', 'korean': 'ko',
    'fr': 'fr', '法文': 'fr', '法语': 'fr',
    'de': 'de', '德文': 'de', '德语': 'de',
    'es': 'es', '西班牙文': 'es', '西语': 'es',
    'ru': 'ru', '俄文': 'ru', '俄语': 'ru'
  };

  function normLang(v) {
    var s = String(v == null ? '' : v).toLowerCase().trim();
    if (!s) { return DEFAULT_TARGET; }
    return LANG_ALIAS[s] || s;
  }

  var CAP = {
    key: 'translate',
    label: '翻译',
    types: ['translate'],
    urlField: 'responsesUrl',
    // 不能退到 provider.apiUrl：那是 chat/completions，翻译模型打过去必然 400
    legacyKeys: [],
    defaultUrl: BASE + '/responses',
    timeout: 60000,
    async: false,

    build: function (ctx) {
      // §3.6（T01）：translate 归「文本族」。仅当 provider 显式配置了 responsesUrl
      // （火山方舟 /responses 专用翻译端点）时才接管请求；否则返回 null，
      // 交给 ai-service 既有的「能力缺失降级」回落到 chat/completions，
      // 这样 SiliconFlow 上的 Hunyuan-MT-7B 这类 chat 型翻译模型才不会被误路由到 /responses。
      var provider = ctx.provider || {};
      if (!provider.responsesUrl) { return null; }
      var input = ctx.input || {};
      var text = String(input.prompt || input.text || '');
      var target = normLang(input.targetLang || (ctx.modelCfg && ctx.modelCfg.targetLang) || DEFAULT_TARGET);
      var body = {
        model: ctx.modelCfg.model,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: text,
            translation_options: { target_language: target }
          }]
        }]
      };
      return {
        url: R.endpoint(CAP, ctx.provider),
        method: 'POST',
        headers: authHeaders(ctx.modelCfg),
        body: JSON.stringify(body),
        meta: { target: target, chars: text.length }
      };
    },

    parse: function (json, ctx) {
      var meta = (ctx && ctx.meta) || {};
      // /responses 的返回是 output[].content[].text，不是 OpenAI 的 choices[].message
      var out = (json && json.output) ? json.output : null;
      var text = '';
      if (out && out.length) {
        for (var i = 0; i < out.length && !text; i++) {
          var c = out[i] && out[i].content;
          if (!c || !c.length) { continue; }
          for (var j = 0; j < c.length; j++) {
            if (c[j] && c[j].text) { text = String(c[j].text); break; }
          }
        }
      }
      if (!text) { return { ok: false, err: R.errText(json, '翻译响应里没有译文') }; }

      var u = (json && json.usage) ? json.usage : {};
      var inTok = Number(u.input_tokens || u.prompt_tokens || 0);
      var outTok = Number(u.output_tokens || u.completion_tokens || 0);
      return {
        ok: true,
        result: { text: text, target: meta.target || DEFAULT_TARGET },
        usage: R.usage({
          kind: 'translate',
          n: 1,
          inTok: inTok,
          outTok: outTok,
          exact: (inTok || outTok) ? 3 : 0,
          chars: meta.chars || 0
        })
      };
    }
  };

  /* ---------- 探针工具（cap.probe 用；ES2017，兼容老 WebView） ---------- */
  // 说明：probe 由 ai-service.js 健康检查分派调用（T02 工线接线），
  //   ctx = { modelCfg, provider, timeout }；返回 Promise<{ ok, err, detail }>。
  //   探针一律不写 recordCall、不进 10 次/分钟限频（健康检查本就不计）。
  // R131：不再从 provider.apiKey 取 Key（该字段已从 ai-config.js 全量删除）。
  // 取 Key 只认「用户自备」两处：模型自带 apiKey / localStorage（且仅限非内置平台）。
  function pKey(modelCfg) {
    return ownKey(modelCfg);
  }
  function pHeaders(ctx, json) {
    var h = json ? { "Content-Type": "application/json" } : {};
    var srcs = [ctx.provider && ctx.provider.extraHeaders, ctx.modelCfg && ctx.modelCfg.extraHeaders];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (!s || typeof s !== "object") continue;
      for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) h[k] = s[k]; }
    }
    // 内置模型走服务端中转，不拼任何 Bearer key；自备 Key 的直连才拼。
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

  // §3.6：translate 归「文本族」，默认走 chat/completions 探测；
  //   仅当 provider 显式配置 responsesUrl（火山方舟 /responses）时才用专用探针。
  CAP.probeTimeout = 10000;
  CAP.probe = function (ctx) {
    var provider = ctx.provider || {};
    if (provider.responsesUrl) {
      var up = String(provider.responsesUrl);
      var bp = JSON.stringify({
        model: ctx.modelCfg.model,
        input: [{ role: "user", content: [{ type: "input_text", text: "hi",
          translation_options: { target_language: DEFAULT_TARGET } }] }]
      });
      return pSend(up, { method: "POST", headers: pHeaders(ctx, true), body: bp,
        timeout: ctx.timeout || CAP.probeTimeout })
        .then(function (r) {
          var base = pClassify(r);
          if (!base.ok) return base;
          var j = null;
          try { j = JSON.parse(r.text); } catch (eJ) { j = null; }
          var out = (j && j.output) ? j.output : null;
          var text = "";
          if (out && out.length) {
            for (var i = 0; i < out.length && !text; i++) {
              var c = out[i] && out[i].content;
              if (!c || !c.length) continue;
              for (var k = 0; k < c.length; k++) {
                if (c[k] && c[k].text) { text = String(c[k].text); break; }
              }
            }
          }
          if (text) return { ok: true, err: null };
          return { ok: false, err: "empty", detail: pShort(r.text) };
        });
    }
    // 无 responsesUrl：按文本链探测（chat/completions，max_tokens=1，不烧 token）
    var url = (ctx.modelCfg && typeof ctx.modelCfg.apiUrl === "string" && ctx.modelCfg.apiUrl)
      ? ctx.modelCfg.apiUrl : ((provider.apiUrl) ? provider.apiUrl : "");
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var body = JSON.stringify({ model: ctx.modelCfg.model,
      messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: body,
      timeout: ctx.timeout || CAP.probeTimeout })
      .then(pClassify);
  };

  R.register(CAP);
})(window);
