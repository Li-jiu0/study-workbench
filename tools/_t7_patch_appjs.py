# -*- coding: utf-8 -*-
"""任务七：app.js 改造（首页 AI 小助手重构 + 关于独立页跳转）
严格保持 CRLF 换行；全部用「唯一锚点文本」定位行区间，从下往上应用，避免行号漂移。
"""
import io, os

ROOT = r"D:\下载的文件\学习工作台"
APP = os.path.join(ROOT, "assets", "app.js")

with io.open(APP, "r", encoding="utf-8", newline="") as f:
    text = f.read()

CRLF = "\r\n"
LF_ONLY = text.count("\n") - text.count(CRLF)
lines = text.split(CRLF)
N = len(lines)
print("lines=%d  lf_only=%d" % (N, LF_ONLY))

OPS = []


def find1(sub, frm=0):
    """返回 0-based 行号：全文中唯一包含 sub 的行"""
    hits = [i for i in range(frm, N) if sub in lines[i]]
    if len(hits) != 1:
        raise SystemExit("find1 %r -> %d hits %s" % (sub, len(hits), hits[:6]))
    return hits[0]


def findN(sub, frm=0):
    """返回 0-based 行号：frm 之后第一处包含 sub 的行"""
    for i in range(frm, N):
        if sub in lines[i]:
            return i
    raise SystemExit("findN %r not found from %d" % (sub, frm))


def rfindN(sub, before):
    """返回 0-based 行号：before 之前最后一处包含 sub 的行"""
    for i in range(before, -1, -1):
        if sub in lines[i]:
            return i
    raise SystemExit("rfindN %r not found before %d" % (sub, before))


def add(a, b, new_lines):
    """a,b 为 0-based 闭区间"""
    if b < a:
        raise SystemExit("bad range %d..%d" % (a, b))
    OPS.append((a, b, new_lines))


# ============================================================ R16 AI_PARTNERS
s = find1("// 预置伙伴（2026-09-16 精简为 2 个")
e = findN("];", s)
NEW_PARTNERS = [
"// 预置伙伴（2026-09-16 重构为 2 个：小助手 / 暖心学伴；数组第一项为默认选中）",
"// 人设（systemPrompt 注入大模型）+ 问候语 + 本地兜底风格（demoStyle）+ 主题色 + 线性图标名",
"// 图标走站内 icon-map.js（lucide 线性图标），与 AI 页 sparkles 风格统一；emoji 仅作无图标时的文本兜底。",
"// 旧 id 兼容：老用户 localStorage 里存的是 'gongkao'（原公考导师）及更早的 xiaotu/coach/mentor 等，",
"// 不做映射会让老用户读到未知 id 而取不到人设、历史也读不出来，见 normalizeAiPartnerId() / migrateAiPartnerId()。",
"const AI_PARTNER_ID_ALIAS = {",
"  gongkao: 'assistant', xiaotu: 'assistant', coach: 'assistant',",
"  mentor: 'assistant', interviewer: 'assistant', buddy: 'warm'",
"};",
"const AI_PARTNERS = [",
"  { id: 'assistant', name: '小助手', icon: 'sparkles', emoji: '✨', tag: '全能学习助手', color: '#2F6BFF', bg: '#EDF3FF',",
"    desc: '覆盖行测、申论、四级、面试、PPT、备考规划等全站学习问题，先给结论、条理清晰、能直接照着做',",
"    systemPrompt: '你叫小助手，是星途学习平台里的通用学习助手，覆盖全站各模块：英语四六级（词汇、听力、阅读、写作翻译）、行测（言语、判断、资料分析、数量关系、常识）、申论、面试与求职、PPT 与汇报表达、商务礼仪、备考规划与效率方法。回答规则：① 先给结论或判断，再分要点展开，要点用「1. 2. 3.」或「第一/第二/第三」编号；② 每个要点必须给具体可执行的动作（做什么、做多久、用什么资料、怎么检验），禁止空泛的“多练习多总结”；③ 涉及解题要给出可复用的方法、公式或答题框架，并点出常见易错点；④ 涉及规划要按阶段给出每天或每周的量化安排，并说明如何复盘调整；⑤ 语言简洁务实、条理清晰，不空话不堆砌，不用感叹号堆情绪；⑥ 信息不足时先给出通用框架，并在结尾用一句话问清关键变量（目标、剩余天数、当前水平、每天可学时长）。',",
"    greeting: '我是小助手 ✨\\n行测、申论、四级、面试、PPT、备考规划都可以问我。\\n先给我一个场景，我直接给你能照着做的步骤。',",
"    demoStyle: function (text) { return '【结论】关于「' + text.slice(0, 30) + '」，先抓高频考点，再补方法，最后限时练。\\n\\n【要点】\\n1. 先定位：明确它属于哪个模块、考频多高、你目前正确率多少。\\n2. 再补方法：记一个可复用的解题框架或答题结构，不要靠感觉做。\\n3. 限时训练：按考试节奏掐表做，做完逐题复盘错因。\\n4. 复盘节奏：每天 20 分钟错题复盘，每周一次整套模考。\\n\\n【下一步】告诉我你的目标、剩余天数和每天可学时长，我给你排一份到天的计划。\\n\\n（当前 AI 未连接，以上是本地参考答案，联网后我会按你的基础展开）'; } },",
"  { id: 'warm', name: '暖心学伴', icon: 'sprout', emoji: '🌱', tag: '陪伴打气', color: '#12B886', bg: '#E8F8F2',",
"    desc: '备考路上陪着你，帮你拆任务、缓情绪、慢慢往前走',",
"    systemPrompt: '你叫暖心学伴，是陪在用户身边的备考搭子。说话亲切自然，多用短句，像朋友聊天，不用官话套话。回答规则：① 先共情，先接住用户的情绪或处境（“确实挺累的”“这题卡住很正常”），再给建议；② 一次只给一两个小建议，不要长篇大论，不要列一堆要点；③ 帮用户把任务拆小，拆到“现在就能开始做”的程度，并给一个具体的开始动作；④ 用户焦虑、摆烂、想放弃时，先稳住情绪，肯定已经做到的事，再给一个最小下一步，绝不施压、不说教、不比较别人；⑤ 可以适度用 emoji 和语气词，但不要过度；⑥ 结尾常留一句温暖的追问或鼓励，让用户愿意继续说下去。',",
"    greeting: '嗨，我是暖心学伴 🌱\\n学累了还是卡住了？都可以跟我说。\\n不着急，我们一点点来，先做一小步就好。',",
"    demoStyle: function (text) { return '嗯，我懂你说的这种感觉 🌱 关于「' + text.slice(0, 30) + '」，卡住真的挺正常的，别急着否定自己。\\n\\n要不我们先做一件最小的事：就花 10 分钟，把这一块里你最不熟的一个点挑出来看一看。做完就停也行，做了就算赢。\\n\\n你今天状态怎么样？是想先缓缓，还是现在就开这一小步？\\n\\n（当前 AI 未连接，以上是本地参考答案，联网后我能陪你聊得更细）'; } },",
"];",
]
add(s, e, NEW_PARTNERS)

