# 增量 PRD・AI 模型设置整改（真实能力分类 / 可用性映射 / 能力接线 / 用量统计 / 检测更新）

> 类型：**增量改造 PRD**（仅描述本次变更，不重写全量 PRD，不做竞品分析）
> 触发：硅基流动（SiliconFlow）部分模型检测失败并报 **HTTP 400**，用户下达 8 项优化需求（2026-09-18）
> 编制：许清楚（产品经理）
> 落盘：`deliverables/software-company/ai-models-incremental-PRD-20260918.md`
> 唯一可写代码树：`D:\下载的文件\学习工作台`（⛔ 不触碰 `C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-*`）
> 状态：待架构师任务分解・本文**不含代码改动**，仅描述「要做什么 / 怎么算做完」

---

## 0. 本次变更一句话摘要 + 与旧 PRD 的关系

**一句话**：让「模型设置」说真话、让能力真能用 —— 按模型**真实能力**重建功能分类与检测探针，检测不可用的模型自动从 AI 页下拉隐藏（恢复后自动回归），把用量统计放上「关于」页顶端并与后端账本打通，把「检测更新」从必然失败修到可用。

**与旧 PRD 的关系**

| 关系 | 说明 |
| --- | --- |
| **不重写** | 本文件是增量补丁。全量产品定义、模型池、页面结构以既有 PRD 与 `assets/ai-config.js` 为准 |
| **修正** | 修正 R72-15「内置分类收敛为 3 类」与 R86「audio/embedding/rerank 归 general」两处**权宜设计**（`ai-settings.js` 注释已自认权宜） |
| **补做** | 补做 v2.5 更新说明中已宣称但实际未接线（`ai-cap-video/3d/translate` 零页面引用）的视频 / 3D / 翻译能力 |
| **承接** | 承接批次三 PRD 的「可信优先」原则：宁可显示「待检测 / 不可用」，也不编造可用 |

**根因定论（本次所有需求的共同起点）**

| # | 事实 | 证据 |
| --- | --- | --- |
| R1 | 健康检查对所有非生图模型统一发**文本 chat 探测**（`requestModel(ping, [{role:'user',content:'hi'}])` 打 `chat/completions`） | `assets/ai-service.js:3027-3112`（探测主体在 `3099-3110`） |
| R2 | 仅有**生图**有专用探测分支（走 `images/generations`） | `ai-service.js:3068`；超时常量 `:1324 IMAGE_TIMEOUT_HEALTH=60000` |
| R3 | **语音识别 / 向量嵌入 / 结果重排**无专用分支 → 打 `chat/completions` 必然 **HTTP 400** | 硅基流动 12 模型里 5 ASR + 3 embedding + 1 rerank，正是「部分模型检测失败」的来源 |
| R4 | 分类只有 3 类，且把 audio/embedding/rerank 全塞进 `general` | `ai-settings.js:96-102`(`BUILTIN_CATS`) / `:89-94`(`CAT_OF_TYPE`) |
| R5 | 视频 / 3D / 翻译能力对用户**完全不可用**：`ai-cap-video/3d/translate.js` 被 **0 个页面**引用；`XT_KIND_BY_TYPE` / `XT_NON_CHAT_TYPES` / `XT_KIND_LIST` 均未登记 video/3d/translate | `ai-service.js:1551-1562`；对照其余 cap 各被 37 页引用 |
| R6 | 用量统计 UI **只读本地账本**，从不请求后端 `/api/ai/usage` | `assets/xt-aiusage.js:30 USAGE_KEY="xt_ai_usage_v1"`、`:62 store()` 读 `window.XT_AI_USAGE`；全文无 `fetch` |
| R7 | 版本号三处不一致且 APK 不存在 | 磁盘 APK 内部 **1.22** / `android/AndroidManifest.xml` **1.23(vc24)** / `server/routers/version.json` **1.24(vc25)**；`星途-1.24.apk` 全盘 0 命中，`web/static/apk/` 目录不存在 |

---

## 1. 产品目标与范围

### 1.1 产品目标（3 条，正交）

1. **诚实（P0）**：模型检测结果必须反映模型**真实能力**——是什么能力就用什么端点探它。禁止把「用错接口导致的 400」呈现为「模型不可用」。检测不可用的模型不进入 AI 页可选项；恢复可用后自动回归，全程无需用户手工清理。
2. **能用（P0）**：设置页里能看到的能力，调用链必须真的通——浏览器与 APK 两条路径都验证过。已宣称但未接线的（视频 / 3D / 翻译）要么补齐接线，要么从分类中显式标注「未接入」，不得沉默地假装支持。
3. **可查（P1）**：用量与版本这两件"运维事实"在「关于」页顶端一眼可见，且与后端账本/版本真源一致；「检测更新」点了要有真实结果。

### 1.2 In Scope（本次做）

- `assets/ai-settings.js`：分类体系重建、排序弹窗新增「按功能分类排序」、映射规则改造、模型说明内容、关于页布局
- `assets/ai-service.js`：健康检查按能力分派（asr / embed / rerank 专用探针）、非对话能力种类登记补齐
- `assets/ai-cap-*.js`：各能力新增轻量 `probe()`；video / 3d / translate 接入
- `assets/ai-config.js`：`FUNC_TYPES` 补槽位、`builtinModels` 补 `type`/`cap` 语义、`modelDetails` 文案补全
- `ai-settings.html` + 其余页面：新增 cap 脚本引用、关于页 DOM 顺序调整
- `server/routers/ai.py` / `version.json`、`server/quota_ledger.py`、`android/AndroidManifest.xml`、`tools/`（版本统一脚本）
- 38 个页面的脚本引用对齐（视频 / 3D / 翻译 cap 从 0 引用补到与其它 cap 同集）

### 1.3 Out of Scope（本次不做）

- 不新增模型平台接入、不改各平台 API Key 管理方式
- 不重写 `ai-service.js` 的请求层与三模式链（快速 / 均衡 / 极致）
- 不做服务端代理转发海外平台（仅作为风险与后续建议记录，见 §6.1）
- 不改视觉风格（沿用现有 `xt-set-*` 类名与 `ai-*.css` 设计语言），不引入新前端框架 / 新 CDN
- 不删除任何现有功能；不改 `vision` 这个 key 的名字

---

## 2. 用户故事

**需求 1・功能分类重建**

- 作为**配置硅基流动的普通用户**，我希望「功能分类」页把「语音识别 / 向量嵌入 / 结果重排 / 图像生成」各自单列一卡，而不是统统挤在「文本」里，以便我知道每个模型到底能干什么、该配到哪条链上。
- 作为**给自己的私有平台加了嵌入模型的用户**，我希望新建的自定义分类与内置分类同一套交互，以便我不需要学两套逻辑。
- 作为**已经配过旧分类的老用户**，我希望升级后我的优先级链不被打乱、也不出现重复项，以便我不必重新配一遍。

