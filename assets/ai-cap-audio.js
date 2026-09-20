/* =============================================================
 * 能力模块：语音识别（ASR）
 * -------------------------------------------------------------
 * 端点：POST /v1/audio/transcriptions（multipart/form-data）
 *   R131（2026-09-19）起：内置模型改传自有服务端
 *     POST /api/ai/audio/transcribe，字段 modelId + file (+ 可选 language)
 *     密钥只在服务端 .env，前端零密钥；「Key 与 ark 相同」这类明文配置已全删。
 *   用户自备 Key 的模型仍按原链路直连上游（Key 只进 localStorage，永不上行）。
 * 实测结论（2026-09-18，微软慧慧合成的真实中文普通话 6.16s 音频）：
 *   - 「按秒计费，不是按 token」：usage = {type:'duration', seconds:N}
 *   - 各家取整规则不同：同一段 6.16s，SenseVoice/Qwen3 记 7 秒，XingChen 记 6 秒
 *     → 如实记录各家返回值，不归一化，避免账目对不上
 *   - XingChen 系列返回 duration 字段；SenseVoice/Qwen3 返回 language 字段
 *   - 说话人分离模型 Diarize 的 text 带 "1: " 前缀，另有 segments[]
 *   - 业务错误体是 {code, message, data}，不是 OpenAI 的 {error:{}}
 * 约束：ES2017，不弹 alert/confirm/prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;

  /* ---------- R131：通道判定（与 ai-service.js 同一套口径） ---------- */
  // 内置平台白名单：这些平台由服务端持钥并中转，前端既不持 Key、也不允许用自备 Key 覆盖。
  var BUILTIN_PROVIDERS = ['zhipu', 'qianfan', 'ark', 'arkimage', 'openrouter', 'siliconflow', 'gemini'];

  function isBuiltinProvider(pname) {
    var s = String(pname == null ? '' : pname);
    for (var i = 0; i < BUILTIN_PROVIDERS.length; i++) {
      if (BUILTIN_PROVIDERS[i] === s) return true;
    }
    return false;
  }

  // 本地直连用 Key：模型自带 > localStorage 用户自备（后者仅对非内置平台生效）。
  // 返回空串 = 该模型走服务端中转。
  function ownKey(modelCfg) {
    if (modelCfg && typeof modelCfg.apiKey === 'string' && modelCfg.apiKey) return modelCfg.apiKey;
    var pname = (modelCfg && modelCfg.provider) ? String(modelCfg.provider) : '';
    if (!pname || isBuiltinProvider(pname)) return '';
    var k = '';
    try { k = (global.localStorage && global.localStorage.getItem('ai_user_key_' + pname)) || ''; } catch (e) { k = ''; }
    return k;
  }

  // 中转基址：web 同源取 ''，APK(file:) 取绝对地址（与 ai-service.js relayBase 同口径）。
  function relayBase() {
    if (typeof global.STUDY_API_BASE === 'string') return global.STUDY_API_BASE;
    if (typeof global.API_BASE === 'string') return global.API_BASE;
    return '';
  }

  // X-Client-Version：服务端据此让旧 APK 优雅降级，缺了用户只会看到空白失败。
  function relayVersion() {
    try {
      var c = global.AI_CONFIG;
      if (c && typeof c.clientVersion === 'string' && c.clientVersion) return c.clientVersion;
    } catch (e) { /* 忽略 */ }
    return '';
  }

  // 中转请求头：用户登录 JWT + 版本号。⚠ multipart 场景千万别塞 Content-Type，
  // boundary 必须由浏览器自动生成，否则服务端解析不出文件。
  function relayHeaders(token) {
    var h = {};
    if (token) h['Authorization'] = 'Bearer ' + token;
    var v = relayVersion();
    if (v) h['X-Client-Version'] = v;
    return h;
  }

  function relayToken() {
    try { return (global.localStorage && global.localStorage.getItem('study_workbench_token')) || ''; } catch (e) { return ''; }
  }

  var CAP = {
    key: 'asr',
    label: '语音识别',
    types: ['audio'],
    urlField: 'audioUrl',
    legacyKeys: ['audioApiUrl'],
    defaultUrl: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    timeout: 60000,
    modes: [{ id: 'asr', label: '语音转文字', available: true, needAudio: true }],
    defaultMode: 'asr',

    build: function (ctx) {
      var input = ctx.input || {};
      var blob = input.blob || input.file || null;
      if (!blob) return { ok: false, err: '没有拿到音频数据' };

      var name = input.fileName || 'speech.wav';
      // R131：内置模型把音频上传给自有服务端转写（前端零密钥）；
      // 用户自备 Key 的模型维持原链路直连上游，字段仍是 model。
      var relay = !ownKey(ctx.modelCfg);
      // 老 WebView 的 FormData 兜底见 assets/net-compat.js
      var fd = new FormData();
      fd.append('file', blob, name);
      if (relay) {
        fd.append('modelId', String((ctx.modelCfg && ctx.modelCfg.id) || ''));
        if (input.language) fd.append('language', String(input.language));
      } else {
        fd.append('model', ctx.modelCfg.model);
      }

      return {
        url: relay ? (relayBase() + '/api/ai/audio/transcribe') : R.endpoint(CAP, ctx.provider),
        method: 'POST',
        headers: relay ? relayHeaders(relayToken()) : {},   // multipart：不写 Content-Type
        formData: fd,
        meta: { relay: relay }
      };
    },

    parse: function (json, ctx) {
      if (!json || json.text == null) {
        return { ok: false, err: R.errText(json, '语音识别响应里没有文本') };
      }
      var text = String(json.text || '');
      // Diarize 模型返回的文本带说话人序号前缀，展示前剥掉，原文保留在 raw
      var clean = text.replace(/^\s*\d+\s*[:：]\s*/, '');

      var secs = 0;
      if (json.usage && json.usage.seconds != null) secs = Number(json.usage.seconds) || 0;
      else if (json.duration != null) secs = Number(json.duration) || 0;

      return {
        ok: true,
        result: {
          text: clean,
          raw: text,
          language: json.language ? String(json.language) : '',
          segments: json.segments || null
        },
        usage: R.usage({
          kind: 'asr',
          n: 1,
          chars: clean.length,        // 字符数来自真实识别结果
          seconds: secs,              // 时长来自各家 usage/duration，如实记
          exact: 3
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
    // 中转链路：不拼任何 Bearer key，只带 JWT + 版本号。
    if (!ownKey(ctx.modelCfg)) {
      var rt = relayToken();
      if (rt) h["Authorization"] = "Bearer " + rt;
      var rv = relayVersion();
      if (rv) h["X-Client-Version"] = rv;
      return h;
    }
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
  // 0.5 秒静音 WAV（8000Hz / 8bit / 单声道 PCM，数据段全 0x80），内联 base64。
  // 用最小载荷：ASR 按秒计费，0.5 秒成本可忽略，故本 probe 可进「检测全部」批量。
  var SILENCE_WAV_B64 = "UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAPAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
  function pWavBytes(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    // R131：内置模型探活同样走服务端 /api/ai/audio/transcribe，不再用 provider key 打上游。
    var relay = !ownKey(ctx.modelCfg);
    var url = relay ? (relayBase() + '/api/ai/audio/transcribe') : R.endpoint(CAP, ctx.provider);
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var blob = null;
    try { blob = new Blob([pWavBytes(SILENCE_WAV_B64)], { type: "audio/wav" }); }
    catch (eB) { return Promise.resolve({ ok: false, err: "network", detail: "blob_unavailable" }); }
    var fd = new FormData();
    fd.append("file", blob, "probe.wav");
    if (relay) fd.append("modelId", String((ctx.modelCfg && ctx.modelCfg.id) || ""));
    else fd.append("model", ctx.modelCfg.model);
    return pSend(url, { method: "POST", headers: pHeaders(ctx, false), body: fd,
      timeout: ctx.timeout || CAP.probeTimeout })
      .then(function (r) {
        var base = pClassify(r);
        // 中转链路恒回 200 + 统一错误体 {ok,kind,error}：HTTP 层「成功」不代表模型可用。
        if (relay && base.ok) {
          var j = null;
          try { j = JSON.parse(r.text); } catch (eJ) { j = null; }
          if (!j || j.ok !== true) {
            var detail = (j && j.error) ? String(j.error) : "服务端返回失败";
            return { ok: false, err: (j && j.kind === "unavailable") ? "unavailable" : "http_" + (r.status || 200), detail: detail };
          }
        }
        return base;
      });
  };

  R.register(CAP);
})(window);