# ============================================================ R15 快捷功能
s = find1("// 打开AI快捷功能面板")
e = findN("showToast(`${action.emoji}", s) + 1
NEW_QUICK = [
"// 打开AI快捷功能面板：不再重复造一条 bar，统一复用 ensureAiQuickBar() 注入的 #aiQuickBar",
"function openAiQuickActions() {",
"  const panel = document.getElementById('aiPanel');",
"  if (!panel) return;",
"  if (!panel.classList.contains('open')) toggleAiPanel();",
"  ensureAiCardCss();",
"  ensureAiQuickBar();",
"  const bar = document.getElementById('aiQuickBar');",
"  if (bar && bar.scrollIntoView) { try { bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (eSv) { /* 老内核忽略 */ } }",
"  showToast('⚡ 选一个快捷功能，补充具体内容后发送');",
"}",
"",
"// 使用AI快捷功能",
"function useAiQuickAction(id) {",
"  const action = AI_QUICK_ACTIONS.find(a => a.id === id);",
"  if (!action) return;",
"",
"  // 把prompt放到输入框里，让用户补充具体内容（发送时走真实 AI）",
"  const input = document.getElementById('aiInput');",
"  if (input) {",
"    input.value = action.prompt;",
"    input.focus();",
"    // 滚动到输入框",
"    if (input.scrollIntoView) { try { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (eSv2) { /* 老内核忽略 */ } }",
"  }",
"",
"  showToast(`${action.emoji} ${action.name}：请补充具体内容后发送`);",
"}",
]
add(s, e, NEW_QUICK)

