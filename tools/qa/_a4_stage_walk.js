// A4 六阶段走通实测：在 jsdom 里按文档路径逐阶段驱动，断言每阶段可进入且无异常
// 用法: QA_PORT=8911 node tools/qa/_a4_stage_walk.js
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const TARGET = 'AI模拟面试.html';
const OUT = 'D:\\下载的文件\\学习工作台\\tools\\qa\\_a4_stage_walk_out.txt';
const out = [];
const errs = [];
const steps = [];

function log(s) { out.push(s); }
function assert(name, cond, extra) {
  steps.push((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  :: ' + extra : ''));
  if (!cond) errs.push(name + ' :: ' + (extra || ''));
}

const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push('JSDOM_ERR: ' + ((e && e.message) || e)));
vc.on('error', (...a) => errs.push('ERR: ' + a.map(String).join(' ').slice(0, 400)));

(async () => {
  const src = await QA.resolve();
  log(QA.sourceBanner(src));
  const got = await QA.fetchPage(src.origin, TARGET);
  if (!got.ok) {
    log('FETCH_FAIL HTTP ' + got.status + ' ' + (got.reason || ''));
    fs.writeFileSync(OUT, out.join('\n'), 'utf8');
    console.log('DONE');
    await QA.shutdown(src.server);
    process.exit(0);
  }
  const dom = new JSDOM(got.html, {
    url: got.url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    virtualConsole: vc, beforeParse: QA.baseBeforeParse(src.origin)
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 6000));

  const snap = () => { try { return w.IV_SNAPSHOT(); } catch (e) { return { err: String(e) }; } };
  const $ = (id) => w.document.getElementById(id);
  const qs = (s) => w.document.querySelector(s);
  const qsa = (s) => w.document.querySelectorAll(s);
  const hidden = (el) => !el || el.classList.contains('hidden');

  // 捕获阶段跳转异常
  let jumpErr = null;
  const origGoto = w.ivGotoStage;

  log('== 0. 初始化 ==');
  log('  typeof ivGotoStage = ' + typeof w.ivGotoStage);
  log('  typeof IV_SNAPSHOT = ' + typeof w.IV_SNAPSHOT);
  log('  typeof xtToast    = ' + typeof w.xtToast);
  log('  typeof lucideIcon = ' + typeof w.lucideIcon);
  log('  typeof lucideAutoRender = ' + typeof w.lucideAutoRender);
  let s0 = snap();
  log('  初始快照 = ' + JSON.stringify(s0));
  assert('S0 初始处于 setup', s0.stage === 'setup', JSON.stringify(s0));
  assert('S0 setupPanel 可见', !hidden($('setupPanel')));
  assert('S0 chatContainer 隐藏', hidden($('chatContainer')));
  assert('S0 evalPanel 隐藏', hidden($('evalPanel')));
  assert('S0 状态条 5 段', qsa('#stageBar .stage-seg').length === 5, 'len=' + qsa('#stageBar .stage-seg').length);
  assert('S0 阶段提示条已渲染', ($('stageTip').textContent || '').indexOf('第 1 / 6 阶段') >= 0, ($('stageTip').textContent || '').slice(0, 80));

  log('');
  log('== 1. setup -> reading（点击「开始面试」） ==');
  try { w.startInterview(); } catch (e) { jumpErr = 'startInterview: ' + e.message; }
  await new Promise(r => setTimeout(r, 900));
  let s1 = snap();
  log('  快照 = ' + JSON.stringify(s1));
  assert('S1 进入 reading', s1.stage === 'reading', jumpErr || JSON.stringify(s1));
  assert('S1 读题干已入会话', !!qs('#qMsg0'));
  assert('S1 读题输入区可见', hidden($('textComposer')) && !hidden($('readComposer')));
  assert('S1 状态条 seg0 active', qsa('#stageBar .stage-seg')[0].classList.contains('active'));
  assert('S1 顶部进度显示', !hidden($('topProgress')));

  log('');
  log('== 2. reading -> preparing（当前为答题唯一主按钮「开始准备」） ==');
  // 主动取消自动推进，用主按钮走
  try { w.finishReading(); } catch (e) { jumpErr = 'finishReading: ' + e.message; }
  await new Promise(r => setTimeout(r, 300));
  let s2 = snap();
  log('  快照 = ' + JSON.stringify(s2));
  assert('S2 进入 preparing', s2.stage === 'preparing', jumpErr || JSON.stringify(s2));
  assert('S2 准备输入区可见', !hidden($('prepComposer')) && hidden($('readComposer')));
  assert('S2 timerLabel = 准备剩余', ($('timerLabel').textContent || '').indexOf('准备剩余') >= 0, $('timerLabel').textContent);
  assert('S2 状态条 seg1 active', qsa('#stageBar .stage-seg')[1].classList.contains('active'));

  log('');
  log('== 3. R1 回退 preparing -> reading（点状态条「读题」） ==');
  try { w.IV_GOTO('reading'); } catch (e) { jumpErr = 'IV_GOTO(reading): ' + e.message; }
  await new Promise(r => setTimeout(r, 300));
  let s3 = snap();
  log('  快照 = ' + JSON.stringify(s3));
  assert('R1 回退到 reading', s3.stage === 'reading', jumpErr || JSON.stringify(s3));
  assert('R1 读题输入区可见', !hidden($('readComposer')));
  // 再回 preparing
  try { w.finishReading(); } catch (e) { jumpErr = e.message; }
  await new Promise(r => setTimeout(r, 200));

  log('');
  log('== 4. preparing -> answering（主按钮「开始回答」） ==');
  try { w.beginAnswering(); } catch (e) { jumpErr = 'beginAnswering: ' + e.message; }
  await new Promise(r => setTimeout(r, 300));
  let s4 = snap();
  log('  快照 = ' + JSON.stringify(s4));
  assert('S4 进入 answering', s4.stage === 'answering', jumpErr || JSON.stringify(s4));
  assert('S4 文字输入区可见', !hidden($('textComposer')));
  assert('S4 次级回退区可见', !hidden($('answerAux')));
  assert('S4 timerMode=answer 标签正确', ($('timerLabel').textContent || '').indexOf('回答剩余') >= 0, $('timerLabel').textContent);

  log('');
  log('== 5. R2 回退 answering -> preparing（点「再想想」） ==');
  try { w.backToPreparing(); } catch (e) { jumpErr = 'backToPreparing: ' + e.message; }
  await new Promise(r => setTimeout(r, 300));
  let s5 = snap();
  log('  快照 = ' + JSON.stringify(s5));
  assert('R2 回退到 preparing', s5.stage === 'preparing', jumpErr || JSON.stringify(s5));
  try { w.beginAnswering(); } catch (e) { jumpErr = e.message; }
  await new Promise(r => setTimeout(r, 200));

  log('');
  log('== 6. answering -> submitting（「结束回答」） ==');
  const ansText = '第一，我叫张明，是华东师范大学人力资源管理专业应届毕业生。第二，我在一家互联网公司实习六个月，参与执行两场五十人规模的校招，负责宣传组织。第三，我的优势是执行力强、闭环意识好，曾经主导过两次校园招聘会的宣传物料准备。第四，我了解到这个岗位需要对接业务部门和候选人，和我的实习经历比较匹配。';
  $('inputBox').value = ansText;
  try { w.sendMessage(); } catch (e) { jumpErr = 'sendMessage: ' + e.message; }
  await new Promise(r => setTimeout(r, 200));
  let s6 = snap();
  log('  快照 = ' + JSON.stringify(s6));
  assert('S6 进入 submitting', s6.stage === 'submitting', jumpErr || JSON.stringify(s6));
  assert('S6 用户消息已入会话', !!qs('.message.user'));
  assert('S6 打字指示器出现', !!qs('#typingIndicator'));
  assert('S6 状态条 seg3 active', qsa('#stageBar .stage-seg')[3].classList.contains('active'));

  log('');
  log('== 7. submitting -> reviewing（系统 1.3s 自动点评） ==');
  await new Promise(r => setTimeout(r, 2200));
  let s7 = snap();
  log('  快照 = ' + JSON.stringify(s7));
  assert('S7 自动进入 reviewing', s7.stage === 'reviewing', JSON.stringify(s7));
  assert('S7 点评卡已渲染', !!qs('.feedback-card'));
  assert('S7 三维评分条 3 条', qsa('.feedback-card .fb-bar-row').length === 3, 'n=' + qsa('.feedback-card .fb-bar-row').length);
  assert('S7 打字指示器已移除', !qs('#typingIndicator'));
  assert('S7 结果计数=1', s7.reviewed === 1, JSON.stringify(s7));
  assert('S7 composer 收起(idle)', $('composer').classList.contains('idle'));

  log('');
  log('== 8. R3 回退 reviewing -> answering（点评卡「重答本题」） ==');
  try { w.reanswerCurrent(); } catch (e) { jumpErr = 'reanswerCurrent: ' + e.message; }
  await new Promise(r => setTimeout(r, 300));
  let s8 = snap();
  log('  快照 = ' + JSON.stringify(s8));
  assert('R3 回退到 answering', s8.stage === 'answering', jumpErr || JSON.stringify(s8));
  assert('R3 点评卡已出栈', !qs('.feedback-card'));
  assert('R3 用户消息已出栈', !qs('.message.user'));
  assert('R3 结果栈已退', s8.reviewed === 0, JSON.stringify(s8));

  log('');
  log('== 9. 走完第 1 题，并连点剩余 4 题（reviewing -> reading 循环） ==');
  $('inputBox').value = ansText;
  try { w.sendMessage(); } catch (e) { jumpErr = e.message; }
  await new Promise(r => setTimeout(r, 2200));
  let s9 = snap();
  assert('S9 回到 reviewing', s9.stage === 'reviewing', jumpErr || JSON.stringify(s9));
  let guard = 0;
  while (snap().stage === 'reviewing' && guard < 12) {
    guard++;
    try { w.nextFromReview(); } catch (e) { jumpErr = 'nextFromReview: ' + e.message; break; }
    await new Promise(r => setTimeout(r, 800));
    const st = snap();
    log('  loop#' + guard + ' -> ' + JSON.stringify(st));
    if (st.stage === 'reading' || st.stage === 'preparing' || st.stage === 'eval') {
      if (st.stage === 'preparing') {
        try { w.beginAnswering(); } catch (e) { /* ignore */ }
        await new Promise(r => setTimeout(r, 150));
      }
      if (st.stage === 'reading') {
        try { w.finishReading(); } catch (e) { /* ignore */ }
        await new Promise(r => setTimeout(r, 150));
        try { w.beginAnswering(); } catch (e) { /* ignore */ }
        await new Promise(r => setTimeout(r, 150));
      }
      if (snap().stage === 'answering') {
        $('inputBox').value = ansText;
        try { w.sendMessage(); } catch (e) { jumpErr = e.message; }
        await new Promise(r => setTimeout(r, 2200));
      }
    }
    if (snap().stage === 'eval') break;
  }

  log('');
  log('== 10. reviewing(末题) -> eval（终态「查看面试结果」） ==');
  await new Promise(r => setTimeout(r, 2000));
  let s10 = snap();
  log('  快照 = ' + JSON.stringify(s10));
  assert('S10 进入终态 eval', s10.stage === 'eval', JSON.stringify(s10));
  assert('S10 evalPanel 可见', !hidden($('evalPanel')));
  assert('S10 chatContainer 隐藏', hidden($('chatContainer')));
  assert('S10 评定分数已渲染', ($('evalScores').innerHTML || '').length > 50, 'len=' + ($('evalScores').innerHTML || '').length);
  assert('S10 总体评价非空', ($('evalOverall').textContent || '').trim().length > 10, ($('evalOverall').textContent || '').slice(0, 80));
  assert('S10 状态条 5 段全 done', (function () {
    var segs = qsa('#stageBar .stage-seg'), i, n = 0;
    for (i = 0; i < segs.length; i++) if (segs[i].classList.contains('done')) n++;
    return n === 5;
  })(), '');

  log('');
  log('== 11. eval -> setup（「重新面试」） ==');
  try { w.restartInterview(); } catch (e) { jumpErr = 'restartInterview: ' + e.message; }
  await new Promise(r => setTimeout(r, 300));
  let s11 = snap();
  log('  快照 = ' + JSON.stringify(s11));
  assert('S11 回到 setup', s11.stage === 'setup', jumpErr || JSON.stringify(s11));
  assert('S11 setupPanel 可见', !hidden($('setupPanel')));
  assert('S11 evalPanel 隐藏', hidden($('evalPanel')));
  assert('S11 残留点评卡已清理', !qs('.feedback-card'));
  assert('S11 残留用户消息已清理', !qs('.message.user'));

  log('');
  log('== 12. 非法跳转白名单校验（不得抛异常） ==');
  let illegalOk = true, illegalMsg = '';
  try {
    w.IV_GOTO('reviewing');   // setup -> reviewing 不在白名单
    await new Promise(r => setTimeout(r, 200));
  } catch (e) { illegalOk = false; illegalMsg = e.message; }
  assert('非法跳转不抛异常且被拒', illegalOk && snap().stage === 'setup', illegalMsg || JSON.stringify(snap()));
  assert('IV_CAN_GOTO 白名单正确', w.IV_CAN_GOTO('reading') === true && w.IV_CAN_GOTO('reviewing') === false,
    'reading=' + w.IV_CAN_GOTO('reading') + ' reviewing=' + w.IV_CAN_GOTO('reviewing'));

  log('');
  log('================= 断言汇总 =================');
  log(steps.join('\n'));
  log('');
  log('== 运行时错误 ==');
  log(errs.length ? errs.slice(0, 20).join('\n') : '(无)');
  const fails = steps.filter(s => s.indexOf('FAIL') === 0).length;
  log('');
  log('PASS=' + (steps.length - fails) + '  FAIL=' + fails + '  ERR=' + errs.length);

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  await QA.shutdown(src.server);
  process.exit(0);
})();
