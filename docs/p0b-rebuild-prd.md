# 星途 · P0-B 重建增量 PRD · 2026-09-12

> 作者：许清楚（产品经理）｜状态：待评审（用户已拍板本批次范围）
> 范围：**只描述本批次 P0-B 重建增量**，不重做整张需求清单；5 个任务卡（T01/T02 保留+验证，T03/T04 按手册重做，T05 撤回）。
> 与已有文档关系：与《全模块优化升级版指令手册-2026-09-12.md》《星途平台改进-需求清单.md》《星途平台-合并实施路线图-2026-09-12.md》严格一致；本文件只承接「本批次要做/不做/怎么做」的三层决策。
> 写作纪律：可验证、可勾选、可追责；不接受"差不多"。

---

## 0. 本批次目标（一段话）

把工作区里 P0-B 遗留的 5 个任务**收口到手册第十二~十四章硬规则**：

- **T01（密码强度）** 与 **T02（图形推理题干）** 已在工作区完成，仅做 QA 复测后收口；
- **T03（真题模考引擎）** **必须**废弃 `assets/mock-exam.js` 的弹窗层，按手册第二章「三独立页 + 9 题型 + 计时器 + 答题卡 + 成绩页 + 历史最高分」整体重做；
- **T04（24 页接入）** **必须**在原图标扫表基础上补齐手册第十二章「设计令牌 + 四状态 + 空数据/错误提示 + skeleton + 已保存反馈 + 键盘可访问性」全部硬规则，**不允许**仅做图标替换就上线；
- **T05（HTTPS 方案文档）** 用户已撤回，本批不做，工作区该文件不入库。

不达任一条硬规则 = 不允许上线本批次任何一项。

---

## 1. 项目信息

| 项 | 内容 |
|---|---|
| Language | 中文（与项目语言一致） |
| Programming Language | 前端：原生 JS + 原生 CSS（零 CDN，`file://` 双击可直开，APK WebView 内可运行）；后端：FastAPI + SQLAlchemy + SQLite |
| Project Name | `xingtu_p0b_rebuild` |
| 仓库根目录 | `D:\下载的文件\学习工作台` |
| 版本号目标 | 统一 bump 到 **`20260912c`**（现网 `20260912a`），仅作用于真实 `<script src>` / `<link href>` 行（脚本自动化） |
| 命名口径（需求 19） | **真题模考**（题源为网上搜集真题；不改为手册用词「模拟模考」） |
| 数据文件形态 | `data-*.js` 挂 `window`（**不**用 `fetch JSON`，理由：`file://` 直开 + APK WebView 取本地文件兼容） |
| 图标系统 | **扩展** `assets/icon-map.js` 对齐手册模块 10 的 `getIcon(name,size)` 语义，**不另建** `js/icons.js`（避免双轨） |

---

## 2. 任务卡 T01 — 密码强度（保留现状 + QA 验证）

### 2.1 用户故事

> 作为在意账号安全的备考用户，我注册 / 改密时如果用 `123456`、`test123456` 这类弱密码，必须被前后端双校验**当场拒绝**并给出明确理由，而不是先收下、登录后撞库。

### 2.2 范围与现状

| 项 | 内容 |
|---|---|
| 现状位置 | 前端 `登录.html` / `设置.html`；后端 `server/schemas.py`（`check_password_strength` + denylist 含 `test123456` 等） |
| 上次完成度 | 42/42 自测 PASS（`tools/verify_p0b_all.js`），未走完整 QA |
| 本批动作 | **不重写**，只补 QA |

### 2.3 Acceptance Criteria（输入 / 操作 / 期望）

| # | 输入 | 操作 | 期望 |
|---|---|---|---|
| AC-1.1 | `123456` | 在 `登录.html` 注册路径输入密码 | 前端红字提示「密码强度不足：需 ≥8 位且包含字母与数字」；表单 submit 按钮置灰；网络请求**不**发出 |
| AC-1.2 | `test123456` | 同上 | 前端拒绝；进一步命中 denylist，提示「该密码过于常见，请更换」 |
| AC-1.3 | `Abc12345` | 同上 | 前端通过校验；POST `/api/auth/register` 成功 |
| AC-1.4 | 在 `设置.html` 改密路径输入 `12345678`（8 位但无字母） | 点保存 | 前端拒绝 |
| AC-1.5 | 后端绕过前端（curl 直发）`{"password":"12345678"}` | 调注册 | 后端返回 422，错误信息含「密码强度不足」字样（不是 500） |
| AC-1.6 | denylist 命中 `test123456` | 同上 | 后端返回 422 + 「过于常见」字样 |
| AC-1.7 | `Abc12345` | 改密成功后 | `localStorage` 内 `study_workbench_*` 业务键**不被清空**（与需求 15 一致：不退出登录、不清本地进度） |

### 2.4 依赖

- 无（独立可收口）。
- 须在 QA 跑通后，与 T02 合并做一次联合回归，避免重复占线。

### 2.5 产出文件清单

| 类型 | 路径 | 说明 |
|---|---|---|
| 新增 | `tools/qa/qa_t01_password.js` | jsdom + 文件扫描，遍历 AC-1.1~AC-1.7，每条打印 PASS/FAIL |
| 修改 | 无（不重写代码） | — |
| 删除 | 无 | — |
| 数据 | 无 | — |

### 2.6 交付格式（每模块必出，按手册第十七章）

新增文件 / 修改文件 / 删除文件 / 数据文件 / 实现功能（仅 QA 复测）/ 验收结果 / 待更新数据清单。

---

## 3. 任务卡 T02 — 图形推理题干（保留现状 + QA 验证）

### 3.1 用户故事

> 作为做行测图推题的备考用户，我看到的题干**只描述图形**，不直接告诉我答案规律；规律与解析在交卷后才看到。

### 3.2 范围与现状

| 项 | 内容 |
|---|---|
| 现状位置 | 题库数据 `assets/data/exam-bank.json`；加载逻辑 `assets/app.js` |
| 上次完成度 | `tools/verify_q21_figures.js` 输出「禁词零命中」28/28 PASS |
| 本批动作 | **不重写**，只补 QA + 一次结构核验 |