**需求 2・按功能分类排序**

- 作为**有 40+ 模型的用户**，我希望在排序弹窗里用一个下拉「按功能分类排序」，选一类就把该类模型排到前面，以便 AI 页下拉里我常用的能力始终在顶部。

**需求 3・仅映射可用模型**

- 作为**点了「映射」的用户**，我希望只有**检测通过**的模型被映射进 AI 页模型选择列表，以便下拉里不出现点了就报错的坏模型。

**需求 4・自动隐藏 / 自动恢复**

- 作为**在弱网下用过一半模型变红的用户**，我希望 AI 页下拉自动隐藏不可用模型，等我重新检测通过后它们自动回来，以便我不用手动停用再手动启用。
- 作为**想排查问题的用户**，我希望有一个「显示不可用模型」开关，以便隐藏不是"删除"。

**需求 5・能力真实可用**

- 作为**在手机上用 APK 的学生**，我希望语音识别、生图、视觉识图在手机里和电脑浏览器里一样能用，以便我上课录音直接转文字、拍照直接问题。
- 作为**点了「翻译」的用户**，我希望它真的给出译文，而不是提示"该能力暂不可用"。

**需求 6・模型说明优化**

- 作为**选型中的用户**，我希望每个模型的说明写清「能力分类 / 端点类型 / 计费口径 / 适用场景」，以便我 10 秒内判断该不该启用。

**需求 7・用量统计置顶 + 前后端联通**

- 作为**关心额度的用户**，我希望打开「关于」页第一眼就看到今日 / 累计用量，并按调用次数降序排，以便我立刻知道还剩多少。
- 作为**换设备登录的用户**，我希望看到服务端累计口径的用量，而不只是本机浏览器的记录。

**需求 8・检测更新可用**

- 作为**用户**，我希望点「检测更新」能真实返回结果（有新版 / 已是最新 / 网络异常三种之一），以便我相信这个按钮。

---

## 3. 需求池（逐条对应 8 项需求）

> 优先级口径：**P0 = 必修（不做则本次整改不成立）**；**P1 = 应做（本次迭代内完成）**；**P2 = 可做（可下标下一批）**
> 每条给「验收标准」= 可判定、可复现，附「怎么测」。

### P0-1（对应需求 1）功能分类页按真实能力重建 —— **P0**

**优先级理由**：这是用户「部分模型检测失败」这一体感问题的**展示面根因**。分类不重建，需求 2 的下拉没有稳定取值域，需求 3/4 的"可用"也没有按能力分组的落点。属结构性改动，必须先行。

**动作**

1. 重建 `BUILTIN_CATS` 为 **10 个能力分类**（详表见 §4.1），key **全部取 `AI_CONFIG.FUNC_TYPES` 的合法槽位**，做到「UI 上能配的链 = 路由上能用的槽位」一一对齐。
2. 重写 `CAT_OF_TYPE` 为 **14 个 type 键的完整映射**（含新增 `video` / `three_d`），不再出现「归 general 只为进候选池」的权宜分支。
3. 空分类不渲染：某分类**既无候选模型、又无用户配置链**时，收进页面底部「更多分类（暂无可选模型）」折叠区，避免出现空壳卡片。
4. 自定义分类（`settings.categories`，key `custom_*`）行为不变，与内置分类同卡同交互。
5. 存量数据幂等迁移（见 §5.2），迁移只在 `catSchema < 2` 时执行一次。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| A1 | 「功能分类」页出现 ≥8 张分类卡，其中「语音识别」「向量嵌入」「结果重排」「图像生成」**各自独立成卡** | jsdom 载入 `ai-settings.html` → 切 `func` Tab → 断言 `#setFuncList [data-cat]` 含 `audio/embedding/rerank/imagegen` 四个 key |
| A2 | 硅基流动 12 模型全部出现在**正确分类**的候选池里：5 ASR→`audio`、3 embedding→`embedding`、1 rerank→`rerank`、Kolors→`imagegen`、PaddleOCR-VL→`vision`、Hunyuan-MT→`translate` | 逐模型断言 `modelsOfCategory(catKey)` 包含该 id |
| A3 | 迁移幂等：把同一份 `ai_model_settings` 连续初始化 3 次，`catModels` 各键数组长度与顺序不变、无重复 id | 单测：`localStorage` 预置旧结构 → 载入 → 快照 → 重载 → 断言两次快照**完全相等** |
| A4 | 老用户链不丢：迁移前 `catModels.general = ["glm-4.7","ark-v4-flash"]`，迁移后仍为这两项且顺序不变 | 同上，断言键值相等 |
| A5 | `vision` 的 key 仍为字面量 `vision`（label 可为「视觉识图」） | 源码断言：`ai-settings.js` 中 `BUILTIN_CATS` 含 `{key:'vision'` |
| A6 | 无回归：`ai-service.js:610` 的 funcType 白名单校验对所有既有槽位仍通过 | 跑现有 `tools/qa/` 中 AI 相关检查脚本 |

---

### P0-2（对应需求 3）模型映射仅使用检测可用的模型 —— **P0**

**优先级理由**：这是需求 4 的前置。当前 `mapToAiList()` 的"可用"定义是**未停用**（`availableIds()` = 没被 disabled），与"检测通过"无关 —— 所以坏模型照样进下拉并报错。

**动作**

1. 新增 `usableIds()`：`healthOk(id) === true` 的模型 id 集合。`availableIds()` **保留原语义**（未停用）供其它调用点使用，不删不换名。
2. `mapToAiList()` 改造：
   - 只对 `usableIds()` 的模型清 `disabled` 并写 `order` 前段；
   - **未检测**（`health` 无记录）与**检测失败**的模型**不写 order 前段、不清 disabled**，仅按原相对顺序保留在尾部；
   - `overrides[id].name` 的写入范围由"全部模型"收窄为 `usableIds()`，避免给不可用模型写脏 `overrides`；
   - 只改 `name` 子字段，**严禁整体覆盖** `overrides[id]`（否则丢 apiKey）。
3. 映射完成后 toast 必须给出可核对的数字：`已映射 N 个可用模型（跳过 M 个未通过检测）`。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| B1 | 预置 5 模型，仅 2 个 `health.ok===true`；执行映射后 `disabled` 中只剩那 2 个被清除，其余 3 个仍为 disabled 或不存在 | jsdom 调用 `mapToAiList()` → 读 `localStorage.ai_model_settings` 断言 |
| B2 | 映射后 toast 数字与 B1 一致（N=2, M=3） | 断言 toast 文案含 `2` 与 `3` |
| B3 | 映射不破坏密钥：预置 `overrides["glm-4.7"]={name:'x',apiKey:'sk-test'}`，映射后 `apiKey` 仍在 | 断言 `overrides["glm-4.7"].apiKey === 'sk-test'` |
| B4 | 0 个可用模型时映射不报错，给出「当前没有检测通过的模型，请先批量检测」 | 断言 toast 文案 + 无异常抛出 |

