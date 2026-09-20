/**
 * tools/qa/ed_t05_wiring_0911.js —— T05 自测（寇豆码，2026-09-11）
 * 运行：node tools/qa/ed_t05_wiring_0911.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。mock fetch（后端未上线）。
 *
 * 覆盖：
 *   设置页 C1/C2/C3：privacy 回填（三种档位组合）、改动即保存且请求体只含变更字段、URL/method 正确、
 *                    保存失败回滚 UI + 提示
 *   动态页：发布卡显示当前可见范围文案
 *   群设置面板 D1/D5：群主可编辑并发出 PATCH；非群主只读；群名片保存（空串=清除）；myGroupNickname 缺失兜底
 *   零未捕获异常 + showToast 可用
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

const QA_PORT = 8141;
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
  await sleep(500);
  return { w: wRef, d: wRef.document, vcErrors };
}

function mkjson(o) { return Promise.resolve({ ok: true, json: () => Promise.resolve(o), text: () => Promise.resolve(JSON.stringify(o)) }); }
function mkerr(status, detail) { return Promise.resolve({ ok: false, status: status, json: () => Promise.resolve({ detail: detail }), text: () => Promise.resolve('') }); }
const sameKeys = (obj, keys) => obj && Object.keys(obj).sort().join(',') === keys.slice().sort().join(',');

// 设置页 fetch 工厂
function settingsFetch(state) {
  return function (url, opt) {
    url = String(url); opt = opt || {};
    if (/\/api\/auth\/me$/.test(url)) return mkjson({ id: 1, nickname: '我', privacy: state.privacy });
    if (/\/api\/users\/me\/privacy$/.test(url)) {
      var body = JSON.parse(opt.body || '{}');
      state.puts.push({ url: url, method: opt.method, body: body });
      if (state.fail) return mkerr(400, '设置值不合法');
      state.privacy = Object.assign({}, state.privacy, body);
      return mkjson({ momentVisibility: state.privacy.momentVisibility, friendAllow: state.privacy.friendAllow, searchable: state.privacy.searchable });
    }
    if (url.indexOf('/api/friends/blocked') !== -1) return mkjson({ items: [] });
    return mkjson({ items: [] });
  };
}
function segActive(d, val) {
  var b = d.querySelector('#stSearchableSeg button[data-val="' + val + '"]');
  return !!(b && b.classList.contains('active'));
}

(async function main() {
  let uncaughtAll = [];

  /* ============ 设置页：回填 + 部分更新 + 回滚 ============ */
  sec('[C1/C2/C3] 设置页隐私三控件接线');
  const stateA = { privacy: { momentVisibility: 'friends', friendAllow: 'everyone', searchable: false }, puts: [], fail: false };
  {
    const r = await loadReal('设置.html', settingsFetch(stateA));
    const { w, d } = r;
    const toasts = [];
    w.showToast = function (m) { toasts.push(String(m)); };

    check('回填 C1 动态可见范围 = friends', d.getElementById('stMomentScope').value === 'friends', d.getElementById('stMomentScope').value);
    check('回填 C2 谁可加我好友 = everyone', d.getElementById('stFriendPolicy').value === 'everyone', d.getElementById('stFriendPolicy').value);
    check('回填 C3 能否被搜索到 = false（不允许高亮）', segActive(d, '0') && !segActive(d, '1'));
    check('三控件均已启用（非 disabled）',
      !d.getElementById('stMomentScope').disabled && !d.getElementById('stFriendPolicy').disabled &&
      !d.querySelector('#stSearchableSeg button').disabled);

    // C1 改 → 只传 momentVisibility
    const ms = d.getElementById('stMomentScope');
    ms.value = 'private'; ms.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(80);
    const p1 = stateA.puts[stateA.puts.length - 1];
    check('C1 改动发出 PUT /api/users/me/privacy', p1 && /\/api\/users\/me\/privacy$/.test(p1.url) && p1.method === 'PUT', p1 && (p1.method + ' ' + p1.url));
    check('C1 请求体只含 momentVisibility（部分更新）', sameKeys(p1 && p1.body, ['momentVisibility']) && p1.body.momentVisibility === 'private', JSON.stringify(p1 && p1.body));
    check('C1 保存成功后 select 保持 private', ms.value === 'private' && toasts.some(t => t.indexOf('已保存') !== -1), ms.value);

    // C2 改 → 只传 friendAllow
    const fp = d.getElementById('stFriendPolicy');
    fp.value = 'nobody'; fp.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(80);
    const p2 = stateA.puts[stateA.puts.length - 1];
    check('C2 请求体只含 friendAllow', sameKeys(p2 && p2.body, ['friendAllow']) && p2.body.friendAllow === 'nobody', JSON.stringify(p2 && p2.body));

    // C3 改 → 只传 searchable
    d.querySelector('#stSearchableSeg button[data-val="1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(80);
    const p3 = stateA.puts[stateA.puts.length - 1];
    check('C3 请求体只含 searchable', sameKeys(p3 && p3.body, ['searchable']) && p3.body.searchable === true, JSON.stringify(p3 && p3.body));
    check('C3 点击后高亮切换到「允许」', segActive(d, '1') && !segActive(d, '0'));

    // 回滚：mock 400 → UI 回到保存前值（momentVisibility 当前 private）
    stateA.fail = true;
    toasts.length = 0;
    ms.value = 'public'; ms.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(100);
    check('保存失败 → C1 回滚到保存前的 private', ms.value === 'private', ms.value);
    check('保存失败 → 有 toast 提示', toasts.some(t => /保存失败/.test(t)), toasts.join('|'));
    stateA.fail = false;

    check('showToast 可用', typeof w.showToast === 'function');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  // 另外两种档位组合回填
  const combos = [
    { momentVisibility: 'public', friendAllow: 'need_confirm', searchable: true, c3val: '1' },
    { momentVisibility: 'private', friendAllow: 'nobody', searchable: false, c3val: '0' }
  ];
  for (const c of combos) {
    const st = { privacy: { momentVisibility: c.momentVisibility, friendAllow: c.friendAllow, searchable: c.searchable }, puts: [], fail: false };
    const r = await loadReal('设置.html', settingsFetch(st));
    const d = r.d;
    check('组合回填 C1=' + c.momentVisibility + ' C2=' + c.friendAllow + ' C3=' + c.searchable,
      d.getElementById('stMomentScope').value === c.momentVisibility &&
      d.getElementById('stFriendPolicy').value === c.friendAllow &&
      segActive(d, c.c3val) && !segActive(d, c.c3val === '1' ? '0' : '1'));
    uncaughtAll = uncaughtAll.concat(r.w.__uncaught || [], r.vcErrors);
  }

  /* ============ 动态页：范围标签 ============ */
  sec('[动态页] 发布卡显示当前可见范围');
  {
    const fetchMo = function (url) {
      url = String(url);
      if (/\/api\/auth\/me$/.test(url)) return mkjson({ id: 1, nickname: '我', privacy: { momentVisibility: 'friends' } });
      return mkjson({ items: [], hasMore: false });
    };
    const r = await loadReal('动态.html', fetchMo);
    const { w, d } = r;
    const tag = d.getElementById('moScopeTag');
    check('发布卡存在 #moScopeTag', !!tag);
    check('显示「当前：仅好友可见」', tag && tag.textContent.indexOf('仅好友可见') !== -1 && tag.style.display !== 'none', tag && tag.textContent);
    // 未知/缺失 → 隐藏（不显示错误范围）
    w.moRenderScopeLabel(undefined);
    check('范围缺失 → 标签隐藏', tag.style.display === 'none');
    w.moRenderScopeLabel('public');
    check('范围 public → 「当前：公开可见」', tag.textContent.indexOf('公开可见') !== -1, tag.textContent);
    w.moRenderScopeLabel('private');
    check('范围 private → 「当前：仅自己可见」', tag.textContent.indexOf('仅自己可见') !== -1, tag.textContent);
    check('动态页 showToast 可用', typeof w.showToast === 'function');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ 群设置面板 D1/D5 ============ */
  sec('[群面板] D1 群主可编辑 + D5 群名片（含空串清除）');
  {
    const st = { patches: [] };
    const fetchGrp = function (url, opt) {
      url = String(url); opt = opt || {};
      if (/\/api\/groups\/42$/.test(url)) {
        if ((opt.method || '').toUpperCase() === 'PATCH') { st.patches.push({ url: url, method: 'PATCH', body: JSON.parse(opt.body || '{}') }); return mkjson({ id: 42, name: (JSON.parse(opt.body || '{}').name || '测试群'), announcement: '' }); }
        return mkjson({
          id: 42, name: '测试群', ownerId: 1, myRole: 'owner', myGroupNickname: '冲刺君', announcement: '加油每一天',
          members: [{ id: 1, nickname: '群主甲', avatarUrl: null, role: 'owner', groupNickname: '冲刺君' }, { id: 2, nickname: '乙', avatarUrl: null, role: 'member' }]
        });
      }
      if (/\/api\/groups\/42\/me$/.test(url)) {
        st.patches.push({ url: url, method: 'PATCH', body: JSON.parse(opt.body || '{}') });
        return mkjson({ groupNickname: JSON.parse(opt.body || '{}').groupNickname });
      }
      if (/\/api\/groups$/.test(url)) return mkjson({ items: [{ id: 42, name: '测试群', memberCount: 2 }] });
      if (url.indexOf('/api/chat/unread') !== -1) return mkjson({ total: 0, items: [] });
      if (url.indexOf('/api/friends/requests') !== -1) return mkjson({ incoming: [], unreadCount: 0 });
      return mkjson({ items: [] });
    };
    const r = await loadReal('私聊.html', fetchGrp);
    const { w, d } = r;
    w.__IM_TEST__.S.myId = 1;
    w.__IM_TEST__.S.groups = [{ id: 42, name: '测试群', memberCount: 2 }];
    w.imOpenGroup(42);
    await sleep(40);
    w.imOpenGroupSettings();
    await sleep(140);

    check('D1 群主可编辑：群名输入未禁用', !d.getElementById('imGsName').disabled);
    check('D1 群主可见「保存」按钮', !!d.getElementById('imGsSaveInfo'));
    check('D5 群名片回填 = 冲刺君', d.getElementById('imGsMyNick').value === '冲刺君', d.getElementById('imGsMyNick').value);
    check('成员列表群名片优先（冲刺君）', d.getElementById('imGsBody').innerHTML.indexOf('冲刺君') !== -1);

    // D1 保存 → PATCH /api/groups/42
    d.getElementById('imGsName').value = '新群名';
    d.getElementById('imGsAnn').value = '新公告';
    d.getElementById('imGsSaveInfo').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(100);
    const gp = st.patches.find(x => /\/api\/groups\/42$/.test(x.url));
    check('D1 保存发出 PATCH /api/groups/42', !!gp && gp.method === 'PATCH', gp && gp.method + ' ' + gp.url);
    check('D1 请求体含 name + announcement', !!gp && gp.body.name === '新群名' && gp.body.announcement === '新公告', JSON.stringify(gp && gp.body));

    // 群名空校验（不发请求）
    const cntBefore = st.patches.length;
    d.getElementById('imGsName').value = '   ';
    d.getElementById('imGsSaveInfo').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    check('D1 群名空 → 前端拦截不发请求', st.patches.length === cntBefore);

    // D5 保存 → PATCH /api/groups/42/me
    d.getElementById('imGsMyNick').value = '新名片';
    d.getElementById('imGsSaveNick').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(100);
    const np = st.patches.find(x => /\/api\/groups\/42\/me$/.test(x.url));
    check('D5 保存发出 PATCH /api/groups/42/me', !!np && np.body.groupNickname === '新名片', JSON.stringify(np && np.body));

    // 空串 = 清除
    d.getElementById('imGsMyNick').value = '';
    d.getElementById('imGsSaveNick').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(100);
    const np2 = st.patches.filter(x => /\/api\/groups\/42\/me$/.test(x.url)).pop();
    check('D5 空串保存 = 清除群名片', !!np2 && np2.body.groupNickname === '', JSON.stringify(np2 && np2.body));

    check('私聊页 showToast 可用', typeof w.showToast === 'function');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  sec('[群面板] 非群主只读 + myGroupNickname 缺失兜底');
  {
    const st = { patches: [] };
    const fetchGrp = function (url, opt) {
      url = String(url); opt = opt || {};
      if (/\/api\/groups\/42$/.test(url)) {
        if ((opt.method || '').toUpperCase() === 'PATCH') { st.patches.push({ url: url, method: 'PATCH', body: JSON.parse(opt.body || '{}') }); return mkjson({ id: 42, name: '测试群' }); }
        return mkjson({ id: 42, name: '测试群', ownerId: 7, members: [{ id: 1, nickname: '我', avatarUrl: null, role: 'member' }, { id: 7, nickname: '乙', avatarUrl: null, role: 'owner' }] }); // 无 myRole / 无 myGroupNickname / 无 announcement
      }
      if (/\/api\/groups$/.test(url)) return mkjson({ items: [{ id: 42, name: '测试群', memberCount: 2 }] });
      if (url.indexOf('/api/chat/unread') !== -1) return mkjson({ total: 0, items: [] });
      if (url.indexOf('/api/friends/requests') !== -1) return mkjson({ incoming: [], unreadCount: 0 });
      return mkjson({ items: [] });
    };
    const r = await loadReal('私聊.html', fetchGrp);
    const { w, d } = r;
    w.__IM_TEST__.S.myId = 1;
    w.__IM_TEST__.S.groups = [{ id: 42, name: '测试群', memberCount: 2 }];
    w.imOpenGroup(42);
    await sleep(40);
    w.imOpenGroupSettings();
    await sleep(140);

    check('非群主（ownerId!==myId 且无 myRole）→ 群名只读', d.getElementById('imGsName').disabled);
    check('非群主 → 群公告只读', d.getElementById('imGsAnn').disabled);
    check('非群主 → 无「保存」按钮', !d.getElementById('imGsSaveInfo'));
    check('非群主 → 提示「仅群主/管理员可以修改群名与公告」', d.getElementById('imGsBody').innerHTML.indexOf('仅群主/管理员可以修改群名与公告') !== -1);
    check('myGroupNickname 缺失 → 群名片输入兜底为空且不报错', d.getElementById('imGsMyNick').value === '');
    uncaughtAll = uncaughtAll.concat(w.__uncaught || [], r.vcErrors);
  }

  /* ============ 通用：零未捕获异常 ============ */
  sec('[通用] 零未捕获异常');
  const real = uncaughtAll.filter(x => x && !/navigation/i.test(x));
  check('全部页面/场景均无未捕获异常（window error + jsdomError）', real.length === 0,
    real.length ? real.slice(0, 6).join(' | ').slice(0, 300) : 'clean');

  console.log('\n===== 汇总 =====');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  if (FAILS.length) { console.log('--- FAIL 明细 ---'); FAILS.forEach(x => console.log('  * ' + x)); }
  try { qaServer.close(); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
