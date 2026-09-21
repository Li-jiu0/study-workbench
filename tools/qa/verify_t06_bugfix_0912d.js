/**
 * tools/qa/verify_t06_bugfix_0912d.js —— T06 修复自验证（寇豆码，2026-09-12）
 *
 * 覆盖两个 Bug 的真加载/真执行断言（不是静态 grep）：
 *   A. 个人中心：#prefs / #local-data 子页切换后，卡片可见（非 display:none、内容非空）
 *   B. 三个模考页：返回按钮不再依赖 history，目标 URL 明确
 *      - mock_exam_run.html  : goBack() → mock_exam.html?cat=<paper 分类>
 *      - mock_exam.html      : goBack() → 来源备考页（cat 驱动）
 *      - mock_exam_result.html: goBack() → mock_exam.html?cat=<paper 分类>
 *
 * 导航断言方案：jsdom 会丢弃 location.href 赋值（"Not implemented: navigation"），
 * 因此 Bug2 采用「提取页面内联 goBack 源码 → 在可注入 location/MockEngine 的沙箱里执行」
 * 的方式做纯函数级断言，既真执行生产代码，又能捕获目标 URL。
 *
 * 运行：node tools/qa/verify_t06_bugfix_0912d.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const vm = require('vm');
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

const QA_PORT = 8155;
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.writeHead(200, { 'content-type': ct }); res.end(buf);
  });
});

function loadPage(htmlFile, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const htmlPath = path.join(ROOT, htmlFile);
    let html;
    try { html = fs.readFileSync(htmlPath, 'utf8'); } catch (e) { resolve({ error: e }); return; }
    const q = opts.search ? ('?' + opts.search) : '';
    const h = opts.hash ? ('#' + opts.hash) : '';
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1:' + QA_PORT + '/' + encodeURIComponent(htmlFile) + q + h,
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
    vc.on('jsdomError', (e) => {
      const m = (e && e.message) || '';
      if (m.indexOf('navigation') >= 0) return; // 导航不支持属预期，忽略
      vcErrors.push('[jsdomError] ' + m);
    });
    dom.window.console = console;
    setTimeout(() => resolve({ dom, w: dom.window, d: dom.window.document, vcErrors }), opts.wait || 1800);
  });
}

/** 从 HTML 文件里抽出顶层 `function goBack(): {...}` 源码（非注释）。 */
function extractGoBack(htmlFile) {
  const s = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  // 找到 "function goBack() {" 到其匹配的结尾 "}"（按花括号配平）
  const idx = s.indexOf('function goBack()');
  if (idx < 0) return null;
  const open = s.indexOf('{', idx);
  if (open < 0) return null;
  let depth = 0, end = -1;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  return s.slice(idx, end + 1);
}

/**
 * 在沙箱里执行抽取出的 goBack，注入可控的 location / MockEngine，返回目标 URL。
 * @param {string} htmlFile
 * @param {string} search 形如 "paper=cet-demo-1"
 * @param {object} opts  { fakeCategory: 'cet4'|'exam'|null }
 */
function runGoBack(htmlFile, search, opts) {
  opts = opts || {};
  const src = extractGoBack(htmlFile);
  if (!src) return { url: null, err: 'goBack 源码未找到' };
  const captured = { url: null };
  const _location = {
    _search: search ? ('?' + search) : '',
    get search() { return this._search; },
    _href: '',
    get href() { return this._href; },
    set href(v) { captured.url = String(v); this._href = String(v); }
  };
  const _URLSearchParams = URLSearchParams;
  const _MockEngine = {
    findPaperCategory(paperId) {
      if (opts.fakeCategory === undefined) return null;
      return opts.fakeCategory;
    }
  };
  const sandbox = {
    window: { location: _location, MockEngine: _MockEngine },
    location: _location,
    MockEngine: _MockEngine,
    URLSearchParams: _URLSearchParams,
    encodeURIComponent,
    console
  };
  try {
    vm.runInNewContext('(' + src + ')();', sandbox, { timeout: 2000 });
  } catch (e) { return { url: captured.url, err: e.message }; }
  return { url: captured.url, err: null };
}

