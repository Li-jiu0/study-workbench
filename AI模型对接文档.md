# AI 模型对接文档

> 更新日期：2026-09-18
> 适用版本：v2.5（version 1.24）
> 覆盖平台：火山方舟（ark）、硅基流动（siliconflow）

本文档记录两个 AI 平台的对接细节。所有端点、模型 ID、额度数字均为**真实调用实测**所得，不是照抄文档。

---

## 一、整体架构

### 1.1 能力注册表

不同能力（文本、生图、视觉、语音、嵌入、视频、3D）的端点、请求体、响应结构、计费口径都不同。项目用一套能力注册表把它们解耦：

```
assets/ai-cap-registry.js   → window.XT_AI_CAPS（登记与查询，不含业务逻辑）
assets/ai-cap-image.js      → imagegen  生图
assets/ai-cap-vision.js     → image     视觉理解（走 chat/completions 多模态）
assets/ai-cap-audio.js      → audio     语音识别 ASR
assets/ai-cap-embed.js      → embedding / rerank
assets/ai-cap-video.js      → video     视频生成（异步，自带轮询）
assets/ai-cap-3d.js         → 3d        3D 生成（异步，自带轮询）
assets/ai-cap-translate.js  → translate 翻译（方舟专用 /responses 端点）
```

注册表 API：

| 方法 | 作用 |
|---|---|
| `XT_AI_CAPS.register(cap)` | 登记一个能力 |
| `XT_AI_CAPS.get(keyOrType)` | 按 key 或 type 查 |
| `XT_AI_CAPS.byType(t)` | 严格按模型 `types` 取值查 |
| `XT_AI_CAPS.endpoint(cap, provider)` | 解析端点：优先 `provider[cap.urlField]`，退到 `cap.defaultUrl` |
| `XT_AI_CAPS.usage(o)` | 统一用量结构 |
| `XT_AI_CAPS.errText(json, fb)` | 统一错误解析（同时兼容 `{code,message}` 与 `{error:{message}}`） |

**新增一种能力 = 新建一个 `ai-cap-xxx.js` + 在页面里加一个 script 标签**，不需要改调用层。

### 1.2 两条调用链

| 链路 | 适用 | 说明 |
|---|---|---|
| **服务器转发** `/api/ai/chat` | 文本对话 / 翻译 / 视觉 / 嵌入 | 密钥不落前端，token 由服务端真实解析，超额度服务端直接拒 |
| **前端直连** | 生图 / 视频 / 3D | 这几类走不了 chat/completions，直连后调 `/api/ai/usage/consume` 上报消耗 |

选转发的理由：免费额度是**账号级共享**的，公网多用户场景下只有服务端转发能拿到真实 token 消耗并在超量前拦住，前端上报拦不住。

---

## 二、火山方舟（ark）

### 2.1 凭证与端点

```
API Key   server/.env 的 ARK_API_KEY（同时也在 assets/ai-config.js 的 provider 里）
baseUrl   https://ark.cn-beijing.volces.com/api/v3
```

| 能力 | 端点 | 同步/异步 |
|---|---|---|
| 文本对话 | `POST /api/v3/chat/completions` | 同步（支持流式） |
| 图片生成 | `POST /api/v3/images/generations` | 同步 |
| 视频生成 | `POST /api/v3/contents/generations/tasks` + `GET .../tasks/{id}` | **异步** |
| 3D 生成 | 同上同一端点 | **异步** |
| 向量嵌入 | `POST /api/v3/embeddings/multimodal` | 同步 |
| 翻译 | `POST /api/v3/responses` | 同步 |

列出模型：`GET /api/v3/models`（返回 133 个模型，带 `status` 字段）

### 2.2 status 字段的含义（重要）

| status | 数量 | 含义 |
|---|---|---|
| 无该字段 | 42 | 在服可用 |
| `Retiring` | 22 | 退役中 |
| `Shutdown` | 69 | 已下线 |

