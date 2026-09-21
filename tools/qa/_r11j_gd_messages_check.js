/* 【R11j】无领导小组讨论 buildAiMessages 修复校验：
   开场发言（无历史、无用户输入）时 messages 必须含至少一条 user —— 否则
   服务端 contents 为空 → Google 400「contents is not specified」。 */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync("D:/下载的文件/学习工作台/assets/group-discussion.js", "utf8");
// 在 IIFE 内把内部函数暴露出来（仅测试用，不改源文件）
const patched = SRC.replace("function buildAiMessages(char, userText) {",
  "window.__buildAiMessages = buildAiMessages;\n  window.__setTopic = function (t) { currentTopic = t; };\n  function buildAiMessages(char, userText) {");
if (patched === SRC) { console.log("FAIL  未找到 buildAiMessages 注入点"); process.exit(2); }

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/" + encodeURIComponent("面测") + ".html", runScripts: "outside-only"
});
const w = dom.window;
w.callAI = undefined; // 不走真请求，只看消息组装
w.eval(patched);
if (typeof w.__buildAiMessages !== "function") { console.log("FAIL  内部函数未暴露"); process.exit(2); }

const char = { id: "leader", name: "领导者", style: "强势推进，追求结论" };
// 选中一个真实题目（与页面点卡片进入讨论等价），否则 currentTopic 为 null
w.__setTopic({ id: "t1", title: "荒岛求生", desc: "从 10 件物品中按重要性选出 5 件", items: ["淡水资源", "指南针"] });
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n); } };

console.log("== 场景 A：开场发言（修复前必 400 的路径） ==");
const a = w.__buildAiMessages(char, "");
ok(Array.isArray(a) && a.length > 0, "返回非空消息数组");
ok(a[0].role === "system", "首条为 system（人设/题目上下文）");
ok(a.some(m => m.role === "user"), "存在至少一条 user 消息（contents 不再为空）");
ok(/开场发言/.test(a[a.length - 1].content), "末条为开场指令");

console.log("== 场景 B：用户发言后的回应（原有路径不受影响） ==");
const b = w.__buildAiMessages(char, "我认为应该优先保证通讯，先建信号塔。");
ok(b.some(m => m.role === "user" && /信号塔/.test(m.content)), "用户输入原样进入 user 消息");
ok(b[b.length - 1].role === "user" && /信号塔/.test(b[b.length - 1].content), "用户输入位于末条（最新发言）");
ok(b.filter(m => m.role === "system").length === 1, "system 仅一条");

console.log("\n结果: " + pass + " PASS / " + fail + " FAIL");
process.exit(fail ? 1 : 0);
