# -*- coding: utf-8 -*-
import os

D = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2d763cd8\.workbuddy\memory"
os.makedirs(D, exist_ok=True)
P = os.path.join(D, "2026-09-17.md")

BLOCK = """
## R73（第六批 · 21 项）工线定稿与并行推开 — 2026-09-17

**真实工作目录**：`D:\\下载的文件\\学习工作台`（分支 main）。worktree `C:\\Users\\ATM\\WorkBuddy\\Worktrees\\学习工作台\\main-2d763cd8` 只是空壳，**不要在里面干活**。

### 需求文档
`C:\\Users\\ATM\\Desktop\\持续升级优化.txt`（14800 字节，21 条）。用户全权授权：涉及拍板的按最优方案直接执行。

### 关键环境坑（本会话实测）
- **Bash 环境已损**：`dirname` / `head` / `ls` / `grep` / `cp` 全部 `command not found`（PortableGit 的 coreutils 链断了）。
  → 解决：改用 **PowerShell 工具**，或**全路径 python** 跑脚本：`C:\\Users\\ATM\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe`；node 用 `C:\\Users\\ATM\\.workbuddy\\binaries\\node\\versions\\22.22.2-3\\node.exe`。所有子代理任务书都要带上这条提示。
- PowerShell 直跑 `git status` 回显为空不可靠 → 用 python `subprocess.run(capture_output=True)` 写文件再 Read（老办法仍有效）。

### 侦察硬事实（新增，之前不知道）
- 根目录 42 个 html，**没有 `index.html`/`首页.html`** —— 主页是 **`学习工作台.html`**。
- `assets/*.js` 共 57 个；新出现未跟踪文件 `xt-settings.js`/`xt-content.js`/`xt-polyfill.js`/`net-compat.js`/`ai-presets.js`。
- `私聊.html` 存在、`好友.html` 不存在 → 需求14 是真改名。
- `朋友圈.html`/`动态空间.html`/`个人资料.html`/`赞助.html` 均不存在 → 需求11/15/21 都要新建页。
- 需求14 说的「互动页面」**无同名文件**（无 `互动.html`）→ 改名线必须先定位「互动」入口的真实承载页。
- **品牌词实测**：`星途` 104 次/51 文件；`星图` **仅 3 次**/2 文件（app.js 2 + ai-page.js 1）；`学习工作台` 33 次/19 文件。
  → **需求17 裁定统一为「星途」**（星图/星途 同音，判为笔误；且站内压倒性自称星途）。物理标识一律不动：目录名、`/opt/study-workbench/`、包名 `com.study.workbench`、APK 文件名、git 远端。
- `server/` 行尾为**混合**（24 CRLF + 16 LF），必须逐文件探测；`server/routers/moments.py` 已核实纯 LF。

### 本批工线（13 条）
A AI设置=任务五(已完成,主理人小修2处) / B 聊天=任务十一 / C 安卓=任务十八(新) / D 页面文案=任务十六(新) / E 账号设置=任务十三(需求6已交付)+任务十五(新) / F 动态空间=任务十(新) / G 个人中心=任务十二(新) / H app.js 单写者=任务十七(新) / I AI核查=任务十九(新) / J 代码审查=任务六+任务七(报告已交) / K 移动适配=任务八 / L 全局改名(最后派,单写者) / M 后端安全=任务十四(已交付)。

**并行纪律**：所有工程线**不执行 git add/commit/push**，**不 bump 版本戳**，由主理人统一收口。文件独占清单已下发，跨文件改动必须回报转派。

### 交付物
- `用户需求与决策总账.md` 追加「工线划分（定稿）」+「需求17 改名口径裁定」+「侦察硬事实」三段（753→795 行，**CRLF 保持，0 裸 LF**），备份 `.bak-pre-r73b-20260917`。
- `需求20-移动端适配规格与验收标准-20260917.md`（229 行，主理人撰写）。
- `tools/_r73_status.py` / `_r73_inventory.py` / `_r73_ledger_append2.py` 等侦察脚本（Bash 不可用时的替代手段）。
"""

enc = BLOCK.replace("\r\n", "\n").replace("\n", "\r\n").lstrip("\r\n")
if os.path.exists(P):
    raw = open(P, "rb").read()
else:
    raw = b"# 2026-09-17 \xe5\xb7\xa5\xe4\xbd\x9c\xe6\x97\xa5\xe5\xbf\x97\r\n"
if not raw.endswith(b"\r\n"):
    raw += b"\r\n"
if not raw.endswith(b"\r\n\r\n"):
    raw += b"\r\n"
raw += enc.encode("utf-8")
open(P, "wb").write(raw)
r2 = open(P, "rb").read()
print("lines=%d bare_lf=%d" % (r2.count(b"\n"), r2.count(b"\n") - r2.count(b"\r\n")))
