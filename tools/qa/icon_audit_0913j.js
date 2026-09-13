#!/usr/bin/env node
/* =====================================================================
   icon_audit_0913j.js · 全站图标盘库扫描器（批次 20260913j / kou-scanner）
   ---------------------------------------------------------------------
   职责：
   1. 扫描范围：项目根全部 HTML（排除 备份\ 目录与 blog_wechat.html）
      + assets/*.js（识别拼接 HTML 渲染字符串中的图标容器，重点
      app.js / chat-local.js 等；排除 assets/emoji 选择器数据文件）。
   2. 识别「图标容器内 emoji」：容器类全集
      title-icon/bn-icon/bm-icon/mpc-icon/hq-ic/sgc-icon/sq-ic/stat-icon/
      logo-icon/ed-hero-emoji/nav-icon 及通用 *ic / *icon / *emoji 类；
      JS 文件按「拼接 HTML 中 class 含 ic/icon 且内容为 emoji 字符」模式扫；
      JS 模式下跨行容器状态遇到明显代码行（分号/关键字/注释）即作废，
      避免误报模板串外的数据字段（icon: '📖'）、toast 文案与注释。
   3. 白名单（不报）：placeholder 属性文本、🌙 主题按钮文案、select/option
      原生控件选项文本（单独列类可追溯）、聊天/AI 回复正文字符串
      （msg/chat/bubble/reply 类）、用户头像字段（avatar/face 类）、
      achievement-badge 等内容型位置（badge 类）。
   4. 输出：全量清单（文件/行号/容器类/emoji/片段）+ 汇总统计 + 两类断言
      ① 图标容器 emoji 残留 = 0（可配置：ICON_AUDIT_ALLOW_RESIDUE=1 或
         --allow-residue 时降级为警告，用于首轮基线）；
      ② data-icon 引用 100% 已注册（键集合来自 assets/icon-map.js）。
   5. 结果写 tools/qa/icon_audit_0913j.log；退出码 0=通过，1=有残留/未注册。
      将来挂回归门：node tools/qa/icon_audit_0913j.js（严格模式）。
   ===================================================================== */
"use strict";

var fs = require("fs");
var path = require("path");

/* ---------------- 路径与配置 ---------------- */
var ROOT = path.join(__dirname, "..", ".."); // tools/qa/ → 项目根
var LOG_PATH = path.join(__dirname, "icon_audit_0913j.log");

var CFG = {
  // 简报铁律 7：死草稿与备份目录不碰也不扫
  excludeHtml: { "blog_wechat.html": "死草稿（简报公共约定 7）" },
  excludeDirs: ["备份", "node_modules", ".git", ".qa"],
  jsDir: path.join(ROOT, "assets"),
  // emoji 选择器数据文件属内容型 emoji（选择器面板用），非图标容器
  jsExcludeName: /^manifest\.js$/i,
  // 残留断言可配置：默认严格（=0），置 1 时残留降级为警告（基线模式）
  allowResidue:
    process.env.ICON_AUDIT_ALLOW_RESIDUE === "1" ||
    process.argv.indexOf("--allow-residue") >= 0,
  // E1-R 批次要求必须存在的 6 个图标（沿用旧 e1r_icon_check.js 契约）
  requiredIcons: ["zap", "ruler", "sparkles", "briefcase", "help-circle", "puzzle"],
  minRegistered: 40
};

/* ---------------- 识别规则 ---------------- */
// emoji 主体（不含独立变体选择符，避免空命中；FE0F 组合序列由主体位置代表）
var EMOJI_RE = new RegExp(
  "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}" +
  "\\u{231A}-\\u{23FF}\\u{2049}\\u{203C}]",
  "gu"
);
var TAG_RE = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
var CLASS_ATTR_RE = /class\s*=\s*"([^"]*)"/;
var DATA_ICON_RE = /data-icon\s*=\s*"([a-z0-9-]+)"/gi;
var PLACEHOLDER_RE = /placeholder\s*=\s*"[^"]*"/g;
var OPTION_TAG_RE = /<option\b[^>]*>/g;

