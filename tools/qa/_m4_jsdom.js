// R88-M4 jsdom 行为级验证：把 AI 接入「模拟面试」后，验证
//  1) AI 出题（两次不同岗位 -> 题干不同；且题干来自 AI 而非固定题库）
//  2) AI 点评（两个内容质量差异明显的回答 -> 点评文本不同；且不是字数公式产物）
//  3) AI 不可用（callAI 抛错/降级）-> UI 明确提示「AI 暂不可用」，且点评卡标注「本地模拟点评」
//  4) ivExportApi 暴露的 API 逐个调用仍正常
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const HTML_PATH = 'D:\\下载的文件\\学习工作台\\AI模拟面试.html';
const HTML = fs.readFileSync(HTML_PATH, 'utf8');
const OUT = 'D:\\下载的文件\\学习工作台\\tools\\_m4_jsdom_out.txt';

const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => logs.push('ERR: ' + a.join(' ')));

const dom = new JSDOM(HTML, {
  url: 'http://localhost/AI%E6%A8%A1%E6%8B%9F%E9%9D%A2%E8%AF%95.html',
  runScripts: 'dangerously',
  resources: 'usable',            // 允许本地相对脚本 <script src="assets/..."> 加载
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // 屏蔽所有外网请求（ai-service 探测等），避免测试挂起
    window.fetch = function () { return Promise.reject(new Error('offline(test)')); };
    window.XMLHttpRequest = function () { return { open() {}, send() {}, setRequestHeader() {}, addEventListener() {} }; };
  }
});

const w = dom.window;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
function log(s) { out.push(s); }
function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '(null)'; }

