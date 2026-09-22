// ============ 模型用量统计（需求 E）：内嵌在「模型设置页 → 关于 Tab」的小节 ============
// 依赖：assets/ai-service.js 在 window 上暴露的 XT_AI_USAGE（账本读写 / token 估算 / 汇总 / 筛选 / 排序）。
// 本文件只负责「挂载、懒渲染、筛选、排序、交互、按能力口径展示」；数据一律取自真实调用写入的账本。
//
// 懒渲染设计（不改 ai-settings.js）：
//   1) 脚本自身在 #setUsageRoot（不存在则自建并挂到 #setPanelAbout 末尾）里渲染；
//   2) 只在「关于」Tab 变为激活态时才渲染 —— 通过 #setTabAbout 的 click + MutationObserver
//      监听 #setPanelAbout 的 class 变化双重触发，并用 setTimeout(0) 合并成一次渲染；
//   3) 只读复用页面既有 Tab 切换逻辑（panel.className 含 'active' 即激活），绝不修改它。
//
// 老 WebView 兼容：不使用可选链、空值合并、顶层 await、正则后行断言；不使用 alert / confirm / prompt。
//
// 多能力口径说明（本文件只做展示，不生产数据）：
//   账本里每条记录除 {ts, model, modelId, ok, inTok, outTok, exact, reply, ms, err} 外，
//   还有 kind（text/vision/imagegen/asr/embed/rerank）、n（张数 / 条数）、extra（JSON 字符串，
//   形如 {"size":"1024x1024","seconds":6.159,"chars":23,"dim":1024,"docs":3}）。
//   老记录可能没有这三个字段：kind 缺省按 text、n 缺省 0、extra 缺省空串，解析一律 try/catch。

