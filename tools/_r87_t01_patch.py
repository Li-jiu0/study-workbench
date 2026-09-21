# -*- coding: utf-8 -*-
# R87 T01 patch: cap.probe + ai-config slots/models/details
# 二进制读写（保行尾）；先全量校验锚点，再统一写入。运行一次即判定。
import os, re, base64, struct, sys

ROOT = r"D:\下载的文件\学习工作台"
ASSETS = os.path.join(ROOT, "assets")
BAK = ".bak-pre-r87-20260918"
REPORT = os.path.join(ROOT, "tools", "_r87_t01_report.txt")
lines_log = []

def log(s):
    lines_log.append(s)

def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()

def write_bytes(p, b):
    with open(p, "wb") as f:
        f.write(b)

def detect_nl(txt):
    crlf = txt.count("\r\n")
    lf = txt.count("\n")
    if crlf > 0 and lf == crlf:
        return "\r\n", crlf, 0
    if crlf == 0 and lf > 0:
        return "\n", 0, lf
    return None, crlf, lf - crlf

def count_between(txt, start_marker, end_marker, pattern):
    norm = txt.replace("\r\n", "\n")
    a = norm.find(start_marker)
    if a < 0:
        return -1
    b = norm.find(end_marker, a)
    if b < 0:
        return -1
    return len(re.findall(pattern, norm[a:b]))

# ---------------- build silence WAV (0.5s) ----------------
sr, ch, bps = 8000, 1, 8
data_len = int(sr * 0.5)
byte_rate = sr * ch * bps // 8
block_align = ch * bps // 8
hdr = (b"RIFF" + struct.pack("<I", 36 + data_len) + b"WAVE" + b"fmt " +
       struct.pack("<IHHIIHH", 16, 1, ch, sr, byte_rate, block_align, bps) +
       b"data" + struct.pack("<I", data_len))
wav = hdr + bytes([128]) * data_len
SILENCE_B64 = base64.b64encode(wav).decode("ascii")
log("[wav] 0.5s silence wav bytes=%d base64_len=%d" % (len(wav), len(SILENCE_B64)))

TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

COMMON = '''  /* ---------- 探针工具（cap.probe 用；ES2017，兼容老 WebView） ---------- */
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
    var s = String(t == null ? "" : t).replace(/\\s+/g, " ");
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
'''

audio_extra = '''  // 0.5 秒静音 WAV（8000Hz / 8bit / 单声道 PCM，数据段全 0x80），内联 base64。
  // 用最小载荷：ASR 按秒计费，0.5 秒成本可忽略，故本 probe 可进「检测全部」批量。
  var SILENCE_WAV_B64 = "%s";
  function pWavBytes(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
''' % SILENCE_B64

audio_probe = '''  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    var url = R.endpoint(CAP, ctx.provider);
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var blob = null;
    try { blob = new Blob([pWavBytes(SILENCE_WAV_B64)], { type: "audio/wav" }); }
    catch (eB) { return Promise.resolve({ ok: false, err: "network", detail: "blob_unavailable" }); }
    var fd = new FormData();
    fd.append("file", blob, "probe.wav");
    fd.append("model", ctx.modelCfg.model);
    return pSend(url, { method: "POST", headers: pHeaders(ctx, false), body: fd,
      timeout: ctx.timeout || CAP.probeTimeout })
      .then(pClassify);
  };
'''

embed_probe = '''  EMB.probeTimeout = 10000;
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
'''

rerank_probe = '''  RRK.probeTimeout = 10000;
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
'''

vision_extra = '''  // 1×1 透明 PNG（极小载荷）。视觉探针走 chat 多模态：验证「模型确实能吃图」，
  // 而不是只验文本连通性；单次成本极低（1×1 图 + "hi"，max_tokens=1）。
  var TINY_PNG = "%s";
''' % TINY_PNG

vision_probe = '''  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    var url = (ctx.modelCfg && typeof ctx.modelCfg.apiUrl === "string" && ctx.modelCfg.apiUrl)
      ? ctx.modelCfg.apiUrl : ((ctx.provider && ctx.provider.apiUrl) ? ctx.provider.apiUrl : "");
    if (!url) return Promise.resolve({ ok: false, err: "network", detail: "no_endpoint" });
    var body = JSON.stringify({
      model: ctx.modelCfg.model,
      max_tokens: 1,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: TINY_PNG } },
        { type: "text", text: "hi" }
      ] }]
    });
    return pSend(url, { method: "POST", headers: pHeaders(ctx, true), body: body,
      timeout: ctx.timeout || CAP.probeTimeout })
      .then(pClassify);
  };
'''

