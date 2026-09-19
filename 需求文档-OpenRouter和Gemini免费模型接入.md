# 海外免费AI模型接入需求文档（OpenRouter + Google Gemini）

## 一、接入背景
当前项目已接入火山方舟、硅基流动、百度千帆、智谱AI四个国内平台，本次新增两个海外免费AI模型平台，补充更多免费模型选择，供用户在模型设置页自行切换使用。

---

## 二、OpenRouter 平台接入

### 1. 平台基础信息
- **API地址**：`https://openrouter.ai/api/v1/chat/completions`
- **认证方式**：Header `Authorization: Bearer ***REMOVED-BY-R2C***`
- **请求格式**：兼容OpenAI格式
- **访问要求**：需要代理，国内服务器需配置代理才能访问
- **额外请求头**：
  ```
  HTTP-Referer: http://110.42.134.62
  X-Title: Xingtu Learning
  ```

### 2. 已实测可用的免费模型（共14个）
全部实测通过，0调用费用：

| 模型ID | 显示名称 | 能力类型 | 说明 |
|--------|----------|----------|------|
| `deepseek/deepseek-v4-flash-0731:free` | DeepSeek V4 Flash 免费版 | 通用对话 | 速度快，日常问答主力 |
| `nex-agi/nex-n2.5-mini:free` | NEX N2.5 Mini | 通用对话 | 轻量快速 |
| `nex-agi/nex-n2.5-pro:free` | NEX N2.5 Pro | 通用对话 | 推理能力强 |
| `nvidia/nemotron-3-super-120b-a12b:free` | Nemotron 3 Super 120B | 通用对话 | 大模型，推理强 |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | Nemotron 3 Ultra 550B | 通用对话 | 超大模型，能力强 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | Nemotron 推理版 30B | 深度推理 | 适合做难题、复杂推理 |
| `openrouter/free` | OpenRouter 自动路由 | 通用对话 | 自动选最优可用模型 |
| `inclusionai/ling-3.0-flash-vl:free` | Ling 3.0 视觉版 | 多模态识图 | 支持图片理解 |
| `inclusionai/ling-3.0-flash-fin:free` | Ling 3.0 金融版 | 金融专用 | 金融问题咨询 |
| `inclusionai/ling-3.0-flash-sante:free` | Ling 3.0 医疗版 | 医疗专用 | 医疗健康咨询 |
| `liquid/lfm-2.5-2.6b:free` | LFM 2.5 轻量版 | 通用对话 | 2.6B小模型，极速响应 |
| `cohere/north-mini-code:free` | Cohere 代码助手 | 代码专用 | 写代码、debug |
| `dots-studio/dots-3-note-preview:free` | Dots 笔记助手 | 笔记整理 | 总结、整理笔记专用 |
| `nvidia/nemotron-3.5-content-safety:free` | Nemotron 内容安全审核 | 内容审核 | 敏感内容检测 |

### 3. 已知不可用模型（不要接入）
以下模型在列表中但实际调用失败，不要加到配置里：
- `google/gemma-4-26b-a4b-it:free`
- `google/gemma-4-31b-it:free`
- `nvidia/nemotron-3.5-lightning:free`
- `poolside/laguna-s-2.1:free`
- `poolside/laguna-xs-2.1:free`
- `qwen/qwen3.8-27b:free`
- `thinkingmachines/inkling:free`
- `thinkingmachines/inkling-small:free`
- `z-ai/glm-5.2:free`

### 4. 使用限制
- 免费模型有限流：每分钟最多几十次请求，每日约几百次调用
- 国内服务器必须配置代理才能访问，否则会超时
- 模型列表可能随时变动，后续以平台实际可用为准

---

## 三、Google Gemini 平台接入

### 1. 平台基础信息
- **API地址**：`https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent?key={API_KEY}`
- **认证方式**：Key放在URL参数里，不需要Header
- **请求格式**：Gemini专属格式，需要做格式转换
- **访问要求**：需要代理，国内服务器需配置代理才能访问
- **API Key**：`***REMOVED-BY-R2C***`

### 2. 已验证可用的免费模型（共17个）
全部实测通过，免费额度充足：

| 模型ID | 显示名称 | 能力类型 | 说明 |
|--------|----------|----------|------|
| `gemini-flash-lite-latest` | Gemini Flash Lite | 轻量对话 | 额度最大，速度最快 |
| `gemini-flash-latest` | Gemini Flash | 通用对话 | 日常问答主力 |
| `gemini-2.5-flash` | Gemini 2.5 Flash | 多模态对话 | 支持识图、长文本 |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite | 轻量多模态 | 免费额度大 |
| `gemini-3.5-flash` | Gemini 3.5 Flash | 通用对话 | 最新3.5版本 |
| `gemini-3.6-flash` | Gemini 3.6 Flash | 通用对话 | 最新3.6版本 |
| `gemini-3.7-flash` | Gemini 3.7 Flash | 通用对话 | 最新3.7版本 |
| `gemini-3.8-flash` | Gemini 3.8 Flash | 通用对话 | 最新3.8版本 |
| `gemini-omni-1.1-flash` | Gemini 全模态 | 听/看/说 | 支持语音、图片、对话 |
| `gemma-4-26b-a4b-it` | Gemma 4 26B | 开源对话 | Google开源26B模型 |
| `gemma-4-31b-it` | Gemma 4 31B | 开源对话 | Google开源31B模型 |
| `gemini-2.5-flash-image` | Gemini 图片生成 | 文生图 | 免费生成图片 |
| `gemini-3-pro-image` | Gemini 图片Pro | 文生图 | 高质量生图 |
| `lyria-3-pro-preview` | Lyria 音乐生成 | 音乐生成 | 免费生成音乐 |
| `gemini-3.1-flash-lite` | Gemini 3.1 Lite | 轻量对话 | 3.1版本轻量版 |
| `gemini-3.5-flash-lite` | Gemini 3.5 Lite | 轻量对话 | 3.5版本轻量版 |
| `gemini-3.1-flash-lite-image` | Gemini 轻量生图 | 文生图 | 快速生成图片 |

### 3. 使用限制
- 免费额度：Flash系列每日约1500次请求，Lite系列每日约2000次
- Pro版本（如gemini-2.5-pro）免费额度很少，不要接入
- 国内服务器必须配置代理才能访问，否则会超时
- 需要在后端做请求格式转换：Gemini格式转OpenAI格式，统一前端调用

---

## 四、接入要求

### 1. 配置要求
- 所有API Key必须放在服务器`.env`文件里，不要写死在前端代码中
- 后端需要增加代理配置：OpenRouter和Gemini的请求走本地代理（127.0.0.1:7897）
- 服务器如果没有代理，这两个平台的模型在前端要标注"需代理使用，当前网络不可用"

### 2. 模型设置页要求
- 这两个平台的模型全部加到模型设置页，按功能分类
- 模型说明里标注："海外免费模型，需要网络代理才能使用"
- 用户如果本地开了代理可以直接切换使用
- 调用失败时提示"当前网络无法访问海外AI服务，请检查代理设置"

### 3. 不要做的事
- 不要把Key写到前端文件里
- 不要接入实测不可用的那批模型
- 不要把Pro版本高消耗模型加进来
- 不要在国内服务器默认启用这两个平台的模型，用户手动选择才调用

---

## 五、验收标准
1. 模型设置页能看到这两个平台的所有免费模型
2. 选择对应模型后，本地开代理可以正常对话
3. 模型分类正确：对话、识图、生图、代码、医疗金融专用模型分类清晰
4. Key不暴露在前端代码里
5. 调用失败时友好提示，不显示原始报错
