/**
 * tools/verifier/verify_batch1_0911e.js
 * 批次一（A1–A9）jsdom 真实渲染断言。
 * 运行：node tools/verifier/verify_batch1_0911e.js
 *
 * 覆盖（随批次一任务推进逐步补全）：
 *   [1] 更多.html / 工具.html：file:// 打开零未捕获异常、共用 DOM 齐全、showToast 可用、底部高亮
 *   [2] 底部导航批量跳转：各 live 页「更多/工具」指向独立页，旧弹层 DOM 保留
 *   [3] A4：GET /api/users/{id} 返回 isFriend:true 时渲染「发消息」而非「加为好友」
 *   [4] A9：预置 study_workbench_stats 后首页渲染真实数字（非 0、非假数据）
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + label + (detail ? '  → ' + detail : '')); }
  else { fail++; console.log('  ✘ ' + label + '  *** 失败 ***' + (detail ? '  → ' + detail : '')); }
}
function sec(t) { console.log('\n========== ' + t + ' =========='); }

// 载入一个页面：按 <script> 顺序 eval（src 读文件 / 内联读文本），并捕获未捕获异常
function load(page, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('[jsdom] ' + (e && e.message)));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/' + page,
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.addEventListener('error', e => errors.push('[error] ' + (e && (e.message || e.type))));
  w.addEventListener('unhandledrejection', e => errors.push('[reject] ' + (e && e.reason && e.reason.message)));
  // 预置登录态（app.js 登录门禁，避免 jsdom 导航报错）
  try {
    w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
  } catch (e) { }
  if (opts.preset) { try { opts.preset(w); } catch (e) { errors.push('[preset] ' + e.message); } }

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const srcM = attrs.match(/\bsrc="([^"]+)"/);
    try {
      if (srcM) {
        const rel = srcM[1].split('?')[0];
        const fp = path.join(ROOT, rel);
        if (fs.existsSync(fp)) w.eval(fs.readFileSync(fp, 'utf8'));
        else errors.push('[missing src] ' + rel);
      } else if (m[2].trim()) {
        w.eval(m[2]);
      }
    } catch (e) {
      errors.push('[eval ' + (srcM ? srcM[1] : 'inline') + '] ' + e.message);
    }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  return { w, d: w.document, errors };
}

/* ========== [1] 新页 更多.html / 工具.html ========== */
sec('[1] 更多.html / 工具.html（A8）');
for (const page of ['更多.html', '工具.html']) {
  const { w, d, errors } = load(page);
  check(page + ' 打开零未捕获异常', errors.length === 0, errors.length ? errors.join(' | ') : '无');
  check(page + ' #countdownModal 共用 DOM 存在', !!d.getElementById('countdownModal'));
  ['cdName', 'cdDate', 'cdColorPicker', 'cdPinned', 'countdownModalTitle'].forEach(id =>
    check(page + ' 含 #' + id, !!d.getElementById(id)));
  check(page + ' .more-overlay 存在（closeMorePanel 需要）', !!d.querySelector('.more-overlay'));
  check(page + ' #morePanel 旧弹层保留', !!d.getElementById('morePanel'));
  check(page + ' #toolsPanel 旧弹层保留', !!d.getElementById('toolsPanel'));
  check(page + ' window.showToast 为函数', typeof w.showToast === 'function');
  check(page + ' toggleMorePanel 仍存在（可回退）', typeof w.toggleMorePanel === 'function');
  check(page + ' toggleToolsPanel 仍存在（可回退）', typeof w.toggleToolsPanel === 'function');
  // showToast 实测不抛错
  let toastOk = true; try { w.showToast('测试'); } catch (e) { toastOk = false; }
  check(page + ' 调用 showToast 不抛错', toastOk);
}
// 高亮
{
  const { d } = load('更多.html');
  const act = Array.from(d.querySelectorAll('.bottom-nav-item.active')).map(x => (x.querySelector('.bn-label') || {}).textContent);
  check('更多.html 底部「更多」高亮', act.includes('更多'), 'active=' + act.join(','));
  const toolsItem = Array.from(d.querySelectorAll('.bottom-nav-item')).find(x => (x.querySelector('.bn-label') || {}).textContent === '工具');
  check('更多.html「工具」跳 工具.html', toolsItem && /工具\.html/.test(toolsItem.getAttribute('onclick') || ''));
}
{
  const { d } = load('工具.html');
  const act = Array.from(d.querySelectorAll('.bottom-nav-item.active')).map(x => (x.querySelector('.bn-label') || {}).textContent);
  check('工具.html 底部「工具」高亮', act.includes('工具'), 'active=' + act.join(','));
  const cards = Array.from(d.querySelectorAll('.morepage-card .mpc-title')).map(x => x.textContent);
  check('工具.html 含「穿越英语」入口（铁律保留）', cards.includes('穿越英语'), 'cards=' + cards.join(','));
  check('工具.html 穿越英语指向 openQuest/回退', /openQuest/.test(d.documentElement.innerHTML));
}