translate_build_anchor = (
    "    build: function (ctx) {\n"
    "      var input = ctx.input || {};\n"
    "      var text = String(input.prompt || input.text || '');"
)
translate_build_repl = (
    "    build: function (ctx) {\n"
    "      // §3.6（T01）：translate 归「文本族」。仅当 provider 显式配置了 responsesUrl\n"
    "      // （火山方舟 /responses 专用翻译端点）时才接管请求；否则返回 null，\n"
    "      // 交给 ai-service 既有的「能力缺失降级」回落到 chat/completions，\n"
    "      // 这样 SiliconFlow 上的 Hunyuan-MT-7B 这类 chat 型翻译模型才不会被误路由到 /responses。\n"
    "      var provider = ctx.provider || {};\n"
    "      if (!provider.responsesUrl) { return null; }\n"
    "      var input = ctx.input || {};\n"
    "      var text = String(input.prompt || input.text || '');"
)

translate_probe = '''  // §3.6：translate 归「文本族」，默认走 chat/completions 探测；
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
'''

video_probe = '''  // ⚠⚠ 成本保护（务必阅读）⚠⚠
  // 视频生成一次 ≈ 103,818 tokens（5s/720p），200 万额度只够约 19 个。
  // 本 probe「只提交、不轮询」，但提交会真实创建一个生成任务 → 照常计费！
  // 因此本 probe【绝不进入「检测全部」自动批量】：批量检测会瞬间烧光额度。
  // 仅允许用户在「单模型检测」里手动触发（是否二次确认由 UI 层负责）。
  // 判定口径：2xx 且返回任务 id → 端点连通；404 / ModelNotOpen / 未开通 → 不可用。
  // 不轮询、不等结果、不落库；创建出的任务由平台自行处理（成本已发生）。
  CAP.probeCostly = true;   // 供 T02/T03 批量逻辑识别：probeCostly===true 的能力不进批量检测
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
'''

three_d_probe = '''  // ⚠⚠ 成本保护（务必阅读）⚠⚠
  // 3D 生成一次 ≈ 30,000 tokens（glb/medium），200 万额度只够约 66 个。
  // 本 probe「只提交、不轮询」，但提交会真实创建一个生成任务 → 照常计费！
  // 因此本 probe【绝不进入「检测全部」自动批量】：批量检测会瞬间烧光额度。
  // 仅允许用户在「单模型检测」里手动触发（是否二次确认由 UI 层负责）。
  // 判定口径：2xx 且返回任务 id → 端点连通；404 / ModelNotOpen / 未开通 → 不可用。
  // 不轮询、不等结果、不落库；创建出的任务由平台自行处理（成本已发生）。
  CAP.probeCostly = true;   // 供 T02/T03 批量逻辑识别：probeCostly===true 的能力不进批量检测
  CAP.probeTimeout = 15000;
  CAP.probe = function (ctx) {
    var req = CAP.build({ modelCfg: ctx.modelCfg, provider: ctx.provider,
      input: { mode: "i23d", imageDataUrl: TINY_PNG } });
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
'''

three_d_extra = '''  // 3D 探针用的极小输入图（1×1 PNG data URL）。
  var TINY_PNG = "%s";
''' % TINY_PNG

