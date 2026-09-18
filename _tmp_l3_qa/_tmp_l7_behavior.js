/* L7 行为自检：用 jsdom 真跑六阶段状态机（含三条回退路径） */
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const { JSDOM, VirtualConsole } = require(
  'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom'
);

let html = fs.readFileSync(path.join(ROOT, 'AI模拟面试.html'), 'utf8');
// 只保留内联脚本：剔除外部 <script src>（本页状态机逻辑全在页内内联）
html = html.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, '');

const out = [];
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; out.push('[PASS] ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; out.push('[FAIL] ' + name + (detail ? ' | ' + detail : '')); }
}
function info(name, detail) { out.push('[INFO] ' + name + (detail ? ' | ' + detail : '')); }

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'file:///D:/下载的文件/学习工作台/AI模拟面试.html',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const win = dom.window;
const doc = win.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => doc.getElementById(id);
const stage = () => win.IV_SNAPSHOT().stage;
const snap = () => win.IV_SNAPSHOT();
const segState = () => {
  const segs = doc.querySelectorAll('#stageBar .stage-seg');
  const a = [];
  for (let i = 0; i < segs.length; i++) {
    const c = segs[i].className;
    a.push(c.indexOf('active') >= 0 ? 'A' : (c.indexOf('done') >= 0 ? 'D' : '-'));
  }
  return a.join('');
};
const hidden = (id) => {
  const el = $(id);
  return !el || el.classList.contains('hidden');
};