---

### P0-3（对应需求 4）AI 页下拉自动隐藏不可用模型、恢复后自动回归 —— **P0**

**优先级理由**：与 P0-2 是同一件事的两半（写入侧 + 渲染侧）。用户明确要求「自动」，手工停用/启用不算完成。

**关键设计裁定**：**隐藏是渲染期过滤，不写持久化状态。**
即：不改 `disabled`、不删模型、不写"隐藏名单"。AI 页模型下拉每次构建时按 `health` 现况过滤。由此「恢复可用后自动重新显示」**天然成立**（下次渲染自然回来），且无脏数据、完全可逆。这是本需求唯一正确的实现口径。

**动作**

1. 新增按能力/健康过滤的池访问器（建议落在 `ai-service.js` 的模型池导出面，或 `ai-settings.js` 侧导出 `XT_MODEL_VISIBILITY`）：`visibleModels()` = 全部模型中剔除 `health[id].ok === false` 的项。
2. **未检测（无 `health` 记录）视为可见** —— 否则 App 首次安装后下拉为空，比报错更糟。
3. 隐藏开关：`ai_model_settings.hideUnavailable`（默认 `true`），在排序弹窗内提供勾选项「隐藏检测不可用的模型」，关掉即全部展示。
4. AI 页下拉**每次打开时重新计算**列表（不得缓存 `disabled`/`health` 快照）。
5. 健康检查结果落盘后广播事件 `document.dispatchEvent(new CustomEvent('xt:health-changed'))`；AI 页下拉若正开启则监听并重算。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| C1 | 模型 A `health.ok=false` 时，AI 页下拉不含 A；把 A 的 `health.ok` 改为 `true` 后**不刷新页面**、重开下拉，A 出现 | jsdom：改 `localStorage` → 派发 `xt:health-changed` → 断言下拉项 |
| C2 | 无 `health` 记录的模型**可见** | 清空 `health` 后断言下拉含全部模型 |
| C3 | 关闭「隐藏检测不可用的模型」后，不可用模型重新出现 | 断言开关切换前后的下拉项数差 |
| C4 | 隐藏**不写** `disabled`：过滤前后 `localStorage.ai_model_settings.disabled` 完全不变 | 断言字符串相等 |
| C5 | 隐藏只在展示层生效：直接调用不可用模型 id 仍能发出请求（不被硬拦截），错误照常回传 | 断言调用层不因隐藏而拒绝 |

---

### P0-4（对应需求 5-a）健康检查按能力分派：修掉 HTTP 400 误报 —— **P0**

**优先级理由**：**用户报障的原始现象**。不修这条，需求 1/3/4 全都是在错误数据上做文章。

**动作**

1. 新增统一探针接口：能力模块（`ai-cap-*.js`）可选实现 `probe(ctx) -> Promise<{ok, err, detail}>`，与现有 `build/parse` 平级，属注册表扩展（`XT_AI_CAPS.register` 无需改签名）。
2. `aiHealthCheckImpl(modelId, cfgOverride)` 在 `isImageGenModel` 分支**之后**、文本 chat 兜底**之前**插入能力分派：

```text
aiHealthCheckImpl(modelId, cfgOverride):
  mc   = ov ? 临时配置 : applyOverrides(raw)
  eff  = resolveEffectiveEndpointKey(mc)
  if !eff.apiUrl  -> {ok:false, err:'no_endpoint'}
  if !eff.apiKey  -> {ok:false, err:'no_key'}

  cap = xtCaps().byType(primaryTypeOf(mc))          # 严格按 types 取值
  if cap && typeof cap.probe === 'function':
      r = await cap.probe({modelCfg:mc, provider, timeout: cap.probeTimeout || 60000})
      -> {ok:r.ok, ms:elapsed, err:r.ok?null:(r.err||'empty'), kind:cap.key}
  else if cap && !cap.probe:
      -> {ok:false, ms:0, err:'unsupported_probe', kind:cap.key}   # 新增值域，不误报 http_400
  else:
      -> 现有文本 chat 探测（行为完全不变）

  # 全程：绝不 recordCall / 不计入 10 次/分钟限频（沿用现状）
```

3. 各能力探针的最小成本约定（**探针不得消耗可观的额度**）：

| 能力 | 端点 | 探针载荷 | 判定 | 超时 |
| --- | --- | --- | --- | --- |
| `asr` | `POST /v1/audio/transcriptions` | 内联 base64 的 **0.5s 静音 WAV**（随脚本内联，不依赖网络资源） | HTTP 200 即通过 | 15s |
| `embed` | `POST /v1/embeddings` | `{input:'hi', model}` | 200 且 `data[0].embedding` 为数组 | 10s |
| `rerank` | `POST /v1/rerank` | `{query:'hi', documents:['hi'], top_n:1}` | 200 且 `results` 为数组 | 10s |
| `imagegen` | `POST /v1/images/generations` | 已有实现（最小 prompt） | 已有 | 60s |
| `vision` | chat（多模态） | **沿用现有文本探测**（勿改为传图，避免烧图额度） | 现有 | 5s/15s |
| `video` / `three_d` | 异步任务端点 | **仅提交最小任务拿 taskId 即判连通**，不轮询到完成 | 200 且有 task id | 15s |

4. 值与文案补齐：`err` 值域新增 `unsupported_probe`；`ERR_TEXT`（`ai-settings.js:105-111`）补该键文案，建议「该能力暂不支持自动检测」。`health[id]` 增加 `kind` 字段记录探测所用能力。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| D1 | 硅基流动 12 模型批量检测后，**5 ASR + 3 embedding + 1 rerank 不再出现 `http_400`** | jsdom + mock fetch：按 `url` 返回该端点的正常响应 → 断言 `health[id].ok===true` |
| D2 | 探测 URL 正确：断言 5 个 ASR 模型请求打到 `/v1/audio/transcriptions`、3 个 embedding 打到 `/v1/embeddings`、rerank 打到 `/v1/rerank` | mock fetch 记录调用 URL 列表逐项比对 |
| D3 | ASR 探针确实带 `FormData(file, model)` 且 `Content-Type` 由浏览器自动生成（不含手工 `application/json`） | 断言请求对象无手工 json header |
| D4 | 文本模型行为零回归：`glm-4.7` 仍打 `chat/completions` 且 `maxTokens=1` | 断言请求体 |
| D5 | 探针**不计入限频**：连续检测 20 个模型不触发 10 次/分钟限流拦截 | 断言 `recordCall` 调用次数为 0 |
| D6 | 未实现 probe 的能力返回 `unsupported_probe` 而非 `http_400` | 注入一个无 probe 的假 cap → 断言 err 值 |

