# -*- coding: utf-8 -*-
"""为 app.js 增加「AI 伙伴（多角色模式）」：参考用户截图（换个伙伴/小兔·温柔治愈型）
1. AI_PARTNERS 角色配置（5 个角色，各含人设 systemPrompt / 问候语 / 演示风格 / 主题色）
2. getAiPartner / setAiPartner / getAiChatKey（按角色分区聊天历史，兼容旧 key）
3. buildAiContextMessages() 注入 system prompt（provider直连/后端中转/多人后端 三通道都生效）
4. toggleAiPanel 欢迎语按角色；createStreamingBubble / renderAiMessages 头像用角色 emoji
5. localAiReply 按角色风格兜底
6. 伙伴条 + 角色选择弹窗（ensureAiPartnerUI 动态注入，不改 19 个 HTML）
"""
import io

path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ---------- 1) AI_CHAT_KEY 处插入角色配置与核心函数 ----------
old1 = """// 聊天历史独立保存在 localStorage（key: study_workbench_ai_chat）
const AI_CHAT_KEY = 'study_workbench_ai_chat';
let aiChatHistory = [];
let aiStreaming = false; // 是否正在流式输出，防止重复发送
"""
new1 = """// 聊天历史独立保存在 localStorage（key: study_workbench_ai_chat_<伙伴id>；旧版全局 key 首次兼容导入）
const AI_CHAT_KEY = 'study_workbench_ai_chat';
let aiChatHistory = [];
let aiStreaming = false; // 是否正在流式输出，防止重复发送

/* ========== AI 伙伴（多角色模式）：像"换个伙伴"一样切换不同人设的 AI ========== */
const AI_PARTNER_KEY = 'study_workbench_ai_partner';
// 预置伙伴：人设（systemPrompt 注入大模型）+ 问候语 + 本地演示兜底风格 + 主题色
const AI_PARTNERS = [
  { id: 'xiaotu', name: '小兔', emoji: '🐰', tag: '温柔治愈型', color: '#F06A9A', bg: '#FFF0F5',
    desc: '像朋友一样倾听，温柔鼓励，适合学累了想被安慰的时候',
    systemPrompt: '你叫小兔，是一位温柔治愈、善解人意的聊天伙伴。用温暖亲切的语气和用户聊天，像知心朋友一样倾听和回应。多用轻柔的问候和鼓励（如"慢慢来""你已经很棒了"），适当使用 emoji 和波浪线传递温度。如果用户提到学习压力或情绪困扰，先共情安抚，再给一两个轻松可行的小建议，不要长篇大论讲道理。',
    greeting: '嗨~我是小兔，今天想聊点什么呀？不用紧张，慢慢说就好 🐰💕',
    demoStyle: function (text) { return '嗯嗯，我在认真听呢～关于「' + text.slice(0, 30) + '」，你是怎么想的呀？无论你怎么选，我都支持你 🐰\\n\\n（当前是本地演示模式，接入真实 AI 后我能陪你聊得更深入哦）'; } },
  { id: 'coach', name: '学霸教练', emoji: '🦉', tag: '高效规划型', color: '#5B8DEF', bg: '#EEF4FF',
    desc: '备考规划专家，帮你拆目标、定计划、查漏补缺',
    systemPrompt: '你叫学霸教练，是一位经验丰富的备考规划导师，擅长四级、行测、央国企笔试、面试等考试辅导。回答要结构化：先给结论或建议，再分要点展开，必要时给出具体可执行的时间安排。语气专业但亲切，结尾常给一句鼓励。不要空泛，要具体到每天做什么。',
    greeting: '我是学霸教练🦉 今天想攻哪一科？报上你的目标，我给你拆一份学习计划。',
    demoStyle: function (text) { return '收到，关于「' + text.slice(0, 30) + '」，我的建议是：① 先明确目标；② 拆成每天 30 分钟的小任务；③ 每周日复盘一次。\\n\\n（当前是本地演示模式，接入真实 AI 后我可以按你的具体基础给一份完整计划 📋）'; } },
  { id: 'mentor', name: '智多星', emoji: '🧠', tag: '思维导师型', color: '#9B6BF3', bg: '#F5F0FF',
    desc: '帮你把问题想深一层，结构化分析、找本质',
    systemPrompt: '你叫智多星，是一位思维严谨的导师。回答注重逻辑：先界定问题，再分析原因或利弊，最后给结论和行动建议。擅长用"是什么-为什么-怎么办"的结构。必要时可反问用户一两个问题帮助澄清。语气沉稳、有启发性。',
    greeting: '我是智多星🧠 遇到什么问题了？说来听听，我陪你一起把它想透。',
    demoStyle: function (text) { return '关于「' + text.slice(0, 30) + '」，我们拆三层看：① 现状是什么；② 卡点在哪；③ 最小下一步能做什么。\\n\\n（当前是本地演示模式，接入真实 AI 后我可以带你做更深的推演 🔍）'; } },
  { id: 'interviewer', name: '面试官', emoji: '🎯', tag: '模拟面试型', color: '#2FBF8F', bg: '#EAF9F3',
    desc: '模拟真实面试场景，犀利提问 + 逐题点评',
    systemPrompt: '你叫面试官，是一位严格但专业的模拟面试官。当用户求职面试时：先出一个真实的面试问题，用户回答后给出点评（优点+改进点）和参考回答要点。语气职业、直接，不过度夸奖，可以追问细节。若用户问的不是面试问题，也尽量联系到求职或职场场景回答。',
    greeting: '我是面试官🎯 准备好了吗？先来个经典开场：请做一段 1 分钟的自我介绍。',
    demoStyle: function (text) { return '好的，假设这是面试现场：关于「' + text.slice(0, 30) + '」，请再说具体一点？我会从逻辑、量化成果、匹配度三个维度给你点评 🎯\\n\\n（当前是本地演示模式，接入真实 AI 后模拟会更逼真）'; } },
  { id: 'buddy', name: '老铁', emoji: '😎', tag: '直爽激励型', color: '#F08A24', bg: '#FFF4E8',
    desc: '不跟你客气，直接打鸡血，犯懒的时候找他最管用',
    systemPrompt: '你叫老铁，是用户身边最直爽的铁哥们儿。语气豪爽、接地气，说话带点东北老铁的味道（但别过头），喜欢用短句和感叹号。见不得用户拖延犯懒，会直接戳破并打鸡血。该夸的时候使劲夸，该提醒的时候也不含糊。最后总要推着用户去行动。',
    greeting: '嘿老铁😎 又见面了！今天学得咋样？别整虚的，有啥问题直接说。',
    demoStyle: function (text) { return '老铁，关于「' + text.slice(0, 30) + '」这事——干就完了！先做 10 分钟，做不动了你再来找我，我陪你唠 😎\\n\\n（当前是本地演示模式，接入真实 AI 后我随叫随到）'; } },
];
function getAiPartnerId() {
  try { return localStorage.getItem(AI_PARTNER_KEY) || AI_PARTNERS[0].id; } catch (e) { return AI_PARTNERS[0].id; }
}
function getAiPartner() {
  const id = getAiPartnerId();
  return AI_PARTNERS.find(p => p.id === id) || AI_PARTNERS[0];
}
function setAiPartner(id) { try { localStorage.setItem(AI_PARTNER_KEY, id); } catch (e) {} }
function getAiChatKey() { return 'study_workbench_ai_chat_' + getAiPartnerId(); }
// 切换伙伴：读取该伙伴的历史（无历史则空）
function switchAiHistory() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(getAiChatKey())) || []; } catch (e) { h = []; }
  aiChatHistory = h;
}
// 更新伙伴条 / 头像 / 标题
function renderAiPartnerBar() {
  const p = getAiPartner();
  const em = document.getElementById('aiPartnerEmoji'); if (em) em.textContent = p.emoji;
  const nm = document.getElementById('aiPartnerName'); if (nm) nm.textContent = p.name;
  const tg = document.getElementById('aiPartnerTag');
  if (tg) { tg.textContent = p.tag; tg.style.background = p.bg; tg.style.color = p.color; }
  const av = document.querySelector('#aiPanel .ai-avatar'); if (av) av.textContent = p.emoji;
  const t = document.querySelector('#aiPanel .ai-title'); if (t) t.textContent = 'AI伙伴 · ' + p.name;
}
// 动态注入伙伴条 + 角色选择弹窗（不改 HTML，所有页面加载即生效）
function ensureAiPartnerUI() {
  const panel = document.getElementById('aiPanel');
  if (!panel || document.getElementById('aiPartnerBar')) return;
  const header = panel.querySelector('.ai-panel-header');
  if (!header) return;
  const p = getAiPartner();
  const bar = document.createElement('div');
  bar.id = 'aiPartnerBar';
  bar.className = 'ai-partner-bar';
  bar.innerHTML = '<div class="ai-partner-chip" onclick="openAiPartnerPicker()" title="切换AI伙伴">' +
    '<span class="ai-partner-emoji" id="aiPartnerEmoji">' + p.emoji + '</span>' +
    '<span class="ai-partner-name" id="aiPartnerName">' + p.name + '</span>' +
    '<span class="ai-partner-tag" id="aiPartnerTag" style="background:' + p.bg + ';color:' + p.color + '">' + p.tag + '</span>' +
    '<span class="ai-partner-switch">🔀 换个伙伴</span></div>';
  panel.insertBefore(bar, header);
  const picker = document.createElement('div');
  picker.id = 'aiPartnerPicker';
  picker.className = 'ai-partner-picker';
  picker.innerHTML = '<div class="ai-partner-picker-mask" onclick="closeAiPartnerPicker()"></div>' +
    '<div class="ai-partner-picker-box">' +
      '<div class="ai-partner-picker-head"><div class="ai-partner-picker-title">👋 换个伙伴</div><div class="ai-close" onclick="closeAiPartnerPicker()">✕</div></div>' +
      '<div class="ai-partner-list" id="aiPartnerList"></div>' +
    '</div>';
  document.body.appendChild(picker);
  renderAiPartnerList();
  renderAiPartnerBar();
}
function renderAiPartnerList() {
  const list = document.getElementById('aiPartnerList');
  if (!list) return;
  const cur = getAiPartnerId();
  list.innerHTML = AI_PARTNERS.map(p => {
    const active = p.id === cur;
    return '<div class="ai-partner-card' + (active ? ' active' : '') + '" style="--pc:' + p.color + ';--pbg:' + p.bg + '" onclick="selectAiPartner(\\'' + p.id + '\\')">' +
      '<div class="ai-partner-card-emoji" style="background:' + p.bg + '">' + p.emoji + '</div>' +
      '<div class="ai-partner-card-info">' +
        '<div class="ai-partner-card-name">' + p.name + '<span class="ai-partner-card-tag" style="background:' + p.bg + ';color:' + p.color + '">' + p.tag + '</span></div>' +
        '<div class="ai-partner-card-desc">' + p.desc + '</div>' +
      '</div>' +
      (active ? '<div class="ai-partner-card-check" style="color:' + p.color + '">✓ 使用中</div>' : '<div class="ai-partner-card-use" style="color:' + p.color + '">使用</div>') +
      '</div>';
  }).join('');
}
function openAiPartnerPicker() {
  const picker = document.getElementById('aiPartnerPicker');
  if (!picker) return;
  renderAiPartnerList();
  picker.classList.add('open');
}
function closeAiPartnerPicker() {
  const picker = document.getElementById('aiPartnerPicker');
  if (picker) picker.classList.remove('open');
}
function selectAiPartner(id) {
  if (!AI_PARTNERS.some(p => p.id === id)) return;
  if (id === getAiPartnerId()) { closeAiPartnerPicker(); return; }
  setAiPartner(id);
  switchAiHistory();
  renderAiPartnerBar();
  renderAiMessages();
  closeAiPartnerPicker();
  const p = getAiPartner();
  showToast('已切换为 ' + p.name + ' ' + p.emoji + ' · ' + p.tag);
  if (aiChatHistory.length === 0) pushAiMsg('ai', p.greeting);
}
"""
assert old1 in src, 'block1 (AI_CHAT_KEY) not found'
src = src.replace(old1, new1, 1)