⚠️ **status 只说明「平台有没有这个模型」，不说明「你这个 key 能不能调」** —— 这两件事必须分别验证。Retiring 的 13 个实测全部返回 404。

### 2.3 模型清单（服务端注册 61 个 / 前端可选 27 个）

> ⚠️ **两套 id，别混**（R11f 专项排查的结论）：
> - **前端 id** = `assets/ai-config.js` 的 `builtinModels[].id`（如 `ark-v4-flash`）——这是
>   **用户实际选到的**，也是服务端记账用的 key（`ai.py` 里 `quota_key = body.modelId`，
>   前端 `ai-service.js` 发的是 `modelConfig.id`）。
> - **注册表键** = `server/data/model_registry.json` 的顶层 key（如 `ark-ds-v4-flash-ga`）——
>   用途是 `modelId → 真实模型名` 映射。
> - 两套 id 大部分**不重合**（历史遗留）。**额度表必须按「前端 id」登记**，否则用户真选了
>   那个模型，额度查询却落空 → 按不限量放行、额度用完也不关停。R11f 已把这类漏网补全。

**文本对话 / 翻译（27 个）** `freeQuota: 500000, quotaType: "tokens"`

| 显示名 | 前端 id | 真实 API ID |
|---|---|---|
| Doubao-Seed-2.1-pro（新版） | `ark-seed-2-1-pro-260628` | `doubao-seed-2-1-pro-260628` |
| Doubao-Smart-Router | `ark-smart-router` | `doubao-smart-router-250928` |
| Doubao-Seed-2.1-pro | `ark-seed-2-1-pro` | `doubao-seed-2-1-pro-260915` |
| Doubao-Seed-2.1-turbo | `ark-seed-2-1-turbo` | `doubao-seed-2-1-turbo-260628` |
| Doubao-Seed-2.0-pro | `ark-seed-2-0-pro` | `doubao-seed-2-0-pro-260215` |
| Doubao-Seed-2.0-mini | `ark-seed-2-0-mini` | `doubao-seed-2-0-mini-260428` |
| Doubao-Seed-2.0-lite | `ark-seed-2-0-lite` | `doubao-seed-2-0-lite-260428` |
| Doubao-Seed-2.0-Code | `ark-seed-2-0-code` | `doubao-seed-2-0-code-preview-260215` |
| Doubao-Seed-Translation | `ark-seed-translation` | `doubao-seed-translation-250915` |
| Doubao-Seed-Character | `ark-seed-character` | `doubao-seed-character-260628` |
| Doubao-Seed-Evolving | `ark-seed-evolving` | `doubao-seed-evolving` |
| DeepSeek-V4.1-Flash | `ark-ds-v4-1-flash` | `deepseek-v4-1-flash-260910` |
| DeepSeek-V4-Pro正式版 | `ark-ds-v4-pro-ga` | `deepseek-v4-pro-ga-260813` |
| DeepSeek-V4-pro | `ark-ds-v4-pro` | `deepseek-v4-pro-260425` |
| DeepSeek-V4-Flash正式版 | `ark-ds-v4-flash-ga` | `deepseek-v4-flash-ga-260731` |
| GLM-5.3-Flash | `ark-glm-5-3-flash` | `glm-5-3-flash-260828` |
| GLM-5.2 | `ark-glm-5-2` | `glm-5-2-260617` |
| Doubao-Seed-1.8 ⚠️ | `ark-seed-1-8` | `doubao-seed-1-8-251228` |
| Doubao-Seed-1.6 ⚠️ | `ark-seed-1-6` | `doubao-seed-1-6-251015` |
| Doubao-Seed-1.6-flash ⚠️ | `ark-seed-1-6-flash` | `doubao-seed-1-6-flash-250828` |
| Doubao-Seed-1.6-vision ⚠️ | `ark-seed-1-6-vision` | `doubao-seed-1-6-vision-250815` |
| Doubao-Seed-Code ⚠️ | `ark-seed-code` | `doubao-seed-code-preview-251028` |
| Doubao-1.5-pro-32k ⚠️ | `ark-1-5-pro-32k` | `doubao-1-5-pro-32k-250115` |
| Doubao-1.5-lite-32k ⚠️ | `ark-1-5-lite-32k` | `doubao-1-5-lite-32k-250115` |
| Doubao-1.5-vision-pro-32k ⚠️ | `ark-1-5-vision-pro-32k` | `doubao-1-5-vision-pro-32k-250115` |
| DeepSeek-V4-flash ⚠️ | `ark-ds-v4-flash` | `deepseek-v4-flash-260425` |
| GLM-4.7 ⚠️ | `ark-glm-4-7` | `glm-4-7-251222` |

