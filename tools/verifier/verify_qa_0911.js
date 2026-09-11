// =====================================================================
// verify_qa_0911.js —— 独立 QA（严过关）verifier for 星途 2026-09-11 增量
// 覆盖：①动态.html file:// 离线 ②表情 XSS ③设置页反馈校验 ④六模块统计卡
//       ⑤全部改动 HTML 标签配平 + 版本号签名 ⑥合规扫描（硬编码 IP / 死代码 / 脚本顺序）
// 运行：node tools/verifier/verify_qa_0911.js   （仓库根目录）
// =====================================================================
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = 'D:/下载的文件/学习工作台';

let pass = 0, fail = 0; const failures = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label + (detail ? '  | ' + detail : '')); }
  else { fail++; failures.push(label + (detail ? '  | ' + detail : '')); console.log('  FAIL  ' + label + (detail ? '  | ' + detail : '')); }
}

/* ---------- jsdom 装载：file:// 协议 + 外链脚本按序内联（jsdom 30 无 ResourceLoader 且 file: 为 opaque origin，故内联 + localStorage 兜底） ---------- */
function inlineExternals(html) {
  return html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g, function (m, src) {
    const p = src.split('?')[0].replace(/^\.\//, '');
    const abs = path.join(ROOT, p);
    return fs.existsSync(abs)
      ? '<script data-src="' + src + '">\n' + fs.readFileSync(abs, 'utf8') + '\n</script>'
      : '<!-- missing ' + src + ' -->';
  });
}
function fakeStorage() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; },
    key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }
  };
}
function loadPage(page, opts) {
  opts = opts || {};
  let html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  if (opts.inline !== false) html = inlineExternals(html);
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const msg = (e && e.message) || String(e);
    if (/Not implemented: navigation/.test(msg)) return; // jsdom 不支持导航，非页面 bug
    errs.push(msg);
  });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'file:///' + path.join(ROOT, page).replace(/\\/g, '/'),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { configurable: true, get: () => (w.__ls || (w.__ls = fakeStorage())) });
      w.fetch = opts.fetch || function () { return Promise.reject(new Error('offline-stub')); };
      w.showToast = function (m) { (w.__toasts = w.__toasts || []).push(m); };
      w.alert = function (m) { (w.__alerts = w.__alerts || []).push(m); };
      w.confirm = function () { return true; };
      w.addEventListener('error', ev => errs.push('uncaught: ' + (ev.message || (ev.error && ev.error.message) || '')));
      if (opts.pre) Object.entries(opts.pre).forEach(([k, v]) => { try { w.localStorage.setItem(k, v); } catch (e) { } });
    }
  });
  return { dom, w: dom.window, errs };
}
const tick = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
// app.js 会定义自己的全局 showToast 覆盖装载前的桩，故加载后重新挂捕获桩
function reToast(w) { w.showToast = function (m) { (w.__toasts = w.__toasts || []).push(m); }; }
function git(cmd) { return cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8' }); }

(async function main() {

  console.log('========== 【1】动态.html：file:// 无后端 打开不抛未捕获异常 + 渲染空态 ==========');
  {
    const { w, errs } = loadPage('动态.html');
    await tick(800);
    check('动态.html 无未捕获异常', errs.length === 0, errs.length ? JSON.stringify(errs) : '');
    const feed = w.document.getElementById('moFeed');
    const txt = feed ? feed.textContent : '';
    check('动态.html 渲染空态/降级文案', /需联网|还没有动态/.test(txt), JSON.stringify(txt.slice(0, 60)));
    check('动态.html 离线时禁用提示区显示', (w.document.getElementById('moOffline') || {}).style && w.document.getElementById('moOffline').style.display === 'block');
  }

  console.log('\n========== 【2】表情渲染防注入（renderContent：先 esc 后替换） ==========');
  {
    // 通过预置本地会话数据确定性渲染，避免依赖 sendMsg/aiBusy 副作用
    async function renderWith(payload) {
      const data = JSON.stringify({
        chats: { 1: { id: 1, nickname: '学习搭子·小星', last: '', time: Date.now(), unread: 0 } },
        messages: { 1: [{ senderId: 2, content: payload, kind: 'text', time: Date.now() }] }
      });
      const { w } = loadPage('私聊.html', { pre: { study_im_local_data: data } });
      await tick(250);
      w.imOpenChat(1);
      return { w, box: w.document.getElementById('imMsgs') };
    }

    // 正例：合法表情编码 → 渲染为 .im-emoji span
    {
      const { box } = await renderWith('你好[emoji:e001]');
      const s = box.querySelector('.im-emoji');
      check('合法 [emoji:e001] 渲染为表情 span', !!s && (s.textContent || '').length >= 1, s ? JSON.stringify(s.textContent) : 'no span');
    }
    // 恶意用例 1：<img src=x onerror=alert(1)>
    {
      const { box } = await renderWith('<img src=x onerror=alert(1)>');
      check('注入 <img onerror>：无 [onerror] 元素', box.querySelectorAll('[onerror]').length === 0);
      check('注入 <img onerror>：无 <script> 元素', box.querySelectorAll('script').length === 0);
      check('注入 <img onerror>：未被解析为 img', box.querySelectorAll('img').length === 0, box.querySelectorAll('img').length + ' 个 img');
      check('注入内容以纯文本呈现', box.textContent.indexOf('<img src=x onerror=alert(1)>') >= 0, JSON.stringify(box.textContent.slice(0, 80)));
    }
    // 恶意用例 2：[emoji:"><script>alert(1)</script>]
    {
      const { box } = await renderWith('[emoji:"><script>alert(1)</script>]');
      check('注入 [emoji:"><script>]：无 <script> 元素', box.querySelectorAll('script').length === 0);
      check('注入 [emoji:"><script>]：无 [onerror]/[onclick]', box.querySelectorAll('[onerror],[onclick]').length === 0);
    }
    // 混合：合法表情 + 注入
    {
      const { box } = await renderWith('[emoji:e001]<img src=x onerror=alert(2)>');
      check('混合串：合法表情正常渲染', box.querySelector('.im-emoji') !== null);
      check('混合串：注入部分不可执行', box.querySelectorAll('[onerror]').length === 0 && box.querySelectorAll('img').length === 0);
    }
  }

  console.log('\n========== 【3】设置.html 反馈表单校验 + 离线 outbox ==========');
  {
    const { w } = loadPage('设置.html');
    await tick(300);
    reToast(w);
    const d = w.document;
    check('反馈表单容器齐全', !!d.getElementById('fbContent') && !!d.getElementById('fbAnonymous') && !!d.getElementById('fbSubmitBtn'));
    check('FAQ 手风琴 ≥ 6 条', d.querySelectorAll('.fb-faq-item').length >= 6, d.querySelectorAll('.fb-faq-item').length + ' 条');

    d.getElementById('fbContent').value = '太短';
    w.fbSubmit();
    check('<10 字被前端拦截', (w.__toasts || []).some(t => /至少 10 个字/.test(t)), JSON.stringify(w.__toasts || []));
    const ob0 = w.localStorage.getItem('study_workbench_feedback_outbox');
    check('<10 字不写入 outbox', !ob0 || JSON.parse(ob0).length === 0);

    d.getElementById('fbContent').value = '希望动态页支持按图片筛选，方便找打卡照片。';
    d.getElementById('fbAnonymous').checked = true;
    w.fbSubmit();
    await tick(120);
    const box = JSON.parse(w.localStorage.getItem('study_workbench_feedback_outbox') || '[]');
    check('≥10 字离线提交写入 outbox', box.length === 1 && /图片筛选/.test(box[0].content) && box[0].anonymous === true,
      box.length + ' 条');
  }

  console.log('\n========== 【4】六模块统计卡：预置 study_workbench_stats 后渲染出数字 ==========');
  {
    const stats = (mod, minutes, total, streak) => JSON.stringify({
      version: 1, modules: { [mod]: { total: total, days: { [todayStr()]: { minutes: minutes, events: 4 } } } },
      lastActiveDay: '', streak: streak, syncAt: 0
    });
    const cases = [
      ['四级备考.html', 'cetStatsCard', 'cet4', 33, 9, 2],
      ['央国企笔试.html', 'examStatsCard', 'xingce', 41, 12, 3],
      ['高情商表达.html', 'eqStatsCard', 'eq', 22, 7, 1],
      ['商务礼仪面试.html', 'ivStatsCard', 'etiquette', 55, 15, 4],
      ['PPT训练.html', 'pptStatsCard', 'ppt', 18, 5, 2],
    ];
    for (const [page, cid, mod, minutes, total, streak] of cases) {
      const { w, errs } = loadPage(page, {
        pre: { study_workbench_stats: stats(mod, minutes, total, streak) }
      });
      await tick(500);
      const card = w.document.getElementById(cid);
      check(page + ' 统计卡容器存在', !!card);
      check(page + ' StudyStats 已加载', typeof w.StudyStats === 'object');
      if (w.StudyStats && card) w.StudyStats.render(cid, mod);
      const html = card ? card.innerHTML : '';
      check(page + ' 渲染出「学习概况」', /学习概况/.test(html));
      check(page + ' 渲染出预置今日分钟数 ' + minutes, html.indexOf(String(minutes)) >= 0, 'html.len=' + html.length);
      check(page + ' 渲染出四格标签', /今日分钟/.test(html) && /累计次数/.test(html) && /连续打卡/.test(html));
    }
    // 第六模块 tools：学习工作台.html 无独立统计卡容器，直接在合成容器上验证 render 出数字
    {
      const { w } = loadPage('学习工作台.html', { pre: { study_workbench_stats: stats('tools', 66, 21, 5) } });
      await tick(500);
      const div = w.document.createElement('div'); div.id = 'qaToolsCard';
      w.document.body.appendChild(div);
      w.StudyStats.render('qaToolsCard', 'tools');
      check('tools 模块统计卡渲染出数字 66', div.innerHTML.indexOf('66') >= 0, 'len=' + div.innerHTML.length);
    }
  }

  console.log('\n========== 【5】全部改动 HTML：标签配平 + 版本号签名 ==========');
  {
    let changed = [];
    try {
      changed = git('git -c core.quotepath=false diff --name-only 3541546..HEAD')
        .split(/\r?\n/).map(s => s.trim().replace(/^"|"$/g, '')).filter(f => f.endsWith('.html'));
    } catch (e) { check('git 读取改动 HTML 清单', false, e.message); }
    check('识别到被改动 HTML 数量 ≥ 10', changed.length >= 10, changed.length + ' 个：' + changed.join(', '));
    const pairs = [['<!--', '-->'], ['<div', '</div'], ['<style', '</style'], ['<script', '</script']];
    for (const f of changed) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) { check(f + ' 存在', false); continue; }
      const src = fs.readFileSync(p, 'utf8');
      const counts = pairs.map(([a, b]) => [a, (src.split(a).length - 1), (src.split(b).length - 1)]);
      const bad = counts.filter(([a, ca, cb]) => ca !== cb);
      check(f + ' 标签配平', bad.length === 0,
        bad.length ? bad.map(([a, ca, cb]) => a + ' ' + ca + '/' + cb).join('; ') : counts.map(([a, ca]) => a + '=' + ca).join(' '));
      // 损坏签名：?v=xxx" 之后紧跟的字符既不是 > 也不是空白/斜杠（说明标签收尾符被吞）
      const corrupt = src.match(/\.(?:js|css)\?v=[0-9a-zA-Z]+"[^>\s/]/g);
      check(f + ' 无损坏签名 .js/.css?v=.."', !corrupt, corrupt ? corrupt.slice(0, 3).join(' , ') : '');
      // 注释内残留版本号
      const cmts = src.match(/<!--[\s\S]*?-->/g) || [];
      const inCmt = cmts.filter(c => /\?v=/.test(c));
      check(f + ' 注释内无版本号残留', inCmt.length === 0, inCmt.length ? inCmt[0].slice(0, 60) : '');
      // <link> 标签均正确闭合（防历史「版本号替换吞掉 > 」回归）
      const openLinks = (src.match(/<link\b/g) || []).length;
      const closedLinks = (src.match(/<link\b[^>]*>/g) || []).length;
      check(f + ' <link> 标签均闭合', openLinks === closedLinks, openLinks + '/' + closedLinks);
    }
  }

  console.log('\n========== 【6】合规扫描（IP / 死代码 / 脚本顺序） ==========');
  {
    // 6.1 被跟踪的违规文件
    let tracked = '';
    try { tracked = git('git ls-files'); } catch (e) { }
    const bad = tracked.split(/\r?\n/).filter(f => /data\.db|(^|\/)\.env$|node_modules\/|\.tar\.gz/.test(f));
    check('git 跟踪列表无 data.db/.env/node_modules/.tar.gz', bad.length === 0, bad.slice(0, 5).join(', '));

    // 6.2 本次「新增」的 JS 文件不得硬编码后端 IP（config.js 为唯一地址源；存量文件不在本条判据）
    let addedFiles = [];
    try {
      addedFiles = git('git -c core.quotepath=false diff --name-status --diff-filter=A 3541546..HEAD')
        .split(/\r?\n/).filter(l => /\tassets\/.*\.js$/.test(l)).map(l => l.split('\t')[1].trim().replace(/^"|"$/g, ''));
    } catch (e) { }
    check('识别到本次新增 JS 文件', addedFiles.length > 0, addedFiles.join(', '));
    const ipScan = [];
    for (const rel of addedFiles.concat(['assets/study-stats.js'])) {
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (/110\.42\.134\.62/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) ipScan.push(rel + ':' + (i + 1));
      });
    }
    const uniqScan = [...new Set(ipScan)];
    check('新增 JS 无（非注释）硬编码后端 IP', uniqScan.length === 0, uniqScan.join(', ') || 'clean');
    const cfg = fs.readFileSync(path.join(ROOT, 'assets/config.js'), 'utf8');
    check('window.STUDY_API_BASE 由 config.js 统一下发', /window\.STUDY_API_BASE\s*=/.test(cfg));

    // 6.3 chat.js 是死代码，未被本次改动
    let chatDiff = '';
    try { chatDiff = git('git -c core.quotepath=false diff --name-only 3541546..HEAD -- assets/chat.js').trim(); } catch (e) { }
    check('assets/chat.js（死代码）未被本次改动', chatDiff === '', chatDiff);

    // 6.4 被改 HTML 中 api.js 仍在 app.js 之后加载
    const changed = git('git -c core.quotepath=false diff --name-only 3541546..HEAD').split(/\r?\n/).map(s => s.trim().replace(/^"|"$/g, '')).filter(f => f.endsWith('.html'));
    for (const f of changed) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const ia = src.indexOf('assets/app.js');
      const ib = src.indexOf('assets/api.js');
      if (ia < 0 || ib < 0) { check(f + ' 同时引用 app.js 与 api.js', false, 'app=' + ia + ' api=' + ib); continue; }
      check(f + ' api.js 在 app.js 之后加载', ib > ia, 'app@' + ia + ' api@' + ib);
    }
  }

  console.log('\n==================================================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项  ' + (fail === 0 ? '✅ 全部通过' : '❌ 存在失败'));
  if (failures.length) { console.log('失败清单：'); failures.forEach(f => console.log('  - ' + f)); }
  console.log('==================================================');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('运行异常:', e && e.stack || e); process.exit(1); });
