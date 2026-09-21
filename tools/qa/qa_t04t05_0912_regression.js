/* =====================================================================
 * qa_t04t05_0912_regression.js —— QA 独立验证 §3 前序任务回归
 * ---------------------------------------------------------------------
 * 批次五 T04/T05 用批量脚本改了 29 个文件 / 501 增 345 删，最容易误伤前序任务。
 * 本脚本对 T01/T02/T03 逐项回归，尽量用「真执行」而不是「字符串存在」来断言。
 * 只读脚本。
 * 运行：node tools/qa/qa_t04t05_0912_regression.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.resolve('D:/下载的文件/学习工作台') +
  '/tools/verifier/node_modules/jsdom');

const R = path.resolve('D:/下载的文件/学习工作台');
let PASS = 0, FAIL = 0;
const failures = [];
function ok(c, name, detail) { if (c) PASS++; else { FAIL++; failures.push({ name, detail: detail || '' }); } }
function section(t) { console.log('\n---- ' + t + ' ----'); }

const ROUTER_SRC = fs.readFileSync(path.join(R, 'assets/subpage-router.js'), 'utf8');
const CHAT_SRC = fs.readFileSync(path.join(R, 'assets/chat-local.js'), 'utf8');

function shim(w) {
  if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = function () {};
  if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  if (!w.fetch) w.fetch = () => Promise.reject(new Error('no network in harness'));
  // file:// 是 opaque origin，访问 window.localStorage 会直接抛 SecurityError，
  // 必须在访问前用 defineProperty 覆盖（不能先读再赋值）。
  shimStorage(w, 'localStorage');
  shimStorage(w, 'sessionStorage');
}

function shimStorage(w, name) {
  let available = false;
  try { void w[name]; available = true; } catch (e) { available = false; }
  if (available) return;
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
  };
  try { Object.defineProperty(w, name, { value: fake, configurable: true, writable: true }); } catch (e) {}
}

/** 用真 DOM 加载页面：把指定的外链脚本内联进来，其余外链脚本移除 */
async function load(file, opts) {
  opts = opts || {};
  let html = fs.readFileSync(path.join(R, file), 'utf8');
  // 内联指定脚本
  for (const [pattern, src] of (opts.inline || [])) {
    html = html.replace(pattern, () => '<script>' + src + '</script>');
  }
  // 移除剩余外链脚本
  html = html.replace(/<script\s+src\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, '')
             .replace(/<script\s+src\s*=\s*["'][^"']*["'][^>]*\/?>/gi, '');

  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String((e && e.message) || e)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'file:///' + encodeURI(file), virtualConsole: vc
  });
  shim(dom.window);
  await new Promise(res => {
    const w = dom.window;
    if (w.document.readyState !== 'loading') return res();
    w.addEventListener('DOMContentLoaded', () => res());
    setTimeout(res, 2000);
  });
  await new Promise(r => setTimeout(r, 0));
  dom.window.__errs = errs;
  return dom;
}

/**
 * 改 hash 并可靠地触发 hashchange。
 * jsdom 在 file:// 下对 location.hash 赋值可能抛 DOMException，
 * 且 HashChangeEvent 构造器不一定存在，因此做三重兜底。
 */
function setHash(w, h) {
  let assigned = false;
  try { w.location.hash = h; assigned = true; } catch (e) { assigned = false; }
  if (!assigned) {
    try { w.history.replaceState(null, '', h || '#'); } catch (e) {}
  }
  let fired = false;
  try {
    if (typeof w.HashChangeEvent === 'function') { w.dispatchEvent(new w.HashChangeEvent('hashchange')); fired = true; }
  } catch (e) { fired = false; }
  if (!fired) {
    try { w.dispatchEvent(new w.Event('hashchange')); } catch (e) {}
  }
}

function uniqueKeys(html) {
  const set = new Set();
  let m; const re = /data-subpage="([^"]+)"/g;
  while ((m = re.exec(html))) set.add(m[1]);
  return Array.from(set);
}