---

### P0-5（对应需求 5-b）能力接线补齐：翻译 / 视频 / 3D —— **P0（翻译）/ P2（视频、3D）**

**优先级理由**：翻译有现成模型（`sf-hunyuan-mt-7b` 已带 `translate` 类型）与现成 cap 文件，只差接线，成本低、用户可感 → P0。视频 / 3D **当前无任何 provider 与额度配置**，属"新增平台接入"级工作，本期只做分类槽位与端点契约（P2），并**在 UI 上显式标注"未接入"**。

**动作**

1. **翻译（P0）**：`assets/ai-cap-translate.js` 加入与其它 cap 相同的页面引用集；在 `ai-service.js` 的 `XT_KIND_BY_TYPE` / `XT_NON_CHAT_TYPES`（若适用）/ `XT_KIND_LIST` 登记 `translate`；恢复 `translate` 分类槽位；`ERR_TEXT`/用量口径沿用文本 token 口径。
2. **视频 / 3D（P2）**：`ai-cap-video.js` / `ai-cap-3d.js` 加引用；登记 `video` / `three_d` 类型；分类槽位预留（默认空分类折叠，见 §4.1 规则 3）；**异步契约**：cap 自带「提交 → 轮询」两段式，不得依赖现有同步层 60s 超时。
3. **结果落本地存储（强约束）**：生图返回的 S3 预签名 URL **1 小时失效**，视频 / 3D 结果 URL **24 小时失效**。因此能力层必须在拿到结果后**立即下载并落本地存储**，持久化本地引用；不得只存远端 URL。UI 对"已过期且未落本地"的历史项必须显示「结果已过期」而非破图。
4. **双端验证**：能力清单必须分别为「浏览器」与「APK 内 WebView」各跑一遍真机/真机模拟验证（见 §6.1 对海外平台不可达的风险说明）。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| E1 | `translate` 能力：选中 `sf-hunyuan-mt-7b` 调用翻译，返回非空译文且账本记 `kind:text` | jsdom + mock fetch 200 |
| E2 | 能力脚本引用数对齐：「video / 3d / translate」三者的页面引用数 ≥ 其它 cap（audio/embed/vision）的引用数 | 脚本统计 48 个 HTML 中的 `script src="assets/ai-cap-*.js"` 计数 |
| E3 | 生图/视频结果**已落本地**：断言 localStorage/IndexedDB 中存在本地引用，且远端 URL 失效后仍可展示 | mock：令远端 URL 返回 403 → 断言仍展示 |
| E4 | 异步能力不撞 60s 同步超时：构造需 90s 才完成的任务，调用成功返回 | mock：延迟 90s 完成 → 断言成功 |
| E5 | 视频 / 3D 未接入时 UI 标注「未接入（无可用平台）」而非静默失败 | 断言分类卡文案 |
| E6 | APK 侧：`android/` WebView 内 asr / imagegen / vision 各成功调用一次并留下截图或日志证据 | 真机操作记录（交付物为证据文件路径） |

---

### P0-6（对应需求 8）检测更新真实可用 + 版本号单一真源 —— **P0（前端+版本统一）/ P1（APK 产物）**

**优先级理由**：当前用户点「检测更新」**必然失败**（版本号三处不一致 + APK 文件不存在 + 生产接口 404）。这是纯粹的坏功能，必须修。

**动作**

1. **确立唯一真源**：`server/routers/version.json` 为版本唯一真源。`android/AndroidManifest.xml` 的 `versionName` / `versionCode`、磁盘 APK 文件名、前端展示版本一律由它派生，禁止手改。
2. 扩展 `tools/bump_versions_safe.py` 为三处同步 bump（含 APK 文件名），并在 `tools/qa/` 增加一致性检查脚本（三处不一致即 exit 非 0）。
3. 前端 `assets/xt-update.js`：区分三类结果并可判定 —— **有新版 / 已是最新 / 检测失败（网络或服务不可用）**；失败时给可读原因，不得只显示"检测失败"。保留 `status: ok|starting` 语义。
4. **APK 产物闭环**：明确「谁产出、产出在哪、如何验证」——
   - 产出：构建流程从 `version.json` 读版本号产出 `星途-<version>.apk`；
   - 存放：`web/static/apk/<apkFileName>`（当前目录**不存在**，需创建）；
   - 验证：`version.json` 中的 `apkFileName` 必须对应一个**真实存在且 HTTP 可达、Content-Length > 0** 的文件；用脚本在 CI/交付前校验，缺失即失败。
5. 部署：`GET /api/app/version` 生产返回 404 说明线上未部署 → 需重新部署（**属生产操作，须用户确认**，见 §7-Q1）。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| F1 | 三处版本号一致：`version.json` / `AndroidManifest.xml` / 磁盘 APK 名 = 同一版本 | 运行一致性检查脚本，exit 0 |
| F2 | `GET /api/app/version` 本地返回 200 且 `apkFileName` 指向的文件存在 | `curl` + 文件系统断言 |
| F3 | 点「检测更新」在【有新版】与【已是最新】两种 mock 下分别给出正确文案 | jsdom：mock 该接口两种响应 → 断言文案 |
| F4 | 接口不可达时文案为「检测失败（服务不可达）」而非空白或"检测失败" | mock reject → 断言文案 |
| F5 | 生产环境同一接口返回 200（部署后） | `curl http://110.42.134.62/api/app/version`，依赖 §7-Q1 授权 |

---

### P0-7（对应需求 7）用量统计与后端账本打通 —— **P0**

**优先级理由**：需求原文明确要求「前端与后端均正常联通」。**本次侦察新发现**：`xt-aiusage.js` 完全只读本地账本，**从不请求 `/api/ai/usage`** —— 这不是"接口 401"一个问题，而是**前端根本没有调用**。属功能缺失，非 P1 优化。

**动作**

1. 新增服务端数据源：`XT_AI_USAGE.serverSnapshot()` → `GET /api/ai/usage`（`get_current_user_optional`，免登录）。返回体含 `models`（服务端全局累计）、`used` / `limit` / `date`（本人今日调用数）。
2. **双口径并列展示**，不混算：
   - 「服务端累计」（跨设备、跨用户共享的账号级账本，权威）；
   - 「本机记录」（`xt_ai_usage_v1`，离线可用）；
   - 两栏分别标注数据来源与时间戳，避免用户把两套数字当同一个。