⚠️ = 退役中（`deprecated:true` + `usable:false` + `expireAt:"2026-09-21"`），界面隐藏不展示。

> 2026-09-21（R11d）：新增 `ark-seed-2-1-pro-260628`（Seed-2.1-pro 的新版快照）与
> `ark-smart-router`（自动路由，`Router` 域），已实测可调；两者均登记 500000/tokens。
> 另 `ark-seed-2-0-pro` 之前只在服务端注册表里，本次确认它**前端本就可选**，已补额度登记。

**图片生成（4 个）** `quotaType: "images"`

| 显示名 | 前端 id | 真实 API ID | 额度 | 前端可选？ |
|---|---|---|---|---|
| Doubao-Seedream-5.0-pro | `ark-seedream-5-0-pro` | `doubao-seedream-5-0-pro-260628` | 200 张 | ✅ R11d 新接入 |
| Doubao-Seedream-5.0 | `ark-seedream-5-0` | `doubao-seedream-5-0-260128` | 200 张 | ✅ R11c 接入 |
| Doubao-Seedream-4.0（0415 快照） | `ark-seedream-4-0415` | `doubao-seedream-4-0-20260415` | 200 张 | ✅ |
| Doubao-Seedream-4.0（0828 快照） | `ark-seedream-4-0828` | `doubao-seedream-4-0-250828` | 200 张 | ✅ |
| Doubao-Seedream-4.5 | `ark-seedream-4-5` | `doubao-seedream-4-5-251128` | 200 张 | ❌ 仅服务端注册表 |
| Doubao-Seedream-4.0 | `ark-seedream-4-0` | `doubao-seedream-4-0-250828` | 200 张 | ❌ 仅服务端注册表 |

> 2026-09-21（R11c）：新增 `ark-seedream-5-0`。已在 `server/.env` 的 `ARK_API_KEY` 下**实测**
> `POST /api/v3/images/generations`（body = `{model, prompt, image_size, n, response_format:"url"}`，
> 与服务端 `/api/ai/image/generate` 的 arkimage 分支逐字段一致）→ **HTTP 200 正常出图**。
> 前端已同步三处：`builtinModels` 条目 / `modelDetails` 明细 / `FUNC_TYPES.imagegen.primary`（升为首选）。
>
> 2026-09-21（R11d）：新增 `ark-seedream-5-0-pro`（同样实测 HTTP 200 出图），
> `builtinModels` + `modelDetails` + `MODEL_RATES`/`MODEL_DETAILS`/`FALLBACK_MODELS` 兜底表同步补齐；
> 额度表补 200/images。同时给 `ark-seedream-4-0415` / `ark-seedream-4-0828` 补上额度登记
> （此前两者**没有额度条目**，等于不限量、额度用完也不会关停）。
>
> ⚠️ `ark-seedream-4-5` / `ark-seedream-4-0` 是服务端注册表的历史键，前端**从未接入**（用户选不到），
> 额度条目保留但不产生实际拦截——属遗留的口径分歧，待专项清理。

**视频生成（2 个）** `quotaType: "videos"`（按「个」计，登记 20 个/模型）

