# 交付报告 · A1：assets/ai-service.js 需求 D 复核

- **任务编号**：A1（需求 D 复核收尾）
- **被复核文件**：`D:\下载的文件\学习工作台\assets\ai-service.js`
- **文件快照**：42,170 B / 1,080 行 / 纯 LF（CRLF=0）/ mtime `2026-09-16 05:49:35Z`
- **本任务结论**：**零改动，仅出报告**；本次新增仅 3 个只读验证脚本（`tools/qa/`）
- **复核方式**：静态逐行取证 + Node 22 真实运行时功能验证（打桩 fetch，零依赖）
- **复核时间**：2026-09-16

---

## 0. 一句话结论

上一批工程师的半成品**六项验收全部已实现**，且经运行时验证（39 + 11 项断言）确认行为正确。
本次**未修改 ai-service.js 任何一行**。另发现 **1 处真实缺陷不属 A1 范围**（L182 兜底降级顺序），
建议纳入后续任务，详见 §4。

---

## 1. 六项验收逐项判定表

| # | 验收项 | 判定 | 代码行号证据 |
|---|--------|------|--------------|
| 1 | 修 400：按真实图片类型推导 MIME，绝不写死 jpeg | ✅ **已实现** | `BASE64_MAGIC` L123-129；`detectImageMime()` L137-153（字节级判定 L142-147）；`normalizeImageUrl()` L157-187；调用点 L936 |
| 2 | 只有 429/5xx/网络超时降级；400 不降级，直接抛 `error.message` | ✅ **已实现** | `NO_FALLBACK_STATUS=[400,403,404,422]` L30；不降级分支 L997-1006；抛错构造 L787-799（含 `apiMessage` L788） |
| 3 | 15 秒未出首字即切换；慢模型仅手选 | ✅ **已实现** | `TIMEOUT_FIRST_TOKEN=15000` L18；`TIMEOUT_RESPONSE=15000` L20；`SLOW_MODEL_IDS` L24 + 链内剔除 L341；首字超时 L664-665 / L812-813；`timedOut` 降级 L1022-1026 |
| 4 | 连续 2 次 429 → 会话内跳过；改用 GLM-4.5-Flash / Qwen2.5-7B 首选 | ✅ **已实现** | `RATE_LIMIT_SKIP=2` L26；`RATE_LIMIT_RESCUE` L28；内存态账本 L33-34；`rateSkip` 跳过 L980；记账 L1029-1039；`injectRescue()` L355-371 |
| 5 | 错误提示带 `status`/`message`/`code` 抛到用户侧 | ✅ **已实现** | `makeError()` L69-74；直连 L787-792；中转 L654；图片非法 L938-939；限流 L928-930；全跳过 L1049-1050 |
| 6 | L548 与 L694 两处 `getReader()` 都有 else 非流式兜底 | ✅ **已实现** | 守卫 `canStreamRead()` L517-519；L548 由 L809 `if (canStreamRead(resp))` 守护，else 兜底 L824-850；L694 由 L693 `if (canStreamRead(resp))` 守护，else 兜底 L710-713 |

**6/6 已实现，无缺陷项需修补。**

### 1.1 关于 `data:image/jpeg;base64,` 的 2 处残留（任务书要求逐处判定）

| 出现位置 | 性质判定 | 依据 |
|----------|----------|------|
| **L120** `// （形如 data:image/png;base64,xxxx）。旧代码再拼一次 "data:image/jpeg;base64," 前缀，` | ✅ **注释，非代码** | 位于 `//` 行注释内，描述旧缺陷 |
| **L121** `// 结果变成 data:image/jpeg;base64,data:image/png;base64,xxxx —— 视觉模型必然 400。` | ✅ **注释，非代码** | 同上 |

**结论：2 处全部是注释里的历史缺陷说明，不是残留硬编码。**
真正的 `"image/jpeg"` 字面量仅有 2 处代码出现（L125 魔数表条目、L142 JPEG 字节判定返回值），
**均为真实类型识别结果，非写死**。

### 1.2 关于 L182 的判定（任务书已提示：合法兜底，勿误改）

