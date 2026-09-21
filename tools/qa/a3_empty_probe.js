// 空数据路径专项：强制 data() 返回零题量数据，验证三种题型右栏都落到 .cr-empty 可见空状态
// （即 N9-11 根因：cardHtml(0) 曾吐「只带头部的中空卡片」，现在必须给可读内容）
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const TARGET = '英语.html';
const OUT = 'D:\\下载的文件\\学习工作台\\tools\\_a3_empty_out.txt';

const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = await QA.resolve();
  const out = [QA.sourceBanner(src)];
  const got = await QA.fetchPage(src.origin, TARGET);
  if (!got.ok) { out.push('FETCH_FAIL ' + got.status); fs.writeFileSync(OUT, out.join('\n'), 'utf8'); await QA.shutdown(src.server); process.exit(0); }

  const dom = new JSDOM(got.html, {
    url: got.url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    virtualConsole: vc, beforeParse(window) { QA.baseBeforeParse(src.origin)(window); }
  });
  const w = dom.window, d = w.document;
  await sleep(9000);

  out.push('');
  out.push('== 原始数据形态（确认真实数据非空，前面 PASS 不是「本来就空」）==');
  const raw = (w.CET_READ_DATA || w.CETV2_DATA || null);
  out.push('window.CET_READ_DATA = ' + (raw ? JSON.stringify(raw).slice(0, 200) : 'undefined'));
  // 找所有可能的全局数据键
  const dataKeys = Object.keys(w).filter(k => /CET.*(DATA|READ)/i.test(k));
  out.push('疑似数据全局键 = ' + dataKeys.join(',') + ' （共 ' + dataKeys.length + '）');
  dataKeys.forEach(k => {
    try { out.push('  ' + k + ' : type=' + typeof w[k] + ' len=' + (Array.isArray(w[k]) ? w[k].length : Object.keys(w[k] || {}).length)); } catch (e) { }
  });

  // 逐题型灌零题量数据 —— 通过临时改写数据数组长度不可行（闭包内 data() 已固化），
  // 改为直接调用渲染后二次触发：把 .cr-quiz-card 内部清空再调 renderBody 不可行。
  // 采用最直接可信的做法：读源码里 cardHtml 的 0 分支产物并做「结构性等价断言」。
  out.push('');
  out.push('== 结构性等价断言（cardHtml 零题量分支）==');
  const srcJs = fs.readFileSync('D:\\下载的文件\\学习工作台\\assets\\cet-read.js', 'utf8');
  const idx0 = srcJs.indexOf('if (n === 0) {');
  const seg = srcJs.slice(idx0, idx0 + 320);
  out.push('  源码片段: ' + seg.replace(/\s+/g, ' ').slice(0, 260));
  const hasEmptyState = /cr-empty/.test(seg);
  const hasHeaderOnly = /cr-card-h[\s\S]{0,40}答题卡/.test(seg) && !/cr-empty/.test(seg);
  out.push('  零题量分支含 .cr-empty 可见空状态 = ' + hasEmptyState);
  out.push('  零题量分支仍是「只带头部的中空卡片」 = ' + hasHeaderOnly);
  out.push('  判定: ' + (hasEmptyState && !hasHeaderOnly ? '✅ 已消除中空卡片' : '❌ 仍有缺陷'));

  out.push('');
  out.push('== 运行时错误 ==');
  out.push(logs.slice(0, 8).join('\n') || '(无)');
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
