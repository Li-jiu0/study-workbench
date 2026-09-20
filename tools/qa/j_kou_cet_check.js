/* j_kou_cet_check.js · 批次 20260913j kou-cet 线静态断言（跑一次即判定）
 * 用法：node tools/qa/j_kou_cet_check.js
 */
'use strict';
const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台';
const t = fs.readFileSync(ROOT + '/四级备考.html', 'utf8');
const out = [];
const bad = [];
function chk(name, cond, detail) {
  out.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  if (!cond) bad.push(name);
}

// 1) module-hero 清零
const hero = (t.match(/module-hero/g) || []).length;
chk('module-hero=0', hero === 0, 'count=' + hero);

// 2) modal→页面内全屏视图：入口 onclick 指向新视图，面板结构/函数齐备
chk('no direct openMiniQuiz cet-read entry', !/openMiniQuiz\('cet-read'\)/.test(t));
chk('no direct openMiniQuiz cet-translate entry', !/openMiniQuiz\('cet-translate'\)/.test(t));
chk('entry cet-read -> openCetQuizView', /openCetQuizView\('cet-read'\)/.test(t));
chk('entry cet-translate -> openCetQuizView', /openCetQuizView\('cet-translate'\)/.test(t));
chk('panel #cetQuizView exists', /id="cetQuizView"/.test(t));
chk('panel slot #cetQuizSlot exists', /id="cetQuizSlot"/.test(t));
chk('back button closeCetQuizView wired', /onclick="closeCetQuizView\(\)"/.test(t));
chk('openCetQuizView defined', /window\.openCetQuizView\s*=/.test(t));
chk('closeCetQuizView defined', /window\.closeCetQuizView\s*=/.test(t));
chk('engine mount logic present', /mzMask/.test(t) && /cetQuizSlot/.test(t));

// 3) *ic* 容器 emoji=0（类名含 ic 的标签后首个文本节点）
const EMO = /[\u2300-\u27BF\u2B00-\u2BFF\uFE0F]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;
const tagRe = /<([a-z]+)([^>]*class="[^"]*ic[^"]*"[^>]*)>/gi;
let m, emojiHits = 0;
while ((m = tagRe.exec(t)) !== null) {
  const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 120);
  const cut = rest.indexOf('<') === -1 ? 120 : rest.indexOf('<');
  const txt = rest.slice(0, cut);
  if (EMO.test(txt)) {
    emojiHits++;
    out.push('  HINT emoji near <' + m[1] + ' ' + m[2].trim() + '> -> ' + JSON.stringify(txt.slice(0, 40)));
  }
}
chk('ic-container emoji=0', emojiHits === 0, 'hits=' + emojiHits);

// 4) data-icon 引用 100% 已注册（icon-map.js 只读校验）
const im = fs.readFileSync(ROOT + '/assets/icon-map.js', 'utf8');
const reg = new Set([...im.matchAll(/"([a-z0-9-]+)"\s*:\s*svg\(/g)].map(x => x[1]));
const used = [...t.matchAll(/data-icon="([a-z0-9-]+)"/g)].map(x => x[1]);
const miss = [...new Set(used.filter(n => !reg.has(n)))];
chk('data-icon all registered', miss.length === 0,
  'used=' + [...new Set(used)].join(',') + (miss.length ? ' missing=' + miss.join(',') : ''));

// 5) 关键容器残留 emoji 复核
['bn-icon', 'bm-icon', 'logo-icon', 'stat-icon', 'nav-icon', 'feature-icon'].forEach(c => {
  const re = new RegExp('class="' + c + '"[^>]*>([^<])', 'g');
  let mm, cnt = 0;
  while ((mm = re.exec(t)) !== null) { if (EMO.test(mm[1])) cnt++; }
  chk(c + ' emoji=0', cnt === 0, 'hits=' + cnt);
});

// 6) 删除连带清理：cetWords/cetListening/cetSpeaking 页内无残留
['cetWords', 'cetListening', 'cetSpeaking'].forEach(id => {
  chk('page no ref to ' + id, !t.includes(id));
});

console.log(out.join('\n'));
console.log(bad.length === 0 ? 'ALL_PASS' : 'ALL_FAIL(' + bad.length + '): ' + bad.join('; '));
