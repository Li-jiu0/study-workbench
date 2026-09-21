# R88-B 审计报告：展示即真可用（展示的能力必须真实可用）

> 审计人：工程师寇豆码（Kou，teammate `software-engineer-r88b`）
> 审计范围：代码树 `D:\下载的文件\学习工作台`（唯一可写树）
> 审计日期：2026-09-18
> 审计性质：**只审计，未做任何代码修改**
> 审计方法：静态代码链路核对（`Read`/`Grep`/`Glob`）+ 服务端配置核对(`server/.env` 仅看 key 名、`server/config.py`)
> **红线说明**：本次**未真实调用任何 AI API**（无 Key 授权、会消耗用户额度、视频/3D 分钟级）。所有「✅」判定依据是**代码链路完整 + Key 存在**，**不是实测**。凡无法从代码静态确认的，一律标注「⚠️无法验证」，**绝不编造实测**。

---

## 1. 结论摘要

**一句话结论**：文本对话/视觉/翻译链路真实可用且实现完整；生图（Seedream/Kolors）链路完整但**其 provider Key 与服务端不一致、且未进服务端额度/中转**，存在可用性风险；**语音识别、向量、重排、视频、3D 五类能力「有模型、有入口、有实现代码」，但因（a）能力调用器 `xtRunCapability` 未导出、（b）视频/3D 调用层不处理 `cap.run` 异步流程、（c）无服务端 Key/中转**，在真实运行中**大概率展示即不可用**——这正是用户点名的违规点。

**违规项计数（静态代码可确认）**：

| 级别 | 数量 | 说明 |
|---|---|---|
| ❌ 严重（展示即不可用，链路断） | **5 类能力 / 共 20 个模型条目** | 语音识别(5) + 向量(3) + 重排(1) + 视频(8) + 3D(3)；外加 `ark-embedding-vision`(1) 因 registry/前端 provider 不一致也有风险 |
| ⚠️ 风险（链路完整但依赖外部条件/可能不通） | **3 类能力** | 生图（Key 不一致 + 无服务端额度）、Gemini(2)、OpenRouter(3)（需自备网络/代理） |
| ❌ 纯占位（假按钮/假文案） | **0 处**（未发现「即将上线/敬请期待/开发中」类纯占位按钮） | — |
| ⚠️ 文案误导 | **3 处** | 生图模型说明「调用链路待评估」/ 视频&3D 模型 tag「免费」但无服务端额度口径 |

> 注：视频/3D 中 `ark-seedance-2-0 / 2-0-fast / 2-0-mini / 2-5`（4 个）**只出现在 `model_registry.json`，并未出现在前端 `ai-config.js` 的 builtinModels**，即**未展示**——故其「展示即可用」风险不成立（未展示），但登记表与前端不一致本身是隐患，见 §2.4。

---

## 2. 能力对照表（8 类 × 模型：展示位置 / 调用链路 / Key 有无 / 判定）

**图例**：✅真可用（链路完整+Key存在，非实测） / ⚠️有入口但链路不完整或依赖外部条件 / ❌展示即不可用（链路断或无Key）

### 2.0 关键前置事实（决定所有判定）