# ============================================================ R14 共享口径 + 伙伴 id
s = find1("function getAiPartnerId() {")
e = findN("function getAiChatKey() {", s)
NEW_ID = [
"/* ---------- 与 AI.html（assets/ai-page.js）共用的存储口径 ----------",
"   模型选择：'ai_selected_model'（与 ai-page.js 同一把 key，首页切换后进 AI.html 状态一致）",
"   对话历史：'ai_chat_history'（ai-page.js 的会话列表），首页小助手以固定会话 id",
"            'xt_home_<伙伴id>' 读写，做到「同一套历史」而不是两套割裂的 AI。",
"   角色    ：AI.html 没有伙伴概念（只有 preset chips），因此角色以首页 AI_PARTNERS 为准，",
"            AI.html 侧只需能读到同一份历史与模型。 */",
"var XT_AI_MODEL_KEY = 'ai_selected_model';",
"var XT_AI_HISTORY_KEY = 'ai_chat_history';",
"function xtHomeChatId() { return 'xt_home_' + getAiPartnerId(); }",
"",
"/** 当前选中的模型 id（'auto' = 自动），首页与 AI.html 共用同一把 key */",
"function getSharedAiModelId() {",
"  try { return localStorage.getItem(XT_AI_MODEL_KEY) || 'auto'; } catch (e) { return 'auto'; }",
"}",
"/** 写入共享模型 id */",
"function setSharedAiModelId(id) {",
"  try { localStorage.setItem(XT_AI_MODEL_KEY, String(id == null ? 'auto' : id)); } catch (e) { /* 忽略 */ }",
"}",
"/** 内置模型列表（来自 assets/ai-config.js 的 window.AI_CONFIG，缺失时返回空数组） */",
"function xtAiBuiltinModels() {",
"  var cfg = (typeof window !== 'undefined') ? window.AI_CONFIG : null;",
"  return (cfg && cfg.builtinModels) ? cfg.builtinModels : [];",
"}",
"/** 当前选中模型的显示名（auto 取 AI_CONFIG.autoOption.name） */",
"function getSharedAiModelName() {",
"  var id = getSharedAiModelId();",
"  if (!id || id === 'auto') {",
"    var cfg = (typeof window !== 'undefined') ? window.AI_CONFIG : null;",
"    var a = cfg && cfg.autoOption;",
"    return (a && a.name) ? a.name : '自动（推荐）';",
"  }",
"  var list = xtAiBuiltinModels();",
"  for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i].name || id; }",
"  return id;",
"}",
"/** 把首页当前会话镜像进 AI.html 的共享历史（只更新自己的会话，不动其它会话） */",
"function syncHomeChatToShared() {",
"  try {",
"    if (!aiChatHistory || !aiChatHistory.length) return;",
"    var list = [];",
"    try { list = JSON.parse(localStorage.getItem(XT_AI_HISTORY_KEY)) || []; } catch (e2) { list = []; }",
"    if (!list || typeof list.length !== 'number') list = [];",
"    var title = '';",
"    var store = [];",
"    for (var i = 0; i < aiChatHistory.length; i++) {",
"      var m = aiChatHistory[i];",
"      if (!m) continue;",
"      if (!title && m.role === 'user') title = String(m.text == null ? '' : m.text).slice(0, 20);",
"      store.push({ role: m.role === 'user' ? 'user' : 'ai', content: String(m.text == null ? '' : m.text) });",
"    }",
"    if (!title) title = getAiPartner().name;",
"    var id = xtHomeChatId();",
"    var chat = { id: id, title: title, createdAt: Date.now(), updatedAt: Date.now(), messages: store };",
"    var idx = -1;",
"    for (var k = 0; k < list.length; k++) { if (list[k] && list[k].id === id) { idx = k; break; } }",
"    if (idx >= 0) { chat.createdAt = list[idx].createdAt || chat.createdAt; list[idx] = chat; }",
"    else { list.unshift(chat); }",
"    if (list.length > 50) list = list.slice(0, 50);",
"    localStorage.setItem(XT_AI_HISTORY_KEY, JSON.stringify(list));",
"  } catch (e) { /* 共享历史写入失败不影响本地历史 */ }",
"}",
"/** 从共享历史恢复首页小助手会话（本地历史为空时才用） */",
"function loadHomeChatFromShared() {",
"  try {",
"    var list = JSON.parse(localStorage.getItem(XT_AI_HISTORY_KEY)) || [];",
"    if (!list || typeof list.length !== 'number') return [];",
"    var id = xtHomeChatId();",
"    for (var i = 0; i < list.length; i++) {",
"      if (list[i] && list[i].id === id && list[i].messages && list[i].messages.length) {",
"        var out = [];",
"        for (var j = 0; j < list[i].messages.length; j++) {",
"          var m = list[i].messages[j];",
"          if (!m) continue;",
"          out.push({ role: m.role === 'user' ? 'user' : 'ai', text: String(m.content == null ? '' : m.content), time: Date.now() });",
"        }",
"        return out;",
"      }",
"    }",
"  } catch (e) { /* 忽略 */ }",
"  return [];",
"}",
"/** 清空时同步移除共享历史里的首页会话 */",
"function removeHomeChatFromShared() {",
"  try {",
"    var list = JSON.parse(localStorage.getItem(XT_AI_HISTORY_KEY)) || [];",
"    if (!list || typeof list.length !== 'number') return;",
"    var id = xtHomeChatId();",
"    var next = [];",
"    for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id !== id) next.push(list[i]); }",
"    localStorage.setItem(XT_AI_HISTORY_KEY, JSON.stringify(next));",
"  } catch (e) { /* 忽略 */ }",
"}",
"",
"/** 伙伴图标：优先 lucide 线性图标，缺失时退回 data-icon span（由 icon-map.js 扫描） */",
"function aiPartnerIconHtml(p, size) {",
"  var partner = p || getAiPartner();",
"  var n = partner.icon || 'sparkles';",
"  var s = size || 20;",
"  if (typeof window.lucideIcon === 'function') {",
"    var svg = window.lucideIcon(n, s);",
"    if (svg) return svg;",
"  }",
"  return '<span class=\"nav-icon\" data-icon=\"' + n + '\" data-icon-size=\"' + s + '\">' + (partner.emoji || '') + '</span>';",
"}",
"",
"/** 统一 AI 底座（assets/ai-service.js 的 window.callAI）是否就绪 */",
"function aiBaseReady() { return typeof window.callAI === 'function'; }",
"/** 老 WebView（Chrome 50~58）没有 ReadableStream/TextDecoder，做不了真流式；有能力才走逐字 */",
"function aiStreamCapable() {",
"  try {",
"    return typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined' && typeof window.fetch === 'function';",
"  } catch (e) { return false; }",
"}",
"/** 卡片副标题：真实 AI 状态（不再出现“本地演示模式”） */",
"function aiStatusText() {",
"  if (aiBaseReady()) return '已接入 AI · 模型：' + getSharedAiModelName();",
"  return 'AI 未就绪 · 本地参考答案';",
"}",
"",
"/* ---------- 首页卡片：模型选择弹窗（与 AI.html 共用 ai_selected_model） ---------- */",
"function ensureAiModelPicker() {",
"  var box = document.getElementById('aiModelPicker');",
"  if (box) return box;",
"  box = document.createElement('div');",
"  box.id = 'aiModelPicker';",
"  box.className = 'ai-partner-picker';",
"  box.innerHTML = '<div class=\"ai-partner-picker-mask\" onclick=\"closeAiModelPicker()\"></div>' +",
"    '<div class=\"ai-partner-picker-box\">' +",
"      '<div class=\"ai-partner-picker-head\"><div class=\"ai-partner-picker-title\">选择模型（与 AI 页同步）</div><div class=\"ai-close\" onclick=\"closeAiModelPicker()\">✕</div></div>' +",
"      '<div class=\"ai-partner-list\" id=\"aiModelList\"></div>' +",
"    '</div>';",
"  document.body.appendChild(box);",
"  return box;",
"}",
"function renderAiModelList() {",
"  var list = document.getElementById('aiModelList');",
"  if (!list) return;",
"  var cur = getSharedAiModelId();",
"  var cfg = (typeof window !== 'undefined') ? window.AI_CONFIG : null;",
"  var auto = cfg && cfg.autoOption;",
"  var html = aiModelRow('auto', (auto && auto.name) ? auto.name : '自动（推荐）', '按问题类型自动挑模型', cur);",
"  var models = xtAiBuiltinModels();",
"  for (var i = 0; i < models.length; i++) {",
"    var m = models[i];",
"    var sub = String(m.tag || '');",
"    if (m.rate) sub += (sub ? ' · ' : '') + m.rate;",
"    if (m.provider) sub += (sub ? ' · ' : '') + m.provider;",
"    html += aiModelRow(m.id, m.name || m.id, sub, cur);",
"  }",
"  list.innerHTML = html;",
"}",
"function aiModelRow(id, name, sub, cur) {",
"  var active = (id === cur);",
"  return '<div class=\"ai-partner-card' + (active ? ' active' : '') + '\" style=\"--pc:#2F6BFF;--pbg:#EDF3FF\" onclick=\"selectAiModel(\\'' + id + '\\')\">' +",
"    '<div class=\"ai-partner-card-emoji\" style=\"background:#EDF3FF\">' + aiPartnerIconHtml({ icon: 'sparkles', emoji: '✨' }, 18) + '</div>' +",
"    '<div class=\"ai-partner-card-info\">' +",
"      '<div class=\"ai-partner-card-name\">' + String(name) + '</div>' +",
"      '<div class=\"ai-partner-card-desc\">' + String(sub || '') + '</div>' +",
"    '</div>' +",
"    (active ? '<div class=\"ai-partner-card-check\" style=\"color:#2F6BFF\">✓ 使用中</div>' : '<div class=\"ai-partner-card-use\" style=\"color:#2F6BFF\">使用</div>') +",
"    '</div>';",
"}",
"function openAiModelPicker() {",
"  ensureAiPartnerPickerCss();",
"  ensureAiCardCss();",
"  var box = ensureAiModelPicker();",
"  renderAiModelList();",
"  box.classList.add('open');",
"}",
"function closeAiModelPicker() {",
"  var box = document.getElementById('aiModelPicker');",
"  if (box) box.classList.remove('open');",
"}",
"function selectAiModel(id) {",
"  setSharedAiModelId(id);",
"  renderAiModelList();",
"  closeAiModelPicker();",
"  renderAiPartnerBar();",
"  showToast('已切换模型：' + getSharedAiModelName() + '（AI 页同步）');",
"}",
"",
"/* ---------- 首页卡片：快捷功能条 + 卡片补充样式 ---------- */",
"function ensureAiCardCss() {",
"  if (document.getElementById('xtAiCardCss')) return;",
"  var st = document.createElement('style');",
"  st.id = 'xtAiCardCss';",
"  st.textContent = [",
"    '#aiPartnerBar{display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;gap:8px;',",
"    'padding:8px 12px;border-bottom:1px solid var(--border,#e5e7eb);background:var(--bg-sub,#f7f8fa);}',",
"    '#aiPartnerBar .xt-ap-icon{width:26px;height:26px;border-radius:8px;flex:0 0 26px;',",
"    'display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;}',",
"    '#aiPartnerBar .xt-ap-icon svg{display:block;}',",
"    '#aiPartnerBar .xt-ap-name{font-size:14px;font-weight:700;color:var(--text,#1a1b1c);}',",
"    '#aiPartnerBar .xt-ap-tag{font-size:11px;padding:1px 6px;border-radius:8px;}',",
"    '#aiPartnerBar .xt-ap-spacer{-webkit-box-flex:1;flex:1;}',",
"    '#aiPartnerBar .xt-ap-btn{font-size:12px;padding:3px 8px;border:1px solid var(--border,#e5e7eb);',",
"    'border-radius:12px;color:var(--text-secondary,#6b7280);cursor:pointer;white-space:nowrap;max-width:132px;',",
"    'overflow:hidden;text-overflow:ellipsis;}',",
"    '#aiQuickBar{display:-webkit-box;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;',",
"    'padding:8px 12px;border-top:1px solid var(--border,#e5e7eb);}',",
"    '#aiQuickBar::-webkit-scrollbar{display:none;}',",
"    '#aiQuickBar .xt-qa{flex:0 0 auto;font-size:12px;padding:5px 10px;border:1px solid var(--border,#e5e7eb);',",
"    'border-radius:14px;background:var(--card,#fff);color:var(--text,#1a1b1c);cursor:pointer;white-space:nowrap;}',",
"    '#aiQuickBar .xt-qa.more{color:var(--text-secondary,#6b7280);}',",
"    '.ai-msg-actions{display:-webkit-box;display:flex;gap:12px;margin-top:6px;}',",
"    '.ai-msg-actions button{border:none;background:none;font-size:11px;color:var(--text-secondary,#6b7280);cursor:pointer;padding:0;}',",
"    '#aiModelPicker.open{display:-webkit-box;display:flex;}'",
"  ].join('');",
"  document.head.appendChild(st);",
"}",
"function ensureAiQuickBar() {",
"  var panel = document.getElementById('aiPanel');",
"  if (!panel || document.getElementById('aiQuickBar')) return;",
"  var inputRow = panel.querySelector('.ai-input-row') || panel.querySelector('.ai-input-area');",
"  if (!inputRow) return;",
"  var bar = document.createElement('div');",
"  bar.id = 'aiQuickBar';",
"  var html = '';",
"  for (var i = 0; i < AI_QUICK_ACTIONS.length; i++) {",
"    html += '<button type=\"button\" class=\"xt-qa\" onclick=\"useAiQuickAction(\\'' + AI_QUICK_ACTIONS[i].id + '\\')\">' + AI_QUICK_ACTIONS[i].name + '</button>';",
"  }",
"  html += '<button type=\"button\" class=\"xt-qa more\" onclick=\"openFullAiPage()\">在 AI 页打开 ›</button>';",
"  bar.innerHTML = html;",
"  panel.insertBefore(bar, inputRow);",
"}",
"/** 跳到 AI.html 继续完整对话（首页卡片与 AI 页共用同一套模型/历史） */",
"function openFullAiPage() { location.href = 'AI.html'; }",
"",
"/* ---------- 伙伴 id：旧 id 兼容映射 + 历史搬迁 ---------- */",
"function normalizeAiPartnerId(id) {",
"  var s = String(id == null ? '' : id);",
"  if (!s) return '';",
"  if (AI_PARTNER_ID_ALIAS[s]) return AI_PARTNER_ID_ALIAS[s];",
"  return s;",
"}",
"// 首次读到旧 id 时落盘迁移（并顺手把旧的历史搬到新 key），后续读取直接走新 id",
"function migrateAiPartnerId() {",
"  try {",
"    var raw = localStorage.getItem(AI_PARTNER_KEY);",
"    var old = String(raw == null ? '' : raw);",
"    if (!old) return;",
"    var next = normalizeAiPartnerId(old);",
"    if (next === old) return;",
"    localStorage.setItem(AI_PARTNER_KEY, next);",
"    var oldKey = lsKey('study_workbench_ai_chat_' + old);",
"    var newKey = lsKey('study_workbench_ai_chat_' + next);",
"    var moved = localStorage.getItem(oldKey);",
"    if (moved && !localStorage.getItem(newKey)) localStorage.setItem(newKey, moved);",
"  } catch (e) { /* 忽略：迁移失败不影响默认伙伴 */ }",
"}",
"function getAiPartnerId() {",
"  // 旧版本存过的伙伴 id（gongkao / xiaotu / coach / mentor / interviewer / buddy）统一映射到现行角色",
"  migrateAiPartnerId();",
"  var id = null;",
"  try { id = localStorage.getItem(AI_PARTNER_KEY); } catch (e) { id = null; }",
"  id = normalizeAiPartnerId(id);",
"  if (!id || !AI_PARTNERS.some(p => p.id === id)) return AI_PARTNERS[0].id;",
"  return id;",
"}",
"function getAiPartner() {",
"  const id = getAiPartnerId();",
"  return AI_PARTNERS.find(p => p.id === id) || AI_PARTNERS[0];",
"}",
"function setAiPartner(id) { try { localStorage.setItem(AI_PARTNER_KEY, id); } catch (e) {} }",
"function getAiChatKey() { return lsKey('study_workbench_ai_chat_' + getAiPartnerId()); }",
]
add(s, e, NEW_ID)