3. 服务端不可达时**降级为本机口径 + 明确提示**，不报错、不空白。
4. 401 / 网络失败与「确实没有用量」必须区分（沿用 P0-6 的三态口径）。
5. 本地账本的上报侧沿用现有 `POST /api/ai/usage/consume`（直连平台后上报），本次不改协议。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| G1 | 前端**确实发起了** `GET /api/ai/usage`（当前完全不发，属新增） | 断言 fetch 调用列表含该 URL |
| G2 | 服务端返回 `models` 有数据时，「服务端累计」区展示该数字 | jsdom + mock 200 → 断言 DOM 文本 |
| G3 | 服务端 200 但全为 0 时展示空态文案，不显示"加载失败" | mock 0 → 断言空态 |
| G4 | 服务端 401 / 网络异常时展示本机口径 + 「服务端数据暂不可用」提示 | mock 401 → 断言 |
| G5 | 双口径数字互不覆盖，各自带来源标注 | 断言 DOM 含两个来源标识 |

---

### P1-1（对应需求 2）排序弹窗新增「按功能分类排序」下拉 —— **P1**

**优先级理由**：依赖 P0-1 的分类体系（要先有稳定分类才有下拉取值域），且不在用户报障主链上，但它直接影响 AI 页下拉的日常体验，应在本次迭代内完成。

**动作**

1. 现有排序弹窗（`ai-settings.html:741-756`，4 个 `data-sort-act` 按钮）新增：
   - 一个 `<select>`「按功能分类排序」（选项 = 全部内置分类 + 自定义分类 + 「全部分类（按分类顺序聚合）」）；
   - 一个 `<select>`「分类内排序」（复用现有：可用性 / 速率 / 默认顺序）。
2. 新排序函数 `sortByCategory(catKey, innerMode)`：把目标分类的模型排到 `order` 最前（分类内按 `innerMode` 排），其余模型按「分类声明顺序」聚合在后方。**不改变** `disabled` 状态，不写 `overrides`。
3. 排序结果必须在弹窗底部「排序预览」区即时反映（现有 `renderSortPreview` 复用）。
4. 记忆上次选择：`ai_model_settings.lastSort = {mode:'category', catKey, innerMode}`。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| H1 | 弹窗内存在 `#setSortCat`、`#setSortCatInner` 两个下拉，选项数 = 内置分类 + 自定义分类 + 1 | jsdom 断言 `options.length` |
| H2 | 选「语音识别」排序后，`order` 前 5 项全部是 `sf-*` ASR 模型 | 断言 `order.slice(0,5)` 属于 audio 分类集合 |
| H3 | 排序不误伤状态：`disabled` 与 `overrides` 排序前后完全不变 | 断言字符串相等 |
| H4 | 预览区顺序与 `order` 一致 | 断言 DOM 项序 = `order` |
| H5 | 分类为空时下拉项禁用并标注「（无可用模型）」，不产生空排序 | 断言 disabled 属性 |

---

### P1-2（对应需求 7）用量统计置于「关于」页顶端 + 排序优化 —— **P1**

**优先级理由**：纯布局与展示排序，价值明确但无阻塞性；与 P0-7 同批交付（同一文件）。

**动作**

1. `#setUsageRoot` 从 `setPanelAbout` 末尾**上移到顶端**（在 `#setAboutList` 之前），即：**用量统计 → 模型统计 → 记忆管理 → 重新检测**。
2. `renderAbout()` 的 `setAboutList` 静态统计块与用量块**视觉主次分明**：用量为一级区块（带标题栏），模型统计降为次级网格。
3. 排序优化：默认 **今日调用次数降序 → 最近调用时间降序 → 模型名升序**；提供切换「按类型 / 按模型 / 按时间」。原有 `renderModels/renderKinds` 排序口径统一走一个 `sortRows`，避免两处规则不一致。
4. 懒渲染保持：仍在切到「关于」Tab 时渲染（不提前拖慢首屏）。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| I1 | DOM 顺序：`#setUsageRoot` 是 `#setPanelAbout` 的**第一个**子元素 | 断言 `panel.firstElementChild.id === 'setUsageRoot'` |
| I2 | 默认排序：3 条记录（2/5/5 次）呈现顺序为 5, 5, 2（同次数按时间降序） | 断言 DOM 文本序 |
| I3 | 排序切换三档均可生效且不改数据 | 断言切换前后账本不变 |
| I4 | 切到「关于」Tab 才渲染（首屏不渲染） | 断言初始 `#setUsageRoot.innerHTML === ''` |

---

### P2（对应需求 6）模型说明内容优化 —— **P2**

**优先级理由**：内容质量优化，不影响功能正确性，可下标下一批。

**动作**

1. 说明卡（`introCardHtml`，`ai-settings.js:1823-1845`）扩展为统一五段式：**一句话定位 → 优势 → 适用场景 → 计费口径 → 端点/能力分类**。
   - 数据源：`modelDetails[id]`（`platform/params/type/stars/speed/advantage/applicable`）+ `overrides[id].desc` + cap 注册表（端点与计费口径：ASR 按秒、embedding/rerank 按条、生图按张、文本按 token）。
   - 补全 `ai-config.js` 中 `modelDetails` 的 `applicable` 缺失项与能力模型（5 ASR + 3 embedding + 1 rerank + 生图）条目文案。
2. 说明页顶部搜索栏旁新增「按功能分类筛选」下拉（与需求 2 同取值域），与关键词搜索叠加生效（AND 关系）。
3. 说明文案**必须与真实能力一致**：已定位的 `type` 与 `cat` 不可混用（`type` 是能力语义供 `XT_AI_CAPS.byType()` 路由，`cat` 是文档分类）。**历史教训**：曾把生图写成 `type:"image"` 导致误路由到视觉链路 —— 本项必须在验收里加一条防回归断言。

**验收标准**

| # | 标准 | 怎么测 |
| --- | --- | --- |
| J1 | 说明卡渲染五段式字段，无「暂无说明」占位（对已收录模型） | jsdom 断言 `.xt-set-intro-line` 数量 ≥ 5 |
| J2 | 能力模型说明含计费口径（如 ASR 卡出现「按秒」） | 断言文案包含关键词 |
| J3 | **防回归**：`ai-config.js` 中不存在 `type:"image"` 的**生图**条目（生图必须为 `type:"imagegen"`） | 源码断言脚本 |
| J4 | 分类筛选下拉与关键词搜索叠加生效 | 选 `audio` + 关键词 `Qwen` → 仅 1 项 |

---

## 4. UI / 交互稿说明

### 4.1 功能分类页（Tab 2）新结构

**设计原则**：一个分类卡片 = 一个 `FUNC_TYPES` 槽位 = 一条优先级链。分类 key 与路由槽位一一对应，杜绝"归 general 只为进候选池"的隐式行为。

**分类表（内置 10 类 + 2 预留槽位）**