1. **服务端只中转文本对话**：`server/routers/ai.py` 仅有 `POST /api/ai/chat`（chat/completions SSE 转发，`ai.py:171`）+ `/models`+`/usage`+`/history`。**没有任何** image/video/3d/audio/embed/rerank 的服务端端点。
2. **服务端 `.env` 实配 Key（仅 key 名）**：`DEEPSEEK / QWEN / KIMI / ZHIPU / OPENAI / ARK / QIANFAN`（+`FEEDBACK_ADMIN_KEY/SMTP_*/ADMIN_TOKEN`）。**无 `SILICONFLOW_API_KEY`**（`server/config.py:78-83` 定义了 siliconflow provider，但 `.env` 未配 → `configured_providers()` `config.py:93` 不会返回它）。
3. **前端 `assets/ai-config.js` 内置了硬编码 Key**（`ai-config.js:20-74`）：`zhipu / qianfan / ark / arkimage / openrouter / siliconflow / gemini`。即：**浏览器直连第三方用的是前端硬编码 Key**，与 `server/.env` 的 Key **是两套**。
4. **非对话能力全部浏览器直连**（CORS 依赖第三方）：生图 `images/generations`、语音 `audio/transcriptions`、向量 `embeddings`、重排 `rerank`、视频/3D `contents/generations/tasks`——均无服务端中转。
5. **能力直连调用器未接线**：`ai-service.js:1941` 定义了 `xtRunCapability`，但导出对象 `AI_SERVICE`（`ai-service.js:3218-3238`）**未包含它**；`ai-page.js:901 capRunner()` 因此恒返回 `null`（见 §3 证据 E1）。
6. **视频/3D 调用层不跑异步轮询**：`xtCallCapability`（`ai-service.js:1748`）**从不检查 `cap.async`、从不调用 `cap.run`**，只做单次 `build`+`parse`。而 `ai-cap-video.js` / `ai-cap-3d.js` 的 `build/parse` 只负责「创建任务」，真正的「轮询取结果」在 `cap.run`（`ai-cap-video.js:176`、`ai-cap-3d.js:154`）。→ 即使接通 `xtRunCapability`，视频/3D 也只能拿到 `taskId`，**拿不到视频/模型文件**。

### 2.1 文本对话（general / reasoning / math / creative / longtext）

| 代表模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `glm-4.7` | `ai-config.js:565`；分区「对话与识图」`ai-page.js:1715` | 服务端中转 `/api/ai/chat`（`ai-service.js:2771`）→ 失败直连 `callAI`→`requestModel` | 服务端 `ZHIPU_API_KEY` ✅ / 前端内置 zhipu ✅ | ✅真可用（链路完整+Key存在） |
| `ark-v4-flash` 等 ark 文本系 | `ai-config.js:287-467` | 同上 | 服务端 `ARK_API_KEY` ✅ | ✅真可用 |
| `qf-ernie-32k/128k` | `ai-config.js:601-623` | 同上 | 服务端 `QIANFAN_API_KEY` ✅ | ✅真可用 |
| `or-auto / or-nemotron-super / or-nemotron-ultra` | `ai-config.js:625-659` | 直连 OpenRouter（`ai-service.js:2762` 无图时不走中转则直连） | 前端内置 openrouter Key ✅，但 `needProxy:true` | ⚠️有入口，依赖自备网络/代理 |
| `gm-flash / gm-flash-lite` | `ai-config.js:661-685` | 直连 Gemini（`apiFormat:gemini`） | 前端内置 gemini Key ✅，`needVPN/needProxy` | ⚠️有入口，依赖自备网络 |

### 2.2 视觉理解（types: `image`；走 chat/completions）

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `glm-4v-flash` / `glm-4.6v-flash` | `ai-config.js:577-599`；分区 `ai-page.js:1715` | 走 chat 多模态（`ai-cap-vision.js:33 build()→null`，交 `ai-service` buildMessages 处理用户上传图） | zhipu ✅ | ✅真可用（链路完整+Key存在）；`glm-4.6v-flash` 说明标注「限流中」 |
| `sf-paddleocr-vl-1.5` | `ai-config.js:723-733` | 同上（vision 链） | **前端 siliconflow 内置 Key ✅；服务端无** → 依赖浏览器直连 SiliconFlow 的 CORS | ⚠️有入口；依赖前端硬编码 Key + 第三方 CORS |
| `ark-*-vision*`（registry 有，前端 builtinModels **无**） | `model_registry.json:21,25` | — | — | 未展示（不涉及）|

