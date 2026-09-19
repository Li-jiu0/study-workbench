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
  // 响应头超时：R83 按文档 §四「正常调用超时 30 秒」统一为 30 秒，超时立即降级、不等待
  var TIMEOUT_RESPONSE = 30000;
  // 单次请求总时长上限：兜底防挂死（不截断正常长回答）；
  // R83b：文档 §四的「30 秒」指首响应超时（TIMEOUT_RESPONSE），总时长回归 90 秒，避免长回答被判超时降级
  var TIMEOUT_TOTAL = 90000;
  // 慢模型黑名单：仅用户手动选择时进入链路，自动降级链里排除（现役 16 模型均无慢速黑名单需求，置空）
  var SLOW_MODEL_IDS = [];
  // 连续多少次 429 后，本次会话内跳过该模型
  var RATE_LIMIT_SKIP = 2;
  // 遭遇 429 后的备选首选模型（快模型）
  var RATE_LIMIT_RESCUE = ["ark-v4-flash", "ark-doubao-mini", "qf-ernie-32k"];
  // 不降级、直接抛给上层的 HTTP 状态（请求本身有问题，换模型没用）
  var NO_FALLBACK_STATUS = [400, 403, 404, 422];
  // R73p：Gemini 3.x（gemini-3.5-flash / gemini-3.5-flash-lite）为思考型模型，
  // 思维链 token 计入 maxOutputTokens。文本模型常用的 1000~2500 上限（健康检查甚至压到 1）
  // 会被思考 token 吃满，响应 finishReason=MAX_TOKENS 且正文为空 —— 前端表现为「连不上」。
  // 实测佐证：平台探测 GET 源地址 1534ms 即成功，说明网络与跨域均正常，失败发生在 API 层。
  var GEMINI_MIN_OUTPUT_TOKENS = 4096;

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

  // ---------- R77：海外平台代理访问（needProxy 平台：openrouter / gemini） ----------
  // 模式（localStorage ai_proxy_settings 优先于 AI_CONFIG.proxy 出厂默认）：
  //   auto   连通性探测；不可达平台视为离线：模型不进降级链（手动选中除外），调用自然降级国内链；
  //   relay  needProxy 平台请求 URL 改走 relayUrl 中转（约定：relayUrl 前缀 + encodeURIComponent(目标完整URL)，body/headers 原样透传）；
  //   direct 始终直连（R77 之前的行为）。
  var PROXY_LS_CONFIG = "ai_proxy_settings";
  var PROXY_LS_STATUS = "ai_proxy_status";
  var PROXY_STATUS_TTL = 10 * 60 * 1000;  // 探测结果有效期：10 分钟
  var PROXY_PROBE_TIMEOUT = 5000;         // R83：auto 启动探测超时同步为 5 秒（文档 §四）

  function getProxyConfig() {
    var out = { mode: "auto", relayUrl: "" };
    var cfg = getConfig();
    if (cfg && cfg.proxy && typeof cfg.proxy === "object") {
      if (cfg.proxy.mode === "relay" || cfg.proxy.mode === "direct") out.mode = cfg.proxy.mode;
      if (typeof cfg.proxy.relayUrl === "string") out.relayUrl = cfg.proxy.relayUrl;
    }
    var s = readJSONKey(PROXY_LS_CONFIG, null);
    if (s && typeof s === "object") {
      if (s.mode === "auto" || s.mode === "relay" || s.mode === "direct") out.mode = s.mode;
      if (typeof s.relayUrl === "string") out.relayUrl = s.relayUrl;
    }
    return out;
  }

  function providerNeedProxy(name) {
    if (!name) return false;
    var cfg = getConfig();
    return !!(cfg && cfg.providers && cfg.providers[name] && cfg.providers[name].needProxy === true);
  }

  function needProxyProviders() {
    var cfg = getConfig();
    var out = [];
    if (cfg && cfg.providers) {
      for (var k in cfg.providers) {
        if (Object.prototype.hasOwnProperty.call(cfg.providers, k) &&
            cfg.providers[k] && cfg.providers[k].needProxy === true) out.push(k);
      }
    }
    return out;
  }

  // relay 模式：needProxy 平台的最终请求 URL（含 Gemini ?key= 查询串）改走中转前缀
  function proxyWrapUrl(url, providerName) {
    var pc = getProxyConfig();
    if (pc.mode !== "relay" || !pc.relayUrl || !providerNeedProxy(providerName)) return url;
    return pc.relayUrl + encodeURIComponent(url);
  }

  // 取平台 apiUrl 的源（scheme + host）：探测打源地址，避开 Gemini apiUrl 里的 {model} 占位符
  function providerOriginUrl(url) {
    var m = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\/]+)/.exec(String(url || ""));
    return m ? m[1] : null;
  }

  // 单平台探测：GET 源地址（relay 模式下连探测也走中转，测的是实际调用路径）。
  // 8 秒内拿到任意 HTTP 响应（含 4xx/5xx）= 可达；网络层失败或超时 = 不可达。
  function probeProviderOnce(name) {
    return new Promise(function (resolve) {
      var cfg = getConfig();
      var p = (cfg && cfg.providers) ? cfg.providers[name] : null;
      var origin = p ? providerOriginUrl(p.apiUrl) : null;
      if (!origin) { resolve({ ok: false, ms: 0, err: "no_endpoint" }); return; }
      var target = proxyWrapUrl(origin, name);
      var startedAt = Date.now();
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, ms: Date.now() - startedAt, err: "timeout" });
      }, PROXY_PROBE_TIMEOUT);
      fetch(target, { method: "GET", cache: "no-store" }).then(function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: true, ms: Date.now() - startedAt, err: null });
      }, function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: false, ms: Date.now() - startedAt, err: "network" });
      });
    });
  }

  // 批量探测所有 needProxy 平台并落盘（内存 + localStorage ai_proxy_status）
  var _proxyStatusMem = null;
  function readProxyStatus() {
    if (_proxyStatusMem) return _proxyStatusMem;
    _proxyStatusMem = readJSONKey(PROXY_LS_STATUS, {});
    return _proxyStatusMem;
  }
  function writeProxyStatus(st) {
    _proxyStatusMem = st;
    try { localStorage.setItem(PROXY_LS_STATUS, JSON.stringify(st)); } catch (e) { /* 存储不可用则仅内存态 */ }
  }
  function probeProxyPlatforms() {
    var names = needProxyProviders();
    var st = {};
    var tasks = [];
    for (var i = 0; i < names.length; i++) {
      (function (nm) {
        tasks.push(probeProviderOnce(nm).then(function (r) {
          st[nm] = { ok: r.ok, ms: r.ms, err: r.err, ts: Date.now() };
        }));
      })(names[i]);
    }
    return Promise.all(tasks).then(function () {
      writeProxyStatus(st);
      return st;
    });
  }

  // auto 模式判定平台离线：探测结果 10 分钟内且 ok!==true 才算离线（无结果/已过期一律视为在线，不误伤）
  function isProviderOffline(name) {
    var pc = getProxyConfig();
    if (pc.mode !== "auto" || !providerNeedProxy(name)) return false;
    var e = readProxyStatus()[name];
    if (!e || typeof e !== "object") return false;
    if (Date.now() - (e.ts || 0) > PROXY_STATUS_TTL) return false;
    return e.ok !== true;
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

  // 需求12：创建 AbortController 用于超时/失败时主动中止在途请求。
  // 老 WebView（无 AbortController）返回 null，调用方必须判空后再使用。
  function makeAbortController() {
    try {
      if (typeof AbortController === "function") return new AbortController();
    } catch (e) { /* 老内核无此 API，忽略 */ }
    return null;
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
    // R73p：手动选中生图模型时，三模式链不得覆盖（模式链里全是文本模型，会把生图请求路由走）
    var manualMc = manual ? findModel(manual) : null;
    var manualIsImageGen = isImageGenModel(manualMc);
    if (mode && funcType !== "reasoning" && funcType !== "vision" && !manualIsImageGen &&
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
      // R77：auto 模式下探测离线的 needProxy 平台模型不进链（手动/全局选中除外，失败仍会自然降级）
      if (id !== manual && id !== selected) {
        var omc = findModel(id);
        if (omc && omc.provider && isProviderOffline(omc.provider)) continue;
      }
      // 需求 D-3：慢模型只在用户手动选择时进入链路（catModels / 模式链为用户或配置显式编排，不剔除）
      if (!viaCat && !viaMode && inList(SLOW_MODEL_IDS, id) && id !== manual && id !== selected) continue;
      var mc = applyOverrides(findModel(id));
      if (!mc) continue;
      chain.push(cloneModel(mc, temp, maxT));
    }

    // ----- R96：深度思考强制优先 -----
    // 页面勾选「深度思考」时会把意图以 opts.forceReasoning=1 传下来。为什么需要这一步：
    // 页面传的 funcType 只是【按输入文字猜】的默认值（predictFuncType），而 buildChain 会
    // 把手动选中的模型置为链首；若用户手动选了非推理模型，仅靠 funcType='reasoning' 仍会被
    // 手动选中模型盖掉，UI 文案「强制走推理模型」即失效。此处显式把推理链首提到最前。
    // 边界：拍题（vision）优先，不抢；生图模型不抢；未配推理模型时不改动原链。
    var wantReasoning = !!(opts && opts.forceReasoning);
    if (wantReasoning && funcType !== "vision" && !manualIsImageGen && cfg.FUNC_TYPES) {
      var rft = cfg.FUNC_TYPES.reasoning;
      var rids = [];
      if (rft && rft.primary) rids.push(rft.primary);
      if (rft && rft.fallback && rft.fallback.length) {
        for (var rf = 0; rf < rft.fallback.length; rf++) rids.push(rft.fallback[rf]);
      }
      // 自定义分类（设置页推理 Tab）已配置时同样尊重
      if (settings.catModels && Array.isArray(settings.catModels.reasoning) && settings.catModels.reasoning.length) {
        rids = settings.catModels.reasoning.slice();
      }
      var rhead = null;
      for (var rp = 0; rp < rids.length; rp++) {
        var rm = rids[rp];
        if (!rm || isModelDisabled(settings, rm)) continue;
        var rmc = findModel(rm);
        if (!rmc) continue;
        // 纯生图/3D 模型不能承载文本推理
        if (isImageGenModel(rmc)) continue;
        rhead = rmc;
        break;
      }
      if (rhead) {
        var rIds = [rhead.id];
        for (var rq = 0; rq < chain.length; rq++) {
          if (chain[rq] && chain[rq].id !== rhead.id) rIds.push(chain[rq].id);
        }
        var rChain = [];
        var rSeen = {};
        for (var rz = 0; rz < rIds.length; rz++) {
          if (!rIds[rz] || rSeen[rIds[rz]]) continue;
          rSeen[rIds[rz]] = true;
          for (var ry = 0; ry < chain.length; ry++) {
            if (chain[ry] && chain[ry].id === rIds[rz]) { rChain.push(chain[ry]); break; }
          }
        }
        if (rChain.length) chain = rChain;
      }
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

  // R103：把「所选模型所属平台」提到中转链最前（只重排、不删除任何平台，保留冗余降级）。
  // 此前固定按服务端顺序（ark 常在首位），选了别的平台的模型也会被 ark 抢先接单，
  // 而服务端又按 id 解析不到，于是用默认模型应答 -> 用量明细显示 ark 默认模型名。
  // 纯函数、幂等：命中平台提前，其余保持原相对顺序；未命中返回原数组内容。
  function prioritizeProvider(list, providerId) {
    if (!list || !list.length || !providerId) return list;
    var hit = null;
    var rest = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === providerId) { hit = list[i]; }
      else { rest.push(list[i]); }
    }
    return hit ? [hit].concat(rest) : rest;
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
        // R72：改走 safeRespJson —— 网关返回 HTML 时不抛裸 SyntaxError（外层 try 仍会兜底不缓存）
        var d = await safeRespJson(resp);
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

  // ---------- R72：非 JSON 响应体收敛（网关/CDN 返回 HTML 错误页） ----------
  // 背景：自定义端点填错或服务不可用时，对方常返回 HTML 错误页（如 <!DOCTYPE html>...）。
  // 此时 resp.json() 会抛裸 SyntaxError（"Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"），
  // 直接冒泡到聊天界面，用户看到的是天书。这里统一「先读文本再 JSON.parse」，
  // 失败时抛人类可读的 Error（含 HTTP 状态 / content-type / 响应体前 80 字符），便于排查。
  function respStatus(resp) {
    return (resp && resp.status != null) ? resp.status : 0;
  }

  function respCtype(resp) {
    try {
      if (resp && resp.headers && typeof resp.headers.get === "function") {
        return resp.headers.get("content-type") || "";
      }
    } catch (e) { /* 忽略 */ }
    return "";
  }

  // 判定「一眼可辨的非 JSON 内容」（HTML 错误页）：去首部空白后以 "<" 起头，
  // 且带 HTML 特征标签。合法答案要么是 SSE（data: 起头）、要么是 JSON（{ 起头），
  // 因此不会误伤正常回答；同时避免把模型偶发的 "<x>" 数学写法误判为 HTML。
  function looksLikeHtml(text) {
    var s = String(text == null ? "" : text).replace(/^[\s\r\n]+/, "");
    if (!s || s.charAt(0) !== "<") return false;
    var head = s.slice(0, 200).toLowerCase();
    if (head.indexOf("<!doctype") === 0) return true;
    if (head.indexOf("<html") === 0) return true;
    if (head.indexOf("<?xml") === 0) return true;
    if (head.indexOf("<head") === 0) return true;
    if (head.indexOf("<body") === 0) return true;
    if (head.indexOf("<title") === 0) return true;
    if (head.indexOf("<html") !== -1) return true;
    if (head.indexOf("<head") !== -1) return true;
    if (head.indexOf("<body") !== -1) return true;
    if (head.indexOf("<title") !== -1) return true;
    return false;
  }

  // 构造「非 JSON 响应」的人类可读提示：HTTP 状态 + content-type + 响应体前 80 字符。
  function nonJsonMessage(status, ctype, body) {
    var head = String(body == null ? "" : body).replace(/\s+/g, " ").replace(/^ +| +$/g, "");
    if (head.length > 80) head = head.slice(0, 80) + "…";
    return "接口返回了非 JSON 内容（HTTP " + status + " " + (ctype || "未知类型") + "），" +
           "API 地址可能填错或服务不可用" + (head ? "。响应开头：" + head : "");
  }

  // 统一安全读取响应为 JSON：非 JSON（HTML 错误页等）时抛人类可读 Error，绝不抛裸 SyntaxError。
  async function safeRespJson(resp) {
    var raw = "";
    try { raw = await readResponseText(resp); } catch (eRead) { raw = ""; }
    var s = String(raw == null ? "" : raw);
    try {
      return JSON.parse(s);
    } catch (eParse) {
      throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), s), respStatus(resp), "NON_JSON");
    }
  }

  // 解析一行 SSE，返回 { content, reasoning }；遇到流内 error 直接抛（1305 走降级）
  // reasoning：推理型模型的思维链增量（reasoning_content / reasoning），content 为空时用于兜底。
  function consumeLine(line) {
    line = String(line == null ? "" : line).replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (line.indexOf("data:") !== 0) return { content: "", reasoning: "", usage: null };
    var data = line.slice(5).replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
    if (!data || data === "[DONE]") return { content: "", reasoning: "", usage: null };
    var obj = null;
    try { obj = JSON.parse(data); } catch (e) { return { content: "", reasoning: "", usage: null }; }
    if (obj && obj.error) {
      var c = obj.error.code ? obj.error.code : null;
      var m2 = obj.error.message ? obj.error.message : "stream error";
      throw makeError("API流式错误:" + c + " " + m2, (c === 1305 ? 200 : 0), c);
    }
    var choices = obj ? obj.choices : null;
    // 需求 E：部分平台在最后一个 chunk 只发 usage（无 choices），这里照样取出，供用量统计
    if (!choices || !choices.length) return { content: "", reasoning: "", usage: (obj && obj.usage) ? obj.usage : null };
    var delta = choices[0].delta;
    var content = (delta && delta.content) ? String(delta.content) : "";
    var reasoning = "";
    if (delta) {
      if (delta.reasoning_content != null) reasoning = String(delta.reasoning_content);
      else if (delta.reasoning != null) reasoning = String(delta.reasoning);
    }
    return { content: content, reasoning: reasoning, usage: (obj && obj.usage) ? obj.usage : null };
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
    var usage = null;      // 需求 E：流内 usage（多数平台在最后一个 chunk 下发）
    var lineSeen = false;
    function handleLine(line) {
      // R72：流式读到 HTML（网关/CDN 错误页）时，首个非空行即可判定，直接抛人类可读错误；
      // consumeLine 对非 data: 行本就返回空，这里再加显式兜底，确保 HTML 不按 SSE 逐块泄漏。
      if (!lineSeen && String(line == null ? "" : line).replace(/^[\s\r\n]+|[\s\r\n]+$/g, "") !== "") {
        lineSeen = true;
        if (looksLikeHtml(line)) {
          throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), line), respStatus(resp), "NON_JSON");
        }
      }
      var pr = consumeLine(line);
      if (pr.usage) usage = pr.usage;
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
    return { text: full, reasoning: reasoning, usage: usage };
  }

  // 非流式兜底：整段文本里抽内容。兼容 SSE 文本、纯 JSON、以及被网关折叠成 JSON 的情况。
  // content 为空（null/""/非字符串）时按序回退 reasoning_content -> reasoning（推理型模型兜底）。
  function extractContent(text, emit, sink) {
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
        // 需求 E：整段响应里的 usage（OpenAI 兼容 usage / Gemini usageMetadata），取出供用量统计
        if (obj.usage && typeof obj.usage === "object") {
          if (sink) sink.usage = obj.usage;
        } else if (obj.usageMetadata && typeof obj.usageMetadata === "object") {
          if (sink) sink.usage = obj.usageMetadata;
        }
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
              maxTokens: maxTokens,
              // R88-M1：带上用户选中的模型 id（ai-config.js 的 id），
              // 服务端据此解析真实模型名——此前不带导致恒跑 .env 默认模型，
              // 表现为「选哪个模型都用同一个」。无选中则不带该字段（保持旧契约）。
              modelId: (opt.modelId ? String(opt.modelId) : undefined),
              // R103：前端 id 与后端 model_registry 键命名不统一，服务端按 id 解析不到
              // 真实模型名时，用这里带来的「前端已知真实模型名」做二次解析（仍受服务端
              // registry 白名单约束）；无选中/未知模型时不带该字段（保持旧契约）。
              modelName: (opt.modelName ? String(opt.modelName) : undefined)
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
          // R72：错误体若是 HTML 错误页，收敛成人类可读提示，不把整段 HTML 塞进 message
          var relayMsg = String(errText || "").replace(/\s+/g, " ").replace(/^ +| +$/g, "").slice(0, 120);
          if (looksLikeHtml(errText)) relayMsg = nonJsonMessage(resp.status, respCtype(resp), errText);
          lastErr = makeError("中转HTTP " + resp.status + " " + relayMsg, resp.status, null);
          break;
        }
        // 服务端返回 text/plain 纯文本流（每段为增量文本，非 SSE）
        var firstChunkAt = 0;
        var relayLive = true;   // 需求12：超时后丢弃迟到增量，避免污染已切换的界面
        var emit = function (piece, full) {
          if (!relayLive) return;
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
          // R88-M1：读取服务端回传的「实际执行的模型名」（响应头 X-Ai-Model-Used）。
          // 跨域（APK）时需服务端 expose_headers 暴露才读得到；读不到就保持空串，
          // 由上层如实回落到本地可辨别的名字，绝不编造。
          var usedModel = "";
          var usedFallback = "";
          try {
            if (resp.headers && typeof resp.headers.get === "function") {
              usedModel = String(resp.headers.get("X-Ai-Model-Used") || "");
              // R104-项4：读取服务端「是否回退」标志（X-Ai-Model-Fallback，取值 "1"/"0"）。
              // 跨域（APK）时需服务端 expose_headers 暴露才读得到；读不到按「未回退」处理。
              usedFallback = String(resp.headers.get("X-Ai-Model-Fallback") || "");
            }
          } catch (eH) { usedModel = ""; usedFallback = ""; }
          return { text: full, providerId: p.id, providerName: p.name, modelUsed: usedModel,
                   modelFallback: (usedFallback === "1") };
        }
        lastErr = makeError("中转空回复", 0, "EMPTY");
      } catch (e) {
        lastErr = e;
        relayLive = false;   // 需求12：停止接收迟到增量
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
      var htmlChecked = false;   // 是否已排除「HTML 错误页」
      var GUARD_LEN = 64;        // 前缀判定窗口：攒够这么多字符仍非 HTML 才放心逐块吐出
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        var piece = decoder.decode(r.value, { stream: true });
        if (!piece) continue;
        full += piece;
        count++;   // 与改造前一致：按实际分块计数（供上层判断是否需要本地分段）
        // R72：中转端返回 HTML 错误页时，绝不按流逐块当答案吐出（否则界面出现 <!DOCTYPE html> 乱码）。
        // 先攒够一个小前缀再判定，避免首块被切成半截 "<!DO" 而漏判；判定窗口内暂不 emit。
        if (!htmlChecked) {
          if (looksLikeHtml(full)) {
            throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), full), respStatus(resp), "NON_JSON");
          }
          // R73k：中转上游故障标记（ai.py 对 402/401/429 等统一加前缀）→ 抛错走直连链，不当答案吐出
          if (full.indexOf("⚠️【中转错误】") === 0) {
            throw makeError(full, 502, "RELAY_UPSTREAM");
          }
          if (full.length < GUARD_LEN) continue;
          htmlChecked = true;
        }
        emit(piece, full);
      }
      if (!htmlChecked) {
        // 响应体不足判定窗口：收尾时再判定一次；短文本正常吐出，HTML 则抛错
        if (looksLikeHtml(full)) {
          throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), full), respStatus(resp), "NON_JSON");
        }
        if (full.indexOf("⚠️【中转错误】") === 0) {
          throw makeError(full, 502, "RELAY_UPSTREAM");
        }
        if (full) emit(full, full);
      }
      return { text: full, count: count };
    }
    var whole = await readResponseText(resp);
    var text = String(whole == null ? "" : whole);
    // R72：整段读取到 HTML 错误页时同样不当作答案文本
    if (looksLikeHtml(text)) {
      throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), text), respStatus(resp), "NON_JSON");
    }
    // R73k：中转上游故障标记 → 抛错走直连链
    if (text.indexOf("⚠️【中转错误】") === 0) {
      throw makeError(text, 502, "RELAY_UPSTREAM");
    }
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

  // ---------- R81：图片生成专用链路（types 含 imagegen 的模型，绝不走 chat/completions） ----------
  // 端点：provider.apiUrl（arkimage = .../images/generations）
  // 请求体：{ model, prompt, size:"1024x1024", response_format:"url" }；响应取 data[0].url
  // 超时：图片生成实测约 35s，给足 60s，不沿用文本模型的 15s 短超时。
  var IMAGE_TIMEOUT_RESPONSE = 60000;
  var IMAGE_TIMEOUT_TOTAL = 90000;
  var IMAGE_TIMEOUT_HEALTH = 60000;
  var IMAGE_SIZE = "1024x1024";

  function isImageGenModel(mc) {
    return !!(mc && mc.types && Object.prototype.toString.call(mc.types) === "[object Array]" &&
      mc.types.indexOf("imagegen") >= 0);
  }

  // R73p：Gemini 输出上限不得小于 GEMINI_MIN_OUTPUT_TOKENS（否则被思考 token 吃满 -> 空响应）
  function geminiOutputTokens(maxTok) {
    var n = (maxTok != null && !isNaN(Number(maxTok))) ? Number(maxTok) : 0;
    return (n > GEMINI_MIN_OUTPUT_TOKENS) ? n : GEMINI_MIN_OUTPUT_TOKENS;
  }

  // R73p：模型配置是否为 Gemini 协议（模型自带 apiFormat 优先，其次 provider）
  function isGeminiFormat(mc) {
    if (mc && typeof mc.apiFormat === "string" && mc.apiFormat) return mc.apiFormat === "gemini";
    var cfg = getConfig();
    var p = (mc && mc.provider && cfg && cfg.providers) ? cfg.providers[mc.provider] : null;
    return !!(p && p.apiFormat === "gemini");
  }

  // R73p：取 Gemini 原始响应的 finishReason，用于把「被截断的空响应」与「网络失败」区分开
  function geminiFinishReason(raw) {
    var s = String(raw == null ? "" : raw);
    if (!s) return "";
    try {
      var j = JSON.parse(s);
      if (j && j.candidates && j.candidates[0] && j.candidates[0].finishReason) {
        return String(j.candidates[0].finishReason);
      }
      if (j && j.promptFeedback && j.promptFeedback.blockReason) {
        return "BLOCKED:" + String(j.promptFeedback.blockReason);
      }
    } catch (e) { /* 非 JSON：返回空串 */ }
    return "";
  }

  // 取最后一条用户消息作 prompt（兼容 content 为字符串或数组两种形态）
  function collectImagePrompt(messages) {
    var txt = "";
    if (Object.prototype.toString.call(messages) === "[object Array]") {
      for (var i = messages.length - 1; i >= 0; i--) {
        var m = messages[i];
        if (!m || m.role !== "user") continue;
        var c = m.content;
        if (typeof c === "string" && c) { txt = c; break; }
        if (Object.prototype.toString.call(c) === "[object Array]") {
          var buf = [];
          for (var j = 0; j < c.length; j++) {
            if (c[j] && c[j].type === "text" && typeof c[j].text === "string") buf.push(c[j].text);
          }
          if (buf.length) { txt = buf.join(" "); break; }
        }
      }
    }
    txt = String(txt || "").trim();
    if (!txt) txt = "a red apple";
    return txt.slice(0, 2000);
  }

  // 老解析路径：兼容 data[] / images[] 两种响应体，url 与 b64_json 都收。
  // 张数取响应体数组长度，绝不写死 1（R86：此前账本里生图恒为 1 张是假数据）。
  function xtExtractImageUrls(json) {
    var out = [];
    if (!json || typeof json !== "object") return out;
    var arr = null;
    if (json.data && json.data.length) arr = json.data;
    else if (json.images && json.images.length) arr = json.images;
    if (!arr) return out;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it) continue;
      if (typeof it.url === "string" && it.url) out.push(it.url);
      else if (typeof it.b64_json === "string" && it.b64_json) out.push("data:image/png;base64," + it.b64_json);
      else if (typeof it.image === "string" && it.image) out.push(it.image);
    }
    return out;
  }

  async function requestImageGeneration(modelConfig, messages, onChunk, signal, options, sink) {
    var cfg = getConfig();
    var provider = (modelConfig.provider && cfg && cfg.providers) ? cfg.providers[modelConfig.provider] : null;
    var apiKey = (typeof modelConfig.apiKey === "string" && modelConfig.apiKey)
      ? modelConfig.apiKey : (provider ? provider.apiKey : null);
    // R86：端点解析接入能力注册表 —— provider.imageUrl（硅基）> imageApiUrl > apiUrl（火山方舟 arkimage
    // 的 apiUrl 本身就是 images/generations）> 能力默认端点；模型自带 apiUrl 仍最优先。
    var apiUrl = (typeof modelConfig.apiUrl === "string" && modelConfig.apiUrl)
      ? modelConfig.apiUrl : null;
    if (!apiUrl) {
      var caps = xtCaps();
      var imgCap = (caps && typeof caps.get === "function") ? caps.get("imagegen") : null;
      if (imgCap && caps && typeof caps.endpoint === "function") {
        try { apiUrl = String(caps.endpoint(imgCap, provider) || ""); } catch (eEp) { apiUrl = ""; }
      }
      if (!apiUrl && provider && provider.apiUrl) apiUrl = String(provider.apiUrl);
    }
    if (!apiUrl) {
      var eNoUrl = makeError("图片生成缺少接口地址:" + modelConfig.id, 0, "NO_ENDPOINT");
      eNoUrl.modelId = modelConfig.id;
      eNoUrl.modelName = modelConfig.name;
      throw eNoUrl;
    }
    if (!apiKey) {
      var eNoKey = makeError("图片生成缺少 API Key:" + modelConfig.id, 0, "NO_KEY");
      eNoKey.modelId = modelConfig.id;
      eNoKey.modelName = modelConfig.name;
      throw eNoKey;
    }
    var opt = options || {};
    var respMs = (opt.responseTimeout != null) ? opt.responseTimeout : IMAGE_TIMEOUT_RESPONSE;
    var totalMs = (opt.totalTimeout != null) ? opt.totalTimeout : IMAGE_TIMEOUT_TOTAL;
    var prompt = (opt.prompt != null && opt.prompt !== "") ? String(opt.prompt) : collectImagePrompt(messages);
    // R86：分辨率取本次请求实际使用的值（调用方 opts.size > 模型 imageSize > 出厂默认）。
    // 生图按「张数 × 分辨率」计费，账本必须记真实值，不能写死 1024x1024。
    var usedSize = (opt.size != null && opt.size !== "") ? String(opt.size)
      : ((modelConfig.imageSize != null && modelConfig.imageSize !== "") ? String(modelConfig.imageSize) : IMAGE_SIZE);

    var body = { model: modelConfig.model, prompt: prompt, size: usedSize, response_format: "url" };
    var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey };
    if (provider && provider.extraHeaders) {
      for (var hk in provider.extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(provider.extraHeaders, hk)) headers[hk] = provider.extraHeaders[hk];
      }
    }
    var fetchOpts = { method: "POST", headers: headers, body: JSON.stringify(body) };
    var ctrl = signal ? null : makeAbortController();
    var effSignal = signal || (ctrl ? ctrl.signal : null);
    if (effSignal) fetchOpts.signal = effSignal;
    var reqUrl = proxyWrapUrl(apiUrl, modelConfig.provider);

    var resp = null;
    try {
      resp = await raceTimeout(fetch(reqUrl, fetchOpts), respMs, null,
        "图片生成响应超时（" + respMs + "ms 未返回）", "TIMEOUT_RESPONSE");
    } catch (e) {
      e.modelId = modelConfig.id;
      e.modelName = modelConfig.name;
      if (ctrl) { try { ctrl.abort(); } catch (eA) { /* 忽略 */ } }
      throw e;
    }
    var raw = "";
    try {
      raw = await raceTimeout(readResponseText(resp), totalMs, null,
        "图片生成读取超时（总时长 " + totalMs + "ms）", "TIMEOUT_TOTAL");
    } catch (e2) {
      e2.modelId = modelConfig.id;
      e2.modelName = modelConfig.name;
      if (ctrl) { try { ctrl.abort(); } catch (eA2) { /* 忽略 */ } }
      throw e2;
    }
    if (!resp.ok) {
      var emsg = raw ? String(raw).replace(/\s+/g, " ").slice(0, 200) : ("HTTP " + resp.status);
      var iErr = makeError("图片生成失败:" + resp.status + " " + emsg, resp.status, null);
      iErr.apiMessage = emsg;
      iErr.modelId = modelConfig.id;
      iErr.modelName = modelConfig.name;
      throw iErr;
    }
    // R86：解析优先复用 ai-cap-image 的 parse（张数取 data[]/images[] 长度、用量口径与之对齐）；
    // 能力模块没加载或没命中时，退到本文件原有解析，但同样必须拿到真实张数与分辨率。
    var json = null;
    try { json = JSON.parse(raw); } catch (e3) { json = null; }
    var urls = [];
    var capUsage = null;
    var caps2 = xtCaps();
    var imgCap2 = (caps2 && typeof caps2.get === "function") ? caps2.get("imagegen") : null;
    if (json && imgCap2 && typeof imgCap2.parse === "function") {
      try {
        var pr = imgCap2.parse(json, {
          meta: { size: usedSize, mode: "t2i" },
          modelCfg: modelConfig,
          input: { prompt: prompt, size: usedSize }
        });
        if (pr && pr.ok !== false && pr.result && pr.result.urls && pr.result.urls.length) {
          urls = pr.result.urls;
          capUsage = (pr.usage && typeof pr.usage === "object") ? pr.usage : null;
        }
      } catch (eCapParse) { urls = []; capUsage = null; }
    }
    if (!urls.length) urls = xtExtractImageUrls(json);
    if (!urls.length) {
      var eEmpty = makeError("图片生成返回空结果", 0, "EMPTY");
      eEmpty.modelId = modelConfig.id;
      eEmpty.modelName = modelConfig.name;
      throw eEmpty;
    }
    if (!capUsage) {
      var capsU = xtCaps();
      if (capsU && typeof capsU.usage === "function") {
        try { capUsage = capsU.usage({ kind: "imagegen", n: urls.length, size: usedSize }); } catch (eU) { capUsage = null; }
      }
      if (!capUsage) {
        capUsage = {
          kind: "imagegen", n: urls.length, size: usedSize,
          inTok: 0, outTok: 0, exact: 0, chars: 0, seconds: 0, dim: 0, docs: 0
        };
      }
    }
    // R86：用量回传外层（sink 为空 = 健康检查等内部探测，不记账）
    if (sink && typeof sink === "object") sink.capUsage = capUsage;
    // 与现有渲染衔接：返回 Markdown 图片串，由 ai-page.js renderMarkdown 渲染成 <img>
    // R73p：alt 必须剔掉 [ ] ( ) 与换行 —— 否则 renderMarkdown 的图片正则匹配不上，图片会退化成纯文本
    var altText = String(prompt)
      .replace(/[\r\n]+/g, " ")
      .replace(/[\[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^ +| +$/g, "")
      .slice(0, 40);
    var parts = [];
    for (var ui = 0; ui < urls.length; ui++) {
      parts.push("![" + altText + "](" + urls[ui] + ")");
    }
    var out = parts.join("\n");
    if (onChunk) {
      try { onChunk(out, out); } catch (e4) { /* 渲染失败不影响结果 */ }
    }
    return out;
  }

  // ==================== R86：通用能力调用层（生图 / 视觉 / 语音 / 嵌入 / 重排） ====================
  // 各能力的具体协议由 assets/ai-cap-*.js 注册进 window.XT_AI_CAPS（注册表在 ai-cap-registry.js），
  // 这里只负责「查能力 -> 发请求 -> 解响应 -> 回传用量」，不掺任何单一能力的业务细节。
  // 新增一种能力 = 新建一个 ai-cap-xxx.js，本文件不用改。
  //
  // 缺失降级原则（重要）：注册表脚本没加载 / cap.build 返回 null / 能力抛错，
  // 一律退化为改造前的 chat/completions 链路，绝不让「能力层缺失」变成「对话不可用」。
  var XT_KIND_BY_TYPE = {
    imagegen: "imagegen",
    audio: "asr",
    embedding: "embed",
    rerank: "rerank",
    image: "vision",
    translate: "text",     // 【R87/T02 新增】翻译走文本 token 口径
    video: "video",        // 【R87/T02 新增】
    "3d": "model3d"        // 【R87/T02 新增】type 保持 '3d'，kind 记 'model3d'
  };
  // 非对话类能力：既不能走服务端中转（/api/ai/chat 只发 {model, messages, stream}，
  // 且会把 content 过滤成字符串），也不能进三模式链（模式链里编排的全是文本模型）
  var XT_NON_CHAT_TYPES = ["imagegen", "audio", "embedding", "rerank", "video", "3d"]; // 【R87/T02 新增 video/3d】
  // 账本 kind 白名单（老记录没有 kind 字段 -> 读取侧按 text 兜底）
  var XT_KIND_LIST = ["text", "vision", "imagegen", "asr", "embed", "rerank", "video", "model3d"]; // 【R87/T02 新增 video/model3d】
  var XT_CAP_TIMEOUT_DEFAULT = 60000;

  // 能力注册表的安全访问器：脚本缺失 / 结构异常一律返回 null，调用方据此退化
  function xtCaps() {
    try {
      if (typeof window === "undefined" || !window) return null;
      var c = window.XT_AI_CAPS;
      if (!c || typeof c.byType !== "function") return null;
      return c;
    } catch (e) {
      return null;
    }
  }

  function xtKindOfType(t) {
    var s = String(t == null ? "" : t);
    return XT_KIND_BY_TYPE[s] ? XT_KIND_BY_TYPE[s] : "";
  }

  // 非法/未知 kind 一律收敛为 text
  function xtUsageNormKind(k) {
    var s = String(k == null ? "" : k);
    return inList(XT_KIND_LIST, s) ? s : "text";
  }

  // 模型是否为非对话类能力模型（生图 / 语音 / 嵌入 / 重排）
  function xtIsNonChatModel(mc) {
    var types = (mc && Object.prototype.toString.call(mc.types) === "[object Array]") ? mc.types : [];
    for (var i = 0; i < types.length; i++) {
      if (inList(XT_NON_CHAT_TYPES, String(types[i]))) return true;
    }
    return false;
  }

  function xtIsNonChatKind(k) {
    var s = String(k == null ? "" : k);
    return (s === "imagegen" || s === "asr" || s === "embed" || s === "rerank");
  }

  // 按模型 types 找到接管它的能力：命中注册表则拿 cap；注册表缺失时用内置类型表兜底（只定 kind，不接管请求）
  function xtResolveCapability(modelCfg, opt) {
    var info = { kind: "", cap: null, type: "" };
    var types = (modelCfg && Object.prototype.toString.call(modelCfg.types) === "[object Array]") ? modelCfg.types : [];
    var caps = xtCaps();
    var fbKind = "";
    var fbType = "";
    for (var i = 0; i < types.length; i++) {
      var t = String(types[i] == null ? "" : types[i]);
      if (!t) continue;
      var cap = caps ? caps.byType(t) : null;
      if (cap && cap.key) {
        info.kind = String(cap.key);
        info.cap = cap;
        info.type = t;
        return info;
      }
      var k = xtKindOfType(t);
      if (k && !fbKind) { fbKind = k; fbType = t; }
    }
    if (fbKind) {
      info.kind = fbKind;
      info.type = fbType;
    }
    return info;
  }

  // 取能力调用所需 Key：模型自带 > 用户自填 > provider 默认（与 chat 链路同一优先级）
  function xtCapApiKey(modelCfg, provider) {
    var selfKey = (modelCfg && typeof modelCfg.apiKey === "string" && modelCfg.apiKey) ? modelCfg.apiKey : "";
    if (selfKey) return selfKey;
    var userKey = "";
    if (modelCfg && modelCfg.provider) {
      try { userKey = localStorage.getItem("ai_user_key_" + modelCfg.provider) || ""; } catch (e) { userKey = ""; }
    }
    if (userKey) return userKey;
    return (provider && provider.apiKey) ? String(provider.apiKey) : "";
  }

  // 合并请求头：能力自带 headers < provider.extraHeaders < 模型 extraHeaders < 鉴权（有则补）
  function xtCapMergeHeaders(base, provider, modelCfg, apiKey) {
    var out = {};
    var k;
    var i;
    if (base && typeof base === "object") {
      for (k in base) {
        if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
      }
    }
    var srcs = [];
    if (provider && provider.extraHeaders && typeof provider.extraHeaders === "object") srcs.push(provider.extraHeaders);
    if (modelCfg && modelCfg.extraHeaders && typeof modelCfg.extraHeaders === "object") srcs.push(modelCfg.extraHeaders);
    for (i = 0; i < srcs.length; i++) {
      for (k in srcs[i]) {
        if (Object.prototype.hasOwnProperty.call(srcs[i], k)) out[k] = srcs[i][k];
      }
    }
    if (apiKey && !out["Authorization"] && !out["authorization"]) out["Authorization"] = "Bearer " + apiKey;
    return out;
  }

  // 兼容各家错误体：优先用注册表的 errText（SiliconFlow {code,message,data} / OpenAI {error:{message}}），
  // 注册表缺失时本地实现同样逻辑，保证错误信息不会因为脚本缺失而退化成一串 [object Object]
  function xtCapErrText(json, fallback) {
    var fb = String(fallback == null ? "" : fallback);
    var caps = xtCaps();
    if (caps && typeof caps.errText === "function") {
      try {
        var s = caps.errText(json, fb);
        if (s) return String(s);
      } catch (e) { /* 落本地实现 */ }
    }
    var out = "";
    try {
      if (!json || typeof json !== "object") return fb;
      if (json.message) out = String(json.message);
      else if (json.msg) out = String(json.msg);
      else if (json.error && json.error.message) out = String(json.error.message);
      if (json.code != null && out) out = "[" + json.code + "] " + out;
    } catch (e2) { out = ""; }
    return out || fb;
  }

  // multipart 上传：老 WebView 的 FormData + fetch 组合不可靠，这里走 XHR。
  // 绝不手写 Content-Type —— multipart boundary 必须交给浏览器自动生成，否则服务端解析不出文件。
  function xtXhrSend(url, payload, headers, timeoutMs, method) {
    return new Promise(function (resolve, reject) {
      var xhr = null;
      try {
        xhr = new XMLHttpRequest();
      } catch (eNew) {
        reject(makeError("当前环境不支持上传（XMLHttpRequest 不可用）", 0, "NO_XHR"));
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { xhr.abort(); } catch (eA) { /* 忽略 */ }
        reject(makeTimeoutError("能力调用超时（" + timeoutMs + "ms 未返回）", "TIMEOUT_TOTAL"));
      }, timeoutMs);
      function finish(fn, v) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(v);
      }
      try {
        xhr.open(method || "POST", url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          var text = "";
          var status = 0;
          try { text = String(xhr.responseText == null ? "" : xhr.responseText); } catch (eT) { text = ""; }
          try { status = Number(xhr.status) || 0; } catch (eS) { status = 0; }
          finish(resolve, { status: status, text: text });
        };
        xhr.onerror = function () { finish(reject, makeError("能力调用网络失败", 0, "NETWORK")); };
        if (headers) {
          for (var h in headers) {
            if (!Object.prototype.hasOwnProperty.call(headers, h)) continue;
            // multipart 的 Content-Type（含 boundary）由浏览器带，手写必然出错
            if (String(h).toLowerCase() === "content-type") continue;
            try { xhr.setRequestHeader(h, headers[h]); } catch (eH) { /* 老内核拒绝非法头名，忽略 */ }
          }
        }
        xhr.send(payload);
      } catch (eSend) {
        finish(reject, makeError("能力调用发送失败：" +
          ((eSend && eSend.message) ? eSend.message : "未知原因"), 0, "SEND_FAILED"));
      }
    });
  }

  /**
   * 通用能力调用器：按能力模块自己声明的端点 / 方法 / 请求体发一次请求，并把用量回传给 sink。
   * @param {Object} cap        能力对象（来自 XT_AI_CAPS）
   * @param {Object} modelCfg   模型配置
   * @param {Object} input      能力输入（由 xtBuildCapInput 组装）
   * @param {Object} opt        透传给 cap.build 的 opts
   * @param {Object} sink       用量收集器（可为空）；成功时写入 sink.capUsage
   * @returns {Promise<*>}      cap.parse 归一后的 result
   */
  async function xtCallCapability(cap, modelCfg, input, opt, sink) {
    var cfg = getConfig();
    var provider = (modelCfg && modelCfg.provider && cfg && cfg.providers) ? cfg.providers[modelCfg.provider] : null;
    var req = null;
    try {
      req = cap.build({ modelCfg: modelCfg, provider: provider, input: input || {}, opts: opt || {} });
    } catch (eBuild) {
      var eb = makeError("能力请求构造失败（" + cap.key + "）：" +
        ((eBuild && eBuild.message) ? eBuild.message : "未知原因"), 0, "CAP_BUILD");
      eb.modelId = modelCfg ? modelCfg.id : "";
      eb.modelName = modelCfg ? modelCfg.name : "";
      throw eb;
    }
    if (!req) {
      var eNull = makeError("能力未生成请求（" + cap.key + "），已退回通用对话链路", 0, "CAP_NO_REQUEST");
      if (modelCfg) { eNull.modelId = modelCfg.id; eNull.modelName = modelCfg.name; }
      throw eNull;
    }
    if (req.ok === false) {
      var eBad = makeError(String(req.err || ("能力请求构造失败：" + cap.key)), 0, "CAP_BUILD");
      if (modelCfg) { eBad.modelId = modelCfg.id; eBad.modelName = modelCfg.name; }
      throw eBad;
    }
    // 端点：模型自带 apiUrl 最优先（自定义模型），否则用能力解析出的端点
    var url = ((modelCfg && typeof modelCfg.apiUrl === "string" && modelCfg.apiUrl) ? modelCfg.apiUrl : req.url);
    if (!url) {
      var eUrl = makeError("能力调用缺少接口地址（" + cap.key + "）", 0, "NO_ENDPOINT");
      if (modelCfg) { eUrl.modelId = modelCfg.id; eUrl.modelName = modelCfg.name; }
      throw eUrl;
    }
    var apiKey = xtCapApiKey(modelCfg, provider);
    if (!apiKey) {
      var eKey = makeError("能力调用缺少 API Key（" + cap.key + "）", 0, "NO_KEY");
      if (modelCfg) { eKey.modelId = modelCfg.id; eKey.modelName = modelCfg.name; }
      throw eKey;
    }
    var headers = xtCapMergeHeaders(req.headers, provider, modelCfg, apiKey);
    var timeoutMs = (cap && typeof cap.timeout === "number" && cap.timeout > 0) ? cap.timeout : XT_CAP_TIMEOUT_DEFAULT;
    var target = proxyWrapUrl(String(url), modelCfg ? modelCfg.provider : null);

    var status = 0;
    var raw = "";
    if (req.formData) {
      // multipart（语音识别等）：走 XHR，让浏览器自动带 boundary
      var rx = await xtXhrSend(target, req.formData, headers, timeoutMs, req.method || "POST");
      status = rx.status;
      raw = rx.text;
    } else {
      var fetchOpts = {
        method: req.method || "POST",
        headers: headers,
        body: (req.body != null) ? req.body : ""
      };
      var ctrl = makeAbortController();
      if (ctrl) fetchOpts.signal = ctrl.signal;
      var resp = null;
      try {
        resp = await raceTimeout(fetch(target, fetchOpts), timeoutMs, null,
          "能力调用超时（" + timeoutMs + "ms 未返回）", "TIMEOUT_TOTAL");
      } catch (eT) {
        if (ctrl) { try { ctrl.abort(); } catch (eA) { /* 忽略 */ } }
        if (modelCfg) { eT.modelId = modelCfg.id; eT.modelName = modelCfg.name; }
        throw eT;
      }
      status = respStatus(resp);
      try { raw = await readResponseText(resp); } catch (eR) { raw = ""; }
    }

    var json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch (eP) { json = null; }
    if (!(status >= 200 && status < 300)) {
      var em = xtCapErrText(json, (raw ? String(raw).replace(/\s+/g, " ").slice(0, 200) : ("HTTP " + status)));
      var eHttp = makeError("能力调用失败（" + cap.key + "）：" + status + " " + em, status, "CAP_HTTP");
      if (modelCfg) { eHttp.modelId = modelCfg.id; eHttp.modelName = modelCfg.name; }
      eHttp.apiMessage = em;
      throw eHttp;
    }
    if (!json) {
      var eNj = makeError(nonJsonMessage(status, "", raw), status, "NON_JSON");
      if (modelCfg) { eNj.modelId = modelCfg.id; eNj.modelName = modelCfg.name; }
      throw eNj;
    }
    var out = null;
    try {
      out = cap.parse(json, { meta: (req && req.meta) ? req.meta : {}, modelCfg: modelCfg, input: input || {} });
    } catch (eParse) {
      var ePr = makeError("能力响应解析失败（" + cap.key + "）：" +
        ((eParse && eParse.message) ? eParse.message : "未知原因"), status, "CAP_PARSE");
      if (modelCfg) { ePr.modelId = modelCfg.id; ePr.modelName = modelCfg.name; }
      throw ePr;
    }
    if (!out || out.ok === false) {
      var eOut = makeError(xtCapErrText(json, (out && out.err) ? String(out.err) : ("能力调用失败：" + cap.key)),
        status, "CAP_PARSE");
      if (modelCfg) { eOut.modelId = modelCfg.id; eOut.modelName = modelCfg.name; }
      throw eOut;
    }
    if (sink && typeof sink === "object") {
      sink.capUsage = (out.usage && typeof out.usage === "object") ? out.usage : null;
    }
    return out.result;
  }

  // 取最后一条用户文本（兼容 content 为字符串 / 分段数组），用于给能力补默认输入
  function xtLastUserText(messages) {
    var arr = (messages && messages.length) ? messages : [];
    for (var i = arr.length - 1; i >= 0; i--) {
      var m = arr[i];
      if (!m || m.role !== "user") continue;
      var c = m.content;
      if (typeof c === "string" && c) return c;
      if (c && c.length) {
        var buf = [];
        for (var j = 0; j < c.length; j++) {
          if (c[j] && c[j].type === "text" && typeof c[j].text === "string") buf.push(c[j].text);
        }
        if (buf.length) return buf.join(" ");
      }
    }
    return "";
  }

  // 组装能力输入：调用方 opts.xtInput 为准，缺失项按 messages / 模型配置补默认。
  // 音频等二进制走 opts.xtInput.blob（或 opts.file / opts.blob / opts.audioBlob）。
  function xtBuildCapInput(cap, modelCfg, messages, opt) {
    var o = opt || {};
    var src = (o.xtInput && typeof o.xtInput === "object") ? o.xtInput : {};
    var input = {};
    var k;
    for (k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) input[k] = src[k];
    }
    var txt = xtLastUserText(messages);
    if (input.prompt == null) input.prompt = (o.prompt != null && o.prompt !== "") ? String(o.prompt) : txt;
    if (input.query == null) input.query = input.prompt;
    if (input.text == null) input.text = input.prompt;
    if (input.texts == null) input.texts = input.prompt ? [input.prompt] : [];
    if (input.documents == null) input.documents = [];
    if (input.size == null) {
      input.size = (o.size != null && o.size !== "") ? String(o.size)
        : ((modelCfg && modelCfg.imageSize) ? String(modelCfg.imageSize) : IMAGE_SIZE);
    }
    if (input.batch == null) input.batch = Number(o.batch) || 1;
    if (input.mode == null) input.mode = (cap && cap.defaultMode) ? String(cap.defaultMode) : "";
    if (input.blob == null) {
      if (o.file != null) input.blob = o.file;
      else if (o.blob != null) input.blob = o.blob;
      else if (o.audioBlob != null) input.blob = o.audioBlob;
    }
    if (input.fileName == null) input.fileName = (o.fileName != null) ? String(o.fileName) : "speech.wav";
    return input;
  }

  // 能力结果 -> 对话串：ASR 返回识别文本，其余给一句人类可读摘要（原始对象放 sink.capResult）
  function xtCapResultText(kind, result) {
    if (result == null) return "";
    if (kind === "asr") {
      if (typeof result === "string") return result;
      if (typeof result.text === "string") return result.text;
    }
    if (typeof result === "string") return result;
    if (typeof result === "object") {
      if (kind === "embed") {
        var vs = (result.vectors && result.vectors.length) ? result.vectors.length : 0;
        return "向量嵌入完成：" + vs + " 条 · " + (result.dim || 0) + " 维";
      }
      if (kind === "rerank") {
        var rs = (result.ranked && result.ranked.length) ? result.ranked.length : 0;
        return "结果重排完成：" + rs + " 条";
      }
      if (kind === "imagegen" && result.urls && result.urls.length) {
        var ps = [];
        for (var i = 0; i < result.urls.length; i++) ps.push("![](" + result.urls[i] + ")");
        return ps.join("\n");
      }
      try {
        var s = JSON.stringify(result);
        return s.length > 2000 ? (s.slice(0, 2000) + "…") : s;
      } catch (e) {
        return "";
      }
    }
    return String(result);
  }

  /**
   * 直接跑一次能力（不经过对话降级链），供语音 / 嵌入 / 重排等无对话入口的场景使用，
   * 同时保证每次调用都落一条用量账。
   * @param {string} modelId 模型 id
   * @param {Object} input   能力输入（如 { blob: File } / { texts: [...] } / { prompt, size }）
   * @param {Object} opts    可选：{ xtNoUsage: true } 不记账
   * @returns {Promise<{ok:boolean, kind:string, result:*, usage:*}>}
   */
  async function xtRunCapability(modelId, input, opts) {
    var o = opts || {};
    var raw = findModel(modelId);
    var mc = raw ? applyOverrides(raw) : null;
    if (!mc) throw makeError("未找到模型：" + modelId, 0, "NO_MODEL");
    var info = xtResolveCapability(mc, o);
    if (!info.kind) throw makeError("该模型没有可直连的能力：" + modelId, 0, "NO_CAP");
    var cap = info.cap;
    if (!cap || typeof cap.build !== "function") {
      throw makeError("能力模块未加载：" + info.kind + "（" + modelId + "）", 0, "NO_CAP");
    }
    var startedAt = Date.now();
    var sink = { usage: null, capUsage: null };
    var capInput = (input && typeof input === "object") ? input : {};
    var srcIn = (o.xtInput && typeof o.xtInput === "object") ? o.xtInput : {};
    for (var k in srcIn) {
      if (Object.prototype.hasOwnProperty.call(srcIn, k) && capInput[k] == null) capInput[k] = srcIn[k];
    }
    try {
      var result;
      if (typeof cap.run === "function") {
        /* R92-A：异步能力（video / 3d）自带 run(ctx, onProgress)——创建→轮询→取结果→
           上报模型平台用量全在能力模块内部完成。xtCallCapability 是单发请求链路，
           撑不住分钟级异步任务（视频退到它只会拿到 taskId 拿不到结果）。 */
        var capCfg = getConfig();
        var capProvider = (mc && mc.provider && capCfg && capCfg.providers) ? capCfg.providers[mc.provider] : null;
        var runRes = await cap.run({ modelCfg: mc, provider: capProvider, input: capInput },
                                   (typeof o.onProgress === "function") ? o.onProgress : null);
        if (!runRes || runRes.ok === false) {
          var re = makeError((runRes && runRes.err) ? String(runRes.err) : ("能力执行失败：" + cap.key), 0, "CAP_RUN");
          re.modelId = mc ? mc.id : "";
          re.modelName = mc ? mc.name : "";
          throw re;
        }
        result = runRes.result;
        if (sink && typeof sink === "object") {
          sink.capUsage = (runRes.usage && typeof runRes.usage === "object") ? runRes.usage : null;
        }
      } else {
        result = await xtCallCapability(cap, mc, capInput, o, sink);
      }
      if (o.xtNoUsage !== true) {
        try {
          xtUsageRecordAuto({
            ts: startedAt,
            model: String(mc.name || ""),
            modelId: String(mc.id || ""),
            modelKey: String(mc.model || ""),
            inputText: "",
            reply: xtCapUsageSummary(info.kind, sink.capUsage),
            ok: true,
            capUsage: sink.capUsage,
            ms: Date.now() - startedAt
          });
        } catch (eRec) { /* 记账失败绝不影响主流程 */ }
      }
      return { ok: true, kind: info.kind, result: result, usage: sink.capUsage };
    } catch (e) {
      if (o.xtNoUsage !== true) {
        try {
          xtUsageRecordAuto({
            ts: startedAt,
            model: String(mc.name || ""),
            modelId: String(mc.id || ""),
            modelKey: String(mc.model || ""),
            inputText: "",
            reply: "",
            ok: false,
            kind: info.kind,
            ms: Date.now() - startedAt,
            err: (e && e.message) ? String(e.message) : "能力调用失败"
          });
        } catch (eRec2) { /* 记账失败绝不影响主流程 */ }
      }
      throw e;
    }
  }

  // 账本 reply 摘要：非对话类能力不存完整结果（生图 URL / 向量数组会把 1000 条账本撑爆）
  function xtCapUsageSummary(kind, capUsage) {
    var u = (capUsage && typeof capUsage === "object") ? capUsage : {};
    var n = Math.round(Number(u.n) || 0);
    if (kind === "imagegen") return "「" + n + " 张 · " + (u.size || "未标注分辨率") + "」";
    if (kind === "asr") return "「" + (Math.round(Number(u.chars) || 0)) + " 字 · " + (Number(u.seconds) || 0) + " 秒」";
    if (kind === "embed") return "「" + (Math.round(Number(u.docs) || 0)) + " 条 · " + (Math.round(Number(u.dim) || 0)) + " 维」";
    if (kind === "rerank") return "「" + (Math.round(Number(u.docs) || 0)) + " 条重排」";
    if (kind === "vision") return "「视觉理解 · " + (Math.round(Number(u.inTok) || 0) + Math.round(Number(u.outTok) || 0)) + " tokens」";
    return "「" + kind + " · n=" + n + "」";
  }

  // ==================== 需求 E：模型用量统计（埋点 + 本地账本） ====================
  // 设计约定：
  //   1) 账本只写 localStorage 单键 xt_ai_usage_v1，上限 500 条，超出丢弃最旧的；
  //   2) token 来源优先取上游 usage（prompt_tokens/completion_tokens、input_tokens/output_tokens，
  //      Gemini 走 usageMetadata.promptTokenCount/candidatesTokenCount）；取不到时按字符数估算并在明细里标注；
  //   3) 全程 try/catch：localStorage 不可用 / 超配额 / JSON 损坏 一律静默，绝不抛到对话主流程。
  var USAGE_KEY = "xt_ai_usage_v1";
  // R86：能力层接入后，生图 / 语音 / 嵌入 / 重排 也会各落一条账（此前只有文本会落），
  // 账本填满速度约为改造前的两倍。上限 500 -> 1000，避免近期明细被过早挤出，
  // 1000 条 JSON 约 200~300KB，仍在 localStorage 5MB 配额的安全区内。
  var USAGE_MAX_RECORDS = 1000;
  var USAGE_REPLY_MAX = 500;
  var USAGE_ERR_MAX = 80;
  // 按模型聚合时的分组分隔符（模型名理论上不会包含该控制字符）
  var USAGE_SEP = "\u0001";

  // 本地存储可用性探测（隐私模式 / 老内核下 localStorage 可能直接抛错）
  function xtUsageStorage() {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return null;
      return localStorage;
    } catch (e) {
      return null;
    }
  }

  // token 估算：中文约 1.5 字符/token，英文约 4 字符/token；CJK 与非 CJK 分别计后向上取整
  function xtUsageEstimateTokens(text) {
    var s = String(text == null ? "" : text);
    if (!s) return 0;
    var cjk = 0;
    var other = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if ((code >= 0x2E80 && code <= 0x9FFF) || (code >= 0xAC00 && code <= 0xD7AF) ||
          (code >= 0xF900 && code <= 0xFAFF) || (code >= 0xFF00 && code <= 0xFF60)) {
        cjk++;
      } else if (code > 0x20) {
        other++;
      }
    }
    var n = Math.ceil(cjk / 1.5 + other / 4);
    if (n <= 0) n = 1;
    return n;
  }

  // 把 messages 拍平成纯文本（兼容 content 为字符串 / 分段数组两种形态），用于输入 token 估算
  function xtUsageMessagesText(messages) {
    var out = "";
    var arr = (messages && messages.length) ? messages : [];
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!m) continue;
      var c = m.content;
      if (typeof c === "string") {
        out += c + "\n";
      } else if (c && c.length) {
        for (var j = 0; j < c.length; j++) {
          var p = c[j];
          if (p && typeof p.text === "string") out += p.text + "\n";
        }
      }
    }
    return out;
  }

  // 归一化各家 usage 字段 -> { in, out }；取不到有效值返回 null（调用方据此回落估算）
  function xtUsageNormUsage(u) {
    if (!u || typeof u !== "object") return null;
    var pin = null;
    var pout = null;
    if (u.prompt_tokens != null) pin = Number(u.prompt_tokens);
    else if (u.input_tokens != null) pin = Number(u.input_tokens);
    else if (u.promptTokenCount != null) pin = Number(u.promptTokenCount);
    if (u.completion_tokens != null) pout = Number(u.completion_tokens);
    else if (u.output_tokens != null) pout = Number(u.output_tokens);
    else if (u.candidatesTokenCount != null) pout = Number(u.candidatesTokenCount);
    if (pin != null && (!isFinite(pin) || pin < 0)) pin = null;
    if (pout != null && (!isFinite(pout) || pout < 0)) pout = null;
    if ((pin == null || pin <= 0) && (pout == null || pout <= 0)) return null;
    return {
      in: (pin == null) ? 0 : Math.round(pin),
      out: (pout == null) ? 0 : Math.round(pout)
    };
  }

  // 读取账本：JSON 损坏 / 存储不可用一律返回空数组，绝不影响主流程
  function xtUsageRead() {
    try {
      var ls = xtUsageStorage();
      if (!ls) return [];
      var raw = ls.getItem(USAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!arr || !arr.length) return [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && typeof arr[i] === "object") out.push(arr[i]);
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  // 写入账本：超配额时丢弃最旧的一半后重试一次，仍失败则放弃（静默）
  function xtUsageWrite(arr) {
    try {
      var ls = xtUsageStorage();
      if (!ls) return false;
      ls.setItem(USAGE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      try {
        var ls2 = xtUsageStorage();
        if (!ls2) return false;
        var half = arr.slice(Math.floor(arr.length / 2));
        ls2.setItem(USAGE_KEY, JSON.stringify(half));
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  // 追加一条明细（成功 / 失败都记），超出上限丢弃最旧的
  function xtUsageRecord(entry) {
    try {
      if (!entry || typeof entry !== "object") return false;
      var list = xtUsageRead();
      list.push({
        ts: Number(entry.ts) || Date.now(),
        model: String(entry.model == null ? "" : entry.model) || "未命名模型",
        modelId: String(entry.modelId == null ? "" : entry.modelId),
        ok: entry.ok === false ? false : true,
        inTok: Math.round(Number(entry.inTok) || 0),
        outTok: Math.round(Number(entry.outTok) || 0),
        exact: Number(entry.exact) || 0,
        reply: String(entry.reply == null ? "" : entry.reply).slice(0, USAGE_REPLY_MAX),
        ms: Math.round(Number(entry.ms) || 0),
        err: entry.ok === false ? String(entry.err == null ? "" : entry.err).slice(0, USAGE_ERR_MAX) : ""
      });
      if (list.length > USAGE_MAX_RECORDS) list = list.slice(list.length - USAGE_MAX_RECORDS);
      return xtUsageWrite(list);
    } catch (e) {
      return false;
    }
  }

  // 埋点主入口：由「请求结束」处调用，内部决定 token 是实测还是估算
  // o = { ts, model, modelId, modelKey, inputText, reply, ok, usage, ms, err }
  // exact 位标记：1 = 输入实测，2 = 输出实测（3 = 两者实测，0 = 全估算）
  function xtUsageRecordAuto(o) {
    try {
      var src = o || {};
      var usage = xtUsageNormUsage(src.usage);
      var reply = String(src.reply == null ? "" : src.reply);
      var exact = 0;
      var inTok = 0;
      var outTok = 0;
      if (usage && usage.in > 0) {
        inTok = usage.in;
        exact += 1;
      } else {
        inTok = xtUsageEstimateTokens(src.inputText);
      }
      if (usage && usage.out > 0) {
        outTok = usage.out;
        exact += 2;
      } else {
        outTok = xtUsageEstimateTokens(reply);
      }
      return xtUsageRecord({
        ts: (src.ts != null) ? src.ts : Date.now(),
        model: src.model || src.modelKey || "未命名模型",
        modelId: src.modelId || "",
        ok: src.ok !== false,
        inTok: inTok,
        outTok: outTok,
        exact: exact,
        reply: reply,
        ms: (src.ms != null) ? src.ms : 0,
        err: (src.ok === false) ? (src.err || "") : ""
      });
    } catch (e) {
      return false;
    }
  }

  function xtUsageList() {
    return xtUsageRead();
  }

  function xtUsageClear() {
    try {
      var ls = xtUsageStorage();
      if (!ls) return false;
      ls.setItem(USAGE_KEY, "[]");
      return true;
    } catch (e) {
      return false;
    }
  }

  // 时间范围筛选：today（本地零点起）/ 7d / 30d / all
  function xtUsageFilterByRange(records, range) {
    var arr = (records && records.length) ? records : [];
    var r = String(range == null ? "all" : range);
    if (r === "all") return arr.slice();
    var now = Date.now();
    var start = 0;
    if (r === "today") {
      var d = new Date(now);
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    } else if (r === "7d") {
      start = now - 7 * 24 * 60 * 60 * 1000;
    } else if (r === "30d") {
      start = now - 30 * 24 * 60 * 60 * 1000;
    } else {
      return arr.slice();
    }
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var ts = Number(arr[i] && arr[i].ts);
      if (isFinite(ts) && ts >= start) out.push(arr[i]);
    }
    return out;
  }

  // 汇总行排序：tokens（默认，合计倒序）/ count / in / out / name（名称升序）/ time（最近使用倒序）
  function xtUsageSortRows(rows, sortBy) {
    var arr = (rows && rows.length) ? rows.slice() : [];
    var by = String(sortBy == null ? "tokens" : sortBy);
    arr.sort(function (a, b) {
      if (by === "name") return String(a.model).localeCompare(String(b.model));
      if (by === "count") {
        if (b.count !== a.count) return b.count - a.count;
        return b.total - a.total;
      }
      if (by === "in") {
        if (b.inTok !== a.inTok) return b.inTok - a.inTok;
        return b.total - a.total;
      }
      if (by === "out") {
        if (b.outTok !== a.outTok) return b.outTok - a.outTok;
        return b.total - a.total;
      }
      if (by === "time") {
        if (b.lastTs !== a.lastTs) return b.lastTs - a.lastTs;
        return b.total - a.total;
      }
      if (b.total !== a.total) return b.total - a.total;
      if (b.count !== a.count) return b.count - a.count;
      return String(a.model).localeCompare(String(b.model));
    });
    return arr;
  }

  // 按模型分类汇总：调用次数 / 输入 / 输出 / 合计 / 占比 / 失败数 / 最近使用
  function xtUsageSummarize(records, range, sortBy) {
    var rows = xtUsageFilterByRange(records, range);
    var map = {};
    var order = [];
    var calls = 0;
    var inTok = 0;
    var outTok = 0;
    var fail = 0;
    var lastTs = 0;
    for (var i = 0; i < rows.length; i++) {
      var it = rows[i];
      if (!it) continue;
      var name = String(it.model == null ? "" : it.model) || "未命名模型";
      var mid = String(it.modelId == null ? "" : it.modelId);
      var key = name + USAGE_SEP + mid;
      var row = map[key];
      if (!row) {
        row = {
          model: name, modelId: mid, count: 0, inTok: 0, outTok: 0,
          total: 0, fail: 0, lastTs: 0, exactCount: 0, ratio: 0
        };
        map[key] = row;
        order.push(key);
      }
      var tin = Math.round(Number(it.inTok) || 0);
      var tout = Math.round(Number(it.outTok) || 0);
      var ts = Number(it.ts) || 0;
      row.count += 1;
      row.inTok += tin;
      row.outTok += tout;
      row.total += tin + tout;
      if (it.ok === false) row.fail += 1;
      if (Number(it.exact) || 0) row.exactCount += 1;
      if (ts > row.lastTs) row.lastTs = ts;
      calls += 1;
      inTok += tin;
      outTok += tout;
      if (it.ok === false) fail += 1;
      if (ts > lastTs) lastTs = ts;
    }
    var out = [];
    var totalAll = inTok + outTok;
    for (var k = 0; k < order.length; k++) {
      var rr = map[order[k]];
      rr.ratio = totalAll > 0 ? (rr.total / totalAll) : 0;
      out.push(rr);
    }
    out = xtUsageSortRows(out, sortBy);
    return {
      rows: out,
      calls: calls,
      inTok: inTok,
      outTok: outTok,
      total: totalAll,
      fail: fail,
      lastTs: lastTs,
      range: String(range == null ? "all" : range),
      sortBy: String(sortBy == null ? "tokens" : sortBy)
    };
  }

  function xtUsagePad2(n) {
    var v = Number(n) || 0;
    return (v < 10 ? "0" : "") + v;
  }

  function xtUsageFormatTime(ts) {
    var n = Number(ts) || 0;
    if (!n) return "—";
    var d = new Date(n);
    if (!d.getTime()) return "—";
    var now = new Date();
    var sameYear = (d.getFullYear() === now.getFullYear());
    var md = xtUsagePad2(d.getMonth() + 1) + "-" + xtUsagePad2(d.getDate());
    var hm = xtUsagePad2(d.getHours()) + ":" + xtUsagePad2(d.getMinutes());
    return sameYear ? (md + " " + hm) : (d.getFullYear() + "-" + md + " " + hm);
  }

  function xtUsageFormatNum(n) {
    var v = Math.round(Number(n) || 0);
    var neg = v < 0;
    var t = String(Math.abs(v));
    var out = "";
    while (t.length > 3) {
      out = "," + t.slice(t.length - 3) + out;
      t = t.slice(0, t.length - 3);
    }
    return (neg ? "-" : "") + t + out;
  }

  var XT_AI_USAGE = {
    KEY: USAGE_KEY,
    MAX_RECORDS: USAGE_MAX_RECORDS,
    REPLY_MAX: USAGE_REPLY_MAX,
    record: xtUsageRecord,
    recordAuto: xtUsageRecordAuto,
    list: xtUsageList,
    clear: xtUsageClear,
    estimateTokens: xtUsageEstimateTokens,
    messagesText: xtUsageMessagesText,
    normalizeUsage: xtUsageNormUsage,
    filterByRange: xtUsageFilterByRange,
    sortRows: xtUsageSortRows,
    summarize: xtUsageSummarize,
    formatTime: xtUsageFormatTime,
    formatNum: xtUsageFormatNum
  };

  // ---------- 核心请求（需求 E：主体改名为 requestModelCore，外层 requestModel 包用量埋点） ----------
  async function requestModelCore(modelConfig, messages, onChunk, signal, options, sink) {
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
    // R81：图片生成模型（types 含 imagegen）走 images/generations，绝不进 chat/completions
    if (isImageGenModel(modelConfig)) {
      return await requestImageGeneration(modelConfig, messages, onChunk, signal, opt);
    }

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
        // R73p：思考型模型，输出上限不得低于 GEMINI_MIN_OUTPUT_TOKENS（否则被截断成空响应）
        generationConfig: {
          temperature: tempVal,
          maxOutputTokens: geminiOutputTokens(maxTokVal)
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
    // 需求12：超时/失败时主动中止在途请求，避免「卡住」与资源泄漏（老内核无 AbortController 时自动降级）。
    // 调用方自带 signal（如健康检查）时沿用其 signal，不覆盖，保证外部取消能力不丢失。
    var _ctrl = signal ? null : makeAbortController();
    var _effSignal = signal || (_ctrl ? _ctrl.signal : null);
    if (_effSignal) fetchOpts.signal = _effSignal;
    function abortInFlight() {
      if (_ctrl) { try { _ctrl.abort(); } catch (eAb) { /* 忽略 */ } }
    }

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

    // R77：relay 模式下 needProxy 平台请求改走中转前缀（body/headers 原样透传）
    reqUrl = proxyWrapUrl(reqUrl, modelConfig.provider);
    var resp = null;
    try {
      resp = await raceTimeout(fetch(reqUrl, fetchOpts), respMs, null,
        "模型响应超时（" + respMs + "ms 未返回响应头）", "TIMEOUT_RESPONSE");
    } catch (e) {
      e.requestInfo = debugInfo;
      e.modelId = modelConfig.id;
      e.modelName = modelConfig.name;
      warn("[ai-service] 请求失败/超时", debugInfo, e && e.message);
      abortInFlight();   // 需求12：响应头超时/网络失败时中止在途请求
      throw e;
    }

    if (!resp.ok) {
      // R72：错误响应体改为「一次性文本读取 + 安全解析」，避免 resp.json() 的裸 SyntaxError
      // 冒泡到聊天界面；同时把网关/CDN 的 HTML 错误页收敛成人类可读提示（不再把整段 HTML 塞进 message）。
      // 语义不变：apiErr.status 仍取 resp.status，降级链行为与改造前完全一致。
      var errBody = null;
      var errRaw = "";
      try { errRaw = await readResponseText(resp); } catch (e2) { errRaw = ""; }
      if (errRaw) {
        try { errBody = JSON.parse(errRaw); } catch (e3) { errBody = null; }
      }
      var ecode = (errBody && errBody.error && errBody.error.code) ? errBody.error.code : null;
      var emsg;
      if (errBody && errBody.error && errBody.error.message) {
        emsg = errBody.error.message;
      } else if (errRaw && looksLikeHtml(errRaw)) {
        // 非 JSON 的 HTML 错误页：给人类可读提示，不泄漏裸 SyntaxError / 大段 HTML
        emsg = nonJsonMessage(resp.status, respCtype(resp), errRaw);
      } else if (errRaw) {
        emsg = String(errRaw).replace(/\s+/g, " ").replace(/^ +| +$/g, "").slice(0, 200);
      } else {
        emsg = "HTTP " + resp.status;
      }
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
    // 需求12：uiLive 标记本次流式/整段读取是否仍在有效期内。
    // 超时或失败后（raceTimeout 已 reject）底层仍可能继续吐出增量，
    // 届时必须丢弃这些「迟到增量」，否则会污染已切换到下一个模型的同一界面元素。
    var uiLive = true;
    function emit(delta, full) {
      if (!uiLive) return;
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
        uiLive = false;       // 需求12：停止接收迟到增量
        abortInFlight();      // 需求12：中止在途请求，避免「永远卡着」
        throw e4;
      }
      if (streamResult) {
        // 需求 E：流式响应里的 usage（有则记为实测值，没有则由外层按字符数估算）
        if (streamResult.usage && sink) sink.usage = streamResult.usage;
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
        abortInFlight();   // 需求12：整段读取超时，中止在途请求
        throw e5;
      }
      // R72：整段读取到 HTML（网关/CDN 错误页）时，直接给人类可读错误，绝不当作答案渲染
      if (looksLikeHtml(whole)) {
        var njErr = makeError(nonJsonMessage(resp.status, respCtype(resp), whole), resp.status, "NON_JSON");
        njErr.requestInfo = debugInfo;
        njErr.modelId = modelConfig.id;
        njErr.modelName = modelConfig.name;
        abortInFlight();
        throw njErr;
      }
      try {
        fullText = extractContent(String(whole), null, sink);
      } catch (e6) {
        e6.requestInfo = debugInfo;
        e6.modelId = modelConfig.id;
        e6.modelName = modelConfig.name;
        abortInFlight();   // 需求12：解析失败同样中止在途请求
        throw e6;
      }
      if (fullText && onChunk && fullText.length > 24) {
        try { await simulateTyping(fullText, onChunk); } catch (e7) { /* 忽略 */ }
      } else if (fullText && onChunk) {
        try { onChunk(fullText, fullText); } catch (e8) { /* 忽略 */ }
      }
    }

    // R73p：Gemini 空响应单独归类 —— 多为思考 token 吃满 maxOutputTokens 被截断，
    // 与「网络慢/超时」成因完全不同，必须区分，否则上层会谎报成「响应慢，检测超时」。
    if (!fullText && isGemini) {
      var gTruncErr = makeError("Gemini 返回空内容（finishReason=" +
        (geminiFinishReason(whole) || "UNKNOWN") + "，多为输出上限过小被截断）", 0, "TRUNCATED");
      gTruncErr.requestInfo = debugInfo;
      gTruncErr.modelId = modelConfig.id;
      gTruncErr.modelName = modelConfig.name;
      warn("[ai-service] Gemini 返回空内容（疑似输出上限截断）", debugInfo);
      abortInFlight();
      throw gTruncErr;
    }

    if (!fullText) {
      var emptyErr = makeError("模型返回空内容", 0, "EMPTY");
      emptyErr.requestInfo = debugInfo;
      emptyErr.modelId = modelConfig.id;
      emptyErr.modelName = modelConfig.name;
      warn("[ai-service] 模型返回空内容", debugInfo);
      abortInFlight();   // 需求12：空回复同样中止在途请求，随后交给上层降级
      throw emptyErr;
    }

    return fullText;
  }

  // 需求 E：requestModel 外层包裹 —— 每次请求（成功 / 失败）都写一条用量明细。
  // 埋点全程 try/catch：localStorage 不可用 / 超配额 / JSON 损坏都不会影响正常对话。
  async function requestModel(modelConfig, messages, onChunk, signal, options) {
    var opt = options || {};
    // 健康检查等内部探测不计入用量（「批量检测」一次会灌进十几条噪声，把真实用量挤出去）
    if (opt.xtNoUsage === true) {
      return await requestModelCore(modelConfig, messages, onChunk, signal, opt, { usage: null });
    }
    var startedAt = Date.now();
    var sink = { usage: null };
    var mName = (modelConfig && modelConfig.name) ? String(modelConfig.name) : "";
    var mId = (modelConfig && modelConfig.id) ? String(modelConfig.id) : "";
    var mKey = (modelConfig && modelConfig.model) ? String(modelConfig.model) : "";
    var inputText = "";
    try { inputText = xtUsageMessagesText(messages); } catch (eIn) { inputText = ""; }
    try {
      var text = await requestModelCore(modelConfig, messages, onChunk, signal, opt, sink);
      xtUsageRecordAuto({
        ts: startedAt,
        model: mName,
        modelId: mId,
        modelKey: mKey,
        inputText: inputText,
        reply: (typeof text === "string") ? text : "",
        ok: true,
        usage: sink.usage,
        ms: Date.now() - startedAt
      });
      return text;
    } catch (e) {
      xtUsageRecordAuto({
        ts: startedAt,
        model: mName,
        modelId: mId,
        modelKey: mKey,
        inputText: inputText,
        reply: "",
        ok: false,
        usage: sink.usage,
        ms: Date.now() - startedAt,
        err: (e && e.message) ? String(e.message) : "请求失败"
      });
      throw e;
    }
  }

  // ---------- R83：需梯子平台判定与降级提示（依据 providers[x].needVPN / needProxy） ----------
  function providerDisplayName(pname) {
    var cfg = getConfig();
    if (pname && cfg && cfg.providers && cfg.providers[pname] && cfg.providers[pname].name) {
      return cfg.providers[pname].name;
    }
    return pname ? String(pname) : "该平台";
  }
  function platformNeedsLadder(pname) {
    var cfg = getConfig();
    var p = (pname && cfg && cfg.providers) ? cfg.providers[pname] : null;
    return !!(p && (p.needVPN === true || p.needProxy === true));
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
    // R73p：选中生图模型（types 含 imagegen）时必须直连 images/generations ——
    // 服务端中转只做 chat/completions，永远生不出图，此前正是被这条捷径吃掉导致「生图无图」。
    var selId = (opts && opts.model && opts.model !== "auto") ? opts.model : getSelectedModelId();
    var selModel = selId ? findModel(selId) : null;
    var selIsImageGen = isImageGenModel(selModel);
    var realType = opts.image ? "vision"
      : (selIsImageGen ? "imagegen" : resolveFuncType(funcType, msgs, !!opts.image));
    if (!opts.image && !selIsImageGen) {
      var provs = await relayProviders();
      // R103：中转优先走「所选模型所属平台」，避免别的平台抢先接单跑默认模型（见 prioritizeProvider）
      if (selModel && selModel.provider) provs = prioritizeProvider(provs, selModel.provider);
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
          var relayStart = Date.now();
          // R88-M1：把用户选中的模型 id 透传给中转，服务端据此解析真实模型名
          var relayOpts = {};
          for (var rk in reqOpts) { if (Object.prototype.hasOwnProperty.call(reqOpts, rk)) relayOpts[rk] = reqOpts[rk]; }
          if (selId) relayOpts.modelId = selId;
          // R103：带上前端已知的真实模型名，供服务端在 id 解析落空时反查 registry
          // （解决「前端 id 与后端 registry 键不统一 -> 恒回退 .env 默认模型」的根因）。
          if (selModel && selModel.model) relayOpts.modelName = String(selModel.model);
          var relayed = await relayChat(provs, relayMsgs, tempR, maxTR, opts.onChunk, relayOpts);
          // 用量明细要显示「实际调用的模型名」：采用服务端回传的真实模型名；
          // 拿不到时用本地选中模型的真实模型串（ai-config 的 model 字段）兜底；
          // 再拿不到才用可辨别的「平台名」+ 未知标记——始终不伪造『看起来正常』的假名。
          var relayUsedModel = (relayed && relayed.modelUsed) ? String(relayed.modelUsed) : "";
          if (!relayUsedModel && selModel && selModel.model) relayUsedModel = String(selModel.model);
          if (!relayUsedModel) {
            relayUsedModel = (relayed && relayed.providerName)
              ? (String(relayed.providerName) + "（模型名未知）")
              : "服务端中转（模型名未知）";
          }
          xtUsageRecordAuto({
            ts: relayStart,
            model: relayUsedModel,
            modelId: (relayed && relayed.providerId) ? ("relay:" + relayed.providerId) : "relay",
            modelKey: "relay",
            inputText: xtUsageMessagesText(relayMsgs),
            reply: (relayed && relayed.text) ? String(relayed.text) : "",
            ok: true,
            usage: null,
            ms: Date.now() - relayStart
          });
          return {
            text: relayed.text,
            model: "relay:" + relayed.providerId,
            modelUsed: "relay:" + relayed.providerId,
            modelUsedName: relayed.providerName,
            // R104-项4：把「是否回退」与「实际执行的模型名」一并回传页面，
            // 供其显式提示「已切换为 X 回答」。modelUsedReal 即 X-Ai-Model-Used（真实模型串）。
            modelFallback: !!(relayed && relayed.modelFallback),
            modelUsedReal: relayUsedModel,
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
    var lastFailed = null;

    // 实际使用的模型回传：先按链路首节点通知一次（页面可即时显示「由 XXX 回答」）
    function notifyModel(m) {
      if (opts.onModelUsed) {
        try { opts.onModelUsed(m.id, m.name); } catch (e) { /* 忽略 */ }
      }
    }

    // 需求 D-2 / D-3 + R83：降级提示分场景（需梯子 / 限流 / 慢 / 其他），不静默失败。
    function notifyFallback(m, reason, prev) {
      var msg;
      var prevProvider = prev ? prev.provider : null;
      if (reason === "ratelimit") {
        msg = "当前模型额度已用完/被限流，已自动降级";
      } else if ((reason === "network" || reason === "slow" || reason === "error") &&
                 platformNeedsLadder(prevProvider)) {
        msg = providerDisplayName(prevProvider) + " 需要梯子访问，请检查网络或切换到国内模型";
      } else if (reason === "slow") {
        msg = "响应较慢，已切换模型：" + m.name;
      } else {
        msg = "已切换到 " + m.name + " 模型";
      }
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
      // R83：海外平台已判离线（auto 探测失败）-> 直接跳过国内链前不等待超时/429
      if (isProviderOffline(m.provider)) { continue; }

      try {
        if (attempted > 0) notifyFallback(m, degradeReason, lastFailed);
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
        lastFailed = m;
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

        // R83：区分「网络不可达」（无 HTTP 状态且非超时）与 5xx/空回复，便于给出「需梯子」提示
        if (!st && !(e && e.timedOut)) { degradeReason = "network"; }
        else { degradeReason = "error"; }
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
  var HEALTH_TIMEOUT = 5000;
  // R73n：needProxy 平台（gemini/openrouter）走梯子，完整请求链路慢（TLS+推理），
  // 5s 窗口会误杀——实测平台探测 1.5s 可达，但生成请求超 5s 很常见，被误报成「需要梯子」。
  // 放宽到 15s；国内平台维持 5s。
  var HEALTH_TIMEOUT_PROXY = 15000;

  // err 分类如实：http_<code> / cors / network / timeout / empty
  function classifyHealthErr(e) {
    if (!e) return "network";
    if (e.timedOut) return "timeout";
    var msg = String(e && e.message ? e.message : "").toLowerCase();
    if (msg.indexOf("abort") !== -1) return "timeout";
    var st = (e.status != null) ? e.status : 0;
    if (st) return "http_" + st;
    if (e.code === "TRUNCATED") return "truncated";
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
  //   window.aiHealthCheck(modelId, cfgOverride) -> Promise<{ok:boolean, ms:number, err:string|null, kind:string}>
  //   cfgOverride（可选）: { apiUrl, apiKey, apiFormat, extraHeaders, modelId }
  // - 传 cfgOverride 时：用临时配置构造请求（apiUrl/apiKey/apiFormat/extraHeaders 覆盖；
  //   cfgOverride.modelId 覆盖实际请求的模型 id），不读也不写 ai_model_settings.overrides、
  //   不修改任何已存配置、结果不落盘（由调用方决定）。
  // - 不传时：行为与改造前完全一致（走 overrides 合并后的模型配置）。
  // - 保持：maxTokens=1、绝不触发 recordCall / 不计入限频；err 值域
  //   （http_XXX / cors / network / timeout / empty）并新增 no_endpoint / no_key /
  //   unsupported_probe（R87/T02：该能力未实现自动探测，不再误报 http_400）。
  //   R83：连通性检测超时统一 5 秒（文档 §四），超时即判不可用并降级，不长时间等待；
  //   图片生成模型改走 images/generations 专用检测，超时 60s（实测约 35s）。
  //   R87 / T02：按模型能力分派探测——xtResolveCapability 找到接管能力后：
  //     有 cap.probe(function) -> 走专用探针；无 probe 的文本族能力（vision/translate）
  //     回落文本探测；无 probe 的非对话能力（asr/embed/rerank/video/model3d）返回
  //     unsupported_probe。隐藏第三实参 batchScan===true（由 aiHealthCheckBatch 传入）
  //     时，按 cap.probeNoAuto===true（取不到则按 kind 兜底）跳过成本极高的探针。
  //     凡「按策略跳过 / 无法自动探测」一律带 skipped:true，err 仍取 unsupported_probe
  //     （不新增 err 值域）；消费方据 skipped 判定「不写 health」（保持「无记录=可见」）。
  function aiHealthCheckImpl(modelId, cfgOverride) {
    // 第三实参（隐藏）：批量扫描标记。对外声明的签名保持 (modelId, cfgOverride) 不变。
    var batchScan = (arguments.length > 2 && arguments[2] === true);
    return new Promise(function (resolve) {
      var startedAt = Date.now();
      var ov = (cfgOverride && typeof cfgOverride === "object") ? cfgOverride : null;
      var raw = findModel(modelId);
      if (!raw && !ov) {
        resolve({ ok: false, ms: 0, err: "not_found", kind: "" });
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
      // 极短 ping（"hi" + maxTokens=1）不烧 token；
      // R73p：Gemini 3.x 思考型模型不能压到 1（会被思考 token 吃满截断成空响应），改用下限值
      var ping = mc;
      ping.maxTokens = isGeminiFormat(ping) ? GEMINI_MIN_OUTPUT_TOKENS : 1;
      // R73n：按平台选检测窗口——needProxy 平台 15s，其余 5s
      var hTimeout = (mc && mc.provider && providerNeedProxy(mc.provider))
        ? HEALTH_TIMEOUT_PROXY : HEALTH_TIMEOUT;

      // 端点 / Key 缺失：不抛异常，返回新增 err 值（调用方线1 会映射成用户可读文案）
      var eff = resolveEffectiveEndpointKey(ping);
      if (!eff.apiUrl) { resolve({ ok: false, ms: 0, err: "no_endpoint", kind: "" }); return; }
      if (!eff.apiKey) { resolve({ ok: false, ms: 0, err: "no_key", kind: "" }); return; }
      // R81：图片生成模型走 images/generations 专用检测（最小 prompt），不用文本聊天接口误报失败
      if (isImageGenModel(ping)) {
        var iCtrl = (typeof AbortController === "function") ? new AbortController() : null;
        var iTimer = iCtrl ? setTimeout(function () {
          try { iCtrl.abort(); } catch (eIA) { /* 忽略 */ }
        }, IMAGE_TIMEOUT_HEALTH) : null;
        requestImageGeneration(ping, [], null, iCtrl ? iCtrl.signal : null,
          { prompt: "a red apple", responseTimeout: IMAGE_TIMEOUT_HEALTH, totalTimeout: IMAGE_TIMEOUT_HEALTH })
          .then(function (out) {
            if (iTimer) clearTimeout(iTimer);
            finish({ ok: !!out, ms: Date.now() - startedAt, err: out ? null : "empty", kind: "imagegen" });
          }, function (eImg) {
            if (iTimer) clearTimeout(iTimer);
            finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eImg), kind: "imagegen" });
          });
        return;
      }

      // ---------- R87 / T02：能力分派（生图分支之后、文本兜底之前） ----------
      // 复用 xtResolveCapability 解析该模型对应的能力：
      //   1) cap 且 typeof cap.probe === 'function'                     -> 走 cap.probe(ctx) 专用探针；
      //   2) cap 无 probe 且为文本族（vision / translate / text）        -> 回落文本探测（零回归）；
      //   3) cap 无 probe 且为非对话能力（asr/embed/rerank/video/model3d） -> unsupported_probe；
      //   4) 无 cap（纯文本模型，含注册表缺失）                          -> 回落文本探测（行为不变）。
      // 探针绝不触发 recordCall / 不进 10 次/分钟限频（与既有健康检查同层）。
      var capInfo = xtResolveCapability(ping);
      var capObj = (capInfo && capInfo.cap) ? capInfo.cap : null;
      var capKind = (capInfo && capInfo.kind) ? String(capInfo.kind) : "";
      if (capObj && typeof capObj.probe === "function") {
        // 成本保护：由能力模块用 probeNoAuto===true 声明「不进『检测全部』自动批量」（设计 §3.3）；
        // 取不到该字段时退回按 kind 兜底（video / model3d 单次约 10 万 / 3 万 tokens）。
        // 用户手动单模型检测（不经 aiHealthCheckBatch）仍允许提交探针。
        var noAuto = (typeof capObj.probeNoAuto === "boolean")
          ? capObj.probeNoAuto
          : (capKind === "video" || capKind === "model3d");
        if (batchScan && noAuto) {
          // skipped:true -> 消费方据此「不写 health」（保持「无记录=可见」），绝不把策略跳过当失败隐藏
          finish({ ok: false, skipped: true, ms: 0, err: "unsupported_probe", kind: capKind });
          return;
        }
        var cfgP = getConfig();
        var provP = (ping && ping.provider && cfgP && cfgP.providers) ? cfgP.providers[ping.provider] : null;
        var pTimeout = (typeof capObj.probeTimeout === "number" && capObj.probeTimeout > 0)
          ? capObj.probeTimeout
          : ((typeof capObj.timeout === "number" && capObj.timeout > 0) ? capObj.timeout : XT_CAP_TIMEOUT_DEFAULT);
        var probeRes = null;
        try {
          probeRes = capObj.probe({ modelCfg: ping, provider: provP, timeout: pTimeout });
        } catch (eProbe) {
          finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eProbe), kind: capKind });
          return;
        }
        // 契约（设计 §3.3）：probe 返回 Promise<{ok, err, detail?}>；非 Promise 视为空结果
        if (!probeRes || typeof probeRes.then !== "function") {
          finish({ ok: false, ms: Date.now() - startedAt, err: "empty", kind: capKind });
          return;
        }
        probeRes.then(function (pr) {
          var ok = !!(pr && pr.ok);
          var perr = ok ? null : ((pr && pr.err) ? String(pr.err) : "empty");
          finish({ ok: ok, ms: Date.now() - startedAt, err: perr, kind: capKind });
        }, function (eProbe2) {
          finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eProbe2), kind: capKind });
        });
        return;
      }
      if (capObj) {
        // 有 cap 无 probe：vision / translate 本就是「文本族」（其探针即文本 chat）；
        // 其余非对话能力没有专用探测，返回 unsupported_probe（不再把「用错接口的 400」呈现为模型不可用）。
        if (capKind !== "vision" && capKind !== "translate" && capKind !== "text") {
          // skipped:true -> 「无法自动探测」而非「探测失败」，消费方据此不写 health（不隐藏）
          finish({ ok: false, skipped: true, ms: 0, err: "unsupported_probe", kind: capKind });
          return;
        }
      }
      // 文本兜底（纯文本模型 / vision / translate / 注册表缺失）：kind 如实记录
      var textKind = capKind ? capKind : "text";

      // 总超时（R73n：needProxy 平台 15s，其余 5s）：复用 raceTimeout（老 WebView 兼容）；有 AbortController 时再加一层硬中止
      var ctrl = null;
      var timer = null;
      if (typeof AbortController === "function") {
        ctrl = new AbortController();
        timer = setTimeout(function () {
          try { ctrl.abort(); } catch (eAb) { /* 忽略 */ }
        }, hTimeout);
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
        { responseTimeout: hTimeout, firstTokenTimeout: hTimeout, totalTimeout: hTimeout, xtNoUsage: true }
      ).then(function (text) {
        if (text) finish({ ok: true, ms: Date.now() - startedAt, err: null, kind: textKind });
        else finish({ ok: false, ms: Date.now() - startedAt, err: "empty", kind: textKind });
      }, function (e) {
        finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(e), kind: textKind });
      });
    });
  }

  // R87 / T02：批量扫描专用入口——成本极高的能力（video / model3d）探针不进「检测全部」自动批量。
  // 对外签名 (modelId, cfgOverride) 与 aiHealthCheck 完全一致；仅向 impl 注入隐藏的 batchScan 标记。
  function aiHealthCheckBatch(modelId, cfgOverride) {
    return aiHealthCheckImpl(modelId, cfgOverride, true);
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

  // ---------- R77：auto 模式启动探测（后台静默，结果缓存 10 分钟供降级链与设置页使用） ----------
  try {
    if (getProxyConfig().mode === "auto" && typeof fetch === "function" && needProxyProviders().length) {
      probeProxyPlatforms();
    }
  } catch (eProbe) { /* 探测绝不影响主流程 */ }

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
    healthCheck: aiHealthCheckImpl,
    healthCheckBatch: aiHealthCheckBatch,
    // R77：海外平台代理访问
    getProxyConfig: getProxyConfig,
    probeProxyPlatforms: probeProxyPlatforms,
    isProviderOffline: isProviderOffline,
    proxyWrapUrl: proxyWrapUrl,
    usage: XT_AI_USAGE,
    // R92-A\uff1a\u80fd\u529b\u76f4\u8fde\u5165\u53e3\uff08\u5f02\u6b65\u80fd\u529b cap.run \u5206\u53d1\u5728 xtRunCapability \u5185\u90e8\u5b8c\u6210\uff09
    xtRunCapability: xtRunCapability
  };

  if (typeof window !== "undefined") {
    window.AI_SERVICE = AI_SERVICE;
    window.callAI = callAI;
    // R92-A：能力直连入口（video / 3d 等 types 模型）；守卫式挂载，避免全局名冲突
    if (typeof window.xtRunCapability !== "function") window.xtRunCapability = xtRunCapability;    // R64 N4 跨线契约（守卫式挂载，避免与既有全局名冲突）
    if (typeof window.aiGetModelSettings !== "function") window.aiGetModelSettings = aiGetModelSettingsImpl;
    if (typeof window.aiSaveModelSettings !== "function") window.aiSaveModelSettings = aiSaveModelSettingsImpl;
    if (typeof window.aiHealthCheck !== "function") window.aiHealthCheck = aiHealthCheckImpl;
    // R87 / T02：批量扫描入口（video / model3d 探针不进「检测全部」）。守卫式挂载，避免全局名冲突。
    if (typeof window.aiHealthCheckBatch !== "function") window.aiHealthCheckBatch = aiHealthCheckBatch;
    // 需求 E：模型用量账本（用量页 assets/xt-aiusage.js 直接消费该对象）
    window.XT_AI_USAGE = XT_AI_USAGE;
  }
})();