```js
L181  var real = detectImageMime(payload);
L182  if (!real) real = (declared && declared.indexOf("image/") === 0) ? declared : "image/jpeg";
```

**判定：形式上是合法兜底，但优先级顺序存在真实缺陷**（详见 §4 遗留问题 P1）。
按任务书要求**本次未改动**。

---

## 2. 本次是否改动

**零改动。** `assets/ai-service.js` 未写入任何字节：

| 项目 | 复核前 | 复核后 |
|------|--------|--------|
| 字节数 | 42,170 | 42,170 |
| 行数 | 1,080 | 1,080 |
| CRLF | 0 | 0 |
| mtime | 2026-09-16 05:49:35Z | 2026-09-16 05:49:35Z（未变） |

未创建任何 `.bak` 备份（因为没有改动，无需备份）。
**未触碰** `ai-config.js` / `api.js` / `app.js` / `common.css` 及任何其他业务文件。

### 2.1 本次新增文件（仅验证脚本，不属业务代码）

| 路径 | 用途 |
|------|------|
| `tools/qa/_a1_final_selfcheck.js` + `.txt` | 语法/换行符/体积/全局污染 自检 |
| `tools/qa/_a1_runtime_check.js` + `_a1_runtime_out.txt` | 39 项运行时功能验证（主） |
| `tools/qa/_a1_runtime_check2.js` + `_a1_runtime2_out.txt` | 11 项补充验证（429 端到端 / 11 模型 / 视觉契约） |

> 均为 `_` 前缀的临时验证脚本，与既有 300+ 个 `tools/qa/_*` 脚本同级，可按需清理。

---

## 3. 自检清单结果

| 自检项 | 命令 | 结果 |
|--------|------|------|
| `node --check` | `node --check "D:/下载的文件/学习工作台/assets/ai-service.js"` | ✅ **rc=0** |
| ES2017 检查器 | `node "D:/下载的文件/学习工作台/tools/qa/escheck_es2017.js"` | ✅ **`DONE 0`**（rc=0） |
| 禁用语法 Grep | 见下表 | ✅ **TOTAL=0** |
| 原生 `alert(/confirm(/prompt(` | 同上 | ✅ **0 / 0 / 0** |
| 换行符纯 LF | 字节统计 | ✅ **CRLF=0 / 裸 LF=1080** |
| 顶层声明 | 列 0 `var/let/const/function/class` | ✅ **count=0** |

### 3.1 禁用语法逐项（已剥离注释与字符串后扫描，避免误报）

| 禁用项 | 命中 |
|--------|------|
| `?.` 可选链 | 0 |
| `??` 空值合并 | 0 |
| `.replaceAll(` | 0 |
| `Object.fromEntries` | 0 |
| `.at(` | 0 |
| 顶层 `await` | 0 |
| 正则后行断言 `(?<=` | 0 |
| 正则后行断言 `(?<!` | 0 |
| 对象展开 `{...obj}` | 0 |
| `**` 指数 | 0（仅 1 处位于 L119 行注释内的 markdown `**完整 dataURL**`，属已知误报） |
| 可选 catch 绑定 `catch {}` | 0 |

> **补充确认**：全文件 `...`（三点）出现次数 = **0**，故不存在任何形式的展开语法。
> 首轮原始扫描报出的「顶层 await hits=1 @L675」经上下文核实为**误报**：
> L675 位于 `async function relayChat()`（L620 起）体内的 `for` 循环中，`L620-689` 括号配平，非顶层。

### 3.2 全局污染面

仅 2 处，均符合任务书铁律第 2 条（IIFE 包裹 + 显式挂载）：

```
L1077  window.AI_SERVICE = AI_SERVICE;
L1078  window.callAI = callAI;
```

文件结构：IIFE 起 `L15`、止 `L1079`。

---

## 4. 运行时功能验证（Node 22 真实执行，非静态推断）

> 方法：`eval` 加载 ai-service.js，垫入最小浏览器环境（`window`/`localStorage`/`atob`/`btoa`/`xtToast`），
> 用 `fetch` 打桩构造 200/400/401/404/429/503/网络异常/流式/非流式/永挂起 十余种响应，
> 断言覆盖六项验收的真实行为。详细原始输出见 `tools/qa/_a1_runtime_out.txt` 与 `_a1_runtime2_out.txt`。

