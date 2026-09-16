// ========== AI 模型配置文件（全站 AI 底座） ==========
// 所有 Key、模型、参数、funcType 分工都在这里配置，业务代码不写死。
// 新增/删除模型只改这个文件。
// 注意：本文件遵循老 WebView 语法禁令，不使用可选链、空值合并、顶层 await 及正则后行断言等老内核不支持的写法。
// R63（2026-09-16）新增 4 平台 13 模型：24 个内置模型 / 6 平台。
// R64/R65（2026-09-16）：modelDetails 全量补 stars（整数 1-5 参考评分）与 speed（13 个新模型按 R63 实测回填，11 个旧模型「待检测」）；
// FUNC_TYPES desc 能力化（去场景字样）；新增 modelModes 三模式链（AI 页 快速/均衡/极致）。

var AI_CONFIG = {
  // 两个平台的内置公共 Key（用户没填自己的 Key 时用这个）
  providers: {
    zhipu: {
      name: "智谱AI",
      apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiKey: "f5aa78850e7a4575a1c4d119b03c3019.Uvg73xeMhVdN7crs"
    },
    siliconflow: {
      name: "硅基流动",
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      apiKey: "sk-ftwbrdrlxnkzalwkjxrnnltktyuljktxhvacbxdgckdrdwxw"
    },
    // ===== R63 新增 4 平台（2026-09-16 联网实测通过）=====
    qianfan: {
      name: "百度千帆",
      apiUrl: "https://qianfan.baidubce.com/v2/chat/completions",
      apiKey: "bce-v3/ALTAK-bddJz30wA3jwpUXr3yDbZ/be743c4cbfafd762fa42c4fc10b8308d574c7a5b"
    },
    ark: {
      name: "火山方舟",
      apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      apiKey: "ark-e725e1de-7d62-4b4a-aebb-a5def4f05ba7-c22bf"
    },
    openrouter: {
      name: "OpenRouter",
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: "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",
      extraHeaders: {
        "HTTP-Referer": "http://110.42.134.62",
        "X-Title": "Xingtu Learning"
      }
    },
    gemini: {
      name: "Google Gemini",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      apiKey: "AQ.Ab8RN6IO7WLjJiQmQsgs3dk473fqX3kngQNt-6KAFO38U_S3tw",
      apiFormat: "gemini",
      keyInQuery: true,
      needVPN: true
    }
  },

  // ===== R67（2026-09-16）服务商分组 providerGroups：设置页「添加模型」服务商下拉数据源（结构契约固定，一字不改）=====
  // 三层：① builtin:true 已接入且实测 6 家（与 providers 一一对应，needKey:false）；
  // ② builtin:false 主流公开厂商模板（needKey:true，note 必含「需自备 Key，端点未经本项目实测」）；
  // ③ 自定义/兼容接口。严禁把未实测厂商伪装成已接入（builtin:false / needKey:true）。
  providerGroups: [
    {
      key: "zhipu",
      label: "智谱AI",
      builtin: true,
      apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiFormat: "openai",
      needKey: false,
      note: "",
      models: [
        { id: "glm-4.7-flash", name: "GLM-4.7-Flash", types: ["general"] },
        { id: "glm-4.5-flash", name: "GLM-4.5-Flash", types: ["general"] },
        { id: "glm-4-flash", name: "GLM-4-Flash", types: ["general"] },
        { id: "glm-4.6v-flash", name: "GLM-4.6V-Flash", types: ["image", "general"] },
        { id: "glm-4v-flash", name: "GLM-4V-Flash", types: ["image"] }
      ]
    },
    {
      key: "siliconflow",
      label: "硅基流动",
      builtin: true,
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      apiFormat: "openai",
      needKey: false,
      note: "",
      models: [
        { id: "qwen2.5-7b", name: "Qwen2.5-7B", types: ["general"] },
        { id: "qwen3-8b", name: "Qwen3-8B", types: ["general", "math"] },
        { id: "qwen3.5-4b", name: "Qwen3.5-4B", types: ["general"] },
        { id: "deepseek-r1-8b", name: "DeepSeek-R1-8B", types: ["math", "reasoning"] },
        { id: "glm-4-9b", name: "GLM-4-9B", types: ["general"] },
        { id: "hunyuan-mt-7b", name: "Hunyuan-MT-7B", types: ["translate", "general"] }
      ]
    },
    {
      key: "ark",
      label: "火山方舟·豆包",
      builtin: true,
      apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      apiFormat: "openai",
      needKey: false,
      note: "",
      models: [
        { id: "ark-v4-flash", name: "DeepSeek-V4-Flash", types: ["general"] },
        { id: "ark-doubao-mini", name: "Doubao-Mini", types: ["general"] },
        { id: "ark-v4-1-flash", name: "DeepSeek-V4.1-Flash", types: ["general","math"] },
        { id: "ark-v4-pro", name: "DeepSeek-V4-Pro", types: ["general","reasoning"] },
        { id: "ark-doubao-pro", name: "Doubao-Pro", types: ["general","creative","longtext"] },
        { id: "ark-glm-flash", name: "GLM-5.3-Flash", types: ["general"] }
      ]
    },
    {
      key: "qianfan",
      label: "百度千帆·文心一言",
      builtin: true,
      apiUrl: "https://qianfan.baidubce.com/v2/chat/completions",
      apiFormat: "openai",
      needKey: false,
      note: "",
      models: [
        { id: "qf-ernie-32k", name: "ERNIE-4.5-Turbo", types: ["general"] },
        { id: "qf-ernie-128k", name: "ERNIE-4.5-Turbo-128K", types: ["general","longtext"] }
      ]
    },
    {
      key: "openrouter",
      label: "OpenRouter",
      builtin: true,
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiFormat: "openai",
      needKey: false,
      note: "",
      models: [
        { id: "or-auto", name: "OR-Auto", types: ["general"] },
        { id: "or-nemotron-super", name: "Nemotron-Super", types: ["general"] },
        { id: "or-nemotron-ultra", name: "Nemotron-Ultra", types: ["general","reasoning"] }
      ]
    },
    {
      key: "gemini",
      label: "Google Gemini",
      builtin: true,
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      apiFormat: "gemini",
      needKey: false,
      note: "",
      models: [
        { id: "gm-flash-lite", name: "Gemini-3.5-Flash-Lite", types: ["general"] },
        { id: "gm-flash", name: "Gemini-3.5-Flash", types: ["general","reasoning"] }
      ]
    },
    {
      key: "deepseek",
      label: "DeepSeek",
      builtin: false,
      apiUrl: "https://api.deepseek.com/v1/chat/completions",
      apiFormat: "openai",
      needKey: true,
      note: "需自备 Key，端点未经本项目实测",
      models: [
        { id: "deepseek-chat", name: "DeepSeek-V3", types: ["general"] },
        { id: "deepseek-reasoner", name: "DeepSeek-R1", types: ["reasoning"] }
      ]
    },
    {
      key: "tongyi",
      label: "通义千问",
      builtin: false,
      apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      apiFormat: "openai",
      needKey: true,
      note: "需自备 Key，端点未经本项目实测",
      models: [
        { id: "qwen-plus", name: "Qwen-Plus", types: ["general"] },
        { id: "qwen-max", name: "Qwen-Max", types: ["general"] },
        { id: "qwen-turbo", name: "Qwen-Turbo", types: ["general"] }
      ]
    },
    {
      key: "kimi",
      label: "Kimi·月之暗面",
      builtin: false,
      apiUrl: "https://api.moonshot.cn/v1/chat/completions",
      apiFormat: "openai",
      needKey: true,
      note: "需自备 Key，端点未经本项目实测",
      models: [
        { id: "kimi-k2-0905-preview", name: "Kimi-K2-0905-Preview", types: ["general"] },
        { id: "moonshot-v1-8k", name: "Moonshot-V1-8K", types: ["general"] },
        { id: "moonshot-v1-32k", name: "Moonshot-V1-32K", types: ["general"] }
      ]
    },
    {
      key: "openai",
      label: "OpenAI",
      builtin: false,
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiFormat: "openai",
      needKey: true,
      note: "需自备 Key，端点未经本项目实测；需自备网络",
      models: [
        { id: "gpt-4o", name: "GPT-4o", types: ["general"] },
        { id: "gpt-4o-mini", name: "GPT-4o-Mini", types: ["general"] }
      ]
    },
    {
      key: "claude",
      label: "Claude·Anthropic",
      builtin: false,
      apiUrl: "",
      apiFormat: "custom",
      needKey: true,
      note: "协议非 OpenAI 兼容，需经自定义格式/网关；需自备 Key，端点未经本项目实测",
      models: [
        { id: "claude-sonnet-4-5", name: "Claude-Sonnet-4.5", types: ["general"] },
        { id: "claude-opus-4-1", name: "Claude-Opus-4.1", types: ["general"] }
      ]
    },
    {
      key: "xfyun",
      label: "讯飞星火",
      builtin: false,
      apiUrl: "https://spark-api-open.xf-yun.com/v1/chat/completions",
      apiFormat: "openai",
      needKey: true,
      note: "需自备 Key，端点未经本项目实测",
      models: [
        { id: "generalv3.5", name: "Spark-GeneralV3.5", types: ["general"] },
        { id: "lite", name: "Spark-Lite", types: ["general"] }
      ]
    },
    {
      key: "custom",
      label: "自定义/兼容接口",
      builtin: false,
      apiUrl: "",
      apiFormat: "openai",
      needKey: true,
      note: "全部字段手动填写",
      models: []
    }
  ],

  // 系统提示词（可配）
  systemPrompt: "你是星途学习助手，回答简洁务实、条理清晰，结合用户当前的学习场景给出可操作建议。",

  // 自动模式选择器里的“自动（推荐）”占位项（不计入内置模型 24 个）
  autoOption: { id: "auto", name: "自动（推荐）" },

  // MAX 模式：开启后提升输出上限，回答更详细（按 funcType 的 maxTokens 放大，不低于此下限）
  maxMode: { maxTokens: 4000, temperatureDelta: -0.1 },

  // 内置免费模型列表（24 个，全部永久免费，含 fallback 链）
  builtinModels: [
    {
      id: "glm-4.7-flash",
      name: "GLM-4.7-Flash",
      provider: "zhipu",
      model: "glm-4.7-flash",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "glm-4.5-flash"
    },
    {
      id: "glm-4.5-flash",
      name: "GLM-4.5-Flash",
      provider: "zhipu",
      model: "glm-4.5-flash",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "qwen2.5-7b"
    },
    {
      id: "glm-4-flash",
      name: "GLM-4-Flash",
      provider: "zhipu",
      model: "glm-4-flash",
      types: ["general"],
      tag: "免费",
      rate: "0.8x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "glm-4.6v-flash",
      name: "GLM-4.6V-Flash",
      provider: "zhipu",
      model: "glm-4.6v-flash",
      types: ["image", "general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: "glm-4v-flash"
    },
    {
      id: "glm-4v-flash",
      name: "GLM-4V-Flash",
      provider: "zhipu",
      model: "glm-4v-flash",
      types: ["image"],
      tag: "免费",
      rate: "1x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: null
    },
    {
      id: "qwen2.5-7b",
      name: "Qwen2.5-7B",
      provider: "siliconflow",
      model: "Qwen/Qwen2.5-7B-Instruct",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "glm-4-flash"
    },
    {
      id: "qwen3-8b",
      name: "Qwen3-8B",
      provider: "siliconflow",
      model: "Qwen/Qwen3-8B",
      types: ["general", "math"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 1200,
      fallback: "qwen2.5-7b"
    },
    {
      id: "qwen3.5-4b",
      name: "Qwen3.5-4B",
      provider: "siliconflow",
      model: "Qwen/Qwen3.5-4B",
      types: ["general"],
      tag: "免费",
      rate: "0.5x",
      temperature: 0.7,
      maxTokens: 800,
      fallback: "qwen2.5-7b"
    },
    {
      id: "deepseek-r1-8b",
      name: "DeepSeek-R1-8B",
      provider: "siliconflow",
      model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
      types: ["math", "reasoning"],
      tag: "免费",
      rate: "2x",
      temperature: 0.1,
      maxTokens: 2000,
      fallback: "glm-4.7-flash"
    },
    {
      id: "glm-4-9b",
      name: "GLM-4-9B",
      provider: "siliconflow",
      model: "THUDM/GLM-4-9B-0414",
      types: ["general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "qwen2.5-7b"
    },
    {
      id: "hunyuan-mt-7b",
      name: "Hunyuan-MT-7B",
      provider: "siliconflow",
      model: "tencent/Hunyuan-MT-7B",
      types: ["translate", "general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.5,
      maxTokens: 1000,
      fallback: "glm-4.7-flash"
    },
    {
      id: "ark-v4-flash",
      name: "DeepSeek-V4-Flash",
      provider: "ark",
      model: "deepseek-v4-flash-ga-260731",
      types: ["general"],
      tag: "免费",
      rate: "0.8x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "glm-4.5-flash"
    },
    {
      id: "ark-doubao-mini",
      name: "Doubao-Mini",
      provider: "ark",
      model: "doubao-seed-2-0-mini-260428",
      types: ["general"],
      tag: "免费",
      rate: "0.8x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "glm-4.5-flash"
    },
    {
      id: "ark-v4-1-flash",
      name: "DeepSeek-V4.1-Flash",
      provider: "ark",
      model: "deepseek-v4-1-flash-260910",
      types: ["general","math"],
      tag: "免费",
      rate: "1x",
      temperature: 0.5,
      maxTokens: 2000,
      fallback: "ark-v4-flash"
    },
    {
      id: "ark-v4-pro",
      name: "DeepSeek-V4-Pro",
      provider: "ark",
      model: "deepseek-v4-pro-ga-260813",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "1.5x",
      temperature: 0.3,
      maxTokens: 2500,
      fallback: "ark-v4-1-flash"
    },
    {
      id: "ark-doubao-pro",
      name: "Doubao-Pro",
      provider: "ark",
      model: "doubao-seed-2-1-pro-260915",
      types: ["general","creative","longtext"],
      tag: "免费",
      rate: "1.5x",
      temperature: 0.7,
      maxTokens: 2000,
      fallback: "ark-v4-flash"
    },
    {
      id: "ark-glm-flash",
      name: "GLM-5.3-Flash",
      provider: "ark",
      model: "glm-5-3-flash-260828",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "glm-4.5-flash"
    },
    {
      id: "or-auto",
      name: "OR-Auto",
      provider: "openrouter",
      model: "openrouter/free",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-nemotron-super",
      name: "Nemotron-Super",
      provider: "openrouter",
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1500,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-nemotron-ultra",
      name: "Nemotron-Ultra",
      provider: "openrouter",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "2x",
      temperature: 0.3,
      maxTokens: 2500,
      fallback: "ark-v4-pro"
    },
    {
      id: "qf-ernie-32k",
      name: "ERNIE-4.5-Turbo",
      provider: "qianfan",
      model: "ernie-4.5-turbo-32k",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "qf-ernie-128k"
    },
    {
      id: "qf-ernie-128k",
      name: "ERNIE-4.5-Turbo-128K",
      provider: "qianfan",
      model: "ernie-4.5-turbo-128k",
      types: ["general","longtext"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 2000,
      fallback: "glm-4-flash"
    },
    {
      id: "gm-flash-lite",
      name: "Gemini-3.5-Flash-Lite",
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      types: ["general"],
      tag: "免费",
      rate: "0.8x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-flash",
      name: "Gemini-3.5-Flash",
      provider: "gemini",
      model: "gemini-3.5-flash",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 2500,
      fallback: "ark-v4-pro",
      needVPN: true
    }
  ],

  // ===== 模型说明（设置页「模型说明」Tab 的数据源；与 builtinModels 同增同减）=====
  // ===== 模型说明（设置页「模型说明」Tab 的数据源；与 builtinModels 同增同减）=====
  // stars = 参考评分（1-5 整数，可编辑，UI 标注「综合参考评分」）；speed = 响应速度（R63 实测回填，旧模型待健康检查后回填）。
  modelDetails: {
    "glm-4.7-flash": { platform: "智谱AI", params: "30B", type: "通用文本", stars: 5, speed: "待检测", recommend: "日常问答首选", advantage: "智谱最新免费模型，30B 大参数，中文理解能力强，上下文 200K", applicable: "日常学习问答、方法咨询、文案生成、面试模拟" },
    "glm-4.5-flash": { platform: "智谱AI", params: "", type: "通用文本", stars: 4, speed: "待检测", advantage: "上一代免费模型，稳定性好，响应快", applicable: "4.7 拥堵时自动降级，日常问答" },
    "glm-4-flash": { platform: "智谱AI", params: "", type: "通用文本", stars: 3, speed: "待检测", advantage: "最稳定，几乎不拥堵，效果稍弱", applicable: "其他模型都拥堵时的最终兜底" },
    "glm-4.6v-flash": { platform: "智谱AI", params: "", type: "多模态（图片+文本）", stars: 5, speed: "待检测", advantage: "免费支持图片理解，识别题目截图、PPT 截图", applicable: "图片理解、题目与课件截图解读" },
    "glm-4v-flash": { platform: "智谱AI", params: "", type: "视觉理解", stars: 3, speed: "待检测", advantage: "老版视觉模型，稳定", applicable: "4.6V 拥堵时备用" },
    "qwen2.5-7b": { platform: "硅基流动", params: "7B", type: "通用文本", stars: 3, speed: "待检测", advantage: "阿里通义千问开源模型，中文好，速度快", applicable: "日常问答、简单文案" },
    "qwen3-8b": { platform: "硅基流动", params: "8B", type: "通用文本", stars: 4, speed: "待检测", advantage: "Qwen 第三代，推理更强，支持工具调用", applicable: "日常问答、逻辑推理、简单数学" },
    "qwen3.5-4b": { platform: "硅基流动", params: "4B", type: "通用文本", stars: 2, speed: "待检测", advantage: "小参数，响应极快", applicable: "极简单问答、分类，复杂问题不推荐" },
    "deepseek-r1-8b": { platform: "硅基流动", params: "8B", type: "推理专用", stars: 4, speed: "待检测", advantage: "专门优化逻辑推理和数学计算，解行测题比通用模型准", applicable: "数量关系、资料分析、判断推理" },
    "glm-4-9b": { platform: "硅基流动", params: "9B", type: "通用文本", stars: 3, speed: "待检测", advantage: "智谱开源 9B，中文不错", applicable: "通用对话备用" },
    "hunyuan-mt-7b": { platform: "硅基流动", params: "7B", type: "通用文本（多语言）", stars: 3, speed: "待检测", advantage: "腾讯混元开源，多语言强，翻译好", applicable: "英语翻译、英语、多语言问答" },
    "ark-v4-flash": { platform: "火山方舟", params: "", type: "通用对话", stars: 3, speed: "快", advantage: "响应快，额度每天 200 万 token", applicable: "日常问答、快速解题" },
    "ark-doubao-mini": { platform: "火山方舟", params: "", type: "通用对话", stars: 3, speed: "快", advantage: "豆包轻量模型，响应快，额度每天 200 万 token", applicable: "日常问答、快速解题" },
    "ark-v4-1-flash": { platform: "火山方舟", params: "", type: "通用对话（推理型）", stars: 4, speed: "快", advantage: "推理型，maxTokens 需 ≥2000；额度每天 200 万 token", applicable: "需要推理的问答、数学题" },
    "ark-v4-pro": { platform: "火山方舟", params: "", type: "推理增强", stars: 5, speed: "中", advantage: "推理能力更强，额度每天 200 万 token", applicable: "复杂推理、长链思考" },
    "ark-doubao-pro": { platform: "火山方舟", params: "", type: "通用对话（创作/长文本）", stars: 5, speed: "中", advantage: "创作与长文本能力较强，额度每天 200 万 token", applicable: "文案创作、长文本处理" },
    "ark-glm-flash": { platform: "火山方舟", params: "", type: "通用对话", stars: 4, speed: "中", advantage: "GLM 最新代免费模型，额度每天 200 万 token", applicable: "日常问答" },
    "or-auto": { platform: "OpenRouter", params: "", type: "自动路由", stars: 3, speed: "中", advantage: "自动选择合适的免费模型；免费额度 50 次/天、20 次/分钟", applicable: "不确定用哪个模型时的日常问答" },
    "or-nemotron-super": { platform: "OpenRouter", params: "", type: "通用对话", stars: 4, speed: "中", advantage: "免费额度 50 次/天、20 次/分钟", applicable: "日常问答" },
    "or-nemotron-ultra": { platform: "OpenRouter", params: "", type: "深度推理", stars: 4, speed: "慢", advantage: "深度推理、较慢（实测 10.9s）；免费额度 50 次/天、20 次/分钟", applicable: "复杂推理问题" },
    "qf-ernie-32k": { platform: "百度千帆", params: "", type: "通用对话", stars: 3, speed: "快", advantage: "百度文心 ERNIE 系列", applicable: "通用中文问答" },
    "qf-ernie-128k": { platform: "百度千帆", params: "", type: "通用对话（大上下文）", stars: 3, speed: "中", advantage: "百度文心 ERNIE 系列，128K 大上下文", applicable: "长文本、长上下文问答" },
    "gm-flash-lite": { platform: "Google Gemini", params: "", type: "通用对话（轻量）", stars: 3, speed: "快", advantage: "超快轻量；需自备网络", applicable: "日常轻量问答" },
    "gm-flash": { platform: "Google Gemini", params: "", type: "通用对话（推理）", stars: 4, speed: "慢", advantage: "通用能力强；需自备网络", applicable: "日常问答、推理" }
  },

  // ===== R65 三模式链（AI 对话页「快速/均衡/极致」；链内模型按序尝试，均不可用回退默认链）=====
  // 名单按 R63 实测响应速度与参考星级挑选；Gemini 两个「需自备网络」模型不进任何链。
  modelModes: {
    fast: { label: "⚡快速模式", chain: ["ark-v4-flash", "ark-v4-1-flash", "ark-doubao-mini", "qf-ernie-32k"] },
    balanced: { label: "⚖均衡模式", chain: ["ark-v4-1-flash", "or-nemotron-super", "qf-ernie-128k", "or-auto"] },
    ultimate: { label: "🏆极致模式", chain: ["ark-v4-pro", "ark-doubao-pro", "ark-glm-flash", "or-nemotron-ultra"] }
  },

  // 自动模式：问题类型 -> 首选模型
  autoRoute: {
    image: "glm-4.6v-flash",
    math: "deepseek-r1-8b",
    translate: "hunyuan-mt-7b",
    general: "glm-4.7-flash"
  },

  // 数学题关键词（自动判断用推理模型）
  mathKeywords: ["计算","工程","利润","增长率","比例","方程","几何","数量关系",
    "资料分析","速度","路程","浓度","排列组合","概率","整除","余数"],

  // 英语翻译关键词
  translateKeywords: ["翻译","英语","四级","六级","单词","语法","translate","english"],

  // 欢迎页推荐问题已按用户要求移除（2026-09-16），此处不再配置。

  // 频率限制：每 60s 窗口最多 10 次 API 调用
  rateLimit: { maxCalls: 10, perSeconds: 60 },

  // ========== funcType -> 模型分工表（并入需求工单 §三） ==========
  // 7 类功能，各自声明首选模型、降级链、temperature、maxTokens、说明。
  // 数值严格按工单表格。
  FUNC_TYPES: {
    general: {
      desc: "文本对话",
      primary: "glm-4.7-flash",
      fallback: ["glm-4.5-flash", "ark-v4-flash", "qwen2.5-7b"],
      temperature: 0.7,
      maxTokens: 1000
    },
    reasoning: {
      desc: "深度推理",
      primary: "deepseek-r1-8b",
      fallback: ["ark-v4-pro", "glm-4.7-flash"],
      temperature: 0.1,
      maxTokens: 2000
    },
    vision: {
      desc: "视觉识图",
      primary: "glm-4.6v-flash",
      fallback: ["glm-4v-flash"],
      temperature: 0.3,
      maxTokens: 1500
    },
    translate: {
      desc: "机器翻译",
      primary: "hunyuan-mt-7b",
      fallback: ["glm-4.7-flash"],
      temperature: 0.3,
      maxTokens: 1200
    },
    longtext: {
      desc: "长文本理解",
      primary: "glm-4.7-flash",
      fallback: ["ark-v4-1-flash", "qwen3-8b"],
      temperature: 0.4,
      maxTokens: 2500
    },
    interview: {
      desc: "文本生成",
      primary: "glm-4.7-flash",
      fallback: ["qwen3-8b"],
      temperature: 0.8,
      maxTokens: 300,
      // 子类型：出题与点评使用不同参数
      variants: {
        question: { temperature: 0.8, maxTokens: 300 },
        review: { temperature: 0.5, maxTokens: 800 }
      }
    },
    creative: {
      desc: "文本创作",
      primary: "glm-4.7-flash",
      fallback: ["ark-doubao-pro", "qwen2.5-7b"],
      temperature: 0.9,
      maxTokens: 800
    }
  }
};

// ===== R63 启动结构自检（防「配置改坏 → 全站 AI 失效」的历史事故）=====
// 纯 ES2017 及以前语法；校验失败则回退最小默认配置，绝不抛异常。
(function () {
  function isStr(v) { return typeof v === "string" && v.length > 0; }
  function providerOk(p, key) {
    var item = p && p[key];
    return !!(item && isStr(item.apiUrl) && isStr(item.apiKey));
  }
  var ok = true;

  // 1) providers：对象，且 zhipu / siliconflow 均有非空 apiUrl + apiKey
  var providers = AI_CONFIG.providers;
  if (!(typeof providers === "object" && providers !== null)) {
    ok = false;
  } else if (!providerOk(providers, "zhipu") || !providerOk(providers, "siliconflow")) {
    ok = false;
  }

  // 2) builtinModels：非空数组，且每项有非空 id / provider / model
  var models = AI_CONFIG.builtinModels;
  if (!(typeof models === "object" && models !== null) || !(models.length > 0)) {
    ok = false;
  } else {
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (!(m && isStr(m.id) && isStr(m.provider) && isStr(m.model))) { ok = false; break; }
    }
  }

  // 3) FUNC_TYPES：对象且含 general
  var ft = AI_CONFIG.FUNC_TYPES;
  if (!(typeof ft === "object" && ft !== null && ft.general)) { ok = false; }

  if (!ok) {
    // 最小默认配置：只保命，不重复主配置
    AI_CONFIG.providers = {
      zhipu: {
        name: "智谱AI",
        apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        apiKey: "f5aa78850e7a4575a1c4d119b03c3019.Uvg73xeMhVdN7crs"
      }
    };
    AI_CONFIG.builtinModels = [
      { id: "glm-flash", name: "GLM-Flash", provider: "zhipu", model: "glm-4-flash", types: ["general"], tag: "免费", rate: "1x", temperature: 0.7, maxTokens: 1000, fallback: null }
    ];
    AI_CONFIG.FUNC_TYPES = {
      general: { desc: "文本对话", primary: "glm-flash", fallback: [], temperature: 0.7, maxTokens: 1000 }
    };
    if (typeof console !== "undefined" && console.error) {
      console.error("[ai-config] 配置结构校验失败，已回退内置最小默认配置");
    }
  } else if (typeof console !== "undefined" && console.log) {
    console.log("[ai-config] 结构校验通过：" + AI_CONFIG.builtinModels.length + " 个模型 / " + Object.keys(AI_CONFIG.providers).length + " 个平台");
  }
})();

if (typeof window !== "undefined") {
  window.AI_CONFIG = AI_CONFIG;
}