EDITS = {}
EDITS["ai-cap-audio.js"] = [
    ("  R.register(CAP);\n})(window);",
     COMMON + audio_extra + "\n" + audio_probe + "\n  R.register(CAP);\n})(window);"),
]
EDITS["ai-cap-embed.js"] = [
    ("  R.register(EMB);\n  R.register(RRK);\n})(window);",
     COMMON + "\n" + embed_probe + "\n" + rerank_probe +
     "\n  R.register(EMB);\n  R.register(RRK);\n})(window);"),
]
EDITS["ai-cap-vision.js"] = [
    ("  R.register(CAP);\n})(window);",
     COMMON + vision_extra + "\n" + vision_probe + "\n  R.register(CAP);\n})(window);"),
]
EDITS["ai-cap-translate.js"] = [
    (translate_build_anchor, translate_build_repl),
    ("  R.register(CAP);\n})(window);",
     COMMON + "\n" + translate_probe + "\n  R.register(CAP);\n})(window);"),
]
EDITS["ai-cap-video.js"] = [
    ("  R.register(CAP);\n})(window);",
     COMMON + "\n" + video_probe + "\n  R.register(CAP);\n})(window);"),
]
EDITS["ai-cap-3d.js"] = [
    ("  R.register(CAP);\n})(window);",
     COMMON + three_d_extra + "\n" + three_d_probe + "\n  R.register(CAP);\n})(window);"),
]
EDITS["ai-cap-image.js"] = [
    ("  R.register(CAP);\n})(window);",
     "  // 说明（T01/R87）：本模块【不提供 cap.probe】。\n"
     "  // 原因：ai-service.js 的健康检查已内置生图专用分支（isImageGenModel → images/generations\n"
     "  //       最小 prompt，超时 60s），cap 侧再实现一套会与它漂移，故此处刻意不重复。\n"
     "  // 若将来该分支被移除，再在此补 probe（打 images/generations 最小 prompt）。\n"
     "  R.register(CAP);\n})(window);"),
]

# ---------------- ai-config.js edits ----------------
NEW_MODELS = '''    {
      id: "ark-seedance-1-0-pro",
      name: "Doubao-Seedance-1.0-pro",
      provider: "ark",
      model: "doubao-seedance-1-0-pro-250528",
      types: ["video"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro-fast"
    },
    {
      id: "ark-seedance-1-0-pro-fast",
      name: "Doubao-Seedance-1.0-pro-fast",
      provider: "ark",
      model: "doubao-seedance-1-0-pro-fast-251015",
      types: ["video"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro"
    },
    {
      id: "ark-seedance-1-5-pro",
      name: "Doubao-Seedance-1.5-pro",
      provider: "ark",
      model: "doubao-seedance-1-5-pro-251215",
      types: ["video"],
      tag: "即将下线",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro"
    },
    {
      id: "ark-seedance-1-0-lite-t2v",
      name: "Doubao-Seedance-1.0-lite-t2v",
      provider: "ark",
      model: "doubao-seedance-1-0-lite-t2v-250428",
      types: ["video"],
      tag: "即将下线",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro"
    },
    {
      id: "ark-seedance-1-0-lite-i2v",
      name: "Doubao-Seedance-1.0-lite-i2v",
      provider: "ark",
      model: "doubao-seedance-1-0-lite-i2v-250428",
      types: ["video"],
      tag: "即将下线",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro-fast"
    },
    {
      id: "ark-seed3d-2-0",
      name: "Doubao-Seed3D-2.0",
      provider: "ark",
      model: "doubao-seed3d-2-0-260328",
      types: ["3d"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-hitem3d-2-0"
    },
    {
      id: "ark-hyper3d-gen2",
      name: "Hyper3D-Gen2",
      provider: "ark",
      model: "hyper3d-gen2-260112",
      types: ["3d"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seed3d-2-0"
    },
    {
      id: "ark-hitem3d-2-0",
      name: "Hitem3D-2.0",
      provider: "ark",
      model: "hitem3d-2-0-251223",
      types: ["3d"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seed3d-2-0"
    },
'''

MODELS_ANCHOR = ('      maxTokens: 800,\n      fallback: "ark-doubao-mini"\n    },\n'
                 '    {\n      id: "glm-4.7",')
MODELS_REPL = ('      maxTokens: 800,\n      fallback: "ark-doubao-mini"\n    },\n'
               + NEW_MODELS +
               '    {\n      id: "glm-4.7",')

