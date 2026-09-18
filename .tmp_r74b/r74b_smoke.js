/* R74-B jsdom 冒烟测试：TA 视角好友/非好友两种 payload 渲染 + 删好友/备注名交互 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:\\Users\\ATM\\node_modules\\jsdom');

const ASSETS = path.join('D:', '下载的文件', '学习工作台', 'assets');
const PROFILE_JS = fs.readFileSync(path.join(ASSETS, 'xt-profile.js'), 'utf8');

let PASS = 0, FAIL = 0;
function ok(cond, name) {
  if (cond) { PASS++; console.log('  PASS  ' + name); }
  else { FAIL++; console.log('  FAIL  ' + name); }
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function buildPage(mode, origin) {
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<div class="xtp-wrap"><header class="xtp-topbar"><div class="xtp-topbar-title">个人资料</div></header>' +
    '<main id="xtProfileRoot" class="xtp-root"></main></div>' +
    '<div id="xtpViews"></div><div id="xtpToast" class="xtp-toast"></div><div id="xtpModalHost"></div>' +
    '<script>' +
    'window.lucideAutoRender = function(){};' +
    'window.apiAvatarSrcOf = function(u){ return (u && u.avatarUrl) || ""; };' +
    'var MODE = ' + JSON.stringify(mode) + ';' +
    'var DELETED = false;' +
    'window.__deleted = function(){ return DELETED; };' +
    'window.__lastRemarkBody = null;' +
    'window.api = function(p, opts){' +
    '  opts = opts || {};' +
    '  var m = (opts.method || "GET");' +
    '  if (p === "/api/users/42") {' +
    '    return Promise.resolve({ id: 42, nickname: "小明", motto: "好好学习", city: "北京", goal: "考研",' +
    '      createdAt: "2025-01-02T03:04:05Z", online: false, lastSeenAt: "2026-09-16T10:00:00Z",' +
    '      isMe: false, isFriend: (MODE === "friend" && !DELETED), notes: [], stats: { published: 0 },' +
    '      phone: "13800000000", email: "secret@example.com", gender: "male", birthday: "1999-01-01", username: "xiaoming_secret" });' +
    '  }' +
    '  if (p === "/api/friends" && m === "GET") {' +
    '    return Promise.resolve({ items: [{ id: 42, nickname: "小明", peerRemark: "老同学" }] });' +
    '  }' +
    '  if (p === "/api/friends/42" && m === "DELETE") { DELETED = true; return Promise.resolve({}); }' +
    '  if (p === "/api/friends/42/remark" && m === "PUT") { window.__lastRemarkBody = opts.body; return Promise.resolve({}); }' +
    '  if (p.indexOf("/api/moments/user/42") === 0) {' +
    '    if (MODE === "friend" && !DELETED) {' +
    '      return Promise.resolve({ items: [' +
    '        { id: 1, content: "第一条动态内容", createdAt: "2026-09-15 10:00:00", images: ["a.png"] },' +
    '        { id: 2, content: "第二条动态", createdAt: "2026-09-14 09:30:00", images: [] } ] });' +
    '    }' +
    '    return Promise.reject(new Error("HTTP 403"));' +
    '  }' +
    '  return Promise.reject(new Error("no stub: " + p));' +
    '};' +
    'window.apiSetFriendRemark = function(peerId, remark){' +
    '  return window.api("/api/friends/" + peerId + "/remark", { method: "PUT", body: { remark: remark } });' +
    '};' +
    'localStorage.setItem("study_workbench_token", "tok-test");' +
    '</scr' + 'ipt>' +
    '<script>' + PROFILE_JS + '</scr' + 'ipt>' +
    '</body></html>';
  return new JSDOM(html, {
    url: origin + '/profile.html?user=42',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
}

(async function main() {
  /* ================= 场景一：好友态（isFriend=true） ================= */
  console.log('[case 1] isFriend=true');
  const dom1 = buildPage('friend', 'http://127.0.0.1');
  const d1 = dom1.window.document;
  await wait(400);
  const root1 = d1.getElementById('xtProfileRoot');
  const h1 = root1.innerHTML;
  ok(!!root1.querySelector('#xtpHeroOther'), 'hero 存在（#xtpHeroOther）');
  ok(h1.indexOf('发消息') >= 0, '好友态：hero 有「发消息」');
  ok(h1.indexOf('删除好友') >= 0, '好友态：hero 有「删除好友」');
  ok(h1.indexOf('加好友') < 0, '好友态：无「加好友」');
  const hero1 = d1.getElementById('xtpHeroOther');
  ok(!!hero1.querySelector('[data-other-act="chat"]'), '发消息按钮在 hero 内');
  ok(!!hero1.querySelector('[data-other-act="delfriend"]'), '删除好友按钮在 hero 内');
  ok(h1.indexOf('备注：老同学') >= 0, '昵称旁显示备注名（备注：老同学）');
  ok(h1.indexOf('备注名') >= 0, '「TA 的资料」有备注名行');
  ok(!!root1.querySelector('[data-other-act="remark"]'), '备注名行可点击（data-other-act=remark）');
  ok(h1.indexOf('ID：<b>42</b>') >= 0, '显示服务端数字 uid（ID：<b>42</b>）');
  ok(h1.indexOf('关于') >= 0, '好友态：保留「关于」');
  ok(h1.indexOf('第一条动态内容') >= 0, '动态列表展示第 1 条文案');
  ok(h1.indexOf('第二条动态') >= 0, '动态列表展示第 2 条文案');
  ok(h1.indexOf('1 张图片') >= 0, '动态列表展示图片数');
  ok(h1.indexOf('查看全部动态') >= 0, '动态入口行保留');
  ok(h1.indexOf('动态空间.html?user=42') >= 0, '入口指向 动态空间.html?user=42');
  ok(h1.indexOf('仅好友可见') < 0, '好友态：无「仅好友可见」占位');
  /* 安全红线 */
  ok(h1.indexOf('13800000000') < 0, '不渲染 phone');
  ok(h1.indexOf('secret@example.com') < 0, '不渲染 email');
  ok(h1.indexOf('male') < 0, '不渲染 gender');
  ok(h1.indexOf('1999-01-01') < 0, '不渲染 birthday');
  ok(h1.indexOf('xiaoming_secret') < 0, '不渲染 username');

  /* ---- 交互 1：备注名弹层 ---- */
  console.log('[case 1a] 设置备注名交互');
  root1.querySelector('[data-other-act="remark"]').click();
  let mask = d1.getElementById('xtpMask');
  ok(!!mask, '点击备注名行 → 弹层打开（非 prompt）');
  const inp = mask && mask.querySelector('#xtpFeInput');
  ok(!!inp && inp.value === '老同学', '弹层输入框预填当前备注「老同学」');
  ok(!!inp && inp.getAttribute('maxlength') === '20', '输入框 maxlength=20');
  if (inp) {
    inp.value = '新备注名X';
    const okBtn = mask.querySelector('#xtpFeOk');
    okBtn.click();
    await wait(300);
    ok(d1.getElementById('xtProfileRoot').innerHTML.indexOf('备注：新备注名X') >= 0, '保存后昵称旁显示新备注名');
    ok(!!d1.defaultView.__lastRemarkBody && d1.defaultView.__lastRemarkBody.remark === '新备注名X', 'PUT /api/friends/42/remark 携带正确 body');
    ok(!d1.getElementById('xtpMask'), '弹层已关闭');
  }

  /* ---- 交互 2：删除好友（uiConfirm 缺失 → 本页 confirmBox 回退） ---- */
  console.log('[case 1b] 删除好友交互');
  const delBtn = root1.querySelector('[data-other-act="delfriend"]');
  delBtn.click();
  mask = d1.getElementById('xtpMask');
  ok(!!mask && mask.textContent.indexOf('确定要删除好友') >= 0, '点击删除 → 二次确认弹层（非原生 confirm）');
  const okDel = mask && mask.querySelector('#xtpConfirmOk');
  ok(!!okDel && okDel.textContent === '删除', '确认弹层有「删除」按钮');
  if (okDel) {
    okDel.click();
    await wait(900);
    ok(dom1.window.__deleted() === true, 'DELETE /api/friends/42 已发出');
    const h1b = d1.getElementById('xtProfileRoot').innerHTML;
    ok(h1b.indexOf('加好友') >= 0, '删除后刷新：hero 变「加好友」');
    ok(h1b.indexOf('删除好友') < 0, '删除后刷新：无「删除好友」');
    ok(h1b.indexOf('发消息') < 0, '删除后刷新：无「发消息」');
    ok(h1b.indexOf('仅好友可见') >= 0, '删除后（非好友）：动态显示「仅好友可见」');
    ok(h1b.indexOf('关于') < 0, '删除后（非好友）：无「关于」');
  }
  dom1.window.close();

  /* ================= 场景二：非好友态（isFriend=false） ================= */
  console.log('[case 2] isFriend=false');
  const dom2 = buildPage('stranger', 'http://localhost');
  const d2 = dom2.window.document;
  await wait(400);
  const root2 = d2.getElementById('xtProfileRoot');
  const h2 = root2.innerHTML;
  const hero2 = d2.getElementById('xtpHeroOther');
  ok(!!hero2.querySelector('[data-other-act="addfriend"]'), '非好友态：hero 右侧有「加好友」');
  ok(h2.indexOf('发消息') < 0, '非好友态：无「发消息」');
  ok(h2.indexOf('删除好友') < 0, '非好友态：无「删除好友」');
  ok(h2.indexOf('备注名') < 0, '非好友态：无备注名行');
  ok(h2.indexOf('备注：') < 0, '非好友态：无备注名胶囊');
  ok(h2.indexOf('关于') < 0, '非好友态：不显示「关于」');
  ok(h2.indexOf('仅好友可见') >= 0, '非好友态：动态显示「仅好友可见」占位');
  ok(h2.indexOf('查看全部动态') >= 0 && h2.indexOf('动态空间.html?user=42') >= 0, '非好友态：动态入口行保留并指向动态空间');
  ok(h2.indexOf('ID：<b>42</b>') >= 0, '非好友态：显示服务端数字 uid');
  /* 两种状态模块布局一致性：分组标题都在 */
  ok(h2.indexOf('TA 的资料') >= 0 && h1.indexOf('TA 的资料') >= 0, '两状态均有「TA 的资料」组');
  ok(h2.indexOf('TA 的内容') >= 0 && h1.indexOf('TA 的内容') >= 0, '两状态均有「TA 的内容」组');
  ok(h2.indexOf('TA 的动态') >= 0 && h1.indexOf('TA 的动态') >= 0, '两状态均有「TA 的动态」组');
  /* 安全红线 */
  ok(h2.indexOf('13800000000') < 0, '非好友态：不渲染 phone');
  ok(h2.indexOf('secret@example.com') < 0, '非好友态：不渲染 email');
  ok(h2.indexOf('male') < 0, '非好友态：不渲染 gender');
  ok(h2.indexOf('1999-01-01') < 0, '非好友态：不渲染 birthday');
  ok(h2.indexOf('xiaoming_secret') < 0, '非好友态：不渲染 username');
  dom2.window.close();

  console.log('\nRESULT: ' + PASS + ' PASS / ' + FAIL + ' FAIL');
  process.exit(FAIL > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('SMOKE CRASH:', e);
  process.exit(2);
});
