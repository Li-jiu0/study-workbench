// ========== AI 统一调用层（callAI / AI_SERVICE） ==========
// 职责：根据 funcType 选模型与参数 -> Key 优先级 -> 流式 SSE 解析 ->
//       错误降级（429/5xx/超时）-> 限频 -> 预设优先 -> 全失败本地兜底。
// 遵循老 WebView 语法禁令：不使用可选链、空值合并、顶层 await 及正则后行断言等老内核不支持的写法。
// 不使用原生 alert/confirm/prompt（ADR-3）。
//
// 需求 D 改动说明（400 修复 + 模型降级与超时优化）：
//   1) 图片按真实字节魔数推导 MIME，绝不写死 jpeg（此前把 dataURL 再拼一次前缀 = 必然 400）；
//   2) 只有 429 / 5xx / 网络超时 才降级；400/403/404/422 直接把后端 message 抛给上层；
//   3) 15 秒未出首字即切换下一个「快」模型，慢模型仅手选时进入链路；
//   4) 单模型连续 2 次 429 -> 本次会话内跳过，并把 GLM-4.5-Flash / Qwen2.5-7B 提为首选；
//   5) 错误对象带足 status / code / apiMessage / modelName 供上层渲染；
//   6) 两处 getReader() 全部加守卫，老内核无 ReadableStream 时走整段读取兜底。