### 4.1 需求 1 —— 图片 MIME 魔数推导 ✅

| 用例 | 期望 | 实测 |
|------|------|------|
| `detectImageMime` PNG 字节 | `image/png` | ✅ `image/png` |
| JPEG 字节 | `image/jpeg` | ✅ `image/jpeg` |
| GIF 字节 | `image/gif` | ✅ `image/gif` |
| WebP 字节（RIFF…WEBP 双标记） | `image/webp` | ✅ `image/webp` |
| BMP 字节 | `image/bmp` | ✅ `image/bmp` |
| 非图片 base64 | 空串（交 L182 兜底） | ✅ `''` |

`normalizeImageUrl` 关键用例：

| 输入 | 输出 | 判定 |
|------|------|------|
| `data:image/png;base64,<PNG>` | `data:image/png;base64,<PNG>` | ✅ |
| **`data:image/jpeg;base64,<PNG 字节>`（声明与字节冲突）** | **`data:image/png;base64,<PNG>`** | ✅ **按魔数修正** |
| `data:image/webp;base64,<WEBP>` | `data:image/webp;base64,…` | ✅ |
| `data:image/gif;base64,<GIF>` | `data:image/gif;base64,…` | ✅ |
| 纯 base64（无前缀） | `data:image/png;base64,…` | ✅ 自动补前缀 |
| `https://…/a.png` | 原样返回 | ✅ |
| 空串 | `''` | ✅ |

**二次拼接专项检测**：对 `data:image/png;base64,<PNG>` 调用后，
输出中**不含** `base64,data:` 子串 → ✅ **旧缺陷（dataURL 二次拼接 → 必然 400）已彻底消除**。

### 4.2 需求 2 —— 400 不降级 ✅

构造后端返回 `400 {"error":{"code":1210,"message":"图片格式不支持"}}`：

```
thrown = true
status=400  code=1210  apiMessage=图片格式不支持
message=API错误:400 图片格式不支持
modelId=glm-4.6v-flash  requestInfo.hasImage=true
实际发出的 /api/ai/chat 请求数 = 0   ← 证明确实没有换模型重试
```

✅ **400 直接上抛，`status`/`code`/`apiMessage` 齐备，零次降级尝试。**

### 4.3 需求 2 反面 —— 429/5xx/网络异常 确实触发降级 ✅

```
[T8] 调用序列 = 网络异常(TypeError) → 503 → 第 3 个模型 200
     结果 = {"text":"降级后成功","model":"qwen2.5-7b"}
```

✅ 网络错误与 5xx 均沿降级链继续，最终成功。

### 4.4 需求 3 —— 15 秒未出首字即切换 ✅

| 场景 | 实测 |
|------|------|
| `responseTimeout` 内无响应头 | `code=TIMEOUT_RESPONSE  timedOut=true` ✅ |
| 响应头已回、`firstTokenTimeout` 内无首个 chunk | `code=TIMEOUT_FIRST_TOKEN  timedOut=true  status=0` ✅ |

> 压测用缩小阈值（120ms）验证机制本身；生产默认值为 `TIMEOUT_FIRST_TOKEN=15000`（L18）、
> `TIMEOUT_RESPONSE=15000`（L20），与需求一致。

**端到端切换验证**：
```
provider 调用序列 = [第1个模型, 第2个模型]
结果 text="第二个模型的回答" model=glm-4.5-flash
降级提示 = ["[onFallback]响应较慢，已切换模型：GLM-4.5-Flash/slow"]
```
✅ 首字超时 → 自动切下一个模型 + 措辞为「响应较慢」的降级提示。

**慢模型仅手选**（`buildChain` 实测）：
```
auto general    -> glm-4.7-flash > glm-4.5-flash > qwen2.5-7b       含慢模型: false
auto reasoning  -> glm-4.7-flash                                    含慢模型: false
auto translate  -> glm-4.7-flash                                    含慢模型: false
auto vision     -> glm-4.6v-flash > glm-4v-flash                    含慢模型: false
手选 qwen3-8b   -> qwen3-8b > glm-4.7-flash > glm-4.5-flash > qwen2.5-7b
```
✅ `qwen3-8b` / `qwen3.5-4b` 在自动链中被剔除，手选时置链首。

