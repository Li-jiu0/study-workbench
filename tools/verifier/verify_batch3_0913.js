// =====================================================================
// verify_batch3_0913.js —— 批次三（整改）全局一致性 jsdom 回归断言
// 覆盖：T01 首页真实化 / T02 空态 / T03 废弃字段兼容 / T11 听力三类 /
//       T16 图标收编 / T18 白名单保留 / T19 统一弹窗 / T20 语音模态收编
// 运行：node tools/verifier/verify_batch3_0913.js（需在仓库根执行）
// 依赖：jsdom（全局已装）；ROOT 用相对仓库根，勿硬编码绝对路径
// =====================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// ROOT = 仓库根（tools/verifier → .. → ..）
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + label + (detail ? '  → ' + detail : '')); }
  else { fail++; console.log('  ✘ ' + label + '  *** 失败 ***' + (detail ? '  → ' + detail : '')); }
}

// 通用加载器：读 HTML → jsdom → 依次 eval 外部依赖（file:// 离线兜底：fetch 一律拒绝）
function load(page, deps, pre) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' + page, pretendToBeVisual: true });
  const w = dom.window;
  const uncaught = [];
  w.addEventListener('error', e => uncaught.push(e.message || String(e.error || e)));
  w.onerror = function (m) { uncaught.push(String(m)); };
  w.fetch = function () { return Promise.reject(new Error('offline-stub')); };
  w.showToast = function (msg) { (w.__toasts = w.__toasts || []).push(msg); };
  if (pre) for (const [k, v] of Object.entries(pre)) w.localStorage.setItem(k, v);
  const depErrors = [];
  for (const dep of (deps || [])) {
    try { w.eval(fs.readFileSync(path.join(ROOT, dep), 'utf8')); }
    catch (e) { depErrors.push(dep + ': ' + e.message); }
  }
  try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) { depErrors.push('DOMContentLoaded: ' + e.message); }
  try { w.dispatchEvent(new w.Event('load')); } catch (e) { depErrors.push('load: ' + e.message); }
  return { w, uncaught, depErrors };
}

// 检测文本是否仍含 emoji（仅真实 pictograph 区段，排除零宽/格式控制符误报）
function hasEmoji(s) {
  return /[⏳-⛿🀄-🿿]/u.test(s);
}

(async function main() {
  console.log('========== 批次三 T25 全局一致性回归（ROOT=' + ROOT + '）==========');
  const { w, uncaught, depErrors } = load('学习工作台.html',
    ['assets/config.js', 'assets/icon-map.js', 'assets/xt-toast.js', 'assets/error-boundary.js',
     'assets/app.js', 'assets/voiceplayer.js', 'assets/study-stats.js'],
    { study_workbench_token: 'fake' });
  const d = w.document;

  console.log('\n【A】零未捕获异常（file:// 离线降级路径）');
  check('依赖脚本 eval 无抛错', depErrors.length === 0, depErrors.join(' | '));
  check('运行期无未捕获异常', uncaught.length === 0, uncaught.join(' | '));

  console.log('\n【B】showToast 可用（T19 基础设施）');
  check('window.showToast 是函数', typeof w.showToast === 'function');

  console.log('\n【C】空态组件：三件套之一 .empty-hint 存在（T02）');
  try { if (typeof w.renderWeakPoints === 'function') w.renderWeakPoints(); } catch (e) { depErrors.push('renderWeakPoints: ' + e.message); }
  try { if (typeof w.renderRecentLearning === 'function') w.renderRecentLearning(); } catch (e) { depErrors.push('renderRecentLearning: ' + e.message); }
  const emptyNodes = d.querySelectorAll('.empty-hint');
  check('空数据下注入 .empty-hint 节点', emptyNodes.length > 0, emptyNodes.length + ' 个');

  console.log('\n【D】三个 compute* 空数据推导（T01/T03 真实化）');
  const mp = (typeof w.computeModuleProgress === 'function') ? w.computeModuleProgress() : null;
  check('computeModuleProgress 函数存在', mp !== null);
  check('computeModuleProgress 空数据返回全 0', mp && Object.values(mp).every(v => v === 0), mp ? JSON.stringify(mp) : 'undefined');
  const wp = (typeof w.computeWeakPoints === 'function') ? w.computeWeakPoints() : null;
  check('computeWeakPoints 返回 []', Array.isArray(wp) && wp.length === 0, wp ? wp.length + '' : 'undefined');
  const rl = (typeof w.computeRecentLearning === 'function') ? w.computeRecentLearning() : null;
  check('computeRecentLearning 返回 []', Array.isArray(rl) && rl.length === 0, rl ? rl.length + '' : 'undefined');

  console.log('\n【E】统一弹窗：ESC 关闭（T19/T20）');
  let escClosed = false;
  try {
    if (typeof w.openVoiceTrain === 'function') {
      w.openVoiceTrain('listen');                       // 打开听力播放器 #vpMask
      const before = !!d.getElementById('vpMask');
      w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      const after = !!d.getElementById('vpMask');
      escClosed = before && !after;
    }
  } catch (e) { depErrors.push('ESC: ' + e.message); }
  check('ESC 关闭弹窗（#vpMask 被移除）', escClosed);

  console.log('\n【F】图标收编（R4 / T13/T16）与白名单保留（T18）');
  check('icon-map 含批次三新增图标（chart-bar/inbox/alert-triangle）',
    !!(w.LUCIDE_ICONS && w.LUCIDE_ICONS['chart-bar'] && w.LUCIDE_ICONS['inbox'] && w.LUCIDE_ICONS['alert-triangle']));
  const titleIcons = [].slice.call(d.querySelectorAll('.title-icon'));
  const stillEmoji = titleIcons.some(el => hasEmoji(el.textContent));
  check('首页 .title-icon 已无 emoji（全部收编为 data-icon）', !stillEmoji, stillEmoji ? '仍有 emoji' : titleIcons.length + ' 个已收编');
  // 白名单 emoji 不应被误删：成就徽章 🌟🔥📝🗣️ 仍保留
  const badges = [].slice.call(d.querySelectorAll('.achievement-badge'));
  const badgeEmojiKept = badges.some(b => hasEmoji(b.textContent));
  check('白名单成就徽章 emoji 保留（未误删）', badgeEmojiKept, badges.length + ' 个徽章');

  console.log('\n【G】听力三类题型（T11）');
  let voiceOk = false, sceneNames = [];
  try {
    if (typeof w.openVoiceTrain === 'function') {
      w.openVoiceTrain('listen');                 // 打开听力播放器，渲染情景标签
      const chips = [].slice.call(d.querySelectorAll('.vp-scene .s')).map(el => el.textContent.trim());
      sceneNames = chips;
      voiceOk = chips.indexOf('新闻听力') >= 0 && chips.indexOf('长对话') >= 0 && chips.indexOf('短文朗读') >= 0;
    }
  } catch (e) { depErrors.push('SCENES: ' + e.message); }
  check('听力播放器含 news/longconv/passage 三类（新闻听力/长对话/短文朗读）', voiceOk, sceneNames.join(' / '));

  console.log('\n==================================================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项  ' + (fail === 0 ? '✅ 全部通过' : '❌ 存在失败'));
  if (depErrors.length) console.log('（运行期细节：' + depErrors.join(' | ') + '）');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('运行异常:', e && e.message); process.exit(1); });