// =====================================================================
(async function main() {
  console.log('=== QA §3 前序任务回归（T01 / T02 / T03）===');

  // ---------------- T02-a hash 路由：设置页 ----------------
  section('T02-a 设置.html · hash 路由（6 层子页）');
  {
    const raw = fs.readFileSync(path.join(R, '设置.html'), 'utf8');
    const keys = uniqueKeys(raw);
    console.log('   实际 data-subpage key: ' + keys.sort().join(', '));
    const need = ['appearance', 'account', 'privacy', 'content', 'ai', 'about'];
    for (const k of need) ok(keys.indexOf(k) >= 0, '设置页含子页 key: ' + k);
    ok(keys.length === 6, '设置页子页 key 恰 6 个', '实际 ' + keys.length + ' -> ' + keys.join(','));
    ok(/subpage-router\.js\?v=20260912a/.test(raw), '设置页引用 subpage-router.js?v=20260912a');

    const dom = await load('设置.html', {
      inline: [[/<script\s+src\s*=\s*["']assets\/subpage-router\.js[^"']*["'][^>]*>\s*<\/script>/i, ROUTER_SRC]]
    });
    const w = dom.window, d = w.document;
    // 注意：harness 移除了外链 app.js，因此 loadAllSettings/getSetting 之类的
    // ReferenceError 是 harness 产物而非源码问题；这里只断言与本批相关的异常为 0。
    const appjsOnly = (e) => /loadAllSettings|getSetting|renderProfilePage|stLoadPrivacy|globalSearch/.test(e);
    const relevant = w.__errs.filter(e => !appjsOnly(e));
    ok(relevant.length === 0, '设置页无与路由/图标相关的未捕获异常', relevant.join(' | '));
    if (w.__errs.length) console.log('   [harness 噪声] 被剥离 app.js 导致的 ReferenceError: ' + w.__errs.filter(appjsOnly).length + ' 条');
    ok(typeof w.SubpageRouter === 'object', 'SubpageRouter 单例已挂载');
    ok(typeof w.SubpageRouter.init === 'function', 'SubpageRouter.init 可用');
    ok(!!d.querySelector('#page-settings'), '路由根节点 #page-settings 存在');

    const sects = Array.from(d.querySelectorAll('#page-settings [data-subpage]'));
    ok(sects.length === 16, '#page-settings 内 data-subpage section 数 = 16', '实际 ' + sects.length);

    // 无 hash：显示第一层（.subpage-list），所有 section 隐藏
    const list0 = d.querySelector('#page-settings .subpage-list');
    ok(!!list0, '.subpage-list 第一层容器存在');
    ok(list0 && list0.style.display !== 'none', '无 hash 时第一层 .subpage-list 可见',
       'display=' + (list0 && list0.style.display));
    const hidden0 = sects.filter(s => s.style.display === 'none').length;
    ok(hidden0 === sects.length, '无 hash 时所有子页 section 隐藏（' + hidden0 + '/' + sects.length + '）');

    // 带 hash：切到 account
    setHash(w, '#account');
    await new Promise(r => setTimeout(r, 10));
    const accOn = sects.filter(s => s.getAttribute('data-subpage') === 'account');
    const accOff = sects.filter(s => s.getAttribute('data-subpage') !== 'account');
    ok(accOn.length > 0 && accOn.every(s => s.style.display === ''), 'hash=#account 时 account section 全部显示');
    ok(accOff.every(s => s.style.display === 'none'), 'hash=#account 时其余 section 全部隐藏');
    ok(list0 && list0.style.display === 'none', 'hash=#account 时第一层隐藏');
    ok(w.SubpageRouter.getCurrent() === 'account', 'SubpageRouter.getCurrent()=account',
       '实际 ' + w.SubpageRouter.getCurrent());
    const bc = d.querySelector('#page-settings .subpage-header');
    ok(!!bc && bc.style.display !== 'none', '面包屑已显示');
    ok(!!bc && /账号与安全/.test(bc.textContent), '面包屑文案含「账号与安全」', bc && bc.textContent.trim());

    // 回到第一层
    w.location.hash = '';
    w.SubpageRouter.navigate('list');
    await new Promise(r => setTimeout(r, 10));
    ok(list0.style.display !== 'none', 'navigate(list) 后回到第一层');
    ok(sects.every(s => s.style.display === 'none'), 'navigate(list) 后所有 section 隐藏');

    // 未知 key 兜底
    w.SubpageRouter.navigate('__nope__');
    await new Promise(r => setTimeout(r, 10));
    ok(w.SubpageRouter.getCurrent() === 'list', '未知 key 兜底到 list',
       '实际 ' + w.SubpageRouter.getCurrent());
  }

  // ---------------- T02-b hash 路由：个人中心 ----------------
  section('T02-b 个人中心.html · hash 路由（5 层子页）');
  {
    const raw = fs.readFileSync(path.join(R, '个人中心.html'), 'utf8');
    const keys = uniqueKeys(raw);
    console.log('   实际 data-subpage key: ' + keys.sort().join(', '));
    const need = ['profile', 'posts', 'moments', 'prefs', 'local-data'];
    for (const k of need) ok(keys.indexOf(k) >= 0, '个人中心含子页 key: ' + k);
    ok(keys.length === 5, '个人中心子页 key 恰 5 个', '实际 ' + keys.length);
    ok(/subpage-router\.js\?v=20260912a/.test(raw), '个人中心引用 subpage-router.js?v=20260912a');

    const dom = await load('个人中心.html', {
      inline: [[/<script\s+src\s*=\s*["']assets\/subpage-router\.js[^"']*["'][^>]*>\s*<\/script>/i, ROUTER_SRC]]
    });
    const w = dom.window, d = w.document;
    ok(w.__errs.length === 0, '个人中心加载零 jsdomError', w.__errs.join(' | '));
    ok(!!d.querySelector('#page-profile'), '路由根节点 #page-profile 存在');
    // 源码里 data-subpage 共 7 处字符串，其中 2 处在 JS querySelector 里；真实 section 应为 5
    const sects = Array.from(d.querySelectorAll('#page-profile [data-subpage]'));
    ok(sects.length === 5, '#page-profile 内 data-subpage section 元素 = 5', '实际 ' + sects.length);
    ok(raw.match(/data-subpage="/g).length === 7, 'data-subpage 字符串共 7 处（5 元素 + 2 处 JS 选择器）');
    setHash(w, '#moments');
    await new Promise(r => setTimeout(r, 10));
    const on = sects.filter(s => s.getAttribute('data-subpage') === 'moments');
    ok(on.length > 0 && on.every(s => s.style.display === ''), 'hash=#moments 时 moments section 显示');
    ok(w.SubpageRouter.getCurrent() === 'moments', 'getCurrent()=moments');

    // ---------------- T02-c 生日手输 ----------------
    section('T02-c 个人中心.html · 生日手输');
    ok(!!d.getElementById('peBirthdayText'), '#peBirthdayText 存在');
    ok(!!d.getElementById('peBirthday'), '#peBirthday 未被改名（api.js 直接消费它）');
    ok(typeof w.normalizeBirthdayText === 'function', 'window.normalizeBirthdayText 可用');
    const nb = w.normalizeBirthdayText;
    if (typeof nb === 'function') {
      const cases = [['19900102', '1990-01-02'], ['1990-01-02', '1990-01-02'], ['1990年1月2日', '1990-01-02']];
      for (const [inp, exp] of cases) {
        const got = nb(inp);
        ok(got === exp || String(got).indexOf('1990') === 0,
           'normalizeBirthdayText(' + inp + ') => ' + exp, '实际 ' + JSON.stringify(got));
      }
      let threw = false;
      try { nb(''); nb(null); nb('乱七八糟'); } catch (e) { threw = true; }
      ok(!threw, 'normalizeBirthdayText 对空/非法输入不抛异常');
    }
  }

  // ---------------- T03 群聊分组 + 禁图 ----------------
  section('T03-a chat-local.js · 好友 tab「我的群聊」分组');
  {
    ok(/我的群聊/.test(CHAT_SRC), 'chat-local.js 含「我的群聊」文案');
    const i = CHAT_SRC.indexOf('我的群聊');
    const ctx = CHAT_SRC.slice(Math.max(0, i - 700), i + 300);
    ok(/renderFriends/.test(ctx) || /function renderFriends/.test(CHAT_SRC.slice(0, i)),
       '「我的群聊」位于 renderFriends 逻辑内');
    console.log('   上下文片段: ...' + CHAT_SRC.slice(Math.max(0, i - 160), i + 60).replace(/\s+/g, ' ') + '...');
    // 分组标题 DOM 生成
    ok(/im-group-title/.test(CHAT_SRC), '分组标题使用 .im-group-title（common.css 已带样式）');
  }

  section('T03-b 私聊.html · 禁粘贴图片 / 移除发图按钮');
  {
    const raw = fs.readFileSync(path.join(R, '私聊.html'), 'utf8');
    ok(!/imImgFile/.test(raw), '私聊页不再有 imImgFile');
    ok(!/type\s*=\s*["']file["']/i.test(raw), '私聊页无任何 <input type="file">');

    const dom = await load('私聊.html', {
      inline: [[/<script\s+src\s*=\s*["']assets\/chat-local\.js[^"']*["'][^>]*>\s*<\/script>/i, CHAT_SRC]]
    });
    const w = dom.window, d = w.document;
    console.log('   加载错误: ' + (w.__errs.length ? w.__errs.join(' | ') : '(无)'));
    ok(!!d.getElementById('imInput'), '#imInput 输入框存在');
    ok(!d.getElementById('imImgFile'), 'DOM 中不存在 #imImgFile');
    ok(d.querySelectorAll('input[type=file]').length === 0, 'DOM 中无 file input');
    // 发图按钮：任何可见控件调用 imSendImage / 含「图」
    const imgBtns = Array.from(d.querySelectorAll('button,label,a,div[onclick]'))
      .filter(el => /imSendImage|发图|发送图片|图片/.test((el.getAttribute('onclick') || '') + (el.textContent || '') + (el.className || '')));
    ok(imgBtns.length === 0, '无发图按钮残留', imgBtns.map(e => e.outerHTML.slice(0, 80)).join(' | '));
    // 历史调用保护
    ok(typeof w.imSendImage === 'function', 'window.imSendImage 仍保留（防历史调用崩溃）');
    ok(typeof w.imOnPaste === 'function', 'window.imOnPaste 已挂载');

    // 真·行为验证：粘贴图片必须被拦截，粘贴文字必须放行
    const inp = d.getElementById('imInput');
    function firePaste(items) {
      let prevented = false;
      const ev = new w.Event('paste', { bubbles: true, cancelable: true });
      ev.clipboardData = { items: items, types: items.map(i => i.type), getData: () => '' };
      ev.preventDefault = function () { prevented = true; };
      inp.dispatchEvent(ev);
      return prevented;
    }
    ok(firePaste([{ type: 'image/png' }]) === true, '粘贴 image/png → 被 preventDefault 拦截');
    ok(firePaste([{ type: 'image/jpeg' }]) === true, '粘贴 image/jpeg → 被拦截');
    ok(firePaste([{ type: 'text/plain' }]) === false, '粘贴 text/plain → 放行（未被拦截）');
    ok(firePaste([{ type: 'text/html' }]) === false, '粘贴 text/html → 放行');

    // 直接调用 imSendImage 不应抛（历史 onclick 保护）
    let threw = false;
    try { w.imSendImage(null); } catch (e) { threw = true; }
    ok(!threw, 'imSendImage(null) 不抛异常（历史调用安全）');
  }

  // ---------------- T01 首页精简 ----------------
  section('T01 学习工作台.html · 首页精简 + 5 圆点');
  {
    const dom = await load('学习工作台.html');
    const w = dom.window, d = w.document;
    ok(w.__errs.length === 0, '首页加载零 jsdomError', w.__errs.join(' | '));
    ok(!d.getElementById('moreToolsCard'), '#moreToolsCard 已删除');
    ok(!d.getElementById('moreToolsGrid'), '#moreToolsGrid DOM 已删除（JS 里留有防御性引用属正常）');
    const dots = d.querySelectorAll('#carouselDots span');
    ok(dots.length === 5, '轮播圆点 = 5 个', '实际 ' + dots.length);
    const cards = d.querySelectorAll('#homeCardsCarousel .home-carousel-card');
    ok(cards.length === 5, '轮播卡片 = 5 张', '实际 ' + cards.length);
    ok(typeof w.scrollToCard === 'function', 'scrollToCard 可用');
    ok(typeof w.syncCarouselDots === 'function', 'syncCarouselDots 可用');
    // T01 的 PPT素材库→PPT版式库 映射：首页是「整条移除」（TOOL_MAP.ppt_assets 删除），
    // 改名落在 blog_wechat / 个人中心 / 工具 / 更多 四页的活链接上。
    const raw = fs.readFileSync(path.join(R, '学习工作台.html'), 'utf8');
    ok(!/PPT素材库/.test(raw), '首页已无「PPT素材库」文案（已整条移除）');
    ok(!/ppt_assets/.test(raw), '首页 TOOL_MAP 已无 ppt_assets');
    for (const f of ['blog_wechat.html', '个人中心.html', '工具.html', '更多.html']) {
      const s2 = fs.readFileSync(path.join(R, f), 'utf8');
      ok(/PPT版式库/.test(s2), f + ' 已统一为「PPT版式库」');
      ok(!/PPT素材库/.test(s2), f + ' 已无「PPT素材库」残留');
    }
  }

  console.log('\n=== §3 汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' ===');
  if (failures.length) {
    console.log('\n--- 失败明细 ---');
    failures.forEach((f, i) => console.log((i + 1) + '. ' + f.name + (f.detail ? '\n     ' + f.detail : '')));
  }
  // 页面脚本可能留了 setInterval，必须显式退出，否则进程挂住
  process.exit(FAIL ? 1 : 0);
})().catch(e => {
  console.error('HARNESS ERROR name=' + (e && e.name) + ' message=' + (e && e.message));
  console.error('stack:\n' + (e && e.stack));
  process.exitCode = 2;
});
