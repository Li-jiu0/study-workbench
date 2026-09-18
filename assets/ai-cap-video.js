/* =============================================================
 * 能力模块：视频生成（text-to-video / image-to-video）
 * -------------------------------------------------------------
 * 端点（火山方舟，异步）：
 *   创建  POST /api/v3/contents/generations/tasks
 *   查询  GET  /api/v3/contents/generations/tasks/{id}
 *
 * 实测结论（2026-09-18，真实调用取证）：
 *   - 异步：创建只返回 {id:"cgt-..."}，要轮询到 status=succeeded 才有结果
 *   - 结果在 content.video_url；3D 走同一端点但结果在 content.file_url（.zip）
 *   - 用量字段是 usage.completion_tokens == usage.total_tokens（无 prompt_tokens）
 *   - 单次消耗巨大：5s/720p 一次约 103,818 tokens，200 万额度只够约 19 个
 *   - 结果 URL 带 X-Tos-Expires=86400，**只有 24 小时有效期**，必须落自有存储
 *   - 未开通的模型返回 404 + ModelNotOpen，与「模型不存在」不是一回事
 *
 * 为什么自己管轮询：现有能力调用层是同步请求模型（单次 60s 超时），
 * 视频生成是分钟级异步任务，撑不住。所以本模块导出 run()，由它内部
 * 完成「创建 → 轮询 → 取结果 → 上报用量」，调用层只需判断 cap.run 是否存在。
 *
 * 约束：ES2017（不用可选链 ?. 、不用 ?? 、不用 replaceAll / at / flat）
 *       不弹 alert / confirm / prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;
  var BASE = 'https://ark.cn-beijing.volces.com/api/v3';
  var TASKS = BASE + '/contents/generations/tasks';
  var POLL_MS = 5000;      // 轮询间隔
  var POLL_MAX = 120;      // 最多轮询 120 次 = 10 分钟

  function authHeaders(provider) {
    var h = { 'Content-Type': 'application/json' };
    var k = (provider && provider.apiKey) ? String(provider.apiKey) : '';
    if (k) { h['Authorization'] = 'Bearer ' + k; }
    return h;
  }

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function toJson(res) {
    return res.text().then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) { j = null; }
      return { status: res.status, json: j, raw: t };
    });
  }

  /* 成功后把真实消耗上报给服务端统一账本（多用户共享额度，必须服务端累计）。
     失败一律忽略——用量上报出错不应该让用户的视频白跑。 */
  function reportUsage(modelId, amount) {
    if (!modelId || !global.fetch) { return; }
    try {
      var base = (global.API_BASE != null) ? String(global.API_BASE) : '';
      global.fetch(base + '/api/ai/usage/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: modelId, amount: amount, ok: true, unit: 'tokens' })
      })['catch'](function () {});
    } catch (e) {}
  }

  var CAP = {
    key: 'video',
    label: '视频生成',
    types: ['video'],
    urlField: 'videoUrl',
    // 故意不设 legacyKeys：provider.apiUrl 是 chat/completions 端点，
    // 视频退到它会直接打错接口。没有 videoUrl 就用下面的方舟默认端点。
    legacyKeys: [],
    defaultUrl: TASKS,
    timeout: 600000,          // 10 分钟（异步任务，不是单次请求超时）
    async: true,              // 标记：调用层看到 async 就走 run() 而不是同步 build/parse
    modes: [
      { id: 't2v', label: '文生视频', available: true, needImage: false },
      { id: 'i2v', label: '图生视频', available: true, needImage: true }
    ],
    defaultMode: 't2v',

    /** 构造「创建任务」请求 */
    build: function (ctx) {
      var input = ctx.input || {};
      var mode = input.mode || 't2v';
      var content = [];
      var prompt = String(input.prompt || '');
      if (prompt) { content.push({ type: 'text', text: prompt }); }
      if (mode === 'i2v' && input.imageUrl) {
        content.push({ type: 'image_url', image_url: { url: String(input.imageUrl) } });
      }
      if (!content.length) { content.push({ type: 'text', text: '生成一段视频' }); }

      var body = {
        model: ctx.modelCfg.model,
        content: content,
        ratio: input.ratio || '16:9',
        duration: Number(input.duration) || 5,
        resolution: input.resolution || '720p',
        watermark: false,
        generate_audio: input.audio === true,
        camera_fixed: input.cameraFixed !== false,
        seed: (input.seed == null ? -1 : Number(input.seed))
      };
      return {
        url: R.endpoint(CAP, ctx.provider),
        method: 'POST',
        headers: authHeaders(ctx.provider),
        body: JSON.stringify(body),
        meta: { mode: mode, resolution: body.resolution, duration: body.duration }
      };
    },

    /** 解析「创建任务」响应：只要任务 id */
    parse: function (json, ctx) {
      var id = (json && json.id) ? String(json.id) : '';
      if (!id) { return { ok: false, err: R.errText(json, '创建视频任务未返回任务 ID') }; }
      return { ok: true, result: { taskId: id } };
    },

    /** 解析轮询结果 */
    parseDone: function (json, ctx) {
      var c = (json && json.content) ? json.content : {};
      var url = c.video_url ? String(c.video_url) : '';
      if (!url) { return { ok: false, err: '视频生成完成但没有返回下载地址' }; }
      var u = (json && json.usage) ? json.usage : {};
      var tok = Number(u.completion_tokens || u.total_tokens || 0);
      var meta = (ctx && ctx.meta) || {};
      return {
        ok: true,
        result: {
          url: url,
          coverUrl: c.cover_image_url ? String(c.cover_image_url) : '',
          resolution: c.resolution || meta.resolution || '',
          duration: c.duration || meta.duration || 0
        },
        usage: R.usage({ kind: 'video', n: 1, outTok: tok, exact: tok ? 2 : 0 })
      };
    },

    /** 轮询直到 succeeded / failed / 超时 */
    poll: function (taskId, ctx, onProgress) {
      var self = CAP;
      var url = R.endpoint(self, ctx.provider) + '/' + encodeURIComponent(taskId);
      var headers = authHeaders(ctx.provider);
      var tries = 0;

      function once() {
        return global.fetch(url, { method: 'GET', headers: headers })
          .then(toJson)
          .then(function (r) {
            if (r.status < 200 || r.status >= 300) {
              return { ok: false, err: R.errText(r.json, '查询视频任务失败（HTTP ' + r.status + '）') };
            }
            var st = String((r.json && r.json.status) || '');
            if (st === 'succeeded') { return self.parseDone(r.json, ctx); }
            if (st === 'failed' || st === 'cancelled' || st === 'expired') {
              return { ok: false, err: R.errText(r.json, '视频生成失败（' + st + '）') };
            }
            tries++;
            if (tries >= POLL_MAX) {
              return { ok: false, err: '视频生成超时（已等待 ' + Math.round(POLL_MAX * POLL_MS / 1000) + ' 秒）' };
            }
            if (onProgress) {
              try { onProgress({ status: st || 'running', tries: tries, max: POLL_MAX }); } catch (e) {}
            }
            return delay(POLL_MS).then(once);
          });
      }
      return once();
    },

    /**
     * 异步主流程：创建 → 轮询 → 取结果 → 上报用量。
     * 返回 Promise<{ok, result|err, usage}>，与同步能力模块的返回结构一致。
     */
    run: function (ctx, onProgress) {
      var self = CAP;
      if (!global.fetch) {
        return Promise.resolve({ ok: false, err: '当前环境不支持 fetch，无法生成视频' });
      }
      var req = self.build(ctx);
      return global.fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
        .then(toJson)
        .then(function (r) {
          if (r.status < 200 || r.status >= 300) {
            // 未开通是独立的一类错误，提示要有区分，别让用户以为模型不存在
            var msg = R.errText(r.json, '');
            if (msg.indexOf('has not activated') >= 0) {
              return { ok: false, err: '该视频模型尚未在火山方舟控制台开通，请先开通后再使用' };
            }
            return { ok: false, err: msg || ('创建视频任务失败（HTTP ' + r.status + '）') };
          }
          var p = self.parse(r.json, ctx);
          if (!p.ok) { return p; }
          if (onProgress) { try { onProgress({ status: 'created', tries: 0, max: POLL_MAX }); } catch (e) {} }
          return self.poll(p.result.taskId, { provider: ctx.provider, modelCfg: ctx.modelCfg, meta: req.meta }, onProgress)
            .then(function (done) {
              if (done.ok && ctx.modelCfg && ctx.modelCfg.id) {
                reportUsage(ctx.modelCfg.id, done.usage ? done.usage.outTok : 1);
              }
              return done;
            });
        })['catch'](function (e) {
          return { ok: false, err: (e && e.message) ? e.message : '视频生成请求异常' };
        });
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

  // ⚠⚠ 成本保护（务必阅读）⚠⚠
  // 视频生成一次 ≈ 103,818 tokens（5s/720p），200 万额度只够约 19 个。
  // 本 probe「只提交、不轮询」，但提交会真实创建一个生成任务 → 照常计费！
  // 因此本 probe【绝不进入「检测全部」自动批量】：批量检测会瞬间烧光额度。
  // 仅允许用户在「单模型检测」里手动触发（是否二次确认由 UI 层负责）。
  // 判定口径：2xx 且返回任务 id → 端点连通；404 / ModelNotOpen / 未开通 → 不可用。
  // 不轮询、不等结果、不落库；创建出的任务由平台自行处理（成本已发生）。
  CAP.probeNoAuto = true;   // 供 T02/T03 批量逻辑识别：probeNoAuto===true 的能力不进「检测全部」批量
  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    var req = CAP.build({ modelCfg: ctx.modelCfg, provider: ctx.provider,
      input: { mode: "t2v", prompt: "hi" } });
    if (!req || !req.url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    return pSend(req.url, { method: "POST", headers: pHeaders(ctx, true), body: req.body,
      timeout: ctx.timeout || CAP.probeTimeout })
      .then(function (r) {
        if (r.err === "timeout") return { ok: false, err: "timeout" };
        if (r.status === 0) return { ok: false, err: r.err || "network" };
        var low = pShort(r.text).toLowerCase();
        var notOpen = (low.indexOf("modelnotopen") >= 0 || low.indexOf("has not activated") >= 0 ||
          low.indexOf("not activated") >= 0 || low.indexOf("未开通") >= 0);
        if (r.status === 404 || notOpen) {
          return { ok: false, err: "http_" + (r.status || 404),
            detail: pShort(r.text) || "模型未开通或不存在" };
        }
        if (r.status >= 200 && r.status < 300) {
          var j = null;
          try { j = JSON.parse(r.text); } catch (eJ) { j = null; }
          if (j && j.id) return { ok: true, err: null, detail: { taskId: String(j.id) } };
          return { ok: false, err: "empty", detail: pShort(r.text) };
        }
        return { ok: false, err: "http_" + r.status, detail: pShort(r.text) };
      });
  };

  R.register(CAP);
})(window);