### 3.3 Acceptance Criteria

| # | 输入 | 操作 | 期望 |
|---|---|---|---|
| AC-2.1 | 加载 `assets/data/exam-bank.json` 后遍历所有图推题 | grep 禁词表（包含「依次在左/右/上/下」「逆时针」「对称轴」「一笔画」等显式规律词） | 命中数 = 0（与 `verify_q21_figures.js` 口径一致） |
| AC-2.2 | 任意一道图推题的题干 | 在 `行测刷题.html` 答一遍 | 题干只描述图形（行列 / 元素 / 数量变化），不含答案路径 |
| AC-2.3 | 提交答卷后 | 打开解析 | 解析中允许出现规律描述（这是该出现的位置） |
| AC-2.4 | `app.js` JSON 覆盖 loader | 启动页面 | JSON 加载失败时**回退**到内嵌兜底数据，控制台 warn，不崩溃（手册第十三章「缺失数据时页面不能直接崩溃」） |
| AC-2.5 | 题库字段结构 | 检查任意题 | 字段稳定：`id`/`type`/`q`/`o`/`a`/`x` 齐全，缺字段不静默吞错 |

### 3.4 依赖

- 无。
- 与 T01 并行可。

### 3.5 产出文件清单

| 类型 | 路径 | 说明 |
|---|---|---|
| 新增 | `tools/qa/qa_t02_figures.js` | 复跑 `verify_q21_figures.js` + 字段结构自检（AC-2.5） |
| 修改 | 无 | — |
| 删除 | 无 | — |

### 3.6 交付格式

同 §2.6。

---

## 4. 任务卡 T03 — 真题模考引擎（🛑 必须按手册第二章整体重做）

### 4.1 用户故事

> 作为备考四级 / 央国企笔试的用户，我点「真题模考」进入的是一个**真套卷全屏考试界面**，可以按阶段（写作→听力→阅读→翻译）推进，125 分钟倒计时自动判分，考完看到客观题正确率与主观题参考答案，**不**再是 5 题 15 分钟弹窗选择题。

### 4.2 处置决策（与手册 §2 的硬冲突）

| 现状 | 处置 |
|---|---|
| `assets/mock-exam.js` 用了 `me-mask` 全屏 mask + `me-box` 弹层 | **废弃弹窗层**（手册第十二章「主要功能禁止弹窗/模态框」） |
| `mock-exam.js` 7 套卷的数据结构 `{ id, title, minutes, questions:[{q,o,a,x,scored?}] }` | **复用**该数据结构，迁移到独立页 + data-*.js |
| 题型**只有** single_choice | **新增** 9 题型（见 §4.4） |
| 没有计时器持久化（刷新丢） | **新增** `setInterval` 计时 + 用户前缀 localStorage 恢复 |
| 没有答题卡（只能上一题/下一题） | **新增** 答题卡（按题型分组，未答灰 / 已答绿 / 当前蓝） |
| 没有阶段进度（写作→听力→阅读→翻译） | **新增** 阶段 pill 进度条 |
| 没有独立成绩页 | **新增** `mock_exam_result.html`（含总分视觉中心、客观题解析、主观题参考答案、历史最佳） |
| `四级备考.html` / `央国企笔试.html` 上的卡片 `desc` 写「套卷模考 + 计时判分 + 成绩归档」 | 描述继续保留（命名口径「真题模考」按需求 19）；链接改跳独立页 |

### 4.3 Acceptance Criteria

#### 4.3.1 选卷页 `mock_exam.html`

| # | 输入 | 操作 | 期望 |
|---|---|---|---|
| AC-3.1.1 | 用户 A 登录，访问 `四级备考.html` → 点「真题模考」卡 | 跳转 | 落到 `mock_exam.html?cat=cet-mock`（不再开弹窗） |
| AC-3.1.2 | 选卷页顶部 | 视觉自检 | 顶部说明「真题模考 · 按真实考试时间计时 · 自动判分」 |
| AC-3.1.3 | 任一套卷卡片 | 视觉自检 | 显示卷名、写作/听力/阅读/翻译题型分布、总题数、总时长（默认 125 分钟，配置可调）、难度、历史最高分、当前状态（未开始 / 进行中 / 已完成） |
| AC-3.1.4 | 状态为「进行中」的套卷 | 进入 | 卡片上显式标「继续考试」按钮，右侧展示「已答 X/Y」与剩余时间 |
| AC-3.1.5 | 状态为「已完成」的套卷 | 进入 | 卡片展示成绩 + 正确率，按钮变「查看成绩 / 再次挑战」 |
| AC-3.1.6 | 四级页有 `lsKey('study_workbench_cet4_goal_date')` | 顶部展示 | 显示「距目标考试还剩 N 天」；空值时显示「--」并提示去「学习工作台 · 我的目标」设置；**绝不**显示假天数 |
| AC-3.1.7 | 央国企页 | 顶部展示 | **整行隐藏**倒计时（与现状一致：不显示假数据） |
| AC-3.1.8 | 加载 `data-mock-papers.js` | 任何异常（脚本 404 / JSON 解析失败） | 卡片区显示空状态「暂无套卷」+ 重试按钮，**不**崩溃（手册第十四条第 6 项） |
| AC-3.1.9 | 用户 B 登录 | 访问 | 不显示 A 的进行中/已完成状态（手册第十三章：localStorage key 带当前用户名） |

#### 4.3.2 考试页 `mock_exam_run.html`

