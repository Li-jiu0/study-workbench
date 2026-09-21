/* 【R11m】日志「上报错误」修复校验：
   ① 兜底路径（无 api.js，模拟 file:// 的 App/本地打开）：URL 必须是 API_BASE 绝对地址
      （绝不出现 file:///api/... 或相对 /api/...）、Content-Type JSON、带 Bearer、body 合规
   ② api.js 路径（window.api 存在）：走 api('/api/feedbacks', POST, JSON body)
   ③ content 长度上限 2000（后端 FeedbackIn max_length=2000 硬约束）
   ④ 未登录 → fail(401)；api 失败 → 401 归一化
   ⑤ 与服务端 OpenAPI 契约一致（另行由 python 校验） */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const ROOT = "D:/下载的文件/学习工作台";
const XTLOG = fs.readFileSync(ROOT + "/assets/xt-log.js", "utf8");
const CONFIG = fs.readFileSync(ROOT + "/assets/config.js", "utf8");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n); } };
const eq = (a, b, n) => ok(a === b, n + (a === b ? "" : "  ← 实际=" + JSON.stringify(a) + " 期望=" + JSON.stringify(b)));

function mk(protocol, withApi) {
  const url = protocol === "file:" ? "file:///android_asset/%E6%97%A5%E5%BF%97.html" : "http://110.42.134.62/%E6%97%A5%E5%BF%97.html";
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, runScripts: "outside-only" });
  const w = dom.window;
  // file:// 属 opaque origin，jsdom 的 localStorage getter 会抛 SecurityError → 用垫片覆盖
  // （项目既有做法：必须 Object.defineProperty，直接赋值无效）
  const store = {};
  Object.defineProperty(w, "localStorage", {
    configurable: true,
    value: {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    }
  });
  const sent = { called: false };
  w.eval(CONFIG);            // 真 config.js：地址唯一来源
  w.eval(XTLOG);             // 真 xt-log.js
  w.localStorage.setItem("study_workbench_token", "TESTTOKEN");
  // 捕获兜底 XHR（直接写回 sent；用普通函数保证 this 指向实例）
  sent.headers = {};
  w.XMLHttpRequest = function () {
    var self = this;
    self.open = function (m, u) { sent.called = true; sent.method = m; sent.url = u; };
    self.setRequestHeader = function (k, v) { sent.headers[k] = v; };
    self.send = function (body) { sent.body = body; sent.obj = self; };
  };
  if (withApi) {
    sent.apiCalls = [];
    w.api = function (path, opts) {
      sent.apiCalls.push({ path, opts });
      return sent.apiResult || Promise.resolve({ id: 1 });
    };
  }
  return { w, sent };
}

console.log("TZ 本地偏移 =", new Date().getTimezoneOffset(), "分钟（-480 = +08）");

console.log("\n== ① 兜底路径 · file://（复现原「HTTP 0」场景） ==");
{
  const { w, sent } = mk("file:", false);
  let cb = null;
  w.XTLog.report(null, (s, r) => { cb = { s, r }; });
  ok(sent.called, "已发出请求（原实现在此场景发不出请求）");
  ok(typeof sent.url === "string" && !/^file:/.test(sent.url), "URL 不是 file:// 协议（" + sent.url + "）");
  ok(typeof sent.url === "string" && /^https?:\/\//.test(sent.url), "URL 为 http(s) 绝对地址（file:// 场景下必须绝对，否则就是原 bug）");
  ok(typeof sent.url === "string" && sent.url.indexOf("http://110.42.134.62:8000/api/feedbacks") === 0,
     "URL = config.js 的后端绝对地址 + /api/feedbacks");
  eq(sent.method, "POST", "方法为 POST");
  eq(sent.headers["Content-Type"], "application/json", "Content-Type 为 application/json（后端要 JSON body）");
  eq(sent.headers["Authorization"], "Bearer TESTTOKEN", "带 Bearer 鉴权头（原实现完全没带 → 必 401）");
  const body = JSON.parse(sent.body);
  eq(body.type, "bug", "body.type = bug");
  ok(body.content.length >= 10, "body.content ≥ 10 字（后端 min_length）");
  ok(body.content.length <= 2000, "body.content ≤ 2000 字（后端 max_length；原实现 4000 必 422）← " + body.content.length);
  ok(body.content.indexOf("【自动错误上报】") === 0, "正文带自动上报标题");
  ok(cb === null, "请求未完成前不回调失败");
}

console.log("\n== ② 兜底路径 · http 同源（base 应为 ''） ==");
{
  const { w, sent } = mk("http:", false);
  w.XTLog.report(null, () => {});
  eq(sent.url, "/api/feedbacks", "http(s) 下走同源相对路径（与全站 api.js 口径一致）");
}

console.log("\n== ③ api.js 路径（window.api 存在时优先复用） ==");
{
  const { w, sent } = mk("http:", true);
  let doneCalled = false;
  w.XTLog.report(() => { doneCalled = true; }, () => {});
  ok(sent.apiCalls.length === 1, "调用了 window.api 一次");
  eq(sent.apiCalls[0].path, "/api/feedbacks", "api 路径 = /api/feedbacks");
  eq(sent.apiCalls[0].opts.method, "POST", "api 方法 = POST");
  const b = sent.apiCalls[0].opts.body;
  eq(b.type, "bug", "api body.type = bug");
  ok(b.content.length <= 2000 && b.content.length >= 10, "api body.content 长度合规（" + b.content.length + "）");
  setTimeout(() => {
    ok(doneCalled, "成功回调被调用");

    // ④ 失败归一化
    console.log("\n== ④ 失败路径 ==");
    const d2 = mk("http:", true);
    d2.w.XTLog.report(null, () => { throw new Error("不应调用"); });   // 无 token 场景另行构造
    // 未登录
    d2.w.localStorage.removeItem("study_workbench_token");
    let got = null;
    d2.w.XTLog.report(null, (s, r) => { got = { s, r }; });
    eq(got && got.s, 401, "未登录 → fail(401)（页面据此提示「上报需要登录」）");
    // api 抛「登录已过期」
    const d3 = mk("http:", true);
    d3.sent.apiResult = Promise.reject(new Error("登录已过期，请重新登录"));
    let got3 = null;
    d3.w.XTLog.report(null, (s, r) => { got3 = { s, r }; });
    setTimeout(() => {
      eq(got3 && got3.s, 401, "api 报登录过期 → 归一化为 401");
      ok(got3 && /登录已过期/.test(got3.r), "详情透传，供页面展示");
      console.log("\n结果: " + pass + " PASS / " + fail + " FAIL");
      process.exit(fail ? 1 : 0);
    }, 30);
  }, 30);
}
