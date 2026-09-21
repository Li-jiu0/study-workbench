/* =====================================================================
   N9-19（20260915w2）：按设计稿重构
   1) 每阶段只有一个主按钮：准备=开始回答 / 回答=结束回答 / 点评=下一题
   2) 语音/文字 Tab 二选一，默认文字高亮、语音灰显
   3) AI 面试官降级为 40px 小头像，题目移入文字气泡
   4) AI 画像删除，辅助改为「答题提示」次级按钮
   5) 演示悬浮球删除，改为题目卡内「查看示范回答」次级按钮
   6) 提交后必有反馈：三维评分条 + 优点 + 不足 + 改进建议 + 参考回答
   补充：页面内五段状态条（读题-准备-回答-提交-点评），顶部保留进度点与第 x/5 题
   ===================================================================== */

/* ===================== 题库（5 题，与设计稿「第 1/5 题」一致） ===================== */
var INTERVIEW_QUESTIONS = [
  {
    q: '你好，请坐。我们今天的面试大概30分钟。首先，请你做一个简单的自我介绍。',
    keywords: ['姓名', '学校', '专业', '实习', '经历', '优势', '岗位'],
    tip: '自我介绍建议包含：基本信息 + 教育背景 + 实习/项目经历 + 为什么适合这个岗位，控制在2-3分钟。',
    demo: '面试官您好，我叫张明，是华东师范大学人力资源管理专业的应届毕业生。在校期间我担任学生会宣传部部长，主导过两场校园招聘会的宣传组织工作；大三在一家互联网公司实习了6个月，参与执行了两场50人规模的校招。我的优势是执行力和沟通能力比较强，做事有条理、有闭环意识。我了解到这个岗位需要经常对接业务部门和候选人，和我的实习经历、性格特点都比较匹配，希望能有机会加入团队，谢谢。',
    time: 90, prep: 15
  },
  {
    q: '好的，我了解了。那么你为什么选择我们公司？为什么应聘这个岗位？',
    keywords: ['了解', '认同', '文化', '发展', '匹配', '兴趣', '规划'],
    tip: '回答要点：对公司的了解 + 对岗位的理解 + 自身匹配度 + 职业规划，不要只说"工资高、稳定"。',
    demo: '我选择贵公司主要有三个原因。第一，我关注到公司近两年在智能硬件领域的业务增长很快，说明战略方向清晰、发展空间大；第二，我在实习期间深度使用过贵公司的产品，体验做得很细致，说明公司重视产品打磨，这种文化我很认同；第三，这个岗位的职责和我的专业背景、实习经历匹配度高，我有信心快速上手并做出成果。所以我不是盲目投递，而是认真了解之后的慎重选择。',
    time: 60, prep: 15
  },
  {
    q: '嗯。那你觉得自己最大的优点和缺点分别是什么？请具体说明。',
    keywords: ['优点', '缺点', '改进', '例子', '成长', '克服'],
    tip: '优点要结合岗位需要，缺点要说"正在改进的特点"，不要说致命缺点，也不要说"我太追求完美"这种假缺点。',
    demo: '我最大的优点是执行力强、闭环意识好。比如实习时负责一场宣讲会的物料准备，我把任务拆成清单、每天跟进进度，最后提前两天完成，没有出现遗漏。缺点是有时候在细节上花费时间偏多，影响整体节奏。我现在的改进方法是先给每项工作设定时间盒，优先保证整体进度，再用碎片时间打磨细节。这段时间的实践让我既保住了质量，也没有拖过进度。',
    time: 60, prep: 15
  },
  {
    q: '请介绍一次你成功完成某项任务的经历。当时遇到了什么困难，你是怎么解决的？',
    keywords: ['背景', '目标', '行动', '结果', '反思', '收获', 'STAR'],
    tip: '用STAR法则：Situation背景 + Task任务 + Action行动 + Result结果，重点说你做了什么、取得了什么成果。',
    demo: '大三上学期，我负责组织一场300人规模的校园招聘会，这是背景。当时距离活动只剩两周，两位主讲的企业嘉宾临时确认无法到场，这是最大的困难和任务。我的行动分两步：一方面立即梳理备选嘉宾名单，48小时内联系并确认了两位替补嘉宾；另一方面把宣传物料提前，为可能的变动留出缓冲。最终活动如期举办，到场率85%，满意度4.6分。这件事让我学会了：遇到突发情况先稳住节奏、快速找替代方案，并把风险缓冲设计进计划里。',
    time: 90, prep: 20
  },
  {
    q: '如果在工作中你和同事发生了冲突，你会怎么处理？请举个具体的例子。',
    keywords: ['沟通', '理解', '换位思考', '解决', '团队', '对事不对人'],
    tip: '回答要点：先冷静 - 换位思考理解对方 - 主动沟通 - 对事不对人 - 寻求共同解决方案，不要只说"我会忍让"。',
    demo: '实习时我和另一位同事在活动方案上有分歧：他想走线下摆摊，我建议主推线上推送。我没有急着争论，而是先约他单独沟通，发现他真正担心的是线上报名人数没有保障。于是我提出两者结合：线上为主、线下摆摊做补充引流，并用上一次活动的数据预估了两条渠道各自的报名量。最后他同意了方案，活动报名超额完成。我的原则是对事不对人：先理解对方在担心什么，再用数据和折中方案达成共识，而不是争一个输赢。',
    time: 60, prep: 15
  }
];