# ============================================================ R13 renderAiPartnerBar
s = find1("function renderAiPartnerBar() {")
e = findN("'AI伙伴 · ' + p.name;", s) + 1
NEW_BAR = [
"function renderAiPartnerBar() {",
"  const p = getAiPartner();",
"  const em = document.getElementById('aiPartnerEmoji'); if (em) em.innerHTML = aiPartnerIconHtml(p, 18);",
"  const nm = document.getElementById('aiPartnerName'); if (nm) nm.textContent = p.name;",
"  const tg = document.getElementById('aiPartnerTag');",
"  if (tg) { tg.textContent = p.tag; tg.style.background = p.bg; tg.style.color = p.color; }",
"  const av = document.querySelector('#aiPanel .ai-avatar'); if (av) av.innerHTML = aiPartnerIconHtml(p, 20);",
"  const t = document.querySelector('#aiPanel .ai-title'); if (t) t.textContent = 'AI伙伴 · ' + p.name;",
"  // 模型芯片 / 副标题 / 徽标：与 AI.html 共用同一套模型配置与状态文案",
"  const chip = document.getElementById('aiModelChip');",
"  if (chip) chip.textContent = '模型：' + getSharedAiModelName();",
"  const sub = document.getElementById('aiSubtitle'); if (sub) sub.textContent = aiStatusText();",
"  const badge = document.getElementById('aiModeBadge'); if (badge) badge.textContent = aiBaseReady() ? 'AI' : '本地';",
"}",
]
add(s, e, NEW_BAR)