| 显示名 | 前端 id | 真实 API ID | 额度 | 前端可选？ |
|---|---|---|---|---|
| Doubao-Seedance-1.0-pro | `ark-seedance-1-0-pro` | `doubao-seedance-1-0-pro-250528` | 20 个 | ✅ R11d 重新接入 |
| Doubao-Seedance-1.0-pro-fast | `ark-seedance-1-0-pro-fast` | `doubao-seedance-1-0-pro-fast-251015` | 20 个 | ✅ R11d 重新接入 |

> 2026-09-19（R92-B）：`ark-seedance-1-5-pro` / `ark-seedance-1-0-lite-t2v` / `ark-seedance-1-0-lite-i2v`
> 三个「即将下线」模型已从前端模型配置（assets/ai-config.js 模型条目 + modelDetails）删除；
> 服务端 model_registry.json / model_quota.json 的对应条目带 `expireAt: 2026-09-21` 自动过期，保留作为历史记录。
>
> 2026-09-21（R11b）：`ark-seedance-1-0-pro` / `ark-seedance-1-0-pro-fast` 曾按用户要求**全部删除**
> （前端模型条目 + modelDetails、服务端 registry/quota 四处同步移除；`FUNC_TYPES.video` 清空为占位）。
>
> ✅ 2026-09-21（R11d）：**视频能力已按用户要求重新接入** —— 上表两个模型回到
> `builtinModels` + `modelDetails` + `FUNC_TYPES.video`（`primary = ark-seedance-1-0-pro`，
> `fallback = [ark-seedance-1-0-pro-fast]`），额度表登记 20/videos。
> 注册表里的 `ark-seedance-2-0` / `-2-0-fast` / `-2-0-mini` / `-2-5` 也一并补了 20/videos 的额度（前端未可选）。

**3D 生成（3 个）** `quotaType: "tasks"`（按「个」计，登记 60 个/模型）

| 显示名 | 前端 id | 真实 API ID | 额度 | 前端可选？ |
|---|---|---|---|---|
| Doubao-Seed3D-2.0 | `ark-seed3d-2-0` | `doubao-seed3d-2-0-260328` | 60 个 | ✅ |
| Hyper3D-Gen2 | `ark-hyper3d-gen2` | `hyper3d-gen2-260112` | 60 个 | ✅ R11d 新接入 |
| Hitem3D-2.0 | `ark-hitem3d-2-0` | `hitem3d-2-0-251223` | 60 个 | ✅ |

> 2026-09-21（R11d）：三个 3D 模型的额度由 `freeQuota: null`（不限量）统一改为 **60/tasks**；
> `ark-hyper3d-gen2` 重新接入前端（此前用户曾两次删除它，本次按「实用的 8 个」方案明确加回，**存争议，若不需要请告知移除**）。

**向量嵌入（1 个，仅服务端注册）** `freeQuota: 500000, quotaType: "tokens"`

| 显示名 | 前端 id | 真实 API ID | 前端可选？ |
|---|---|---|---|
| Doubao-embedding-vision | `ark-embedding-vision` | `doubao-embedding-vision-251215` | ❌ 本次**未接入** |

> ⚠️ R11d 排查结论：该模型**暂不接入**。原因：服务端嵌入中继拼的是 `/v1/embeddings`，
> 而方舟多模态嵌入只认 `/embeddings/multimodal`（见 §2.1 端点表），路径不匹配会直接 400。
> 要接入需先在中继里加一条 ark 专用的嵌入分支，属独立改动。

### 2.4 已确认不接入的模型

| 模型 | 原因 |
|---|---|
| `Doubao-1.5-vision-lite` | `Shutdown` 已下线 |
| `DeepSeek-V3.2` | `Shutdown` 已下线 |
| `Doubao-Seedream-5.0-lite` | `/models` 清单里**没有 lite 变体**；基础版 `doubao-seedream-5-0-260128` 已实测 HTTP 200 出图，2026-09-21（R11c）接入为 `ark-seedream-5-0`；`doubao-seedream-5-0-pro-260628` 同样实测 200，2026-09-21（R11d）接入为 `ark-seedream-5-0-pro`。**上述两个不是 lite**，lite 变体确实不存在 |
| Seedance-2.0 / -2.0-fast / -2.0-mini / -2.5 | 账号未开通（`ModelNotOpen`），开通后可加回；额度表已按 20/videos 预登记 |
| `Doubao-embedding-vision` | 中继端点路径不匹配（`/v1/embeddings` vs 方舟 `/embeddings/multimodal`），会直接 400；接入需先改中继，见 §2.3 末 |

