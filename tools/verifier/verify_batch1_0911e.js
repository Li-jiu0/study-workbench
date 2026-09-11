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

  console.log('\n========== 汇总 ==========');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项。');
  process.exit(fail ? 1 : 0);
})();
