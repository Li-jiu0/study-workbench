/* T04 jsdom tests: ai-page.js visibility + xt-aiusage.js server snapshot */
const { JSDOM } = require("C:/Users/ATM/node_modules/jsdom");
const fs = require("fs");

const ROOT = "D:/下载的文件/学习工作台";
const PAGE_SRC = fs.readFileSync(ROOT + "/assets/ai-page.js", "utf8");
const USAGE_SRC = fs.readFileSync(ROOT + "/assets/xt-aiusage.js", "utf8");

const results = [];
function ok(name, cond, extra) {
  results.push((cond ? "PASS " : "FAIL ") + name + (extra ? ("  :: " + extra) : ""));
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= ai-page.js visibility ================= */
function loadPage(models) {
  const html = '<!DOCTYPE html><html><body><div id="aiModelList"></div><div id="aiModelPanel"></div><div id="aiInput"></div><div id="aiMessages"></div></body></html>';
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/",
    beforeParse(window) {
      window.AI_CONFIG = { builtinModels: models };
      window.showToast = function () {};
    },
  });
  const w = dom.window;
  w.eval(PAGE_SRC);
  if (w.document.readyState === "loading") {
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  }
  return w;
}

function pageListText(w) {
  const el = w.document.getElementById("aiModelList");
  return el ? el.textContent : "";
}

(async function testAiPage() {
  const models = [
    { id: "mA", name: "模型A", types: ["general"] },
    { id: "mB", name: "模型B", types: ["general"] },
    { id: "mC", name: "模型C", types: ["general"] },
  ];
  const w = loadPage(models);

  // --- Case: hideUnavailable=true ; mA failed, mB ok, mC no record ---
  w.localStorage.setItem(
    "ai_model_settings",
    JSON.stringify({
      disabled: {},
      order: [],
      health: { mA: { ok: false, ms: 12, err: "http_400", at: Date.now() }, mB: { ok: true, ms: 30, err: null, at: Date.now() } },
      hideUnavailable: true,
    })
  );
  w.document.dispatchEvent(new w.Event("xt:health-changed"));
  let txt = pageListText(w);
  ok("C1 failed model (mA) hidden when hideUnavailable=true", txt.indexOf("模型A") === -1, txt.replace(/\s+/g, " ").slice(0, 80));
  ok("C2 ok model (mB) visible", txt.indexOf("模型B") !== -1);
  ok("C3 【无 health 记录视为可见】 mC visible", txt.indexOf("模型C") !== -1);

  // --- C4: hide must NOT write disabled / must not persist any list ---
  const s1 = JSON.parse(w.localStorage.getItem("ai_model_settings"));
  ok("C4 hidden does NOT write disabled", JSON.stringify(s1.disabled) === "{}", JSON.stringify(s1.disabled));
  ok("C4 health unchanged (no side write)", s1.health.mA.ok === false);

  // --- Recovery: dispatch health-changed with mA ok:true ---
  w.localStorage.setItem(
    "ai_model_settings",
    JSON.stringify({
      disabled: {},
      order: [],
      health: { mA: { ok: true, ms: 9, err: null, at: Date.now() }, mB: { ok: true, ms: 30, err: null, at: Date.now() } },
      hideUnavailable: true,
    })
  );
  w.document.dispatchEvent(new w.Event("xt:health-changed"));
  txt = pageListText(w);
  ok("RECOVERY mA auto-returns after ok:true", txt.indexOf("模型A") !== -1, txt.replace(/\s+/g, " ").slice(0, 80));

  // --- hideUnavailable=false -> failed model visible again ---
  w.localStorage.setItem(
    "ai_model_settings",
    JSON.stringify({ disabled: {}, order: [], health: { mA: { ok: false, ms: 1, err: "cors", at: Date.now() } }, hideUnavailable: false })
  );
  w.document.dispatchEvent(new w.Event("xt:health-changed"));
  txt = pageListText(w);
  ok("C5 hideUnavailable=false -> failed mA visible", txt.indexOf("模型A") !== -1);

  // --- default (no hideUnavailable field) -> nothing hidden (conservative) ---
  w.localStorage.setItem(
    "ai_model_settings",
    JSON.stringify({ disabled: {}, order: [], health: { mA: { ok: false, ms: 1, err: "cors", at: Date.now() } } })
  );
  w.document.dispatchEvent(new w.Event("xt:health-changed"));
  txt = pageListText(w);
  ok("DEFAULT(missing hideUnavailable) -> mA still visible (no over-hide)", txt.indexOf("模型A") !== -1);
})();

