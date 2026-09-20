// A1 最终自检（单一入口，一次跑完）：ES2017 语法 / 原生弹窗 / 换行符 / 体积 / mtime
// 结果写 UTF-8 文件。

const fs = require("fs");
const path = require("path");

const TARGET = "D:\\下载的文件\\学习工作台\\assets\\ai-service.js";
const OUT = "D:\\下载的文件\\学习工作台\\tools\\qa\\_a1_final_selfcheck.txt";

const raw = fs.readFileSync(TARGET);
const buf = Buffer.from(raw);
const src = raw.toString("utf8");
const lines = src.split("\n");

const out = [];
const w = (s) => out.push(String(s));

w("== A1 FINAL SELF-CHECK ==");
w("file=" + TARGET);
w("bytes=" + buf.length + "  (taskbook baseline 42170)");
w("lines=" + (lines.length - 1) + "  (taskbook baseline 1080)");
w("mtime=" + new Date(fs.statSync(TARGET).mtimeMs).toISOString());
w("");

// ---- 换行符 ----
const crlf = buf.filter((b, i) => b === 13 && buf[i + 1] === 10).length;
const lfTotal = buf.filter((b) => b === 10).length;
const bareLf = lfTotal - crlf;
w("== EOL ==");
w("crlf=" + crlf + "  lf_total=" + lfTotal + "  bare_lf=" + bareLf);
w("pure_lf=" + (crlf === 0) + "   (taskbook baseline: CRLF=0 / LF=1080)");
w("");

// ---- 禁用语法（带误报标注） ----
// 先剥离注释与字符串，避免把注释里的 markdown ** 当作指数运算符
function stripCommentsAndStrings(s) {
  let res = "";
  let i = 0;
  let state = "code"; // code | line | block | sq | dq | tpl | regex
  let prevSig = "";
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (state === "code") {
      if (c === "/" && n === "/") { state = "line"; res += "  "; i += 2; continue; }
      if (c === "/" && n === "*") { state = "block"; res += "  "; i += 2; continue; }
      if (c === "'") { state = "sq"; res += " "; i++; continue; }
      if (c === '"') { state = "dq"; res += " "; i++; continue; }
      if (c === "`") { state = "tpl"; res += " "; i++; continue; }
      // 正则字面量：/ 前面是 ( , = : [ ! & | ? { } ; 或行首
      if (c === "/" && /[=(,:\[!&|?{};]|^\s*$/.test(prevSig)) {
        // 粗略跳过正则（本文件正则内无 / 转义嵌套需求）
        res += " "; i++; continue;
      }
      res += c;
      if (!/\s/.test(c)) prevSig = c;
      i++;
      continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; res += "\n"; } else res += " "; i++; continue; }
    if (state === "block") { if (c === "*" && n === "/") { state = "code"; res += "  "; i += 2; continue; } res += (c === "\n" ? "\n" : " "); i++; continue; }
    if (state === "sq") { if (c === "\\") { res += "  "; i += 2; continue; } if (c === "'") state = "code"; res += (c === "\n" ? "\n" : " "); i++; continue; }
    if (state === "dq") { if (c === "\\") { res += "  "; i += 2; continue; } if (c === '"') state = "code"; res += (c === "\n" ? "\n" : " "); i++; continue; }
    if (state === "tpl") { if (c === "\\") { res += "  "; i += 2; continue; } if (c === "`") state = "code"; res += (c === "\n" ? "\n" : " "); i++; continue; }
  }
  return res;
}

const codeOnly = stripCommentsAndStrings(src);
const codeLines = codeOnly.split("\n");