| # | 输入 | 操作 | 期望 |
|---|---|---|---|
| AC-3.2.1 | 选卷页点任一套卷 | 点 | 跳 `mock_exam_run.html?paper=cet-demo-1`，进入全屏考试界面 |
| AC-3.2.2 | 顶部固定栏 | 视觉自检 | 显示卷名 / 当前题号 / 总题数 / 倒计时 mm:ss / 「交卷」按钮 |
| AC-3.2.3 | 主体布局 | 视觉自检 | 左 70% 题目区 + 右 30% 答题卡（移动端：底部固定答题卡抽屉） |
| AC-3.2.4 | 答题卡 | 视觉自检 | 按阶段（写作 / 听力 / 阅读 / 翻译）分组；未答 = 灰、已答 = 绿、当前题 = 蓝边；显示「已答 X/Y」；点击题号直接跳转 |
| AC-3.2.5 | 阶段进度 pill | 视觉自检 | 顶部显示 4 个阶段 pill，当前阶段高亮，已完成阶段打勾 |
| AC-3.2.6 | `renderQuestion(question)` 分发 | 代码自检 | 按 `question.type` switch 9 题型（见 §4.4），**禁止**只有 single_choice |
| AC-3.2.7 | 写作题（type=essay） | 答题 | 大 textarea + 实时字数统计 + 每 5 秒自动保存草稿到 `lsKey('study_workbench_mockexam_<paperId>_draft_<qid>')` |
| AC-3.2.8 | 翻译题（type=translation） | 答题 | 中文原文 + 大 textarea + 实时字数统计 |
| AC-3.2.9 | 听力题（type=listening） | 答题 | 音频播放 / 暂停按钮 + 进度条 + 当前时间 / 总时长显示；音频源来自 `data-mock-papers.js` 的 `audioUrl` |
| AC-3.2.10 | 阅读题（type=reading） | 答题 | 文章与小题同时可见（左侧文章 + 右侧小题列表），不弹窗 |
| AC-3.2.11 | 完形填空（type=cloze） | 答题 | 文章 + 编号空 + 下拉选项 |
| AC-3.2.12 | 倒计时 | 浏览器刷新页面 | 剩余时间从 `lsKey('study_workbench_mockexam_<paperId>_state')` 恢复（断电/刷新不丢） |
| AC-3.2.13 | 倒计时归零 | 自动 | 触发自动交卷（`submitExam(true)`），跳到 `mock_exam_result.html` |
| AC-3.2.14 | 点「交卷」但还有未答 | 弹出确认 | 「还有 N 题未答，确定交卷吗？」二次确认；取消则继续考试（**不是浏览器原生 confirm 大弹窗阻断**，而是用 `assets/common.css` 内 `<div class="confirm-mask">` 轻量确认条；见 §6 不再做清单） |
| AC-3.2.15 | 客观题答完点下一题 | 自动判分 | UI 即时反馈对错 + 解析（解析只展示客观题；主观题解析在成绩页展示） |
| AC-3.2.16 | 主观题 | 提交 | **不自动评分**（手册第十二章；需求 19 红线：禁假 AI 评分）；存草稿、写入交卷记录 |
| AC-3.2.17 | 移动端（视口 ≤ 768px） | 答题 | 顶部栏不遮挡内容；textarea 高度 ≥ 200px；答题卡折叠为底部抽屉，按钮触控 ≥ 44×44px |
| AC-3.2.18 | Esc / 浏览器关闭 | 离开 | 触发 `beforeunload` 轻量提示「考试进行中，离开将保留进度」 |

#### 4.3.3 成绩页 `mock_exam_result.html`

| # | 输入 | 操作 | 期望 |
|---|---|---|---|
| AC-3.3.1 | 考试页交卷 | 自动 | 跳 `mock_exam_result.html?paper=cet-demo-1&run=<runId>` |
| AC-3.3.2 | 顶部总分 | 视觉自检 | 大字号总分（百分制）+ 「答对 X / Y 题 · 用时 mm:ss」 |
| AC-3.3.3 | 各部分表现 | 视觉自检 | 写作 / 听力 / 阅读 / 翻译 / 总分 五段，每段单独正确率与建议（建议按题目分布自动生成，**禁**造假） |
| AC-3.3.4 | 题目回顾列表 | 视觉自检 | 每题展示：题干 + 你的答案 + 正确答案 + 解析；客观题与主观题分区 |
| AC-3.3.5 | 主观题 | 视觉自检 | 展示用户答案 + 参考答案（来自 `data-mock-papers.js` 的 `referenceAnswer`），**不**显示自动分数 |
| AC-3.3.6 | 历史最佳 | 视觉自检 | 与该卷历次成绩比较，标「本次 vs 历史最佳」 |
| AC-3.3.7 | 操作按钮 | 视觉自检 | 「再次挑战」「返回选卷」均用 `location.href` 跳转，**不**用弹窗 |
| AC-3.3.8 | 刷新页面 | 视觉自检 | 数据从 `lsKey('study_workbench_mockexam_<paperId>_runs')` 恢复渲染（手册第十四条第 7 项：刷新恢复进度） |

#### 4.3.4 数据契约（`data-mock-papers.js`）

```
window.MOCK_PAPERS_DATA = {
  "cet-mock": {
    "title": "四级 · 真题模考",
    "defaultMinutes": 125,
    "stages": ["writing", "listening", "reading", "translation"],
    "papers": [
      {
        "id": "cet-demo-1",
        "title": "四级体验卷",
        "year": 2023,                 // 真题年份；占位 = null
        "source": "公开样题",          // 来源；占位 = null
        "difficulty": "中",
        "minutes": 30,                 // 体验卷缩短，正式卷 = 125
        "stageMinutes": {...},         // 可选：分阶段计时
        "questions": [
          {
            "id": "cet-demo-1-q1",
            "type": "single_choice",  // 9 选 1，见 §4.4
            "stage": "listening",
            "q": "题干预留",
            "o": ["A. ...", "B. ...", "C. ...", "D. ..."],
            "a": 0,
            "x": "解析",
            "audioUrl": null,         // 仅 listening 用
            "referenceAnswer": null,  // 仅 essay/translation 用
            "scored": true
          },
          ...
        ]
      },
      ...
    ]
  },
  "exam-mock": { ... }                  // 央国企同样结构
};
```

