/* R91-E jsdom assert: #UsageQuotaSortSel dropdown replaces fold shell.
   Assert: select exists w/ 5 options matching old chips, value backfilled from
   state (remaining), change works, old toggle/fold/bar ids gone, no errors.
   ASCII-only source; Chinese via \uXXXX escapes. Report: r91e_jsdom_report.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const OUT = path.join(ROOT, 'tools', 'qa', 'r91e_jsdom_report.txt');
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
  await wait(600);

  const doc = win.document;
  const sel = doc.querySelector('#UsageQuotaSortSel');
  const res = {
    selExists: !!sel,
    isSelect: !!sel && sel.tagName === 'SELECT',
    inSelectrow: !!sel && !!sel.closest && !!sel.closest('.xt-us-selectrow'),
    optCount: sel ? sel.options.length : 0,
    firstOptText: sel && sel.options[0] ? sel.options[0].textContent : '',
    nameOptText: sel && sel.options[4] ? sel.options[4].textContent : '',
    backfillValue: sel ? sel.value : '',
    noSelectedAttr: sel ? sel.innerHTML.indexOf('selected') === -1 : false,
    oldToggleGone: !doc.querySelector('#UsageQuotaSortToggle') && !doc.querySelector('#UsageQuotaSortFold') &&
                   !doc.querySelector('#UsageQuotaSortCur') && !doc.querySelector('#UsageQuotaSortBar'),
    filterFoldStillThere: !!doc.querySelector('#UsageQuotaFilterToggle') && !!doc.querySelector('#UsageQuotaFilterFold'),
    sortSelStillThere: !!doc.querySelector('#UsageSortSel')
  };
  w('[init] ' + JSON.stringify(res));

  // change → no error, value applied (renderAll backfills the same value)
  let changeOk = false;
  if (sel) {
    sel.value = 'name';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(400);
    changeOk = sel.value === 'name' && consoleErrors.length === 0;
  }
  w('[change] valueAppliedNoError=' + changeOk + ' consoleErrors=' + JSON.stringify(consoleErrors.slice(0, 5)));

  const pass = res.selExists && res.isSelect && res.inSelectrow && res.optCount === 5 &&
    res.firstOptText === T_REMAIN && res.nameOptText === T_NAME && res.backfillValue === 'remaining' &&
    res.noSelectedAttr && res.oldToggleGone && res.filterFoldStillThere && res.sortSelStillThere &&
    changeOk && consoleErrors.length === 0;
  w('JSDOM_ALL => ' + (pass ? 'PASS' : 'FAIL'));
  win.close();
  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('done');
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