/* ===================== 状态 ===================== */
var currentQuestion = 0;
var userAnswers = [];
var userResults = [];
var interviewStarted = false;
var timerInterval = null;
var timeLeft = 90;
var currentTotal = 90;
var timerMode = 'answer';      /* 'prep' | 'answer' */
var currentStage = 'setup';    /* setup | reading | preparing | answering | submitting | reviewing */
var selectedType = 'structured';
var selectedPos = 'general';
var STAGES = ['reading', 'preparing', 'answering', 'submitting', 'reviewing'];

/* ===================== 工具 ===================== */
function ico(name, size) {
  if (typeof window.lucideIcon !== 'function') return '';
  return window.lucideIcon(name, size || 16);
}

/* 猫头鹰头像（内联 SVG，40px 圆形 / 气泡 28px 复用） */
function owlSvg(size) {
  return '<svg viewBox="0 0 64 64" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="32" cy="32" r="32" fill="#E8F0FE"/>'
    + '<path d="M11 15 L22 22 L14 29 Z" fill="#1765CC"/>'
    + '<path d="M53 15 L42 22 L50 29 Z" fill="#1765CC"/>'
    + '<ellipse cx="32" cy="35" rx="20" ry="22" fill="#1A73E8"/>'
    + '<ellipse cx="32" cy="45" rx="11" ry="11" fill="#FFFFFF"/>'
    + '<circle cx="23.5" cy="30" r="7.5" fill="#FFFFFF"/>'
    + '<circle cx="40.5" cy="30" r="7.5" fill="#FFFFFF"/>'
    + '<circle cx="23.5" cy="30" r="3.2" fill="#0B3B8C"/>'
    + '<circle cx="40.5" cy="30" r="3.2" fill="#0B3B8C"/>'
    + '<path d="M32 35 L27.5 39.5 L32 44 L36.5 39.5 Z" fill="#F9AB00"/>'
    + '</svg>';
}

function scrollChat() {
  var m = document.getElementById('chatMessages');
  if (m) m.scrollTop = m.scrollHeight;
}

/* ===================== 设置面板选项 ===================== */
(function bindSetupOptions() {
  function bind(groupId, attrName, setter) {
    var opts = document.querySelectorAll('#' + groupId + ' .setup-option');
    for (var i = 0; i < opts.length; i++) {
      opts[i].addEventListener('click', function () {
        var list = document.querySelectorAll('#' + groupId + ' .setup-option');
        for (var j = 0; j < list.length; j++) list[j].classList.remove('active');
        this.classList.add('active');
        setter(this.getAttribute(attrName));
      });
    }
  }
  bind('typeOptions', 'data-type', function (v) { selectedType = v; });
  bind('posOptions', 'data-pos', function (v) { selectedPos = v; });
})();

/* ===================== 顶部进度 ===================== */
function renderDots() {
  var box = document.getElementById('progressDots');
  if (!box) return;
  var html = '';
  for (var i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
    var cls = 'dot';
    if (i < currentQuestion) cls += ' done';
    else if (i === currentQuestion && interviewStarted) cls += ' cur';
    html += '<span class="' + cls + '"></span>';
  }
  box.innerHTML = html;
}

function updateProgress() {
  var info = document.getElementById('questionInfo');
  if (info) info.textContent = '第 ' + (currentQuestion + 1) + ' / ' + INTERVIEW_QUESTIONS.length + ' 题';
  renderDots();
}