| 组 | key | 展示 label | 覆盖 `type` 值 | 端点族 | 现状 |
| --- | --- | --- | --- | --- | --- |
| 文本 | `general` | 文本对话 | `general` | chat | 保留 |
| 文本 | `longtext` | 长文本理解 | `longtext` | chat | 恢复成卡（原并入 general） |
| 文本 | `content` | 内容创作 | `creative`, `interview` | chat | 恢复成卡 |
| 文本 | `reasoning` | 推理与数学 | `reasoning`, `math` | chat | 保留（吸收 math） |
| 文本 | `translate` | 翻译 | `translate` | chat | **恢复**（撤销 R72-15 停用） |
| 视觉 | `vision` | 视觉识图 | `image` | chat(多模态) | 保留，**key 不可改名** |
| 视觉 | `imagegen` | 图像生成 | `imagegen` | images/generations | 新增成卡（原并入 general） |
| 语音 | `audio` | 语音识别 | `audio` | audio/transcriptions | **新增成卡** |
| 检索 | `embedding` | 向量嵌入 | `embedding` | embeddings | **新增成卡** |
| 检索 | `rerank` | 结果重排 | `rerank` | rerank | **新增成卡** |
| 视频 | `video` | 视频生成 | `video` | 异步任务 | **预留**（P2，默认折叠） |
| 3D | `three_d` | 3D 生成 | `three_d` | 异步任务 | **预留**（P2，默认折叠） |

> `three_d` 而非 `3d`：key 会被用作 `data-cat` 属性值与 `hasOwn` 判定，以数字开头在 CSS/属性选择器上需转义，增加无谓风险。展示 label 仍为「3D 生成」。

**渲染规则（伪代码）**

```text
renderFuncTypes():
  cats = allCategories()                       # BUILTIN_CATS(10) + settings.categories(custom)
  visible = [], collapsible = []
  for c in cats:
     pool = modelsOfCategory(c.key)            # 内置按 CAT_OF_TYPE 过滤；自定义 = 全部模型
     chain = chainModelsOf(c.key)
     if pool.length == 0 && chain.length == 0 && c.key in RESERVED_KEYS:
         collapsible.push(c)                   # video / three_d 等 -> 折叠区
     else:
         visible.push(c)

  group visible by FAMILY_OF_CAT:              # 文本 / 视觉 / 语音 / 检索
  render 组标题(组内分类数) + catCardHtml(c) 逐个
  render 折叠区「更多分类（暂无可选模型）」    # 点击展开，不显示空卡

renderNote():
  "内置 <n> 类按模型真实能力划分，key 与功能路由槽位一一对应；
   audio / embedding / rerank 模型已从「文本」迁出。
   「代码」等更多分类可自行新建，新建分类即新的功能路由槽位。"
```

**分类卡片结构（沿用现状视觉，仅补字段）**

```
.xt-set-card[data-cat=<key>]
├─ .xt-set-card-h
│   ├─ .xt-set-card-t      「语音识别」
│   ├─ .xt-set-card-key    「audio」            ← 保留（便于排障）
│   └─ .xt-set-chip        「端点：audio/transcriptions」 ← 新增
├─ .xt-set-card-desc       「该类模型按以下优先级依次尝试」
├─ .xt-chain               优先级链 1..n（上移/下移/移出）
└─ .xt-set-field
    ├─ 「该类模型（点击加入优先级链）」
    └─ .xt-cat-pool        候选池 tag（带健康状态点：正常/失败/待检测）  ← 新增状态点
```

**CAT_OF_TYPE 重写（14 键完整映射，不留隐式兜底）**

```js
var CAT_OF_TYPE = {
  general: 'general', longtext: 'longtext', creative: 'content', interview: 'content',
  math: 'reasoning', reasoning: 'reasoning',
  translate: 'translate',
  image: 'vision', imagegen: 'imagegen',
  audio: 'audio', embedding: 'embedding', rerank: 'rerank',
  video: 'video', three_d: 'three_d'
};
```

**存量迁移（幂等，仅在 `catSchema < 2` 时执行）**

```text
migrateCatSchema():
  s = getSettings()
  if (s.catSchema >= 2) return                        # 幂等闸门
  # 1) 撤销 R72-15 的 translate 清洗：不再删除 catModels.translate / categories.translate
  #    （若历史版本已删，此处不恢复用户数据，仅恢复内置卡；不臆造用户配置）
  # 2) 把「能力归属明确但被塞进 general」的模型迁出
  for each id in s.catModels.general (copy):
     cat = soleCategoryOfModel(id)                    # 仅当 types 全部指向同一非 general 分类时才迁
     if cat && cat !== 'general':
         remove id from s.catModels.general
         s.catModels[cat] = (s.catModels[cat] || []).concat([id]) if 未存在
         # 追加到尾部，绝不改用户已有顺序
  # 3) 去重：所有 catModels[*] 保序去重
  # 4) 写入版本号
  s.catSchema = 2; saveSettings()
```

迁移的**安全边界**：只做「能力归属无歧义」的搬移（一个模型的所有 `types` 都指向同一新分类才搬）；混合类型模型（如 `["general","translate"]`）**留在原处**，避免误判用户意图。迁移只搬不删、只追加不改序、可重复执行结果相同。

### 4.2 排序弹窗（`#setSortModal`）改造

```
.xt-modal-box.xt-sort-box
├─ .xt-modal-title「恢复默认 / 排序」
├─ .xt-sort-actions                      ← 现有 4 按钮，位置不动
│   [有效排序] [速率排序] [映射] [恢复默认]
├─ 【新增】.xt-sort-cat-row
│   ├─ label「按功能分类排序」
│   ├─ <select id="setSortCat">
│   │      <option value="">（不按分类）</option>
│   │      <option value="audio">语音识别（5）</option>
│   │      <option value="embedding">向量嵌入（3）</option>
│   │      ... 内置 10 类 + 自定义分类 ...
│   │      <option value="__all__">全部分类（按分类顺序聚合）</option>
│   └─ <select id="setSortCatInner">  分类内排序：可用性 / 速率 / 默认顺序
├─ 【新增】.xt-sort-switch  ☑ 隐藏检测不可用的模型（hideUnavailable）  ← 需求 4 的开关
├─ .xt-sort-preview-label「排序预览（只读）」
├─ .xt-sort-preview #setSortPreview     ← 复用，每行补「分类」tag
└─ .xt-modal-btns [关闭]
```

行为要点：
- 下拉变更**立即应用**（即时预览，无需点确认），与现有 4 按钮的即时风格一致；
- 「按功能分类排序」与 4 个按钮**互斥但可叠加**：选分类后再点「速率排序」= 分类优先、类内按速率（等价 `innerMode='speed'`）；
- 预览行新增分类 tag，让用户看到"为什么它排在这"。

### 4.3 关于页（Tab 5）新布局

