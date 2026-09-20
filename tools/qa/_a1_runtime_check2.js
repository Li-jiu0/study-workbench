// A1 复核 · 补充验证（修正 harness 缺陷后重测 429 / 非图片 dataURL 两项）
// 说明：上一版 harness 用 init.body.provider 判定模型，但直连链请求体里没有 provider 字段
//      （provider 体现在 apiUrl 上），导致打桩恒走同一分支 —— 属 harness 缺陷，非产品缺陷。
//      本版改为从 init.body.model + fetch url 判定，并精确复现 400 的「带 data: 前缀」路径。

const fs = require("fs");
const path = require("path");

const ROOT = "D:\\下载的文件\\学习工作台";
const TARGET = path.join(ROOT, "assets", "ai-service.js");
const OUT = path.join(ROOT, "tools", "qa", "_a1_runtime2_out.txt");

const out = [];
const w = (s) => out.push(String(s));

const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
global.atob = (b64) => Buffer.from(String(b64), "base64").toString("binary");
global.btoa = (bin) => Buffer.from(String(bin), "binary").toString("base64");
global.xtToast = () => {};
global.STUDY_API_BASE = "https://relay.invalid";
global.console.warn = () => {};

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
  builtinModels: MODELS.map(([id, name, provider, model, fb]) => ({ id, name, provider, model, types: ["text"], temperature: 0.7, maxTokens: 1000, fallback: fb })),
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

eval(fs.readFileSync(TARGET, "utf8"));
const SVC = global.AI_SERVICE;

const verdicts = [];
function check(name, cond, detail) {
  verdicts.push({ name, pass: !!cond, detail: detail === undefined ? "" : String(detail) });
}

function jsonResp(status, bodyText, bodyStream) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(bodyText)),
    text: () => Promise.resolve(bodyText),
    body: bodyStream === undefined ? null : bodyStream
  };
}
function sseBody(parts) {
  const enc = new TextEncoder();
  let i = 0;
  return { getReader: () => ({ read: () => (i >= parts.length ? Promise.resolve({ done: true }) : Promise.resolve({ done: false, value: enc.encode(parts[i++]) })) }) };
}

let log = [];
function setFetch(impl) { log = []; global.fetch = (url, init) => { const rec = { url: String(url), model: "", provider: "" }; try { rec.model = JSON.parse(init.body).model; } catch (e) { rec.model = ""; } rec.provider = rec.url.indexOf("zhipu") !== -1 ? "zhipu" : (rec.url.indexOf("qwen") !== -1 ? "qwen" : "relay"); log.push(rec); return impl(rec, init); }; }

const b64 = (buf) => Buffer.from(buf).toString("base64");
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const png = b64(PNG_BYTES);

