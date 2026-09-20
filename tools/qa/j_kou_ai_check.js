/* j_kou_ai_check.js — kou-ai 静态断言：AI模拟面试.html 准备页视觉重构
 * 断言项：
 *  A1 setup 区关键 class 仍在（DOM 幂等）
 *  A2 🎯/⚠️ 已换 data-icon（setup 区 emoji 清零）
 *  A3 *ic* 容器 emoji = 0（白名单：JS 正文文案、正文装饰）
 *  A4 原 onclick / 事件绑定函数名未被改
 *  B1 紫蓝渐变清理情况（信息项）
 *  B2 全站令牌接入（common.css / icon-map.js / theme-interview）（信息项）
 */
const fs = require('fs');
const path = 'D:/下载的文件/学习工作台/AI模拟面试.html';
const src = fs.readFileSync(path, 'utf8');
const lines = src.split(/\r?\n/);

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('[PASS] ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('[FAIL] ' + name + (detail ? ' | ' + detail : '')); }
}
function info(name, detail) { console.log('[INFO] ' + name + (detail ? ' | ' + detail : '')); }

// ---- A1: setup 区关键 class ----
['setup-panel', 'setup-title', 'setup-desc', 'setup-warning', 'setup-group', 'setup-label',
 'setup-options', 'setup-option', 'start-btn', 'chat-container', 'timer-bar',
 'timer-track', 'timer-fill', 'chat-messages', 'interviewer-area', 'input-area',
 'input-box', 'send-btn', 'eval-panel', 'eval-btn', 'hidden'
].forEach(c => {
  const n = (src.match(new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '[\\s{,:.]', 'g')) || []).length;
  assert('A1 class .' + c, n > 0, '出现 ' + n + ' 次');
});
const optCount = (src.match(/class="setup-option[^"]*"/g) || []).length;
assert('A1 setup-option 节点数 >= 8', optCount >= 8, '实际 ' + optCount);
assert('A1 setupPanel id', src.includes('id="setupPanel"'));
assert('A1 chatContainer id', src.includes('id="chatContainer"'));
assert('A1 typeOptions/posOptions id', src.includes('id="typeOptions"') && src.includes('id="posOptions"'));

// ---- A2: 🎯 / ⚠️ 换 data-icon ----
assert('A2 data-icon="target" 已挂', src.includes('data-icon="target"'));
assert('A2 data-icon="alert-triangle" 已挂', src.includes('data-icon="alert-triangle"'));
const setupBlock = src.slice(src.indexOf('id="setupPanel"'), src.indexOf('id="chatContainer"'));
assert('A2 setup 区无 🎯', !setupBlock.includes('\uD83C\uDFAF'));
assert('A2 setup 区无 ⚠️', !setupBlock.includes('\u26A0'));
assert('A2 setup-title 仍保留文字「面试准备」', setupBlock.includes('面试准备'));

// ---- A3: *ic* 容器 emoji = 0 ----
// 找所有 class 含 "ic" 的标签，检查标签内直接文本（到下一个 < 为止）是否含 emoji
const emojiRe = /[\u2300-\u27BF\u2B00-\u2BFF\uFE0F\u3030\u303D\u3297\u3299]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;
let icEmojiHits = [];
const tagRe = /<(?:div|span|button|div)\b[^>]*class="[^"]*ic[^"]*"[^>]*>([^<]*)/g;
let m;
while ((m = tagRe.exec(src)) !== null) {
  if (emojiRe.test(m[1])) icEmojiHits.push(m[1].trim());
}
assert('A3 *ic* 容器 emoji = 0', icEmojiHits.length === 0, icEmojiHits.join(' / ') || '无残留');

// ---- A4: onclick / 事件绑定 ----
assert('A4 onclick startInterview()', src.includes('onclick="startInterview()"'));
assert('A4 onclick sendMessage()', src.includes('onclick="sendMessage()"'));
assert('A4 onclick restartInterview()', src.includes('onclick="restartInterview()"'));
assert('A4 onclick goBack()', src.includes('onclick="goBack()"'));
assert('A4 onkeydown handleKeyDown', src.includes('onkeydown="handleKeyDown(event)"'));
assert('A4 #typeOptions .setup-option 绑定', src.includes("querySelectorAll('#typeOptions .setup-option')"));
assert('A4 #posOptions .setup-option 绑定', src.includes("querySelectorAll('#posOptions .setup-option')"));
assert('A4 selectedType 赋值', src.includes('selectedType = opt.dataset.type'));
assert('A4 selectedPos 赋值', src.includes('selectedPos = opt.dataset.pos'));
assert('A4 startInterview 函数定义', src.includes('function startInterview()'));
assert('A4 timer 逻辑保留', src.includes('timerInterval') && src.includes('timeLeft'));

// ---- B1: 紫蓝渐变清理（信息项）----
const gradCount = (src.match(/linear-gradient\(135deg,\s*#5B8DEF/g) || []).length;
info('B1 紫蓝 135deg 渐变残留', gradCount === 0 ? '已全部清理' : '残留 ' + gradCount + ' 处');

// ---- B2: 全站令牌接入（信息项）----
info('B2 common.css 引入', src.includes('assets/common.css') ? '是' : '否');
info('B2 icon-map.js 引入', src.includes('assets/icon-map.js') ? '是' : '否');
info('B2 body.theme-interview', /<body class="theme-interview">/.test(src) ? '是' : '否');
const varUses = (src.match(/var\(--/g) || []).length;
info('B2 设计令牌 var(--) 使用次数', String(varUses));

// ---- data-icon 注册校验 ----
try {
  const imap = fs.readFileSync('D:/下载的文件/学习工作台/assets/icon-map.js', 'utf8');
  const names = [...src.matchAll(/data-icon="([a-z0-9-]+)"/g)].map(x => x[1]);
  const uniq = [...new Set(names)];
  uniq.forEach(n => {
    const ok = new RegExp('"' + n + '"\\s*:\\s*svg\\(').test(imap);
    assert('REG data-icon "' + n + '" 已注册', ok, ok ? '' : '→ 需 kou-appjs 注册');
  });
} catch (e) {
  info('REG icon-map.js 读取失败', e.message);
}

console.log('----');
console.log(fail === 0 ? 'RESULT: IS_PASS YES (' + pass + ' pass, ' + fail + ' fail)' :
  'RESULT: IS_PASS NO (' + pass + ' pass, ' + fail + ' fail)');
