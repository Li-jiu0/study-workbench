/**
 * tools/qa/ed_t02_groupsettings_0911.js —— T02 自测（寇豆码，2026-09-11）
 * 运行：node tools/qa/ed_t02_groupsettings_0911.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 *
 * 覆盖（D0 骨架 / D2 成员管理·踢人 / D3 免打扰 / D4 退群·解散）：
 *   - #imGSBtn 存在、群会话显示、私聊隐藏（源码级）
 *   - 模态打开、成员列表渲染、groupNickname 优先 / 空值兜底「已注销用户」
 *   - 群主（myRole=owner）看到「移出」+「解散群聊」；非群主（myRole 缺失→member）看不到「移出」、看到「退出群聊」
 *   - 免打扰写入 study_workbench_chat_prefs('g<id>')，imCountUnread 排除该会话
 *   - ESC 关闭（imEscClose 链）、D1/D5 已接线（群主可编辑群名/公告/群内昵称）
 *   - 零未捕获异常 + showToast 可用
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM, VirtualConsole } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; FAILS.push(label + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : '')); }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.on('unhandledRejection', e => console.log('  [后台异步] 未处理 rejection: ' + (e && e.message)));

const QA_PORT = 8139;
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.writeHead(200, { 'content-type': ct }); res.end(buf);
  });
});
let serverReady = null;
function ensureServer() { if (!serverReady) serverReady = new Promise(res => qaServer.listen(QA_PORT, '127.0.0.1', res)); return serverReady; }

async function loadReal(page, fetchImpl) {
  await ensureServer();
  const vcErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => vcErrors.push(String((e && e.message) || e)));
  let wRef = null;
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  new JSDOM(html, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + QA_PORT + '/' + page, virtualConsole: vc,
    beforeParse(w) {
      wRef = w;
      w.__uncaught = [];
      w.addEventListener('error', e => w.__uncaught.push('[error] ' + (e && (e.message || e.type))));
      if (w.Element && w.Element.prototype && typeof w.Element.prototype.scrollTo !== 'function') w.Element.prototype.scrollTo = function () { };
      w.fetch = fetchImpl;
      try {
        w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
        w.localStorage.setItem('study_workbench_token', 'test-token');
      } catch (e) { }
    },
  });
  await sleep(650);
  return { w: wRef, d: wRef.document, vcErrors };
}

function mkjson(o) { return Promise.resolve({ ok: true, json: () => Promise.resolve(o), text: () => Promise.resolve(JSON.stringify(o)) }); }
function mkerr(status, detail) { return Promise.resolve({ ok: false, status: status, json: () => Promise.resolve({ detail: detail }), text: () => Promise.resolve('') }); }

(async function main() {
  let uncaughtAll = [];

  /* ============ 场景1：群主视角（myRole=owner） ============ */
  sec('[场景1] 群主视角：移出 + 解散群聊 + 群名片优先');
  {
    const ownerFetch = function (url) {
      url = String(url);
      if (/\/api\/groups\/42$/.test(url)) {
        return mkjson({
          id: 42, name: '测试群', ownerId: 1,
          myRole: 'owner',
          members: [
            { id: 1, nickname: '群主甲', avatarUrl: null, role: 'owner', groupNickname: '甲哥' },
            { id: 2, nickname: '乙', avatarUrl: '/uploads/a.png', role: 'member', groupNickname: '' },
            { id: 3, nickname: '丙', avatarUrl: null, role: 'member' }
          ]
        });
      }
      if (/\/api\/groups$/.test(url)) return mkjson({ items: [{ id: 42, name: '测试群', memberCount: 3 }] });
      if (url.indexOf('/api/chat/unread') !== -1) return mkjson({ total: 0, items: [] });
      if (url.indexOf('/api/friends/requests') !== -1) return mkjson({ incoming: [], unreadCount: 0 });
      return mkjson({ items: [] });
    };
    const r = await loadReal('私聊.html', ownerFetch);
    const { w, d } = r;

    check('场景1 #imGSBtn 存在', !!d.getElementById('imGSBtn'));
    check('场景1 #imGroupSettingsModal 存在且默认隐藏',
      !!d.getElementById('imGroupSettingsModal') && d.getElementById('imGroupSettingsModal').style.display === 'none');

    // 进入群会话 → 头部「⋯」显示
    w.__IM_TEST__.S.myId = 1;
    w.__IM_TEST__.S.groups = [{ id: 42, name: '测试群', memberCount: 3 }];
    w.imOpenGroup(42);
    await sleep(60);
    check('场景1 群会话头部「⋯」显示（display=block）', d.getElementById('imGSBtn').style.display === 'block');

    // 打开面板
    w.imOpenGroupSettings();
    await sleep(120);
    const modal = d.getElementById('imGroupSettingsModal');
    check('场景1 模态可打开（display=flex）', modal.style.display === 'flex');

    const mems = d.querySelectorAll('#imGsBody .im-gs-mem');
    check('场景1 成员列表渲染 3 行', mems.length === 3, '实际=' + mems.length);
    const bodyHtml = d.getElementById('imGsBody').innerHTML;
    check('场景1 群名片优先（id1 显示「甲哥」而非全局昵称）', bodyHtml.indexOf('甲哥') !== -1 && bodyHtml.indexOf('群主甲') === -1);
    check('场景1 群名片为空回退全局昵称（id2 显示「乙」）', memoName(mems[1]) === '乙', memoName(mems[1]));
    check('场景1 角色标签含「群主」', bodyHtml.indexOf('群主</span>') !== -1 || bodyHtml.indexOf('>群主<') !== -1);

    const kicks = d.querySelectorAll('#imGsBody .im-gs-kick');
    check('场景1 群主可见「移出」按钮，且自己那行不渲染（共 2 个）', kicks.length === 2, '实际=' + kicks.length);
    check('场景1 群主危险按钮文案 = 解散群聊', /解散群聊/.test(d.querySelector('.im-gs-danger').textContent));

    // D1 / D5 接线后（T05）：群主可编辑（非禁用占位）
    check('场景1 群主可编辑群名（T05 接线后非禁用，值=测试群）',
      !d.getElementById('imGsName').disabled && d.getElementById('imGsName').value === '测试群');
    check('场景1 群主可编辑群公告（非禁用，空公告保留占位文案）',
      !d.getElementById('imGsAnn').disabled && /群主还没有发布公告/.test(d.getElementById('imGsAnn').getAttribute('placeholder') || ''));
    check('场景1 群主可编辑群内昵称（非禁用，留空占位）',
      !d.getElementById('imGsMyNick').disabled && /留空则使用全局昵称/.test(d.getElementById('imGsMyNick').getAttribute('placeholder') || ''));

    // D3 免打扰
    w.imToggleGroupMute(true);
    await sleep(40);
    const prefs = JSON.parse(w.localStorage.getItem('study_workbench_chat_prefs') || '{}');
    check('场景1 免打扰写入 chat_prefs.g42.muted=true', prefs.g42 && prefs.g42.muted === true, JSON.stringify(prefs));
    const chats = [{ __isGroup: true, id: 42, unread: 5, nickname: '测试群' }];
    check('场景1 imCountUnread 排除已免打扰群会话', w.imChatPrefs.countUnread(chats, w.imChatPrefs.load()) === 0);
    w.imToggleGroupMute(false);
    check('场景1 关闭免打扰后 g42.muted=false',
      (JSON.parse(w.localStorage.getItem('study_workbench_chat_prefs') || '{}').g42 || {}).muted === false);

    // ESC 关闭
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(40);
    check('场景1 ESC 关闭面板生效（display=none）', modal.style.display === 'none');

    check('场景1 showToast 可用', typeof w.showToast === 'function');
    check('场景1 D1/D5 空函数已挂 window',
      typeof w.imSaveGroupInfo === 'function' && typeof w.imSaveGroupNickname === 'function');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ 场景2：兜底（无 myRole / 无群名片） ============ */
  sec('[场景2] 非群主兜底：myRole 缺失→member、无名兜底「已注销用户」、退出群聊');
  {
    const fbFetch = function (url) {
      url = String(url);
      if (/\/api\/groups\/42$/.test(url)) {
        return mkjson({
          id: 42, name: '测试群',
          members: [
            { id: 1, nickname: '我', avatarUrl: null, role: 'owner' },
            { id: 9, nickname: '', avatarUrl: null, role: 'member' },
            { id: 10, role: 'member' }
          ]
        });
      }
      if (/\/api\/groups$/.test(url)) return mkjson({ items: [{ id: 42, name: '测试群', memberCount: 3 }] });
      if (url.indexOf('/api/chat/unread') !== -1) return mkjson({ total: 0, items: [] });
      if (url.indexOf('/api/friends/requests') !== -1) return mkjson({ incoming: [], unreadCount: 0 });
      return mkjson({ items: [] });
    };
    const r = await loadReal('私聊.html', fbFetch);
    const { w, d } = r;
    w.__IM_TEST__.S.myId = 1;
    w.__IM_TEST__.S.groups = [{ id: 42, name: '测试群', memberCount: 3 }];
    w.imOpenGroup(42);
    await sleep(40);
    w.imOpenGroupSettings();
    await sleep(120);

    const bodyHtml = d.getElementById('imGsBody').innerHTML;
    check('场景2 myRole 缺失 → 不渲染「移出」按钮', d.querySelectorAll('#imGsBody .im-gs-kick').length === 0);
    check('场景2 myRole 缺失 → 危险按钮为「退出群聊」', /退出群聊/.test(d.querySelector('.im-gs-danger').textContent));
    const undead = (bodyHtml.match(/已注销用户/g) || []).length;
    check('场景2 昵称兜底「已注销用户」（id9 空串 + id10 无字段 = 2 处）', undead === 2, '实际=' + undead);
    check('场景2 非群主提示「仅群主可以移除成员」', bodyHtml.indexOf('仅群主可以移除成员') !== -1);
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ 纯函数：imResolveMyRole（T02 补 ownerId 兜底） ============ */
  sec('[纯函数] imResolveMyRole：myRole 优先 / ownerId 兜底');
  {
    const r0 = await loadReal('私聊.html', function () { return mkjson({ items: [] }); });
    const f = r0.w.__IM_TEST__.imResolveMyRole;
    check('纯函数 imResolveMyRole 已导出', typeof f === 'function');
    check('myRole=owner → owner', f({ myRole: 'owner', ownerId: 9 }, 1) === 'owner');
    check('myRole=member 优先于 ownerId（即使 ownerId===myId）', f({ myRole: 'member', ownerId: 1 }, 1) === 'member');
    check('myRole=admin → admin（预留）', f({ myRole: 'admin', ownerId: 9 }, 1) === 'admin');
    check('myRole 缺失 + ownerId===myId → owner（兜底）', f({ ownerId: 1 }, 1) === 'owner');
    check('myRole 缺失 + ownerId!==myId → member', f({ ownerId: 7 }, 1) === 'member');
    check('myRole 与 ownerId 均缺失 → member', f({}, 1) === 'member');
    check('g 为空 → member', f(null, 1) === 'member');
    check('ownerId 字符串/数字宽松比较', f({ ownerId: '1' }, 1) === 'owner' && f({ ownerId: 1 }, '1') === 'owner');
    uncaughtAll = uncaughtAll.concat(r0.w.__uncaught || [], r0.vcErrors);
  }

  /* ============ 场景3：myRole 缺失 + ownerId===myId → 仍判为群主 ============ */
  sec('[场景3] myRole 缺失 + ownerId===myId → 群主（解散群聊 + 移出按钮）');
  {
    const fetch3 = function (url) {
      url = String(url);
      if (/\/api\/groups\/42$/.test(url)) {
        return mkjson({
          id: 42, name: '测试群', ownerId: 1,
          members: [
            { id: 1, nickname: '我', avatarUrl: null, role: 'owner' },
            { id: 2, nickname: '乙', avatarUrl: null, role: 'member' },
            { id: 3, nickname: '丙', avatarUrl: null, role: 'member' }
          ]
        });
      }
      if (/\/api\/groups$/.test(url)) return mkjson({ items: [{ id: 42, name: '测试群', memberCount: 3 }] });
      if (url.indexOf('/api/chat/unread') !== -1) return mkjson({ total: 0, items: [] });
      if (url.indexOf('/api/friends/requests') !== -1) return mkjson({ incoming: [], unreadCount: 0 });
      return mkjson({ items: [] });
    };
    const r = await loadReal('私聊.html', fetch3);
    const { w, d } = r;
    w.__IM_TEST__.S.myId = 1;
    w.__IM_TEST__.S.groups = [{ id: 42, name: '测试群', memberCount: 3 }];
    w.imOpenGroup(42);
    await sleep(40);
    w.imOpenGroupSettings();
    await sleep(120);
    check('场景3 无 myRole 但 ownerId===myId → 危险按钮为「解散群聊」',
      /解散群聊/.test(d.querySelector('.im-gs-danger').textContent));
    check('场景3 无 myRole 但 ownerId===myId → 可见「移出」按钮（2 个，自己那行排除）',
      d.querySelectorAll('#imGsBody .im-gs-kick').length === 2,
      '实际=' + d.querySelectorAll('#imGsBody .im-gs-kick').length);
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ 源码级：私聊会话隐藏「⋯」 ============ */
  sec('[源码级] 私聊会话隐藏「⋯」/ ESC 链纳入 gsm');
  {
    const cl = fs.readFileSync(path.join(ROOT, 'assets/chat-local.js'), 'utf8');
    check('源码级 renderChatHeader 私聊分支 display=none',
      /gsBtnP\.style\.display = 'none'/.test(cl));
    check('源码级 imEscClose 纳入 #imGroupSettingsModal',
      /imEscClose[\s\S]{0,400}imGroupSettingsModal[\s\S]{0,120}imCloseGroupSettings/.test(cl));
  }

  /* ============ 通用：零未捕获异常 ============ */
  sec('[通用] 零未捕获异常');
  const real = uncaughtAll.filter(x => x && !/navigation/i.test(x));
  check('两场景均无未捕获异常（window error + jsdomError）', real.length === 0,
    real.length ? real.slice(0, 6).join(' | ').slice(0, 300) : 'clean');

  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (FAILS.length) { console.log('--- FAIL 明细 ---'); FAILS.forEach(x => console.log('  * ' + x)); }
  try { qaServer.close(); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });

function memoName(el) {
  if (!el) return '';
  const n = el.querySelector('.im-gs-mem-name');
  return n ? n.textContent.trim() : '';
}