# ---------- 2) buildAiContextMessages 注入 system prompt ----------
old2 = """function buildAiContextMessages() {
  const hist = aiChatHistory.slice(-14); // 最近14条，防 token 超限
  return hist.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}"""
new2 = """function buildAiContextMessages() {
  // 先注入当前伙伴的人设（system），再带最近14条上下文（provider直连/后端中转/多人后端 三通道都透传 system）
  const msgs = [{ role: 'system', content: getAiPartner().systemPrompt }];
  const hist = aiChatHistory.slice(-14); // 最近14条，防 token 超限
  hist.forEach(m => msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  return msgs;
}"""
assert old2 in src, 'block2 (buildAiContextMessages) not found'
src = src.replace(old2, new2, 1)

# ---------- 3) toggleAiPanel 欢迎语按角色 ----------
old3 = """    if (aiChatHistory.length === 0) {
      // 首次打开给一条欢迎语
      pushAiMsg('ai', '你好呀👋 我是你的AI学习助手！\\n\\n现在的我是「本地演示模式」——不联网、不需要API密钥，用内置规则回答学习问题。\\n\\n等你按 ai-server 文件夹里的说明启动后端后，我就能接入真实大模型、流式输出回答啦。\\n\\n试试问我：「四级怎么复习」「行测资料分析怎么做」');
    } else {
      renderAiMessages();
    }"""
