// Batch 20260913j — kou-chatjs static assertion for assets/chat-local.js
var fs = require('fs');
var path = 'D:/下载的文件/学习工作台/assets/chat-local.js';
var src = fs.readFileSync(path, 'utf8');
var lines = src.split('\n');

var emojiRobot = /[\u{1F916}]/u; // 🤖
var dataIconBot = /data-icon="bot"/g;

var robotHits = [];
lines.forEach(function (l, i) {
  if (emojiRobot.test(l)) robotHits.push({ line: i + 1, text: l.trim().slice(0, 120) });
});
var botRefs = (src.match(dataIconBot) || []).length;

console.log('== kou-chatjs static assertion: chat-local.js ==');
console.log('lines total:', lines.length);
console.log('data-icon="bot" references:', botRefs);
console.log('🤖 remaining occurrences:');
robotHits.forEach(function (h) { console.log('  L' + h.line + ': ' + h.text); });

// classification of remaining 🤖 (expected: only avatar data fields / content positions, whitelisted)
var dataField = /avatar:\s*'🤖'/;
var bad = robotHits.filter(function (h) { return !dataField.test(h.text); });

if (bad.length === 0 && botRefs >= 2) {
  console.log('ASSERTION: PASS — icon-position 🤖 = 0 (only avatar data field remains, whitelisted); data-icon="bot" in place.');
} else {
  console.log('ASSERTION: FAIL — bad hits:');
  bad.forEach(function (h) { console.log('  L' + h.line + ': ' + h.text); });
}