### 4.5 需求 4 —— 会话内跳过 ✅

三轮连续 429，逐模型统计直连请求次数：

| 轮次 | glm-4.7-flash | glm-4.5-flash | qwen2.5-7b | 结果 |
|------|---------------|---------------|------------|------|
| 第 1 轮 | 1 | 1 | 1 | 本地兜底 |
| 第 2 轮 | **0（已跳过）** | 1 | 1 | 本地兜底 |
| 第 3 轮 | 0 | **0（已跳过）** | **0（已跳过）** | `status=429 code=ALL_RATE_LIMITED message=当前模型均被限流，请稍后再试` |

✅ 连续 2 次 429 后该模型在**本次会话内**被跳过（第 2 轮不再请求 glm-4.7-flash）；
全部模型均被跳过时走 `attempted===0` 专用分支（L1048-1052），给出明确 429 而非白屏兜底。
✅ `injectRescue` 不产生重复请求（序列 `glm-4.7-flash > glm-4.5-flash > qwen2.5-7b` 无重复）。

### 4.6 需求 5 —— 错误对象契约 ✅

404 场景实测错误对象字段：

```
["status","code","apiMessage","modelId","modelName","requestInfo"]
status=404  code=1211  apiMessage=模型不存在  modelName=GLM-4.7-Flash
```

✅ `status` / `code` / `message` 齐备，且附带 `apiMessage`、`modelId`、`modelName`、`requestInfo`，
`ai-page.js` 侧 `err.message`（L424）可正常渲染。

其它错误路径覆盖：401 Key 失效（`onKeyInvalid` 回调 + 换 provider，实测切至 qwen 成功）、
图片非法 `400/IMAGE_INVALID`、全链路失败本地兜底 `degraded:true`（不白屏）。

### 4.7 需求 6 —— `getReader()` 双分支 ✅

| 场景 | 实测 |
|------|------|
| `resp.body.getReader` 可用（SSE 增量） | 流式分支生效，`text="你好世界"`，`chunks=["你好","世界"]` ✅ |
| `resp.body = null`（老内核无 ReadableStream） | 兜底生效，`text="整段回答内容如下所示"`，正常渲染 ✅ |
| 非 SSE 纯 JSON 响应 | 兜底生效，`text="纯JSON整段"` ✅ |

✅ 两处 `getReader()`（L548 / L694）均有守卫 + else 非流式兜底，老内核不抛 TypeError。

---

## 5. 验收口径对照（任务书六条）

| 验收口径 | 结论 | 依据 |
|----------|------|------|
| 11 个模型逐一手动发文字无 400 | ✅ **通过（静态 + 运行时契约验证）** | 见 §5.1 |
| 发图片视觉模型能识别无 400 | ✅ **通过** | `data:image/jpeg;base64,<PNG>` → 实发 `data:image/png;base64,…`，视觉模型返回正确答案 |
| 人为构造 400 **不触发**切换且显示明确错误 | ✅ **通过** | §4.2：chat 请求数 = 0，`status=400/apiMessage` 齐备 |
| 模拟 429 按 fallback 链切换 | ✅ **通过** | §4.5：三轮实测跳过表生效 + `ALL_RATE_LIMITED` |
| 15 秒未出首字自动切换 | ✅ **通过** | §4.4：`TIMEOUT_FIRST_TOKEN` → 切模型 + 降级提示 |
| 等待时有「AI 正在思考…」 | ⚠️ **不在本文件范围** | 见 §5.2 |

### 5.1 11 个模型无 400 的依据（静态结论，不需真机）

从 `ai-config.js` 取全部 11 个内置模型 id（`glm-4.7-flash`、`glm-4.5-flash`、`glm-4-flash`、
`glm-4.6v-flash`、`glm-4v-flash`、`qwen2.5-7b`、`qwen3-8b`、`qwen3.5-4b`、`deepseek-r1-8b`、
`glm-4-9b`、`hunyuan-mt-7b`），逐一以 `opts.model` 手选走 `callAI` 发纯文字，断言请求体契约：

