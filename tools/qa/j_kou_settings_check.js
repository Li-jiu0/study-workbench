/* j_kou_settings_check.js — 批次 20260913j / kou-settings 静态自检
   检查对象：设置.html
   ① module-hero 出现次数 = 0
   ② 图标容器（sgc-icon/title-icon/sq-ic/stat-icon/bn-icon/bm-icon）行内 emoji 残留 = 0
   ③ 给创作者提优化建议表单元素 + fetch POST /api/feedback 在位
   ④ 本页全部 data-icon 引用均已在 assets/icon-map.js 注册
   结果写入同目录 j_kou_settings.log（ASCII 文件名） */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/下载的文件/学习工作台';
const htmlPath = path.join(ROOT, '设置.html');
const iconMapPath = path.join(ROOT, 'assets', 'icon-map.js');
const logPath = path.join(__dirname, 'j_kou_settings.log');

const html = fs.readFileSync(htmlPath, 'utf8');
const iconMap = fs.readFileSync(iconMapPath, 'utf8');
const lines = html.split('\n');

const out = [];
let fail = 0;

// ① module-hero 计数
const heroCount = (html.match(/module-hero/g) || []).length;
out.push('[1] module-hero occurrences: ' + heroCount + ' (expect 0)');
if (heroCount !== 0) fail++;

// ② 图标容器行 emoji 残留
const containerRe = /(sgc-icon|title-icon|sq-ic|stat-icon|bn-icon|bm-icon)/;
// emoji 集：含 misc symbols / pictographs / dingbats / 变体选择符 / 箭头符号等
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2934}\u{2935}]/u;
const emojiHits = [];
lines.forEach((ln, i) => {
  if (containerRe.test(ln) && emojiRe.test(ln)) emojiHits.push('  line ' + (i + 1) + ': ' + ln.trim().slice(0, 160));
});
out.push('[2] icon-container lines with emoji: ' + emojiHits.length + ' (expect 0)');
if (emojiHits.length) { fail++; out.push(...emojiHits); }

// ③ 表单元素与提交逻辑在位
const needTokens = [
  'creatorFeedbackBlock', 'cfNickname', 'cfTypeChips', 'cfContent', 'cfSubmitBtn',
  'cfPickType', 'cfSubmit', "apiBase() + '/api/feedback'", 'nickname:', 'type:', 'content:',
  '已提交，感谢反馈', '提交失败，请稍后再试'
];
const missTokens = needTokens.filter(t => html.indexOf(t) === -1);
out.push('[3] feedback form tokens missing: ' + missTokens.length + ' (expect 0)' + (missTokens.length ? ' -> ' + missTokens.join(', ') : ''));
if (missTokens.length) fail++;

// ④ data-icon 引用 vs icon-map.js 注册表
const regNames = new Set();
const regRe = /"([a-z0-9-]+)":\s*svg\(/gi;
let m;
while ((m = regRe.exec(iconMap)) !== null) regNames.add(m[1]);
const used = new Set();
const usedRe = /data-icon="([a-z0-9-]+)"/g;
while ((m = usedRe.exec(html)) !== null) used.add(m[1]);
const unregistered = Array.from(used).filter(n => !regNames.has(n));
out.push('[4] data-icon used: ' + used.size + ' kinds; unregistered: ' + unregistered.length + (unregistered.length ? ' -> ' + unregistered.join(', ') : ''));
if (unregistered.length) fail++;
out.push('    used icons: ' + Array.from(used).sort().join(', '));

// ⑤ data-icon 各容器计数（对照任务书 41 处）
const cnt = {};
['sgc-icon', 'title-icon', 'sq-ic', 'stat-icon', 'bn-icon', 'bm-icon'].forEach(cls => {
  const re = new RegExp(cls + '"[^>]*data-icon=|data-icon="[^"]+"[^>]*>' , 'g');
  cnt[cls] = (html.match(new RegExp(cls, 'g')) || []).length;
});
out.push('[5] container counts: ' + JSON.stringify(cnt));

out.push('');
out.push('IS_PASS: ' + (fail === 0 ? 'YES' : 'NO (' + fail + ' group(s) failed)'));

fs.writeFileSync(logPath, out.join('\n'), 'utf8');
console.log('DONE fail=' + fail);