### 2.3 生图（types: `imagegen`）

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `ark-seedream-4-0415` | `ai-config.js:687-697`；分区「生图」`ai-page.js:1716` | `callAI` 命中 `isImageGenModel`（`ai-service.js:2767`）→ 直连 `requestImageGeneration`（`ai-service.js:1404`）→ `arkimage` provider `images/generations`（`ai-config.js:39-43`） | 前端 `arkimage` 硬编码 ark Key ✅；**服务端 `.env` 未配 arkimage** | ⚠️链路完整，但：①走浏览器直连方舟、**未进服务端额度**（`ai.py` 无生图端点）；②模型说明标注「调用链路待评估」（`ai-page.js:104`）；**需实测方舟 CORS/额度** |
| `ark-seedream-4-0828` | `ai-config.js:699-709` | 同上 | 同上 | 同上 ⚠️ |
| `sf-kolors` | `ai-config.js:735-745` | 直连 siliconflow `images/generations`（`ai-cap-image.js:27 defaultUrl`） | **前端 siliconflow 内置 Key ✅；服务端无** | ⚠️链路完整；依赖前端硬编码 Key + SiliconFlow CORS；**需实测** |

> **模型说明文案矛盾**：`ai-config.js:996-1004` FUNC_TYPES.imagegen 注释称「2026-09-18 两模型直连实测全部 200 出图」，但 `ai-page.js:104-105` 的模型说明却写「调用链路待评估」。两处口径不一致（见 §3 E7）。

### 2.4 语音识别（types: `audio`）—— ❌

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `sf-sensevoice` / `sf-asr-v32` / `sf-asr-ultra` / `sf-asr-diarize` / `sf-qwen-asr` | `ai-config.js:747-805`；分区「语音识别」`ai-page.js:1717` | ①理想：`ai-page.js:918 runAudioRecognition`→`capRunner()()`（`ai-page.js:901`）→ `ai-cap-audio.js asr`；②实际：`capRunner()` **恒 null**（`xtRunCapability` 未导出）→ 退 `callAI('general',...)`（`ai-page.js:951`），音频挂 `opts.audio` | 前端 siliconflow 内置 Key ✅；服务端无 | ❌展示即不可用（真实链路断）。理由：`capRunner` 取不到 runner，退路 `callAI` 走 chat/completions，**ASR 模型不会出现在 general 链**（`FUNC_TYPES.audio` 未接到任何 dispatch），最终只会返回文本模型的胡言或降级文案。 |

> 另注：`ai-cap-audio.js` 模块本身实现完整（`build/parse/probe` 齐备），且 `types:['audio']` 已被 `XT_NON_CHAT_TYPES`（`ai-service.js:1563`）列入非对话类，**但没有任何调用方真正调用它**。

### 2.5 向量嵌入（types: `embedding`）—— ❌

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `sf-bge-m3` / `sf-bge-zh` / `sf-bge-en` | `ai-config.js:807-840`；分区「向量与重排」`ai-page.js:1718` | 唯一入口是 `xtRunCapability('sf-bge-m3', {texts})`（`ai-service.js:1941`）→ `embed` cap | 前端 siliconflow Key ✅ | ❌展示即不可用。`xtRunCapability` 未导出、AI 页也无向量功能按钮 → **无任何调用入口**。 |

### 2.6 结果重排（types: `rerank`）—— ❌

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `sf-bge-reranker` | `ai-config.js:842-853`；分区 `ai-page.js:1718` | 同上，`xtRunCapability` → `rerank` cap | 前端 siliconflow Key ✅ | ❌展示即不可用（无调用入口）。 |

### 2.7 视频生成（types: `video`）—— ❌

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `ark-seedance-1-0-pro` / `-pro-fast` / `-1-5-pro` / `-1-0-lite-t2v` / `-1-0-lite-i2v` | `ai-config.js:468-527`；分区「视频生成」`ai-page.js:1721` | 见 §2.0 第 6 条：`xtCallCapability` 不跑 `cap.run`；且 `xtRunCapability` 未导出 | 前端 `ark` 硬编码 Key ✅；**服务端无 arkvideo** | ❌展示即不可用（多点断裂）：①无调用入口；②即便接通也只创建任务不轮询，拿不到 MP4；③无服务端额度/中转（`ai.py` 无视频端点）。 |
| `ark-seedance-2-0` / `2-0-fast` / `2-0-mini` / `2-5` | **仅** `model_registry.json:35-38` | — | — | 未展示（前端 builtinModels 无），不构成「展示不可用」，但登记表/前端不一致 → 隐患。 |

