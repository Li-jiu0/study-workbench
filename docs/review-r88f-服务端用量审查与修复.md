# R88-F 服务端统一用量检测审查与修复报告

- 审查人：工程师 寇豆码（Kou / software-engineer-r88f）
- 日期：2026-09-18
- 审查对象：`server/routers/ai.py`、`server/quota_ledger.py`、`server/security.py`、`server/config.py`、`server/data/model_registry.json`、`server/data/model_quota.json`
- 代码树根：`D:\下载的文件\学习工作台`
- 结论：**team-lead 提出的 7 项缺陷全部属实，无一条判错。** 其中 P0-1 / P0-2 经调用方核查，**两项直接按「加鉴权」修会破坏已上线的前端游客/上报场景**，已按纪律暂停并回传请示。

---

## ① 核实结论表（7 条，逐条证据）

| 编号 | 结论 | 文件:行号 | 证据（原样引用） | 核实说明 |
|---|---|---|---|---|
| **P0-1** | ✅ **属实** | `server/routers/ai.py:86-103` | `def ai_usage(user: User = Depends(get_current_user_optional),`<br>`    db: Session = Depends(get_db)):`<br>`    """模型用量总账（免登录）+ …` | `get_current_user_optional`（`security.py:129-147`）在无 token / token 无效时 **返回 None 而不抛错**，游客可读全站账本。返回体 `ledger_snapshot()`（`quota_ledger.py:218-226`）含每个模型的 `used / calls / failCalls / freeQuota / remaining / percent / status / expireAt` —— 即**各平台配额、真实模型名（modelId）、调用量**，属敏感运营数据。**确认：可选鉴权 + 敏感信息，属实。** |
| **P0-2** | ✅ **属实** | `server/routers/ai.py:106-129` | `@router.post("/usage/consume")`<br>`def ai_usage_consume(body: dict):` | 函数签名**只有 `body: dict`，无任何 `Depends(...)` 鉴权依赖**，也无 `X-Admin-Token` 校验（对比同文件 `/usage/reset` L133 有 `x_admin_token` 校验）。可任意 `POST {"modelId":"ark-xxx","amount":100000}` 反复刷，`record_usage` 直接累加到账本（`ai.py:128`）→ 把模型 `used` 顶到 `freeQuota` 之上使 `check_quota` 返回 exhausted，**打停全站该模型 AI 服务**。**确认：无鉴权 + 可任意增用量 + 可刷到超配额，属实。** |
| **P1-3** | ✅ **属实** | `server/quota_ledger.py:259-267`（`check_quota`）与 `229-256`（`record_usage`） | `check_quota`：<br>`    status = model_status(model_id)`<br>`    if status["exhausted"]: return False, "…"`<br>`    return True, ""`<br>—— **全程不加锁**。<br>`record_usage` 的累加在 `with _lock:`（L244）内。 | `check_quota` 读 `used` 与 `record_usage` 写 `used` **不在同一临界区**。`ai.py:184` 先 `check_quota`（L184）→ 上游请求 → `finally` 里 `record_usage`（L278）。并发 N 个请求可同时通过 `check_quota` 再各自累加 → **超额（TOCTOU 竞态）**。`_lock` 只保护单次 `record_usage` 的读写，不保护「检查—累加」整体。**确认：不同临界区、无跨检查锁，属实。** |
| **P1-4** | ✅ **属实** | `server/routers/ai.py:262-264` | `chunk_tokens = tokens_from_usage(j.get("usage"))`<br>`if chunk_tokens:`<br>`    used_tokens = max(used_tokens, chunk_tokens)`<br>—— 而同文件 `ai.py:277-278` 注释：<br>`# 服务端账本：成功累加真实 token（拿不到就按 1 次计）` | 实现取 `max`（取单 chunk 最大值），注释说「累加」。火山方舟开 `stream_options.include_usage` 后，**多数情况 usage 只在最后一个 chunk 出现一次**，此时 `max` 与「取最后一次」等价、结果正确；但**若上游分多个 chunk 下发 usage（如增量计费）或中间 chunk 带部分 usage，max 会少于真实总量 → 用量少记**。对本项目「账本要准」的硬目标，属**语义隐患**（注释与实现矛盾）。**确认：矛盾属实。** |
| **P1-5** | ✅ **属实** | `server/routers/ai.py:215-218` | `# 火山方舟支持 stream_options.include_usage：…`<br>`# 其余平台保守不加，避免个别平台对未知字段报 400。`<br>`if "volces.com" in cfg["base_url"]:`<br>`    payload["stream_options"] = {"include_usage": True}` | 仅 `volces.com`（火山方舟）被加 `stream_options`。其余平台（`deepseek / qwen / kimi / zhipu / qianfan / openai / siliconflow`，见 `config.py:41-90`）**拿不到 usage** → 走 `finally` 兜底 `record_usage(quota_key, 1, ok=...)`（`ai.py:278`）**按「1 次」计**。受影响的正是「用量明细显示真实调用」需求：非火山模型只会看到「1 次 / 无 token」。**确认：受影响平台 = 除 ark 外全部，属实。** |
| **P2-6** | ✅ **属实** | `server/routers/ai.py:181-183` | `# 服务端统一额度：优先按 modelId（前端 ai-config.js 的 id）计，没带则按 provider 兜底。`<br>`quota_key = (getattr(body, "modelId", "") or "").strip() or body.provider` | 兜底链：`modelId`（非空去空格）→ 否则 `body.provider`。前端不传 `modelId` 时 `quota_key = provider`（如 `"ark"`），账本里写入键 `"ark"` 而非真实模型名。`resolve_model_name`（`quota_ledger.py:327-341`）用 `model_id` 查 `model_registry.json`，对 `"ark"` 这种 provider 名**查不到 → 返回 ""→ 回退 `.env` 的 `ARK_MODEL`**（`ai.py:213`）。`model_quota.json`/`model_registry.json` 里键全是 `ark-seed-*` 之类真实 modelId，**没有 `"ark"` 键**。→ 账本与显示都退化成「火山方舟（豆包/DeepSeek）」，**正是用户投诉根因之一**。**确认：兜底链与解析逻辑属实。** |
| **P2-7** | ✅ **属实** | `server/routers/ai.py:189-190` | `if user:`<br>`    _record_usage(db, user.id)  # 先计数、超限直接 429，避免空耗` | `_record_usage`（`ai.py:54-65`）**先 `row.count += 1; db.commit()`**。若随后上游返回 400/404/连接失败（`ai.py:236-250`、`272-275`）或插件抛错，**该次计数不回滚**，用户当日额度被白扣。仅「上游非 200」场景下 `record_usage(..., ok=upstream_ok=False)` 只记 `failCalls`（不扣 token），但**用户级 `AiUsage.count`（每日限额）已扣**。**确认：先计数后失败、不回滚，属实。** |