/* ===================== 五段状态条 + 阶段主按钮 ===================== */
function setStage(stage) {
  currentStage = stage;
  var bar = document.getElementById('stageBar');
  if (bar) {
    var segs = bar.querySelectorAll('.stage-seg');
    var idx = STAGES.indexOf(stage);
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.remove('active', 'done');
      if (idx >= 0) {
        if (i < idx) segs[i].classList.add('done');
        else if (i === idx) segs[i].classList.add('active');
      }
    }
  }
  var prepC = document.getElementById('prepComposer');
  var textC = document.getElementById('textComposer');
  if (prepC && textC) {
    if (stage === 'preparing') { prepC.classList.remove('hidden'); textC.classList.add('hidden'); }
    else if (stage === 'answering') { prepC.classList.add('hidden'); textC.classList.remove('hidden'); }
    else { prepC.classList.add('hidden'); textC.classList.add('hidden'); }
  }
  var label = document.getElementById('timerLabel');
  if (label) label.textContent = (stage === 'preparing') ? '准备剩余' : '回答剩余';
}

function markAllStagesDone() {
  var bar = document.getElementById('stageBar');
  if (!bar) return;
  var segs = bar.querySelectorAll('.stage-seg');
  for (var i = 0; i < segs.length; i++) { segs[i].classList.remove('active'); segs[i].classList.add('done'); }
}

/* ===================== 计时 ===================== */
function startTimer(seconds, mode) {
  clearInterval(timerInterval);
  timeLeft = seconds;
  currentTotal = seconds;
  timerMode = mode || 'answer';
  updateTimerDisplay();
  timerInterval = setInterval(function () {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (timerMode === 'prep') { beginAnswering(); }
      else { autoSubmit(); }
    }
  }, 1000);
}

function updateTimerDisplay() {
  var timerValue = document.getElementById('timerValue');
  var timerFill = document.getElementById('timerFill');
  if (!timerValue || !timerFill) return;
  timerValue.textContent = timeLeft;
  timerFill.style.width = Math.max(0, timeLeft / currentTotal * 100) + '%';
  timerValue.classList.remove('warning', 'danger');
  if (timerMode === 'answer') {
    if (timeLeft <= 10) timerValue.classList.add('danger');
    else if (timeLeft <= 20) timerValue.classList.add('warning');
  }
}

/* ===================== 面试主流程 ===================== */
function startInterview() {
  interviewStarted = true;
  currentQuestion = 0;
  userAnswers = [];
  userResults = [];
  document.getElementById('setupPanel').classList.add('hidden');
  document.getElementById('chatContainer').classList.remove('hidden');
  document.getElementById('evalPanel').classList.add('hidden');
  var tp = document.getElementById('topProgress');
  if (tp) tp.classList.remove('hidden');

  var messages = document.getElementById('chatMessages');
  var interviewerArea = messages.querySelector('.interviewer-area');
  messages.innerHTML = '';
  messages.appendChild(interviewerArea);
  var avatar = document.getElementById('aiAvatar');
  if (avatar) avatar.innerHTML = owlSvg(40);

  updateProgress();
  setTimeout(function () { loadQuestion(0); }, 600);
}

function loadQuestion(idx) {
  clearInterval(timerInterval);
  var q = INTERVIEW_QUESTIONS[idx];
  var tv = document.getElementById('timerValue');
  var tf = document.getElementById('timerFill');
  if (tv) tv.textContent = q.time;
  if (tf) tf.style.width = '100%';
  addQuestionMessage(idx, q.q);
  setStage('reading');
  updateProgress();
  /* 读题约 1.5s 后自动进入准备阶段（准备倒计时） */
  setTimeout(function () {
    if (currentStage === 'reading' && interviewStarted) {
      setStage('preparing');
      startTimer(q.prep || 15, 'prep');
    }
  }, 1500);
}

function beginAnswering() {
  if (currentStage !== 'preparing') return;
  setStage('answering');
  startTimer(INTERVIEW_QUESTIONS[currentQuestion].time, 'answer');
  var input = document.getElementById('inputBox');
  if (input) input.focus();
}

/* 结束回答 / 回车 / 时间到 自动提交，统一入口 */
function submitAnswer(text, timedOut) {
  clearInterval(timerInterval);
  setStage('submitting');
  if (text) { addUserMessage(text); }
  else { addUserMessage(timedOut ? '（时间到，未作答）' : '（未作答）'); }
  userAnswers.push(text);
  var input = document.getElementById('inputBox');
  if (input) { input.value = ''; input.style.height = 'auto'; }
  showTyping();
  setTimeout(function () {
    hideTyping();
    var fb = generateFeedback(text, INTERVIEW_QUESTIONS[currentQuestion]);
    userResults.push(fb);
    renderFeedbackCard(fb);
    setStage('reviewing');
    scrollChat();
  }, 1300);
}