```
#setPanelAbout
├─ 【新增·置顶】#setUsageRoot                     ← 需求 7 顶端
│    ├─ 区块头「模型用量统计」 + 数据源徽标（服务端累计 / 本机记录）
│    ├─ 概览数字（今日调用 / 累计调用 / 成功 / 失败）
│    ├─ 按类型汇总（文本 / 视觉 / 生图 / 语音 / 嵌入 / 重排 / 翻译）
│    ├─ 按模型列表  ← 排序：今日次数↓ → 最近调用↓ → 名称↑；可切「按类型/按模型/按时间」
│    ├─ 明细（时间倒序，分页或折叠）
│    └─ 导出 JSON + 复制
├─ #setAboutList                                  ← 现有，降为次级
│    ├─ .xt-about-grid（模型总数 / 已启用 / 自定义模型 / 健康检查不可用）
│    └─ .xt-about-ver（数据版本 + 说明文案）
├─ .xt-about-block「记忆管理」（现有）
└─ .xt-set-toolbar「重新检测全部模型」（现有）
```

### 4.4 健康检查分派（本次核心逻辑）

```mermaid
flowchart TD
  A[aiHealthCheckImpl(modelId, cfgOverride)] --> B{端点/密钥齐备?}
  B -- 否 --> B1[no_endpoint / no_key]
  B -- 是 --> C{isImageGenModel?}
  C -- 是 --> C1[images/generations 专用探测 60s]
  C -- 否 --> D{cap = XT_AI_CAPS.byType(主type)}
  D -- 有 cap 且有 probe --> E[cap.probe 端点级最小探测]
  D -- 有 cap 无 probe --> F[unsupported_probe 不误报 400]
  D -- 无 cap 文本模型 --> G[chat/completions maxTokens=1 探测 5s/15s]
  E --> H[finish ok/ms/err/kind]
  C1 --> H
  G --> H
  H --> I[写 health id = ok ms err kind]
  I --> J[派发 xt:health-changed]
  J --> K[AI 页下拉重算 visibleModels 隐藏失败项]
  J --> L[失败项恢复 ok 后下次渲染自动回归]
```

### 4.5 页面脚本引用（新增 cap 必须对齐）

现有顺序（`ai-settings.html:771-778`）：`ai-service.js` → `ai-cap-registry.js` → `ai-cap-image/vision/audio/embed.js` → `ai-settings.js` → `xt-aiusage.js`。

**硬约束**：所有 `ai-cap-*.js` 必须在 `ai-cap-registry.js` **之后**加载（各 cap 文件在加载时即 `var R = global.XT_AI_CAPS`）。新增 `ai-cap-translate/video/3d.js` 必须插入 registry 之后的同一区段，并**同步补进其余 37 个已引用 cap 的页面**（对齐现有 cap 的引用集合）。

---

## 5. 数据与状态契约

### 5.1 localStorage 键

| 键 | 变更 | 字段说明 |
| --- | --- | --- |
| `ai_model_settings` | **扩展** | `{ disabled, order, overrides, catModels, categories, health, stars }` **+ 新增 `catSchema: 2`**、**`hideUnavailable: true`**、**`lastSort: {mode, catKey, innerMode}`** |
| `ai_model_settings.health[id]` | **扩展** | `{ ok:boolean, ms:number, err:string\|null, kind:string, ts:number }`，新增 `kind`（探测所用能力 key）。`err` 值域新增 `unsupported_probe` |
| `ai_model_settings.catModels` | **扩展** | 新增键 `audio` / `embedding` / `rerank` / `imagegen` / `translate` / `longtext` / `content`；迁移后 `general` 不再含纯能力模型 |
| `ai_model_settings.categories` | **不变** | 仅用户自定义分类（`key = custom_*`）；内置分类不写入此数组 |
| `ai_proxy_settings` / `ai_proxy_status` | **不变** | 海外平台代理设置 |
| `xt_ai_usage_v1` | **不变** | 本机账本（`XT_AI_USAGE` 写入），用量页作为「本机记录」口径 |

**兼容性**：读侧一律容错（缺字段补默认值，未知值不抛错）；迁移幂等，可重复执行；**不写破坏性删除**（除 §4.1 规定的"搬移"外不动用户数据）。

### 5.2 迁移契约

```text
触发：loadSettings() 中，解析后、首次 save 前
条件：settings.catSchema !== 2
语义：只搬不删 / 只追加不改序 / 幂等（重复执行结果一致）
标记：settings.catSchema = 2
回滚：catSchema 字段被忽略时行为等同旧版（不会因缺字段崩溃）
```

### 5.3 接口

| 接口 | 变更 | 说明 |
| --- | --- | --- |
| `GET /api/ai/usage` | **前端新增调用**（后端已存在，`server/routers/ai.py:86-104`） | 免登录（`get_current_user_optional`）；返回 `models` + `used/limit/date`。⚠️ 生产实测返回 **401** → 线上为旧版后端，需部署 |
| `POST /api/ai/usage/consume` | 不变 | 直连平台后上报消耗 |
| `POST /api/ai/usage/reset` | 不变 | `X-Admin-Token` |
| `GET /api/app/version` | 无接口变更 | 需部署 + 补齐 APK 产物；生产实测 **404** |
| `assets/ai-cap-*.js` 新增 `probe(ctx)` | **新增契约** | 返回 `Promise<{ok, err, detail}>`；注册表 `register()` 签名不变 |

---

## 6. 约束与风险

### 6.1 平台 / 端侧约束（**不作为可解决项，必须显式告知用户**）

| # | 约束 | 影响 | 处置 |
| --- | --- | --- | --- |
| R-a | **APK 是 WebView 壳**，WebView **不继承电脑代理** | 海外平台（OpenRouter / Gemini）在真机上可能**完全不可达** | 检测结果如实显示「网络异常」；在「关于」页说明"移动端建议使用国内平台，或通过服务端中转"。**不要假装能解决** |
| R-b | 浏览器直连受 CORS 限制 | 现状误报为"不可用" | 沿用现有 `cors` 文案「跨域受限（浏览器直连）」，并明确"应用内调用不受影响" |
| R-c | Android `usesCleartextTraffic=true` | 允许明文 HTTP，安全面扩大 | 本次不改；仅记录 |
| R-d | 异步能力（视频 / 3D）为「提交 → 轮询」 | 同步层 60s 超时撑不住 | 由 cap 自带轮询，见 P0-5 |
| R-e | 结果 URL 时效：生图 **1h**、视频/3D **24h** | 只存 URL 必然破图 | 必须落本地存储 |
| R-f | 行尾不一致：`ai-settings.js` / `ai-settings.html` = **LF**，其余根 HTML 与 assets = **CRLF**，`ai-config.js` = **CRLF** | 批量改行易产生整文件 diff | 改动时**保持原文件行尾**；用脚本按文件分别处理 |
| R-g | 本机 bash 缺 coreutils（无 `ls/grep/head/cp`） | 扫描困难 | 一律 Write 一个 `.py` 到 `tools/` 再执行；PowerShell 输出重定向到文件再 Read |
| R-h | `ai-cap-*.js` 加载顺序依赖 registry 先行 | 顺序错则能力全废（静默降级） | 见 §4.5 |