---

## 三、硅基流动（siliconflow）

### 3.1 端点

```
对话  https://api.siliconflow.cn/v1/chat/completions
生图  https://api.siliconflow.cn/v1/images/generations
嵌入  https://api.siliconflow.cn/v1/embeddings
重排  https://api.siliconflow.cn/v1/rerank
语音  https://api.siliconflow.cn/v1/audio/transcriptions
```

provider 配置在 `assets/ai-config.js` 的 `providers.siliconflow`，含 `apiUrl` / `imageUrl` / `audioUrl` / `embedUrl` / `rerankUrl` 五个端点和 API Key。

### 3.2 模型（12 个，实测全部 HTTP 200）

| 能力 | type | 模型 |
|---|---|---|
| 对话 / 翻译 | `chat` / `translate` | `tencent/Hunyuan-MT-7B` |
| 视觉理解 / OCR | `image` | `PaddlePaddle/PaddleOCR-VL-1.5` |
| 生图 | `imagegen` | `Kwai-Kolors/Kolors` |
| 语音识别 ×5 | `audio` | `FunAudioLLM/SenseVoiceSmall`、`XingChenAGI/XingChenASR-V3.2`、`XingChenASR-V3.2-Ultra`、`XingChenASR-Diarize-V3.0`、`Qwen/Qwen3-ASR` |
| 向量嵌入 ×3 | `embedding` | `BAAI/bge-m3`、`bge-large-zh-v1.5`、`bge-large-en-v1.5` |
| 结果重排 | `rerank` | `BAAI/bge-reranker-v2-m3` |

---

## 四、用量检测

### 4.1 为什么必须服务端统计

项目部署在公网（多用户），**免费额度是账号级共享的**。前端 localStorage 只统计单个用户，多人同时调用会超量欠费。所以用量在服务端统一累计。

### 4.2 服务端文件

```
server/quota_ledger.py              账本核心（原子写 / 线程锁 / 内存缓存 + 5s 落盘 / 退出 flush）
server/data/model_usage.json        用量账本（运行时数据，已加入 .gitignore）
server/data/model_quota.json        额度配置（跟随代码，不 ignore）
server/data/model_registry.json     modelId → 真实模型名映射（跟随代码，不 ignore）
```

⚠️ `model_usage.json` **必须在 `.gitignore` 里**：否则部署会把服务器上的真实用量覆盖成 0，所有人用量归零 → 直接超量。而另两张表是配置，**不能** ignore。

### 4.3 接口

| 接口 | 说明 |
|---|---|
| `GET /api/ai/usage` | 返回所有模型用量与状态。**登录用户**返回全量账本；**游客返回 `models: {}`**（脱敏，防免登录泄露额度/真实模型名/全站调用量） |
| `POST /api/ai/usage/consume` | 前端直连成功后上报消耗。入参 `{modelId, amount, ok, unit}`；`modelId` 必须在 `known_model_ids()` 白名单内 |
| `POST /api/ai/usage/reset` | 管理用，需 header `X-Admin-Token` |
| `POST /api/ai/chat` | 转发前先查额度，超额直接返回不转发（不产生真实费用） |

`/api/ai/usage` 每个模型返回：

```
{ used, calls, failCalls, freeQuota, quotaType, remaining, percent,
  status, exhausted, estRemainingRuns, expireAt, expired }
```