**统计：7/7 属实，0 条误判。**

---

## ② P0 修复说明

### 2.1 调用方核查结果（决定修法，关键）

**`GET /api/ai/usage` 调用方**
- 唯一调用方：`assets/xt-aiusage.js`（模型设置页「关于」Tab 内的用量面板）。
- 证据：
  - `xt-aiusage.js:33`　`var SERVER_USAGE_PATH = "/api/ai/usage";`
  - `xt-aiusage.js:288`　`// ---------- R87/T04：服务端累计口径（GET /api/ai/usage，免登录） ----------`
  - `xt-aiusage.js:552`　`if (!hasLoginToken()) return "游客模式：服务端不记录个人今日用量（登录后可查看账号级累计）";`
  - `xt-aiusage.js:358`　`if (status === 401 || status === 403) return { phase: "unauthorized", http: status };` → 面板文案「需新版后端」降级。
- **判定：该接口的「免登录」是前端有意依赖的能力**。若改为强制登录，未登录用户的用量面板会从「游客模式」直接降级为「需新版后端」，**属破坏已上线功能**。

**`POST /api/ai/usage/consume` 调用方**
- 调用方：`assets/ai-cap-video.js:52-62`、`assets/ai-cap-3d.js:48-58`（视频 / 3D 生成，前端直连模型平台异步任务完成后上报）。
- 证据（两者一致）：
  ```js
  global.fetch(base + '/api/ai/usage/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },   // ← 无 Authorization
    body: JSON.stringify({ modelId: modelId, amount: amount, ok: true, unit: 'tokens' })
  })['catch'](function () {});
  ```
- **判定：它不是服务端内部调用，而是浏览器发起、且不带任何登录令牌**。若改为「仅 ADMIN_TOKEN 放行」，真实用户的视频/3D 用量上报会被 403 拒绝（前端 `catch` 静默忽略），**账本漏记 + 前端功能默默失效**。

