#!/usr/bin/env node
/* =====================================================================
   e1r_icon_check.js · E1-R 图标清零验证脚本 —— 2026-09-13j 升级（兼容壳）
   ---------------------------------------------------------------------
   检查逻辑已整体升级并迁移至 tools/qa/icon_audit_0913j.js
   （全站图标盘库扫描器：HTML + assets/*.js 渲染字符串、容器类全集、
   白名单机制、data-icon 注册断言）。
   本文件保留原运行方式与退出码契约：
     运行：node tools/e1r_icon_check.js
     退出码 0 = 通过；非 0 = 有残留/未注册（逐条见 qa/icon_audit_0913j.log）
   ===================================================================== */
"use strict";

var path = require("path");
var spawnSync = require("child_process").spawnSync;

var scanner = path.join(__dirname, "qa", "icon_audit_0913j.js");
var r = spawnSync(process.execPath, [scanner], { stdio: "inherit" });
process.exit(r.status === null ? 1 : r.status);