# ============================================================ R12 ensureAiPartnerUI
s = find1("function ensureAiPartnerUI() {")
e = findN("  renderAiPartnerBar();", s) + 1
NEW_UI = [
"function ensureAiPartnerUI() {",
"  const panel = document.getElementById('aiPanel');",
"  if (!panel || document.getElementById('aiPartnerBar')) return;",
"  const header = panel.querySelector('.ai-panel-header');",
"  if (!header) return;",
"  const p = getAiPartner();",
"  ensureAiCardCss();",
"  const bar = document.createElement('div');",
"  bar.id = 'aiPartnerBar';",
"  bar.className = 'ai-partner-bar';",
"  bar.innerHTML = '<span class=\"xt-ap-icon\" id=\"aiPartnerEmoji\" style=\"background:' + p.bg + ';color:' + p.color + '\">' + aiPartnerIconHtml(p, 18) + '</span>' +",
"    '<span class=\"xt-ap-name\" id=\"aiPartnerName\">' + p.name + '</span>' +",
"    '<span class=\"xt-ap-tag\" id=\"aiPartnerTag\" style=\"background:' + p.bg + ';color:' + p.color + '\">' + p.tag + '</span>' +",
"    '<span class=\"xt-ap-spacer\"></span>' +",
"    '<span class=\"xt-ap-btn\" id=\"aiModelChip\" onclick=\"openAiModelPicker()\" title=\"切换模型（与 AI 页同步）\">模型：' + getSharedAiModelName() + '</span>' +",
"    '<span class=\"xt-ap-btn\" id=\"aiPartnerSwitch\" onclick=\"openAiPartnerPicker()\" title=\"切换角色\">切换</span>';",
"  panel.insertBefore(bar, header);",
"  const picker = document.createElement('div');",
"  picker.id = 'aiPartnerPicker';",
"  ensureAiPartnerPickerCss();",
"  picker.className = 'ai-partner-picker';",
"  picker.innerHTML = '<div class=\"ai-partner-picker-mask\" onclick=\"closeAiPartnerPicker()\"></div>' +",
"    '<div class=\"ai-partner-picker-box\">' +",
"      '<div class=\"ai-partner-picker-head\"><div class=\"ai-partner-picker-title\">切换角色</div><div class=\"ai-close\" onclick=\"closeAiPartnerPicker()\">✕</div></div>' +",
"      '<div class=\"ai-partner-list\" id=\"aiPartnerList\"></div>' +",
"    '</div>';",
"  document.body.appendChild(picker);",
"  ensureAiQuickBar();",
"  renderAiPartnerList();",
"  renderAiPartnerBar();",
"}",
]
add(s, e, NEW_UI)

# ============================================================ R11 renderAiPartnerList
s = find1("function renderAiPartnerList() {")
e = findN("  }).join('');", s) + 1
NEW_LIST = [
"function renderAiPartnerList() {",
"  const list = document.getElementById('aiPartnerList');",
"  if (!list) return;",
"  const cur = getAiPartnerId();",
"  list.innerHTML = AI_PARTNERS.map(p => {",
"    const active = p.id === cur;",
"    return '<div class=\"ai-partner-card' + (active ? ' active' : '') + '\" style=\"--pc:' + p.color + ';--pbg:' + p.bg + '\" onclick=\"selectAiPartner(\\'' + p.id + '\\')\">' +",
"      '<div class=\"ai-partner-card-emoji\" style=\"background:' + p.bg + '\">' + aiPartnerIconHtml(p, 18) + '</div>' +",
"      '<div class=\"ai-partner-card-info\">' +",
"        '<div class=\"ai-partner-card-name\">' + p.name + '<span class=\"ai-partner-card-tag\" style=\"background:' + p.bg + ';color:' + p.color + '\">' + p.tag + '</span></div>' +",
"        '<div class=\"ai-partner-card-desc\">' + p.desc + '</div>' +",
"      '</div>' +",
"      (active ? '<div class=\"ai-partner-card-check\" style=\"color:' + p.color + '\">✓ 使用中</div>' : '<div class=\"ai-partner-card-use\" style=\"color:' + p.color + '\">使用</div>') +",
"      '</div>';",
"  }).join('');",
"}",
]
add(s, e, NEW_LIST)

# ============================================================ R10 selectAiPartner
s = find1("function selectAiPartner(id) {")
e = findN("pushAiMsg('ai', p.greeting);", s) + 1
NEW_SEL = [
"function selectAiPartner(id) {",
"  if (!AI_PARTNERS.some(p => p.id === id)) { closeAiPartnerPicker(); return; }",
"  if (id === getAiPartnerId()) { closeAiPartnerPicker(); return; }",
"  setAiPartner(id);",
"  switchAiHistory();   // 切换不丢历史：各角色历史独立存，切回来原样恢复",
"  renderAiPartnerBar();",
"  renderAiMessages();",
"  closeAiPartnerPicker();",
"  const p = getAiPartner();",
"  showToast('已切换为 ' + p.name + ' · ' + p.tag);",
"  if (aiChatHistory.length === 0) pushAiMsg('ai', p.greeting);",
"  try { syncHomeChatToShared(); } catch (eSync) { /* 忽略 */ }",
"}",
]
add(s, e, NEW_SEL)