> ⚠️ **结论：team-lead 原指令的直译修法（/usage 强制登录、/consume 仅 ADMIN_TOKEN）会破坏前端场景。已按纪律暂停，未擅自改，回传请示中。**

### 2.2 建议修法（方案 A，推荐；待 team-lead 拍板后落地）

**P0-1 修法：游客最小化脱敏（不强制登录）**
- 保留 `get_current_user_optional`，但按登录态分流返回体：
  - 登录用户：返回全量 `ledger_snapshot()`（现行为不变）。
  - 游客（`user is None`）：仅返回 `{"ok": True, "serverTime": …, "used": 0, "limit": AI_DAILY_LIMIT, "date": …, "models": {}}`，**不含** `freeQuota / remaining / percent / calls / 真实模型名`。
- 效果：堵住「游客免登录读全站账本/配额」，同时游客面板仍能显示「游客模式」空态，功能不降级。

**P0-2 修法：服务端加固（前端不动）**
1. 加 `rate_limit` 限流（复用现有 `rate_limit` 机制，新增一类 key，如 `rate_limit("consume")`）。
2. 校验 `modelId` 必须命中 `model_registry.json` 白名单（`ensure_loaded()` 后判断 key 存在），未命中直接 400，防刷不存在的模型 / 污染账本键。
3. 保留 `_MAX_CONSUME_AMOUNT = 100000` 与 `amount` 夹取。
- **残留风险（需记录）**：仍无法阻止「已登录/未登录用户用合法 modelId 反复上报」。彻底解法 = 上报强制带登录态（需改前端），本轮不做。

### 2.3 备选修法（方案 B，team-lead 原方案，如坚持则照做）
- P0-1：`get_current_user_optional` → `get_current_user`（强制登录）。**影响**：游客用量面板降级「需新版后端」。
- P0-2：新增 `X-Admin-Token` 校验（复用 `ADMIN_TOKEN`，`.env:53` 已配）。**影响**：视频/3D 前端上报全部 403，账本漏记。
- 交付时附「前端被迫降级/断链」影响清单。

### 2.4 追加确认 1：`/usage/reset` fail-open（第 3 个安全洞）—— **属实，本轮已修**

**核实**：
- **位置**：`server/routers/ai.py:132-150`（函数 `ai_usage_reset`）。
- **原鉴权逻辑**（原样引用）：
  ```python
  required = os.getenv("ADMIN_TOKEN", "").strip()
  if required and x_admin_token != required:
      raise HTTPException(403, "X-Admin-Token 无效，禁止重置用量")
  ```
- **判定：属实，且是 fail-open**。`if required and ...` —— 当 `ADMIN_TOKEN` **未配置（空串）** 时，`required` 为假 → **整段校验短路跳过 → 直接放行**（`ai.py:150` 还会用 `"authBypass": not required` 明确回传「已绕过鉴权」）。
- **后果**：部署若遗漏 `ADMIN_TOKEN` 环境变量，**任何人可 `POST {"all": true}` 把全站用量账本清零** → 叠加 P0-2（可任意加用量），则配额的**读（P0-1）/ 写（P0-2）/ 清（本条）三个口子全开**，用量限制形同虚设。

**调用方核查（是否会破坏已上线功能）**：
- Grep 全站 `usage/reset`：**无任何前端（`assets/*.js`）调用**。
- 调用方仅：`tools/qa/arkquota_verify.py`（验收脚本，**显式带** `X-Admin-Token`）、`tools/qa/arkquota_apply_patch.py`/`arkquota_apply_config.py`（部署/配置脚本）、文档 `AI模型对接文档.md`（明确写「管理用，需 header `X-Admin-Token`」）。
- **结论：它是管理/运维接口，无前端依赖 → 改 fail-closed 不会破坏已上线功能，可安全修。**

**修法（已落地）**：fail-closed —— `ADMIN_TOKEN` 未配置时**直接 503 拒绝**，不再放行。
```python
required = os.getenv("ADMIN_TOKEN", "").strip()
if not required:
    raise HTTPException(503, "服务端未配置 ADMIN_TOKEN，用量重置接口已禁用（fail-closed）")
if x_admin_token != required:
    raise HTTPException(403, "X-Admin-Token 无效，禁止重置用量")
```