function sendMessage() {
  if (!interviewStarted || currentStage !== 'answering') return;
  var input = document.getElementById('inputBox');
  submitAnswer(input.value.replace(/^\s+|\s+$/g, ''), false);
}

function autoSubmit() {
  if (currentStage !== 'answering') return;
  var input = document.getElementById('inputBox');
  var text = input ? input.value.replace(/^\s+|\s+$/g, '') : '';
  if (text) { sendMessage(); }
  else { submitAnswer('', true); }
}

/* 点评阶段的唯一主按钮：下一题 / 查看面试结果 */
function nextFromReview() {
  if (!interviewStarted || currentStage !== 'reviewing') return;
  if (currentQuestion >= INTERVIEW_QUESTIONS.length - 1) {
    addAIMessage('好的，今天的面试就到这里。正在生成本次模拟的评定报告——');
    markAllStagesDone();
    setTimeout(showEvaluation, 1200);
  } else {
    currentQuestion++;
    loadQuestion(currentQuestion);
  }
}

/* 兼容旧函数名，避免隐性死链 */
function nextQuestion() { nextFromReview(); }

/* ===================== 消息渲染 ===================== */
function addQuestionMessage(idx, text) {
  var messages = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'message ai';
  var q = INTERVIEW_QUESTIONS[idx];
  div.innerHTML =
    '<div class="msg-avatar">' + owlSvg(28) + '</div>'
    + '<div class="msg-main">'
    + '<div class="msg-bubble">' + text + '</div>'
    + '<div class="q-actions">'
    + '<button class="q-sub-btn" type="button" onclick="toggleQBlock(\'tip' + idx + '\')">' + ico('lightbulb', 14) + '答题提示</button>'
    + '<button class="q-sub-btn" type="button" onclick="toggleQBlock(\'demo' + idx + '\')">' + ico('file-text', 14) + '查看示范回答</button>'
    + '</div>'
    + '<div class="q-block hidden" id="tip' + idx + '"><div class="q-block-t">' + ico('lightbulb', 14) + '答题提示</div><p>' + q.tip + '</p></div>'
    + '<div class="q-block hidden" id="demo' + idx + '"><div class="q-block-t">' + ico('file-text', 14) + '示范回答</div><p>' + q.demo + '</p></div>'
    + '</div>';
  messages.appendChild(div);
  scrollChat();
}

function addAIMessage(text) {
  var messages = document.getElementById('chatMessages');
  var msgDiv = document.createElement('div');
  msgDiv.className = 'message ai';
  msgDiv.innerHTML =
    '<div class="msg-avatar">' + owlSvg(28) + '</div>'
    + '<div class="msg-main"><div class="msg-bubble">' + text + '</div></div>';
  messages.appendChild(msgDiv);
  scrollChat();
}

function addUserMessage(text) {
  var messages = document.getElementById('chatMessages');
  var msgDiv = document.createElement('div');
  msgDiv.className = 'message user';
  msgDiv.innerHTML =
    '<div class="msg-avatar">' + ico('user', 16) + '</div>'
    + '<div class="msg-bubble">' + text + '</div>';
  messages.appendChild(msgDiv);
  scrollChat();
}

function showTyping() {
  var messages = document.getElementById('chatMessages');
  var typingDiv = document.createElement('div');
  typingDiv.className = 'message ai';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML =
    '<div class="msg-avatar">' + owlSvg(28) + '</div>'
    + '<div class="msg-main"><div class="msg-bubble"><div class="typing-indicator"><span class="typing-text">AI 正在点评</span><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>';
  messages.appendChild(typingDiv);
  scrollChat();
}

function hideTyping() {
  var typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
}

/* 题目卡内次级按钮：展开 / 收起（页面内区块，替代悬浮球与弹窗） */
function toggleQBlock(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) scrollChat();
}

