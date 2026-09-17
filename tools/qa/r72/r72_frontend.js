// R72 前端运行时独立测试（项2f/3/5f/7 + migrateLegacyKeys）。
// 真实加载 assets/chat-local.js（经 jsdom 提供 window/document/localStorage），
// 通过 window.IM 导出 API 做断言；migrateLegacyKeys 由 app.js 抽取真实源码运行。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const results = [];
let done = false;
function C(name, ok, detail) { results.push([ok ? 'PASS' : 'FAIL', name, detail || '']); }

// ---------- 1) chat-local.js 经 jsdom ----------
const html = '<!DOCTYPE html><html><body><div id="imList"></div><div id="toast"></div></body></html>';
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
// 让 $ready(boot) 不立即执行 boot（避免依赖完整 DOM/fetch）
Object.defineProperty(win.document, 'readyState', { configurable: true, get() { return 'loading'; } });
win.lsKey = function (k) { return 'acct1:' + k; };        // 账号前缀
win.AI_CONFIG = { builtinModels: [], providers: {} };
// fetch mock：返回 conversations
let fetchCalls = 0;
win.fetch = function () { fetchCalls++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) }); };
win.showToast = function () {};

const clSrc = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
try {
  win.eval(clSrc);
  C('chat-local 加载无异常(window.__IM_TEST__存在)', !!win.__IM_TEST__, 'IM=' + (win.__IM_TEST__ ? 'ok' : 'null'));
} catch (e) {
  C('chat-local 加载无异常', false, e.message);
}

if (win.__IM_TEST__) {
  const IM = win.__IM_TEST__;
  const ls = win.localStorage;
  // --- imDisplayName：备注名（原名） ---
  C('imDisplayName-备注(原名)', IM.imDisplayName('老王', '王小明') === '老王（王小明）', IM.imDisplayName('老王', '王小明'));
  C('imDisplayName-无备注=原名', IM.imDisplayName('', '王小明') === '王小明');
  C('imDisplayName-备注==原名=原名', IM.imDisplayName('王小明', '王小明') === '王小明');

  // --- lsK 账号前缀（lsSet 内部即用此，故前缀键即由此决定） ---
  C('lsK-账号前缀键', IM.lsK('study_im_local_data') === 'acct1:study_im_local_data', IM.lsK('x'));

  // --- getAiConfig：前缀键优先 / 裸键兼容 ---
  ls.clear();
  ls.setItem('acct1:study_workbench_ai_config', JSON.stringify({ model: 'm1', apiKey: 'k', baseUrl: 'u' }));
  let cfg = IM.getAiConfig();
  C('getAiConfig-前缀键可读', cfg && cfg.model === 'm1', JSON.stringify(cfg));
  ls.clear();
  ls.setItem('study_workbench_ai_config', JSON.stringify({ model: 'm2', apiKey: 'k2', baseUrl: 'u2' }));
  cfg = IM.getAiConfig();
  C('getAiConfig-裸键兼容可读', cfg && cfg.model === 'm2', JSON.stringify(cfg));

  // --- imBuildChatsFromConversations：字段映射 + 写入本地（前缀键） ---
  ls.clear();
  const items = [{
    peerId: 5, peerNickname: '对端五', peerAvatar: 'a.png', peerRemark: '备注X',
    lastMessage: { id: 9, kind: 'text', content: '最后一条消息', createdAt: '2026-09-17 10:00:00' },
    unreadCount: 2
  }];
  try {
    IM.imBuildChatsFromConversations(items);
    const raw = ls.getItem('acct1:study_im_local_data');
    const data = raw ? JSON.parse(raw) : null;
    const srv = data && data.chats && data.chats['10005'];
    C('imBuild-服务端会话写入本地', !!srv, 'srv=' + JSON.stringify(srv));
    C('imBuild-字段映射 id=10000+peerId', srv && srv.id === 10005);
    C('imBuild-字段映射 serverId=peerId', srv && srv.serverId === 5);
    C('imBuild-字段映射 peerRemark', srv && srv.peerRemark === '备注X');
    C('imBuild-字段映射 last=lastMessage.content', srv && srv.last === '最后一条消息');
    C('imBuild-字段映射 isServer=true', srv && srv.isServer === true);
    // 实时会话列表（S.chats）带 unread=2；本地持久化副本按设计存 unread:0（未读由服务端重算）
    const live = (IM.S && IM.S.chats || []).filter(function (c) { return c.id === 10005; })[0];
    C('imBuild-实时列表unread=2(字段映射unreadCount)', live && live.unread === 2, 'live.unread=' + (live && live.unread));
  } catch (e) {
    C('imBuildChatsFromConversations 运行', false, e.message);
  }

  // --- loadChats：fetch 成功→写前缀键(非裸键)；fetch 失败→回落本地不抛错 ---
  ls.clear();
  ls.setItem('study_workbench_token', 'tok');
  const convItems = [{ peerId: 7, peerNickname: '对端七', peerAvatar: '', peerRemark: '',
    lastMessage: { id: 1, kind: 'text', content: 'hi', createdAt: '2026-09-17 09:00:00' }, unreadCount: 0 }];
  win.fetch = function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: convItems }) }); };
  try { IM.loadChats(); } catch (e) { C('loadChats-成功不抛错', false, e.message); }
  setTimeout(function () {
    const pref = ls.getItem('acct1:study_im_local_data');
    const bare = ls.getItem('study_im_local_data');
    C('loadChats-写入前缀键(非裸键)', !!pref && !bare, 'pref=' + (!!pref) + ' bare=' + (!!bare));
    const d2 = pref ? JSON.parse(pref) : null;
    const srv2 = d2 && d2.chats && d2.chats['10007'];
    C('loadChats-对端会话写入本地(字段映射)', !!srv2, JSON.stringify(srv2));
    // fetch 失败回落
    ls.clear(); ls.setItem('study_workbench_token', 'tok');
    win.fetch = function () { return Promise.reject(new Error('net')); };
    let threw2 = false;
    try { IM.loadChats(); } catch (e) { threw2 = true; C('loadChats-失败不抛错', false, e.message); }
    setTimeout(function () {
      C('loadChats-fetch失败回落本地不抛错', !threw2);
      const fb = IM.imOfflineFallback({ personality: 'ai' }, [{ role: 'user', content: 'hi' }]);
      C('imOfflineFallback-含[离线兜底]', typeof fb === 'string' && fb.indexOf('离线兜底') >= 0, (fb || '').slice(0, 30));
      finish();
    }, 60);
  }, 60);
} else {
  finish();
}