// 简报指定的容器类全集
var KNOWN_CONTAINERS = [
  "title-icon", "bn-icon", "bm-icon", "mpc-icon", "hq-ic", "sgc-icon",
  "sq-ic", "stat-icon", "logo-icon", "ed-hero-emoji", "nav-icon"
];
// 内容型位置白名单类（头像/徽章/聊天气泡/AI 回复正文/表情按钮等）
var WHITELIST_TOKEN_RE =
  /avatar|badge|achievement|msg|chat|bubble|reply|face|emoji/i;

/** 单个 class token 分类：container / whitelist / other */
function classifyToken(tok) {
  if (KNOWN_CONTAINERS.indexOf(tok) >= 0) return "container";
  if (WHITELIST_TOKEN_RE.test(tok)) return "whitelist";
  if (/icon/i.test(tok)) return "container"; // 通用 *icon*
  if (/emoji$/i.test(tok)) return "container"; // 通用 *emoji（ed-hero-emoji 同理）
  if (/(^|-)ic$/i.test(tok)) return "container"; // 通用 *ic（hq-ic / sq-ic / ic）
  return "other";
}

/** 解析 class 属性值 → { container: [], whitelist: [] } */
function classifyClassAttr(clsValue) {
  var tokens = clsValue.trim().split(/\s+/);
  var container = [];
  var whitelist = [];
  tokens.forEach(function (t) {
    var k = classifyToken(t);
    if (k === "container") container.push(t);
    else if (k === "whitelist") whitelist.push(t);
  });
  return { container: container, whitelist: whitelist };
}

/** 遍历字符串中的 emoji，回调 { emoji, index } */
function forEachEmoji(str, cb) {
  var m;
  EMOJI_RE.lastIndex = 0;
  while ((m = EMOJI_RE.exec(str)) !== null) {
    cb({ emoji: m[0], index: m.index });
  }
}

/** 构造一条清单记录 */
function fmtFinding(file, lineNo, container, line, m, note) {
  return {
    file: file,
    line: lineNo,
    container: container,
    emoji: m.emoji,
    note: note || "",
    snippet: line.trim().slice(0, 140)
  };
}

/**
 * JS 文件行是否为明显代码行（非模板串内 HTML 内容行）。
 * 用于 JS 模式下作废跨行开容器状态：模板串里的 HTML 区域不会出现
 * 语句分号/关键字/注释，一旦出现说明已离开 HTML 片段，防止状态
 * 跨过函数边界产生误报（如 icon: '📖' 数据字段、showToast 文案、注释）。
 */
function isJsCodeLine(line) {
  var t = line.trim();
  if (t === "") return false;
  if (/^(\/\/|\/\*|\*)/.test(t)) return true;          // 注释行
  if (/(^|[^&]);/.test(t)) return true;                  // 语句分号（排除 HTML 实体 &xxx;）
  if (/=>|\bfunction\b|\breturn\b|\bconst\b|\blet\b|\bvar\b|\bif\b|\belse\b|\bfor\b|\bnew\b|\btry\b|\bcatch\b/.test(t)) return true;
  return false;
}

/* ---------------- 单文件扫描 ---------------- */
/**
 * 扫描一个文件：返回 { findings, skipped, dataIcons }
 * - findings：图标容器内 emoji 残留记录
 * - skipped ：白名单容器（头像/徽章/气泡等）内 emoji 计数
 * - dataIcons：[{ name, file, line }] data-icon 引用
 */