/* ===================== 单题点评（三维评分条 + 文本反馈） ===================== */
function generateFeedback(answer, question) {
  var len = answer.length;
  var kws = question.keywords;
  var matched = [];
  var missing = [];
  for (var i = 0; i < kws.length; i++) {
    if (answer.indexOf(kws[i]) >= 0) matched.push(kws[i]);
    else missing.push(kws[i]);
  }
  var structWords = ['第一', '第二', '第三', '首先', '其次', '再次', '最后', '总之', '背景', '行动', '结果'];
  var hasStruct = false;
  for (var j = 0; j < structWords.length; j++) {
    if (answer.indexOf(structWords[j]) >= 0) { hasStruct = true; break; }
  }
  var exampleWords = ['例如', '比如', '曾经', '一次', '项目', '实习', '案例', '举例'];
  var hasExample = false;
  for (var k = 0; k < exampleWords.length; k++) {
    if (answer.indexOf(exampleWords[k]) >= 0) { hasExample = true; break; }
  }

  var empty = len === 0;
  var expr = empty ? 12 : (len >= 120 ? 88 : len >= 80 ? 78 : len >= 50 ? 66 : len >= 25 ? 52 : 34);
  if (hasStruct && !empty) expr = Math.min(96, expr + 8);
  var depth = empty ? 10 : Math.min(96, (len >= 150 ? 85 : len >= 90 ? 74 : len >= 50 ? 60 : len >= 25 ? 46 : 30) + (hasExample ? 8 : 0) + Math.min(8, matched.length * 2));
  var match = empty ? 12 : Math.min(96, Math.round(matched.length / kws.length * 62) + (len >= 40 ? 16 : 6) + (hasExample ? 10 : 4) + 8);

  var good = [];
  var bad = [];
  if (!empty) {
    if (len >= 50) good.push('回答篇幅适中，能把要点展开讲清楚');
    else bad.push('回答偏短（约 ' + len + ' 字），建议把每个要点展开成 2-3 句话');
    if (hasStruct) good.push('有分点/分层意识，表达条理清晰');
    else bad.push('缺少明显的分点结构，建议用"第一/其次/最后"组织内容');
    if (hasExample) good.push('结合了具体事例，内容更有说服力');
    else bad.push('缺少具体事例或数据支撑，说服力不足');
    if (matched.length >= 3) good.push('覆盖了 ' + matched.length + ' 个关键要点（' + matched.slice(0, 3).join('、') + ' 等）');
    else if (matched.length > 0) bad.push('只覆盖了 ' + matched.length + ' 个关键要点，还可补充：' + missing.slice(0, 3).join('、'));
    else bad.push('几乎没有触及本题关键要点，可围绕：' + kws.slice(0, 3).join('、'));
  } else {
    good.push('未作答，暂无明显亮点；完成作答后可生成针对性点评');
    bad.push('本题未作答，只能得到底分，实战中这是最影响印象分的情况');
  }

  return { expr: expr, depth: depth, match: match, good: good, bad: bad, advice: question.tip, demo: question.demo };
}

function renderFeedbackCard(fb) {
  var messages = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'feedback-card';
  var isLast = currentQuestion >= INTERVIEW_QUESTIONS.length - 1;

  function bar(label, v) {
    return '<div class="fb-bar-row"><span class="fb-bar-label">' + label + '</span>'
      + '<span class="fb-bar-track"><span class="fb-bar-fill" style="width:' + v + '%"></span></span>'
      + '<span class="fb-bar-val">' + v + '</span></div>';
  }
  function lis(arr) {
    var s = '';
    for (var i = 0; i < arr.length; i++) s += '<li>' + arr[i] + '</li>';
    return s;
  }

  div.innerHTML =
    '<div class="fb-title">' + ico('chart-bar', 16) + '<span>本题点评</span></div>'
    + '<div class="fb-bars">'
    + bar('表达逻辑', fb.expr)
    + bar('内容深度', fb.depth)
    + bar('岗位匹配度', fb.match)
    + '</div>'
    + '<div class="fb-sec"><div class="fb-sec-t good">' + ico('check-circle', 15) + '做得好的</div><ul>' + lis(fb.good) + '</ul></div>'
    + '<div class="fb-sec"><div class="fb-sec-t bad">' + ico('info', 15) + '待改进</div><ul>' + lis(fb.bad) + '</ul></div>'
    + '<div class="fb-sec"><div class="fb-sec-t">' + ico('zap', 15) + '改进建议</div><p>' + fb.advice + '</p></div>'
    + '<div class="fb-sec"><div class="fb-sec-t">' + ico('book-open', 15) + '参考回答</div><p>' + fb.demo + '</p></div>'
    + '<button class="fb-next" type="button" onclick="nextFromReview()">' + (isLast ? '查看面试结果' : '下一题') + '</button>';
  messages.appendChild(div);
}

