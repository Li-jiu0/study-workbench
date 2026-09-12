# 批次五 · 第②步：版本化保留名单（_version_keep_list_0913d）

> 依据：第①步全量扫描 `tools/qa/_version_candidates_0913d.txt`（470 条 / 64 文件）。
> 本文档是分析产物，**未改动任何现有文件**。第③步执行前需用户拍板。

## 0. 背景证据（为什么必须做）

服务器实测（另一条线 `curl -sI` 只读排查，2026-09 批次五期间）：

| 资源 | Cache-Control | Expires | ETag | Last-Modified |
|---|---|---|---|---|
| /学习工作台.html | 无 | 无 | 弱 | 有 |
| /assets/app.js | 无 | 无 | 弱 | 有 |
| /assets/data/vocab-cet4-ext.json | 无 | 无 | 弱 | 有 |
| /assets/data/exam-bank-ext-index.json | 无 | 无 | 弱 | 有 |
| /assets/emoji/manifest.js | 无 | 无 | 弱 | 有 |

nginx 未注入任何 `Cache-Control`/`Expires` → 浏览器按 RFC 7234 **启发式缓存**（约 `(Date−Last-Modified)×10%` 推算新鲜度，文件越老窗口越长），窗口内可能不发请求直接用本地副本。**加 `?v=` 是击穿缓存最可靠的手段；仅靠 ETag/Last-Modified 无法保证「改完即更新」。**

第①步计数：ALREADY_VERSIONED 314（a×12 + c×302）/ **LOCAL_STATIC 8（真实候选 4 条数据路径 + 4 条 prose 文案）** / DYNAMIC 84 / COMMENTED 63 / INTERNAL 1 / EXTERNAL 0 / DATA_URI 0 / ERROR 0。

---

## 1. 保留名单（4 条，逐条判决）

### ① `assets/app.js:377` → `assets/data/exam-bank.json`（legacy 覆盖层）——保留 ✅

- **真实性**：活代码。调用链 `app.js:458 loadExamBankExt()` → `:414 loadExamBankShard(EXAM_BANK_LEGACY, true)` → `:403 fetch(url)`。启动即执行。
- **URL 构造**：`const EXAM_BANK_LEGACY = 'assets/data/exam-bank.json'`（:377，字符串常量赋给 const，fetch 收到的是变量）→ **版本号加在常量字面量上即可**。
- **改动落点（方案，不真改）**：
  `app.js:377` 改为 `const EXAM_BANK_LEGACY = 'assets/data/exam-bank.json?v=<VER>';`
- **联动风险**：`app.js:429` 有 `lg !== EXAM_BANK_LEGACY` 去重比较——若只给一边加 `?v=`，会判「不相等」而把 legacy 重复加载两遍。见 §2.2。

### ② `assets/app.js:378` → `assets/data/exam-bank-ext-index.json`（增量分片索引）——保留 ✅

- **真实性**：活代码。`:417 fetch(EXAM_BANK_EXT_INDEX)`，随 `loadExamBankExt()` 启动执行。
- **URL 构造**：`const EXAM_BANK_EXT_INDEX = '...'`（:378，字符串常量）→ 同上，加在字面量上。
- **改动落点（方案）**：
  `app.js:378` 改为 `const EXAM_BANK_EXT_INDEX = 'assets/data/exam-bank-ext-index.json?v=<VER>';`
- **联动风险**：索引被击穿后，**14 个分片的 URL 由索引 JSON 的 `shards[].file` 字段驱动**——索引换了新内容但分片 URL 不变，分片仍可能吃启发式缓存。见 §2.2。

### ③ `assets/app.js:440` → `assets/data/vocab-cet4-ext.json`（词库增量，2702 词）——保留 ✅（但即将被分片改造重写）

- **真实性**：活代码。`:458 loadVocabExt()` 启动执行，`:440 fetch('assets/data/vocab-cet4-ext.json')` **字符串字面量直连**，无变量无拼接。
- **URL 构造**：内联字面量 → 最简单，直接拼 `?v=`。
- **改动落点（方案，按现状）**：
  `app.js:440` 改为 `fetch('assets/data/vocab-cet4-ext.json?v=<VER>')`
