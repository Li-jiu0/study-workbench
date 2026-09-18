# -*- coding: utf-8 -*-
"""L7-1 应用改造：AI模拟面试.html（六阶段状态机 + 五段状态条）
严格要求：读入 utf-8-sig / CRLF，输出 BOM + CRLF，逐项 assert 命中次数。
"""
import io
import os

P = r'D:\下载的文件\学习工作台\AI模拟面试.html'
raw = open(P, 'rb').read()
assert raw[:3] == b'\xef\xbb\xbf', 'BOM missing'
assert raw.count(b'\r\n') == raw.count(b'\n'), 'mixed EOL'
s = raw.decode('utf-8-sig').replace('\r\n', '\n')

EDITS = []
N = 0


def rep(old, new, count=1):
    global s
    global N
    got = s.count(old)
    assert got == count, 'EDIT#%d expect %d got %d :: %r' % (N, count, got, old[:70])
    s = s.replace(old, new)
    N += 1


# ============================================================ 1. 阶段条 / 提示条样式
rep(
    """.stage-line { flex: 1; height: 1px; background: var(--border); min-width: 8px; }
""",
    """.stage-line { flex: 1; height: 1px; background: var(--border); min-width: 8px; }
/* N9-19 六阶段状态机：状态条可点击推进/回退（仅 data-jump="1" 的段可点） */
.stage-seg[data-jump="1"] { cursor: pointer; }
.stage-seg[data-jump="1"]:hover .stage-dot,
.stage-seg[data-jump="1"]:focus .stage-dot { box-shadow: 0 0 0 3px var(--primary-light); }
.stage-seg[data-jump="1"]:focus { outline: none; }
/* 当前阶段说明条：第 x/6 阶段 + 该阶段唯一主操作 + 可回退路径 */
.stage-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 20px 10px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.stage-tip .tip-ic { display: inline-flex; flex-shrink: 0; margin-top: 1px; }
.stage-tip .tip-ic svg { display: block; stroke: var(--primary); }
.stage-tip b { color: var(--primary-dark); font-weight: 700; }
.stage-tip .tip-back { color: var(--text-muted); }
/* 答题阶段次级回退按钮（主按钮仍唯一） */
.answer-aux { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
/* 无阶段操作的阶段（提交/点评/报告）收起整块底部输入区 */
.composer.idle { display: none; }
/* 页内轻提示兜底（全站禁原生 alert/confirm/prompt） */
.iv-toast {
  position: fixed;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  max-width: 82vw;
  padding: 9px 16px;
  border-radius: 20px;
  background: rgba(32, 33, 36, 0.92);
  color: #fff;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  z-index: 9999;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
.iv-toast.on { opacity: 1; }
""")

# ============================================================ 2. 脚本头注释
rep(
    """/* =====================================================================
   N9-19（20260915w2）：按设计稿重构
   1) 每阶段只有一个主按钮：准备=开始回答 / 回答=结束回答 / 点评=下一题
   2) 语音/文字 Tab 二选一，默认文字高亮、语音灰显
   3) AI 面试官降级为 40px 小头像，题目移入文字气泡
   4) AI 画像删除，辅助改为「答题提示」次级按钮
   5) 演示悬浮球删除，改为题目卡内「查看示范回答」次级按钮
   6) 提交后必有反馈：三维评分条 + 优点 + 不足 + 改进建议 + 参考回答
   补充：页面内五段状态条（读题-准备-回答-提交-点评），顶部保留进度点与第 x/5 题
   ===================================================================== */
""",
    """/* =====================================================================
   N9-19（20260916w3）：六阶段状态机 + 五段状态条
   ---------------------------------------------------------------------
   一、六阶段状态机（IV_STAGES，唯一阶段出口 = ivGotoStage）
     setup（面试准备）→ reading（读题）→ preparing（准备）→ answering（回答）
       → submitting（提交）→ reviewing（点评）→ 终态 eval（评定报告）
   · 进入/退出条件与可回退性见 IV_STAGE_MACHINE / IV_TRANSITIONS 常量表
   · 系统自动转移：reading→preparing（1.5s）、submitting→reviewing（点评返回）
                     reviewing→reading（下一题）、reviewing→eval（末题）
   · 用户可主动转移（状态条点击 / 次级按钮）只走 IV_TRANSITIONS 白名单
   二、五段状态条（IV_BAR_STAGES）：读题 / 准备 / 回答 / 提交 / 点评
     · 只映射六阶段的 reading..reviewing 五段（setup 阶段整块对话区隐藏，无状态条）
     · 每段三态：未开始（灰点）/ 进行中（.active 蓝点 + 蓝色光环 + 粗体）/ 已完成（.done 半透明蓝点）
   三、三条回退路径（真机可点通）
     R1 preparing → reading ：状态条「读题」或「重读题目」
     R2 answering → preparing：状态条「准备」或「再想想（回到准备）」
     R3 reviewing → answering：状态条「回答」或点评卡「重答本题」（出栈上一次答案与点评）
   四、每阶段只有一个主按钮：setup=开始面试 / reading=开始准备 / preparing=开始回答
     / answering=结束回答 / submitting=（AI 正在点评）/ reviewing=下一题|查看面试结果
   五、设计稿基线：浅紫灰画布 + 白卡片 + Google 蓝主色；AI 面试官 40px 小头像，题目在文字气泡内
   六、老 WebView 兼容：全程 ES2017 及以下（无 ?. / ?? / replaceAll / 对象展开 / 可选 catch 绑定）
   ===================================================================== */
""")