(async function main() {
  await sleep(250);

  // ---------- A. 初始化 ----------
  ok('A0 IV_SNAPSHOT / IV_GOTO / IV_CAN_GOTO 已导出',
    typeof win.IV_SNAPSHOT === 'function' && typeof win.IV_GOTO === 'function' && typeof win.IV_CAN_GOTO === 'function');
  ok('A1 初始阶段 = setup', stage() === 'setup', stage());
  ok('A2 状态条五段全为「未开始」', segState() === '-----', segState());
  ok('A3 setup 阶段底部输入区收起(idle)', $('composer').classList.contains('idle'));
  ok('A4 提示条显示 第 1 / 6 阶段',
    ($('stageTip').textContent || '').indexOf('第 1 / 6 阶段') >= 0, ($('stageTip').textContent || '').slice(0, 40));
  ok('A5 setup 只能跳到 reading', win.IV_CAN_GOTO('reading') === true && win.IV_CAN_GOTO('preparing') === false);
  ok('A6 头像已注入 owl svg', ($('aiAvatar').innerHTML || '').indexOf('<svg') === 0);

  // ---------- B. setup -> reading（点状态条 / 开始面试） ----------
  win.IV_GOTO('reading');
  await sleep(750);
  ok('B1 开始面试后进入 reading', stage() === 'reading', stage());
  ok('B2 状态条第一段为进行中', segState() === 'A----', segState());
  ok('B3 reading 只显示 readComposer', !hidden('readComposer') && hidden('prepComposer') && hidden('textComposer'));
  ok('B4 提示条显示 第 2 / 6 阶段 · 读题',
    ($('stageTip').textContent || '').indexOf('第 2 / 6 阶段 · 读题') >= 0,
    ($('stageTip').textContent || '').slice(0, 46));
  ok('B5 题目气泡已插入且带 id=qMsg0', !!$('qMsg0'));
  ok('B6 顶部进度 = 第 1 / 5 题', ($('questionInfo').textContent || '').indexOf('第 1 / 5 题') >= 0,
    $('questionInfo').textContent);
  ok('B7 reading 阶段状态条只有「准备」可点',
    win.IV_CAN_GOTO('preparing') === true && win.IV_CAN_GOTO('reading') === false);

  // ---------- C. reading -> preparing（主按钮） ----------
  win.finishReading();
  ok('C1 进入 preparing', stage() === 'preparing', stage());
  ok('C2 状态条 = 读题已完成 / 准备进行中', segState() === 'DA---', segState());
  ok('C3 preparing 只显示 prepComposer', !hidden('prepComposer') && hidden('readComposer'));
  ok('C4 计时器标签 = 准备剩余', ($('timerLabel').textContent || '').indexOf('准备剩余') >= 0, $('timerLabel').textContent);
  ok('C5 可回退到 reading + 前进到 answering',
    win.IV_CAN_GOTO('reading') === true && win.IV_CAN_GOTO('answering') === true && win.IV_CAN_GOTO('submitting') === false);

  // ---------- D. 回退 R1：preparing -> reading ----------
  win.IV_GOTO('reading');
  ok('D1 R1 回退成功 preparing->reading', stage() === 'reading', stage());
  ok('D2 回退后状态条第一段重新进行中', segState() === 'A----', segState());
  ok('D3 回退轻提示已出现(#ivToast.on)', !!$('ivToast') && $('ivToast').classList.contains('on'));

  // 再前进
  win.finishReading();
  ok('D4 再次进入 preparing', stage() === 'preparing', stage());

  // ---------- E. preparing -> answering ----------
  win.beginAnswering();
  ok('E1 进入 answering', stage() === 'answering', stage());
  ok('E2 状态条 = 读题/准备已完成，回答进行中', segState() === 'DDA--', segState());
  ok('E3 answering 显示 textComposer + 回退条', !hidden('textComposer') && !hidden('answerAux'));
  ok('E4 计时器标签 = 回答剩余', ($('timerLabel').textContent || '').indexOf('回答剩余') >= 0, $('timerLabel').textContent);
  ok('E5 可回退 preparing / 前进 submitting',
    win.IV_CAN_GOTO('preparing') === true && win.IV_CAN_GOTO('submitting') === true);

  // ---------- F. 回退 R2：answering -> preparing ----------
  $('inputBox').value = '我的回答内容：第一，第二，最后。曾经有一次实习经历。';
  win.IV_GOTO('preparing');
  ok('F1 R2 回退成功 answering->preparing', stage() === 'preparing', stage());
  ok('F2 回退不丢输入框内容', $('inputBox').value.length > 0, 'len=' + $('inputBox').value.length);
  win.beginAnswering();
  ok('F3 再次进入 answering', stage() === 'answering', stage());

  // ---------- G. answering -> submitting -> reviewing ----------
  win.sendMessage();
  ok('G1 提交后进入 submitting', stage() === 'submitting', stage());
  ok('G2 状态条 = 前四段完成态前缀 DDD', segState().slice(0, 3) === 'DDD', segState());
  ok('G3 提交阶段底部输入区收起', $('composer').classList.contains('idle'));
  ok('G4 用户气泡已插入', doc.querySelectorAll('#chatMessages .message.user').length === 1);
  ok('G5 typing 指示器存在', !!$('typingIndicator'));
  ok('G6 submitting 不可主动跳转', win.IV_CAN_GOTO('reviewing') === false && win.IV_CAN_GOTO('answering') === false);

  await sleep(1500);
  ok('G7 点评返回后进入 reviewing', stage() === 'reviewing', stage());
  ok('G8 状态条 = 前四段 done，点评 active', segState() === 'DDDDA', segState());
  ok('G9 点评卡已插入且含三维评分', doc.querySelectorAll('#chatMessages .feedback-card').length === 1 &&
    doc.querySelectorAll('#chatMessages .feedback-card .fb-bar-fill').length === 3);
  ok('G10 点评卡主按钮文案 = 下一题',
    (doc.querySelector('#chatMessages .feedback-card .fb-next') || {}).textContent === '下一题');
  ok('G11 点评卡含「重答本题」回退按钮',
    (doc.querySelector('#chatMessages .feedback-card .answer-aux') || {}).textContent
      ?.indexOf('重答本题') >= 0);
  ok('G12 评分无 NaN', (doc.querySelector('#chatMessages .feedback-card .fb-bars').innerHTML || '').indexOf('NaN') < 0);
  ok('G13 reviewing 可回退到 answering，不可跳 preparing',
    win.IV_CAN_GOTO('answering') === true && win.IV_CAN_GOTO('preparing') === false);
  ok('G14 已答 1 题 / 已评 1 题', snap().answered === 1 && snap().reviewed === 1,
    JSON.stringify(snap()));

  // ---------- H. 非法跳转被拦 ----------
  win.IV_GOTO('preparing');
  ok('H1 非法跳转被拦截(reviewing->preparing 仍为 reviewing)', stage() === 'reviewing', stage());
  win.IV_GOTO('submitting');
  ok('H2 非法跳转被拦截(reviewing->submitting 仍为 reviewing)', stage() === 'reviewing', stage());

  // ---------- I. 回退 R3：reviewing -> answering（出栈） ----------
  win.reanswerCurrent();
  ok('I1 R3 回退成功 reviewing->answering', stage() === 'answering', stage());
  ok('I2 出栈后 answered=0 / reviewed=0', snap().answered === 0 && snap().reviewed === 0, JSON.stringify(snap()));
  ok('I3 点评卡已移除', doc.querySelectorAll('#chatMessages .feedback-card').length === 0);
  ok('I4 用户气泡已移除', doc.querySelectorAll('#chatMessages .message.user').length === 0);
  ok('I5 输入框已清空', $('inputBox').value === '');

  // ---------- J. 走完剩余题目直到 eval ----------
  let guard = 0;
  while (stage() !== 'eval' && guard < 40) {
    guard++;
    if (stage() === 'reading') { win.finishReading(); }
    else if (stage() === 'preparing') { win.beginAnswering(); }
    else if (stage() === 'answering') {
      $('inputBox').value = '第一，第二，第三，最后。例如我曾经参与过一次项目实习，收获很多。';
      win.sendMessage();
      await sleep(1500);
    } else if (stage() === 'reviewing') {
      win.nextFromReview();
      await sleep(700);
    } else { break; }
  }
  ok('J1 全流程可走通到终态 eval', stage() === 'eval', stage() + ' guard=' + guard);
  ok('J2 状态条五段全 done', segState() === 'DDDDD', segState());
  ok('J3 评定报告面板已显示', !$('evalPanel').classList.contains('hidden'));
  ok('J4 对话区已隐藏', $('chatContainer').classList.contains('hidden'));
  ok('J5 报告三维评分已渲染', ($('evalScores').innerHTML || '').indexOf('fb-bar-fill') >= 0);
  ok('J6 报告无 NaN', ($('evalScores').innerHTML || '').indexOf('NaN') < 0 &&
    ($('evalGood').innerHTML || '').indexOf('NaN') < 0);
  ok('J7 六阶段走完 answered=5', snap().answered === 5, JSON.stringify(snap()));
  ok('J8 提示条显示「评定报告」', ($('stageTip').textContent || '').indexOf('评定报告') >= 0,
    ($('stageTip').textContent || '').slice(0, 40));

  // ---------- K. 重新面试回到 setup ----------
  win.restartInterview();
  ok('K1 重新面试回到 setup', stage() === 'setup', stage());
  ok('K2 状态条清空为未开始', segState() === '-----', segState());
  ok('K3 setup 面板显示 / 报告隐藏',
    !$('setupPanel').classList.contains('hidden') && $('evalPanel').classList.contains('hidden'));
  ok('K4 计数已重置', snap().answered === 0 && snap().reviewed === 0 && snap().question === 1, JSON.stringify(snap()));
  ok('K5 顶部进度区已隐藏', $('topProgress').classList.contains('hidden'));

  // ---------- L. ?q= 交接载荷（第二实例） ----------
  const dom2 = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'file:///D:/下载的文件/学习工作台/AI模拟面试.html?q=' + encodeURIComponent('请谈谈你怎么看待加班？'),
    pretendToBeVisual: true, virtualConsole: vc
  });
  const w2 = dom2.window, d2 = dom2.window.document;
  await sleep(200);
  ok('L1 ?q= 生效：总题数 6', w2.IV_SNAPSHOT().total === 6, JSON.stringify(w2.IV_SNAPSHOT()));
  ok('L2 ?q= 生效：fromPrep=true', w2.IV_SNAPSHOT().fromPrep === true);
  ok('L3 setup 描述已追加来源提示',
    (d2.querySelector('#setupPanel .setup-desc').textContent || '').indexOf('来自「面试准备」') >= 0);
  w2.startInterview();
  await sleep(750);
  ok('L4 自选题目成为第 1 题',
    (d2.getElementById('qMsg0').textContent || '').indexOf('加班') >= 0,
    (d2.getElementById('qMsg0').textContent || '').slice(0, 30));
  ok('L5 顶部进度 = 第 1 / 6 题',
    (d2.getElementById('questionInfo').textContent || '').indexOf('第 1 / 6 题') >= 0,
    d2.getElementById('questionInfo').textContent);
  w2.finishReading();
  w2.beginAnswering();
  d2.getElementById('inputBox').value = '第一，我会先看工作安排是否紧急。例如曾经有一次项目上线。最后我会主动沟通。';
  w2.sendMessage();
  await sleep(1500);
  ok('L6 自选题（无内置关键词）也能出点评且无 NaN',
    (d2.querySelector('#chatMessages .feedback-card .fb-bars').innerHTML || '').indexOf('NaN') < 0);
  ok('L7 自选题点评阶段 = reviewing', w2.IV_SNAPSHOT().stage === 'reviewing', w2.IV_SNAPSHOT().stage);

  out.push('----');
  out.push((fail === 0 ? 'RESULT: IS_PASS YES' : 'RESULT: IS_PASS NO') + ' (' + pass + ' pass, ' + fail + ' fail)');
  fs.writeFileSync(path.join(ROOT, '_tmp_l7_behavior.txt'), out.join('\n'), 'utf8');
  console.log('DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  out.push('[FATAL] ' + (e && e.stack ? e.stack : String(e)));
  fs.writeFileSync(path.join(ROOT, '_tmp_l7_behavior.txt'), out.join('\n'), 'utf8');
  console.log('FATAL');
  process.exit(2);
});
