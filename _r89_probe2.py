# -*- coding: utf-8 -*-
import os, re, io

ROOT = r"D:\下载的文件\学习工作台"
out = []


def rd(rel):
    return open(os.path.join(ROOT, rel), "rb").read()


def txt(rel):
    return rd(rel).decode("utf-8", "replace")


# ---------- 1. 个人资料.html wiring ----------
t = txt("个人资料.html")
out.append("=== 1. 个人资料.html: chatLocal / paintChat / m5 wiring ===")
for i, line in enumerate(t.split("\n"), 1):
    if "xt-profile.js" in line or "chatLocal" in line or "paintChat" in line or "m5" in line.lower():
        out.append("  L%-5d %s" % (i, line.strip()[:150]))

# ---------- 2. xt-profile.js: AI chat record section ----------
jp = "assets/xt-profile.js"
t = txt(jp)
lines = t.split("\n")
out.append("")
out.append("=== 2. %s  (%d lines) ===" % (jp, len(lines)))
KEY = ["chatLocal", "m5PanelHtml", "m5Bind", "m5Repaint", "m5ClearAll", "m5DelOne", "m5DelSelected",
       "m5RangeBounds", "m5Filtered", "m5ToolbarHtml", "m5CardHtml", "m5EditTags", "m5ToggleFav",
       "m5Pack", "m5Export", "m5Backup", "m5Restore", "m5Merge", "m5WriteSessions",
       "xt_ai_chat_meta_v1", "ai_chat_history", "ai/history", "navs", "'chat'", '"chat"']
for i, line in enumerate(lines, 1):
    for k in KEY:
        if k in line:
            out.append("  L%-5d %s" % (i, line.strip()[:170]))
            break

# ---------- 3. 个人中心.html entry ----------
out.append("")
out.append("=== 3. 个人中心.html: AI chat record entry ===")
t2 = txt("个人中心.html")
for i, line in enumerate(t2.split("\n"), 1):
    if "对话记录" in line or "xt-profile.js" in line:
        out.append("  L%-5d %s" % (i, line.strip()[:170]))

open(os.path.join(ROOT, "_r89_probe2_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