### 2.5 追加确认 2：多 worker 竞态 —— **多 worker 是真实（已文档化）部署形态，P1-3/P0-2 限流都会跨 worker 失效**

**生产启动方式核查**：
- 常规联调/单机启动（多份文档一致）：`python -m uvicorn main:app --host 0.0.0.0 --port 8000`（`运行说明.md:97`、`交接文档-批次三.md:195`、`手机真机打包运行方案.md:255`）—— **无 `--workers` ⇒ 默认单 worker**。
- **但** `docs/HTTPS+APP跨端改造方案-2026-09-12.md:243` 给出的 systemd 单元明确写：
  `ExecStart=/opt/xingtu/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 4`
- `tools/qa/r73/后端审查报告.md:115,124` 也已指出：`rate_limit.py` 的 `_buckets` 是**进程内** `defaultdict`，多 worker 下各 worker 独立计数，实际阈值放大 N 倍，并建议「多进程部署前置共享限流（Redis）或强制单 worker」。

**判定：多 worker 是真实/已规划的部署形态**（HTTPS 改造方案里写的就是 4 worker）。因此：
- **P1-3 不降级**：单 worker 下仍有 asyncio 并发风险（`check_quota`/`record_usage` 跨 `await` 边界）；多 worker 下**加速放大**。
- **P0-2 的 IP 限流在多 worker 下会跨 worker 失效**（每个 worker 各算 60/分钟 → 实际 4×60）；本轮已加限流，但**必须同时上 Redis/共享限流或固定单 worker 才彻底**。已记入遗留风险。
- **额外发现（更严重）**：`quota_ledger` 的账本缓存 `_usage` 是**进程内全局**，多 worker 时每个 worker 各持一份内存副本，各自 `_atomic_write` **整文件覆写** `model_usage.json` → **worker 之间会互相覆盖账本（丢用量）**。这与 P1-3 叠加，使「多 worker」下的用量账本**根本不可信**。已记入遗留风险，需用户决定（强制单 worker 或改共享存储）。

---

## ②b P0 修复实际落地（本轮已执行）

> team-lead 决策 = **方案 A**（`/usage` 游客脱敏 + `/consume` 服务端加固，前端不动），并追加要求把 `/usage/reset` fail-closed 一起修。

**改动的 4 个服务端文件**（均在 `server/`，均保持 CRLF 行尾）：

| 文件 | 改动 | 对应问题 |
|---|---|---|
| `server/routers/ai.py` | ① `ai_usage`：登录用户返回全量 `ledger_snapshot()`，游客返回 `{"ok":True,"serverTime":…,"models":{}}`（脱敏）＋ `used/limit/date`；② `ai_usage_consume`：签名加 `_rl: None = Depends(rate_limit("consume"))`，并加 `model_id` 白名单校验（`known_model_ids()` 非空时才拦）；③ `ai_usage_reset`：改为 fail-closed（未配 `ADMIN_TOKEN` → 503） | P0-1 / P0-2 / 追加确认1 |
| `server/quota_ledger.py` | 新增 `known_model_ids()`：返回 `额度表 ∪ 注册表 ∪ 已有账本键` 的合法 modelId 集合（供白名单用） | P0-2 |
| `server/rate_limit.py` | `_LIMITS` 新增 `"consume": RATE_AI_CONSUME_PER_MIN` 分组（默认 60 次/分钟） | P0-2 |
| `server/config.py` | 新增 `RATE_AI_CONSUME_PER_MIN`（`RATE_AI_CONSUME_PER_MIN` 环境变量可覆盖，默认 60） | P0-2 |

**备注**：`ai_usage_reset` 的返回字段 `authBypass` 因 fail-closed 后 `required` 必非空，已固定为 `False`（保留字段兼容旧客户端）。

**验证结果**：
- `py_compile`：4 个文件全部 `COMPILE OK`。
- **自测（TestClient，11 条断言全过）**：`tools/_r88f_selftest.py`
  - T1-a~e 游客 `/usage` 返回 200、`models` 为空、不含 `freeQuota`/`remaining`、旧字段 `used/limit/date` 仍在。
  - T2-a~c 未知 `modelId`→400、空 `modelId`→400、合法 `modelId` 可正常上报。
  - T3-a~c 未配 `ADMIN_TOKEN`→503（fail-closed）、已配+错 token→403、已配+对 token→200。
