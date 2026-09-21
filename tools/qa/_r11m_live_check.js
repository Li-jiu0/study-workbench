/* 【R11m】用「线上抓下来的」xt-log.js 真跑一遍上报请求构造（消除「本地对 ≠ 线上对」的歧义）。
   自给自足：脚本自己 HTTP 抓 http://110.42.134.62/assets/xt-log.js，无需预先下载快照。 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const ROOT = "D:/下载的文件/学习工作台";
const CFG = fs.readFileSync(path.join(ROOT, "assets/config.js"), "utf8");

function fetchLive() {
  return new Promise((resolve, reject) => {
    http.get({ host: "110.42.134.62", port: 80, path: "/assets/xt-log.js",
               headers: { "Cache-Control": "no-cache", "User-Agent": "r11m-live-check" } }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    }).on("error", reject);
  });
}

(async function main() {
  const LIVE = await fetchLive();
  console.log("线上 xt-log.js 抓取成功，字节数 =", Buffer.byteLength(LIVE, "utf8"));

  const dom = new JSDOM("<!doctype html><html></html>", { url: "file:///android_asset/x.html", runScripts: "outside-only" });
  const w = dom.window;
  const store = {};
  Object.defineProperty(w, "localStorage", {
    configurable: true,
    value: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }
  });
  const sent = {};
  w.XMLHttpRequest = function () {
    const s = this;
    s.open = (m, u) => { sent.m = m; sent.u = u; };
    s.setRequestHeader = (k, v) => { sent[k] = v; };
    s.send = b => { sent.body = b; };
  };
  w.eval(CFG);
  w.eval(LIVE);
  w.localStorage.setItem("study_workbench_token", "TK");
  let failCb = null;
  w.XTLog.report(null, (s, r) => { failCb = { s, r }; });

  const body = JSON.parse(sent.body);
  const checks = [
    ["URL 为 config.js 绝对地址（file:// 下非 file:///api/…）", /^http:\/\/110\.42\.134\.62:8000\/api\/feedbacks$/.test(sent.u), sent.u],
    ["Content-Type = application/json", sent["Content-Type"] === "application/json", sent["Content-Type"]],
    ["Authorization = Bearer TK", sent.Authorization === "Bearer TK", sent.Authorization],
    ["body.type = bug", body.type === "bug", body.type],
    ["content 长度落在 [10,2000]", body.content.length >= 10 && body.content.length <= 2000, body.content.length],
    ["未提前回调失败", failCb === null, JSON.stringify(failCb)]
  ];
  let bad = 0;
  for (const [n, okv, v] of checks) { if (!okv) bad++; console.log((okv ? "  PASS  " : "  FAIL  ") + n + "  ← " + v); }
  console.log(bad ? ("线上文件校验 FAIL " + bad) : "线上文件校验：全通过");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log("抓取/执行失败：", e.message); process.exit(2); });

