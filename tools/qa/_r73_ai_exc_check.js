// R73 需求12 异常路径本地验证（stub fetch，不触网）
// 验证：①500 全失败→降级返回文本(不抛) ②400→抛出(status=400, apiMessage)
//       ③网络错误→降级返回 + 在途请求被 abort ④SSE 读流中途出错→降级 + abort
const fs = require("fs");
const path = require("path");
const ROOT = "D:\\下载的文件\\学习工作台";
const OUT = path.join(ROOT, "tools", "qa", "_r73_ai_exc_out.txt");

const out = [];
const w = (s) => out.push(String(s));
const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }, clear: () => {}
};
global.atob = (b) => Buffer.from(String(b), "base64").toString("binary");
global.btoa = (b) => Buffer.from(String(b), "binary").toString("base64");
global.console.warn = () => {};
global.STUDY_API_BASE = "https://relay.invalid";

const MODELS = [
  ["glm-4.7-flash", "GLM-4.7-Flash", "zhipu", "glm-4.7-flash", "glm-4.5-flash"],
  ["glm-4.5-flash", "GLM-4.5-Flash", "zhipu", "glm-4.5-flash", "qwen2.5-7b"],
  ["qwen2.5-7b", "Qwen2.5-7B", "qwen", "qwen2.5-7b", "glm-4-flash"],
  ["glm-4-flash", "GLM-4-Flash", "zhipu", "glm-4-flash", null]
];
global.AI_CONFIG = {
  builtinModels: MODELS.map(([id, name, provider, model, fb]) => ({ id, name, provider, model, types: ["text"], temperature: 0.7, maxTokens: 1000, fallback: fb })),
  providers: { zhipu: { apiUrl: "https://api.invalid/zhipu", apiKey: "k-z" }, qwen: { apiUrl: "https://api.invalid/qwen", apiKey: "k-q" } },
  FUNC_TYPES: { general: { primary: "glm-4.7-flash", fallback: ["glm-4.5-flash", "qwen2.5-7b"], temperature: 0.7, maxTokens: 1000 } },
  rateLimit: { maxCalls: 100000, perSeconds: 60 },
  maxMode: { maxTokens: 4000, temperatureDelta: -0.1 },
  systemPrompt: "sys"
};

eval(fs.readFileSync(path.join(ROOT, "assets", "ai-presets.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "assets", "ai-service.js"), "utf8"));
const SVC = global.AI_SERVICE;

let lastSignals = [];
function jsonResp(status, bodyText, bodyStream) {
  return { ok: status >= 200 && status < 300, status,
    json: () => Promise.resolve(JSON.parse(bodyText)),
    text: () => Promise.resolve(bodyText),
    body: bodyStream === undefined ? null : bodyStream };
}
function sseReader(parts) { // parts: array of {value|err}
  const enc = new TextEncoder(); let i = 0;
  return { getReader: () => ({ read: () => {
    const p = parts[i++];
    if (p === undefined) return Promise.resolve({ done: true });
    if (p.err) return Promise.reject(p.err);
    return Promise.resolve({ done: false, value: enc.encode(p.value) });
  } }) };
}
function setFetch(impl) {
  lastSignals = [];
  global.fetch = (url, init) => {
    if (String(url).indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    if (init && init.signal) lastSignals.push(init.signal);
    let model = ""; try { model = JSON.parse(init.body).model; } catch (e) {}
    return impl({ url: String(url), model }, init);
  };
}

async function call(msg) {
  try { return { ok: true, r: await global.callAI("general", [{ role: "user", content: msg }], {}) }; }
  catch (e) { return { ok: false, e }; }
}

(async function main() {
  w("R73 需求12 异常路径本地验证 ts=" + new Date().toISOString());
  w("");

  // T1: 全部 500
  SVC.resetModelSkip();
  setFetch(() => Promise.resolve(jsonResp(500, '{"error":{"message":"server boom"}}')));
  const t1 = await call("你好");
  const hasText = !!(t1.ok && t1.r && (t1.r.text || t1.r.content) && String(t1.r.text || t1.r.content).length > 0);
  const degraded = !!(t1.ok && t1.r && t1.r.degraded === true);
  w("T1 全 500 -> ok=" + t1.ok + " degraded=" + degraded + " 有文本=" + hasText +
    " 文本头=" + JSON.stringify(String((t1.r && t1.r.text) || "").slice(0, 16)));
  w("   期望：不抛错 + degraded=true + 有文本（供 ai-page 渲染，避免空气泡）");

  // T2: 400（NO_FALLBACK）
  SVC.resetModelSkip();
  setFetch(() => Promise.resolve(jsonResp(400, '{"error":{"message":"invalid request param"}}')));
  const t2 = await call("你好");
  w("T2 全 400 -> ok=" + t2.ok + " status=" + (t2.e && t2.e.status) + " apiMessage=" +
    JSON.stringify(t2.e && t2.e.apiMessage) + " msg=" + JSON.stringify(t2.e && t2.e.message));
  w("   期望：抛错（不降级），ai-page catch 命中 4xx 分支展示后端原因");

  // T3: 网络错误（fetch 直接 reject）→ 应降级，且 signal 被 abort
  SVC.resetModelSkip();
  setFetch(() => Promise.reject(new Error("network down")));
  const t3 = await call("你好");
  await new Promise((r) => setTimeout(r, 30));
  const anyAborted = lastSignals.length > 0 && lastSignals.some((s) => s && s.aborted === true);
  w("T3 网络错误 -> ok=" + t3.ok + " degraded=" + !!(t3.ok && t3.r && t3.r.degraded) +
    " 捕获 signal 数=" + lastSignals.length + " 有已 abort=" + anyAborted);
  w("   期望：降级返回 + 在途请求被 AbortController 中止");

  // T4: SSE 读到一半出错 → 应降级，且 signal 被 abort
  SVC.resetModelSkip();
  const okChunk = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n';
  setFetch(() => Promise.resolve(jsonResp(200, "", sseReader([
    { value: okChunk }, { err: new Error("stream broken") }
  ]))));
  const t4 = await call("你好");
  await new Promise((r) => setTimeout(r, 30));
  const aborted4 = lastSignals.some((s) => s && s.aborted === true);
  w("T4 SSE 中途断裂 -> ok=" + t4.ok + " degraded=" + !!(t4.ok && t4.r && t4.r.degraded) +
    " 有已 abort=" + aborted4);
  w("   期望：降级返回 + abort（迟到增量被 uiLive 丢弃，不污染界面）");

  fs.writeFileSync(OUT, out.join("\n"), "utf8");
  console.log(out.join("\n"));
})();
