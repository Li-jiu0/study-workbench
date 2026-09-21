/* 【R11k】日志时间显示修复校验（以 TZ=Asia/Shanghai 运行）
   ① xt-log.js fmtLocal：UTC→本地(+8)、显式偏移、naive 原样、非日期原样、跨日滚动、空值
   ② exportText：条目/范围/导出时间全部为本地时间，且不再残留 UTC ISO
   ③ 日志.html 真集成（加载真 xt-log.js）：列表时间 = 设备本地时间
   ④ 页面字段：URL 编码的中文页名解码显示 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = "D:/下载的文件/学习工作台";
const XTLOG = fs.readFileSync(path.join(ROOT, "assets/xt-log.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ROOT, "日志.html"), "utf8");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n); } };
const eq = (a, b, n) => ok(a === b, n + (a === b ? "" : "  ← 实际=" + JSON.stringify(a) + " 期望=" + JSON.stringify(b)));

console.log("TZ =", process.env.TZ, " 节点本地偏移 =", new Date().getTimezoneOffset(), "分钟");

function loadLog() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { url: "http://localhost/log.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const errs = [];
  w.addEventListener("error", e => errs.push(String(e.message)));
  w.eval(XTLOG);
  return { w, errs };
}

console.log("\n== ① fmtLocal 纯函数（UTC ISO → 设备本地时间） ==");
const { w } = loadLog();
const f = w.XTLog.fmtLocal;
eq(typeof f, "function", "XTLog.fmtLocal 已对外暴露");
eq(f("2026-09-21T10:31:43.000Z"), "2026-09-21 18:31:43", "UTC 10:31 → 本地 18:31（+8，即用户看到的时间缺陷）");
eq(f("2026-09-21T18:31:43+08:00"), "2026-09-21 18:31:43", "显式 +08:00 偏移正确换算");
eq(f("2026-09-21T20:00:00.000Z"), "2026-09-22 04:00:00", "跨日滚动正确（UTC 20:00 → 次日 04:00）");
eq(f("2026-09-21T10:31:43"), "2026-09-21 10:31:43", "naive（无时区）串保持原样，不偏移");
eq(f("1758440000000"), "1758440000000", "非日期串（Date.now 兜底）原样返回，不编造时间");
eq(f(""), "", "空值返回空串");
eq(f(null), "", "null 返回空串");

console.log("\n== ② exportText：导出文本全为本地时间 ==");
w.XTLog.info("test-mod", "一条测试日志", "ctx=x");
const txt = w.XTLog.exportText();
ok(/导出时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（设备本地时间）/.test(txt), "导出时间行为本地时间且标注");
ok(/范围: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ~ \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(txt), "时间范围行为本地时间");
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[INFO\]\[test-mod\] 一条测试日志/m.test(txt), "条目行时间为本地格式（空格分隔，非 T/Z）");
ok(!/\[INFO\]\[test-mod\][^\n]*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(txt), "条目行不再残留 UTC ISO 形态");
// 导出条目时间应等于「本地当前时间」（刚刚写入，误差容忍 5 秒）
const m = txt.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[INFO\]\[test-mod\]/m);
const p2 = n => (n < 10 ? "0" : "") + n;
const n = new Date();
const localNow = n.getFullYear() + "-" + p2(n.getMonth() + 1) + "-" + p2(n.getDate()) + " " + p2(n.getHours()) + ":" + p2(n.getMinutes()) + ":" + p2(n.getSeconds());
const diff = Math.abs(new Date(m[1].replace(" ", "T")) - new Date(localNow.replace(" ", "T"))) / 1000;
ok(diff <= 5, "导出条目时间 = 设备当前本地时间（差 " + diff + "s ≤ 5s）");

console.log("\n== ③ 日志.html 真集成：列表时间 = 设备本地时间 ==");
const dom = new JSDOM(PAGE, { url: "http://localhost/" + encodeURIComponent("日志") + ".html", runScripts: "outside-only", pretendToBeVisual: true });
const pw = dom.window;
pw.showToast = function () {};
pw.__XT_PROD__ = true;            // 与线上一致（生产只记 info 以上）
pw.eval(XTLOG);                    // 真 xt-log.js：加载时会写一条「日志门面就绪」
const scripts = pw.document.querySelectorAll("script:not([src])");
pw.eval(scripts[scripts.length - 1].textContent);
if (pw.document.readyState === "loading") {
  pw.document.dispatchEvent(new pw.Event("DOMContentLoaded", { bubbles: true }));
}
const times = Array.prototype.slice.call(pw.document.querySelectorAll(".lg-time")).map(e => e.textContent);
ok(times.length > 0, "列表已渲染出日志条目（" + times.length + " 条）");
const t0 = times[0] || "";
const nd = new Date();
const expDate = nd.getFullYear() + "-" + p2(nd.getMonth() + 1) + "-" + p2(nd.getDate());
ok(t0.indexOf(expDate) === 0, "首条时间日期为设备本地今天（" + t0 + "）");
ok(Number(t0.slice(11, 13)) === nd.getHours(), "首条时间小时为设备本地小时（" + t0.slice(11, 13) + " vs " + nd.getHours() + "）");
const meta = pw.document.getElementById("lgMeta").textContent;
ok(meta.indexOf("T") === -1 || !/\d{4}-\d{2}-\d{2}T\d{2}/.test(meta), "统计范围不残留 ISO 的 T 形态（" + meta.slice(0, 60) + "…）");

console.log("\n== ④ 页面字段解码显示 ==");
const rowsHtml = Array.prototype.slice.call(pw.document.querySelectorAll(".lg-more")).map(e => e.textContent).join("\n");
ok(rowsHtml.indexOf("日志.html") !== -1, "页面字段显示为可读中文「日志.html」");
ok(rowsHtml.indexOf("%E6%97%A5") === -1, "页面字段不再显示 URL 编码");

console.log("\n结果: " + pass + " PASS / " + fail + " FAIL");
process.exit(fail ? 1 : 0);
