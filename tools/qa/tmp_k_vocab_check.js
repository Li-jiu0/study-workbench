/* k_kou-k-vocab 自验脚本：四级词汇.html 图标改造静态断言（批次 20260913K） */
const fs = require("fs");
const path = "D:/下载的文件/学习工作台/四级词汇.html";
const logPath = "D:/下载的文件/学习工作台/tools/qa/k_kou-k-vocab.log";
const html = fs.readFileSync(path, "utf8");
const lines = html.split("\n");
const results = [];
let fail = 0;

function check(name, ok, detail) {
  results.push((ok ? "[PASS] " : "[FAIL] ") + name + (detail ? " -> " + detail : ""));
  if (!ok) fail++;
}

// 1) 目标 emoji 已全部移除
["📚 学习新词", "🔄 复习单词", "🔀 随机", "🔊", "👆", "✅ 认识",
 ">🌙<", "🔍 搜索发贴", "🔥 连续打卡", "🌱 词根词缀", "📌 常用搭配",
 "🔄 近义词", "↔️ 反义词", "🧹"].forEach(function (s) {
  check("emoji removed: " + JSON.stringify(s), html.indexOf(s) === -1);
});

// 2) data-icon span 在位（计数含页内既有注册项：book-open 侧栏×2+标题、check/fire 顶栏统计各1）
const expectIcons = {
  "moon": 1, "book-open": 4, "rotate-ccw": 2, "shuffle": 1, "volume-2": 1,
  "pointer": 1, "check": 2, "fire": 2, "sprout": 1, "pin": 1,
  "arrow-left-right": 1, "eraser": 1
};
Object.keys(expectIcons).forEach(function (n) {
  const re = new RegExp('data-icon="' + n + '"', "g");
  const c = (html.match(re) || []).length;
  check('data-icon="' + n + '" count=' + expectIcons[n], c === expectIcons[n], "actual " + c);
});

// 3) onclick / id 完好
["switchVocabMode('new')", "switchVocabMode('review')", "shuffleVocab()",
  "speakWord()", "toggleVocabMeaning()", "markVocabKnown()", "prevVocab()",
  "nextVocab()", "navigateTo('cet')", "toggleTheme()"].forEach(function (s) {
  check("onclick kept: " + s, html.indexOf(s) !== -1);
});
["vocabModeNew", "vocabModeReview", "vocabShuffleBtn", "vocabCard",
  "vocabHint", "themeToggle", "gsInput"].forEach(function (id) {
  check("id kept: " + id, html.indexOf('id="' + id + '"') !== -1);
});

// 4) 残余 emoji 全页扫描（白名单外的应为 0）
const emojiRe = /\p{Extended_Pictographic}/gu;
const found = [];
lines.forEach(function (l, i) {
  let m;
  emojiRe.lastIndex = 0;
  while ((m = emojiRe.exec(l)) !== null) found.push((i + 1) + ": " + m[0] + " | " + l.trim().slice(0, 60));
});
// 白名单：🤖×2（aiFab 运行时头像 setAiIcon 管理 / ai-avatar 功能数据 app.js:2299）
const wl = found.filter(function (f) { return f.indexOf("🤖") !== -1; });
const extra = found.filter(function (f) { return f.indexOf("🤖") === -1; });
check("residual emoji only whitelisted (robot x2, functional)", extra.length === 0, extra.join(" || ") || "none");
results.push("[INFO] robot-emoji kept: " + wl.length + " (aiFab / ai-avatar, runtime-managed by app.js)");

// 5) 版本戳未被改动（4 CSS link + 7 script = 11 处，全为 20260913j）
check("version query untouched (11x 20260913j)", (html.match(/\?v=20260913j/g) || []).length === 11
  && (html.match(/\?v=(?!20260913j)/g) || []).length === 0);

// 6) 图标容器内 emoji=0：所有 data-icon 行不得含 Extended_Pictographic
const iconLines = lines.filter(function (l) { return l.indexOf("data-icon") !== -1 && emojiRe.test(l); });
emojiRe.lastIndex = 0;
check("no emoji inside icon-container lines", iconLines.length === 0, iconLines.join(" || ") || "none");

const out = results.join("\n") + "\n" + (fail === 0 ? "IS_PASS: YES" : "IS_PASS: NO (fail=" + fail + ")");
fs.writeFileSync(logPath, out, "utf8");
console.log("log written, fail=" + fail);
process.exit(fail === 0 ? 0 : 1);
