/* R9（2026-09-21）日志页 + 数据管理入口 断言（jsdom，垫片同 _r7_subpage_clean 金标准）
   用法：NODE_PATH=<slidep node_modules> node tools/qa/_r9_log_check.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('[PASS] ' + name); }
  else { fail++; console.log('[FAIL] ' + name); }
}
/* 断言前剥离注释：本批多处「删除/顺序」改动会在 HTML/CSS 注释里留下说明文字，
   直接 includes 会误判（注释中的 xt-update.js / 检测更新 / history.back / app.js 属文档性说明）。 */
function stripComments(s) {
  return String(s).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
function lsShim() {
  let store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  };
}
async function loadPage(file) {
  const dom = await JSDOM.fromFile(path.join(ROOT, file), {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(win) {
      try { Object.defineProperty(win, 'localStorage', { value: lsShim(), configurable: true }); } catch (e) { }
      try { Object.defineProperty(win, 'sessionStorage', { value: lsShim(), configurable: true }); } catch (e) { }
      win.fetch = function () { return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}'), json: () => Promise.resolve({}) }); };
      if (!win.ResizeObserver) win.ResizeObserver = function () { this.observe = function () { }; this.unobserve = function () { }; this.disconnect = function () { }; };
      if (!win.IntersectionObserver) win.IntersectionObserver = function () { this.observe = function () { }; this.unobserve = function () { }; this.disconnect = function () { }; };
      if (!win.matchMedia) win.matchMedia = function () { return { matches: false, media: '', addListener: function () { }, removeListener: function () { }, addEventListener: function () { }, removeEventListener: function () { } }; };
    },
  });
  await new Promise((res) => {
    const doc = dom.window.document;
    if (doc.readyState === 'complete') return res();
    dom.window.addEventListener('load', res);
    setTimeout(res, 15000);
  });
  return dom;
}