- 9 题型对应字段：`single_choice` / `multiple_choice` / `true_false` / `reading` / `cloze` / `essay` / `translation` / `listening` / `fill_blank`。
- 本批**先落地** 9 题型**渲染外壳**（题型不崩、可答题、可保存），每种题型**至少 1 道**真实示例题（来自手册/可识别来源）。
- 真题数据分批填入：**本批**先把 `assets/mock-exam.js` 中现有 7 套卷的题目迁过来并标注 `type: "single_choice"` + 阶段；后续 P1 阶段按需补其他题型。

### 4.4 9 题型 `renderQuestion()` 分发规范

> **强制**：模考 / 任何练习页统一用 `renderQuestion(q)`，**禁止**在页面里直接 `q.o.forEach(...)` 手写选项。

```
function renderQuestion(q, state) {
  switch (q.type) {
    case 'single_choice':    return renderSingleChoice(q, state);
    case 'multiple_choice':  return renderMultipleChoice(q, state);
    case 'true_false':       return renderTrueFalse(q, state);
    case 'reading':          return renderReading(q, state);     // 文章 + 小题列表
    case 'cloze':            return renderCloze(q, state);       // 文章 + 编号空 + select
    case 'essay':            return renderEssay(q, state);       // textarea + 字数
    case 'translation':      return renderTranslation(q, state); // 中文 + textarea
    case 'listening':        return renderListening(q, state);   // audio + 选项
    case 'fill_blank':       return renderFillBlank(q, state);  // 文章 + input
    default:                 return renderUnknown(q, state);    // 永远不崩
  }
}
```

每种渲染函数必须**至少**接收 `(q, state)` 两个参数：`q` = 题对象，`state` = `{value, onChange, disabled, ...}`，由调用方注入；**禁止**在渲染函数内部直接读 `localStorage` 或操作全局（可测性）。

### 4.5 依赖

- B1（图标系统 + 设计令牌 + 删减）**已完成**；本卡消费 `lucideIcon()` 与 CSS 变量。
- P0-A（数据隔离 + 计数器同步）**已完成**或**与本卡同批**；本卡 `localStorage` 键全部经 `lsKey()` 前缀化（见 §7.1）。
- `四级备考.html` / `央国企笔试.html` 卡片 desc 改为「打开独立页」链接（与 T04 同步）。

### 4.6 产出文件清单

| 类型 | 路径 | 说明 |
|---|---|---|
| 新增 | `D:\下载的文件\学习工作台\mock_exam.html` | 选卷页（手册 §2 三页之一） |
| 新增 | `D:\下载的文件\学习工作台\mock_exam_run.html` | 全屏考试页 |
| 新增 | `D:\下载的文件\学习工作台\mock_exam_result.html` | 成绩页 |
| 新增 | `D:\下载的文件\学习工作台\data\mock-papers.js` | 7 套卷数据（挂 `window.MOCK_PAPERS_DATA`） |
| 新增 | `D:\下载的文件\学习工作台\assets\mock-engine.js` | `renderQuestion()` + 计时器 + 答题卡 + 阶段进度 + 草稿持久化 |
| 新增 | `D:\下载的文件\学习工作台\assets\mock-result.js` | 成绩页渲染与历史最佳对比 |
| 修改 | `D:\下载的文件\学习工作台\assets\mini-cet.js` | 移除 `cet-mock` 键转发（手册第十七章「不要在现有错误实现上继续打补丁」）；保留 `cet-guide` |
| 修改 | `D:\下载的文件\学习工作台\assets\mini-exam.js` | 同上，移除 `exam-mock`；保留 `exam-guide` |
| 修改 | `D:\下载的文件\学习工作台\assets\mini.js` | `begin()` 不再转发到 `mock-exam.js`；改为 `location.href = 'mock_exam.html?cat=cet-mock'` 等 |
| 修改 | `D:\下载的文件\学习工作台\assets\mock-exam.js` | **删除**整个文件（防回归）；QA 脚本需加白名单 |
| 修改 | `D:\下载的文件\学习工作台\四级备考.html` | 「真题模考」卡 `onclick` 改跳 `mock_exam.html?cat=cet-mock`；移除 `<script src="assets/mock-exam.js">` |
| 修改 | `D:\下载的文件\学习工作台\央国企笔试.html` | 同上，跳 `mock_exam.html?cat=exam-mock` |
| 修改 | `D:\下载的文件\学习工作台\assets\common.css` | 新增 `.mock-*` 系列样式 + `.answer-card` + `.stage-pill` + `.confirm-mask` |
| 删除 | 无（mock-exam.js 通过 modify 删除） | — |

### 4.7 交付格式

按手册第十七章：新增 / 修改 / 删除文件 + 数据文件（`data/mock-papers.js`）+ 实现功能（按 AC-3.1~AC-3.3 编号打勾）+ 验收结果 + 待更新数据清单（哪些题目仍是占位题、哪些 stage 暂未配齐）。

---

## 5. 任务卡 T04 — 24 页接入（🛑 必须按手册第十二章整体重做）

### 5.1 用户故事

> 作为星途的任意用户，我点开任意一个功能页面，看到的应该是统一的视觉（同一套设计令牌）、统一的四种状态反馈（加载 / 空数据 / 错误 / 已保存）、统一的图标风格（lucide linear），而**不是**每个页面的样式都长得不一样。

### 5.2 现状与硬冲突

| 现状 | 与手册的冲突 |
|---|---|
| `assets/icon-map.js` 已上线（批次五 T04，19 个 lucide 图标 + 自动扫描 `data-icon`），侧栏 24 页已替换 | ✅ 通过，但**仅做图标替换**未触及四状态 / 设计令牌 / skeleton / 错误兜底 → 继续往每页加代码会**引入新的样式分叉**（用户原话） |
| 24 页各自硬编码 `font-size:14px`、`color:#333`、`border-radius:8px` 等魔法值 | ❌ 缺手册第十二章设计令牌（主色/圆角/阴影/间距/字体层级 → CSS 变量） |
| 24 页各自写加载逻辑 / 空状态 / 错误提示（有 / 无 / 风格各异） | ❌ 缺手册第十二章「加载 skeleton、空数据、错误三类状态」硬规则 |
| 列表 / 详情 / 表单的「已保存」反馈：有 toast、有 inline、无反馈 | ❌ 缺手册第十二章「所有保存动作给轻量反馈，禁止大弹窗」 |
| 表单 / 按钮 / 列表项 的 `tabindex`、`aria-label`、`role` 不一致 | ❌ 缺手册第十二章「键盘操作和移动端触控区域不得过小」 |
| 24 页顶部结构各异（有的有 `.topbar`，有的没有 `.page-head`，有的混着用） | ❌ 缺手册第十二章「统一页面顶部结构」 |

