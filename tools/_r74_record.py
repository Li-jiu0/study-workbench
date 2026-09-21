# -*- coding: utf-8 -*-
# R74 需求备忘补记（只记录，不执行任何页面改动）
# 铁律：二进制读写保 CRLF；先备份 bak-pre-r74-20260917；追加写入不动原内容
import shutil, os

P = r"D:\下载的文件\学习工作台\用户需求与决策总账.md"
BAK = P + ".bak-pre-r74-20260917"

if not os.path.exists(BAK):
    shutil.copyfile(P, BAK)
    print("backup done:", BAK)
else:
    print("backup already exists:", BAK)

with open(P, "rb") as f:
    data = f.read()

CRLF = b"\r\n"
entry_lines = [
    "",
    "---",
    "",
    "## R74 备忘（2026-09-17 20:55 用户提供，**仅记录，尚未执行**）",
    "",
    "**主题：动态空间页面迁移合并 + 好友资料页优化 + 功能确认**",
    "",
    "### 一、页面迁移与合并",
    "1. 将「朋友圈.html」重命名为「动态空间.html」。",
    "2. 将「动态.html」的全部功能完整合并至「动态空间.html」，合并后移除所有对「动态.html」的引用，确保原有功能均正常可用。",
   "   ⚠️ 注：本项与此前已作废的改名计划方向一致，属用户本次明确重新下达，据用户指令执行时以本条为准（覆盖旧的「作废」口径）。",
    "3. 个人中心页面：删除「我的动态」入口，新增指向「动态空间.html」的「动态空间」入口，样式与现有菜单项保持一致。",
    "4. 全局检索并更新所有指向旧文件名或旧入口的链接与跳转，确保导航正常、无死链。",
    "",
    "### 二、好友资料页优化（宿主页：个人资料.html?user=<uid>）",
    "1. 好友状态：资料页新增「删除好友」和「设置好友备注名」功能。",
    "2. 资料页内动态模块改为列表形式展示。",
    "3. 「发消息」按钮放置在顶部卡片右侧；同时增加「删除好友」功能。",
    "4. 非好友状态：资料页显示「加好友」功能，且不显示「关于」按钮。",
    "5. 确保用户 ID 能正常显示（注意：xt-profile.js 的 6 位「用户ID」是本地哈希假 ID，真 uid 须走服务端）。",
    "",
    "### 三、功能确认与实现",
    "动态空间功能疑似尚未实现 → 逐一确认各功能是否已实际实现并补充完整；",
    "明确各功能的位置、显示条件与交互逻辑；保证好友与非好友两种状态下资料页表现一致且完整。",
    "",
    "**执行注意事项（接手者须知，动工前必读）**：",
    "- 本批涉及 app.js 路由契约：`PAGE_FILES.moments` / `pageTitles.moments` 需同步改指新文件名 `动态空间.html`，",
    "  否则 navigateTo 只打 console.warn 原地不动（动态空间上不了线的元凶）。",
    "- 全站引用点（交接文档已盘点）：app.js PAGE_FILES/pageTitles、32 页侧栏 data-page=\"moments\"、",
    "  31 页更多面板、更多.html 卡片、api.js openUserHome、chat-local.js imOpenPeerHome、",
    "  xt-moments.js:901 XTM.openUser、动态.html:536 moOpenUser、好友申请.html 页内 shim、",
    "  subpage-router.js 面包屑、个人资料.html data-href（我的动态.html）。",
    "- 「我的动态.html」是否随本次合并保留/改名未明确 → 执行前需向用户确认口径。",
    "- 改动文件须遵守：二进制读写保行尾、ES2017 上限、全局名 typeof 守卫、先备份 .bak-pre-r74-20260917、不碰 app.js 第 665 行超长行。",
    "- 完成后需打新版本戳（不得复用 20260917b 之前的旧戳），并重跑任务二十三式断言（32 页侧栏计数、插入位置、E1 回归护栏）。",
    "",
]
entry = CRLF.join(l.encode("utf-8") for l in entry_lines)

if not data.endswith(CRLF):
    entry = CRLF + entry

with open(P, "wb") as f:
    f.write(data + entry)

# 自测：确认追加成功 + 行尾无污染
with open(P, "rb") as f:
    new = f.read()
print("size:", len(data), "->", len(new))
print("R74 marker count:", new.count("R74 备忘".encode("utf-8")))
bare_lf = new.replace(CRLF, b"").count(b"\n")
cr_count = new.count(b"\r")
print("bare LF:", bare_lf, "| CR:", cr_count)