| status | 含义 |
|---|---|
| `ok` | 剩余 > 20% |
| `low` | 剩余 ≤ 20%（只提示，**不禁用**） |
| `exhausted` | 剩余 = 0，**服务端拒绝转发 + 前端从模型面板隐藏** |
| `unknown` | 额度表里没有该模型，放行不拦截 |

**额度耗尽的完整链路（R11d 打通）**

```
① 转发前  ai.py: check_quota(quota_key) → False 时直接返回
           · 对话链路：{ok:false, exhausted:true, error:"该模型免费额度已用完，请切换其他模型"}
           · 媒体链路（图/视频/3D/ASR）：{ok:false, kind:"quota_exhausted", code:429}
           —— 都不转发，不产生真实费用
② 上游 402   _upstream_failed() → force_exhaust(model_id)，即使该模型没登记额度也强制停用
③ 前端隐藏   ai-page.js: refreshQuotaSnap() 拉 /api/ai/usage →
           isHiddenByQuota(id) 命中 exhausted===true 的模型 → applyListSettings() 过滤掉，用户看不到也选不到
           · TTL 60s + inflight 去重，打开模型面板与 init 各拉一次，不会「渲染→拉取→回调再渲染」成环
           · **fail-open**：游客（models 为空）/ 断网 / fetch 抛错 → 一个都不隐藏，绝不因额度接口挂掉而把面板清空
```

> ⚠️ **记账 key = 前端 id**：`quota_key` 取 `body.modelId`（即 `ai-config.js` 的 `id`）。
> 因此**额度表必须按前端 id 登记**，登记成注册表键是无效的（查不到 → 按不限量放行）。见 §2.3 开头的两套 id 说明。
>
> ⚠️ **覆盖边界（R11f 实测）**：额度登记目前**只覆盖方舟（ark / arkimage / arkvideo / ark3d）**。
> 前端 69 个可选模型里 27 个已登记；其余 42 个属其它平台，**按不限量放行、不会自动关停**：
> `gemini` 11 个 / `openrouter` 14 个 / `siliconflow` 12 个 / `zhipu` 3 个 / `qianfan` 2 个。
> 若要同样纳入关停，需先确定各自平台的额度口径（硅基流动是余额、Gemini 是每日免费次数、OpenRouter 是余额）。
>
> ⚠️ **单次上报防刷上限**：`record_usage` 内部把单次 `amount` clamp 到 `MAX_AMOUNT = 100000`
> （防恶意一次打停模型），真实调用几乎不会触及；若某次真实消耗 > 10 万 token 会被少计。

### 4.4 各类能力的计费口径

| 能力 | 单位 | 用量字段 |
|---|---|---|
| 文本对话 / 视觉 | tokens | `usage.prompt_tokens + completion_tokens` |
| 图片生成 | 张 | `usage.generated_images`（响应也带 token 口径，约 4096/张） |
| 视频 / 3D | **个（任务）** | 按次计 1，口径为 `quotaType: "videos"` / `"tasks"`（R11d 起；上游仍回 token，但账本按次记） |
| 向量嵌入 | tokens | `usage.prompt_tokens` |
| 语音识别 | 次 | 各家取整不同，如实记录 |

**实测单次消耗**：视频 5s/720p ≈ 103,818 tokens（**方舟视频资源包按「个」计，故账本按次记 1**）、
3D 一次 ≈ 30,000 tokens（**同上，按次记 1**）、图片 1 张 1024² ≈ 4,096 tokens。

---

## 五、模型字段规范

`ai-config.js` 里 `builtinModels` 的每个模型：

| 字段 | 说明 |
|---|---|
| `type` | **能力语义**，供 `XT_AI_CAPS.byType()` 路由。取值：`chat` / `translate` / `image`（视觉理解）/ `imagegen`（生图）/ `audio` / `embedding` / `rerank` / `video` / `3d` |
| `cat` | **文档五分类**，供 UI 分组。取值：`text` / `image` / `video` / `3d` / `embedding` |
| `freeQuota` | 免费额度总量 |
| `quotaType` | `tokens` / `images` / `videos` / `models` |
| `deprecated` | `true` = 退役中（打「即将下线」角标、不能设为默认、降级排最后） |
| `usable` | `false` = 实测不可用，界面完全隐藏 |
| `expireAt` | `YYYY-MM-DD`，到期自动移除 |
| `imageSize` | 生图模型的尺寸（部分模型有下限，见坑 4） |

