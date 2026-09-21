/* ============ AI 页交互逻辑（DeepSeek 风格） ============
   依赖（由并行线 eng-ai-base 提供，全局函数/对象）：
     - callAI(funcType, messages, { image, onChunk(delta, fullText), onFallback(name),
         onReasoning(delta, full)（R107 可选，思维链增量，feature-detect） })
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
  var AUDIO_MODELS_KEY = 'ai_audio_models_v1'; // R93-5b：视频带声音 map（{modelId:true}，ai-settings.js 模型列表写入）
  var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  var COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var REGEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var MEM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  /* R86：麦克风按钮图标（录音中切换为 STOP_SVG，并把描边色改成警示红） */
  var MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
  var STOP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/></svg>';
  // AI 头像：星星图标（对标 DeepSeek/WorkBuddy 用品牌图形而非文字）
  var SPARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z"/></svg>';

  var FALLBACK_MATH = ['计算', '工程', '利润', '增长率', '比例', '方程', '几何', '数量关系', '资料分析', '速度', '路程', '浓度', '排列组合', '概率', '整除', '余数', '最大公约数', '最小公倍数'];
  var FALLBACK_TRANS = ['翻译', '英语', '四级', '六级', '单词', '语法', 'translate', 'english'];

  /* 倍率兜底（底座 AI_CONFIG.builtinModels[i].rate 未就绪时按模型规模本地展示；
     待 eng-ai-base 给每个模型加 rate 字段后，优先读配置） */
  var RATE_FALLBACK = {
    'auto': '自适应',
    'ark-v4-flash': '0.8x',
    'ark-doubao-mini': '0.8x',
    'ark-v4-1-flash': '1x',
    'ark-v4-pro': '1.5x',
    'ark-doubao-pro': '1.5x',
    'ark-glm-flash': '1x',
    'ark-turbo-260628': '1x',
    'ark-lite-260428': '0.5x',
    'ark-evolving': '1.5x',
    'ark-glm-5.2': '1x',
    'ark-character-260628': '1x',
    'ark-character-251128': '1x',
    'ark-code-preview': '1x',
    'ark-v4-pro-260425': '1.5x',
    'ark-lite-260215': '0.5x',
    'glm-4.7': '1x',
    'glm-4v-flash': '1x',
    'glm-4.6v-flash': '1.2x',
    'qf-ernie-32k': '1x',
    'qf-ernie-128k': '1.2x',
    'or-auto': '1x',
    'or-nemotron-super': '1x',
    'or-nemotron-ultra': '2x',
    'gm-flash-lite': '0.8x',
    'gm-flash': '1.2x',
    'ark-seedream-4-0415': '1x',
    'ark-seedream-4-0828': '1x'
  };

  /* 模型说明兜底（与开发文档 §7.3 一致）；若 AI_CONFIG 提供更全则用 AI_CONFIG。 */
  var MODEL_DETAILS = {
    'ark-v4-flash': { platform: "火山方舟", params: "", type: "通用对话", stars: '★★★', speed: "快", advantage: "响应快，额度每天 200 万 token", applicable: "日常问答、快速解题" },
    'ark-doubao-mini': { platform: "火山方舟", params: "", type: "通用对话", stars: '★★★', speed: "快", advantage: "豆包轻量模型，响应快，额度每天 200 万 token", applicable: "日常问答、快速解题" },
    'ark-v4-1-flash': { platform: "火山方舟", params: "", type: "通用对话（推理型）", stars: '★★★★', speed: "快", advantage: "推理型，maxTokens 需 ≥2000；额度每天 200 万 token", applicable: "需要推理的问答、数学题" },
    'ark-v4-pro': { platform: "火山方舟", params: "", type: "推理增强", stars: '★★★★★', speed: "中", advantage: "推理能力更强，额度每天 200 万 token", applicable: "复杂推理、长链思考" },
    'ark-doubao-pro': { platform: "火山方舟", params: "", type: "通用对话（创作/长文本）", stars: '★★★★★', speed: "中", advantage: "创作与长文本能力较强，额度每天 200 万 token", applicable: "文案创作、长文本处理" },
    'ark-glm-flash': { platform: "火山方舟", params: "", type: "通用对话", stars: '★★★★', speed: "中", advantage: "GLM 最新代免费模型，额度每天 200 万 token", applicable: "日常问答" },
    'ark-turbo-260628': { platform: "火山方舟", params: "", type: "通用对话（turbo）", stars: '★★★★', speed: "快", advantage: "速度与质量兼顾的 turbo 版；额度每天 200 万 token", applicable: "日常问答、均衡场景" },
    'ark-lite-260428': { platform: "火山方舟", params: "", type: "轻量对话（新版）", stars: '★★★', speed: "快", advantage: "最新轻量模型，响应极快；额度每天 200 万 token", applicable: "极简单问答、快速分类" },
    'ark-evolving': { platform: "火山方舟", params: "", type: "通用对话（持续进化）", stars: '★★★★★', speed: "中", advantage: "持续进化的最新模型，能力随版本增强；额度每天 200 万 token", applicable: "复杂问答、长链思考" },
    'ark-glm-5.2': { platform: "火山方舟", params: "", type: "通用对话", stars: '★★★★', speed: "中", advantage: "智谱 GLM-5.2（火山方舟免费通道），中文能力强；额度每天 200 万 token", applicable: "日常问答" },
    'ark-character-260628': { platform: "火山方舟", params: "", type: "角色扮演（新版）", stars: '★★★★', speed: "中", advantage: "角色扮演与人设对话优化；额度每天 200 万 token", applicable: "角色扮演、情景对话、面试模拟陪练" },
    'ark-character-251128': { platform: "火山方舟", params: "", type: "角色扮演（旧版）", stars: '★★★', speed: "中", advantage: "旧版角色模型；建议优先使用新版", applicable: "角色扮演（旧版兼容）" },
    'ark-code-preview': { platform: "火山方舟", params: "", type: "代码专用（预览版）", stars: '★★★★', speed: "中", advantage: "代码理解与生成专用预览版；额度每天 200 万 token", applicable: "编程、代码解释、纠错" },
    'ark-v4-pro-260425': { platform: "火山方舟", params: "", type: "推理增强（旧版）", stars: '★★★★', speed: "中", advantage: "旧版 V4 Pro；建议优先使用新版 DeepSeek-V4-Pro", applicable: "复杂推理（旧版兼容）" },
    'ark-lite-260215': { platform: "火山方舟", params: "", type: "轻量对话（旧版）", stars: '★★', speed: "快", advantage: "旧版轻量模型；建议优先使用新版 Doubao-Lite", applicable: "极简单问答（旧版兼容）" },
    'glm-4.7': { platform: "智谱AI", params: "30B", type: "通用文本", stars: '★★★★★', speed: "中", recommend: "日常问答首选", advantage: "智谱免费模型，中文理解能力强，实测约 5.5 秒", applicable: "日常学习问答、方法咨询、文案生成、面试模拟" },
    'glm-4v-flash': { platform: "智谱AI", params: "", type: "视觉理解", stars: '★★★★', speed: "快", advantage: "免费视觉模型，实测约 1 秒，适合拍题", applicable: "拍题识图、题目与课件截图解读" },
    'glm-4.6v-flash': { platform: "智谱AI", params: "", type: "多模态（图片+文本）", stars: '★★★★', speed: "限流中", advantage: "免费支持图片理解；当前访问量过大被限流，失败自动降级 GLM-4V-Flash", applicable: "图片理解、题目与课件截图解读" },
    'qf-ernie-32k': { platform: "百度千帆", params: "", type: "通用对话", stars: '★★★', speed: "快", advantage: "百度文心 ERNIE 系列，实测约 2 秒", applicable: "通用中文问答" },
    'qf-ernie-128k': { platform: "百度千帆", params: "", type: "通用对话（大上下文）", stars: '★★★', speed: "快", advantage: "百度文心 ERNIE 系列，128K 大上下文，实测约 1.8 秒", applicable: "长文本、长上下文问答" },
    'or-auto': { platform: "OpenRouter", params: "", type: "自动路由", stars: '★★★★', speed: "快", advantage: "自动选择合适的免费模型，实测约 1.8 秒；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "不确定用哪个模型时的日常问答" },
    'or-nemotron-super': { platform: "OpenRouter", params: "", type: "通用对话", stars: '★★★★', speed: "快", advantage: "实测约 1.2 秒；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "日常问答" },
    'or-nemotron-ultra': { platform: "OpenRouter", params: "", type: "深度推理", stars: '★★★★★', speed: "中", advantage: "深度推理（实测约 3.3 秒）；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "复杂推理问题" },
    'gm-flash-lite': { platform: "Google Gemini", params: "", type: "通用对话（轻量）", stars: '★★★', speed: "快", advantage: "超快轻量（实测约 1 秒）；需自备网络", applicable: "日常轻量问答" },
    'gm-flash': { platform: "Google Gemini", params: "", type: "通用对话（推理）", stars: '★★★★', speed: "中", advantage: "通用能力强（实测约 2.9 秒）；需自备网络", applicable: "日常问答、推理" },
    'ark-seedream-4-0415': { platform: "火山方舟·图片生成", params: "", type: "图片生成", stars: '★★★★', speed: "中", advantage: "文生图；走 images/generations 接口，调用链路待评估", applicable: "文生图（v4 初版）" },
    'ark-seedream-4-0828': { platform: "火山方舟·图片生成", params: "", type: "图片生成（最快）", stars: '★★★★', speed: "快", advantage: "文生图最快版（实测 4.2 秒）；走 images/generations 接口，调用链路待评估", applicable: "文生图（速度优先）" },

    /* ---------- 硅基流动 12 模型（R86：翻译 / 视觉 / 生图 / 语音识别 / 向量 / 重排） ---------- */
    'sf-hunyuan-mt-7b': { platform: "硅基流动", params: "7B", type: "翻译对话", stars: '★★★★', speed: "快", advantage: "腾讯混元翻译模型，多语种互译，中文语境准确；免费额度", applicable: "翻译、外语学习、双语对照阅读" },
    'sf-paddleocr-vl-1.5': { platform: "硅基流动", params: "", type: "视觉理解（文档/公式）", stars: '★★★★', speed: "快", advantage: "PaddleOCR-VL 版面与公式识别强，走 chat/completions 可正常对话；免费额度", applicable: "拍题识图、课件与试卷截图解读、表格识别" },
    'sf-kolors': { platform: "硅基流动", params: "", type: "图片生成", stars: '★★★★', speed: "中", advantage: "快手 Kolors 文生图，中文提示词友好；免费额度", applicable: "文生图、学习配图生成" },
    'sf-sensevoice': { platform: "硅基流动", params: "", type: "语音识别", stars: '★★★★', speed: "快", advantage: "SenseVoiceSmall，多语种识别 + 情绪/事件标签；免费额度", applicable: "录音转文字、口述笔记整理" },
    'sf-asr-v32': { platform: "硅基流动", params: "", type: "语音识别", stars: '★★★★', speed: "快", advantage: "星辰 ASR V3.2，中文长句识别稳定；免费额度", applicable: "录音转文字、课堂口述转写" },
    'sf-asr-ultra': { platform: "硅基流动", params: "", type: "语音识别（高精度）", stars: '★★★★★', speed: "中", advantage: "星辰 ASR V3.2-Ultra，识别精度更高的增强版；免费额度", applicable: "嘈杂环境录音、高精度转写" },
    'sf-asr-diarize': { platform: "硅基流动", params: "", type: "语音识别（说话人分离）", stars: '★★★★', speed: "中", advantage: "星辰 Diarize，能区分不同说话人；免费额度", applicable: "多人对话转写、小组讨论记录" },
    'sf-qwen-asr': { platform: "硅基流动", params: "1.7B", type: "语音识别", stars: '★★★★', speed: "快", advantage: "Qwen3-ASR-1.7B，中英文识别均衡；免费额度", applicable: "录音转文字、口语练习复核" },
    'sf-bge-m3': { platform: "硅基流动", params: "", type: "向量嵌入", stars: '★★★★', speed: "快", advantage: "BAAI/bge-m3，多语言 + 多功能向量；免费额度", applicable: "知识库向量化、语义检索（需由程序调用）" },
    'sf-bge-zh': { platform: "硅基流动", params: "", type: "向量嵌入（中文）", stars: '★★★★', speed: "快", advantage: "bge-large-zh-v1.5，中文语义表征效果好；免费额度", applicable: "中文资料向量化、相似度检索（需由程序调用）" },
    'sf-bge-en': { platform: "硅基流动", params: "", type: "向量嵌入（英文）", stars: '★★★★', speed: "快", advantage: "bge-large-en-v1.5，英文语义表征效果好；免费额度", applicable: "英文资料向量化、相似度检索（需由程序调用）" },
    'sf-bge-reranker': { platform: "硅基流动", params: "", type: "结果重排", stars: '★★★★', speed: "快", advantage: "bge-reranker-v2-m3，对检索结果做精排；免费额度", applicable: "检索结果重排、提高命中率（需由程序调用）" }
  };

  /* 内置模型兜底（与 AI_CONFIG.builtinModels 对齐） */
  var FALLBACK_MODELS = [
    { id: 'auto', name: '自动（推荐）', provider: null, model: null, types: ['general', 'math', 'image', 'translate'], tag: null, fallback: null },
    { id: 'ark-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'ark', model: 'deepseek-v4-flash-ga-260731', types: ['general'], tag: null, fallback: 'ark-doubao-mini' },
    { id: 'ark-doubao-mini', name: 'Doubao-Mini', provider: 'ark', model: 'doubao-seed-2-0-mini-260428', types: ['general'], tag: null, fallback: 'glm-4.7' },
    { id: 'ark-v4-1-flash', name: 'DeepSeek-V4.1-Flash', provider: 'ark', model: 'deepseek-v4-1-flash-260910', types: ['general','math'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'ark-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'ark', model: 'deepseek-v4-pro-ga-260813', types: ['general','reasoning'], tag: null, fallback: 'ark-v4-1-flash' },
    { id: 'ark-doubao-pro', name: 'Doubao-Pro', provider: 'ark', model: 'doubao-seed-2-1-pro-260915', types: ['general','creative','longtext'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'ark-glm-flash', name: 'GLM-5.3-Flash', provider: 'ark', model: 'glm-5-3-flash-260828', types: ['general'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'ark-turbo-260628', name: 'Doubao-Turbo', provider: 'ark', model: 'doubao-seed-2-1-turbo-260628', types: ['general'], tag: null, fallback: 'ark-v4-1-flash' },
    { id: 'ark-lite-260428', name: 'Doubao-Lite', provider: 'ark', model: 'doubao-seed-2-0-lite-260428', types: ['general'], tag: null, fallback: 'ark-doubao-mini' },
    { id: 'ark-evolving', name: 'Doubao-Evolving', provider: 'ark', model: 'doubao-seed-evolving', types: ['general','reasoning'], tag: null, fallback: 'ark-v4-pro' },
    { id: 'ark-glm-5.2', name: 'GLM-5.2', provider: 'ark', model: 'glm-5-2-260617', types: ['general'], tag: null, fallback: 'ark-glm-flash' },
    { id: 'ark-character-260628', name: 'Doubao-Character（新版）', provider: 'ark', model: 'doubao-seed-character-260628', types: ['general','creative'], tag: null, fallback: 'ark-doubao-pro' },
    { id: 'ark-character-251128', name: 'Doubao-Character（旧版）', provider: 'ark', model: 'doubao-seed-character-251128', types: ['general','creative'], tag: null, fallback: 'ark-character-260628' },
    { id: 'ark-code-preview', name: 'Doubao-Code-Preview', provider: 'ark', model: 'doubao-seed-2-0-code-preview-260215', types: ['general'], tag: null, fallback: 'ark-doubao-pro' },
    { id: 'ark-v4-pro-260425', name: 'DeepSeek-V4-Pro（旧版）', provider: 'ark', model: 'deepseek-v4-pro-260425', types: ['general','reasoning'], tag: null, fallback: 'ark-v4-pro' },
    { id: 'ark-lite-260215', name: 'Doubao-Lite（旧版）', provider: 'ark', model: 'doubao-seed-2-0-lite-260215', types: ['general'], tag: null, fallback: 'ark-doubao-mini' },
    { id: 'glm-4.7', name: 'GLM-4.7', provider: 'zhipu', model: 'glm-4.7', types: ['general'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'glm-4v-flash', name: 'GLM-4V-Flash', provider: 'zhipu', model: 'glm-4v-flash', types: ['image'], tag: null, fallback: null },
    { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash', provider: 'zhipu', model: 'glm-4.6v-flash', types: ['image','general'], tag: null, fallback: 'glm-4v-flash' },
    { id: 'qf-ernie-32k', name: 'ERNIE-4.5-Turbo', provider: 'qianfan', model: 'ernie-4.5-turbo-32k', types: ['general'], tag: null, fallback: 'qf-ernie-128k' },
    { id: 'qf-ernie-128k', name: 'ERNIE-4.5-Turbo-128K', provider: 'qianfan', model: 'ernie-4.5-turbo-128k', types: ['general','longtext'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'or-auto', name: 'OR-Auto', provider: 'openrouter', model: 'openrouter/free', types: ['general'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'or-nemotron-super', name: 'Nemotron-Super', provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free', types: ['general'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'or-nemotron-ultra', name: 'Nemotron-Ultra', provider: 'openrouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', types: ['general','reasoning'], tag: null, fallback: 'ark-v4-pro' },
    { id: 'gm-flash-lite', name: 'Gemini-3.5-Flash-Lite', provider: 'gemini', model: 'gemini-3.5-flash-lite', types: ['general'], tag: null, fallback: 'ark-v4-flash' },
    { id: 'gm-flash', name: 'Gemini-3.5-Flash', provider: 'gemini', model: 'gemini-3.5-flash', types: ['general','reasoning'], tag: null, fallback: 'ark-v4-pro' },
    { id: 'ark-seedream-4-0415', name: 'Seedream-4.0', provider: 'arkimage', model: 'doubao-seedream-4-0-20260415', types: ['imagegen'], tag: null, fallback: null },
    { id: 'ark-seedream-4-0828', name: 'Seedream-4.0-Fast', provider: 'arkimage', model: 'doubao-seedream-4-0-250828', types: ['imagegen'], tag: null, fallback: null },

    /* ---------- 硅基流动 12 模型（R86）---------- */
    { id: 'sf-hunyuan-mt-7b', name: 'Hunyuan-MT-7B', provider: 'siliconflow', model: 'tencent/Hunyuan-MT-7B', types: ['general','translate'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-paddleocr-vl-1.5', name: 'PaddleOCR-VL-1.5', provider: 'siliconflow', model: 'PaddlePaddle/PaddleOCR-VL-1.5', types: ['image'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-kolors', name: 'Kolors', provider: 'siliconflow', model: 'Kwai-Kolors/Kolors', types: ['imagegen'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-sensevoice', name: 'SenseVoice', provider: 'siliconflow', model: 'FunAudioLLM/SenseVoiceSmall', types: ['audio'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-asr-v32', name: 'XingChen-ASR-V3.2', provider: 'siliconflow', model: 'XingChenAGI/XingChenASR-V3.2', types: ['audio'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-asr-ultra', name: 'XingChen-ASR-Ultra', provider: 'siliconflow', model: 'XingChenAGI/XingChenASR-V3.2-Ultra', types: ['audio'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-asr-diarize', name: 'XingChen-Diarize', provider: 'siliconflow', model: 'XingChenAGI/XingChenASR-Diarize-V3.0', types: ['audio'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-qwen-asr', name: 'Qwen-ASR-1.7B', provider: 'siliconflow', model: 'Qwen/Qwen3-ASR-1.7B', types: ['audio'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-bge-m3', name: 'bge-m3', provider: 'siliconflow', model: 'BAAI/bge-m3', types: ['embedding'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-bge-zh', name: 'bge-large-zh', provider: 'siliconflow', model: 'BAAI/bge-large-zh-v1.5', types: ['embedding'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-bge-en', name: 'bge-large-en', provider: 'siliconflow', model: 'BAAI/bge-large-en-v1.5', types: ['embedding'], tag: '免费', rate: '1x', fallback: null },
    { id: 'sf-bge-reranker', name: 'bge-reranker-m3', provider: 'siliconflow', model: 'BAAI/bge-reranker-v2-m3', types: ['rerank'], tag: '免费', rate: '1x', fallback: null }
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
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4v-flash', name: 'GLM-4V-Flash' },
      { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash' }
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

  /* ---------- R131 调整：海外平台（gemini / openrouter）不再硬拦截 ----------
     语义改为「可用但依赖网络条件」：服务器配了代理 → 服务端中转全员可用；
     未配代理 → 服务端返回 kind:"network_limited"，由请求失败时的统一错误卡
     引导（自备该平台 Key 直连 / 改用国内同类模型）。下拉条目保持可选中，
     仅带「需海外网络/代理」浅色标注，无禁用感。迁移映射为前端常量，不入后端。 ---------- */
  var CM_TEST_TIMEOUT = 15000;   // 测试连接超时（毫秒）
  var OFFLINE_PROVIDERS = { gemini: true, openrouter: true };
  var OFFLINE_MIGRATE_BY_ID = {
    'gm-flash': 'ark-v4-pro',
    'gm-flash-lite': 'ark-v4-flash',
    'or-auto': 'ark-v4-flash',
    'or-nemotron-super': 'ark-v4-flash',
    'or-nemotron-ultra': 'qf-ernie-32k'
  };
  var OFFLINE_MIGRATE_BY_PROVIDER = { gemini: 'ark-v4-pro', openrouter: 'ark-v4-flash' };
  var NEED_PROXY_TEXT = '需海外网络/代理';

  function isOfflineModel(m) {
    if (!m) return false;
    return !!(m.provider && OFFLINE_PROVIDERS[m.provider]);
  }
  /* 替代模型展示名（按 id 精确映射优先，其次按 provider 兜底） */
  function offlineAltName(m) {
    if (!m) return '';
    var altId = (m.id && OFFLINE_MIGRATE_BY_ID[m.id]) ? OFFLINE_MIGRATE_BY_ID[m.id] : (OFFLINE_MIGRATE_BY_PROVIDER[m.provider] || '');
    if (!altId) return '';
    var am = getModelById(altId);
    return am ? listDisplayName(am) : altId;
  }

  /* ---------- R131：统一错误卡（禁静默失败） ----------
     kind ∈ {quota_exhausted, network_limited, version_outdated, provider_error, bad_request, unavailable} */
  var ERR_KIND_TEXT = {
    quota_exhausted: { title: '额度已达上限', body: '当前模型的可用额度已用完，请稍后再试或更换其他模型。' },
    network_limited: { title: '服务端网络受限', body: '该模型所需的上游服务当前不可达（服务端未配置海外代理）。可在设置页填写该平台自己的 Key 后直连使用，或改用国内平台的同类模型。' },
    version_outdated: { title: '请更新到新版本', body: '当前版本已停用 AI 功能，请更新到最新版后继续使用。' },
    provider_error: { title: '服务商返回错误', body: '上游服务商返回错误，请稍后重试或更换模型。' },
    bad_request: { title: '请求有误', body: '请求参数不被服务端接受，请更换模型或调整内容后重试。' },
    unavailable: { title: '模型暂不可用', body: '该模型当前不可用，请更换其他模型。' }
  };
  var ERR_CARD_CSS_ONCE = false;
  function ensureErrCardCss() {
    if (ERR_CARD_CSS_ONCE) return;
    ERR_CARD_CSS_ONCE = true;
    try {
      var st = doc.createElement('style');
      st.textContent = '.ai-err-card{border:1px solid rgba(214,69,69,.35);background:rgba(214,69,69,.07);' +
        'border-radius:12px;padding:12px 14px;margin:2px 0 6px;}' +
        '.ai-err-card .ai-err-t{font-weight:700;font-size:13.5px;color:#d64545;}' +
        '.ai-err-card .ai-err-b{font-size:13px;line-height:1.7;margin-top:6px;white-space:pre-wrap;}' +
        '.ai-err-card .ai-err-h{font-size:12px;color:#8a8f98;margin-top:6px;}' +
        '.ai-mp-offline-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;' +
        'font-size:11px;color:#8a8f98;background:rgba(128,128,128,.15);font-weight:400;}';
      (doc.head || doc.body).appendChild(st);
    } catch (e) { /* 样式注入失败不影响提示卡本身 */ }
  }
  /* 渲染一张可见的错误卡，返回纯文本（供消息历史 / 复制使用） */
  function renderErrCard(b, kind, errText, hint) {
    ensureErrCardCss();
    var t = ERR_KIND_TEXT[kind] || ERR_KIND_TEXT.provider_error;
    var body = errText ? String(errText) : t.body;
    var html = '<div class="ai-err-card"><div class="ai-err-t">' + escHtml(t.title) + '</div>' +
      '<div class="ai-err-b">' + escHtml(body) + '</div>' +
      (hint ? '<div class="ai-err-h">建议：' + escHtml(String(hint)) + '</div>' : '') + '</div>';
    b.mdEl.innerHTML = html;
    return t.title + '\n' + body + (hint ? ('\n建议：' + String(hint)) : '');
  }

  /* ---------- 元素引用（init 内赋值） ---------- */
  var aiInput, aiSendBtn, aiChat, aiMessages, aiWelcome, aiWelcomeInputSlot, aiDockInputSlot,
    aiInputBox, aiImgPreview, aiImgThumb, aiAttachBtn, aiFileInput, aiDeepThinkChip,
    aiMicBtn, aiAudioPreview, aiAudioLabel,
    aiModelBtn, aiModelLabel, aiImgRemove, aiHistory, aiHistoryList,
    aiSidebarOverlay, aiCollapseBtn, cmTypes, pendingOk = null, customEditId = null,
    aiUserArea, aiUserAvatar, aiUserName, aiUserMoreBtn,
    aiUserMenu, aiProfileBtn, aiLogoutBtn, userInfoTries = 0,
    aiModelPanel, aiModelList, aiMaxSwitch;

  /* ---------- 运行时状态 ---------- */
  /* R86：audio = { blob, file, mime, seconds }（与 image 同级；录完点发送即走语音识别回填） */
  var state = { messages: [], chatId: null, image: null, audio: null, sending: false };

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

  /* ---------- R130b：推理模型判定 ----------
     背景：思维链看不到的头号根因是「深度思考」开关默认关，且手动选了推理模型
     （如 DeepSeek-R1）也不会自动补 reasoning 标志——请求层只认 getDeepThink()。
     判定优先级：
       1) 选中模型自带能力标记 types 含 'reasoning'（内置模型与自定义模型均可标）；
       2) 无标记时按 id / name 兜底匹配推理系命名（r1 / think / reason，不区分大小写）；
       3) 'auto'（未手动选模型）恒 false，走原 getDeepThink 链路，行为不变。
     注：reasoning 误开无副作用——面板只有服务端真的回 reasoning_content 才有内容。 */
  function isReasoningModelSelected() {
    var selId = getSelectedModelId();
    if (!selId || selId === 'auto') { return false; }
    var m = getModelById(selId);
    if (m && m.types && typeof m.types.length === 'number') {
      for (var i = 0; i < m.types.length; i++) {
        if (String(m.types[i]) === 'reasoning') { return true; }
      }
    }
    var hay = ((m && m.id ? String(m.id) : '') + ' ' + (m && m.name ? String(m.name) : '')).toLowerCase();
    return /r1|think|reason/.test(hay);
  }

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
  /* ---------- R87/T04：不可用模型可见性（需求 4 后半） ----------
     语义铁律（§9.6）：无 health 记录 → 视为【可见】；仅当明确探测失败
     （health[id] 存在且 ok === false）且 hideUnavailable 为真时才隐藏。
     隐藏 = 渲染期过滤：不写 disabled、不写持久化、不删模型 → 天然可逆。 */
  function hideUnavailableOn() {
    return getModelSettings().hideUnavailable === true;
  }
  function isHiddenByHealth(id) {
    if (!id) return false;
    if (!hideUnavailableOn()) return false;
    var h = getModelSettings().health;
    if (!h || typeof h !== 'object') return false;
    var rec = h[id];
    if (!rec || typeof rec !== 'object') return false;   /* 无 health 记录 → 可见（不误伤未检测模型） */
    return rec.ok === false;                              /* 仅明确检测失败才隐藏 */
  }
  /* 健康状态变更 → 基于【当前】health / hideUnavailable 重算（不缓存快照，故可逆） */
  function onHealthChanged() {
    try { renderModelList(); } catch (e) { /* 列表未就绪：忽略 */ }
  }

  /* ---------- R88-M1（R88-C）：按功能分类联动过滤 ----------
     语义铁律：与「健康检查自动隐藏」(R87) 叠加 = 【交集】。即一个模型要显示，
     必须同时满足：(1) 未被 disabled；(2) 未被 health 隐藏；(3) 匹配当前分类筛选。
     三种过滤全是【渲染期】只读判定：不写 disabled、不删 catModels/overrides、
     不改任何持久化 → 取消筛选（catKey 置空）后立即恢复，数据从未被删除。
     分类映射表与 ai-settings.js 的 CAT_OF_TYPE 保持一致（14 键，无隐式兜底）。
     ── 依赖跨文件契约：ai_model_settings.lastSort.catKey（由 ai-settings 排序弹窗写入）。 */
  /* R93 修复（本改动）：设置页排序弹窗除 14 个功能分类外还提供「梯子」（catKey='proxy'）
     与自定义分类（settings.categories，key 形如 custom_*）两个选项，但本页原先只认
     14 个功能键 → 选中「梯子」后无任何 type 映射到 'proxy'，or-/gm- 等代理模型
     连同全部模型一起被误隐藏，AI 页下拉整体清空（「按代理分类排序映射不到下拉」的根因）。
     现与 ai-settings.js 的 modelInCategory 完全同口径：
       proxy    → 梯子 = 平台需代理：模型级 needVPN 或平台级 needVPN/needProxy 任一命中；
       custom_* → catModels[catKey] 优先级链含该模型即匹配。
     可用性策略不变：服务端 /api/ai/models 不下发的模型仍按原有 health/隐藏策略处理，
     本改动只修「分类归属映射」，不额外放宽可用性。 */
  var CAT_OF_TYPE_PAGE = {
    general: 'general', longtext: 'longtext',
    creative: 'content', interview: 'content',
    math: 'reasoning', reasoning: 'reasoning',
    translate: 'translate',
    image: 'vision', imagegen: 'imagegen',
    audio: 'audio', embedding: 'embedding', rerank: 'rerank',
    video: 'video',
    '3d': 'three_d'
  };
  /* 当前生效的分类筛选 key（来自 lastSort.catKey）。空串 = 不筛选（全部显示）。只读。 */
  function activeCatFilterPage() {
    var s = getModelSettings();
    var ls = s && s.lastSort;
    if (!ls || typeof ls !== 'object') return '';
    var ck = ls.catKey;
    return (typeof ck === 'string') ? ck : '';
  }
  /* R93：模型 id 是否匹配当前分类筛选。catKey 空 → 全部匹配；模型无类型映射 → 不匹配（不误伤筛选语义）。
     proxy / 自定义分类分支与 ai-settings.js modelInCategory 同口径（R93 修复，见上注释）。 */
  function isCustomCatKeyPage(key) {
    if (!key) return false;
    var cs = getModelSettings().categories;
    if (Object.prototype.toString.call(cs) !== '[object Array]') return false;
    for (var i = 0; i < cs.length; i++) {
      if (cs[i] && cs[i].key === key) return true;
    }
    return false;
  }
  /* R93：模型所属平台配置（AI_CONFIG.providers[key]），AI_CONFIG 未就绪 / 未知平台 → null */
  function providerConfigOf(m) {
    if (!m || !m.provider) return null;
    try {
      if (typeof AI_CONFIG !== 'undefined' && AI_CONFIG && AI_CONFIG.providers) {
        return AI_CONFIG.providers[m.provider] || null;
      }
    } catch (e) { /* AI_CONFIG 未就绪：按无平台配置处理 */ }
    return null;
  }
  /* R93：模型是否需要梯子——与 ai-settings.js 的 isNeedVPN / providerNeedProxy 同一口径：
     模型级 needVPN、平台级 needVPN、平台级 needProxy 任一命中即算（梯子=平台需代理）。 */
  function modelNeedVPN(m) {
    if (!m) return false;
    if (m.needVPN === true) return true;
    var p = providerConfigOf(m);
    return !!(p && (p.needVPN === true || p.needProxy === true));
  }
  function isHiddenByCategory(id) {
    var catKey = activeCatFilterPage();
    if (!catKey) return false;                 // 未选分类 → 不隐藏任何模型
    if (!id) return false;
    var m = getModelById(id);
    if (!m) return false;                      // 模型已不存在：交由其它过滤/上游兜底，不在此误判
    if (catKey === 'proxy') return !modelNeedVPN(m);   // R93：梯子=平台需代理（or-/gm- 等 needVPN/needProxy 平台模型可见）
    if (isCustomCatKeyPage(catKey)) {          // 自定义分类：优先级链上含该模型即匹配（与设置页 chainIdsOf 空链=无归属一致）
      var cm = getModelSettings().catModels;
      if (cm && typeof cm === 'object' && Object.prototype.toString.call(cm[catKey]) === '[object Array]') {
        return cm[catKey].indexOf(id) === -1;  // 链上 → 可见；不在链上 → 隐藏（渲染期，可逆）
      }
      return true;                             // 链未配置 → 无归属，隐藏（与设置页空链同口径）
    }
    var ts = (Object.prototype.toString.call(m.types) === '[object Array]') ? m.types : [];
    for (var i = 0; i < ts.length; i++) {
      if (CAT_OF_TYPE_PAGE[ts[i]] === catKey) return false;   // 命中分类 → 可见
    }
    return true;                               // 无任何 type 映射到该分类 → 隐藏（渲染期，可逆）
  }
  /* 过滤 disabled + 不可用（health） + 功能分类（R88-C） + 按 order 排序（order 在前者先排，未列入者按原顺序排后）
     过滤顺序说明：disabled → health → 分类，三者取【交集】（AND 语义），互不覆盖、互不破坏对方行为。 */
  function applyListSettings(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (!isDisabledId(list[i].id) && !isHiddenByHealth(list[i].id) && !isHiddenByCategory(list[i].id)) out.push(list[i]);
    }
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
    /* R131：统一走 xt-toast（项目红线：禁原生 alert/confirm/prompt） */
    try { if (typeof xtToast === 'function') { xtToast('info', msg, { position: 'bottom', offset: 80 }); return; } } catch (e0) { /* 忽略 */ }
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

  /* R93-4：识别视频文件 URL（.mp4/.webm/.mov；能力模块 video_url 实际为
     .mp4 + X-Tos-Expires 查询串）。返回 [URL 前文本, 视频URL, URL 后文本]
     或 null。新消息与旧存量纯文本消息走同一条识别路径——历史消息重渲染
     即得内嵌播放器，无需迁移存储格式。 */
  function videoUrlSplit(text) {
    var s = String(text || '');
    var m = /(https?:\/\/[^\s'"<>]+?\.(?:mp4|webm|mov)(?:\?[^\s'"<>]*)?)/i.exec(s);
    if (!m) { return null; }
    return [s.slice(0, m.index), m[1], s.slice(m.index + m[0].length)];
  }


  /* ============ R103：AI 生成视频「全屏播放」 ============ */
  /* 目标：手机 WebView 里把 AI 生成的视频放大到全屏观看。
     策略：优先原生 requestFullscreen（安卓 WebView 由宿主 onShowCustomView 接管，
     补上即生效）；API 缺失 / 调用抛错 / Promise 拒绝 / 1.2s 内未进入全屏时，
     退化为 CSS 全屏兜底：同一 video 元素 position:fixed + inset:0 + 极高 z-index
     + 黑底遮罩 + 关闭按钮。全程只改 video 的样式、不移动 / 不重载该元素，
     因此播放进度不中断；再点按钮、或按 Esc 即退出。
     约束：ES2017（不用可选链 / 空值合并 / replaceAll / at / flat），不弹 alert / confirm / prompt。 */
  var VID_FS_Z = 2147483000;            /* 遮罩层级（页面现有最高 400，远超之） */
  var VID_FS_BTN_CLS = 'ai-vid-fs-btn';
  var VID_FS_ACTIVE_CLS = 'ai-vid-fs-active';
  var VID_FS_VIDEO_CLS = 'ai-vid-full';

  /* 全屏按钮（SVG 图标，风格随页面；展开 / 关闭两态由 CSS 按容器 class 切换） */
  function vidFsBtnHtml() {
    return '<button type="button" class="' + VID_FS_BTN_CLS + '" data-ai-vid-fs="1" aria-label="全屏播放" title="全屏播放">' +
      '<svg class="ai-vid-ic-expand" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path d="M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 0h2v5h-5v-2h3v-3z" fill="currentColor"></path></svg>' +
      '<svg class="ai-vid-ic-close" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" fill="currentColor"></path></svg>' +
      '</button>';
  }
  function vidBoxOpen() { return '<span class="ai-vid-box">'; }
  function vidBoxClose() { return '</span>'; }

  function vidFsElement() {
    return doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement || null;
  }
  function vidHasNative(v) {
    return !!(v && (v.requestFullscreen || v.webkitRequestFullscreen || v.msRequestFullscreen || v.webkitEnterFullscreen));
  }
  function vidStripCls(str, cls) {
    var s = String(str || '');
    s = s.replace(new RegExp('(^|\\s)' + cls + '(\\s|$)', 'g'), ' ');
    s = s.replace(/^\s+|\s+$/g, '');
    return s.replace(/\s+/g, ' ');
  }

  /* ---- CSS 全屏兜底：只改样式、不搬元素，播放进度不中断 ---- */
  function vidCssBackdrop() { return doc.getElementById('aiVidBackdrop'); }
  function vidCssEnter(v) {
    if (!v || v.__aiVidFs) { return; }
    v.__aiVidFs = true;
    v.__aiVidPrevStyle = v.getAttribute('style') || '';
    v.className = vidStripCls(v.className, VID_FS_VIDEO_CLS);
    v.className = (v.className ? v.className + ' ' : '') + VID_FS_VIDEO_CLS;
    var box = v.parentNode;
    if (box && box.className && String(box.className).indexOf('ai-vid-box') >= 0) {
      box.className = vidStripCls(box.className, VID_FS_ACTIVE_CLS) + ' ' + VID_FS_ACTIVE_CLS;
    }
    if (!vidCssBackdrop()) {
      var bd = doc.createElement('div');
      bd.id = 'aiVidBackdrop';
      bd.setAttribute('style', 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:' + VID_FS_Z + ';');
      doc.body.appendChild(bd);
    }
  }
  function vidCssExit(v) {
    if (!v || !v.__aiVidFs) { return; }
    v.__aiVidFs = false;
    v.className = vidStripCls(v.className, VID_FS_VIDEO_CLS);
    v.setAttribute('style', v.__aiVidPrevStyle || '');
    v.__aiVidPrevStyle = '';
    var box = v.parentNode;
    if (box && box.className && String(box.className).indexOf('ai-vid-box') >= 0) {
      box.className = vidStripCls(box.className, VID_FS_ACTIVE_CLS);
    }
    var bd = vidCssBackdrop();
    if (bd && bd.parentNode) { bd.parentNode.removeChild(bd); }
  }

  /* 原生全屏：'called'（有 fullscreenchange 事件）/ 'ios'（iOS 视频全屏，无事件）/ 'none'（无 API 或抛错） */
  function vidRequestNative(v) {
    try {
      if (v.requestFullscreen) {
        var p = v.requestFullscreen();
        if (p && typeof p['catch'] === 'function') { p['catch'](function () { vidCssEnter(v); }); }
        return 'called';
      }
      if (v.webkitRequestFullscreen) { v.webkitRequestFullscreen(); return 'called'; }
      if (v.msRequestFullscreen) { v.msRequestFullscreen(); return 'called'; }
      if (v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return 'ios'; }
    } catch (e) { return 'none'; }
    return 'none';
  }
  function vidExitNative() {
    try {
      if (doc.exitFullscreen) { doc.exitFullscreen(); return; }
      if (doc.webkitExitFullscreen) { doc.webkitExitFullscreen(); return; }
      if (doc.msExitFullscreen) { doc.msExitFullscreen(); }
    } catch (e) { /* 忽略 */ }
  }

  function vidToggle(v) {
    if (!v) { return; }
    if (v.__aiVidFs) { vidCssExit(v); return; }              /* 已在 CSS 全屏 → 退出 */
    var active = vidFsElement();
    if (active && active === v) { vidExitNative(); return; } /* 已在原生全屏 → 退出 */
    if (!vidHasNative(v)) { vidCssEnter(v); return; }         /* 原生不可用 → CSS 兜底 */
    var settled = false;
    function onFsChange() {
      settled = true;
      doc.removeEventListener('fullscreenchange', onFsChange, false);
      doc.removeEventListener('webkitfullscreenchange', onFsChange, false);
    }
    doc.addEventListener('fullscreenchange', onFsChange, false);
    doc.addEventListener('webkitfullscreenchange', onFsChange, false);
    var mode = vidRequestNative(v);
    if (mode === 'none') {
      doc.removeEventListener('fullscreenchange', onFsChange, false);
      doc.removeEventListener('webkitfullscreenchange', onFsChange, false);
      vidCssEnter(v);
      return;
    }
    if (mode === 'ios') { return; }  /* iOS 原生全屏无事件，直接信任 */
    /* 'called'：1.2s 内既无 fullscreenchange、也未真正进入全屏 → 判定原生不可用，转 CSS */
    window.setTimeout(function () {
      doc.removeEventListener('fullscreenchange', onFsChange, false);
      doc.removeEventListener('webkitfullscreenchange', onFsChange, false);
      if (!settled && !vidFsElement() && !v.__aiVidFs) { vidCssEnter(v); }
    }, 1200);
  }

  /* 事件委托：命中全屏按钮 → 找同一容器内的 video → 切换全屏 */
  function vidFindBtn(node) {
    var el = node;
    while (el && el !== doc && el.nodeType === 1) {
      var cn = el.className;
      if (cn && typeof cn === 'string' && cn.indexOf(VID_FS_BTN_CLS) >= 0) { return el; }
      el = el.parentNode;
    }
    return null;
  }
  function vidFindVideo(btn) {
    if (!btn) { return null; }
    if (btn.__aiVid) { return btn.__aiVid; }
    var box = btn.parentNode;
    if (box && box.getElementsByTagName) {
      var vs = box.getElementsByTagName('video');
      if (vs && vs.length) { return vs[0]; }
    }
    return null;
  }
  function onVideoFsClick(e) {
    var btn = vidFindBtn(e.target);
    if (!btn) { return; }
    var v = vidFindVideo(btn);
    if (!v) { return; }
    if (e.preventDefault) { e.preventDefault(); }
    if (e.stopPropagation) { e.stopPropagation(); }
    vidToggle(v);
  }
  function onVideoFsKey(e) {
    var code = e.keyCode || e.which;
    if (code !== 27) { return; }
    var vids = doc.getElementsByTagName('video');
    for (var i = 0; i < (vids ? vids.length : 0); i++) {
      if (vids[i].__aiVidFs) { vidCssExit(vids[i]); break; }
    }
  }
  if (doc.addEventListener) {
    doc.addEventListener('click', onVideoFsClick, false);
    doc.addEventListener('keydown', onVideoFsKey, false);
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
      // R81：图片生成结果「![提示词](图片URL)」渲染为图片（文本链路上不会自然产生该语法）
      var imgM = /^!\[([^\]]*)\]\((\S+)\)$/.exec(line.trim());
      if (imgM) {
        flushPara();
        html += '<p><img class="ai-md-img" src="' + escHtml(imgM[2]) + '" alt="' +
          escHtml(imgM[1]) + '" style="max-width:100%;border-radius:10px;"></p>';
        continue;
      }
      // R93-4：视频结果 URL 任何渲染路径都内嵌 <video>（运行时首显与历史重渲染
      // 同口径）；3D 的 .zip 不在视频后缀名单内，仍走原展示不误伤。
      var vidM = videoUrlSplit(line);
      if (vidM) {
        flushPara();
        if (vidM[0]) { html += '<p>' + inlineMd(escHtml(vidM[0])) + '</p>'; }
        html += '<p>' + vidBoxOpen() +
          '<video class="ai-md-video" controls playsinline webkit-playsinline preload="metadata" src="' +
          escHtml(vidM[1]) + '" style="max-width:100%;border-radius:10px;display:block;"></video>' +
          vidFsBtnHtml() + vidBoxClose() + '</p>';
        if (vidM[2]) { html += '<p>' + inlineMd(escHtml(vidM[2])) + '</p>'; }
        continue;
      }
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

  /* ============ R86：生图结果本地化（签名 URL 1 小时过期，必须落成本地 Blob） ============
     硅基流动/火山生图返回的是 S3 预签名地址（X-Amz-Expires=3600），1 小时后 404。
     拿到结果后异步下载成 Blob → 用 createObjectURL 换掉会话里的 src（当前会话永不失效），
     同时尽力写一份进 IndexedDB（失败一律忽略，不影响主流程）。下载失败保留原 URL。 */
  var IMG_DB_NAME = 'xt_ai_images';
  var IMG_DB_STORE = 'blobs';
  var imgDbReq = null;

  function hasPromise() { return (typeof Promise === 'function'); }
  function canObjectUrl() {
    return !!(typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function' && typeof window.Blob === 'function');
  }
  function getImgIdb() {
    if (typeof window === 'undefined') return null;
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || null;
  }
  /* 打开（并按需建库）图片库；返回 Promise<IDBDatabase>，不可用时 reject */
  function openImgDb() {
    if (!hasPromise()) return Promise.reject(new Error('no promise'));
    if (imgDbReq) return imgDbReq;
    var idb = getImgIdb();
    if (!idb) { imgDbReq = Promise.reject(new Error('no idb')); return imgDbReq; }
    imgDbReq = new Promise(function (resolve, reject) {
      var req = null;
      try { req = idb.open(IMG_DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        try {
          var db = req.result;
          if (db.objectStoreNames && typeof db.objectStoreNames.contains === 'function' && !db.objectStoreNames.contains(IMG_DB_STORE)) {
            db.createObjectStore(IMG_DB_STORE);
          }
        } catch (e) { /* 建表失败不影响主流程 */ }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      req.onblocked = function () { reject(new Error('idb blocked')); };
    });
    return imgDbReq;
  }
  function idbPutBlob(url, blob) {
    if (!hasPromise() || !blob) return Promise.resolve(false);
    return openImgDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = null;
        try { tx = db.transaction(IMG_DB_STORE, 'readwrite'); } catch (e) { resolve(false); return; }
        tx.objectStore(IMG_DB_STORE).put(blob, url);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
        tx.onabort = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }
  function idbGetBlob(url) {
    if (!hasPromise()) return Promise.resolve(null);
    return openImgDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = null;
        try { tx = db.transaction(IMG_DB_STORE, 'readonly'); } catch (e) { resolve(null); return; }
        var rq = tx.objectStore(IMG_DB_STORE).get(url);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }
  /* 下载远程图片为 Blob：优先 fetch，老内核退化为 XHR（responseType=blob） */
  function downloadImageBlob(url) {
    if (!hasPromise()) return Promise.reject(new Error('no promise'));
    return new Promise(function (resolve, reject) {
      var done = false;
      function ok(b) { if (done) return; done = true; resolve(b); }
      function bad(e) { if (done) return; done = true; reject(e); }
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        try {
          window.fetch(url, { mode: 'cors' }).then(function (r) {
            if (!r || !r.ok) { reject(new Error('HTTP ' + (r ? r.status : 0))); return null; }
            return r.blob();
          }).then(function (b) {
            if (b && b.size) ok(b); else bad(new Error('empty blob'));
          }).catch(function () {
            if (done) return;                    // 已失败（HTTP 非 2xx）不再重复下载
            xhrDownload(url, ok, bad);           // fetch 本身不可用/被拦截 → 退 XHR
          });
          return;
        } catch (e) { /* 落到 XHR */ }
      }
      xhrDownload(url, ok, bad);
    });
  }
  function xhrDownload(url, resolve, reject) {
    if (typeof XMLHttpRequest === 'undefined') { reject(new Error('no xhr')); return; }
    var xhr = null;
    try { xhr = new XMLHttpRequest(); } catch (e) { reject(e); return; }
    xhr.open('GET', url, true);
    try { xhr.responseType = 'blob'; } catch (e2) { /* 老内核无 blob 支持 → 放弃本地化 */ }
    xhr.onload = function () {
      var r = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && r && typeof r === 'object' && r.size) resolve(r);
      else reject(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { reject(new Error('network')); };
    xhr.ontimeout = function () { reject(new Error('timeout')); };
    try { xhr.send(); } catch (e3) { reject(e3); }
  }
  /* 把容器内所有远程生图换成 objectURL（同一张只处理一次：data-persist 标记） */
  function persistGeneratedImages(root) {
    if (!root || !canObjectUrl()) return;
    var imgs = (root.querySelectorAll) ? root.querySelectorAll('img.ai-md-img') : [];
    for (var i = 0; i < imgs.length; i++) localizeImage(imgs[i]);
  }
  function localizeImage(img) {
    if (!img || !canObjectUrl()) return;
    if (img.getAttribute('data-persist')) return;          // 已处理过
    var url = img.getAttribute('src') || '';
    if (!/^https?:\/\//i.test(url)) return;                // 只处理远程签名地址
    img.setAttribute('data-persist', '1');
    downloadImageBlob(url).then(function (blob) {
      try { img.src = window.URL.createObjectURL(blob); } catch (e) { /* 换 src 失败就继续用原 URL */ }
      idbPutBlob(url, blob);                               // 存失败静默忽略
    }).catch(function () {
      // 下载失败（跨域/签名已过期/网络）：保留原 URL，绝不打断对话
      img.setAttribute('data-persist', '0');
    });
  }
  /* 打开历史会话时：用 IndexedDB 里的 Blob 复活已过期的图 */
  function restorePersistedImages(root) {
    if (!root || !canObjectUrl()) return;
    var imgs = (root.querySelectorAll) ? root.querySelectorAll('img.ai-md-img') : [];
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i];
      var url = el.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(url)) continue;
      if (el.getAttribute('data-persist')) continue;
      el.setAttribute('data-persist', '1');
      swapFromDb(el, url);
    }
  }
  function swapFromDb(img, url) {
    idbGetBlob(url).then(function (blob) {
      if (!blob) return;
      try { img.src = window.URL.createObjectURL(blob); } catch (e) { /* 忽略 */ }
    }).catch(function () { /* 忽略 */ });
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
    // 有文字或有附件（图片/语音）就必须可点：只读当前值，不依赖任何缓存状态
    var v = aiInput ? String(aiInput.value || '').trim() : '';
    var empty = (!v && !state.image && !state.audio);
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
  /* R86：清理语音附件（与 clearImage 同构） */
  function clearAudio() {
    if (REC.on) stopRecord();          // 录音中清理＝先停再丢弃
    state.audio = null;
    if (aiAudioPreview) aiAudioPreview.style.display = 'none';
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

  /* ============ R86：语音识别入口（麦克风录音 → 识别结果直接发出） ============
     录制写法复用 assets/chat-local.js 的 getUserMedia + MediaRecorder mime 候选；
     不支持 / 权限被拒一律 toast 提示，不弹 alert，不静默失败。
     V-polish 续（2026-09-21）：识别结果改为直接作为用户消息发出（见 sendAudioForTranscribe），
     不再回填输入框等二次点击；失败/空文本保留音频可重试。 */
  var REC = { rec: null, chunks: [], stream: null, start: 0, tick: null, stopTimer: null, on: false, discardNative: false };
  var NATIVE_REC = false;                       // R106/L2：当前是否处于原生桥录音态（与 REC 分开记）
  var MAX_REC_MS = 60000;                       // 单次最长 60 秒
  var MIC_MIME_CANDS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

  function modelHasType(m, t) {
    if (!m || !t) return false;
    var ts = m.types;
    return (Object.prototype.toString.call(ts) === '[object Array]' && ts.indexOf(t) >= 0);
  }
  function micSupported() {
    var ok = false;
    try {
      ok = !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.Blob);
    } catch (e) { ok = false; }
    if (!ok) {
      try { ok = !!(window.MediaRecorder && window.Blob && (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia)); } catch (e2) { ok = false; }
    }
    return ok;
  }
  /* 老内核只有 navigator.getUserMedia(callback) 时，包一层 Promise 统一走法 */
  function legacyGetUserMedia() {
    return new Promise(function (resolve, reject) {
      var fn = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
      if (!fn) { reject(new Error('unsupported')); return; }
      try { fn.call(navigator, { audio: true }, resolve, function (e) { reject(e || new Error('denied')); }); }
      catch (e) { reject(e); }
    });
  }
  function pickMime() {
    var mime = '';
    try {
      if (window.MediaRecorder.isTypeSupported) {
        for (var i = 0; i < MIC_MIME_CANDS.length; i++) {
          if (MediaRecorder.isTypeSupported(MIC_MIME_CANDS[i])) { mime = MIC_MIME_CANDS[i]; break; }
        }
      }
    } catch (e) { mime = ''; }
    return mime;
  }
  function setMicRecording(on, seconds) {
    if (!aiMicBtn) return;
    if (on) {
      aiMicBtn.innerHTML = STOP_SVG;
      aiMicBtn.style.color = '#e5484d';
      aiMicBtn.classList.add('recording');
      aiMicBtn.title = '录音中 ' + seconds + ' 秒，点击结束';
      aiMicBtn.setAttribute('aria-label', '结束录音');
    } else {
      aiMicBtn.innerHTML = MIC_SVG;
      aiMicBtn.style.color = '';
      aiMicBtn.classList.remove('recording');
      aiMicBtn.title = '点击开始录音，再点一次结束（最长 60 秒）';
      aiMicBtn.setAttribute('aria-label', '语音输入');
    }
  }
  function setAudioPreview(text) {
    if (!aiAudioPreview) return;
    aiAudioPreview.style.display = 'inline-flex';
    if (aiAudioLabel) aiAudioLabel.textContent = text;
  }
  function toggleRecord() {
    if (state.sending) { toast('正在识别中，请稍候'); return; }
    if (REC.on) { stopRecord(); return; }
    if (micSupported()) { startRecord(); return; }        // L1：网页录音（getUserMedia，原 startRecord 流程不变）
    if (nativeVoiceOk()) { startNativeRecord(); return; } // L2：原生桥（APK 内预埋，随下次打包生效）
    pickVoiceBySystem();                                  // L3：系统录音机（隐藏 file input capture，AI.html 不动）
  }
  /* R106/L2：原生桥可用性探测（仅 APK 内 window.XTAppBridge.startVoiceRecord 为函数时命中） */
  function nativeVoiceOk() {
    try { return !!(window.XTAppBridge && typeof window.XTAppBridge.startVoiceRecord === 'function'); } catch (e) { return false; }
  }
  /* R106/L2：调桥开始录音；60 秒上限与 REC 清理语义刻意与 L1 保持一致（复用 REC.tick/stopTimer/start） */
  function startNativeRecord() {
    var started = false;
    try {
      if (window.XTAppBridge && typeof window.XTAppBridge.startVoiceRecord === 'function') { window.XTAppBridge.startVoiceRecord(); started = true; }
    } catch (e) { started = false; }
    if (!started) { pickVoiceBySystem(); return; }   // 桥调用失败 → 退到系统录音机，不静默
    NATIVE_REC = true;
    REC.on = true;
    REC.start = Date.now();
    setMicRecording(true, 0);
    toast('录音中…再次点击麦克风结束（最长 60 秒）');
    REC.tick = setInterval(function () {
      var s = Math.round((Date.now() - REC.start) / 1000);
      setMicRecording(true, s);
    }, 1000);
    REC.stopTimer = setTimeout(function () { stopRecord(); toast('已到 60 秒上限，自动结束录音'); }, MAX_REC_MS);
  }
  /* R106/L3：动态建隐藏 <input type=file accept=audio/* + 裸 capture> 调起系统录音机；
     纯 JS 创建/click/remove（不碰 AI.html）；选回的文件走既有发送链路 sendAudioForTranscribe。 */
  function pickVoiceBySystem() {
    var input = null;
    try {
      input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.setAttribute('capture', '');   // 裸属性 capture（勿写 capture="microphone"）
      input.style.display = 'none';
    } catch (e) { input = null; }
    if (!input) { toast('当前浏览器不支持录音，请用 Chrome 打开并允许麦克风权限'); return; }
    var cleaned = false;
    function cleanup() {
      if (cleaned) return; cleaned = true;
      try { input.onchange = null; } catch (e) { /* 忽略 */ }
      try { if (input.parentNode) input.parentNode.removeChild(input); } catch (e2) { /* 忽略 */ }
    }
    input.onchange = function () {
      var f = null;
      try { f = (input.files && input.files[0]) ? input.files[0] : null; } catch (e) { f = null; }
      if (f) applyVoiceFile(f);
      cleanup();
    };
    try { doc.body.appendChild(input); } catch (e) { /* 兜底：不中断，仍尝试 click */ }
    try { input.click(); } catch (e2) { cleanup(); toast('无法调起系统录音机，请改用 Chrome 或 App 内录音'); return; }
    toast('请在系统录音机里录音，完成后选择该音频文件');
  }
  /* R106/L3：把系统录音机选回的文件填进 state.audio（结构与 L1 录完一致，秒数未知先记 0） */
  function applyVoiceFile(f) {
    if (!f) return;
    var mime = f.type || 'audio/mpeg';
    state.audio = { blob: f, file: f, mime: mime, seconds: 0 };
    setAudioPreview('已选录音文件，点发送转文字');
    updateSendEnabled();
    if (mime === 'audio/3gpp' || mime === 'audio/amr' || mime === 'audio/x-amr' || mime === 'audio/aac') {
      toast('本机录音为 ' + mime + ' 格式，识别可能失败，建议在 App 内或用电脑 Chrome 录音');
    }
  }
  function startRecord(isRetry) {
    var p = null;
    try {
      p = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        ? navigator.mediaDevices.getUserMedia({ audio: true })
        : legacyGetUserMedia();
    } catch (e) { p = legacyGetUserMedia(); }
    if (!p || typeof p.then !== 'function') { toast('无法启动录音，请更换浏览器重试'); return; }
    p.then(function (stream) {
      REC.stream = stream;
      REC.chunks = [];
      REC.start = Date.now();
      var mime = pickMime();
      try { REC.rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { try { REC.rec = new MediaRecorder(stream); } catch (e2) { REC.rec = null; } }
      if (!REC.rec) { releaseStream(); toast('录音组件初始化失败，请更换浏览器重试'); return; }
      REC.rec.ondataavailable = function (e) { if (e && e.data && e.data.size) REC.chunks.push(e.data); };
      REC.rec.onstop = onRecordStop;
      try { REC.rec.start(); } catch (e3) { releaseStream(); toast('无法开始录音，请检查麦克风权限'); return; }
      REC.on = true;
      setMicRecording(true, 0);
      toast('录音中…再次点击麦克风结束（最长 60 秒）');
      REC.tick = setInterval(function () {
        var s = Math.round((Date.now() - REC.start) / 1000);
        setMicRecording(true, s);
      }, 1000);
      REC.stopTimer = setTimeout(function () { stopRecord(); toast('已到 60 秒上限，自动结束录音'); }, MAX_REC_MS);
    }).catch(function (err) {
      var nm = (err && err.name) ? String(err.name) : '';
      /* 2026-09-21 麦克风排障打点：失败原因进 App 运行日志（导出可精确定位权限/占用/无设备） */
      try { if (window.errorBoundary && window.errorBoundary.report) window.errorBoundary.report('mic getUserMedia fail: ' + nm + ' ' + ((err && err.message) || ''), location.href, 'mic-trace'); } catch (eR) { }
      if ((nm === 'NotReadableError' || nm === 'TrackStartError') && !isRetry) {
        /* 占用自愈：上一次原生录音/识别未正常收尾会一直持有麦克风（getUserMedia 表现为 NotReadable）。
           优先 releaseMic()（静默硬释放，不会回调出旧录音）；旧包退回 stopVoiceRecord() 并置
           discardNative 丢弃即将到来的旧回调。随后自动重试一次；再失败才提示用户。 */
        try {
          if (window.XTAppBridge && typeof window.XTAppBridge.releaseMic === 'function') {
            window.XTAppBridge.releaseMic();
          } else if (window.XTAppBridge && typeof window.XTAppBridge.stopVoiceRecord === 'function') {
            REC.discardNative = true;
            window.XTAppBridge.stopVoiceRecord();
          }
        } catch (e1) { /* 忽略 */ }
        releaseStream();
        toast('正在释放麦克风，请稍候…');
        setTimeout(function () { startRecord(true); }, 350);
        return;
      }
      if (nm === 'NotAllowedError' || nm === 'PermissionDeniedError' || nm === 'SecurityError') {
        toast('麦克风权限被拒绝，请在浏览器/系统设置里允许后重试');
      } else if (nm === 'NotFoundError' || nm === 'DevicesNotFoundError') {
        toast('没有检测到麦克风设备');
      } else if (nm === 'NotReadableError' || nm === 'TrackStartError') {
        toast('麦克风被其它程序占用，请关闭后重试');
      } else {
        toast('无法访问麦克风，请检查权限');
      }
    });
  }
  function stopRecord() {
    if (REC.tick) { clearInterval(REC.tick); REC.tick = null; }
    if (REC.stopTimer) { clearTimeout(REC.stopTimer); REC.stopTimer = null; }
    if (REC.rec && REC.rec.state === 'recording') { try { REC.rec.stop(); } catch (e) { /* 忽略：失败也不会留下状态 */ } }
    if (NATIVE_REC) {   // R106/L2：原生桥录音态停止
      NATIVE_REC = false;
      try { if (window.XTAppBridge && typeof window.XTAppBridge.stopVoiceRecord === 'function') window.XTAppBridge.stopVoiceRecord(); } catch (e2) { /* 忽略：桥异常不影响状态清理 */ }
    }
    REC.on = false;
    setMicRecording(false, 0);
  }
  function releaseStream() {
    if (!REC.stream) return;
    try {
      var tracks = REC.stream.getTracks ? REC.stream.getTracks() : null;
      if (tracks) { for (var i = 0; i < tracks.length; i++) { try { tracks[i].stop(); } catch (e) { /* 忽略 */ } } }
    } catch (e2) { /* 忽略 */ }
    REC.stream = null;
  }
  function onRecordStop() {
    var secs = Math.max(1, Math.round((Date.now() - REC.start) / 1000));
    var mime = (REC.rec && REC.rec.mimeType) ? REC.rec.mimeType : (pickMime() || 'audio/webm');
    var blob = null;
    try { blob = new Blob(REC.chunks, { type: mime }); } catch (e) { blob = null; }
    REC.chunks = [];
    releaseStream();
    if (!blob || !blob.size) { toast('没有录到声音，请再试一次'); updateSendEnabled(); return; }
    var file = null;
    try {
      if (typeof window !== 'undefined' && typeof window.File === 'function') {
        var ext = audioExt(mime);   // R106 追加：与 runAudioRecognition 同一口径，防「名 .webm 实为 m4a/3gp」
        file = new File([blob], 'voice.' + ext, { type: mime });   // 上传接口通常需要带文件名
      }
    } catch (e2) { file = null; }
    state.audio = { blob: blob, file: file, mime: mime, seconds: secs };
    setAudioPreview('已录 ' + secs + ' 秒，点发送转文字');
    updateSendEnabled();
  }
  /* R106：原生桥录音结果回调（APK evaluateJavascript 注入 JSON 字符串）。
     ok=false → 明确 toast；ok=true → dataURL 转 Blob 填充 state.audio（与 L1 结构一致）。
     解析失败安全 no-op，绝不清空既有附件、绝不抛错到宿主。 */
  function b64ToBytes(b64) {
    var bin = '';
    var step = 8192;   // 分块 atob，避免超大 dataURL 一次性解码卡死老 WebView
    try {
      for (var i = 0; i < b64.length; i += step) { bin += atob(b64.substring(i, i + step)); }
    } catch (e) { return null; }
    var n = bin.length;
    var bytes = new Uint8Array(n);
    for (var j = 0; j < n; j++) { bytes[j] = bin.charCodeAt(j) & 0xff; }
    return bytes;
  }
  function dataUrlToBlob(dataUrl) {
    try {
      var s = String(dataUrl || '');
      var comma = s.indexOf(',');
      if (comma < 0) return null;
      var meta = s.substring(0, comma);
      var data = s.substring(comma + 1);
      var mime = 'audio/mp4';
      var mm = /^data:([^;,]+)/i.exec(meta);
      if (mm && mm[1]) mime = mm[1];
      var bytes = null;
      if (meta.indexOf(';base64') >= 0) { bytes = b64ToBytes(data); }
      else {
        try {
          var txt = decodeURIComponent(data);
          var arr = new Uint8Array(txt.length);
          for (var k = 0; k < txt.length; k++) { arr[k] = txt.charCodeAt(k) & 0xff; }
          bytes = arr;
        } catch (e) { bytes = null; }
      }
      if (!bytes) return null;
      return new Blob([bytes], { type: mime });
    } catch (e2) { return null; }
  }
  window.__onVoiceRecord = function (jsonStr) {
    /* 【2026-09-21 麦克风排障】自愈期间（releaseMic/stopVoiceRecord 硬释放）可能飘来上一次残留的
       录音回调，此时静默丢弃，避免把旧录音误当成本次结果填进输入框。 */
    var discard = REC.discardNative; REC.discardNative = false;
    if (discard) return;
    var obj = null;
    try { obj = (typeof jsonStr === 'string') ? JSON.parse(jsonStr) : jsonStr; } catch (e) { obj = null; }
    if (!obj) return;   // 解析失败：安全 no-op
    if (obj.ok !== true) { toast('录音失败或权限被拒绝，请在系统设置里允许麦克风权限'); return; }
    var blob = dataUrlToBlob(obj.dataUrl);
    if (!blob || !blob.size) { toast('没有录到声音，请再试一次'); return; }
    var secs = Math.max(1, Math.round(Number(obj.durationSec) || 0) || 1);
    var mime = blob.type || 'audio/mp4';
    var file = null;
    try { if (typeof window.File === 'function') { file = new File([blob], 'voice.' + audioExt(mime), { type: mime }); } } catch (e2) { file = null; }
    state.audio = { blob: blob, file: file, mime: mime, seconds: secs };
    setAudioPreview('已录 ' + secs + ' 秒，点发送转文字');
    updateSendEnabled();
  };
  /* DOM 注入：麦克风按钮挂在附件按钮旁边；语音条挂在图片预览旁边（AI.html 不动） */
  function ensureMicButton() {
    if (aiMicBtn || !aiAttachBtn) return;
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = 'aiMicBtn';
    b.className = 'ai-icon-btn';
    b.setAttribute('aria-label', '语音输入');
    b.title = '点击开始录音，再点一次结束（最长 60 秒）';
    b.innerHTML = MIC_SVG;
    var host = aiAttachBtn.parentNode;
    if (host) {
      if (aiAttachBtn.nextSibling) host.insertBefore(b, aiAttachBtn.nextSibling);
      else host.appendChild(b);
    } else if (aiInputBox) { aiInputBox.appendChild(b); } else { return; }
    aiMicBtn = b;
    bindEl(b, 'click', toggleRecord);
  }
  function ensureAudioPreview() {
    if (aiAudioPreview) return;
    var box = doc.createElement('div');
    box.id = 'aiAudioPreview';
    box.style.cssText = 'display:none;align-items:center;gap:6px;margin:6px 0 0;padding:4px 10px;border-radius:999px;background:rgba(128,128,128,.16);font-size:12px;color:#666;';
    box.innerHTML = '<span id="aiAudioLabel">语音</span>' +
      '<button type="button" id="aiAudioRemove" title="移除" style="border:none;background:none;color:#e5484d;cursor:pointer;font-size:12px;padding:0 2px;">✕</button>';
    var host = (aiImgPreview && aiImgPreview.parentNode) ? aiImgPreview.parentNode : aiInputBox;
    if (!host) return;
    if (aiImgPreview && aiImgPreview.nextSibling) host.insertBefore(box, aiImgPreview.nextSibling);
    else host.appendChild(box);
    aiAudioPreview = box;
    aiAudioLabel = $('aiAudioLabel');
    bindById('aiAudioRemove', 'click', clearAudio);
  }

  /* ---------- R93-5b：视频「带声音」状态读取（map 由 ai-settings.js 模型列表写入） ---------- */
  function videoAudioOnFor(id) {
    try {
      var v = localStorage.getItem(AUDIO_MODELS_KEY);
      var o = v ? JSON.parse(v) : null;
      return !!(o && typeof o === 'object' && o[id] === true);
    } catch (e) { return false; }
  }

  /* ---------- 发送语音：识别完成 → 转写文本直接作为用户消息发出（走 sendMessage 既有链路） ---------- */
  function asrResultText(res) {
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object') {
      if (typeof res.text === 'string' && res.text) return res.text;
      if (typeof res.content === 'string' && res.content) return res.content;
      if (res.data && typeof res.data.text === 'string') return res.data.text;
      if (res.data && typeof res.data === 'string') return res.data;
      if (typeof res.result === 'string') return res.result;
    }
    return '';
  }
  /* 直连能力调用器（ai-service.js 的 xtRunCapability）：现在没导出就退到 callAI，
     一旦底座把它挂到 AI_SERVICE 上，语音识别自动走能力链路，本文件不用改第二遍 */
  function capRunner() {
    try {
      if (typeof window !== 'undefined') {
        if (window.AI_SERVICE && typeof window.AI_SERVICE.xtRunCapability === 'function') return window.AI_SERVICE.xtRunCapability;
        if (typeof window.xtRunCapability === 'function') return window.xtRunCapability;
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }
  /* R106 追加：按 mime 精确推导音频扩展名。
     第三方 ASR（如 SiliconFlow /v1/audio/transcriptions）常依文件名判类型，
     扩展名必须与真实字节一致——否则 m4a/3gp/amr/aac 顶着「.webm」名会被拒。
     规则：mime 先 toLowerCase()、截断 ';'（去 codecs 参数）并去首尾空格；
     命中已知类型按表返回；未命中则兜底取 '/' 后子类型（去 'x-' 前缀、仅留 [a-z0-9]），
     取不到才回 webm（webm 不再是默认兜底）。 */
  function audioExt(mime) {
    var m = String(mime || '').toLowerCase();
    var semi = m.indexOf(';');
    if (semi >= 0) m = m.substring(0, semi);
    m = m.replace(/^\s+|\s+$/g, '');
    if (!m) return 'webm';
    if (m === 'audio/mp4' || m === 'audio/m4a' || m === 'audio/x-m4a') return 'm4a';
    if (m === 'audio/ogg' || m === 'audio/opus' || m === 'application/ogg') return 'ogg';
    if (m === 'audio/wav' || m === 'audio/x-wav' || m === 'audio/wave') return 'wav';
    if (m === 'audio/aac') return 'aac';
    if (m === 'audio/3gpp' || m === 'audio/3gpp2') return '3gp';
    if (m === 'audio/amr') return 'amr';
    if (m === 'audio/webm' || m === 'video/webm') return 'webm';
    if (m === 'audio/mpeg' || m === 'audio/mp3') return 'mp3';
    /* 兜底：按 '/' 后段取子类型，去 'x-' 前缀；含非 [a-z0-9] 视为取不到 → webm */
    var slash = m.indexOf('/');
    if (slash >= 0) {
      var sub = m.substring(slash + 1).replace(/^x-/, '');
      if (sub && /^[a-z0-9]+$/.test(sub)) return sub;
    }
    return 'webm';
  }
  function runAudioRecognition(audio, m) {
    var id = (m && m.id) ? m.id : getSelectedModelId();
    var payload = audio.file || audio.blob;
    var input = { blob: payload, file: payload, fileName: 'voice.' + audioExt(audio.mime), mime: audio.mime, seconds: audio.seconds };
    /* 1) 能力直连（ai-cap-audio.js 注册的 asr）：不占 chat 链路，且会落一条用量账 */
    var runner = capRunner();
    if (runner) {
      return new Promise(function (resolve, reject) {
        var p = null;
        try { p = runner(id, input, {}); } catch (e) { reject(e); return; }
        if (!p || typeof p.then !== 'function') { reject(new Error('语音识别链路不可用')); return; }
        p.then(function (r) {
          var body = (r && r.result !== undefined && r.result !== null) ? r.result : r;
          resolve(asrResultText(body));
        }, reject);
      });
    }
    /* 2) 退到 callAI：音频挂在 opts 上，由底座分派到 asr 类型模型 */
    if (typeof callAI !== 'function') return Promise.reject(new Error('AI 服务暂未就绪'));
    return new Promise(function (resolve, reject) {
      var opts = {
        image: null,
        audio: audio.blob,
        audioFile: audio.file,
        audioMime: audio.mime,
        audioSeconds: audio.seconds,
        model: (m && m.id) ? m.id : getSelectedModelId(),
        max: false,
        onChunk: function () { /* ASR 不走流式渲染 */ },
        onFallback: function () { /* 忽略 */ },
        onModelUsed: function () { /* 忽略 */ }
      };
      var p = null;
      try { p = callAI('general', [{ role: 'user', content: '请把这段语音转成文字。' }], opts); }
      catch (e) { reject(e); return; }
      if (!p || typeof p.then !== 'function') { reject(new Error('语音识别链路不可用')); return; }
      p.then(function (res) { resolve(asrResultText(res)); }, reject);
    });
  }
  function sendAudioForTranscribe(text) {
    var m = getModelById(getSelectedModelId());
    if (!hasPromise()) { toast('当前浏览器不支持语音识别，请用 Chrome 打开'); return; }
    /* R106：L2 原生桥 / L3 系统录音机已捕获音频时，不再要求 getUserMedia 环境；
       L1（micSupported 为真）路径行为完全不变 */
    if (!micSupported() && !state.audio) { toast('当前浏览器不支持语音识别，请用 Chrome 打开'); return; }
    if (!m || !modelHasType(m, 'audio')) {
      toast('当前模型不支持语音识别，请在模型列表「语音识别」区里选一个模型');
      return;
    }
    var audio = state.audio;
    if (!audio || !audio.blob) { clearAudio(); return; }
    setSendBusy(true);
    /* 识别中可见反馈：按钮置灰（.sending 态）+ 预览条「识别中…」+ toast 明示直发行为 */
    setAudioPreview('识别中…');
    toast('正在识别语音…完成后将直接发送');
    runAudioRecognition(audio, m).then(function (txt) {
      setSendBusy(false);
      txt = String(txt || '').replace(/^\s+|\s+$/g, '');
      if (!txt) {
        /* 空文本兜底：不静默丢 —— 音频保留（可重试）+ 预览恢复 + toast 明示 */
        setAudioPreview('已录 ' + audio.seconds + ' 秒，点发送转文字');
        toast('没有识别出内容，请靠近麦克风再说一次');
        return;
      }
      clearAudio();     // 识别成功即消费掉附件，避免重复发送
      var merged = text ? (text + (/\s$/.test(text) ? '' : ' ') + txt) : txt;
      /* V-polish 续（2026-09-21）：识别完成 → 转写文本【直接发出】，不再回填输入框等二次点击。
         做法：merged 写入输入框后立即调 sendMessage() —— 走既有发送链路
         （setSendBusy → 用户气泡 addUserBubble → 清输入框 → askAI），气泡展示与普通文本完全一致。
         失败 / 空文本分支保持现状兜底（toast + 音频保留可重试），绝不静默丢。 */
      if (!aiInput) { toast('识别完成，但输入框未就绪，请刷新后重试'); return; }
      aiInput.value = merged;
      autoGrow();
      updateSendEnabled();
      sendMessage();
    }).catch(function (err) {
      setSendBusy(false);
      setAudioPreview('已录 ' + audio.seconds + ' 秒，点发送转文字');
      var msg = (err && err.message) ? String(err.message) : '';
      if (msg.indexOf('暂未就绪') >= 0) toast('AI 服务暂未就绪，请稍后重试');
      else if (msg.indexOf('链路不可用') >= 0) toast('该模型的语音识别链路还没接好，请换个语音模型或稍后再试');
      else toast('语音识别失败：' + (msg || '请稍后重试'));
    });
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

  /* ============ R107b：思考过程折叠面板（AI.html 不动：DOM 与样式全部由本文件注入） ============
     三态兜底：
       1) 流式思维链 —— 收到 onReasoning 增量即创建面板，展开 + 「思考中…」呼吸动画，正文逐字渲染；
       2) 回答完成   —— 标题变「思考过程」并默认收起，点击标题可展开回看（含用时）；
       3) 全程无思维链 —— 非推理模型或旧版服务层不回调 onReasoning，面板根本不创建，
          气泡表现与改动前完全一致；onChunk / onFallback / onModelUsed 行为均不受影响。 */
  var REASON_CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="6 9 12 15 18 9"/></svg>';
  /* 面板样式（老 WebView 兼容的纯字符串）：init 时一次性注入 <style id="aiReasoningPanelStyle">，
     全部选择器收敛在 .ai-bubble-ai 下，配色用半透明中性色，深浅主题均可读 */
  var aiReasoningPanelStyle =
    '.ai-bubble-ai .ai-reason{margin:0 0 8px;border:1px solid rgba(128,128,128,.28);border-radius:10px;background:rgba(128,128,128,.08);overflow:hidden;text-align:left}' +
    '.ai-bubble-ai .ai-reason-head{display:flex;align-items:center;gap:6px;width:100%;padding:6px 10px;border:none;background:transparent;cursor:pointer;color:inherit;font:inherit;font-size:13px;line-height:1.4;text-align:left}' +
    '.ai-bubble-ai .ai-reason-caret{display:inline-flex;transition:transform .2s ease}' +
    '.ai-bubble-ai .ai-reason.open .ai-reason-caret{transform:rotate(180deg)}' +
    '.ai-bubble-ai .ai-reason-title{flex:1}' +
    '.ai-bubble-ai .ai-reason-time{opacity:.65;font-size:12px}' +
    '.ai-bubble-ai .ai-reason.thinking .ai-reason-title{animation:aiReasonPulse 1.2s ease-in-out infinite}' +
    '@keyframes aiReasonPulse{0%,100%{opacity:1}50%{opacity:.45}}' +
    '.ai-bubble-ai .ai-reason-body{display:none;padding:0 10px 8px;max-height:240px;overflow-y:auto;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:inherit;opacity:.85}' +
    '.ai-bubble-ai .ai-reason.open .ai-reason-body{display:block}';
  var _reasonStyleDone = false;
  /* 样式只注入一次；已存在同 id（重复初始化）时直接复用。注入失败不影响消息主链路 */
  function ensureReasoningStyle() {
    if (_reasonStyleDone) return;
    try {
      if (!doc.getElementById('aiReasoningPanelStyle')) {
        var st = doc.createElement('style');
        st.id = 'aiReasoningPanelStyle';
        st.type = 'text/css';
        st.textContent = aiReasoningPanelStyle;
        var host = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement;
        if (host) host.appendChild(st);
      }
      _reasonStyleDone = true;
    } catch (e) { /* 忽略：无头环境下样式注入失败不能打断对话 */ }
  }
  /* 在 AI 气泡顶部创建（或替换旧的）思考面板；streaming=true 时为「思考中」展开态。
     返回面板句柄 { wrap, head, title, timeEl, bodyEl, textEl }，创建失败返回 null */
  function createReasoningPanel(b, streaming) {
    if (!b || !b.bubble) return null;
    var stale = null;
    try { stale = b.bubble.querySelector('.ai-reason'); } catch (e) { stale = null; }
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    ensureReasoningStyle();
    var wrap = doc.createElement('div');
    wrap.className = 'ai-reason' + (streaming ? ' open thinking' : ' open');
    var head = doc.createElement('button');
    head.type = 'button';
    head.className = 'ai-reason-head';
    head.setAttribute('aria-expanded', streaming ? 'true' : 'false');
    var caret = doc.createElement('span'); caret.className = 'ai-reason-caret'; caret.innerHTML = REASON_CHEVRON_SVG;
    var title = doc.createElement('span'); title.className = 'ai-reason-title';
    title.textContent = streaming ? '思考中…' : '思考过程';
    var timeEl = doc.createElement('span'); timeEl.className = 'ai-reason-time';
    head.appendChild(caret); head.appendChild(title); head.appendChild(timeEl);
    var body = doc.createElement('div'); body.className = 'ai-reason-body';
    var textEl = doc.createElement('div'); textEl.className = 'ai-reason-text';
    body.appendChild(textEl);
    wrap.appendChild(head); wrap.appendChild(body);
    head.addEventListener('click', function () {
      var open = wrap.classList.contains('open');
      if (open) wrap.classList.remove('open'); else wrap.classList.add('open');
      head.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    b.bubble.insertBefore(wrap, b.bubble.firstChild);
    return { wrap: wrap, head: head, title: title, timeEl: timeEl, bodyEl: body, textEl: textEl };
  }
  /* 流式态：写入思维链全文并让正文滚动区始终贴底 */
  function setReasoningBody(rp, text) {
    if (!rp || !rp.textEl) return;
    try { rp.textEl.textContent = String(text || ''); } catch (e) { return; }
    try { rp.bodyEl.scrollTop = rp.bodyEl.scrollHeight; } catch (e2) { /* 忽略 */ }
  }
  /* 完成态：摘掉「思考中」动画，标题改「思考过程」，标注用时并默认收起。
     startedAt 缺失 / 异常时静默跳过用时，不影响收起动作 */
  function finishReasoningPanel(rp, startedAt) {
    if (!rp || !rp.wrap || !rp.wrap.parentNode) return;
    rp.wrap.classList.remove('thinking');
    rp.wrap.classList.remove('open');
    rp.title.textContent = '思考过程';
    try {
      var secs = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : 0;
      rp.timeEl.textContent = secs ? '· ' + secs + 's' : '';
    } catch (e) { /* 忽略 */ }
  }

  function addUserBubble(text, img) {
    var msg = doc.createElement('div'); msg.className = 'ai-msg ai-msg-user';
    var bubble = doc.createElement('div'); bubble.className = 'ai-bubble ai-bubble-user';
    if (img) { var im = doc.createElement('img'); im.className = 'ai-msg-img'; im.src = img; bubble.appendChild(im); }
    if (text) { var p = doc.createElement('div'); p.textContent = text; bubble.appendChild(p); }
    var av = doc.createElement('div'); av.className = 'ai-avatar ai-avatar-user';
    av.innerHTML = userAvatarHtml();
    /* 头像换边补丁（方案A，2026-09-21）：DOM 改为「先头像、后气泡」——
       配合 .ai-msg-user{flex-direction:row-reverse}（AI.html）渲染成 [气泡][头像] 整组靠右，
       用户头像落在最右，与 AI 行（先头像后气泡）镜像对称。CSS 一律不动。 */
    msg.appendChild(av); msg.appendChild(bubble);
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

  /* ============ R92-A：能力型模型路由（video / 3d） ============ */
  /* predictFuncType 只按输入文字猜功能，不知道用户选了什么模型：选中 types 含
     'video'（或 '3d'）的模型时，普通对话链路 chat/completions 必然失败（视频/3D
     是分钟级异步任务，走的是异步任务端点）。此处在 askAI 前置检查选中模型的
     types，命中即改走 xtRunCapability 直连链路（ai-service.js 守卫式导出；
     ai-cap-video.js / ai-cap-3d.js 内部完成 创建→轮询→取结果→上报用量），
     其余路由（普通对话 / 翻译 / 推理 / 生图）一律不变。 */
  var CAP_MODEL_TYPES = ['video', '3d'];

  function isCapabilityModel(m) {
    if (!m || !m.types || typeof m.types.length !== 'number') { return false; }
    for (var i = 0; i < m.types.length; i++) {
      for (var j = 0; j < CAP_MODEL_TYPES.length; j++) {
        if (String(m.types[i]) === CAP_MODEL_TYPES[j]) { return true; }
      }
    }
    return false;
  }

  function capModelKind(m) {
    if (!m || !m.types || typeof m.types.length !== 'number') { return ''; }
    for (var i = 0; i < m.types.length; i++) {
      var t = String(m.types[i]);
      if (t === 'video') { return 'video'; }
      if (t === '3d') { return '3d'; }
    }
    return '';
  }

  /** 命中能力型模型：接管本次发送并返回 true（异步完成后自行收尾）；否则返回 false 走原路由 */
  function routeCapabilityModel(aiB, text, image) {
    var selId = getSelectedModelId();
    if (!selId || selId === 'auto') { return false; }
    var m = getModelById(selId);
    if (!m || !isCapabilityModel(m)) { return false; }
    var kind = capModelKind(m);
    var run = capRunner();   /* R92-A：复用既有解析器（AI_SERVICE.xtRunCapability 优先，window 兼容兜底） */
    if (typeof run !== 'function') {
      removeTyping(aiB);
      var missMsg = '视频 / 3D 能力模块未加载，请刷新页面后重试。';
      aiB.mdEl.innerHTML = renderMarkdown(missMsg);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: missMsg });
      setSendBusy(false);
      saveCurrentChat();
      return true;
    }
    var label = (kind === 'video') ? '视频' : '3D 模型';
    var withAudio = (kind === 'video' && videoAudioOnFor(selId));   /* R93-5b：带声音按模型记忆（ai_audio_models_v1 map），默认关 */
    var input = { prompt: String(text || '') };
    if (withAudio) { input.audio = true; }
    if (image) { input.imageUrl = String(image); input.mode = (kind === 'video') ? 'i2v' : 'i23d'; }
    var progressShown = false;
    run(selId, input, { onProgress: function (p) {
      if (!progressShown) { removeTyping(aiB); progressShown = true; }
      var tries = (p && typeof p.tries === 'number') ? p.tries : 0;
      var max = (p && typeof p.max === 'number') ? p.max : 120;
      aiB.mdEl.innerHTML = renderMarkdown('正在生成' + label + (withAudio ? '（带声音）' : '') + '…（第 ' + tries + '/' + max + ' 次查询）');
      scrollBottom();
    } }).then(function (r) {
      removeTyping(aiB);
      var u = (r && r.result) ? r.result : {};
      var url = u.url ? String(u.url) : '';
      var plain;
      if (!url) {
        plain = '（' + label + '生成完成但未返回文件地址）';
        aiB.mdEl.innerHTML = renderMarkdown(plain);
      } else if (kind === 'video') {
        plain = '🎬 ' + label + (withAudio ? '（带声音）' : '') + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + url;
        aiB.mdEl.innerHTML = renderMarkdown('🎬 ' + label + (withAudio ? '（带声音）' : '') + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：');
        var vid = doc.createElement('video');
        vid.className = 'ai-md-video';
        vid.src = url; vid.controls = true;
        vid.setAttribute('playsinline', ''); vid.setAttribute('webkit-playsinline', '');
        vid.setAttribute('preload', 'metadata');
        vid.setAttribute('style', 'max-width:100%;border-radius:10px;margin-top:6px;display:block;');
        var vidBox = doc.createElement('span');
        vidBox.className = 'ai-vid-box';
        vidBox.appendChild(vid);
        var vidBtnHolder = doc.createElement('span');
        vidBtnHolder.innerHTML = vidFsBtnHtml();
        if (vidBtnHolder.firstChild) { vidBtnHolder.firstChild.__aiVid = vid; vidBox.appendChild(vidBtnHolder.firstChild); }
        aiB.mdEl.appendChild(vidBox);
      } else {
        plain = '🧊 ' + label + '已生成（结果为 .zip 压缩包，内含模型文件）：' + url;
        aiB.mdEl.innerHTML = renderMarkdown('🧊 ' + label + '已生成（内含模型文件，正在准备内联预览）：');
        /* R130-项4：zip 不再只给下载链接 —— 气泡内直接内联预览图/视频，
           glb 走 model-viewer 懒加载（不支持时降级提示），zip 下载保留为次按钮 */
        render3dPreview(aiB.mdEl, url, u.previewUrl, label);
      }
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: plain });
      setSendBusy(false);
      saveCurrentChat();
    })['catch'](function (err) {
      removeTyping(aiB);
      var msg = (err && err.message) ? String(err.message) : '生成失败，请稍后重试';
      aiB.mdEl.innerHTML = renderMarkdown('⚠️ ' + label + '生成失败：' + msg);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: '⚠️ ' + label + '生成失败：' + msg });
      setSendBusy(false);
      saveCurrentChat();
      toast(label + '生成失败');
    });
    return true;
  }

  /* ============ R130-项4：3D 结果内联预览 ============
     背景：图生 3D 的结果是火山 TOS 上的 .zip（链接 24h 有效），此前会话里只有
     一个 zip 下载链接，必须下载解压后才能看到模型。现在：
       1) 上游响应自带 image_url（渲染预览图）时先秒出 <img>；
       2) 随后调后端 POST /api/ai/model3d/preview 把 zip 里的预览图 / 视频 / glb
          解到 /uploads 静态目录，换成不随 24h 失效的服务端媒体继续内联展示；
       3) zip 下载降级为次按钮（所有预览失败场景的兜底）；
       4) glb 走 model-viewer 懒加载（CDN module，15 秒未就绪 / 加载失败 /
          环境不支持时降级为文字提示，预览图始终保留）。
     ES2017 语法；CSS 用内联样式且不用 clamp()/min()/max()（老 WebView 约束）。 */
  /* [R130-3D-BEGIN] jsdom 测试锚点：本段可整体提取做独立渲染验证 */
  var XT_MV_CDN = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
  var XT_MV_LOAD_MS = 15000;

  function xt3dAbs(u) {
    var s = String(u || '');
    if (/^https?:/i.test(s)) { return s; }
    var base = (window.API_BASE != null) ? String(window.API_BASE) : '';
    return base + s;
  }

  function xt3dEl(tag, style, text) {
    var el = doc.createElement(tag);
    if (style) { el.setAttribute('style', style); }
    if (text) { el.textContent = text; }
    return el;
  }

  /** 懒加载 model-viewer 并挂载 glb；任何失败路径都降级为文字提示（不弹窗）。 */
  function xt3dOpenViewer(meshUrl, host) {
    function fallback() {
      host.appendChild(xt3dEl('div', 'font-size:12px;color:#999;margin-top:4px;',
        '当前环境暂不支持 3D 交互预览，可下载 zip 在电脑端查看模型'));
    }
    function mount() {
      var mv = doc.createElement('model-viewer');
      mv.setAttribute('src', xt3dAbs(meshUrl));
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('auto-rotate', '');
      mv.setAttribute('shadow-intensity', '1');
      mv.setAttribute('style', 'width:100%;height:340px;border-radius:10px;margin-top:6px;background:#111;display:block;');
      host.appendChild(mv);
    }
    try {
      var ce = window.customElements;
      if (ce && ce.get && ce.get('model-viewer')) { mount(); return; }
      if (!window.__xtMvPromise) {
        window.__xtMvPromise = new Promise(function (resolve) {
          var settled = false;
          var timer = setTimeout(function () {
            if (!settled) { settled = true; resolve(false); }
          }, XT_MV_LOAD_MS);
          var s = doc.createElement('script');
          s.src = XT_MV_CDN;
          s.type = 'module';
          s.onload = function () { if (!settled) { settled = true; clearTimeout(timer); resolve(true); } };
          s.onerror = function () { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } };
          (doc.head || doc.documentElement).appendChild(s);
        });
      }
      window.__xtMvPromise.then(function (ok) {
        var ce2 = window.customElements;
        if (ok && ce2 && ce2.get && ce2.get('model-viewer')) { mount(); } else { fallback(); }
      })['catch'](fallback);
    } catch (e) { fallback(); }
  }

  /** 3D 结果气泡内联预览：先快照后解包；zip 下载按钮保留为次按钮。 */
  function render3dPreview(box, zipUrl, quickUrl, label) {
    var wrap = xt3dEl('span', 'display:block;margin-top:2px;');
    wrap.className = 'ai-3d-wrap';
    var status = null;
    var quickImg = null;
    function setStatus(t) {
      if (!status) {
        status = xt3dEl('div', 'font-size:12px;color:#999;margin-top:4px;', t);
        wrap.insertBefore(status, wrap.firstChild);
      } else {
        status.textContent = t;
      }
    }
    function clearStatus() {
      if (status && status.parentNode) { status.parentNode.removeChild(status); status = null; }
    }
    /* 次按钮：zip 下载（保留，兜底所有预览失败的场景） */
    var lk = doc.createElement('a');
    lk.href = zipUrl; lk.target = '_blank'; lk.rel = 'noopener';
    lk.textContent = '⬇ 下载模型文件（.zip）';
    lk.setAttribute('style', 'display:inline-block;margin-top:6px;font-size:13px;');
    wrap.appendChild(lk);
    /* 快速预览：上游响应自带 image_url 时秒出（该图 24h 后失效，仅作首屏） */
    if (quickUrl) {
      quickImg = xt3dEl('img', 'max-width:260px;max-height:260px;border-radius:10px;margin-top:6px;display:block;background:#f2f3f5;');
      quickImg.alt = '3D 生成预览图';
      quickImg.src = xt3dAbs(quickUrl);
      wrap.insertBefore(quickImg, lk);
    }
    setStatus('正在准备内联预览…');
    box.appendChild(wrap);
    var base = (window.API_BASE != null) ? String(window.API_BASE) : '';
    window.fetch(base + '/api/ai/model3d/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: zipUrl })
    }).then(function (res) { return res.json(); }).then(function (j) {
      if (!j || !j.ok) {
        setStatus('内联预览准备失败' + ((j && j.err) ? ('：' + j.err) : '') + '，可直接下载 zip 查看');
        return;
      }
      clearStatus();
      /* 上游快照图会过期，换服务端解包出的持久预览图 */
      if (quickImg && quickImg.parentNode) { quickImg.parentNode.removeChild(quickImg); quickImg = null; }
      if (j.image) {
        var im = xt3dEl('img', 'max-width:260px;max-height:260px;border-radius:10px;margin-top:6px;display:block;background:#f2f3f5;');
        im.alt = '3D 模型预览图';
        im.src = xt3dAbs(j.image);
        if (j.mesh && j.mesh.url) {
          im.setAttribute('style', im.getAttribute('style') + 'cursor:pointer;');
          im.title = '点击查看 3D 模型';
          im.addEventListener('click', function () { xt3dOpenViewer(j.mesh.url, wrap); });
        }
        wrap.insertBefore(im, lk);
      }
      if (j.video) {
        var vd = doc.createElement('video');
        vd.src = xt3dAbs(j.video); vd.controls = true;
        vd.setAttribute('playsinline', ''); vd.setAttribute('webkit-playsinline', '');
        vd.setAttribute('preload', 'metadata');
        vd.setAttribute('style', 'width:260px;max-width:100%;border-radius:10px;margin-top:6px;display:block;background:#000;');
        wrap.insertBefore(vd, lk);
      }
      if (j.mesh && j.mesh.url) {
        var btn = xt3dEl('button', 'display:inline-block;margin:6px 8px 0 0;padding:5px 12px;border-radius:8px;border:1px solid #d0d3d9;background:#fff;font-size:13px;cursor:pointer;',
          '🧊 3D 查看（实验）');
        btn.addEventListener('click', function () { xt3dOpenViewer(j.mesh.url, wrap); });
        wrap.insertBefore(btn, lk);
      }
      if (!j.image && !j.video && !(j.mesh && j.mesh.url)) {
        setStatus('压缩包内未找到可直接预览的图片 / 视频，请下载 zip 查看');
      }
    })['catch'](function () {
      setStatus('内联预览准备失败（网络异常），可直接下载 zip 查看');
    });
  }
  /* [R130-3D-END] */

  function askAI(text, image) {
    var aiB = addAiBubble();
    scrollBottom();
    var funcType = predictFuncType(text, !!image);
    /* R92-A：选中模型 types 含 'video' / '3d' 时走能力直连链路（详见 routeCapabilityModel） */
    if (routeCapabilityModel(aiB, text, image)) { return; }
    /* R131 调整：海外平台（gemini / openrouter）不再前端硬拦截——允许发起请求；
       服务端不可达时由下方 callAI 失败分支的 network_limited 错误卡兜底引导。 */
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
    // 需求20B/A6：逐字重排 innerHTML 会带来行高抖动与重排开销。
    // 用 requestAnimationFrame 节流（无 rAF 的老内核退化为 16ms setTimeout），
    // 并以 renderSettled 闸门保证收尾渲染（含降级前缀）不被迟到的 rAF 覆盖。
    var renderSettled = false;
    var renderPending = false;
    /* R107b：思考过程（思维链）面板状态。三态兜底：
       1) 收到思维链增量 → 面板展开并流式渲染（标题「思考中…」）；
       2) 回答完成/失败 → 面板收起，标题变「思考过程」，可点击展开回看；
       3) 全程无思维链（非推理模型 / 旧版服务层不回调）→ 面板根本不创建，
          页面表现与改动前完全一致。 */
    var reasoning = { panel: null, text: '', startedAt: 0, pending: false, settled: false };
    function flushReasonRender() {
      reasoning.pending = false;
      if (reasoning.settled || !reasoning.panel) return;
      setReasoningBody(reasoning.panel, reasoning.text);
      scrollBottom();
    }
    function flushRender() {
      renderPending = false;
      if (renderSettled) return;
      aiB.mdEl.innerHTML = renderMarkdown(fullText);
      scrollBottom();
      renderCtxUsage();
    }
    function scheduleRender() {
      if (renderSettled || renderPending) return;
      renderPending = true;
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(flushRender);
      } else {
        setTimeout(flushRender, 16);
      }
    }
    var opts = {
      image: image ? image : null,
      model: getSelectedModelId(),
      max: getMaxMode(),
      /* 用户勾了「深度思考」且当次未被判为 vision（拍题优先走视觉模型）时，
         显式把强制推理意图传给服务层。funcType 只是按文字猜的默认值，
         服务层最终选模还要看用户手动选中的模型；带上这个标志才能保证
         手动选中的非推理模型也能被深度思考覆盖（与 UI 文案一致）。 */
      forceReasoning: (!image && getDeepThink()) ? 1 : 0,
      /* R107c：把「深度思考」显式传给服务层——中转链路只有在 opt.reasoning===true 时
         才会带 reasoning:true 并进入分帧协议（t:r/t:c），思维链才能流回前端。
         没有这一行，后端会照旧剥离 reasoning_content，面板永远不会出现。
         R130b：深度思考开关开【或】当前手动选中的是推理模型 → true。
         兼容硬门禁：非推理模型 + 开关关 → 仍 false，请求体与旧版字节级一致。 */
      reasoning: (!image && (getDeepThink() || isReasoningModelSelected())) ? true : false,
      onChunk: function (delta, full) {
        if (firstChunk) { removeTyping(aiB); firstChunk = false; }
        fullText = full;
        scheduleRender();
      },
      /* R107b：思维链增量（服务层 feature-detect 回调，旧版 ai-service 不传则此回调不触发）。
         full 优先（服务层已累计全文），缺失时本地累加 delta 兜底 */
      onReasoning: function (delta, full) {
        if (typeof full === 'string' && full) { reasoning.text = full; }
        else if (delta) { reasoning.text += String(delta); }
        if (!reasoning.text) return;
        if (!reasoning.panel) {
          reasoning.startedAt = Date.now();
          reasoning.panel = createReasoningPanel(aiB, true);
          if (!reasoning.panel) return;
        }
        if (!reasoning.pending) {
          reasoning.pending = true;
          if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(flushReasonRender);
          } else {
            setTimeout(flushReasonRender, 16);
          }
        }
      },
      /* 需求 D-2/D-3：ai-service 会下发第 3 参 msg（reason==="slow" →「响应较慢，已切换模型：X」，
         其余场景 →「已切换到 X 模型」）；参数缺失/旧调用方时回退原有固定文案，向后兼容。 */
      onFallback: function (name, id, msg) {
        toast((typeof msg === 'string' && msg) ? msg : ('当前模型繁忙，已自动切换到 ' + name));
      },
      onModelUsed: function (id, name) { setUsedModel(aiB, id, name); }
    };
    if (typeof callAI !== 'function') {
      renderSettled = true;
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
      renderSettled = true;   // 收尾后停用 rAF 节流渲染
      reasoning.settled = true;   // R107b：思维链流式渲染收尾
      finishReasoningPanel(reasoning.panel, reasoning.startedAt);   // 有面板则收起，无面板为三态兜底的「无思维链」空操作
      removeTyping(aiB);
      /* R131：服务端可能以 200 + {ok:false, kind} 返回（version_outdated / quota_exhausted 等），
         必须给可见提示卡，绝不静默失败。 */
      if (res && typeof res === 'object' && res.ok === false && res.kind && ERR_KIND_TEXT[String(res.kind)]) {
        var ek = String(res.kind);
        var eh = (res && res.hint) ? String(res.hint) : '';
        if (ek === 'network_limited') {
          var nm = getModelById(getSelectedModelId());
          eh = netLimitedHint(eh, nm);          // 建议行：自备 Key 直连 + 国内同类替代
          toastNetAltSuggest(nm);               // 替代映射 toast 移到失败时机触发
        }
        var ec = renderErrCard(aiB, ek, (res && res.error) ? String(res.error) : '', eh);
        showMsgActions(aiB);
        state.messages.push({ role: 'ai', content: ec });
        setSendBusy(false);
        saveCurrentChat();
        toast(ERR_KIND_TEXT[ek].title);
        return;
      }
      var ft = '';
      var degraded = false;
      if (typeof res === 'string') {
        ft = res;
      } else if (res && typeof res === 'object') {
        // 底座降级（所有模型都失败 -> 本地预设）时返回的是 res.text；此前只读流式缓冲 fullText，
        // 而该路径不会触发 onChunk，导致 fullText 恒为空 -> 气泡空白。此处改为优先取 res.text。
        ft = (res.text !== null && res.text !== undefined && res.text !== '') ? String(res.text) : fullText;
        degraded = (res.degraded === true || res.fromPreset === true);
        /* R104-项4：服务端按所选模型解析失败并回退时，如实提示一次（每会话一次）。 */
        if (res.modelFallback === true) { notifyModelFallbackOnce(res.modelUsedReal || ''); }
      } else {
        ft = fullText;
      }
      if (!ft) ft = fullText;
      if (!ft) {
        // 底座「成功」却没有任何文本（理论上不应发生）：兜底成本地参考，绝不渲染空气泡
        ft = localFallback(text);
        degraded = true;
      }
      var body = degraded ? ('（网络不佳，以下为本地参考）\n\n' + ft) : ft;
      aiB.mdEl.innerHTML = renderMarkdown(body);
      persistGeneratedImages(aiB.mdEl);   // R86：生图签名 URL 1 小时过期，落成本地 Blob 后再展示
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: body });
      setSendBusy(false);
      saveCurrentChat();
      if (degraded) toast('网络不佳，以下为本地参考');
    }).catch(function (err) {
      renderSettled = true;   // 收尾后停用 rAF 节流渲染
      reasoning.settled = true;   // R107b：失败也要摘掉「思考中」态，面板不悬在动画里
      finishReasoningPanel(reasoning.panel, reasoning.startedAt);
      removeTyping(aiB);
      var errMsg = (err && err.message) ? String(err.message) : '';
      var kind = (err && err.kind) ? String(err.kind) : '';
      var hint = (err && err.hint) ? String(err.hint) : '';
      var content;
      var isErrCard = false;
      /* R131：统一错误体 {ok, kind, error, code, hint} —— 命中即渲染可见提示卡，禁静默失败
         （quota_exhausted / network_limited / version_outdated / provider_error / bad_request / unavailable） */
      if (kind && ERR_KIND_TEXT[kind]) {
        if (kind === 'network_limited') {
          var nm = getModelById(getSelectedModelId());
          hint = netLimitedHint(hint, nm);      // 建议行：自备 Key 直连 + 国内同类替代
          toastNetAltSuggest(nm);               // 替代映射 toast 移到失败时机触发
        }
        content = renderErrCard(aiB, kind, errMsg, hint);
        isErrCard = true;
        toast(ERR_KIND_TEXT[kind].title);
      } else if (err && err.code === 'IMAGE_INVALID') {
        // 图片归一化失败：如实告知，不再伪装成「网络不佳」
        content = '图片解析失败：仅支持 JPG / PNG / WebP / GIF / BMP 格式的图片，请换一张再试。';
        toast('图片格式不支持，请换一张');
      } else if (err && err.rateLimited) {
        // 配额用尽（本地 10 次/分钟 或 服务端 429）：明确提示 + 建议稍后重试
        content = '（提问太频繁）\n\n' + (errMsg || '公共额度限制为每分钟 10 次，请休息 1 分钟后再试。');
        toast('提问太频繁，请稍后再试');
      } else if (err && err.status >= 400 && err.status < 500) {
        // 请求本身有问题（400/403/404/422）：展示后端原因，不伪装成本地参考
        content = 'AI 服务返回错误：' + (err.apiMessage || errMsg || ('HTTP ' + err.status));
        toast('请求被拒绝，请更换模型或检查问题内容');
      } else {
        content = '（网络不佳，以下为本地参考）\n\n' + localFallback(text);
        toast('网络不佳，以下为本地参考');
      }
      /* 错误卡已由 renderErrCard 直接写进 mdEl，不再走 markdown 重复渲染 */
      if (!isErrCard) { aiB.mdEl.innerHTML = renderMarkdown(content); }
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: content });
      setSendBusy(false);
      saveCurrentChat();
    });
  }

  function sendMessage() {
    if (state.sending) return;
    var text = aiInput ? String(aiInput.value || '').trim() : '';
    var hasImage = !!state.image;
    if (!text && !hasImage && !state.audio) return;
    if (!aiMessages) { toast('页面尚未就绪，请刷新后重试'); return; }
    // R86→V-polish 续：有语音附件时先转文字，识别完成直接作为用户消息发出（见 sendAudioForTranscribe）
    if (state.audio) { sendAudioForTranscribe(text); return; }
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
    state.audio = null; clearAudio();
    if (aiMessages) aiMessages.innerHTML = '';
    chat.messages.forEach(function (m) {
      if (m.role === 'user') {
        state.messages.push({ role: 'user', content: m.content, image: m.hasImage ? m.content : null });
        addUserBubble(m.content, null);
      } else {
        state.messages.push({ role: 'ai', content: m.content });
        var b = addAiBubble(); removeTyping(b);
        b.mdEl.innerHTML = renderMarkdown(m.content); showMsgActions(b);
        restorePersistedImages(b.mdEl);   // R86：历史里的生图用本地 Blob 复活（签名已过期也不白图）
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
    state.audio = null; clearAudio();
    if (aiInput) { aiInput.value = ''; autoGrow(); }
    if (aiMessages) aiMessages.innerHTML = '';
    enterWelcome();
    renderCtxUsage();
  }

  /* 新建对话：点击即创建，不弹任何确认；已有内容照常存进历史 */
  function startNewChat() {
    _modelFallbackToasted = false;   /* R104-项4：新会话允许再次提示一次「模型已切换」 */
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
    var off = isOfflineModel(m);
    /* R131 调整：海外平台条目不再加 offline 禁用类（原 opacity .45 + not-allowed 已删），
       仅保留浅色「需海外网络/代理」徽标；行可正常选中。 */
    row.className = 'ai-mp-row' + (isSel ? ' sel' : '');
    row.setAttribute('data-id', m.id);
    var d = getDetail(m && m.id);
    var dn = listDisplayName(m);
    var ic = (dn && dn.charAt(0)) ? dn.charAt(0).toUpperCase() : '?';
    row.innerHTML =
      '<span class="ai-mp-ic">' + escHtml(ic) + '</span>' +
      '<div class="ai-mp-row-main"><div class="ai-mp-name">' + escHtml(dn) +
        (off ? '<span class="ai-mp-offline-tag">' + escHtml(NEED_PROXY_TEXT) + '</span>' : '') +
      '</div></div>' +
      '<div class="ai-mp-right">' +
        '<span class="ai-mp-rate">' + escHtml(getModelRate(m)) + '</span>' +
        '<span class="ai-mp-check">' + CHECK_SVG + '</span>' +
      '</div>';
    row.addEventListener('click', function (ev) {
      /* R131 调整：海外平台条目可正常选中，网络条件仅以徽标提示；
         真正不可达时由请求失败的 network_limited 错误卡兜底。 */
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

  /* R131 调整：请求返回 network_limited 时的替代建议 toast（xt-toast 优先）——
     不再在点击选中时触发（海外平台已放开可选）。 */
  function toastNetAltSuggest(m) {
    var nm = m ? listDisplayName(m) : '该模型';
    var alt = offlineAltName(m);
    toast('「' + nm + '」服务端网络受限' + (alt ? ('，建议改用 ' + alt) : '，建议改用国内平台的同类模型'));
  }
  /* network_limited 错误卡建议行文案：服务端 hint 优先，缺失时用本地默认引导
     （自备 Key 直连，Key 仅存本机）；有国内同类替代模型时一并给出。 */
  function netLimitedHint(serverHint, m) {
    var h = serverHint || '可在设置页填写该平台自己的 Key 后直连使用（Key 仅保存在本机）。';
    var alt = offlineAltName(m);
    if (alt) h += '；或改用国内同类模型「' + alt + '」。';
    return h;
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
  /* ---------- R86：模型分区 ----------
     视觉（types 含 image）仍留在「对话与识图」区：它走 chat/completions，能正常对话，
     不能和走 images/generations 的生图混在一起。分区顺序即展示顺序；
     未命中任何区（自定义模型没勾类型等）归入第 0 区，保证模型不丢。 */
  var MODEL_GROUPS = [
    { key: 'chat', title: '对话与识图', types: ['general', 'reasoning', 'math', 'translate', 'longtext', 'creative', 'interview', 'image'] },
    { key: 'imagegen', title: '生图', types: ['imagegen'] },
    { key: 'asr', title: '语音识别', types: ['audio'] },
    { key: 'vec', title: '向量与重排', types: ['embedding', 'rerank'] },
    /* 下一批（火山方舟视频生成 / 3D 生成）先占位：当前没有对应模型，空区不渲染标题，
       届时只需在 ai-config.js 给模型写 types: ['video'] / ['3d']，本表与渲染逻辑都不用改 */
    { key: 'video', title: '视频生成', types: ['video'] },
    { key: 'model3d', title: '3D 生成', types: ['3d'] }
  ];
  /* 分区归属改为【逐 type 全匹配】：多能力模型（如 types=['imagegen','general'] 的
     gm-*-image 系）同时进「对话与识图」与「生图」两区，任一能力入口都可见可选，
     不再因命中第一个分组而把其它能力藏掉（R134 修正独占桶降级）。 */
  function modelGroupIndexes(m) {
    var ts = (m && Object.prototype.toString.call(m.types) === '[object Array]') ? m.types : [];
    var hits = [];
    for (var g = 0; g < MODEL_GROUPS.length; g++) {
      var gt = MODEL_GROUPS[g].types;
      for (var i = 0; i < gt.length; i++) {
        if (ts.indexOf(gt[i]) >= 0) { hits.push(g); break; }
      }
    }
    return hits;
  }
  /* 分区小标题（顶部分隔线 + 灰字），仅在该区有模型时才渲染 */
  function groupTitleRow(title) {
    var t = doc.createElement('div');
    t.className = 'ai-mp-sec';
    t.style.cssText = 'flex:none;margin:8px 4px 2px;padding:7px 6px 0;border-top:1px solid rgba(128,128,128,.28);font-size:11px;color:#999;letter-spacing:.5px;';
    t.textContent = title;
    return t;
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
    /* R86：按能力分区（对话与识图 / 生图 / 语音识别 / 向量与重排）；空区连标题都不渲染。
       R134：多能力模型进所有匹配分区（modelGroupIndexes 逐 type 匹配）；
       未命中任何区的模型仍归第 0 区，保证模型不丢。 */
    var buckets = [];
    for (var bi = 0; bi < MODEL_GROUPS.length; bi++) buckets.push([]);
    combined.forEach(function (m) {
      var gs = modelGroupIndexes(m);
      if (!gs.length) { buckets[0].push(m); return; }
      for (var gi = 0; gi < gs.length; gi++) buckets[gs[gi]].push(m);
    });
    for (var bg = 0; bg < buckets.length; bg++) {
      if (!buckets[bg].length) continue;
      list.appendChild(groupTitleRow(MODEL_GROUPS[bg].title));
      buckets[bg].forEach(function (m) { list.appendChild(modelRow(m, manual && sel === m.id)); });
    }
  }
  /* customMsg：由调用方指定的提示文案（保存自定义模型时用「已添加并启用 XXX」）
     R131 调整：原「软下线模型不可选中」守卫已撤——海外平台可正常选中，
     失败兜底统一走 askAI 的 network_limited 错误卡。 */
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
  /* 侧栏「添加模型」入口（原「模型设置」）：R63 起改为跳独立设置页（原为打开自定义模型弹窗）；R66 文案改为「添加模型」
     R7b（2026-09-20）App 修复：App 内点击毫无反应（本地/线上浏览器正常、进度条不出现=导航未发起）。
     静态排查已排除：旧包/资源缺失/ES语法/壳层拦截/绑定缺失；仅剩机制嫌疑=同一拍内
     「关抽屉关菜单 + location 跳转」被部分老内核吞掉 → 跳转延后一拍（新宏任务）。
     同时打 nav-trace 桥日志：1.37 若仍无反应，导出运行日志即可判定点击是否到达处理函数。 */
  function openAddModelFromSidebar() {
    try { if (window.errorBoundary && typeof window.errorBoundary.report === 'function') window.errorBoundary.report('nav-trace: ai-settings via sidebar click, nav deferred', '', 'nav-trace'); } catch (e) {}
    closeSidebar(); closeUserMenu();
    setTimeout(function () { location.href = 'ai-settings.html'; }, 0);
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
  /* 需求：r.json() 在响应体非 JSON（网关/CDN 返回的 HTML 错误页）时会抛裸 SyntaxError
     （"Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"），并被下方 catch 原样展示给用户。
     这里改为「先 text 再 JSON.parse」，失败时抛人类可读 Error（含 HTTP 状态与响应体前 80 字符），
     风格与 assets/ai-service.js 的 safeRespJson 一致。成功路径返回值与 r.json() 完全一致。 */
  function parseJsonOrFriendly(t, code) {
    try {
      return JSON.parse(t);
    } catch (e) {
      var head = String(t == null ? '' : t).replace(/\s+/g, ' ').replace(/^ +| +$/g, '');
      if (head.length > 80) head = head.slice(0, 80) + '…';
      throw new Error('接口返回了非 JSON 内容（HTTP ' + code + '），API 地址可能填错或服务不可用' +
        (head ? '。响应开头：' + head : ''));
    }
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
      // 200/2xx 也先读文本再安全解析：非 JSON（HTML 错误页）时抛人类可读 Error，不抛裸 SyntaxError
      return r.text().then(function (t) { return parseJsonOrFriendly(t, code); });
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
  /* R104-项4：本次会话是否已提示过「模型不可用已切换」。每个会话（新建对话即重置）
     最多提示一次，避免用户连续追问时反复弹同一条提示刷屏。 */
  var _modelFallbackToasted = false;
  /* R104-项4：服务端按所选模型 id/名都解析不到、回退到 .env 默认模型时（响应头
     X-Ai-Model-Fallback=1），如实告知「已切换为 X 回答」；X 取服务端回传的真实模型名。 */
  function notifyModelFallbackOnce(realName) {
    if (_modelFallbackToasted) return;
    _modelFallbackToasted = true;
    var nm = realName ? String(realName) : '';
    if (nm) { toast('您选的模型当前不可用，已切换为 ' + nm + ' 回答'); }
    else { toast('您选的模型当前不可用，已自动切换其他模型回答'); }
  }
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
    /* R104-项4：本次结果带「回退」标记时，单独提示一次（每会话一次）。 */
    if (res.modelFallback === true) { notifyModelFallbackOnce(res.modelUsedReal || res.modelName || ''); }
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

    bindById('aiCustomEntry', 'click', function () {
      /* R7b：与侧栏「添加模型」同口径——跳转延后一拍 + nav-trace 打点（App 内落盘） */
      try { if (window.errorBoundary && typeof window.errorBoundary.report === 'function') window.errorBoundary.report('nav-trace: ai-settings via custom entry click, nav deferred', '', 'nav-trace'); } catch (e) {}
      closeModelPanel(); setTimeout(function () { location.href = 'ai-settings.html'; }, 0);
    });
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
    doc.addEventListener('xt:health-changed', onHealthChanged);   // R87/T04：健康状态变更 → 模型列表重算（恢复可用自动回归）
    /* 2026-09-21 麦克风防泄漏：跳页/切后台时释放本页录音流与原生残留，
       否则轨道一直持有麦克风，之后所有页面 getUserMedia 都报「被其它程序占用」 */
    window.addEventListener('pagehide', function () {
      try {
        if (REC.stream) { REC.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e1) { /* 忽略 */ } }); }
        REC.stream = null;
      } catch (e2) { /* 忽略 */ }
      try { if (REC.rec && REC.rec.state === 'recording') { REC.rec.stop(); } } catch (e3) { /* 忽略 */ }
      try { if (window.XTAppBridge && typeof window.XTAppBridge.stopVoiceRecord === 'function') window.XTAppBridge.stopVoiceRecord(); } catch (e4) { /* 忽略 */ }
    });
    ensureMicButton();      // R86：麦克风按钮（DOM 注入，AI.html 不动）
    ensureAudioPreview();   // R86：语音附件条
    ensureReasoningStyle(); // R107b：思考过程面板样式一次性注入（AI.html 不动）
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
