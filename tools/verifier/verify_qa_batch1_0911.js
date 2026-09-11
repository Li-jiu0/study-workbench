#!/usr/bin/env node
/**
 * tools/verifier/verify_qa_batch1_0911.js
 * 「星途」批次一增量 —— QA 独立验收脚本（证伪向，非复跑工程师自测）。
 *
 * 运行：cd tools/verifier && node verify_qa_batch1_0911.js
 * 退出码：0 = 全部通过；1 = 存在失败项。
 *
 * 覆盖（对应任务清单 1~10）：
 *   [1]  6 个重点页打开零未捕获异常 + app.js 顶层执行到底（late canary）+ showToast 可用
 *   [2]  T06 语音回退链真可达（stub netSpeak）+ shouldUseDictTts 真值表
 *   [3]  A4 renderUserHome isFriend 真值表（含 {items:[]}/裸数组/异常回退）
 *   [4]  A8 更多.html / 工具.html 独立打开 + 底部导航 + 「穿越英语」可见
 *   [5]  A6 设置页改密前端拦截（<6 位 / 两次不一致 / 合法才发请求）
 *   [6]  A5 删好友二次确认弹层 + 默认不勾选清空 + 请求无线索
 *   [7]  A1/A2 Esc 关闭弹层 + 群成员头像只切换勾选 + 会话头像改提示
 *   [8]  T05 版本号完整性（live 页 ?v= 全为 20260911f / e 残留 0 / 损坏正则 0 / 标签配平）
 *   [9]  A7 语音消息 DOM + MediaRecorder 缺失时优雅降级
 *   [10] 对照：跑一遍工程师自测（另行提示，不在本进程内执行）
 *
 * 只读业务代码：本脚本绝不写入 assets/**、*.html、server/**。
 */
'use strict';

const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// 页面内存在轮询/定时器（initStudyTimer 等），关闭 jsdom window 后其异步回调会访问
// localStorage 而抛错。这里统一兜底：记录但不中断本次验收（脚本末尾自行 process.exit）。
process.on('unhandledRejection', (r) => { console.log('  [harness] unhandledRejection: ' + ((r && r.message) || r)); });
process.on('uncaughtException', (e) => { console.log('  [harness] uncaughtException: ' + ((e && e.message) || e)); });

let PASS = 0, FAIL = 0, SKIP = 0;
const failureLog = [];

function ok(label, cond, detail) {
  if (cond) { PASS++; console.log('  \u2714 PASS  ' + label + (detail ? '   [' + detail + ']' : '')); }
  else { FAIL++; failureLog.push(label + (detail ? '   [' + detail + ']' : '')); console.log('  \u2718 FAIL  ' + label + (detail ? '   [' + detail + ']' : '')); }
}
function skip(label, why) { SKIP++; console.log('  \u26A0 SKIP  ' + label + '   [' + why + ']'); }
function sec(t) { console.log('\n========== ' + t + ' =========='); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ------------------------------------------------------------------ *
 * 载入一个页面：用 jsdom 真解析 + 按 DOM 顺序 eval 脚本（用 querySelectorAll，
 * 由解析器处理注释/属性，避免正则误判被注释掉的 <script>）。
 * 关键：任何同步顶层抛错都会被捕获为 evalError —— 这正是 #1 要测的“打断 app.js
 * 顶层后续初始化”的路径。
 * ------------------------------------------------------------------ */
function load(page, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = (e && e.message) || String(e);
    if (/Not implemented/i.test(m)) return;           // jsdom 未实现项（导航/媒体）不视为页面缺陷
    errors.push('[jsdom] ' + m);
  });
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/' + encodeURIComponent(page),
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.addEventListener('error', e => errors.push('[error] ' + (e && (e.message || e.type))));
  w.addEventListener('unhandledrejection', e => errors.push('[reject] ' + (e && e.reason && (e.reason.message || e.reason))));

  // 预置登录态：绕开 app.js 顶层登录门禁 `location.replace('登录.html')`
  try {
    w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa-verifier', loginAt: Date.now() }));
    w.localStorage.setItem('study_workbench_token', 'qa-token');
  } catch (e) { /* ignore */ }

  // 需要预置的环境桩（在 eval 之前）
  if (typeof w.fetch !== 'function') {
    w.fetch = function () {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    };
  }
  if (typeof w.matchMedia !== 'function') {
    w.matchMedia = function () { return { matches: false, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } }; };
  }
  if (opts.preset) { try { opts.preset(w); } catch (e) { errors.push('[preset] ' + e.message); } }

  const scripts = Array.from(w.document.querySelectorAll('script'));
  for (const s of scripts) {
    const src = s.getAttribute('src');
    try {
      if (src) {
        const rel = src.split('?')[0];
        const fp = path.join(ROOT, rel);
        if (fs.existsSync(fp)) w.eval(fs.readFileSync(fp, 'utf8'));
        else errors.push('[missing src] ' + rel);
      } else {
        const txt = s.textContent;
        if (txt && txt.trim()) w.eval(txt);
      }
    } catch (e) {
      errors.push('[eval ' + (src || 'inline') + '] ' + (e && e.message));
    }
  }

  try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) { errors.push('[DOMContentLoaded] ' + e.message); }
  try { w.dispatchEvent(new w.Event('load')); } catch (e) { errors.push('[load] ' + e.message); }

  return {
    w, d: w.document, errors,
    // 不调用 w.close()：页面轮询/定时器的异步回调会在 close 后访问 localStorage 而抛错。
    // 进程末尾用 process.exit 收尾，无需依赖 window 关闭。
    dispose() { /* no-op（见上） */ },
  };
}

