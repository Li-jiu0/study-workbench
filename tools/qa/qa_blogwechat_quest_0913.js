/* =====================================================================
 * qa_blogwechat_quest_0913.js —— blog_wechat.html「穿越英语」死链修复验证
 *   修复：:344 裸调 openQuest()（该页未加载 quest.js）→ 守卫兜底跳 工具.html
 * 断言：
 *   1. 页面真加载零关键异常
 *   2. window.openQuest 未定义（本页确实无 quest.js）
 *   3. 点击「穿越英语」无 JS 异常（ReferenceError 消失）
 *   4. 兜底导航触发（jsdom 记录 Not implemented: navigation）
 * 运行：node tools/qa/qa_blogwechat_quest_0913.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'tools', 'verifier', 'node_modules', 'jsdom'));

let PASS = 0, FAIL = 0;
const failures = [];
function ok(c, name, detail) {
  if (c) { PASS++; console.log('  [PASS] ' + name); }
  else { FAIL++; failures.push({ name, detail: detail || '' }); console.log('  [FAIL] ' + name + (detail ? '  << ' + String(detail).slice(0, 200) : '')); }
}

(async function main() {
  const errs = [];
  const navNotices = [];
  // jsdom 导航意图有时以 promise rejection(DOMException) 形式冒出，捕获归类而不是崩进程
  process.on('unhandledRejection', (r) => {
    const msg = String((r && (r.message || r)) || r);
    if (/Not implemented|navigation/i.test(msg)) navNotices.push('unhandledRejection: ' + msg);
    else errs.push('unhandledRejection: ' + msg.slice(0, 200));
  });

  const src = fs.readFileSync(path.join(ROOT, 'blog_wechat.html'), 'utf8');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const msg = String((e && e.message) || e);
    if (/Could not load|Could not parse CSS/.test(msg)) return;      // 资源噪声
    if (/Not implemented: navigation/.test(msg)) { navNotices.push(msg); return; } // 导航意图单独记录
    errs.push('jsdomError: ' + msg.slice(0, 200));
  });
  vc.on('error', (...a) => { const s = a.map(String).join(' '); if (!/XT-BOUNDARY/.test(s)) errs.push('console.error: ' + s.slice(0, 200)); });

  const fileUrl = 'file:///' + encodeURI(path.join(ROOT, 'blog_wechat.html').replace(/\\/g, '/'));
  const dom = new JSDOM(src, {
    url: fileUrl,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      const noop = function () {};
      if (!w.Element.prototype.scrollTo) w.Element.prototype.scrollTo = noop;
      if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = noop;
      if (!w.HTMLElement.prototype.scrollIntoView) w.HTMLElement.prototype.scrollIntoView = noop;
      if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop });
      if (!w.fetch) w.fetch = () => Promise.reject(new Error('offline'));
      // file:// 不透明源下 jsdom localStorage 抛 SecurityError → 安装 Map 版兜底（与 qa_t04t05_0912_smoke 同款）
      let avail = false;
      try { void w.localStorage; avail = true; } catch (e) { avail = false; }
      if (!avail) {
        const store = new Map();
        const fake = {
          getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
          setItem: (k, v) => { store.set(String(k), String(v)); },
          removeItem: k => { store.delete(String(k)); },
          clear: () => store.clear(),
          key: i => Array.from(store.keys())[i] || null,
          get length() { return store.size; }
        };
        try { Object.defineProperty(w, 'localStorage', { value: fake, configurable: true, writable: true }); } catch (e) {}
      }
      try { w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa_user', loginAt: Date.now() })); } catch (e) {}
    }
  });
  const w = dom.window;
  w.confirm = () => true;
  await new Promise(res => {
    if (w.document.readyState === 'complete') return res();
    w.addEventListener('load', () => res());
    setTimeout(res, 9000);
  });
  await new Promise(r => setTimeout(r, 800));

  ok(errs.length === 0, 'BW-1 blog_wechat.html 真加载零关键异常', errs.join(' | '));
  ok(typeof w.openQuest === 'undefined', 'BW-2 本页未加载 quest.js（window.openQuest 未定义，守卫写法为正确方案）');
  ok(/onclick="if\(window\.openQuest\)\{openQuest\(\)\}else\{location\.href='工具\.html'\};toggleToolsPanel\(\)"/.test(src),
    'BW-3 静态：onclick 已为守卫兜底写法（与 工具.html/更多.html 一致）');

  const questItem = Array.from(w.document.querySelectorAll('.bottom-more-item'))
    .find(c => (c.textContent || '').indexOf('穿越英语') >= 0);
  ok(!!questItem, 'BW-4 「穿越英语」工具项存在');
  if (questItem) {
    const before = navNotices.length;
    let threw = null;
    try { questItem.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
    catch (e) { threw = e.message; }
    await new Promise(r => setTimeout(r, 120));
    ok(!threw, 'BW-5 点击无 JS 异常（原裸调会 ReferenceError）', threw || '');
    ok(navNotices.length > before, 'BW-6 兜底导航已触发（location.href → 工具.html）');
  }

  console.log('\n=== blog_wechat 死链修复验证: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' ===');
  if (failures.length) failures.forEach((x, i) => console.log((i + 1) + '. ' + x.name + (x.detail ? '\n     ' + x.detail : '')));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e && e.stack || e); process.exit(2); });