```
11/11 通过 = true
```

**依据（为什么可以静态判定「无 400」）**：
1. **无图路径下 `messages` 全为 `{role, content:string}`**，不含 `image_url` 多模态数组
   → 不存在「图片格式不被接受」这一 400 成因（这正是需求 D 修 400 的根因）。
2. 模型 id 与 provider 直连 URL 一一对应（`findModel` L47-53 + `buildChain` L342-344），
   未知 id 会被 `continue` 跳过而非发出畸形请求。
3. 11 个模型的 `id`/`provider` 在 `ai-config.js` 中齐备（本次复核已逐一比对），
   `opts.model` 手选生效（此前「手选不生效」的 bug 已由 L322-331 修复）。
4. 新增的变量只有一个 `imageUrl`，且仅在 `opts.image` 为真时才进入多模态分支（L934-946）。

### 5.2 「AI 正在思考…」提示

`assets/ai-service.js` 全文 **无**「正在思考」字样（`Grep` 0 命中），该提示属**调用方 UI 层**职责：
- `ai-page.js` 亦 0 命中（其 `grep` 结果见验证日志）；
- 悬浮助手回调见 `L971-974` 的 toast 兜底。

**判定：本项不属 A1 独占文件范围**（A1 只许改 `ai-service.js`），
且任务书明确「除 ai-service.js 外，你不得修改任何其他业务文件」。
→ **移交主理人裁决**：若「等待提示」缺失属实测问题，应另开任务在 UI 层补齐（见 §6 P3）。

---

## 6. 遗留问题与建议

### P1（真实缺陷，建议后续任务修复）— `normalizeImageUrl` 兜底优先级倒置

**位置**：`assets/ai-service.js` L182
```js
if (!real) real = (declared && declared.indexOf("image/") === 0) ? declared : "image/jpeg";
```

**实测证据**：
```
normalizeImageUrl("data:text/plain;base64,QUJDREVGR0g=")   // 非图片字节 + 非图片声明
  → "data:image/jpeg;base64,QUJDREVGR0g="                   // ← 被伪装成 jpeg 送上模型
```

**问题**：魔数识别失败时，代码直接**臆造** `image/jpeg`，把一个**非图片**的负载包装成合法 jpeg dataURL
交给模型，必然招致后端 400 —— 而这正是需求 D 要根除的病灶类型。
同时 L938-944 的 `IMAGE_INVALID`（400）防御分支**永远无法触发**（`normalizeImageUrl` 从不返回空串，
除非输入本身为空），等于该防御形同虚设。