### 5.3 24 页清单（绝对路径）

> 根目录 `D:\下载的文件\学习工作台\`，**不含** 备份/`备份/`、草稿（`settings_*.html` / `profile*.html` / `设置_旧版.html`）。

| # | 页面 | 当前接入度 | T04 重做要点（按需勾选） |
|---|---|---|---|
| 1 | `学习工作台.html` | 仅图标 | ☐ 设计令牌 ☐ 四状态 ☐ skeleton ☐ 已保存 ☐ 键盘 |
| 2 | `四级备考.html` | 图标 + 真题模考卡片 | ☐ 设计令牌 ☐ 四状态 ☐ skeleton ☐ 已保存 ☐ 键盘 ☐ T03 联动改链 |
| 3 | `央国企笔试.html` | 图标 + 真题模考卡片 | 同上 |
| 4 | `高情商表达.html` | 仅图标 | ☐ 设计令牌 ☐ 四状态 ☐ skeleton ☐ 已保存 ☐ 键盘 |
| 5 | `商务礼仪.html` | 仅图标 | 同上 |
| 6 | `商务礼仪面试.html` | 仅图标 | 同上 |
| 7 | `PPT训练.html` | 仅图标 | 同上 |
| 8 | `PPT案例拆解.html` | 仅图标 | 同上 |
| 9 | `PPT版式库.html` | 仅图标 | 同上 |
| 10 | `万能金句库.html` | 仅图标 | 同上 |
| 11 | `场景话术库.html` | 仅图标 | 同上 |
| 12 | `学习博客.html` | 仅图标 | 同上 |
| 13 | `错题本.html` | 仅图标 | 同上 |
| 14 | `面试题库.html` | 仅图标 | 同上 |
| 15 | `行测刷题.html` | 仅图标 | 同上 |
| 16 | `四级词汇.html` | 仅图标 | 同上 |
| 17 | `工具.html` | 仅图标（批次五已改） | 同上 |
| 18 | `更多.html` | 仅图标 | 同上 |
| 19 | `设置.html` | 仅图标 | 同上 |
| 20 | `个人中心.html` | 仅图标 | 同上 |
| 21 | `私聊.html` | 仅图标 | 同上 |
| 22 | `动态.html` | 仅图标 | 同上 |
| 23 | `blog_wechat.html` | 仅图标 | 同上 |
| 24 | `登录.html` | **无侧栏**（独立页），仍计入 | ☐ 设计令牌 ☐ 四状态（注册/登录失败/网络断开） ☐ 键盘 ☐ 已保存 |

> 重做要点可在 24 页之间**复用**（设计令牌 / skeleton / toast 都是公共 CSS，不重复造轮子）；T04 的实质工作量 = **公共基础 + 24 页逐页接入**。

### 5.4 公共基础（一次写好，24 页共享）

| 模块 | 路径 | 内容 |
|---|---|---|
| 设计令牌 CSS | `assets/common.css` 末尾追加 `:root { --xt-... }` | 主色 `--xt-primary`、背景 `--xt-bg`、文字主/次 `--xt-text/--xt-text-dim`、边框 `--xt-border`、成功/警告/错误、圆角 `--xt-radius-sm/md/lg`、阴影 `--xt-shadow-sm/md/lg`、间距 `--xt-space-1..8`、字体层级 `--xt-font-xs..xxl` |
| 按钮四级语义 | 同上 | `.xt-btn-primary` / `.xt-btn-secondary` / `.xt-btn-text` / `.xt-btn-danger` |
| 四状态组件 | 新增 `assets/states.css` | `.xt-skeleton`（骨架块，150–300ms 过渡）/ `.xt-empty`（空状态，图标 + 文案 + CTA）/ `.xt-error`（错误状态，红色边 + 重试按钮）/ `.xt-toast`（顶部 1.6s 自动消失的轻量反馈） |
| 顶部结构 | 新增 `assets/page-head.css` | `.xt-page-head`（标题 + 副标题 + 返回 + 操作）+ `.xt-subpage-header`（面包屑，与批次四 `#1` 一致） |
| 全局错误兜底 | 新增 `assets/error-boundary.js` | `window.onerror` / `unhandledrejection` → toast 兜底（不阻断学习流），并发到 `console.error` |
| 图标系统扩展 | 修改 `assets/icon-map.js` | 在手册模块 10 列出的 22 个操作类图标的范围内**至少**补齐：`play` / `pause` / `check` / `close` / `arrow-left` / `clock` / `edit` / `delete` / `search` / `plus` / `star` / `fire` / `trophy` / `headphones` / `pen` / `mic` / `languages` / `chart` / `settings` / `logout` / `locked` / `done` / `in-progress`（与手册一致，沿用现有 `lucideIcon()` / `data-icon` 自动扫描，不另建文件） |

### 5.5 24 页逐页接入规范（每页必做清单）

> 每页接入时**必须**走完下面 6 步；任何一步缺失视为该页未接入。

