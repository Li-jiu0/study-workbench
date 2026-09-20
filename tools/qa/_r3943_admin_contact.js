// ===================================================================
// R43 独立证伪回归（第二层 QA）—— assets/admin-contact.js
// 联系管理员入口未读角标：取值来源 / 0 与 null 隐藏 / >99 → 99+ /
// 打开面板清零 / 5s 轮询 document.hidden 跳过 / 无 token 隐藏。
// 输出写 tools/qa/_r3943_admin_contact.txt
// ===================================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
const acjs = fs.readFileSync(path.join(ROOT, 'assets/admin-contact.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

let __fetchImpl = function () { return Promise.resolve({ ok: false, status: 403, json: function () { return Promise.resolve({}); } }); };
w.__setFetch = function (fn) { __fetchImpl = fn; };
w.fetch = function () { return __fetchImpl.apply(null, arguments); };
w.__calls = [];
w.__intervals = [];
w.__hidden = false;
Object.defineProperty(w.document, 'hidden', { configurable: true, get: function () { return w.__hidden; } });
w.setInterval = function (fn, ms) { w.__intervals.push({ ms: ms, fn: fn }); return w.__intervals.length; };
w.clearInterval = function () {};

// 预置：已登录 + 已知管理员 id（跳过 /api/admin/contact）
w.localStorage.setItem('study_workbench_token', 'tok-r43');
w.localStorage.setItem('xt_admin_user_id', '6');

w.eval(acjs);

function bootIfNeeded(done) {
  var has = (w.__intervals || []).some(function (x) { return x.ms === 5000; });
  if (has) { done(); return; }
  try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) { /* ignore */ }
  setTimeout(done, 60);
}

const H = [];
function L(s) { H.push(s); }
L(';');
L('(async function(){');
L('  var R = [];');
L('  async function ckA(name, fn){ try { await fn(); R.push("PASS " + name); } catch(e){ R.push("FAIL " + name + " :: " + e.message); } }');
L('  function a(cond, msg){ if(!cond) throw new Error(msg); }');
L('  function ok(body){ return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve(body); } }); }');
L('  function tick(ms){ return new Promise(function(r){ setTimeout(r, ms||50); }); }');
L('  function badge(){ return document.getElementById("acEntryBadge"); }');
L('  function badgeState(){ var b = badge(); if(!b) return "NO-BADGE-EL"; return { text: b.textContent, display: b.style.display }; }');
L('  var pollFn = null;');
L('  (function(){ var f = (window.__intervals||[]).filter(function(x){ return x.ms === 5000; }); if (f.length) pollFn = f[0].fn; })();');
L('  function setFetch(fn){ window.__setFetch(function(url){ window.__calls.push(String(url)); return fn(url); }); }');
L('  var markedRead = false;');
L('');
L('  // 场景A：未读 peerId===adminId(6) count=3 → 角标显示 3');
L('  await ckA("R43_badge_from_unread_adminPeer", async function(){');
L('    markedRead = false;');
L('    setFetch(function(url){');
L('      if (String(url).indexOf("/api/chat/unread") >= 0) return ok({ items:[{ peerId:6, count: markedRead ? 0 : 3 }] });');
L('      if (String(url).indexOf("/api/chat/6/messages") >= 0 && String(url).indexOf("markRead=1") >= 0) { markedRead = true; return ok({ items:[] }); }');
L('      return ok({ items:[] });');
L('    });');
L('    a(!!pollFn, "5s poll callback not captured");');
L('    pollFn();');
L('    await tick(80);');
L('    var s = badgeState();');
L('    a(s !== "NO-BADGE-EL", "badge element missing");');
L('    a(s.text === "3" && s.display !== "none", "badge should show 3, got " + JSON.stringify(s));');
L('  });');
L('');
L('  // 场景B：count=0 / null → 隐藏');
L('  await ckA("R43_count_zero_or_null_hidden", async function(){');
L('    setFetch(function(url){ if (String(url).indexOf("/api/chat/unread") >= 0) return ok({ items:[{ peerId:6, count:0 }] }); return ok({ items:[] }); });');
L('    pollFn(); await tick(80);');
L('    a(badgeState().display === "none", "count=0 should hide, got " + JSON.stringify(badgeState()));');
L('    setFetch(function(url){ if (String(url).indexOf("/api/chat/unread") >= 0) return ok({ items:[{ peerId:6, count:null }] }); return ok({ items:[] }); });');
L('    pollFn(); await tick(80);');
L('    a(badgeState().display === "none", "count=null should hide, got " + JSON.stringify(badgeState()));');
L('  });');
L('');
L('  // 场景C：count=150 → 99+');
L('  await ckA("R43_gt99_shows_99plus", async function(){');
L('    setFetch(function(url){ if (String(url).indexOf("/api/chat/unread") >= 0) return ok({ items:[{ peerId:6, count:150 }] }); return ok({ items:[] }); });');
L('    pollFn(); await tick(80);');
L('    a(badgeState().text === "99+", "count>99 should show 99+, got " + JSON.stringify(badgeState()));');
L('  });');
L('');
L('  // 场景D：打开面板后角标清零（loadMsgs markRead → unread 返回 0）');
L('  await ckA("R43_open_panel_clears_badge", async function(){');
L('    markedRead = false;');
L('    setFetch(function(url){');
L('      if (String(url).indexOf("/api/chat/unread") >= 0) return ok({ items:[{ peerId:6, count: markedRead ? 0 : 5 }] });');
L('      if (String(url).indexOf("/api/chat/6/messages") >= 0) { if (String(url).indexOf("markRead=1") >= 0) markedRead = true; return ok({ items:[] }); }');
L('      return ok({ items:[] });');
L('    });');
L('    pollFn(); await tick(80);');
L('    a(badgeState().text === "5" && badgeState().display !== "none", "precondition: badge should be 5, got " + JSON.stringify(badgeState()));');
L('    window.xtOpenAdminChat();');
L('    await tick(160);');
L('    a(badgeState().display === "none", "badge should clear after opening panel, got " + JSON.stringify(badgeState()));');
L('    if (window.acClose) window.acClose();');
L('  });');
L('');
L('  // 场景E：5s 轮询 document.hidden 时跳过');
L('  await ckA("R43_poll_skips_when_hidden", async function(){');
L('    setFetch(function(url){ if (String(url).indexOf("/api/chat/unread") >= 0) return ok({ items:[{ peerId:6, count:2 }] }); return ok({ items:[] }); });');
L('    window.__hidden = true;');
L('    var before = window.__calls.length;');
L('    pollFn(); await tick(80);');
L('    var afterHidden = window.__calls.length;');
L('    a(afterHidden === before, "poll made requests while document.hidden=true (skip ineffective)");');
L('    window.__hidden = false;');
L('    pollFn(); await tick(80);');
L('    a(window.__calls.length > afterHidden, "poll should fetch when visible");');
L('  });');
L('');
L('  window.__R43_RESULTS = R.join("\\n");');
L('})();');
L('');

bootIfNeeded(function () {
  try { w.eval(H.join('\n')); } catch (e) { w.__R43_RESULTS = 'HARNESS_EVAL_THROW ' + e.name + ' :: ' + e.message; }
  setTimeout(function () {
    var body = w.__R43_RESULTS || '(no results)';
    var pass = (body.match(/PASS/g) || []).length;
    var fail = (body.match(/FAIL/g) || []).length;
    var lines = [];
    lines.push('===== R43 独立证伪回归：assets/admin-contact.js =====');
    lines.push('取样时间: ' + new Date().toISOString());
    lines.push('捕获 interval 数: ' + (w.__intervals || []).length);
    lines.push('');
    lines.push(body);
    lines.push('');
    lines.push('--- 汇总 ---');
    lines.push('PASS=' + pass + '  FAIL=' + fail);
    lines.push(fail === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
    var out = lines.join('\n');
    fs.writeFileSync(path.join(ROOT, 'tools/qa/_r3943_admin_contact.txt'), out + '\n');
    console.log(out);
    process.exit(0);
  }, 2500);
});