### 6.2 交付风险

| # | 风险 | 等级 | 缓解 |
| --- | --- | --- | --- |
| R-i | **部署欠账**：生产 `/api/ai/usage` 401、`/api/app/version` 404 | 高 | 需用户授权后重新部署；部署前先用本地等价验证（见各验收标准） |
| R-j | APK 产物缺失（`星途-1.24.apk` 0 命中、`web/static/apk/` 不存在） | 高 | 明确产出流程 + 交付前一致性脚本；需用户授权构建与上传 |
| R-k | 版本号三处不一致 | 中 | 单一真源 + bump 脚本 + QA 检查（F1） |
| R-l | 视频 / 3D 无平台与额度 | 中 | 本期仅契约与槽位，UI 标注「未接入」，**不承诺可用** |
| R-m | 探针可能被平台计费或限频 | 中 | 探针载荷最小化（静音 0.5s / 单条文本 / 单文档）；不轮询异步任务到完成；不进 10 次/分钟限频 |
| R-n | 38 页面脚本引用批量变更 | 中 | 用现有 `tools/bump_versions_safe.py` + jsdom 验证脚本；改完跑全站 AI 冒烟 |
| R-o | 迁移误伤老用户链 | 中 | 幂等 + 只搬不删 + 单测断言（A3/A4） |

---

## 7. 待确认问题（仅列真正需要用户拍板的）

### Q1（必须）生产部署授权
线上 `GET http://110.42.134.62/api/ai/usage` 返回 401、`GET /api/app/version` 返回 404，说明线上跑的是旧版后端。**重新部署属生产操作，需要用户明确点头**（含时间窗、是否可短暂中断）。

### Q2（必须）APK 重打包与上传
`星途-1.24.apk` 全盘不存在、`web/static/apk/` 目录不存在。请确认：**谁产出 APK、签名 keystore 在哪、产出后放在哪个路径、由谁上传**。在此之前需求 8 只能做到"接口通、版本号一致"，无法做到"能下载安装"。

### Q3（建议拍板）视频 / 3D 能力是否本期接入
当前无任何视频 / 3D 平台配置与额度，且 v2.5 更新说明已宣称支持（名不副实）。三选一：
(a) 本期只做分类槽位与端点契约，UI 标注「未接入」（**我方推荐**，符合 P2）；
(b) 本期接入某一平台（需用户提供平台与 Key）；
(c) 从 v2.5 更新说明中**撤回**该宣称。

### 已自主裁定事项（无需用户回答）
| # | 裁定 |
| --- | --- |
| 1 | 「可用」定义改为 `health.ok === true`；未检测**不隐藏**（避免空下拉） |
| 2 | 隐藏 = **渲染期过滤**，不写持久化、不改 `disabled`（由此"自动恢复"天然成立） |
| 3 | 分类 key 复用 `FUNC_TYPES` 槽位（含恢复 `translate`、新增 `audio/embedding/rerank/imagegen`）；`vision` key 不改名 |
| 4 | 3D 分类 key 用 `three_d`，label 显示「3D 生成」 |
| 5 | 空分类（无模型无链）收进折叠区，不渲染空壳卡 |
| 6 | 迁移策略：只搬不删、只追加不改序、`catSchema=2` 幂等闸门 |
| 7 | 用量双口径并列（服务端累计 / 本机记录），默认展示服务端，不可达时降级本机 |
| 8 | `version.json` 为版本唯一真源，三处由脚本派生 |
| 9 | 探针一律不进限频、不写 `recordCall`；异步能力探针不轮询到完成 |
| 10 | 本次不改视觉风格、不引新依赖、不删功能 |

---

## 8. 明确的非目标（不做什么）

1. **不做服务端代理转发**海外平台（OpenRouter / Gemini），不为移动端"打通"被墙网络；只如实呈现网络异常并给建议。
2. **不重写** `ai-service.js` 请求层与三模式链，不动 `FUNC_TYPES` 现有档位参数（温度 / maxTokens）。
3. **不新增模型平台**，不改 Key 管理，不做账号体系改造。
4. **不做用量统计的服务端写入协议改造**（`/api/ai/usage/consume` 协议保持）。
5. **不做视觉改版**：不换字体、不换配色、不引 CDN、不引前端框架。
6. **不做推荐 / 排序算法**（"智能推荐模型"不在本次范围，排序只有可用性 / 速率 / 功能分类三种显式规则）。
7. **不承诺视频 / 3D 本期可用**（仅契约与槽位）。
8. **不删除**任何现有模型、分类、页面与功能；不做破坏性数据清理。
9. **不触碰** `C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-*`（过期空壳，仅 `D:\下载的文件\学习工作台` 为唯一可写树）。
10. **不修改**任何代码文件（本 PRD 阶段交付物仅为文档）。

---

## 附：给架构师的交接要点（压缩版）

1. **先修探测，再修展示**：P0-4（能力分派探针）是其余展示类需求的数据前提，建议作为第一个任务。
2. **三处"扩展而非重写"**：`aiHealthCheckImpl` 插分派分支（不删文本兜底）、`mapToAiList` 收窄写入范围（不删 `availableIds`）、`BUILTIN_CATS` 扩容（不改 `vision` key）。
3. **健康检查分派点**：`ai-service.js:3068` 生图分支之后、`3099` 文本兜底之前。
4. **新 `probe()` 契约**加在 `XT_AI_CAPS.register` 的 cap 对象上，注册表签名不动 → 老 cap 无 probe 时降级为 `unsupported_probe`，不误报 400。
5. **行尾**：`ai-settings.js` / `ai-settings.html` 是 **LF**，`ai-config.js` 与其余 assets/根 HTML 是 **CRLF** —— 批量改动按文件分别处理。
6. **必须同步改的清单**：`ai-config.js`(FUNC_TYPES 补 audio/embedding/rerank/video/three_d 槽位 + modelDetails 文案) → `ai-settings.js`(BUILTIN_CATS / CAT_OF_TYPE / mapToAiList / 排序下拉 / renderAbout 顺序 / 迁移) → `ai-service.js`(分派 + XT_KIND_* 登记) → 各 `ai-cap-*.js`(probe) → 38 页面脚本引用 → `ai-settings.html`(关于页 DOM 顺序 + 新下拉)。
7. **验证工具**：沿用 `tools/verifier/`（jsdom）+ `tools/qa/`（检查脚本）+ `tools/bump_versions_safe.py`（扩为三处同步）。缺 coreutils，扫描一律写 `.py` 到 `tools/` 执行。