- **⚠ 分片改造在途**：批次五任务 #1（software-engineer-shard）正把这里改成「读 `assets/data/vocab-cet4-ext-index.json` + 8 片（`vocab-cet4-ext-a-c.json` 等）」。**第③步必须以分片后的代码为准**，届时版本化点变为（见 §2.1）：
  1. 新增的 vocab 索引 fetch 处的字符串字面量；
  2. vocab 索引 JSON 里 `shards[].file` 字段（8 条）。
  建议与分片线协调：**分片代码落盘时直接预留版本钩子**，避免第③步再改一次 app.js。

### ④ `assets/voiceplayer.js:114` → `assets/data/listening-ext.json`（听力增量）——保留 ✅

- **真实性**：活代码。`voiceplayer.js:232 try { loadListeningExt(); }` 启动执行；`:112` 定义、`:114 fetch('assets/data/listening-ext.json')` **字符串字面量直连**，与 ③ 完全同构。
- **改动落点（方案）**：
  `voiceplayer.js:114` 改为 `fetch('assets/data/listening-ext.json?v=<VER>')`
- 无去重比较之类的联动陷阱，单点改即可。

---

## 2. 三处联动关系（第③步排期的关键）

### 2.1 词库分片（在途，冲突点最大）

`app.js:440` 的单文件 fetch **即将不复存在**（任务 #1 进行中）。分片后「需要版本化的点」：

| 点 | 位置 | 形态 |
|---|---|---|
| 索引 URL | 新代码里的 `fetch('assets/data/vocab-cet4-ext-index.json')` 字面量 | JS 字符串常量 |
| 分片 URL | vocab 索引 JSON 的 `shards[].file`（8 条） | **JSON 字段** |

结论：第③步对 vocab 必须**等分片代码落盘后**再动手；或把「加 `?v=`」直接并入分片线的改动（一处提交解决），否则 app.js 会被两条线各改一遍，产生合并冲突。

### 2.2 题库分片（已上线结构，同构参考）

`assets/data/exam-bank-ext-index.json` 实测格式（头部 + 15 个 file 字段）：

```json
{
  "version": "20260913b",          ← JSON 自带 version 字段，但仅注释性质，未参与 URL
  "legacy": { "file": "assets/data/exam-bank.json", ... },
  "shards": [
    { "file": "assets/data/exam-bank-ext-figure.json", "type": "图形推理", "count": 20 },
    ... 共 14 片（ext-* 7 片 + ext-2-* 7 片）
  ]
}
```

**在 JSON 里带 `?v=` 的可行性评估：可行，但有一个代码级陷阱。**
- 可行：`app.js:431 files.forEach(f => loadExamBankShard(f))` → `:403 fetch(url)`，字段值原样透传给 fetch，`"assets/data/exam-bank-ext-figure.json?v=xxx"` 能正常请求（nginx 静态服务忽略查询串）。
- 陷阱：`app.js:429` `if (lg !== EXAM_BANK_LEGACY) files.push(lg)`——这是防止 legacy 被直连+索引重复加载两遍的去重。若 `EXAM_BANK_LEGACY` 常量加了 `?v=` 而 `index.legacy.file` 没加（或反之），字符串不等 → **legacy 被加载两遍**（幂等合并下无害但浪费一次请求；更重要的是去重逻辑名存实亡）。
- **规则**：要么两边同版本同写法，要么把 `:429` 的比较改为「去查询串后再比」。

### 2.3 listening（voiceplayer.js）

`:114` 单文件字面量直连，**无索引、无分片、无去重比较**——三处里最干净的一个，第③步可独立先行，用作「JS 字符串常量 + `?v=`」方案的试点。

---

## 3. 排除名单（理由 + 抽查证据）

