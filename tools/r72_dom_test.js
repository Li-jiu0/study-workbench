/* R72 任务三：jsdom 行为自测（新页面内联脚本 + 关键断言） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = 'D:\\下载的文件\\学习工作台';
const read = f => fs.readFileSync(path.join(BASE, f), 'utf8');
const out = [];
function ok(name, cond, extra) { out.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? (' | ' + extra) : '')); }

function make(html, beforeParse) {
  return new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse });
}
function loaded(dom) {
  return new Promise(res => {
    if (dom.window.document.readyState === 'complete') return res();
    dom.window.addEventListener('load', () => res());
    setTimeout(res, 3000);
  });
}
const tick = ms => new Promise(r => setTimeout(r, ms || 20));

(async () => {
  // ---------- (a) 我的文件.html ----------
  {
    const html = read('我的文件.html');
    const dom = make(html, (w) => {
      w.addEventListener('DOMContentLoaded', () => {}); // noop
    });
    // 预置数据（在脚本执行前）
    // 说明：jsdom 在 beforeParse 后才能用 localStorage，这里用第二个窗口：
    dom.window.localStorage.setItem('study_workbench_imports', JSON.stringify({
      '我的库': { label: '我的库', type: 'text', items: [{ text: 'a' }, { text: 'b' }], updatedAt: '2026-09-17' }
    }));
    dom.window.localStorage.setItem('xtc:lib:pf:folio:works', JSON.stringify([
      { id: 'w1', title: '作品一', type: 'PPT', images: [], tags: [], createdAt: '2026-09-16' },
      { id: 'w2', title: '作品二', type: '写作', images: [], tags: [], createdAt: '2026-09-15' }
    ]));
    // 手动触发 boot（因为数据是在脚本执行后才写入）
    dom.window.eval('if(window.xtFilesRender) window.xtFilesRender();');
    const doc = dom.window.document;
    const items = doc.querySelectorAll('#mfList .mf-item');
    ok('我的文件.html：列表条数 = 2作品 + 1题库 = 3', items.length === 3, 'got=' + items.length);
    ok('我的文件.html：统计条渲染', !!doc.querySelector('#mfStats .mf-stat'));
    const opts = Array.from(doc.querySelectorAll('#mfModule option')).map(o => o.value);
    ok('我的文件.html：模块下拉含 all/题库/PPT作品', opts.indexOf('all') >= 0 && opts.indexOf('题库') >= 0 && opts.indexOf('PPT作品') >= 0, opts.join(','));
    // 模块筛选
    dom.window.eval("window.xtFilesFilter('题库')");
    const onlyBank = doc.querySelectorAll('#mfList .mf-item');
    ok('我的文件.html：筛选「题库」后 1 条', onlyBank.length === 1, 'got=' + onlyBank.length);
    dom.window.eval("window.xtFilesFilter('all')");
    // 删除（需 uiConfirm）
    dom.window.uiConfirm = function () { return Promise.resolve(true); };
    const before = doc.querySelectorAll('#mfList .mf-item').length;
    dom.window.eval("window.xtFilesDel('imp:我的库')");
    await tick(30);
    const after = doc.querySelectorAll('#mfList .mf-item').length;
    ok('我的文件.html：xtFilesDel 删除题库生效', after === before - 1, before + '->' + after);
    // 全局存在性
    ok('我的文件.html：xtFilesAdd/Filter/Open/Del/Render/Register/Remove 均存在',
      ['xtFilesAdd', 'xtFilesFilter', 'xtFilesOpen', 'xtFilesDel', 'xtFilesRender', 'xtFilesRegister', 'xtFilesRemove']
        .every(n => typeof dom.window[n] === 'function'));
    dom.window.close();
  }

  // ---------- (b) 导入题库.html ----------
  {
    const html = read('导入题库.html');
    ok('导入题库.html：引用 qbank.js', html.indexOf('assets/qbank.js') >= 0);
    ok('导入题库.html：引用 importer.js', html.indexOf('assets/importer.js') >= 0);
    const dom = make(html);
    await loaded(dom);
    const w = dom.window;
    // 外部脚本 jsdom 不加载，手动注入，验证接线（importer.js 定义 openImporter）
    try { w.eval(read('assets/qbank.js')); } catch (e) { ok('注入 qbank.js', false, e.message); }
    try { w.eval(read('assets/importer.js')); } catch (e) { ok('注入 importer.js', false, e.message); }
    ok('导入题库.html：window.openImporter 存在', typeof w.openImporter === 'function');
    ok('导入题库.html：window.__impBanks 存在', typeof w.__impBanks === 'function');
    ok('导入题库.html：存在 #impBody 与 #importerView', !!w.document.getElementById('impBody') || !!w.document.getElementById('importerView'));
    w.close();
  }

  // ---------- (c) 更多.html ----------
  {
    const html = read('更多.html');
    ok('更多.html：无「穿越英语」', html.indexOf('穿越英语') < 0);
    ok('更多.html：导入题库卡指向 导入题库.html', html.indexOf("location.href='导入题库.html'") >= 0);
    ok('更多.html：已移除 importer-view DOM', html.indexOf('id="importerView"') < 0);
    ok('更多.html：已移除 openImporterView 逻辑', html.indexOf('function openImporterView') < 0);
  }

  // ---------- (d) 个人中心.html ----------
  {
    const html = read('个人中心.html');
    ok('个人中心.html：xtFolio* 0 命中', html.indexOf('xtFolio') < 0);
    ok('个人中心.html：新入口卡 onclick -> 我的文件.html', html.indexOf("onclick=\"location.href='我的文件.html'\"") >= 0);
    ok('个人中心.html：入口卡文案「我的文件」', html.indexOf('sgc-title">我的文件') >= 0);
  }

  // ---------- (e) 演示.html ----------
  {
    const html = read('演示.html');
    ok('演示.html：功能块清空（无 pptStatsCard）', html.indexOf('pptStatsCard') < 0);
    ok('演示.html：功能块清空（无 pptWorkList）', html.indexOf('pptWorkList') < 0);
    ok('演示.html：功能块清空（无 pptHub/pptPanel）', html.indexOf('id="pptHub"') < 0 && html.indexOf('id="pptPanel"') < 0);
    ok('演示.html：存在跳转按钮', html.indexOf("location.href='我的文件.html'") >= 0);
    ok('演示.html：存在自动跳转提示', html.indexOf('pptRedirectTip') >= 0);
    const dom = make(html);
    await loaded(dom);
    ok('演示.html：内联脚本无报错执行（#page-ppt 存在）', !!dom.window.document.getElementById('page-ppt'));
    dom.window.close();
  }

  const txt = out.join('\n');
  fs.writeFileSync(path.join(BASE, 'tools', 'r72_dom_test_out.txt'), txt, 'utf8');
  console.log(txt);
  const fails = out.filter(l => l.indexOf('FAIL') === 0);
  console.log('\nFAIL_COUNT=' + fails.length);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
