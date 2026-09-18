/* eslint-disable */
/**
 * R90 QA 块1 独立验证：P1 闭环 —— 时间筛选清零 → 空态诚实化 + 重置筛选
 *
 * 独立性声明：本脚本由 R90 QA 独立编写，未复用 tools/qa/r89*，也未复用工程师的
 *             r89_leadcheck_* / r90_probe_* 任何脚本。
 *
 * 方法：jsdom 载入真实 assets/xt-profile.js（unmodified），经 window.xtpOpenView('chat')
 *       打开「AI对话记录」子视图（其内部异步链会二次 paintChat），
 *       真实派发 input / change / click 事件驱动 M5 逻辑。
 *
 * 运行： cd "D:/下载的文件/学习工作台" && NODE_PATH=C:/Users/ATM/node_modules \
 *          node tools/qa/r90_qa_block1.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const OUT = [];
const R = [];
function log(s) { OUT.push(s == null ? '' : String(s)); }
function sec(t) { log(''); log('== ' + t + ' =='); }
function assert(name, cond, detail) {
  R.push({ name: name, pass: !!cond, detail: detail == null ? '' : String(detail) });
  log((cond ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' || ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profileJs = fs.readFileSync(path.join(ROOT, 'assets', 'xt-profile.js'), 'utf8');

const DAY = 86400000;
const OLD = new Date(2025, 8, 10, 10, 0, 0).getTime();   // 2025-09-10 ≈ 一年前
const TODAY = Date.now() - 3600000;                       // 1 小时前

function mkSessions(tsList) {
  return tsList.map(function (t, i) {
    return {
      id: 'sess-' + (i + 1),
      title: '对话 ' + (i + 1),
      createdAt: t, updatedAt: t,
      messages: [{ role: 'user', content: 'q' + (i + 1) }, { role: 'assistant', content: 'a' + (i + 1) }]
    };
  });
}

let ENV = null;
/** 建环境并打开 chat 子视图（含异步 drain） */
async function reset(sessions, meta) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'http://localhost/%E4%B8%AA%E4%BA%BA%E8%B5%84%E6%96%99.html',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.localStorage.setItem('ai_chat_history', JSON.stringify(sessions));
  w.localStorage.setItem('xt_ai_chat_meta_v1', JSON.stringify(meta || {}));
  w.eval(profileJs);
  w.xtpOpenView('chat');
  await sleep(30);          // 让 fetchAiChat 的 .then / 防抖计时器落地
  ENV = { dom: dom, w: w, d: w.document };
  return ENV;
}