### 2.8 3D 生成（types: `3d`）—— ❌

| 模型 | 展示位置 | 调用链路 | Key | 判定 |
|---|---|---|---|---|
| `ark-seed3d-2-0` / `ark-hyper3d-gen2` / `ark-hitem3d-2-0` | `ai-config.js:529-563`；分区「3D 生成」`ai-page.js:1722` | 同视频：`xtCallCapability` 不跑 `cap.run`；`xtRunCapability` 未导出 | 前端 `ark` 硬编码 Key ✅；服务端无 ark3d | ❌展示即不可用（同视频三条断裂） |

### 2.9 汇总计数

- **❌ 展示即不可用**：语音识别 5 + 向量 3 + 重排 1 + 视频 5 + 3D 3 = **17 个模型条目**（若含仅在 registry 的 4 个 seedance-2.x = 21）。
- **⚠️ 有入口但依赖外部条件**：生图 3 + Gemini 2 + OpenRouter 3 + SiliconFlow 视觉/翻译（sf-hunyuan-mt-7b, sf-paddleocr-vl-1.5）= **约 10 个**（依赖前端硬编码 Key + 第三方 CORS +（海外）自备网络）。
- **✅ 真可用（链路+Key）**：ark 文本系(15) + zhipu(3) + qianfan(2) + ark 视觉（registry）等，以文本对话为主。

---

## 3. 假功能清单（文件:行号 + 证据 + 分级）

> 说明：本项**未发现**「即将上线/敬请期待/开发中/功能开发中」类纯 UI 占位按钮（全树 `Grep` 仅命中 `ai-settings.js` 的退役角标「即将下线」文案，属**真实状态标注**，非假功能）。以下为「机制性假功能」——有 UI 展示但无真实可用链路。

**E1【严重·链路断】能力直连调用器 `xtRunCapability` 未导出**
- 证据：`ai-service.js:1941` 定义 `async function xtRunCapability(...)`；导出对象 `ai-service.js:3218-3238`（`var AI_SERVICE = {...}`）**未列出 `xtRunCapability`**。
- 消费方：`ai-page.js:901-909 capRunner()` 依次找 `window.AI_SERVICE.xtRunCapability`、`window.xtRunCapability`，均不存在 → 恒返回 `null`。
- 后果：`ai-page.js:924` 的 ASR 直连链路永远不生效。
- 判定：❌ 严重。这是语音/向量/重排/视频/3D **五类能力全部失效的根因之一**。

**E2【严重·链路断】视频/3D 的异步 `cap.run` 从未被调用**
- 证据：`ai-service.js:1748 xtCallCapability` 全程无 `cap.async` / `cap.run` 判断，仅 `cap.build`+`cap.parse`。
- 对照：`ai-cap-video.js:176 run()`、`ai-cap-3d.js:154 run()` 才是「创建→轮询→取结果」的完整流程。
- 后果：即便 E1 修好，视频/3D 也只能拿到 `{taskId}`，**永远拿不到 MP4/GLB**。
- 判定：❌ 严重。

**E3【严重·无Key/无端点】语音/向量/重排/视频/3D 无服务端 Key、无服务端端点**
- 证据：`server/.env` 无 `SILICONFLOW_API_KEY`（`config.py:78-83` 定义了 provider 但未配 key）；`server/routers/ai.py` 仅 `/chat`（`ai.py:171`），无 image/video/3d/audio/embed/rerank 端点；`server/routers/ai.py:179` 遇未配密钥直接 400。
- 后果：这些能力的"可用"完全押注在**浏览器直连第三方 + 前端硬编码 Key + 第三方 CORS 放行**上，服务端不兜底、不计量。
- 判定：❌ 严重（架构层）。