### 为什么 type 和 cat 要分开

需求文档把「图片生成」写成 `type:"image"`，但能力注册表里 `type:"image"` 是**视觉理解**。直接套用会把生图模型路由到视觉链路直接报错。所以拆成两个字段：`type` 管调用路由，`cat` 管界面分组。

---

## 六、已知坑（都是实测踩出来的）

1. **`/api/ai/chat` 曾把模型名写死在 `.env` 的 `ARK_MODEL`**，导致前端选任何模型实际都跑同一个。修复：请求体加 `modelId`，服务端查 `model_registry.json` 映射。
2. **流式请求默认不返回 usage**。必须在请求体加 `stream_options: {"include_usage": true}`，再从最后一个 chunk 里取。之前没加，所以账本一直是 0。
3. **翻译模型不是 chat 模型**。打 `/chat/completions` 返回 400 `does not support this api`，要走 `/responses`，且 `translation_options` 必须嵌在 `content` 数组元素里（放顶层报 unknown field）。
4. **Seedream-4.5 有图片尺寸下限**：最小 3,686,400 像素（≈1920×1920），传 `1024x1024` 报 400。Seedream-4.0 无此限制，两个不能用同一个 size。**Seedream-5.0 实测也无此限制**（2026-09-21 用 `image_size:"1024x1024"` 直连 HTTP 200 出图），可与 4.0 共用默认尺寸。
5. **向量嵌入只有 `/embeddings/multimodal`**，打 `/embeddings` 返回 400 `does not support this api`。
6. **重排序要打 `/v1/rerank`**（硅基流动），不是 `/v1/embeddings`。
7. **生图返回的图片 URL 是 S3 预签名地址，1 小时失效**（`X-Amz-Expires=3600`）；**视频 / 3D 的结果 URL 只有 24 小时**（`X-Tos-Expires=86400`）。必须落本地存储，历史记录不能只存 URL。
8. **硅基流动的错误格式是 `{code, message, data}`**，不是 OpenAI 的 `{error:{message}}`。解析错误必须两种都兼容（`XT_AI_CAPS.errText()` 已处理）。
9. **Retiring 状态的模型实测全部 404**（`InvalidEndpointOrModel.NotFound`），而 `ModelNotOpen` 是另一个意思——账号未开通，去控制台开通即可用。两者不要混为一谈。
10. **额度表的 key 必须是前端 `id`**（`ark-xxx` 格式），不能用上游模型名。用错会导致映射查不到、退回默认模型。
11. **进度条百分比要夹在 100 以内**，否则超额时 `percent` 会超过 100（如 300/200 = 150%），进度条溢出。
12. **视频 / 3D 是异步的**（提交任务 → 轮询），现有同步调用层 60 秒超时撑不住，由 `ai-cap-video.js` / `ai-cap-3d.js` 自带轮询处理。
13. **「限额表有登记」≠「限额生效」**（R11f 实测踩到）：登记成**注册表键**（`ark-ds-v4-flash-ga`）
    而用户实际选的是**前端 id**（`ark-v4-flash`）时，`get_quota()` 查不到 → `status: "unknown"`
    → 按不限量放行，额度用完也**不会关停**。登记后务必用
    `tools/_r11f_coverage.py` 核一遍「前端可选 ∩ 有额度登记」的覆盖率。
14. **单次上报有防刷上限** `MAX_AMOUNT = 100000`，`record_usage` 内部 clamp；
    写验证脚本时不能用一次传 500000 来「打满」额度，必须分多次累加（见
    `tools/_r11d_quota_ledger_smoke.py`）。