| 步 | 动作 | 验收物 |
|---|---|---|
| 1 | **设计令牌替换**：grep 该页所有 `font-size:` / `color:` / `border-radius:` / `box-shadow:` / `padding:` / `margin:` 等魔法值 → 改成 `var(--xt-...)`；仅保留页面专属、无法抽象的视觉值 | grep 该页无 `font-size:\s*\d+px`（除 `var(--xt-...)`）；无 `color:\s*#[0-9a-f]{3,6}` 直接写法（除 `--xt-*` 定义处） |
| 2 | **四状态组件接入**：列表区加 `.xt-skeleton`（3 行起）/ `.xt-empty`（数据为空时）/ `.xt-error`（数据加载失败时 + 重试按钮） | 任一列表区在数据到达前 / 空 / 失败 三种情形分别显示对应组件，**不**留白、不崩 |
| 3 | **保存动作反馈**：所有 `localStorage.setItem` / `fetch(POST)` 后调 `window.xtToast('已保存')`（轻量顶部 toast，1.6s 自动消失，禁大弹窗） | grep 该页 `localStorage.setItem\|fetch(.*POST\|fetch(.*PUT\|fetch(.*DELETE` 之后必有 `xtToast` 或注释「无需反馈的原因」 |
| 4 | **键盘可访问性**：所有 `<button>` / `<a>` 加 `:focus-visible` 样式；表单元素 `tabindex` 自然顺序；图标按钮加 `aria-label` | 按 Tab 可遍历全部交互元素；图标按钮 `aria-label` 覆盖率 = 100% |
| 5 | **顶部结构统一**：替换各页自创的 `.topbar` / `.page-header` / `.head` 为 `.xt-page-head`（标题 + 副标题 + 返回 + 操作） | 该页 DOM 中**仅** `.xt-page-head` 一种头部 class |
| 6 | **mobile 自检**（视口 ≤ 768px）：横向溢出 / 固定栏遮挡 / textarea 高度 / 答题卡宽度 / 按钮触控 ≥ 44×44px / 字体 ≥ 12px | DevTools 切到 iPhone 12 / Pixel 5 两档视口手动过一遍 |

### 5.6 Acceptance Criteria（汇总）

| # | 输入 | 操作 | 期望 |
|---|---|---|---|
| AC-4.1 | 任选 24 页中的任意一页 | 浏览器 DevTools 查看 `:root` | 全部 CSS 变量定义存在（`--xt-primary` 等 30+ 个）；该页**零**硬编码颜色/字号魔法值（除 var 定义处） |
| AC-4.2 | 任选 24 页中的任意一个列表区 | 在数据到达前 / 加载失败 / 数据为空 三种情形分别触发 | 三种状态分别渲染 `.xt-skeleton` / `.xt-error`（含重试）/ `.xt-empty`（含 CTA），**不**白屏、**不**崩 |
| AC-4.3 | 任选 24 页中的任意保存操作 | 触发保存 | 顶部弹出 `.xt-toast`「已保存」，1.6s 自动消失；**不**用 `alert()` / 大弹窗 |
| AC-4.4 | 任选 24 页中的任意交互元素 | Tab 键遍历 | 可达；图标按钮 `aria-label` 非空 |
| AC-4.5 | 任选 24 页中的任意一页 | 切到 ≤ 768px 视口 | 无横向滚动；按钮触控 ≥ 44×44px；字体 ≥ 12px；固定栏不遮挡主体内容 |
| AC-4.6 | 24 页 | 全仓 grep | 无遗留功能 emoji（`🔍` `🔥` `✅` `⏱️` 等）；无 `font-size:\s*\d+px` 硬编码；无 `<div class="me-mask">` 弹窗；无 `<div class="dialog">` 等 |
| AC-4.7 | 任选 24 页中的任意一页 | 打开页面 | 顶部结构统一为 `.xt-page-head`；图标经 `data-icon` 渲染；样式全部走 CSS 变量 |

### 5.7 依赖

- B1（图标系统扩展 / 设计令牌 / 删减）**在本卡内**完成（公共基础 §5.4）。
- 公共基础就绪后，24 页**可并行**接入（每页独立 commit，互不阻塞）。
- 真题模考卡片的跳转链改动（§4.6）随 T03 同步。

### 5.8 产出文件清单（聚合）

| 类型 | 路径 | 说明 |
|---|---|---|
| 新增 | `assets/states.css` | 四状态组件 |
| 新增 | `assets/page-head.css` | 顶部结构 + 面包屑 |
| 新增 | `assets/error-boundary.js` | 全局错误兜底 |
| 修改 | `assets/common.css` | 设计令牌 `:root { --xt-... }` + 按钮四级 + `.xt-toast` |
| 修改 | `assets/icon-map.js` | 补齐 22 个操作类图标 |
| 修改 | 24 页 `.html` 各自 | 按 §5.5 六步接入 |

### 5.9 交付格式

按手册第十七章 + 本批次「公共基础 + 24 页逐页接入」明细；新增 / 修改 / 删除文件（公共基础）+ 数据文件（无）+ 实现功能（按 24 页逐页打勾）+ 验收结果（24 页 × 6 步 = 144 个勾）+ 待更新数据清单（若有页面仍残留硬编码值，列文件名+行号）。

---

## 6. 跨任务共享约定（必须统一遵守）

### 6.1 localStorage 键前缀：`lsKey()` 封装

> 封装函数已存在（`assets/app.js` `window.lsKey`），本批次**只调用**、**不**重写。

```
// 用法
window.localStorage.getItem(window.lsKey('study_workbench_mockexam_cet-demo-1_state'))
// 实际写入 = '<用户名>_study_workbench_mockexam_cet-demo-1_state'
```

**禁止**：
- 直接 `localStorage.setItem('study_workbench_xxx', ...)` 写裸键；
- 直接 `localStorage.getItem('study_workbench_xxx')` 读裸键；
- 自创 `getKey()` / `withUser()` 等别名封装（统一用 `lsKey`）。

**已知键（仅本批次新增/复用）**：

| 键模式 | 用途 | 任务 |
|---|---|---|
| `<user>_study_workbench_mockexam_<paperId>_state` | 倒计时 + 当前题号 + 各阶段剩余 | T03 |
| `<user>_study_workbench_mockexam_<paperId>_draft_<qid>` | 主观题草稿（每 5 秒） | T03 |
| `<user>_study_workbench_mockexam_<paperId>_runs` | 历史成绩数组 | T03 |

