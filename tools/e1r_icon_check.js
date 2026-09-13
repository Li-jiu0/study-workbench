#!/usr/bin/env node
/* =====================================================================
   e1r_icon_check.js · E1-R 图标清零验证脚本（2026-09-13）
   断言三件事：
   1. 全站 HTML 不再存在 bm-icon / mpc-icon / title-icon / nav-icon
      容器内的 emoji 图标（📁🗂️⚡📐✨👔❓🧩 及变体）
   2. 全站 HTML 用到的每个 data-icon 值都在 assets/icon-map.js 注册
   3. icon-map.js 语法可解析（require 后字典非空）
   退出码 0=全部通过；非 0=有残留/未注册，逐条打印
   运行：node tools/e1r_icon_check.js
   ===================================================================== */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var failures = [];

/* ---- 断言 3：icon-map.js 可加载且注册了 E1-R 六个新图标 ---- */
// icon-map.js 面向浏览器（挂 window），Node 下先注入假 window；
// 其 document 守卫（typeof document === "undefined"）会自动跳过 DOM 扫描
if (typeof global.window === "undefined") { global.window = {}; }
require(path.join(ROOT, "assets", "icon-map.js"));
var registered = global.window && global.window.LUCIDE_ICONS ? global.window.LUCIDE_ICONS : {};
var needNew = ["zap", "ruler", "sparkles", "briefcase", "help-circle", "puzzle"];
needNew.forEach(function (n) {
  if (!registered[n]) failures.push("[icon-map.js] E1-R 新图标未注册: " + n);
});
if (Object.keys(registered).length < 40) {
  failures.push("[icon-map.js] 注册图标数异常: " + Object.keys(registered).length);
}

/* ---- 扫描所有 HTML ---- */
var htmlFiles = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/i.test(f); });
// 图标类 emoji 清单（含变体选择符 U+FE0F），覆盖 E1 批次跳过 23 处 + 未入批页面
var ICON_EMOJI = /[\u{1F4C1}\u{1F5C2}\u{26A1}\u{1F4D0}\u{2728}\u{1F454}\u{2753}\u{1F9E9}]\u{FE0F}?/u;
var CONTAINER = /class="(?:bm-icon|mpc-icon|title-icon|nav-icon|bn-icon)[^"]*"[^>]*>([^<]*)</g;

var totalDataIconRefs = 0;
htmlFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(ROOT, f), "utf8");
  var m;
  // 断言 1：图标容器内不得残留 emoji
  while ((m = CONTAINER.exec(src)) !== null) {
    if (ICON_EMOJI.test(m[1])) {
      failures.push("[" + f + "] 图标容器残留 emoji: " + JSON.stringify(m[0]));
    }
  }
  // 断言 2：data-icon 引用必须已注册
  var refRe = /data-icon="([a-z0-9-]+)"/gi;
  while ((m = refRe.exec(src)) !== null) {
    totalDataIconRefs++;
    if (!registered[m[1]]) failures.push("[" + f + "] data-icon 未注册: " + m[1]);
  }
});

/* ---- 汇总 ---- */
console.log("扫描 HTML 页面数: " + htmlFiles.length);
console.log("data-icon 引用总数: " + totalDataIconRefs);
console.log("icon-map.js 注册图标数: " + Object.keys(registered).length);
if (failures.length === 0) {
  console.log("E1-R PASS: 全站图标容器零 emoji 残留，data-icon 引用 100% 已注册");
  process.exit(0);
} else {
  console.log("E1-R FAIL: " + failures.length + " 项问题");
  failures.forEach(function (x) { console.log("  - " + x); });
  process.exit(1);
}