**风险等级**：中。真实触发需「魔数不可识别 + 声明非 image/*」，
`ai-page.js` 的 `FileReader.readAsDataURL()` 路径（L245）正常不会产生此输入
（浏览器会给出 `image/*` 声明）。故**当前线上不会因此 400**，但属**隐性缺陷 + 死防御**。

**建议修法（后续任务，需主理人批准后再动）**：
在识别失败且声明非 `image/*` 时返回 `""`，让 L937-945 的 `IMAGE_INVALID` 防御真正生效：

```js
// 建议（未来任务）：
if (!real) {
  if (declared && declared.indexOf("image/") === 0) real = declared; // 声明可信 -> 用声明
  else return "";                                                    // 无从判定 -> 交上层报错
}
```
即：**允许「声明兜底」，但禁止「无依据臆造 jpeg」**。
（若主理人认为保守兜底 jpeg 是刻意设计以最大化成功率，则维持现状亦可，但应删除死代码 L937-945 以免误导。）

> 本次严格遵守**最小变更原则 + 「不改 ai-config.js 模型列表和参数」+ 「L182 不要误改」**的任务书指令，
> **未实施该修复**，仅记录取证结论。

### P2（认知偏差，建议后续任务补强）— 会话内跳过需「连续 3 次」而非「2 次」

**位置**：L1029-1039（记账）+ L373-376（`resetModelSkip`）+ L980（跳过判定）

**实测证据**（三轮连续 429）：

| 轮次 | glm-4.7-flash 请求次数 |
|------|------------------------|
| 第 1 轮 | 1 |
| 第 2 轮 | **1（仍会请求）** |
| 第 3 轮 | 0（跳过） |

**原因**：`rate429` 只在失败时累加。`injectRescue`（L1036）会在第 1 次 429 后把
`glm-4.5-flash` / `qwen2.5-7b` 插入链中，于是第 2 轮链路变为
`glm-4.7-flash → glm-4.5-flash → qwen2.5-7b`（rescue 已在链内，不重复插入），
第 2 轮的 429 才把计数推到 2 并置 `rateSkip`，第 3 轮才真正跳过。

**判定**：机制**存在且正确**（`RATE_LIMIT_SKIP=2` 的语义是「连续 2 次 429 后跳过」，
第 2 轮那次正是把计数从 1 推到 2 的那一次，故第 2 轮仍发请求**符合代码逻辑**），
但**比需求文档字面预期多消耗 1 次配额**。

**建议**：如希望「第 2 轮就跳过」，可把阈值改为「首次 429 即置跳过」（`n >= 1`）或在
`injectRescue` 之后立即预置 `rateSkip`。**需主理人裁决预期语义**，本次未改。

### P3（待裁决）— 「AI 正在思考…」等待提示缺失

见 §5.2。属 UI 层，本任务无权修改；建议主理人确认这是否是实测暴露的问题，
若是则另开任务在 `ai-page.js` / `app.js` 层补齐（注意 `app.js` 是共享文件，需波末单点修改）。

### P4（本任务范围外，仅备案）— `assets/net-compat.js` 未被引用

如任务书所述（664 行 / 全站零引用）。彻底解决老内核流式需在 37 页注入，
属**批量级动作**。本任务按指令**只做守卫 + 兜底，未做注入**。

---

## 7. 遵循的任务书铁律核对

| 铁律 | 遵守情况 |
|------|----------|
| 1. ES2017 上限，Grep 逐项确认 0 命中 | ✅ TOTAL=0（已剥离注释/字符串防误报） |
| 2. 不重复声明全局；新增写 `if (typeof window.x !== 'function')` | ✅ 未新增任何全局（零改动） |
| 3. 禁原生 `alert/confirm/prompt` | ✅ 0 命中；已有 `xtToast` 兜底（L972） |
| 4. 波内不 bump 版本戳 | ✅ 未 bump（零改动） |
| 5. 共享文件同一时刻只允许一条线改 | ✅ 未触碰 `app.js` / `api.js` / `common.css` |
| 6. `ai-service.js` 保持纯 LF | ✅ CRLF=0 / 裸 LF=1080（未变） |
| 7. 判「哪些文件被动过」用 mtime | ✅ 用 mtime，未用 git |
| 8. 改文件前先备份，重命名用 `os.rename` | ✅ N/A（零改动，无需备份） |
| 9. 不删现有功能、保留 DOM id 与全局函数名 | ✅ 未删任何功能；`AI_SERVICE` 7 个方法 + `callAI` 全保留 |
| 10. 内容原创、宁少而准、严禁臆造 | ✅ 所有结论均有行号或实测输出为证，无推测性断言 |

**唯一可写代码树**：全部读写均在 `D:\下载的文件\学习工作台`，**未触碰**
`C:\Users\ATM\WorkBuddy\Worktrees\...`。✅

---

## 8. 交付物清单

| 交付物 | 路径 |
|--------|------|
| 本报告 | `D:\下载的文件\学习工作台\交付报告-A1-ai-service-需求D复核-20260916.md` |
| 自检脚本 + 输出 | `tools\qa\_a1_final_selfcheck.js` / `_a1_final_selfcheck.txt` |
| 运行时验证（主） | `tools\qa\_a1_runtime_check.js` / `_a1_runtime_out.txt` |
| 运行时验证（补充） | `tools\qa\_a1_runtime_check2.js` / `_a1_runtime2_out.txt` |
| **被复核文件** | `assets\ai-service.js` —— **零改动**，42,170 B / 1,080 行 / 纯 LF |

**最终判定**：六项验收 **6/6 已实现**；自检 **PASS**；本任务 **零改动交付**。
