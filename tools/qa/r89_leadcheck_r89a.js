/* R89-A jsdom assertions for Task2 (AI chat history cleanup honesty + local mgmt).
 * Run: NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r89_leadcheck_r89a.js
 */
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var ROOT = path.resolve(__dirname, '..', '..');
var html = fs.readFileSync(path.join(ROOT, '个人资料.html'), 'utf8');
var js = fs.readFileSync(path.join(ROOT, 'assets', 'xt-profile.js'), 'utf8');

var pass = 0, fail = 0, fails = [];
function ok(c, n) { if (c) { pass++; } else { fail++; fails.push(n); } }

var dom = new JSDOM(html, {
  url: 'http://localhost/个人资料.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
var win = dom.window, doc = win.document;

var SESSIONS = [
  { id: 'chat_a', title: '会话甲', createdAt: 1700000000000, updatedAt: 1700000100000,
    messages: [{ role: 'user', content: '你好A' }, { role: 'assistant', content: '回复A' }] },
  { id: 'chat_b', title: '会话乙', createdAt: 1700001000000, updatedAt: 1700001100000,
    messages: [{ role: 'user', content: '你好B' }] }
];
win.localStorage.setItem('ai_chat_history', JSON.stringify(SESSIONS));
win.localStorage.setItem('study_workbench_token', '');   // guest → no network
win.matchMedia = win.matchMedia || function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; };
win.history.pushState = function () {};
try { win.eval(js); } catch (e) { console.log('EVAL_ERROR: ' + (e && e.message)); }

function tick(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function openChat() {
  try { win.xtpOpenView('chat'); } catch (e) {}
  return !!doc.querySelector('#xtpChatBody');
}

(async function () {
  ok(openChat(), 'A1 chat subview opened');
  await tick(60);   // let fetchAiChat resolve + paintChat run

  var body = doc.querySelector('#xtpChatBody');
  ok(!!body, 'A2 xtpChatBody exists');

  var cards = doc.querySelectorAll('.xtp-m5-card');
  ok(cards.length === 2, 'A3 rendered 2 local session cards (got ' + cards.length + ')');
  ok(!!doc.querySelector('#xtpM5GoAi'), 'A4 go-to-AI-page button rendered');
  ok(!!doc.querySelector('.xtp-m5-quicktip'), 'A5 quick-tip rendered');

  // Source honesty assertions
  ok(js.indexOf('暂无本机 AI 对话记录。在 AI 问答页对话后会自动出现在这里。') < 0,
     'B1 old misleading empty text removed');
  ok(js.indexOf('已清空本机会话，服务端记录仍保留') >= 0, 'B2 toast: server retained');
  ok(js.indexOf('服务端记录不受影响') >= 0, 'B3 confirm: server unaffected');
  ok(js.indexOf('本页暂不支持删除') >= 0, 'B4 server area non-deletable notice');
  ok(js.indexOf("location.href = 'AI.html'") >= 0, 'B5 shortcut targets AI.html');
  ok(fs.existsSync(path.join(ROOT, 'AI.html')), 'B6 AI.html exists');
  ok(js.indexOf('服务端还有') >= 0 && js.indexOf('暂不支持在本页删除') >= 0,
     'B7 empty-local/server-present honest text present');

  // ---- single delete via DOM ----
  var cardsNow = doc.querySelectorAll('.xtp-m5-card');
  var didDelete = false;
  if (cardsNow.length) {
    var del = cardsNow[0].querySelector('.xtpM5Del');
    if (del) {
      del.click();
      var okBtn = doc.querySelector('#xtpConfirmOk');
      if (okBtn) { okBtn.click(); didDelete = true; }
    }
  }
  ok(didDelete, 'C1 single-delete click + confirm available');
  var afterDel = JSON.parse(win.localStorage.getItem('ai_chat_history') || '[]');
  ok(afterDel.length === 1, 'C2 after single delete 1 remains (got ' + afterDel.length + ')');

  // ---- regression: clear-all ----
  await tick(30);
  var clr = doc.querySelector('#xtpM5ClearAll');
  var clearDone = false;
  if (clr) {
    clr.click();
    var okBtn2 = doc.querySelector('#xtpConfirmOk');
    if (okBtn2) { okBtn2.click(); clearDone = true; }
  }
  var raw = win.localStorage.getItem('ai_chat_history');
  var removed = (raw === null) || (raw === '[]') || (JSON.parse(raw).length === 0);
  ok(clearDone && removed, 'C3 clear-all removed ai_chat_history (raw=' + raw + ')');

  // ---- D: P1 regression — filter yields 0 but local exists → annotated empty + reset escape ----
  // Seed OLD sessions (~1 year ago) so range=today/d7 filters them all out.
  var oldTs = Date.now() - 400 * 86400000;
  win.localStorage.setItem('ai_chat_history', JSON.stringify([
    { id: 'old_a', title: '旧会话甲', createdAt: oldTs, updatedAt: oldTs, messages: [{ role: 'user', content: '旧A' }] },
    { id: 'old_b', title: '旧会话乙', createdAt: oldTs + 1000, updatedAt: oldTs + 1000, messages: [{ role: 'user', content: '旧B' }] }
  ]));
  win.xtpOpenView('chat');
  await tick(60);
  // switch range to 近7天 via the select
  var rangeSel = doc.querySelector('#xtpM5Range');
  ok(!!rangeSel, 'D1 range select present');
  if (rangeSel) {
    rangeSel.value = 'd7';
    rangeSel.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  await tick(40);
  var cardsD = doc.querySelectorAll('.xtp-m5-card');
  var emptyEl = doc.querySelector('.xtp-empty');
  var emptyTxt = emptyEl ? emptyEl.textContent : '';
  var resetBtn = doc.querySelector('#xtpM5ResetFilter');
  ok(cardsD.length === 0, 'D2 range=近7天 filters out old sessions (cards=' + cardsD.length + ')');
  ok(emptyTxt.indexOf('当前筛选') >= 0 && emptyTxt.indexOf('近 7 天') >= 0,
     'D3 empty tip annotates active filter (got: ' + emptyTxt.slice(0, 60) + ')');
  ok(!!resetBtn, 'D4 reset-filter escape button rendered');
  // click reset → range back to all → cards reappear
  if (resetBtn) {
    resetBtn.click();
    await tick(40);
    var cardsAfterReset = doc.querySelectorAll('.xtp-m5-card');
    ok(cardsAfterReset.length === 2, 'D5 reset restores all local cards (got ' + cardsAfterReset.length + ')');
  } else {
    ok(false, 'D5 skipped (no reset button)');
  }

  console.log('PASS ' + pass + '/' + (pass + fail));
  if (fail) { console.log('FAILED: ' + fails.join(' | ')); }
  process.exit(fail ? 1 : 0);
})();
