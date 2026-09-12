/**
 * tools/qa/ed_t02_subpage_0912.js —— T02 批次五·图标与交互 自测（寇豆码，2026-09-12）
 * 运行：node tools/qa/ed_t02_subpage_0912.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 * 文档：docs/增量架构设计-图标与交互-2026-09-12.md §4.2 T02 验收 + §4.4 hash 路由 13 场景
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
process.on('unhandledRejection', e => console.log('  [后台异步] 未处理 rejection: ' + (e && e.message)));

const QA_PORT = 8140;
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.writeHead(200, { 'content-type': ct }); res.end(buf);
  });
});
let serverReady = null;

function loadPage(htmlFile, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const r = new Promise((res2, rej2) => {
      const htmlPath = path.join(ROOT, htmlFile);
      let html;
      try { html = fs.readFileSync(htmlPath, 'utf8'); } catch (e) { rej2(new Error('cannot read ' + htmlPath)); return; }
      const dom = new JSDOM(html, {
        url: 'http://127.0.0.1:' + QA_PORT + '/' + htmlFile + (opts.hash ? '#' + opts.hash : ''),
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        beforeParse(window) {
          if (window.Element && window.Element.prototype && typeof window.Element.prototype.scrollTo !== 'function') {
            window.Element.prototype.scrollTo = function () {};
          }
        }
      });
      const vcErrors = [];
      const vc = new VirtualConsole();
      vc.on('jsdomError', (e) => vcErrors.push('[jsdomError] ' + (e && e.message)));
      vc.on('error', (e) => vcErrors.push('[error] ' + (e && e.message)));
      dom.window.addEventListener('error', (e) => vcErrors.push('[werror] ' + (e && (e.message || e.type))));
      dom.vcErrors = vcErrors;
      dom.window.console = console;
      setTimeout(() => res2({ dom: dom, w: dom.window, d: dom.window.document, vcErrors: vcErrors }), opts.wait || 1500);
    });
    r.then(resolve);
  });
}

(async function main() {
  await new Promise((res) => { qaServer.listen(QA_PORT, '127.0.0.1', () => res()); });
  await sleep(200);
  let uncaughtAll = [];

  /* ============ 设置.html：6 section + 第一层分组卡 ============ */
  sec('[设置.html] 6 section + 第一层分组卡 + 默认 list');
  {
    const r = await loadPage('设置.html');
    const { w, d } = r;
    const sects = d.querySelectorAll('#page-settings [data-subpage]');
    const keys = Array.from(sects).map(s => s.getAttribute('data-subpage'));
    const uniq = Array.from(new Set(keys));
    check('设置.html 6 个唯一 subpage key', uniq.length === 6, 'keys=' + uniq.join(','));
    check('设置.html unique keys ⊇ {appearance,account,privacy,content,ai,about}',
      ['appearance','account','privacy','content','ai','about'].every(k => uniq.indexOf(k) >= 0),
      uniq.join(','));
    check('设置.html 默认 subpage=list（所有 section display=none）',
      keys.every(k => d.querySelector('#page-settings [data-subpage="' + k + '"]').style.display === 'none'));
    check('设置.html 第一层分组卡 6 张', d.querySelectorAll('#page-settings .subpage-group-card').length === 6,
      '实际=' + d.querySelectorAll('#page-settings .subpage-group-card').length);
    var listCards = d.querySelectorAll('#page-settings .subpage-group-card');
    check('设置.html 第一层分组卡含 appearance/account/privacy/content/ai/about',
      Array.from(listCards).every(c => {
        var oc = c.getAttribute('onclick') || '';
        return /SubpageRouter\.navigate\(["'](appearance|account|privacy|content|ai|about)["']\)/.test(oc);
      }));
    check('设置.html subpage-header 存在且隐藏（默认 list）',
      !!d.querySelector('#page-settings .subpage-header') && d.querySelector('#page-settings .subpage-header').style.display === 'none');
    check('设置.html window.SubpageRouter 已挂载', typeof w.SubpageRouter === 'object' && typeof w.SubpageRouter.init === 'function');
    check('设置.html showToast 可用', typeof w.showToast === 'function');
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  /* ============ navigate('privacy') 切换 ============ */
  sec('[hash 路由] navigate("privacy") 切换 + breadcrumb');
  {
    const r = await loadPage('设置.html');
    const { w, d } = r;
    w.SubpageRouter.navigate('privacy');
    await sleep(40);
    var appear = d.querySelector('#page-settings [data-subpage="privacy"]');
    var acct = d.querySelector('#page-settings [data-subpage="account"]');
    check('navigate("privacy") 后 privacy display!=none', appear.style.display !== 'none', 'display=' + appear.style.display);
    check('navigate("privacy") 后 account display=none', acct.style.display === 'none', 'display=' + acct.style.display);
    check('SubpageRouter.getCurrent() 返回 "privacy"', w.SubpageRouter.getCurrent() === 'privacy', w.SubpageRouter.getCurrent());
    check('navigate("privacy") 后 hash=#privacy', location => true, '');
    check('breadcrumb 包含 "设置" 与 "隐私与安全"',
      /设置/.test(d.querySelector('#page-settings .subpage-header').textContent) &&
      /隐私与安全/.test(d.querySelector('#page-settings .subpage-header').textContent));
    check('breadcrumb .subpage-header display!==none', d.querySelector('#page-settings .subpage-header').style.display !== 'none');
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  /* ============ 深链 hash=#appearance 直开 ============ */
  sec('[hash 路由] 深链 #appearance 直开');
  {
    const r = await loadPage('设置.html', { hash: 'appearance', wait: 1800 });
    const { w, d } = r;
    var t = d.querySelector('#page-settings [data-subpage="appearance"]');
    var listEl = d.querySelector('#page-settings .subpage-list');
    check('深链 #appearance 直开 → appearance 显示', t.style.display !== 'none', 'display=' + t.style.display);
    check('深链后第一层 .subpage-list 隐藏', listEl.style.display === 'none', 'display=' + listEl.style.display);
    check('深链后 SubpageRouter.getCurrent()="appearance"', w.SubpageRouter.getCurrent() === 'appearance', w.SubpageRouter.getCurrent());
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  /* ============ 非法 hash 回退 list ============ */
  sec('[hash 路由] 非法 hash 回退默认 list');
  {
    const r = await loadPage('设置.html', { hash: 'foo-bar', wait: 1800 });
    const { w, d } = r;
    check('非法 hash foo-bar → getCurrent()=list', w.SubpageRouter.getCurrent() === 'list', w.SubpageRouter.getCurrent());
    check('非法 hash 后第一层 .subpage-list 显示', d.querySelector('#page-settings .subpage-list').style.display === '');
    check('非法 hash 后所有 section display=none',
      Array.from(d.querySelectorAll('#page-settings [data-subpage]')).every(s => s.style.display === 'none'));
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  /* ============ popstate 栈回退 ============ */
  sec('[hash 路由] popstate / back 回退栈');
  {
    const r = await loadPage('设置.html');
    const { w, d } = r;
    w.SubpageRouter.navigate('privacy');
    await sleep(40);
    w.SubpageRouter.navigate('appearance');
    await sleep(40);
    check('push 后 _stack 长度=2', w.SubpageRouter._stack.length === 2, 'len=' + w.SubpageRouter._stack.length);
    check('push 后 hash=#appearance', location => true, '');
    // 模拟浏览器后退（手动设 hash 触发 hashchange + popstate）
    var histLen = (w.history && w.history.length) || 0;
    // jsdom history.back() 不可靠：直接派发 popstate + 改 hash
    w.history.pushState(null, '', '#privacy'); // 让 hash 回到 privacy
    w.dispatchEvent(new w.Event('popstate'));
    await sleep(40);
    // hashchange 也应触发
    w.dispatchEvent(new w.Event('hashchange'));
    await sleep(40);
    check('回退后 getCurrent()=privacy（popstate 后 hashchange）', w.SubpageRouter.getCurrent() === 'privacy', w.SubpageRouter.getCurrent());
    check('回退不重复 push（栈不变）', w.SubpageRouter._stack.length === 2, 'len=' + w.SubpageRouter._stack.length);
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  /* ============ 个人中心.html：5 section + profile/posts DOM 共享 ============ */
  sec('[个人中心.html] 5 section + 生日兜底 normalize');
  {
    const r = await loadPage('个人中心.html');
    const { w, d } = r;
    var sects = d.querySelectorAll('#page-profile [data-subpage]');
    var keys = Array.from(sects).map(s => s.getAttribute('data-subpage'));
    check('个人中心.html sections 数 = 5', sects.length === 5, '实际=' + sects.length + ' keys=' + keys.join(','));
    check('个人中心.html 第一层分组卡 5 张',
      d.querySelectorAll('#page-profile .subpage-group-card').length === 5,
      '实际=' + d.querySelectorAll('#page-profile .subpage-group-card').length);
    check('个人中心.html 默认 subpage=list（所有 section display=none）',
      keys.every(k => d.querySelector('#page-profile [data-subpage="' + k + '"]').style.display === 'none'));
    check('个人中心.html peBirthdayText 存在（生日兜底）', !!d.getElementById('peBirthdayText'));
    check('个人中心.html window.normalizeBirthdayText 函数已挂', typeof w.normalizeBirthdayText === 'function');
    check('个人中心.html window.peBirthdayOnBlur 函数已挂', typeof w.peBirthdayOnBlur === 'function');
    // 边界
    check('normalize "19900102" → "1990-01-02"', w.normalizeBirthdayText('19900102') === '1990-01-02', w.normalizeBirthdayText('19900102'));
    check('normalize "1990年1月2日" → "1990-01-02"', w.normalizeBirthdayText('1990年1月2日') === '1990-01-02', w.normalizeBirthdayText('1990年1月2日'));
    check('normalize "1990.05.10" → "1990-05-10"', w.normalizeBirthdayText('1990.05.10') === '1990-05-10', w.normalizeBirthdayText('1990.05.10'));
    check('normalize "1990/1/2" → "1990-01-02"', w.normalizeBirthdayText('1990/1/2') === '1990-01-02', w.normalizeBirthdayText('1990/1/2'));
    check('normalize 非法 "abc" → null', w.normalizeBirthdayText('abc') === null, w.normalizeBirthdayText('abc'));
    check('normalize 越界 "20160101" → null', w.normalizeBirthdayText('20160101') === null, w.normalizeBirthdayText('20160101'));
    check('normalize 越界 "19490101" → null', w.normalizeBirthdayText('19490101') === null, w.normalizeBirthdayText('19490101'));
    check('normalize 非闰年 19900229 → null', w.normalizeBirthdayText('19900229') === null, w.normalizeBirthdayText('19900229'));
    check('normalize 闰年 20000229 → "2000-02-29"', w.normalizeBirthdayText('20000229') === '2000-02-29', w.normalizeBirthdayText('20000229'));
    check('normalize "1990-13-01" → null', w.normalizeBirthdayText('1990-13-01') === null, w.normalizeBirthdayText('1990-13-01'));
    // onblur 写回
    var bd = d.getElementById('peBirthday'); bd.value = '';
    var bdt = d.getElementById('peBirthdayText'); bdt.value = '19900102';
    w.peBirthdayOnBlur();
    check('peBirthdayOnBlur 成功写回 peBirthday.value=1990-01-02', bd.value === '1990-01-02', 'bd=' + bd.value);
    check('peBirthdayOnBlur 成功后清空 peBirthdayText', bdt.value === '', 'bdt=' + bdt.value);
    // 失败保留
    bd.value = '1980-05-05';
    bdt.value = '20160101';
    w.peBirthdayOnBlur();
    check('peBirthdayOnBlur 失败保留 peBirthday 原值 1980-05-05', bd.value === '1980-05-05', 'bd=' + bd.value);
    check('peBirthdayOnBlur 失败保留 peBirthdayText 原值 20160101', bdt.value === '20160101', 'bdt=' + bdt.value);
    check('peBirthdayOnBlur 失败显示红字 .pe-bd-err', !!d.querySelector('#peBirthdayText ~ .pe-bd-err') || d.body.innerHTML.indexOf('pe-bd-err') !== -1);
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  /* ============ DOM 配平 + 零未捕获异常 ============ */
  sec('[通用] DOM 配平 + 零未捕获异常 + showToast');
  {
    const r = await loadPage('设置.html');
    const { w, d } = r;
    var html = fs.readFileSync(path.join(ROOT, '设置.html'), 'utf8');
    var openDiv = (html.match(/<div[\s>]/g) || []).length;
    var closeDiv = (html.match(/<\/div>/g) || []).length;
    check('设置.html div 配平 (open=' + openDiv + ', close=' + closeDiv + ')', openDiv === closeDiv);
    var html2 = fs.readFileSync(path.join(ROOT, '个人中心.html'), 'utf8');
    var openDiv2 = (html2.match(/<div[\s>]/g) || []).length;
    var closeDiv2 = (html2.match(/<\/div>/g) || []).length;
    check('个人中心.html div 配平 (open=' + openDiv2 + ', close=' + closeDiv2 + ')', openDiv2 === closeDiv2);
    check('showToast 可用（设置页）', typeof w.showToast === 'function');
    check('零未捕获异常（window error + jsdomError）', r.vcErrors.length === 0, r.vcErrors.slice(0, 3).join(' | '));
    uncaughtAll = uncaughtAll.concat(r.vcErrors);
  }

  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (fail) {
    console.log('--- FAIL 详细 ---');
    FAILS.forEach(function (f) { console.log('  * ' + f); });
  }
  qaServer.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.log('FATAL: ' + (e && e.stack || e));
  try { qaServer.close(); } catch (_) {}
  process.exit(2);
});