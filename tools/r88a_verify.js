/* R88-A 行为验证（jsdom）：把 xt-aiusage.js 挂到一个假 DOM 上，
 * 用假的服务端 /usage 数据 + 假的本机账本，验证：
 *   1) 按模型逐条列出（不聚合）：模型行数 == 服务端模型数 + 仅本机有记录的模型数
 *   2) A 口径排序：默认 remaining 升序（剩余少的排前；额度未知的排最后）
 *   3) 四项指标齐全：资源配额 / 已使用量 / 剩余可用量 / 预计耗尽时间
 *   4) 高亮：remaining=0 → data-risk="exhausted"；剩余不足 10% → "low"
 *   5) 筛选：data-quota-filter=low 后只剩 low 桶模型
 *   6) 数据缺失如实显示「— 服务端未提供预估」/「无配额数据」，不编造
 *
 * 运行： NODE_PATH=C:/Users/ATM/node_modules node tools/r88a_verify.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = "D:\\下载的文件\\学习工作台";
const SRC = fs.readFileSync(path.join(ROOT, "assets", "xt-aiusage.js"), "utf8");

// ---- 假服务端 /usage 快照 --------------------------------------------------
const serverSnapshot = {
  ok: true,
  serverTime: "2026-01-01T10:00:00",
  used: 0,
  limit: 0,
  models: {
    // 剩余 0 → exhausted（红）
    "deepseek-v4-flash-ga-260731": {
      used: 1000, calls: 12, failCalls: 1, freeQuota: 1000, quotaType: "tokens",
      remaining: 0, percent: 100, status: "exhausted", exhausted: true,
      estRemainingRuns: 0, expireAt: "", expired: false
    },
    // 剩余 90 / 1000 = 9% → low（橙）
    "qwen-max-latest": {
      used: 910, calls: 40, failCalls: 0, freeQuota: 1000, quotaType: "tokens",
      remaining: 90, percent: 91, status: "low", exhausted: false,
      estRemainingRuns: 18, estRemainingRunsTxt: "", estBaselineTs: 1735722000000,
      estAvgPerDay: 5, estDays: 3.6, expireAt: "", expired: false
    },
    // 剩余充足 → ok；服务端未给预估 → 应如实写「— 服务端未提供预估」
    "glm-4-plus": {
      used: 200, calls: 8, failCalls: 0, freeQuota: 5000, quotaType: "tokens",
      remaining: 4800, percent: 4, status: "ok", exhausted: false,
      expireAt: "", expired: false
    }
  }
};

const localRecords = [
  { ts: Date.now(), model: "deepseek-v4-flash-ga-260731", modelId: "deepseek-v4-flash-ga-260731", ok: true, inTok: 10, outTok: 20 },
  { ts: Date.now(), model: "qwen-max-latest", modelId: "qwen-max-latest", ok: true, inTok: 5, outTok: 5 },
  // 仅本机有、服务端配额表里没有 → 应如实展示为「无配额数据」，不得伪造
  { ts: Date.now(), model: "local-only-model", modelId: "local-only-model", ok: true, inTok: 3, outTok: 4 }
];

const KEY = "xt_ai_usage_v1";

const html = `<!DOCTYPE html><html><body>
  <button id="setTabAbout">关于</button>
  <div id="setPanelAbout" class="active"></div>
</body></html>`;

const dom = new JSDOM(html, { url: "https://example.com/", runScripts: "outside-only" });
const { window } = dom;

// localStorage：写入本机账本
window.localStorage.setItem(KEY, JSON.stringify(localRecords));

// window.XT_AI_USAGE stub（本文件只读，账本逻辑另在 ai-service.js）
window.XT_AI_USAGE = {
  list() { return localRecords; },
  clear() { return true; },
  filterByRange(records) { return records; },
  summarize(records) {
    return {
      calls: records.length,
      total: records.reduce((s, r) => s + (r.inTok || 0) + (r.outTok || 0), 0),
      inTok: records.reduce((s, r) => s + (r.inTok || 0), 0),
      outTok: records.reduce((s, r) => s + (r.outTok || 0), 0),
      fail: 0,
      lastTs: Date.now(),
      rows: records.map(r => ({
        model: r.model, count: 1, total: (r.inTok || 0) + (r.outTok || 0),
        inTok: r.inTok, outTok: r.outTok, fail: 0, ratio: 1
      }))
    };
  },
  formatNum(n) {
    const v = Math.round(Number(n) || 0);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },
  formatTime(ts) { const d = new Date(Number(ts) || 0); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); }
};

// fetch stub：/api/ai/usage → 返回 fastosserverSnapshot
window.fetch = function (url) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(JSON.parse(JSON.stringify(serverSnapshot)))
  });
};

window.alert = undefined; window.confirm = undefined; window.prompt = undefined;

// 在 window 上下文执行源码（IIFE，会自动挂载到 #setPanelAbout）
window.eval(SRC);

const results = [];
function ok(name, cond, extra) { results.push((cond ? "PASS  " : "FAIL  ") + name + (extra ? ("  :: " + extra) : "")); }

setTimeout(function () {
  const doc = window.document;
  const list = doc.getElementById("UsageModelList");
  ok("UsageModelList 存在", !!list);
  const cards = list ? list.querySelectorAll(".xt-us-model") : [];
  // 3 个服务端模型 + 1 个仅本机模型 = 4 行；逐条列出、不聚合
  ok("逐模型列出（4 行，不聚合）", cards.length === 4, "实际 " + cards.length + " 行");

  const names = Array.prototype.map.call(cards, c => (c.querySelector(".xt-us-model-name") || {}).textContent || "");
  // A 口径：remaining 升序 → deepseek(0) < qwen(90) < glm(4800)，local-only 无配额排最后
  const orderOk = /deepseek/.test(names[0]) && /qwen/.test(names[1]) && /glm/.test(names[2]) && /local-only/.test(names[3]);
  ok("A 口径排序：remaining 升序（少→多，未知最后）", orderOk, JSON.stringify(names));

  // 高亮：deepseek data-risk=exhausted；qwen data-risk=low；glm 无
  const risks = Array.prototype.map.call(cards, c => c.getAttribute("data-risk"));
  ok("高亮 exhausted/low", risks[0] === "exhausted" && risks[1] === "low" && risks[2] === "", JSON.stringify(risks));

  // 四项指标标签齐全
  const labels = Array.prototype.map.call(cards[0].querySelectorAll(".xt-us-metric-label"), n => n.textContent);
  ok("四项指标齐全", JSON.stringify(labels) === JSON.stringify(["资源配额", "已使用量", "剩余可用量", "预计耗尽时间"]), JSON.stringify(labels));

  // deepseek：配额 1,000 / 已用 1,000 / 剩余 0 / 预计耗尽 已耗尽
  const d0 = cards[0].textContent;
  ok("deepseek 剩余=0 且显示已耗尽", /剩余/.test(d0) && /已耗尽/.test(d0), "文本含「已耗尽」");
  ok("deepseek 展示原始 modelId", /modelId:\s*deepseek-v4-flash-ga-260731/.test(d0));

  // glm：服务端没给预估 → 如实「— 服务端未提供预估」，不编造
  const g2 = cards[2].textContent;
  ok("glm 无预估时如实显示「服务端未提供预估」", /服务端未提供预估/.test(g2));

  // local-only：无配额数据，不伪造
  const l3 = cards[3].textContent;
  ok("仅本机模型如实显示「无配额数据」", /无配额数据/.test(l3));

  // ---- 筛选：剩余不足 10%（low） ----
  const filterBar = doc.getElementById("UsageQuotaFilterBar");
  ok("筛选栏存在", !!filterBar);
  const lowBtn = filterBar ? filterBar.querySelector('[data-quota-filter="low"]') : null;
  ok("筛选按钮「剩余不足 10%」存在", !!lowBtn);
  // 模拟点击（直接派发 click 事件，走 bindChips 委托）
  if (lowBtn) {
    const ev = new window.Event("click", { bubbles: true });
    lowBtn.dispatchEvent(ev);
  }
  const cards2 = list.querySelectorAll(".xt-us-model");
  const names2 = Array.prototype.map.call(cards2, c => (c.querySelector(".xt-us-model-name") || {}).textContent || "");
  ok("筛选 low 后只剩 1 个（qwen）", cards2.length === 1 && /qwen/.test(names2[0]), JSON.stringify(names2));

  // 切回全部
  const allBtn = filterBar.querySelector('[data-quota-filter="all"]');
  if (allBtn) allBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  ok("切回「全部」恢复 4 行", list.querySelectorAll(".xt-us-model").length === 4);

  // ---- 排序切换：remainingDesc ----
  const sortBar = doc.getElementById("UsageQuotaSortBar");
  const descBtn = sortBar.querySelector('[data-quota-sort="remainingDesc"]');
  if (descBtn) descBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  const names3 = Array.prototype.map.call(list.querySelectorAll(".xt-us-model"), c => (c.querySelector(".xt-us-model-name") || {}).textContent || "");
  ok("切换 remaining 降序：glm 排首", /glm/.test(names3[0]), JSON.stringify(names3));

  console.log(results.join("\n"));
  const fails = results.filter(r => r.startsWith("FAIL")).length;
  console.log("\nRESULT: " + (fails ? (fails + " FAILED") : "ALL PASS"));
}, 200);