function body() { return ENV.d.getElementById('xtpChatBody'); }
function cardCount() {
  var list = body().querySelector('.xtp-list');
  return list ? list.children.length : 0;
}
function emptyText() { var e = body().querySelector('.xtp-empty'); return e ? e.textContent : null; }
function rangeVal() { var e = body().querySelector('#xtpM5Range'); return e ? e.value : null; }
function tagVal() { var e = body().querySelector('#xtpM5Tag'); return e ? e.value : null; }
function kwVal() { var e = body().querySelector('#xtpM5Kw'); return e ? e.value : null; }
function hasReset() { return !!body().querySelector('#xtpM5ResetFilter'); }
function setRange(v) {
  var s = body().querySelector('#xtpM5Range');
  if (!s) { return false; }
  s.value = v; s.dispatchEvent(new ENV.w.Event('change', { bubbles: true }));
  return true;
}
function click(sel) {
  var el = body().querySelector(sel);
  if (!el) { return false; }
  el.dispatchEvent(new ENV.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}
function typeKw(v) {
  var el = body().querySelector('#xtpM5Kw');
  if (!el) { return false; }
  el.value = v;
  el.dispatchEvent(new ENV.w.Event('input', { bubbles: true }));
  return true;
}
function setTag(v) {
  var el = body().querySelector('#xtpM5Tag');
  if (!el) { return false; }
  el.value = v; el.dispatchEvent(new ENV.w.Event('change', { bubbles: true }));
  return true;
}
function idsIn() {
  var out = [], all = body().querySelectorAll('[id]');
  for (var i = 0; i < all.length; i++) { out.push(all[i].id); }
  return out;
}

/* ===================================================================== */
async function main() {

  sec('S0 环境自检：M5 面板可被驱动');
  await reset(mkSessions([OLD, OLD + 2 * DAY, OLD + 5 * DAY]), {});
  log('#xtpChatBody 存在: ' + !!body());
  log('M5 工具条 .xtp-m5-tools: ' + !!body().querySelector('.xtp-m5-tools'));
  log('列表 .xtp-list: ' + !!body().querySelector('.xtp-list'));
  log('body 内 ID: ' + JSON.stringify(idsIn()));
  assert('S0-1 M5 工具条渲染成功', !!body().querySelector('.xtp-m5-tools'));
  assert('S0-2 #xtpM5Range 在位', !!body().querySelector('#xtpM5Range'));
  assert('S0-3 #xtpM5Kw 在位', !!body().querySelector('#xtpM5Kw'));
  assert('S0-4 #xtpM5Tag 在位', !!body().querySelector('#xtpM5Tag'));
  assert('S0-5 #xtpM5Fav 在位', !!body().querySelector('#xtpM5Fav'));

  /* ---------------------------------------------------------------- */
  sec('S1 3 条旧时间戳(2025-09)会话 → 应渲染 3 张卡');
  await reset(mkSessions([OLD, OLD + 2 * DAY, OLD + 5 * DAY]), {});
  log('卡片数=' + cardCount() + '  range=' + rangeVal() + '  空态=' + JSON.stringify(emptyText()));
  assert('S1-1 range 默认 all 且卡片数 = 3', cardCount() === 3 && rangeVal() === 'all',
    'cards=' + cardCount() + ' range=' + rangeVal());
  assert('S1-2 无空态元素', body().querySelector('.xtp-empty') === null);
  assert('S1-3 无重置按钮', !hasReset());

  /* ---------------------------------------------------------------- */
  sec('S2 切 #xtpM5Range → d7：卡片清零 + 空态含「当前筛选 / 近 7 天 / 本机共 3 条」');
  var okSet = setRange('d7');
  assert('S2-0 成功派发 change 到 #xtpM5Range', okSet);
  var n2 = cardCount(), et2 = emptyText();
  log('卡片数=' + n2);
  log('空态文案=' + JSON.stringify(et2));
  log('select.value=' + rangeVal());
  assert('S2-1 卡片清零（复现 P1 现象）', n2 === 0, '实测=' + n2);
  assert('S2-2 空态出现', !!et2);
  assert('S2-3 空态含「当前筛选」', !!et2 && et2.indexOf('当前筛选') >= 0);
  assert('S2-4 空态含「近 7 天」', !!et2 && et2.indexOf('近 7 天') >= 0);
  assert('S2-5 空态含本机总数（本机共 3 条）', !!et2 && /本机共\s*3\s*条/.test(et2), JSON.stringify(et2));
  assert('S2-6 空态不含误导性「服务端还有」文案', !!et2 && et2.indexOf('服务端还有') < 0);

  /* ---------------------------------------------------------------- */
  sec('S3 ★关键：M5.range 未被静默回退为 all（验证工程师「无自动回退」声明）');
  log('range 元素 value = ' + rangeVal());
  // 反证逻辑：若代码里存在静默回退（range 被改成 all），卡片必然恢复为 3。
  var before = cardCount();
  setRange('d7');
  var after = cardCount();
  assert('S3-1 range 元素值仍为 d7', rangeVal() === 'd7', '实测=' + rangeVal());
  assert('S3-2 重复置 d7 后卡片仍为 0（未被回退到 all）', after === 0, 'before=' + before + ' after=' + after);
  assert('S3-3 反证：若被静默改成 all 卡片会回到 3，实测 0 → 未回退', after !== 3, '实测=' + after);
  // 源码级双证：确认无 M5.range = 'all' 的自动回退分支
  var autoRevert = /M5\.range\s*=\s*'all'/.test(profileJs);
  var revertCtx = [];
  profileJs.split('\n').forEach(function (l, i) {
    if (/M5\.range\s*=\s*'all'/.test(l)) { revertCtx.push((i + 1) + ': ' + l.trim().slice(0, 120)); }
  });
  log('源码中 M5.range = \'all\' 出现位置:');
  revertCtx.forEach(function (x) { log('  ' + x); });
  log('【判定】上述出现点若都在「初始化 / 重置按钮处理器 / change 处理器」中，则无自动回退。');

  /* ---------------------------------------------------------------- */
  sec('S4 空态重置按钮存在且文案含「重置筛选」');
  var btn = body().querySelector('#xtpM5ResetFilter');
  log('按钮存在=' + !!btn + '  文案=' + JSON.stringify(btn ? btn.textContent : null));
  assert('S4-1 #xtpM5ResetFilter 存在', !!btn);
  assert('S4-2 按钮文案含「重置筛选」', !!btn && btn.textContent.indexOf('重置筛选') >= 0);
  assert('S4-3 容器 .xtp-m5-emptyact 存在', !!body().querySelector('.xtp-m5-emptyact'));

  /* ---------------------------------------------------------------- */
  sec('S5 点击重置按钮 → 3 卡恢复 + range=all + kw/tag/favOnly 全重置');
  await reset(mkSessions([OLD, OLD + 2 * DAY, OLD + 5 * DAY]),
    { 'sess-1': { tags: ['甲'], fav: true }, 'sess-2': { tags: ['乙'], fav: false }, 'sess-3': { tags: ['甲'], fav: true } });
  log('tag 下拉有「乙」: ' + !!body().querySelector('#xtpM5Tag option[value="乙"]'));
  log('tag 下拉有「甲」: ' + !!body().querySelector('#xtpM5Tag option[value="甲"]'));
  setTag('乙');
  log('  设 tag=乙 后: 卡片=' + cardCount() + '  rangeEl=' + !!body().querySelector('#xtpM5Range'));
  click('#xtpM5Fav');
  log('  点收藏后: 卡片=' + cardCount() + '  favOn=' + !!body().querySelector('#xtpM5Fav.on'));
  setRange('d7');
  log('复合筛选后: 卡片=' + cardCount() + ' range=' + rangeVal() + ' tag=' + JSON.stringify(tagVal()) +
    ' favOn=' + !!body().querySelector('#xtpM5Fav.on'));
  assert('S5-0 复合筛选(tag+fav+d7)下出现重置按钮', hasReset());
  var okClick = click('#xtpM5ResetFilter');
  assert('S5-1 成功点击重置按钮', okClick);
  var n5 = cardCount(), r5 = rangeVal(), t5 = tagVal(), f5 = !!body().querySelector('#xtpM5Fav.on'), k5 = kwVal();
  log('重置后: 卡片=' + n5 + ' range=' + r5 + ' tag=' + JSON.stringify(t5) + ' favOn=' + f5 + ' kw=' + JSON.stringify(k5));
  assert('S5-2 3 张卡恢复', n5 === 3, '实测=' + n5);
  assert('S5-3 range 回 all', r5 === 'all', String(r5));
  assert('S5-4 tag 清空', t5 === '', JSON.stringify(t5));
  assert('S5-5 favOnly 关闭', f5 === false);
  assert('S5-6 关键词清空', k5 === '', JSON.stringify(k5));
  assert('S5-7 空态与重置按钮均消失', !body().querySelector('.xtp-empty') && !hasReset());

  /* ---------------------------------------------------------------- */
  sec('S6 边界①：本机 0 条 + 有筛选 → 不应出现重置按钮');
  await reset([], {});
  setRange('d7');
  var n6 = cardCount(), et6 = emptyText();
  log('卡片=' + n6 + ' 空态=' + JSON.stringify(et6) + ' 重置按钮=' + hasReset());
  assert('S6-1 卡片 0 张', n6 === 0);
  assert('S6-2 空态文案为「本机暂无会话记录…」', !!et6 && et6.indexOf('本机暂无会话记录') >= 0, JSON.stringify(et6));
  assert('S6-3 无重置按钮（无意义）', !hasReset());

  /* ---------------------------------------------------------------- */
  sec('S7 边界②：本机 >0、筛选后仍 >0 → 不应出现空态/重置按钮');
  await reset(mkSessions([TODAY, TODAY - 2 * DAY]), {});
  setRange('d7');
  log('卡片=' + cardCount() + ' 空态=' + !!body().querySelector('.xtp-empty') + ' 重置按钮=' + hasReset());
  assert('S7-1 d7 下 2 张新卡仍显示', cardCount() === 2, '实测=' + cardCount());
  assert('S7-2 无空态', !body().querySelector('.xtp-empty'));
  assert('S7-3 无重置按钮', !hasReset());

  /* ---------------------------------------------------------------- */
  sec('S8 边界③：新时间戳(今天) + range=d7 → 正常显示、无空态、无重置按钮');
  await reset(mkSessions([TODAY]), {});
  setRange('d7');
  log('卡片=' + cardCount() + ' range=' + rangeVal());
  assert('S8-1 1 张卡正常显示', cardCount() === 1, '实测=' + cardCount());
  assert('S8-2 无空态 / 无重置按钮', !body().querySelector('.xtp-empty') && !hasReset());
  setRange('today');
  log('切 today 后 卡片=' + cardCount());
  assert('S8-3 today 下 1 张卡正常', cardCount() === 1, '实测=' + cardCount());

  /* ---------------------------------------------------------------- */
  sec('S9 ★闭包陷阱回归：搜索框 / 时间筛选 / 重置按钮 三者互不串扰');
  await reset(mkSessions([TODAY, TODAY - 2 * DAY, TODAY - 100 * DAY]),
    { 'sess-1': { tags: [], fav: false }, 'sess-2': { tags: [], fav: false }, 'sess-3': { tags: ['甲'], fav: false } });
  log('S9-0 元素在位: range=%s kw=%s tag=%s fav=%s 卡片=%d',
    !!body().querySelector('#xtpM5Range'), !!body().querySelector('#xtpM5Kw'),
    !!body().querySelector('#xtpM5Tag'), !!body().querySelector('#xtpM5Fav'), cardCount());

  // 方向 A：先搜索，再筛选
  typeKw('对话 3');
  await sleep(300);                              // 防抖 200ms
  log('A-1 搜索「对话 3」后 卡片=' + cardCount() + ' kw=' + JSON.stringify(kwVal()));
  assert('S9-1 搜索生效：1 张卡', cardCount() === 1, '实测=' + cardCount());

  setRange('d7');
  log('A-2 再切 d7 后 卡片=' + cardCount() + ' range=' + rangeVal());
  assert('S9-2 搜索后仍能切筛选（range 元素=d7）', rangeVal() === 'd7', String(rangeVal()));
  assert('S9-3 双重过滤：0 张（对话3 在 100 天前）', cardCount() === 0, '实测=' + cardCount());
  assert('S9-4 重绘后搜索框保留关键词', kwVal() === '对话 3', JSON.stringify(kwVal()));
  assert('S9-5 出现重置按钮', hasReset());

  click('#xtpM5ResetFilter');
  log('A-3 重置后 卡片=' + cardCount() + ' kw=' + JSON.stringify(kwVal()) + ' range=' + rangeVal());
  assert('S9-6 重置后 3 张卡全回', cardCount() === 3, '实测=' + cardCount());
  assert('S9-7 重置后搜索框清空', kwVal() === '', JSON.stringify(kwVal()));

  // 方向 B：先筛选，再搜索（反向串扰）
  // 数据：对话1=今天、对话2=2天前、对话3=100天前
  // 先 d7 → {对话1, 对话2} 两张；再搜「对话 2」→ 1 张（证明筛选未被搜索破坏）
  setRange('d7');
  log('B-0 d7 单独生效卡片=' + cardCount());
  typeKw('对话 2');
  await sleep(300);
  log('B-1 先 d7 再搜索「对话 2」→ 卡片=' + cardCount() + ' range=' + rangeVal());
  assert('S9-8 先筛选后搜索：1 张（对话2 在 d7 内）', cardCount() === 1, '实测=' + cardCount());
  assert('S9-9 先筛选后搜索：range 未被搜索破坏', rangeVal() === 'd7', String(rangeVal()));
  // B-2：搜一个 d7 之外的词 → 0 张，证明两个条件都在起作用
  typeKw('对话 3');
  await sleep(300);
  log('B-2 d7 + 搜索「对话 3」（100天前）→ 卡片=' + cardCount() + ' range=' + rangeVal());
  assert('S9-10 时间与关键词同时生效 → 0 张', cardCount() === 0, '实测=' + cardCount());
  assert('S9-11 range 仍为 d7', rangeVal() === 'd7', String(rangeVal()));

  click('#xtpM5ResetFilter');
  log('B-3 再次重置 → 卡片=' + cardCount());
  assert('S9-12 再次重置恢复 3 张卡（处理器未失效）', cardCount() === 3, '实测=' + cardCount());

  // 方向 C：tag 筛选 与 时间筛选 交叉后重置（需要 meta 里有标签）
  // 数据：对话1=今天 对话2=2天前 对话3=100天前；标签 甲={对话2,对话3}（均不在 d7 的「今天」之外？
  // → 对话2 在 d7 内。故改用 甲={对话3}（只在 100 天前），使 甲+d7 = 0 张，才能触发空态重置按钮。
  log('C-0 tag 下拉选项: ' + (function () {
    var o = body().querySelectorAll('#xtpM5Tag option'), a = [];
    for (var i = 0; i < o.length; i++) { a.push(o[i].value); }
    return JSON.stringify(a);
  })());
  var tagOk = setTag('甲');
  log('C-1 setTag(甲) 成功=' + tagOk + ' 生效值=' + JSON.stringify(tagVal()) + ' 卡片=' + cardCount());
  assert('S9-13 tag 下拉可被赋值且生效', tagOk && tagVal() === '甲', JSON.stringify(tagVal()));
  assert('S9-13b 单 tag 筛选生效（甲 只有 1 条）', cardCount() === 1, '实测=' + cardCount());
  setRange('d7');
  log('C-2 tag=甲 + d7 → 卡片=' + cardCount() + ' 重置按钮=' + hasReset());
  assert('S9-14 tag+d7 复合为空 → 出现重置按钮', hasReset(), '卡片=' + cardCount());
  click('#xtpM5ResetFilter');
  log('C-3 重置后 卡片=' + cardCount() + ' tag=' + JSON.stringify(tagVal()));
  assert('S9-15 重置后 tag 清空、卡片恢复 3', cardCount() === 3 && tagVal() === '', 'cards=' + cardCount() + ' tag=' + JSON.stringify(tagVal()));

  // 方向 D：favOnly 与 时间筛选
  click('#xtpM5Fav');
  setRange('d7');
  log('D-1 favOnly + d7 → 卡片=' + cardCount() + ' favOn=' + !!body().querySelector('#xtpM5Fav.on'));
  assert('S9-14 favOnly 与 range 可叠加', !!body().querySelector('#xtpM5Fav.on') && rangeVal() === 'd7');
  click('#xtpM5ResetFilter');
  log('D-2 重置后 卡片=' + cardCount() + ' favOn=' + !!body().querySelector('#xtpM5Fav.on'));
  assert('S9-15 重置后 favOnly 关闭、卡片恢复', cardCount() === 3 && !body().querySelector('#xtpM5Fav.on'));

  /* ---------------------------------------------------------------- */
  sec('S10 真因A 回归：清空确认框 / toast 文案点明「服务端记录不受影响 / 仍保留」');
  var mConfirm = profileJs.match(/confirmBox\('清空全部对话记录',[\s\S]{0,600}?\);/);
  log('confirmBox 调用片段:');
  log(mConfirm ? mConfirm[0] : '(未匹配到)');
  assert('S10-1 confirm 文案含「本机全部 N 条会话」', !!mConfirm && /本机全部/.test(mConfirm[0]));
  assert('S10-2 confirm 文案含「服务端记录不受影响」', !!mConfirm && /服务端记录不受影响/.test(mConfirm[0]));
  var mToast = profileJs.match(/toast\('已清空本机会话[^']*'\)/);
  log('toast 片段: ' + (mToast ? mToast[0] : '(未匹配到)'));
  assert('S10-3 toast 文案含「服务端记录仍保留」', !!mToast && /服务端记录仍保留/.test(mToast[0]));
  // 运行时可达性
  log('运行时可达性: typeof window.toast=' + typeof ENV.w.toast + ' typeof window.confirmBox=' + typeof ENV.w.confirmBox);
  log('运行时可达性: typeof window.xtpOpenView=' + typeof ENV.w.xtpOpenView);
  log('【标注】S10-1..3 为**源码级验证**；confirmBox/toast 是 IIFE 内闭包函数，未挂 window，');
  log('        jsdom 下无法调用捕获其运行时字符串，故不声称运行时验证。');

  /* ---------------------------------------------------------------- */
  sec('S11 结构不变量：重置按钮仅在「列表空 && 本机>0 && 有筛选」三条同时成立时出现');
  // 逐条破条件
  await reset(mkSessions([TODAY]), {});                 // 本机 >0，无筛选
  log('无筛选: 卡片=' + cardCount() + ' 重置=' + hasReset());
  assert('S11-1 无筛选 → 无重置按钮', !hasReset());
  await reset([], {});                                   // 本机 0
  log('本机 0: 卡片=' + cardCount() + ' 重置=' + hasReset());
  assert('S11-2 本机 0 → 无重置按钮', !hasReset());
  await reset(mkSessions([TODAY, TODAY - 2 * DAY]), {}); // 有筛选但仍有结果
  typeKw('对话 1'); await sleep(300);
  log('有筛选且仍 >0: 卡片=' + cardCount() + ' 重置=' + hasReset());
  assert('S11-3 有筛选但列表非空 → 无重置按钮', !hasReset());

  finish();
}

function finish() {
  sec('汇总');
  var pass = R.filter(function (x) { return x.pass; }).length;
  log('通过 ' + pass + ' / ' + R.length);
  R.filter(function (x) { return !x.pass; }).forEach(function (x) {
    log('  FAIL: ' + x.name + ' || ' + x.detail);
  });
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block1.out.txt'), OUT.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r90_qa_block1.json'),
    JSON.stringify({ total: R.length, pass: pass, results: R }, null, 2));
  console.log('DONE pass=' + pass + '/' + R.length);
  R.filter(function (x) { return !x.pass; }).forEach(function (x) {
    console.log('FAIL: ' + x.name + ' || ' + x.detail);
  });
}

main().catch(function (e) {
  log('!! 脚本异常: ' + (e && e.stack ? e.stack : e));
  console.log('EXC: ' + (e && e.message));
  finish();
});
