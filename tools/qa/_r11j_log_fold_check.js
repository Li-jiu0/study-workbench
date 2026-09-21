/* 【R11j】日志页「明细收放」行为校验（jsdom，真实 DOM 交互）
   断言：①初始展开 ②点击→收起（类名/文案/aria/localStorage）③再点→展开还原
         ④持久化：localStorage=1 时重新进页保持收起 ⑤收起状态下 render() 不破坏结构 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = "D:/下载的文件/学习工作台";
const html = fs.readFileSync(path.join(ROOT, "日志.html"), "utf8");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name); }
}

function makePage(savedFolded) {
  const dom = new JSDOM(html, {
    url: "http://localhost/" + encodeURIComponent("日志") + ".html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    beforeParse(window) {
      // 预置持久化状态（模拟上一次会话的选择）
      try { window.localStorage.setItem("lg_list_folded", savedFolded ? "1" : "0"); } catch (e) {}
      // 页面内联脚本依赖 XTLog / icon 渲染，给最小垫片（只影响 render 内容，不影响收放逻辑）
      window.XTLog = {
        stats: function () { return { total: 2, error: 0, warn: 1, info: 1, debug: 0, firstTs: "", lastTs: "" }; },
        get: function () {
          return [{ level: "info", module: "xt-log", t: "2026-09-21T10:31:43", msg: "日志门面就绪", ctx: "level>=info", page: "%E6%97%A5%E5%BF%97.html" }];
        },
        getMinLevel: function () { return "info"; },
        exportText: function () { return ""; }
      };
      window.showToast = function () {};
    }
  });
  // 只执行页面最后一个内联 <script>（日志页逻辑）；外链 assets 不加载
  const scripts = dom.window.document.querySelectorAll("script:not([src])");
  const inline = scripts[scripts.length - 1].textContent;
  dom.window.eval(inline);
  // jsdom outside-only 下 readyState 停在 loading 且 DOMContentLoaded 不自动派发；
  // 生产浏览器此时 boot 挂到 DOMContentLoaded 上会正常执行 —— 这里手动派发模拟同一时序。
  if (dom.window.document.readyState === "loading") {
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));
  }
  return dom;
}

function card(d) { return d.window.document.getElementById("lgListCard"); }
function btn(d) { return d.window.document.getElementById("lgFoldBtn"); }
function list(d) { return d.window.document.getElementById("lgList"); }

console.log("== ① 初始（未存收起态） ==");
let d = makePage(false);
ok(d.window.document.getElementById("lgMeta").textContent !== "正在读取…", "boot 已真实执行（哨兵：lgMeta 被渲染）");
ok(card(d).className.indexOf("lg-folded") === -1, "初始无 lg-folded（展开态）");
ok(btn(d).textContent.indexOf("收起") === 0, "初始按钮文案=收起明细");
ok(btn(d).getAttribute("aria-expanded") === "true", "初始 aria-expanded=true");
ok(!!list(d) && list(d).innerHTML.length > 0, "列表 DOM 存在且有内容");

console.log("== ② 点击一次 → 收起 ==");
d.window.lgToggleList();
ok(card(d).className.indexOf("lg-folded") !== -1, "卡片获得 lg-folded");
ok(btn(d).textContent.indexOf("展开") === 0, "按钮文案切换为展开明细");
ok(btn(d).getAttribute("aria-expanded") === "false", "aria-expanded=false");
ok(d.window.localStorage.getItem("lg_list_folded") === "1", "localStorage 记住收起态");
const listHtmlBefore = list(d).innerHTML;
ok(listHtmlBefore.length > 0, "收起后 #lgList DOM 仍保留（未删除）");

console.log("== ③ 再点一次 → 展开 ==");
d.window.lgToggleList();
ok(card(d).className.indexOf("lg-folded") === -1, "卡片恢复展开态");
ok(btn(d).textContent.indexOf("收起") === 0, "按钮文案恢复收起明细");
ok(d.window.localStorage.getItem("lg_list_folded") === "0", "localStorage 记住展开态");

console.log("== ④ 收起状态下触发 render()，结构不破坏 ==");
d.window.lgToggleList(); // 再收起
d.window.lgSetLv("error"); // 触发一次完整 render（走筛选路径）
ok(card(d).className.indexOf("lg-folded") !== -1, "render 后仍保持收起");
ok(!!list(d), "render 后 #lgList 仍在 DOM");
d.window.lgToggleList();
ok(list(d).innerHTML.length > 0, "再展开后列表内容可用");

console.log("== ⑤ 持久化：上次收起 → 重新进页保持收起 ==");
let d2 = makePage(true);
ok(card(d2).className.indexOf("lg-folded") !== -1, "重进页自动恢复收起态");
ok(btn(d2).textContent.indexOf("展开") === 0, "重进页按钮文案=展开明细");

console.log("\n结果: " + pass + " PASS / " + fail + " FAIL");
process.exit(fail ? 1 : 0);
