/* 需求 E 自验：在 Node vm 沙箱里加载 ai-service.js（埋点与账本口径），
 * 用 mock 的 localStorage / fetch / DOM 验证：埋点写入、usage 实测优先、估算回落、
 * 失败记 0、存储不可用时不影响主流程、上限 500 裁剪、时间筛选、排序、占比、空状态。 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");   // 仓库根（本脚本在 tools/qa/ 下）
const AI_SERVICE = fs.readFileSync(path.join(ROOT, "assets", "ai-service.js"), "utf8");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}
function eq(name, actual, expect) {
  ok(name + " (期望 " + JSON.stringify(expect) + ")", actual === expect, "实际 " + JSON.stringify(actual));
}

// ---------- mock ----------
function makeStorage(initial, throwOnSet) {
  const map = Object.assign({}, initial || {});
  return {
    _map: map,
    getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem(k, v) {
      if (throwOnSet) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      map[k] = String(v);
    },
    removeItem(k) { delete map[k]; }
  };
}

function makeNode(id) {
  return {
    id: id,
    className: "",
    style: { display: "" },
    textContent: "",
    innerHTML: "",
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    addEventListener() {},
    getElementsByTagName() { return []; }
  };
}

function makeDom() {
  const nodes = {};
  return {
    readyState: "interactive",
    getElementById(id) {
      if (!nodes[id]) nodes[id] = makeNode(id);
      return nodes[id];
    },
    addEventListener() {},
    _nodes: nodes
  };
}

// 构造一个「流式 SSE」响应：若干 content chunk，最后一个 chunk 带 usage
function sseResponse(chunks, usage) {
  const enc = new TextEncoder();
  const frames = chunks.map(function (c) {
    return enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: c } }] }) + "\n\n");
  });
  const tail = { choices: [] };
  if (usage) tail.usage = usage;
  frames.push(enc.encode("data: " + JSON.stringify(tail) + "\n\n"));
  frames.push(enc.encode("data: [DONE]\n\n"));
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: function () { return "text/event-stream"; } },
    body: {
      getReader: function () {
        return {
          read: function () {
            return Promise.resolve(i < frames.length
              ? { done: false, value: frames[i++] }
              : { done: true, value: undefined });
          }
        };
      }
    }
  };
}

function wholeResponse(obj) {
  const enc = new TextEncoder();
  const buf = enc.encode(JSON.stringify(obj));
  return {
    ok: true,
    status: 200,
    headers: { get: function () { return "application/json"; } },
    text: function () { return Promise.resolve(JSON.stringify(obj)); },
    body: null
  };
}

const AI_CONFIG = {
  systemPrompt: "",
  providers: {
    tp: { name: "测试平台", apiUrl: "https://example.test/v1/chat/completions", apiKey: "sk-test", apiFormat: "openai" }
  },
  models: [
    { id: "ma", name: "模型A", model: "test-a", provider: "tp", types: ["general"] },
    { id: "mb", name: "模型B", model: "test-b", provider: "tp", types: ["general"] }
  ],
  FUNC_TYPES: { general: { temperature: 0.7, maxTokens: 1000 } },
  maxMode: { maxTokens: 8000 },
  modelModes: {}
};

function loadContext(storage, fetchImpl) {
  const document = makeDom();
  const sandbox = {
    console: console,
    localStorage: storage,
    document: document,
    TextDecoder: TextDecoder,
    TextEncoder: TextEncoder,
    AbortController: AbortController,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.AI_CONFIG = AI_CONFIG;
  vm.createContext(sandbox);
  vm.runInContext(AI_SERVICE, sandbox, { filename: "ai-service.js" });
  return sandbox;
}

const MC_A = { id: "ma", name: "模型A", model: "test-a", provider: "tp", types: ["general"] };
const MC_B = { id: "mb", name: "模型B", model: "test-b", provider: "tp", types: ["general"] };

async function main() {
  console.log("=== 1) 埋点：流内有 usage -> 记实测值 ===");
  let storage = makeStorage({});
  let ctx = loadContext(storage, function () {
    return Promise.resolve(sseResponse(["你好", "，世界"], { prompt_tokens: 120, completion_tokens: 340 }));
  });
  let U = ctx.window.XT_AI_USAGE;
  ok("XT_AI_USAGE 已导出", !!U && typeof U.list === "function");
  let text = await ctx.window.AI_SERVICE.requestModel(MC_A, [{ role: "user", content: "你好" }], null, null, {});
  eq("返回正文未被埋点改变", text, "你好，世界");
  let list = U.list();
  eq("写入 1 条明细", list.length, 1);
  let r0 = list[0];
  eq("模型名", r0.model, "模型A");
  eq("模型 id", r0.modelId, "ma");
  eq("输入 token（实测）", r0.inTok, 120);
  eq("输出 token（实测）", r0.outTok, 340);
  eq("exact=3（输入+输出均实测）", r0.exact, 3);
  eq("成功标记", r0.ok, true);
  eq("回复内容", r0.reply, "你好，世界");
  ok("时间戳有效", typeof r0.ts === "number" && r0.ts > 0, String(r0.ts));

  console.log("=== 2) 埋点：无 usage -> 按字符数估算并标注 ===");
  storage = makeStorage({});
  ctx = loadContext(storage, function () {
    return Promise.resolve(sseResponse(["abcdefgh"], null));
  });
  U = ctx.window.XT_AI_USAGE;
  await ctx.window.AI_SERVICE.requestModel(MC_B, [{ role: "user", content: "你好" }], null, null, {});
  r0 = U.list()[0];
  eq("模型名", r0.model, "模型B");
  eq("exact=0（全估算）", r0.exact, 0);
  eq("输入估算：'你好' 2 中文 -> 2", r0.inTok, 2);
  eq("输出估算：'abcdefgh' 8 字符 -> 2", r0.outTok, 2);
  eq("估算函数一致性", U.estimateTokens("你好"), 2);
  eq("估算函数一致性(英)", U.estimateTokens("abcdefgh"), 2);

  console.log("=== 3) 埋点：整段响应（非流式）里的 usage 也要取到 ===");
  storage = makeStorage({});
  ctx = loadContext(storage, function () {
    return Promise.resolve(wholeResponse({
      choices: [{ message: { content: "整段答案" } }],
      usage: { input_tokens: 55, output_tokens: 66 }
    }));
  });
  U = ctx.window.XT_AI_USAGE;
  await ctx.window.AI_SERVICE.requestModel(MC_A, [{ role: "user", content: "hi" }], null, null, {});
  r0 = U.list()[0];
  eq("整段响应输入实测", r0.inTok, 55);
  eq("整段响应输出实测", r0.outTok, 66);
  eq("exact=3", r0.exact, 3);

  console.log("=== 4) 埋点：请求失败也记一笔（输出 0）且错误照常上抛 ===");
  storage = makeStorage({});
  ctx = loadContext(storage, function () {
    return Promise.reject(new TypeError("network down"));
  });
  U = ctx.window.XT_AI_USAGE;
  let threw = null;
  try {
    await ctx.window.AI_SERVICE.requestModel(MC_A, [{ role: "user", content: "你好" }], null, null, {});
  } catch (e) { threw = e; }
  ok("失败照常抛给主流程（行为未被埋点改变）", threw !== null && /network down/.test(String(threw && threw.message)));
  r0 = U.list()[0];
  eq("失败也记录", U.list().length, 1);
  eq("失败 ok=false", r0.ok, false);
  eq("失败输出记 0", r0.outTok, 0);
  ok("失败保留错误信息", typeof r0.err === "string" && r0.err.length > 0, r0.err);

  console.log("=== 5) 埋点：xtNoUsage（健康检查）不记账 ===");
  storage = makeStorage({});
  ctx = loadContext(storage, function () {
    return Promise.resolve(sseResponse(["ok"], null));
  });
  U = ctx.window.XT_AI_USAGE;
  await ctx.window.AI_SERVICE.requestModel(MC_A, [{ role: "user", content: "hi" }], null, null, { xtNoUsage: true });
  eq("健康检查不写明细", U.list().length, 0);

  console.log("=== 6) 容错：localStorage 抛异常时不影响对话 ===");
  storage = makeStorage({}, true); // setItem 恒抛
  ctx = loadContext(storage, function () {
    return Promise.resolve(sseResponse(["照常回答"], null));
  });
  U = ctx.window.XT_AI_USAGE;
  let t6 = await ctx.window.AI_SERVICE.requestModel(MC_A, [{ role: "user", content: "hi" }], null, null, {});
  eq("存储不可用时对话结果不变", t6, "照常回答");
  eq("写入静默失败，不抛错", U.list().length, 0);

  console.log("=== 7) 容错：账本 JSON 损坏时不抛错 ===");
  storage = makeStorage({ xt_ai_usage_v1: "{这不是JSON" });
  ctx = loadContext(storage, function () {
    return Promise.resolve(sseResponse(["x"], null));
  });
  U = ctx.window.XT_AI_USAGE;
  eq("损坏数据读成空", U.list().length, 0);
  await ctx.window.AI_SERVICE.requestModel(MC_A, [{ role: "user", content: "hi" }], null, null, {});
  eq("损坏后仍可继续写入", U.list().length, 1);

  console.log("=== 8) 汇总 / 占比 / 排序 / 时间筛选 ===");
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  storage = makeStorage({});
  ctx = loadContext(storage, function () {
    return Promise.resolve(sseResponse(["x"], null));
  });
  U = ctx.window.XT_AI_USAGE;
  // 直接用 record 造 3 条不同模型/不同时间的假数据
  U.record({ ts: now - 1 * 60 * 1000, model: "模型A", modelId: "ma", ok: true, inTok: 100, outTok: 300, exact: 3, reply: "A1" });
  U.record({ ts: now - 2 * DAY, model: "模型A", modelId: "ma", ok: true, inTok: 50, outTok: 50, exact: 0, reply: "A2" });
  U.record({ ts: now - 10 * DAY, model: "模型B", modelId: "mb", ok: false, inTok: 20, outTok: 0, exact: 0, reply: "", err: "boom" });
  const all = U.list();
  eq("共 3 条", all.length, 3);

  let sum = U.summarize(all, "all", "tokens");
  eq("总调用次数", sum.calls, 3);
  eq("总输入 token", sum.inTok, 170);
  eq("总输出 token", sum.outTok, 350);
  eq("合计 token", sum.total, 520);
  eq("失败次数", sum.fail, 1);
  eq("模型数", sum.rows.length, 2);
  eq("默认按合计 token 倒序：首位是模型A", sum.rows[0].model, "模型A");
  eq("模型A 调用次数", sum.rows[0].count, 2);
  eq("模型A 合计 token", sum.rows[0].total, 500);
  eq("模型A 占比", Math.round(sum.rows[0].ratio * 1000) / 1000, Math.round((500 / 520) * 1000) / 1000);
  eq("模型B 合计 token", sum.rows[1].total, 20);
  eq("模型B 占比", Math.round(sum.rows[1].ratio * 1000) / 1000, Math.round((20 / 520) * 1000) / 1000);

  let byCount = U.summarize(all, "all", "count");
  eq("按调用次数排序首位仍是模型A", byCount.rows[0].model, "模型A");
  let byName = U.summarize(all, "all", "name");
  eq("按名称排序首位是模型A", byName.rows[0].model, "模型A");
  eq("按名称排序次位是模型B", byName.rows[1].model, "模型B");
  let byTime = U.summarize(all, "all", "time");
  eq("按最近使用排序首位是模型A", byTime.rows[0].model, "模型A");

  eq("时间筛选 today 只剩 1 条", U.filterByRange(all, "today").length, 1);
  eq("时间筛选 7d 剩 2 条", U.filterByRange(all, "7d").length, 2);
  eq("时间筛选 30d 剩 3 条", U.filterByRange(all, "30d").length, 3);
  eq("时间筛选 all 剩 3 条", U.filterByRange(all, "all").length, 3);
  let sum7 = U.summarize(all, "7d", "tokens");
  eq("7d 汇总调用次数", sum7.calls, 2);
  eq("7d 汇总合计 token", sum7.total, 500);
  eq("7d 占比首位为 100%", Math.round(sum7.rows[0].ratio * 100), 100);

  console.log("=== 9) 条数上限 500（超出丢弃最旧） ===");
  storage = makeStorage({});
  ctx = loadContext(storage, function () { return Promise.resolve(sseResponse(["x"], null)); });
  U = ctx.window.XT_AI_USAGE;
  for (let i = 0; i < 510; i++) {
    U.record({ ts: now + i, model: "M" + i, modelId: "m", ok: true, inTok: 1, outTok: 1, exact: 0, reply: "" });
  }
  const big = U.list();
  eq("裁剪到 500 条", big.length, 500);
  eq("保留的是最新的（最后一条 M509）", big[big.length - 1].model, "M509");
  eq("最旧的 M0 已被丢弃", big[0].model, "M10");
  eq("上限常量", U.MAX_RECORDS, 500);

  console.log("=== 10) 回复内容截断上限 500 字 ===");
  storage = makeStorage({});
  ctx = loadContext(storage, function () { return Promise.resolve(sseResponse(["y"], null)); });
  U = ctx.window.XT_AI_USAGE;
  U.record({ ts: now, model: "M", modelId: "m", ok: true, inTok: 1, outTok: 1, exact: 0, reply: new Array(900 + 1).join("字") });
  eq("回复截断为 500", U.list()[0].reply.length, 500);

  // 11/12（独立页渲染用例）已移除：页面形态改为「关于 Tab 内嵌」，
  // 渲染相关断言全部迁移到 _r86e2_smoke.js；本文件只保留埋点与账本口径用例。

  console.log("=== 13) 清空 ===");
  eq("清空返回 true", U.clear(), true);
  eq("清空后无数据", U.list().length, 0);

  console.log("");
  console.log("结果：PASS=" + pass + "  FAIL=" + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error("自验脚本异常：", e);
  process.exit(2);
});
