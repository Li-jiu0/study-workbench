# -*- coding: utf-8 -*-
import os, io, re

ROOT = r"D:\下载的文件\学习工作台"
DOC  = os.path.join(ROOT, "交接文档-批次九-20260915.md")
LOG  = os.path.join(ROOT, "任务执行文档-20260915-全线自主执行.md")
MEM  = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-88ed6fb3\.workbuddy\memory\2026-09-15.md"

def rd(p):
    if not os.path.exists(p): return ""
    with io.open(p, "r", encoding="utf-8", errors="replace") as f: return f.read()
def wr(p, t):
    with io.open(p, "w", encoding="utf-8", newline="") as f: f.write(t)

out = []

# ---------- 交接文档：修正 N9-25 表格与验收标准 ----------
t = rd(DOC)
if t:
    old_row = "| ② | `个人中心.html` | L91-95 `subpage-group-card` → `SubpageRouter.navigate('posts')`，标题「**发贴统计**」（非\"发帖\"） | 入口卡片需删；`posts` 子页渲染逻辑（L796/L809 `#profileBoxPostsHost`、`ppStatsCard`、`.posts-mode`）**必须保留** |"
    new_row = "| ② | `个人中心.html` | L91-95 `subpage-group-card` → `SubpageRouter.navigate('posts')`，标题「**发贴统计**」 | **✅ 用户 17:38 确认：不用处理，保留不动**。该卡是 `navigate('posts')` 的正常入口（用户初判\"失效\"经核对为该卡可正常跳转），`posts` 子页全套逻辑（L796/L809 `#profileBoxPostsHost`、`ppStatsCard`、`.posts-mode`）**原样保留** |"
    if old_row in t:
        t = t.replace(old_row, new_row)
        out.append("  交接文档 ② 行已修正")
    else:
        out.append("  !! 交接文档 ② 行未匹配（可能已被改写）")

    # 修正用户原话要点第 2 条
    t = t.replace(
        "2. 个人中心页 —— 删除「发贴统计」卡片（用户反馈该入口失效）",
        "2. 个人中心页 —— 删除「发贴统计」卡片（**后经用户 17:38 确认为误判，改为不处理、保留**）"
    )
    # 修正验收标准
    t = t.replace(
        "- [ ] ① ② 入口卡片消失；`posts` / `local-data` 底层 DOM 与路由 key 完整，页面 jsdom 0 报错",
        "- [x] ② **不处理**（用户确认保留）\n- [ ] ① 「本机数据」入口卡片消失（5→4 张卡）；`posts` / `local-data` 底层 DOM 与路由 key 完整，页面 jsdom 0 报错"
    )
    # 追加好友页说明
    if "好友页截图" not in t:
        t = t.replace(
            "4. 模拟面试页 —— 「提交回答」按钮**太长**（通栏），改短",
            "4. 模拟面试页 —— 「提交回答」按钮**太长**（通栏），改短\n\n> 附：用户另发 1 张「好友」页截图，17:38 确认为**误发，忽略**，不需任何处理。"
        )
    wr(DOC, t)
    out.append("  交接文档 N9-25 已修正")

# ---------- 任务执行文档 ----------
t = rd(LOG)
if t:
    t = t.replace(
        "2. 个人中心删「发贴统计」卡 → `个人中心.html:91-95`（注：实际是 `navigate('posts')` 入口）",
        "2. ~~个人中心删「发贴统计」卡~~ → **用户 17:38 确认误判，不处理、保留**（该卡实为 `navigate('posts')` 正常入口）\n   - 附：「好友」页截图确认为误发，忽略"
    )
    t = t.replace(
        "- **`posts` / `local-data` 底层保留**：只删入口卡，路由 key、`#localStats`、`#profileBoxPostsHost` 全保留，避免 ReferenceError 白屏",
        "- **`posts` / `local-data` 底层保留**：只删「本机数据」入口卡，路由 key、`#localStats`、`#profileBoxPostsHost` 全保留，避免 ReferenceError 白屏\n- **需求收窄（17:38）**：删除范围从 2 张卡缩减为 **1 张**（仅「本机数据」），`subpage-group-card` 预期 5→4"
    )
    wr(LOG, t)
    out.append("  任务执行文档已修正")

# ---------- 项目记忆 ----------
t = rd(MEM)
if t:
    t = t.rstrip() + """

**N9-25 需求收窄（17:38 用户确认）**：
- 「发贴统计」卡片（个人中心 L91-95，`navigate('posts')`）**不删、保留** —— 用户初判"失效"为误判，核对代码证实是可正常跳转的入口。
- 「好友」页截图确认为**误发**，不做任何处理。
- 实际删除范围从 2 张卡收窄为 **1 张**（仅「本机数据」，L106-110），`subpage-group-card` 预期 5→4。
- 教训：用户口头说"失效/删除"时，先用代码核对入口是否真的存在且可达，再确认意图 —— 本次若不复核就会误删一个正常功能入口。
"""
    wr(MEM, t)
    out.append("  项目记忆已修正")

# 清理临时脚本
for f in ["_n925_probe.py", "_n925_probe2.py", "_n925_log.py", "_w1_probe.py", "_w1_probe3.py",
          "_w1_closeout.py", "_w1_closeout2.py", "_w1_final.py"]:
    p = os.path.join(ROOT, f)
    if os.path.exists(p):
        try: os.remove(p)
        except Exception: pass

with io.open(os.path.join(ROOT, "tools/qa/_fix_log2.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