### 6.2 数据文件形态：`data-*.js` 挂 window 模板

> 手册第十三章写「JSON + fetch」，但项目必须 `file://` 直开 + APK WebView 取本地文件 → **落地为 `data-*.js`**（schema 严格按手册 JSON），挂到 `window.<NAME>` 上。

**模板**：

```
/* data-mock-papers.js — schema 按手册第十三章；不 fetch，挂 window */
(function () {
  'use strict';
  if (window.MOCK_PAPERS_DATA) return;
  window.MOCK_PAPERS_DATA = {
    /* ... */
  };
})();
```

**禁止**：
- 用 `<script type="application/json">` 嵌 JSON（IE 老 WebView 解析不一致）；
- 用 `fetch('data/mock-papers.json')`（`file://` 下 CORS 报错）；
- 把数据写进 HTML 内（违反手册第十四条第 4 项）。

### 6.3 图标调用：`icon-map.js` `lucideIcon()` 规范

> 手册模块 10 写 `js/icons.js + getIcon(name,size)`；项目已有 `assets/icon-map.js` + `window.lucideIcon(name,size)`（同语义）。**扩展**现有字典，**不**另建文件。

**HTML 调用**（自动扫描，无需手写 `<svg>`）：

```
<span class="nav-icon" data-icon="book-open" data-icon-size="20"></span>
<span class="btn-icon" data-icon="check" data-icon-size="18"></span>
```

**JS 动态调用**：

```
element.innerHTML = window.lucideIcon('clock', 24);
```

**禁止**：
- 直接 `<svg>...</svg>` 手写（违反手册模块 10）；
- 用 emoji（`🔥`、`✅`、`⏱️` 等）作为功能图标（手册第十四条第 10 项）；
- 在 `icon-map.js` 之外另建图标字典文件（避免双轨）。

**字典补齐优先级**（本批次必须）：`play` / `pause` / `check` / `close` / `arrow-left` / `clock` / `edit` / `delete` / `search` / `plus` / `star` / `fire` / `trophy` / `headphones` / `pen` / `mic` / `languages` / `chart` / `settings` / `logout` / `locked` / `done` / `in-progress`。

### 6.4 API 调用封装：`window.api`

> 项目已统一走 `assets/api.js` 的 `window.api.*`；本批次**只调用**、**不**自创 fetch。

**错误处理模板**（每处 fetch 必走）：

```
try {
  const data = await window.api.someCall(...);
  // 渲染
} catch (e) {
  window.xtToast('加载失败，请重试', 'error');
  // 显示 .xt-error 组件 + 重试按钮（不只 toast）
}
```

### 6.5 全局错误兜底：`assets/error-boundary.js`

- `window.onerror` / `window.onunhandledrejection` → toast + console.error；
- **不阻断**学习流（不跳白屏、不弹大模态）；
- 生产模式可关 toast（仅留 console），便于排查。

---

## 7. 不再做清单（🛑 工程严禁触碰）

| # | 不做项 | 原因 |
|---|---|---|
| 7.1 | **任何学习功能用弹窗 / 模态框承载**（`<div class="me-mask">`、`<div class="dialog">`、`<div class="modal">` 等） | 手册第十二章；用户原话「之前接入只做表面，缺设计令牌...禁弹窗」 |
| 7.2 | **把主观题（写作 / 翻译）自动判分** | 手册第十二章；数据诚实红线（禁假 AI 评分）—— 主观题只展示参考答案 |
| 7.3 | **企业笔试经验编造来源**（无来源标「待更新」是允许的；编造「某年某月某考生」是禁止的） | 手册第八章 + 数据诚实红线 |
| 7.4 | **把任意学习选择题混进客观题模板**（即 mock-exam.js 现状的退化版） | 手册第十二章「9 题型」+ 第十四条第 11 项 |
| 7.5 | **`assets/mock-exam.js` 弹窗层继续打补丁**（保留 / 修 bug） | 路线图 B2：「不要在现有错误实现上继续打补丁」，本批次**整文件删除** |
| 7.6 | **HTTPS + 域名方案文档入库**（`docs/HTTPS+APP跨端改造方案-2026-09-12.md`） | T05 已撤回；本批不做，工作区该文件不入库、不提交 |
| 7.7 | **`localStorage` 裸键**（无 `lsKey()` 前缀） | 手册第十三章；需求 15 红线 |
| 7.8 | **fetch `data/*.json`**（`file://` 下 CORS 报错） | §6.2 数据文件形态约束 |
| 7.9 | **新建 `js/icons.js`**（与 `assets/icon-map.js` 双轨） | §6.3 图标调用约束 |
| 7.10 | **任何页面内硬编码颜色 / 字号 / 圆角 / 阴影 / 间距**（除 `var(--xt-...)` 定义处） | 手册第十二章设计令牌硬规则 |
| 7.11 | **emoji 作为功能图标**（`🔥` `✅` `⏱️` `🔍` 等） | 手册第十四条第 10 项 |
| 7.12 | **大弹窗阻断学习流**（`alert()` / `confirm()` 大段说明 / 全屏遮罩确认） | 手册第十二章「禁止使用大弹窗阻断学习流程」 |
| 7.13 | **凭据入库**（密码 / JWT 密钥 / API Key 写进任何 `.html` / `.js` / `.md` 入库文件） | 需求清单 G 类红线；管理员密码走环境变量 |
| 7.14 | **单文件多处样式分叉**（24 页互相复制粘贴样式） | T04 实质原因：禁止继续制造分叉 |

---

## 8. 验收门（按手册第十四条 14 项 + 第十七章）

> **强制**：本批次 5 个任务全部完成、提交前，**必须**对每条验收项给出 PASS / FAIL 证据。任何一项 FAIL = 不允许上线。

### 8.1 第十四条 14 项验收

