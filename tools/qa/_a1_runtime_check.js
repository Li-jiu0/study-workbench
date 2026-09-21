// A1 复核 · ai-service.js 运行时功能验证（Node 22 真环境，零依赖）
// 覆盖：MIME 魔数 / 400 不降级 / 429 跳过 / 15s 首字超时 / getReader 双分支 / 错误对象契约
// 结论写 UTF-8 文件，避免 Windows 控制台 GBK 崩溃。

const fs = require("fs");
const path = require("path");

const ROOT = "D:\\下载的文件\\学习工作台";
const TARGET = path.join(ROOT, "assets", "ai-service.js");
const OUT = path.join(ROOT, "tools", "qa", "_a1_runtime_out.txt");

const out = [];
const w = (s) => out.push(String(s));
const TS = () => Date.now();

// ---------------- 浏览器环境最小垫片 ----------------
const store = {};
const localStorageStub = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};

const toasts = [];
global.window = global;
global.localStorage = localStorageStub;
global.atob = (b64) => Buffer.from(String(b64), "base64").toString("binary");
global.btoa = (bin) => Buffer.from(String(bin), "binary").toString("base64");
global.xtToast = (m) => { toasts.push(String(m)); };
global.STUDY_API_BASE = "https://relay.invalid";
global.console.warn = () => {}; // 静音被测文件的 warn，保持输出干净

// 基于真实 ai-config.js 的模型 id / fallback 结构构造配置（不修改该文件）
const MODELS = [
  ["glm-4.7-flash", "GLM-4.7-Flash", "zhipu", "glm-4.7-flash", "glm-4.5-flash"],
  ["glm-4.5-flash", "GLM-4.5-Flash", "zhipu", "glm-4.5-flash", "qwen2.5-7b"],
  ["glm-4-flash", "GLM-4-Flash", "zhipu", "glm-4-flash", null],
  ["glm-4.6v-flash", "GLM-4.6V-Flash", "zhipu", "glm-4.6v-flash", "glm-4v-flash"],
  ["glm-4v-flash", "GLM-4V-Flash", "zhipu", "glm-4v-flash", null],
  ["qwen2.5-7b", "Qwen2.5-7B", "qwen", "qwen2.5-7b", "glm-4-flash"],
  ["qwen3-8b", "Qwen3-8B", "qwen", "qwen3-8b", "qwen2.5-7b"],
  ["qwen3.5-4b", "Qwen3.5-4B", "qwen", "qwen3.5-4b", "qwen2.5-7b"],
  ["deepseek-r1-8b", "DeepSeek-R1-8B", "qwen", "deepseek-r1-8b", "glm-4.7-flash"],
  ["glm-4-9b", "GLM-4-9B", "zhipu", "glm-4-9b", "qwen2.5-7b"],
  ["hunyuan-mt-7b", "Hunyuan-MT-7B", "qwen", "hunyuan-mt-7b", "glm-4.7-flash"]
];

global.AI_CONFIG = {
  builtinModels: MODELS.map(([id, name, provider, model, fb]) => ({
    id, name, provider, model, types: ["text"], temperature: 0.7, maxTokens: 1000, fallback: fb
  })),
  providers: {
    zhipu: { apiUrl: "https://api.invalid/zhipu", apiKey: "key-zhipu" },
    qwen: { apiUrl: "https://api.invalid/qwen", apiKey: "key-qwen" }
  },
  FUNC_TYPES: {
    general: { primary: "glm-4.7-flash", fallback: ["glm-4.5-flash", "qwen2.5-7b"], temperature: 0.7, maxTokens: 1000 },
    reasoning: { primary: "glm-4.7-flash", fallback: ["qwen3-8b"], temperature: 0.6, maxTokens: 1500 },
    translate: { primary: "glm-4.7-flash", fallback: ["qwen3-8b"], temperature: 0.3, maxTokens: 1200 },
    vision: { primary: "glm-4.6v-flash", fallback: ["glm-4v-flash"], temperature: 0.7, maxTokens: 1000 }
  },
  rateLimit: { maxCalls: 100000, perSeconds: 60 },
  maxMode: { maxTokens: 4000, temperatureDelta: -0.1 },
  systemPrompt: "sys"
};

// ---------------- 加载被测文件 ----------------
const code = fs.readFileSync(TARGET, "utf8");
// eslint-disable-next-line no-eval
eval(code);
const SVC = global.AI_SERVICE;