NEW_DETAILS = '''    "ark-seedance-1-0-pro": { platform: "火山方舟", params: "", type: "视频生成", stars: 5, speed: "慢", advantage: "文生视频 / 图生视频；输入文字提示词（图生视频再传一张首帧图），输出 5～10 秒 MP4 视频；分钟级异步返回；单次消耗约 10 万 tokens 量级（5s/720p ≈ 103,818）；生成结果地址约 24 小时有效", applicable: "文生视频、图生视频" },
    "ark-seedance-1-0-pro-fast": { platform: "火山方舟", params: "", type: "视频生成（快速版）", stars: 4, speed: "慢", advantage: "文生视频 / 图生视频快速版；输入与输出同标准版，出片更快；分钟级异步返回；单次消耗约 10 万 tokens 量级", applicable: "文生视频、图生视频（速度优先）" },
    "ark-seedance-1-5-pro": { platform: "火山方舟", params: "", type: "视频生成（即将下线）", stars: 4, speed: "慢", advantage: "文生视频 / 图生视频；输入文字或首帧图，输出 5～10 秒 MP4；分钟级异步返回；单次消耗约 10 万 tokens 量级；该型号即将下线，新任务建议改用 Seedance-1.0-pro", applicable: "文生视频、图生视频（过渡型号）" },
    "ark-seedance-1-0-lite-t2v": { platform: "火山方舟", params: "", type: "文生视频（轻量·即将下线）", stars: 3, speed: "慢", advantage: "仅文生视频；输入文字，输出短视频；分钟级异步返回；单次消耗约 10 万 tokens 量级；该型号即将下线", applicable: "文生视频（轻量过渡型号）" },
    "ark-seedance-1-0-lite-i2v": { platform: "火山方舟", params: "", type: "图生视频（轻量·即将下线）", stars: 3, speed: "慢", advantage: "仅图生视频；输入一张图（可再配文字），输出短视频；分钟级异步返回；单次消耗约 10 万 tokens 量级；该型号即将下线", applicable: "图生视频（轻量过渡型号）" },
    "ark-seed3d-2-0": { platform: "火山方舟", params: "", type: "3D 生成", stars: 5, speed: "慢", advantage: "图生 3D；输入一张图片（可再配文字），输出 glb 模型（打包为 zip 下载）；分钟级异步返回；单次消耗约 3 万 tokens 量级；结果地址约 24 小时有效", applicable: "图生 3D 模型" },
    "ark-hyper3d-gen2": { platform: "火山方舟", params: "", type: "3D 生成", stars: 4, speed: "慢", advantage: "图生 3D；输入一张图片，输出 3D 模型文件；分钟级异步返回；单次消耗约 3 万 tokens 量级", applicable: "图生 3D 模型" },
    "ark-hitem3d-2-0": { platform: "火山方舟", params: "", type: "3D 生成", stars: 4, speed: "慢", advantage: "图生 3D；输入一张图片，输出 3D 模型文件；分钟级异步返回；单次消耗约 3 万 tokens 量级", applicable: "图生 3D 模型" }
'''

DETAIL_ANCHOR = '    "sf-bge-reranker": { platform: "硅基流动", params: "", type: "结果重排", stars: 4, speed: "快", advantage: "实测响应快，对召回结果二次精排，top1 命中率明显提升", applicable: "检索结果精排、RAG 答案排序" }\n  },'
DETAIL_REPL = ('    "sf-bge-reranker": { platform: "硅基流动", params: "", type: "结果重排", stars: 4, speed: "快", advantage: "实测响应快，对召回结果二次精排，top1 命中率明显提升", applicable: "检索结果精排、RAG 答案排序" },\n'
               + NEW_DETAILS + '\n  },')

NEW_FUNCS = '''    audio: {
      desc: "语音识别",
      primary: "sf-sensevoice",
      fallback: ["sf-asr-v32", "sf-qwen-asr"],
      temperature: 0.3,
      maxTokens: 1000
    },
    embedding: {
      desc: "向量嵌入",
      primary: "sf-bge-m3",
      fallback: ["sf-bge-zh", "sf-bge-en"],
      temperature: 0.3,
      maxTokens: 1000
    },
    rerank: {
      desc: "结果重排",
      primary: "sf-bge-reranker",
      fallback: [],
      temperature: 0.3,
      maxTokens: 1000
    },
    video: {
      desc: "视频生成",
      primary: "ark-seedance-1-0-pro",
      fallback: ["ark-seedance-1-0-pro-fast"],
      temperature: 0.7,
      maxTokens: 1000
    },
    three_d: {
      desc: "3D 生成",
      primary: "ark-seed3d-2-0",
      fallback: ["ark-hitem3d-2-0"],
      temperature: 0.7,
      maxTokens: 1000
    }
'''

FUNC_ANCHOR = ('      primary: "ark-seedream-4-0828",\n'
               '      fallback: ["ark-seedream-4-0415"],\n'
               '      temperature: 0.8,\n'
               '      maxTokens: 1000\n'
               '    }\n'
               '  }\n'
               '};')
