// 机器人球（AI 悬浮球）点击 / 拖动体检
//
// 【2026-09-16 P1 修复】原先 ORIGIN 写死线上 110.42.134.62，而线上是上一版（旧代码），
//   本地改完没部署时跑本脚本验的是旧版 —— "自检通过"不可信（实测线上 /社区.html=404）。
//   现在默认走【本地静态服务】（本脚本会自动起，详见 tools/qa/_qa_origin.js）；
//   要验线上请显式：QA_ORIGIN=http://110.42.134.62 node tools/qa/ball_verify.js
//   手工起服务：python -m http.server 8899 --directory "D:\下载的文件\学习工作台"
//
// 用法：node tools/qa/ball_verify.js [页面，默认 学习工作台.html]
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const PAGE = process.argv[2] || '学习工作台.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = await QA.resolve();
  const out = [QA.sourceBanner(src)];

  const got = await QA.fetchPage(src.origin, PAGE);
  if (!got.ok) {
    out.push('FETCH_FAIL  ' + PAGE + '  HTTP ' + got.status + (got.reason ? '  ' + got.reason : ''));
    out.push('（若这是"线上 404"：说明目标文件还没部署到该环境，属预期）');
    fs.writeFileSync('C:\\Users\\ATM\\_ball_verify_out.txt', out.join('\n'), 'utf8');
    console.log('DONE');
    await QA.shutdown(src.server);
    process.exit(0);
  }

  const logs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => logs.push('ERR:' + (e && e.message ? e.message : e)));
  const dom = new JSDOM(got.html, {
    url: got.url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      QA.baseBeforeParse(src.origin)(w);
    }
  });
  const w = dom.window;
  await sleep(13000);
  out.push('typeof callAI=' + typeof w.callAI + '  typeof navigateTo=' + typeof w.navigateTo);

  // 找悬浮球
  const sel = ['#aiFab', '#ai-fab', '.ai-fab', '#aiBall', '#ai-ball', '[id*=fab]', '[class*=fab]'];
  let ball = null, used = '';
  for (const s of sel) {
    try { const el = w.document.querySelector(s); if (el) { ball = el; used = s; break; } } catch (e) {}
  }
  out.push('悬浮球: ' + (ball ? '找到 (' + used + ') id=' + ball.id + ' class=' + ball.className : '未找到'));

  if (ball) {
    const before = w.getComputedStyle(ball).visibility + '|' + (ball.style.display || '');
    ball.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(1200);
    const after = w.getComputedStyle(ball).visibility + '|' + (ball.style.display || '');
    out.push('点击前后样式: ' + before + '  ->  ' + after);

    // 拖动：touch 事件
    const mk = (type, x, y) => {
      const t = { identifier: 1, target: ball, clientX: x, clientY: y, pageX: x, pageY: y };
      const ev = new w.Event(type, { bubbles: true, cancelable: true });
      ev.touches = type === 'touchend' ? [] : [t];
      ev.changedTouches = [t];
      ev.targetTouches = type === 'touchend' ? [] : [t];
      return ev;
    };
    const pos0 = (ball.style.left || '') + ',' + (ball.style.top || '');
    ball.dispatchEvent(mk('touchstart', 300, 600));
    ball.dispatchEvent(mk('touchmove', 220, 480));
    ball.dispatchEvent(mk('touchend', 220, 480));
    await sleep(600);
    const pos1 = (ball.style.left || '') + ',' + (ball.style.top || '');
    out.push('拖动位移: ' + pos0 + '  ->  ' + pos1 + (pos0 !== pos1 ? '  ✅位置有变化' : '  ⚠️位置未变'));
  }

  // 首页卡片与留言板
  const cards = w.document.querySelectorAll('[class*=card]').length;
  const body = (w.document.body.textContent || '').replace(/\s+/g, ' ');
  const liuyanIdx = body.indexOf('留言板');
  out.push('[class*=card] 数量=' + cards);
  out.push('留言板片段: ' + (liuyanIdx >= 0 ? body.slice(liuyanIdx, liuyanIdx + 120) : '未找到'));
  out.push('body 文本长度=' + body.length);
  out.push('运行时错误: ' + (logs.slice(0, 5).join(' || ') || '无'));

  fs.writeFileSync('C:\\Users\\ATM\\_ball_verify_out.txt', out.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