/* ===================== 输入模式 Tab：文字 / 语音（灰显） ===================== */
function switchInputMode(mode) {
  if (mode === 'voice') {
    var hint = document.getElementById('modeHint');
    if (hint) {
      hint.classList.remove('hidden');
      setTimeout(function () { hint.classList.add('hidden'); }, 2200);
    }
    return;
  }
  var t = document.getElementById('tabText');
  var v = document.getElementById('tabVoice');
  if (t) t.classList.add('active');
  if (v) v.classList.remove('active');
}

/* ===================== 面试评定报告 ===================== */
function showEvaluation() {
  document.getElementById('chatContainer').classList.add('hidden');
  document.getElementById('evalPanel').classList.remove('hidden');

  var n = userResults.length || 1;
  var sumE = 0, sumD = 0, sumM = 0;
  for (var i = 0; i < userResults.length; i++) {
    sumE += userResults[i].expr;
    sumD += userResults[i].depth;
    sumM += userResults[i].match;
  }
  var expr = Math.round(sumE / n);
  var depth = Math.round(sumD / n);
  var match = Math.round(sumM / n);
  var overall = Math.round((expr + depth + match) / 3);

  var bar = function (label, v) {
    return '<div class="fb-bar-row"><span class="fb-bar-label">' + label + '</span>'
      + '<span class="fb-bar-track"><span class="fb-bar-fill" style="width:' + v + '%"></span></span>'
      + '<span class="fb-bar-val">' + v + '</span></div>';
  };
  document.getElementById('evalScores').innerHTML =
    '<div class="fb-bars">'
    + bar('表达逻辑', expr)
    + bar('内容深度', depth)
    + bar('岗位匹配度', match)
    + '</div>';

  var totalLength = 0;
  for (var a = 0; a < userAnswers.length; a++) totalLength += userAnswers[a].length;
  var avgLength = Math.round(totalLength / n);

  document.getElementById('evalGood').innerHTML =
    '① 完成了 ' + userAnswers.length + ' 道题的模拟流程<br>'
    + '② 平均回答长度约 ' + avgLength + ' 字，' + (avgLength > 30 ? '表达较为充分' : '可进一步展开') + '<br>'
    + '③ 三维均分 ' + overall + ' 分，' + (overall >= 70 ? '整体表现稳定' : '仍有明确的提升空间');

  document.getElementById('evalImprove').innerHTML =
    '① 用STAR法则回答行为类问题（背景-任务-行动-结果）<br>'
    + '② 多举具体例子和数据，避免空泛观点<br>'
    + '③ 回答前先分点，"第一/其次/最后"让逻辑更清晰<br>'
    + '④ 对照每题的参考回答，补齐遗漏的关键要点';

  document.getElementById('evalOverall').innerHTML =
    '综合评定：' + (overall >= 80 ? '优秀' : overall >= 65 ? '良好' : overall >= 45 ? '中等' : '有待提高')
    + '（' + overall + ' 分）。'
    + (overall >= 80 ? '表现全面，继续保持，可在真实面试前再打磨自我介绍和STAR细节。'
      : overall >= 65 ? '已有不错的面试基础，重点补齐关键词覆盖和事例支撑。'
      : overall >= 45 ? '有一定基础但套路不熟，建议逐题对照参考回答重练一遍。'
      : '建议先系统学习面试技巧，从自我介绍开始，逐题模仿参考回答练习。');

  window.scrollTo(0, 0);
}

function restartInterview() {
  document.getElementById('evalPanel').classList.add('hidden');
  document.getElementById('setupPanel').classList.remove('hidden');
  var tp = document.getElementById('topProgress');
  if (tp) tp.classList.add('hidden');
  interviewStarted = false;
  currentStage = 'setup';
  clearInterval(timerInterval);
}

/* ===================== 键盘 ===================== */
function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  var textarea = e.target;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/* N9-25（2026-09-15）：返回改为「智能返回」——有历史记录就回到跳转前页面
   （从个人中心进来就回个人中心），无历史时兜底回首页。原实现硬跳首页，会丢失来处。 */
function goBack() {
  if (history.length > 1) { history.back(); return; }
  var ref = document.referrer || '';
  if (ref.indexOf('个人中心.html') >= 0) { location.href = '个人中心.html'; return; }
  location.href = '学习工作台.html';
}

/* 静态 AI 头像（无外部图片资源，用内联 SVG） */
(function initAvatar() {
  var avatar = document.getElementById('aiAvatar');
  if (avatar) avatar.innerHTML = owlSvg(40);
})();