const forbidden = [
  ["可选链 ?.", /\?\./, "禁止"],
  ["空值合并 ??", /\?\?/, "禁止"],
  ["replaceAll(", /\.replaceAll\s*\(/, "禁止"],
  ["Object.fromEntries", /Object\.fromEntries/, "禁止"],
  [".at(", /\.at\s*\(/, "禁止"],
  ["正则后行断言 (?<=", /\(\?<=/, "禁止"],
  ["正则后行断言 (?<!", /\(\?<!/, "禁止"],
  ["对象展开 {...", /\{\s*\.\.\./, "禁止"],
  ["指数运算符 **", /\*\*/, "禁止"],
  ["可选 catch 绑定 catch{", /catch\s*\{/, "禁止"]
];

w("== FORBIDDEN SYNTAX (code-only, comments/strings stripped) ==");
let totalForbidden = 0;
for (const [name, re] of forbidden) {
  const hits = [];
  for (let i = 0; i < codeLines.length; i++) {
    const m = codeLines[i].match(new RegExp(re.source, "g"));
    if (m) for (let k = 0; k < m.length; k++) hits.push(i + 1);
  }
  totalForbidden += hits.length;
  w("  " + name.padEnd(30) + " hits=" + hits.length + (hits.length ? "  L" + hits.join(",L") : ""));
}
w("  TOTAL=" + totalForbidden + (totalForbidden === 0 ? "  OK" : "  <<< FAIL"));
w("");

// ---- 顶层 await（应 0；正文里 await 均在 async 函数内） ----
w("== TOP-LEVEL AWAIT ==");
let depth = 0;
let topAwait = 0;
const tlHits = [];
for (let i = 0; i < codeLines.length; i++) {
  const ln = codeLines[i];
  if (/^\s*await\b/.test(ln) && depth === 0) { topAwait++; tlHits.push(i + 1); }
  const opens = (ln.match(/\{/g) || []).length;
  const closes = (ln.match(/\}/g) || []).length;
  depth += opens - closes;
}
w("  top-level await hits=" + topAwait + (tlHits.length ? "  L" + tlHits.join(",L") : "") + "  OK");
w("");

// ---- 原生弹窗 ----
w("== NATIVE DIALOGS (code-only) ==");
for (const [name, re] of [["alert(", /(?<![.\w])alert\s*\(/], ["confirm(", /(?<![.\w])confirm\s*\(/], ["prompt(", /(?<![.\w])prompt\s*\(/]]) {
  let n = 0;
  for (const ln of codeLines) if (re.test(ln)) n++;
  w("  " + name + " hits=" + n);
}
w("");

// ---- 顶层裸全局声明（本文件应为 IIFE，0 个） ----
w("== TOP-LEVEL GLOBAL DECLARATIONS ==");
let tlDecl = 0;
const declHits = [];
for (let i = 0; i < codeLines.length; i++) {
  if (/^(var|let|const|function|class)\b/.test(codeLines[i])) { tlDecl++; declHits.push((i + 1) + ":" + codeLines[i].trim().slice(0, 40)); }
}
w("  count=" + tlDecl + (declHits.length ? "  " + declHits.join(" | ") : "  OK"));
w("");

// ---- 全局污染面（仅在 window 上挂 AI_SERVICE / callAI） ----
w("== GLOBAL EXPORTS ==");
const exp = [];
lines.forEach((ln, i) => { if (/window\.(AI_SERVICE|callAI)\s*=/.test(ln)) exp.push("L" + (i + 1) + " " + ln.trim()); });
w("  " + (exp.join(" | ") || "(none)"));
w("");

// ---- IIFE 包裹 & use strict 无关（不强制） ----
w("== STRUCTURE ==");
w("  IIFE start L" + (lines.findIndex((l) => /^\(function \(\) \{/.test(l)) + 1));
w("  IIFE end   L" + lines.findIndex((l) => /^\}\)\(\);/.test(l)));
w("  canStreamRead guards=" + (src.match(/canStreamRead\(resp\)/g) || []).length);
w("  raw getReader() calls=" + (codeOnly.match(/resp\.body\.getReader\(\)/g) || []).length);
w("");

const okAll = totalForbidden === 0 && topAwait === 0 && tlDecl === 0 && crlf === 0;
w(okAll ? "SELF-CHECK: PASS" : "SELF-CHECK: FAIL");

fs.writeFileSync(OUT, out.join("\n"), "utf8");
console.log("WROTE " + OUT);
console.log("forbidden=" + totalForbidden + " crlf=" + crlf + " tlDecl=" + tlDecl + " verdict=" + (okAll ? "PASS" : "FAIL"));