(function () {
  // 明细列表每次展示条数，点「加载更多」按此步长追加
  var DETAIL_STEP = 50;
  // 「清空」二次确认的有效期（毫秒）：超时自动复位，避免误触
  var CLEAR_ARM_MS = 5000;

  var MOUNT_ID = "setUsageRoot";
  var PANEL_ID = "setPanelAbout";
  var TAB_ID = "setTabAbout";

  // 账本在 localStorage 里的键（与 assets/ai-service.js 的 USAGE_KEY 保持一致，此处只读）
  var USAGE_KEY = "xt_ai_usage_v1";

  // R87/T04：服务端用量接口（免登录）与鉴权探测键
  var SERVER_USAGE_PATH = "/api/ai/usage";
  var SERVER_TIMEOUT_MS = 8000;
  var SERVER_TTL_MS = 15000;                    // 同一会话内 15s 不重复打接口
  var AUTH_TOKEN_KEY = "study_workbench_token"; // assets/api.js 写入的登录态键
  var AUTH_FLAG_KEY = "study_workbench_auth";
  var SETTINGS_LS_KEY = "ai_model_settings";    // 与 ai-settings.js 同键（只读：取 overrides[id].name 用户重命名）

  // R151：用量明细折叠态记忆键（"1"=收起【缺省】 "0"=展开），带 xt- 前缀
  var DETAIL_FOLD_KEY = "xt_us_detail_fold";
  // R151-2：按模型累计区折叠态记忆键（同上口径），带 xt- 前缀
  var MODEL_FOLD_KEY = "xt_us_model_fold";

  // 服务端快照状态机：idle | loading | ok | unauthorized | missing | error
  var serverState = {
    phase: "idle",
    http: 0,
    reason: "",
    data: null,
    at: 0,
    loading: false
  };

  // 能力 kind → 中文名（顺序即「按能力统计」的展示顺序，保证前后一致、不跳动）
  var KIND_ORDER = ["text", "vision", "imagegen", "asr", "embed", "rerank"];
  var KIND_LABEL = {
    text: "文本对话",
    vision: "视觉理解",
    imagegen: "生图",
    asr: "语音识别",
    embed: "向量嵌入",
    rerank: "结果重排"
  };

  var state = {
    range: "all",              // today | 7d | 30d | all
    sortBy: "tokens",          // tokens | count | in | out | name | time（本机「按能力」区块用）
    quotaSort: "remaining",    // R88-A A 口径：remaining | remainingDesc | used | quota | name
    quotaFilter: "all",        // R88-A A 口径：all | low | exhausted | unknown
    limit: DETAIL_STEP,
    clearArmed: false,
    mounted: false
  };

  var el = {};
  var clearTimer = null;
  var statusTimer = null;
  var renderTimer = null;
  // R88-A：服务端配额行缓存（renderServer 写入，renderAll 在服务端尚未就绪时也要用它拼总表）
  var serverRowsCache = [];

  // ---------- 基础工具 ----------
  function byId(id) {
    if (typeof document === "undefined" || !document.getElementById) return null;
    return document.getElementById(id);
  }

  function store() {
    if (typeof window === "undefined") return null;
    return window.XT_AI_USAGE ? window.XT_AI_USAGE : null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtNum(n) {
    var s = store();
    if (s && typeof s.formatNum === "function") {
      try { return s.formatNum(n); } catch (e) { /* 落到本地实现 */ }
    }
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

  function pad2(n) {
    var v = Number(n) || 0;
    return (v < 10 ? "0" : "") + v;
  }

  function fmtTime(ts) {
    var s = store();
    if (s && typeof s.formatTime === "function") {
      try { return s.formatTime(ts); } catch (e) { /* 落到本地实现 */ }
    }
    var d = new Date(Number(ts) || 0);
    if (!d.getTime()) return "—";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function setText(id, txt) {
    var node = byId(id);
    if (node) node.textContent = String(txt == null ? "" : txt);
  }

  function show(node, on) {
    if (!node) return;
    node.style.display = on ? "" : "none";
  }

  // 提示优先复用站内 toast（xt-toast.js / ai-settings.js），都没有才退回区块内状态行
  function toast(msg) {
    var txt = String(msg == null ? "" : msg);
    var done = false;
    try {
      if (typeof window !== "undefined" && typeof window.xtToast === "function") {
        window.xtToast(txt);
        done = true;
      } else if (typeof window !== "undefined" && typeof window.showToast === "function") {
        window.showToast(txt);
        done = true;
      }
    } catch (e) {
      done = false;
    }
    if (done) return;
    if (!el.status) return;
    el.status.textContent = txt;
    el.status.className = "xt-us-status on";
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      if (el.status) {
        el.status.textContent = "";
        el.status.className = "xt-us-status";
      }
      statusTimer = null;
    }, 2200);
  }

  // ---------- 多能力字段读取（向后兼容：老记录没有 kind / n / extra） ----------
  // kind 缺省按 "text" 兜底；未知 kind 也按 "text" 处理，避免展示层崩掉。
  function normKind(it) {
    var k = "";
    if (it && typeof it === "object") k = String(it.kind == null ? "" : it.kind);
    if (!k) return "text";
    for (var i = 0; i < KIND_ORDER.length; i++) {
      if (KIND_ORDER[i] === k) return k;
    }
    return "text";
  }

  function kindLabel(k) {
    var v = KIND_LABEL[k];
    return v ? v : "文本对话";
  }

  // n 缺省 0（契约要求）；仅 imagegen / embed / rerank 的 n 有业务含义
  function numN(it) {
    if (!it || typeof it !== "object") return 0;
    var v = Number(it.n);
    return isFinite(v) && v > 0 ? Math.round(v) : 0;
  }

  // extra 可能已经是对象（个别写入路径），也可能是 JSON 字符串，也可能缺失 / 坏串
  function parseExtra(it) {
    if (!it || typeof it !== "object") return {};
    var ex = it.extra;
    if (ex == null || ex === "") return {};
    if (typeof ex === "object") return ex;
    var raw = String(ex);
    if (!raw) return {};
    try {
      var obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    } catch (e) {
      return {};   // 坏 JSON 不崩，当作无附加字段
    }
  }

  // 条数：优先取 n，n 缺失时退回 extra.docs（契约里 extra 示例含 docs 字段）
  function docsOf(it, ex) {
    var n = numN(it);
    if (n > 0) return n;
    var d = Number(ex && ex.docs);
    return isFinite(d) && d > 0 ? Math.round(d) : 0;
  }

  function pushUniq(arr, val) {
    var v = String(val == null ? "" : val);
    if (!v) return;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === v) return;
    }
    arr.push(v);
  }

  // ---------- 按能力聚合 ----------
  function summarizeKinds(records) {
    var map = {};
    var i, it, k, ex, row;
    for (i = 0; i < records.length; i++) {
      it = records[i];
      if (!it || typeof it !== "object") continue;
      k = normKind(it);
      ex = parseExtra(it);
      row = map[k];
      if (!row) {
        row = {
          kind: k, count: 0, okCount: 0, failCount: 0,
          n: 0, chars: 0, seconds: 0, docs: 0,
          dims: [], sizes: [],
          inTok: 0, outTok: 0, total: 0
        };
        map[k] = row;
      }
      var okFlag = (it.ok === false) ? false : true;
      var tin = Math.round(Number(it.inTok) || 0);
      var tout = Math.round(Number(it.outTok) || 0);
      row.count += 1;
      if (okFlag) row.okCount += 1; else row.failCount += 1;
      row.n += numN(it);
      row.chars += Math.round(Number(ex.chars) || 0);
      var sec = Number(ex.seconds);
      row.seconds += isFinite(sec) && sec > 0 ? sec : 0;
      row.inTok += tin;
      row.outTok += tout;
      row.total += tin + tout;
      if (k === "embed" || k === "rerank") row.docs += docsOf(it, ex);
      if (k === "imagegen") pushUniq(row.sizes, ex.size);
      if (k === "embed") {
        var dim = Math.round(Number(ex.dim) || 0);
        if (dim > 0) pushUniq(row.dims, dim);
      }
    }
    var out = [];
    for (i = 0; i < KIND_ORDER.length; i++) {
      row = map[KIND_ORDER[i]];
      if (row && row.count > 0) out.push(row);
    }
    return out;
  }

  // 概览需要的三个跨能力合计：生图张数 / 识别字符数 / 识别时长
  function kindTotals(kindRows) {
    var t = { images: 0, chars: 0, seconds: 0 };
    for (var i = 0; i < kindRows.length; i++) {
      var r = kindRows[i];
      if (r.kind === "imagegen") t.images += r.n;
      if (r.kind === "asr") {
        t.chars += r.chars;
        t.seconds += r.seconds;
      }
    }
    return t;
  }

  function fmtSeconds(sec) {
    var v = Number(sec) || 0;
    if (!isFinite(v) || v < 0) v = 0;
    return v.toFixed(1);
  }

  // R88-A：把「还能撑 N 天」（服务端推算）如实格式化：
  //   <1 天 → 折算小时（保留 1 位）；≥1 天 → 保留 1 位天；非常大 → 保留整数天
  //   取不到 / 非有限值 → "—"（调用方负责不展示编造值）
  function fmtDays(days) {
    var v = Number(days);
    if (!isFinite(v) || v < 0) return "—";
    if (v < 1) return (v * 24).toFixed(1) + " 小时";
    if (v < 100) return v.toFixed(1) + " 天";
    return Math.round(v) + " 天";
  }

  // ---------- R87/T04：服务端累计口径（GET /api/ai/usage，免登录） ----------
  function numOr(v, dft) {
    var n = Number(v);
    return isFinite(n) ? n : dft;
  }

  function apiBase() {
    try {
      if (typeof window !== "undefined" && typeof window.API_BASE === "string") return window.API_BASE;
    } catch (e) { /* ignore */ }
    return "";   // 缺失时退化为同源相对路径
  }

  function hasLoginToken() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      if (window.localStorage.getItem(AUTH_TOKEN_KEY)) return true;
      return window.localStorage.getItem(AUTH_FLAG_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  // 超时保护：优先 AbortController（老内核缺失时走 Promise.race 兜底）
  function withTimeout(p, ms, ctrl) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctrl && typeof ctrl.abort === "function") {
          try { ctrl.abort(); } catch (e) { /* ignore */ }
        }
        reject(new Error("timeout"));
      }, ms);
      p.then(function (v) {
        if (done) return; done = true; clearTimeout(timer); resolve(v);
      }, function (e) {
        if (done) return; done = true; clearTimeout(timer); reject(e);
      });
    });
  }

  function readJsonSafe(res) {
    if (res && typeof res.json === "function") {
      try {
        var pr = res.json();
        if (pr && typeof pr.then === "function") return pr;
      } catch (e) { /* fallthrough */ }
    }
    return Promise.resolve(null);
  }

  // 打服务端用量接口，归纳为 { phase, http, reason, data }：
  //   ok           → 成功
  //   unauthorized → 401/403（现网旧后端即 401）
  //   missing      → 404（后端未提供该接口）
  //   error        → 网络失败 / 超时 / JSON 解析失败 / 其它非 2xx
  function serverSnapshot() {
    if (typeof fetch !== "function") {
      return Promise.resolve({ phase: "error", reason: "no-fetch" });
    }
    var url = apiBase() + SERVER_USAGE_PATH;
    var ctrl = null;
    // R151 根因修复：带登录态请求。此前固定只带 Accept 头（无 Authorization），
    // 服务端按 R88-F 游客脱敏一律返回空 models，导致登录用户的「服务端累计 /
    // 剩余 / 状态 / 按模型累计（服务端）」永远不更新（用户投诉的「好像没接通」）。
    // token 缺失时不带头，仍走游客口径（游客空态文案保留，行为不回归）。
    var reqHeaders = { "Accept": "application/json" };
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        var tok = window.localStorage.getItem(AUTH_TOKEN_KEY);
        if (tok) reqHeaders["Authorization"] = "Bearer " + tok;
      }
    } catch (e) { /* 读不到登录态：按游客口径请求 */ }
    var opts = { method: "GET", headers: reqHeaders };
    if (typeof AbortController !== "undefined") {
      try { ctrl = new AbortController(); opts.signal = ctrl.signal; } catch (e) { ctrl = null; }
    }
    return withTimeout(fetch(url, opts), SERVER_TIMEOUT_MS, ctrl).then(function (res) {
      var status = (res && typeof res.status === "number") ? res.status : 0;
      if (status === 401 || status === 403) return { phase: "unauthorized", http: status };
      if (status === 404) return { phase: "missing", http: 404 };
      if (status < 200 || status >= 300) return { phase: "error", http: status };
      return readJsonSafe(res).then(function (json) {
        if (!json || typeof json !== "object") return { phase: "error", http: status, reason: "bad-json" };
        return { phase: "ok", http: status, data: json };
      }, function () {
        return { phase: "error", http: status, reason: "bad-json" };
      });
    }, function () {
      return { phase: "error", reason: "network" };
    });
  }

  // percent 夹取（对接文档「坑 11」：超额时后端可能给 >100，如 300/200=150%）
  function clampPct(percent, used, freeQuota) {
    var p = Number(percent);
    if (!isFinite(p)) {
      var u = Number(used) || 0, q = Number(freeQuota) || 0;
      p = q > 0 ? (u / q) * 100 : 0;
    }
    if (!isFinite(p) || p < 0) p = 0;
    if (p > 100) p = 100;
    return p;
  }

  // status：ok（剩余>20%）/ low（剩余≤20%）/ exhausted（剩余=0）/ unknown（额度表里没有）
  function deriveStatus(rec) {
    if (rec && rec.status) return String(rec.status);
    if (rec && rec.exhausted === true) return "exhausted";
    var rem = Number(rec && rec.remaining), q = Number(rec && rec.freeQuota);
    if (!isFinite(rem) || !isFinite(q) || q <= 0) return "unknown";
    if (rem <= 0) return "exhausted";
    if (rem <= q * 0.2) return "low";
    return "ok";
  }

  function fmtOrDash(v) {
    var n = Number(v);
    return isFinite(n) ? fmtNum(n) : "—";
  }

  // ---------- 模型显示名解析（只读，不写） ----------
  // 口径对齐 ai-settings.js 的 displayName()：用户重命名覆盖 > 内置名 > 回退 modelId。
  function settingsOverrides() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      var raw = window.localStorage.getItem(SETTINGS_LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && typeof o === "object" && o.overrides && typeof o.overrides === "object") return o.overrides;
    } catch (e) { /* 坏数据：当作无覆盖 */ }
    return null;
  }
  function builtinNameOf(modelId) {
    try {
      var cfg = (typeof window !== "undefined") ? window.AI_CONFIG : null;
      var arr = (cfg && cfg.builtinModels) ? cfg.builtinModels : null;
      if (!arr || !arr.length) return "";
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        if (m && String(m.id) === String(modelId) && m.name) return String(m.name);
      }
    } catch (e) { /* AI_CONFIG 未就绪：回退 */ }
    return "";
  }
  // 取不到一律回退 modelId 原值（服务端可能有本地没有的旧模型 / 他人自定义模型；不报错、不丢行）
  function displayNameOf(modelId) {
    var id = String(modelId == null ? "" : modelId);
    if (!id) return id;
    var ov = settingsOverrides();
    if (ov && ov[id] && typeof ov[id] === "object" && ov[id].name) {
      var nm = String(ov[id].name);
      if (nm) return nm;
    }
    var bn = builtinNameOf(id);
    if (bn) return bn;
    return id;
  }

  // 服务端 models{id:{used,calls,failCalls,freeQuota,quotaType,remaining,percent,status,
  //   exhausted,estRemainingRuns,expireAt,expired}} → 规整行（兼容旧字段 used / limit / date）
  function buildServerRows(json) {
    var rows = [];
    var models = (json && typeof json.models === "object" && json.models) ? json.models : null;
    if (!models) return rows;
    for (var id in models) {
      if (!Object.prototype.hasOwnProperty.call(models, id)) continue;
      var rec = models[id] || {};
      var fq = numOr(rec.freeQuota, NaN);
      var rem = numOr(rec.remaining, NaN);
      var calls = numOr(rec.calls, 0);
      var used = numOr(rec.used, 0);
      rows.push({
        key: String(id),
        id: String(id),
        name: displayNameOf(id),                            // 中文显示名（覆盖 > 内置 > 回退 id）
        todayCalls: calls,                                  // 服务端无「今日」拆分，以累计调用参与排序
        lastTs: numOr(rec.at, numOr(rec.ts, 0)),
        calls: calls,
        used: used,
        failCalls: numOr(rec.failCalls, 0),
        freeQuota: isFinite(fq) ? fq : 0,
        quotaType: rec.quotaType ? String(rec.quotaType) : "",
        remaining: isFinite(rem) ? rem : NaN,
        percent: clampPct(rec.percent, used, isFinite(fq) ? fq : 0),
        status: deriveStatus(rec),
        exhausted: rec.exhausted === true,
        // R88-A：预估耗尽相关字段按需读取，缺失一律 NaN / ""，展示层如实写「—」
        estRemainingRuns: numOr(rec.estRemainingRuns, NaN),
        estRemainingRunsTxt: rec.estRemainingRunsTxt == null ? "" : String(rec.estRemainingRunsTxt),
        estBaselineTs: numOr(rec.estBaselineTs, 0),
        estAvgPerDay: numOr(rec.estAvgPerDay, NaN),
        estDays: numOr(rec.estDays, NaN),
        expireAt: rec.expireAt == null ? "" : String(rec.expireAt),
        expired: rec.expired === true
      });
    }
    return rows;
  }

  // 本地账本 → 规整行（累计口径，含今日次数 / 最近时间）
  function buildLocalRows(records) {
    var map = {};
    var now = new Date();
    var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (var i = 0; i < records.length; i++) {
      var it = records[i];
      if (!it || typeof it !== "object") continue;
      var mid = (it.modelId == null) ? "" : String(it.modelId);
      var name = mid ? displayNameOf(mid) : String(it.model == null ? "" : it.model);
      if (!name) name = "未知模型";
      var key = mid || name;
      var row = map[key];
      if (!row) {
        // R88-A：多留一个 sourceModel（账本里记录的原始模型名），
        // 万一某条记录匹配不到服务端配额表，展示层可如实回退到它，不伪造模型名。
        row = {
          key: key, name: name, todayCalls: 0, lastTs: 0, calls: 0, total: 0, fail: 0,
          sourceModel: String(it.model == null ? "" : it.model)
        };
        map[key] = row;
      }
      var ts = Number(it.ts) || 0;
      row.calls += 1;
      row.total += (Math.round(Number(it.inTok) || 0) + Math.round(Number(it.outTok) || 0));
      if (it.ok === false) row.fail += 1;
      if (ts > row.lastTs) row.lastTs = ts;
      if (ts >= dayStart) row.todayCalls += 1;
    }
    var out = [];
    for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]); }
    return out;
  }

  // 统一排序：今日次数 ↓ → 最近时间 ↓ → 名称 ↑（三级 + 原序稳定）
  // 所有展示分支（本地 / 服务端 / 并列表）一律走这里，不许各写一套。
  function sortRows(rows) {
    var deco = [];
    for (var i = 0; i < rows.length; i++) deco.push({ r: rows[i], i: i });
    deco.sort(function (a, b) {
      var ra = a.r, rb = b.r;
      var at = Number(ra.todayCalls) || 0, bt = Number(rb.todayCalls) || 0;
      if (bt !== at) return bt - at;
      var al = Number(ra.lastTs) || 0, bl = Number(rb.lastTs) || 0;
      if (bl !== al) return bl - al;
      var an = String(ra.name == null ? "" : ra.name), bn = String(rb.name == null ? "" : rb.name);
      if (an < bn) return -1;
      if (an > bn) return 1;
      return a.i - b.i;   // 稳定：保持原相对顺序
    });
    var out = [];
    for (var k = 0; k < deco.length; k++) out.push(deco[k].r);
    return out;
  }

  // ---------- R88-A：A 口径（剩余可用量 remaining）排序 / 筛选纯函数 ----------
  // 说明：本机账本没有「配额」概念，配额四项指标只来自服务端账本（buildServerRows）。
  //       remaining 取不到（NaN）的模型统一归为「未知额度」，永远排在最后，不参与高亮。
  function remOfRow(r) {
    var v = r ? Number(r.remaining) : NaN;
    return isFinite(v) ? v : NaN;
  }

  // A 口径排序（排序 / 高亮 / 筛选一律以 remaining 为准，不用 used 当主指标）：
  //   remaining  —— 剩余少 → 多（默认；让用户先看到「快用完」的，符合危险优先直觉）
  //   remainingDesc —— 剩余多 → 少
  //   used —— 已用多 → 少（次要指标，仅在用户显式切换时使用）
  //   quota —— 配额大 → 小；name —— 模型名升序
  // 末尾一律按名称升序 + 原序稳定，保证多次渲染顺序不跳动。
  function sortRowsByRemaining(rows, by) {
    var mode = by || "remaining";
    var deco = [];
    for (var i = 0; i < rows.length; i++) deco.push({ r: rows[i], i: i });
    deco.sort(function (a, b) {
      var ra = a.r || {}, rb = b.r || {};
      var va = remOfRow(ra), vb = remOfRow(rb);
      var aOk = isFinite(va), bOk = isFinite(vb);
      if (aOk !== bOk) return aOk ? -1 : 1;   // 额度未知的排最后
      if (aOk && bOk && va !== vb) {
        if (mode === "remainingDesc") return vb - va;
        return va - vb;
      }
      if (mode === "used") {
        var ua = Number(ra.used) || 0, ub = Number(rb.used) || 0;
        if (ub !== ua) return ub - ua;
      } else if (mode === "quota") {
        var qa = Number(ra.freeQuota) || 0, qb = Number(rb.freeQuota) || 0;
        if (qb !== qa) return qb - qa;
      }
      var an = String(ra.name == null ? "" : ra.name);
      var bn = String(rb.name == null ? "" : rb.name);
      if (an < bn) return -1;
      if (an > bn) return 1;
      return a.i - b.i;
    });
    var out = [];
    for (var k = 0; k < deco.length; k++) out.push(deco[k].r);
    return out;
  }

  // A 口径筛选桶（纯函数，便于单测）：
  //   额度未知（remaining 取不到）→ "unknown"
  //   剩余 = 0 → "exhausted"；剩余 / 配额 ≤ 10% → "low"；否则 "ok"
  //   注意：这里「危险」判定用固定 10% 阈值（与 deriveStatus 的 20%「额度偏低」不同档），
  //        是 R88-A 的筛选口径，不改动 deriveStatus / statusLabel 的既有语义。
  function remainingBucket(r) {
    var rem = remOfRow(r);
    if (!isFinite(rem)) return "unknown";
    if (rem <= 0) return "exhausted";
    var q = Number(r && r.freeQuota);
    if (isFinite(q) && q > 0) return (rem / q) <= 0.1 ? "low" : "ok";
    return "low";   // 剩余有值但配额未知：只能如实标「偏低」，不编造配额
  }

  // 状态中文名（服务端口径：ok / low / exhausted / unknown）
  function statusLabel(st) {
    if (st === "ok") return "可用";
    if (st === "low") return "额度偏低";
    if (st === "exhausted") return "额度耗尽";
    return "额度未知";
  }

  // R88-A 危险高亮（A 口径：只按 remaining 判定，不用 used）
  //   exhausted —— 剩余 = 0（红，最危险）
  //   low       —— 剩余 / 配额 ≤ 10%（橙，快耗尽）
  //   其余（含额度未知）—— 不套警示色，如实展示
  function riskOfRow(r) {
    var b = remainingBucket(r);
    if (b === "exhausted") return "exhausted";
    if (b === "low") return "low";
    return "";
  }

  function riskLabelOf(b) {
    if (b === "exhausted") return "已耗尽";
    if (b === "low") return "快耗尽";
    return "";
  }

  function serverStatusText(st) {
    if (st.phase === "loading") return "加载中…";
    if (st.phase === "ok") return st.at ? ("更新于 " + fmtTime(st.at)) : "已连接";
    if (st.phase === "unauthorized") return "需新版后端";
    if (st.phase === "missing") return "接口未提供";
    if (st.phase === "error") return "暂不可用";
    return "未连接";
  }

  // 降级分支表（§6 T04 / G4）
  function serverNoteText(st) {
    if (st.phase === "unauthorized") {
      // R151：401 现在只可能出现在「带 token 但已过期」的场景（游客口径本就放行 200），
      // 文案如实区分，不再误导用户以为是后端版本问题。
      if (hasLoginToken()) return "登录态已失效，服务端累计暂不可用（HTTP " + (st.http || 401) + "）；此处展示本机口径。";
      return "服务端用量需新版后端（当前接口返回 " + (st.http || 401) + "）；此处展示本机口径。";
    }
    if (st.phase === "missing") return "后端未提供用量接口（HTTP 404）；此处展示本机口径。";
    if (st.phase === "error") {
      if (st.reason === "no-fetch") return "当前环境不支持 fetch；服务端用量暂不可用。";
      if (st.reason === "bad-json") return "服务端返回内容无法解析；服务端用量暂不可用。";
      return "网络异常或超时；服务端用量暂不可用。";
    }
    return "";
  }

  // 空态文案：区分「0 是因为游客未登录」与「0 是因为真的没有用量」
  function serverEmptyText(st) {
    if (st.phase === "ok") {
      if (!hasLoginToken()) return "游客模式：服务端不记录个人今日用量（登录后可查看账号级累计）";
      return "服务端暂无用量记录（已登录，账号级累计为 0）";
    }
    if (st.phase === "unauthorized") return "服务端用量需新版后端，暂无法展示";
    if (st.phase === "missing") return "后端未提供用量接口";
    return "服务端用量暂不可用";
  }

  function readLocalRecords() {
    var s = store();
    if (!s || typeof s.list !== "function") return [];
    try { return s.list() || []; } catch (e) { return []; }
  }

  // 双口径并列表：本机记录 × 服务端累计（也走 sortRows 统一排序）
  function renderCompare(localRows, serverRows) {
    var cmp = el.compareList;
    if (!cmp) return;
    localRows = sortRows(localRows);   /* 本地分支也走统一排序（与其它分支同口径） */
    var map = {};
    var i, r;
    for (i = 0; i < localRows.length; i++) {
      r = localRows[i];
      map[r.key] = { key: r.key, name: r.name, todayCalls: r.todayCalls, lastTs: r.lastTs, localCalls: r.calls, localTotal: r.total };
    }
    for (i = 0; i < serverRows.length; i++) {
      r = serverRows[i];
      var row = map[r.key];
      if (!row) { row = { key: r.key, name: r.name, todayCalls: r.calls, lastTs: r.lastTs, localCalls: 0, localTotal: 0 }; map[r.key] = row; }
      row.serverUsed = r.used;
      row.serverCalls = r.calls;
      row.remaining = r.remaining;
      row.percent = r.percent;
      row.status = r.status;
      row.todayCalls = Math.max(Number(row.todayCalls) || 0, Number(r.calls) || 0);
      row.lastTs = Math.max(Number(row.lastTs) || 0, Number(r.lastTs) || 0);
    }
    var rows = [];
    for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) rows.push(map[k]); }
    rows = sortRows(rows);
    if (!rows.length) {
      cmp.innerHTML = '<div class="xt-us-inline-empty">暂无可对照的模型记录</div>';
      return;
    }
    var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">' +
      '<thead><tr style="color:#999;">' +
        '<th style="text-align:left;padding:6px 8px;font-weight:500;">模型</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">本机调用</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">本机 Token</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">服务端累计</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">剩余</th>' +
        '<th style="text-align:left;padding:6px 8px;font-weight:500;">状态</th>' +
      "</tr></thead><tbody>";
    for (var t = 0; t < rows.length; t++) {
      var rr = rows[t];
      var remTxt = isFinite(rr.remaining) ? fmtNum(rr.remaining) : "—";
      html += '<tr style="border-top:1px solid var(--ai-border);">' +
        '<td style="padding:6px 8px;">' + esc(rr.name) + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + fmtNum(rr.localCalls || 0) + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + fmtNum(rr.localTotal || 0) + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + (isFinite(rr.serverUsed) ? fmtNum(rr.serverUsed) : "—") + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + remTxt + "</td>" +
        '<td style="padding:6px 8px;">' + esc(rr.status ? statusLabel(rr.status) : "—") + "</td>" +
        "</tr>";
    }
    html += "</tbody></table>" +
      '<div class="xt-us-hint" style="margin-top:6px;">对照说明：服务端口径为账号级累计值（无「今日」拆分），本机口径来自本机浏览器账本；两列口径不同，不能直接相减对账。</div>' +
      "</div>";
    cmp.innerHTML = html;
  }

  // 挂载后渲染服务端区块（四态区分）
  function renderServer() {
    var st = serverState;
    setText("UsageServerStatus", serverStatusText(st));
    var noteEl = byId("UsageServerNote");
    var note = serverNoteText(st);
    if (noteEl) {
      if (note) { noteEl.textContent = note; noteEl.style.display = ""; }
      else { noteEl.textContent = ""; noteEl.style.display = "none"; }
    }
    var list = el.serverList;
    var cmp = el.compareList;
    if (st.phase !== "ok" || !st.data) {
      setText("UsageServerModels", "—");
      setText("UsageServerUsed", "—");
      setText("UsageServerToday", "—");
      setText("UsageServerLimit", "—");
      serverRowsCache = [];
      // R88-A：配额四项指标统一在「按模型单独列出」区块呈现，这里只如实说明口径，
      // 不重复渲染第二份模型列表（避免一处改口径、另一处没跟上而互相矛盾）。
      if (list) {
        list.innerHTML = '<div class="xt-us-inline-empty">' + esc(serverEmptyText(st)) + '</div>';
      }
      if (cmp) cmp.innerHTML = '<div class="xt-us-inline-empty">服务端数据不可用，暂无法对照</div>';
      renderQuotaModels(buildLocalRows(readLocalRecords()), []);
      return;
    }
    var json = st.data;
    var rows = buildServerRows(json);
    serverRowsCache = rows;
    var sumUsed = 0;
    for (var i = 0; i < rows.length; i++) sumUsed += Number(rows[i].used) || 0;
    setText("UsageServerModels", fmtNum(rows.length));
    setText("UsageServerUsed", fmtNum(sumUsed));
    setText("UsageServerToday", fmtOrDash(json.used));
    setText("UsageServerLimit", fmtOrDash(json.limit));
    if (list) {
      list.innerHTML = rows.length
        ? '<div class="xt-us-hint">已连接：共 ' + fmtNum(rows.length) +
          " 个模型的配额/用量数据，已在「按模型单独列出」区块逐条展示（排序、高亮、筛选一律以「剩余可用量」为准，A 口径）。</div>"
        : '<div class="xt-us-inline-empty">' + esc(serverEmptyText(st)) + "</div>";
    }
    renderCompare(buildLocalRows(readLocalRecords()), rows);
    renderQuotaModels(buildLocalRows(readLocalRecords()), rows);
  }

  // 拉服务端快照（带 TTL + 单飞保护），完成后渲染。
  // R151：force=true 时绕过 15s TTL —— 「进入关于 tab / 打开模型设置页」强制重取，
  // 让刚结束的调用立刻反映到「服务端累计 / 剩余 / 状态」；仍保留单飞保护，
  // 失败静默降级（phase 落到 error，渲染层如实展示），不加高频轮询。
  function loadServer(force) {
    if (serverState.loading) return;
    var now = Date.now();
    if (!force && serverState.at && (now - serverState.at) < SERVER_TTL_MS) { renderServer(); return; }
    serverState.loading = true;
    serverState.phase = "loading";
    renderServer();
    serverSnapshot().then(function (res) {
      serverState.loading = false;
      serverState.phase = (res && res.phase) ? res.phase : "error";
      serverState.http = (res && res.http) || 0;
      serverState.reason = (res && res.reason) || "";
      serverState.data = (res && res.data) || null;
      serverState.at = Date.now();
      renderServer();
    }, function () {
      serverState.loading = false;
      serverState.phase = "error";
      serverState.reason = "network";
      serverState.at = Date.now();
      renderServer();
    });
  }

  // ---------- 挂载点 ----------
  function skeleton() {
    var cells = [
      ["UsageTotalCalls", "调用次数"],
      ["UsageTotalTokens", "合计 Token"],
      ["UsageInTokens", "输入 Token"],
      ["UsageOutTokens", "输出 Token"],
      ["UsageModelCount", "涉及模型"],
      ["UsageFailCount", "失败次数"],
      ["UsageImageCount", "生图张数"],
      ["UsageAsrChars", "识别字符数"],
      ["UsageAsrSeconds", "识别时长（秒）"]
    ];
    var cellHtml = "";
    for (var i = 0; i < cells.length; i++) {
      cellHtml += '<div class="xt-us-cell">' +
        '<div class="xt-us-cell-num" id="' + cells[i][0] + '">0</div>' +
        '<div class="xt-us-cell-label">' + cells[i][1] + '</div>' +
        "</div>";
    }

    /* R87/T04：服务端累计口径概览格（初始占位 —，避免误导为 0） */
    var serverCells = [
      ["UsageServerModels", "涉及模型"],
      ["UsageServerUsed", "账号累计调用"],
      ["UsageServerToday", "本人今日"],
      ["UsageServerLimit", "今日上限"]
    ];
    var serverCellHtml = "";
    for (var si = 0; si < serverCells.length; si++) {
      serverCellHtml += '<div class="xt-us-cell">' +
        '<div class="xt-us-cell-num" id="' + serverCells[si][0] + '">—</div>' +
        '<div class="xt-us-cell-label">' + serverCells[si][1] + '</div>' +
        "</div>";
    }

    return '<div class="xt-about-block" id="UsageBlock">' +
        '<div class="xt-about-block-h">' +
          '<div class="xt-about-block-t">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>用量统计' +
          "</div>" +
          '<div class="xt-us-hint" id="UsageUpdatedAt">—</div>' +
        "</div>" +

        '<div class="xt-us-warnbar" id="UsageStoreWarn" style="display:none;">' +
          "统计模块未加载成功（assets/ai-service.js）。请刷新页面重试；用量记录仍会在对话时正常累计。" +
        "</div>" +

        '<div class="xt-us-overview">' + cellHtml + "</div>" +

        '<div id="UsageServerWrap" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ai-border);">' +
          '<div class="xt-us-sublabel"><span>服务端累计</span><span class="xt-us-hint" id="UsageServerStatus">加载中…</span></div>' +
          '<div class="xt-us-warnbar" id="UsageServerNote" style="display:none;"></div>' +
          '<div class="xt-us-overview">' + serverCellHtml + "</div>" +
          '<div class="xt-us-sublabel"><span>按模型累计（服务端）</span></div>' +
          '<div id="UsageServerList"></div>' +
        "</div>" +

        '<div id="UsageCompareWrap" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ai-border);">' +
          '<div class="xt-us-sublabel"><span>双口径对照</span></div>' +
          '<div id="UsageCompareList"></div>' +
        "</div>" +

        '<div class="xt-us-sublabel"><span>时间范围</span></div>' +
        '<div class="xt-us-chips" id="UsageRangeBar">' +
          '<button type="button" class="xt-us-chip" data-range="today">今天</button>' +
          '<button type="button" class="xt-us-chip" data-range="7d">近 7 天</button>' +
          '<button type="button" class="xt-us-chip" data-range="30d">近 30 天</button>' +
          '<button type="button" class="xt-us-chip active" data-range="all">全部</button>' +
        "</div>" +

        '<div class="xt-us-sublabel"><span>排序方式</span></div>' +
        '<div class="xt-us-selectrow">' +
          '<select class="xt-us-select" id="UsageSortSel" aria-label="排序方式">' +
            '<option value="tokens">合计 Token</option>' +
            '<option value="count">调用次数</option>' +
            '<option value="in">输入 Token</option>' +
            '<option value="out">输出 Token</option>' +
            '<option value="name">模型名称</option>' +
            '<option value="time">最近使用</option>' +
          '</select>' +
        "</div>" +

        '<div class="xt-us-empty" id="UsageEmpty" style="display:none;">' +
          '<svg class="xt-us-empty-ico" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' +
          '<div class="xt-us-empty-main" id="UsageEmptyMain">还没有任何用量记录</div>' +
          '<div class="xt-us-empty-sub" id="UsageEmptySub">与模型对话后，这里会按模型统计调用次数与 Token 消耗</div>' +
        "</div>" +

        '<div id="UsageModelWrap">' +
          // R151-2：按模型累计区整体折叠（默认收起 + 记忆 localStorage key: xt_us_model_fold），
          // 标题行常显摘要（模型数 / 已耗尽数，renderQuotaModels 更新），交互同「用量明细」。
          '<button type="button" class="xt-us-foldrow" id="UsageModelFold" aria-expanded="false">' +
            '<span>按模型累计</span>' +
            '<span class="xt-us-foldrow-cur" id="UsageModelFoldCur"></span>' +
            '<svg class="xt-us-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>' +
          "</button>" +
          '<div class="xt-us-foldbody" id="UsageModelFoldBody">' +
            '<div class="xt-us-sublabel"><span>按模型单独列出</span></div>' +
            '<div class="xt-us-selectrow">' +
              '<select class="xt-us-select" id="UsageQuotaSortSel" aria-label="模型排序方式">' +
                '<option value="remaining">剩余可用量（少 → 多）</option>' +
                '<option value="remainingDesc">剩余可用量（多 → 少）</option>' +
                '<option value="used">已使用量（多 → 少）</option>' +
                '<option value="quota">资源配额（大 → 小）</option>' +
                '<option value="name">模型名称</option>' +
              '</select>' +
            "</div>" +
            '<button type="button" class="xt-us-foldrow" id="UsageQuotaFilterToggle" aria-expanded="false">' +
              '<span>筛选</span>' +
              '<span class="xt-us-foldrow-cur" id="UsageQuotaFilterCur"></span>' +
              '<svg class="xt-us-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>' +
            "</button>" +
            '<div class="xt-us-foldbody" id="UsageQuotaFilterFold">' +
              '<div class="xt-us-chips" id="UsageQuotaFilterBar">' +
                '<button type="button" class="xt-us-chip active" data-quota-filter="all">全部</button>' +
                '<button type="button" class="xt-us-chip" data-quota-filter="exhausted">已耗尽</button>' +
                '<button type="button" class="xt-us-chip" data-quota-filter="low">剩余不足 10%</button>' +
                '<button type="button" class="xt-us-chip" data-quota-filter="unknown">额度未知</button>' +
              "</div>" +
            "</div>" +
            '<div id="UsageModelList"></div>' +
          "</div>" +
        "</div>" +

        '<div id="UsageKindWrap">' +
          '<div class="xt-us-sublabel"><span>按能力统计</span></div>' +
          '<div id="UsageKindList"></div>' +
        "</div>" +

        '<div id="UsageDetailWrap">' +
          // R151：用量明细默认收起，标题行改折叠按钮（微信式：箭头随态旋转），
          // 条数（UsageDetailCount）挂在标题行随态显示，收起也能看到有多少条。
          '<button type="button" class="xt-us-foldrow" id="UsageDetailFold" aria-expanded="false">' +
            '<span>用量明细</span>' +
            '<span class="xt-us-foldrow-cur" id="UsageDetailCount"></span>' +
            '<svg class="xt-us-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>' +
          "</button>" +
          '<div class="xt-us-foldbody" id="UsageDetailFoldBody">' +
            '<div id="UsageDetailList"></div>' +
            '<button type="button" class="xt-us-more" id="UsageMoreBtn" style="display:none;">加载更多</button>' +
            '<div class="xt-us-clear-row" id="UsageClearRow">' +
              '<button type="button" class="xt-us-clear-head" id="UsageClearHead" aria-expanded="false">' +
                '<span>危险操作 / 清空用量数据</span>' +
                '<svg class="xt-us-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>' +
              "</button>" +
              '<div class="xt-us-clear-body">' +
                '<button type="button" class="xt-us-btn danger" id="UsageClearBtn"><span id="UsageClearTxt">清空用量数据</span></button>' +
              "</div>" +
            "</div>" +
          "</div>" +
          '<div class="xt-us-status" id="UsageStatus"></div>' +
        "</div>" +

        '<div class="xt-us-export-row" style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<button type="button" class="xt-us-btn" id="UsageExportBtn">导出用量 JSON</button>' +
          '<span class="xt-us-hint" id="UsageExportHint">导出 localStorage 原始账本（键名 xt_ai_usage_v1），可与本页数字逐条对账</span>' +
        "</div>" +
        '<div id="UsageExportFallback" style="display:none;margin-top:8px;">' +
          '<div class="xt-us-hint">当前环境不支持直接下载文件，请手动复制下方原始账本内容：</div>' +
          '<textarea id="UsageExportText" readonly spellcheck="false" style="width:100%;box-sizing:border-box;height:170px;margin-top:6px;padding:9px 11px;border:1px solid var(--ai-border);border-radius:10px;background:var(--ai-code-bg);color:var(--ai-text);font-size:12px;line-height:1.6;resize:vertical;-webkit-user-select:text;user-select:text;"></textarea>' +
          '<button type="button" class="xt-us-btn" id="UsageExportCopy" style="margin-top:6px;">全选复制</button>' +
        "</div>" +

      "</div>";
  }

  function cache() {
    el.empty = byId("UsageEmpty");
    el.warn = byId("UsageStoreWarn");
    el.status = byId("UsageStatus");
    el.modelWrap = byId("UsageModelWrap");
    el.modelList = byId("UsageModelList");
    el.quotaSortSel = byId("UsageQuotaSortSel");
    el.sortSel = byId("UsageSortSel");
    el.quotaFilterBar = byId("UsageQuotaFilterBar");
    el.kindWrap = byId("UsageKindWrap");
    el.kindList = byId("UsageKindList");
    el.detailWrap = byId("UsageDetailWrap");
    el.detailList = byId("UsageDetailList");
    el.moreBtn = byId("UsageMoreBtn");
    el.clearBtn = byId("UsageClearBtn");
    el.exportBtn = byId("UsageExportBtn");
    el.exportFallback = byId("UsageExportFallback");
    el.exportText = byId("UsageExportText");
    el.exportCopy = byId("UsageExportCopy");
    el.serverStatus = byId("UsageServerStatus");
    el.serverNote = byId("UsageServerNote");
    el.serverList = byId("UsageServerList");
    el.compareList = byId("UsageCompareList");
  }

  function mount() {
    if (state.mounted && el.root) return true;
    var root = byId(MOUNT_ID);
    if (!root) {
      var panel = byId(PANEL_ID);
      if (!panel || typeof document.createElement !== "function") return false;
      root = document.createElement("div");
      root.id = MOUNT_ID;
      panel.appendChild(root);
    }
    root.innerHTML = skeleton();
    el.root = root;
    cache();
    bind();
    state.mounted = true;
    return true;
  }

  // ---------- 渲染：总览 ----------
  function renderOverview(sum, kTotals) {
    setText("UsageTotalCalls", fmtNum(sum.calls));
    setText("UsageTotalTokens", fmtNum(sum.total));
    setText("UsageInTokens", fmtNum(sum.inTok));
    setText("UsageOutTokens", fmtNum(sum.outTok));
    setText("UsageModelCount", fmtNum(sum.rows.length));
    setText("UsageFailCount", fmtNum(sum.fail));
    var kt = kTotals || { images: 0, chars: 0, seconds: 0 };
    setText("UsageImageCount", fmtNum(kt.images));
    setText("UsageAsrChars", fmtNum(kt.chars));
    setText("UsageAsrSeconds", fmtSeconds(kt.seconds));
    setText("UsageUpdatedAt", sum.lastTs ? fmtTime(sum.lastTs) : "—");
  }

  // ---------- R88-A：按模型单独列出（逐模型一行，不聚合）+ A 口径四项指标 ----------
  // 布局原则：= §1「展示即真可用」——数据取不到一律如实写「—」/「暂无数据」，
  //          不显示假 0、不显示占位符、不显示「即将上线」。
  //
  // 每一项的含义（配额四项只来自服务端账本）：
  //   资源配额 freeQuota —— 该模型配额上限（账本 free 字段，quotaType 标注类型）
  //   已使用量 used      —— 账号级累计消耗
  //   剩余可用量 remaining —— 主指标（A 口径）：排序 / 高亮 / 筛选全看它
  //   预计耗尽时间       —— 服务端 estRemainingRuns（按日均消耗推算的可用次数）；
  //                        服务端未提供时如实写「— 服务端未提供预估」，不自行编造。

  // 展示名：有配额行用服务端 displayNameOf(id)（覆盖 > 内置 > 回退 id）；
  // 未匹配到配额表时，回退到本机记录的原始模型名，再回退「未知模型」。绝不伪造。
  function quotaRowName(localRow, serverRow, id) {
    if (serverRow && serverRow.name) return String(serverRow.name);
    if (localRow && localRow.name) return String(localRow.name);
    if (localRow && localRow.sourceModel) return String(localRow.sourceModel);
    var n = displayNameOf(id);
    return n ? n : "未知模型";
  }

  // 用量行（本机 × 服务端）合并成统一行：本地字段 + 服务端配额字段（无服务端配额则留空）
  function quotaRowOf(localRow, serverRow, id) {
    var r = { key: id, id: id, name: quotaRowName(localRow, serverRow, id) };
    if (localRow) {
      r.localCalls = Number(localRow.calls) || 0;
      r.localTotal = Number(localRow.total) || 0;
      r.todayCalls = Number(localRow.todayCalls) || 0;
      r.lastTs = Number(localRow.lastTs) || 0;
    }
    if (serverRow) {
      r.calls = Number(serverRow.calls) || 0;
      r.used = Number(serverRow.used) || 0;
      r.freeQuota = Number(serverRow.freeQuota) || 0;
      r.quotaType = serverRow.quotaType || "";
      r.remaining = isFinite(Number(serverRow.remaining)) ? Number(serverRow.remaining) : NaN;
      r.percent = Number(serverRow.percent);
      r.status = serverRow.status || "";
      r.estRemainingRuns = serverRow.estRemainingRuns;
      r.estRemainingRunsTxt = serverRow.estRemainingRunsTxt || "";
      r.estBaselineTs = Number(serverRow.estBaselineTs) || 0;
      r.estAvgPerDay = serverRow.estAvgPerDay;
      r.estDays = Number(serverRow.estDays);
      r.hasQuota = true;
    } else {
      r.hasQuota = false;
    }
    return r;
  }

  // 构建「逐模型」总表并应用 A 口径（筛选 → 排序）
  function buildQuotaRows(localRows, serverRows) {
    var map = {};
    var order = [];
    var i, k, row;
    for (i = 0; i < serverRows.length; i++) {
      row = serverRows[i];
      k = String(row.id);
      if (!Object.prototype.hasOwnProperty.call(map, k)) {
        map[k] = { id: k, serverRow: row, localRow: null };
        order.push(k);
      } else {
        map[k].serverRow = row;
      }
    }
    for (i = 0; i < localRows.length; i++) {
      row = localRows[i];
      k = String(row.key);
      if (!Object.prototype.hasOwnProperty.call(map, k)) {
        map[k] = { id: k, serverRow: null, localRow: row };
        order.push(k);
      } else if (!map[k].localRow) {
        map[k].localRow = row;
      }
    }
    var rows = [];
    for (i = 0; i < order.length; i++) {
      var entry = map[order[i]];
      rows.push(quotaRowOf(entry.localRow, entry.serverRow, entry.id));
    }
    // A 口径筛选：默认 all 不改动集合
    if (state.quotaFilter && state.quotaFilter !== "all") {
      var kept = [];
      for (i = 0; i < rows.length; i++) {
        if (remainingBucket(rows[i]) === state.quotaFilter) kept.push(rows[i]);
      }
      rows = kept;
    }
    // A 口径排序：以 remaining 为准（默认升序，快耗尽的排最前）
    return sortRowsByRemaining(rows, state.quotaSort);
  }

  // 剩余可用量主指标（A 口径）：无配额行如实写「无配额数据」，不显示假 0
  function quotaRemainingCell(r) {
    if (!r.hasQuota) return '<span class="xt-us-muted">无配额数据</span>';
    if (!isFinite(Number(r.remaining))) return '<span class="xt-us-muted">—</span>';
    var risk = riskOfRow(r);
    var danger = (risk === "exhausted" || risk === "low");
    return '<span class="xt-us-metric-val' + (danger ? " danger" : "") + '">' +
      fmtNum(r.remaining) + "</span>";
  }

  // 预计耗尽时间（A 口径第四项）：把「还够调用 N 次 + 日均消耗」如实拼成人话
  function quotaDepleteCell(r) {
    if (!r.hasQuota) return '<span class="xt-us-muted">无配额数据</span>';
    if (riskOfRow(r) === "exhausted") return '<span class="xt-us-metric-val danger">已耗尽</span>';
    var hasRuns = isFinite(Number(r.estRemainingRuns));
    var hasDays = isFinite(Number(r.estDays));
    if (!hasRuns && !hasDays) {
      return '<span class="xt-us-muted">— 服务端未提供预估</span>';
    }
    var parts = [];
    if (hasRuns) parts.push("还够 " + fmtNum(Math.round(Number(r.estRemainingRuns))) + " 次调用");
    if (hasDays) parts.push("约 " + fmtDays(Number(r.estDays)) + " 后耗尽");
    return '<span class="xt-us-metric-val">' + esc(parts.join(" · ")) + "</span>";
  }

  function quotaBarPct(r) {
    if (!r.hasQuota) return 0;
    return clampPct(r.percent, r.used, r.freeQuota);
  }

  function quotaCardHtml(r) {
    var risk = riskOfRow(r);
    var pct = quotaBarPct(r);
    var pctTxt = (pct >= 10) ? pct.toFixed(0) : pct.toFixed(1);

    var riskBig = "";
    if (risk === "exhausted") riskBig = '<span class="xt-us-risk danger">已耗尽</span>';
    else if (risk === "low") riskBig = '<span class="xt-us-risk warn">快耗尽 · 剩余不足 10%</span>';

    var idTxt = '<span class="xt-us-raw-id">modelId: ' + esc(r.id) + "</span>";

    var quotaTxt;
    var usedTxt;
    if (r.hasQuota) {
      quotaTxt = fmtNum(r.freeQuota) + (r.quotaType ? ' <span class="xt-us-muted">(' + esc(r.quotaType) + ")</span>" : "");
      usedTxt = fmtNum(r.used);
    } else {
      quotaTxt = '<span class="xt-us-muted">无配额数据</span>';
      usedTxt = '<span class="xt-us-muted">无配额数据</span>';
    }

    var localTxt = "<span>本机调用 " + fmtNum(r.localCalls || 0) + " 次</span>" +
      "<span>本机 Token " + fmtNum(r.localTotal || 0) + "</span>";
    var serverTxt = "";
    if (r.hasQuota) {
      serverTxt = "<span>服务端调用 " + fmtNum(r.calls || 0) + " 次</span>" +
        "<span>已用 " + pctTxt + "%</span>";
      if (r.status) serverTxt += '<span>状态 ' + esc(statusLabel(r.status)) + "</span>";
      if (r.estBaselineTs) {
        serverTxt += "<span>预估基准 " + esc(fmtTime(r.estBaselineTs)) + "</span>";
      }
    }

    return '<div class="xt-us-model' + (risk === "exhausted" ? " danger" : (risk === "low" ? " warn" : "")) + '"' +
        ' data-risk="' + esc(risk) + '">' +
        '<div class="xt-us-model-h">' +
          '<div class="xt-us-model-name">' + esc(r.name) + riskBig + "</div>" +
          '<div class="xt-us-model-tok">剩余 ' + quotaRemainingCell(r) + "</div>" +
        "</div>" +
        '<div class="xt-us-model-id">' + idTxt + "</div>" +
        '<div class="xt-us-bar"><i style="width:' + pctTxt + '%"></i></div>' +
        '<div class="xt-us-metric">' +
          '<div class="xt-us-metric-item"><span class="xt-us-metric-label">资源配额</span>' +
            '<span class="xt-us-metric-val">' + quotaTxt + "</span></div>" +
          '<div class="xt-us-metric-item"><span class="xt-us-metric-label">已使用量</span>' +
            '<span class="xt-us-metric-val">' + usedTxt + "</span></div>" +
          '<div class="xt-us-metric-item"><span class="xt-us-metric-label">剩余可用量</span>' +
            quotaRemainingCell(r) + "</div>" +
          '<div class="xt-us-metric-item"><span class="xt-us-metric-label">预计耗尽时间</span>' +
            quotaDepleteCell(r) + "</div>" +
        "</div>" +
        '<div class="xt-us-model-meta">' + localTxt + serverTxt + "</div>" +
      "</div>";
  }

  // 逐模型（不聚合）渲染总表；el.modelList 不存在时静默跳过（保持原行为）
  function renderQuotaModels(localRows, serverRows) {
    if (!el.modelList) return;
    var all = buildQuotaRows(localRows, serverRows);
    // R151-2：折叠标题行摘要常显（收起也能看到规模）：共 N 个模型 + 已耗尽数
    var exhausted = 0;
    for (var e = 0; e < all.length; e++) {
      if (riskOfRow(all[e]) === "exhausted") exhausted++;
    }
    setText("UsageModelFoldCur", "共 " + fmtNum(all.length) + " 个模型" +
      (exhausted > 0 ? " · 已耗尽 " + fmtNum(exhausted) : ""));
    if (!all.length) {
      var tip = (state.quotaFilter && state.quotaFilter !== "all")
        ? "按当前筛选条件没有匹配的模型（可切回「全部」查看）"
        : "暂无数据：还没有任何模型用量记录";
      el.modelList.innerHTML = '<div class="xt-us-inline-empty">' + esc(tip) + "</div>";
      return;
    }
    var html = "";
    for (var i = 0; i < all.length; i++) html += quotaCardHtml(all[i]);
    el.modelList.innerHTML = html;
  }

  // 兼容旧调用点（renderAll 里仍调 renderModels(sum)）：改为在总表下补一行「本机口径」摘要，
  // 模型逐条列表由 renderQuotaModels 负责，避免重复渲染同一批模型。
  // 函数名 / 签名保持不变（对外契约不动）。
  function renderModels(sum) {
    if (!el.modelList) return;
    if (!sum || !sum.rows || !sum.rows.length) return;   // 空态由 renderQuotaModels 统一给
    var existing = el.modelList.innerHTML;
    var note = '<div class="xt-us-hint" style="margin-top:6px;">本机口径合计：' +
      fmtNum(sum.total) + " tokens · 调用 " + fmtNum(sum.calls) + " 次（逐模型明细见上方各行）</div>";
    if (existing.indexOf("xt-us-hint") === -1) {
      el.modelList.innerHTML = existing + note;
    }
  }

  // ---------- 渲染：按能力汇总 ----------
  // 每种能力口径不同：生图看张数、语音看字符数与时长、嵌入看维度与条数、重排看条数，
  // 文本 / 视觉仍按 Token 看（视觉额外标出「视觉请求次数」）。
  function kindHeadText(r) {
    if (r.kind === "imagegen") return fmtNum(r.n) + " 张";
    if (r.kind === "asr") return fmtNum(r.chars) + " 字符";
    if (r.kind === "embed") return (r.dims.length ? r.dims.join("/") + " 维" : "维度未知");
    if (r.kind === "rerank") return fmtNum(r.docs) + " 条";
    return fmtNum(r.total) + " tokens";
  }

  function kindMetaHtml(r) {
    var html = "<span>调用 " + fmtNum(r.count) + " 次</span>" +
      "<span>成功 " + fmtNum(r.okCount) + "</span>";
    if (r.failCount > 0) {
      html += '<span class="xt-us-warn">失败 ' + fmtNum(r.failCount) + "</span>";
    } else {
      html += "<span>失败 0</span>";
    }
    if (r.kind === "imagegen") {
      html += "<span>张数 " + fmtNum(r.n) + "</span>";
      if (r.sizes.length) html += "<span>分辨率 " + esc(r.sizes.join("、")) + "</span>";
    } else if (r.kind === "asr") {
      html += "<span>字符数 " + fmtNum(r.chars) + "</span>";
      html += "<span>时长 " + fmtSeconds(r.seconds) + "s</span>";
    } else if (r.kind === "embed") {
      html += "<span>维度 " + (r.dims.length ? esc(r.dims.join("/")) : "—") + "</span>";
      html += "<span>条数 " + fmtNum(r.docs) + "</span>";
      html += "<span>合计 " + fmtNum(r.total) + " tokens</span>";
    } else if (r.kind === "rerank") {
      html += "<span>条数 " + fmtNum(r.docs) + "</span>";
      html += "<span>合计 " + fmtNum(r.total) + " tokens</span>";
    } else if (r.kind === "vision") {
      html += "<span>视觉请求 " + fmtNum(r.count) + " 次</span>";
      html += "<span>输入 " + fmtNum(r.inTok) + "</span>";
      html += "<span>输出 " + fmtNum(r.outTok) + "</span>";
    } else {
      html += "<span>输入 " + fmtNum(r.inTok) + "</span>";
      html += "<span>输出 " + fmtNum(r.outTok) + "</span>";
    }
    return html;
  }

  function renderKinds(kindRows) {
    if (!el.kindList) return;
    if (!kindRows || !kindRows.length) {
      el.kindList.innerHTML = '<div class="xt-us-inline-empty">该时间范围内暂无用量记录</div>';
      return;
    }
    var html = "";
    for (var i = 0; i < kindRows.length; i++) {
      var r = kindRows[i];
      html += '<div class="xt-us-model">' +
          '<div class="xt-us-model-h">' +
            '<div class="xt-us-model-name">' + esc(kindLabel(r.kind)) +
              ' <span class="xt-us-tag">' + esc(r.kind) + "</span>" +
            "</div>" +
            '<div class="xt-us-model-tok">' + kindHeadText(r) + "</div>" +
          "</div>" +
          '<div class="xt-us-model-meta">' + kindMetaHtml(r) + "</div>" +
        "</div>";
    }
    el.kindList.innerHTML = html;
  }

  // ---------- 渲染：明细（默认折叠回复） ----------
  // 明细行按 kind 切换文案：生图「N 张 · 分辨率」、语音「N 字符 · X.Xs」、
  // 嵌入「dim 维度 · N 条」、重排「N 条」、视觉保留 Token 并加「视觉」标记、文本维持原样。
  function rowMetaHtml(it, ts, msTxt) {
    var k = normKind(it);
    var ex = parseExtra(it);
    var base = fmtTime(ts);

    if (k === "imagegen") {
      var size = String(ex.size == null ? "" : ex.size);
      return base + " · " + fmtNum(numN(it)) + " 张 · " +
        (size ? esc(size) : "分辨率未知") + (msTxt ? " · " + msTxt : "");
    }
    if (k === "asr") {
      return base + " · " + fmtNum(Math.round(Number(ex.chars) || 0)) + " 字符 · " +
        fmtSeconds(ex.seconds) + "s" + (msTxt ? " · " + msTxt : "");
    }
    if (k === "embed") {
      var dim = Math.round(Number(ex.dim) || 0);
      return base + " · " + (dim > 0 ? fmtNum(dim) + " 维度" : "维度未知") +
        " · " + fmtNum(docsOf(it, ex)) + " 条" + (msTxt ? " · " + msTxt : "");
    }
    if (k === "rerank") {
      return base + " · " + fmtNum(docsOf(it, ex)) + " 条" + (msTxt ? " · " + msTxt : "");
    }

    // text / vision：按 Token 口径
    var tin = Math.round(Number(it.inTok) || 0);
    var tout = Math.round(Number(it.outTok) || 0);
    var exact = Number(it.exact) || 0;
    var tagTxt = (exact === 3) ? "实测" : ((exact === 0) ? "估算" : "部分实测");
    var meta = base + " · 输入 " + fmtNum(tin) + " · 输出 " + fmtNum(tout) +
      " · 合计 " + fmtNum(tin + tout) +
      ' <span class="xt-us-tag">' + tagTxt + "</span>";
    if (k === "vision") meta += ' <span class="xt-us-tag">视觉</span>';
    if (msTxt) meta += " · " + msTxt;
    return meta;
  }

  function rowHtml(it) {
    var ts = Number(it.ts) || 0;
    var okFlag = (it.ok === false) ? false : true;
    var reply = String(it.reply == null ? "" : it.reply);
    var hasReply = reply.length > 0;
    var errTxt = it.err ? String(it.err) : "";
    var msTxt = (Number(it.ms) || 0) > 0 ? (fmtNum(it.ms) + "ms") : "";
    var k = normKind(it);

    var meta = rowMetaHtml(it, ts, msTxt);
    var kindTag = (k === "text")
      ? ""
      : ' <span class="xt-us-tag">' + esc(kindLabel(k)) + "</span>";

    var head = '<div class="xt-us-item-h">' +
        '<div class="xt-us-item-main">' +
          '<div class="xt-us-item-t">' + esc(it.model) +
            '<span class="xt-us-badge ' + (okFlag ? "ok" : "bad") + '">' + (okFlag ? "成功" : "失败") + "</span>" +
            kindTag +
          "</div>" +
          '<div class="xt-us-item-m">' + meta + "</div>" +
          (errTxt ? '<div class="xt-us-item-err">' + esc(errTxt) + "</div>" : "") +
        "</div>";

    if (hasReply) {
      head += '<button type="button" class="xt-us-fold" aria-expanded="false">' +
          "<span>展开回复</span>" +
          '<svg class="xt-us-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>' +
        "</button>";
    }
    head += "</div>";

    var body = hasReply
      ? '<div class="xt-us-item-body"><div class="xt-us-reply">' + esc(reply) + "</div></div>"
      : '<div class="xt-us-item-body"><div class="xt-us-reply muted">（本次无回复内容）</div></div>';

    return '<div class="xt-us-item">' + head + body + "</div>";
  }

  function renderDetails(records) {
    var list = [];
    for (var i = 0; i < records.length; i++) {
      var it = records[i];
      if (it && typeof it === "object") list.push(it);
    }
    list.sort(function (a, b) { return (Number(b.ts) || 0) - (Number(a.ts) || 0); });

    var total = list.length;
    var shown = Math.min(state.limit, total);
    var html = "";
    for (var k = 0; k < shown; k++) html += rowHtml(list[k]);

    if (el.detailList) el.detailList.innerHTML = html;
    show(el.moreBtn, total > shown);
    setText("UsageDetailCount", "共 " + fmtNum(total) + " 条，已显示 " + fmtNum(shown) + " 条");
  }

  // ---------- 空状态 ----------
  function renderEmpty(mainText, subText) {
    setText("UsageEmptyMain", mainText || "还没有任何用量记录");
    setText("UsageEmptySub", subText || "与模型对话后，这里会按模型统计调用次数与 Token 消耗");
    show(el.empty, true);
    show(el.modelWrap, false);
    show(el.kindWrap, false);
    show(el.detailWrap, false);
    setText("UsageTotalCalls", "0");
    setText("UsageTotalTokens", "0");
    setText("UsageInTokens", "0");
    setText("UsageOutTokens", "0");
    setText("UsageModelCount", "0");
    setText("UsageFailCount", "0");
    setText("UsageImageCount", "0");
    setText("UsageAsrChars", "0");
    setText("UsageAsrSeconds", fmtSeconds(0));
    setText("UsageUpdatedAt", "—");
    setText("UsageDetailCount", "");
    if (el.kindList) el.kindList.innerHTML = "";
  }

  // R151：forceServer=true 时 loadServer 绕过 TTL 强制重取（仅 tab 激活路径传 true，
  // 筛选 / 排序 / 加载更多等页内交互仍走 TTL，避免打爆接口）。
  function renderAll(forceServer) {
    if (!mount()) return;
    if (el.sortSel) { el.sortSel.value = state.sortBy; }
    syncQuotaFilterLabel();
    if (el.quotaSortSel) { el.quotaSortSel.value = state.quotaSort; }
    show(el.empty, false);
    show(el.modelWrap, true);
    show(el.kindWrap, true);
    show(el.detailWrap, true);

    loadServer(forceServer === true);   /* R87/T04：服务端累计口径（与本地口径独立渲染，任一为空都不互相覆盖） */

    var s = store();
    if (!s || typeof s.list !== "function") {
      show(el.warn, true);
      renderEmpty("用量账本未就绪", "未能加载统计模块（assets/ai-service.js），请刷新页面后重试");
      return;
    }
    show(el.warn, false);

    var records = [];
    try { records = s.list(); } catch (e1) { records = []; }
    if (!records || !records.length) {
      renderEmpty("还没有任何用量记录", "与模型对话后，这里会按模型统计调用次数与 Token 消耗");
      // R88-A：本机还没记录时，仍按服务端账本逐模型列一遍（配额四项照常展示，不聚合）
      renderQuotaModels([], serverRowsCache);
      return;
    }

    var sum = null;
    try { sum = s.summarize(records, state.range, state.sortBy); } catch (e2) { sum = null; }
    if (!sum) {
      renderEmpty("用量数据解析失败", "本地账本数据异常，可在下方清空后重新累计");
      return;
    }
    if (!sum.calls) {
      renderEmpty("该时间范围内暂无用量记录", "换一个时间范围，或与模型对话后再来看看");
      return;
    }

    var rows = [];
    try { rows = s.filterByRange(records, state.range); } catch (e3) { rows = records; }
    var localRows = buildLocalRows(rows);
    var kindRows = summarizeKinds(rows);
    renderOverview(sum, kindTotals(kindRows));
    // R88-A：逐模型（不聚合）+ A 口径（剩余可用量）总表；
    // 服务端行用缓存（renderServer 已写入）；服务端未就绪时传空数组 → 各行如实标「无配额数据」。
    renderQuotaModels(localRows, serverRowsCache);
    renderModels(sum);
    renderKinds(kindRows);
    renderDetails(rows);
  }

  // ---------- 导出核对：把 localStorage 原始账本下载成 .json ----------
  function readRawLedger() {
    var txt = "";
    try {
      if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
        txt = window.localStorage.getItem(USAGE_KEY) || "";
      }
    } catch (e) {
      txt = "";
    }
    return String(txt == null ? "" : txt);
  }

  // 优先用原始字符串（保持与 localStorage 完全一致）；拿不到或不是合法 JSON 时退回账本接口读出的数组
  function buildExportText() {
    var raw = readRawLedger();
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      } catch (e) { /* 原始串坏了，走接口兜底 */ }
    }
    var s = store();
    var arr = [];
    if (s && typeof s.list === "function") {
      try { arr = s.list(); } catch (e2) { arr = []; }
    }
    return JSON.stringify(arr, null, 2);
  }

  function exportFileName() {
    var d = new Date();
    return "xt-ai-usage-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      "-" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + ".json";
  }

  function downloadJson(name, text) {
    try {
      if (typeof window === "undefined" || typeof window.Blob !== "function") return false;
      if (!window.URL || typeof window.URL.createObjectURL !== "function") return false;
      if (typeof document === "undefined" || !document.createElement || !document.body) return false;
      var blob = new window.Blob([text], { type: "application/json;charset=utf-8" });
      var url = window.URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); } catch (e1) { /* 已移除 */ }
        try { if (window.URL.revokeObjectURL) window.URL.revokeObjectURL(url); } catch (e2) { /* 忽略 */ }
      }, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  function selectExportText() {
    var ta = el.exportText;
    if (!ta) return;
    try { ta.focus(); } catch (e1) { /* 忽略 */ }
    try {
      if (typeof ta.setSelectionRange === "function") {
        ta.setSelectionRange(0, String(ta.value).length);
        return;
      }
    } catch (e2) { /* 继续尝试 select */ }
    try { if (typeof ta.select === "function") ta.select(); } catch (e3) { /* 忽略 */ }
  }

  function showExportFallback(text) {
    if (!el.exportFallback || !el.exportText) return false;
    el.exportText.value = text;
    el.exportFallback.style.display = "";
    selectExportText();
    return true;
  }

  function hideExportFallback() {
    if (!el.exportFallback) return;
    el.exportFallback.style.display = "none";
  }

  function doExport() {
    var text = buildExportText();
    var name = exportFileName();
    if (downloadJson(name, text)) {
      hideExportFallback();
      toast("已导出 " + name + "（原始账本 " + USAGE_KEY + "）");
      return;
    }
    if (showExportFallback(text)) {
      toast("当前环境不支持下载，已展开原文请手动复制");
      return;
    }
    toast("导出失败：当前环境不支持文件下载");
  }

  function bindExport() {
    if (el.exportBtn && el.exportBtn.addEventListener) {
      el.exportBtn.addEventListener("click", doExport);
    }
    if (el.exportCopy && el.exportCopy.addEventListener) {
      el.exportCopy.addEventListener("click", function () {
        selectExportText();
        var copied = false;
        try {
          if (typeof document !== "undefined" && typeof document.execCommand === "function") {
            copied = document.execCommand("copy");
          }
        } catch (e) {
          copied = false;
        }
        toast(copied ? "已复制到剪贴板" : "请长按文本框手动全选复制");
      });
    }
  }

  // ---------- 交互 ----------
  function bindChips(containerId, attr, onPick) {
    var box = byId(containerId);
    if (!box || !box.addEventListener) return;
    box.addEventListener("click", function (ev) {
      var target = ev.target;
      var node = null;
      while (target && target !== box) {
        if (target.getAttribute && target.getAttribute(attr)) { node = target; break; }
        target = target.parentNode;
      }
      if (!node) return;
      var kids = box.getElementsByTagName("button");
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].className && String(kids[i].className).indexOf("xt-us-chip") !== -1) {
          kids[i].className = "xt-us-chip";
        }
      }
      node.className = "xt-us-chip active";
      onPick(node.getAttribute(attr));
    });
  }

  var QUOTA_FILTER_LABEL = { all: "全部", exhausted: "已耗尽", low: "剩余不足 10%", unknown: "额度未知" };
  function syncQuotaFilterLabel() {
    setText("UsageQuotaFilterCur", QUOTA_FILTER_LABEL[state.quotaFilter] || "全部");
  }

  function bindFold() {
    if (!el.detailList || !el.detailList.addEventListener) return;
    el.detailList.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target) return;
      var head = null;
      var cur = target;
      while (cur && cur !== el.detailList) {
        if (cur.className && String(cur.className).indexOf("xt-us-fold") !== -1) { head = cur; break; }
        cur = cur.parentNode;
      }
      if (!head) return;
      // 注意：明细行内还有 .xt-us-item-h / .xt-us-item-m / .xt-us-item-t 等子类名，
      // 直接 indexOf("xt-us-item") 会误命中头部 div，必须按「整词 class」向上找真正的行容器。
      var item = head.parentNode;
      while (item && !/(^|\s)xt-us-item(\s|$)/.test(String(item.className || ""))) {
        item = item.parentNode;
      }
      if (!item) return;
      var open = String(item.className).indexOf("open") !== -1;
      var label = head.getElementsByTagName("span")[0];
      if (open) {
        item.className = "xt-us-item";
        head.setAttribute("aria-expanded", "false");
        if (label) label.textContent = "展开回复";
      } else {
        item.className = "xt-us-item open";
        head.setAttribute("aria-expanded", "true");
        if (label) label.textContent = "收起回复";
      }
    });
  }

  function disarmClear() {
    state.clearArmed = false;
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    if (el.clearBtn) {
      el.clearBtn.className = "xt-us-btn danger";
      setText("UsageClearTxt", "清空用量数据");
    }
  }

  function bindClear() {
    if (!el.clearBtn || !el.clearBtn.addEventListener) return;
    el.clearBtn.addEventListener("click", function () {
      var s = store();
      if (!s || typeof s.clear !== "function") { toast("统计模块未就绪"); return; }
      if (!state.clearArmed) {
        state.clearArmed = true;
        el.clearBtn.className = "xt-us-btn danger armed";
        setText("UsageClearTxt", "再点一次确认清空");
        clearTimer = setTimeout(disarmClear, CLEAR_ARM_MS);
        return;
      }
      var okDone = false;
      try { okDone = s.clear(); } catch (e) { okDone = false; }
      disarmClear();
      state.limit = DETAIL_STEP;
      hideExportFallback();
      toast(okDone ? "已清空用量数据" : "清空失败，请刷新页面重试");
      renderAll();
    });
  }

  /* R90：清空按钮改为「展开收缩」样式 —— 默认收起，点标题行才展开真正的清空按钮，
     与明细行 .xt-us-fold / .xt-us-item.open 同一交互口径（箭头旋转 + 显示 body）。
     危险操作默认折叠，可有效避免误触；#UsageClearBtn / #UsageClearTxt 依旧在展开体内，bindClear() 不受影响。 */
  function bindClearFold() {
    var row = byId("UsageClearRow");
    var head = byId("UsageClearHead");
    if (!row || !head || !head.addEventListener) return;
    head.addEventListener("click", function () {
      var open = String(row.className).indexOf("open") !== -1;
      if (open) {
        row.className = "xt-us-clear-row";
        head.setAttribute("aria-expanded", "false");
      } else {
        row.className = "xt-us-clear-row open";
        head.setAttribute("aria-expanded", "true");
      }
    });
  }

  function bindQuotaFilterFold() {
    var tog = byId("UsageQuotaFilterToggle");
    var fold = byId("UsageQuotaFilterFold");
    if (!tog || !fold || !tog.addEventListener) return;
    tog.addEventListener("click", function () {
      var open = String(tog.className).indexOf("open") !== -1;
      if (open) {
        tog.className = "xt-us-foldrow";
        fold.className = "xt-us-foldbody";
        tog.setAttribute("aria-expanded", "false");
      } else {
        tog.className = "xt-us-foldrow open";
        fold.className = "xt-us-foldbody open";
        tog.setAttribute("aria-expanded", "true");
      }
    });
  }

  // ---------- R151：用量明细整体折叠 ----------
  // 默认收起；记住用户上次选择（localStorage key: xt_us_detail_fold，
  // "1"=收起【缺省】 "0"=展开；读不到 / 坏值一律按收起）。
  // 收起态标题行仍显示条数（UsageDetailCount 在标题行内，renderDetails 照常更新）。
  function detailFoldOpen() {
    var v = "";
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        v = window.localStorage.getItem(DETAIL_FOLD_KEY) || "";
      }
    } catch (e) { v = ""; }
    return v === "0";
  }

  function applyDetailFold() {
    var tog = byId("UsageDetailFold");
    var body = byId("UsageDetailFoldBody");
    if (!tog || !body) return;
    var open = detailFoldOpen();
    tog.className = open ? "xt-us-foldrow open" : "xt-us-foldrow";
    body.className = open ? "xt-us-foldbody open" : "xt-us-foldbody";
    tog.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindDetailFold() {
    var tog = byId("UsageDetailFold");
    if (!tog || !tog.addEventListener) return;
    applyDetailFold();   // 挂载即恢复上次选择（缺省收起）
    tog.addEventListener("click", function () {
      var open = detailFoldOpen();
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(DETAIL_FOLD_KEY, open ? "1" : "0");
        }
      } catch (e) { /* 存不上就只在本次会话生效，不影响功能 */ }
      applyDetailFold();
    });
  }

  // ---------- R151-2：按模型累计区整体折叠 ----------
  // 交互与「用量明细」同款：默认收起；记住上次选择（localStorage key:
  // xt_us_model_fold，"1"=收起【缺省】 "0"=展开；读不到 / 坏值一律按收起）。
  // 收起态标题行仍显示摘要（UsageModelFoldCur 在标题行内，renderQuotaModels 照常更新）；
  // 区内的排序 / 筛选折叠（UsageQuotaFilterToggle）不受影响，展开后照常用。
  function modelFoldOpen() {
    var v = "";
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        v = window.localStorage.getItem(MODEL_FOLD_KEY) || "";
      }
    } catch (e) { v = ""; }
    return v === "0";
  }

  function applyModelFold() {
    var tog = byId("UsageModelFold");
    var body = byId("UsageModelFoldBody");
    if (!tog || !body) return;
    var open = modelFoldOpen();
    tog.className = open ? "xt-us-foldrow open" : "xt-us-foldrow";
    body.className = open ? "xt-us-foldbody open" : "xt-us-foldbody";
    tog.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindModelFold() {
    var tog = byId("UsageModelFold");
    if (!tog || !tog.addEventListener) return;
    applyModelFold();   // 挂载即恢复上次选择（缺省收起）
    tog.addEventListener("click", function () {
      var open = modelFoldOpen();
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(MODEL_FOLD_KEY, open ? "1" : "0");
        }
      } catch (e) { /* 存不上就只在本次会话生效，不影响功能 */ }
      applyModelFold();
    });
  }

  function bindMore() {
    if (!el.moreBtn || !el.moreBtn.addEventListener) return;
    el.moreBtn.addEventListener("click", function () {
      state.limit += DETAIL_STEP;
      renderAll();
    });
  }

  function bind() {
    bindChips("UsageRangeBar", "data-range", function (v) {
      state.range = v;
      state.limit = DETAIL_STEP;
      renderAll();
    });
    if (el.sortSel && el.sortSel.addEventListener) {
      el.sortSel.addEventListener("change", function () {
        state.sortBy = el.sortSel.value;
        renderAll();
      });
    }
    // R88-A：A 口径排序 / 筛选（只影响「按模型单独列出」区块，与本机「按能力」区块互不干扰）
    // R91-E：模型级排序改 select 下拉（与上方「排序方式」同款接线），state.quotaSort 取值集合不变
    if (el.quotaSortSel && el.quotaSortSel.addEventListener) {
      el.quotaSortSel.addEventListener("change", function () {
        state.quotaSort = el.quotaSortSel.value;
        renderAll();
      });
    }
    bindChips("UsageQuotaFilterBar", "data-quota-filter", function (v) {
      state.quotaFilter = v;
      renderAll();
    });
    bindFold();
    bindMore();
    bindClearFold();
    bindQuotaFilterFold();
    bindDetailFold();   // R151：用量明细折叠（默认收起 + 记忆）
    bindModelFold();    // R151-2：按模型累计区折叠（默认收起 + 记忆）
    bindClear();
    bindExport();
  }

  // ---------- 懒渲染：只在「关于」Tab 激活时渲染 ----------
  function isPanelActive() {
    var panel = byId(PANEL_ID);
    if (!panel) return false;
    return String(panel.className).indexOf("active") !== -1;
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () {
      renderTimer = null;
      if (!isPanelActive()) return;   // 期间又切走了就不白做工
      renderAll(true);                // R151：进入「关于」tab 强制重取服务端快照
    }, 0);
  }

  function watchTab() {
    var btn = byId(TAB_ID);
    if (btn && btn.addEventListener) {
      btn.addEventListener("click", scheduleRender);
    }
    var panel = byId(PANEL_ID);
    if (panel && typeof MutationObserver === "function") {
      try {
        var mo = new MutationObserver(scheduleRender);
        mo.observe(panel, { attributes: true, attributeFilter: ["class"] });
      } catch (e) { /* 老内核不支持时退回 click 监听 */ }
    }
    if (isPanelActive()) scheduleRender();
  }

  function boot() {
    if (typeof document === "undefined") return;
    watchTab();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})();
