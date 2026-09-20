/* =============================================================
 * 能力模块：3D 生成（image-to-3D）
 * -------------------------------------------------------------
 * 端点（火山方舟，异步）—— 与视频生成共用同一个端点：
 *   创建  POST /api/v3/contents/generations/tasks
 *   查询  GET  /api/v3/contents/generations/tasks/{id}
 *
 * 实测结论（2026-09-18，真实调用取证）：
 *   - 异步，与视频同端点，只是 content[] 里塞的是 image_url（图生 3D）
 *   - 结果在 content.file_url，「是 .zip 压缩包」（模型文件 glb 在包里）
 *   - 用量字段同视频：usage.completion_tokens == usage.total_tokens
 *   - 单次约 30,000 tokens（glb / medium），200 万额度够约 66 个
 *   - 结果 URL 同样只有 24 小时有效期（X-Tos-Expires=86400）
 *   - 厂商额度不同：Seed3D-2.0 200万 / Hitem3D-2.0 50万（Hyper3D-Gen2 已下线移除）
 *
 * 与 ai-cap-video.js 一样自带轮询（run()），不走同步调用层。
 *
 * 约束：ES2017（不用可选链、不用空值合并、不用 replaceAll / at / flat）
 *       不弹 alert / confirm / prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;
  // 上游默认端点（仅本地直连链路用；中转链路一律改指自有服务端 /api/ai/3d/*）
  var BASE = 'https://ark.cn-beijing.volces.com/api/v3';
  var TASKS = BASE + '/contents/generations/tasks';
  var POLL_MS = 5000;
  var POLL_MAX = 120;      // 10 分钟

  /* ---------- R131：通道判定（与 ai-service.js 同一套口径） ---------- */
  // 内置平台白名单：这些平台由服务端持钥并中转，前端既不持 Key、也不允许用自备 Key 覆盖。
  var BUILTIN_PROVIDERS = ['zhipu', 'qianfan', 'ark', 'arkimage', 'openrouter', 'siliconflow', 'gemini'];

  function isBuiltinProvider(pname) {
    var s = String(pname == null ? '' : pname);
    for (var bi = 0; bi < BUILTIN_PROVIDERS.length; bi++) {
      if (BUILTIN_PROVIDERS[bi] === s) return true;
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

  function isRelay(modelCfg) {
    return !ownKey(modelCfg);
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

  function relayToken() {
    try { return (global.localStorage && global.localStorage.getItem('study_workbench_token')) || ''; } catch (e) { return ''; }
  }

  // 请求头：中转链路带「用户登录 JWT + X-Client-Version」，**绝不拼 provider key**；
  // 用户自备 Key 的本地直连才把 Authorization 换成用户那把 Key（Key 只出本机，永不上行）。
  function baseHeaders(modelCfg) {
    var h = {};
    var rt = relayToken();
    if (rt) h['Authorization'] = 'Bearer ' + rt;
    var v = relayVersion();
    if (v) h['X-Client-Version'] = v;
    var k = ownKey(modelCfg);
    if (k) h['Authorization'] = 'Bearer ' + k;
    return h;
  }

  function jsonHeaders(modelCfg) {
    var h = baseHeaders(modelCfg);
    h['Content-Type'] = 'application/json';
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

      // R131：内置模型走服务端中转。契约只发 modelId / image / prompt，
      // 真实模型名与细分等级等由服务端按注册表补齐——前端零密钥，不再自拼上游方舟 body。
      if (isRelay(ctx.modelCfg)) {
        var rb = {
          modelId: String((ctx.modelCfg && ctx.modelCfg.id) || ''),
          image: img
        };
        if (input.prompt) rb.prompt = String(input.prompt);
        return {
          url: relayBase() + '/api/ai/3d/generate',
          method: 'POST',
          headers: jsonHeaders(ctx.modelCfg),
          body: JSON.stringify(rb),
          meta: { format: input.format || 'glb', subdivision: input.subdivision || 'medium', relay: true }
        };
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
        headers: jsonHeaders(ctx.modelCfg),
        body: JSON.stringify(body),
        meta: { format: body.fileformat, subdivision: body.subdivisionlevel, relay: false }
      };
    },

    /** 解析「创建任务」响应：只要任务 id（中转返回 taskId，上游返回 id，两者都认） */
    parse: function (json, ctx) {
      var id = '';
      if (json && json.id) id = String(json.id);
      else if (json && json.taskId) id = String(json.taskId);
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
      // R131：中转链路轮询自有服务端 GET /api/ai/3d/task/{id}（服务端代持 Key 去问上游）。
      var relay = isRelay(ctx && ctx.modelCfg);
      if (!relay && ctx && ctx.meta && ctx.meta.relay === true) relay = true;
      var url = relay
        ? (relayBase() + '/api/ai/3d/task/' + encodeURIComponent(taskId))
        : (R.endpoint(self, ctx.provider) + '/' + encodeURIComponent(taskId));
      var headers = relay ? baseHeaders(ctx && ctx.modelCfg) : jsonHeaders(ctx && ctx.modelCfg);
      var tries = 0;

      function once() {
        return global.fetch(url, { method: 'GET', headers: headers })
          .then(toJson)
          .then(function (r) {
            var eff = null;
            if (relay) {
              // 中转轮询恒回 200 + 统一错误体 {ok,kind,error}：HTTP 层「成功」不代表任务成功。
              var rj = (r.json && typeof r.json === 'object') ? r.json : null;
              if (!rj || rj.ok !== true) {
                var rm = (rj && rj.error) ? String(rj.error) : R.errText(rj, '查询 3D 任务失败');
                return { ok: false, err: rm, kind: (rj && rj.kind) ? String(rj.kind) : '' };
              }
              // 归一化成上游 Shape，下面整段判定逻辑无需分叉。
              eff = {
                status: String(rj.status || ''),
                content: {
                  file_url: String(rj.fileUrl || rj.modelUrl || rj.videoUrl || ''),
                  image_url: String(rj.previewUrl || ''),
                  fileformat: String(rj.fileformat || '')
                },
                usage: (rj.usage && typeof rj.usage === 'object') ? rj.usage : {}
              };
            } else {
              if (r.status < 200 || r.status >= 300) {
                return { ok: false, err: R.errText(r.json, '查询 3D 任务失败（HTTP ' + r.status + '）') };
              }
              eff = r.json;
            }
            var st = String((eff && eff.status) || '');
            if (st === 'succeeded') { return self.parseDone(eff, ctx); }
            if (st === 'failed' || st === 'cancelled' || st === 'expired') {
              return { ok: false, err: R.errText(eff, '3D 生成失败（' + st + '）') };
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
      var ranRelay = !!(req && req.meta && req.meta.relay);
      return global.fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
        .then(toJson)
        .then(function (r) {
          // R131：中转链路恒回 200 + 统一错误体 {ok,kind,error}，必须按 ok 判定，不能只看状态码。
          if (ranRelay) {
            var rj = (r.json && typeof r.json === 'object') ? r.json : null;
            if (!rj || rj.ok !== true) {
              return { ok: false, err: (rj && rj.error) ? String(rj.error) : '创建 3D 任务失败',
                       kind: (rj && rj.kind) ? String(rj.kind) : '' };
            }
          } else if (r.status < 200 || r.status >= 300) {
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
              // R131：中转链路服务端已按 `次` 权威记账，前端不再重复上报，避免双份消耗。
              if (done.ok && !ranRelay && ctx.modelCfg && ctx.modelCfg.id) {
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
    if (isRelay(ctx.modelCfg)) {
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
          // 中转返回 {ok:true, taskId}，上游返回 {id}；两者都算「端点连通」。
          if (j && (j.id || (j.ok === true && j.taskId))) {
            return { ok: true, err: null, detail: { taskId: String(j.id || j.taskId) } };
          }
          // 中转链路的失败是 200 + {ok:false, kind, error}，按 kind 给出可读结论。
          if (j && j.ok === false) {
            return { ok: false, err: (j.kind === "quota_exhausted" || j.kind === "network_limited") ? j.kind : "http_200",
              detail: (j.error ? String(j.error) : pShort(r.text)) };
          }
          return { ok: false, err: "empty", detail: pShort(r.text) };
        }
        return { ok: false, err: "http_" + r.status, detail: pShort(r.text) };
      });
  };

  R.register(CAP);
})(window);