/* ================= xt-aiusage.js server snapshot ================= */
function loadUsage(opts) {
  opts = opts || {};
  const html = '<!DOCTYPE html><html><body>' +
    '<div id="setTabAbout"></div>' +
    '<div id="setPanelAbout" class="active"></div>' +
    '<div id="setUsageRoot"></div>' +
    "</body></html>";
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/",
    beforeParse(window) {
      window.API_BASE = "http://api.test";
      window.AI_CONFIG = { builtinModels: opts.builtinModels !== undefined ? opts.builtinModels : [
        { id: "ark-seedream-4-0828", name: "Seedream-4.0-Fast" },
        { id: "模型A", name: "模型A（内置）" },
      ] };
      window.fetch = function (url, init) {
        calls.push({ url: url, init: init });
        return opts.fetchImpl ? opts.fetchImpl(url, init) : Promise.resolve({ status: 200, json: () => Promise.resolve({ models: {}, used: 0, limit: 999, date: "2026-09-18" }) });
      };
      try {
        if (opts.token) window.localStorage.setItem("study_workbench_token", opts.token);
        if (opts.settings) window.localStorage.setItem("ai_model_settings", JSON.stringify(opts.settings));
      } catch (e) {}
      window.XT_AI_USAGE = { list: function () { return opts.records || []; } };
    },
  });
  const w = dom.window;
  w.eval(USAGE_SRC);
  if (w.document.readyState === "loading") w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  return { w: w, calls: calls };
}

function txt(w, id) {
  const el = w.document.getElementById(id);
  return el ? String(el.textContent || "") : "";
}
function html(w, id) {
  const el = w.document.getElementById(id);
  return el ? String(el.innerHTML || "") : "";
}