# ============================================================ 3. 状态常量块
STATE_NEW = """/* ===================== 状态 ===================== */
var currentQuestion = 0;
var userAnswers = [];
var userResults = [];
var interviewStarted = false;
var timerInterval = null;
var timeLeft = 90;
var currentTotal = 90;
var timerMode = 'answer';      /* 'prep' | 'answer' */
var currentStage = 'setup';    /* 六阶段之一，见 IV_STAGES */
var selectedType = 'structured';
var selectedPos = 'general';

/* 五段状态条（保留旧全局名，供外部引用） */
var STAGES = ['reading', 'preparing', 'answering', 'submitting', 'reviewing'];

/* ---------- 六阶段状态机 · 常量表 ---------- */
var IV_STAGES = ['setup', 'reading', 'preparing', 'answering', 'submitting', 'reviewing'];
var IV_BAR_STAGES = ['reading', 'preparing', 'answering', 'submitting', 'reviewing'];
var IV_TERMINAL = 'eval';
var IV_STAGE_LABEL = {
  'setup': '面试准备',
  'reading': '读题',
  'preparing': '准备',
  'answering': '回答',
  'submitting': '提交',
  'reviewing': '点评',
  'eval': '评定报告'
};
/* 每阶段：index=阶段序号（0 起）；barIndex=状态条段序号（-1=不显示在状态条）；
   primary=该阶段唯一主按钮；tip=阶段说明；timer=该阶段计时类型（''|prep|answer） */
var IV_STAGE_MACHINE = {
  'setup': { index: 0, barIndex: -1, primary: '开始面试', tip: '选择面试类型与岗位，准备好后开始', timer: '' },
  'reading': { index: 1, barIndex: 0, primary: '开始准备', tip: '读题中：想清楚要回答什么，再进入准备', timer: '' },
  'preparing': { index: 2, barIndex: 1, primary: '开始回答', tip: '准备中：理清思路，倒计时结束会自动开始作答', timer: 'prep' },
  'answering': { index: 3, barIndex: 2, primary: '结束回答', tip: '回答中：写完点「结束回答」，也可按 Enter 提交', timer: 'answer' },
  'submitting': { index: 4, barIndex: 3, primary: '', tip: '提交中：AI 面试官正在点评，请稍候', timer: '' },
  'reviewing': { index: 5, barIndex: 4, primary: '下一题 / 查看面试结果', tip: '已点评：看评分与改进建议，再进入下一题', timer: '' },
  'eval': { index: 6, barIndex: 5, primary: '重新面试', tip: '评定报告：本次模拟面试已完成', timer: '' }
};
/* 用户可主动触发的转移白名单（状态条点击 / 回退按钮）；
   系统自动转移（reading→preparing、submitting→reviewing、reviewing→reading|eval）不走此表 */
var IV_TRANSITIONS = {
  'setup': { 'reading': true },
  'reading': { 'preparing': true },
  'preparing': { 'reading': true, 'answering': true },
  'answering': { 'preparing': true, 'submitting': true },
  'submitting': {},
  'reviewing': { 'answering': true },
  'eval': {}
};
/* 各阶段的回退说明（用于状态条 title 与提示条） */
var IV_BACK_HINT = {
  'reading': '回到读题，重新审题',
  'preparing': '回到准备，重新理思路',
  'answering': '回到回答，重答本题',
  'submitting': '',
  'reviewing': ''
};

/* 运行时数据 */
var SESSION_QUESTIONS = [];    /* 本次面试题目（含 ?q= 带入的自选题目） */
var PENDING_PREP_Q = '';       /* 来自「面试准备」页 ?q= 的自选题目 */
var readingTimer = null;       /* 读题自动推进定时器 */
var pendingFeedbackTimer = null; /* 提交后点评返回定时器 */
var toastTimer = null;

"""
a = s.index('/* ===================== 状态 ===================== */')
b = s.index('/* ===================== 工具 ===================== */')
s = s[:a] + STATE_NEW + s[b:]
N += 1