15. **provider 级 `apiKey` 必须「整行删除」，不能只把值改成占位串**（R11g 踩到，症状很迷惑）：
    `ai-service.js` 的 `xtResolveChannel()` 只要看到 `providers.<平台>.apiKey` 非空就返回
    `relay:false`（强制前端直连、绕过服务端中转），**不校验这个值是否有效**。
    R131 去明文 key 时其余 6 家删了字段，唯独 gemini 只把值换成作废占位串 →
    gemini 长期拿作废串直连 Google → 401/403 → 连通性检测误报
    「Google Gemini 的 Key 无效或已过期，请到设置页填写自己的 Google Gemini Key」
    （**把人往错方向引**：真正的问题是内置占位串，不是用户没填 Key）。
    回归校验：`tools/_r11g_gemini_channel_check.js`。
16. **海外平台（gemini / openrouter）就绪判定必须看 `relayAvailable`，不能只看「在不在列表里」**：
    `GET /api/ai/models` 对国内平台按「已配 Key」过滤（不在列表=不可用），
    但对海外平台是**恒下发**的，只附一个 `relayAvailable`
    （= key 且 proxy 双齐，或显式 `<PROVIDER>_ALLOW_DIRECT=1`，见 `ai.py:_oversea_ready`）。
    前端 `relayProviders()` 必须把该字段带出来，否则未就绪也会被判「正常」（假阳性）。
    回归校验：`tools/_r11g_relay_available_check.js`。

---

## 七、维护指南

### 新增一个模型

1. 调 `GET /api/v3/models` 确认模型存在且 `status` 不是 `Shutdown`
2. **实测调用一次**，确认这个 key 真能调通（status 在服 ≠ 能调）
3. 在 `ai-config.js` 的 `builtinModels` 加条目，字段按第五节填齐；
   同时补 `modelDetails`（缺了结构自检会把它当残配置）
4. 在 `server/data/model_registry.json` 加 `前端 id → 真实模型名`
5. 在 `server/data/model_quota.json` 加额度 —— **key 必须是第 3 步那个前端 id**（坑 13）
6. `ai-page.js` 的三张兜底表按需同步：`MODEL_RATES`（倍率）/ `MODEL_DETAILS`（明细）/ `FALLBACK_MODELS`
7. 若是新能力的首个模型，还要改 `FUNC_TYPES.<能力>.primary` / `fallback`
8. **跑校验**（顺序别乱，全 0 fail 才算过）：
   ```
   node tools/_r11b_config_load.js          # 结构自检 + 无悬空引用
   node tools/_r11c_seedream5_check.js      # 三表一致性（以 Seedream-5.0 为例）
   node tools/_r11d_wire_check_frontend.js  # 批量接入检查
   python tools/_r11f_coverage.py           # 前端可选 ∩ 有额度登记 覆盖率
   python tools/_r11d_quota_ledger_smoke.py # 后端「额度满→拦截」烟测
   python tools/_ark_free_quota_report.py   # 重新生成方舟免费额度清单
   ```
9. 版本戳：改了 `ai-config.js` / `ai-page.js`，必须同步 bump **引用它们的页面**里的 `?v=` 查询串
   （如 `AI.html`），否则老用户命中旧 JS 缓存。

### 新增一种能力

1. 新建 `assets/ai-cap-xxx.js`，调用 `XT_AI_CAPS.register({...})`
2. 实现 `build(ctx)` 构造请求、`parse(json, ctx)` 解析响应
3. 异步能力额外实现 `run(ctx, onProgress)` 并标 `async: true`
4. 在页面加 script 标签
5. 在 `ai-service.js` 的 `XT_KIND_BY_TYPE` / `XT_NON_CHAT_TYPES` / `XT_KIND_LIST` 里登记 kind（否则用量会被收敛成 `text`）

### 额度用完后的操作

控制台充值后，调 `POST /api/ai/usage/reset`（header 带 `X-Admin-Token`），可重置单个模型或全部（`{"all":true}`）。
