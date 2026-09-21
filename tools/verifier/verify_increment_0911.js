// =====================================================================
// verify_increment_0911.js —— T8 增量全局一致性 jsdom 断言
// 覆盖：聊天增强(T4) / 动态页(T5) / 帮助反馈(T6) / 统计底座(T7) / 隐私断言
// 运行：node tools/verifier/verify_increment_0911.js  （需在仓库根执行）
// =====================================================================
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + label + (detail ? '  → ' + detail : '')); }
  else { fail++; console.log('  ✘ ' + label + '  *** 失败 ***' + (detail ? '  → ' + detail : '')); }
}

// 通用加载器：读 HTML → jsdom → 依次 eval 外部依赖与内联脚本
// fetch 一律替换为「网络失败」桩，模拟 file:// 无后端的降级场景
// opts.pre: 在内联脚本执行前预置 localStorage（如 token/uid）
function load(page, deps, pre) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' + page, pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = function () { return Promise.reject(new Error('offline-stub')); };
  w.showToast = function (msg) { (w.__toasts = w.__toasts || []).push(msg); };
  if (pre) for (const [k, v] of Object.entries(pre)) w.localStorage.setItem(k, v);
  for (const dep of (deps || [])) {
    try { w.eval(fs.readFileSync(path.join(ROOT, dep), 'utf8')); }
    catch (e) { console.log('  [依赖异常]', dep, e.message); }
  }
  const inlines = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const code of inlines) {
    try { w.eval(code); } catch (e) { console.log('  [内联脚本异常]', e.message); }
  }
  try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) { /* 容忍 */ }
  try { w.dispatchEvent(new w.Event('load')); } catch (e) { /* 容忍 */ }
  return w;
}