# ============================================================ R9 打开面板：问候 + 状态
s = find1("      if (aiChatHistory.length === 0) {")
e = findN("} catch (e2) { /* 忽略 */ }", s)
NEW_OPEN = [
"      if (aiChatHistory.length === 0) {",
"        // 首次打开：按当前伙伴的问候语欢迎（不发请求；公共 Key 限频 10 次/分钟，只在用户发送时才调 AI）",
"        pushAiMsg('ai', getAiPartner().greeting + '\\n\\n试试问我：「四级怎么复习」「行测资料分析怎么做」「帮我排一份 30 天计划」');",
"      } else {",
"        renderAiMessages();",
"      }",
"    } catch (e) { /* 问候/历史渲染失败不影响面板本身打开 */ }",
"    // 更新模式徽标与副标题：首页卡片与 AI.html 共用 window.callAI 同一套底座",
"    // 这些节点/依赖在部分页面可能缺失，逐个判空，避免整段抛错让面板停在半开状态",
"    try {",
"      const badge = document.getElementById('aiModeBadge');",
"      const sub = document.getElementById('aiSubtitle');",
"      if (badge) badge.textContent = aiBaseReady() ? 'AI' : '本地';",
"      if (sub) sub.textContent = aiStatusText();",
"      const input = document.getElementById('aiInput');",
"      if (input) setTimeout(function () { input.focus(); }, 100);",
"    } catch (e2) { /* 忽略 */ }",
]
add(s, e, NEW_OPEN)

# ============================================================ R8 clearAiChat
s = find1("uiConfirm('确定清空全部AI聊天记录吗？'") + 2
e = findN("    renderAiMessages();", s)
add(s, e, [
"    aiChatHistory = [];",
"    localStorage.removeItem(getAiChatKey());",
"    try { removeHomeChatFromShared(); } catch (eClr) { /* 共享历史清理失败不影响本地 */ }",
"    renderAiMessages();",
])

# ============================================================ R7 sendAiMsg
s = find1(" * 发送一条用户消息") - 1
e = findN("function sendAiMsg() {", s)
# 找到 sendAiMsg 函数体结尾：从 e 开始第一个单独的 "}"
body_end = e
while lines[body_end] != "}":
    body_end += 1
NEW_SEND = [
"/**",
" * 发送一条用户消息：优先走统一 AI 底座 window.callAI（与 AI.html 同一套），",
" * 底座缺失时依次降级到 服务商直连 / 后端中转 / 本地规则引擎（旧路径全部保留）",
" */",
"function sendAiMsg() {",
"  const input = document.getElementById('aiInput');",
"  const text = input.value.trim();",
"  if (!text || aiStreaming) return;",
"  input.value = '';",
"  pushAiMsg('user', text); // 先入历史，供上下文记忆使用",
"  aiStreaming = true;",
"  document.getElementById('aiSendBtn').style.opacity = '0.5';",
"  aiDispatchReply(text);",
"}",
"/** 统一的回复派发：主路径 callAI，旧的三条降级路径原样保留 */",
"function aiDispatchReply(text) {",
"  if (typeof window.callAI === 'function') {",
"    fetchAssistantReply(text);   // 统一 AI 底座（assets/ai-service.js）",
"    return;",
"  }",
"  const m = currentAiMode();",
"  if (m.mode === 'provider') {",
"    fetchProviderReply();        // 服务商直连（密钥来自本地配置，OpenAI 兼容协议，流式+上下文）",
"  } else if (m.mode === 'backend') {",
"    fetchAiReply(text);          // 后端中转（密钥在后端）",
"  } else {",
"    localAiReply(text);          // 本地兜底：规则引擎 + 伙伴 demoStyle",
"  }",
"}",
"/** 组装发给统一底座的 messages：system 人设 + 最近 14 条上下文 */",
"function buildAiBaseMessages() {",
"  const msgs = [{ role: 'system', content: getAiPartner().systemPrompt }];",
"  const hist = (aiChatHistory || []).slice(-14);",
"  for (let i = 0; i < hist.length; i++) {",
"    const m = hist[i];",
"    if (!m || !m.text) continue;",
"    msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text) });",
"  }",
"  return msgs;",
"}",
"/**",
" * 首页卡片的主通道：走 window.callAI（与 AI.html 完全同一套模型配置 / 降级 / 限频）。",
" * 双口径渲染：现代浏览器 onChunk 逐字输出；老内核（无 ReadableStream）先显示",
" * 「AI 正在思考…」加载态，整段返回后再正确渲染，不裸调用流式 API。",
" */",
"async function fetchAssistantReply(text) {",
"  const canStream = aiStreamCapable();",
"  const model = getSharedAiModelId();",
"  let bubble = null;",
"  let settled = false;",
"  const settle = function (finalText) {",
"    if (settled) return;",
"    settled = true;",
"    aiStreaming = false;",
"    const btn = document.getElementById('aiSendBtn');",
"    if (btn) btn.style.opacity = '';",
"    finishStreaming('ai', finalText);",
"    renderAiMessages();",
"    try { syncHomeChatToShared(); } catch (eSync) { /* 忽略 */ }",
"  };",
"  try {",
"    if (!canStream) {",
"      // 老内核：先给加载态，避免用户以为点了没反应",
"      bubble = createStreamingBubble();",
"      bubble.textContent = 'AI 正在思考…';",
"      scrollAiMessages();",
"    }",
"    const opts = { model: model };",
"    if (canStream) {",
"      opts.onChunk = function (piece, full) {",
"        if (!bubble) bubble = createStreamingBubble();",
"        if (full !== null && full !== undefined && full !== '') {",
"          bubble.textContent = String(full);",
"        } else {",
"          bubble.textContent = bubble.textContent + String(piece == null ? '' : piece);",
"        }",
"        scrollAiMessages();",
"      };",
"    }",
"    const r = await window.callAI('auto', buildAiBaseMessages(), opts);",
"    const out = r && (r.text || r.content);",
"    if (!out) throw new Error('AI 返回了空内容');",
"    if (r && r.degraded) {",
"      // 底座已降级到本地预设：与 AI.html 保持一致，给统一提示而不是假装是 AI 回答",
"      settle(String(out));",
"      showToast('网络不佳，以下为本地参考');",
"      return;",
"    }",
"    if (canStream) {",
"      settle(String(out));",
"    } else {",
"      if (!bubble) bubble = createStreamingBubble();",
"      typewriterIntoBubble(bubble, String(out), function () { settle(String(out)); });",
"    }",
"  } catch (e) {",
"    if (settled) return;",
"    settled = true;",
"    aiStreaming = false;",
"    const btn2 = document.getElementById('aiSendBtn');",
"    if (btn2) btn2.style.opacity = '';",
"    // 撤掉可能残留的“正在思考”气泡，再走统一降级提示",
"    if (bubble && bubble.parentNode && bubble.parentNode.parentNode) {",
"      bubble.parentNode.parentNode.removeChild(bubble.parentNode);",
"    }",
"    aiDegradeReply(e, text);",
"  }",
"}",
"/** 断网 / 限流 / Key 失效的统一降级提示（文案与 AI.html 一致），随后给本地参考答案 */",
"function aiDegradeReply(err, text) {",
"  let reason = '网络异常';",
"  if (err && err.rateLimited) reason = '提问太频繁了，休息一下吧';",
"  else if (err && err.message) reason = err.message;",
"  pushAiMsg('ai', '（网络不佳，以下为本地参考）\\n\\n' + reason, true);",
"  renderAiMessages();",
"  showToast('网络不佳，以下为本地参考');",
"  aiStreaming = true;",
"  localAiFallbackReply(text);",
"}",
"/** 复制某条 AI 回复（老 WebView 没有 navigator.clipboard，用 textarea + execCommand） */",
"function copyAiText(btn) {",
"  let msg = null;",
"  let node = btn;",
"  while (node && node !== document.body) {",
"    const cls = (node.getAttribute && node.getAttribute('class')) || '';",
"    if (cls && cls.indexOf('ai-msg') >= 0) { msg = node; break; }",
"    node = node.parentNode;",
"  }",
"  const bubble = msg ? msg.querySelector('.ai-msg-bubble') : null;",
"  if (!bubble) { showToast('没有可复制的内容'); return; }",
"  const clone = bubble.cloneNode(true);",
"  const acts = clone.querySelector('.ai-msg-actions');",
"  if (acts && acts.parentNode) acts.parentNode.removeChild(acts);",
"  const txt = clone.textContent || '';",
"  if (!txt) { showToast('没有可复制的内容'); return; }",
"  const ta = document.createElement('textarea');",
"  ta.value = txt;",
"  ta.style.cssText = 'position:fixed;left:-9999px;top:0;';",
"  document.body.appendChild(ta);",
"  ta.select();",
"  let ok = false;",
"  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }",
"  document.body.removeChild(ta);",
"  showToast(ok ? '已复制' : '复制失败，请手动选择');",
"}",
"/** 重新生成最后一条 AI 回复：回退到最后一条用户提问再发一次 */",
"function regenerateAiLast() {",
"  if (aiStreaming) { showToast('AI 正在回复中…'); return; }",
"  let lastUser = '';",
"  while (aiChatHistory.length) {",
"    const last = aiChatHistory[aiChatHistory.length - 1];",
"    if (last && last.role === 'user') { lastUser = String(last.text || ''); break; }",
"    aiChatHistory.pop();",
"  }",
"  if (!lastUser) { showToast('还没有可重新生成的提问'); return; }",
"  try { localStorage.setItem(getAiChatKey(), JSON.stringify(aiChatHistory)); } catch (e) { /* 忽略 */ }",
"  renderAiMessages();",
"  aiStreaming = true;",
"  const btn = document.getElementById('aiSendBtn');",
"  if (btn) btn.style.opacity = '0.5';",
"  aiDispatchReply(lastUser);",
"}",
]
add(s, body_end, NEW_SEND)