**E4【严重·无入口】向量/重排/视频/3D 在 UI 无生成入口**
- 证据：AI 页 `sendMessage`（`ai-page.js:1222`）恒走 `askAI`→`callAI(funcType)`；`callAI` 仅对 `imagegen` 有特判（`ai-service.js:2767`），**无 video/3d/embed/rerank 特判**；分区表 `ai-page.js:1721-1722` 仅"占位注释"（`ai-page.js:1719-1720` 原文：「先占位…届时只需在 ai-config.js 给模型写 types」）。
- 后果：即便用户在模型列表选中视频/3D 模型并发送，也会被 `callAI`→`buildChain` 当作文本链处理（选中模型置链首 `ai-service.js:732-747`）→ `requestModel` 把它发到 chat/completions → 报错/胡言。
- 判定：❌ 严重。

**E5【中·文案误导】生图模型说明「调用链路待评估」与 FUNC_TYPES 注释「实测全部 200 出图」矛盾**
- 证据：`ai-page.js:104-105`（"调用链路待评估"）vs `ai-config.js:998`（"两模型直连实测全部 200 出图"）。
- 判定：⚠️ 中。展示文案未随"已实测"更新，误导用户以为不可用；或反之高估。需统一。

**E6【中·状态盲区】视频/3D `probeNoAuto=true` → 健康状态可能"从未检测"却被当作可见**
- 证据：`ai-cap-video.js:284 CAP.probeNoAuto = true`；`ai-cap-3d.js:267` 同；`ai-service.js:3112-3118` 批量扫描遇 `probeNoAuto` 直接 `skipped:true`；消费方 `ai-page.js:312`/`ai-settings.js:1573` 规定"无 health 记录 → 视为可见"。
- 后果：视频/3D 模型**既不参与"检测全部"批量，也从未有单次检测**（无入口）→ health 无记录 → **默认显示为可用**，但实际不可用。
- 判定：⚠️ 中（且是用户点名要重点排查的对象，**确认为「默认显示可用」**）。

**E7【中·占位分区】模型列表的分区「视频生成 / 3D 生成」在 `ai-page.js:1719-1722` 仍是"占位"语义注释**
- 现状：因 `ai-config.js` 已补 `types:['video']/['3d']` 模型，**分区实际会渲染出标题与模型行**（`ai-page.js:1764-1767` 有模型即渲染）——注释说的"空区不渲染"已不再成立，注释过期。
- 判定：⚠️ 中（注释与实况不符；且渲染出的模型不可用 → 落入 E3/E4）。

**E8【提示·非假功能】** `ai-settings.js:1349-1358` 的「即将下线」角标 —— 属**真实退役状态标注**，非假功能，**不计入违规**。`ai-settings.js:782/976` 的「待检测」同理（真实状态）。

---

## 4. 双端可用性分析（Web 通 / APK 风险清单）

### 4.0 端点来源
- `api.js:13`：`window.API_BASE = STUDY_API_BASE ?? (http/https ? '' : 'http://110.42.134.62:8000')`。
- `config.js:21,29`：`SERVER='http://110.42.134.62:8000'`；`window.STUDY_API_BASE = isWeb() ? '' : SERVER`。
- 即：**Web 端 = 同源相对路径（''）**；**APK 端 = `http://110.42.134.62:8000`（明文 HTTP）**。
- 文本对话走 `relayChat`（`ai-service.js:1166`）→ `API_BASE + /api/ai/chat`；`ai-cap-video.js:55 reportUsage` 也走 `API_BASE + /api/ai/usage/consume`。

### 4.1 **Web 通但 APK 大概率不通**的能力清单（用户点名验收点）