// ---- 注入可控的 callAI（页面在调用时才读 window.callAI） ----
let aiMode = 'normal';      // 'normal' | 'fail'
let aiQCounter = 0;
const callLog = [];
function makeCallAI() {
  return function (funcType, messages, opts) {
    // opts.onChunk 不使用；返回 Promise<{text, modelUsedName, degraded, fromPreset}>
    const lastUser = messages && messages[messages.length - 1] ? String(messages[messages.length - 1].content || '') : '';
    callLog.push('CALL kind=' + (/"expr"/.test(lastUser) ? 'FEEDBACK' : (/"q"/.test(lastUser) ? 'QUESTION' : 'OTHER')) + ' len=' + lastUser.length);
    if (aiMode === 'fail') {
      return Promise.reject(new Error('AI 服务不可达（测试模拟断网）'));
    }
    if (/请输出 JSON：\{"expr"/.test(lastUser)) {
      // 点评
      const ansM = /我的回答：([\s\S]*?)\n请输出 JSON/.exec(lastUser);
      const answer = ansM ? ansM[1] : '';
      const rich = /第一|因为|所以|结果|复盘/.test(answer) && answer.length > 40;
      return Promise.resolve({
        text: JSON.stringify({
          expr: rich ? 88 : 41, depth: rich ? 84 : 33, match: rich ? 80 : 29,
          good: rich ? ['逻辑分层清晰，能落到结果', '有具体复盘意识'] : ['态度端正，有作答意愿'],
          bad: rich ? ['可再补充量化数据'] : ['内容空泛、缺少事例与结构'],
          advice: rich ? '继续保持，补充量化结果' : '建议用 STAR 法则重写，先给结论再给依据',
          followup: rich ? '如果结果是失败的，你会怎么复盘？' : '能举一个具体例子吗？'
        }),
        modelUsedName: 'test-model', degraded: false, fromPreset: false
      });
    }
    // 出题
    aiQCounter++;
    const posM = /应聘岗位：([^；]+)/.exec(lastUser);
    const pos = posM ? posM[1] : '岗位';
    const q = '【AI生成#' + aiQCounter + '·' + pos + '】请结合你的经历谈谈' + (aiQCounter % 2 ? '一次跨团队协作' : '一次失败复盘') + '。';
    return Promise.resolve({
      text: JSON.stringify({
        q: q, keywords: ['协作', '复盘', '结果'],
        tip: 'AI 提示：用 STAR 结构作答', demo: 'AI 示范回答：背景-任务-行动-结果。'
      }),
      modelUsedName: 'test-model', degraded: false, fromPreset: false
    });
  };
}

async function run() {
  await sleep(2500);   // 等本地 assets 脚本（icon-map/ai-config 等）加载 + ivInit 执行

  log('== 页面与接线 ==');
  log('typeof ivSnapshot = ' + typeof w.ivSnapshot);
  log('typeof window.IV_SNAPSHOT = ' + typeof w.IV_SNAPSHOT);
  log('typeof window.IV_CAN_GOTO = ' + typeof w.IV_CAN_GOTO);
  log('typeof window.IV_GOTO = ' + typeof w.IV_GOTO);
  log('typeof window.ivAIGenQuestion = ' + typeof w.ivAIGenQuestion);
  log('typeof window.ivLocalFeedback = ' + typeof w.ivLocalFeedback);
  log('typeof window.generateFeedback = ' + typeof w.generateFeedback);
  log('typeof window.callAI(真实页面脚本) = ' + typeof w.callAI + '  (将由测试覆盖)');

  // 覆盖为可控 callAI
  w.callAI = makeCallAI();
  log('已把 window.callAI 覆盖为可控测试桩: ' + typeof w.callAI);

  // ---------- ivExportApi 三个全局可用性 ----------
  log('');
  log('== ivExportApi 逐个调用 ==');
  const snap0 = w.IV_SNAPSHOT();
  log('IV_SNAPSHOT() = ' + JSON.stringify(snap0));
  log('IV_CAN_GOTO("reading")(setup下应false) = ' + w.IV_CAN_GOTO('reading'));
  w.IV_GOTO('reviewing');   // setup 下不可跳，应被拒绝且不抛错
  log('IV_GOTO("reviewing") 后 stage 仍为 = ' + w.IV_SNAPSHOT().stage + '（期望 setup，不抛错）');

  // ---------- 1) AI 出题：两次不同岗位 -> 题干不同 ----------
  log('');
  log('== 测试1：AI 出题（换岗位 -> 题干不同） ==');
  w.selectedPos = 'operation';
  w.startInterview();
  await sleep(1500);           // 等 600ms loadQuestion + 异步 AI 出题
  const qEl1 = w.document.getElementById('qMsg0');
  const q1 = qEl1 ? txt(qEl1.querySelector('.msg-bubble')) : '(无)';
  const src1 = qEl1 ? qEl1.querySelector('.msg-bubble').getAttribute('data-ai-src') : null;
  log('岗位=operation 第1题题干 = ' + q1);
  log('题干来源标记 data-ai-src = ' + src1 + '（期望 ai）');

  // 重新开始，换岗位
  w.restartInterview();
  w.selectedPos = 'tech';
  w.startInterview();
  await sleep(1500);
  const qEl2 = w.document.getElementById('qMsg0');
  const q2 = qEl2 ? txt(qEl2.querySelector('.msg-bubble')) : '(无)';
  const src2 = qEl2 ? qEl2.querySelector('.msg-bubble').getAttribute('data-ai-src') : null;
  log('岗位=tech 第1题题干 = ' + q2);
  log('题干来源标记 data-ai-src = ' + src2 + '（期望 ai）');
  log('两题干是否不同（AI 动态出题证据） = ' + (q1 !== q2 ? 'YES ✅' : 'NO ❌'));

  // ---------- 2) AI 点评：两个质量差异明显的回答 -> 点评不同 ----------
  log('');
  log('== 测试2：AI 点评（两个回答 -> 点评文本不同，非字数公式） ==');
  const rich = '第一，我负责过一次跨部门协作，因为需求频繁变更，所以我建立了每日同步机制；第二，最终项目提前两周上线，结果超出预期；复盘下来我最大的收获是主动对齐。';
  const poor = '还行吧，我做过一些事情，感觉还可以。';

  w.restartInterview();
  w.selectedPos = 'general';
  w.startInterview();
  await sleep(1200);
  // 推进到 answering：reading -> preparing -> answering
  w.ivJumpToStage ? w.ivJumpToStage('preparing') : null;
  await sleep(200);
  w.ivJumpToStage ? w.ivJumpToStage('answering') : null;
  await sleep(200);
  log('推进后 stage = ' + w.IV_SNAPSHOT().stage + '（期望 answering）');
  w.submitAnswer(rich, false);
  await sleep(1200);   // 400ms 触发 + 异步 AI 点评
  const cards1 = w.document.querySelectorAll('.feedback-card');
  const card1Text = cards1.length ? txt(cards1[cards1.length - 1]) : '(无点评卡)';
  log('回答A（高质量）点评卡 = ' + card1Text.slice(0, 260));
  log('回答A 是否有 AI 点评标记 = ' + (cards1.length && /AI 点评/.test(card1Text) ? 'YES ✅' : 'NO ❌'));
  log('回答A 是否含追问区 = ' + (cards1.length && /AI 追问/.test(card1Text) ? 'YES ✅' : 'NO ❌'));

  // 第二题，给低质量回答
  w.restartInterview();
  w.startInterview();
  await sleep(1200);
  w.ivJumpToStage('preparing'); await sleep(200);
  w.ivJumpToStage('answering'); await sleep(200);
  w.submitAnswer(poor, false);
  await sleep(1200);
  const cards2 = w.document.querySelectorAll('.feedback-card');
  const card2Text = cards2.length ? txt(cards2[cards2.length - 1]) : '(无点评卡)';
  log('回答B（低质量）点评卡 = ' + card2Text.slice(0, 260));
  log('两回答点评文本是否不同（个性化证据） = ' + (card1Text !== card2Text ? 'YES ✅' : 'NO ❌'));

  // 断言点评不是字数公式：高质量回答含 AI 的 good 文案「逻辑分层清晰」
  log('高质量回答点评含 AI 专属文案「逻辑分层清晰」 = ' + (/逻辑分层清晰/.test(card1Text) ? 'YES ✅' : 'NO ❌'));
  log('低质量回答点评含 AI 专属文案「内容空泛」 = ' + (/内容空泛/.test(card2Text) ? 'YES ✅' : 'NO ❌'));

  // ---------- 3) AI 不可用 -> 明确提示 + 本地标注 ----------
  log('');
  log('== 测试3：AI 不可用（模拟断网） ==');
  aiMode = 'fail';
  w.restartInterview();
  w.startInterview();
  await sleep(1200);
  w.ivJumpToStage('preparing'); await sleep(200);
  w.ivJumpToStage('answering'); await sleep(200);
  w.submitAnswer('这是一段测试作答，用来验证 AI 不可用时的降级表现。', false);
  await sleep(1500);
  const banner = w.document.getElementById('ivAiBanner');
  const bannerText = banner ? txt(banner) : '(无 banner)';
  log('降级 banner 文本 = ' + bannerText + '（期望含「AI 暂不可用」）');
  log('banner 是否明确提示 AI 不可用 = ' + (/AI 暂不可用/.test(bannerText) ? 'YES ✅' : 'NO ❌'));
  const failCards = w.document.querySelectorAll('.feedback-card');
  const failCardText = failCards.length ? txt(failCards[failCards.length - 1]) : '(无点评卡)';
  log('降级点评卡是否标注「本地模拟点评」 = ' + (/本地模拟点评/.test(failCardText) ? 'YES ✅' : 'NO ❌'));
  log('降级点评卡是否【未】冒充 AI（不含「AI 点评」标签） = ' + (/AI 点评/.test(failCardText) ? 'NO ❌' : 'YES ✅'));
  log('降级点评卡摘要 = ' + failCardText.slice(0, 200));

  // ---------- 4) ivExportApi 再验 ----------
  log('');
  log('== 测试4：ivExportApi 终态再验 ==');
  w.IV_GOTO('reading');   // 当前 answering，可回退
  log('IV_GOTO("reading") 后 stage = ' + w.IV_SNAPSHOT().stage);
  log('IV_CAN_GOTO("reading") = ' + w.IV_CAN_GOTO('reading'));
  log('IV_SNAPSHOT() = ' + JSON.stringify(w.IV_SNAPSHOT()));

  // ---------- 5) 防重入：submitting 期间重复提交不产生第二个请求 ----------
  log('');
  log('== 测试5：防重入（提交后重复调用 submitAnswer 不应重复计价） ==');
  aiMode = 'normal';
  const before = callLog.length;
  w.restartInterview();
  w.startInterview();
  await sleep(1200);
  w.ivJumpToStage('preparing'); await sleep(200);
  w.ivJumpToStage('answering'); await sleep(200);
  w.submitAnswer('第一，我做了一件事，因为时间紧所以先拆解任务，结果是按时交付。', false);
  // stage 立刻变 submitting，重复提交应被拒
  const stageAfterSubmit = w.IV_SNAPSHOT().stage;
  w.submitAnswer('重复提交不应生效', false);
  w.submitAnswer('重复提交不应生效2', false);
  await sleep(1200);
  const fbCalls = callLog.slice(before).filter(function (x) { return /FEEDBACK/.test(x); }).length;
  log('提交后 stage = ' + stageAfterSubmit + '（期望 submitting）');
  log('本次窗口内 FEEDBACK 调用次数 = ' + fbCalls + '（期望 1，防重入成功）');
  log('是否仅 1 次点评请求 = ' + (fbCalls === 1 ? 'YES ✅' : 'NO ❌'));

  log('');
  log('== jsdom 异常（前 10） ==');
  log(logs.slice(0, 10).join('\n') || '(无)');
  log('');
  log('== callAI 调用轨迹 ==');
  log(callLog.join('\n'));

  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('DONE');
  process.exit(0);
}

run().catch(e => {
  out.push('TEST_RUN_ERROR: ' + (e && e.stack ? e.stack : e));
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log('ERROR_DONE');
  process.exit(1);
});