# ============================================================ R7b 兜底回复前缀
s = find1("const reply = p.name + ' ' + p.emoji")
add(s, s, ["  const reply = p.name + '：\\n' + body;"])

# ============================================================ R6 createStreamingBubble
s = find1("function createStreamingBubble() {")
e = findN("  return msg.querySelector('.ai-msg-bubble');", s) + 1
add(s, e, [
"function createStreamingBubble() {",
"  const box = document.getElementById('aiMessages');",
"  const msg = document.createElement('div');",
"  msg.className = 'ai-msg ai';",
"  msg.innerHTML = '<div class=\"ai-msg-avatar\">' + aiPartnerIconHtml(getAiPartner(), 16) + '</div><div class=\"ai-msg-bubble typing\"></div>';",
"  box.appendChild(msg);",
"  scrollAiMessages();",
"  return msg.querySelector('.ai-msg-bubble');",
"}",
])

# ============================================================ R5 pushAiMsg
s = find1("function pushAiMsg(role, text, skipRender) {")
e = findN("  if (!skipRender) renderAiMessages();", s) + 1
add(s, e, [
"function pushAiMsg(role, text, skipRender) {",
"  aiChatHistory.push({ role, text, time: Date.now() });",
"  if (aiChatHistory.length > 100) aiChatHistory = aiChatHistory.slice(-100); // 防止无限膨胀",
"  localStorage.setItem(getAiChatKey(), JSON.stringify(aiChatHistory));",
"  try { syncHomeChatToShared(); } catch (eSync) { /* 共享历史写入失败不影响本地 */ }",
"  if (!skipRender) renderAiMessages();",
"}",
])

# ============================================================ R4 renderAiMessages
s = find1("function renderAiMessages() {")
e = findN("  scrollAiMessages();", s) + 1
add(s, e, [
"function renderAiMessages() {",
"  const box = document.getElementById('aiMessages');",
"  box.innerHTML = '';",
"  aiChatHistory.forEach((m, i) => {",
"    const div = document.createElement('div');",
"    div.className = 'ai-msg ' + (m.role === 'user' ? 'user' : 'ai');",
"    div.innerHTML = '<div class=\"ai-msg-avatar\">' + (m.role === 'user' ? '🙋' : aiPartnerIconHtml(getAiPartner(), 16)) + '</div><div class=\"ai-msg-bubble\"></div>';",
"    div.querySelector('.ai-msg-bubble').textContent = m.text;",
"    box.appendChild(div);",
"    // 最后一条助手回复挂上「复制 / 重新生成」",
"    if (m.role !== 'user' && i === aiChatHistory.length - 1) {",
"      const acts = document.createElement('div');",
"      acts.className = 'ai-msg-actions';",
"      acts.innerHTML = '<button type=\"button\" onclick=\"copyAiText(this)\">复制</button>' +",
"        '<button type=\"button\" onclick=\"regenerateAiLast()\">重新生成</button>';",
"      div.querySelector('.ai-msg-bubble').appendChild(acts);",
"    }",
"  });",
"  scrollAiMessages();",
"}",
])