new3 = """    if (aiChatHistory.length === 0) {
      // 首次打开：按当前伙伴的问候语欢迎
      const _m0 = currentAiMode();
      const _modeTxt = _m0.mode === 'provider' ? '服务商直连' : (_m0.mode === 'backend' ? '后端在线' : '本地演示');
      pushAiMsg('ai', getAiPartner().greeting + '\\n\\n（当前为「' + _modeTxt + '」模式，试试问我：「四级怎么复习」「行测资料分析怎么做」）');
    } else {
      renderAiMessages();
    }"""
assert old3 in src, 'block3 (toggleAiPanel greeting) not found'
src = src.replace(old3, new3, 1)

# ---------- 4) clearAiChat 使用按角色的 key ----------
old4 = """  aiChatHistory = [];
  localStorage.removeItem(AI_CHAT_KEY);
  renderAiMessages();
  showToast('🧹 聊天记录已清空');"""
new4 = """  aiChatHistory = [];
  localStorage.removeItem(getAiChatKey());
  renderAiMessages();
  showToast('🧹 聊天记录已清空');"""
assert old4 in src, 'block4 (clearAiChat) not found'
src = src.replace(old4, new4, 1)

# ---------- 5) localAiReply 按角色风格 ----------
old5 = """function localAiReply(text) {
  // 关键词匹配（命中多个关键词的规则优先）
  let best = null, bestScore = 0;
  aiLocalRules.forEach(r => {
    const score = r.kw.filter(k => text.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = r; }
  });
  const reply = best ? best.reply : '这个问题我在演示模式下还答不好😅（本地规则引擎知识有限）\\n\\n你可以问我：四级复习 / 行测怎么准备 / 面试自我介绍 / PPT技巧 / 学习计划…\\n\\n或者按 ai-server 的说明接入真实AI，我就能回答任何问题啦。';
  // 打字机效果输出
  const bubble = createStreamingBubble();
  typewriterIntoBubble(bubble, reply, () => finishStreaming('ai', reply));
}"""
new5 = """function localAiReply(text) {
  // 关键词匹配（命中多个关键词的规则优先）
  let best = null, bestScore = 0;
  aiLocalRules.forEach(r => {
    const score = r.kw.filter(k => text.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = r; }
  });
  const p = getAiPartner();
  let reply;
  if (best) {
    // 学习类问题：按当前伙伴口吻包装规则回复
    reply = p.name + ' ' + p.emoji + '：\\n' + best.reply;
  } else if (p.demoStyle && typeof p.demoStyle === 'function') {
    reply = p.demoStyle(text);
  } else {
    reply = '这个问题我在演示模式下还答不好😅（本地规则引擎知识有限）\\n\\n你可以问我：四级复习 / 行测怎么准备 / 面试自我介绍 / PPT技巧 / 学习计划…\\n\\n或者按 ai-server 的说明接入真实AI，我就能回答任何问题啦。';
  }
  // 打字机效果输出
  const bubble = createStreamingBubble();
  typewriterIntoBubble(bubble, reply, () => finishStreaming('ai', reply));
}"""
assert old5 in src, 'block5 (localAiReply) not found'
src = src.replace(old5, new5, 1)