# ============================================================ 4. 状态条 HTML + 提示条
rep(
    """  <!-- 五段状态条：读题 - 准备 - 回答 - 提交 - 点评 -->
  <div class="stage-bar" id="stageBar">
    <div class="stage-seg" data-stage="reading"><span class="stage-dot"></span><span>读题</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="preparing"><span class="stage-dot"></span><span>准备</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="answering"><span class="stage-dot"></span><span>回答</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="submitting"><span class="stage-dot"></span><span>提交</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="reviewing"><span class="stage-dot"></span><span>点评</span></div>
  </div>
""",
    """  <!-- 五段状态条（映射六阶段的 reading..reviewing）：读题 - 准备 - 回答 - 提交 - 点评
       每段三态：未开始 / 进行中(.active) / 已完成(.done)；data-jump=1 表示当前可点（推进或回退） -->
  <div class="stage-bar" id="stageBar" role="group" aria-label="面试流程阶段">
    <div class="stage-seg" data-stage="reading" data-index="0" role="button" tabindex="0" aria-label="读题"><span class="stage-dot"></span><span class="stage-label">读题</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="preparing" data-index="1" role="button" tabindex="0" aria-label="准备"><span class="stage-dot"></span><span class="stage-label">准备</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="answering" data-index="2" role="button" tabindex="0" aria-label="回答"><span class="stage-dot"></span><span class="stage-label">回答</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="submitting" data-index="3" role="button" tabindex="0" aria-label="提交"><span class="stage-dot"></span><span class="stage-label">提交</span></div>
    <span class="stage-line"></span>
    <div class="stage-seg" data-stage="reviewing" data-index="4" role="button" tabindex="0" aria-label="点评"><span class="stage-dot"></span><span class="stage-label">点评</span></div>
  </div>

  <!-- 当前阶段提示条：第 x/6 阶段 + 该阶段唯一主操作 + 可回退路径 -->
  <div class="stage-tip" id="stageTip"></div>
""")

# ============================================================ 5. composer 加 id
rep(
    """  <div class="composer">
    <div class="input-tabs" id="inputTabs">""",
    """  <div class="composer" id="composer">
    <div class="input-tabs" id="inputTabs">""")

# ============================================================ 6. 三段输入区 + 回退按钮
rep(
    """    <div class="prep-composer hidden" id="prepComposer">
      <div class="prep-tip">可利用准备时间理清思路，点击按钮开始作答</div>
      <button class="main-btn" id="prepBtn" type="button" onclick="beginAnswering()">开始回答</button>
    </div>

    <div class="text-composer hidden" id="textComposer">
      <textarea class="input-box" id="inputBox" placeholder="请输入你的回答..." rows="2" onkeydown="handleKeyDown(event)"></textarea>
      <button class="send-btn" id="sendBtn" type="button" onclick="sendMessage()">结束回答</button>
    </div>
""",
    """    <div class="prep-composer hidden" id="readComposer">
      <div class="prep-tip">读题阶段：先看清问题，再进入准备</div>
      <button class="main-btn" id="readBtn" type="button" onclick="finishReading()">开始准备</button>
    </div>

    <div class="prep-composer hidden" id="prepComposer">
      <div class="prep-tip">可利用准备时间理清思路，点击按钮开始作答</div>
      <button class="main-btn" id="prepBtn" type="button" onclick="beginAnswering()">开始回答</button>
      <div class="answer-aux">
        <button class="q-sub-btn" type="button" onclick="backToReading()"><span data-icon="rotate-ccw" data-icon-size="14"></span>重读题目</button>
      </div>
    </div>

    <div class="text-composer hidden" id="textComposer">
      <textarea class="input-box" id="inputBox" placeholder="请输入你的回答..." rows="2" onkeydown="handleKeyDown(event)"></textarea>
      <button class="send-btn" id="sendBtn" type="button" onclick="sendMessage()">结束回答</button>
    </div>
    <div class="answer-aux hidden" id="answerAux">
      <button class="q-sub-btn" type="button" onclick="backToPreparing()"><span data-icon="rotate-ccw" data-icon-size="14"></span>再想想（回到准备）</button>
    </div>
""")