(async function testUsage() {
  // ---------- G1 + success + percent clamp ----------
  const records = [
    { model: "模型A", ts: Date.now(), inTok: 10, outTok: 20, ok: true },
    { model: "模型B", ts: Date.now() - 100000, inTok: 5, outTok: 5, ok: true },
  ];
  const s1 = loadUsage({
    records: records,
    fetchImpl: function () {
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            models: {
              "模型A": { used: 12, calls: 3, failCalls: 0, freeQuota: 2000000, remaining: 1999988, percent: 0.0006, status: "ok" },
              "ark-seedream-4-0828": { used: 300, calls: 5, failCalls: 1, freeQuota: 200, remaining: 0, percent: 150, status: "exhausted" },
            },
            used: 7,
            limit: 999,
            date: "2026-09-18",
          }),
      });
    },
  });
  await delay(60);
  ok("G1 fetch fired to /api/ai/usage", s1.calls.length >= 1 && s1.calls[0].url.indexOf("/api/ai/usage") !== -1, JSON.stringify(s1.calls.map((c) => c.url)));
  ok("G1 base uses window.API_BASE", s1.calls.length && s1.calls[0].url === "http://api.test/api/ai/usage", s1.calls.length ? s1.calls[0].url : "no call");
  const serverHtml = html(s1.w, "UsageServerList");
  const widths = (serverHtml.match(/width:\s*([\d.]+)%/g) || []).map((s) => parseFloat(s.replace(/[^\d.]/g, "")));
  const maxW = widths.length ? Math.max.apply(null, widths) : -1;
  ok("PERCENT clamp: all bar widths <= 100 (mock had 150)", widths.length >= 1 && maxW <= 100, "widths=" + JSON.stringify(widths));
  ok("server status ok label", txt(s1.w, "UsageServerStatus").indexOf("更新于") !== -1, txt(s1.w, "UsageServerStatus"));
  ok("server models count filled", txt(s1.w, "UsageServerModels") === "2", txt(s1.w, "UsageServerModels"));
  ok("compare table rendered", html(s1.w, "UsageCompareList").indexOf("<table") !== -1);
  const cmpRows = (html(s1.w, "UsageCompareList").match(/<tr/g) || []).length;
  ok("compare rows = 3 (2 server + 1 local-only)", cmpRows === 4, "tr count=" + cmpRows + " (incl header)");

  // ---------- G4: 401 ----------
  const s401 = loadUsage({ fetchImpl: () => Promise.resolve({ status: 401, json: () => Promise.resolve({ detail: "unauth" }) }) });
  await delay(60);
  ok("G4 401 -> note mentions 需新版后端", txt(s401.w, "UsageServerNote").indexOf("需新版后端") !== -1, txt(s401.w, "UsageServerNote"));
  ok("G4 401 -> status label 需新版后端", txt(s401.w, "UsageServerStatus").indexOf("需新版后端") !== -1);

  // ---------- G4: 404 ----------
  const s404 = loadUsage({ fetchImpl: () => Promise.resolve({ status: 404, json: () => Promise.resolve({}) }) });
  await delay(60);
  ok("G4 404 -> note mentions 未提供用量接口", txt(s404.w, "UsageServerNote").indexOf("未提供用量接口") !== -1, txt(s404.w, "UsageServerNote"));

  // ---------- G4: network failure ----------
  const sNet = loadUsage({ fetchImpl: () => Promise.reject(new Error("network down")) });
  await delay(60);
  ok("G4 network fail -> note 网络异常或超时", txt(sNet.w, "UsageServerNote").indexOf("网络异常或超时") !== -1, txt(sNet.w, "UsageServerNote"));

  // ---------- G4: bad JSON ----------
  const sBad = loadUsage({ fetchImpl: () => Promise.resolve({ status: 200, json: () => Promise.reject(new Error("bad json")) }) });
  await delay(60);
  ok("G4 bad JSON -> note 无法解析", txt(sBad.w, "UsageServerNote").indexOf("无法解析") !== -1, txt(sBad.w, "UsageServerNote"));

  // ---------- Empty state: guest vs logged-in ----------
  const emptyJson = () => Promise.resolve({ models: {}, used: 0, limit: 999, date: "2026-09-18" });
  const sGuest = loadUsage({ fetchImpl: () => Promise.resolve({ status: 200, json: emptyJson }) });
  await delay(60);
  ok("EMPTY guest -> 游客模式 wording", txt(sGuest.w, "UsageServerList").indexOf("游客模式") !== -1, txt(sGuest.w, "UsageServerList"));

  const sLogged = loadUsage({ token: "abc.def.ghi", fetchImpl: () => Promise.resolve({ status: 200, json: emptyJson }) });
  await delay(60);
  ok("EMPTY logged-in -> 账号级累计为 0 wording", txt(sLogged.w, "UsageServerList").indexOf("账号级累计为 0") !== -1, txt(sLogged.w, "UsageServerList"));
  ok("guest wording != logged wording (distinguished)", txt(sGuest.w, "UsageServerList") !== txt(sLogged.w, "UsageServerList"));

  // ---------- mount safety: no setUsageRoot / setPanelAbout -> no crash ----------
  let crashed = false;
  try {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { runScripts: "dangerously", url: "http://localhost/", beforeParse(w2) { w2.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({}) }); } });
    dom.window.eval(USAGE_SRC);
    await delay(30);
  } catch (e) {
    crashed = true;
  }
  ok("MOUNT safety: missing nodes -> no throw", !crashed);

  // ---------- display name: 中文名解析 + 未知 id 回退 + 覆盖优先 ----------
  const nameResp = () =>
    Promise.resolve({
      status: 200,
      json: () =>
        Promise.resolve({
          models: {
            "ark-seedream-4-0828": { used: 5, calls: 2, failCalls: 0, freeQuota: 2000000, remaining: 1999995, percent: 0.0002, status: "ok" },
            "xx-unknown-1": { used: 1, calls: 1, failCalls: 0, freeQuota: 100, remaining: 99, percent: 1, status: "ok" },
          },
          used: 0,
          limit: 999,
          date: "2026-09-18",
        }),
    });
  const sName = loadUsage({ fetchImpl: nameResp });
  await delay(60);
  const nameHtml = html(sName.w, "UsageServerList");
  ok(
    "DISPLAY builtin name for ark-seedream-4-0828 (real config name Seedream-4.0-Fast)",
    nameHtml.indexOf("Seedream-4.0-Fast") !== -1 && nameHtml.indexOf("ark-seedream-4-0828") === -1,
    nameHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 150)
  );
  ok("DISPLAY unknown id falls back to raw id (xx-unknown-1)", nameHtml.indexOf("xx-unknown-1") !== -1);

  const sOv = loadUsage({ fetchImpl: nameResp, settings: { overrides: { "ark-seedream-4-0828": { name: "我的生图模型" } } } });
  await delay(60);
  const ovHtml = html(sOv.w, "UsageServerList");
  ok(
    "DISPLAY user override wins over builtin",
    ovHtml.indexOf("我的生图模型") !== -1 && ovHtml.indexOf("Seedream-4.0-Fast") === -1,
    ovHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 150)
  );

  // ---------- compare footnote ----------
  const sFoot = loadUsage({ fetchImpl: nameResp });
  await delay(60);
  ok("COMPARE footnote: 无「今日」拆分 说明存在", html(sFoot.w, "UsageCompareList").indexOf("无「今日」拆分") !== -1);

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.indexOf("FAIL") === 0).length;
  console.log("\nTOTAL " + results.length + "  FAILED " + failed);
})();
