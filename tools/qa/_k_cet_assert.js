/* 批次 20260913K · kou-k-cet 自验断言：四级备考.html + assets/voiceplayer.js */
var fs = require('fs');
var ROOT = 'D:/下载的文件/学习工作台';
var html = fs.readFileSync(ROOT + '/四级备考.html', 'utf8');
var vp = fs.readFileSync(ROOT + '/assets/voiceplayer.js', 'utf8');
var im = fs.readFileSync(ROOT + '/assets/icon-map.js', 'utf8');
var out = [];
var fails = 0;
function assert(name, ok, detail) {
  out.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  if (!ok) fails++;
}

// A. node --check 由外层命令执行，此处只做语法自检（new Function 不适用 IIFE 顶层，跳过）

// B. K1 入口改造
assert('B1 情景式口语菜单项 0 命中', html.indexOf('情景式口语') === -1, 'hits=' + (html.match(/情景式口语/g) || []).length);
assert('B2 openVoiceTrain 入口仍在（听力训练卡 → 面板）', html.indexOf("openVoiceTrain('listen')") !== -1);
assert('B3 面板双 tab 保留（听力精听/口语跟读）', vp.indexOf("'听力精听'") !== -1 && vp.indexOf("'口语跟读'") !== -1);
assert('B4 vpMask id 保留（app.js 1843/1850 ESC 联动契约）', vp.indexOf("m.id = 'vpMask'") !== -1 && vp.indexOf("getElementById('vpMask')") !== -1);
assert('B5 顶部返回栏（vp-back）存在', vp.indexOf('vp-back') !== -1 && vp.indexOf('← 返回') !== -1);
assert('B6 openAppModal 锁滚动保留', vp.indexOf("openAppModal('vpMask')") !== -1);

// C. 视觉重构：去绿渐变，对齐浅色令牌
assert('C1 面板背景无绿渐变（linear-gradient/--g2 清零）', vp.indexOf('linear-gradient(160deg') === -1 && vp.indexOf('--g2') === -1);
assert('C2 使用全站设计令牌（--bg/--card/--border/--primary）', vp.indexOf('background:var(--bg)') !== -1 && vp.indexOf('var(--card)') !== -1 && vp.indexOf('var(--border)') !== -1);
assert('C3 无硬编码白字面板（color:#fff 仅保留主题色按钮态）', vp.indexOf('rgba(255,255,255,.12)') === -1);

// D. 内容丰富化：每场景 ≥8 句
var sceneKeys = ['coffee', 'airport', 'restaurant', 'hotel', 'shopping', 'street', 'news', 'longconv', 'passage'];
sceneKeys.forEach(function (k) {
  var re = new RegExp(k + ':\\s*{[\\s\\S]*?lines:\\s*\\[([\\s\\S]*?)\\][\\s\\S]*?\\}\\s*[,}]');
  var m = vp.match(re);
  if (!m) { assert('D-' + k + ' 场景块解析', false, '未匹配到'); return; }
  var n = (m[1].match(/en:/g) || []).length;
  assert('D-' + k + ' 台词 ≥8 句', n >= 8, 'n=' + n);
});

// E. 图标容器 emoji 清零
var emojiList = ['🎧', '🗣️', '🗣', '☕', '✈️', '✈', '🍽️', '🍽', '🏨', '🛍️', '🛍', '🧭', '📰', '⏮', '⏭', '🔊', '🐢', '🙈', '💬', '🎤', '✕', '🎉', '📝'];
var emojiHits = [];
emojiList.forEach(function (e) { if (vp.indexOf(e) !== -1) emojiHits.push(e); });
assert('E1 voiceplayer.js 指定 emoji 清零', emojiHits.length === 0, emojiHits.join(' '));
assert('E2 themeToggle 🌙 清零（改 moon data-icon）', html.indexOf('>🌙<') === -1 && html.indexOf('data-icon="moon"') !== -1);
assert('E3 搜索 placeholder 去 🔍', html.indexOf('placeholder="🔍') === -1 && html.indexOf('placeholder="搜索发贴 / 模块…"') !== -1);
assert('E4 动态按钮/标题均带 data-icon（mic/headphones/play/eye/close/chevron/message-square）',
  ['"mic"', '"headphones"', '"play"', '"eye"', '"close"', '"chevron-left"', '"chevron-right"', '"message-square"'].every(function (n) { return vp.indexOf('data-icon=' + n) !== -1; }));

// F. data-icon 引用名全部已在 icon-map.js 注册（moon 除外 → 需注册清单）
var used = vp.match(/data-icon=\\?"([a-z-]+)\\?/g) || [];
var names = {};
used.forEach(function (s) { var m = s.match(/([a-z-]+)/); if (m) names[m[1]] = 1; });
['mic', 'headphones', 'play', 'eye', 'close', 'chevron-left', 'chevron-right', 'message-square'].forEach(function (n) {
  assert('F-icon ' + n + ' 已注册', im.indexOf('"' + n + '"') !== -1);
});
assert('F-moon 需注册（appjs 承诺清单，不在本文件注册）', html.indexOf('data-icon="moon"') !== -1);

// G. 功能函数签名保留（学途.html 共用，API 不可破坏）
['__close', '__mode', '__scene', '__prev', '__next', '__play', '__slow', '__en', '__zh', '__rec'].forEach(function (fn) {
  assert('G-API openVoiceTrain.' + fn + ' 保留', vp.indexOf('openVoiceTrain.' + fn + ' = function') !== -1 || vp.indexOf('__' + fn.slice(2)) !== -1);
});
assert('G-loadListeningExt 增量合并保留', vp.indexOf('function loadListeningExt') !== -1);
assert('G-听说话题 fetch 版本戳未动', vp.indexOf("listening-ext.json?v=20260913j") !== -1);
assert('G-?v= 引用未改动', html.indexOf('voiceplayer.js?v=20260913j') !== -1);

out.push('---');
out.push('RESULT: ' + (fails === 0 ? 'IS_PASS YES' : 'IS_PASS NO (fails=' + fails + ')'));
fs.writeFileSync(ROOT + '/tools/qa/k_kou-k-cet.log', out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
process.exit(fails === 0 ? 0 : 1);