- **修订版验收脚本（35 条断言全过）**：`tools/qa/arkquota_verify_r88f.py`

**数据安全**：自测/验收脚本运行时会写 `server/data/model_usage.json`（运行时账本），脚本结束已 `reset_all()` 清空还原；自测改用临时目录隔离。最终该文件为 `{"models": {}, "updatedAt": "..."}`（与会话开始时 `models: []` 一致）。未触碰 `server/.env`。

### 2.6 ⚠️ 既有验收脚本 `tools/qa/arkquota_verify.py` 因本次安全修复而失效（需 QA 注意）

**原因**：该脚本把**旧的「游客可读全站账本」不安全契约**写死进了断言，本次修复后：
1. `tools/qa/arkquota_verify.py:58-78,92,110,155`：以**游客身份**读 `/usage` 并断言 `models` 明细 → 现在 `models` 为空 → **断言 FAIL / 第 92 行 KeyError 崩溃**（实测已复现）。
2. `:73-78`：用 `modelId="no-such-model"` 造「表外模型」条目 → 现在白名单 **400 拒绝** → 该断言失效。

**处置**：已提供**修订版** `tools/qa/arkquota_verify_r88f.py`（35/35 PASS），要点：
- 游客 `/usage` 断言「脱敏正确」；需要看明细处**改为直读服务端 `quota_ledger.ledger_snapshot()`**（等价登录视角，断言强度不降）。
- 未知 `modelId` 断言 `400`；「表外模型」语义改由 `quota_ledger.model_status()` 验证。
- `/usage/reset` 先测「未配 → 503」再测「已配 → 403/200」。

**建议**：请 QA 用新版脚本替换旧脚本，或由 QA 自行更新旧脚本的 `/usage` 读法。**旧脚本的失败不是代码回归，而是它编码了被修复掉的不安全行为。**

---

## ③ P1 / P2 修复方案清单（本轮不修，仅方案）

| 编号 | 问题 | 建议改法 | 影响面 | 风险 | 需用户确认点 |
|---|---|---|---|---|---|
| P1-3 | `check_quota` 与 `record_usage` 跨临界区，并发超额（`quota_ledger.py:259` / `229`） | 引入「预留（reserve）」原子操作：`try_reserve(model_id, amount)` 在 `_lock` 内同时完成「检查+预扣」，上游失败再 `release`。 | 服务端转发前逻辑；`ai.py:184` 调用点 | 改动计费语义；预扣量难以预估（先扣 1 次还是估 token？）；失败回滚要幂等 | **必须用户拍板**：预扣单位（1 次 or 估算 token）、超时释放策略 |
| P1-4 | `used_tokens` 取 `max` 而非累加（`ai.py:264`） | 改 `used_tokens = max(used_tokens, chunk_tokens)` → `used_tokens += chunk_tokens`（若确认上游「累计下发」）；或保留 max 但**修正注释**为「取最后一次 usage」。 | 服务端账本 token 精度 | 若上游是「累计下发」，改为 `+=` 会**重复累加导致多记**；需先确认上游语义 | **必须用户拍板**：上游 usage 是「增量」还是「累计」下发（决定 `+=` vs 取最后） |
| P1-5 | 非火山平台按 1 次计（`ai.py:217`） | 为更多平台加 `stream_options.include_usage`（逐平台验证不报 400）；或对不支持的平台改用「字符估算 token」兜底而非「1 次」。 | 除 ark 外 7 个平台 | 个别平台对未知字段报 400（注释已警示）；改估算口径会改变历史可比性 | **必须用户拍板**：是否允许逐平台开启、是否接受估算口径 |
| P2-6 | `quota_key` 兜底 provider 污染账本（`ai.py:183`） | 兜底改为「`modelId` 缺失 → 用 `cfg['model']`（真实模型名）」，或直接 400 要求前端必传 `modelId`。 | 账本键与前端显示 | 改兜底会让历史 `"ark"` 键与新键并存（需数据迁移）；或前端不传时直接报错（需前端配合） | 是否接受账本键迁移 / 是否要求前端必传 modelId |
| P2-7 | 先计数后失败白扣配额（`ai.py:190`） | 把 `_record_usage` 移到「上游确认 200（`upstream_ok = True`）」之后，失败时回滚或只记 `failCalls`。 | 用户每日限额统计 | 移到成功后再计数会使「超限 429」延后到占用上游请求之后（失去「避免空耗」的初衷） | 需权衡「防空耗」vs「不白扣」的取舍，**需用户拍板** |