| 类别 | 条数 | 判定 | 抽查证据 |
|---|---|---|---|
| DYNAMIC | 84 | 排除 | ① `assets/api.js:27` `fetch(window.API_BASE + '/api/auth/refresh')` 运行时拼接；② `assets/chat-local.js:730` `API_BASE + '/api/friends/requests/' + rid`；③ `动态.html:225` 头像 `apiBase() + url`；④ `assets/hotnews.js:45` `fetch(url)` 变量透传；⑤ `assets/app.js:417` `fetch(EXAM_BANK_EXT_INDEX)` —— 变量，但可追溯到 :378 常量（**此条已单列进保留名单②，其余 83 条真加不了静态版本号**） |
| COMMENTED | 63 | 排除 | ① `学习工作台.html:78` `<!-- 全局搜索（检索范围与逻辑见 assets/app.js 的 globalSearch()）-->` HTML 注释；② `assets/app.js:370-376` 块注释里提到 exam-bank.json；③ `设置.html:1268` `/* 移出：…地址统一走 assets/config.js。 */` JS 块注释 |
| prose-mention（文案） | 4 | 排除 | ① `mock_exam.html:292` `'题库加载失败：data/mock-papers.js 未注入'` 错误提示文案；② `设置.html:1238` `'接口不可用（assets/api.js 未加载）'` 错误提示文案（各 ×2 是扫描对引号两侧计数，同一处） |
| INTERNAL | 1 | 排除 | `学习工作台.html:133` SVG `stroke="url(#goalGradient)"` 片段引用，非文件 |
| ALREADY_VERSIONED | 314 | 无需本轮处理 | 12 条 `v=20260913a` 逐条核对：AI模拟面试×1、PPT素材库×1、四级经验分享×1、好友申请×2、登录×7 —— **全部属于那 5 个不加载 app.js 的页面**，与背景描述一致；其余 302 条均为 `v=20260913c` |
| EXTERNAL / DATA_URI / ERROR | 0 | — | 无 |

---

## 4. 第③步执行预案（供拍板，未替用户决定）

改动点按三类分开：

### 类一：JS 字符串常量（4 处 → 分片后可能 5 处）

- `app.js:377`、`app.js:378`、`app.js:440`（或分片后的新索引 fetch 处）、`voiceplayer.js:114`
- **方案 A：硬编码进字符串 + 扩展 bump 脚本**
  - 改动面：每个字面量加 `?v=<VER>`；给 `tools/bump_versions_0913c.py` 增加「JS 字符串常量替换」能力（沿用其行过滤/注释状态机/损坏签名门禁，铁律不破）。
  - 风险：app.js 是全站核心，改它要过既有验证器（`tools/verifier/verify_batch3_0913b.js` 等对 fetch URL 有精确匹配断言，改 URL 会打挂旧断言，需同步更新）。
- **方案 B：HTML 注入全局版本常量**
  - 页面 `<script>window.ASSET_VER='20260913d'</script>`，JS 里 `fetch('...json?v='+ASSET_VER)`。
  - 改动面：32 页都要注入 + 4 处 JS 改拼接。
  - 风险：拼接后从「静态字面量」变「运行时构造」，第①步扫描器/bump 脚本的正则体系全部失效；5 个不加载 app.js 的页面注入点各异。**改动面最大，不推荐**。

### 类二：JSON 字段（索引 shards[].file）

- `exam-bank-ext-index.json` 15 条 file 字段（1 legacy + 14 分片）；分片后的 vocab 索引 8 条。
- **方案 A'（JSON 版）**：生成/维护索引的脚本在写 `file` 字段时统一带 `?v=<VER>`，并**同步改 `app.js:429` 的去重比较为「去查询串比较」**（或保证 `EXAM_BANK_LEGACY` 与 `legacy.file` 两边同写法）。
  - 风险：凡手工改索引 JSON 忘记带版本号就会静默回退；建议由脚本统一生成而非手改。
- 注意：索引 JSON 头部已有 `"version"` 字段（当前 20260913b）但**未参与 URL**——可顺带把它升级为「实际生效」的语义锚点。

### 类三：服务器层（不动代码）

- **方案 C：nginx 给 `assets/data/**` 注入 `Cache-Control: no-cache`（或短 max-age + must-revalidate）**
  - 改动面：一行 nginx 配置 + reload，零代码改动。
  - 风险：治本但影响所有访客的缓存命中率（每次都要协商缓存回源）；且与「`?v=` 版本体系」并存时语义冗余。可作为 A/A' 的兜底或过渡。

### 我的倾向（等用户拍板，未执行）

**A + A' 组合**（JS 常量与 JSON 字段都硬编码 `?v=`，扩展 bump 脚本统一维护），C 作为可选兜底；B 不推荐。理由：与现有 `?v=20260913c` 体系同构、改动面最小、可被 bump 脚本的自动发现机制持续维护。前置条件：① 与词库分片线协调好 app.js 改动次序；② 同步修 `app.js:429` 去重比较与相关验证器断言。

---

*生成：批次五第②步 · software-engineer-version · 依据 _version_candidates_0913d.txt（470 条）与源码逐条核对。*
