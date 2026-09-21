/* _r73_qa27_verify.cjs — 行为级验证（jsdom 执行真实源码）
   方法：
   - 个人资料.html TA 行为：内联真实 assets/xt-profile.js；用 beforeParse 钩子在脚本执行前
     注入可控 window.api 假桩（记录 /api/users/ 调用）、token、location.replace 覆盖（捕获跳转），
     在 http origin 下执行。beforeParse 保证桩在 boot() 之前就位（解决 replace 时序问题）。
   - 入口函数导航目标：执行【真实入口函数源码】（括号配平抽取），在 new Function 作用域把
     location 作为捕获参数注入 —— 与实现者“页面内遮蔽 location”不同的独立手法。
   - isMe 回落：覆盖 location.replace 捕获跳转，再手动调用 window.xtProfile.render() 模拟浏览器重载。
   - S15：内联真实 app.js 的 esc/noteCardHtml + 真实 api.js，调用真实 window.renderUserHome。
*/
const fs = require('fs');
const path = require('path');
const JSDOM_MOD = require('C:\\Users\\ATM\\node_modules\\jsdom');
const { JSDOM, VirtualConsole } = JSDOM_MOD;

const ROOT = 'D:\\下载的文件\\学习工作台';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const XT = read('assets/xt-profile.js').replace(/<\/script/gi, '<\\/script');
const API = read('assets/api.js').replace(/<\/script/gi, '<\\/script');
const APP = read('assets/app.js').replace(/<\/script/gi, '<\\/script');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function rec(id, name, expect, actual, pass, note) {
  results.push({ id, name, expect, actual, pass, note: note || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id} ${name} | 预期=${expect} | 实测=${actual}${note ? ' | ' + note : ''}`);
}

function extractFn(content, marker) {
  const i = content.indexOf(marker);
  if (i < 0) return null;
  const j = content.indexOf('{', i);
  if (j < 0) return null;
  let depth = 0, k = j;
  for (; k < content.length; k++) {
    if (content[k] === '{') depth++;
    else if (content[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return content.slice(i, k);
}

function newDom(html, url, beforeParse, vcErrors) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => vcErrors.push('jsdomError: ' + (e && e.message ? e.message : String(e))));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url, virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(window) {
      window.__cap = { href: '', replaceCalls: 0 };
      window.__apiLog = [];
      try { window.location.replace = function (v) { window.__cap.href = v; window.__cap.replaceCalls = (window.__cap.replaceCalls || 0) + 1; }; } catch (e) {}
      if (beforeParse) beforeParse(window);
    }
  });
  return dom;
}

function buildProfilePage({ url, token, userFn, moments }) {
  const errors = [];
  // 内联 stub 脚本（在 xt-profile.js 之前执行，boot 在 DOMContentLoaded，故 stub 优先就位）
  const stub = 'window.__cap={href:"",replaceCalls:0}; window.__apiLog=[]; window.__moments='
    + JSON.stringify(moments || [])
    + '; window.isOnlineSession=function(){return false;};'
    + (token ? 'try{localStorage.setItem("study_workbench_token","FAKE");}catch(e){}' : '')
    + 'try{window.location.replace=function(v){window.__cap.href=v;window.__cap.replaceCalls=(window.__cap.replaceCalls||0)+1;};}catch(e){}'
    + 'try{Object.defineProperty(window.location,"replace",{configurable:true,value:function(v){window.__cap.href=v;window.__cap.replaceCalls=(window.__cap.replaceCalls||0)+1;}});}catch(e){}'
    + 'window.api=function(p,opts){ window.__apiLog.push(p);'
    + ' if(p.indexOf("/api/moments/user/")===0) return Promise.resolve({items:window.__moments});'
    + ' if(p.indexOf("/api/auth/me")===0) return Promise.resolve({});'
    + ' if(p.indexOf("/api/users/")===0){ var uid=p.replace("/api/users/","").split("?")[0]; var r=USERFN(uid); return (r&&typeof r.then==="function")?r:Promise.resolve(r);}'
    + ' return Promise.resolve({}); };';
  const USERFN_SRC = 'var USERFN=' + userFn.toString() + ';';
  const html = '<!DOCTYPE html><html><head></head><body><div class="xtp-wrap"><div id="xtProfileRoot"></div></div>'
    + '<script>' + USERFN_SRC + stub + '</script>'
    + '<script>' + XT + '</script></body></html>';
  const dom = newDom(html, url, null, errors);
  const w = dom.window;
  w.addEventListener('error', (e) => errors.push('window.error:' + (e && e.message ? e.message : (e && e.error))));
  w.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection:' + (e && e.reason && e.reason.message ? e.reason.message : (e && e.reason))));
  return { w, errors };
}
function rootText(w) { const el = w.document.getElementById('xtProfileRoot'); return el ? el.textContent : ''; }
function rootHtml(w) { const el = w.document.getElementById('xtProfileRoot'); return el ? el.innerHTML : ''; }

async function main() {
  // ---------- S9: 5 入口导航目标（执行真实函数源码 + location 注入捕获） ----------
  const cases = [
    ['S9-1', '动态.html moOpenUser(2002)', '个人资料.html?user=2002', '动态.html', 'window.moOpenUser = function (uid)', 'window.moOpenUser(uid)', [2002]],
    ['S9-2', '好友申请.html openUserHome(2003)', '个人资料.html?user=2003', '好友申请.html', 'window.openUserHome = function (uid)', 'window.openUserHome(uid)', [2003]],
    ['S9-3', '朋友圈/xt-moments XTM.openUser(2005)', '个人资料.html?user=2005', 'assets/xt-moments.js', 'openUser: function (uid)', 'var f=(BODY); f(uid)', [2005]],
    ['S9-4', 'api.js openUserHome(2002)', '个人资料.html?user=2002', 'assets/api.js', 'function openUserHome(uid)', '(' + 'BODY' + ')(uid)', [2002, true]],
    ['S9-5', 'chat-local.js imOpenPeerHome(2005)', '个人资料.html?user=2005', 'assets/chat-local.js', 'window.imOpenPeerHome = function (serverId)', 'window.imOpenPeerHome(serverId)', [2005, true]],
  ];
  for (const [id, label, expect, file, marker, call, args] of cases) {
    const raw = extractFn(read(file), marker);
    if (!raw) { rec(id, label, expect, '未找到函数', false, marker); continue; }
    const cap = { href: '' };
    const W = (new JSDOM('<!DOCTYPE html><body></body>')).window;
    let callCode;
    if (call === 'var f=(BODY); f(uid)') callCode = 'var f=(' + raw.replace(/^\s*openUser:\s*/, '') + '); f(uid);';
    else if (call === '(BODY)(uid)') { callCode = '(' + raw + ')(uid);'; }
    else callCode = raw + '; ' + call + ';';
    // 注入 location 作为捕获参数（与实现者页面内遮蔽不同）
    W.__cap = cap;
    if (id === 'S9-5') { W.openUserHome = function (u) { W.__cap.href = '个人资料.html?user=' + u; }; }
    const factory = new Function('window', 'location', 'document', 'uid', 'serverId', callCode);
    factory(W, cap, W.document, args[0], args[0]);
    rec(id, label, expect, cap.href, cap.href === expect, raw.slice(0, 60).replace(/\n/g, ' '));
  }

  // ---------- S7/S8: 恶意 payload 泄露 ----------
  const LEAK = { id: 2002, nickname: '小明', avatarUrl: '', motto: '南风知我意', bio: 'bio', city: '杭州', goal: '考公上岸', tags: ['a'], createdAt: '2026-01-02T03:04:05Z', isMe: false, isFriend: false, online: true, lastSeenAt: '2026-09-17T10:00:00Z', stats: { published: 3, likes: 12, comments: 1, views: 9 }, notes: [{}, {}], phone: '13800000000', email: 'leak@example.com', gender: '男', birthday: '2000-01-01', username: 'secret_user', privacy: { momentVisibility: 'all' }, token_version: 7, password_hash: '$2b$deadbeef' };
  {
    const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8801/个人资料.html?user=2002', token: true, userFn: () => LEAK, moments: [] });
    await sleep(220);
    const txt = rootText(w), html = rootHtml(w);
    const leakTokens = ['13800000000', 'leak@example.com', '2000-01-01', 'secret_user', 'momentVisibility', 'token_version', 'password_hash'];
    const leaked = leakTokens.filter((t) => txt.indexOf(t) >= 0 || html.indexOf(t) >= 0);
    const manCount = (txt.match(/男/g) || []).length;
    const genderWord = (txt.match(/性别/g) || []).length;
    const manHtml = html.indexOf('>男<') >= 0 || html.indexOf('男</') >= 0;
    if (manCount > genderWord || manHtml) leaked.push('男(上下文泄露)');
    rec('S7', '恶意 payload 敏感字段不渲染', '0 泄露', leaked.length ? '泄露:' + leaked.join(',') : '无泄露', leaked.length === 0, 'man=' + manCount + ' 性别词=' + genderWord + ' >男<=' + (html.indexOf('>男<') >= 0));
    const selfOnly = ['学习记录', '我的笔记', '我的收藏', '学习数据', '作品集', 'AI对话记录', '退出登录', 'data-act="edit"'];
    const found = selfOnly.filter((s) => txt.indexOf(s) >= 0 || html.indexOf(s) >= 0);
    rec('S8', 'TA 模式无本人专属内容', '0 项', found.length ? '出现:' + found.join(',') : '无', found.length === 0, '含性别提示=' + (txt.indexOf('性别') >= 0));
  }

  // ---------- S10: 零回归 本人视角 ----------
  {
    const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8802/个人资料.html', token: true, userFn: () => ({}), moments: [] });
    await sleep(150);
    const txt = rootText(w);
    const miss = ['学习记录', '我的笔记', '我的收藏', '作品集'].filter((s) => txt.indexOf(s) < 0);
    rec('S10', '无 user 参数=本人视角', '含学习记录/我的笔记/我的收藏/作品集', miss.length ? '缺失:' + miss.join(',') : '全部存在', miss.length === 0 && errors.length === 0, 'errors=' + errors.length);
  }

  // ---------- S11: 未登录降级 ----------
  {
    const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8803/个人资料.html?user=2002', token: false, userFn: () => ({}), moments: [] });
    await sleep(150);
    const txt = rootText(w);
    const usersCalls = w.__apiLog.filter((p) => p.indexOf('/api/users/') === 0).length;
    const hasLogin = txt.indexOf('去登录') >= 0, hasSelf = txt.indexOf('学习记录') >= 0;
    rec('S11', '未登录显示去登录 & /api/users/ 请求=0', '去登录&请求=0&无学习记录', '去登录=' + hasLogin + ' 请求=' + usersCalls + ' 学习记录=' + hasSelf, hasLogin && usersCalls === 0 && !hasSelf && errors.length === 0, 'errors=' + errors.length);
  }

  // ---------- S12: 非法参数 7 种 ----------
  {
    const illegal = ['abc', '../../etc/passwd', '', '0', '-1', '1e9', '%20'];
    let allOk = true; const detail = [];
    for (const v of illegal) {
      const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8804/个人资料.html?user=' + encodeURIComponent(v), token: true, userFn: () => Promise.reject(new Error('用户不存在')), moments: [] });
      await sleep(120);
      const blank = rootText(w).trim().length === 0;
      const ok = !blank && errors.length === 0;
      if (!ok) { allOk = false; detail.push(v + ':' + (blank ? '空白' : 'err' + errors.length)); }
    }
    rec('S12', '7 种非法参数安全降级不抛错不空白', '全部安全', allOk ? '全部安全' : detail.join(';'), allOk);
  }

  // ---------- S13: isMe 边界 ----------
  {
    const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8805/个人资料.html?user=1001', token: true, userFn: () => ({ id: 1001, nickname: '我', isMe: true }), moments: [] });
    await sleep(150);
    const txt = rootText(w);
    // isMe 路径在 paintOther 之前 return：陌生人视图（otherHeroHtml/otherGroupDefs 的“TA 的资料”）不应被绘制
    const strangerPainted = txt.indexOf('TA 的资料') >= 0 || txt.indexOf('加载中') >= 0 ? (txt.indexOf('TA 的资料') >= 0) : false;
    const replaceCalled = w.__cap ? w.__cap.replaceCalls > 0 : false;
    let ownOk = false;
    try { if (w.xtProfile && w.xtProfile.render) { w.xtProfile.render(); ownOk = rootText(w).indexOf('学习记录') >= 0; } } catch (e) { errors.push('render:' + e.message); }
    // jsdom 不支持 location.replace 跨文档导航，会记一条 "Not implemented: navigation" 的 jsdomError；
    // 这是 jsdom 限制，非产品缺陷（真实浏览器中这是一次合法的页面重载跳转）。从错误门中剔除该噪声。
    const realErrors = errors.filter((e) => !/Not implemented: navigation/.test(e));
    rec('S13', 'isMe:true 不渲染陌生人→回落本人视角', '陌生人未绘制 & 本人视角可见',
      '陌生人被绘制=' + strangerPainted + ' replace拦截=' + replaceCalled + ' 本人视角=' + ownOk + ' 真实错误=' + realErrors.length,
      !strangerPainted && ownOk && realErrors.length === 0,
      'jsdom无法拦截/执行location.replace导航(non-writable)；改用「陌生人视图未绘制(paintOther未调用)+手动render模拟重载」佐证');
  }

  // ---------- S14: 接口失败 4 种 ----------
  {
    const failCases = [
      ['500', () => Promise.reject(new Error('HTTP 500'))],
      ['403', () => Promise.reject(new Error('HTTP 403'))],
      ['nonJSON', () => '<html><body>500 Internal Error</body></html>'],
      ['netdown', () => Promise.reject(new Error('network error'))],
    ];
    let allOk = true; const detail = [];
    for (const [name, fn] of failCases) {
      const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8806/个人资料.html?user=2002', token: true, userFn: fn, moments: [] });
      await sleep(150);
      const txt = rootText(w);
      const dirty = ['undefined', 'NaN', '[object Object]'].filter((d) => txt.indexOf(d) >= 0);
      const ok = errors.length === 0 && dirty.length === 0 && txt.trim().length > 0;
      if (!ok) { allOk = false; detail.push(name + ':' + (dirty.length ? '脏文本' + dirty.join(',') : 'err' + errors.length)); }
    }
    rec('S14', '500/403/非JSON/断网 4 种给可理解提示无脏文本', '全部安全', allOk ? '全部安全' : detail.join(';'), allOk);
  }

  // ---------- S15: 旧兜底 个人中心.html?user=2002（真实 renderUserHome：内联真实 app.js+api.js） ----------
  {
    const PAYLOAD = { id: 2002, nickname: '小明', username: 'secret_user', motto: 'himotto', bio: 'hb', city: '杭州', gender: '男', birthday: '2000-01-01', createdAt: '2026-01-02', isMe: false, isFriend: false, tags: ['a'], goal: '考公', notes: [{ title: '笔记A', status: 'published' }], stats: { published: 1, likes: 5, comments: 2, views: 9 } };
    const errors = [];
    const apiStub = "window.API_BASE=''; window.__apiLog=[]; window.isOnlineSession=function(){return false;};"
      + "window.api=function(p,o){ window.__apiLog.push(p); if(p.indexOf('/api/users/')===0) return Promise.resolve(" + JSON.stringify(PAYLOAD) + "); if(p.indexOf('/api/friends')===0) return Promise.resolve([]); return Promise.resolve({}); };";
    const html = '<!DOCTYPE html><html><head></head><body><div id="profileBox"></div>'
      + '<script>' + APP + '</script>'
      + '<script>' + API + '</script>'
      + '<script>' + apiStub + '</script>'
      + '<script>window.renderUserHome(2002, document.getElementById("profileBox"));</script>'
      + '</body></html>';
    const dom = newDom(html, 'http://127.0.0.1:8807/个人中心.html?user=2002', null, errors);
    const w = dom.window;
    w.addEventListener('error', (e) => errors.push('window.error:' + (e && e.message || e)));
    await sleep(250);
    const box = w.document.getElementById('profileBox');
    const txt = box ? box.textContent : '';
    const hasNick = txt.indexOf('小明') >= 0, hasTa = txt.indexOf('TA 的主页') >= 0;
    rec('S15', '旧兜底 个人中心.html?user=2002 #profileBox 渲染对方主页', '含昵称&TA 的主页', '昵称=' + hasNick + ' TA主页=' + hasTa, hasNick && hasTa, 'errors=' + errors.length + (errors.length ? ' ' + errors.slice(0, 2).join(' | ') : ''));
  }

  // ---------- S16: error 汇总（TA 正常场景） ----------
  {
    const { w, errors } = buildProfilePage({ url: 'http://127.0.0.1:8808/个人资料.html?user=2002', token: true, userFn: () => LEAK, moments: [] });
    await sleep(220);
    rec('S16', 'page error / unhandledrejection 计数', '0', 'errors=' + errors.length, errors.length === 0, errors.length ? errors.join(' | ') : 'clean');
  }

  // ---------- 输出 ----------
  const lines = ['================================================================', 'R73 任务二十七 行为级验证 (jsdom 执行真实源码)', '================================================================'];
  for (const r of results) {
    lines.push(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.id} ${r.name}`);
    lines.push(`   预期: ${r.expect}`);
    lines.push(`   实测: ${r.actual}`);
    if (r.note) lines.push(`   备注: ${r.note}`);
  }
  const fails = results.filter((r) => !r.pass);
  lines.push('----------------------------------------------------------------');
  lines.push('总 PASS=' + (results.length - fails.length) + ' / FAIL=' + fails.length);
  fs.writeFileSync(path.join(ROOT, 'tools', '_r73_qa27_jsdom.txt'), lines.join('\n'), 'utf8');
  console.log('\nSUMMARY: PASS=' + (results.length - fails.length) + ' FAIL=' + fails.length + (fails.length ? ' FAILS=' + fails.map((f) => f.id).join(',') : ''));
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
