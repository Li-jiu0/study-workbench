/* R4-D / C7 jsdom E2E: 证明「加载失败 → 点击重试」在断网/500 下真实可用。
   用法: node tools/qa/_r4d_c7_test.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const results = [];

function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  :: ' + detail : ''));
}

/* 构造一个只运行「目标页面内联脚本」的 jsdom，注入可控 fetch。 */
function runPage(file, scriptFilter, fetchImpl) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'http://localhost/' + encodeURIComponent(file)
  });
  const win = dom.window;
  // 关键全局依赖（页面外链脚本我们用桩替代，聚焦本页内联逻辑）
  win.fetch = fetchImpl;
  win.localStorage.setItem('study_workbench_token', 'TESTTOKEN');
  win.localStorage.setItem('study_workbench_uid', '1');
  win.STUDY_API_BASE = 'http://api.test';
  win.showToast = function () {};
  win.toast = function () {};
  // 运行内联脚本
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!scriptFilter || scriptFilter(m[1])) scripts.push(m[1]);
  }
  for (const s of scripts) {
    try { win.eval(s); } catch (e) { errs.push('eval: ' + e.message); }
  }
  return { dom, win, errs };
}

function tick(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async function main() {
  /* ============ 1) 好友申请.html — 收到申请列表 失败→重试 ============ */
  {
    let calls = 0;
    let mode = 'fail';
    const fetchImpl = function () {
      calls++;
      if (mode === 'fail') return Promise.reject(new Error('网络不可用，请检查网络连接'));
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ incoming: [] })
      });
    };
    const { dom, win, errs } = runPage('好友申请.html', (s) => s.indexOf('loadRequests') >= 0 || s.indexOf('xtListError') >= 0, fetchImpl);
    await tick(60);
    const reqBox = win.document.getElementById('requests');
    const errState = reqBox && reqBox.querySelector('.xt-list-state-error');
    const retryBtn = reqBox && reqBox.querySelector('[data-xt-retry]');
    log('好友申请 失败态渲染', !!errState, errState ? errState.textContent.slice(0, 40) : 'no .xt-list-state-error');
    log('好友申请 失败态含重试按钮', !!retryBtn);
    // 点击重试 → 切到成功（空态）
    mode = 'ok';
    const before = calls;
    if (retryBtn) retryBtn.click();
    await tick(60);
    log('好友申请 点重试后再次请求', calls > before, 'calls ' + before + ' -> ' + calls);
    const emptyState = reqBox && reqBox.querySelector('.xt-list-state-empty');
    log('好友申请 重试后进入空态', !!emptyState, emptyState ? emptyState.textContent.slice(0, 30) : 'no empty');
    if (errs.length) console.log('   [jsdom errs] ' + errs.slice(0, 3).join(' | '));
    dom.window.close();
  }

  /* ============ 2) 个人中心.html — 我的动态 失败→重试 ============ */
  {
    let calls = 0;
    let mode = 'fail';
    const fetchImpl = function () {
      calls++;
      if (mode === 'fail') return Promise.reject(new Error('网络超时，请检查网络后重试'));
      // 第一次 /api/auth/me
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(calls % 2 === 1 ? { id: 1 } : { items: [] })
      });
    };
    const html = fs.readFileSync(path.join(ROOT, '个人中心.html'), 'utf8');
    const vc = new VirtualConsole();
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/x' });
    const win = dom.window;
    win.fetch = fetchImpl;
    win.localStorage.setItem('study_workbench_token', 'T');
    win.STUDY_API_BASE = 'http://api.test';
    win.showToast = function () {}; win.uiConfirm = function () { return Promise.resolve(false); };
    // 仅运行含 loadMyMoments 的内联脚本块
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let mm; const blocks = [];
    while ((mm = re.exec(html))) if (mm[1].indexOf('loadMyMoments') >= 0) blocks.push(mm[1]);
    for (const s of blocks) { try { win.eval(s); } catch (e) { console.log('   eval err', e.message); } }
    await tick(60);
    const box = win.document.getElementById('myMomentsBody');
    const errState = box && box.querySelector('.xt-list-state-error');
    log('个人中心 失败态渲染', !!errState, errState ? errState.textContent.slice(0, 40) : 'no error');
    const retryBtn = box && box.querySelector('[data-xt-retry]');
    log('个人中心 失败态含重试按钮', !!retryBtn);
    log('个人中心 失败态文案来自真实错误', !!(errState && /超时|网络|失败/.test(errState.textContent)));
    dom.window.close();
  }

  /* ============ 3) 个人中心.html — 后端 500 → 失败态 ============ */
  {
    const fetchImpl = function () {
      return Promise.resolve({
        ok: false, status: 500,
        json: () => Promise.resolve({ detail: 'Internal Server Error' })
      });
    };
    const html = fs.readFileSync(path.join(ROOT, '个人中心.html'), 'utf8');
    const vc = new VirtualConsole();
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/x' });
    const win = dom.window;
    win.fetch = fetchImpl;
    win.localStorage.setItem('study_workbench_token', 'T');
    win.STUDY_API_BASE = 'http://api.test';
    win.showToast = function () {}; win.uiConfirm = function () { return Promise.resolve(false); };
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let mm; const blocks = [];
    while ((mm = re.exec(html))) if (mm[1].indexOf('loadMyMoments') >= 0) blocks.push(mm[1]);
    for (const s of blocks) { try { win.eval(s); } catch (e) { /* ignore */ } }
    await tick(60);
    const box = win.document.getElementById('myMomentsBody');
    const errState = box && box.querySelector('.xt-list-state-error');
    log('个人中心 后端500→失败态(非空态)', !!errState, errState ? errState.textContent.slice(0, 50) : 'no error');
    dom.window.close();
  }

  console.log('\n==== SUMMARY ====');
  const bad = results.filter((r) => !r.ok);
  console.log('total=' + results.length + ' pass=' + (results.length - bad.length) + ' fail=' + bad.length);
  console.log('IS_PASS: ' + (bad.length === 0 ? 'YES' : 'NO'));
  process.exit(bad.length === 0 ? 0 : 1);
})();
