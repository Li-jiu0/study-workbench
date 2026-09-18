// 多页体检：导航函数是否存在、底部导航是否可点、运行时错误
//
// 【2026-09-16 P1 修复】原先 ORIGIN 写死线上 110.42.134.62，而线上是上一版（旧代码），
//   本地改完没部署时跑本脚本验的是旧版 —— "自检通过"不可信（实测线上 /社区.html=404）。
//   现在默认走【本地静态服务】（本脚本会自动起，详见 tools/qa/_qa_origin.js）；
//   要验线上请显式：QA_ORIGIN=http://110.42.134.62 node tools/qa/multi_check.js
//   手工起服务：python -m http.server 8899 --directory "D:\下载的文件\学习工作台"
//
// 用法：node tools/qa/multi_check.js [页面1] [页面2] ...   （不给参数则用下方默认清单）
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const DEFAULT_PAGES = ['学习工作台.html', 'AI.html', '更多.html', '工具.html', '个人中心.html', '设置.html'];
const PAGES = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_PAGES;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = await QA.resolve();
  const out = [QA.sourceBanner(src)];

  for (const pg of PAGES) {
    const got = await QA.fetchPage(src.origin, pg);
    if (!got.ok) {
      out.push(pg + '  HTTP ' + got.status + (got.reason ? '  ' + got.reason : '') + '  <-- 该环境无此文件');
      continue;
    }
    const url = got.url;
    const html = got.html;

    const logs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => logs.push('ERR:' + (e && e.message ? e.message : e)));
    const dom = new JSDOM(html, {
      url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        QA.baseBeforeParse(src.origin)(w);
      }
    });
    const w = dom.window;
    await sleep(12000);

    const navs = w.document.querySelectorAll('.bottom-nav [class*=nav-item], .bottom-nav a, .bottom-nav div');
    let navDesc = '';
    navs.forEach((n, i) => {
      if (i > 7) return;
      const t = (n.textContent || '').replace(/\s+/g, '').slice(0, 6);
      const oc = n.getAttribute && n.getAttribute('onclick');
      const hr = n.getAttribute && n.getAttribute('href');
      navDesc += ' [' + t + (oc ? '|onclick:' + oc.slice(0, 28) : '') + (hr ? '|href:' + hr.slice(0, 20) : '') + ']';
    });

    out.push('=== ' + pg + '   (HTTP ' + got.status + ')');
    out.push('  navigateTo=' + typeof w.navigateTo + '  SubpageRouter=' + typeof w.SubpageRouter +
             '  toggleTheme=' + typeof w.toggleTheme + '  callAI=' + typeof w.callAI);
    out.push('  bottom-nav 项数=' + navs.length + navDesc);
    out.push('  buttons=' + w.document.querySelectorAll('button').length +
             '  [onclick]=' + w.document.querySelectorAll('[onclick]').length);
    out.push('  错误: ' + (logs.slice(0, 3).join(' || ') || '无'));
    dom.window.close();
  }
  fs.writeFileSync('C:\\Users\\ATM\\_multi_check_out.txt', out.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
