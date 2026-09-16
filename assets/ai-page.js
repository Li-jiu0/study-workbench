/* ============ AI 页交互逻辑（DeepSeek 风格） ============
   依赖（由并行线 eng-ai-base 提供，全局函数/对象）：
     - callAI(funcType, messages, { image, onChunk(delta, fullText), onFallback(name) })
     - AI_CONFIG（模型配置 / 推荐问题 / 关键词）
   说明：本文件只负责页面交互；所有模型调用、流式、降级交给 callAI。
   语法约束（老 WebView）：不用可选链、双问号、replaceAll、fromEntries、数组 at、正则后行断言；不用顶层 await。 */
(function () {
  'use strict';

  var doc = document;
  function $(id) { return doc.getElementById(id); }
  /* 安全绑定：元素缺失（或被移走）时静默跳过，不能因为一处 null 抛错
     就把后面所有绑定全部中断——发送钮的绑定就在 bindEvents 靠后的位置 */
  function bindById(id, ev, fn) { var el = $(id); if (el && el.addEventListener) el.addEventListener(ev, fn); return el; }
  function bindEl(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn); return el; }
  function setVal(id, v) { var el = $(id); if (el) el.value = v; }
  function getVal(id) { var el = $(id); return el ? String(el.value || '') : ''; }

  /* ---------- 常量 ---------- */
  var HISTORY_KEY = 'ai_chat_history';        // 历史对话
  var CUSTOM_KEY = 'ai_custom_models';        // 自定义模型
  var SEL_MODEL_KEY = 'ai_selected_model';    // 当前选中模型 id（auto 表示自动）
  var DEEPTHINK_KEY = 'ai_deep_think';        // 深度思考开关 0/1
  var MAX_MODE_KEY = 'ai_max_mode';           // MAX 模式开关 0/1
  var MODE_KEY = 'ai_model_mode';             // R65 三模式：''/fast/balanced/ultimate（非空时优先于选中模型）
  var MEMORY_KEY = 'ai_memory';               // R65 记忆：字符串数组（单条≤200字，上限50条FIFO）
  var SETTINGS_KEY = 'ai_model_settings';     // R64 模型设置页写入（disabled/order/overrides）
  var MEMORY_MAX = 50;                        // 记忆条数上限（超出丢最旧）
  var MEMORY_ITEM_MAX = 200;                  // 单条记忆截断长度（字）
  var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  var COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var REGEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var MEM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  // AI 头像：星星图标（对标 DeepSeek/WorkBuddy 用品牌图形而非文字）
  var SPARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z"/></svg>';

  var FALLBACK_MATH = ['计算', '工程', '利润', '增长率', '比例', '方程', '几何', '数量关系', '资料分析', '速度', '路程', '浓度', '排列组合', '概率', '整除', '余数', '最大公约数', '最小公倍数'];
  var FALLBACK_TRANS = ['翻译', '英语', '四级', '六级', '单词', '语法', 'translate', 'english'];

  /* 倍率兜底（底座 AI_CONFIG.builtinModels[i].rate 未就绪时按模型规模本地展示；
     待 eng-ai-base 给每个模型加 rate 字段后，优先读配置） */
  var RATE_FALLBACK = {
    'auto': '自适应',
    'glm-4.7-flash': '1x',
    'glm-4.5-flash': '1x',
    'glm-4-flash': '0.8x',
    'glm-4.6v-flash': '1.2x',
    'glm-4v-flash': '1x',
    'qwen2.5-7b': '1x',
    'qwen3-8b': '1.2x',
    'qwen3.5-4b': '0.5x',
    'deepseek-r1-8b': '2x',
    'glm-4-9b': '1.2x',
    'hunyuan-mt-7b': '1x'
  };

  /* 模型说明兜底（与开发文档 §7.3 一致）；若 AI_CONFIG 提供更全则用 AI_CONFIG。 */
  var MODEL_DETAILS = {
    'glm-4.7-flash': { platform: '智谱AI', type: '通用文本', params: '30B', stars: '★★★★★', recommend: '日常问答首选', advantage: '智谱最新免费模型，30B 大参数，中文理解能力强，上下文 200K', applicable: '日常学习问答、方法咨询、文案生成、面试模拟' },
    'glm-4.5-flash': { platform: '智谱AI', type: '通用文本', stars: '★★★★', advantage: '上一代免费模型，稳定性好，响应快', applicable: '4.7 拥堵时自动降级，日常问答' },
    'glm-4-flash': { platform: '智谱AI', type: '通用文本', stars: '★★★', advantage: '最稳定，几乎不拥堵，效果稍弱', applicable: '其他模型都拥堵时的最终兜底' },
    'glm-4.6v-flash': { platform: '智谱AI', type: '多模态（图片+文本）', stars: '★★★★★', advantage: '免费支持图片理解，识别题目截图、PPT 截图', applicable: '拍题讲题、图片识别、PPT 截图分析' },
    'glm-4v-flash': { platform: '智谱AI', type: '视觉理解', stars: '★★★', advantage: '老版视觉模型，稳定', applicable: '4.6V 拥堵时备用' },
    'qwen2.5-7b': { platform: '硅基流动', type: '通用文本', params: '7B', stars: '★★★★', advantage: '阿里通义千问开源模型，中文好，速度快', applicable: '日常问答、学习方法、简单文案' },
    'qwen3-8b': { platform: '硅基流动', type: '通用文本', params: '8B', stars: '★★★★', advantage: 'Qwen 第三代，推理更强，支持工具调用', applicable: '日常问答、逻辑推理、简单数学' },
    'qwen3.5-4b': { platform: '硅基流动', type: '通用文本', params: '4B', stars: '★★', advantage: '小参数，响应极快', applicable: '极简单问答、分类，复杂问题不推荐' },
    'deepseek-r1-8b': { platform: '硅基流动', type: '推理专用', params: '8B', stars: '★★★★★', advantage: '专门优化逻辑推理和数学计算，解行测题比通用模型准', applicable: '数量关系、资料分析、判断推理' },
    'glm-4-9b': { platform: '硅基流动', type: '通用文本', params: '9B', stars: '★★★', advantage: '智谱开源 9B，中文不错', applicable: '通用问答备用' },
    'hunyuan-mt-7b': { platform: '硅基流动', type: '通用文本（多语言）', params: '7B', stars: '★★★', advantage: '腾讯混元开源，多语言强，翻译好', applicable: '英语翻译、英语、多语言问答' }
  };

  /* 内置模型兜底（与 AI_CONFIG.builtinModels 对齐） */
  var FALLBACK_MODELS = [
    { id: 'auto', name: '自动（推荐）', provider: null, model: null, types: ['general', 'math', 'image', 'translate'], tag: null, fallback: null },
    { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', provider: 'zhipu', model: 'glm-4.7-flash', types: ['general'], tag: null, fallback: 'glm-4.5-flash' },
    { id: 'glm-4.5-flash', name: 'GLM-4.5-Flash', provider: 'zhipu', model: 'glm-4.5-flash', types: ['general'], tag: null, fallback: 'qwen2.5-7b' },
    { id: 'glm-4-flash', name: 'GLM-4-Flash', provider: 'zhipu', model: 'glm-4-flash', types: ['general'], tag: null, fallback: null },
    { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash', provider: 'zhipu', model: 'glm-4.6v-flash', types: ['image', 'general'], tag: null, fallback: 'glm-4v-flash' },
    { id: 'glm-4v-flash', name: 'GLM-4V-Flash', provider: 'zhipu', model: 'glm-4v-flash', types: ['image'], tag: null, fallback: null },
    { id: 'qwen2.5-7b', name: 'Qwen2.5-7B', provider: 'siliconflow', model: 'Qwen/Qwen2.5-7B-Instruct', types: ['general'], tag: null, fallback: 'glm-4-flash' },
    { id: 'qwen3-8b', name: 'Qwen3-8B', provider: 'siliconflow', model: 'Qwen/Qwen3-8B', types: ['general', 'math'], tag: null, fallback: 'qwen2.5-7b' },
    { id: 'qwen3.5-4b', name: 'Qwen3.5-4B', provider: 'siliconflow', model: 'Qwen/Qwen3.5-4B', types: ['general'], tag: null, fallback: 'qwen2.5-7b' },
    { id: 'deepseek-r1-8b', name: 'DeepSeek-R1-8B', provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', types: ['math', 'reasoning'], tag: null, fallback: 'glm-4.7-flash' },
    { id: 'glm-4-9b', name: 'GLM-4-9B', provider: 'siliconflow', model: 'THUDM/GLM-4-9B-0414', types: ['general'], tag: null, fallback: 'qwen2.5-7b' },
    { id: 'hunyuan-mt-7b', name: 'Hunyuan-MT-7B', provider: 'siliconflow', model: 'tencent/Hunyuan-MT-7B', types: ['translate', 'general'], tag: null, fallback: 'glm-4.7-flash' }
  ];

  /* 自定义模型：服务商预设（选择后自动填 API 地址 + 切换模型 ID 下拉选项）
     url 为空表示让用户自己填（OpenAI 兼容）。 */
  var CM_PRESETS = [
    { key: 'siliconflow', label: '硅基流动', url: 'https://api.siliconflow.cn/v1/chat/completions', models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3' },
      { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5-7B' },
      { id: 'Qwen/Qwen3-8B', name: 'Qwen3-8B' },
      { id: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', name: 'DeepSeek-R1-8B' }
    ]},
    { key: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions', models: [
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner' }
    ]},
    { key: 'zhipu', label: '智谱', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: [
      { id: 'glm-4-flash', name: 'GLM-4-Flash' },
      { id: 'glm-4-plus', name: 'GLM-4-Plus' },
      { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash' }
    ]},
    { key: 'kimi', label: 'Kimi', url: 'https://api.moonshot.cn/v1/chat/completions', models: [
      { id: 'moonshot-v1-8k', name: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', name: 'moonshot-v1-32k' },
      { id: 'moonshot-v1-128k', name: 'moonshot-v1-128k' }
    ]},
    { key: 'tencent', label: '腾讯云', url: 'https://lke.tencentcloudapi.com/v1/chat/completions', models: [
      { id: 'deepseek-v3', name: 'DeepSeek-V3' }
    ]},
    { key: 'aliyun', label: '阿里云', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: [
      { id: 'qwen-max', name: 'qwen-max' },
      { id: 'qwen-plus', name: 'qwen-plus' }
    ]},
    { key: 'baidu', label: '百度千帆', url: 'https://qianfan.baidubce.com/v2/chat/completions', models: [
      { id: 'ernie-4.0-turbo-8k', name: 'ERNIE 4.0 Turbo' }
    ]},
    { key: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', models: [
      { id: 'openai/gpt-4o-mini', name: 'gpt-4o-mini' }
    ]},
    { key: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', models: [
      { id: 'llama3-8b-8192', name: 'Llama3 8B' }
    ]},
    { key: 'ollama', label: 'Ollama (本地)', url: 'http://localhost:11434/v1/chat/completions', models: [
      { id: 'llama3', name: 'llama3' }
    ]},
    { key: 'openai', label: 'OpenAI 兼容（自定义）', url: '', models: [] }
  ];
  var CM_TEST_TIMEOUT = 15000;   // 测试连接超时（毫秒）

  /* ---------- 元素引用（init 内赋值） ---------- */
  var aiInput, aiSendBtn, aiChat, aiMessages, aiWelcome, aiWelcomeInputSlot, aiDockInputSlot,
    aiInputBox, aiImgPreview, aiImgThumb, aiAttachBtn, aiFileInput, aiDeepThinkChip,
    aiModelBtn, aiModelLabel, aiImgRemove, aiHistory, aiHistoryList,
    aiSidebarOverlay, aiCollapseBtn, cmTypes, pendingOk = null, customEditId = null,
    aiUserArea, aiUserAvatar, aiUserName, aiUserMoreBtn,
    aiUserMenu, aiProfileBtn, aiLogoutBtn, userInfoTries = 0,
    aiModelPanel, aiModelList, aiMaxSwitch;

  /* ---------- 运行时状态 ---------- */
  var state = { messages: [], chatId: null, image: null, sending: false };

  /* ============ 工具函数 ============ */
  function lsGet(key, def) { try { var v = localStorage.getItem(key); if (v === null) return def; return JSON.parse(v); } catch (e) { return def; } }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略写入异常 */ } }
  function lsStr(key, def) { try { var v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } }
  function lsStrSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* 忽略 */ } }

  function getSelectedModelId() { return lsStr(SEL_MODEL_KEY, 'auto'); }
  function setSelectedModelId(id) { lsStrSet(SEL_MODEL_KEY, id); }
  function getDeepThink() { return lsStr(DEEPTHINK_KEY, '0') === '1'; }
  function getMaxMode() { return lsStr(MAX_MODE_KEY, '0') === '1'; }
  function setMaxMode(on) { lsStrSet(MAX_MODE_KEY, on ? '1' : '0'); }

  /* ---------- R65：三模式（ai_model_mode） ---------- */
  function getModeKey() {
    var v = lsStr(MODE_KEY, '');
    return (v === 'fast' || v === 'balanced' || v === 'ultimate') ? v : '';
  }
  function setModeKey(v) { lsStrSet(MODE_KEY, v || ''); }
  function getModeDefs() {
    try {
      if (typeof AI_CONFIG !== 'undefined' && AI_CONFIG && AI_CONFIG.modelModes) return AI_CONFIG.modelModes;
    } catch (e) { /* AI_CONFIG 未就绪：不渲染模式行 */ }
    return null;
  }
  function getModeInfo(key) {
    if (!key) return null;
    var defs = getModeDefs();
    if (!defs || !defs[key] || typeof defs[key].label !== 'string' || !defs[key].label) return null;
    return defs[key];
  }

  function getHistory() { return lsGet(HISTORY_KEY, []); }
  function getCustomModels() { return lsGet(CUSTOM_KEY, []); }

  /* ---------- R64：模型设置页本地设置（ai_model_settings 单键 JSON，容错读取） ---------- */
  /* 结构：{ disabled:{id:true}（兼容数组）, order:[id], overrides:{id:{name/desc/stars/...}} }
     解析失败 / 缺字段 / 键不存在 → 一律按「无设置」处理，行为与现状完全一致。 */
  function getModelSettings() {
    var raw = null;
    try { raw = localStorage.getItem(SETTINGS_KEY); } catch (e) { return {}; }
    if (raw === null || raw === '') return {};
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') return o;
    } catch (e2) { /* 键损坏：按无设置处理 */ }
    return {};
  }
  function isDisabledId(id) {
    if (!id) return false;
    var d = getModelSettings().disabled;
    if (!d) return false;
    if (Object.prototype.toString.call(d) === '[object Array]') return d.indexOf(id) !== -1;
    if (typeof d === 'object') return d[id] === true;
    return false;
  }
  function settingsOverrideOf(id) {
    if (!id) return null;
    var o = getModelSettings().overrides;
    if (o && typeof o === 'object' && o[id] && typeof o[id] === 'object') return o[id];
    return null;
  }
  function settingsOrder() {
    var o = getModelSettings().order;
    return (Object.prototype.toString.call(o) === '[object Array]') ? o : null;
  }
  function listDisplayName(m) {
    if (!m) return '';
    var ovr = settingsOverrideOf(m.id);
    if (ovr && typeof ovr.name === 'string' && ovr.name) return ovr.name;
    return m.name || m.id || '';
  }
  /* 过滤 disabled + 按 order 排序（order 在前者先排，未列入者按原顺序排后） */
  function applyListSettings(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) { if (!isDisabledId(list[i].id)) out.push(list[i]); }
    var order = settingsOrder();
    if (order && order.length) {
      var idx = {};
      for (i = 0; i < order.length; i++) { if (typeof order[i] === 'string') idx[order[i]] = i; }
      var head = [], tail = [];
      for (i = 0; i < out.length; i++) {
        if (Object.prototype.hasOwnProperty.call(idx, out[i].id)) head.push(out[i]);
        else tail.push(out[i]);
      }
      head.sort(function (a, b) { return idx[a.id] - idx[b.id]; });
      out = head.concat(tail);
    }
    return out;
  }

  /* ---------- R65：记忆（ai_memory，仅本对话页消费；localStorage 直读写 + try/catch 容错） ---------- */
  function getMemory() {
    var v = lsGet(MEMORY_KEY, []);
    if (Object.prototype.toString.call(v) !== '[object Array]') return [];
    var out = [];
    for (var i = 0; i < v.length; i++) { if (typeof v[i] === 'string' && v[i]) out.push(v[i]); }
    return out;
  }
  function saveMemoryItem(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (t.length > MEMORY_ITEM_MAX) t = t.slice(0, MEMORY_ITEM_MAX);
    var list = getMemory();
    list.push(t);
    if (list.length > MEMORY_MAX) list = list.slice(list.length - MEMORY_MAX);   // FIFO：超上限丢最旧
    lsSet(MEMORY_KEY, list);
    return true;
  }
  function deleteMemoryItem(idx) {
    var list = getMemory();
    var out = [];
    for (var i = 0; i < list.length; i++) { if (i !== idx) out.push(list[i]); }
    lsSet(MEMORY_KEY, out);
    renderMemoryList();
  }
  function clearMemoryAll() {
    confirmPopover('清空全部记忆？此操作不可撤销', function () {
      lsSet(MEMORY_KEY, []);
      renderMemoryList();
      toast('已清空全部记忆');
    });
  }
  function renderMemoryList() {
    var box = $('setMemoryList');
    if (!box) return;
    var list = getMemory();
    var cnt = $('setMemoryCount');
    if (cnt) cnt.textContent = String(list.length);
    var html = '';
    if (!list.length) {
      html = '<div style="font-size:12px;color:#999;padding:4px 0;">暂无记忆。在 AI 回答下方的操作里点「存入记忆」即可积累。</div>';
    } else {
      for (var i = 0; i < list.length; i++) {
        html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(128,128,128,.15);">' +
          '<span style="flex:1;min-width:0;font-size:12px;line-height:1.5;word-break:break-all;">' + escHtml(list[i]) + '</span>' +
          '<button type="button" data-mem-del="' + i + '" title="删除" style="flex:none;border:none;background:none;color:#e5484d;cursor:pointer;font-size:12px;padding:0 2px;">✕</button>' +
          '</div>';
      }
    }
    box.innerHTML = html;
  }
  /* 设置弹窗内动态注入「记忆管理」区块（与 MAX 开关 / 上下文 chips 同区；AI.html 不动，DOM 由本文件创建） */
  function ensureMemorySection() {
    var popup = $('settingsPopup');
    if (!popup) return;
    if ($('setMemoryList')) return;   // 已注入，幂等
    var anchor = $('setMaxSwitch');
    var group = anchor;
    while (group && group.parentNode && group.parentNode !== popup) group = group.parentNode;
    var box = doc.createElement('div');
    box.className = 'ai-form-group';
    box.innerHTML =
      '<div class="ai-form-label">记忆管理（存入的偏好会作为背景带给模型）</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:8px;">' +
        '<span class="ai-form-tip" style="margin:0">共 <span id="setMemoryCount">0</span> 条，上限 50 条，超出自动丢弃最早的。</span>' +
        '<button type="button" id="setMemoryClear" class="ai-btn ai-btn-ghost" style="padding:4px 10px;font-size:12px;flex:none;">清空全部</button>' +
      '</div>' +
      '<div id="setMemoryList" style="max-height:150px;overflow:auto;"></div>';
    if (group && group.parentNode) group.parentNode.insertBefore(box, group.nextSibling);
    else popup.appendChild(box);
    bindById('setMemoryClear', 'click', clearMemoryAll);
    var host = $('setMemoryList');
    if (host && host.addEventListener) {
      host.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== host && !(t.getAttribute && t.getAttribute('data-mem-del') !== null)) t = t.parentNode;
        if (!t || t === host) return;
        var idx = parseInt(t.getAttribute('data-mem-del'), 10);
        if (!isNaN(idx)) deleteMemoryItem(idx);
      });
    }
  }

  function getBuiltinModels() {
    if (typeof AI_CONFIG !== 'undefined' && AI_CONFIG && AI_CONFIG.builtinModels && AI_CONFIG.builtinModels.length) {
      return AI_CONFIG.builtinModels;
    }
    return FALLBACK_MODELS;
  }
  function getAllModels() {
    var builtin = getBuiltinModels().filter(function (m) { return m.id !== 'auto'; });
    var custom = getCustomModels();
    return builtin.concat(custom);
  }
  function getModelById(id) {
    var all = getAllModels();
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
    return null;
  }

  function toast(msg) {
    try { if (typeof showToast === 'function') { showToast(msg); return; } } catch (e) { /* 忽略 */ }
    var t = $('aiToast'); if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = 'none'; }, 2400);
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ============ 轻量 Markdown 渲染（自实现，无外部库） ============ */
  function inlineMd(s) {
    var parts = s.split('`');
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) { out += '<code>' + parts[i] + '</code>'; continue; }
      out += parts[i].replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }
    return out;
  }
  function renderMarkdown(text) {
    if (!text) return '';
    var lines = String(text).split('\n');
    var html = '';
    var para = [];
    var inCode = false, codeBuf = [];
    function flushPara() {
      if (para.length) { html += '<p>' + inlineMd(escHtml(para.join(' '))) + '</p>'; para = []; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (inCode) {
        if (/^```\s*$/.test(line)) { inCode = false; html += '<pre><code>' + escHtml(codeBuf.join('\n')) + '</code></pre>'; codeBuf = []; }
        else { codeBuf.push(line); }
        continue;
      }
      if (/^```/.test(line)) { flushPara(); inCode = true; codeBuf = []; continue; }
      if (/^###\s+/.test(line)) { flushPara(); html += '<h3>' + inlineMd(escHtml(line.replace(/^###\s+/, ''))) + '</h3>'; continue; }
      if (/^##\s+/.test(line)) { flushPara(); html += '<h2>' + inlineMd(escHtml(line.replace(/^##\s+/, ''))) + '</h2>'; continue; }
      if (/^#\s+/.test(line)) { flushPara(); html += '<h1>' + inlineMd(escHtml(line.replace(/^#\s+/, ''))) + '</h1>'; continue; }
      if (/^>\s?/.test(line)) { flushPara(); html += '<blockquote>' + inlineMd(escHtml(line.replace(/^>\s?/, ''))) + '</blockquote>'; continue; }
      if (/^[-*]\s+/.test(line)) {
        flushPara(); var ul = '<ul>';
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) { ul += '<li>' + inlineMd(escHtml(lines[i].replace(/^[-*]\s+/, ''))) + '</li>'; i++; }
        ul += '</ul>'; html += ul; i--; continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        flushPara(); var ol = '<ol>';
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { ol += '<li>' + inlineMd(escHtml(lines[i].replace(/^\d+\.\s+/, ''))) + '</li>'; i++; }
        ol += '</ol>'; html += ol; i--; continue;
      }
      if (line.trim() === '') { flushPara(); continue; }
      para.push(line.trim());
    }
    flushPara();
    if (inCode) { html += '<pre><code>' + escHtml(codeBuf.join('\n')) + '</code></pre>'; }
    return html;
  }

  /* ============ 输入区相关 ============ */
  function autoGrow() {
    if (!aiInput) return;
    aiInput.style.height = 'auto';
    aiInput.style.overflowY = 'hidden';
    var h = Math.min(aiInput.scrollHeight, 160);
    aiInput.style.height = h + 'px';
    if (aiInput.scrollHeight > 160) aiInput.style.overflowY = 'auto';
  }
  function updateSendEnabled() {
    if (!aiSendBtn) return;
    if (state.sending) { aiSendBtn.disabled = true; return; }
    // 有文字或有图就必须可点：只读当前值，不依赖任何缓存状态
    var v = aiInput ? String(aiInput.value || '').trim() : '';
    var empty = (!v && !state.image);
    aiSendBtn.disabled = empty;
  }
  function setSendBusy(busy) {
    if (busy) {
      state.sending = true;
      if (aiSendBtn) { aiSendBtn.disabled = true; aiSendBtn.classList.add('sending'); }
    } else {
      state.sending = false;
      if (aiSendBtn) aiSendBtn.classList.remove('sending');
      updateSendEnabled();
    }
  }
  function clearImage() {
    state.image = null;
    if (aiImgPreview) aiImgPreview.style.display = 'none';
    if (aiAttachBtn) aiAttachBtn.classList.remove('has-image');
    updateSendEnabled();
  }
  function handleFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请上传图片文件'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      state.image = e.target.result;
      if (aiImgThumb) aiImgThumb.src = state.image;
      if (aiImgPreview) aiImgPreview.style.display = 'inline-block';
      if (aiAttachBtn) aiAttachBtn.classList.add('has-image');
      updateSendEnabled();
    };
    reader.readAsDataURL(file);
  }

  /* 输入框在欢迎页（居中）与对话页（底部）之间移动 */
  function mountInput(toDock) {
    if (toDock) { if (aiDockInputSlot) aiDockInputSlot.appendChild(aiInputBox); }
    else { if (aiWelcomeInputSlot) aiWelcomeInputSlot.appendChild(aiInputBox); }
  }
  function enterConversation() { if (aiChat) aiChat.classList.add('in-conversation'); mountInput(true); updateSendEnabled(); }
  function enterWelcome() { if (aiChat) aiChat.classList.remove('in-conversation'); mountInput(false); updateSendEnabled(); }

  /* ============ 消息渲染 ============ */
  function scrollBottom() { if (aiMessages) aiMessages.scrollTop = aiMessages.scrollHeight; }

  /* 用户头像：优先真实头像图片（CURRENT_USER.avatarUrl，需 apiFileUrl 转换），
     没有则取昵称/用户名首字（原来固定写死"我"，所以看着像没有头像） */
  function userAvatarHtml() {
    var url = '';
    try {
      if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.avatarUrl) {
        url = (typeof apiFileUrl === 'function') ? apiFileUrl(CURRENT_USER.avatarUrl) : CURRENT_USER.avatarUrl;
      }
    } catch (e) { url = ''; }
    if (url) return '<img src="' + escHtml(url) + '" alt="头像">';
    var ch = '我';
    try {
      if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
        var n = CURRENT_USER.nickname || CURRENT_USER.username || '';
        if (n && n.charAt(0)) ch = n.charAt(0);
      }
    } catch (e2) { /* 忽略 */ }
    return escHtml(ch);
  }
  /* CURRENT_USER 是异步填充的，到位后刷新已渲染的用户头像 */
  function refreshUserAvatars() {
    if (!aiMessages) return;
    var list = aiMessages.querySelectorAll('.ai-avatar-user');
    for (var i = 0; i < list.length; i++) list[i].innerHTML = userAvatarHtml();
  }

  function addUserBubble(text, img) {
    var msg = doc.createElement('div'); msg.className = 'ai-msg ai-msg-user';
    var bubble = doc.createElement('div'); bubble.className = 'ai-bubble ai-bubble-user';
    if (img) { var im = doc.createElement('img'); im.className = 'ai-msg-img'; im.src = img; bubble.appendChild(im); }
    if (text) { var p = doc.createElement('div'); p.textContent = text; bubble.appendChild(p); }
    var av = doc.createElement('div'); av.className = 'ai-avatar ai-avatar-user';
    av.innerHTML = userAvatarHtml();
    msg.appendChild(bubble); msg.appendChild(av);
    aiMessages.appendChild(msg);
  }

  function addAiBubble() {
    var msg = doc.createElement('div'); msg.className = 'ai-msg ai-msg-ai';
    var av = doc.createElement('div'); av.className = 'ai-avatar ai-avatar-ai';
    av.innerHTML = SPARK_SVG;
    var bubble = doc.createElement('div'); bubble.className = 'ai-bubble ai-bubble-ai';
    var typing = doc.createElement('div'); typing.className = 'ai-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    var md = doc.createElement('div'); md.className = 'ai-md'; md.style.display = 'none';
    bubble.appendChild(typing); bubble.appendChild(md);
    msg.appendChild(av); msg.appendChild(bubble);
    aiMessages.appendChild(msg);
    return { el: msg, bubble: bubble, mdEl: md, typingEl: typing };
  }
  function removeTyping(b) {
    if (b.typingEl && b.typingEl.parentNode) { b.typingEl.parentNode.removeChild(b.typingEl); }
    b.mdEl.style.display = 'block';
  }
  function showMsgActions(b) {
    if (b.bubble.querySelector('.ai-msg-actions')) return;
    var acts = doc.createElement('div'); acts.className = 'ai-msg-actions';
    var copy = doc.createElement('button'); copy.className = 'ai-act'; copy.innerHTML = COPY_SVG + '复制';
    copy.addEventListener('click', function () { copyText(b.mdEl.innerText); toast('已复制'); });
    var regen = doc.createElement('button'); regen.className = 'ai-act'; regen.innerHTML = REGEN_SVG + '重新生成';
    regen.addEventListener('click', function () { regenerate(b); });
    var mem = doc.createElement('button'); mem.className = 'ai-act'; mem.innerHTML = MEM_SVG + '存入记忆';
    mem.addEventListener('click', function () {
      if (saveMemoryItem(b.mdEl.innerText)) toast('已存入记忆');
    });
    acts.appendChild(copy); acts.appendChild(regen); acts.appendChild(mem);
    b.bubble.appendChild(acts);
  }
  function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); return; } } catch (e) { /* 忽略 */ }
    try {
      var ta = doc.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select(); doc.execCommand('copy'); doc.body.removeChild(ta);
    } catch (e) { /* 忽略 */ }
  }

  /* ============ 调用 AI ============ */
  function predictFuncType(text, hasImage) {
    if (hasImage) return 'vision';
    if (getDeepThink()) return 'reasoning';
    var t = (text || '').toLowerCase();
    var mk = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG && AI_CONFIG.mathKeywords) ? AI_CONFIG.mathKeywords : FALLBACK_MATH;
    for (var i = 0; i < mk.length; i++) { if (t.indexOf(String(mk[i]).toLowerCase()) >= 0) return 'reasoning'; }
    var tk = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG && AI_CONFIG.translateKeywords) ? AI_CONFIG.translateKeywords : FALLBACK_TRANS;
    for (var j = 0; j < tk.length; j++) { if (t.indexOf(String(tk[j]).toLowerCase()) >= 0) return 'translate'; }
    return 'general';
  }

  function localFallback(text) {
    return '这是本地参考回答（未连接在线模型）。你可以：\n- 检查网络后重试\n- 在「设置」中填写自己的模型 Key\n- 在输入框下方的「模型」列表里更换模型\n\n如果你的问题是关于学习方法，建议先明确目标，再拆成小步骤逐步推进。';
  }

  function askAI(text, image) {
    var aiB = addAiBubble();
    scrollBottom();
    var funcType = predictFuncType(text, !!image);
    // 上下文长度：只带最近 N 轮（1 轮 = 1 条用户 + 1 条 AI），0 表示全部
    var all = state.messages.map(function (m) { return { role: m.role, content: m.content }; });
    var turns = getCtxTurns();
    var apiMessages = all;
    if (turns > 0) {
      var keep = turns * 2;
      apiMessages = (all.length > keep) ? all.slice(all.length - keep) : all;
    }
    // R65：记忆非空时在头部插入一条背景 system 消息（仅本对话页，不做任何自动提炼）
    var memList = getMemory();
    if (memList.length) {
      var memLines = ['以下是用户的背景与偏好，请在回答中参考：'];
      for (var mk = 0; mk < memList.length; mk++) memLines.push((mk + 1) + '. ' + memList[mk]);
      apiMessages = [{ role: 'system', content: memLines.join('\n') }].concat(apiMessages);
    }
    var fullText = '';
    var firstChunk = true;
    var opts = {
      image: image ? image : null,
      model: getSelectedModelId(),
      max: getMaxMode(),
      onChunk: function (delta, full) {
        if (firstChunk) { removeTyping(aiB); firstChunk = false; }
        fullText = full;
        aiB.mdEl.innerHTML = renderMarkdown(fullText);
        scrollBottom();
        renderCtxUsage();
      },
      onFallback: function (name) { toast('当前模型繁忙，已自动切换到 ' + name); },
      onModelUsed: function (id, name) { setUsedModel(aiB, id, name); }
    };
    if (typeof callAI !== 'function') {
      removeTyping(aiB);
      var svcMsg = 'AI 服务暂未就绪，请稍后重试。';
      aiB.mdEl.innerHTML = renderMarkdown(svcMsg);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: svcMsg });
      setSendBusy(false);
      saveCurrentChat();
      return;
    }
    callAI(funcType, apiMessages, opts).then(function (res) {
      var ft = (typeof res === 'string') ? res : fullText;
      if (!ft) ft = fullText;
      aiB.mdEl.innerHTML = renderMarkdown(ft);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: ft });
      setSendBusy(false);
      saveCurrentChat();
    }).catch(function (err) {
      removeTyping(aiB);
      var local = '（网络不佳，以下为本地参考）\n\n' + localFallback(text);
      aiB.mdEl.innerHTML = renderMarkdown(local);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: local });
      setSendBusy(false);
      saveCurrentChat();
      toast('网络不佳，以下为本地参考');
    });
  }

  function sendMessage() {
    if (state.sending) return;
    var text = aiInput ? String(aiInput.value || '').trim() : '';
    var hasImage = !!state.image;
    if (!text && !hasImage) return;
    if (!aiMessages) { toast('页面尚未就绪，请刷新后重试'); return; }
    setSendBusy(true);
    try {
      enterConversation();
      var userMsg = { role: 'user', content: text };
      state.messages.push(userMsg);
      if (hasImage) userMsg.image = state.image;
      addUserBubble(text, hasImage ? state.image : null);
      if (aiInput) { aiInput.value = ''; autoGrow(); }
      var img = state.image;
      clearImage();
      renderCtxUsage();
      askAI(text, img);
    } catch (err) {
      // 任何异常都不能静默吞掉这一次点击：恢复可用态 + 气泡里给提示
      setSendBusy(false);
      var em = '发送失败：' + (err && err.message ? err.message : '未知错误');
      try {
        var b = addAiBubble(); removeTyping(b);
        b.mdEl.innerHTML = renderMarkdown(em);
        showMsgActions(b);
        scrollBottom();
      } catch (e2) { /* 渲染也失败就只提示 */ }
      toast(em);
    }
  }

  function regenerate(b) {
    if (state.sending) return;
    var lastUser = null;
    for (var i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === 'user') { lastUser = state.messages[i]; break; }
    }
    if (!lastUser) return;
    if (state.messages.length && state.messages[state.messages.length - 1].role === 'ai') { state.messages.pop(); }
    if (b.el && b.el.parentNode) { b.el.parentNode.removeChild(b.el); }
    setSendBusy(true);
    askAI(lastUser.content, lastUser.image);
  }

  /* ============ 历史对话 ============ */
  function saveCurrentChat() {
    var msgs = state.messages;
    if (!msgs || msgs.length === 0) return;
    var firstUser = null;
    for (var i = 0; i < msgs.length; i++) { if (msgs[i].role === 'user') { firstUser = msgs[i]; break; } }
    if (!firstUser) return;
    var title = firstUser.image ? '图片提问' : (firstUser.content || '').slice(0, 20);
    if (!title) title = '新对话';
    var store = msgs.map(function (m) {
      var o = { role: m.role, content: m.content };
      if (m.image) o.hasImage = true;
      return o;
    });
    var list = getHistory();
    var id = state.chatId;
    if (!id) { id = 'chat_' + Date.now(); state.chatId = id; }
    var chat = { id: id, title: title, createdAt: Date.now(), updatedAt: Date.now(), messages: store };
    var idx = -1;
    for (var j = 0; j < list.length; j++) { if (list[j].id === id) { idx = j; break; } }
    if (idx >= 0) list[idx] = chat; else list.unshift(chat);
    if (list.length > 50) list = list.slice(0, 50);
    lsSet(HISTORY_KEY, list);
    renderHistory();
  }

  function renderHistory() {
    if (!aiHistoryList) return;
    var list = getHistory();
    if (aiHistory) aiHistory.classList.toggle('is-empty', list.length === 0);
    aiHistoryList.innerHTML = '';
    list.forEach(function (chat) {
      var row = doc.createElement('div');
      row.className = 'ai-hist-item-row' + (chat.id === state.chatId ? ' active' : '');
      row.setAttribute('data-title', chat.title || '');
      row.innerHTML = '<span class="ai-hist-title">' + escHtml(chat.title) + '</span>' +
        '<button class="ai-hist-del" title="删除">✕</button>';
      var del = row.querySelector('.ai-hist-del');
      del.addEventListener('click', function (ev) { ev.stopPropagation(); deleteOne(chat.id); });
      row.addEventListener('click', function () { loadChat(chat.id); });
      aiHistoryList.appendChild(row);
    });
  }

  function deleteOne(id) {
    confirmPopover('删除这条对话？', function () {
      var list = getHistory().filter(function (c) { return c.id !== id; });
      lsSet(HISTORY_KEY, list);
      if (state.chatId === id) { state.chatId = null; resetToWelcome(); }
      renderHistory();
    });
  }

  function loadChat(id) {
    var list = getHistory();
    var chat = null;
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { chat = list[i]; break; } }
    if (!chat) return;
    state.chatId = id;
    state.messages = [];
    state.image = null; clearImage();
    if (aiMessages) aiMessages.innerHTML = '';
    chat.messages.forEach(function (m) {
      if (m.role === 'user') {
        state.messages.push({ role: 'user', content: m.content, image: m.hasImage ? m.content : null });
        addUserBubble(m.content, null);
      } else {
        state.messages.push({ role: 'ai', content: m.content });
        var b = addAiBubble(); removeTyping(b);
        b.mdEl.innerHTML = renderMarkdown(m.content); showMsgActions(b);
      }
    });
    enterConversation();
    if (aiHistory) aiHistory.classList.remove('open');
    if (aiSidebarOverlay) aiSidebarOverlay.classList.remove('open');
    scrollBottom();
    renderCtxUsage();
  }

  function resetToWelcome() {
    state.messages = [];
    state.chatId = null;
    state.image = null; clearImage();
    if (aiInput) { aiInput.value = ''; autoGrow(); }
    if (aiMessages) aiMessages.innerHTML = '';
    enterWelcome();
    renderCtxUsage();
  }

  /* 新建对话：点击即创建，不弹任何确认；已有内容照常存进历史 */
  function startNewChat() {
    if (state.messages.length > 0) { saveCurrentChat(); }
    resetToWelcome();
    try { aiInput.focus(); } catch (e) { /* 忽略 */ }
  }
  function confirmClear() {
    confirmPopover('清除所有对话？此操作不可撤销', function () {
      lsSet(HISTORY_KEY, []);
      state.chatId = null;
      resetToWelcome();
      toast('已清除所有对话');
    });
  }

  /* ============ 侧栏用户区 & 搜索 ============ */
  function applyUserInfo() {
    var nick = '学';
    try {
      if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
        if (CURRENT_USER.nickname) nick = CURRENT_USER.nickname;
        else if (CURRENT_USER.username) nick = CURRENT_USER.username;
      }
    } catch (e) { /* 忽略 */ }
    if (aiUserAvatar) aiUserAvatar.innerHTML = userAvatarHtml();
    if (aiUserName) aiUserName.textContent = nick;
    refreshUserAvatars();   // 用户信息到位后，把消息流里的用户头像换成真实头像
  }
  function applyUserInfoRetry() {
    applyUserInfo();
    var ready = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER);
    if (!ready && userInfoTries < 3) { userInfoTries++; setTimeout(applyUserInfoRetry, 500); }
  }
  function toggleUserMenu() {
    if (!aiUserMenu) return;
    var open = aiUserMenu.classList.contains('open');
    if (open) aiUserMenu.classList.remove('open'); else aiUserMenu.classList.add('open');
  }
  function closeUserMenu() { if (aiUserMenu) aiUserMenu.classList.remove('open'); }

  /* ============ 模型选择 ============ */
  /* 输入框标签与侧栏「模型」入口共用同一个名字（不写死，始终由选中项推导） */
  function currentModelName() {
    var modeInfo = getModeInfo(getModeKey());
    if (modeInfo) return plainModeLabel(modeInfo);   // R65：模式生效时优先显示模式名（R67/B 去图标/Emoji）
    var id = getSelectedModelId();
    if (id === 'auto') return '自动';
    var m = getModelById(id);
    if (m) return listDisplayName(m);      // R64/N5：overrides.name 优先
    var ovr = settingsOverrideOf(id);
    if (ovr && typeof ovr.name === 'string' && ovr.name) return ovr.name;
    return '自动';
  }
  function updateModelLabel() {
    var nm = currentModelName();
    if (aiModelLabel) aiModelLabel.textContent = nm;
    var sideBtn = $('aiModelInfoBtn');
    if (sideBtn) {
      var lb = sideBtn.querySelector('.ai-foot-label');
      if (lb) lb.textContent = '模型 · ' + nm;
      sideBtn.setAttribute('title', '当前模型：' + nm + '（点击查看介绍）');
    }
  }
  /* ---------- R66/N5 + R67/A/B：上下文用量显示（紧凑圆环指示器 + 悬浮完整说明） ---------- */
  /* 上限：模式生效 → chain[0] 模型 maxTokens；MAX 开启 → 8000；否则当前选中模型（内置→自定义）；全缺 → 1000 */
  function modelMaxTokens(id) {
    if (!id) return 0;
    var all = getAllModels();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].id === id) {
        var v = parseInt(all[i].maxTokens, 10);
        if (!isNaN(v) && v > 0) return v;
      }
    }
    return 0;
  }
  function getCtxLimit() {
    var mode = getModeKey();
    if (mode) {
      var defs = getModeDefs();
      if (defs && defs[mode] && defs[mode].chain && defs[mode].chain.length) {
        var mt = modelMaxTokens(defs[mode].chain[0]);
        if (mt > 0) return mt;
      }
    }
    if (getMaxMode()) return 8000;
    var mt2 = modelMaxTokens(getSelectedModelId());
    if (mt2 > 0) return mt2;
    return 1000;
  }
  /* 估算 token：中文（CJK）1 字 ≈ 1 token；非中文每 4 字符 ≈ 1 token（向上取整后求和） */
  function estimateTokens(text) {
    var s = String(text || '');
    var cjk = 0, other = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
          (c >= 0x3000 && c <= 0x30FF) || (c >= 0xFF00 && c <= 0xFFEF)) cjk++;
      else other++;
    }
    return cjk + Math.ceil(other / 4);
  }
  function ctxUsedTokens() {
    var used = 0;
    if (state.messages) {
      for (var i = 0; i < state.messages.length; i++) {
        used += estimateTokens(state.messages[i] ? state.messages[i].content : '');
      }
    }
    if (aiInput) used += estimateTokens(aiInput.value);
    return used;
  }
  /* 数字缩写：≥1000 用 k（保留 1 位小数，整数不显示 .0）；<1000 显示原数 */
  function fmtTokenCount(n) {
    n = Math.round(n);
    if (!isFinite(n) || n < 0) n = 0;
    if (n >= 1000) {
      var s = (n / 1000).toFixed(1);
      if (s.length > 2 && s.slice(s.length - 2) === '.0') s = s.slice(0, s.length - 2);
      return s + 'k';
    }
    return String(n);
  }
  /* R67/A：上限恒用 K 单位、保留 1 位小数（1000→1.0K、8192→8.2K、1000000→1000.0K） */
  function fmtCtxLimitK(n) {
    n = Number(n);
    if (!isFinite(n) || n <= 0) n = 1000;
    return (n / 1000).toFixed(1) + 'K';
  }
  /* R67/D：hover 提示只留进度信息（已用 N% · X / Y.YK）；估算与阈值说明按用户要求移除（原提示常量已删） */
  /* R67/B 圆环几何常量：viewBox 24、r=9、stroke-width 2.5（SVG dasharray 方案，兼容安卓老 WebView，不用 conic 渐变） */
  var CTX_RING_C = 2 * Math.PI * 9;
  /* 渲染用量（R67/B：紧凑圆环指示器 = SVG 进度环 + 旁侧超短百分比标签，整体 ~44px 内，不再占长条文本空间）。
     title 悬浮只留进度（R67/D）；阈值沿用 R66：>80% 橙（warn）、>95% 红（hot）。 */
  function renderCtxUsage() {
    var el = $('aiCtxUsage');
    if (!el) return;
    var used = ctxUsedTokens();
    if (!isFinite(used) || used < 0) used = 0;
    var limit = getCtxLimit();
    var ratio = (limit > 0) ? (used / limit) : 0;
    var pct = used * 100 / (limit > 0 ? limit : 1);
    /* 进度弧长 = 百分比 × 周长；超限封顶 100% 满环（标签仍显示真实百分比，可 >100%） */
    var arc = Math.max(0, Math.min(100, ratio * 100)) / 100 * CTX_RING_C;
    el.innerHTML =
      '<svg class="ai-ctx-ring" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
        '<circle class="ai-ctx-ring-bg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5"></circle>' +
        '<circle class="ai-ctx-ring-fg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="' + arc.toFixed(2) + ' ' + CTX_RING_C.toFixed(2) + '" transform="rotate(-90 12 12)"></circle>' +
      '</svg><span class="ai-ctx-pct">' + Math.round(pct) + '%</span>';
    el.className = 'ai-ctx-usage' + (ratio > 0.95 ? ' hot' : (ratio > 0.8 ? ' warn' : ''));
    /* R67/D 短提示：整数百分比 + 已用（<1000 原数 / ≥1000 K 一位小数）+ 上限 K */
    var usedTxt = (used >= 1000) ? (used / 1000).toFixed(1) + 'K' : String(Math.round(used));
    el.title = '已用 ' + Math.round(pct) + '% · ' + usedTxt + ' / ' + fmtCtxLimitK(limit);
  }

  /* ============ 模型列表面板（替代原弹窗） ============ */
  /* ---------- R64/N6：模型说明数据优先级 overrides > AI_CONFIG.modelDetails > 本地兜底 ---------- */
  function getDetail(id) {
    var d = {};
    var k;
    var base = (id && MODEL_DETAILS[id]) ? MODEL_DETAILS[id] : null;
    if (base) { for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) d[k] = base[k]; } }
    var cfgD = null;
    try {
      if (typeof AI_CONFIG !== 'undefined' && AI_CONFIG && AI_CONFIG.modelDetails && AI_CONFIG.modelDetails[id]) cfgD = AI_CONFIG.modelDetails[id];
    } catch (e) { cfgD = null; }
    if (cfgD) { for (k in cfgD) { if (Object.prototype.hasOwnProperty.call(cfgD, k)) d[k] = cfgD[k]; } }
    var ovr = settingsOverrideOf(id);
    if (ovr) { for (k in ovr) { if (Object.prototype.hasOwnProperty.call(ovr, k)) d[k] = ovr[k]; } }
    return d;
  }
  /* 星级显示归一：整数 1-5 → ★/☆ 串；字符串（本地兜底旧格式 / overrides 自定义）原样 */
  function starsText(v) {
    if (typeof v === 'number' && isFinite(v) && v >= 1) {
      var n = Math.floor(v);
      if (n > 5) n = 5;
      var s = '';
      for (var i = 0; i < 5; i++) s += (i < n) ? '★' : '☆';
      return s;
    }
    if (typeof v === 'string' && v) return v;
    return '';
  }
  function getModelRate(m) {
    if (m && m.id === 'auto') return RATE_FALLBACK['auto'];   // 自动档显示「自适应」
    if (m && m.rate) return m.rate;                 // 优先读底座 AI_CONFIG.builtinModels[i].rate
    if (m && m.id && RATE_FALLBACK[m.id]) return RATE_FALLBACK[m.id];
    return '1x';
  }
  function modelRow(m, isSel) {
    var row = doc.createElement('div');
    row.className = 'ai-mp-row' + (isSel ? ' sel' : '');
    row.setAttribute('data-id', m.id);
    var d = getDetail(m && m.id);
    var dn = listDisplayName(m);
    var ic = (dn && dn.charAt(0)) ? dn.charAt(0).toUpperCase() : '?';
    row.innerHTML =
      '<span class="ai-mp-ic">' + escHtml(ic) + '</span>' +
      '<div class="ai-mp-row-main"><div class="ai-mp-name">' + escHtml(dn) + '</div></div>' +
      '<div class="ai-mp-right">' +
        '<span class="ai-mp-rate">' + escHtml(getModelRate(m)) + '</span>' +
        '<span class="ai-mp-check">' + CHECK_SVG + '</span>' +
      '</div>';
    row.addEventListener('click', function (ev) {
      if (useInlineDetail()) {
        // 窄屏/触摸：点行=展开该行下方的详情（选择走详情里的「使用此模型」）
        try { ev.stopPropagation(); } catch (e) { /* 老内核无 stopPropagation 入参保护 */ }
        toggleRowDetail(row, m);
        return;
      }
      selectModel(m.id);
    });
    row.addEventListener('mouseenter', function () { if (!useInlineDetail()) showModelDetail(m, d); });
    return row;
  }

  /* —— 详情展示模式 ——
     桌面（有 hover）：贴面板右侧的悬浮卡，hover 行即显示（保持 DeepSeek 观感）。
     窄屏 / 触摸设备：没有 hover、右侧浮层必然被裁 → 改为「点行 → 行下方行内展开」。 */
  var detailInline = false, detailAnchor = null;
  function useInlineDetail() {
    if (window.innerWidth <= 768) return true;
    try { if (window.matchMedia && window.matchMedia('(hover: none)').matches) return true; } catch (e) { /* 老内核不支持该查询，按宽屏处理 */ }
    return false;
  }
  /* 把详情节点搬回面板（悬浮模式原位） */
  function restoreDetail() {
    var box = $('aiMpDetail'); if (!box) return;
    box.classList.remove('inline');
    var host = $('aiModelPanel');
    if (host && box.parentNode !== host) {
      var add = $('aiCustomEntry');
      if (add && add.parentNode === host) host.insertBefore(box, add);
      else host.appendChild(box);
    }
    detailInline = false; detailAnchor = null;
  }
  function hideInlineDetail() { hideModelDetail(); restoreDetail(); }
  function toggleRowDetail(row, m) {
    if (!row) return;
    if (detailInline && detailAnchor === row) { hideInlineDetail(); return; }
    var d = getDetail(m && m.id);
    showModelDetail(m, d, row);
  }
  function scrollDetailIntoView(box) {
    try {
      var list = $('aiModelList');
      if (!list || !list.getBoundingClientRect) return;
      var rb = box.getBoundingClientRect(), rl = list.getBoundingClientRect();
      if (rb.bottom > rl.bottom) list.scrollTop += (rb.bottom - rl.bottom) + 8;
      else if (rb.top < rl.top) list.scrollTop -= (rl.top - rb.top) + 8;
    } catch (e) { /* 忽略滚动异常 */ }
  }

  /* 悬停详情浮层（对齐 DeepSeek：列表只放名字+倍率，详细信息 hover 才出现）；
     anchorRow 存在时走「行内展开」 */
  function showModelDetail(m, d, anchorRow) {
    var box = $('aiMpDetail'); if (!box) return;
    var isAuto = (m.id === 'auto');
    var desc;
    if (isAuto) {
      desc = '按问题类型自动选最优模型：数学走推理模型、翻译走翻译模型、带图走视觉模型，其余走通用快速模型。';
    } else {
      var parts = [];
      if (d.type) parts.push(d.type);
      if (d.advantage) parts.push(d.advantage);
      if (d.applicable) parts.push('适用：' + d.applicable);
      desc = parts.join('，') || (m.custom ? '自定义接入的模型' : '通用对话模型');
    }
    var rows = [];
    rows.push(['消耗速度', getModelRate(m) + (isAuto ? '' : ' 倍率'), true]);
    if (!isAuto) {
      if (d.platform || m.provider) rows.push(['平台', d.platform || m.provider, false]);
      if (d.params) rows.push(['参数规模', d.params, false]);
      var st = starsText(d.stars);
      if (st) rows.push(['评分', st, false]);
      if (m.model) rows.push(['模型 ID', m.model, false]);
    }
    var inline = (anchorRow && useInlineDetail());
    var h = '<div class="ai-mp-d-name">' + escHtml(m.name) + '</div>' +
      '<div class="ai-mp-d-desc">' + escHtml(desc) + '</div>' +
      '<div class="ai-mp-d-sec">';
    for (var i = 0; i < rows.length; i++) {
      h += '<div class="ai-mp-d-row"><span class="ai-mp-d-k">' + escHtml(rows[i][0]) + '</span>' +
        '<span class="ai-mp-d-v' + (rows[i][2] ? ' hl' : '') + '">' + escHtml(rows[i][1]) + '</span></div>';
    }
    h += '</div>';
    if (inline) h += '<button type="button" class="ai-mp-d-use">使用此模型</button>';
    box.innerHTML = h;
    if (inline) {
      box.classList.add('inline');
      var host = anchorRow.parentNode;
      if (host && box.parentNode !== host) host.appendChild(box);
      if (host) {
        var nx = anchorRow.nextSibling;
        if (nx && nx !== box) host.insertBefore(box, nx);
        else if (!nx) host.appendChild(box);
      }
      detailInline = true; detailAnchor = anchorRow;
      var ub = box.querySelector('.ai-mp-d-use');
      if (ub) ub.addEventListener('click', function (ev) {
        try { ev.stopPropagation(); } catch (e) { /* 老内核保护 */ }
        selectModel(m.id);
      });
      box.classList.add('open');
      scrollDetailIntoView(box);
    } else {
      if (detailInline) restoreDetail();
      box.classList.add('open');
    }
  }
  function hideModelDetail() {
    var box = $('aiMpDetail'); if (box) box.classList.remove('open');
  }
  function onPanelMouseLeave() { if (!useInlineDetail()) hideModelDetail(); }
  /* ---------- R65/R66/R67：三模式行（面板顶部；R66 删副标题小字；R67/B 删行首图标/Emoji，只留纯文字模式名） ---------- */
  var MODE_ORDER = ['fast', 'balanced', 'ultimate'];
  /* R67/B：模式名显示剥离行首装饰符号/Emoji（图标/Emoji 等）。ai-config.js 只读 → 剥离统一放渲染层；
     面板行（modeRow）、输入框标签（currentModelName）、切换 toast 三处共用，保证口径一致。 */
  function plainModeLabel(info) {
    var s = (info && info.label) ? String(info.label) : '';
    return s.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '');
  }
  function modeRow(key) {
    var info = getModeInfo(key);
    if (!info) return null;
    var row = doc.createElement('div');
    row.className = 'ai-mp-row ai-mp-mode' + (getModeKey() === key ? ' sel' : '');
    row.setAttribute('data-mode', key);
    row.innerHTML =
      '<div class="ai-mp-row-main"><div class="ai-mp-name">' + escHtml(plainModeLabel(info)) + '</div></div>' +
      '<div class="ai-mp-right"><span class="ai-mp-check">' + CHECK_SVG + '</span></div>';
    row.addEventListener('click', function (ev) {
      try { ev.stopPropagation(); } catch (e) { /* 老内核保护 */ }
      selectMode(key);
    });
    return row;
  }
  function selectMode(key) {
    var info = getModeInfo(key);
    if (!info) return;
    setModeKey(key);
    setDeepThink(false);   // 模式与深度思考互斥（对齐手动选模型的互斥风格）
    toast('已切到 ' + plainModeLabel(info));   // R67/B：toast 同步去 Emoji，与面板/标签口径一致
    renderModelList();
    updateModelLabel();
    renderCtxUsage();
    closeModelPanel();
  }
  /* R64/N4：disabled 过滤 + order 排序 + overrides.name 显示都发生在渲染层
     （getBuiltinModels/getAllModels 保持全量，供选中/名称解析使用） */
  function renderModelList() {
    var list = $('aiModelList'); if (!list) return;
    restoreDetail();            // 详情节点若正行内展开在列表里，先搬回面板，避免被 innerHTML 清空
    list.innerHTML = '';
    var sel = getSelectedModelId();
    var manual = (getModeKey() === '');   // R65：模式生效时模式优先，手动模型行不高亮
    var hasModes = false;
    for (var mo = 0; mo < MODE_ORDER.length; mo++) {
      var mrow = modeRow(MODE_ORDER[mo]);
      if (mrow) { list.appendChild(mrow); hasModes = true; }
    }
    if (hasModes) {
      var sep = doc.createElement('div');
      sep.style.cssText = 'height:1px;background:rgba(128,128,128,.28);margin:6px 4px;flex:none;';
      list.appendChild(sep);
    }
    list.appendChild(modelRow({ id: 'auto', name: '自动（推荐）' }, manual && sel === 'auto'));
    var combined = applyListSettings(getBuiltinModels().filter(function (m) { return m.id !== 'auto'; }).concat(getCustomModels()));
    combined.forEach(function (m) { list.appendChild(modelRow(m, manual && sel === m.id)); });
  }
  /* customMsg：由调用方指定的提示文案（保存自定义模型时用「已添加并启用 XXX」） */
  function selectModel(id, customMsg) {
    setModeKey('');              // R65：手动选具体模型 → 退出三模式
    setSelectedModelId(id);
    var m = getModelById(id);
    var nm = m ? listDisplayName(m) : '自动';
    if (getDeepThink()) {
      // 深度思考与模型选择互斥（对齐 DeepSeek：点选模型即退出深度思考，不再锁定拒绝）
      setDeepThink(false);
      toast(customMsg || ('已切换到 ' + nm + '，深度思考已关闭'));
    } else {
      toast(customMsg || ('已切换到 ' + nm));
    }
    renderModelList();
    updateModelLabel();
    renderCtxUsage();
    closeModelPanel();
  }
  function updateMaxSwitch() {
    if (aiMaxSwitch) aiMaxSwitch.classList.toggle('on', getMaxMode());
    renderSetMaxSwitch();
  }
  function toggleMax() {
    var on = !getMaxMode();
    setMaxMode(on);
    if (on) setDeepThink(true);   // R65：开 MAX 自动开深度思考（关 MAX 不动深度思考）
    updateMaxSwitch();
    renderCtxUsage();
    toast(on ? 'MAX 模式已开启：深度思考+更详细回答' : 'MAX 模式已关闭');
  }
  function openModelPanel() {
    renderModelList(); updateMaxSwitch();
    var e = $('aiModelPanel'); if (!e) return;
    e.classList.add('open');
    layoutModelPanel();
  }
  /* R66/N4：面板限高 + 视口内定位。
     - 内部滚动：列表 max-height 由可用空间收敛（面板本身 CSS 兜底 max-height + overflow-y:auto）；
     - 水平：默认左边对齐输入框，右侧可能溢出时贴右对齐；
     - 垂直：默认朝上弹出，上方空间不足且下方更宽裕时翻转到下方。 */
  function layoutModelPanel() {
    var panel = $('aiModelPanel');
    var host = $('aiInputBox');
    if (!panel || !host || !host.getBoundingClientRect) return;
    try {
      var hb = host.getBoundingClientRect();
      var vw = window.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 375;
      var vh = window.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 600;
      // topbar 高度实测（移动端媒体查询下不止 56px），再扣面板间距与 head/add 行外壳高度
      var tb = doc.querySelector('.ai-topbar');
      var tbH = (tb && tb.offsetHeight) ? tb.offsetHeight : 60;
      var gap = 10;
      var avail = Math.max(140, Math.min(320, hb.top - tbH - 120));
      var list = $('aiModelList');
      if (list) list.style.maxHeight = avail + 'px';
      // 水平对齐
      var pw = panel.offsetWidth || 300;
      if (hb.left + pw > vw - 8) { panel.style.left = 'auto'; panel.style.right = '0'; }
      else { panel.style.left = '0'; panel.style.right = 'auto'; }
      // 垂直翻转
      var ph = panel.offsetHeight || 240;
      var spaceAbove = hb.top - tbH - gap - 8;
      var spaceBelow = vh - hb.bottom - gap - 8;
      if (spaceAbove < ph && spaceBelow > spaceAbove) {
        panel.style.top = 'calc(100% + ' + gap + 'px)';
        panel.style.bottom = 'auto';
      } else {
        panel.style.bottom = 'calc(100% + ' + gap + 'px)';
        panel.style.top = 'auto';
      }
    } catch (ex2) { /* 忽略，兜底走 CSS 的 max-height / 320px */ }
  }
  function closeModelPanel() { hideModelDetail(); restoreDetail(); var e = $('aiModelPanel'); if (e) e.classList.remove('open'); }
  /* R66/N3：原 R65 在模型面板内注入的「🧠 记忆管理」入口行已移除（记忆管理功能迁移到模型设置页 ai-settings.html）。
     下方 openSettings() / 设置弹窗 DOM / ensureMemorySection() / openSettingsFromSidebar() 等一律保留不删：
     它们仍是设置弹窗的既有实现，即便对话页暂时没有直接入口，也绝不删除，以免影响其它潜在调用（允许存在死代码）。 */
  function toggleModelPanel() {
    var e = $('aiModelPanel'); if (!e) return;
    if (e.classList.contains('open')) closeModelPanel(); else openModelPanel();
  }
  /* 收起移动端抽屉 + 遮罩（桌面端没有 open 态，调用无副作用） */
  function closeSidebar() {
    if (aiHistory) aiHistory.classList.remove('open');
    if (aiSidebarOverlay) aiSidebarOverlay.classList.remove('open');
  }
  /* 侧栏「模型」入口：与输入框里的 #aiModelBtn 复用同一个 #aiModelPanel，
     只是先收抽屉 + 关遮罩再开，否则窄屏下面板被 .ai-sidebar-overlay(250) /
     .ai-history(260) 整个盖住＝点了没反应 */
  function toggleModelPanelFromSidebar() {
    var e = $('aiModelPanel');
    var willOpen = !(e && e.classList.contains('open'));
    closeSidebar();
    closeUserMenu();
    if (willOpen) openModelPanel(); else closeModelPanel();
  }
  /* 侧栏「设置」入口：先收抽屉再开弹窗，避免关掉设置后抽屉还挂在背景里 */
  function openSettingsFromSidebar() { closeSidebar(); closeUserMenu(); openSettings(); }
  /* 侧栏「添加模型」入口（原「模型设置」）：R63 起改为跳独立设置页（原为打开自定义模型弹窗）；R66 文案改为「添加模型」 */
  function openAddModelFromSidebar() {
    closeSidebar(); closeUserMenu();
    location.href = 'ai-settings.html';
  }

  /* ============ 模型介绍弹窗（R63 起入口已迁至 ai-settings.html，此实现保留备用，不再被侧栏调用） ============ */
  function openModelIntroFromSidebar() {
    closeSidebar();
    closeUserMenu();
    openModelIntro();
  }
  function openModelIntro() {
    renderModelIntro();
    openOverlay('modelIntroOverlay');
    openPopup('modelIntroPopup');
  }
  function closeModelIntro() {
    closePopup('modelIntroPopup');
    closeOverlay('modelIntroOverlay');
  }
  function renderModelIntro() {
    var list = $('modelIntroList'); if (!list) return;
    var html = '';
    var all = [{ id: 'auto', name: '自动（推荐）', provider: null, model: null, types: ['general', 'math', 'image', 'translate'], tag: null, fallback: null }].concat(getAllModels());
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      var d = getDetail(m.id);
      var tagText = m.id === 'auto' ? '自动' : (m.custom ? '自定义' : '内置');
      var tagClass = m.id === 'auto' ? 'auto' : (m.custom ? 'custom' : '');
      var meta = [];
      if (m.id === 'auto') {
        meta.push('根据问题类型自动选择');
      } else {
        if (d.platform || m.provider) meta.push(d.platform || m.provider);
        if (d.type) meta.push(d.type);
        if (d.params) meta.push(d.params);
        meta.push(getModelRate(m));
      }
      var desc = [];
      if (m.id === 'auto') {
        desc.push('按问题类型自动选最优模型：数学/推理走 DeepSeek-R1，英语翻译走混元 MT，发图提问走视觉模型，其余走通用快速模型。');
      } else {
        if (d.advantage) desc.push(d.advantage);
        if (d.applicable) desc.push('适用：' + d.applicable);
        if (m.model) desc.push('模型 ID：' + m.model);
      }
      html += '<div class="ai-intro-item">' +
        '<div class="ai-intro-head">' +
          '<div class="ai-intro-name">' + escHtml(listDisplayName(m)) + '</div>' +
          '<div class="ai-intro-tag ' + tagClass + '">' + escHtml(tagText) + '</div>' +
        '</div>' +
        '<div class="ai-intro-meta">' + meta.map(function(s){ return '<span>' + escHtml(s) + '</span>'; }).join('') + '</div>' +
        '<div class="ai-intro-desc">' + desc.map(function(s){ return '<p>' + escHtml(s) + '</p>'; }).join('') + '</div>' +
      '</div>';
    }
    list.innerHTML = html || '<div class="ai-intro-empty">暂无模型介绍</div>';
  }

  /* ============ 自定义模型 ============ */
  /* 服务商预设：高亮 + 填地址 + 换模型 ID 示例 */
  function getPreset(key) {
    for (var i = 0; i < CM_PRESETS.length; i++) { if (CM_PRESETS[i].key === key) return CM_PRESETS[i]; }
    return null;
  }
  function matchPresetByUrl(url) {
    if (!url) return '';
    for (var i = 0; i < CM_PRESETS.length; i++) {
      var u = CM_PRESETS[i].url;
      if (u && url.indexOf(u) >= 0) return CM_PRESETS[i].key;
    }
    return '';
  }
  function renderProviderOptions() {
    var sel = $('cmProvider'); if (!sel) return;
    var html = '';
    for (var i = 0; i < CM_PRESETS.length; i++) {
      html += '<option value="' + escHtml(CM_PRESETS[i].key) + '">' + escHtml(CM_PRESETS[i].label) + '</option>';
    }
    sel.innerHTML = html;
  }
  function updateModelHint(p) {
    var hint = $('cmModelHint');
    if (!hint) return;
    if (p && p.models && p.models.length) {
      hint.textContent = '选择常用模型，或选「自定义」手动填写平台文档里的模型标识。';
    } else {
      hint.textContent = '平台文档里的模型标识，如 gpt-4o-mini。';
    }
  }
  function renderModelOptions(key, selectedId) {
    var sel = $('cmModelSelect'); if (!sel) return;
    var man = $('cmModelId');
    var p = getPreset(key);
    if (p && p.models && p.models.length) {
      var html = '';
      for (var i = 0; i < p.models.length; i++) {
        html += '<option value="' + escHtml(p.models[i].id) + '">' + escHtml(p.models[i].name) + '</option>';
      }
      html += '<option value="__custom__">自定义（手动输入）</option>';
      sel.innerHTML = html;
      sel.style.display = '';
      if (man) man.style.display = 'none';
      if (selectedId) {
        var found = false;
        for (var j = 0; j < p.models.length; j++) { if (p.models[j].id === selectedId) { found = true; break; } }
        if (found) sel.value = selectedId;
        else { sel.value = '__custom__'; if (man) { man.style.display = ''; man.value = selectedId; } }
      } else {
        sel.value = p.models[0].id;
      }
    } else {
      sel.innerHTML = '<option value="__custom__">自定义（手动输入）</option>';
      sel.style.display = 'none';
      if (man) { man.style.display = ''; if (selectedId) man.value = selectedId; else man.value = ''; }
    }
    updateModelHint(p);
  }
  function onProviderChange() {
    var sel = $('cmProvider'); if (!sel) return;
    var p = getPreset(sel.value);
    if (p) {
      setVal('cmApiUrl', p.url);
      renderModelOptions(p.key, '');
      var man = $('cmModelId'); if (man) man.value = '';
    }
  }
  function onModelSelectChange() {
    var sel = $('cmModelSelect'); var man = $('cmModelId');
    if (!sel || !man) return;
    if (sel.value === '__custom__') { man.style.display = ''; man.focus(); }
    else { man.style.display = 'none'; man.value = ''; }
  }
  function getCmModelId() {
    var sel = $('cmModelSelect');
    if (sel && sel.style.display !== 'none' && sel.value !== '__custom__') return sel.value;
    var man = $('cmModelId'); return man ? String(man.value || '').trim() : '';
  }
  /* applyUrl=true 才写地址（编辑态只高亮+换选项，不覆盖用户已有地址） */
  function applyPreset(key, applyUrl) {
    var p = getPreset(key); if (!p) return;
    var prov = $('cmProvider'); if (prov) prov.value = p.key;
    if (applyUrl) setVal('cmApiUrl', p.url);
    renderModelOptions(p.key, '');
    var man = $('cmModelId'); if (man) man.value = '';
  }
  function openCustomModel(mode, id) {
    customEditId = id || null;
    setCmTestBusy(false);
    renderProviderOptions();
    var cmMsg = $('cmMsg');
    if (cmMsg) { cmMsg.textContent = ''; cmMsg.className = 'ai-form-msg'; }
    setVal('cmName', ''); setVal('cmApiUrl', ''); setVal('cmKey', ''); setVal('cmModelId', '');
    if (cmTypes) {
      var chips = cmTypes.querySelectorAll('.ai-type-chip');
      for (var c = 0; c < chips.length; c++) chips[c].classList.remove('sel');
    }
    if (mode === 'edit' && id) {
      var arr = getCustomModels();
      var m = null;
      for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { m = arr[i]; break; } }
      if (m) {
        setVal('cmName', m.name); setVal('cmApiUrl', m.apiUrl || ''); setVal('cmKey', m.apiKey || '');
        (m.types || []).forEach(function (t) {
          var chip = cmTypes ? cmTypes.querySelector('[data-type="' + t + '"]') : null;
          if (chip) chip.classList.add('sel');
        });
      }
      var pk = matchPresetByUrl(m && m.apiUrl ? m.apiUrl : '');
      applyPreset(pk || 'openai', false);
      renderModelOptions(pk || 'openai', m && m.model ? m.model : '');
      var t1 = $('customModelTitle'); if (t1) t1.textContent = '编辑自定义模型';
      var ea = $('cmEditActions'); if (ea) ea.style.display = 'flex';
    } else {
      applyPreset('siliconflow', true);
      var t2 = $('customModelTitle'); if (t2) t2.textContent = '配置自定义模型';
      var ea2 = $('cmEditActions'); if (ea2) ea2.style.display = 'none';
    }
    openOverlay('customModelOverlay'); openPopup('customModelPopup');
  }

  /* 测试连接：按钮禁用 + 15s 超时（Promise.race，不用 AbortController，兼容老 WebView） */
  var cmTesting = false;
  function setCmTestBusy(busy) {
    cmTesting = !!busy;
    var b = $('cmTestBtn'); if (!b) return;
    b.disabled = cmTesting;
    b.textContent = cmTesting ? '测试中…' : '测试连接';
  }
  function cmToast(state, msg) {
    try { if (typeof window.xtToast === 'function') { window.xtToast(state, msg); return; } } catch (e) { /* 忽略 */ }
    toast(msg);
  }
  function pickApiErr(t) {
    try {
      var o = JSON.parse(t);
      if (o && o.error && o.error.message) return String(o.error.message);
      if (o && o.message) return String(o.message);
    } catch (e) { /* 非 JSON，走原文截断 */ }
    return String(t || '').slice(0, 160);
  }
  function testCustom() {
    if (cmTesting) return;
    var url = getVal('cmApiUrl').trim();
    var key = getVal('cmKey').trim();
    /* 修正：下拉级联（#cmModelSelect）选中时，隐藏的手动输入框 #cmModelId 为空，
       必须走 getCmModelId() 统一取值（它已处理「下拉选中」与「自定义手填」两种情况），
       否则用户选了下拉却因 mid 为空被拦下、点不动「测试连接」。 */
    var mid = getCmModelId().trim();
    var cmMsg = $('cmMsg'); if (!cmMsg) return;
    if (!url || !key || !mid) { cmMsg.className = 'ai-form-msg err'; cmMsg.textContent = '请先填写 API 地址、Key 和模型 ID'; return; }
    cmMsg.className = 'ai-form-msg'; cmMsg.textContent = '连接测试中…（最多 15 秒）';
    setCmTestBusy(true);
    var timer = null;
    var timeoutRace = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { reject({ cmTimeout: true }); }, CM_TEST_TIMEOUT);
    });
    var req = fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: mid, messages: [{ role: 'user', content: 'hi' }], stream: false, max_tokens: 20 })
    }).then(function (r) {
      var code = r.status;
      if (!r.ok) {
        return r.text().then(function (t) {
          var e = new Error('HTTP ' + code + ' ' + pickApiErr(t));
          e.httpCode = code;
          throw e;
        });
      }
      return r.json();
    });
    Promise.race([req, timeoutRace]).then(function () {
      clearTimeout(timer); setCmTestBusy(false);
      var m = $('cmMsg'); if (!m) return;
      m.className = 'ai-form-msg ok'; m.textContent = '连接成功 ✓ 模型可用';
      cmToast('success', '连接成功，模型可用');
    }).catch(function (e) {
      clearTimeout(timer); setCmTestBusy(false);
      var m2 = $('cmMsg'); if (!m2) return;
      var raw = (e && e.message) ? String(e.message) : '';
      var msg;
      if (e && e.cmTimeout) {
        msg = '连接超时：' + (CM_TEST_TIMEOUT / 1000) + ' 秒内没有响应，请检查网络或接口地址';
      } else if (e && e.httpCode) {
        msg = '连接失败：HTTP ' + e.httpCode + ' — ' + raw.replace(/^HTTP\s*\d+\s*/, '');
      } else if (!raw || /network|fetch/i.test(raw)) {
        msg = '网络错误，连不上该接口。多半是平台不允许跨域（CORS），建议换硅基流动 / DeepSeek';
      } else {
        msg = '连接失败：' + raw;
      }
      m2.className = 'ai-form-msg err'; m2.textContent = msg;
      cmToast('error', '连接失败，请看弹窗内提示');
    });
  }
  function saveCustom() {
    var name = getVal('cmName').trim();
    var url = getVal('cmApiUrl').trim();
    var key = getVal('cmKey').trim();
    var mid = getCmModelId().trim();
    var cmMsg = $('cmMsg'); if (!cmMsg) return;
    if (!name || !url || !key || !mid) { cmMsg.className = 'ai-form-msg err'; cmMsg.textContent = '请填写全部必填项（名称/地址/Key/模型ID）'; return; }
    var types = [];
    if (cmTypes) {
      var sel = cmTypes.querySelectorAll('.ai-type-chip.sel');
      for (var i = 0; i < sel.length; i++) types.push(sel[i].getAttribute('data-type'));
    }
    if (types.length === 0) types = ['general'];
    var list = lsGet(CUSTOM_KEY, []);
    var id = customEditId || ('custom_' + Date.now());
    list = list.filter(function (m) { return m.id !== id; });
    list.push({ id: id, name: name, apiUrl: url, apiKey: key, model: mid, types: types, custom: true, tag: '自定义' });
    lsSet(CUSTOM_KEY, list);
    customEditId = null;
    closePopup('customModelPopup'); closeOverlay('customModelOverlay');
    setCmTestBusy(false);
    // 保存后直接启用：走既有选中逻辑（同步刷新列表/标签，并互斥掉深度思考）
    selectModel(id, '已添加并启用 ' + name);
  }
  function deleteCustom() {
    if (!customEditId) return;
    var list = lsGet(CUSTOM_KEY, []).filter(function (m) { return m.id !== customEditId; });
    lsSet(CUSTOM_KEY, list);
    if (getSelectedModelId() === customEditId) { setSelectedModelId('auto'); updateModelLabel(); }
    customEditId = null;
    closePopup('customModelPopup'); closeOverlay('customModelOverlay');
    toast('已删除自定义模型');
  }

  /* ============ AI 设置 ============ */
  /* 上下文长度：携带多少轮历史给模型（0 = 全部）。默认 10 轮。 */
  function getCtxTurns() {
    var v = parseInt(lsStr('ai_ctx_turns', '10'), 10);
    if (isNaN(v) || v < 0) v = 10;
    return v;
  }
  function setCtxTurns(n) { lsStrSet('ai_ctx_turns', String(n)); }
  function renderCtxChips() {
    var box = $('setCtxChips'); if (!box) return;
    var cur = getCtxTurns();
    var chips = box.querySelectorAll('.ai-type-chip');
    for (var i = 0; i < chips.length; i++) {
      var v = parseInt(chips[i].getAttribute('data-ctx'), 10);
      chips[i].className = 'ai-type-chip' + (v === cur ? ' sel' : '');
    }
  }
  function renderSetMaxSwitch() {
    var sw = $('setMaxSwitch'); if (sw) sw.className = 'ai-switch' + (getMaxMode() ? ' on' : '');
  }
  function openSettings() {
    setVal('setKeyZhipu', lsStr('ai_user_key_zhipu', ''));
    setVal('setKeySilicon', lsStr('ai_user_key_siliconflow', ''));
    renderCtxChips();
    renderSetMaxSwitch();
    ensureMemorySection();
    renderMemoryList();
    openOverlay('settingsOverlay'); openPopup('settingsPopup');
  }
  function saveSettings() {
    lsStrSet('ai_user_key_zhipu', getVal('setKeyZhipu').trim());
    lsStrSet('ai_user_key_siliconflow', getVal('setKeySilicon').trim());
    closePopup('settingsPopup'); closeOverlay('settingsOverlay');
    toast('设置已保存');
  }

  /* ============ 深度思考 ============ */
  function setDeepThink(on) {
    lsStrSet(DEEPTHINK_KEY, on ? '1' : '0');
    if (aiDeepThinkChip) aiDeepThinkChip.classList.toggle('active', on);
  }
  function toggleDeepThink() {
    var on = !getDeepThink();
    setDeepThink(on);
    toast(on ? '已开启深度思考' : '已关闭深度思考');
  }

  /* ============ 侧栏（桌面常驻/收起，移动抽屉） ============ */
  function toggleSidebar() {
    if (!aiHistory) return;
    if (window.innerWidth <= 768) {
      aiHistory.classList.toggle('open');
      if (aiSidebarOverlay) aiSidebarOverlay.classList.toggle('open');
    } else {
      aiHistory.classList.toggle('collapsed');
    }
  }

  /* ============ 弹层开关 ============ */
  function openOverlay(id) { var e = $(id); if (e) e.classList.add('open'); }
  function closeOverlay(id) { var e = $(id); if (e) e.classList.remove('open'); }
  function openPopup(id) { var e = $(id); if (e) e.classList.add('open'); }
  function closePopup(id) { var e = $(id); if (e) e.classList.remove('open'); }
  function closeModelSelect() { closeModelPanel(); }

  /* ============ 实际使用模型（回答底部小字） ============
     两路来源都做存在性判断，任一路缺失都静默跳过：
       ① callAI 通过 opts.onModelUsed(id, name) 回调告知（流式开始即知）；
       ② callAI 返回值中的 modelUsed / model / modelId（结束后兜底读取）。 */
  function setUsedModel(b, id, name) {
    if (!b || !b.bubble) return;
    var nm = name;
    if (!nm && id) { var m = getModelById(id); nm = m ? listDisplayName(m) : String(id); }
    if (!nm) return;
    var el = b.bubble.querySelector('.ai-msg-model');
    if (!el) {
      el = doc.createElement('div');
      el.className = 'ai-msg-model';
      var acts = b.bubble.querySelector('.ai-msg-actions');
      if (acts) b.bubble.insertBefore(el, acts); else b.bubble.appendChild(el);
    }
    el.textContent = '由 ' + nm + ' 回答';
  }
  function applyResultModel(b, res) {
    if (!b || !res || typeof res !== 'object') return;
    var id = res.modelUsed || res.model || res.modelId || '';
    if (!id) return;
    setUsedModel(b, id, res.modelUsedName || res.modelName || '');
  }

  /* ============ 确认 popover（页内，非原生 confirm） ============ */
  function confirmPopover(text, onOk) {
    var t = $('aiConfirmText'); if (t) t.textContent = text;
    var box = $('aiConfirm');
    if (!box) { toast('确认框未就绪，请刷新后重试'); return; }   // 不确认就绝不下发删除
    box.classList.add('open');
    pendingOk = onOk;
  }

  /* ============ 推荐问题（已按用户要求移除该区块） ============ */

  /* ============ 事件绑定 ============ */
  function bindEvents() {
    bindById('aiMenuBtn', 'click', toggleSidebar);
    bindById('aiNewTopBtn', 'click', startNewChat);
    bindById('aiNewChatBtn', 'click', startNewChat);
    bindEl(aiCollapseBtn, 'click', toggleSidebar);
    bindById('aiModelInfoBtn', 'click', toggleModelPanelFromSidebar);
    bindById('aiSettingsBtn', 'click', openAddModelFromSidebar);
    bindById('aiClearBtn', 'click', confirmClear);

    // 用户区：··· 打开页内 popover；个人中心 / 退出登录
    bindEl(aiUserMoreBtn, 'click', function (e) { e.stopPropagation(); toggleUserMenu(); });
    bindEl(aiUserMenu, 'click', function (e) { e.stopPropagation(); });
    bindEl(aiProfileBtn, 'click', function () { closeUserMenu(); try { if (typeof openBlogProfile === 'function') openBlogProfile(); } catch (e) { /* 忽略 */ } });
    bindEl(aiLogoutBtn, 'click', function () { closeUserMenu(); try { if (typeof doLogout === 'function') doLogout(); } catch (e) { /* 忽略 */ } });
    bindEl(doc, 'click', function (e) {
      if (aiUserMenu && aiUserMenu.classList.contains('open') && aiUserArea && !aiUserArea.contains(e.target)) closeUserMenu();
      var p = $('aiModelPanel');
      if (!p || !p.classList.contains('open')) return;
      var t = e.target;
      if (p.contains(t)) return;
      // 面板的两个入口本身要豁免：否则按钮先开、冒泡到 doc 又立刻关＝点了没反应
      if (aiModelBtn && (t === aiModelBtn || aiModelBtn.contains(t))) return;
      var infoBtn = $('aiModelInfoBtn');
      if (infoBtn && (t === infoBtn || infoBtn.contains(t))) return;
      closeModelPanel();
    });

    // 关键：输入变化必须同步刷新发送钮可用态（原来只绑了 autoGrow，
    // 导致打完字发送钮仍是 disabled 灰色 → 点了没反应）
    bindEl(aiInput, 'input', function () { autoGrow(); updateSendEnabled(); renderCtxUsage(); });
    bindEl(aiInput, 'keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    // 对标 DeepSeek：聚焦高亮整个输入容器（textarea 本身永远无框）
    bindEl(aiInput, 'focus', function () { if (aiInputBox) aiInputBox.classList.add('focus'); });
    bindEl(aiInput, 'blur', function () { if (aiInputBox) aiInputBox.classList.remove('focus'); });
    bindEl(aiAttachBtn, 'click', function () { if (aiFileInput) aiFileInput.click(); });
    bindEl(aiFileInput, 'change', function () {
      if (aiFileInput.files && aiFileInput.files[0]) handleFile(aiFileInput.files[0]);
      aiFileInput.value = '';
    });
    bindEl(aiImgRemove, 'click', clearImage);
    bindEl(aiDeepThinkChip, 'click', toggleDeepThink);
    bindEl(aiModelBtn, 'click', toggleModelPanel);
    bindEl(aiMaxSwitch, 'click', function (e) { e.stopPropagation(); toggleMax(); });
    // 设置弹窗里的 MAX 开关与上下文长度 chips
    bindById('setMaxSwitch', 'click', function (e) { e.stopPropagation(); toggleMax(); });
    bindById('setCtxChips', 'click', function (e) {
      var ctxBox = $('setCtxChips'); if (!ctxBox) return;
      var t = e.target;
      while (t && t !== ctxBox && !t.getAttribute('data-ctx')) { t = t.parentNode; }
      if (!t || t === ctxBox) return;
      var v = parseInt(t.getAttribute('data-ctx'), 10);
      if (isNaN(v)) return;
      setCtxTurns(v);
      renderCtxChips();
      toast(v === 0 ? '上下文：携带全部历史' : ('上下文：最近 ' + v + ' 轮'));
    });
    // 悬停详情浮层：鼠标离开面板即隐藏（行内展开模式由点击控制，不受影响）
    bindById('aiModelPanel', 'mouseleave', onPanelMouseLeave);
    bindById('aiSendBtn', 'click', sendMessage);

    bindEl(aiSidebarOverlay, 'click', function () {
      if (aiHistory) aiHistory.classList.remove('open');
      if (aiSidebarOverlay) aiSidebarOverlay.classList.remove('open');
    });

    bindById('aiCustomEntry', 'click', function () { closeModelPanel(); location.href = 'ai-settings.html'; });
    bindById('cmKeyToggle', 'click', function () {
      var k = $('cmKey'); if (k) k.type = (k.type === 'password') ? 'text' : 'password';
    });
    bindById('cmProvider', 'change', onProviderChange);
    bindById('cmModelSelect', 'change', onModelSelectChange);
    if (cmTypes) {
      var tchips = cmTypes.querySelectorAll('.ai-type-chip');
      for (var ci = 0; ci < tchips.length; ci++) {
        (function (c) { c.addEventListener('click', function () { c.classList.toggle('sel'); }); })(tchips[ci]);
      }
    }
    bindById('cmTestBtn', 'click', testCustom);
    bindById('cmCancelBtn', 'click', function () { closePopup('customModelPopup'); closeOverlay('customModelOverlay'); });
    bindById('cmSaveBtn', 'click', saveCustom);
    bindById('cmDeleteBtn', 'click', deleteCustom);

    bindById('setKeyZhipuToggle', 'click', function () {
      var k = $('setKeyZhipu'); if (k) k.type = (k.type === 'password') ? 'text' : 'password';
    });
    bindById('setKeySiliconToggle', 'click', function () {
      var k = $('setKeySilicon'); if (k) k.type = (k.type === 'password') ? 'text' : 'password';
    });
    bindById('setSaveBtn', 'click', saveSettings);
    bindById('setCancelBtn', 'click', function () { closePopup('settingsPopup'); closeOverlay('settingsOverlay'); });

    // 统一关闭：data-close 按钮 & 遮罩点击（不用 NodeList.forEach，老 WebView 没有）
    var closers = doc.querySelectorAll('[data-close]');
    for (var di = 0; di < closers.length; di++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var pid = btn.getAttribute('data-close');
          var oid = pid.replace('Popup', 'Overlay');
          closePopup(pid); closeOverlay(oid);
        });
      })(closers[di]);
    }
    bindById('customModelOverlay', 'click', function () { closePopup('customModelPopup'); closeOverlay('customModelOverlay'); });
    bindById('settingsOverlay', 'click', function () { closePopup('settingsPopup'); closeOverlay('settingsOverlay'); });
    bindById('modelIntroOverlay', 'click', closeModelIntro);

    bindById('aiConfirmCancel', 'click', function () { pendingOk = null; var c = $('aiConfirm'); if (c) c.classList.remove('open'); });
    bindById('aiConfirmOk', 'click', function () { var cb = pendingOk; pendingOk = null; var c = $('aiConfirm'); if (c) c.classList.remove('open'); if (cb) cb(); });
  }

  /* ============ 初始化 ============ */
  function init() {
    aiInput = $('aiInput'); aiSendBtn = $('aiSendBtn'); aiChat = $('aiChat'); aiMessages = $('aiMessages');
    aiWelcome = $('aiWelcome'); aiWelcomeInputSlot = $('aiWelcomeInputSlot'); aiDockInputSlot = $('aiDockInputSlot');
    aiInputBox = $('aiInputBox'); aiImgPreview = $('aiImgPreview'); aiImgThumb = $('aiImgThumb');
    aiAttachBtn = $('aiAttachBtn'); aiFileInput = $('aiFileInput'); aiDeepThinkChip = $('aiDeepThinkChip');
    aiModelBtn = $('aiModelBtn'); aiModelLabel = $('aiModelLabel'); aiImgRemove = $('aiImgRemove');
    aiHistory = $('aiHistory'); aiHistoryList = $('aiHistoryList');
    aiSidebarOverlay = $('aiSidebarOverlay'); aiCollapseBtn = $('aiCollapseBtn'); cmTypes = $('cmTypes');
    aiUserArea = $('aiUserArea'); aiUserAvatar = $('aiUserAvatar'); aiUserName = $('aiUserName');
    aiUserMoreBtn = $('aiUserMoreBtn'); aiUserMenu = $('aiUserMenu');
    aiProfileBtn = $('aiProfileBtn'); aiLogoutBtn = $('aiLogoutBtn');
    aiModelPanel = $('aiModelPanel'); aiModelList = $('aiModelList'); aiMaxSwitch = $('aiMaxSwitch');

    bindEvents();
    renderHistory();
    updateModelLabel();
    ensureMemorySection();
    applyUserInfoRetry();
    updateMaxSwitch();
    if (getDeepThink() && aiDeepThinkChip) {
      aiDeepThinkChip.classList.add('active');
    }
    updateSendEnabled();
    renderCtxUsage();
    // 静态 data-icon 由 icon-map.js 渲染；若有新增再补一次
    try { if (window.lucideAutoRender) window.lucideAutoRender(); } catch (e) { /* 忽略 */ }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
