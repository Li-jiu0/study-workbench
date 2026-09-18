/* =============================================================
 * 能力模块：3D 生成（image-to-3D）
 * -------------------------------------------------------------
 * 端点（火山方舟，异步）—— 与视频生成共用同一个端点：
 *   创建  POST /api/v3/contents/generations/tasks
 *   查询  GET  /api/v3/contents/generations/tasks/{id}
 *
 * 实测结论（2026-09-18，真实调用取证）：
 *   - 异步，与视频同端点，只是 content[] 里塞的是 image_url（图生 3D）
 *   - 结果在 content.file_url，**是 .zip 压缩包**（模型文件 glb 在包里）
 *   - 用量字段同视频：usage.completion_tokens == usage.total_tokens
 *   - 单次约 30,000 tokens（glb / medium），200 万额度够约 66 个
 *   - 结果 URL 同样只有 24 小时有效期（X-Tos-Expires=86400）
 *   - 三家厂商额度不同：Seed3D-2.0 200万 / Hyper3D-Gen2 15万 / Hitem3D-2.0 50万
 *
 * 与 ai-cap-video.js 一样自带轮询（run()），不走同步调用层。
 *
 * 约束：ES2017（不用可选链 ?. 、不用 ?? 、不用 replaceAll / at / flat）
 *       不弹 alert / confirm / prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;
  var BASE = 'https://ark.cn-beijing.volces.com/api/v3';
  var TASKS = BASE + '/contents/generations/tasks';
  var POLL_MS = 5000;
  var POLL_MAX = 120;      // 10 分钟

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
    key: 'model3d',
    label: '3D 生成',
    types: ['3d'],
    urlField: 'model3dUrl',
    // 同 video：不能退到 provider.apiUrl（那是 chat/completions 端点）
    legacyKeys: [],
    defaultUrl: TASKS,
    timeout: 600000,
    async: true,
    modes: [
      { id: 'i23d', label: '图生 3D', available: true, needImage: true }
    ],
    defaultMode: 'i23d',

    build: function (ctx) {
      var input = ctx.input || {};
      var img = String(input.imageUrl || input.imageDataUrl || '');
      if (!img) {
        // 图片是必须的，缺了直接抛给调用层，别浪费一次上游请求
        return { url: '', method: 'POST', headers: {}, body: '', meta: { err: '图生 3D 需要先提供一张图片' } };
      }
      var body = {
        model: ctx.modelCfg.model,
        content: [{ type: 'image_url', image_url: { url: img } }],
        subdivisionlevel: input.subdivision || 'medium',
        fileformat: input.format || 'glb'
      };
      if (input.prompt) { body.content.push({ type: 'text', text: String(input.prompt) }); }
      return {
        url: R.endpoint(CAP, ctx.provider),
        method: 'POST',
        headers: authHeaders(ctx.provider),
        body: JSON.stringify(body),
        meta: { format: body.fileformat, subdivision: body.subdivisionlevel }
      };
    },

    parse: function (json, ctx) {
      var id = (json && json.id) ? String(json.id) : '';
      if (!id) { return { ok: false, err: R.errText(json, '创建 3D 任务未返回任务 ID') }; }
      return { ok: true, result: { taskId: id } };
    },

    parseDone: function (json, ctx) {
      var c = (json && json.content) ? json.content : {};
      var url = c.file_url ? String(c.file_url) : '';
      if (!url) { return { ok: false, err: '3D 生成完成但没有返回文件地址' }; }
      var u = (json && json.usage) ? json.usage : {};
      var tok = Number(u.completion_tokens || u.total_tokens || 0);
      var meta = (ctx && ctx.meta) || {};
      return {
        ok: true,
        result: {
          url: url,
          isZip: /\.zip(\?|$)/i.test(url),     // 结果是个压缩包，UI 要给下载按钮而不是直接预览
          format: c.fileformat || meta.format || 'glb',
          previewUrl: c.image_url ? String(c.image_url) : ''
        },
        usage: R.usage({ kind: 'model3d', n: 1, outTok: tok, exact: tok ? 2 : 0 })
      };
    },

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
              return { ok: false, err: R.errText(r.json, '查询 3D 任务失败（HTTP ' + r.status + '）') };
            }
            var st = String((r.json && r.json.status) || '');
            if (st === 'succeeded') { return self.parseDone(r.json, ctx); }
            if (st === 'failed' || st === 'cancelled' || st === 'expired') {
              return { ok: false, err: R.errText(r.json, '3D 生成失败（' + st + '）') };
            }
            tries++;
            if (tries >= POLL_MAX) {
              return { ok: false, err: '3D 生成超时（已等待 ' + Math.round(POLL_MAX * POLL_MS / 1000) + ' 秒）' };
            }
            if (onProgress) {
              try { onProgress({ status: st || 'running', tries: tries, max: POLL_MAX }); } catch (e) {}
            }
            return delay(POLL_MS).then(once);
          });
      }
      return once();
    },

    run: function (ctx, onProgress) {
      var self = CAP;
      if (!global.fetch) {
        return Promise.resolve({ ok: false, err: '当前环境不支持 fetch，无法生成 3D 模型' });
      }
      var req = self.build(ctx);
      if (!req.url) {
        return Promise.resolve({ ok: false, err: (req.meta && req.meta.err) || '3D 生成参数不完整' });
      }
      return global.fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
        .then(toJson)
        .then(function (r) {
          if (r.status < 200 || r.status >= 300) {
            var msg = R.errText(r.json, '');
            if (msg.indexOf('has not activated') >= 0) {
              return { ok: false, err: '该 3D 模型尚未在火山方舟控制台开通，请先开通后再使用' };
            }
            return { ok: false, err: msg || ('创建 3D 任务失败（HTTP ' + r.status + '）') };
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
          return { ok: false, err: (e && e.message) ? e.message : '3D 生成请求异常' };
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
  // 3D 探针用的输入图（512×512 纯色 PNG data URL）。刻意放大到 512×512：
  //   上游存在最小尺寸校验（有先例），过小的图可能被拒 → 会误判 3D 模型不可用。
  var PROBE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFlklEQVR42u3VMQEAAAzCMKQjHQ97l0jo0xSAlyIBgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGACAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGACAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGACAAUgAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGACAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGACAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgBgAAAYAAAGAIABAGAAABgAAAYAgAEAYAAAGAAABgCAAQBgAAAYAAAGAIABAGAAABgAADcDrctaAb6XeXAAAAAASUVORK5CYII=";

  // ⚠⚠ 成本保护（务必阅读）⚠⚠
  // 3D 生成一次 ≈ 30,000 tokens（glb/medium），200 万额度只够约 66 个。
  // 本 probe「只提交、不轮询」，但提交会真实创建一个生成任务 → 照常计费！
  // 因此本 probe【绝不进入「检测全部」自动批量】：批量检测会瞬间烧光额度。
  // 仅允许用户在「单模型检测」里手动触发（是否二次确认由 UI 层负责）。
  // 判定口径：2xx 且返回任务 id → 端点连通；404 / ModelNotOpen / 未开通 → 不可用。
  // 不轮询、不等结果、不落库；创建出的任务由平台自行处理（成本已发生）。
  CAP.probeNoAuto = true;   // 供 T02/T03 批量逻辑识别：probeNoAuto===true 的能力不进「检测全部」批量
  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    var req = CAP.build({ modelCfg: ctx.modelCfg, provider: ctx.provider,
      input: { mode: "i23d", imageDataUrl: PROBE_PNG } });
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
