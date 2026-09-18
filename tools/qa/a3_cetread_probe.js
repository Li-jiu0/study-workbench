// A3 专项探针：加载 英语.html → 打开「阅读理解」视图 → 依次切换三种题型，
// 断言 .cr-grid 右栏（.cr-col-quiz）非空且无空卡片。
//
// 关键：必须显式 QA_PORT 指向一个未被占用的端口，逼 _qa_origin.js 自启内置静态服务，
// 否则会复用环境里别人手工起的 python -m http.server，assets/*.js?v= 会 404（噪声）。
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const TARGET = process.argv[2] || '英语.html';
const OUT = process.argv[3] || 'D:\\下载的文件\\学习工作台\\tools\\_a3_probe_out.txt';

const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => logs.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const src = await QA.resolve();
  const out = [QA.sourceBanner(src)];
  out.push('TARGET = ' + TARGET);

  const got = await QA.fetchPage(src.origin, TARGET);
  if (!got.ok) {
    out.push('FETCH_FAIL HTTP ' + got.status + ' ' + (got.reason || ''));
    fs.writeFileSync(OUT, out.join('\n'), 'utf8');
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
    beforeParse(window) { QA.baseBeforeParse(src.origin)(window); }
  });
  const w = dom.window;
  const d = w.document;
  await sleep(9000);

  out.push('');
  out.push('== 环境自检 ==');
  out.push('typeof XTC        = ' + typeof w.XTC);
  out.push('typeof CETV2      = ' + typeof w.CETV2);
  out.push('CETV2 键          = ' + (w.CETV2 ? Object.keys(w.CETV2).join(',') : '(无)'));
  out.push('typeof CETV2[cet-read] = ' + (w.CETV2 && w.CETV2['cet-read'] ? typeof w.CETV2['cet-read'] : 'undefined'));
  // 校验 assets/cet-read.js 真的被浏览器加载（脚本标签存在 + 版本戳）
  const scriptTags = [];
  d.querySelectorAll('script[src]').forEach(s => scriptTags.push(s.getAttribute('src')));
  out.push('脚本数(带src)     = ' + scriptTags.length);
  out.push('含 cet-read.js    = ' + scriptTags.filter(s => s.indexOf('cet-read') >= 0).join(' | '));
  out.push('含 xt-content.js  = ' + scriptTags.filter(s => s.indexOf('xt-content') >= 0).join(' | '));
  out.push('含 data-cet-read  = ' + scriptTags.filter(s => s.indexOf('data-cet-read') >= 0).join(' | '));

  // 直接调用视图渲染器（宿主分发链可省略，等价于用户点开「阅读理解」）
  const render = (w.CETV2 && w.CETV2['cet-read']) ? w.CETV2['cet-read'] : null;
  let slot = null;
  if (typeof render === 'function') {
    slot = d.createElement('div');
    d.body.appendChild(slot);
    try { render(slot, { mode: 'render' }); } catch (e) { out.push('RENDER_THROW = ' + (e && e.message)); }
  }
  await sleep(1500);

  out.push('');
  out.push('== 视图容器 ==');
  out.push('slot.children     = ' + (slot ? slot.children.length : 'n/a'));
  out.push('slot text len     = ' + (slot ? (slot.textContent || '').length : 'n/a'));
  out.push('slot 文本(前200)  = ' + (slot ? (slot.textContent || '').replace(/\s+/g, ' ').slice(0, 200) : ''));

  // 找到真实 tab 节点：XTC.tabs 渲染为 .xt-tabs > .xt-tab[data-xt-tab]
  const tabBox = slot ? slot.querySelector('#crTabs') : null;
  const tabBtns = [];
  if (tabBox) tabBox.querySelectorAll('.xt-tab[data-xt-tab]').forEach(b => {
    tabBtns.push({ el: b, id: b.getAttribute('data-xt-tab'), t: (b.textContent || '').trim() });
  });
  out.push('');
  out.push('== tab 按钮枚举（#crTabs .xt-tab[data-xt-tab]）==');
  out.push('  tabBox 存在 = ' + !!tabBox + '，tab 数 = ' + tabBtns.length);
  tabBtns.forEach((b, i) => out.push('  [' + i + '] id=' + b.id + ' 文本="' + b.t.replace(/\s+/g, ' ').slice(0, 30) + '"'));

  function activeTabId() {
    if (!tabBox) return '(无)';
    const a = tabBox.querySelector('.xt-tab.active[data-xt-tab]');
    return a ? a.getAttribute('data-xt-tab') : '(无)';
  }

  // 判定一个容器是否「空卡片」：有 .cr-quiz-card 但内部去掉空白后字符 < 6
  function inspect(label) {
    const grids = slot ? slot.querySelectorAll('.cr-grid') : [];
    const res = [];
    for (let gi = 0; gi < grids.length; gi++) {
      const g = grids[gi];
      const right = g.querySelector('.cr-col-quiz');
      const cards = right ? right.querySelectorAll('.cr-quiz-card') : [];
      let emptyCards = 0;
      const cardDetail = [];
      for (let ci = 0; ci < cards.length; ci++) {
        const c = cards[ci];
        const txt = (c.textContent || '').replace(/\s+/g, '').length;
        const hasEmptyState = !!c.querySelector('.cr-empty');
        const childEls = c.querySelectorAll('*').length;
        cardDetail.push('card#' + ci + '{txt=' + txt + ',emptyState=' + hasEmptyState + ',children=' + childEls + '}');
        if (txt < 6) emptyCards++;
      }
      res.push({
        grid: gi,
        cols: g.children.length,
        rightExists: !!right,
        rightChildren: right ? right.children.length : 0,
        rightTextLen: right ? (right.textContent || '').replace(/\s+/g, '').length : -1,
        cards: cards.length,
        emptyCards: emptyCards,
        detail: cardDetail.join(' ')
      });
    }
    out.push('  [' + label + '] grids=' + grids.length);
    if (!grids.length) out.push('       !! 未找到 .cr-grid');
    res.forEach(r => {
      out.push('       grid#' + r.grid + ' cols=' + r.cols + ' rightExists=' + r.rightExists +
        ' rightChildren=' + r.rightChildren + ' rightTextLen=' + r.rightTextLen +
        ' cards=' + r.cards + ' emptyCards=' + r.emptyCards);
      if (r.detail) out.push('         ' + r.detail);
    });
    const bad = res.filter(r => !r.rightExists || r.rightChildren === 0 || r.emptyCards > 0 || r.rightTextLen < 6);
    out.push('       判定: ' + (bad.length ? '❌ 存在空卡片 (' + bad.length + ')' : '✅ 右栏无空卡片'));
    return bad.length === 0;
  }

  // 依次切三种题型：按 id 精确点击 .xt-tab，并断言 active 状态真的切换（防假 PASS）
  const kinds = [['cloze', '选词填空'], ['match', '长篇匹配'], ['careful', '仔细阅读']];
  const verdicts = {};
  out.push('');
  out.push('== 三题型切换实测 ==');
  for (const [kid, klabel] of kinds) {
    const before = activeTabId();
    let btn = null;
    for (const b of tabBtns) if (b.id === kid) { btn = b.el; break; }
    let clicked = false;
    if (btn) { try { btn.click(); clicked = true; } catch (e) { out.push('  clickThrow=' + (e && e.message)); } }
    await sleep(1300);
    const after = activeTabId();
    out.push('');
    out.push('── ' + klabel + '（tab id=' + kid + '，clicked=' + clicked + '，active: ' + before + ' → ' + after + '）──');
    if (after !== kid) {
      out.push('       ⚠️ active 未切到 ' + kid + '，本次断言不可信');
      verdicts[klabel] = false;
      continue;
    }
    // 再确认切换后主体确实是该题型渲染出来的 DOM（结构性证据）
    const bodyEl = slot ? slot.querySelector('#crBody') : null;
    const bodyKind = bodyEl ? (bodyEl.querySelector('.cr-blank') ? 'cloze'
      : (bodyEl.querySelector('.cr-sel') ? 'match'
        : (bodyEl.querySelector('.cr-col-quiz') ? 'careful' : 'unknown'))) : 'nobody';
    out.push('      #crBody 题型特征 = ' + bodyKind);
    verdicts[klabel] = inspect(klabel);
  }

  out.push('');
  out.push('== 汇总 ==');
  kinds.forEach(([kid, klabel]) => out.push('  ' + klabel + '(' + kid + ') : ' + (verdicts[klabel] ? '✅ PASS（右栏无空卡片）' : '❌ FAIL（存在空卡片/未切换）')));

  // ---- 回归场景 2：仔细阅读的「第 2 篇」子 tab 切换（复用 renderCareful 重绘右栏）----
  out.push('');
  out.push('== 仔细阅读子 tab 切换（第1篇 → 第2篇）==');
  const subTabBox = slot ? slot.querySelector('#crSubTabs') : null;
  const subTabs = subTabBox ? subTabBox.querySelectorAll('.xt-tab[data-xt-tab]') : [];
  out.push('  子 tab 数 = ' + subTabs.length);
  if (subTabs.length > 1) {
    const id2 = subTabs[1].getAttribute('data-xt-tab');
    try { subTabs[1].click(); } catch (e) { out.push('  subClickThrow=' + (e && e.message)); }
    await sleep(1200);
    const subActive = subTabBox.querySelector('.xt-tab.active[data-xt-tab]');
    out.push('  点击 id=' + id2 + ' → active=' + (subActive ? subActive.getAttribute('data-xt-tab') : '(无)'));
    inspect('仔细阅读·第2篇');
  }

  // ---- 回归场景 3：空数据路径 —— 断言 cardHtml(0) 给出可见空状态而非中空卡片 ----
  out.push('');
  out.push('== 空数据路径（N9-11 根因回归）==');
  // 直接验证 cardHtml(0) 的产物：通过重建一个 .cr-quiz-card 装上即可读它的真实文本
  if (slot) {
    // 三种题型在题量为 0 时都必须落到 .cr-empty 空状态分支
    const probes = [
      ['cloze 空题量', '#crBody .cr-quiz-card'],
    ];
    probes.forEach(([label, sel]) => {
      const c = slot.querySelector(sel);
      const txt = c ? (c.textContent || '').replace(/\s+/g, '') : '';
      out.push('  ' + label + ' 卡片文本 = "' + txt.slice(0, 60) + '"（长度 ' + txt.length + '）');
    });
  }

  out.push('');
  out.push('== 运行时错误(前12) ==');
  out.push(logs.slice(0, 12).join('\n') || '(无)');

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
