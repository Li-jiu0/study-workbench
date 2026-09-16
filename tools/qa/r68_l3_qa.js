// R68 线3 jsdom 行为断言：更多.html 删除「我的导入题库」死区块后零 console 错误、入口零回归
// 只读测试：绝不修改被测文件。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));

const BASE = 'D:/下载的文件/学习工作台';
const out = [];
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; out.push('[PASS] ' + name + (info ? '  ' + info : '')); }
  else { fail++; out.push('[FAIL] ' + name + (info ? '  ' + info : '')); }
}

(function () {
  const htmlNew = fs.readFileSync(path.join(BASE, '更多.html'), 'utf8');
  const htmlOld = fs.readFileSync(path.join(BASE, '更多.html.bak-pre-r68-20260916'), 'utf8');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { errors.push('jsdomError: ' + (e && e.message)); });
  vc.on('error', function () { errors.push('console.error: ' + Array.from(arguments).join(' ')); });

  const dom = new JSDOM(htmlNew, {
    url: 'http://localhost/%E6%9B%B4%E5%A4%9A.html',
    runScripts: 'dangerously',   // 内联脚本真实执行；外部 defer 脚本不加载（无 resources），避免环境噪音
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  const doc = win.document;

  // 1. 加载后 console 无错误
  ok('加载: console 无错误', errors.length === 0, errors.join(' | '));

  // 2. 死区块文案/节点彻底消失
  const bodyText = doc.body.textContent;
  ok('文案: 不含「导入向导尚未就绪」', bodyText.indexOf('导入向导尚未就绪') === -1);
  ok('文案: 不含「我的导入题库」', bodyText.indexOf('我的导入题库') === -1);
  ok('DOM: #impLibs 已删除', doc.getElementById('impLibs') === null);
  ok('DOM: 无任何 .imp-libs 节点', doc.querySelectorAll('.imp-libs').length === 0);

  // 3. 入口卡数量与改前一致（对照备份）
  const cardsNew = doc.querySelectorAll('.morepage-card').length;
  const domOld = new JSDOM(htmlOld, { url: 'http://localhost/x.html' });
  const cardsOld = domOld.window.document.querySelectorAll('.morepage-card').length;
  ok('入口: morepage-card 数量与备份一致', cardsNew === cardsOld, 'new=' + cardsNew + ' old=' + cardsOld);
  ok('入口: 「导入题库」入口卡仍在且挂 openImporterView', (function () {
    const cards = Array.from(doc.querySelectorAll('.morepage-card'));
    return cards.some(function (c) {
      return c.getAttribute('onclick') === 'openImporterView()' &&
             c.textContent.indexOf('导入题库') !== -1;
    });
  })());

  // 4. 保留结构
  ok('结构: #importerView 全屏视图仍在', !!doc.getElementById('importerView'));
  ok('结构: #impBody 向导宿主仍在', !!doc.getElementById('impBody'));
  ok('结构: 底部导航 5 项', doc.querySelectorAll('.bottom-nav-item').length === 5);
  ok('结构: AI 悬浮窗 #aiFab 仍在', !!doc.getElementById('aiFab'));
  ok('结构: 倒计时弹窗 #countdownModal 仍在', !!doc.getElementById('countdownModal'));
  ok('结构: 更多面板 #morePanel / 工具面板 #toolsPanel 仍在',
     !!doc.getElementById('morePanel') && !!doc.getElementById('toolsPanel'));

  // 5. 全局函数挂卸
  ok('函数: openImporterView 仍为函数', typeof win.openImporterView === 'function');
  ok('函数: closeImporterView 仍为函数', typeof win.closeImporterView === 'function');
  ok('函数: renderImportLibs 已卸载', typeof win.renderImportLibs === 'undefined');
  ok('函数: removeImportLib 已卸载', typeof win.removeImportLib === 'undefined');
  ok('函数: __impAfterImport 已卸载', typeof win.__impAfterImport === 'undefined');

  // 6. openImporterView 行为：openImporter 缺失时走回退不抛异常（jsdom 导航告警不计入加载错误）
  const errBeforeFallback = errors.length;
  let threw = false;
  try { win.openImporterView(); } catch (e) { threw = true; }
  ok('行为: openImporter 缺失时回退调用无异常抛出', !threw);

  // 7. openImporterView 行为：桩 openImporter 后视图正常开/关
  win.openImporter = function () {};
  threw = false;
  try {
    win.openImporterView();
    ok('行为: 视图打开加 .open', doc.getElementById('importerView').className.indexOf('open') !== -1);
    ok('行为: #impBody 仍在视图内', !!doc.querySelector('#importerView #impBody'));
    win.closeImporterView();
    ok('行为: 视图关闭移除 .open', doc.getElementById('importerView').className.indexOf('open') === -1);
  } catch (e) { threw = true; }
  ok('行为: 开/关视图全程无异常', !threw);

  // 8. 排除回退导致的 jsdom 导航告警后，其余错误仍为 0
  const navNoise = errors.slice(errBeforeFallback).filter(function (m) {
    return m.indexOf('Not implemented: navigation') !== -1;
  });
  const realErrors = errors.filter(function (m) {
    return m.indexOf('Not implemented: navigation') === -1;
  });
  ok('console: 除回退导航告警外无任何错误', realErrors.length === 0,
     'navNoise=' + navNoise.length + ' real=' + realErrors.join(' | '));

  out.push('');
  out.push('===== R68 线3 jsdom 行为断言汇总: PASS=' + pass + ' FAIL=' + fail + ' =====');
  fs.writeFileSync(path.join(BASE, 'tools/qa/r68_l3_qa_result.txt'), out.join('\n') + '\n', 'utf8');
  console.log(out.join('\n'));
  process.exit(fail === 0 ? 0 : 1);
})();

process.on('uncaughtException', function (e) {
  out.push('[ERROR] ' + (e && e.stack ? e.stack : e));
  fs.writeFileSync(path.join(BASE, 'tools/qa/r68_l3_qa_result.txt'), out.join('\n') + '\n', 'utf8');
  console.log(out.join('\n'));
  process.exit(2);
});