# ============================================================ R3 启动块
s = find1("// 启动时读取当前伙伴的历史")
e = findN("try { ensureAiPartnerUI(); } catch (e) {}", s)
add(s, e, [
"// 启动时读取当前伙伴的历史；无历史时兼容导入旧版全局历史 → 再退回与 AI.html 共享的历史",
"try {",
"  aiChatHistory = JSON.parse(localStorage.getItem(getAiChatKey())) || [];",
"  if (!aiChatHistory.length) { aiChatHistory = JSON.parse(localStorage.getItem(lsKey(AI_CHAT_KEY))) || []; }",
"  if (!aiChatHistory.length) { aiChatHistory = loadHomeChatFromShared(); }",
"} catch (e) { aiChatHistory = []; }",
"// 注入 AI 伙伴条 + 角色选择弹窗 + 快捷功能条（所有页面通用，幂等）",
"try { ensureAiPartnerUI(); } catch (e) {}",
"try { renderAiPartnerBar(); } catch (eRb) { /* 同步模型/状态文案，失败不影响页面 */ }",
])

# ============================================================ R2 更多页「关于」入口
s = find1('onclick="showAbout()"')
add(s, s, [
'      <div class="pp-row" onclick="location.href=\'关于.html\'"><span class="pp-ic" data-icon="info"></span><span class="pp-tx">关于</span><span class="pp-st">v2.2</span><span class="pp-ar">›</span></div>',
])

# ============================================================ R1 showAbout
s = find1("// ========== 关于弹窗 ==========")
e = findN("window.showAbout = showAbout;", s)
NEW_ABOUT = [
"// ========== 关于（2026-09-16：改为独立页面 关于.html） ==========",
"// 全站所有 showAbout() 调用点（更多页菜单、底部更多面板等）统一跳转独立页面，不再弹窗。",
"function showAbout() {",
"  let here = '';",
"  try { here = decodeURIComponent(String((location && location.href) ? location.href : '')); } catch (e) { here = ''; }",
"  if (here.indexOf('关于.html') >= 0) return;   // 已在关于页：忽略，避免自我跳转",
"  location.href = '关于.html';",
"}",
"window.showAbout = showAbout;",
"",
"// 旧版页内弹窗：保留作兜底（关于页缺失 / 无法跳转时仍可查看），内容与 关于.html 一致。",
"function showAboutDialog() {",
"  var old = document.getElementById('aboutModal');",
"  if (old) old.remove();",
"  var mask = document.createElement('div');",
"  mask.id = 'aboutModal';",
"  mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;padding:20px';",
"  mask.onclick = function(e) { if (e.target === mask) mask.remove(); };",
"  var html = '<div style=\"background:#fff;border-radius:20px;max-width:440px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)\">' +",
"    '<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:14px\">' +",
"    '<div style=\"font-size:18px;font-weight:800;color:#1a1b1c\">关于星途</div>' +",
"    '<button id=\"aboutClose\" style=\"background:none;border:none;font-size:22px;cursor:pointer;color:#999\">×</button>' +",
"    '</div>' +",
"    '<div style=\"font-size:15px;font-weight:800;color:#1a1b1c\">星途 v2.2</div>' +",
"    '<div style=\"font-size:13px;color:#6b7280;margin-top:4px\">给上班族的备考搭子 · 学得下去、问得明白</div>' +",
"    '<div style=\"margin-top:14px;font-size:13px;color:#374151;line-height:1.8\">白天上班、晚上备考，最怕的是工具散、计划断、没人答疑。星途把这一路要用的东西收在一处：能刷题背词、能写申论做 PPT，还有一个随叫随到的 AI —— 不会就问，问完就能接着学。</div>' +",
"",
"    '<div style=\"margin-top:16px;font-weight:700;color:#1a1b1c\">AI 怎么用</div>' +",
"    '<div style=\"font-size:13px;color:#374151;line-height:1.75;margin-top:4px\">' +",
"    '<b>AI 问答</b>：底部导航点「AI」进入。默认「自动（推荐）」会按题型挑模型——数学推理走 DeepSeek-R1、英语翻译走混元、发图提问走视觉模型；也能手动指定。开 <b>MAX 模式</b>输出更长（适合申论批改、长文讲解），开 <b>深度思考</b>会先推导再给结论。' +",
"    '</div>' +",
"    '<div style=\"font-size:13px;color:#374151;line-height:1.75;margin-top:6px\">' +",
"    '<b>AI 伙伴</b>：两位常驻——<b>小助手</b>覆盖行测、申论、四级、面试、PPT、备考规划，给的是结论+可执行动作；<b>暖心学伴</b>学不动的时候先稳住你，再拆一个「现在就能开始」的小任务。' +",
"    '</div>' +",
"",
"    '<div style=\"margin-top:16px;font-weight:700;color:#1a1b1c\">学习模块</div>' +",
"    '<div style=\"font-size:13px;color:#374151;line-height:1.7;margin-top:4px\">英语（词汇+听说）· 行测刷题 · 申论刷题 · 错题本 · 央国企定向库 · 面试题库 · AI 模拟面试 · 时政热点 · 表达 · 商务礼仪 · 演示 · 万能金句 / 场景话术 · 动态社区 · 好友私信</div>' +",
"",
"    '<div style=\"margin-top:16px;border-top:1px dashed #e4e3dd;padding-top:10px;font-size:12px;color:#9ca3af;line-height:1.7\">完整版本说明、数据说明与免责声明请见「关于」独立页面。</div>' +",
"    '<div style=\"margin-top:16px;text-align:right;font-style:italic;color:#6b7280\">—— 小叶子</div>' +",
"    '</div>';",
"  mask.innerHTML = html;",
"  document.body.appendChild(mask);",
"  var closeBtn = document.getElementById('aboutClose');",
"  if (closeBtn) closeBtn.onclick = function() { mask.remove(); };",
"}",
"window.showAboutDialog = showAboutDialog;",
]
add(s, e, NEW_ABOUT)

# ---------------------------------------------------------------- 应用（从下往上）
OPS.sort(key=lambda t: -t[0])
for a, b, new_lines in OPS:
    lines[a:b + 1] = new_lines

out = CRLF.join(lines)
with io.open(APP, "w", encoding="utf-8", newline="") as f:
    f.write(out)

print("OK app.js patched, ops:", len(OPS), "-> lines:", len(lines))