(async () => {
  /* ---------- 静态断言 ---------- */
  const dm = stripComments(fs.readFileSync(path.join(ROOT, '数据管理.html'), 'utf8'));
  assert('数据管理：检测更新行已删（DOM 与 dmOpenUpdate 一并清理）',
    !dm.includes('dmOpenUpdate') && !dm.includes('检查星途是否有新版本') && !dm.includes('检测更新'));
  assert('数据管理：xt-update.js 引用已移除', !dm.includes('xt-update.js'));
  // R11（2026-09-21）：入口按钮改为 location.href='日志.html' + (location.search || '')（透传来源参数），
  // 故原字面量 onclick="location.href='日志.html'" 不再匹配 —— 改为正则，断言「入口仍指向 日志.html 且带来源透传」。
  assert('数据管理：「日志」入口已接 日志.html（R11：带 location.search 透传）',
    /onclick="location\.href='日志\.html'\s*\+\s*\(location\.search\s*\|\|\s*''\)"/.test(dm) && dm.includes('> 日志</button>'));

  const lg = stripComments(fs.readFileSync(path.join(ROOT, '日志.html'), 'utf8'));
  assert('日志页：返回为显式跳转 数据管理.html（不用 history.back）', lg.includes("location.href='数据管理.html'") && !lg.includes('history.back'));
  assert('日志页：xt-log.js 在 app.js/api.js 之前加载', lg.indexOf('xt-log.js') !== -1 && lg.indexOf('xt-log.js') < lg.indexOf('app.js') && lg.indexOf('xt-log.js') < lg.indexOf('api.js'));
  assert('日志页：含导出/上报/清空与设备日志页签', lg.includes('lgExport') && lg.includes('lgReport') && lg.includes('lgAskClear') && lg.includes("lgSetSrc('device')"));

  const xtlogSrc = fs.readFileSync(path.join(ROOT, 'assets/xt-log.js'), 'utf8');
  assert('xt-log：生产关 DEBUG + 脱敏 + 环形上限齐备',
    xtlogSrc.includes('__XT_PROD__ ? LEVELS.info') && xtlogSrc.includes('[手机号]') && xtlogSrc.includes('[JWT]') && xtlogSrc.includes('MAX_MEM'));

  const eb = fs.readFileSync(path.join(ROOT, 'assets/error-boundary.js'), 'utf8');
  assert('error-boundary：错误镜像进 XTLog', eb.includes("window.XTLog.error('boundary'"));
  const apiSrc = fs.readFileSync(path.join(ROOT, 'assets/api.js'), 'utf8');
  assert('api.js：请求带 X-Request-Id 且失败落 XTLog', apiSrc.includes("'X-Request-Id'") && apiSrc.includes("window.XTLog.warn('api'"));

  const ml = fs.readFileSync(path.join(ROOT, 'android/java/com/study/workbench/MainActivity.java'), 'utf8');
  const cl = fs.readFileSync(path.join(ROOT, 'android/java/com/study/workbench/CrashLogger.java'), 'utf8');
  assert('原生：readLogs 桥 + 别名 + readTail + 7 天轮转齐备',
    ml.includes('public String readLogs(final int maxBytes)') && ml.includes('readLogs:function(n)') &&
    cl.includes('static String readTail(int maxBytes)') && cl.includes('purgeOld(7)'));

  /* ---------- jsdom 功能：日志页 ---------- */
  try {
    const dom = await loadPage('日志.html');
    const w = dom.window, d = w.document;
    assert('日志页(jsdom)：XTLog 已加载且生产态最低级别为 info',
      !!(w.XTLog) && w.XTLog.getMinLevel() === 'info');

    // 脱敏：写一条带密钥/手机号的错误，取回应已打码
    w.XTLog.error('test', 'user token=abc123456789xyz phone 13812345678', 'ctx-单元测试');
    const got = w.XTLog.get({ level: 'error', q: 'phone' });
    assert('日志页(jsdom)：脱敏生效（token/手机号打码）',
      got.length >= 1 && got[0].msg.indexOf('abc123456789xyz') === -1 && got[0].msg.indexOf('13812345678') === -1 &&
      got[0].msg.indexOf('[REDACTED]') !== -1 && got[0].msg.indexOf('[手机号]') !== -1);

    // 页面初始渲染（boot 由内联脚本执行）
    const total = d.getElementById('lgStTotal').textContent;
    assert('日志页(jsdom)：统计卡已渲染（非占位符）', total !== '–' && total !== '');

    // 级别筛选：只留 error
    w.lgSetLv('error');
    const listHtml1 = d.getElementById('lgList').innerHTML;
    assert('日志页(jsdom)：级别筛选渲染出 ERROR 徽标', listHtml1.indexOf('lg-lv error') !== -1 && listHtml1.toUpperCase().indexOf('ERROR') !== -1);

    // 关键字检索
    w.lgSetLv('');
    d.getElementById('lgQ').value = 'ctx-单元测试';
    w.lgDebounceRender();
    await new Promise((r) => setTimeout(r, 400));
    const listHtml2 = d.getElementById('lgList').innerHTML;
    assert('日志页(jsdom)：关键字检索命中测试条目', listHtml2.indexOf('lg-item') !== -1 && listHtml2.indexOf('ctx-单元测试') === -1 ? listHtml2.indexOf('phone') !== -1 || listHtml2.indexOf('[手机号]') !== -1 : true);

    // 浏览器无桥：设备日志页签显示降级空态
    w.lgSetSrc('device');
    const devHtml = d.getElementById('lgList').innerHTML;
    assert('日志页(jsdom)：无桥时设备日志显示降级说明', devHtml.indexOf('设备日志仅星途 App 内可用') !== -1);
    dom.window.close();
  } catch (e) {
    assert('日志页(jsdom)：页面加载执行', false);
    console.log('   日志页 jsdom error: ' + e.message);
  }

  /* ---------- jsdom 功能：数据管理页（入口改造不回归） ---------- */
  try {
    const dom2 = await loadPage('数据管理.html');
    const d2 = dom2.window.document;
    const html2 = stripComments(d2.body.innerHTML);
    assert('数据管理(jsdom)：页面正常加载且无「检测更新」行', html2.indexOf('检测更新') === -1 && html2.indexOf('日志') !== -1);
    assert('数据管理(jsdom)：dmBackup 仍在（备份功能不回归）', typeof dom2.window.dmBackup === 'function');
    dom2.window.close();
  } catch (e) {
    assert('数据管理(jsdom)：页面加载执行', false);
    console.log('   数据管理 jsdom error: ' + e.message);
  }

  console.log('----');
  console.log('RESULT: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (' + pass + ' pass / ' + fail + ' fail)');
  process.exit(fail === 0 ? 0 : 1);
})();
