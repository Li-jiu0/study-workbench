// ========== AI 模型配置文件（全站 AI 底座） ==========
// 所有 Key、模型、参数、funcType 分工都在这里配置，业务代码不写死。
// 新增/删除模型只改这个文件。
// 注意：本文件遵循老 WebView 语法禁令，不使用可选链、空值合并、顶层 await 及正则后行断言等老内核不支持的写法。
// R63（2026-09-16）新增 4 平台 13 模型：24 个内置模型 / 6 平台。
// R64/R65（2026-09-16）：modelDetails 全量补 stars（整数 1-5 参考评分）与 speed（13 个新模型按 R63 实测回填，11 个旧模型「待检测」）；
// FUNC_TYPES desc 能力化（去场景字样）；新增 modelModes 三模式链（AI 页 快速/均衡/极致）。
// R86（2026-09-18）：重新接入硅基流动 1 平台 12 模型（翻译/OCR/生图/ASR/嵌入/重排），provider 改为单 key 挂多端点字段。

var AI_CONFIG = {
  // ---------- R131（2026-09-19）：客户端版本号 ----------
  // 所有 /api/ai/* 请求都带 X-Client-Version 头，服务端据此让旧 APK 优雅降级
  // （返回 kind:"version_outdated" 提示卡，绝不静默失败）。
  // 本值需与服务端 MIN_RELAY_CLIENT_VERSION 对齐，由主理人统一 bump、只前进不回落。
  clientVersion: "20260919a",

  // ---------- R77（2026-09-17）海外平台代理访问 ----------
  // auto=自动探测（不可达平台视为离线、调用降级国内链）/ relay=自定义中转 / direct=直连。
  // 运行时以 localStorage ai_proxy_settings（设置页）优先，此处为出厂默认值。
  proxy: {
    mode: "auto",
    relayUrl: ""
  },

  // R131（2026-09-19）：内置平台一律不持有 Key。
  // 所有 provider key 只存在于服务端 .env，前端零密钥——
  // 内置模型（builtin）全部走 /api/ai/* 服务端中转；用户自备 Key（builtin:false）才本地直连，
  // 且 Key 只进 localStorage、永不上行、不得覆盖内置平台。
  // ⚠ 红线：禁止再往本文件的 providers 或下方「自检回退用最小默认配置」写回任何明文 Key。
  providers: {
    zhipu: {
      name: "智谱AI",
      apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    },
    // R86：硅基流动重新接入（2026-09-18 实测 12 个模型全部 200）；多端点字段由能力模块按需读取。
    // ===== R63 新增 4 平台（2026-09-16 联网实测通过）=====
    qianfan: {
      name: "百度千帆",
      apiUrl: "https://qianfan.baidubce.com/v2/chat/completions"
    },
    ark: {
      name: "火山方舟",
      apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    },
    // 火山方舟图片生成（seedream 系列专用：images/generations 接口，Key 与 ark 相同）
    arkimage: {
      name: "火山方舟·图片生成",
      apiUrl: "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    },
    openrouter: {
      name: "OpenRouter",
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      extraHeaders: {
        "HTTP-Referer": "http://110.42.134.62",
        "X-Title": "Xingtu Learning"
      },
      needProxy: true
    },
    // ===== R86（2026-09-18）硅基流动：12 个模型逐个实测全部 HTTP 200（含付费对照），不做欠费降级 =====
    // 单 provider 挂多端点字段（imageUrl/audioUrl/embedUrl/rerankUrl），由 ai-cap-* 能力模块自行读取。
    siliconflow: {
      name: "硅基流动",
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      imageUrl: "https://api.siliconflow.cn/v1/images/generations",
      audioUrl: "https://api.siliconflow.cn/v1/audio/transcriptions",
      embedUrl: "https://api.siliconflow.cn/v1/embeddings",
      rerankUrl: "https://api.siliconflow.cn/v1/rerank"
    },
    gemini: {
      name: "Google Gemini",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      apiKey: "***REMOVED-BY-R2C***",
      apiFormat: "gemini",
      keyInQuery: true,
      needVPN: true,
      needProxy: true
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
        { id: "glm-4.7", name: "GLM-4.7", types: ["general"] },
        { id: "glm-4v-flash", name: "GLM-4V-Flash", types: ["image"] },
        { id: "glm-4.6v-flash", name: "GLM-4.6V-Flash", types: ["image", "general"] }
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
        { id: "ark-glm-flash", name: "GLM-5.3-Flash", types: ["general"] },
        { id: "ark-turbo-260628", name: "Doubao-Turbo", types: ["general"] },
        { id: "ark-lite-260428", name: "Doubao-Lite", types: ["general"] },
        { id: "ark-evolving", name: "Doubao-Evolving", types: ["general","reasoning"] },
        { id: "ark-glm-5.2", name: "GLM-5.2", types: ["general"] },
        { id: "ark-character-260628", name: "Doubao-Character（新版）", types: ["general","creative"] },
        { id: "ark-character-251128", name: "Doubao-Character（旧版）", types: ["general","creative"] },
        { id: "ark-code-preview", name: "Doubao-Code-Preview", types: ["general"] },
        { id: "ark-v4-pro-260425", name: "DeepSeek-V4-Pro（旧版）", types: ["general","reasoning"] },
        { id: "ark-lite-260215", name: "Doubao-Lite（旧版）", types: ["general"] }
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
      // R133：服务端已配置 OPENROUTER_API_KEY 并实测可直连（OPENROUTER_ALLOW_DIRECT=1），
      // 可用性以服务端 GET /api/ai/models 为权威源，不再本地置灰。
      models: [
        { id: "or-auto", name: "OR-Auto", types: ["general"] },
        { id: "or-nemotron-super", name: "Nemotron-Super", types: ["general","reasoning"] },
        { id: "or-nemotron-ultra", name: "Nemotron-Ultra", types: ["general","reasoning"] },
        { id: "or-ds-v4-flash", name: "DeepSeek-V4-Flash", types: ["general"] },
        { id: "or-nex-n25-mini", name: "NEX-N2.5-Mini", types: ["general"] },
        { id: "or-nex-n25-pro", name: "NEX-N2.5-Pro", types: ["general","reasoning"] },
        { id: "or-nemotron-nano-omni", name: "Nemotron-Omni-30B", types: ["general","reasoning"] },
        { id: "or-ling-3-flash-vl", name: "Ling-3.0-VL", types: ["image","general"] },
        { id: "or-ling-3-flash-fin", name: "Ling-3.0-Fin", types: ["general"] },
        { id: "or-ling-3-flash-sante", name: "Ling-3.0-Sante", types: ["general"] },
        { id: "or-lfm-25", name: "LFM-2.5", types: ["general"] },
        { id: "or-north-code", name: "Cohere-Code", types: ["general"] },
        { id: "or-dots-note", name: "Dots-Note", types: ["general"] },
        { id: "or-nemotron-safety", name: "Nemotron-Safety", types: ["general"] }
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
      // R131 决策 B：同 OpenRouter，海外平台软下线，保留条目 + 置灰标记。
      status: "unavailable",
      models: [
        { id: "gm-flash-lite", name: "Gemini-3.5-Flash-Lite", types: ["general"] },
        { id: "gm-flash", name: "Gemini-3.5-Flash", types: ["general","reasoning"] },
        { id: "gm-flash-lite-latest", name: "Gemini-Flash-Lite", types: ["general"] },
        { id: "gm-flash-latest", name: "Gemini-Flash", types: ["general"] },
        { id: "gm-25-flash", name: "Gemini-2.5-Flash", types: ["image","general","longtext"] },
        { id: "gm-25-flash-lite", name: "Gemini-2.5-Flash-Lite", types: ["image","general"] },
        { id: "gm-36-flash", name: "Gemini-3.6-Flash", types: ["general"] },
        { id: "gm-37-flash", name: "Gemini-3.7-Flash", types: ["general"] },
        { id: "gm-38-flash", name: "Gemini-3.8-Flash", types: ["general"] },
        { id: "gm-gemma-4-26b", name: "Gemma-4-26B", types: ["general"] },
        { id: "gm-31-flash-lite", name: "Gemini-3.1-Lite", types: ["general"] }
        // R135 20260920：移除 5 个实测不可用条目（免费 Key 下 Google 侧拒绝，非配置问题）——
        // gm-omni-11-flash（429 无配额）、gm-gemma-4-31b（500 INTERNAL）、生图三件套（429 无生图配额）。
        // 配额开放后可从 git 历史恢复。
      ]
    },
    {
      key: "siliconflow",
      label: "硅基免费",
      builtin: true,
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      apiFormat: "openai",
      needKey: false,
      note: "",
      models: [
        { id: "sf-hunyuan-mt-7b", name: "Hunyuan-MT-7B", types: ["general","translate"] },
        { id: "sf-paddleocr-vl-1.5", name: "PaddleOCR-VL-1.5", types: ["image"] },
        { id: "sf-kolors", name: "Kolors", types: ["imagegen"] },
        { id: "sf-sensevoice", name: "SenseVoice", types: ["audio"] },
        { id: "sf-asr-v32", name: "XingChen-ASR-V3.2", types: ["audio"] },
        { id: "sf-asr-ultra", name: "XingChen-ASR-Ultra", types: ["audio"] },
        { id: "sf-asr-diarize", name: "XingChen-Diarize", types: ["audio"] },
        { id: "sf-qwen-asr", name: "Qwen-ASR-1.7B", types: ["audio"] },
        { id: "sf-bge-m3", name: "bge-m3", types: ["embedding"] },
        { id: "sf-bge-zh", name: "bge-large-zh", types: ["embedding"] },
        { id: "sf-bge-en", name: "bge-large-en", types: ["embedding"] },
        { id: "sf-bge-reranker", name: "bge-reranker-m3", types: ["rerank"] }
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

  // 自动模式选择器里的“自动（推荐）”占位项（不计入内置模型 66 个）
  autoOption: { id: "auto", name: "自动（推荐）" },

  // MAX 模式：开启后提升输出上限，回答更详细（按 funcType 的 maxTokens 放大，不低于此下限）
  maxMode: { maxTokens: 4000, temperatureDelta: -0.1 },

  // 内置免费模型列表（66 个，含 fallback 链；顺序即模型下拉分组顺序：火山方舟 → 智谱 → 百度千帆 → OpenRouter → Gemini → 图片生成 → 硅基流动）
  // R86：硅基流动 12 模型重新接入（types 见上表；端点走 provider 多字段）；seedream 图片模型走 arkimage（images/generations），失败不再降级文本模型。
  builtinModels: [
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
      fallback: "ark-doubao-mini"
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
      fallback: "glm-4.7"
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
      fallback: "ark-v4-flash"
    },
    {
      id: "ark-turbo-260628",
      name: "Doubao-Turbo",
      provider: "ark",
      model: "doubao-seed-2-1-turbo-260628",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.5,
      maxTokens: 2000,
      fallback: "ark-v4-1-flash"
    },
    {
      id: "ark-lite-260428",
      name: "Doubao-Lite",
      provider: "ark",
      model: "doubao-seed-2-0-lite-260428",
      types: ["general"],
      tag: "免费",
      rate: "0.5x",
      temperature: 0.7,
      maxTokens: 800,
      fallback: "ark-doubao-mini"
    },
    {
      id: "ark-evolving",
      name: "Doubao-Evolving",
      provider: "ark",
      model: "doubao-seed-evolving",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "1.5x",
      temperature: 0.4,
      maxTokens: 2500,
      fallback: "ark-v4-pro"
    },
    {
      id: "ark-glm-5.2",
      name: "GLM-5.2",
      provider: "ark",
      model: "glm-5-2-260617",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1500,
      fallback: "ark-glm-flash"
    },
    {
      id: "ark-character-260628",
      name: "Doubao-Character（新版）",
      provider: "ark",
      model: "doubao-seed-character-260628",
      types: ["general","creative"],
      tag: "免费",
      rate: "1x",
      temperature: 0.8,
      maxTokens: 1500,
      fallback: "ark-doubao-pro"
    },
    {
      id: "ark-character-251128",
      name: "Doubao-Character（旧版）",
      provider: "ark",
      model: "doubao-seed-character-251128",
      types: ["general","creative"],
      tag: "免费",
      rate: "1x",
      temperature: 0.8,
      maxTokens: 1500,
      fallback: "ark-character-260628"
    },
    {
      id: "ark-code-preview",
      name: "Doubao-Code-Preview",
      provider: "ark",
      model: "doubao-seed-2-0-code-preview-260215",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 2000,
      fallback: "ark-doubao-pro"
    },
    {
      id: "ark-v4-pro-260425",
      name: "DeepSeek-V4-Pro（旧版）",
      provider: "ark",
      model: "deepseek-v4-pro-260425",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "1.5x",
      temperature: 0.3,
      maxTokens: 2500,
      fallback: "ark-v4-pro"
    },
    {
      id: "ark-lite-260215",
      name: "Doubao-Lite（旧版）",
      provider: "ark",
      model: "doubao-seed-2-0-lite-260215",
      types: ["general"],
      tag: "免费",
      rate: "0.5x",
      temperature: 0.7,
      maxTokens: 800,
      fallback: "ark-doubao-mini"
    },
    {
      id: "ark-seedance-1-0-pro",
      name: "Doubao-Seedance-1.0-pro",
      provider: "ark",
      model: "doubao-seedance-1-0-pro-250528",
      types: ["video"],
      audio: true,                   /* R93-5b：支持 generate_audio（设置页「有声」小开关数据源） */
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro-fast"
    },
    {
      id: "ark-seedance-1-0-pro-fast",
      name: "Doubao-Seedance-1.0-pro-fast",
      provider: "ark",
      model: "doubao-seedance-1-0-pro-fast-251015",
      types: ["video"],
      audio: true,                   /* R93-5b：支持 generate_audio（设置页「有声」小开关数据源） */
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedance-1-0-pro"
    },

    {
      id: "ark-seed3d-2-0",
      name: "Doubao-Seed3D-2.0",
      provider: "ark",
      model: "doubao-seed3d-2-0-260328",
      types: ["3d"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-hitem3d-2-0"
    },
    {
      id: "ark-hitem3d-2-0",
      name: "Hitem3D-2.0",
      provider: "ark",
      model: "hitem3d-2-0-251223",
      types: ["3d"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seed3d-2-0"
    },
    {
      id: "glm-4.7",
      name: "GLM-4.7",
      provider: "zhipu",
      model: "glm-4.7",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-v4-flash"
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
      id: "glm-4.6v-flash",
      name: "GLM-4.6V-Flash",
      provider: "zhipu",
      model: "glm-4.6v-flash",
      types: ["image","general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: "glm-4v-flash"
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
      fallback: "ark-v4-flash"
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
      id: "or-ds-v4-flash",
      name: "DeepSeek V4 Flash 免费版",
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash-0731:free",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-nex-n25-mini",
      name: "NEX N2.5 Mini",
      provider: "openrouter",
      model: "nex-agi/nex-n2.5-mini:free",
      types: ["general"],
      tag: "免费",
      rate: "0.8x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-nex-n25-pro",
      name: "NEX N2.5 Pro",
      provider: "openrouter",
      model: "nex-agi/nex-n2.5-pro:free",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "1.5x",
      temperature: 0.4,
      maxTokens: 2000,
      fallback: "ark-v4-pro"
    },
    {
      id: "or-nemotron-nano-omni",
      name: "Nemotron 推理版 30B",
      provider: "openrouter",
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      types: ["general","reasoning"],
      tag: "免费",
      rate: "1.5x",
      temperature: 0.4,
      maxTokens: 2000,
      fallback: "ark-v4-pro"
    },
    {
      id: "or-ling-3-flash-vl",
      name: "Ling 3.0 视觉版",
      provider: "openrouter",
      model: "inclusionai/ling-3.0-flash-vl:free",
      types: ["image","general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-ling-3-flash-fin",
      name: "Ling 3.0 金融版",
      provider: "openrouter",
      model: "inclusionai/ling-3.0-flash-fin:free",
      types: ["general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-ling-3-flash-sante",
      name: "Ling 3.0 医疗版",
      provider: "openrouter",
      model: "inclusionai/ling-3.0-flash-sante:free",
      types: ["general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-lfm-25",
      name: "LFM 2.5 轻量版",
      provider: "openrouter",
      model: "liquid/lfm-2.5-2.6b:free",
      types: ["general"],
      tag: "免费",
      rate: "0.5x",
      temperature: 0.7,
      maxTokens: 800,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-north-code",
      name: "Cohere 代码助手",
      provider: "openrouter",
      model: "cohere/north-mini-code:free",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 2000,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-dots-note",
      name: "Dots 笔记助手",
      provider: "openrouter",
      model: "dots-studio/dots-3-note-preview:free",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.5,
      maxTokens: 1500,
      fallback: "ark-v4-flash"
    },
    {
      id: "or-nemotron-safety",
      name: "Nemotron 内容安全审核",
      provider: "openrouter",
      model: "nvidia/nemotron-3.5-content-safety:free",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: "ark-v4-flash"
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
    },
    {
      id: "gm-flash-lite-latest",
      name: "Gemini Flash Lite",
      provider: "gemini",
      model: "gemini-flash-lite-latest",
      types: ["general"],
      tag: "免费",
      rate: "0.5x",
      temperature: 0.7,
      maxTokens: 800,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-flash-latest",
      name: "Gemini Flash",
      provider: "gemini",
      model: "gemini-flash-latest",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-25-flash",
      name: "Gemini Flash（最新版）",
      provider: "gemini",
      model: "gemini-flash-latest",
      types: ["image","general"],
      tag: "免费",
      rate: "1.2x",
      temperature: 0.5,
      maxTokens: 2000,
      fallback: "ark-v4-pro",
      needVPN: true
    },
    {
      id: "gm-25-flash-lite",
      name: "Gemini Flash Lite（最新版）",
      provider: "gemini",
      model: "gemini-flash-lite-latest",
      types: ["image","general"],
      tag: "免费",
      rate: "0.8x",
      temperature: 0.7,
      maxTokens: 1200,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-36-flash",
      name: "Gemini 3.6 Flash",
      provider: "gemini",
      model: "gemini-3.6-flash",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1500,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-37-flash",
      name: "Gemini 3.7 Flash",
      provider: "gemini",
      model: "gemini-3.7-flash",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1500,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-38-flash",
      name: "Gemini 3.8 Flash",
      provider: "gemini",
      model: "gemini-3.8-flash",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1500,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-gemma-4-26b",
      name: "Gemma 4 26B",
      provider: "gemini",
      model: "gemma-4-26b-a4b-it",
      types: ["general"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1500,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "gm-31-flash-lite",
      name: "Gemini 3.1 Lite",
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
      types: ["general"],
      tag: "免费",
      rate: "0.5x",
      temperature: 0.7,
      maxTokens: 800,
      fallback: "ark-v4-flash",
      needVPN: true
    },
    {
      id: "ark-seedream-4-0415",
      name: "Seedream-4.0",
      provider: "arkimage",
      model: "doubao-seedream-4-0-20260415",
      types: ["imagegen"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "ark-seedream-4-0828",
      name: "Seedream-4.0-Fast",
      provider: "arkimage",
      model: "doubao-seedream-4-0-250828",
      types: ["imagegen"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-hunyuan-mt-7b",
      name: "Hunyuan-MT-7B",
      provider: "siliconflow",
      model: "tencent/Hunyuan-MT-7B",
      types: ["general","translate"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 2000,
      fallback: "ark-v4-flash"
    },
    {
      id: "sf-paddleocr-vl-1.5",
      name: "PaddleOCR-VL-1.5",
      provider: "siliconflow",
      model: "PaddlePaddle/PaddleOCR-VL-1.5",
      types: ["image"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 2000,
      fallback: null
    },
    {
      id: "sf-kolors",
      name: "Kolors",
      provider: "siliconflow",
      model: "Kwai-Kolors/Kolors",
      types: ["imagegen"],
      tag: "免费",
      rate: "1x",
      temperature: 0.7,
      maxTokens: 1000,
      fallback: "ark-seedream-4-0828"
    },
    {
      id: "sf-sensevoice",
      name: "SenseVoice",
      provider: "siliconflow",
      model: "FunAudioLLM/SenseVoiceSmall",
      types: ["audio"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-asr-v32",
      name: "XingChen-ASR-V3.2",
      provider: "siliconflow",
      model: "XingChenAGI/XingChenASR-V3.2",
      types: ["audio"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-asr-ultra",
      name: "XingChen-ASR-Ultra",
      provider: "siliconflow",
      model: "XingChenAGI/XingChenASR-V3.2-Ultra",
      types: ["audio"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-asr-diarize",
      name: "XingChen-Diarize",
      provider: "siliconflow",
      model: "XingChenAGI/XingChenASR-Diarize-V3.0",
      types: ["audio"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-qwen-asr",
      name: "Qwen-ASR-1.7B",
      provider: "siliconflow",
      model: "Qwen/Qwen3-ASR-1.7B",
      types: ["audio"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-bge-m3",
      name: "bge-m3",
      provider: "siliconflow",
      model: "BAAI/bge-m3",
      types: ["embedding"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-bge-zh",
      name: "bge-large-zh",
      provider: "siliconflow",
      model: "BAAI/bge-large-zh-v1.5",
      types: ["embedding"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-bge-en",
      name: "bge-large-en",
      provider: "siliconflow",
      model: "BAAI/bge-large-en-v1.5",
      types: ["embedding"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    },
    {
      id: "sf-bge-reranker",
      name: "bge-reranker-m3",
      provider: "siliconflow",
      model: "BAAI/bge-reranker-v2-m3",
      types: ["rerank"],
      tag: "免费",
      rate: "1x",
      temperature: 0.3,
      maxTokens: 1000,
      fallback: null
    }
  ],

  // ===== 模型说明（设置页「模型说明」Tab 的数据源；与 builtinModels 同增同减）=====
  // ===== 模型说明（设置页「模型说明」Tab 的数据源；与 builtinModels 同增同减）=====
  // stars = 参考评分（1-5 整数，可编辑，UI 标注「综合参考评分」）；speed = 响应速度（R63 实测回填，旧模型待健康检查后回填）。
  modelDetails: {
    "ark-v4-flash": { platform: "火山方舟", params: "", type: "通用对话", stars: 3, speed: "快", advantage: "响应快，额度每天 200 万 token", applicable: "日常问答、快速解题" },
    "ark-doubao-mini": { platform: "火山方舟", params: "", type: "通用对话", stars: 3, speed: "快", advantage: "豆包轻量模型，响应快，额度每天 200 万 token", applicable: "日常问答、快速解题" },
    "ark-v4-1-flash": { platform: "火山方舟", params: "", type: "通用对话（推理型）", stars: 4, speed: "快", advantage: "推理型，maxTokens 需 ≥2000；额度每天 200 万 token", applicable: "需要推理的问答、数学题" },
    "ark-v4-pro": { platform: "火山方舟", params: "", type: "推理增强", stars: 5, speed: "中", advantage: "推理能力更强，额度每天 200 万 token", applicable: "复杂推理、长链思考" },
    "ark-doubao-pro": { platform: "火山方舟", params: "", type: "通用对话（创作/长文本）", stars: 5, speed: "中", advantage: "创作与长文本能力较强，额度每天 200 万 token", applicable: "文案创作、长文本处理" },
    "ark-glm-flash": { platform: "火山方舟", params: "", type: "通用对话", stars: 4, speed: "中", advantage: "GLM 最新代免费模型，额度每天 200 万 token", applicable: "日常问答" },
    "ark-turbo-260628": { platform: "火山方舟", params: "", type: "通用对话（turbo）", stars: 4, speed: "快", advantage: "速度与质量兼顾的 turbo 版；额度每天 200 万 token", applicable: "日常问答、均衡场景" },
    "ark-lite-260428": { platform: "火山方舟", params: "", type: "轻量对话（新版）", stars: 3, speed: "快", advantage: "最新轻量模型，响应极快；额度每天 200 万 token", applicable: "极简单问答、快速分类" },
    "ark-evolving": { platform: "火山方舟", params: "", type: "通用对话（持续进化）", stars: 5, speed: "中", advantage: "持续进化的最新模型，能力随版本增强；额度每天 200 万 token", applicable: "复杂问答、长链思考" },
    "ark-glm-5.2": { platform: "火山方舟", params: "", type: "通用对话", stars: 4, speed: "中", advantage: "智谱 GLM-5.2（火山方舟免费通道），中文能力强；额度每天 200 万 token", applicable: "日常问答" },
    "ark-character-260628": { platform: "火山方舟", params: "", type: "角色扮演（新版）", stars: 4, speed: "中", advantage: "角色扮演与人设对话优化；额度每天 200 万 token", applicable: "角色扮演、情景对话、面试模拟陪练" },
    "ark-character-251128": { platform: "火山方舟", params: "", type: "角色扮演（旧版）", stars: 3, speed: "中", advantage: "旧版角色模型；建议优先使用新版", applicable: "角色扮演（旧版兼容）" },
    "ark-code-preview": { platform: "火山方舟", params: "", type: "代码专用（预览版）", stars: 4, speed: "中", advantage: "代码理解与生成专用预览版；额度每天 200 万 token", applicable: "编程、代码解释、纠错" },
    "ark-v4-pro-260425": { platform: "火山方舟", params: "", type: "推理增强（旧版）", stars: 4, speed: "中", advantage: "旧版 V4 Pro；建议优先使用新版 DeepSeek-V4-Pro", applicable: "复杂推理（旧版兼容）" },
    "ark-lite-260215": { platform: "火山方舟", params: "", type: "轻量对话（旧版）", stars: 2, speed: "快", advantage: "旧版轻量模型；建议优先使用新版 Doubao-Lite", applicable: "极简单问答（旧版兼容）" },
    "glm-4.7": { platform: "智谱AI", params: "30B", type: "通用文本", stars: 5, speed: "中", recommend: "日常问答首选", advantage: "智谱免费模型，中文理解能力强，实测约 5.5 秒", applicable: "日常学习问答、方法咨询、文案生成、面试模拟" },
    "glm-4v-flash": { platform: "智谱AI", params: "", type: "视觉理解", stars: 4, speed: "快", advantage: "免费视觉模型，实测约 1 秒，适合拍题", applicable: "拍题识图、题目与课件截图解读" },
    "glm-4.6v-flash": { platform: "智谱AI", params: "", type: "多模态（图片+文本）", stars: 4, speed: "限流中", advantage: "免费支持图片理解；当前访问量过大被限流，失败自动降级 GLM-4V-Flash", applicable: "图片理解、题目与课件截图解读" },
    "qf-ernie-32k": { platform: "百度千帆", params: "", type: "通用对话", stars: 3, speed: "快", advantage: "百度文心 ERNIE 系列，实测约 2 秒", applicable: "通用中文问答" },
    "qf-ernie-128k": { platform: "百度千帆", params: "", type: "通用对话（大上下文）", stars: 3, speed: "快", advantage: "百度文心 ERNIE 系列，128K 大上下文，实测约 1.8 秒", applicable: "长文本、长上下文问答" },
    "or-auto": { platform: "OpenRouter", params: "", type: "自动路由", stars: 4, speed: "快", advantage: "自动选择合适的免费模型，实测约 1.8 秒；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "不确定用哪个模型时的日常问答" },
    "or-nemotron-super": { platform: "OpenRouter", params: "", type: "通用对话", stars: 4, speed: "快", advantage: "实测约 1.2 秒；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "日常问答" },
    "or-nemotron-ultra": { platform: "OpenRouter", params: "", type: "深度推理", stars: 5, speed: "中", advantage: "深度推理（实测约 3.3 秒）；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "复杂推理问题" },
    "gm-flash-lite": { platform: "Google Gemini", params: "", type: "通用对话（轻量）", stars: 3, speed: "快", advantage: "超快轻量（实测约 1 秒）；需自备网络", applicable: "日常轻量问答" },
    "gm-flash": { platform: "Google Gemini", params: "", type: "通用对话（推理）", stars: 4, speed: "中", advantage: "通用能力强（实测约 2.9 秒）；需自备网络", applicable: "日常问答、推理" },
    "or-ds-v4-flash": { platform: "OpenRouter", params: "", type: "通用对话", stars: 4, speed: "快", advantage: "DeepSeek V4 Flash 免费通道，速度快；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "日常问答、快速解题" },
    "or-nex-n25-mini": { platform: "OpenRouter", params: "", type: "通用对话（轻量）", stars: 3, speed: "快", advantage: "NEX N2.5 轻量版，响应快；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "日常轻量问答" },
    "or-nex-n25-pro": { platform: "OpenRouter", params: "", type: "深度推理", stars: 4, speed: "中", advantage: "NEX N2.5 Pro，推理能力强；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "复杂推理问题" },
    "or-nemotron-nano-omni": { platform: "OpenRouter", params: "", type: "深度推理", stars: 4, speed: "中", advantage: "Nemotron 30B 推理版，适合难题；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "难题求解、复杂推理" },
    "or-ling-3-flash-vl": { platform: "OpenRouter", params: "", type: "多模态识图", stars: 4, speed: "快", advantage: "Ling 3.0 视觉版，支持图片理解；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "拍题识图、图片理解" },
    "or-ling-3-flash-fin": { platform: "OpenRouter", params: "", type: "金融专用", stars: 3, speed: "快", advantage: "Ling 3.0 金融版，金融问答优化；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "金融问题咨询" },
    "or-ling-3-flash-sante": { platform: "OpenRouter", params: "", type: "医疗专用", stars: 3, speed: "快", advantage: "Ling 3.0 医疗版，健康问答优化；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "医疗健康咨询" },
    "or-lfm-25": { platform: "OpenRouter", params: "2.6B", type: "轻量对话", stars: 3, speed: "快", advantage: "LFM 2.5 小模型，极速响应；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "极简单问答、快速分类" },
    "or-north-code": { platform: "OpenRouter", params: "", type: "代码专用", stars: 3, speed: "快", advantage: "Cohere North 代码模型，写代码与 debug；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "编程、代码解释、纠错" },
    "or-dots-note": { platform: "OpenRouter", params: "", type: "笔记整理", stars: 3, speed: "快", advantage: "Dots 笔记助手，总结整理优化；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "笔记总结、资料整理" },
    "or-nemotron-safety": { platform: "OpenRouter", params: "", type: "内容审核", stars: 3, speed: "快", advantage: "Nemotron 内容安全模型，敏感内容检测；免费额度 50 次/天、20 次/分钟；需自备网络", applicable: "敏感内容检测、内容审核" },
    "gm-flash-lite-latest": { platform: "Google Gemini", params: "", type: "通用对话（轻量）", stars: 3, speed: "快", advantage: "Flash Lite 最新版，额度最大速度最快；需自备网络", applicable: "日常轻量问答" },
    "gm-flash-latest": { platform: "Google Gemini", params: "", type: "通用对话", stars: 4, speed: "快", advantage: "Flash 最新版，日常问答主力；需自备网络", applicable: "日常问答" },
    "gm-25-flash": { platform: "Google Gemini", params: "", type: "多模态对话", stars: 4, speed: "快", advantage: "支持识图与长文本；需自备网络", applicable: "图片理解、长文本问答" },
    "gm-25-flash-lite": { platform: "Google Gemini", params: "", type: "轻量多模态", stars: 3, speed: "快", advantage: "免费额度大的轻量识图模型；需自备网络", applicable: "轻量识图、日常问答" },
    "gm-36-flash": { platform: "Google Gemini", params: "", type: "通用对话", stars: 4, speed: "快", advantage: "Gemini 3.6 最新版本；需自备网络", applicable: "日常问答" },
    "gm-37-flash": { platform: "Google Gemini", params: "", type: "通用对话", stars: 4, speed: "快", advantage: "Gemini 3.7 最新版本；需自备网络", applicable: "日常问答" },
    "gm-38-flash": { platform: "Google Gemini", params: "", type: "通用对话", stars: 4, speed: "快", advantage: "Gemini 3.8 最新版本；需自备网络", applicable: "日常问答" },
    "gm-gemma-4-26b": { platform: "Google Gemini", params: "26B", type: "开源对话", stars: 3, speed: "快", advantage: "Google 开源 Gemma 4 26B 模型（Gemini 侧实测可用）；需自备网络", applicable: "日常问答" },
    "gm-31-flash-lite": { platform: "Google Gemini", params: "", type: "通用对话（轻量）", stars: 3, speed: "快", advantage: "Gemini 3.1 轻量版；需自备网络", applicable: "日常轻量问答" },
    // R135 20260920：移除 gm-omni-11-flash / gm-gemma-4-31b / 生图三件套 的说明条目（模型条目已删）
    "ark-seedream-4-0415": { platform: "火山方舟·图片生成", params: "", type: "图片生成", stars: 4, speed: "中", advantage: "文生图；走 images/generations 接口，调用链路待评估", applicable: "文生图（v4 初版）" },
    "ark-seedream-4-0828": { platform: "火山方舟·图片生成", params: "", type: "图片生成（最快）", stars: 4, speed: "快", advantage: "文生图最快版（实测 4.2 秒）；走 images/generations 接口，调用链路待评估", applicable: "文生图（速度优先）" },
    "sf-hunyuan-mt-7b": { platform: "硅基流动", params: "", type: "通用翻译", stars: 4, speed: "快", advantage: "腾讯混元翻译专用模型，实测中英互译流畅，术语保留好", applicable: "题目/资料中英互译、长句翻译" },
    "sf-paddleocr-vl-1.5": { platform: "硅基流动", params: "", type: "视觉识别·OCR", stars: 5, speed: "快", advantage: "实测 0.6 秒，中文印刷体识别准，版式还原好", applicable: "拍题识图、试卷与课件截图 OCR" },
    "sf-kolors": { platform: "硅基流动", params: "", type: "图片生成", stars: 4, speed: "中", advantage: "实测 4 秒出图，1024x1024，中文语义理解较好", applicable: "文生图、学习配图与示意插画" },
    "sf-sensevoice": { platform: "硅基流动", params: "", type: "语音识别", stars: 4, speed: "快", advantage: "实测 1 秒内返回，中英日韩多语种，识别稳定", applicable: "课堂录音转写、口语练习转文字" },
    "sf-asr-v32": { platform: "硅基流动", params: "", type: "语音识别", stars: 4, speed: "快", advantage: "实测 1 秒内返回，中文语音识别准确率高", applicable: "听课录音转写、口述笔记" },
    "sf-asr-ultra": { platform: "硅基流动", params: "", type: "语音识别", stars: 4, speed: "快", advantage: "实测 1 秒内返回，V3.2 增强版，长音频更稳", applicable: "长录音转写、会议与课程记录" },
    "sf-asr-diarize": { platform: "硅基流动", params: "", type: "语音识别", stars: 4, speed: "快", advantage: "实测 1 秒内返回，支持说话人分离", applicable: "多人对话/小组讨论录音转写" },
    "sf-qwen-asr": { platform: "硅基流动", params: "", type: "语音识别", stars: 4, speed: "快", advantage: "实测 1 秒内返回，方言与口音鲁棒性较好", applicable: "带口音的语音转写、口语评测前置" },
    "sf-bge-m3": { platform: "硅基流动", params: "", type: "向量嵌入", stars: 4, speed: "快", advantage: "实测响应快，多语种+长文本通用 embeddings，免费额度充足", applicable: "笔记/题库向量化、语义检索召回" },
    "sf-bge-zh": { platform: "硅基流动", params: "", type: "向量嵌入", stars: 4, speed: "快", advantage: "实测响应快，中文语义向量效果稳定", applicable: "中文资料向量化、错题相似题检索" },
    "sf-bge-en": { platform: "硅基流动", params: "", type: "向量嵌入", stars: 4, speed: "快", advantage: "实测响应快，英文语义向量效果稳定", applicable: "英文语料向量化、双语检索" },
    "sf-bge-reranker": { platform: "硅基流动", params: "", type: "结果重排", stars: 4, speed: "快", advantage: "实测响应快，对召回结果二次精排，top1 命中率明显提升", applicable: "检索结果精排、RAG 答案排序" },
    "ark-seedance-1-0-pro": { platform: "火山方舟", params: "", type: "视频生成", stars: 5, speed: "慢", advantage: "文生视频 / 图生视频；输入文字提示词（图生视频再传一张首帧图），输出 5～10 秒 MP4 视频；分钟级异步返回；单次消耗约 10 万 tokens 量级（5s/720p ≈ 103,818）；生成结果地址约 24 小时有效", applicable: "文生视频、图生视频" },
    "ark-seedance-1-0-pro-fast": { platform: "火山方舟", params: "", type: "视频生成（快速版）", stars: 4, speed: "慢", advantage: "文生视频 / 图生视频快速版；输入与输出同标准版，出片更快；分钟级异步返回；单次消耗约 10 万 tokens 量级", applicable: "文生视频、图生视频（速度优先）" },

    "ark-seed3d-2-0": { platform: "火山方舟", params: "", type: "3D 生成", stars: 5, speed: "慢", advantage: "图生 3D；输入一张图片（可再配文字），输出 glb 模型（打包为 zip 下载）；分钟级异步返回；单次消耗约 3 万 tokens 量级；结果地址约 24 小时有效", applicable: "图生 3D 模型" },
    "ark-hitem3d-2-0": { platform: "火山方舟", params: "", type: "3D 生成", stars: 4, speed: "慢", advantage: "图生 3D；输入一张图片，输出 3D 模型文件；分钟级异步返回；单次消耗约 3 万 tokens 量级", applicable: "图生 3D 模型" }

  },

  // ===== 三模式链（AI 对话页「快速/均衡/极致」；链内模型按序尝试，均不可用回退默认链）=====
  // 国内平台优先，海外模型（OpenRouter / Gemini，需自备网络）排链尾兜底；图片模型不进链。
  modelModes: {
    fast: { label: "⚡快速模式", chain: ["ark-v4-flash", "ark-doubao-mini", "ark-lite-260428", "glm-4.7", "qf-ernie-32k", "gm-flash-lite", "or-auto"] },
    balanced: { label: "⚖均衡模式", chain: ["ark-v4-pro", "ark-turbo-260628", "glm-4.7", "qf-ernie-128k", "gm-flash", "or-nemotron-super"] },
    ultimate: { label: "🏆极致模式", chain: ["ark-doubao-pro", "ark-evolving", "or-nemotron-ultra", "ark-v4-pro", "ark-glm-5.2", "gm-flash", "qf-ernie-128k"] }
  },

  // 自动模式：问题类型 -> 首选模型
  autoRoute: {
    image: "glm-4v-flash",
    math: "ark-v4-1-flash",
    translate: "glm-4.7",
    general: "glm-4.7"
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
  // 8 类功能，各自声明首选模型、降级链、temperature、maxTokens、说明。
  // 数值严格按工单表格。
  FUNC_TYPES: {
    general: {
      desc: "文本对话",
      primary: "glm-4.7",
      fallback: ["ark-v4-flash", "qf-ernie-32k"],
      temperature: 0.7,
      maxTokens: 1000
    },
    reasoning: {
      desc: "深度推理",
      primary: "ark-v4-pro",
      fallback: ["ark-doubao-pro", "ark-evolving", "or-nemotron-ultra"],
      temperature: 0.1,
      maxTokens: 2000
    },
    vision: {
      desc: "视觉识图",
      primary: "glm-4v-flash",
      fallback: ["glm-4.6v-flash"],
      temperature: 0.3,
      maxTokens: 1500
    },
    translate: {
      desc: "机器翻译",
      primary: "glm-4.7",
      fallback: ["ark-v4-flash"],
      temperature: 0.3,
      maxTokens: 1200
    },
    longtext: {
      desc: "长文本理解",
      primary: "glm-4.7",
      fallback: ["ark-v4-1-flash", "qf-ernie-128k"],
      temperature: 0.4,
      maxTokens: 2500
    },
    interview: {
      desc: "文本生成",
      primary: "glm-4.7",
      fallback: ["ark-doubao-pro"],
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
      primary: "glm-4.7",
      fallback: ["ark-doubao-pro", "ark-character-260628", "ark-glm-flash"],
      temperature: 0.9,
      maxTokens: 800
    },
    imagegen: {
      desc: "图片生成",
      // R73p / R86k：seedream 走 images/generations 专用链路（2026-09-18 两模型直连实测全部 200 出图）。
      // 选中生图模型时 ai-service 会跳过服务端文本中转，直连 images/generations，绝不进 chat/completions。
      primary: "ark-seedream-4-0828",
      fallback: ["ark-seedream-4-0415"],
      temperature: 0.8,
      maxTokens: 1000
    },
    audio: {
      desc: "语音识别",
      primary: "sf-sensevoice",
      fallback: ["sf-asr-v32", "sf-qwen-asr"],
      temperature: 0.3,
      maxTokens: 1000
    },
    embedding: {
      desc: "向量嵌入",
      primary: "sf-bge-m3",
      fallback: ["sf-bge-zh", "sf-bge-en"],
      temperature: 0.3,
      maxTokens: 1000
    },
    rerank: {
      desc: "结果重排",
      primary: "sf-bge-reranker",
      fallback: [],
      temperature: 0.3,
      maxTokens: 1000
    },
    video: {
      desc: "视频生成",
      primary: "ark-seedance-1-0-pro",
      fallback: ["ark-seedance-1-0-pro-fast"],
      temperature: 0.7,
      maxTokens: 1000
    },
    three_d: {
      desc: "3D 生成",
      primary: "ark-seed3d-2-0",
      fallback: ["ark-hitem3d-2-0"],
      temperature: 0.7,
      maxTokens: 1000
    }
  }
};

// ===== R63 启动结构自检（防「配置改坏 → 全站 AI 失效」的历史事故）=====
// 纯 ES2017 及以前语法；校验失败则回退最小默认配置，绝不抛异常。
(function () {
  function isStr(v) { return typeof v === "string" && v.length > 0; }
  // R131：内置平台已不持有任何 Key（密钥只在服务端 .env），自检 **只校验 apiUrl 非空**。
  // 若沿用旧口径要求 apiKey 非空，删 key 后会误判「配置损坏」并回退到下面那份最小默认配置
  // ——那份配置里原先硬编码过明文 key，是本文件第二处泄露源，已一并删除。
  function providerOk(p, key) {
    var item = p && p[key];
    return !!(item && isStr(item.apiUrl));
  }
  var ok = true;

  // 1) providers：对象，且 zhipu 有非空 apiUrl
  //    （R73k：硅基已移除，不再要求；R131：不再要求 apiKey——内置平台改由服务端持钥并中转）
  var providers = AI_CONFIG.providers;
  if (!(typeof providers === "object" && providers !== null)) {
    ok = false;
  } else if (!providerOk(providers, "zhipu")) {
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
    // 最小默认配置：只保命，不重复主配置。
    // R131：这里原先硬编码了 zhipu 明文 key（自检失败即回退到它 -> 删 providers 里的 key 也白删），
    // 已删除。回退配置同样零密钥：内置模型一律由服务端中转兜底。
    AI_CONFIG.providers = {
      zhipu: {
        name: "智谱AI",
        apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
      }
    };
    AI_CONFIG.builtinModels = [
      { id: "glm-4.7", name: "GLM-4.7", provider: "zhipu", model: "glm-4.7", types: ["general"], tag: "免费", rate: "1x", temperature: 0.7, maxTokens: 1000, fallback: null }
    ];
    AI_CONFIG.FUNC_TYPES = {
      general: { desc: "文本对话", primary: "glm-4.7", fallback: [], temperature: 0.7, maxTokens: 1000 }
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