// ---------------- fetch 打桩工具 ----------------
let fetchLog = [];
function setFetch(impl) { fetchLog = []; global.fetch = (url, init) => { fetchLog.push(String(url)); return impl(String(url), init); }; }

function jsonResp(status, bodyText, bodyStream) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(bodyText)),
    text: () => Promise.resolve(bodyText),
    body: bodyStream === undefined ? null : bodyStream
  };
}

// 用真实 ReadableStream 造流式响应
function sseBody(parts) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        read() {
          if (i >= parts.length) return Promise.resolve({ done: true, value: undefined });
          const v = enc.encode(parts[i++]);
          return Promise.resolve({ done: false, value: v });
        }
      };
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- 断言记账 ----------------
const verdicts = [];
function check(name, cond, detail) {
  verdicts.push({ name, pass: !!cond, detail: detail === undefined ? "" : String(detail) });
}

async function main() {
  w("ai-service.js runtime verification  ts=" + new Date().toISOString());
  w("target=" + TARGET);
  w("node=" + process.version);
  w("");

  // ============ T1 图片 MIME 魔数 ============
  w("== T1 · 图片 MIME 按真实字节推导（需求 1） ==");
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  const png = b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]));
  const jpg = b64(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]));
  const gif = b64(Buffer.concat([Buffer.from("GIF89a", "binary"), Buffer.alloc(16)]));
  const webp = b64(Buffer.concat([Buffer.from("RIFF", "binary"), Buffer.alloc(4), Buffer.from("WEBP", "binary"), Buffer.alloc(8)]));
  const bmp = b64(Buffer.concat([Buffer.from("BM", "binary"), Buffer.alloc(16)]));

  const mimeCases = [["png", png, "image/png"], ["jpeg", jpg, "image/jpeg"], ["gif", gif, "image/gif"],
    ["webp", webp, "image/webp"], ["bmp", bmp, "image/bmp"]];
  for (const [label, payload, expect] of mimeCases) {
    const got = SVC.detectImageMime(payload);
    w("  detectImageMime(" + label + ") = " + got + (got === expect ? "  OK" : "  <<< EXPECTED " + expect));
    check("detectImageMime:" + label, got === expect, got);
  }
  const junkMime = SVC.detectImageMime("QUJDREVGR0g=");
  w("  detectImageMime(非图片 base64) = '" + junkMime + "' (期望空串，交由 L182 兜底)");
  check("detectImageMime:junk-empty", junkMime === "", junkMime);

  w("");
  w("  -- normalizeImageUrl --");
  const nuCases = [
    ["完整 dataURL(png)", "data:image/png;base64," + png, "data:image/png;base64," + png],
    ["dataURL 声明jpeg实为png", "data:image/jpeg;base64," + png, "data:image/png;base64," + png],
    ["完整 dataURL(webp)", "data:image/webp;base64," + webp, "data:image/webp;base64," + webp],
    ["完整 dataURL(gif)", "data:image/gif;base64," + gif, "data:image/gif;base64," + gif],
    ["纯 base64(无前缀)", png, "data:image/png;base64," + png],
    ["http 图片地址", "https://x.invalid/a.png", "https://x.invalid/a.png"],
    ["非图片 dataURL", "data:text/plain;base64," + png, ""],
    ["空串", "", ""]
  ];
  for (const [label, input, expect] of nuCases) {
    let got;
    try { got = SVC.normalizeImageUrl(input); } catch (e) { got = "EXC:" + e.message; }
    const ok = got === expect;
    w("  " + label.padEnd(26) + " -> " + (got.length > 70 ? got.slice(0, 70) + "…" : got) + (ok ? "  OK" : "  <<< MISMATCH"));
    check("normalizeImageUrl:" + label, ok, got.slice(0, 60));
  }
  // 关键：绝不能出现二次拼接
  const dbl = SVC.normalizeImageUrl("data:image/png;base64," + png);
  const noDouble = dbl.indexOf("base64,data:") === -1;
  w("  二次拼接检测（绝不可出现 base64,data:）: " + (noDouble ? "无  OK" : "出现 <<< BUG"));
  check("no-double-prefix", noDouble, dbl.slice(0, 60));

  // ============ T2 400 不降级 ============
  w("");
  w("== T2 · 400 不降级，直接上抛 status/message（需求 2 / 5） ==");
  SVC.resetModelSkip();
  setFetch((url) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    return Promise.resolve(jsonResp(400, '{"error":{"code":1210,"message":"图片格式不支持"}}'));
  });
  let err400 = null;
  try {
    await global.callAI("vision", [{ role: "user", content: "这是什么" }], { image: "data:image/png;base64," + png });
  } catch (e) { err400 = e; }
  w("  thrown = " + !!err400);
  if (err400) {
    w("  status=" + err400.status + "  code=" + err400.code + "  apiMessage=" + err400.apiMessage);
    w("  message=" + err400.message);
    w("  modelId=" + err400.modelId + "  requestInfo.hasImage=" + (err400.requestInfo ? err400.requestInfo.hasImage : "n/a"));
  }
  w("  实际发出的 /api/ai/chat 请求数 = " + fetchLog.filter((u) => u.indexOf("/api/ai/chat") !== -1).length + " （400 不降级 => 0）");
  check("400-throws", !!err400, err400 && err400.message);
  check("400-status", err400 && err400.status === 400, err400 && err400.status);
  check("400-apiMessage-carried", !!(err400 && err400.apiMessage), err400 && err400.apiMessage);
  check("400-no-fallback", fetchLog.filter((u) => u.indexOf("/api/ai/chat") !== -1).length === 0, "chat calls=" + fetchLog.length);

  // ============ T3 降级链构建（慢模型剔除 / 手选置首） ============
  w("");
  w("== T3 · 降级链构建（需求 3：慢模型仅手选） ==");
  for (const ft of ["general", "reasoning", "translate", "vision"]) {
    const ids = SVC.buildChain(ft, {}).map((m) => m.id);
    w("  auto " + ft.padEnd(10) + " -> " + ids.join(" > "));
    const hasSlow = ids.some((id) => id === "qwen3-8b" || id === "qwen3.5-4b");
    w("    含慢模型: " + hasSlow + (hasSlow ? "  <<< BUG" : "  OK"));
    check("chain-no-slow:" + ft, !hasSlow, ids.join(">"));
  }
  const manualIds = SVC.buildChain("general", { model: "qwen3-8b" }).map((m) => m.id);
  w("  手选 qwen3-8b -> " + manualIds.join(" > "));
  check("manual-slow-head", manualIds[0] === "qwen3-8b", manualIds.join(">"));

  // ============ T4 429 → 会话内跳过 + rescue ============
  w("");
  w("== T4 · 429 连续 2 次 → 会话内跳过（需求 4） ==");
  SVC.resetModelSkip();
  let n429 = 0;
  setFetch((url) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    n429++;
    return Promise.resolve(jsonResp(429, '{"error":{"code":1302,"message":"rate limited"}}'));
  });
  // 走一次 callAI（general 链 glm-4.7-flash > glm-4.5-flash > qwen2.5-7b）
  let firstPass = null;
  try {
    firstPass = await global.callAI("general", [{ role: "user", content: "你好" }], {});
  } catch (e) { firstPass = { error: e.message, status: e.status }; }
  w("  第 1 轮（全 429）-> " + JSON.stringify({ model: firstPass.model, degraded: firstPass.degraded, textHead: String(firstPass.text || "").slice(0, 24), status: firstPass.status }));
  const afterFirst = n429;
  w("  第 1 轮直连请求次数 = " + afterFirst);

  // 第 2 轮：glm-4.7-flash / glm-4.5-flash 应已被跳过（连续 2 次 429）
  let secondPass = null;
  try {
    secondPass = await global.callAI("general", [{ role: "user", content: "你好" }], {});
  } catch (e) { secondPass = { error: e.message, status: e.status }; }
  const afterSecond = n429;
  w("  第 2 轮 -> " + JSON.stringify({ model: secondPass.model, status: secondPass.status, textHead: String(secondPass.text || "").slice(0, 24) }));
  w("  第 2 轮直连请求次数 = " + (afterSecond - afterFirst) + " （被跳过的模型不再请求）");
  w("  会话内跳过表生效 = " + (afterSecond - afterFirst <= 2));
  check("429-session-skip", afterSecond - afterFirst <= 2, "2nd-round direct calls=" + (afterSecond - afterFirst));

  // 验证 rateSkip 确实记录（用 general 链首第二次调用不应再打到 glm-4.7-flash）
  const probes = [];
  setFetch((url, init) => {
    probes.push(String(url));
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    let body = {};
    try { body = JSON.parse(init.body); } catch (e) { body = {}; }
    return Promise.resolve(jsonResp(429, '{"error":{"code":1302,"message":"rate limited"}}'));
  });
  SVC.resetModelSkip();

  // ============ T5 getReader 双分支 ============
  w("");
  w("== T5 · getReader 流式 / 非流式双分支（需求 6） ==");
  const modelGLM = SVC.buildChain("general", {})[0];
  const modelsList = { id: "glm-4.7-flash", name: "GLM-4.7-Flash", provider: "zhipu", model: "glm-4.7-flash", temperature: 0.7, maxTokens: 100 };

  // 5a：有 getReader，SSE 增量
  let streamChunks = [];
  setFetch(() => Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{"content":"世界"}}]}\n\ndata: [DONE]\n', sseBody([
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n',
    'data: [DONE]\n'
  ]))));
  let sseText = null, sseErr = null;
  try {
    sseText = await SVC.requestModel(modelsList, [{ role: "user", content: "hi" }], (d, f) => streamChunks.push(String(d)), null, {});
  } catch (e) { sseErr = e; }
  w("  [流式分支] text=" + JSON.stringify(sseText) + " chunks=" + JSON.stringify(streamChunks) + (sseErr ? " err=" + sseErr.message : ""));
  check("stream-branch-works", sseText === "你好世界", sseText);

  // 5b：无 getReader（老内核）→ 整段读取 + 本地分段
  let wholeChunks = [];
  setFetch(() => Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"整段回答内容如下所示"}}]}\n\ndata: [DONE]\n', null)));
  let wholeText = null, wholeErr = null;
  try {
    wholeText = await SVC.requestModel(modelsList, [{ role: "user", content: "hi" }], (d, f) => wholeChunks.push(String(d)), null, {});
  } catch (e) { wholeErr = e; }
  w("  [非流式兜底] text=" + JSON.stringify(wholeText) + " chunks=" + wholeChunks.length + (wholeErr ? " err=" + wholeErr.message : ""));
  check("nostream-fallback-works", wholeText === "整段回答内容如下所示", wholeText);

  // 5c：纯 JSON（非 SSE）响应
  let jsonChunks = [];
  setFetch(() => Promise.resolve(jsonResp(200, '{"choices":[{"message":{"content":"纯JSON整段"}}]}', null)));
  let jsonText = null;
  try {
    jsonText = await SVC.requestModel(modelsList, [{ role: "user", content: "hi" }], (d, f) => jsonChunks.push(String(d)), null, {});
  } catch (e) { jsonText = "ERR:" + e.message; }
  w("  [非流式·纯JSON] text=" + JSON.stringify(jsonText));
  check("nostream-json-works", jsonText === "纯JSON整段", jsonText);

  // ============ T6 15s 未出首字 → 超时 ============
  w("");
  w("== T6 · 首字超时（需求 3：15s 未出首字即切换） ==");
  // 用缩小阈值验证机制本身（真实值为 15000ms）
  setFetch(() => Promise.resolve(jsonResp(200, "never", {
    getReader() {
      return { read: () => new Promise(() => {}) }; // 永不返回首个 chunk
    }
  })));
  const t0 = TS();
  let toErr = null;
  try {
    await SVC.requestModel(modelsList, [{ role: "user", content: "hi" }], null, null,
      { firstTokenTimeout: 120, totalTimeout: 3000, responseTimeout: 1000 });
  } catch (e) { toErr = e; }
  const dt = TS() - t0;
  w("  firstTokenTimeout=120ms（压测值）-> code=" + (toErr && toErr.code) + " timedOut=" + (toErr && toErr.timedOut) + " status=" + (toErr && toErr.status) + " 耗时=" + dt + "ms");
  check("first-token-timeout", !!(toErr && toErr.code === "TIMEOUT_FIRST_TOKEN" && toErr.timedOut), toErr && toErr.code);

  // 6b：响应头超时（fetch 永不 resolve）
  setFetch(() => new Promise(() => {}));
  let hdrErr = null;
  try {
    await SVC.requestModel(modelsList, [{ role: "user", content: "hi" }], null, null,
      { firstTokenTimeout: 5000, totalTimeout: 5000, responseTimeout: 120 });
  } catch (e) { hdrErr = e; }
  w("  responseTimeout=120ms 无响应头 -> code=" + (hdrErr && hdrErr.code) + " timedOut=" + (hdrErr && hdrErr.timedOut));
  check("response-header-timeout", !!(hdrErr && hdrErr.code === "TIMEOUT_RESPONSE" && hdrErr.timedOut), hdrErr && hdrErr.code);

  // ============ T7 超时 → 自动切下一个模�型（端到端降级） ============
  w("");
  w("== T7 · 超时自动切换 + 降级提示（需求 2/3/5 端到端） ==");
  SVC.resetModelSkip();
  toasts.length = 0;
  const seenModels = [];
  let callIdx = 0;
  setFetch((url, init) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    callIdx++;
    let provider = "";
    try { provider = JSON.parse(init.body).provider; } catch (e) { provider = ""; }
    seenModels.push(provider);
    if (callIdx === 1) {
      // 第一个模型：响应头立刻回，但永不吐首字 -> 触发首字超时
      return Promise.resolve(jsonResp(200, "x", { getReader() { return { read: () => new Promise(() => {}) }; } }));
    }
    // 第二个模型：正常整段返回
    return Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"第二个模型的回答"}}]}\n\ndata: [DONE]\n', null));
  });
  let e2e = null, e2eErr = null;
  try {
    e2e = await global.callAI("general", [{ role: "user", content: "问题" }], {
      firstTokenTimeout: 120, totalTimeout: 2500, responseTimeout: 1200,
      onFallback: (name, id, msg, reason) => toasts.push("[onFallback]" + msg + "/" + reason)
    });
  } catch (e) { e2eErr = e; }
  w("  provider 调用序列 = " + JSON.stringify(seenModels));
  w("  结果 text=" + JSON.stringify(e2e && e2e.text) + " model=" + (e2e && e2e.model));
  w("  降级提示 = " + JSON.stringify(toasts));
  check("timeout-triggers-switch", seenModels.length >= 2, seenModels.join(">"));
  check("switch-result-ok", !!(e2e && e2e.text === "第二个模型的回答"), e2e && e2e.text);
  check("fallback-notified", toasts.length >= 1, JSON.stringify(toasts));

  // ============ T8 网络异常 5xx / 断网 → 降级 ============
  w("");
  w("== T8 · 5xx / 网络错误 → 降级（需求 2 反面） ==");
  SVC.resetModelSkip();
  let seq = 0;
  const seqProviders = [];
  setFetch((url, init) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    seq++;
    let provider = "";
    try { provider = JSON.parse(init.body).provider; } catch (e) { provider = ""; }
    seqProviders.push(provider + "#" + seq);
    if (seq === 1) return Promise.reject(new TypeError("Failed to fetch"));
    if (seq === 2) return Promise.resolve(jsonResp(503, '{"error":{"message":"service unavailable"}}'));
    return Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"降级后成功"}}]}\n\ndata: [DONE]\n', null));
  });
  let dq = null;
  try {
    dq = await global.callAI("general", [{ role: "user", content: "问题" }], { onFallback: () => {} });
  } catch (e) { dq = { error: e.message }; }
  w("  调用序列 = " + JSON.stringify(seqProviders));
  w("  结果 = " + JSON.stringify({ text: dq.text, model: dq.model }));
  check("5xx-network-fallback", !!(dq && dq.text === "降级后成功"), dq && dq.text);

  // ============ T9 错误对象契约（供 ai-page.js 渲染） ============
  w("");
  w("== T9 · 错误对象契约 status/code/apiMessage/modelName（需求 5） ==");
  setFetch((url) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    return Promise.resolve(jsonResp(404, '{"error":{"code":1211,"message":"模型不存在"}}'));
  });
  let e404 = null;
  try { await global.callAI("general", [{ role: "user", content: "x" }], {}); } catch (e) { e404 = e; }
  const contract = e404 ? ["status", "code", "apiMessage", "modelId", "modelName", "requestInfo"].filter((k) => e404[k] !== undefined) : [];
  w("  404 错误对象字段 = " + JSON.stringify(contract));
  w("  status=" + (e404 && e404.status) + " code=" + (e404 && e404.code) + " apiMessage=" + (e404 && e404.apiMessage) + " modelName=" + (e404 && e404.modelName));
  check("error-contract", contract.indexOf("status") !== -1 && contract.indexOf("apiMessage") !== -1 && contract.indexOf("modelName") !== -1, JSON.stringify(contract));

  // 401 → 换下一个 provider（Key 失效）
  w("");
  w("== T10 · 401 Key 失效 → 换下一个模型/provider ==");
  SVC.resetModelSkip();
  let s401 = 0;
  const seen401 = [];
  setFetch((url, init) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    s401++;
    let provider = "";
    try { provider = JSON.parse(init.body).provider; } catch (e) { provider = ""; }
    seen401.push(provider);
    if (provider === "zhipu") return Promise.resolve(jsonResp(401, '{"error":{"message":"invalid api key"}}'));
    return Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"qwen 成功"}}]}\n\ndata: [DONE]\n', null));
  });
  let kres = null;
  const keyInvalid = [];
  try {
    kres = await global.callAI("general", [{ role: "user", content: "x" }], {
      onFallback: () => {},
      onKeyInvalid: (p) => keyInvalid.push(p)
    });
  } catch (e) { kres = { error: e.message }; }
  w("  provider 序列 = " + JSON.stringify(seen401) + "  onKeyInvalid=" + JSON.stringify(keyInvalid));
  w("  结果 = " + JSON.stringify({ text: kres.text, model: kres.model }));
  check("401-switch-provider", !!(kres && kres.text === "qwen 成功"), kres && kres.text);

  // ============ T11 本地兜底（全链路失败） ============
  w("");
  w("== T11 · 全链路失败 → 本地兜底（不白屏） ==");
  SVC.resetModelSkip();
  global.AI_PRESETS = { fallback: "网络不佳，以下为本地参考。", getPresetAnswer: () => null };
  setFetch((url) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    return Promise.resolve(jsonResp(503, "down"));
  });
  let fb = null;
  try { fb = await global.callAI("general", [{ role: "user", content: "x" }], {}); } catch (e) { fb = { error: e.message }; }
  w("  兜底结果 = " + JSON.stringify({ text: fb.text, degraded: fb.degraded, fromPreset: fb.fromPreset }));
  check("local-fallback", !!(fb && fb.degraded === true && fb.text), JSON.stringify(fb).slice(0, 80));

  // ============ T12 图片链路完整走通（不 400） ============
  w("");
  w("== T12 · 视觉链路：图片 MIME 正确进入请求体 ==");
  SVC.resetModelSkip();
  let sentBody = null;
  setFetch((url, init) => {
    if (url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    try { sentBody = JSON.parse(init.body); } catch (e) { sentBody = null; }
    return Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"这是一张PNG图片"}}]}\n\ndata: [DONE]\n', null));
  });
  let vres = null;
  try {
    vres = await global.callAI("vision", [{ role: "user", content: "这是什么" }], { image: "data:image/jpeg;base64," + png });
  } catch (e) { vres = { error: e.message }; }
  const imgUrl = sentBody && sentBody.messages && sentBody.messages[1] && sentBody.messages[1].content
    ? sentBody.messages[1].content[0].image_url.url : "(未捕获)";
  w("  实际发出 model = " + (sentBody && sentBody.model));
  w("  实际发出 image_url.url 前缀 = " + String(imgUrl).slice(0, 34));
  w("  结果 = " + JSON.stringify(vres.text || vres.error));
  check("vision-no-double-prefix", String(imgUrl).indexOf("base64,data:") === -1, String(imgUrl).slice(0, 40));
  check("vision-mime-corrected", String(imgUrl).indexOf("data:image/png;base64,") === 0, String(imgUrl).slice(0, 40));

  // ============ 汇总 ============
  w("");
  w("== SUMMARY ==");
  const failed = verdicts.filter((v) => !v.pass);
  w("checks=" + verdicts.length + "  passed=" + (verdicts.length - failed.length) + "  failed=" + failed.length);
  for (const f of failed) w("  FAILED: " + f.name + "  detail=" + f.detail);
  w("");
  w(failed.length === 0 ? "IS_PASS: YES" : "IS_PASS: NO");

  fs.writeFileSync(OUT, out.join("\n"), "utf8");
  console.log("WROTE " + OUT);
  console.log("checks=" + verdicts.length + " failed=" + failed.length);
}

main().catch((e) => {
  out.push("");
  out.push("HARNESS ERROR: " + (e && e.stack ? e.stack : e));
  fs.writeFileSync(OUT, out.join("\n"), "utf8");
  console.log("WROTE " + OUT + " (with harness error)");
});