BLOCK_NEW = r"""/* ===================== 顶部进度 ===================== */
function renderDots() {
  var box = document.getElementById('progressDots');
  if (!box) return;
  var total = SESSION_QUESTIONS.length || INTERVIEW_QUESTIONS.length;
  var html = '';
  for (var i = 0; i < total; i++) {
    var cls = 'dot';
    if (i < currentQuestion) cls += ' done';
    else if (i === currentQuestion && interviewStarted) cls += ' cur';
    html += '<span class="' + cls + '"></span>';
  }
  box.innerHTML = html;
}

function updateProgress() {
  var total = SESSION_QUESTIONS.length || INTERVIEW_QUESTIONS.length;
  var info = document.getElementById('questionInfo');
  if (info) info.textContent = '第 ' + (currentQuestion + 1) + ' / ' + total + ' 题';
  renderDots();
}

/* ===================== 六阶段状态机 · 核心 ===================== */

/* 当前题对象（越界兜底第一题，防 ?q= 注入后索引漂移） */
function currentQ() {
  return SESSION_QUESTIONS[currentQuestion] || INTERVIEW_QUESTIONS[0];
}

/* 阶段 → 在 IV_STAGES 中的序号（终态 eval 视为末位） */
function ivStageNo(stage) {
  for (var i = 0; i < IV_STAGES.length; i++) { if (IV_STAGES[i] === stage) return i; }
  if (stage === IV_TERMINAL) return IV_STAGES.length;
  return 0;
}

/* 阶段 → 五段状态条段序号；-1 = 不显示在状态条（setup） */
function ivBarIndex(stage) {
  for (var i = 0; i < IV_BAR_STAGES.length; i++) { if (IV_BAR_STAGES[i] === stage) return i; }
  return -1;
}

/* 用户能否主动触发 currentStage → target（白名单见 IV_TRANSITIONS） */
function ivCanGoto(target) {
  var row = IV_TRANSITIONS[currentStage];
  if (!row) return false;
  return row[target] === true;
}

/* classList.toggle(cls, force) 在部分老内核不可靠，统一走显式增删 */
function ivToggleClass(el, cls, on) {
  if (!el) return;
  if (on) el.classList.add(cls);
  else el.classList.remove(cls);
}

/* 五段状态条渲染：未开始 / 进行中(.active) / 已完成(.done) + 可点标记与 title */
function ivRenderStageBar() {
  var bar = document.getElementById('stageBar');
  if (!bar) return;
  var segs = bar.querySelectorAll('.stage-seg');
  var cur = (currentStage === IV_TERMINAL) ? IV_BAR_STAGES.length : ivBarIndex(currentStage);
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    seg.classList.remove('active', 'done');
    if (cur >= 0) {
      if (i < cur) seg.classList.add('done');
      else if (i === cur) seg.classList.add('active');
    }
    var tgt = IV_BAR_STAGES[i];
    var label = IV_STAGE_LABEL[tgt] || tgt;
    var can = ivCanGoto(tgt) ? '1' : '0';
    seg.setAttribute('data-jump', can);
    seg.setAttribute('aria-current', i === cur ? 'step' : 'false');
    if (can === '1') {
      var hint = IV_BACK_HINT[tgt];
      seg.setAttribute('title', (cur > i && hint) ? hint : '进入「' + label + '」阶段');
    } else {
      seg.setAttribute('title', '当前不可跳到「' + label + '」');
    }
  }
}

/* 当前阶段提示条：第 x/6 阶段 + 该阶段唯一主操作 + 可回退路径 */
function ivRenderStageTip() {
  var box = document.getElementById('stageTip');
  if (!box) return;
  var h = '<span class="tip-ic" data-icon="info" data-icon-size="14"></span>';
  if (currentStage === IV_TERMINAL) {
    h += '<span><b>评定报告</b>　本次模拟面试已完成，可点「重新面试」再练一轮。</span>';
  } else {
    var m = IV_STAGE_MACHINE[currentStage] || IV_STAGE_MACHINE['setup'];
    h += '<span><b>第 ' + (m.index + 1) + ' / 6 阶段 · ' + (IV_STAGE_LABEL[currentStage] || '') + '</b>　' + m.tip;
    var back = IV_BACK_HINT[currentStage];
    if (back) h += '　<span class="tip-back">（可回退：' + back + '）</span>';
    h += '</span>';
  }
  box.innerHTML = h;
  if (typeof window.lucideAutoRender === 'function') {
    try { window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
  }
}

/* 唯一阶段出口：任何阶段切换都经此函数，保证「状态条 / 输入区 / 计时器」三方一致 */
function ivGotoStage(target, opts) {
  if (!target) return false;
  if (target !== IV_TERMINAL && IV_STAGE_MACHINE[target] === undefined) return false;
  if (target === currentStage) { ivRenderStageBar(); ivRenderStageTip(); return false; }
  currentStage = target;

  /* 读题自动推进定时器：离开读题即取消 */
  if (target !== 'reading' && readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  /* 计时器只服务准备 / 回答两段，其余段一律停表 */
  if (target !== 'preparing' && target !== 'answering') { clearInterval(timerInterval); timerInterval = null; }

  ivRenderStageBar();
  ivRenderStageTip();

  /* 输入区：每阶段只暴露一个主按钮 */
  var readC = document.getElementById('readComposer');
  var prepC = document.getElementById('prepComposer');
  var textC = document.getElementById('textComposer');
  var aux = document.getElementById('answerAux');
  var comp = document.getElementById('composer');
  ivToggleClass(readC, 'hidden', target !== 'reading');
  ivToggleClass(prepC, 'hidden', target !== 'preparing');
  ivToggleClass(textC, 'hidden', target !== 'answering');
  ivToggleClass(aux, 'hidden', target !== 'answering');
  ivToggleClass(comp, 'idle', !(target === 'reading' || target === 'preparing' || target === 'answering'));

  var label = document.getElementById('timerLabel');
  if (label) label.textContent = (target === 'preparing') ? '准备剩余' : '回答剩余';

  if (opts && opts.focusInput) {
    var input = document.getElementById('inputBox');
    if (input) { try { input.focus(); } catch (e) { /* 老内核忽略 */ } }
  }
  return true;
}

/* 兼容旧函数名 setStage：一律走状态机，不再各自改 DOM */
function setStage(stage) {
  if (stage === 'setup' || stage === IV_TERMINAL) { ivGotoStage(stage); return; }
  if (IV_STAGE_MACHINE[stage] === undefined) return;
  ivGotoStage(stage);
}

/* 五段全部标记为已完成（终态用；保留旧名） */
function markAllStagesDone() {
  var bar = document.getElementById('stageBar');
  if (!bar) return;
  var segs = bar.querySelectorAll('.stage-seg');
  for (var i = 0; i < segs.length; i++) { segs[i].classList.remove('active'); segs[i].classList.add('done'); }
}

/* 状态条命中检测（不依赖 Element.closest，兼容老内核） */
function ivFindSeg(node, root) {
  while (node && node !== root) {
    if (node.getAttribute && node.getAttribute('data-stage')) return node;
    node = node.parentNode;
  }
  return null;
}

/* 状态条点击 = 用户驱动的阶段跳转（含三条回退路径） */
function ivJumpToStage(target) {
  if (!target) return;
  if (target === currentStage) { ivToast('当前已在「' + (IV_STAGE_LABEL[currentStage] || '') + '」阶段'); return; }
  if (!ivCanGoto(target)) {
    ivToast('不能从「' + (IV_STAGE_LABEL[currentStage] || '') + '」跳到「' + (IV_STAGE_LABEL[target] || '') + '」');
    return;
  }
  var key = currentStage + '->' + target;
  if (key === 'setup->reading') { startInterview(); return; }
  if (key === 'reading->preparing') { finishReading(); return; }
  if (key === 'preparing->reading') { backToReading(); return; }
  if (key === 'preparing->answering') { beginAnswering(); return; }
  if (key === 'answering->preparing') { backToPreparing(); return; }
  if (key === 'answering->submitting') { sendMessage(); return; }
  if (key === 'reviewing->answering') { reanswerCurrent(); return; }
}

function ivBindStageBar() {
  var bar = document.getElementById('stageBar');
  if (!bar || bar.getAttribute('data-bound') === '1') return;
  bar.setAttribute('data-bound', '1');
  bar.addEventListener('click', function (ev) {
    var seg = ivFindSeg(ev.target || ev.srcElement, bar);
    if (seg) ivJumpToStage(seg.getAttribute('data-stage'));
  });
  bar.addEventListener('keydown', function (ev) {
    var k = ev.key || '';
    if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
    var seg = ivFindSeg(ev.target || ev.srcElement, bar);
    if (!seg) return;
    if (ev.preventDefault) ev.preventDefault();
    ivJumpToStage(seg.getAttribute('data-stage'));
  });
}

/* ===================== 阶段动作（每阶段唯一主按钮 / 三条回退） ===================== */

/* reading → preparing（主按钮「开始准备」或读题 1.5s 自动） */
function finishReading() {
  if (currentStage !== 'reading') return;
  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  ivGotoStage('preparing');
  startTimer(currentQ().prep || 15, 'prep');
}

/* 回退 R1 · preparing → reading（不丢任何输入） */
function backToReading() {
  if (currentStage !== 'preparing' && currentStage !== 'answering') return;
  ivGotoStage('reading');
  armReadingAutoAdvance();
  scrollChat();
  ivToast('已回到读题：重新审题后再进入准备');
}

/* 回退 R2 · answering → preparing（输入框内容保留） */
function backToPreparing() {
  if (currentStage !== 'answering') return;
  ivGotoStage('preparing');
  startTimer(currentQ().prep || 15, 'prep');
  ivToast('已回到准备：思路理清后再「开始回答」');
}

/* 回退 R3 · reviewing → answering（出栈本题上一次答案与点评） */
function reanswerCurrent() {
  if (currentStage !== 'reviewing') return;
  if (userResults.length > currentQuestion) userResults.length = currentQuestion;
  if (userAnswers.length > currentQuestion) userAnswers.length = currentQuestion;
  var messages = document.getElementById('chatMessages');
  if (messages) {
    var cards = messages.querySelectorAll('.feedback-card');
    if (cards.length) messages.removeChild(cards[cards.length - 1]);
    var umsgs = messages.querySelectorAll('.message.user');
    if (umsgs.length) messages.removeChild(umsgs[umsgs.length - 1]);
  }
  var input = document.getElementById('inputBox');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
    try { input.focus(); } catch (e) { /* 忽略 */ }
  }
  ivGotoStage('answering');
  startTimer(currentQ().time, 'answer');
  ivToast('已回到回答：可重写本题答案并重新提交');
}

/* 读题自动推进：1.5s 后自动进入准备（保留原节奏，同时给出主按钮） */
function armReadingAutoAdvance() {
  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  readingTimer = setTimeout(function () {
    readingTimer = null;
    if (currentStage === 'reading' && interviewStarted) finishReading();
  }, 1500);
}

/* ===================== 计时 ===================== */
function startTimer(seconds, mode) {
  clearInterval(timerInterval);
  timerInterval = null;
  timeLeft = parseInt(seconds, 10);
  if (!(timeLeft > 0)) timeLeft = 0;
  currentTotal = timeLeft > 0 ? timeLeft : 1;
  timerMode = mode || 'answer';
  updateTimerDisplay();
  timerInterval = setInterval(function () {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      if (timerMode === 'prep') { beginAnswering(); }
      else { autoSubmit(); }
    }
  }, 1000);
}

function updateTimerDisplay() {
  var timerValue = document.getElementById('timerValue');
  var timerFill = document.getElementById('timerFill');
  if (!timerValue || !timerFill) return;
  if (timeLeft < 0) timeLeft = 0;
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
  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  if (pendingFeedbackTimer) { clearTimeout(pendingFeedbackTimer); pendingFeedbackTimer = null; }
  clearInterval(timerInterval);
  timerInterval = null;

  document.getElementById('setupPanel').classList.add('hidden');
  document.getElementById('chatContainer').classList.remove('hidden');
  document.getElementById('evalPanel').classList.add('hidden');
  var tp = document.getElementById('topProgress');
  if (tp) tp.classList.remove('hidden');

  SESSION_QUESTIONS = ivBuildSessionQuestions();

  var messages = document.getElementById('chatMessages');
  var interviewerArea = messages.querySelector('.interviewer-area');
  messages.innerHTML = '';
  if (interviewerArea) messages.appendChild(interviewerArea);

  updateProgress();
  setTimeout(function () { loadQuestion(0); }, 600);
}

function loadQuestion(idx) {
  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  clearInterval(timerInterval);
  timerInterval = null;
  var q = currentQ();
  var tv = document.getElementById('timerValue');
  var tf = document.getElementById('timerFill');
  if (tv) tv.textContent = q.time;
  if (tf) tf.style.width = '100%';
  addQuestionMessage(idx, q.q);
  ivGotoStage('reading');
  updateProgress();
  armReadingAutoAdvance();
}

function beginAnswering() {
  if (currentStage !== 'preparing') return;
  ivGotoStage('answering');
  startTimer(currentQ().time, 'answer');
  var input = document.getElementById('inputBox');
  if (input) { try { input.focus(); } catch (e) { /* 忽略 */ } }
}

/* 「结束回答 / 回车 / 倒计时归零」三条入口统一到 submitAnswer */
function submitAnswer(text, timedOut) {
  if (currentStage !== 'answering') return;
  clearInterval(timerInterval);
  timerInterval = null;
  ivGotoStage('submitting');
  if (text) addUserMessage(text);
  else addUserMessage(timedOut ? '（时间到，未作答）' : '（未作答）');
  userAnswers.push(text);
  var input = document.getElementById('inputBox');
  if (input) { input.value = ''; input.style.height = 'auto'; }
  showTyping();
  pendingFeedbackTimer = setTimeout(function () {
    pendingFeedbackTimer = null;
    hideTyping();
    var fb = generateFeedback(text, currentQ());
    userResults.push(fb);
    renderFeedbackCard(fb);
    ivGotoStage('reviewing');   /* submitting → reviewing：系统自动转移 */
    scrollChat();
  }, 1300);
}

function sendMessage() {
  if (!interviewStarted || currentStage !== 'answering') return;
  var input = document.getElementById('inputBox');
  submitAnswer(input ? input.value.replace(/^\s+|\s+$/g, '') : '', false);
}

function autoSubmit() {
  if (currentStage !== 'answering') return;
  var input = document.getElementById('inputBox');
  var text = input ? input.value.replace(/^\s+|\s+$/g, '') : '';
  submitAnswer(text, text === '');
}

/* 点评阶段唯一主按钮：下一题 / 查看面试结果 */
function nextFromReview() {
  if (!interviewStarted || currentStage !== 'reviewing') return;
  if (currentQuestion >= SESSION_QUESTIONS.length - 1) {
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
  div.id = 'qMsg' + idx;
  var q = currentQ();
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
  if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
}

/* 题目卡内次级按钮：展开 / 收起（页内区块，替代悬浮球与弹窗） */
function toggleQBlock(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) scrollChat();
}

/* ===================== 单题点评（三维评分条 + 文本反馈） ===================== */
function generateFeedback(answer, question) {
  var a = String(answer || '');
  var len = a.length;
  var kws = question.keywords || [];
  var matched = [];
  var missing = [];
  var i;
  for (i = 0; i < kws.length; i++) {
    if (a.indexOf(kws[i]) >= 0) matched.push(kws[i]);
    else missing.push(kws[i]);
  }
  var structWords = ['第一', '第二', '第三', '首先', '其次', '再次', '最后', '总之', '背景', '行动', '结果'];
  var hasStruct = false;
  for (i = 0; i < structWords.length; i++) { if (a.indexOf(structWords[i]) >= 0) { hasStruct = true; break; } }
  var exampleWords = ['例如', '比如', '曾经', '一次', '项目', '实习', '案例', '举例'];
  var hasExample = false;
  for (i = 0; i < exampleWords.length; i++) { if (a.indexOf(exampleWords[i]) >= 0) { hasExample = true; break; } }

  var empty = len === 0;
  var expr = empty ? 12 : (len >= 120 ? 88 : len >= 80 ? 78 : len >= 50 ? 66 : len >= 25 ? 52 : 34);
  if (hasStruct && !empty) expr = Math.min(96, expr + 8);
  var depth = empty ? 10 : Math.min(96, (len >= 150 ? 85 : len >= 90 ? 74 : len >= 50 ? 60 : len >= 25 ? 46 : 30) + (hasExample ? 8 : 0) + Math.min(8, matched.length * 2));
  /* 自选题目无内置关键词 → 关键词覆盖维度退化为「篇幅 + 事例」，避免除零得 NaN */
  var kwRatio = kws.length ? (matched.length / kws.length) : 0;
  var match = empty ? 12 : Math.min(96, Math.round(kwRatio * 62) + (len >= 40 ? 16 : 6) + (hasExample ? 10 : 4) + 8);

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
    else if (kws.length) bad.push('几乎没有触及本题关键要点，可围绕：' + kws.slice(0, 3).join('、'));
    else bad.push('本题为自选题目，无内置要点清单；建议补一句落点，把经历挂到岗位要求上');
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
  var isLast = currentQuestion >= SESSION_QUESTIONS.length - 1;

  function bar(label, v) {
    return '<div class="fb-bar-row"><span class="fb-bar-label">' + label + '</span>'
      + '<span class="fb-bar-track"><span class="fb-bar-fill" style="width:' + v + '%"></span></span>'
      + '<span class="fb-bar-val">' + v + '</span></div>';
  }
  function lis(arr) {
    var s2 = '';
    for (var i = 0; i < arr.length; i++) s2 += '<li>' + arr[i] + '</li>';
    return s2;
  }

  div.innerHTML =
    '<div class="fb-title">' + ico('chart-bar', 16) + '<span>本题点评 · 第 ' + (currentQuestion + 1) + ' 题</span></div>'
    + '<div class="fb-bars">'
    + bar('表达逻辑', fb.expr)
    + bar('内容深度', fb.depth)
    + bar('岗位匹配度', fb.match)
    + '</div>'
    + '<div class="fb-sec"><div class="fb-sec-t good">' + ico('check-circle', 15) + '做得好的</div><ul>' + lis(fb.good) + '</ul></div>'
    + '<div class="fb-sec"><div class="fb-sec-t bad">' + ico('info', 15) + '待改进</div><ul>' + lis(fb.bad) + '</ul></div>'
    + '<div class="fb-sec"><div class="fb-sec-t">' + ico('zap', 15) + '改进建议</div><p>' + fb.advice + '</p></div>'
    + '<div class="fb-sec"><div class="fb-sec-t">' + ico('book-open', 15) + '参考回答</div><p>' + fb.demo + '</p></div>'
    + '<div class="answer-aux">'
    + '<button class="q-sub-btn" type="button" onclick="reanswerCurrent()">' + ico('rotate-ccw', 14) + '重答本题</button>'
    + '</div>'
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

/* ===================== 面试评定报告（终态 eval） ===================== */
function showEvaluation() {
  ivGotoStage(IV_TERMINAL);
  document.getElementById('chatContainer').classList.add('hidden');
  document.getElementById('evalPanel').classList.remove('hidden');

  var n = userResults.length || 1;
  var sumE = 0, sumD = 0, sumM = 0, i;
  for (i = 0; i < userResults.length; i++) {
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
  for (i = 0; i < userAnswers.length; i++) totalLength += String(userAnswers[i] || '').length;
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

/* 回到 setup（六阶段起点）；保留旧函数名 */
function restartInterview() {
  document.getElementById('evalPanel').classList.add('hidden');
  document.getElementById('setupPanel').classList.remove('hidden');
  var tp = document.getElementById('topProgress');
  if (tp) tp.classList.add('hidden');

  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  if (pendingFeedbackTimer) { clearTimeout(pendingFeedbackTimer); pendingFeedbackTimer = null; }
  clearInterval(timerInterval);
  timerInterval = null;
  interviewStarted = false;
  currentQuestion = 0;
  userAnswers = [];
  userResults = [];

  hideTyping();
  var messages = document.getElementById('chatMessages');
  if (messages) {
    var leftovers = messages.querySelectorAll('.feedback-card, .message.user');
    var k;
    for (k = 0; k < leftovers.length; k++) {
      if (leftovers[k].parentNode) leftovers[k].parentNode.removeChild(leftovers[k]);
    }
  }
  var input = document.getElementById('inputBox');
  if (input) { input.value = ''; input.style.height = 'auto'; }
  var tv = document.getElementById('timerValue');
  var tf = document.getElementById('timerFill');
  if (tv) tv.textContent = '—';
  if (tf) tf.style.width = '0%';

  ivGotoStage('setup');
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

/* ===================== 轻提示（全站禁原生 alert/confirm/prompt） ===================== */
function ivToast(msg, state) {
  var s2 = state || 'info';
  try {
    if (typeof window.xtToast === 'function') { window.xtToast(s2, msg); return; }
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
  } catch (e) { /* 继续本地兜底 */ }
  var el = document.getElementById('ivToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ivToast';
    el.className = 'iv-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg == null ? '' : String(msg);
  el.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('on'); }, 1800);
}

/* ===================== 与「面试准备」（assets/iv-prep.js）的交接载荷 ===================== */

/* 解析 ?q=（面试准备页的「去 AI 模拟面试练这道题」会带上题干）；
   手写解析，不用 URLSearchParams，兼容老内核 */
function ivReadQuery() {
  var out = { q: '' };
  try {
    var qs = String(window.location.search || '');
    if (qs.charAt(0) === '?') qs = qs.substring(1);
    if (!qs) return out;
    var parts = qs.split('&');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var kv = parts[i].split('=');
      var k = decodeURIComponent(kv[0] || '');
      if (k !== 'q') continue;
      var v = kv.length > 1 ? kv.slice(1).join('=') : '';
      out.q = decodeURIComponent(v.replace(/\+/g, ' '));
    }
  } catch (e) { /* 非法 query 一律忽略 */ }
  return out;
}

/* 本次面试题目 = 内置 5 题；若带 ?q= 则把自选题目前置为第 1 题 */
function ivBuildSessionQuestions() {
  var list = [];
  var i;
  for (i = 0; i < INTERVIEW_QUESTIONS.length; i++) list.push(INTERVIEW_QUESTIONS[i]);
  if (PENDING_PREP_Q) {
    list.unshift({
      q: PENDING_PREP_Q,
      keywords: [],
      tip: '这道题来自「面试准备」页。作答要点：先明确问题在问什么 → 用 STAR（背景-任务-行动-结果）组织 → 最后落到岗位匹配度上。',
      demo: '（本题为你在「面试准备」中自选的题目，暂无内置参考回答。建议先用「第一/其次/最后」分点作答，再对照本题的答题提示自查。）',
      time: 90,
      prep: 20,
      fromPrep: true
    });
  }
  return list;
}

/* 对外共享状态机词汇（供 iv-prep.js 等同域脚本复用；已存在则不覆盖） */
function ivExportStages() {
  if (typeof window.IV_STAGES === 'undefined') window.IV_STAGES = IV_STAGES.slice(0);
  if (typeof window.IV_BAR_STAGES === 'undefined') window.IV_BAR_STAGES = IV_BAR_STAGES.slice(0);
  if (typeof window.IV_STAGE_LABEL === 'undefined') window.IV_STAGE_LABEL = IV_STAGE_LABEL;
  if (typeof window.IV_TRANSITIONS === 'undefined') window.IV_TRANSITIONS = IV_TRANSITIONS;
  if (typeof window.IV_TERMINAL === 'undefined') window.IV_TERMINAL = IV_TERMINAL;
}

/* ===================== 初始化 ===================== */
function ivInit() {
  ivBindStageBar();
  var qs = ivReadQuery();
  PENDING_PREP_Q = qs.q || '';
  SESSION_QUESTIONS = ivBuildSessionQuestions();
  ivExportStages();

  if (PENDING_PREP_Q) {
    var desc = document.querySelector('#setupPanel .setup-desc');
    if (desc) desc.innerHTML = '来自「面试准备」的自选题目已作为第 1 题加入本次面试。' + desc.innerHTML;
  }

  var avatar = document.getElementById('aiAvatar');
  if (avatar) avatar.innerHTML = owlSvg(40);

  ivGotoStage('setup');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ivInit);
else ivInit();
"""

start = s.index('/* ===================== 顶部进度 ===================== */')
end = s.index('})();\n</script>', start) + len('})();')
s = s[:start] + BLOCK_NEW + s[end:]
N += 1

out = b'\xef\xbb\xbf' + s.replace('\n', '\r\n').encode('utf-8')
open(P, 'wb').write(out)
print('EDITS=%d  written=%d bytes' % (N, len(out)))