/* ========== [2] live 页底部导航批量跳转 ========== */
sec('[2] live 页底部导航跳独立页（A8）');
const LIVE = ['学习工作台.html', '私聊.html', '设置.html', '个人中心.html', '动态.html', '四级备考.html', '错题本.html', '行测刷题.html', '高情商表达.html'];
LIVE.forEach(page => {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const nav = (html.match(/<nav class="bottom-nav"[^>]*>[\s\S]*?<\/nav>/) || [''])[0];
  check(page + '「工具」→ 工具.html', nav.includes("location.href='工具.html'"));
  check(page + '「更多」→ 更多.html', nav.includes("location.href='更多.html'"));
  check(page + ' 旧弹层 #morePanel 保留', html.includes('id="morePanel"'));
});

/* ========== [3] A4：他人主页 isFriend 判定 ========== */
// 用探针替换 window.api 后调用真实 renderUserHome，断言按钮分支。
async function renderUserHomeProbe(w, opts) {
  opts = opts || {};
  const userId = opts.userId || 2;
  const user = {
    id: userId, username: 'peer', nickname: '小明', motto: '你好',
    avatarUrl: null, notes: [], stats: {}, isMe: false,
  };
  if (opts.isFriend !== undefined) user.isFriend = opts.isFriend;
  w.CURRENT_USER = { id: 1, username: 'me', nickname: '我', stats: {} };
  w.api = function (p) {
    if (/\/api\/users\//.test(p)) return Promise.resolve(user);
    if (/\/api\/friends/.test(p)) return Promise.resolve(opts.friendsPayload || { items: [] });
    return Promise.resolve({});
  };
  const box = w.document.createElement('div');
  w.document.body.appendChild(box);
  await w.renderUserHome(userId, box);
  return box.innerHTML;
}

(async function () {
  sec('[3] A4：他人主页 isFriend 判定');
  {
    const { w } = load('个人中心.html');
    // 3.1 服务端直接给 isFriend:true
    let html = await renderUserHomeProbe(w, { isFriend: true, userId: 2 });
    check('A4 isFriend:true → 显示「发消息」', html.indexOf('发消息') !== -1);
    check('A4 isFriend:true → 显示「删除好友」', html.indexOf('删除好友') !== -1);
    check('A4 isFriend:true → 不显示「加为好友」', html.indexOf('加为好友') === -1);
    check('A4 isFriend:true → 发消息按钮调用 chatWithUser(2)', html.indexOf('chatWithUser(2') !== -1);

    // 3.2 isFriend:false
    html = await renderUserHomeProbe(w, { isFriend: false, userId: 3 });
    check('A4 isFriend:false → 显示「加为好友」', html.indexOf('加为好友') !== -1);
    check('A4 isFriend:false → 不显示「删除好友」', html.indexOf('删除好友') === -1);

    // 3.3 isFriend 缺失 → 回退 /api/friends，兼容 {items:[...]}（bob 形如 {id:Name}）
    html = await renderUserHomeProbe(w, { userId: 4, friendsPayload: { items: [{ id: 4, nickname: '小明' }] } });
    check('A4 isFriend 缺失 + {items:[{id:4}]} → 判为好友', html.indexOf('删除好友') !== -1 && html.indexOf('加为好友') === -1);

    // 3.4 isFriend 缺失 → 回退 /api/friends，兼容裸数组
    html = await renderUserHomeProbe(w, { userId: 5, friendsPayload: [{ id: 5, nickname: '小明' }] });
    check('A4 isFriend 缺失 + 裸数组 [{id:5}] → 判为好友', html.indexOf('删除好友') !== -1);

    // 3.5 isFriend 缺失 + 好友列表不含该 id → 非好友（旧实现 f.user.id 恒 false，此处应仍为 false）
    html = await renderUserHomeProbe(w, { userId: 6, friendsPayload: { items: [{ id: 99 }] } });
    check('A4 isFriend 缺失 + 列表中无该 id → 非好友', html.indexOf('加为好友') !== -1);
  }

  /* ========== [4] A9：首页学习数据真实化 ========== */
  sec('[4] A9：首页学习数据接本地真实统计');
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  {
    // 4.1 预置 120 分钟 / 连续 7 天 → 应渲染 2 小时、7 天、无空态
    const nowKey = todayKey();
    const { w, d } = load('学习工作台.html', {
      preset: (win) => {
        win.localStorage.setItem('study_workbench_stats', JSON.stringify({
          version: 1,
          modules: { cet4: { total: 3, days: {} } , tools: { total: 2, days: {} } },
          lastActiveDay: nowKey, streak: 7, syncAt: 0,
        }));
        // 两次写入，避免对象引用问题：把今日分钟塞进两个模块
        const s = JSON.parse(win.localStorage.getItem('study_workbench_stats'));
        s.modules.cet4.days[nowKey] = { minutes: 90, events: 2 };
        s.modules.tools.days[nowKey] = { minutes: 30, events: 1 };
        win.localStorage.setItem('study_workbench_stats', JSON.stringify(s));
      },
    });
    check('A9 study-stats.js 已加载（StudyStats.getSummary 可用）', !!(w.StudyStats && typeof w.StudyStats.getSummary === 'function'));
    w.renderStats();
    const hours = (d.getElementById('totalHours') || {}).textContent;
    const streak = (d.getElementById('streakDisplay') || {}).textContent;
    const q = (d.getElementById('totalQuestions') || {}).textContent;
    const hint = d.getElementById('statsEmptyHint');
    check('A9 总学习(h) = round(120/60) = 2（真实非假）', hours === '2', 'totalHours=' + hours);
    check('A9 连续天数 = 7（来自 study-stats）', streak === '7', 'streakDisplay=' + streak);
    check('A9 做题数 = 0（无做题记录，不造假）', q === '0', 'totalQuestions=' + q);
    check('A9 空态提示隐藏（有记录）', hint && hint.style.display === 'none', 'display=' + (hint && hint.style.display));
    const chart = (d.getElementById('weekChart') || {}).innerHTML || '';
    check('A9 本周柱图出现今日真实值 120', chart.indexOf('120') !== -1);
    check('A9 本周柱图不显示空态', chart.indexOf('还没有学习记录') === -1);
  }
  {
    // 4.2 无任何本地记录 → 全 0 + 空态文案「还没有学习记录，去学一章吧」，绝不出现模拟数据
    const { w, d } = load('学习工作台.html');
    w.renderStats();
    const hours = (d.getElementById('totalHours') || {}).textContent;
    const hint = d.getElementById('statsEmptyHint');
    const chart = (d.getElementById('weekChart') || {}).innerHTML || '';
    check('A9 无记录 → 总学习(h) = 0', hours === '0', 'totalHours=' + hours);
    check('A9 无记录 → 空态提示显示', hint && hint.style.display === 'block', 'display=' + (hint && hint.style.display));
    check('A9 无记录 → 柱图空态文案「还没有学习记录，去学一章吧」', chart.indexOf('还没有学习记录，去学一章吧') !== -1);
    check('A9 无记录 → 不出现旧模拟数组[25/40/15/60]', chart.indexOf('60') === -1 && chart.indexOf('25') === -1);
  }

  /* ========== [5] A3/A1/A2：私聊页加好友模态 + 加固 ========== */
  sec('[5] A3/A1/A2：私聊页加好友模态与加固');
  {
    const { w, d } = load('私聊.html');
    check('A3 #imAddFriendModal 存在', !!d.getElementById('imAddFriendModal'));
    check('A3 #imAfInput / #imAfResults 存在', !!d.getElementById('imAfInput') && !!d.getElementById('imAfResults'));
    check('A3 「加好友」入口改调 imOpenAddFriendModal()', /imOpenAddFriendModal\(\)/.test(d.documentElement.innerHTML));
    ['imOpenAddFriendModal', 'imCloseAddFriendModal', 'imAfSearch', 'imAfSendRequest', 'imAfOpenChat', 'imRenderFriendRows']
      .forEach(fn => check('A3 window.' + fn + ' 为函数', typeof w[fn] === 'function'));
    check('A1 Esc 关闭监听函数已挂载（keydown 后弹层可关）', typeof w.imOpenGroupCreator === 'function' && typeof w.imCloseGroupCreator === 'function');
    check('A2 window.imShowPeerHint 为函数', typeof w.imShowPeerHint === 'function');
    check('A7 window.imToggleRecord / imTogglePlayVoice 为函数', typeof w.imToggleRecord === 'function' && typeof w.imTogglePlayVoice === 'function');
    check('A5 window.imRemoveFriend 为函数', typeof w.imRemoveFriend === 'function');
    check('A7 输入栏含 🎤 录音按钮', !!d.querySelector('.im-composer button[onclick="imToggleRecord()"]'));

    // A3：imRenderFriendRows 状态规则
    const rowFriend = d.createElement('div'); rowFriend.innerHTML = w.imRenderFriendRows([{ id: 1, nickname: 'A', username: 'a', isFriend: true }]);
    const rowSend = d.createElement('div'); rowSend.innerHTML = w.imRenderFriendRows([{ id: 2, nickname: 'B', username: 'b', requested: true }]);
    const rowBlock = d.createElement('div'); rowBlock.innerHTML = w.imRenderFriendRows([{ id: 3, nickname: 'C', username: 'c', blockedMe: true }]);
    const rowAdd = d.createElement('div'); rowAdd.innerHTML = w.imRenderFriendRows([{ id: 4, nickname: 'D', username: 'd' }]);
    check('A3 isFriend → 「发消息」', /发消息/.test(rowFriend.innerHTML), rowFriend.textContent.trim());
    check('A3 已发送 → 禁灰「已发送」', /已发送/.test(rowSend.innerHTML));
    check('A3 blockedMe → 「不可添加」', /不可添加/.test(rowBlock.innerHTML));
    check('A3 非好友 → 「加好友」', /加好友/.test(rowAdd.innerHTML));

    // A5：imRemoveFriend 生成二次确认弹层（含昵称与勾选项），Esc 可关闭
    const before = d.querySelectorAll('.im-overlay').length;
    w.imRemoveFriend(2);
    const ovs = d.querySelectorAll('.im-overlay');
    const lastOv = ovs[ovs.length - 1];
    check('A5 删除好友弹层已生成', ovs.length === before + 1);
    check('A5 二次确认含「同时清空本机聊天记录」勾选项', lastOv && /同时清空本机聊天记录/.test(lastOv.innerHTML));
    // 触发 Esc 关闭
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('A1 Esc 关闭删除好友弹层', d.querySelectorAll('.im-overlay').length === before);

    // A1：Esc 关闭群聊弹层（真实打开→Esc→关闭）
    w.localStorage.setItem('study_workbench_token', 't');
    w.fetch = function () { return Promise.resolve({ json: function () { return Promise.resolve({ items: [] }); } }); };
    w.imOpenGroupCreator();
    const gm = d.getElementById('imGroupModal');
    check('A1 群聊弹层已打开（display:flex）', gm && gm.style.display === 'flex');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('A1 Esc 关闭群聊弹层', gm && gm.style.display === 'none');
  }

  /* ========== [6] A1：弹层加固 CSS ========== */
  sec('[6] A1：common.css 弹层加固');
  {
    const css = fs.readFileSync(path.join(ROOT, 'assets', 'common.css'), 'utf8');
    check('A1 .im-overlay z-index>=10000', /\.im-overlay\{[^}]*z-index:10000/.test(css));
    check('A1 .im-overlay 含 safe-area padding', /\.im-overlay\{[^}]*env\(safe-area-inset-top\)/.test(css));
    check('A1 .im-modal margin:auto + dvh 高度约束', /\.im-modal\{[^}]*margin:auto/.test(css) && /dvh - 40px/.test(css));
    check('A7 .im-voice 语音条样式存在', /\.im-voice\{/.test(css));
  }

  /* ========== [7] A7：语音消息（源码 + 分支） ========== */
  sec('[7] A7：语音消息实现');
  {
    const cl = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
    check('A7 使用 MediaRecorder 录制', /MediaRecorder/.test(cl));
    check('A7 renderMsgs 有 voice 分支', /m\.kind === 'voice'/.test(cl));
    check('A7 上传接口 /api/uploads/voice', /\/api\/uploads\/voice/.test(cl));
    check('A7 发送 kind:voice 消息', /kind: 'voice'/.test(cl));
    check('A7 60s/2MB 上限校验', /MAX_VOICE_MS/.test(cl) && /MAX_VOICE_BYTES/.test(cl));
    check('A7 群会话预览 [语音]（previewText）', /previewText/.test(cl));
    check('A7 不支持时降级提示', /不支持录音/.test(cl));
  }

  /* ========== [8] A6：设置页改密表单（前端校验 + 接后端） ========== */
  sec('[8] A6：设置页修改密码（在线）');
  {
    const { w, d } = load('设置.html');
    check('A6 #stPwdModal 表单存在', !!d.getElementById('stPwdModal'));
    check('A6 三个密码输入框存在', ['stPwdOld', 'stPwdNew', 'stPwdNew2'].every(id => !!d.getElementById(id)));
    check('A6 stOpenPwdModal / stClosePwdModal / stSubmitPwd 为函数',
      typeof w.stOpenPwdModal === 'function' && typeof w.stClosePwdModal === 'function' && typeof w.stSubmitPwd === 'function');

    // 预置在线 token → 打开模态
    w.localStorage.setItem('study_workbench_token', 'test-token');
    let calls = [];
    w.api = function (p, o) { calls.push({ p: p, o: o }); return Promise.resolve({ ok: true }); };
    w.stOpenPwdModal();
    const modal = d.getElementById('stPwdModal');
    check('A6 在线账号可打开改密模态', modal && modal.classList.contains('active'));

    // 前端拦截：新密码 < 6 位
    d.getElementById('stPwdOld').value = 'oldpass';
    d.getElementById('stPwdNew').value = '123';
    d.getElementById('stPwdNew2').value = '123';
    await w.stSubmitPwd();
    check('A6 新密码<6位 → 前端拦截（不发请求）', calls.length === 0, 'calls=' + calls.length);

    // 前端拦截：两次不一致
    d.getElementById('stPwdNew').value = 'newpass1';
    d.getElementById('stPwdNew2').value = 'newpass2';
    await w.stSubmitPwd();
    check('A6 两次不一致 → 前端拦截', calls.length === 0, 'calls=' + calls.length);

    // 合法提交 → 调接口并关闭模态
    d.getElementById('stPwdNew').value = 'newpass1';
    d.getElementById('stPwdNew2').value = 'newpass1';
    await w.stSubmitPwd();
    check('A6 合法提交 → 调用 /api/auth/change-password', calls.length === 1 && /\/api\/auth\/change-password/.test(calls[0].p), JSON.stringify(calls[0] || {}));
    check('A6 提交体含旧/新密码', calls[0] && calls[0].o && calls[0].o.body && calls[0].o.body.oldPassword === 'oldpass' && calls[0].o.body.newPassword === 'newpass1');
    check('A6 成功后关闭模态', !modal.classList.contains('active'));
  }

  /* ========== [9] T06：语音回退链可达 + shouldUseDictTts ========== */
  sec('[9] T06：语音回退链（有道失败→Web Speech/原生）');
  {
    const { w } = load('学习工作台.html');
    check('T06 shouldUseDictTts 为函数', typeof w.shouldUseDictTts === 'function');
    check('T06 speakFallback 为函数', typeof w.speakFallback === 'function');

    // 纯函数：词/短语 → true；句子 → false（有道对任意句子确定性 500）
    const cases = [
      ['hello', true], ['apple', true], ['thank you', true], ['how are you', true],
      ['i like apples', true], ['well-known', true],
      ['the quick brown fox', false],
      ['i like red apples', false], ['Hi what can I get for you today', false],
      ['Hello, world', false], ['', false], [null, false],
      // 中文边界（D1 回归，QA 抓出 '你好世界' 曾误判 true）：
      // 实测 ≥4 字全 500 → 当句子(false)；≤3 字属"看词典里有没有"→ 命中启发式(true)，
      // 其中计算机/天安门 实测 500，由 speakFallback 兜底保证出声（保障靠回退非启发式）。
      ['你好', true], ['你好吗', true], ['图书馆', true],
      ['计算机', true], ['天安门', true],
      ['你好世界', false], ['今天天气', false], ['学习工作台', false],
    ];
    cases.forEach(([t, exp]) => check('T06 shouldUseDictTts(' + JSON.stringify(t) + ') === ' + exp, w.shouldUseDictTts(t) === exp));

    // 回退链：mock 一个失败的有道（onEnd(false)），断言 speakText 到达 Web Speech 分支
    const realNetSpeak = w.netSpeak;
    let wsCalled = 0, wsText = '';
    w.speechSynthesis = { cancel: function () { }, speak: function (u) { wsCalled++; wsText = (u && u.text) || ''; } };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };

    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(false); return true; };
    w.speakText('Hello there my friend', 'en-US', 0.9);
    check('T06 speakText：有道失败 → 回退到 Web Speech', wsCalled === 1, 'wsCalled=' + wsCalled + ' text=' + wsText);
    check('T06 speakText：回退朗读文本正确', wsText === 'Hello there my friend', wsText);

    // 启发式边界：'hello world ok'（3 token/15 字）会命中规则→走有道，但上游无此短语→500。
    // 规则无法穷尽词表，因此「保障」不靠启发式，而靠失败后回退链可达 —— 断言它仍能出声。
    check('T06 启发式边界：hello world ok 命中规则(≤3token)', w.shouldUseDictTts('hello world ok') === true);
    wsCalled = 0;
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(false); return true; };
    w.speakText('hello world ok', 'en-US', 0.9);
    check('T06 边界串有道失败 → 回退出声（不静默）', wsCalled === 1, 'wsCalled=' + wsCalled);

    // 有道成功 → 不触发 Web Speech
    wsCalled = 0;
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(true); return true; };
    w.speakText('hello', 'en-US', 0.9);
    check('T06 speakText：有道成功 → 不触发回退', wsCalled === 0, 'wsCalled=' + wsCalled);

    // speakUtterance 同链：失败回退到 Web Speech
    wsCalled = 0;
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(false); return true; };
    w.speakUtterance('apple');
    check('T06 speakUtterance：有道失败 → 回退到 Web Speech', wsCalled === 1, 'wsCalled=' + wsCalled);

    // 真实 netSpeak：句子直接跳过有道、走回退（返回 true 表示已受理，兼容 quest.js/voiceplayer.js 直调）
    wsCalled = 0;
    w.netSpeak = realNetSpeak;
    const r = w.netSpeak('Hi what can I get for you today', 'en-US', 0.9, null);
    check('T06 真实 netSpeak：句子跳过有道、直接走回退', r === true && wsCalled === 1, 'r=' + r + ' wsCalled=' + wsCalled);
  }

  console.log('\n========== 汇总 ==========');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项。');
  process.exit(fail ? 1 : 0);
})();
