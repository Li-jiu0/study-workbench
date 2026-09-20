// 通用页面体检：加载真实页面，抓运行时错误 + 关键元素是否渲染
//
// 【2026-09-16 P1 修复】原先 ORIGIN 写死线上 110.42.134.62，而线上是上一版（旧代码），
//   本地改完没部署时跑本脚本验的是旧版 —— "自检通过"不可信（实测线上 /社区.html=404）。
//   现在默认走【本地静态服务】（本脚本会自动起，详见 tools/qa/_qa_origin.js）；
//   要验线上请显式：QA_ORIGIN=http://110.42.134.62 node tools/qa/page_check.js <页面>
//   手工起服务：python -m http.server 8899 --directory "D:\下载的文件\学习工作台"
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const TARGET = process.argv[2] || '学习工作台.html';
const KEYS = (process.argv[3] || '留言板,更多功能,今日任务,最近学习').split(',');

// 【2026-09-16 P1 修复 · 并行竞态】原先输出路径硬编码为共享文件 C:\Users\ATM\_page_check_out.txt，
//   多条线并行跑时互相覆盖（B1/B3/B4/B5 四条线实测均被覆盖，读回是别人的结果）→ 结果不可信。
//   现支持 QA_OUT 环境变量指定输出路径；未指定时回退旧路径（保持向后兼容）。
//   并行用法：QA_PORT=8912 QA_OUT="D:\...\_my_out.txt" node tools/qa/page_check.js <页面> <关键词>
const OUT_PATH = process.env.QA_OUT || 'C:\\Users\\ATM\\_page_check_out.txt';

const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));

(async () => {
  const src = await QA.resolve();
  const out = [QA.sourceBanner(src)];

  const got = await QA.fetchPage(src.origin, TARGET);
  if (!got.ok) {
    out.push('FETCH_FAIL  ' + TARGET + '  HTTP ' + got.status + (got.reason ? '  ' + got.reason : ''));
    out.push('（若这是"线上 404"：说明目标文件还没部署到该环境，属预期）');
    fs.writeFileSync(OUT_PATH, out.join('\n'), 'utf8');
    console.log('QA_OUT=' + OUT_PATH);
    console.log('DONE');
    await QA.shutdown(src.server);
    process.exit(0);
  }
  const html = got.html;
  const url = got.url;

  const dom = new JSDOM(html, {
    url: url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      QA.baseBeforeParse(src.origin)(window);
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 11000));

  out.push('URL = ' + url);
  out.push('html bytes = ' + html.length);
  out.push('typeof callAI = ' + typeof w.callAI);
  out.push('typeof AIConfig = ' + typeof w.AIConfig);
  out.push('typeof AI_CONFIG = ' + typeof w.AI_CONFIG);
  out.push('body text len = ' + (w.document.body.textContent || '').length);
  out.push('');
  out.push('== 关键内容是否出现在渲染结果 ==');
  for (const k of KEYS) {
    const inHtml = html.indexOf(k) >= 0;
    const inLive = (w.document.body.textContent || '').indexOf(k) >= 0;
    out.push('  ' + k + ' : 静态HTML=' + inHtml + ' 运行时DOM=' + inLive);
  }
  out.push('');
  out.push('== 卡片/区块统计 ==');
  out.push('  .card 数量 = ' + w.document.querySelectorAll('.card').length);
  out.push('  [class*=card] 数量 = ' + w.document.querySelectorAll('[class*=card]').length);
  out.push('  [class*=msg] 数量 = ' + w.document.querySelectorAll('[class*=msg]').length);
  out.push('  button 数量 = ' + w.document.querySelectorAll('button').length);
  out.push('');
  out.push('== 运行时错误(前12) ==');
  out.push(logs.slice(0, 12).join('\n') || '(无)');
  out.push('');
  out.push('== 页面文本尾部(600) ==');
  out.push(((w.document.body.textContent) || '').replace(/\s+/g, ' ').slice(-600));

  fs.writeFileSync(OUT_PATH, out.join('\n'), 'utf8');
  console.log('QA_OUT=' + OUT_PATH);
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