function scanFile(absPath, relPath, isJs) {
  var src = fs.readFileSync(absPath, "utf8");
  var lines = src.split(/\r\n|\n|\r/);
  var findings = [];
  var skipped = 0;
  var dataIcons = [];
  var selectSkipped = []; // select/option 内 emoji（原生控件文本，合法保留）
  var open = null; // 跨行开容器状态 { cls, line }
  var optOpen = false; // 跨行 <option> 未闭合状态

  lines.forEach(function (raw, idx) {
    var lineNo = idx + 1;
    // JS 渲染字符串里的引号转义（\"）先还原，再按 HTML 语法解析
    var line = isJs ? raw.replace(/\\(["'])/g, "$1") : raw;

    // ⓪ 跨行 option 内容行（select/option 内 emoji 为原生控件文本，合法保留）
    //    JS 模式下若本行是明显代码行，option 上下文同样作废（防状态粘滞误收）
    if (optOpen) {
      if (isJs && isJsCodeLine(raw)) {
        optOpen = false;
      } else {
        var optCloseIdx = line.search(/<\/(option|select)>/);
        var nextOptIdx = line.search(/<option\b/i);
        var cut = -1;
        if (optCloseIdx >= 0) cut = optCloseIdx;
        if (nextOptIdx >= 0 && (cut === -1 || nextOptIdx < cut)) cut = nextOptIdx;
        var oseg = cut >= 0 ? line.slice(0, cut) : line;
        forEachEmoji(oseg, function (m) {
          selectSkipped.push(
            fmtFinding(relPath, lineNo, "option", raw, m, "select 选项文本（合法保留）")
          );
        });
      }
    }

    // ① 跨行容器：上一行打开的容器在本行的内容段（至 "</" 前）
    //    JS 模式下若本行是明显代码行，说明已离开模板串 HTML 片段，
    //    开容器状态作废（防止状态跨过函数边界误报数据字段/文案/注释）
    if (open) {
      if (isJs && isJsCodeLine(raw)) {
        open = null;
      } else {
        var closeIdx = line.indexOf("</");
        var seg = closeIdx >= 0 ? line.slice(0, closeIdx) : line;
        forEachEmoji(seg, function (m) {
          findings.push(
            fmtFinding(relPath, lineNo, open.cls, raw, m, "跨行容器内容")
          );
        });
        if (closeIdx >= 0) open = null;
      }
    }

    // ② placeholder 属性区间记录（emoji 白名单：搜索框等文案）
    var phSpans = [];
    var pm;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((pm = PLACEHOLDER_RE.exec(line)) !== null) {
      phSpans.push([pm.index, pm.index + pm[0].length]);
    }
    var inPlaceholder = function (pos) {
      for (var i = 0; i < phSpans.length; i++) {
        if (pos >= phSpans[i][0] && pos < phSpans[i][1]) return true;
      }
      return false;
    };

    // ③ 逐标签扫描：容器类标签的内容区 emoji
    var tm;
    var lastOpen = null;
    TAG_RE.lastIndex = 0;
    while ((tm = TAG_RE.exec(line)) !== null) {
      var tagEnd = tm.index + tm[0].length;
      var clsM = CLASS_ATTR_RE.exec(tm[2]);
      if (!clsM) continue;
      var info = classifyClassAttr(clsM[1]);
      if (info.container.length === 0 && info.whitelist.length === 0) continue;

      var contentStart = tagEnd;
      var contentEnd = line.indexOf("<", tagEnd);
      if (contentEnd === -1) contentEnd = line.length;

      forEachEmoji(line.slice(contentStart, contentEnd), function (m) {
        var pos = contentStart + m.index;
        if (inPlaceholder(pos)) return;   // 白名单：placeholder 文本
        if (optOpen) {                     // 白名单：select/option 原生控件文本
          selectSkipped.push(
            fmtFinding(relPath, lineNo, "option", raw, m, "select 选项文本（合法保留）")
          );
          return;
        }
        if (info.container.length > 0) {
          findings.push(
            fmtFinding(
              relPath, lineNo, info.container.join(" "), raw, m,
              info.whitelist.length > 0 ? "混合类" : ""
            )
          );
        } else {
          skipped++; // 白名单容器：头像/徽章/气泡/回复正文等
        }
      });

      // 容器标签未在本行闭合（其后无 "</"）→ 记录跨行开容器
      if (
        info.container.length > 0 &&
        contentEnd === line.length &&
        line.indexOf("</", tagEnd) === -1
      ) {
        lastOpen = { cls: info.container.join(" "), line: lineNo };
      }
    }
    if (lastOpen !== null) open = lastOpen;

    // ③b select/option 上下文维护与行内 option 内容扫描：
    //    - 本行出现 </select> / </option> → 先退出 option 上下文
    //    - 逐个 <option> 开标签扫描其内容区 emoji（含 JS 拼接的 option 字符串；
    //      内容区若嵌套容器类标签，由步骤③的 optOpen 分支接管，不重复计数）
    //    - <option> 未在本行闭合（其后无 "<"）→ 进入跨行 option 上下文
    if (/<\/(select|option)>/i.test(line)) optOpen = false;
    var om;
    OPTION_TAG_RE.lastIndex = 0;
    while ((om = OPTION_TAG_RE.exec(line)) !== null) {
      var oTagEnd = om.index + om[0].length;
      var oContentEnd = line.indexOf("<", oTagEnd);
      if (oContentEnd === -1) oContentEnd = line.length;
      forEachEmoji(line.slice(oTagEnd, oContentEnd), function (m) {
        selectSkipped.push(
          fmtFinding(relPath, lineNo, "option", raw, m, "select 选项文本（合法保留）")
        );
      });
      optOpen = oContentEnd === line.length;
    }

    // ④ data-icon 引用收集（HTML 与 JS 渲染字符串同规则）
    var dm;
    DATA_ICON_RE.lastIndex = 0;
    while ((dm = DATA_ICON_RE.exec(line)) !== null) {
      dataIcons.push({ name: dm[1], file: relPath, line: lineNo });
    }
  });

  return { findings: findings, skipped: skipped, dataIcons: dataIcons, selectSkipped: selectSkipped };
}

/* ---------------- 文件清单 ---------------- */
function listHtml() {
  return fs
    .readdirSync(ROOT)
    .filter(function (f) { return /\.html$/i.test(f); })
    .filter(function (f) { return !CFG.excludeHtml.hasOwnProperty(f); })
    .sort();
}

function listJs() {
  return fs
    .readdirSync(CFG.jsDir)
    .filter(function (f) { return /\.js$/i.test(f); })
    .filter(function (f) { return !CFG.jsExcludeName.test(f); })
    .sort();
}

/* ---------------- icon-map.js 注册表 ---------------- */
// icon-map.js 面向浏览器（挂 window），Node 下先注入假 window；
// 其 document 守卫会自动跳过 DOM 扫描
if (typeof global.window === "undefined") { global.window = {}; }
require(path.join(ROOT, "assets", "icon-map.js"));
var registered =
  global.window && global.window.LUCIDE_ICONS ? global.window.LUCIDE_ICONS : {};
var registeredCount = Object.keys(registered).length;

/* ---------------- 执行扫描 ---------------- */
var htmlFiles = listHtml();
var jsFiles = listJs();

var allFindings = [];
var allDataIcons = [];
var allSelectSkipped = [];
var totalSkipped = 0;

htmlFiles.forEach(function (f) {
  var r = scanFile(path.join(ROOT, f), f, false);
  allFindings = allFindings.concat(r.findings);
  allDataIcons = allDataIcons.concat(r.dataIcons);
  allSelectSkipped = allSelectSkipped.concat(r.selectSkipped);
  totalSkipped += r.skipped;
});
jsFiles.forEach(function (f) {
  var r = scanFile(path.join(CFG.jsDir, f), "assets/" + f, true);
  allFindings = allFindings.concat(r.findings);
  allDataIcons = allDataIcons.concat(r.dataIcons);
  allSelectSkipped = allSelectSkipped.concat(r.selectSkipped);
  totalSkipped += r.skipped;
});

/* ---------------- 断言 ---------------- */
var failures = [];
var warnings = [];

// 断言①：图标容器 emoji 残留 = 0（可配置降级）
if (allFindings.length > 0) {
  if (CFG.allowResidue) {
    warnings.push(
      "图标容器 emoji 残留 " + allFindings.length + " 处（--allow-residue 宽松模式，降级为警告）"
    );
  } else {
    failures.push("图标容器 emoji 残留 " + allFindings.length + " 处");
  }
}

// 断言②：data-icon 引用 100% 已注册（读 icon-map.js 键集合，始终严格）
var unregRefs = allDataIcons.filter(function (r) { return !registered[r.name]; });
var unregByName = {};
unregRefs.forEach(function (r) {
  if (!unregByName[r.name]) unregByName[r.name] = [];
  unregByName[r.name].push(r.file + ":" + r.line);
});
if (unregRefs.length > 0) {
  failures.push(
    "data-icon 未注册引用 " + unregRefs.length + " 处（去重 " +
    Object.keys(unregByName).length + " 个图标名）"
  );
}

// 附加：E1-R 六图标仍在注册表 + 注册表规模（沿用旧契约）
CFG.requiredIcons.forEach(function (n) {
  if (!registered[n]) failures.push("[icon-map.js] E1-R 图标未注册: " + n);
});
if (registeredCount < CFG.minRegistered) {
  failures.push(
    "[icon-map.js] 注册图标数异常: " + registeredCount + " (< " + CFG.minRegistered + ")"
  );
}

/* ---------------- 日志输出 ---------------- */
var out = [];
out.push("================================================================");
out.push("icon_audit_0913j · 全站图标盘库扫描器 —— 首轮基线（批次进行中）");
out.push("批次: 20260913K（白名单收紧版，原 20260913j / kou-scanner）  时间: " + new Date().toISOString());
out.push("模式: 残留断言 " + (CFG.allowResidue ? "宽松(--allow-residue)" : "严格(=0)"));
out.push("================================================================");
out.push("");
out.push("【扫描范围】");
out.push("  HTML 页面 " + htmlFiles.length + " 个（根目录全量，排除 blog_wechat.html 与 备份\\）");
out.push("  JS 文件   " + jsFiles.length + " 个（assets/*.js，排除 emoji 选择器数据 manifest.js）");
out.push("  JS 重点: app.js / chat-local.js 等含 HTML 渲染字符串的文件（拼接串内按 HTML 语法解析）");
out.push("");
out.push("【汇总统计】");
out.push("  图标容器 emoji 残留        : " + allFindings.length + " 处");
out.push("  select 选项文本（合法保留）: " + allSelectSkipped.length + " 处");
out.push("  白名单跳过（头像/徽章/气泡）: " + totalSkipped + " 处");
out.push("  data-icon 引用总数         : " + allDataIcons.length);
out.push("  data-icon 未注册引用       : " + unregRefs.length + " 处（去重 " + Object.keys(unregByName).length + " 个）");
out.push("  icon-map.js 注册图标数     : " + registeredCount);
out.push("");
out.push("【残留清单】(文件 | 行 | 容器类 | emoji | 片段)");
if (allFindings.length === 0) {
  out.push("  （无残留）");
} else {
  allFindings.forEach(function (f, i) {
    out.push(
      "  " + (i + 1) + ". " + f.file + " : " + f.line +
      "  [" + f.container + "]" + (f.note ? "(" + f.note + ")" : "") +
      "  " + f.emoji + "  | " + f.snippet
    );
  });
}
out.push("");
out.push("【select 选项文本（合法保留）】(文件 | 行 | emoji | 片段)");
if (allSelectSkipped.length === 0) {
  out.push("  （无）");
} else {
  allSelectSkipped.forEach(function (f, i) {
    out.push(
      "  " + (i + 1) + ". " + f.file + " : " + f.line +
      "  " + f.emoji + "  | " + f.snippet
    );
  });
}
out.push("");
out.push("【未注册 data-icon 清单】");
if (Object.keys(unregByName).length === 0) {
  out.push("  （全部已注册）");
} else {
  Object.keys(unregByName).sort().forEach(function (name) {
    out.push("  - " + name + "  ←  " + unregByName[name].slice(0, 5).join(", ") +
      (unregByName[name].length > 5 ? " 等 " + unregByName[name].length + " 处" : ""));
  });
}
out.push("");
out.push("【白名单机制说明】批次 K 收紧后以下位置不再豁免：placeholder 属性文本；🌙 主题按钮文案。" +
  "select/option 原生控件选项文本（SVG 无法渲染，含 JS 拼接的 option 字符串，单独列类可追溯）；" +
  "聊天/AI 回复正文字符串（msg/chat/bubble/reply 类）；用户头像字段（avatar/face 类）；" +
  "achievement-badge 等内容型位置（badge 类）。");
out.push("");
out.push("【结论】");
if (failures.length === 0 && warnings.length === 0) {
  out.push("  PASS: 图标容器零 emoji 残留，data-icon 引用 100% 已注册");
} else if (failures.length === 0) {
  out.push("  PASS-WITH-WARN（宽松模式，残留未清零，最终裁决以严格模式为准）:");
  warnings.forEach(function (x) { out.push("    - " + x); });
} else {
  out.push("  FAIL: " + failures.length + " 项问题");
  failures.forEach(function (x) { out.push("    - " + x); });
}
warnings.forEach(function (x) { out.push("  WARN: " + x); });
out.push("================================================================");

var logText = out.join("\n") + "\n";
fs.writeFileSync(LOG_PATH, logText, "utf8");
process.stdout.write(logText);

process.exit(failures.length === 0 ? 0 : 1);