| 能力 | Web 端 | APK 端风险 | 依据 |
|---|---|---|---|
| **文本对话（中转）** | ✅ 同源 `/api/ai/chat` | ✅ 走 `http://110.42.134.62:8000/api/ai/chat`（服务端已开可选登录，`ai.py:173`；跨域由 FastAPI CORS 中间件承担） | 服务端可达性取决于 8000 端口是否对外 + CORS 是否放行 APK WebView origin |
| **生图（直连方舟/硅基）** | ⚠️ 依赖浏览器直连第三方 + 前端硬编码 Key，受**第三方 CORS**约束 | ❌ **高风险**：APK WebView 直连 `ark.cn-beijing.volces.com` / `api.siliconflow.cn`，**不继承电脑代理**；若第三方未开放 CORS 或 WebView 限制，直接失败 | `ai-config.js:39-64` 直连端点；`ai-service.js:1453 proxyWrapUrl` 仅对 `needProxy` 平台生效，方舟/硅基非 needProxy → **不走中转** |
| **语音识别（SiliconFlow）** | ⚠️ 同上（且链路本身已断 E1） | ❌ 高风险（同上 + 链路已断） | `ai-cap-audio.js:24 defaultUrl` 直连 |
| **视频 / 3D（方舟 tasks）** | ❌ 链路已断 | ❌ 高风险 | 见 E2/E3/E4 |
| **Gemini / OpenRouter** | ❌ 需自备网络 | ❌ 更不可用（WebView 无代理） | `ai-config.js:44-73 needProxy/needVPN` |
| **图片预览（生图结果 S3 预签名 URL）** | ⚠️ 有本地落库兜底（`ai-page.js:512 persistGeneratedImages`，1 小时过期前转 Blob） | ⚠️ 依赖落库时机 | `ai-cap-image.js:8` X-Amz-Expires=3600 |

### 4.2 视频/3D 健康状态盲区（用户点名）
- **状态怎么来的**：视频/3D 模型**只能通过单模型检测**才有 health 记录，但 AI 页/设置页**没有单模型检测入口指向它们**（视频/3D 不在任何检测按钮的模型集里；设置页"检测全部"因 `probeNoAuto` 会 `skipped`）。
- **会不会默认显示为可用**：**会**。`ai-page.js:312` 与 `ai-settings.js:1573` 的语义铁律是"无 health 记录 → 可见"；视频/3D 永远无记录 → **恒显示为可用**，但实际不可用。→ 这正是「展示即不可用」的典型。

### 4.3 结论
APK 端（明文 HTTP WebView，不继承代理）下，**所有浏览器直连第三方的能力（生图/语音/向量/重排/视频/3D/Gemini/OpenRouter）都存在 CORS/网络失败风险**；只有走服务端中转的文本对话相对可靠。**用户点名的"装到手机上也要真能用"，当前仅文本对话满足；生图有风险；视频/3D/语音/向量/重排不满足。**

---

## 5. 需用户提供或人工实测才能确认的清单

> 以下**我无法从代码静态确认**，需真实 Key/环境/人工实测。**本人未做过任何实测，此处不编造结果。**

1. **生图是否真出图**（`ark-seedream-4-*` / `sf-kolors`）：需真实调用一次 `images/generations`，确认（a）方舟/硅基是否放行**浏览器 CORS**；（b）`arkimage` 前端硬编码 Key 与 `server/.env ARK_API_KEY` 是否同一有效 Key；（c）额度是否足够。→ **需用户授权实测或提供 Key**。
2. **语音识别是否真转文字**：需先修 E1（导出 `xtRunCapability`），再真实上传音频调用 SiliconFlow `audio/transcriptions`。→ **需先修复再实测**。
3. **视频/3D 是否真出片/出模型**：需先修 E2（调用层支持 `cap.run` 异步轮询）+ 开通方舟 video/3D 模型，再实测（**单次约 10 万 / 3 万 tokens，会真实消耗额度，需用户明确授权**）。
4. **APK 端第三方直连可达性**：需在真实 APK WebView 环境实测各能力端点（是否 CORS/网络失败）。→ **需用户提供 APK 安装包或真机环境**。
5. **`server/.env` 是否为生产 Key**：当前 `.env` 的 `DEEPSEEK/QWEN/KIMI/OPENAI` 等 key 值**为空**（仅 `ZHIPU/ARK/QIANFAN` 有值），文本对话仅这三家有服务端兜底。→ **需用户确认生产 Key 配置**。
6. **`ark-embedding-vision`（`model_registry.json:42`）归属**：它登记为 `provider:ark`、走 `ark` provider（chat/completions），但它是 embedding 类模型，**打 chat/completions 是否 200 需实测**；且它未出现在前端 builtinModels（未展示）。