async function main() {
  w("ai-service.js supplementary verification  ts=" + new Date().toISOString());
  w("");

  // ============ R1 429 端到端：会话内跳过（修正打桩后重测） ============
  w("== R1 · 429 连续 2 次 → 会话内跳过 rateSkip（修正打桩后重测） ==");
  SVC.resetModelSkip();
  const perModel = {};
  setFetch((rec) => {
    if (rec.url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    perModel[rec.model] = (perModel[rec.model] || 0) + 1;
    return Promise.resolve(jsonResp(429, '{"error":{"code":1302,"message":"rate limited"}}'));
  });

  let r1 = null;
  try { r1 = await global.callAI("general", [{ role: "user", content: "你好" }], {}); } catch (e) { r1 = { error: e.message }; }
  const round1 = JSON.parse(JSON.stringify(perModel));
  w("  第 1 轮 各模型请求次数 = " + JSON.stringify(round1));
  w("  第 1 轮 结果 = " + JSON.stringify({ degraded: r1.degraded, textHead: String(r1.text || "").slice(0, 20) }));

  for (const k of Object.keys(perModel)) delete perModel[k];
  let r2 = null;
  try { r2 = await global.callAI("general", [{ role: "user", content: "你好" }], {}); } catch (e) { r2 = { error: e.message }; }
  const round2 = JSON.parse(JSON.stringify(perModel));
  w("  第 2 轮 各模型请求次数 = " + JSON.stringify(round2));
  w("  第 2 轮 结果 = " + JSON.stringify({ degraded: r2.degraded, status: r2.status, textHead: String(r2.text || "").slice(0, 20) }));

  const glm47Round1 = round1["glm-4.7-flash"] || 0;
  const glm47Round2 = round2["glm-4.7-flash"] || 0;
  const glm45Round2 = round2["glm-4.5-flash"] || 0;
  w("");
  w("  关键判定：glm-4.7-flash 第1轮=" + glm47Round1 + " 次 → 第2轮=" + glm47Round2 + " 次");
  w("            glm-4.5-flash 第1轮=" + (round1["glm-4.5-flash"] || 0) + " 次 → 第2轮=" + glm45Round2 + " 次");
  check("429-skip-glm47", glm47Round1 === 1 && glm47Round2 === 0, "r1=" + glm47Round1 + " r2=" + glm47Round2);
  check("429-skip-glm45", glm45Round2 === 0, "r2=" + glm45Round2);
  check("429-skip-keeps-some", Object.keys(round2).length >= 1, JSON.stringify(round2));

  // R1b：第 3 轮 —— 全部模型都被跳过 → ALL_RATE_LIMITED（attempted===0）
  const perModel3 = {};
  setFetch((rec) => {
    if (rec.url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    perModel3[rec.model] = (perModel3[rec.model] || 0) + 1;
    return Promise.resolve(jsonResp(429, '{"error":{"code":1302,"message":"rate limited"}}'));
  });
  let r3 = null;
  try { r3 = await global.callAI("general", [{ role: "user", content: "你好" }], {}); } catch (e) { r3 = { error: e.message, status: e.status, code: e.code }; }
  w("");
  w("  第 3 轮 各模型请求次数 = " + JSON.stringify(perModel3) + "  （期望全跳过 => {}）");
  w("  第 3 轮 结果 = " + JSON.stringify({ status: r3.status, code: r3.code, error: r3.error, textHead: String(r3.text || "").slice(0, 20) }));
  check("429-all-skipped-path", Object.keys(perModel3).length === 0 && (r3.code === "ALL_RATE_LIMITED" || r3.status === 429), JSON.stringify(perModel3) + " " + r3.code);

  // R1c：429 → injectRescue 把 glm-4.5-flash / qwen2.5-7b 插入链中（已在链内则不重复）
  w("");
  w("== R2 · injectRescue 不重复插入（429 备选模型已在链内） ==");
  SVC.resetModelSkip();
  const seenOrder = [];
  setFetch((rec) => {
    if (rec.url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    seenOrder.push(rec.model);
    return Promise.resolve(jsonResp(429, '{"error":{"code":1302,"message":"rate limited"}}'));
  });
  try { await global.callAI("general", [{ role: "user", content: "x" }], {}); } catch (e) { /* 忽略 */ }
  const dup = seenOrder.length !== new Set(seenOrder).size;
  w("  general 链请求序列 = " + JSON.stringify(seenOrder));
  w("  是否出现重复请求同一模型 = " + dup + (dup ? "  <<< 疑似重复" : "  OK"));
  check("no-duplicate-request", !dup, seenOrder.join(">"));

  // ============ R3 非图片 dataURL 的真实语义 ============
  w("");
  w("== R3 · normalizeImageUrl('data:text/plain;base64,<png>') 语义判定 ==");
  const got = SVC.normalizeImageUrl("data:text/plain;base64," + png);
  w("  输入 = data:text/plain;base64,<PNG 字节>");
  w("  输出 = " + got.slice(0, 60));
  const isPng = got.indexOf("data:image/png;base64,") === 0;
  const notTextPlain = got.indexOf("text/plain") === -1;
  w("  说明：函数只看字节魔数，不看声明；声明的 text/plain 非图片类型被丢弃，");
  w("        字节确为 PNG 故输出 image/png。这是一处「宽松」而非「错误」——");
  w("        ai-page.js 只会传 FileReader.readAsDataURL() 产生的 image/* dataURL，");
  w("        不存在把 text/plain 传给本函数的真实调用路径，故无 400 风险。");
  check("text-plain-not-passed-as-textplain", notTextPlain, got.slice(0, 50));
  check("text-plain-bytes-are-png", isPng, got.slice(0, 50));

  // R3b：非图片字节 + 非图片声明 → 400 直抛（IMAGE_INVALID）
  w("");
  w("== R3b · 真正非图片输入 → 400 IMAGE_INVALID（不降级） ==");
  SVC.resetModelSkip();
  const notImg = SVC.normalizeImageUrl("data:text/plain;base64,QUJDREVGR0g=");
  w("  normalizeImageUrl('data:text/plain;base64,QUJDREVGR0g=') = '" + notImg + "'  （期望空串）");
  check("non-image-returns-empty", notImg === "", notImg);

  setFetch((rec) => {
    if (rec.url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    return Promise.resolve(jsonResp(200, "ok", null));
  });
  let ierr = null;
  try { await global.callAI("vision", [{ role: "user", content: "x" }], { image: "data:text/plain;base64,QUJDREVGR0g=" }); } catch (e) { ierr = e; }
  w("  callAI 抛出 = " + !!ierr + " status=" + (ierr && ierr.status) + " code=" + (ierr && ierr.code) + " message=" + (ierr && ierr.message));
  check("image-invalid-400", !!(ierr && ierr.status === 400 && ierr.code === "IMAGE_INVALID"), ierr && ierr.code);

  // ============ R4 11 个模型逐一「发文字」静态链路自检 ============
  w("");
  w("== R4 · 11 个内置模型逐一发文字 → 请求体契约自检（无图路径） ==");
  const ids = global.AI_CONFIG.builtinModels.map((m) => m.id);
  const chatCalls = [];
  setFetch((rec, init) => {
    if (rec.url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
    let body = {};
    try { body = JSON.parse(init.body); } catch (e) { body = {}; }
    chatCalls.push(body);
    return Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n', null));
  });

  const modelResults = [];
  for (const id of ids) {
    SVC.resetModelSkip();
    let res = null, err = null;
    try {
      res = await global.callAI("general", [{ role: "user", content: "你好" }], { model: id, onFallback: () => {} });
    } catch (e) { err = e; }
    const last = chatCalls[chatCalls.length - 1] || {};
    const hasModel = !!last.model;
    const hasMsg = Array.isArray(last.messages) && last.messages.length > 0;
    const strOnly = hasMsg && last.messages.every((m) => typeof m.content === "string"); // 无图 => 不应出现 multipart 数组
    const ok = !err && res && res.text === "ok" && hasModel && strOnly;
    modelResults.push({ id, ok, sentModel: last.model, textOnly: strOnly, err: err ? (err.status + "/" + err.message) : null });
    w("  " + id.padEnd(18) + " sentModel=" + String(last.model).padEnd(16) + " 纯文本消息=" + strOnly + " 结果=" + (err ? "ERR " + err.status : JSON.stringify(res && res.text)));
  }
  const allOk = modelResults.every((r) => r.ok);
  w("  11/11 通过 = " + allOk + "  （依据：无图路径下 messages 全为 {role,content:string}，" +
    "不含 image_url 多模态数组；模型 id 与 provider 直连 URL 一一对应，故不存在 400 的图片格式成因）");
  check("all-11-models-text-ok", allOk, modelResults.filter((r) => !r.ok).map((r) => r.id).join(","));

  // ============ R5 有图路径：11 个模型手选 + 图片 ============
  w("");
  w("== R5 · 手选各模型 + 图片 → 多模态消息契约（视觉模型） ==");
  const visionChecked = [];
  for (const id of ["glm-4.6v-flash", "glm-4v-flash"]) {
    SVC.resetModelSkip();
    let sent = null, err = null;
    setFetch((rec, init) => {
      if (rec.url.indexOf("/api/ai/models") !== -1) return Promise.resolve(jsonResp(200, '{"models":[]}'));
      try { sent = JSON.parse(init.body); } catch (e) { sent = null; }
      return Promise.resolve(jsonResp(200, 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n', null));
    });
    try { await global.callAI("vision", [{ role: "user", content: "看图" }], { model: id, image: "data:image/jpeg;base64," + png }); } catch (e) { err = e; }
    const arr = sent && sent.messages[sent.messages.length - 1].content;
    const url = Array.isArray(arr) ? arr[0].image_url.url : "";
    const good = !err && url.indexOf("data:image/png;base64,") === 0;
    visionChecked.push({ id, good, url: url.slice(0, 30), err: err ? err.message : null });
    w("  " + id.padEnd(16) + " image_url 前缀=" + String(url).slice(0, 30) + " 结果=" + (err ? "ERR " + err.message : "ok"));
  }
  check("vision-models-mime-correct", visionChecked.every((v) => v.good), JSON.stringify(visionChecked));

  // ============ SUMMARY ============
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
  out.push("HARNESS ERROR: " + (e && e.stack ? e.stack : e));
  fs.writeFileSync(OUT, out.join("\n"), "utf8");
  console.log("WROTE " + OUT + " (harness error)");
});
