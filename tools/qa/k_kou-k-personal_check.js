/* 批次 20260913K · kou-k-personal 收工自验（个人中心.html） */
const fs = require('fs');
const path = 'D:/下载的文件/学习工作台/个人中心.html';
const html = fs.readFileSync(path, 'utf8');
let pass = true;
const out = [];
function assert(name, cond, detail) {
  out.push((cond ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
  if (!cond) pass = false;
}

// ---------- A. K14 偏好卡 4 组可操作控件（用纯子串匹配，规避转义歧义；BS=单反斜杠） ----------
const BS = String.fromCharCode(92);
function srcHas(anchor, needle, span) {
  const i = html.indexOf(anchor);
  if (i < 0) return false;
  const seg = html.slice(Math.max(0, i - span), i + anchor.length + span);
  return seg.indexOf(needle) >= 0;
}
const hasDaily = srcHas('pfDailyNew', 'pfSetPref(' + BS + "'dailyNew" + BS + "', +this.value)", 60);
const hasFocus = srcHas('pfFocus', 'pfSetPref(' + BS + "'focusMinutes" + BS + "', +this.value)", 60);
const hasRate  = srcHas('pfVoiceRate', 'pfSetPref(' + BS + "'voiceRate" + BS + "', +this.value)", 120);
function countOcc(needle) { let n = 0, i = html.indexOf(needle); while (i >= 0) { n++; i = html.indexOf(needle, i + 1); } return n; }
const speakToggles = countOcc("pfSetPref(" + BS + "'autoSpeak" + BS + "', true)") + countOcc("pfSetPref(" + BS + "'autoSpeak" + BS + "', false)");
const notifyToggles = countOcc("pfSetPref(" + BS + "'chatNotify" + BS + "', true)") + countOcc("pfSetPref(" + BS + "'chatNotify" + BS + "', false)");
assert('K14 每日新增 select 存在且走 setSetting', hasDaily);
assert('K14 专注时长 select 存在且走 setSetting', hasFocus);
assert('K14 朗读语速 select 存在且走 setSetting', hasRate);
assert('K14 朗读开关（开启/关闭两个按钮）', speakToggles === 2, 'count=' + speakToggles);
assert('K14 私信提醒开关（开启/关闭两个按钮）', notifyToggles === 2, 'count=' + notifyToggles);
assert('K14 控件组=4（2 select + 语速 select + 2 组 toggle）', hasDaily && hasFocus && hasRate && speakToggles === 2 && notifyToggles === 2);
assert('K14 pfSetPref 内调用全局 setSetting', /function pfSetPref\(key, val\) \{[\s\S]{0,120}setSetting\(key, val\)/.test(html));
assert('K14 保存即 toast「已保存」', /function pfPrefToast\(\) \{[\s\S]{0,80}showToast\('已保存'\)/.test(html));
assert('K14 读取走 loadAllSettings', /renderProfileOverview[\s\S]{0,400}loadAllSettings\(\)/.test(html));
assert('K14 「去调整」链接保留', /class="card-action"[^>]*onclick="location\.href='设置\.html'"[^>]*>去调整 →</.test(html));
assert('K14 朗读关闭时语速 select 置灰', /speakOn \? '' : ' disabled'/.test(html));
assert('K14 控件样式类 pf-pref-row 在页内 <style> 定义', /\.pf-pref-row\s*\{/.test(html) && /\.pf-pref-actions\s*\{/.test(html));

// ---------- B. K15 posts-mode CSS + 逻辑 ----------
const cssA = /\.posts-mode\s+\.pp-card\s*\{\s*display:\s*none;?\s*\}/.test(html);
const cssB = /\.posts-mode\s+#ppStatsCard\s*\{\s*display:\s*block;?\s*\}/.test(html);
assert('K15 CSS .posts-mode .pp-card{display:none} 在位', cssA);
assert('K15 CSS .posts-mode #ppStatsCard{display:block} 在位', cssB);
assert('K15 onSubpageChange posts 时加 posts-mode', /key === 'posts'\) \{ if \(pb\.classList && !pb\.classList\.contains\('posts-mode'\)\) pb\.classList\.add\('posts-mode'\)/.test(html));
assert('K15 非 posts 子页移除 posts-mode', /pb\.classList\.remove\('posts-mode'\)/.test(html));
assert('K15 SubpageRouter 注册与面包屑配置未破坏', /SubpageRouter\.init\(\{[\s\S]*breadcrumbSelector: '\.subpage-header'[\s\S]*\}\);/.test(html));

// ---------- C. K11 页内脚本图标 data-icon 化（pref 走 pfPrefIcon(name)，stats/chips 走数组项） ----------
assert('K11 renderProfileOverview 中 emoji 图标清零', !/[📖🧘🔊🔔📒⚙️⏱🧮🎯🔥]/.test(html.slice(html.indexOf('function renderProfileOverview'), html.indexOf('lucideAutoRender') + 40)));
for (const ic of ['book-open', 'brain', 'volume-2', 'bell']) {
  assert('K11 偏好行图标已引用: ' + ic, html.includes("pfPrefIcon('" + ic + "')"));
}
assert('K11 本机数据统计图标 clock/clipboard/target/fire', /'clock', d\.totalHours/.test(html) && /'clipboard', d\.totalQuestions/.test(html) && /'target', acc/.test(html) && /'fire', d\.streakDays/.test(html));
assert('K11 快捷 chips 图标 book/book-open/settings', /\['wrong', 'book', '错题本'\]/.test(html) && /\['vocab', 'book-open', '四级词汇'\]/.test(html) && /\['settings', 'settings', '偏好设置'\]/.test(html));
assert('K11 动态渲染后触发 lucideAutoRender', /typeof window\.lucideAutoRender === 'function'\) window\.lucideAutoRender\(\)/.test(html));

// ---------- D. 页内 K6：themeToggle + placeholder ----------
assert('K6 themeToggle 🌙 → moon data-icon', /id="themeToggle"[^>]*><span class="nav-icon" data-icon="moon"/.test(html) && !/[🌙]/.test(html.match(/id="themeToggle"[\s\S]{0,200}/)[0].split('</div>')[0]));
assert('K6 搜索 placeholder 已去 🔍', /placeholder="搜索发贴 \/ 模块…"/.test(html) && !/placeholder="🔍/.test(html));

// ---------- E. *ic* 容器 emoji=0 ----------
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2190}\u{21A9}\u{21AA}]/u;
const tagRe = /<([a-z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
let icHits = 0;
let m;
while ((m = tagRe.exec(html)) !== null) {
  const attrs = m[2] || '';
  const cm = attrs.match(/class="([^"]*)"/);
  if (!cm) continue;
  if (!/(^|\s|-)(nav-icon|title-icon|sgc-icon|stat-icon|bm-icon|bn-icon|ps-num|modal-title|pe-sec|pe-complete-head|module-hero-title|bottom-more-title)(\s|$|")/.test(cm[1])) continue;
  // 取该开标签到下一个开标签之间的文本内容
  const rest = html.slice(tagRe.lastIndex, tagRe.lastIndex + 200);
  const text = (rest.split(/</)[0] || '');
  if (EMOJI.test(text) || EMOJI.test(m[0])) { icHits++; out.push('  hit@' + tagRe.lastIndex + ' :: ' + m[0].slice(0, 90) + ' | text=' + text.slice(0, 40)); }
}
assert('*ic* 图标容器 emoji=0', icHits === 0, 'hits=' + icHits);

// ---------- F. 遗留 emoji 盘点（正文/JS toast 文案豁免，仅列出） ----------
const lines = html.split('\n');
const left = [];
lines.forEach((ln, i) => {
  if (/[📖🧘🔊🔔📒⚙️⏱🧮🎯🔥🌙☀️🔍✏️🪪📊🚪🧰📷👤🔒👩👨]/u.test(ln)) left.push((i + 1) + ': ' + ln.trim().slice(0, 80));
});
out.push('--- 残留 emoji 行盘点（供人工核对，正文/用户内容豁免） ---');
left.forEach(l => out.push('  ' + l));
out.push('  total=' + left.length);

// ---------- G. 页内 <script> 块 node --check ----------
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(x => x[1]);
scripts.forEach((code, i) => {
  const f = 'D:/下载的文件/学习工作台/tools/qa/_tmp_k_personal_' + i + '.js';
  fs.writeFileSync(f, code, 'utf8');
  try { new Function(code); out.push('[PASS] inline script #' + i + ' 语法 OK'); }
  catch (e) { pass = false; out.push('[FAIL] inline script #' + i + ' 语法错误: ' + e.message); }
  try { fs.unlinkSync(f); } catch (e) {}
});

out.push('');
out.push(pass ? 'IS_PASS: YES' : 'IS_PASS: NO');
fs.writeFileSync('D:/下载的文件/学习工作台/tools/qa/k_kou-k-personal.log', out.join('\n'), 'utf8');
console.log(out.join('\n'));