---

## 6. 修复建议（按优先级，**本轮不执行**）

> 以下仅为建议，**等 team-lead 确认后再动手**。所有改动限定在可写树 `D:\下载的文件\学习工作台`，**不碰 `server/.env` 密钥值**。

**P0（阻断级，"展示即不可用"根因）**
1. **导出能力直连调用器**：把 `xtRunCapability` 加入 `AI_SERVICE` 导出（`ai-service.js:3218-3238`），使 `ai-page.js:901 capRunner()` 生效 → 至少让 ASR 直连链路可用。
2. **调用层支持异步能力**：在 `xtCallCapability`（`ai-service.js:1748`）增加 `if (cap.async && typeof cap.run === 'function') return cap.run({...}, onProgress)` 分支，并在 `xtRunCapability` 透传 `onProgress` → 让视频/3D 能"创建+轮询"。
3. **补 UI 入口或"隐藏未接通能力"二选一（需 team-lead 决策）**：
   - 方案 A（推荐，最贴合"展示即可用"）：**未接通的能力（语音/向量/重排/视频/3D）暂从模型列表隐藏**，直到链路端到端打通；或
   - 方案 B：为视频/3D 增补生成入口（时长/分辨率/首帧图上传 + 轮询进度），为向量/重排补功能按钮。
4. **服务端补齐或明确"前端直连"策略**：
   - 若坚持前端直连：必须验证第三方 CORS 对 Web 与 APK 均放行（否则 APK 必挂），且把前端硬编码 Key 风险与额度口径说清；
   - 若走服务端：为 image/audio/embed/rerank/video/3d 增加 `/api/ai/*` 中转端点 + `.env` 配 `SILICONFLOW_API_KEY` + arkvideo/ark3d 端点。

**P1（可用性与一致性）**
5. **统一生图文案**：修正 `ai-page.js:104-105` 的"调用链路待评估"（与 `ai-config.js:998` 实测结论对齐）。
6. **健康状态盲区**：为视频/3D 增加**手动单模型检测**入口（复用已实现且标注 `probeNoAuto` 的 `cap.probe`，手动触发不进批量），或在无 health 记录时于 UI 标注"未检测"而非默认"可用"。
7. **登记表一致性**：`model_registry.json` 的 `ark-seedance-2-0/2-0-fast/2-0-mini/2-5`、`ark-embedding-vision` 与前端 builtinModels 对齐（补前端或从登记表移除），避免"选了跑同一个模型/查不到"。
8. **前端硬编码 Key 治理**（安全）：`ai-config.js:20-74` 内置了真实 Key（zhipu/qianfan/ark/openrouter/siliconflow/gemini），与 `server/.env` 双写，存在泄露与不一致风险——建议移交服务端或加解密方案。

**P2（注释/文档）**
9. 更新 `ai-page.js:1719-1720` 已过期的"占位"注释（分区已实际渲染）。

---

## 附：审计方法与局限
- 方法：`Read` 逐文件核对 + `Grep` 精确定位（`已含行号`）+ `Glob` 找文件；服务端仅核 `config.py`/`ai.py`/`model_registry.json`/`model_quota.json` 与 `.env` 的 **key 名**（未复制任何密钥值到本报告）。排除 `备份/`、`*.bak*`、`node_modules`、`.git`。
- 局限：**未运行、未调用任何 API**。所有"✅真可用"均指"代码链路完整 + Key 存在"，**非实测**；需实测项见 §5。
