/**
 * tools/qa/ed_t01_privacy_0911.js —— T01 自测（寇豆码，2026-09-11）
 * 运行：node tools/qa/ed_t01_privacy_0911.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 *
 * 覆盖：
 *   A1 首页 #moreToolsCard 并入轮播成第 6 张卡 / 6 个圆点 / scrollToCard(5) 高亮 / moreToolsGrid 4 卡仍在
 *   C4 设置页隐私与安全卡 DOM / 黑名单空态渲染（mock fetch 返回空）
 *   通用：零未捕获异常 + showToast 可用
 *
 * 已知 jsdom 局限（不判失败，已在 harness 内 shim）：
 *   - jsdom 未实现 Element.prototype.scrollTo（真实浏览器无此问题）→ beforeParse 注入空实现。
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM, VirtualConsole } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; FAILS.push(label + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : '')); }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

process.on('unhandledRejection', function (e) {
  console.log('  [后台异步] 未处理 rejection: ' + (e && e.message));
});

const QA_PORT = 8137;
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.writeHead(200, { 'content-type': ct }); res.end(buf);
  });
});
let serverReady = null;
function ensureServer() {
  if (!serverReady) serverReady = new Promise(res => qaServer.listen(QA_PORT, '127.0.0.1', res));
  return serverReady;
}

// 真渲染模式：本地 HTTP 服务 + runScripts:'dangerously' + resources:'usable'
async function loadReal(page, fetchImpl) {
  await ensureServer();
  const vcErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => vcErrors.push(String((e && e.message) || e)));
  let wRef = null;
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + QA_PORT + '/' + page,
    virtualConsole: vc,
    beforeParse(w) {
      wRef = w;
      // 未捕获异常监听
      w.__uncaught = [];
      w.addEventListener('error', e => w.__uncaught.push('[error] ' + (e && (e.message || e.type))));
      // jsdom 局限 shim：Element.prototype.scrollTo 缺省
      if (w.Element && w.Element.prototype && typeof w.Element.prototype.scrollTo !== 'function') {
        w.Element.prototype.scrollTo = function () { };
      }
      w.fetch = fetchImpl || function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') }); };
      try {
        w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
        w.localStorage.setItem('study_workbench_token', 'test-token');
      } catch (e) { }
    },
  });
  await sleep(600); // 等同步脚本链与部分异步 boot 执行完
  return { w: wRef, d: wRef.document, vcErrors };
}

(async function main() {
  let uncaughtAll = [];

  /* ============ A1：首页轮播第 6 卡 ============ */
  sec('[A1] 首页 #moreToolsCard 并入轮播（真渲染）');
  {
    const r = await loadReal('学习工作台.html');
    const { w, d } = r;
    const cards = d.querySelectorAll('#homeCardsCarousel .home-carousel-card');
    check('A1 轮播 .home-carousel-card 数量 = 6', cards.length === 6, '实际=' + cards.length);
    const mt = d.getElementById('moreToolsCard');
    check('A1 #moreToolsCard 存在且为第 6 张轮播卡',
      !!mt && mt.classList.contains('home-carousel-card') && mt.parentElement &&
      mt.parentElement.parentElement && mt.parentElement.parentElement.id === 'homeCardsCarousel',
      mt ? 'class=' + mt.className : 'missing');
    check('A1 #moreToolsCard 是容器内最后一张卡',
      cards.length === 6 && cards[5] === mt);

    const dots = d.querySelectorAll('#carouselDots span');
    check('A1 #carouselDots span 数量 = 6', dots.length === 6, '实际=' + dots.length);
    check('A1 第 6 个圆点 onclick = scrollToCard(5)',
      dots.length === 6 && dots[5].getAttribute('onclick') === 'scrollToCard(5)',
      dots.length === 6 ? dots[5].getAttribute('onclick') : '');

    check('A1 抽出幂等 syncCarouselDots 函数', typeof w.syncCarouselDots === 'function');

    // scrollToCard(5) → 第 6 点高亮（20px），其余为 6px
    w.scrollToCard(5);
    await sleep(30);
    const d6 = dots[5], d1 = dots[0];
    check('A1 scrollToCard(5) 高亮第 6 点（width=20px / primary）',
      d6.style.width === '20px' && d6.style.borderRadius === '3px',
      'w=' + d6.style.width + ' r=' + d6.style.borderRadius);
    check('A1 scrollToCard(5) 后第 1 点回归小圆点（width=6px / 50%）',
      d1.style.width === '6px' && d1.style.borderRadius === '50%',
      'w=' + d1.style.width + ' r=' + d1.style.borderRadius);
    // 幂等：重复调用结果一致
    w.syncCarouselDots(0); w.syncCarouselDots(5); w.syncCarouselDots(5);
    check('A1 syncCarouselDots 幂等（重复调用仍高亮第 6 点）',
      dots[5].style.width === '20px' && dots[0].style.width === '6px');

    // moreToolsGrid 仍在 + 4 个工具卡
    const grid = d.getElementById('moreToolsGrid');
    check('A1 #moreToolsGrid 仍在', !!grid);
    check('A1 #moreToolsGrid 内 4 个 .tool-placeholder-card',
      !!grid && grid.querySelectorAll('.tool-placeholder-card').length === 4,
      grid ? '实际=' + grid.querySelectorAll('.tool-placeholder-card').length : '');
    check('A1 原位置留有锚点注释',
      fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8').indexOf('【锚点】原「更多工具」卡') !== -1);

    check('A1 showToast 可用', typeof w.showToast === 'function');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ C4：设置页隐私卡 + 黑名单空态 ============ */
  sec('[C4] 设置页隐私与安全卡（真渲染 + mock 黑名单为空）');
  {
    const emptyFetch = function (url) {
      url = String(url);
      if (url.indexOf('/api/friends/blocked') !== -1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    const r = await loadReal('设置.html', emptyFetch);
    const { w, d } = r;
    check('C4 #privacyCard 存在', !!d.getElementById('privacyCard'));
    check('C4 #stBlockedList 黑名单容器存在', !!d.getElementById('stBlockedList'));
    check('C4 隐私说明文案含「关闭「可被搜索」只影响搜索」',
      d.getElementById('privacyCard').innerHTML.indexOf('只影响搜索') !== -1);
    check('C4 三项可见性控件为禁用占位（disabled）',
      (function () {
        const a = d.getElementById('stMomentScope'), b = d.getElementById('stFriendPolicy');
        const seg = d.getElementById('privacySearchableRow');
        const btns = seg ? seg.querySelectorAll('button') : [];
        return !!a && a.disabled && !!b && b.disabled &&
          btns.length === 2 && btns[0].disabled && btns[1].disabled;
      })());
    check('C4 三个空实现函数挂到 window',
      ['stSetMomentScope', 'stSetFriendPolicy', 'stSetSearchable', 'stLoadBlocked', 'stUnblock']
        .every(k => typeof w[k] === 'function'));
    // 黑名单空态（stInit 已调用 stLoadBlocked；再显式触发一次确保断言稳定）
    w.stLoadBlocked();
    await sleep(120);
    const html = d.getElementById('stBlockedList').innerHTML;
    check('C4 黑名单空态渲染（含「黑名单为空」）', html.indexOf('黑名单为空') !== -1, html.slice(0, 80));
    check('C4 空态不含未登录提示（token 存在时应走接口）', html.indexOf('登录后可管理黑名单') === -1);

    check('C4 showToast 可用', typeof w.showToast === 'function');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ 通用：零未捕获异常 ============ */
  sec('[通用] 零未捕获异常');
  const real = uncaughtAll.filter(x => x && !/navigation/i.test(x));
  check('两页均无未捕获异常（window error + jsdomError）', real.length === 0,
    real.length ? real.slice(0, 6).join(' | ').slice(0, 300) : 'clean');

  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (FAILS.length) { console.log('--- FAIL 明细 ---'); FAILS.forEach(x => console.log('  * ' + x)); }
  try { qaServer.close(); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