FUNC_REPL = ('      primary: "ark-seedream-4-0828",\n'
             '      fallback: ["ark-seedream-4-0415"],\n'
             '      temperature: 0.8,\n'
             '      maxTokens: 1000\n'
             '    },\n'
             + NEW_FUNCS +
             '  }\n'
             '};')

CONFIG_EDITS = [
    (MODELS_ANCHOR, MODELS_REPL),
    (DETAIL_ANCHOR, DETAIL_REPL),
    (FUNC_ANCHOR, FUNC_REPL),
    ("内置模型 39 个", "内置模型 47 个"),
    ("内置免费模型列表（39 个", "内置免费模型列表（47 个"),
]

# ---------------- load, detect, validate ----------------
FILES = ["ai-cap-audio.js", "ai-cap-embed.js", "ai-cap-image.js", "ai-cap-vision.js",
         "ai-cap-translate.js", "ai-cap-video.js", "ai-cap-3d.js", "ai-config.js"]

state = {}
for fn in FILES:
    p = os.path.join(ASSETS, fn)
    b = read_bytes(p)
    txt = b.decode("utf-8")
    nl, crlf, lone = detect_nl(txt)
    state[fn] = {"path": p, "txt": txt, "nl": nl, "crlf": crlf, "lone": lone}
    log("[eol-before] %-22s crlf=%d loneLF=%d nl=%r" % (fn, crlf, lone, nl))
    if nl is None:
        log("!! MIXED EOL in %s" % fn)

config_txt = state["ai-config.js"]["txt"]
before_models = count_between(config_txt, "builtinModels: [", "\n  ],", r'\n    id: "')
before_funcs = count_between(config_txt, "FUNC_TYPES: {", "\n  }\n};", r"\n    [A-Za-z_][A-Za-z0-9_]*: \{")
log("[count-before] builtinModels=%d FUNC_TYPES_slots=%d" % (before_models, before_funcs))

# validate anchors (config has CRLF -> convert)
def to_nl(s, nl):
    return s.replace("\n", nl)

ALL = dict(EDITS)
ALL["ai-config.js"] = CONFIG_EDITS

fatal = []
for fn in FILES:
    nl = state[fn]["nl"] or "\n"
    txt = state[fn]["txt"]
    for idx, (a, r) in enumerate(ALL[fn]):
        aa = to_nl(a, nl)
        cnt = txt.count(aa)
        if cnt != 1:
            fatal.append("%s edit#%d anchor count=%d (%s...)" % (fn, idx, cnt, a[:50]))
if fatal:
    log("FATAL anchors:")
    for f in fatal:
        log("  " + f)
    write_bytes(REPORT, ("\n".join(lines_log)).encode("utf-8"))
    print("FATAL")
    sys.exit(2)

# ---------------- apply + backup ----------------
for fn in FILES:
    st = state[fn]
    nl = st["nl"] or "\n"
    p = st["path"]
    # backup
    write_bytes(p + BAK, read_bytes(p))
    txt = st["txt"]
    for (a, r) in ALL[fn]:
        txt = txt.replace(to_nl(a, nl), to_nl(r, nl), 1)
    write_bytes(p, txt.encode("utf-8"))
    st["after"] = txt
    log("[patched] %s (backup -> %s%s)" % (fn, fn, BAK))

# ---------------- verify ----------------
for fn in FILES:
    st = state[fn]
    b = read_bytes(st["path"])
    txt = b.decode("utf-8")
    nl, crlf, lone = detect_nl(txt)
    log("[eol-after]  %-22s crlf=%d loneLF=%d nl=%r" % (fn, crlf, lone, nl))

config_txt2 = state["ai-config.js"]["after"]
after_models = count_between(config_txt2, "builtinModels: [", "\n  ],", r'\n    id: "')
after_funcs = count_between(config_txt2, "FUNC_TYPES: {", "\n  }\n};", r"\n    [A-Za-z_][A-Za-z0-9_]*: \{")
log("[count-after]  builtinModels=%d FUNC_TYPES_slots=%d" % (after_models, after_funcs))
log("[ids-new] " + ",".join(re.findall(r'id: "(ark-(?:seedance|seed3d|hyper3d|hitem3d)[^"]+)"', config_txt2)))

write_bytes(REPORT, ("\n".join(lines_log)).encode("utf-8"))
print("DONE")
