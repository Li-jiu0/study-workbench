// R88-M5 behavior test (jsdom) — AI 对话记录管理 9 项验收（异步 runner）
// 运行： node tools/m5_test.js   （期望输出 ALL PASS，退出码 0）
const fs = require('fs');
const { JSDOM } = require('D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom');
const PROFILE = fs.readFileSync('D:/下载的文件/学习工作台/assets/xt-profile.js', 'utf8');

const html = `<!DOCTYPE html><html><body class="theme-home">
  <div class="xtp-wrap"><main id="xtProfileRoot" class="xtp-root"></main></div>
  <div id="xtpViews"></div><div id="xtpToast"></div><div id="xtpModalHost"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.local/个人资料.html' });
const w = dom.window;
const DAY = 86400000, now = Date.now();
function sess(id, title, ts, msgs) {
  return { id: id, title: title, createdAt: ts, updatedAt: ts,
    messages: msgs.map(function (m) { return { role: m[0], content: m[1] }; }) };
}
const seed = [
  sess('chat_a', '函数极限问题', now - 2 * 3600000, [['user', '什么是函数极限'], ['assistant', '函数极限是…']]),
  sess('chat_b', '英语作文批改', now - 3 * DAY, [['user', '帮我改作文'], ['assistant', '好的，第一段…']]),
  sess('chat_c', '历史事件整理', now - 20 * DAY, [['user', '整理鸦片战争'], ['assistant', '时间线如下…']]),
  sess('chat_d', '线代矩阵笔记', now - 60 * DAY, [['user', '矩阵秩怎么求'], ['assistant', '用行阶梯形…']]),
  sess('chat_e', '物理受力分析', now - 1 * DAY, [['user', '斜面受力'], ['assistant', '分解重力…']]),
  sess('chat_f', '单词记忆法', now - 5 * 3600000, [['user', '如何记单词'], ['assistant', '联想记忆…']])
];
w.localStorage.setItem('ai_chat_history', JSON.stringify(seed));
w.lucideAutoRender = function () {};
w.isOnlineSession = function () { return false; };
w.api = function () { return Promise.resolve({ items: [] }); };
w.eval(PROFILE);

const OUT = [];
function assert(cond, msg) { OUT.push((cond ? 'ok   ' : 'FAIL ') + msg); return cond; }
function log(s) { OUT.push(s); }
function $id(id) { return w.document.getElementById(id); }
function q(sel, root) { return (root || w.document).querySelector(sel); }
function qa(sel, root) { return Array.prototype.slice.call((root || w.document).querySelectorAll(sel)); }
function click(el) { el.dispatchEvent(new w.Event('click', { bubbles: true })); }
function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function sessionsInLS() { try { return JSON.parse(w.localStorage.getItem('ai_chat_history') || '[]'); } catch (e) { return []; } }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cardOf(id) { return qa('.xtp-m5-card').filter(function (c) { return c.getAttribute('data-id') === id; })[0]; }

(async function run() {
  // 打开 chat 视图并等待异步 paint
  w.xtpOpenView('chat');
  await sleep(60);

  log('=== R88-M5 行为验收（jsdom）===');

  // 1. 初始渲染
  assert(!!q('#xtpM5Kw'), '1) 搜索框 #xtpM5Kw 存在');
  assert(qa('.xtp-m5-card').length === 6, '1) 初始 6 条会话卡 (got=' + qa('.xtp-m5-card').length + ')');

  // 2. 清空全部
  click(q('#xtpM5ClearAll'));
  assert(!!$id('xtpMask'), '2) 清空全部弹二次确认');
  click(q('#xtpConfirmCancel'));
  await sleep(10);
  assert(sessionsInLS().length === 6, '2) 取消 → 不删除 (len=' + sessionsInLS().length + ')');
  click(q('#xtpM5ClearAll'));
  click($id('xtpConfirmOk'));
  await sleep(10);
  assert(sessionsInLS().length === 0, '2) 确认 → 清空全部 (len=' + sessionsInLS().length + ')');
  // 还原
  w.localStorage.setItem('ai_chat_history', JSON.stringify(seed));
  w.localStorage.removeItem('xt_ai_chat_meta_v1');
  w.xtpCloseView('chat'); w.xtpOpenView('chat');
  await sleep(60);

  // 3. 标签
  click(cardOf('chat_a').querySelector('.xtpM5Tag'));
  const tinp = q('#xtpM5TagInput');
  assert(!!tinp, '3) 标签编辑弹层出现');
  tinp.value = '数学';
  click(q('#xtpM5TagOk'));
  await sleep(10);
  assert(cardOf('chat_a').textContent.indexOf('数学') >= 0, '3) chat_a 显示标签「数学」');
  const tagSel = q('#xtpM5Tag');
  const opts = Array.prototype.slice.call(tagSel.options).map(function (o) { return o.value; });
  assert(opts.indexOf('数学') >= 0, '3) 标签下拉含「数学」');
  tagSel.value = '数学'; fire(tagSel, 'change');
  await sleep(10);
  assert(qa('.xtp-m5-card').length === 1, '3) 按「数学」筛选 → 1 条 (got=' + qa('.xtp-m5-card').length + ')');
  const ts2 = q('#xtpM5Tag'); ts2.value = ''; fire(ts2, 'change');
  await sleep(10);

  // 4. 搜索
  const kw = q('#xtpM5Kw'); kw.value = '矩阵'; fire(kw, 'input');
  await sleep(260);
  assert(qa('.xtp-m5-card').length === 1 && cardOf('chat_d'), '4) 搜索「矩阵」→ chat_d (got=' + qa('.xtp-m5-card').length + ')');
  const kw2 = q('#xtpM5Kw'); kw2.value = '英语作文'; fire(kw2, 'input');   // 标题匹配
  await sleep(260);
  assert(qa('.xtp-m5-card').length === 1 && cardOf('chat_b'), '4) 搜索标题「英语作文」→ chat_b');
  const kw3 = q('#xtpM5Kw'); kw3.value = '数学'; fire(kw3, 'input');       // 标签匹配
  await sleep(260);
  assert(qa('.xtp-m5-card').length === 1 && cardOf('chat_a'), '4) 搜索标签词「数学」→ chat_a');
  const kw4 = q('#xtpM5Kw'); kw4.value = 'zzz不存在'; fire(kw4, 'input');
  await sleep(260);
  assert(qa('.xtp-m5-card').length === 0 && q('.xtp-empty'), '4) 无命中 → 空态');
  click(q('#xtpM5Clear'));
  await sleep(20);
  assert(qa('.xtp-m5-card').length === 6, '4) 清空搜索 → 6 条');

  // 5. 单条删除
  click(cardOf('chat_b').querySelector('.xtpM5Del'));
  assert(!!$id('xtpMask'), '5) 单条删除弹二次确认');
  click($id('xtpConfirmOk'));
  await sleep(10);
  assert(sessionsInLS().length === 5 && !sessionsInLS().some(function (s) { return s.id === 'chat_b'; }), '5) chat_b 已删，剩 5 条');
  assert(!!cardOf('chat_a'), '5) 其余未受影响');

  // 6. 批量删除
  click(q('#xtpM5SelBtn'));
  await sleep(10);
  assert(!!q('#xtpM5SelAll'), '6) 多选模式出现「全选」');
  const bc = qa('.xtpM5Cb').filter(function (b) { return b.getAttribute('data-id') === 'chat_c'; })[0];
  bc.checked = true; fire(bc, 'change');
  await sleep(10);
  const bd = qa('.xtpM5Cb').filter(function (b) { return b.getAttribute('data-id') === 'chat_d'; })[0];
  bd.checked = true; fire(bd, 'change');
  await sleep(10);
  assert(q('.xtp-m5-selcnt').textContent.indexOf('2') >= 0, '6) 已选 2 条');
  click(q('#xtpM5DelSel'));
  assert(!!$id('xtpMask'), '6) 批量删除弹二次确认');
  click($id('xtpConfirmOk'));
  await sleep(10);
  assert(sessionsInLS().length === 3, '6) 批量删除后剩 3 条 (got=' + sessionsInLS().length + ')');
  assert(!sessionsInLS().some(function (s) { return s.id === 'chat_c' || s.id === 'chat_d'; }), '6) chat_c/chat_d 已删');

  // 7. 时间筛选（剩 chat_a 今天 / chat_e 昨天 / chat_f 今天）
  const rs = q('#xtpM5Range');
  rs.value = 'today'; fire(rs, 'change'); await sleep(10);
  assert(qa('.xtp-m5-card').length === 2, '7) 今天 → 2 条 (got=' + qa('.xtp-m5-card').length + ')');
  const rs7 = q('#xtpM5Range'); rs7.value = 'd7'; fire(rs7, 'change'); await sleep(10);
  assert(qa('.xtp-m5-card').length === 3, '7) 近7天 → 3 条 (got=' + qa('.xtp-m5-card').length + ')');
  const rs30 = q('#xtpM5Range'); rs30.value = 'd30'; fire(rs30, 'change'); await sleep(10);
  assert(qa('.xtp-m5-card').length === 3, '7) 近30天 → 3 条 (got=' + qa('.xtp-m5-card').length + ')');
  const rsAll = q('#xtpM5Range'); rsAll.value = 'all'; fire(rsAll, 'change'); await sleep(10);
  assert(qa('.xtp-m5-card').length === 3, '7) 全部时间 → 3 条');
  // 自定义：仅昨天
  const yest = new Date(now - 1 * DAY);
  const ymd = yest.getFullYear() + '-' + ('0' + (yest.getMonth() + 1)).slice(-2) + '-' + ('0' + yest.getDate()).slice(-2);
  const rsc = q('#xtpM5Range'); rsc.value = 'custom'; fire(rsc, 'change'); await sleep(10);
  assert(!!q('#xtpM5From') && !!q('#xtpM5To'), '7) 自定义显示 from/to');
  const fEl = q('#xtpM5From'); fEl.value = ymd; fire(fEl, 'change'); await sleep(10);
  const tEl = q('#xtpM5To'); tEl.value = ymd; fire(tEl, 'change'); await sleep(10);
  assert(qa('.xtp-m5-card').length === 1 && cardOf('chat_e'), '7) 自定义昨天 → 仅 chat_e (got=' + qa('.xtp-m5-card').length + ')');
  const rsAll2 = q('#xtpM5Range'); rsAll2.value = 'all'; fire(rsAll2, 'change'); await sleep(10);

  // 8. 导出（可解析）
  let captured = null;
  const OrigBlob = w.Blob;
  w.Blob = function (parts, opts) { captured = parts && parts[0] ? parts[0] : ''; return new OrigBlob(parts, opts); };
  w.URL.createObjectURL = function () { return 'blob:x'; };
  w.URL.revokeObjectURL = function () {};
  const origAnchorClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () {};
  click(q('#xtpM5Export'));
  w.Blob = OrigBlob;
  w.HTMLAnchorElement.prototype.click = origAnchorClick;
  assert(captured !== null, '8) 导出触发文件生成');
  let parsed = null; try { parsed = JSON.parse(captured); } catch (e) { parsed = null; }
  assert(parsed && parsed.type === 'xt-ai-chat-backup' && Array.isArray(parsed.sessions), '8) 导出可 JSON 解析且结构正确');
  assert(parsed && parsed.sessions.length === 3, '8) 导出 3 条 (got=' + (parsed && parsed.sessions.length) + ')');

  // 9. 备份恢复：导出包 → 清空 → 导入 → 逐条还原
  const backupObj = parsed;
  w.localStorage.removeItem('ai_chat_history');
  w.localStorage.removeItem('xt_ai_chat_meta_v1');
  assert(sessionsInLS().length === 0, '9) 导入前清空 → 0 条');

  // 驱动 m5Restore：stub FileReader + 注入 files
  const OrigFR = w.FileReader;
  w.FileReader = function () {
    var self = this;
    this.onload = null; this.onerror = null; this.__result = '';
    this.readAsText = function () {
      self.__result = JSON.stringify(backupObj);
      setTimeout(function () { if (self.onload) { self.onload(); } }, 0);
    };
    Object.defineProperty(this, 'result', { get: function () { return self.__result; } });
  };
  const origCreate = w.document.createElement.bind(w.document);
  let restoreInput = null;
  w.document.createElement = function (tag) {
    var el = origCreate(tag);
    if (String(tag).toLowerCase() === 'input') {
      restoreInput = el;
      try { Object.defineProperty(el, 'files', { value: [{ name: 'b.json' }], configurable: true }); } catch (e) {}
      el.click = function () {};
    }
    return el;
  };
  click(q('#xtpM5Restore'));
  w.document.createElement = origCreate;
  assert(!!restoreInput, '9) 恢复创建了文件选择框');
  restoreInput.dispatchEvent(new w.Event('change', { bubbles: false }));
  await sleep(30);
  assert(!!$id('xtpMask'), '9) 导入前弹二次确认');
  click($id('xtpConfirmOk'));
  await sleep(30);
  const after9 = sessionsInLS();
  assert(after9.length === 3, '9) 导入后还原 3 条 (got=' + after9.length + ')');
  const ids = after9.map(function (s) { return s.id; }).sort().join(',');
  const want = ['chat_a', 'chat_e', 'chat_f'].sort().join(',');
  assert(ids === want, '9) 逐条 id 一致 期望[' + want + '] 实得[' + ids + ']');
  const ca = after9.filter(function (s) { return s.id === 'chat_a'; })[0];
  assert(ca && ca.title === '函数极限问题' && ca.messages.length === 2 && ca.messages[0].content === '什么是函数极限',
    '9) chat_a 关键字段还原 (title/messages/content)');
  // 标签也随备份还原（chat_a 有「数学」）
  assert(w.localStorage.getItem('xt_ai_chat_meta_v1') && w.localStorage.getItem('xt_ai_chat_meta_v1').indexOf('数学') >= 0,
    '9) 标签随备份一并还原');

  w.FileReader = OrigFR;

  log('');
  const fails = OUT.filter(function (l) { return l.indexOf('FAIL') === 0; });
  console.log(OUT.join('\n'));
  console.log(fails.length ? ('\nFAILED ' + fails.length) : '\nALL PASS (' + OUT.filter(function (l) { return l.indexOf('ok') === 0; }).length + ' assertions)');
  process.exit(fails.length ? 1 : 0);
})().catch(function (e) {
  console.log(OUT.join('\n'));
  console.log('\nRUNTIME ERROR: ' + e.message + '\n' + (e.stack || ''));
  process.exit(2);
});