| # | 手册条目 | 本批次验收方式 | 通过判据 |
|---|---|---|---|
| 1 | 学习功能无弹窗 | grep `D:\下载的文件\学习工作台\*.html` + `assets/*.js` 全仓 | 无 `<div class="me-mask">` / `.dialog` / `.modal` / `alert(` / `confirm(`（除已声明的轻量 `.confirm-mask` 确认条） |
| 2 | 每模块与名称匹配 | 按 AC-3.1~AC-3.3 + 24 页逐页自检 | 真题模考有计时+答题卡+成绩页；阅读有文章；翻译有输入框；口语有多轮对话；案例有逐句分析；知识有卡片；企业有详情 |
| 3 | 9 题型 `renderQuestion()` | `assets/mock-engine.js` 单测 | switch 9 个 case 全覆盖；每个 case 至少 1 题真实示例 |
| 4 | 数据从 `data-*.js` 加载 | grep `fetch\(.*\.json` | 全仓 `fetch('*.json')` 命中数 = 0 |
| 5 | localStorage key 带用户名 | grep `localStorage\.(get\|set)Item\(['"]study_workbench_` | 全仓命中数 = 0（裸键一律 0）；所有业务键经 `lsKey()` |
| 6 | 四状态齐备 | 24 页逐页走 AC-4.2 | 每页 `.xt-skeleton` / `.xt-empty` / `.xt-error` / `.xt-toast` 全部存在 |
| 7 | 刷新恢复进度 | 模考页倒计时刷新、主观题草稿刷新 | 数据从 `lsKey()` 恢复，**不**丢 |
| 8 | 列表 → 详情 → 返回 | 24 页手动自检 | 任一列表点详情再点返回，URL hash / 历史栈正常 |
| 9 | 移动端无横向滚动 / 按钮过小 / 固定栏遮挡 | DevTools iPhone 12 / Pixel 5 视口 | 24 页逐一过，零问题 |
| 10 | 无功能 emoji | 全仓 grep `[🔥✅⏱️🔍📚🎯💡⚠️❌📝🔊]` | 命中数 = 0 |
| 11 | 主观题不自动评分 | `mock-exam.js` 删除 + 新引擎对 essay/translation 仅展示参考答案 | 自动评分代码路径不存在 |
| 12 | 企业经验有来源字段 | 占位（本批 T04 不动企业库；列入 P1 验收） | T06 / B5 验收，本批 N/A |
| 13 | 完整可运行文件 | QA 工具 `node --check` 全 `assets/*.js` + 24 页 HTML 解析无报错 | 0 语法错 |
| 14 | 一个模块做完测试再做下一个 | QA 报告按 T01→T02→T03→T04 顺序出 | 任一模块未通过不进下一个 |

### 8.2 第十七章交付格式（每任务必出）

```
=== <任务编号> · <任务名> ===
新增文件：<绝对路径>（按 §x 清单）
修改文件：<绝对路径>
删除文件：<绝对路径>
数据文件：<绝对路径>（data-*.js）
实现功能：
  - AC-x.x.x ✅
  - AC-x.x.x ✅
  - ...
验收结果：<AC 列表 + 自测脚本输出>
待更新数据清单：<哪些题仍是占位 / 哪些图标 key 尚未补齐 / 哪些页面 24 页之外的待办>
```

---

## 9. 待确认的开放问题

| # | 问题 | 候选方案 | 建议 | 等谁拍板 |
|---|---|---|---|---|
| 9.1 | T03 重做后，是否仍保留 `四级备考.html` / `央国企笔试.html` 上的「真题模考」卡片作为入口？还是只放侧栏跳转？ | A. 保留卡片（与手册第十二章「统一顶部结构」一致）  B. 仅侧栏入口（更干净） | A（保持现状、改链接即可） | 主理人 |
| 9.2 | T04 重做期间，24 页是否允许**逐页 commit**（每页独立验收）？还是必须 24 页一次性提交？ | A. 逐页 commit（风险小、可回滚）  B. 一次性提交（节奏快） | A（与手册第十四条第 14 项「一个模块做完测试再做下一个」一致） | 主理人 |
| 9.3 | T03 数据源：网上搜集真真题（需求 19）**版权风险**由谁评估？是先小批量 1-2 套上线，再法务评估？还是先评估后上线？ | A. 先小批量上线，标「来源待核」  B. 先评估后上线 | A（与需求 19「先小批量验证再扩充」一致；本批先用占位 + 来源 null） | 主理人 + 用户 |
| 9.4 | T04 公共基础「设计令牌」的命名空间前缀 `xt-` 是否保留？还是用项目已有前缀（如 `.xt-` / `.yt-`）？ | A. `xt-`（星途）  B. `mpc-`（既有 `mpc-icon`） | A（不破坏既有 `mpc-icon`；xt = xingtu） | 主理人 |
| 9.5 | T05 HTTPS 文档虽然本批不入库，但**工作区文件** `docs/HTTPS+APP跨端改造方案-2026-09-12.md` 是否需要从工作区**物理删除**？还是保留在工作区不入 git？ | A. 物理删除  B. 保留在工作区但不 commit | B（防止误操作丢文档；Q 线启动时再决定） | 主理人 |
| 9.6 | T03 9 题型中，`fill_blank` 的 UI 形态是 input 还是 select？手册未明确。 | A. `<input type="text">`  B. `<select>` 下拉  C. 题干声明 + 引擎按 `blankType` 分发 | C（最灵活；本批先落地 C 框架，字段 `blankType: 'text'\|'select'`） | 架构师 |

> 如有歧义，主理人 / 架构师请在动工前回复；如默认「建议」方案无异议，直接按建议执行。

---

## 10. 一句话 TL;DR

**T01 / T02 不重写，只跑 QA；T03 整页重做（弹窗 → 三独立页 + 9 题型 + 计时器 + 答题卡 + 成绩页）；T04 24 页接入从「图标替换」升到「设计令牌 + 四状态 + skeleton + 已保存 + 键盘可访问性」全规范；T05 不入库；任何页面继续用弹窗、任何主观题继续自动评分、任何 emoji 继续当功能图标 = 不允许上线。**

---

*文档结束。本 PRD 不替代架构设计；架构师 / 工程师请基于本 PRD 落地下一步架构与实现。*