// ---------- 2) migrateLegacyKeys（抽取 app.js 真实源码运行） ----------
function runMigrateTest() {
  const appSrc = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
  // 抽取 (function migrateLegacyKeys() { ... })(); 整段
  const start = appSrc.indexOf('(function migrateLegacyKeys()');
  if (start < 0) { C('migrateLegacyKeys 抽取', false, '未找到'); return finish(); }
  // 从 start 找匹配的 })(); —— 简单做法：找该函数后的第一个 "})();" 行
  const tailIdx = appSrc.indexOf('})();', start);
  if (tailIdx < 0) { C('migrateLegacyKeys 抽取', false, '未找到结尾'); return finish(); }
  const fnSrc = appSrc.slice(start, tailIdx + 5);

  function makeLS() {
    const store = {};
    return {
      _s: store,
      key(i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; },
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    };
  }
  function run(ls, lsKeyImpl) {
    const ctx = {
      localStorage: ls,
      lsKey: lsKeyImpl,
      console: console,
      window: {},
      document: { getElementById: () => null }
    };
    const vm = require('vm');
    vm.createContext(ctx);
    vm.runInContext(fnSrc, ctx);
  }

  // 场景：裸键存在
  const ls1 = makeLS();
  ls1.setItem('study_workbench_data', 'X');
  ls1.setItem('study_workbench_ai_chat_abc', 'Y');
  const lsKeyImpl = function (k) { return 'acct1:' + k; };
  run(ls1, lsKeyImpl);
  C('migrate-裸键study_workbench_data仍存在(不删)', ls1.getItem('study_workbench_data') === 'X');
  C('migrate-目标前缀键acct1:study_workbench_data已写', ls1.getItem('acct1:study_workbench_data') === 'X');
  C('migrate-前缀键acct1:study_workbench_ai_chat_abc已写', ls1.getItem('acct1:study_workbench_ai_chat_abc') === 'Y');
  C('migrate-未删除裸键ai_chat_abc', ls1.getItem('study_workbench_ai_chat_abc') === 'Y');

  // 幂等：再跑一次，目标键已存在 → 不覆盖、裸键仍保留
  run(ls1, lsKeyImpl);
  C('migrate-幂等:裸键仍存在', ls1.getItem('study_workbench_data') === 'X');
  C('migrate-幂等:无removeItem(裸键计数不变)', Object.keys(ls1._s).length === 4, 'keys=' + Object.keys(ls1._s).length);
}

var done2 = false;
function finish() {
  if (done2) return; done2 = true;
  runMigrateTest();
  const lines = ['R72 前端运行时独立测试', '='.repeat(60)];
  let np = 0, nf = 0;
  for (const [st, name, detail] of results) {
    lines.push('[' + st + '] ' + name + (detail ? '  ' + detail : ''));
    if (st === 'PASS') np++; else nf++;
  }
  lines.push('='.repeat(60));
  lines.push('前端用例 PASS=' + np + ' FAIL=' + nf);
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r72', 'r72_frontend.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  process.exit(0);
}