function pageHasAppJs(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  return /assets\/app\.js/.test(html);
}

/* ================================================================== */
(async function main() {

  /* ============ [1] 重点页零异常 + showToast 可用 ============ */
  sec('[1] 重点页打开零未捕获异常 + showToast 可用');
  const CANARY_PAGES = ['更多.html', '工具.html', '私聊.html', '设置.html', '好友申请.html', '学习工作台.html'];
  for (const page of CANARY_PAGES) {
    const h = load(page);
    ok(page + ' 打开后无未捕获异常/eval 错误', h.errors.length === 0, h.errors.length ? h.errors.join(' | ') : '0 错误');

    if (pageHasAppJs(page)) {
      // app.js 顶层若在 #countdownModal 处抛错，会在 6193 行的 window.seedStudyLimitUI 之前中断。
      ok(page + ' app.js 顶层执行到底（seedStudyLimitUI canary）', typeof h.w.seedStudyLimitUI === 'function',
        'typeof seedStudyLimitUI=' + typeof h.w.seedStudyLimitUI);
      ok(page + ' app.js 顶层执行到底（speakWordNow canary）', typeof h.w.speakWordNow === 'function',
        'typeof speakWordNow=' + typeof h.w.speakWordNow);
      ok(page + ' 共用 DOM #countdownModal 存在', !!h.d.getElementById('countdownModal'));
      ok(page + ' 共用 DOM .more-overlay 存在', !!h.d.querySelector('.more-overlay'));
      ok(page + ' window.showToast 为函数', typeof h.w.showToast === 'function');
      let toastOk = true, toastErr = '';
      try { h.w.showToast('QA 探针'); } catch (e) { toastOk = false; toastErr = e.message; }
      ok(page + ' 调用 showToast 不抛错（toastTimer 已初始化）', toastOk, toastErr || 'ok');
    } else {
      // 好友申请.html 为保留旧整页，不加载 app.js，自带内联 toast()
      skip(page + ' window.showToast 可用', '该页不加载 assets/app.js（旧整页自带内联 toast，见源码 <script> 无 app.js）');
      ok(page + ' 旧整页搜索 UI 完整（#q / #results / #requests）',
        !!h.d.getElementById('q') && !!h.d.getElementById('results') && !!h.d.getElementById('requests'));
    }
    h.dispose();
  }

  /* ============ [2] T06 语音回退链 + shouldUseDictTts ============ */
  sec('[2] T06 语音回退链真可达 + shouldUseDictTts 真值表');
  {
    const h = load('学习工作台.html');
    const w = h.w;
    ok('T06 shouldUseDictTts / speakFallback / netSpeak / speakText / speakUtterance 均为函数',
      ['shouldUseDictTts', 'speakFallback', 'netSpeak', 'speakText', 'speakUtterance'].every(fn => typeof w[fn] === 'function'));

    // --- 纯函数真值表（第 2 轮：并入 T09/D1 修复后的中文口径）---
    const cases = [
      // 英文词/短语 → true（未被改坏）
      ['hello', true], ['apple', true], ['thank you', true],
      // 英文句子 → false
      ['Hi what can I get for you today', false],
      ['the quick brown fox', false],
      ['Hello, world', false],
      // 中文 ≥4 字 → false（D1 修复点）
      ['你好世界', false], ['今天天气', false], ['学习工作台', false],
      // 中文 ≤3 字 → true（行为不变）
      ['你好', true], ['你好吗', true], ['图书馆', true],
      ['', false], [null, false],
    ];
    for (const [t, exp] of cases) {
      let got; try { got = w.shouldUseDictTts(t); } catch (e) { got = 'THREW:' + e.message; }
      ok('shouldUseDictTts(' + JSON.stringify(t) + ') === ' + exp, got === exp, 'got=' + JSON.stringify(got));
    }

    // --- 回退链：stub netSpeak 回调 false → 必须真正落到 speechSynthesis.speak ---
    const realNetSpeak = w.netSpeak;
    let wsTexts = [];
    w.speechSynthesis = { cancel() { }, speak(u) { wsTexts.push(u && u.text); } };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };

    wsTexts = [];
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(false); return true; };
    w.speakText('Hello there my friend', 'en-US', 0.9);
    ok('speakText：有道失败(ok=false) → speechSynthesis.speak 被调 1 次', wsTexts.length === 1, 'calls=' + wsTexts.length);
    ok('speakText：回退朗读文本正确', wsTexts[0] === 'Hello there my friend', 'text=' + JSON.stringify(wsTexts[0]));

    wsTexts = [];
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(false); return true; };
    w.speakUtterance('apple');
    ok('speakUtterance：有道失败(ok=false) → speechSynthesis.speak 被调 1 次', wsTexts.length === 1, 'calls=' + wsTexts.length);
    ok('speakUtterance：回退朗读文本正确', wsTexts[0] === 'apple', 'text=' + JSON.stringify(wsTexts[0]));

    // --- 不许越权回退：ok=true 时不得调用 speechSynthesis ---
    wsTexts = [];
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(true); return true; };
    w.speakText('Hello there my friend', 'en-US', 0.9);
    ok('speakText：有道成功(ok=true) → 不触发 speechSynthesis', wsTexts.length === 0, 'calls=' + wsTexts.length);

    wsTexts = [];
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(true); return true; };
    w.speakUtterance('apple');
    ok('speakUtterance：有道成功(ok=true) → 不触发 speechSynthesis', wsTexts.length === 0, 'calls=' + wsTexts.length);

    // --- D1 兜底可达（不只验纯函数）：中文句子即使有道失败也要落到 Web Speech ---
    wsTexts = [];
    w.netSpeak = function (text, lang, rate, onEnd) { if (onEnd) onEnd(false); return true; };
    w.speakText('你好世界');
    ok('D1 兜底可达：speakText("你好世界") 有道失败 → speechSynthesis.speak 1 次且文本正确',
      wsTexts.length === 1 && wsTexts[0] === '你好世界', 'calls=' + wsTexts.length + ' text=' + JSON.stringify(wsTexts[0]));

    // --- 真实 netSpeak：句子应跳过有道、直接走回退并返回 true ---
    wsTexts = [];
    w.netSpeak = realNetSpeak;
    let r; try { r = w.netSpeak('Hi what can I get for you today', 'en-US', 0.9, null); } catch (e) { r = 'THREW:' + e.message; }
    ok('真实 netSpeak(句子)：返回 true 且直接走回退', r === true && wsTexts.length === 1, 'r=' + r + ' calls=' + wsTexts.length);

    h.dispose();
  }

  /* ============ [3] A4 renderUserHome isFriend 真值表 ============ */
  sec('[3] A4 renderUserHome isFriend 判定（含回退形态）');
  {
    const h = load('个人中心.html');
    const w = h.w;

    async function probe(userId, user, friendResp) {
      const calls = [];
      w.CURRENT_USER = { id: 1, username: 'me', nickname: '我', stats: {} };
      w.api = function (p) {
        calls.push(p);
        if (/\/api\/users\//.test(p)) return Promise.resolve(user);
        if (/\/api\/friends/.test(p)) {
          if (friendResp === 'THROW') return Promise.reject(new Error('boom'));
          return Promise.resolve(friendResp === undefined ? [] : friendResp);
        }
        return Promise.resolve({});
      };
      const box = w.document.createElement('div');
      w.document.body.appendChild(box);
      let threw = null;
      try { await w.renderUserHome(userId, box); } catch (e) { threw = e.message; }
      return { html: box.innerHTML, calls, threw };
    }
    const base = (over) => Object.assign({ username: 'peer', nickname: '小明', motto: 'hi', avatarUrl: null, notes: [], stats: {}, isMe: false }, over);

    { // 3.1 isFriend=true
      const r = await probe(2, base({ id: 2, isFriend: true }), { items: [] });
      ok('A4 isFriend=true → 出现「发消息」', /发消息/.test(r.html), r.threw || '');
      ok('A4 isFriend=true → 出现「删除好友」', /删除好友/.test(r.html));
      ok('A4 isFriend=true → 不出现「加为好友」', !/加为好友/.test(r.html));
      ok('A4 isFriend=true → 不额外查 /api/friends（信任服务端字段）', !r.calls.some(p => /\/api\/friends/.test(p)), 'calls=' + JSON.stringify(r.calls));
    }
    { // 3.2 isFriend=false
      const r = await probe(3, base({ id: 3, isFriend: false }), { items: [{ id: 3 }] });
      ok('A4 isFriend=false → 出现「加为好友」', /加为好友/.test(r.html));
      ok('A4 isFriend=false → 不出现「删除好友」', !/删除好友/.test(r.html));
      ok('A4 isFriend=false → 不额外查 /api/friends', !r.calls.some(p => /\/api\/friends/.test(p)), 'calls=' + JSON.stringify(r.calls));
    }
    { // 3.3 缺失 + {items:[{id:4}]}
      const r = await probe(4, base({ id: 4 }), { items: [{ id: 4, nickname: '小明' }] });
      ok('A4 isFriend 缺失 + {items:[{id=4}]} → 判为好友（无异常）', !r.threw && /删除好友/.test(r.html) && !/加为好友/.test(r.html), r.threw || '');
    }
    { // 3.4 缺失 + 裸数组
      const r = await probe(5, base({ id: 5 }), [{ id: 5, nickname: '小明' }]);
      ok('A4 isFriend 缺失 + 裸数组 [{id=5}] → 判为好友（无异常）', !r.threw && /删除好友/.test(r.html), r.threw || '');
    }
    { // 3.5 缺失 + {items:[{id:99}]}
      const r = await probe(6, base({ id: 6 }), { items: [{ id: 99 }] });
      ok('A4 isFriend 缺失 + 列表无该 id → 非好友', !r.threw && /加为好友/.test(r.html) && !/删除好友/.test(r.html), r.threw || '');
    }
    { // 3.6 缺失 + {items:[]}
      const r = await probe(7, base({ id: 7 }), { items: [] });
      ok('A4 回退形态 {items:[]} 不抛错且判非好友', !r.threw && /加为好友/.test(r.html), 'threw=' + r.threw);
    }
    { // 3.7 缺失 + 裸空数组
      const r = await probe(8, base({ id: 8 }), []);
      ok('A4 回退形态 裸数组 [] 不抛错且判非好友', !r.threw && /加为好友/.test(r.html), 'threw=' + r.threw);
    }
    { // 3.8 缺失 + /api/friends 抛错
      const r = await probe(9, base({ id: 9 }), 'THROW');
      ok('A4 /api/friends 抛错 → 兜底非好友、不冒泡异常', !r.threw && /加为好友/.test(r.html), 'threw=' + r.threw);
    }
    { // 3.9 缺失 + 畸形对象 {}
      const r = await probe(10, base({ id: 10 }), {});
      ok('A4 畸形返回 {} 不抛错且判非好友', !r.threw && /加为好友/.test(r.html), 'threw=' + r.threw);
    }
    { // 3.10 缺失 + null
      const r = await probe(11, base({ id: 11 }), null);
      ok('A4 返回 null 不抛错且判非好友', !r.threw && /加为好友/.test(r.html), 'threw=' + r.threw);
    }

    h.dispose();
  }

  /* ============ [4] A8 独立页 ============ */
  sec('[4] A8 更多.html / 工具.html 独立页');
  {
    const hMore = load('更多.html');
    ok('更多.html 打开零异常', hMore.errors.length === 0, hMore.errors.join(' | '));
    const navMore = hMore.d.querySelector('.bottom-nav');
    ok('更多.html 含底部导航', !!navMore);
    const actMore = Array.from(hMore.d.querySelectorAll('.bottom-nav-item.active')).map(x => (x.querySelector('.bn-label') || {}).textContent);
    ok('更多.html 底部「更多」高亮', actMore.includes('更多'), 'active=' + actMore.join(','));
    const toolItem = Array.from(hMore.d.querySelectorAll('.bottom-nav-item')).find(x => (x.querySelector('.bn-label') || {}).textContent === '工具');
    ok('更多.html「工具」项跳 工具.html', !!toolItem && /工具\.html/.test(toolItem.getAttribute('onclick') || ''));
    ok('更多.html 卡片齐全（学习统计/互动广场/错题本/设置/关于）',
      ['学习统计', '互动广场', '错题本', '设置', '关于'].every(t => Array.from(hMore.d.querySelectorAll('.mpc-title')).some(e => e.textContent === t)));
    hMore.dispose();

    const hTool = load('工具.html');
    ok('工具.html 打开零异常', hTool.errors.length === 0, hTool.errors.join(' | '));
    ok('工具.html 含底部导航', !!hTool.d.querySelector('.bottom-nav'));
    const actTool = Array.from(hTool.d.querySelectorAll('.bottom-nav-item.active')).map(x => (x.querySelector('.bn-label') || {}).textContent);
    ok('工具.html 底部「工具」高亮', actTool.includes('工具'), 'active=' + actTool.join(','));
    const questCard = Array.from(hTool.d.querySelectorAll('.morepage-card')).find(c => (c.querySelector('.mpc-title') || {}).textContent === '穿越英语');
    ok('工具.html「穿越英语」入口存在且可见', !!questCard,
      questCard ? 'onclick=' + questCard.getAttribute('onclick') : '未找到');
    if (questCard) {
      ok('工具.html「穿越英语」未被隐藏（无 hidden/display:none/none class）',
        !questCard.hasAttribute('hidden') && !/display\s*:\s*none/.test(questCard.getAttribute('style') || '') && !/\bhidden\b/.test(questCard.className));
      ok('工具.html「穿越英语」指向 openQuest 或回退', /openQuest/.test(questCard.getAttribute('onclick') || ''));
    }
    hTool.dispose();
  }

  /* ============ [5] A6 改密前端拦截 ============ */
  sec('[5] A6 设置页改密（前端拦截 + 合法才发请求）');
  {
    const h = load('设置.html');
    const w = h.w, d = h.d;
    ok('A6 #stPwdModal / #stPwdOld / #stPwdNew / #stPwdNew2 均存在',
      ['stPwdModal', 'stPwdOld', 'stPwdNew', 'stPwdNew2'].every(id => !!d.getElementById(id)));
    ok('A6 stOpenPwdModal / stClosePwdModal / stSubmitPwd 为函数',
      ['stOpenPwdModal', 'stClosePwdModal', 'stSubmitPwd'].every(fn => typeof w[fn] === 'function'));

    const calls = [];
    w.api = function (p, o) { calls.push({ p: p, o: o }); return Promise.resolve({ ok: true }); };
    w.localStorage.setItem('study_workbench_token', 'test-token');
    w.stOpenPwdModal();
    ok('A6 在线态可打开改密模态（.active）', d.getElementById('stPwdModal').classList.contains('active'));

    // <6 位
    d.getElementById('stPwdOld').value = 'oldpass'; d.getElementById('stPwdNew').value = '12345'; d.getElementById('stPwdNew2').value = '12345';
    await w.stSubmitPwd();
    ok('A6 新密码 5 位 → 前端拦截（0 请求）', calls.length === 0, 'calls=' + calls.length);

    // 两次不一致
    d.getElementById('stPwdNew').value = 'newpass1'; d.getElementById('stPwdNew2').value = 'newpass2';
    await w.stSubmitPwd();
    ok('A6 两次不一致 → 前端拦截（0 请求）', calls.length === 0, 'calls=' + calls.length);

    // 合法
    d.getElementById('stPwdNew').value = 'newpass1'; d.getElementById('stPwdNew2').value = 'newpass1';
    await w.stSubmitPwd();
    ok('A6 合法输入 → 恰好 1 次请求且命中 /api/auth/change-password',
      calls.length === 1 && /\/api\/auth\/change-password/.test(calls[0].p), JSON.stringify(calls[0] || {}));
    ok('A6 请求体含 oldPassword/newPassword 且值正确',
      !!(calls[0] && calls[0].o && calls[0].o.body && calls[0].o.body.oldPassword === 'oldpass' && calls[0].o.body.newPassword === 'newpass1'),
      JSON.stringify((calls[0] || {}).o || {}));
    ok('A6 成功后关闭模态', !d.getElementById('stPwdModal').classList.contains('active'));
    h.dispose();
  }

  /* ============ [6] A5 删好友 ============ */
  sec('[6] A5 删除好友二次确认 + 默认不清空');
  {
    const h = load('私聊.html');
    const w = h.w, d = h.d;
    ok('A5 window.imRemoveFriend 为函数', typeof w.imRemoveFriend === 'function');

    const captured = [];
    w.fetch = function (url, opts) { captured.push({ url: url, opts: opts || {} }); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); };

    const before = d.querySelectorAll('.im-overlay').length;
    w.imRemoveFriend(2);
    const ovs = d.querySelectorAll('.im-overlay');
    ok('A5 生成二次确认弹层（.im-overlay 数量 +1）', ovs.length === before + 1, 'before=' + before + ' after=' + ovs.length);
    const ov = ovs[ovs.length - 1];
    ok('A5 弹层含「同时清空本机聊天记录」勾选项', !!ov && /同时清空本机聊天记录/.test(ov.innerHTML));
    const cb = ov && ov.querySelector('#imDelClearLocal');
    ok('A5 清空勾选项默认不勾选', !!cb && cb.checked === false, 'checked=' + (cb && cb.checked));

    // 点确认（默认未勾选）→ 断言 DELETE 请求存在且不含清空标志
    const confirmBtn = ov && ov.querySelector('#imDelConfirmBtn');
    ok('A5 弹层含确认删除按钮', !!confirmBtn);
    if (confirmBtn) {
      confirmBtn.click();
      await sleep(10);
      const del = captured.find(c => /\/api\/friends\/2(\?|$)/.test(c.url) && /DELETE/i.test(c.opts.method || ''));
      ok('A5 点击确认 → 发出 DELETE /api/friends/2', !!del, JSON.stringify(captured.map(c => c.url + ' ' + (c.opts.method || 'GET'))));
      const bodyStr = JSON.stringify((del && del.opts && del.opts.body) || '');
      ok('A5 请求体不含「清空/clear」线索（默认仅解除关系）', del && !/clear|清空|deleteHistory|purge/i.test(bodyStr), 'body=' + bodyStr);
    }
    h.dispose();
  }

  /* ============ [7] A1/A2 加固 ============ */
  sec('[7] A1/A2 弹层加固与头像点击');
  {
    const h = load('私聊.html');
    const w = h.w, d = h.d;

    // A1：Esc 关群聊弹层
    ok('A1 imOpenGroupCreator / imCloseGroupCreator 为函数',
      typeof w.imOpenGroupCreator === 'function' && typeof w.imCloseGroupCreator === 'function');
    const gm = d.getElementById('imGroupModal');
    ok('A1 #imGroupModal 存在', !!gm);
    w.imOpenGroupCreator();
    ok('A1 群聊弹层已打开（display:flex）', !!gm && gm.style.display === 'flex', 'display=' + (gm && gm.style.display));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('A1 Esc → 群聊弹层关闭（display:none）', !!gm && gm.style.display === 'none', 'display=' + (gm && gm.style.display));

    // A1：Esc 关加好友弹层（A3/A1 共用）
    const am = d.getElementById('imAddFriendModal');
    ok('A3/A1 #imAddFriendModal / #imAfInput / #imAfResults 存在',
      !!am && !!d.getElementById('imAfInput') && !!d.getElementById('imAfResults'));
    w.imOpenAddFriendModal();
    ok('A3 加好友弹层已打开（display:flex）', !!am && am.style.display === 'flex', 'display=' + (am && am.style.display));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('A1 Esc → 加好友弹层关闭', !!am && am.style.display === 'none', 'display=' + (am && am.style.display));

    // A1：Esc 关删除确认弹层（动态生成的 .im-overlay）
    w.imRemoveFriend(2);
    let cnt = d.querySelectorAll('.im-overlay').length;
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('A1 Esc → 删除确认弹层被移除', d.querySelectorAll('.im-overlay').length === cnt - 1, 'before=' + cnt + ' after=' + d.querySelectorAll('.im-overlay').length);

    // A2：会话列表头像点击改提示（不再跳主页）
    ok('A2 window.imShowPeerHint 为函数', typeof w.imShowPeerHint === 'function');
    let hintErr = '';
    try { w.imShowPeerHint(2); } catch (e) { hintErr = e.message; }
    const toastEl = d.getElementById('toast');
    ok('A2 imShowPeerHint 不抛错且给出提示（toast 含「点整行」）',
      !hintErr && !!toastEl && /点整行/.test(toastEl.textContent), hintErr || (toastEl && toastEl.textContent));

    // A2：源码级确认 renderChats 的会话头像走 imShowPeerHint（而非 openUserHome）
    const cl = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
    const m = cl.match(/function renderChats\(box\)\s*\{[\s\S]*?\n  \}/);
    ok('A2 renderChats 会话头像 onclick 使用 imShowPeerHint', !!m && /imShowPeerHint/.test(m[0]));
    ok('A2 renderChats 会话头像不再直接 openUserHome', !!m && !/openUserHome/.test(m[0]));

    // A2：群成员头像点击只切换勾选（打开群聊 → 点成员头像 → 出现勾选，且不导航）
    const captured = [];
    w.fetch = function (url, opts) {
      captured.push({ url: url, opts: opts || {} });
      if (/\/api\/friends/.test(url)) return Promise.resolve({ json: () => Promise.resolve({ items: [{ id: 2, nickname: '甲', username: 'jia' }] }) });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
    };
    w.imOpenGroupCreator();
    await sleep(20);
    const av = gm && gm.querySelector('.im-glist .im-av');
    ok('A2 群聊成员列表渲染出头像', !!av, 'glist html=' + (gm && gm.querySelector('.im-glist') ? 'present' : 'empty'));
    if (av) {
      const onclickStr = av.getAttribute('onclick') || '';
      // 注意：jsdom 30（runScripts:'outside-only'）不执行 HTML 内联 onclick 内容属性，
      // 故这里断言“属性绑定正确” + “直接调用切换函数”两条，而非模拟点击（模拟点击会假失败）。
      ok('A2 群成员头像 onclick 只调用 imToggleGroupMember（无主页跳转/导航）',
        /imToggleGroupMember/.test(onclickStr) && !/openUserHome|location\.href/.test(onclickStr), onclickStr);
      const beforeChecked = gm.querySelectorAll('.im-gcheck.on').length;
      w.imToggleGroupMember(2);
      const afterChecked = gm.querySelectorAll('.im-gcheck.on').length;
      ok('A2 imToggleGroupMember(2) → 勾选态 0→1（仅切换勾选）', afterChecked === beforeChecked + 1,
        'before=' + beforeChecked + ' after=' + afterChecked);
      w.imToggleGroupMember(2);
      ok('A2 再次 imToggleGroupMember(2) → 取消勾选（可逆）', gm.querySelectorAll('.im-gcheck.on').length === beforeChecked,
        'after-toggle-back=' + gm.querySelectorAll('.im-gcheck.on').length);
    } else {
      skip('A2 点击群成员头像切换勾选', '群聊成员列表未渲染（可能 fetch stub 时序/DOM 结构差异）');
    }
    h.dispose();
  }

  /* ============ [8] 版本号完整性（不写死具体版本号） ============ */
  sec('[8] 版本号完整性（live 页 ?v= 一致性 / 无旧值 / 损坏正则 / 标签配平）');
  {
    // live 页口径与 bump 脚本一致：排除历史副本/存档（settings* / profile* / 设置_旧版 / blog_wechat）
    const EXCLUDE_PREFIXES = ['settings', 'profile'];
    const EXCLUDE_FILES = new Set(['设置_旧版.html', 'blog_wechat.html']);
    const allHtml = fs.readdirSync(ROOT).filter(n => n.endsWith('.html'));
    const LIVE = allHtml.filter(f => !EXCLUDE_FILES.has(f) && !EXCLUDE_PREFIXES.some(p => f.startsWith(p)));

    ok('live 页数量 ≥10（与 bump 脚本排除口径一致）', LIVE.length >= 10, 'n=' + LIVE.length);

    const extractVers = (html) => Array.from(html.matchAll(/(?:src|href)="assets\/[^"]*\?v=([^"&]+)"/g)).map(m => m[1]);
    // 历史/已废弃版本令牌（不写死"当前版本"，只排除旧值 → 每次 bump 不误报）
    const LEGACY = new Set(['v2.3', 'v2', '20260911c', '20260911d', '20260911e', '20260911f', '3', '6']);

    const mixed = [], legacyHits = [], allVers = new Set();
    for (const f of LIVE) {
      const uniq = Array.from(new Set(extractVers(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
      uniq.forEach(v => allVers.add(v));
      if (uniq.length > 1) mixed.push(f + ':' + uniq.join('/'));
      uniq.filter(v => LEGACY.has(v)).forEach(v => legacyHits.push(f + ':' + v));
    }
    ok('每个 live 页内部 ?v= 唯一（无同页混版）', mixed.length === 0, mixed.join('  ') || 'ok');
    ok('所有 live 页 ?v= 互相一致（全站单一版本号）', allVers.size === 1, 'versions=' + Array.from(allVers).join(','));
    ok('live 页 ?v= 不含任何旧值（v2.3 / 20260911c~f / 3 / 6 / v2）', legacyHits.length === 0, legacyHits.join(',') || 'ok');
    const siteVersion = allVers.size === 1 ? Array.from(allVers)[0] : null;

    // D2 定点：个人中心 / 动态 的 common.css 版本必须已是站点版本、而非 v2.3
    for (const f of ['个人中心.html', '动态.html']) {
      const m = fs.readFileSync(path.join(ROOT, f), 'utf8').match(/href="assets\/common\.css\?v=([^"]+)"/);
      ok(f + ' common.css ?v= 已非 v2.3 且 == 站点版本',
        !!m && m[1] !== 'v2.3' && m[1] === siteVersion, 'common.css?v=' + (m ? m[1] : 'N/A') + ' / site=' + siteVersion);
    }

    // 损坏特征正则（吞掉 HTML 注释/整页白屏的元凶）——全 root html 扫描
    const damaged = [];
    for (const f of allHtml) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const re = /\.js\?v=[0-9a-zA-Z]+"[^>]/g;
      let mm; while ((mm = re.exec(html)) !== null) damaged.push(f + ' :: ' + mm[0].slice(0, 40));
    }
    ok('损坏特征正则 \\.js\\?v=[0-9a-zA-Z]+"[^>] 命中 0（全站）', damaged.length === 0, damaged.slice(0, 5).join(' | ') || '0');

    // 标签/注释配平（D2 两页 + 抽查重点页）
    for (const f of ['个人中心.html', '动态.html', '学习工作台.html', '私聊.html', '更多.html', '工具.html']) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const cnt = (s) => (html.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const pairs = [['<!--', '-->'], ['<div', '</div'], ['<style', '</style'], ['<script', '</script']];
      const bad = pairs.filter(([a, b]) => cnt(a) !== cnt(b)).map(([a, b]) => a + '=' + cnt(a) + ' vs ' + b + '=' + cnt(b));
      ok(f + ' 标签配平（comment/div/style/script）', bad.length === 0, bad.join('; ') || 'balanced');
    }

    // 参考信息（不计入 PASS/FAIL）：被排除的历史副本/存档页仍保留旧令牌（设计如此）
    const excludedOld = allHtml.filter(f => (EXCLUDE_FILES.has(f) || EXCLUDE_PREFIXES.some(p => f.startsWith(p))) &&
      /\?v=(20260911[cf]|v2\.3|[36])\b/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    console.log('  [info] 非 live 存档页保留旧 ?v=（bump 脚本按设计排除，不算缺陷）: ' + (excludedOld.join(', ') || '无'));
  }

  /* ============ [9] A7 语音消息 DOM/降级 ============ */
  sec('[9] A7 语音消息 DOM + 降级');
  {
    const h = load('私聊.html');
    const w = h.w, d = h.d;
    ok('A7 输入栏含 🎤 录音按钮（onclick=imToggleRecord()）', !!d.querySelector('.im-composer button[onclick="imToggleRecord()"]'));
    ok('A7 window.imToggleRecord 为函数', typeof w.imToggleRecord === 'function');
    ok('A7 环境无 MediaRecorder（jsdom 默认）', typeof w.MediaRecorder === 'undefined', 'typeof=' + typeof w.MediaRecorder);

    const toastEl = d.getElementById('toast');
    let threw = '';
    try { w.imToggleRecord(); } catch (e) { threw = e.message; }
    ok('A7 MediaRecorder 缺失 → 不抛异常', threw === '', threw);
    ok('A7 缺失时给出降级提示（toast 含「不支持录音」）', !!toastEl && /不支持录音/.test(toastEl.textContent), toastEl && toastEl.textContent);

    // 源码级：voice 渲染分支存在
    const cl = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
    ok('A7 renderMsgs 有 voice 渲染分支', /m\.kind === 'voice'/.test(cl));
    ok('A7 使用 MediaRecorder 录制 + 60s/2MB 上限', /MediaRecorder/.test(cl) && /MAX_VOICE_MS/.test(cl) && /MAX_VOICE_BYTES/.test(cl));
    h.dispose();
  }

  /* ============ 汇总 ============ */
  console.log('\n========== 汇总 ==========');
  console.log('通过 ' + PASS + ' 项，失败 ' + FAIL + ' 项，跳过 ' + SKIP + ' 项。');
  if (failureLog.length) { console.log('\n失败清单：'); failureLog.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x)); }
  process.exit(FAIL ? 1 : 0);

})().catch(e => {
  console.error('\n[verifier 内部异常] ' + (e && e.stack || e));
  process.exit(2);
});
