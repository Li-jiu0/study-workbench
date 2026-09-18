/* =============================================================
 * 能力模块：向量嵌入（embedding） + 结果重排（rerank）
 * -------------------------------------------------------------
 * 这是两个端点、两种响应结构，绝不能混用：
 *   嵌入   POST /v1/embeddings  → data[].embedding（向量数组）
 *   重排   POST /v1/rerank      → results[].relevance_score
 * 实测结论（2026-09-18）：
 *   - 把重排模型打到 /v1/embeddings 会报 400 [20012] Model does not exist
 *     → 所以 rerank 必须独立成一种 type，走自己的端点
 *   - bge-m3 / bge-large-zh / bge-large-en 三个的向量维度都是 1024
 *   - 重排的 token 在 meta.tokens 下，不在顶层 usage；results[].document 恒为 null，
 *     要拿原文得自己按 index 回查
 * 约束：ES2017，不弹 alert/confirm/prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;

  /* ---------- 向量嵌入 ---------- */
  var EMB = {
    key: 'embed',
    label: '向量嵌入',
    types: ['embedding'],
    urlField: 'embedUrl',
    legacyKeys: ['embeddingApiUrl'],
    defaultUrl: 'https://api.siliconflow.cn/v1/embeddings',
    timeout: 30000,

    build: function (ctx) {
      var input = ctx.input || {};
      var texts = input.texts;
      if (!texts) texts = (input.text != null) ? [input.text] : [];
      return {
        url: R.endpoint(EMB, ctx.provider),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ctx.modelCfg.model,
          input: texts,
          encoding_format: 'float'
        }),
        meta: { n: texts.length }
      };
    },

    parse: function (json, ctx) {
      var arr = (json && json.data) ? json.data : null;
      if (!arr || !arr.length || !arr[0] || !arr[0].embedding) {
        return { ok: false, err: R.errText(json, '嵌入响应里没有向量') };
      }
      var dim = (arr[0].embedding && arr[0].embedding.length) || 0;
      var u = json.usage || {};
      var vectors = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].embedding) vectors.push(arr[i].embedding);
      }
      return {
        ok: true,
        result: { vectors: vectors, dim: dim },
        usage: R.usage({
          kind: 'embed',
          n: vectors.length,
          docs: vectors.length,
          dim: dim,
          inTok: Number(u.prompt_tokens != null ? u.prompt_tokens : (u.input_tokens || 0)) || 0,
          exact: 3
        })
      };
    }
  };

  /* ---------- 结果重排 ---------- */
  var RRK = {
    key: 'rerank',
    label: '结果重排',
    types: ['rerank'],
    urlField: 'rerankUrl',
    legacyKeys: ['rerankApiUrl'],
    defaultUrl: 'https://api.siliconflow.cn/v1/rerank',
    timeout: 30000,

    build: function (ctx) {
      var input = ctx.input || {};
      var docs = input.documents || [];
      return {
        url: R.endpoint(RRK, ctx.provider),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ctx.modelCfg.model,
          query: String(input.query || ''),
          documents: docs,
          top_n: Number(input.topN) || docs.length
        }),
        meta: { n: docs.length }
      };
    },

    parse: function (json, ctx) {
      var rs = (json && json.results) ? json.results : null;
      if (!rs || !rs.length) {
        return { ok: false, err: R.errText(json, '重排响应里没有结果') };
      }
      var meta = (json.meta && json.meta.tokens) ? json.meta.tokens : {};
      var ranked = [];
      for (var i = 0; i < rs.length; i++) {
        ranked.push({ index: rs[i].index, score: Number(rs[i].relevance_score) || 0 });
      }
      ranked.sort(function (a, b) { return b.score - a.score; });
      return {
        ok: true,
        result: { ranked: ranked },
        usage: R.usage({
          kind: 'rerank',
          n: rs.length,
          docs: rs.length,
          inTok: Number(meta.input_tokens || 0) || 0,
          exact: 3
        })
      };
    }
  };

  /* ---------- 探针工具（cap.probe 用；ES2017，兼容老 WebView） ---------- */
  // 说明：probe 由 ai-service.js 健康检查分派调用（T02 工线接线），
  //   ctx = { modelCfg, provider, timeout }；返回 Promise<{ ok, err, detail }>。
  //   探针一律不写 recordCall、不进 10 次/分钟限频（健康检查本就不计）。
  function pKey(modelCfg, provider) {
    var k = (modelCfg && typeof modelCfg.apiKey === "string" && modelCfg.apiKey) ? modelCfg.apiKey : "";
    if (!k && provider && typeof provider.apiKey === "string") k = provider.apiKey;
    return k;
  }
  function pHeaders(ctx, json) {
    var h = json ? { "Content-Type": "application/json" } : {};
    var srcs = [ctx.provider && ctx.provider.extraHeaders, ctx.modelCfg && ctx.modelCfg.extraHeaders];
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (!s || typeof s !== "object") continue;
      for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) h[k] = s[k]; }
    }
    var key = pKey(ctx.modelCfg, ctx.provider);
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

  EMB.probeTimeout = 10000;
  EMB.probe = function (ctx) {
    var url = R.endpoint(EMB, ctx.provider);
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var body = JSON.stringify({ model: ctx.modelCfg.model, input: "hi", encoding_format: "float" });
    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: body,
      timeout: ctx.timeout || EMB.probeTimeout })
      .then(function (r) {
        var base = pClassify(r);
        if (!base.ok) return base;
        var j = null;
        try { j = JSON.parse(r.text); } catch (eJ) { j = null; }
        var d0 = (j && j.data && j.data.length) ? j.data[0] : null;
        if (d0 && d0.embedding && typeof d0.embedding.length === "number" && d0.embedding.length > 0) {
          return { ok: true, err: null, detail: { dim: d0.embedding.length } };
        }
        return { ok: false, err: "empty", detail: pShort(r.text) };
      });
  };

  RRK.probeTimeout = 10000;
  RRK.probe = function (ctx) {
    var url = R.endpoint(RRK, ctx.provider);
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var body = JSON.stringify({ model: ctx.modelCfg.model, query: "hi", documents: ["hi"], top_n: 1 });
    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: body,
      timeout: ctx.timeout || RRK.probeTimeout })
      .then(function (r) {
        var base = pClassify(r);
        if (!base.ok) return base;
        var j = null;
        try { j = JSON.parse(r.text); } catch (eJ) { j = null; }
        if (j && Object.prototype.toString.call(j.results) === "[object Array]") {
          return { ok: true, err: null, detail: { n: j.results.length } };
        }
        return { ok: false, err: "empty", detail: pShort(r.text) };
      });
  };

  R.register(EMB);
  R.register(RRK);
})(window);
