/* B2 版式库专项体检：卡片渲染 / 占位图 / 分类切换 / 搜索 / 预览遮罩三种关闭 / 收藏 / 无 404
   用法：QA_PORT=8915 node tools/qa/b2_pptlib_probe.js
   输出：C:\Users\ATM\_b2_probe_out.txt */
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const TARGET = 'PPT版式库.html';
const out = [];
const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));

/* 记录所有 404 / 加载失败（jsdom resources:'usable' 会走它自己的资源加载器） */
const badReqs = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const src = await QA.resolve();
  out.push(QA.sourceBanner(src));

  const got = await QA.fetchPage(src.origin, TARGET);
  if (!got.ok) {
    out.push('FETCH_FAIL HTTP ' + got.status);
    fs.writeFileSync('C:\\Users\\ATM\\_b2_probe_out.txt', out.join('\n'), 'utf8');
    console.log('DONE');
    await QA.shutdown(src.server);
    process.exit(0);
  }

  const dom = new JSDOM(got.html, {
    url: got.url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      QA.baseBeforeParse(src.origin)(window);
      /* 拦截资源加载失败：jsdom 的 ResourceLoader 不回调错误，这里包一层 fetch 监控 */
      const origFetch = window.fetch;
      window.fetch = function (u, o) {
        return origFetch.apply(this, arguments).then(function (r) {
          if (r && r.status === 404) badReqs.push(String(u));
          return r;
        });
      };
    }
  });
  const w = dom.window;
  const d = w.document;
  await sleep(9000);

  out.push('URL = ' + got.url);
  out.push('typeof XtPptLib = ' + typeof w.XtPptLib);
  out.push('typeof MINI_BANK = ' + typeof w.MINI_BANK);
  if (w.MINI_BANK) out.push('ppt-layout-lib items = ' + (w.MINI_BANK['ppt-layout-lib'] ? w.MINI_BANK['ppt-layout-lib'].items.length : 'N/A'));
  out.push('');

  /* 1) 挂载与卡片渲染 */
  const host = d.getElementById('pptLibMount');
  out.push('== 1. 挂载点 ==');
  out.push('  #pptLibMount 存在 = ' + !!host);
  out.push('  .xtpl-wrap = ' + d.querySelectorAll('.xtpl-wrap').length);
  out.push('  .xtpl-card 数量 = ' + d.querySelectorAll('.xtpl-card').length);
  out.push('  .xtpl-ph-svg(占位骨架) 数量 = ' + d.querySelectorAll('.xtpl-ph-svg').length);
  out.push('  .xtpl-pv-img(真图,应为0) 数量 = ' + d.querySelectorAll('.xtpl-pv-img').length);
  out.push('  .xtpl-pv(预览图容器) 数量 = ' + d.querySelectorAll('.xtpl-pv').length);
  out.push('  分类页签 = ' + Array.prototype.map.call(d.querySelectorAll('.xtpl-chip'), e => e.textContent).join(' | '));
  out.push('  搜索框存在 = ' + (!!d.querySelector('.xtpl-search-input')));
  out.push('');

  /* 2) 空卡片检测 */
  const cards = d.querySelectorAll('.xtpl-card');
  let emptyCards = 0, noSvg = 0, noName = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const name = c.querySelector('.xtpl-name');
    const uc = c.querySelector('.xtpl-usecase');
    const svg = c.querySelector('.xtpl-ph-svg');
    if (!name || !name.textContent.trim()) noName++;
    if (!svg) noSvg++;
    if ((!uc || !uc.textContent.trim()) && (!name || !name.textContent.trim()) && !svg) emptyCards++;
  }
  out.push('== 2. 空卡片检测 ==');
  out.push('  无名称卡片 = ' + noName);
  out.push('  无占位图卡片 = ' + noSvg);
  out.push('  完全空卡片 = ' + emptyCards);
  out.push('  首卡名称 = ' + (cards[0] && cards[0].querySelector('.xtpl-name') ? cards[0].querySelector('.xtpl-name').textContent : 'N/A'));
  out.push('  首卡适用场景 = ' + (cards[0] && cards[0].querySelector('.xtpl-usecase') ? cards[0].querySelector('.xtpl-usecase').textContent.slice(0, 40) : 'N/A'));
  out.push('');

  /* 每次点击分类：必须重新 querySelector（renders 会重建页签 DOM） */
  const clickChip = async (val) => {
    const c = d.querySelector('.xtpl-chip[data-val="' + val + '"]');
    if (c) { c.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(40); }
    return !!c;
  };

  /* 3) 分类切换 */
  out.push('== 3. 分类切换 ==');
  const catVals = ['全部', '封面页', '目录页', '过渡页', '内容页', '⭐ 我的收藏'];
  for (let i = 0; i < catVals.length; i++) {
    const ok = await clickChip(catVals[i]);
    const n = d.querySelectorAll('.xtpl-card').length;
    const empty = d.querySelector('.xtpl-empty');
    out.push('    ' + catVals[i] + ' → 卡片 ' + n + (empty ? ' (空状态: ' + empty.querySelector('.xtpl-empty-t').textContent + ')' : '') + (ok ? '' : ' [页签未找到]'));
  }
  await clickChip('全部');
  out.push('    回到「全部」→ 卡片 ' + d.querySelectorAll('.xtpl-card').length);
  out.push('');

  /* 4) 我的收藏空状态 */
  out.push('== 4. 我的收藏空状态 ==');
  await clickChip('⭐ 我的收藏');
  {
    const es = d.querySelector('.xtpl-empty');
    out.push('  空状态存在 = ' + !!es + ' | 文案 = ' + (es ? es.querySelector('.xtpl-empty-t').textContent : 'N/A'));
    out.push('  "查看全部版式"按钮 = ' + !!(es && es.querySelector('[data-act="gotoall"]')));
    const ga = es && es.querySelector('[data-act="gotoall"]');
    if (ga) {
      ga.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await sleep(40);
      out.push('  点"查看全部版式" → 卡片 ' + d.querySelectorAll('.xtpl-card').length + ' 当前选中=' + (d.querySelector('.xtpl-chip.on') ? d.querySelector('.xtpl-chip.on').textContent : 'N/A'));
    }
  }
  out.push('');

  /* 5) 搜索过滤 */
  out.push('== 5. 搜索过滤 ==');
  await clickChip('全部');
  const si = d.querySelector('.xtpl-search-input');
  const setKw = async (v) => { si.value = v; si.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(40); };
  if (si) {
    await setKw('商务');
    out.push('  搜「商务」→ 卡片 ' + d.querySelectorAll('.xtpl-card').length + ' 首项=' + (d.querySelector('.xtpl-name') ? d.querySelector('.xtpl-name').textContent : '-'));
    await setKw('时间轴');
    out.push('  搜「时间轴」→ 卡片 ' + d.querySelectorAll('.xtpl-card').length + ' 首项=' + (d.querySelector('.xtpl-name') ? d.querySelector('.xtpl-name').textContent : '-'));
    await setKw('zzz不存在zzz');
    const es2 = d.querySelector('.xtpl-empty');
    out.push('  搜乱码 → 卡片 ' + d.querySelectorAll('.xtpl-card').length + ' 空状态=' + !!es2 + ' 文案=' + (es2 ? es2.querySelector('.xtpl-empty-t').textContent : 'N/A'));
    await setKw('');
    out.push('  清空 → 卡片 ' + d.querySelectorAll('.xtpl-card').length);
    /* 搜索 + 分类同时生效：选「封面页」搜「极简」 */
    await setKw('极简');
    await clickChip('封面页');
    out.push('  封面页 + 搜「极简」→ 卡片 ' + d.querySelectorAll('.xtpl-card').length + ' 首项=' + (d.querySelector('.xtpl-name') ? d.querySelector('.xtpl-name').textContent : '-'));
    await setKw('');
    await clickChip('全部');
  }
  out.push('');

  /* 6) 预览遮罩层 + 三种关闭 */
  out.push('== 6. 预览遮罩层 ==');
  const pvBtn = d.querySelector('.xtpl-card [data-act="preview"]');
  if (pvBtn) {
    pvBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    const modal = d.getElementById('xtPptLibModal');
    out.push('  遮罩层存在 = ' + !!modal);
    out.push('  展开(含 show) = ' + !!(modal && modal.className.indexOf('show') !== -1));
    out.push('  标题 = ' + (modal ? modal.querySelector('.xtpl-modal-title').textContent : 'N/A'));
    out.push('  大图占位 = ' + !!(modal && modal.querySelector('.xtpl-modal-media .xtpl-ph-svg')));
    out.push('  适用场景 = ' + (modal ? modal.querySelector('.xtpl-side-uc').textContent.slice(0, 30) : 'N/A'));
    out.push('  设计要点条数 = ' + (modal ? modal.querySelectorAll('.xtpl-side-pt').length : 0));
    /* 关闭1：✕ */
    const x = modal.querySelector('.xtpl-modal-x');
    x.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    out.push('  [关闭1] 点✕ → 收起 = ' + (modal.className.indexOf('show') === -1));
    /* 关闭2：ESC */
    pvBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    const open2 = modal.className.indexOf('show') !== -1;
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(30);
    out.push('  [关闭2] 重开=' + open2 + ' 按ESC → 收起 = ' + (modal.className.indexOf('show') === -1));
    /* 关闭3：点遮罩空白 */
    pvBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    const open3 = modal.className.indexOf('show') !== -1;
    const mask = modal.querySelector('.xtpl-modal-mask');
    mask.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    out.push('  [关闭3] 重开=' + open3 + ' 点遮罩空白 → 收起 = ' + (modal.className.indexOf('show') === -1));
    /* 反向：点白色内容面板不应关闭 */
    pvBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    const box = modal.querySelector('.xtpl-modal-box');
    box.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    out.push('  [反向] 点白色面板 → 仍展开 = ' + (modal.className.indexOf('show') !== -1));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(20);
  }
  out.push('');

  /* 7) 收藏切换 + localStorage 键 */
  out.push('== 7. 收藏 ==');
  await clickChip('全部');
  const favBtn = d.querySelector('.xtpl-card [data-act="fav"]');
  if (favBtn) {
    favBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(40);
    out.push('  点击后 on 类 = ' + (favBtn.className.indexOf('on') !== -1));
    out.push('  localStorage[ppt_favorites] = ' + w.localStorage.getItem('ppt_favorites'));
    /* 切到我的收藏应出现该卡 */
    await clickChip('⭐ 我的收藏');
    out.push('  我的收藏内卡片 = ' + d.querySelectorAll('.xtpl-card').length);
    /* 取消收藏 → 立即消失 */
    const favBtn2 = d.querySelector('.xtpl-card [data-act="fav"]');
    if (favBtn2) {
      favBtn2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await sleep(40);
      out.push('  取消后卡片 = ' + d.querySelectorAll('.xtpl-card').length + ' (应为0)');
      out.push('  localStorage = ' + w.localStorage.getItem('ppt_favorites'));
    }
  }
  out.push('');

  /* 8) 下载按钮状态 */
  out.push('== 8. 下载按钮 ==');
  await clickChip('全部');
  const dlDis = d.querySelectorAll('.xtpl-card .xtpl-btn-dis');
  out.push('  置灰「制作中」按钮数 = ' + dlDis.length + ' / 卡片数 ' + d.querySelectorAll('.xtpl-card').length);
  out.push('  首个置灰文案 = ' + (dlDis[0] ? dlDis[0].textContent : 'N/A') + ' | disabled=' + (dlDis[0] ? dlDis[0].hasAttribute('disabled') : 'N/A'));
  out.push('');

  /* 9) 无 alert/confirm/prompt：验证函数未被覆盖为可弹窗（仅静态声明） */
  out.push('== 9. 404 资源请求 ==');
  out.push('  fetch 404 数 = ' + badReqs.length + (badReqs.length ? ' → ' + badReqs.join(', ') : ''));
  out.push('');

  out.push('== 运行时错误(前12) ==');
  out.push(logs.slice(0, 12).join('\n') || '(无)');

  fs.writeFileSync('C:\\Users\\ATM\\_b2_probe_out.txt', out.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
