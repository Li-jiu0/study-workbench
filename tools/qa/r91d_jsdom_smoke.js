/* R91-D jsdom assert: fold row exists (collapsed default), expands on click,
   cur label syncs with selected chip; 筛选 foldrow regression still works.
   ASCII-only source; Chinese via \uXXXX escapes. Report: r91d_jsdom_report.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const OUT = path.join(ROOT, 'tools', 'qa', 'r91d_jsdom_report.txt');
const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const T_REMAIN = '\u5269\u4f59\u53ef\u7528\u91cf\uff08\u5c11 \u2192 \u591a\uff09'; // 剩余可用量（少 → 多）
const T_NAME = '\u6a21\u578b\u540d\u79f0';                                         // 模型名称

(async function main() {
  const vc = new VirtualConsole();
  const consoleErrors = [];
  vc.on('error', () => consoleErrors.push(Array.prototype.slice.call(arguments).join(' ')));
  vc.on('jsdomError', e => { if (!/navigation/i.test(String(e && e.message))) consoleErrors.push('jsdom:' + String(e && e.message)); });

  const dom = new JSDOM('<!DOCTYPE html><html><body>' +
    '<button id="setTabAbout"></button>' +
    '<div id="setPanelAbout" class="active"></div>' +
    '</body></html>', { url: 'file:///qa/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  win.fetch = function () { return Promise.reject(new Error('qa-stub-network')); };
  win.XT_AI_USAGE = { list: function () { return []; }, formatNum: function (n) { return String(n); } };

  const code = fs.readFileSync(path.join(ROOT, 'assets', 'xt-aiusage.js'), 'utf8');
  try { win.eval(code); } catch (e) { w('SCRIPT EXCEPTION ' + (e && e.stack || e)); }
  await wait(600); // scheduleRender(0) + mount

  const doc = win.document;
  const tog = doc.querySelector('#UsageQuotaSortToggle');
  const fold = doc.querySelector('#UsageQuotaSortFold');
  const cur = doc.querySelector('#UsageQuotaSortCur');
  const bar = doc.querySelector('#UsageQuotaSortBar');

  const res = {
    toggleExists: !!tog,
    foldExists: !!fold,
    curExists: !!cur,
    barInsideFold: !!bar && !!fold && fold.contains(bar),
    chipsCount: bar ? bar.querySelectorAll('[data-quota-sort]').length : 0,
    initCollapsed: !!tog && String(tog.className).indexOf('open') === -1 && !!fold && String(fold.className).indexOf('open') === -1,
    initCurLabel: cur ? cur.textContent : '',
    ariaInit: tog ? tog.getAttribute('aria-expanded') : ''
  };
  w('[init] ' + JSON.stringify(res));

  // expand
  tog.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const expanded = String(tog.className).indexOf('open') !== -1 &&
    String(fold.className).indexOf('open') !== -1 &&
    tog.getAttribute('aria-expanded') === 'true';
  w('[expand] open=' + expanded);

  // pick "模型名称" chip → cur label syncs
  const chip = bar.querySelector('[data-quota-sort="name"]');
  chip.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(300);
  const curAfter = cur.textContent;
  w('[chip] curLabel=' + JSON.stringify(curAfter) + ' expect=' + JSON.stringify(T_NAME));

  // collapse again
  tog.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const collapsedAgain = String(tog.className).indexOf('open') === -1 &&
    String(fold.className).indexOf('open') === -1 &&
    tog.getAttribute('aria-expanded') === 'false';

  // regression: 筛选 foldrow still works
  const ftog = doc.querySelector('#UsageQuotaFilterToggle');
  const ffold = doc.querySelector('#UsageQuotaFilterFold');
  let filterFoldOk = false;
  if (ftog && ffold) {
    ftog.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    filterFoldOk = String(ftog.className).indexOf('open') !== -1 && String(ffold.className).indexOf('open') !== -1;
  }
  w('[regression] collapseAgain=' + collapsedAgain + ' filterFoldOpen=' + filterFoldOk + ' consoleErrors=' + JSON.stringify(consoleErrors.slice(0, 5)));

  const pass = res.toggleExists && res.foldExists && res.curExists && res.barInsideFold &&
    res.chipsCount === 5 && res.initCollapsed && res.initCurLabel === T_REMAIN &&
    res.ariaInit === 'false' && expanded && curAfter === T_NAME && collapsedAgain &&
    filterFoldOk && consoleErrors.length === 0;
  w('JSDOM_ALL => ' + (pass ? 'PASS' : 'FAIL'));
  win.close();
  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('done');
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
