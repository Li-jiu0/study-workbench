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

console.log('\n========== 汇总 ==========');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项。');
process.exit(fail ? 1 : 0);