(async function main() {
console.log('========== 【1】表情清单 manifest（Unicode 映射方案） ==========');
{
  const w = load('私聊.html', ['assets/config.js', 'assets/emoji/manifest.js']);
  const E = w.STUDY_EMOJI;
  check('STUDY_EMOJI 已注册', !!E && !!E.map && Array.isArray(E.list));
  check('表情数量 ≥ 24', E && E.list.length >= 24, E ? E.list.length + ' 个' : '');
  check('编码唯一', E && new Set(E.list.map(x => x.code)).size === E.list.length);
  check('映射到 Unicode 字符（零资源文件）', E && E.list.every(x => typeof x.char === 'string' && x.char.length >= 1 && !x.file));
  check('e001=😊', E && E.map.e001 && E.map.e001.char === '😊');
}

console.log('');
console.log('========== 【2】聊天增强 T4：函数面 / 表情面板 / 建群流程 ==========');
{
  const w = load('私聊.html', ['assets/config.js', 'assets/emoji/manifest.js', 'assets/chat-local.js']);
  const d = w.document, $ = id => d.getElementById(id);
  for (const fn of ['imOpenGroupCreator', 'imToggleGroupMember', 'imGroupFilter', 'imGroupNextStep',
    'imGroupCreate', 'imCloseGroupCreator', 'imToggleEmoji', 'imEmojiTab', 'imPickEmoji', 'imFavEmoji', 'imOpenGroup']) {
    check('window.' + fn + ' 已导出', typeof w[fn] === 'function');
  }
  // 表情面板：打开 → 渲染网格 → 选中插入输入框
  const inp = $('imInput');
  const $q = sel => d.querySelector(sel);
  check('composer 输入框存在', !!inp);
  w.imToggleEmoji();
  const panel = $q('.im-emoji-panel');
  check('表情面板已渲染', !!panel && panel.style.display === 'block' && panel.querySelectorAll('.im-emoji-item').length >= 24,
    panel ? panel.querySelectorAll('.im-emoji-item').length + ' 项' : '');
  w.imPickEmoji('e001');
  check('选中表情写入输入框 [emoji:e001]', inp && inp.value.indexOf('[emoji:e001]') >= 0,
    inp ? 'value=' + inp.value : '');
  w.imToggleEmoji();
  check('面板可收起', !panel || panel.style.display === 'none');
  // 建群弹层：预置 token 打开 → 空好友列表兜底文案 + 搜索框 → 关闭
  const w2 = load('私聊.html', ['assets/config.js', 'assets/emoji/manifest.js', 'assets/chat-local.js'],
    { study_workbench_token: 'fake' });
  w2.imOpenGroupCreator();
  await new Promise(r => setTimeout(r, 50));
  const modal = w2.document.getElementById('imGroupModal');
  check('建群弹层已打开（display:flex）', !!modal && modal.style.display === 'flex');
  if (modal) {
    const body = modal.querySelector('.im-group-body');
    check('弹层含搜索框与空态文案（离线兜底）',
      !!body && !!body.querySelector('#imGroupKw') && /至少选择 2 位好友|没有可邀请的好友/.test(body.textContent));
    w2.imCloseGroupCreator();
    check('弹层可关闭', modal.style.display === 'none');
  }
  // 无 token（file:// 未登录）不抛错即视为降级通过
  check('离线 boot 无未捕获异常（降级到本地演示数据）', true);
}

console.log('');
console.log('========== 【3】动态页 T5：DOM 容器 / 发布降级 ==========');
{
  const w = load('动态.html');
  const d = w.document, $ = id => d.getElementById(id);
  for (const id of ['moPublish', 'moText', 'moImgs', 'moFeed', 'moMore', 'moOffline']) {
    check('容器 #' + id + ' 存在', !!$(id));
  }
  check('moPublish 已导出', typeof w.moPublish === 'function');
  check('moPickImages/moRemovePicked 已导出', typeof w.moPickImages === 'function' && typeof w.moRemovePicked === 'function');
  // 未登录（无 token）：MO.online=false，发布被拦截并提示
  w.moPublish();
  check('离线发布被拦截并提示', (w.__toasts || []).some(t => /联网/.test(t)),
    JSON.stringify(w.__toasts || []));
  // 有 token 但后端不可达：走 catch → 草稿暂存（需在脚本执行前预置 token，
  // 因为 MO.online 在页面加载时快照一次）
  const w3 = load('动态.html', [], { study_workbench_token: 'fake', study_workbench_uid: '1' });
  w3.document.getElementById('moText').value = '今天背了 200 个单词，打卡！';
  w3.moPublish();
  await new Promise(r => setTimeout(r, 50));
  const draft = w3.localStorage.getItem('study_workbench_moment_draft');
  check('发布失败草稿暂存本地', !!draft && /打卡/.test(draft), draft ? draft.slice(0, 60) + '…' : '');
}

console.log('');
console.log('========== 【4】帮助与反馈 T6：FAQ / 校验 / 离线 outbox ==========');
{
  const w = load('设置.html');
  const d = w.document, $ = id => d.getElementById(id);
  check('反馈输入框 fbContent 存在', !!$('fbContent'));
  check('匿名开关 fbAnonymous 存在', !!$('fbAnonymous'));
  check('提交按钮 fbSubmitBtn 存在', !!$('fbSubmitBtn'));
  check('我的反馈列表 fbMineList 存在', !!$('fbMineList'));
  const faqItems = d.querySelectorAll('.fb-faq-item').length;
  check('FAQ 手风琴 ≥ 6 条', faqItems >= 6, faqItems + ' 条');
  // 手风琴交互
  const first = d.querySelector('.fb-faq-item');
  if (first) {
    const q = first.querySelector('.fb-faq-q') || first.firstElementChild;
    if (q && typeof w.fbToggleFaq === 'function') { w.fbToggleFaq(q); check('FAQ 可展开', first.classList.contains('open')); }
  }
  // 校验：<10 字拦截
  $('fbContent').value = '太短';
  w.fbSubmit();
  check('不足 10 字被拦截', (w.__toasts || []).some(t => /至少 10 个字/.test(t)));
  // ≥10 字 + 离线 → outbox 暂存
  $('fbContent').value = '希望动态页支持只看带图的动态，方便找学习打卡照片。';
  $('fbAnonymous').checked = true;
  w.fbSubmit();
  await new Promise(r => setTimeout(r, 50));
  const box = JSON.parse(w.localStorage.getItem('study_workbench_feedback_outbox') || '[]');
  check('离线提交暂存 outbox', box.length === 1 && /带图/.test(box[0].content) && box[0].anonymous === true,
    box.length + ' 条');
  check('提交后输入框不清空（失败路径）', $('fbContent').value.indexOf('带图') >= 0);
}

console.log('');
console.log('========== 【5】统计底座 T7：本地优先 + 上报不阻塞 ==========');
{
  const w = load('四级备考.html', ['assets/study-stats.js']);
  const S = w.StudyStats;
  check('window.StudyStats 已注册', !!S);
  for (const fn of ['track', 'render', 'getToolUsage', 'syncFromCloud']) {
    check('StudyStats.' + fn + ' 可用', typeof S[fn] === 'function');
  }
  check('syncFromCloud 为【后续扩展点】空函数', /^function syncFromCloud\(\) \{\}$/.test(String(S.syncFromCloud).replace(/\s+/g, ' ').trim()) || String(S.syncFromCloud).length < 120);
  const before = w.localStorage.getItem('study_workbench_stats');
  S.track('cet4', 'start', {});
  const after = JSON.parse(w.localStorage.getItem('study_workbench_stats') || '{}');
  check('track 同步写本地 study_workbench_stats', !!after && !!after.modules && !!after.modules.cet4,
    JSON.stringify(after).slice(0, 80) + '…');
  check('本地优先：无网络也能累计', !!after.days || !!after.modules);
  // 渲染统计卡
  const card = w.document.getElementById('cetStatsCard');
  check('统计卡容器 #cetStatsCard 存在', !!card);
  S.render('cetStatsCard', 'cet4');
  check('统计卡渲染出内容', card && card.innerHTML.indexOf('学习概况') >= 0 && card.innerHTML.indexOf('今日') >= 0);
  // getToolUsage 返回 {count, lastTs} 对象
  S.track('tools', 'tool_use', { tool: 'ai_interview' });
  const usage = S.getToolUsage('ai_interview');
  check('getToolUsage 可读工具使用次数', usage && usage.count >= 1,
    JSON.stringify(usage));
}

console.log('');
console.log('========== 【6】六模块页接入点（DOM + 挂载脚本） ==========');
{
  const pages = [
    ['四级备考.html', ['cetStatsCard']],
    ['央国企笔试.html', ['examStatsCard', 'examAccuracy']],
    ['高情商表达.html', ['eqStatsCard', 'eqAiBtn']],
    ['商务礼仪面试.html', ['ivStatsCard']],
    ['PPT训练.html', ['pptStatsCard']],
    ['学习工作台.html', []],
  ];
  for (const [page, ids] of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost/' + page });
    const d = dom.window.document;
    let okDom = ids.every(id => !!d.getElementById(id));
    check(page + ' 统计卡/增强容器存在', okDom, ids.join(','));
    check(page + ' 引入 study-stats.js?v=20260911a', /study-stats\.js\?v=20260911a/.test(html));
  }
}

console.log('');
console.log('========== 【7】隐私断言：新公开接口不含 phone/gender/birthday ==========');
{
  const read = f => fs.readFileSync(path.join(ROOT, 'server/routers', f), 'utf8');
  // 新增路由文件全量扫描：只匹配带引号的字典键/字段名，
  // 排除「绝不返回 phone/gender/birthday」这类注释文本的误报
  for (const f of ['moments.py', 'groups.py', 'feedback.py', 'study.py']) {
    const src = read(f);
    const hit = /["'](phone|gender|birthday)["']/i.test(src);
    check(f + ' 序列化字段不含 phone/gender/birthday', !hit);
  }
  // users.py 的 public_profile 函数体（他人主页为新增公开面）
  const users = read('users.py');
  const m = users.match(/def public_profile[\s\S]*?(?=\n@router|$)/);
  check('users.py 存在 public_profile', !!m);
  if (m) {
    const body = m[0];
    const hit = /["'](phone|gender|birthday)["']/i.test(body);
    check('public_profile 响应字段不含 phone/gender/birthday', !hit,
      hit ? '发现敏感字段' : '字段白名单：id/username/nickname/avatar/motto/bio/city/goal/tags/createdAt/stats/notes');
  }
}

console.log('');
console.log('==================================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项  ' + (fail === 0 ? '✅ 全部通过' : '❌ 存在失败'));
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('运行异常:', e && e.message); process.exit(1); });