/** 只在「真实标签」里找旧的 history.back 返回链接（排除注释里的说明文字）。 */
function hasHistoryBackAnchor(htmlFile) {
  const s = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  // 去掉 HTML 注释后再检测，避免把说明注释里的示例文本误判为真实代码
  const noComment = s.replace(/<!--[\s\S]*?-->/g, '');
  return /<a\b[^>]*href\s*=\s*"javascript:history\.back\(\)"/.test(noComment);
}

(async function main() {
  await new Promise((res) => { qaServer.listen(QA_PORT, '127.0.0.1', () => res()); });
  await sleep(200);

  /* ================= Bug 1：个人中心 prefs / local-data 可见且有内容 ================= */
  sec('[Bug1] 个人中心 #prefs / #local-data 子页有可见内容');
  {
    const r = await loadPage('个人中心.html', { wait: 2200 });
    const { w, d } = r;
    check('SubpageRouter 已挂载', typeof w.SubpageRouter === 'object' && typeof w.SubpageRouter.navigate === 'function');

    // --- prefs ---
    w.SubpageRouter.navigate('prefs');
    await sleep(150);
    const prefSec = d.querySelector('#page-profile [data-subpage="prefs"]');
    const prefCard = prefSec && prefSec.querySelector('.card');
    const prefBody = d.getElementById('prefBody');
    check('prefs section 显示（display!==none）', prefSec && prefSec.style.display !== 'none', prefSec ? 'display=' + prefSec.style.display : 'section 缺失');
    check('prefs 内 .card 可见（不再 display:none）',
      prefCard && prefCard.style.display !== 'none',
      prefCard ? 'style.display=' + JSON.stringify(prefCard.style.display) : 'card 缺失');
    check('prefs #prefBody 内容非空且非「加载中…」占位',
      prefBody && prefBody.textContent.trim().length > 0 && prefBody.textContent.indexOf('加载中') < 0,
      prefBody ? ('text="' + prefBody.textContent.trim().slice(0, 40) + '"') : 'prefBody 缺失');
    check('prefs #prefBody 含真实偏好数据（每日新增/专注）',
      prefBody && /每日新增|专注/.test(prefBody.textContent), prefBody ? prefBody.textContent.slice(0, 60) : '');

    // --- local-data ---
    w.SubpageRouter.navigate('local-data');
    await sleep(150);
    const ldSec = d.querySelector('#page-profile [data-subpage="local-data"]');
    const ldCard = ldSec && ldSec.querySelector('.card');
    const ldStats = d.getElementById('localStats');
    check('local-data section 显示', ldSec && ldSec.style.display !== 'none', ldSec ? 'display=' + ldSec.style.display : 'section 缺失');
    check('local-data 内 .card 可见（不再 display:none）',
      ldCard && ldCard.style.display !== 'none',
      ldCard ? 'style.display=' + JSON.stringify(ldCard.style.display) : 'card 缺失');
    check('local-data #localStats 内容非空且非占位',
      ldStats && ldStats.textContent.trim().length > 0 && ldStats.textContent.indexOf('加载中') < 0,
      ldStats ? ('len=' + ldStats.textContent.trim().length) : 'localStats 缺失');
    check('local-data #localStats 含统计卡（总学习/做题/正确率/连续打卡）',
      ldStats && /总学习|做题|正确率|连续打卡/.test(ldStats.textContent), ldStats ? ldStats.textContent.slice(0, 60) : '');

    check('个人中心零未捕获异常（忽略 jsdom 导航限制）', r.vcErrors.length === 0, r.vcErrors.slice(0, 3).join(' | '));
  }

  /* ================= Bug 2：三页 goBack 目标 URL ================= */
  sec('[Bug2] mock_exam_run.html 返回 → 选卷页带正确 cat');
  {
    const s = fs.readFileSync(path.join(ROOT, 'mock_exam_run.html'), 'utf8');
    check('run 页不含真实 history.back 返回链接', !hasHistoryBackAnchor('mock_exam_run.html'));
    check('run 页返回链接 onclick="goBack()"', /onclick="goBack\(\);return false"/.test(s));
    check('run 页有 goBack() 定义', s.indexOf('function goBack()') >= 0);
    check('run 页保留 chevron-left 图标', /data-icon="chevron-left"/.test(s));

    let t = runGoBack('mock_exam_run.html', 'paper=cet-demo-1', { fakeCategory: 'cet4' });
    check('run(cet-demo-1) goBack → mock_exam.html?cat=cet-mock', /mock_exam\.html\?cat=cet-mock/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam_run.html', 'paper=exam-comp-a', { fakeCategory: 'exam' });
    check('run(exam-comp-a) goBack → mock_exam.html?cat=exam-mock', /mock_exam\.html\?cat=exam-mock/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam_run.html', 'paper=unknown', { fakeCategory: null });
    check('run(未知卷) goBack 兜底 → mock_exam.html?cat=cet-mock', /mock_exam\.html\?cat=cet-mock/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam_run.html', '', { fakeCategory: null });
    check('run(无 paper) goBack 兜底 → mock_exam.html?cat=cet-mock', /mock_exam\.html\?cat=cet-mock/.test(t.url || ''), String(t.url));
  }

  sec('[Bug2] mock_exam.html 返回 → 来源备考页（由 cat 决定）');
  {
    const s = fs.readFileSync(path.join(ROOT, 'mock_exam.html'), 'utf8');
    check('选卷页不含真实 history.back 返回链接', !hasHistoryBackAnchor('mock_exam.html'));
    check('选卷页返回链接 onclick="goBack()"', /onclick="goBack\(\);return false"/.test(s));
    check('选卷页保留 chevron-left 图标', /data-icon="chevron-left"/.test(s));

    let t = runGoBack('mock_exam.html', 'cat=cet-mock', {});
    check('选卷(cat=cet-mock) goBack → 四级备考.html', /四级备考\.html/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam.html', 'cat=exam-mock', {});
    check('选卷(cat=exam-mock) goBack → 央国企笔试.html', /央国企笔试\.html/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam.html', '', {});
    check('选卷(无 cat) goBack 兜底 → 四级备考.html', /四级备考\.html/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam.html', 'cat=weird', {});
    check('选卷(未知 cat) goBack 兜底 → 四级备考.html', /四级备考\.html/.test(t.url || ''), String(t.url));
  }

  sec('[Bug2] mock_exam_result.html 返回 → 选卷页带正确 cat');
  {
    const s = fs.readFileSync(path.join(ROOT, 'mock_exam_result.html'), 'utf8');
    check('成绩页不含真实 history.back 返回链接', !hasHistoryBackAnchor('mock_exam_result.html'));
    check('成绩页返回链接 onclick="goBack()"', /onclick="goBack\(\);return false"/.test(s));
    check('成绩页保留 chevron-left 图标', /data-icon="chevron-left"/.test(s));

    let t = runGoBack('mock_exam_result.html', 'paper=cet-demo-1&run=whatever', { fakeCategory: 'cet4' });
    check('成绩(cet-demo-1) goBack → mock_exam.html?cat=cet-mock', /mock_exam\.html\?cat=cet-mock/.test(t.url || ''), String(t.url));
    t = runGoBack('mock_exam_result.html', 'paper=exam-comp-a&run=whatever', { fakeCategory: 'exam' });
    check('成绩(exam-comp-a) goBack → mock_exam.html?cat=exam-mock', /mock_exam\.html\?cat=exam-mock/.test(t.url || ''), String(t.url));
  }

  sec('[通用] 三页零未捕获异常 + DOM 配平 + 版本号');
  {
    for (const p of ['mock_exam.html', 'mock_exam_run.html', 'mock_exam_result.html']) {
      const r = await loadPage(p, { search: 'paper=cet-demo-1', wait: 2000 });
      const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
      const od = (html.match(/<div[\s>]/g) || []).length;
      const cd = (html.match(/<\/div>/g) || []).length;
      check(p + ' div 配平 (' + od + '/' + cd + ')', od === cd);
      check(p + ' 零未捕获异常（忽略 jsdom 导航限制）', r.vcErrors.length === 0, r.vcErrors.slice(0, 2).join(' | '));
      check(p + ' 无残留 ?v=20260912c', html.indexOf('?v=20260912c') < 0);
    }
  }

  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (fail) { console.log('--- FAIL 详细 ---'); FAILS.forEach(f => console.log('  * ' + f)); }
  qaServer.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.log('FATAL: ' + (e && e.stack || e));
  try { qaServer.close(); } catch (_) {}
  process.exit(2);
});
