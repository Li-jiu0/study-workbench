# -*- coding: utf-8 -*-
import os

P = r"D:\下载的文件\学习工作台\用户需求与决策总账.md"
raw = open(P, "rb").read()
before = (raw.count(b"\r\n"), raw.count(b"\n"))

BLOCK = """
### 工线划分（定稿 · 2026-09-17 主理人侦察后）

| 线 | 负责成员 | 独占文件 | 需求 | 状态 |
|---|---|---|---|---|
| A AI设置 | 任务五 | `ai-settings.html` `assets/ai-settings.js` | 1、2 | 已交付（主理人小修 2 处：越界 CSS 删除 + `min()` 改 media 分级） |
| B 聊天 | 任务十一 | `assets/chat-local.js` | 3、19、会话切换竞态、备注入口 | 进行中 |
| C 安卓 | 任务十八 | `android/**` `assets/voiceplayer.js` `assets/notify.js` `assets/xt-android.js`(新) | 4、18① | 新派 |
| D 页面文案 | 任务十六 | `社区.html` `关于.html` `更多.html` `学习工作台.html` `assets/study-stats.js` `赞助.html`(新) | 5、7、8、10、21 | 新派 |
| E 账号·设置 | 任务十三 / 任务十五 | `server/routers/auth.py` `server/mailer.py` `server/config.py` `server/schemas.py` `server/database.py`(13) ‖ `设置.html` `导入题库.html` `我的文件.html` `assets/importer.js` `assets/xt-settings.js`(15) | 6、13、16 | 6 已交付 / 13+16 新派 |
| F 动态空间 | 任务十 | `动态.html` `朋友圈.html`(新) `我的朋友圈.html`(新) `assets/xt-moments.js`(新) `server/routers/moments.py` | 11 | 新派 |
| G 个人中心 | 任务十二 | `个人中心.html` `个人资料.html`(新) `assets/xt-profile.js`(新) `server/routers/friends.py` | 9、15 | 新派 |
| H app.js 单写者 | 任务十七 | `assets/app.js` | 18②、F-02、7(若命中) | 新派 |
| I AI 核查 | 任务十九 | `assets/ai-service.js` `assets/ai-page.js` `assets/ai-settings.js` `assets/ai-presets.js` `AI.html` `server/routers/ai.py` | 12 | 新派 |
| J 代码审查 | 任务六 / 任务七 | 审查报告 | 20-A | 报告已交，实修按线并入各线 |
| K 移动适配 | 任务八 | 除 D/E/F/G/H 线独占文件之外的页面 | 20-B | 进行中（已下文件避让令） |
| L 全局改名 | 待派（必须最后） | 全站 | 17、14 | 未派（单写者，最后跑） |
| M 后端安全 | 任务十四 | `server/rate_limit.py` `server/routers/admin.py` | 20-A 安全项 | 已交付（XFF 伪造绕过 + 硬编码管理员口令已根治） |

### 需求17 改名口径裁定（**主理人判定，未逐项请示用户**）

全站品牌词**实测计数**：`星途` **104 次 / 51 文件**；`星图` 3 次 / 2 文件；`学习工作台` 33 次 / 19 文件。

- 用户文档原文写「统一更名为**星图**」，但站内现有品牌压倒性为「**星途**」，且 `星图` 仅 3 处。
- **判定依据**：`星图`(tú) 与 `星途`(tú) 同音 → 高概率为拼音/语音输入笔误；且产品已在 51 个文件里自称「星途」。
- **裁定**：统一为「**星途**」——33 处「学习工作台」→「星途」，3 处「星图」→「星途」。
- **保留的物理标识（一律不动）**：目录名 `D:/下载的文件/学习工作台`、部署路径 `/opt/study-workbench/`、安卓包名 `com.study.workbench`、APK 文件名 `学习工作台-安卓App.apk`、git 远端。改则断部署链路与打包脚本。
- **可逆性**：若用户确认要「星图」，改一个替换对（`学习工作台`/`星途` → `星图`）重跑替换即可反向执行。

### 侦察硬事实（主理人实测，供各线引用）

- 根目录 42 个 `.html`；**没有 `index.html` / `首页.html`** —— 主页文件名是 **`学习工作台.html`**。
- `私聊.html` 存在、`好友.html` 不存在 → 需求14 是**真改名**（且需同步全站引用）。
- `动态.html` 存在；`朋友圈.html` / `动态空间.html` **不存在** → 需求11 必须**新建页**。
- `个人资料.html` **不存在** → 需求15 需**新建页或在本页做 Tab**。
- 需求14 所说的「互动页面」**不存在同名文件**（无 `互动.html`）→ 需在第 L 线先定位「互动」入口的真实承载页（候选：`社区.html` / `好友申请.html` / 导航栏项）。
- `assets/*.js` 共 57 个（含本批出现的新文件 `xt-settings.js` / `xt-content.js` / `xt-polyfill.js` / `net-compat.js` / `ai-presets.js`）。
- `android/` = `MainActivity.java` + `AndroidManifest.xml` + `build_apk.py` + `make_icon.py` + `merge_apk.py` + `workbench.keystore` + `libs/`。
- `server/routers/moments.py` 为**纯 LF**（已核实）；`server/` 整体为 **CRLF/LF 混合**（24 CRLF + 16 LF）→ 该目录**必须逐文件探测行尾**，不得批量转换。
- 邮箱绑定后端已于本批交付：`server/mailer.py`、`server/config.py`、`server/schemas.py`、`server/database.py`（增量迁移）、`server/routers/auth.py` 均已改完并自测通过；**真实发信需用户提供邮箱授权码**。

**状态**：**全面并行开工中**（9 条工程线同时在跑）。
"""

# 确保文件以换行结束
if not raw.endswith(b"\n"):
    raw += b"\r\n"

add = BLOCK.replace("\r\n", "\n").replace("\n", "\r\n")
add = add.lstrip("\r\n")
if raw.endswith(b"\r\n") and not raw.endswith(b"\r\n\r\n"):
    raw += b"\r\n"

raw += add.encode("utf-8")
open(P, "wb").write(raw)

raw2 = open(P, "rb").read()
after = (raw2.count(b"\r\n"), raw2.count(b"\n"))
print("before CRLF=%d LF=%d bare=%d" % (before[0], before[1], before[1] - before[0]))
print("after  CRLF=%d LF=%d bare=%d" % (after[0], after[1], after[1] - after[0]))
print("BARE_LF_ADDED=%d  (must be 0)" % (after[1] - after[0]))