---

## ④ 需用户（主理人/team-lead）拍板点

1. **P0-1**：`/usage` 采用**游客脱敏（方案 A，推荐）** 还是 **强制登录（方案 B）**？B 会破坏游客用量面板。
2. **P0-2**：`/consume` 采用**服务端加固：限流 + modelId 白名单（方案 A，前端不动）** 还是 **仅 ADMIN_TOKEN（方案 B）**？B 会让视频/3D 前端上报全部失败。
3. P1-3 预扣单位与释放策略。
4. P1-4 上游 usage 是增量还是累计下发（决定 `+=` 还是取最后）。
5. P1-5 是否逐平台开启 `include_usage` / 是否接受估算兜底。
6. P2-6 是否接受账本键迁移或要求前端必传 modelId。
7. P2-7 「防空耗」与「不白扣」的取舍。

---

## ⑤ 遗留风险

1. **P0-2 无法根治**：只要 `/consume` 仍对前端开放且不带登录态，就仍可被合法 modelId 反复上报刷量；彻底解需改前端（本轮禁改）。
2. **`/chat` 游客可用**（`ai.py:172` 用 `get_current_user_optional`）：游客仅受 IP 限流。这是有意的产品设计（见 `ai.py:174-175` 注释），但意味着游客仍能消耗 ark 额度；与 P0-1 的账本暴露叠加，攻击者可先探测额度再刷。
3. **`/usage/reset` fail-closed**（`ai.py:157-161`，**已修**）：未配 `ADMIN_TOKEN` 时现返回 503，不再放行。现网 `.env:53` 已配置该变量。
4. **单进程内存锁**：`quota_ledger._lock` 是进程内 `threading.RLock`。**已确认多 worker 是真实部署形态**（`docs/HTTPS+APP跨端改造方案-2026-09-12.md:243` 的 systemd 用 `--workers 4`）→ 多 worker 下：
   - P1-3 竞态加速放大；P0-2 的 IP 限流每 worker 各算一份（实际阈值 ×N）；
   - **更严重**：`quota_ledger._usage` 是进程内全局，多 worker 各自持副本、各自整文件覆写 `model_usage.json` → **worker 间互相覆盖账本（丢用量）**。
   - **处置建议**：强制单 worker（`--workers 1`，与 `wsmanager` 单进程前提一致）或引入 Redis/共享存储。**需用户拍板。**
5. 本轮**只改服务端 4 个 .py**（`ai.py` / `quota_ledger.py` / `rate_limit.py` / `config.py`），未碰前端；`server/.env` 只读未动；`server/data/*.json` 账本在自测后已还原为空账本。
6. **既有验收脚本 `tools/qa/arkquota_verify.py` 已失效**（编码了旧的不安全契约），需 QA 换用 `tools/qa/arkquota_verify_r88f.py`（详见 2.6）。

---

## ⑥ 验证记录（本轮实跑）

| 验证项 | 工具/命令 | 结果 |
|---|---|---|
| 语法编译 | `tools/_r88f_compile.py`（py_compile ×4） | ALL_OK（4/4 COMPILE OK） |
| P0 自测 | `tools/_r88f_selftest.py`（venv python，TestClient） | ALL_ASSERTIONS_PASS（11/11） |
| fail-closed 复验 | `tools/_r88f_t3a_recheck.py` | PASS（置空/缺键均 503） |
| 修订验收 | `tools/qa/arkquota_verify_r88f.py` | 通过 35 / 失败 0 |
| 旧验收（对照） | `tools/qa/arkquota_verify.py` | 因旧契约失效（预期，见 2.6） |

**关键脚本路径**（均在 `tools/`）：
- 补丁脚本：`tools/r88f_patch_p0.py`
- 自测：`tools/_r88f_selftest.py`
- 修订验收：`tools/qa/arkquota_verify_r88f.py`
- 备份：`server/routers/ai.py.bak-r88f-pre`、`server/rate_limit.py.bak-r88f-pre`、`server/config.py.bak-r88f-pre`、`server/quota_ledger.py.bak-r88f-pre`

---

*（本报告已含 P0/追加确认的实际落地与验证结果。）*