# ---------- 6) createStreamingBubble 头像用角色 emoji ----------
old6 = """  msg.innerHTML = '<div class="ai-msg-avatar">🤖</div><div class="ai-msg-bubble typing"></div>';"""
new6 = """  msg.innerHTML = '<div class="ai-msg-avatar">' + getAiPartner().emoji + '</div><div class="ai-msg-bubble typing"></div>';"""
assert old6 in src, 'block6 (createStreamingBubble) not found'
src = src.replace(old6, new6, 1)

# ---------- 7) renderAiMessages 头像用角色 emoji ----------
old7 = """    div.innerHTML = '<div class="ai-msg-avatar">' + (m.role === 'user' ? '🙋' : '🤖') + '</div><div class="ai-msg-bubble"></div>';"""
new7 = """    div.innerHTML = '<div class="ai-msg-avatar">' + (m.role === 'user' ? '🙋' : getAiPartner().emoji) + '</div><div class="ai-msg-bubble"></div>';"""
assert old7 in src, 'block7 (renderAiMessages) not found'
src = src.replace(old7, new7, 1)

# ---------- 8) pushAiMsg 使用按角色的 key ----------
old8 = """  localStorage.setItem(AI_CHAT_KEY, JSON.stringify(aiChatHistory));"""
new8 = """  localStorage.setItem(getAiChatKey(), JSON.stringify(aiChatHistory));"""
assert old8 in src, 'block8 (pushAiMsg) not found'
src = src.replace(old8, new8, 1)

# ---------- 9) 启动读取：按角色 key + 旧 key 兼容导入 + 初始化伙伴 UI ----------
old9 = """// 启动时读取历史
try { aiChatHistory = JSON.parse(localStorage.getItem(AI_CHAT_KEY)) || []; } catch (e) { aiChatHistory = []; }"""
new9 = """// 启动时读取当前伙伴的历史；无历史时兼容导入旧版全局历史
try {
  aiChatHistory = JSON.parse(localStorage.getItem(getAiChatKey())) || [];
  if (!aiChatHistory.length) { aiChatHistory = JSON.parse(localStorage.getItem('study_workbench_ai_chat')) || []; }
} catch (e) { aiChatHistory = []; }
// 注入 AI 伙伴条 + 角色选择弹窗（所有页面通用，幂等）
try { ensureAiPartnerUI(); } catch (e) {}"""
assert old9 in src, 'block9 (startup read) not found'
src = src.replace(old9, new9, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: app.js patched, new size =', len(src))
