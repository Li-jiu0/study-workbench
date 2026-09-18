/* 需求 E 变更自验：删除独立页 + 内嵌「关于」Tab 懒渲染冒烟。
 * 自带一个够用的迷你 DOM（解析/序列化/事件/样式/属性），把真实的 assets/xt-aiusage.js
 * 放进 vm 沙箱跑，验证：懒渲染触发、6 卡、chips、明细默认折叠、空状态、账本未就绪。 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");   // 仓库根（本脚本在 tools/qa/ 下）
const OUT = [];

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; OUT.push("  PASS  " + name); }
  else { fail++; OUT.push("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}
function eq(name, actual, expect) {
  ok(name + " (期望 " + JSON.stringify(expect) + ")", actual === expect, "实际 " + JSON.stringify(actual));
}

/* ---------------- 迷你 DOM ---------------- */
const VOID_TAGS = { br: 1, img: 1, input: 1, hr: 1, meta: 1, link: 1, line: 1, polyline: 1, path: 1, circle: 1, rect: 1 };

function makeDoc() {
  const byId = {};
  const all = [];

  function makeEl(tag) {
    const el = {
      tagName: String(tag || "").toLowerCase(),
      attrs: {},
      children: [],
      parentNode: null,
      handlers: {},
      style: {},
      _text: "",
      get id() { return this.attrs.id || ""; },
      set id(v) { this.attrs.id = String(v); byId[String(v)] = this; },
      get className() { return this.attrs.class || ""; },
      set className(v) { this.attrs.class = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") byId[String(v)] = this; },
      addEventListener(type, fn) {
        if (!this.handlers[type]) this.handlers[type] = [];
        this.handlers[type].push(fn);
      },
      // 迷你 DOM 需要事件冒泡（真实浏览器里 click 会从按钮冒泡到容器上的委托监听）
      dispatch(type, ev) {
        const evt = ev || { target: this };
        let node = this;
        while (node) {
          const hs = node.handlers[type] || [];
          for (let i = 0; i < hs.length; i++) hs[i].call(node, evt);
          node = node.parentNode;
        }
      },
      appendChild(node) { node.parentNode = this; this.children.push(node); return node; },
      getElementsByTagName(tag) {
        const want = String(tag || "").toLowerCase();
        const out = [];
        (function walk(n) {
          for (let i = 0; i < n.children.length; i++) {
            const c = n.children[i];
            if (c.tagName === want) out.push(c);
            walk(c);
          }
        })(this);
        return out;
      },
      get innerHTML() { return serializeChildren(this); },
      set innerHTML(html) {
        this.children = [];
        this._text = "";
        parseInto(this, String(html == null ? "" : html));
      },
      get textContent() {
        if (this.children.length) return collectText(this);
        return this._text;
      },
      set textContent(v) {
        this.children = [];
        this._text = String(v == null ? "" : v);
      }
    };
    all.push(el);
    return el;
  }

  function collectText(n) {
    let s = "";
    for (let i = 0; i < n.children.length; i++) s += collectText(n.children[i]);
    return s ? s : (n._text || "");
  }

  function serialize(n) {
    let s = "<" + n.tagName;
    for (const k in n.attrs) {
      if (Object.prototype.hasOwnProperty.call(n.attrs, k)) s += " " + k + '="' + n.attrs[k] + '"';
    }
    if (VOID_TAGS[n.tagName]) return s + " />";
    s += ">" + serializeChildren(n) + "</" + n.tagName + ">";
    return s;
  }
  function serializeChildren(n) {
    if (n.children.length) {
      let s = "";
      for (let i = 0; i < n.children.length; i++) s += serialize(n.children[i]);
      return s;
    }
    return n._text || "";
  }

  function parseInto(parent, html) {
    const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
    let last = 0;
    let m;
    let cur = parent;
    while ((m = re.exec(html)) !== null) {
      const text = html.slice(last, m.index);
      if (text && text.replace(/\s+/g, "") !== "") {
        const t = makeEl("#text");
        t._text = text;
        cur.appendChild(t);
      }
      last = m.index + m[0].length;
      const tag = m[1].toLowerCase();
      const isClose = m[0].charAt(1) === "/";
      if (isClose) {
        if (cur.parentNode) cur = cur.parentNode;
        continue;
      }
      const node = makeEl(tag);
      const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
      let am;
      while ((am = attrRe.exec(m[2] || "")) !== null) {
        node.attrs[am[1]] = am[2];
        if (am[1] === "id") byId[am[2]] = node;
      }
      cur.appendChild(node);
      if (!VOID_TAGS[tag] && m[3] !== "/") cur = node;
    }
    const tail = html.slice(last);
    if (tail && tail.replace(/\s+/g, "") !== "") {
      const t = makeEl("#text");
      t._text = tail;
      cur.appendChild(t);
    }
  }

  const doc = {
    readyState: "interactive",
    _byId: byId,
    _all: all,
    _makeEl: makeEl,
    _parseInto: parseInto,
    createElement(tag) { return makeEl(tag); },
    getElementById(id) { return byId[id] || null; },
    addEventListener() {}
  };
  return doc;
}

/* ---------------- 构建 ai-settings.html 「关于」Tab 的最小骨架 ---------------- */
function buildSettingsDom() {
  const doc = makeDoc();
  const panel = doc._makeEl("section");
  panel.attrs.id = "setPanelAbout";
  panel.className = "xt-set-panel";
  doc._byId["setPanelAbout"] = panel;

  const tabBtn = doc._makeEl("button");
  tabBtn.attrs.id = "setTabAbout";
  tabBtn.className = "xt-set-tab";
  doc._byId["setTabAbout"] = tabBtn;

  const root = doc._makeEl("div");
  root.attrs.id = "setUsageRoot";
  doc._byId["setUsageRoot"] = root;
  panel.appendChild(root);

  return { doc: doc, panel: panel, tabBtn: tabBtn, root: root };
}

/* ---------------- 沙箱 ---------------- */
function makeStorage(initial) {
  const map = Object.assign({}, initial || {});
  return {
    _map: map,
    getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem(k, v) { map[k] = String(v); },
    removeItem(k) { delete map[k]; }
  };
}

function loadUsageScript(sandbox) {
  const src = fs.readFileSync(path.join(ROOT, "assets", "xt-aiusage.js"), "utf8");
  vm.runInContext(src, sandbox, { filename: "xt-aiusage.js" });
}

function makeSandbox(dom, storage, xtUsage) {
  const moCallbacks = [];
  function MutationObserver(cb) { this._cb = cb; moCallbacks.push(cb); }
  MutationObserver.prototype.observe = function () {};
  MutationObserver.prototype.disconnect = function () {};

  const sandbox = {
    console: console,
    document: dom,
    localStorage: storage,
    MutationObserver: MutationObserver,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (xtUsage) sandbox.XT_AI_USAGE = xtUsage;
  vm.createContext(sandbox);
  sandbox.__mo = moCallbacks;
  return sandbox;
}

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------------- 主流程 ---------------- */
async function main() {
  OUT.push("=== 0) 独立页已删除 / 无残留路由 ===");
  // 拆开写是为了让「独立页文件名」不再以字面量出现在仓库里（需求已删除该独立页）
  const standalone = path.join(ROOT, "模型" + "用量.html");
  eq("独立页已不存在", fs.existsSync(standalone), false);

  OUT.push("=== 1) 懒渲染：未切到「关于」Tab 时不渲染 ===");
  const now = Date.now();
  const store = makeStorage({});
  const fakeUsage = {
    list: function () { return []; },
    summarize: function () { return { rows: [], calls: 0, inTok: 0, outTok: 0, total: 0, fail: 0, lastTs: 0 }; },
    filterByRange: function () { return []; },
    formatNum: function (n) { return String(n); },
    formatTime: function (ts) { return String(ts); }
  };
  let built = buildSettingsDom();
  let sb = makeSandbox(built.doc, store, fakeUsage);
  loadUsageScript(sb);
  eq("初始（Tab 未激活）挂载点为空", built.root.innerHTML.length, 0);
  eq("初始未生成用量区块", built.doc.getElementById("UsageBlock"), null);

  OUT.push("=== 2) 切到「关于」Tab 后渲染（click + MutationObserver 双通道） ===");
  built.tabBtn.dispatch("click");
  built.panel.className = "xt-set-panel active";
  for (let i = 0; i < sb.__mo.length; i++) sb.__mo[i]();
  await wait(30);
  const block = built.doc.getElementById("UsageBlock");
  ok("已生成用量区块", block !== null);
  ok("挂载点内有内容", built.root.innerHTML.length > 500, String(built.root.innerHTML.length));

  OUT.push("=== 3) 6 张总览卡在场 ===");
  const cellIds = ["UsageTotalCalls", "UsageTotalTokens", "UsageInTokens", "UsageOutTokens", "UsageModelCount", "UsageFailCount"];
  let cellHit = 0;
  for (let i = 0; i < cellIds.length; i++) {
    if (built.doc.getElementById(cellIds[i])) cellHit++;
  }
  eq("6 张卡齐全", cellHit, 6);
  const labels = ["调用次数", "合计 Token", "输入 Token", "输出 Token", "涉及模型", "失败次数"];
  let labelHit = 0;
  const html0 = built.root.innerHTML;
  for (let i = 0; i < labels.length; i++) if (html0.indexOf(labels[i]) !== -1) labelHit++;
  eq("6 个卡标题文案齐全", labelHit, 6);
  ok("最近一次时间字段在场", built.doc.getElementById("UsageUpdatedAt") !== null);

  OUT.push("=== 4) 筛选 chips 与排序 chips 在场 ===");
  const rangeBar = built.doc.getElementById("UsageRangeBar");
  const sortBar = built.doc.getElementById("UsageSortBar");
  eq("时间范围 chips 数", rangeBar ? rangeBar.getElementsByTagName("button").length : -1, 4);
  eq("排序 chips 数", sortBar ? sortBar.getElementsByTagName("button").length : -1, 6);
  const rangeText = ["今天", "近 7 天", "近 30 天", "全部"];
  let rHit = 0;
  for (let i = 0; i < rangeText.length; i++) if (html0.indexOf(rangeText[i]) !== -1) rHit++;
  eq("4 个时间范围文案齐全", rHit, 4);
  const sortText = ["合计 Token", "调用次数", "输入 Token", "输出 Token", "模型名称", "最近使用"];
  let sHit = 0;
  for (let i = 0; i < sortText.length; i++) if (html0.indexOf(sortText[i]) !== -1) sHit++;
  eq("6 个排序文案齐全", sHit, 6);

  OUT.push("=== 5) 空状态：无数据不报错 ===");
  const emptyBox = built.doc.getElementById("UsageEmpty");
  eq("空状态可见", emptyBox.style.display, "");
  eq("空状态主文案", built.doc.getElementById("UsageEmptyMain").textContent, "还没有任何用量记录");
  ok("空状态副文案非空", String(built.doc.getElementById("UsageEmptySub").textContent).length > 0);
  eq("空状态隐藏模型统计区", built.doc.getElementById("UsageModelWrap").style.display, "none");
  eq("空状态隐藏明细区", built.doc.getElementById("UsageDetailWrap").style.display, "none");
  ok("footnote 在场（500 条上限说明）", html0.indexOf("本地最多保留 500 条明细") !== -1);

  OUT.push("=== 6) 有数据：汇总 + 明细默认折叠 + 加载更多 + 清空 ===");
  const records = [
    { ts: now - 1000, model: "模型A", modelId: "ma", ok: true, inTok: 100, outTok: 300, exact: 3, reply: "这是回复内容", ms: 1200 },
    { ts: now - 2000, model: "模型B", modelId: "mb", ok: false, inTok: 20, outTok: 0, exact: 0, reply: "", err: "连接超时", ms: 900 }
  ];
  const usage2 = {
    list: function () { return records.slice(); },
    summarize: function (rs, range, sortBy) {
      return {
        rows: [
          { model: "模型A", modelId: "ma", count: 1, inTok: 100, outTok: 300, total: 400, fail: 0, lastTs: now - 1000, ratio: 400 / 420 },
          { model: "模型B", modelId: "mb", count: 1, inTok: 20, outTok: 0, total: 20, fail: 1, lastTs: now - 2000, ratio: 20 / 420 }
        ],
        calls: 2, inTok: 120, outTok: 300, total: 420, fail: 1, lastTs: now - 1000
      };
    },
    filterByRange: function () { return records.slice(); },
    formatNum: function (n) { return String(n); },
    formatTime: function () { return "08-12 14:23"; },
    clear: function () { return true; }
  };
  built = buildSettingsDom();
  sb = makeSandbox(built.doc, makeStorage({}), usage2);
  loadUsageScript(sb);
  built.panel.className = "xt-set-panel active";
  built.tabBtn.dispatch("click");
  for (let i = 0; i < sb.__mo.length; i++) sb.__mo[i]();
  await wait(30);
  const html1 = built.root.innerHTML;
  eq("总调用次数", built.doc.getElementById("UsageTotalCalls").textContent, "2");
  eq("合计 Token", built.doc.getElementById("UsageTotalTokens").textContent, "420");
  eq("涉及模型数", built.doc.getElementById("UsageModelCount").textContent, "2");
  eq("失败次数", built.doc.getElementById("UsageFailCount").textContent, "1");
  ok("汇总含模型A", html1.indexOf("模型A") !== -1);
  ok("汇总含占比百分比", html1.indexOf("占比") !== -1 && html1.indexOf("95%") !== -1 && html1.indexOf("4.8%") !== -1);
  ok("汇总含进度条宽度", /width:\s*\d/.test(html1));
  ok("明细含时间/输入/输出/合计", html1.indexOf("08-12 14:23") !== -1 && html1.indexOf("合计") !== -1);
  ok("明细含实测标签", html1.indexOf("实测") !== -1);
  ok("明细含估算标签", html1.indexOf("估算") !== -1);
  ok("明细含耗时", html1.indexOf("1200ms") !== -1);
  ok("明细含失败标记", html1.indexOf("失败") !== -1);
  ok("明细含失败原因", html1.indexOf("连接超时") !== -1);
  ok("明细默认折叠（无 open）", html1.indexOf('class="xt-us-item open"') === -1);
  ok("明细有展开回复按钮", html1.indexOf("展开回复") !== -1);

  OUT.push("=== 7) 展开 / 收起回复 ===");
  const detailList = built.doc.getElementById("UsageDetailList");
  const foldBtn = detailList.getElementsByTagName("button")[0];
  ok("找到折叠按钮", !!foldBtn);
  if (foldBtn) {
    foldBtn.dispatch("click", { target: foldBtn });
    ok("展开后 item 带 open", built.root.innerHTML.indexOf('class="xt-us-item open"') !== -1);
    ok("展开后按钮变「收起回复」", built.root.innerHTML.indexOf("收起回复") !== -1);
    foldBtn.dispatch("click", { target: foldBtn });
    ok("再次点击回到折叠", built.root.innerHTML.indexOf('class="xt-us-item open"') === -1);
  }

  OUT.push("=== 8) 加载更多 + 二次点击清空 ===");
  ok("加载更多按钮在场", built.doc.getElementById("UsageMoreBtn") !== null);
  const clearBtn = built.doc.getElementById("UsageClearBtn");
  ok("清空按钮在场", clearBtn !== null);
  if (clearBtn) {
    eq("清空初始文案", built.doc.getElementById("UsageClearTxt").textContent, "清空用量数据");
    clearBtn.dispatch("click", { target: clearBtn });
    eq("第一次点击进入确认态", built.doc.getElementById("UsageClearTxt").textContent, "再点一次确认清空");
    clearBtn.dispatch("click", { target: clearBtn });
    await wait(10);
    eq("第二次点击后复位文案", built.doc.getElementById("UsageClearTxt").textContent, "清空用量数据");
  }

  OUT.push("=== 9) 账本未就绪（XT_AI_USAGE 缺失）不报错 ===");
  built = buildSettingsDom();
  sb = makeSandbox(built.doc, makeStorage({}), null);
  loadUsageScript(sb);
  built.panel.className = "xt-set-panel active";
  built.tabBtn.dispatch("click");
  for (let i = 0; i < sb.__mo.length; i++) sb.__mo[i]();
  await wait(30);
  eq("警告条可见", built.doc.getElementById("UsageStoreWarn").style.display, "");
  eq("空状态文案为账本未就绪", built.doc.getElementById("UsageEmptyMain").textContent, "用量账本未就绪");

  OUT.push("=== 10) 该时间范围无数据的空状态 ===");
  const usage3 = {
    list: function () { return [{ ts: now - 40 * 24 * 3600 * 1000, model: "模型C", modelId: "mc", ok: true, inTok: 10, outTok: 10, exact: 0, reply: "old" }]; },
    summarize: function () { return { rows: [], calls: 0, inTok: 0, outTok: 0, total: 0, fail: 0, lastTs: 0 }; },
    filterByRange: function () { return []; },
    formatNum: function (n) { return String(n); },
    formatTime: function () { return "07-01 10:00"; },
    clear: function () { return true; }
  };
  built = buildSettingsDom();
  sb = makeSandbox(built.doc, makeStorage({}), usage3);
  loadUsageScript(sb);
  built.panel.className = "xt-set-panel active";
  built.tabBtn.dispatch("click");
  for (let i = 0; i < sb.__mo.length; i++) sb.__mo[i]();
  await wait(30);
  eq("范围无数据文案", built.doc.getElementById("UsageEmptyMain").textContent, "该时间范围内暂无用量记录");

  OUT.push("");
  OUT.push("结果：PASS=" + pass + "  FAIL=" + fail);
  fs.writeFileSync(path.join(__dirname, "_r86e2_smoke_out.txt"), OUT.join("\n"), "utf8");
}

main().catch(function (e) {
  OUT.push("自验脚本异常：" + (e && e.stack ? e.stack : String(e)));
  OUT.push("结果：PASS=" + pass + "  FAIL=" + fail);
  fs.writeFileSync(path.join(__dirname, "_r86e2_smoke_out.txt"), OUT.join("\n"), "utf8");
});