(function () {
  // ---------- 超时与降级策略常量 ----------
  // 首字超时：15 秒内没有吐出第一个 token -> 视为慢，切下一个模型
  var TIMEOUT_FIRST_TOKEN = 15000;
  // 响应头超时：15 秒内连 HTTP 响应头都没回来 -> 视为超时（等价于「所有 AI 请求超时 15 秒」）
  var TIMEOUT_RESPONSE = 15000;
  // 单次请求总时长上限：防止流式读到一半永久挂起（不截断正常长回答）
  var TIMEOUT_TOTAL = 90000;
  // 慢模型：仅用户手动选择时进入链路，自动降级链里排除
  var SLOW_MODEL_IDS = ["qwen3-8b", "qwen3.5-4b"];
  // 连续多少次 429 后，本次会话内跳过该模型
  var RATE_LIMIT_SKIP = 2;
  // 遭遇 429 后的备选首选模型（快模型）
  var RATE_LIMIT_RESCUE = ["glm-4.5-flash", "qwen2.5-7b"];
  // 不降级、直接抛给上层的 HTTP 状态（请求本身有问题，换模型没用）
  var NO_FALLBACK_STATUS = [400, 403, 404, 422];

  // 会话内（内存态）限流记账：刷新页面即清零，不落盘
  var rate429 = {};   // 模型 id -> 连续 429 次数
  var rateSkip = {};  // 模型 id -> true 表示本次会话内跳过

  // ---------- 工具函数 ----------
  function getConfig() {
    return (typeof window !== "undefined" && window.AI_CONFIG) ? window.AI_CONFIG : AI_CONFIG;
  }

  function warn() {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      try { console.warn.apply(console, arguments); } catch (e) { /* 忽略 */ }
    }
  }

  // ---------- R64：localStorage JSON 安全读取（损坏 JSON 不崩） ----------
  function readJSONKey(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return (v == null) ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // ---------- R66 N1：存量平台密钥副本清洗（幂等，仅首次读取时执行一次） ----------
  // R64 的设置页在编辑内置模型时会把 provider 默认密钥（平台密钥）回填进表单，保存时被
  // 复制进 ai_model_settings.overrides[id].apiKey -> 平台密钥被复制进 localStorage。
  // 现将「与平台密钥完全相等（严格 ===，字符串）的复制品」从 localStorage 清除。
  // 只删复制品：用户自填 Key（任何不等于平台密钥的值）与自定义模型 ai_custom_models[].apiKey
  // 一律保留。清洗全程不打印任何 Key 明文，只输出「已清理 N 条」计数。
  var _pkeyCleanupDone = false; // 内存标志位：仅首次生效，刷新页面后重来一次（幂等）

  // 取模型对应的「平台密钥」：内置模型用 provider 默认 Key；无 provider / 无 Key 返回 null
  function platformApiKeyOf(model) {
    if (!model || !model.provider) return null;
    var cfg = getConfig();
    var p = (cfg && cfg.providers) ? cfg.providers[model.provider] : null;
    if (p && typeof p.apiKey === "string" && p.apiKey) return p.apiKey;
    return null;
  }

  // 清洗 settings.overrides：删除与平台密钥严格相等的 apiKey 副本；删空后的条目一并移除。
  // 返回 true 表示确有改动（调用方据此决定是否写回，未改动则不写，避免无意义落盘）。
  function cleanPlatformKeyCopies(settings) {
    if (!settings || !settings.overrides || typeof settings.overrides !== "object") return false;
    var ov = settings.overrides;
    var removed = 0;
    var emptied = 0;
    for (var id in ov) {
      if (!Object.prototype.hasOwnProperty.call(ov, id)) continue;
      var entry = ov[id];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (typeof entry.apiKey !== "string" || !entry.apiKey) continue;
      var pk = platformApiKeyOf(findModel(id));
      if (!pk) continue;
      // 严格 === 且限定字符串：只删「与平台密钥完全相同」的复制品
      if (entry.apiKey === pk) {
        delete entry.apiKey;
        removed++;
        var hasField = false;
        for (var k in entry) {
          if (Object.prototype.hasOwnProperty.call(entry, k)) { hasField = true; break; }
        }
        if (!hasField) {
          delete ov[id]; // 该条被删成空对象 {} -> 一并移除，语义更干净
          emptied++;
        }
      }
    }
    if (removed > 0) {
      warn("[ai-service] 已清理 " + removed + " 条平台密钥副本" + (emptied ? "（其中 " + emptied + " 条空配置一并移除）" : ""));
      return true;
    }
    return false;
  }

  // ---------- R64 N4 / R66 N1：ai_model_settings 统一读写（跨线契约 C1，签名不可改） ----------
  // 注意：所有读取内部都经此函数；首次调用时顺带清洗存量平台密钥副本（先置标志位杜绝重入，
  // 清洗写回只走 aiSaveModelSettingsImpl，绝不再经本函数 -> 无递归/无死循环）。
  function aiGetModelSettingsImpl() {
    var s = readJSONKey("ai_model_settings", null);
    if (!s || typeof s !== "object") s = {};
    function pickObj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
    function pickArr(v) { return Array.isArray(v) ? v : []; }
    var out = {
      disabled: pickObj(s.disabled),
      order: pickArr(s.order),
      overrides: pickObj(s.overrides),
      catModels: pickObj(s.catModels),
      categories: pickArr(s.categories),
      health: pickObj(s.health),
      stars: pickObj(s.stars)
    };
    if (!_pkeyCleanupDone) {
      _pkeyCleanupDone = true;
      try {
        if (cleanPlatformKeyCopies(out)) aiSaveModelSettingsImpl(out);
      } catch (eClean) { /* 清洗失败绝不影响正常读取 */ }
    }
    return out;
  }

  function aiSaveModelSettingsImpl(obj) {
    try {
      localStorage.setItem("ai_model_settings", JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- R64 N1：自定义模型（localStorage ai_custom_models） ----------
  function getCustomModels() {
    var arr = readJSONKey("ai_custom_models", []);
    return Array.isArray(arr) ? arr : [];
  }

  // 自定义模型归一化为与 builtin 同形的对象（字段缺失补默认；provider 可空 = 走自带直连）
  function normalizeCustomModel(c) {
    return {
      id: c.id,
      name: (c.name != null && c.name !== "") ? c.name : String(c.id),
      provider: (c.provider != null && c.provider !== "") ? c.provider : null,
      model: (c.model != null && c.model !== "") ? c.model : String(c.id),
      types: Array.isArray(c.types) ? c.types : ["general"],
      tag: (c.tag != null && c.tag !== "") ? c.tag : "自定义",
      fallback: (c.fallback != null) ? c.fallback : null,
      needVPN: (c.needVPN === true),
      temperature: (c.temperature != null) ? c.temperature : null,
      maxTokens: (c.maxTokens != null) ? c.maxTokens : null,
      apiUrl: (c.apiUrl != null && c.apiUrl !== "") ? c.apiUrl : null,
      apiKey: (c.apiKey != null && c.apiKey !== "") ? c.apiKey : null,
      apiFormat: (c.apiFormat != null && c.apiFormat !== "") ? c.apiFormat : null,
      extraHeaders: (c.extraHeaders && typeof c.extraHeaders === "object") ? c.extraHeaders : null,
      ownTemp: (c.temperature != null),
      ownMaxT: (c.maxTokens != null)
    };
  }

  function findModel(id) {
    if (id == null) return null;
    var cfg = getConfig();
    var list = (cfg && cfg.builtinModels) ? cfg.builtinModels : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    // R64 N1：内置找不到时查自定义模型（localStorage ai_custom_models），命中返回同形对象
    var customs = getCustomModels();
    for (var j = 0; j < customs.length; j++) {
      if (customs[j] && customs[j].id === id) return normalizeCustomModel(customs[j]);
    }
    return null;
  }

  // ---------- R64 N2：overrides 合并（浅合并，手写循环，禁对象展开；不污染 AI_CONFIG 原对象） ----------
  function applyOverrides(model) {
    if (!model) return model;
    var ov = aiGetModelSettingsImpl().overrides;
    var o = (ov && model.id && ov[model.id]) ? ov[model.id] : null;
    if (!o || typeof o !== "object") return model;
    var copy = {};
    for (var k in model) {
      if (Object.prototype.hasOwnProperty.call(model, k)) copy[k] = model[k];
    }
    for (var k2 in o) {
      if (Object.prototype.hasOwnProperty.call(o, k2)) copy[k2] = o[k2];
    }
    // override 显式给出的 temperature/maxTokens 优先于 funcType 档位
    if (o.temperature != null) copy.ownTemp = true;
    if (o.maxTokens != null) copy.ownMaxT = true;
    return copy;
  }

  // ---------- R64 N3 / R65-A：选中模型与三模式读取 ----------
  function getSelectedModelId() {
    try {
      var v = localStorage.getItem("ai_selected_model");
      return (v && v !== "auto") ? v : "";
    } catch (e) {
      return "";
    }
  }

  function getModelMode() {
    try {
      var v = localStorage.getItem("ai_model_mode");
      return (typeof v === "string" && v) ? v : "";
    } catch (e) {
      return "";
    }
  }

  function isModelDisabled(settings, id) {
    return !!(settings && settings.disabled && settings.disabled[id] === true);
  }

  // R64 N2：透传模型自带直连字段（apiUrl/apiKey/apiFormat/extraHeaders）；
  // ownTemp/ownMaxT 标记「自定义模型或 override 显式给出的参数」优先于 funcType 档位。
  function cloneModel(mc, temp, maxT) {
    var ownTemp = (mc.ownTemp === true && mc.temperature != null);
    var ownMaxT = (mc.ownMaxT === true && mc.maxTokens != null);
    return {
      id: mc.id,
      name: mc.name,
      provider: mc.provider,
      model: mc.model,
      types: mc.types,
      tag: mc.tag,
      fallback: mc.fallback,
      needVPN: (mc.needVPN === true),
      apiUrl: (mc.apiUrl != null && mc.apiUrl !== "") ? mc.apiUrl : null,
      apiKey: (mc.apiKey != null && mc.apiKey !== "") ? mc.apiKey : null,
      apiFormat: (mc.apiFormat != null && mc.apiFormat !== "") ? mc.apiFormat : null,
      extraHeaders: (mc.extraHeaders && typeof mc.extraHeaders === "object") ? mc.extraHeaders : null,
      ownTemp: ownTemp,
      ownMaxT: ownMaxT,
      temperature: ownTemp ? mc.temperature : ((temp != null) ? temp : (mc.temperature != null ? mc.temperature : 0.7)),
      maxTokens: ownMaxT ? mc.maxTokens : ((maxT != null) ? maxT : (mc.maxTokens != null ? mc.maxTokens : 1000))
    };
  }

  function makeError(msg, status, code) {
    var e = new Error(msg);
    e.status = status;
    e.code = code;
    return e;
  }

  function makeTimeoutError(msg, code) {
    var e = makeError(msg, 0, code);
    e.timedOut = true;
    return e;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  // 说明：429 不再「原地等 2 秒重试同一个模型」（越限越等越慢），
  // 改为直接沿降级链切换；sleep 保留给将来的退避策略使用。

  // 在 ms 毫秒后，若 isSatisfied() 仍未返回 true（例如还没收到首字），则以超时错误 reject。
  // isSatisfied 为空表示无条件超时。promise 自然结束时会自动清掉定时器。
  function raceTimeout(promise, ms, isSatisfied, msg, code) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        if (isSatisfied && isSatisfied()) return; // 关键动作已完成 -> 不再判超时，等自然结束
        settled = true;
        reject(makeTimeoutError(msg, code));
      }, ms);
      function done(fn) {
        return function (v) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(v);
        };
      }
      promise.then(done(resolve), done(reject));
    });
  }

  function inList(list, v) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === v) return true;
    }
    return false;
  }

  // ---------- 图片 MIME 判定（需求 D-1：修 400 的根因） ----------
  // 上游 ai-page.js 的 handleFile 用 FileReader.readAsDataURL()，传进来的是**完整 dataURL**
  // （形如 data:image/png;base64,xxxx）。旧代码再拼一次 "data:image/jpeg;base64," 前缀，
  // 结果变成 data:image/jpeg;base64,data:image/png;base64,xxxx —— 视觉模型必然 400。
  // 这里统一归一化：已带 data: 前缀的按真实类型校正；纯 base64 的按魔数补 MIME。
  var BASE64_MAGIC = [
    { prefix: "iVBO", mime: "image/png" },   // 89 50 4E 47
    { prefix: "/9j/", mime: "image/jpeg" },  // FF D8 FF
    { prefix: "R0lGOD", mime: "image/gif" }, // 47 49 46 38 39/37 61
    { prefix: "UklGR", mime: "image/webp" }, // 52 49 46 46 (RIFF)
    { prefix: "Qk0", mime: "image/bmp" }     // 42 4D
  ];

  function decodeBase64Head(b64, chars) {
    if (typeof atob !== "function") return "";
    try { return atob(String(b64).slice(0, chars)); } catch (e) { return ""; }
  }

  // 按魔数判定真实图片类型；判定不了返回空串（由调用方决定兜底）
  function detectImageMime(b64) {
    var s = String(b64 == null ? "" : b64).replace(/[\s\r\n]+/g, "");
    if (!s) return "";
    // 16 个 base64 字符 = 12 字节，够覆盖 WEBP 的 RIFF(0-3) + WEBP(8-11) 双标记
    var bin = decodeBase64Head(s, 16);
    if (bin.length >= 2 && bin.charCodeAt(0) === 0xFF && bin.charCodeAt(1) === 0xD8) return "image/jpeg";
    if (bin.length >= 4 && bin.charCodeAt(0) === 0x89 && bin.charCodeAt(1) === 0x50 &&
        bin.charCodeAt(2) === 0x4E && bin.charCodeAt(3) === 0x47) return "image/png";
    if (bin.length >= 12 && bin.slice(0, 4).indexOf("RIFF") === 0 && bin.slice(8, 12).indexOf("WEBP") === 0) return "image/webp";
    if (bin.length >= 4 && bin.slice(0, 4).indexOf("GIF8") === 0) return "image/gif";
    if (bin.length >= 2 && bin.slice(0, 2).indexOf("BM") === 0) return "image/bmp";
    // atob 不可用时的字符串前缀兜底
    for (var i = 0; i < BASE64_MAGIC.length; i++) {
      if (s.indexOf(BASE64_MAGIC[i].prefix) === 0) return BASE64_MAGIC[i].mime;
    }
    return "";
  }

  // 把「完整 dataURL」或「纯 base64」统一成可直接塞进 image_url.url 的 dataURL。
  // 真实魔数与声明 MIME 冲突时，以魔数为准（很多 400 就是声明 jpeg、字节是 png）。
  function normalizeImageUrl(image) {
    var raw = String(image == null ? "" : image).replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (!raw) return "";
    var lower = raw.toLowerCase();
    if (lower.indexOf("http://") === 0 || lower.indexOf("https://") === 0) return raw;

    var payload = "";
    var declared = "";
    if (lower.indexOf("data:") === 0) {
      var comma = raw.indexOf(",");
      if (comma === -1) return "";
      var meta = raw.slice(5, comma);
      payload = raw.slice(comma + 1);
      if (meta.toLowerCase().indexOf("base64") === -1) return ""; // 只支持 base64 dataURL
      var semi = meta.indexOf(";");
      declared = (semi === -1 ? meta : meta.slice(0, semi)).toLowerCase();
      if (declared.indexOf("image/") !== 0) declared = "";
    } else {
      payload = raw;
    }

    payload = payload.replace(/[\s\r\n]+/g, "");
    if (!payload) return "";

    var real = detectImageMime(payload);
    if (!real) real = (declared && declared.indexOf("image/") === 0) ? declared : "image/jpeg";
    if (declared && declared !== real) {
      warn("[ai-service] 图片声明类型 " + declared + " 与真实类型 " + real + " 不一致，已按真实类型修正");
    }
    return "data:" + real + ";base64," + payload;
  }

  // ---------- 消息规范化与组装 ----------
  function normalizeMessages(messages) {
    var msgs;
    if (typeof messages === "string") {
      msgs = [{ role: "user", content: messages }];
    } else if (Array.isArray(messages)) {
      msgs = messages.map(function (m) {
        return { role: m.role, content: m.content };
      });
    } else {
      msgs = [];
    }
    return msgs;
  }

  // imageUrl 必须是 normalizeImageUrl 处理过的完整 dataURL（或 http 图片地址）
  function buildMessages(msgs, imageUrl, systemPrompt) {
    var out = [];
    if (systemPrompt) out.push({ role: "system", content: systemPrompt });

    var lastUserIdx = -1;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].role === "user") lastUserIdx = i;
    }

    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      if (imageUrl && j === lastUserIdx && m.role === "user") {
        var text = (typeof m.content === "string") ? m.content : "";
        out.push({
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: text }
          ]
        });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }

    // 没有 user 消息但带了图，补一条
    if (imageUrl && lastUserIdx === -1) {
      out.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "" }
        ]
      });
    }
    return out;
  }

  // ---------- R65-B：MAX 模式深度教学提示 ----------
  var MAX_SYSTEM_PROMPT = "你是深度教学助手。回答前先自己逐步推理一遍，再给出完整解答。数学、逻辑、批改类问题必须一步步推导，展示完整解题过程，不能只给答案。讲解要透彻：涵盖知识点、解题思路、易错点，并给举一反三的例子。允许写长回答，不要为节省字数而截断。";

  // MAX 提示置于 messages 最前（若首条已是 system，则插到它前面，两条 system 并存、不合并字符串）。
  // Gemini 路径无需特判：collectGeminiText 按序把全部 system 文本并入整段，R63 行为保持不变。
  function withMaxSystem(messages) {
    var out = [{ role: "system", content: MAX_SYSTEM_PROMPT }];
    for (var i = 0; i < messages.length; i++) out.push(messages[i]);
    return out;
  }

  // 调试用：请求体里是否带图（不打 base64 正文，避免刷屏）
  function hasImageContent(messages) {
    for (var i = 0; i < messages.length; i++) {
      var c = (messages[i] && messages[i].content) ? messages[i].content : null;
      if (Array.isArray(c)) {
        for (var j = 0; j < c.length; j++) {
          if (c[j] && c[j].type === "image_url") return true;
        }
      }
    }
    return false;
  }

  function messageShape(messages) {
    var out = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i] ? messages[i] : {};
      var kind = Array.isArray(m.content) ? "multipart" : "text";
      var len = (typeof m.content === "string") ? m.content.length : (Array.isArray(m.content) ? m.content.length : 0);
      out.push(String(m.role) + ":" + kind + ":" + len);
    }
    return out.join(" | ");
  }

  // ---------- 服务层兜底自动路由 ----------
  // 业务方未显式指定 funcType（或传 auto/general）时，这里按关键词/图片自己判定，
  // 让 AI 伙伴、悬浮助手等未做预判的调用方也能享受「按问题类型自动选最优模型」。
  function resolveFuncType(funcType, msgs, hasImage) {
    var cfg = getConfig();
    if (hasImage) return "vision";
    if (funcType && funcType !== "auto" && funcType !== "general" && cfg.FUNC_TYPES[funcType]) return funcType;
    // 未注册的 funcType（非空字符串且不在 FUNC_TYPES）：留痕并回退 general，避免静默穿透到关键词猜测
    if (typeof funcType === "string" && funcType && funcType !== "auto" && funcType !== "general") {
      // R64 N3：未注册 funcType 先查 catModels（设置页自定义分类），配置了模型链则直接用（不 warn）
      var catCfg = null;
      try {
        var st = aiGetModelSettingsImpl();
        catCfg = (st.catModels && Array.isArray(st.catModels[funcType]) && st.catModels[funcType].length) ? st.catModels[funcType] : null;
      } catch (eCat) { catCfg = null; }
      if (catCfg) return funcType;
      warn("[ai-service] 未注册的 funcType，已回退 general:", funcType);
      return "general";
    }
    if (funcType === "auto" || funcType == null || funcType === "general") {
      var text = "";
      for (var i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i] && msgs[i].role === "user" && typeof msgs[i].content === "string") {
          text = msgs[i].content;
          break;
        }
      }
      if (text) {
        var low = text.toLowerCase();
        var mk = cfg.mathKeywords || [];
        for (var a = 0; a < mk.length; a++) {
          if (low.indexOf(String(mk[a]).toLowerCase()) !== -1) return "reasoning";
        }
        var tk = cfg.translateKeywords || [];
        for (var b = 0; b < tk.length; b++) {
          if (low.indexOf(String(tk[b]).toLowerCase()) !== -1) return "translate";
        }
      }
    }
    return "general";
  }

  // ---------- 降级链构建 ----------
  // R64 N3：catModels（设置页「功能分类」配置的优先级链）优先于 FUNC_TYPES 默认链；
  // R65-A：ai_model_mode 三模式链（快速/均衡/极致）最优先，当前模式链失败自动接后续模式链与 general 默认链。
  var MODE_ORDER = ["fast", "balanced", "ultimate"];

  function buildChain(funcType, opts) {
    var cfg = getConfig();
    var settings = aiGetModelSettingsImpl();
    var opt = opts || {};
    var manual = (opt.model && opt.model !== "auto") ? opt.model : "";
    var selected = manual ? manual : getSelectedModelId();
    var ftKnown = !!(cfg.FUNC_TYPES && cfg.FUNC_TYPES[funcType]);
    var ft = ftKnown ? cfg.FUNC_TYPES[funcType] : cfg.FUNC_TYPES.general;
    var sub = (opts && opts.subType && ft.variants && ft.variants[opts.subType]) ? ft.variants[opts.subType] : null;
    var temp = sub ? sub.temperature : ft.temperature;
    var maxT = sub ? sub.maxTokens : ft.maxTokens;

    // MAX 模式：放大输出上限（取配置档位与 funcType 上限的较大者）
    if (opts && opts.max) {
      var mm = cfg.maxMode;
      var cap = (mm && mm.maxTokens) ? mm.maxTokens : 8000;
      if (cap < 8000) cap = 8000; // R65-B：MAX 输出上限下限提至 8000（配置更大时以配置为准）
      if (maxT == null) maxT = cap;
      else if (maxT < cap) maxT = cap;
      if (mm && mm.temperatureDelta != null && temp != null) {
        temp = Math.max(0, Math.min(1, temp + mm.temperatureDelta));
      }
    }

    // ----- R65-A：三模式链判定 -----
    // 深度思考（reasoning）不走模式；vision 需图片模型、模式链为文本编排，同样不走（保守处理，见交付说明）
    var mode = getModelMode();
    var viaMode = false;
    if (mode && funcType !== "reasoning" && funcType !== "vision" &&
        cfg.modelModes && cfg.modelModes[mode] &&
        Array.isArray(cfg.modelModes[mode].chain) && cfg.modelModes[mode].chain.length) {
      viaMode = true;
    }

    var ids = [];
    var viaCat = false;

    if (viaMode) {
      // 模式自动降级：当前模式链 + 其后模式链（fast→balanced→ultimate）+ general 默认链，
      // 一次拼成完整降级序列，逐模型尝试的现有机制自然覆盖「全挂降级」。
      var startIdx = -1;
      for (var oi = 0; oi < MODE_ORDER.length; oi++) {
        if (MODE_ORDER[oi] === mode) { startIdx = oi; break; }
      }
      if (startIdx === -1) startIdx = 0;
      for (var mi = startIdx; mi < MODE_ORDER.length; mi++) {
        var mdef = cfg.modelModes[MODE_ORDER[mi]];
        if (mdef && Array.isArray(mdef.chain)) {
          for (var mj = 0; mj < mdef.chain.length; mj++) ids.push(mdef.chain[mj]);
        }
      }
      var gft = (cfg.FUNC_TYPES && cfg.FUNC_TYPES.general) ? cfg.FUNC_TYPES.general : ft;
      if (gft && gft.primary) ids.push(gft.primary);
      if (gft && gft.fallback && gft.fallback.length) {
        for (var gi = 0; gi < gft.fallback.length; gi++) ids.push(gft.fallback[gi]);
      }
      // mode 优先：不把手动选中模型置链首（选中模型若在链中则按序自然使用）
    } else {
      // ----- N3：catModels（设置页「功能分类」Tab 配置的优先级链）优先于 FUNC_TYPES 默认链 -----
      var catList = null;
      if (settings.catModels && Array.isArray(settings.catModels[funcType]) && settings.catModels[funcType].length) {
        catList = settings.catModels[funcType];
      }
      if (catList) {
        viaCat = true;
        for (var ci = 0; ci < catList.length; ci++) ids.push(catList[ci]);
      } else {
        if (!ftKnown) {
          // 未注册 funcType 且无 catModels -> 回退 general 链并留痕（不经 resolveFuncType 直接调 buildChain 的路径）
          warn("[ai-service] 未注册的 funcType，已回退 general:", funcType);
        }
        if (ft.primary) ids.push(ft.primary);
        if (ft.fallback && ft.fallback.length) {
          for (var fi = 0; fi < ft.fallback.length; fi++) ids.push(ft.fallback[fi]);
        }
      }
      // 手动选中模型置为链首：opts.model 优先，其次 localStorage ai_selected_model；
      // 被禁用或找不到时按未选中处理（N3）。
      var headId = "";
      if (manual) {
        headId = manual;
      } else if (selected) {
        // 全局选中：vision 链需图片模型，纯文本模型不置首（避免拍题被路由到文本模型）
        var selMc = findModel(selected);
        var selTypes = (selMc && Array.isArray(selMc.types)) ? selMc.types : [];
        if (funcType !== "vision" || inList(selTypes, "image")) headId = selected;
      }
      if (headId && !isModelDisabled(settings, headId) && findModel(headId)) {
        var headIds = [headId];
        for (var hi = 0; hi < ids.length; hi++) {
          if (ids[hi] !== headId) headIds.push(ids[hi]);
        }
        ids = headIds;
      }
    }
    // 说明（方案A · needVPN）：手动选中的模型（含 needVPN 模型）仅「置为链首」，
    // 其后的常规 fallback（含国内模型）全部保留 —— 保证自备网络不通时仍能自动降级。
    // 注意：needVPN 模型不进入 FUNC_TYPES 的 primary/fallback（配置侧约束），此处不做任何过滤。

    var chain = [];
    var seen = {};
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      if (!id || seen[id]) continue;
      seen[id] = true;
      // N3：被禁用的模型不进链（含手动选中，置首处已判，此处兜底）
      if (isModelDisabled(settings, id)) continue;
      // 需求 D-3：慢模型只在用户手动选择时进入链路（catModels / 模式链为用户或配置显式编排，不剔除）
      if (!viaCat && !viaMode && inList(SLOW_MODEL_IDS, id) && id !== manual && id !== selected) continue;
      var mc = applyOverrides(findModel(id));
      if (!mc) continue;
      chain.push(cloneModel(mc, temp, maxT));
    }
    return chain;
  }

  // 多模态强制 vision 路线
  function buildVisionChain(opts) {
    return buildChain("vision", opts);
  }

  // 遭遇 429 时把备选快模型插到下一个待试位置（需求 D-4）
  function injectRescue(chain, at, from) {
    var temp = from ? from.temperature : null;
    var maxT = from ? from.maxTokens : null;
    for (var i = 0; i < RATE_LIMIT_RESCUE.length; i++) {
      var id = RATE_LIMIT_RESCUE[i];
      var exists = false;
      for (var j = 0; j < chain.length; j++) {
        if (chain[j] && chain[j].id === id) { exists = true; break; }
      }
      if (exists) continue;
      var mc = findModel(id);
      if (!mc) continue;
      var pos = at < chain.length ? at : chain.length;
      chain.splice(pos, 0, cloneModel(mc, temp, maxT));
      at = pos + 1;
    }
  }

  function resetModelSkip() {
    rate429 = {};
    rateSkip = {};
  }

  // ---------- 预设匹配 ----------
  function presetMatch(text) {
    if (typeof window !== "undefined" && typeof window.getPresetAnswer === "function") {
      return window.getPresetAnswer(text);
    }
    if (window.AI_PRESETS && typeof window.AI_PRESETS.getPresetAnswer === "function") {
      return window.AI_PRESETS.getPresetAnswer(text);
    }
    return null;
  }

  function genericFallback() {
    if (window.AI_PRESETS && window.AI_PRESETS.fallback) return window.AI_PRESETS.fallback;
    return "网络不佳，以下为本地参考。";
  }

  // ---------- 限频 ----------
  function getRateCalls() {
    try {
      var raw = localStorage.getItem("ai_rate_calls");
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function checkRateLimit() {
    var cfg = getConfig();
    var max = cfg.rateLimit.maxCalls;
    var per = cfg.rateLimit.perSeconds * 1000;
    var now = Date.now();
    var arr = getRateCalls().filter(function (t) { return now - t < per; });
    return arr.length < max;
  }

  function recordCall() {
    var cfg = getConfig();
    var per = cfg.rateLimit.perSeconds * 1000;
    var now = Date.now();
    var arr = getRateCalls().filter(function (t) { return now - t < per; });
    arr.push(now);
    try { localStorage.setItem("ai_rate_calls", JSON.stringify(arr)); } catch (e) {}
  }

  // ---------- Key 失效提醒 ----------
  function notifyKeyInvalid(provider, opts, notified) {
    try { localStorage.setItem("ai_key_invalid_" + provider, "1"); } catch (e) {}
    if (notified[provider]) return;
    notified[provider] = true;
    if (opts && typeof opts.onKeyInvalid === "function") opts.onKeyInvalid(provider);
  }

  // ---------- 服务端中转（主通道） ----------
  // 为什么优先走后端 /api/ai/chat：网页/APK 从浏览器直连模型平台会被 CORS 拦截
  // （页面是 http://110.42.134.62，直接 fetch open.bigmodel.cn 属跨域），
  // 服务端中转不存在跨域问题，密钥也只在服务端 .env，更安全。
  function relayBase() {
    if (typeof window === "undefined") return "";
    // config.js 定义：web 同源返回 ''，APK(file:) 返回 http://110.42.134.62:8000
    return (window.STUDY_API_BASE != null) ? window.STUDY_API_BASE : "";
  }

  function relayToken() {
    try { return localStorage.getItem("study_workbench_token") || ""; } catch (e) { return ""; }
  }

  // 尝试续签 access 令牌（api.js 的 apiTryRefresh），成功返回 true
  function refreshAccess() {
    try {
      if (typeof window !== "undefined" && typeof window.apiTryRefresh === "function") {
        var r = window.apiTryRefresh();
        if (r && typeof r.then === "function") {
          return r.then(function () { return true; }, function () { return false; });
        }
        return r ? true : false;
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  var _relayProviders = null; // 内存缓存：[{id,name}]
  // 游客也允许中转：服务端 /api/ai/models 已支持可选登录，只按每 IP 限流
  async function relayProviders() {
    if (_relayProviders) return _relayProviders;
    var list = [];
    try {
      var hdrs = {};
      var token = relayToken();
      if (token) hdrs["Authorization"] = "Bearer " + token;
      var resp = await raceTimeout(
        fetch(relayBase() + "/api/ai/models", { headers: hdrs }),
        TIMEOUT_RESPONSE, null, "服务端模型列表超时", "TIMEOUT_RELAY"
      );
      // 令牌过期：续签后重试一次；仍失败则「不缓存空结果」，下次调用还会再试
      if (resp.status === 401) {
        var ok = await refreshAccess();
        if (ok) {
          var t2 = relayToken();
          var h2 = t2 ? { "Authorization": "Bearer " + t2 } : {};
          resp = await fetch(relayBase() + "/api/ai/models", { headers: h2 });
        }
      }
      if (resp.ok) {
        var d = await resp.json();
        var models = (d && d.models) ? d.models : [];
        for (var i = 0; i < models.length; i++) {
          list.push({ id: models[i].id, name: models[i].name });
        }
        _relayProviders = list; // 只有拿到结果才缓存
      } else if (resp.status !== 401) {
        _relayProviders = []; // 非鉴权类失败（如服务不可用）才短期缓存空结果
      }
    } catch (e) {
      /* 网络异常不缓存，下次再试 */
    }
    return list.length ? list : (_relayProviders || []);
  }

  // 本地分段吐出（补齐打字机观感）：每段 ~10 字，间隔 ~18ms
  function simulateTyping(full, onChunk) {
    return new Promise(function (resolve) {
      var i = 0;
      var step = 10;
      function tick() {
        if (i >= full.length) { resolve(); return; }
        var next = Math.min(full.length, i + step);
        var piece = full.slice(i, next);
        i = next;
        try { onChunk(piece, full.slice(0, i)); } catch (e) { /* 忽略 */ }
        setTimeout(tick, 18);
      }
      setTimeout(tick, 0);
    });
  }

  // ---------- 流式守卫（需求 D-6） ----------
  // 老 WebView（Chrome 50~58）没有 ReadableStream / body.getReader()，
  // 直接调用 resp.body.getReader() 会抛 TypeError 导致整条链路挂掉。
  function canStreamRead(resp) {
    return !!(resp && resp.body && typeof resp.body.getReader === "function" && typeof TextDecoder === "function");
  }

  function readResponseText(resp) {
    if (resp && typeof resp.text === "function") return resp.text();
    return Promise.reject(makeError("当前环境不支持读取响应内容", 0, "NO_BODY_READER"));
  }

  // 解析一行 SSE，返回 { content, reasoning }；遇到流内 error 直接抛（1305 走降级）
  // reasoning：推理型模型的思维链增量（reasoning_content / reasoning），content 为空时用于兜底。
  function consumeLine(line) {
    line = String(line == null ? "" : line).replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (line.indexOf("data:") !== 0) return { content: "", reasoning: "" };
    var data = line.slice(5).replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (!data || data === "[DONE]") return { content: "", reasoning: "" };
    var obj = null;
    try { obj = JSON.parse(data); } catch (e) { return { content: "", reasoning: "" }; }
    if (obj && obj.error) {
      var c = obj.error.code ? obj.error.code : null;
      var m2 = obj.error.message ? obj.error.message : "stream error";
      throw makeError("API流式错误:" + c + " " + m2, (c === 1305 ? 200 : 0), c);
    }
    var choices = obj ? obj.choices : null;
    if (!choices || !choices.length) return { content: "", reasoning: "" };
    var delta = choices[0].delta;
    var content = (delta && delta.content) ? String(delta.content) : "";
    var reasoning = "";
    if (delta) {
      if (delta.reasoning_content != null) reasoning = String(delta.reasoning_content);
      else if (delta.reasoning != null) reasoning = String(delta.reasoning);
    }
    return { content: content, reasoning: reasoning };
  }

  // 流式读取 SSE（仅在 canStreamRead 为真时调用）。返回 { text, reasoning }：
  // text = content 累积；reasoning = 思维链累积（content 全程为空时由 requestModel 兜底使用）。
  // markActivity：可选；收到思维链增量时回调，用于重置「未出首字」超时判定（避免慢推理被误判为超时）。
  async function readSSEStream(resp, emit, markActivity) {
    var reader = resp.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var buffer = "";
    var full = "";
    var reasoning = "";
    function handleLine(line) {
      var pr = consumeLine(line);
      if (pr.reasoning) {
        reasoning += pr.reasoning;
        if (markActivity) markActivity();
      }
      if (pr.content) {
        full += pr.content;
        if (emit) emit(pr.content, full);
      }
    }
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buffer += decoder.decode(r.value, { stream: true });
      var nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        var line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buffer.length) handleLine(buffer);
    return { text: full, reasoning: reasoning };
  }

  // 非流式兜底：整段文本里抽内容。兼容 SSE 文本、纯 JSON、以及被网关折叠成 JSON 的情况。
  // content 为空（null/""/非字符串）时按序回退 reasoning_content -> reasoning（推理型模型兜底）。
  function extractContent(text, emit) {
    var s = String(text == null ? "" : text);
    if (s.indexOf("data:") !== -1) {
      var lines = s.split("\n");
      var full = "";
      var sseReasoning = "";
      for (var i = 0; i < lines.length; i++) {
        var pr = consumeLine(lines[i]);
        if (pr.reasoning) sseReasoning += pr.reasoning;
        if (pr.content) {
          full += pr.content;
          if (emit) emit(pr.content, full);
        }
      }
      return full ? full : sseReasoning;
    }
    var t = s.replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (t.charAt(0) === "{") {
      var obj = null;
      try { obj = JSON.parse(t); } catch (e) { obj = null; }
      if (obj) {
        if (obj.error) {
          var c = obj.error.code ? obj.error.code : null;
          var m2 = obj.error.message ? obj.error.message : "API error";
          throw makeError("API错误:" + m2, 0, c);
        }
        var ch = obj.choices;
        var content = "";
        if (ch && ch.length) {
          var c0 = ch[0];
          var rawContent = null;
          if (c0 && c0.message && c0.message.content != null) rawContent = c0.message.content;
          else if (c0 && c0.delta && c0.delta.content != null) rawContent = c0.delta.content;
          else if (c0 && c0.text != null) rawContent = c0.text;
          if (typeof rawContent === "string") content = rawContent;
          if (!content && c0 && c0.message) {
            if (typeof c0.message.reasoning_content === "string" && c0.message.reasoning_content) content = c0.message.reasoning_content;
            else if (typeof c0.message.reasoning === "string" && c0.message.reasoning) content = c0.message.reasoning;
          }
        }
        // Gemini 非 OpenAI 兼容：choices 取不到时兜底解析 candidates[0].content.parts[].text（按序拼接）
        if (!content) {
          var cands = obj.candidates;
          if (cands && cands.length) {
            var cg0 = cands[0];
            var cparts = (cg0 && cg0.content && cg0.content.parts) ? cg0.content.parts : null;
            if (cparts && cparts.length) {
              var gtext = "";
              for (var gi = 0; gi < cparts.length; gi++) {
                var gp = cparts[gi];
                if (gp && typeof gp.text === "string") gtext += gp.text;
              }
              content = gtext;
            }
            if (!content && cg0 && typeof cg0.text === "string") content = cg0.text;
            if (!content && cg0 && cg0.finishReason) {
              // 不在此抛错：交给 requestModel 走原有 EMPTY 逻辑；这里只留痕，避免静默
              warn("[ai-service] Gemini 未返回文本", {
                finishReason: cg0.finishReason,
                blockReason: (obj.promptFeedback && obj.promptFeedback.blockReason) || null
              });
            }
          }
        }
        if (content) {
          if (emit) emit(content, content);
          return content;
        }
      }
    }
    return "";
  }

  // 逐个 provider 尝试服务端中转，流式回调，返回完整文本；全失败抛错
  async function relayChat(providers, messages, temperature, maxTokens, onChunk, options) {
    var opt = options || {};
    var firstTokenMs = (opt.firstTokenTimeout != null) ? opt.firstTokenTimeout : TIMEOUT_FIRST_TOKEN;
    var totalMs = (opt.totalTimeout != null) ? opt.totalTimeout : TIMEOUT_TOTAL;
    var respMs = (opt.responseTimeout != null) ? opt.responseTimeout : TIMEOUT_RESPONSE;
    var lastErr = null;
    for (var i = 0; i < providers.length; i++) {
      var p = providers[i];
      for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var token = relayToken();
        var headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        var resp = await raceTimeout(
          fetch(relayBase() + "/api/ai/chat", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
              provider: p.id,
              messages: messages,
              temperature: temperature,
              maxTokens: maxTokens
            })
          }),
          respMs, null, "服务端中转超时（" + respMs + "ms 未响应）", "TIMEOUT_RELAY"
        );
        // 令牌过期：续签后重试一次（attempt 0 → 1）
        if (resp.status === 401 && attempt === 0) {
          var refreshed = await refreshAccess();
          if (refreshed) continue;
        }
        if (!resp.ok) {
          var errText = "";
          try { errText = await readResponseText(resp); } catch (e2) {}
          lastErr = makeError("中转HTTP " + resp.status + " " + (errText || "").slice(0, 120), resp.status, null);
          break;
        }
        // 服务端返回 text/plain 纯文本流（每段为增量文本，非 SSE）
        var firstChunkAt = 0;
        var emit = function (piece, full) {
          if (!firstChunkAt) firstChunkAt = Date.now();
          if (onChunk) onChunk(piece, full);
        };
        var readP = readRelayBody(resp, emit);
        readP = raceTimeout(readP, firstTokenMs, function () { return firstChunkAt > 0; },
          "服务端中转响应较慢（" + firstTokenMs + "ms 未出首字）", "TIMEOUT_FIRST_TOKEN");
        readP = raceTimeout(readP, totalMs, null, "服务端中转响应超时", "TIMEOUT_TOTAL");
        var rr = await readP;
        var full = rr.text;
        var chunkCount = rr.count;
        if (full) {
          // 服务端可能把整段一次返回（实测常见），这里补一层本地分段，
          // 让页面的打字机效果不至于退化成「整段弹出」。失败不影响已有文本。
          if (onChunk && chunkCount <= 1 && full.length > 24) {
            try {
              await simulateTyping(full, onChunk);
            } catch (e3) { /* 忽略 */ }
          }
          return { text: full, providerId: p.id, providerName: p.name };
        }
        lastErr = makeError("中转空回复", 0, "EMPTY");
      } catch (e) {
        lastErr = e;
        // 超时不重试同一个 provider（越等越久），直接换下一个
        if (e && e.timedOut) break;
      }
      } /* end attempt loop */
    } /* end provider loop */
    throw lastErr || makeError("服务端中转全部失败", 0, null);
  }

  // 中转响应体读取：有 getReader 走流式，没有则整段读取（老内核兜底）
  async function readRelayBody(resp, emit) {
    if (canStreamRead(resp)) {
      var reader = resp.body.getReader();
      var decoder = new TextDecoder("utf-8");
      var full = "";
      var count = 0;
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        var piece = decoder.decode(r.value, { stream: true });
        if (piece) {
          full += piece;
          count++;
          emit(piece, full);
        }
      }
      return { text: full, count: count };
    }
    var whole = await readResponseText(resp);
    var text = String(whole == null ? "" : whole);
    if (text && emit) emit(text, text);
    return { text: text, count: text ? 1 : 0 };
  }

  // Gemini 非 OpenAI 兼容：把 messages 里的文本按顺序拼成整段（system 与 user 都含），
  // 用 "\n\n" 连接，忽略非文本内容（本期 Gemini 不支持图片，多模态在调用前已拦截）。
  function collectGeminiText(messages) {
    var parts = [];
    for (var i = 0; i < messages.length; i++) {
      var c = (messages[i] && messages[i].content != null) ? messages[i].content : "";
      if (typeof c === "string") {
        if (c) parts.push(c);
      } else if (Array.isArray(c)) {
        for (var j = 0; j < c.length; j++) {
          var seg = c[j];
          if (seg && seg.type === "text" && typeof seg.text === "string" && seg.text) parts.push(seg.text);
        }
      }
    }
    return parts.join("\n\n");
  }

  // ---------- 核心请求 ----------
  async function requestModel(modelConfig, messages, onChunk, signal, options) {
    var cfg = getConfig();
    // ----- R64 N2：模型自带直连配置（自定义模型 / overrides）优先于 provider 默认 -----
    var provider = (modelConfig.provider && cfg.providers) ? cfg.providers[modelConfig.provider] : null;
    var selfUrl = (typeof modelConfig.apiUrl === "string" && modelConfig.apiUrl) ? modelConfig.apiUrl : null;
    var selfKey = (typeof modelConfig.apiKey === "string" && modelConfig.apiKey) ? modelConfig.apiKey : null;
    var selfFmt = (typeof modelConfig.apiFormat === "string" && modelConfig.apiFormat) ? modelConfig.apiFormat : null;
    var selfHdrs = (modelConfig.extraHeaders && typeof modelConfig.extraHeaders === "object") ? modelConfig.extraHeaders : null;
    // 有自带 apiUrl+apiKey 时无 provider 也要能发；两者皆无才视为未知平台
    if (!provider && !(selfUrl && selfKey)) {
      throw makeError("未知平台且模型未自带 apiUrl/apiKey:" + modelConfig.provider, 0, null);
    }

    var opt = options || {};
    var firstTokenMs = (opt.firstTokenTimeout != null) ? opt.firstTokenTimeout : TIMEOUT_FIRST_TOKEN;
    var totalMs = (opt.totalTimeout != null) ? opt.totalTimeout : TIMEOUT_TOTAL;
    var respMs = (opt.responseTimeout != null) ? opt.responseTimeout : TIMEOUT_RESPONSE;

    var userKey = null;
    if (modelConfig.provider) {
      try { userKey = localStorage.getItem("ai_user_key_" + modelConfig.provider); } catch (e) {}
    }
    // Key 优先级：模型自带（自定义/override）> 用户自填 > provider 默认；端点同理
    var apiKey = selfKey ? selfKey : (userKey ? userKey : (provider ? provider.apiKey : null));
    var apiUrlBase = selfUrl ? selfUrl : (provider ? provider.apiUrl : null);
    // apiFormat：'openai'（默认，OpenAI 兼容）| 'gemini'（R63 contents-parts + keyInQuery）| 'custom'（按 OpenAI 兼容发，仅端点与 extraHeaders 自定义）
    var apiFormat = selfFmt ? selfFmt : ((provider && provider.apiFormat) ? provider.apiFormat : "openai");
    var isGemini = (apiFormat === "gemini");
    if (!apiKey) {
      throw makeError("缺少 API Key（模型与平台均未配置）:" + modelConfig.id, 0, "NO_KEY");
    }

    var hasImg = hasImageContent(messages);

    // Gemini keyInQuery：provider 声明走 ?key=；自带端点的 Gemini 默认也走 ?key=（可用 keyInQuery:false 关闭）
    var keyInQuery = false;
    if (isGemini) {
      if (selfUrl || !provider) {
        keyInQuery = (modelConfig.keyInQuery != null) ? (modelConfig.keyInQuery === true) : true;
      } else {
        keyInQuery = (provider.keyInQuery === true);
      }
    }

    // URL：Gemini 需把 {model} 占位替换为真实模型名；keyInQuery 时 Key 走 ?key=（不发 Authorization）
    var reqUrl = apiUrlBase;
    if (isGemini) {
      reqUrl = String(apiUrlBase).replace("{model}", modelConfig.model);
      if (keyInQuery) reqUrl += "?key=" + encodeURIComponent(apiKey);
    }

    var tempVal = modelConfig.temperature != null ? modelConfig.temperature : 0.7;
    var maxTokVal = modelConfig.maxTokens != null ? modelConfig.maxTokens : 1000;

    var body;
    if (isGemini) {
      // Gemini 非 OpenAI 兼容：contents/parts，且无 SSE（走 generateContent）
      body = {
        contents: [
          { role: "user", parts: [ { text: collectGeminiText(messages) } ] }
        ],
        generationConfig: {
          temperature: tempVal,
          maxOutputTokens: maxTokVal
        }
      };
    } else {
      body = {
        model: modelConfig.model,
        messages: messages,
        temperature: tempVal,
        max_tokens: maxTokVal,
        stream: true
      };
    }

    // Gemini 不发 Authorization（Key 已在 URL query），其余平台照旧
    var headers = { "Content-Type": "application/json" };
    if (!isGemini) headers["Authorization"] = "Bearer " + apiKey;
    // 自定义请求头：provider 级 + 模型级（模型级优先），逐键合并进请求头
    var extraSrc = [];
    if (provider && provider.extraHeaders) extraSrc.push(provider.extraHeaders);
    if (selfHdrs) extraSrc.push(selfHdrs);
    for (var es = 0; es < extraSrc.length; es++) {
      var eh = extraSrc[es];
      for (var hk in eh) {
        if (Object.prototype.hasOwnProperty.call(eh, hk)) {
          headers[hk] = eh[hk];
        }
      }
    }

    var fetchOpts = {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    };
    if (signal) fetchOpts.signal = signal;

    // 失败时打点的请求体关键信息（不含图片 base64 正文，只含形态）
    var debugInfo = {
      modelId: modelConfig.id,
      modelName: modelConfig.name,
      model: modelConfig.model,
      provider: modelConfig.provider,
      apiFormat: apiFormat,
      apiUrl: apiUrlBase,
      temperature: tempVal,
      max_tokens: maxTokVal,
      stream: isGemini ? false : true,
      messageCount: messages.length,
      hasImage: hasImg,
      shape: messageShape(messages)
    };

    // 本期不支持 Gemini 图片输入：直接上抛，由上层自然降级（不拼 inline_data）
    if (isGemini && hasImg) {
      var gErr = makeError("Gemini 当前不支持图片输入", 0, "NO_VISION");
      gErr.modelId = modelConfig.id;
      gErr.modelName = modelConfig.name;
      gErr.requestInfo = debugInfo;
      warn("[ai-service] Gemini 不支持图片输入", debugInfo);
      throw gErr;
    }

    var resp = null;
    try {
      resp = await raceTimeout(fetch(reqUrl, fetchOpts), respMs, null,
        "模型响应超时（" + respMs + "ms 未返回响应头）", "TIMEOUT_RESPONSE");
    } catch (e) {
      e.requestInfo = debugInfo;
      e.modelId = modelConfig.id;
      e.modelName = modelConfig.name;
      warn("[ai-service] 请求失败/超时", debugInfo, e && e.message);
      throw e;
    }

    if (!resp.ok) {
      var errBody = null;
      try { errBody = await resp.json(); } catch (e2) {
        try {
          var rawText = await readResponseText(resp);
          if (rawText) errBody = { error: { message: String(rawText).slice(0, 200) } };
        } catch (e3) { /* 忽略 */ }
      }
      var ecode = (errBody && errBody.error && errBody.error.code) ? errBody.error.code : null;
      var emsg = (errBody && errBody.error && errBody.error.message) ? errBody.error.message : ("HTTP " + resp.status);
      // 需求 D-5：status / code / 后端 message 全部带足，400 必须有 error.message
      var apiErr = makeError("API错误:" + resp.status + " " + emsg, resp.status, ecode);
      apiErr.apiMessage = emsg;
      apiErr.apiCode = ecode;
      apiErr.modelId = modelConfig.id;
      apiErr.modelName = modelConfig.name;
      apiErr.requestInfo = debugInfo;
      if (resp.status === 400 || resp.status === 422) {
        warn("[ai-service] 请求被拒（不降级，直接上抛）", {
          request: debugInfo,
          response: { status: resp.status, code: ecode, message: emsg }
        });
      }
      throw apiErr;
    }

    var firstChunkAt = 0;
    function emit(delta, full) {
      if (!firstChunkAt) firstChunkAt = Date.now();
      if (onChunk) onChunk(delta, full);
    }

    var fullText = "";
    // Gemini 走 generateContent（无 SSE），强制走整段读取 + extractContent 分支
    if (!isGemini && canStreamRead(resp)) {
      var readP = readSSEStream(resp, emit, function () { if (!firstChunkAt) firstChunkAt = Date.now(); });
      // 15 秒未出首字 -> 判慢，交给上层切下一个快模型
      readP = raceTimeout(readP, firstTokenMs, function () { return firstChunkAt > 0; },
        "模型响应较慢（" + firstTokenMs + "ms 未出首字）", "TIMEOUT_FIRST_TOKEN");
      readP = raceTimeout(readP, totalMs, null, "模型响应超时（总时长 " + totalMs + "ms）", "TIMEOUT_TOTAL");
      var streamResult = null;
      try {
        streamResult = await readP;
      } catch (e4) {
        e4.requestInfo = debugInfo;
        e4.modelId = modelConfig.id;
        e4.modelName = modelConfig.name;
        warn("[ai-service] 流式读取失败", debugInfo, e4 && e4.message);
        throw e4;
      }
      if (streamResult) {
        fullText = streamResult.text || "";
        if (!fullText && streamResult.reasoning) {
          // 流式全程只有思维链、content 为空 -> 以 reasoning 作为最终文本（不加前缀，避免污染渲染）
          fullText = streamResult.reasoning;
          emit(fullText, fullText);
        }
      }
    } else {
      // 老内核无 ReadableStream / Gemini 非 SSE：整段读取后本地分段吐出，保证不抛错、仍能出答案
      warn("[ai-service] 转为整段解析（" + (isGemini ? "Gemini 非流式" : "当前内核不支持流式读取") + "，模型：" + modelConfig.name + "）");
      var whole = "";
      try {
        whole = await raceTimeout(readResponseText(resp), totalMs, null,
          "模型响应超时（总时长 " + totalMs + "ms）", "TIMEOUT_TOTAL");
      } catch (e5) {
        e5.requestInfo = debugInfo;
        e5.modelId = modelConfig.id;
        e5.modelName = modelConfig.name;
        throw e5;
      }
      try {
        fullText = extractContent(String(whole), null);
      } catch (e6) {
        e6.requestInfo = debugInfo;
        e6.modelId = modelConfig.id;
        e6.modelName = modelConfig.name;
        throw e6;
      }
      if (fullText && onChunk && fullText.length > 24) {
        try { await simulateTyping(fullText, onChunk); } catch (e7) { /* 忽略 */ }
      } else if (fullText && onChunk) {
        try { onChunk(fullText, fullText); } catch (e8) { /* 忽略 */ }
      }
    }

    if (!fullText) {
      var emptyErr = makeError("模型返回空内容", 0, "EMPTY");
      emptyErr.requestInfo = debugInfo;
      emptyErr.modelId = modelConfig.id;
      emptyErr.modelName = modelConfig.name;
      warn("[ai-service] 模型返回空内容", debugInfo);
      throw emptyErr;
    }

    return fullText;
  }

  // ---------- 统一调用入口 ----------
  async function callAI(funcType, messages, opts) {
    opts = opts || {};
    var cfg = getConfig();
    var msgs = normalizeMessages(messages);
    if (!msgs.length) throw makeError("消息为空", 0, null);

    var lastMsg = msgs[msgs.length - 1];
    var userText = (lastMsg && typeof lastMsg.content === "string") ? lastMsg.content : "";

    // 超时参数（调用方可通过 opts 覆盖，便于压测/特殊场景）
    var reqOpts = {
      firstTokenTimeout: (opts.firstTokenTimeout != null) ? opts.firstTokenTimeout : TIMEOUT_FIRST_TOKEN,
      totalTimeout: (opts.totalTimeout != null) ? opts.totalTimeout : TIMEOUT_TOTAL,
      responseTimeout: (opts.responseTimeout != null) ? opts.responseTimeout : TIMEOUT_RESPONSE
    };

    // R72-Bug4：预设不再默认抢跑（旧逻辑命中极宽子串即短路，UI 看不出是内置 -> 「偶尔误触发」）。
    // 仅当调用方显式 opts.allowPreset === true 时才走前置预设（省额度、不消耗限频的老路径）；
    // 默认路径下，预设降级为「全部模型失败后的兜底」（见下方第 4 段，fromPreset:true + degraded:true）。
    if (opts.allowPreset === true) {
      var preset = presetMatch(userText);
      if (preset) {
        if (opts.onChunk) opts.onChunk(preset, preset);
        return { text: preset, fromPreset: true, degraded: false, model: null };
      }
    }

    // 2. 服务端中转优先（无图 + 已登录时）：不存在跨域问题，密钥在服务端
    var realType = opts.image ? "vision" : resolveFuncType(funcType, msgs, !!opts.image);
    if (!opts.image) {
      var provs = await relayProviders();
      if (provs.length) {
        var ftR = cfg.FUNC_TYPES[realType] || cfg.FUNC_TYPES.general;
        var tempR = ftR.temperature != null ? ftR.temperature : 0.7;
        var maxTR = ftR.maxTokens != null ? ftR.maxTokens : 1000;
        if (opts.max) {
          var mmR = cfg.maxMode;
          // R65-B：MAX 输出上限下限 4000 -> 8000（配置更大时以配置为准）
          var capR = (mmR && mmR.maxTokens) ? mmR.maxTokens : 8000;
          if (capR < 8000) capR = 8000;
          if (maxTR < capR) maxTR = capR;
        }
        try {
          var relayMsgs = [];
          if (cfg.systemPrompt) relayMsgs.push({ role: "system", content: cfg.systemPrompt });
          for (var ri = 0; ri < msgs.length; ri++) relayMsgs.push(msgs[ri]);
          // R65-B：MAX 模式注入深度教学 system（置于最前，与站点 system 并存）
          if (opts.max) relayMsgs = withMaxSystem(relayMsgs);
          var relayed = await relayChat(provs, relayMsgs, tempR, maxTR, opts.onChunk, reqOpts);
          return {
            text: relayed.text,
            model: "relay:" + relayed.providerId,
            modelUsed: "relay:" + relayed.providerId,
            modelUsedName: relayed.providerName,
            fromPreset: false, degraded: false, funcType: realType
          };
        } catch (eRelay) {
          // 中转失败（未登录/限额/网络）→ 落到直连链，不中断
        }
      }
    }

    // 3. 构建直连降级链（图片强制 vision 路线；未指定类型时服务层按关键词自动路由）
    var chain = opts.image ? buildVisionChain(opts) : buildChain(realType, opts);
    if (!chain.length) {
      var fb0 = genericFallback();
      return { text: fb0, fromPreset: true, degraded: true, model: null, modelUsed: null, funcType: realType };
    }

    // 3. 限频检查
    if (!checkRateLimit()) {
      var re = makeError("提问太频繁了，休息一下吧", 429, null);
      re.rateLimited = true;
      throw re;
    }

    // 3.1 图片归一化：按真实字节类型构造 MIME，绝不写死 jpeg（需求 D-1）
    var imageUrl = "";
    if (opts.image) {
      imageUrl = normalizeImageUrl(opts.image);
      if (!imageUrl) {
        var ie = makeError("图片解析失败：仅支持 JPG / PNG / WebP / GIF / BMP 的 base64 图片", 400, "IMAGE_INVALID");
        ie.apiMessage = ie.message;
        warn("[ai-service] 图片归一化失败（不降级，直接上抛）", {
          hasImage: true,
          rawHead: String(opts.image).slice(0, 64)
        });
        throw ie;
      }
    }

    var finalMessages = buildMessages(msgs, imageUrl, cfg.systemPrompt);
    // R65-B：MAX 模式注入深度教学 system（置于最前，已有 system 则并排在前，不合并字符串）
    if (opts.max) finalMessages = withMaxSystem(finalMessages);
    recordCall();

    var notified = {};
    var lastErr = null;
    var attempted = 0;
    var degradeReason = "";

    // 实际使用的模型回传：先按链路首节点通知一次（页面可即时显示「由 XXX 回答」）
    function notifyModel(m) {
      if (opts.onModelUsed) {
        try { opts.onModelUsed(m.id, m.name); } catch (e) { /* 忽略 */ }
      }
    }

    // 需求 D-2 / D-3：降级提示。响应慢与繁忙用不同措辞。
    function notifyFallback(m, reason) {
      var msg = (reason === "slow") ? ("响应较慢，已切换模型：" + m.name) : ("已切换到 " + m.name + " 模型");
      if (opts.onFallback) {
        try { opts.onFallback(m.name, m.id, msg, reason); } catch (e) { /* 忽略 */ }
        return;
      }
      // 调用方没传 onFallback 时（如首页小助手），用站内 toast 兜底提示
      try {
        if (typeof window !== "undefined" && typeof window.xtToast === "function") window.xtToast(msg);
        else if (typeof window !== "undefined" && typeof window.showToast === "function") window.showToast(msg);
      } catch (e2) { /* 忽略 */ }
    }

    for (var i = 0; i < chain.length; i++) {
      var m = chain[i];
      // 需求 D-4：连续 2 次 429 的模型，本次会话内直接跳过
      if (rateSkip[m.id]) continue;

      try {
        if (attempted > 0) notifyFallback(m, degradeReason);
        attempted++;
        notifyModel(m);
        var full = await requestModel(m, finalMessages, opts.onChunk, opts.signal, reqOpts);
        rate429[m.id] = 0; // 成功即清零连续 429 计数
        return {
          text: full, model: m.id, modelUsed: m.id, modelUsedName: m.name,
          fromPreset: false, degraded: false, funcType: realType
        };
      } catch (e) {
        lastErr = e;
        var st = (e && e.status != null) ? e.status : 0;
        var cd = (e && e.code != null) ? e.code : null;

        // 需求 D-2：400 / 403 / 404 / 422 属请求本身有问题，换模型没用 -> 直接上抛
        if (inList(NO_FALLBACK_STATUS, st)) {
          if (!e.apiMessage) e.apiMessage = e.message;
          if (!e.modelId) e.modelId = m.id;
          if (!e.modelName) e.modelName = m.name;
          if (opts.onError) {
            try { opts.onError(e, m); } catch (e9) { /* 忽略 */ }
          }
          throw e;
        }

        // Key 失效 -> 换下一个（不同 provider 可能还能用）
        if (st === 401) {
          notifyKeyInvalid(m.provider, opts, notified);
          degradeReason = "key";
          continue;
        }

        // 智谱模型拥堵，立即降级
        if (cd === 1305) {
          degradeReason = "busy";
          continue;
        }

        // 需求 D-3：超时（响应头超时 / 15 秒未出首字）-> 切下一个快模型
        if (e && e.timedOut) {
          degradeReason = "slow";
          warn("[ai-service] 模型超时，切换下一个", { model: m.name, model: m.model, code: cd, message: e.message });
          continue;
        }

        // 需求 D-4：429 记账，连续 2 次则本次会话跳过，并把备选快模型提到下一位
        if (st === 429) {
          var n = (rate429[m.id] || 0) + 1;
          rate429[m.id] = n;
          if (n >= RATE_LIMIT_SKIP) {
            rateSkip[m.id] = true;
            warn("[ai-service] 模型连续 " + n + " 次 429，本次会话内跳过：" + m.name + "（" + m.id + "）");
          }
          injectRescue(chain, i + 1, m);
          degradeReason = "ratelimit";
          continue;
        }

        // 5xx / 网络错误 / 空回复 -> 走下一个模型
        degradeReason = "error";
        continue;
      }
    }

    // 链路里所有模型都被限流跳过，一次都没真正请求过
    if (attempted === 0) {
      var skipErr = makeError("当前模型均被限流，请稍后再试", 429, "ALL_RATE_LIMITED");
      skipErr.rateLimited = true;
      throw skipErr;
    }

    // 4. 全部失败 -> 本地兜底（R72-Bug4：这里才是预设作为「内置参考」出现的唯一入口）
    //    语义：fromPreset:true + degraded:true，调用方据此区分「内置参考」与真实模型回答。
    var fbText = presetMatch(userText) || genericFallback();
    var result = { text: fbText, fromPreset: true, degraded: true, model: null, error: lastErr };
    var invalidList = [];
    for (var p in notified) {
      if (notified.hasOwnProperty(p)) invalidList.push(p);
    }
    if (invalidList.length) result.keyInvalidProvider = invalidList[0];
    return result;
  }

  // ---------- R64 N4：健康检查（跨线契约 C2；直接复用 requestModel，绝不计入限频） ----------
  var HEALTH_TIMEOUT = 12000;

  // err 分类如实：http_<code> / cors / network / timeout / empty
  function classifyHealthErr(e) {
    if (!e) return "network";
    if (e.timedOut) return "timeout";
    var msg = String(e && e.message ? e.message : "").toLowerCase();
    if (msg.indexOf("abort") !== -1) return "timeout";
    var st = (e.status != null) ? e.status : 0;
    if (st) return "http_" + st;
    if (e.code === "EMPTY" || msg.indexOf("空内容") !== -1 || msg.indexOf("empty") !== -1) return "empty";
    if (msg.indexOf("failed to fetch") !== -1 || msg.indexOf("cors") !== -1 ||
        msg.indexOf("networkerror") !== -1 || msg.indexOf("load failed") !== -1) return "cors";
    return "network";
  }

  // R66 N2：计算「实际可用」的端点与 Key（含 provider 回退与用户自填 Key），
  // 用于端点/Key 缺失时提前返回 no_endpoint / no_key，避免把「配置缺失」误报成 network。
  function resolveEffectiveEndpointKey(mc) {
    var cfg = getConfig();
    var provider = (mc && mc.provider && cfg && cfg.providers) ? cfg.providers[mc.provider] : null;
    var url = (typeof mc.apiUrl === "string" && mc.apiUrl) ? mc.apiUrl : ((provider && provider.apiUrl) ? provider.apiUrl : null);
    var key = (typeof mc.apiKey === "string" && mc.apiKey) ? mc.apiKey : null;
    if (!key && provider && typeof provider.apiKey === "string" && provider.apiKey) key = provider.apiKey;
    if (!key && mc && mc.provider) {
      try {
        var uk = localStorage.getItem("ai_user_key_" + mc.provider);
        if (uk) key = uk;
      } catch (eUk) { /* 忽略 */ }
    }
    return { apiUrl: url || null, apiKey: key || null };
  }

  // R66 N2：aiHealthCheck 支持可选第二参数 cfgOverride（临时配置）。签名一字不改。
  //   window.aiHealthCheck(modelId, cfgOverride) -> Promise<{ok:boolean, ms:number, err:string|null}>
  //   cfgOverride（可选）: { apiUrl, apiKey, apiFormat, extraHeaders, modelId }
  // - 传 cfgOverride 时：用临时配置构造请求（apiUrl/apiKey/apiFormat/extraHeaders 覆盖；
  //   cfgOverride.modelId 覆盖实际请求的模型 id），不读也不写 ai_model_settings.overrides、
  //   不修改任何已存配置、结果不落盘（由调用方决定）。
  // - 不传时：行为与改造前完全一致（走 overrides 合并后的模型配置）。
  // - 保持：maxTokens=1、12s 超时、绝不触发 recordCall / 不计入限频；err 值域不变
  //   （http_XXX / cors / network / timeout / empty）并新增两个值：no_endpoint / no_key。
  function aiHealthCheckImpl(modelId, cfgOverride) {
    return new Promise(function (resolve) {
      var startedAt = Date.now();
      var ov = (cfgOverride && typeof cfgOverride === "object") ? cfgOverride : null;
      var raw = findModel(modelId);
      if (!raw && !ov) {
        resolve({ ok: false, ms: 0, err: "not_found" });
        return;
      }
      var mc;
      if (ov) {
        // 临时配置：以模型对象为基底（不在库则空基底），叠加临时字段；全程不读不写 overrides
        mc = raw ? cloneModel(raw, null, null) : {
          id: modelId, name: (modelId != null ? String(modelId) : ""), provider: null,
          model: modelId, types: [], tag: "", fallback: null, needVPN: false,
          apiUrl: null, apiKey: null, apiFormat: null, extraHeaders: null,
          ownTemp: false, ownMaxT: false, temperature: 0.7, maxTokens: 1000
        };
        if (ov.apiUrl != null) mc.apiUrl = ov.apiUrl;
        if (ov.apiKey != null) mc.apiKey = ov.apiKey;
        if (ov.apiFormat != null) mc.apiFormat = ov.apiFormat;
        if (ov.extraHeaders != null) mc.extraHeaders = ov.extraHeaders;
        if (ov.modelId != null && ov.modelId !== "") mc.model = ov.modelId;
      } else {
        // 与改造前一致：走 overrides 合并后的模型配置
        mc = applyOverrides(raw);
        mc = cloneModel(mc, null, null);
      }
      // 极短 ping（"hi" + maxTokens=1）不烧 token
      var ping = mc;
      ping.maxTokens = 1;

      // 端点 / Key 缺失：不抛异常，返回新增 err 值（调用方线1 会映射成用户可读文案）
      var eff = resolveEffectiveEndpointKey(ping);
      if (!eff.apiUrl) { resolve({ ok: false, ms: 0, err: "no_endpoint" }); return; }
      if (!eff.apiKey) { resolve({ ok: false, ms: 0, err: "no_key" }); return; }

      // 总超时 12s：复用 raceTimeout（老 WebView 兼容）；有 AbortController 时再加一层硬中止
      var ctrl = null;
      var timer = null;
      if (typeof AbortController === "function") {
        ctrl = new AbortController();
        timer = setTimeout(function () {
          try { ctrl.abort(); } catch (eAb) { /* 忽略 */ }
        }, HEALTH_TIMEOUT);
      }
      function finish(result) {
        if (timer) clearTimeout(timer);
        resolve(result);
      }
      // 直接走 requestModel（不经 callAI）-> 绝不调用 recordCall / 不计入 10 次/分钟限频
      requestModel(
        ping,
        [{ role: "user", content: "hi" }],
        null,
        ctrl ? ctrl.signal : null,
        { responseTimeout: HEALTH_TIMEOUT, firstTokenTimeout: HEALTH_TIMEOUT, totalTimeout: HEALTH_TIMEOUT }
      ).then(function (text) {
        if (text) finish({ ok: true, ms: Date.now() - startedAt, err: null });
        else finish({ ok: false, ms: Date.now() - startedAt, err: "empty" });
      }, function (e) {
        finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(e) });
      });
    });
  }

  // ---------- R65-C：modelModes 链完整性软校验（找不到只 warn，不抛错） ----------
  try {
    var cfgSelf = getConfig();
    if (cfgSelf && cfgSelf.modelModes && typeof cfgSelf.modelModes === "object") {
      for (var smk in cfgSelf.modelModes) {
        if (!Object.prototype.hasOwnProperty.call(cfgSelf.modelModes, smk)) continue;
        var smDef = cfgSelf.modelModes[smk];
        if (!smDef || !Array.isArray(smDef.chain)) continue;
        for (var smi = 0; smi < smDef.chain.length; smi++) {
          if (!findModel(smDef.chain[smi])) {
            warn("[ai-service] modelModes." + smk + " 链中的模型未找到，调用时将跳过:", smDef.chain[smi]);
          }
        }
      }
    }
  } catch (eSelf) { /* 自检绝不影响主流程 */ }

  // ---------- 暴露接口 ----------
  var AI_SERVICE = {
    callAI: callAI,
    requestModel: requestModel,
    buildChain: buildChain,
    findModel: findModel,
    applyOverrides: applyOverrides,
    checkRateLimit: checkRateLimit,
    normalizeImageUrl: normalizeImageUrl,
    detectImageMime: detectImageMime,
    resetModelSkip: resetModelSkip,
    getModelSettings: aiGetModelSettingsImpl,
    saveModelSettings: aiSaveModelSettingsImpl,
    healthCheck: aiHealthCheckImpl
  };

  if (typeof window !== "undefined") {
    window.AI_SERVICE = AI_SERVICE;
    window.callAI = callAI;
    // R64 N4 跨线契约（守卫式挂载，避免与既有全局名冲突）
    if (typeof window.aiGetModelSettings !== "function") window.aiGetModelSettings = aiGetModelSettingsImpl;
    if (typeof window.aiSaveModelSettings !== "function") window.aiSaveModelSettings = aiSaveModelSettingsImpl;
    if (typeof window.aiHealthCheck !== "function") window.aiHealthCheck = aiHealthCheckImpl;
  }
})();
