# -*- coding: utf-8 -*-
"""Dump ai-cap script lines from representative pages to learn exact pattern."""
import glob
import os

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools", "_t05_dump_out.txt")

samples = ["设置.html", "AI.html", "学习工作台.html", "错题本.html"]

lines = []
for name in samples:
    p = os.path.join(ROOT, name)
    if not os.path.exists(p):
        lines.append("MISSING " + name)
        continue
    with open(p, "rb") as f:
        text = f.read().decode("utf-8", "replace")
    lines.append("========== %s ==========" % name)
    for i, ln in enumerate(text.split("\n")):
        low = ln.lower()
        if "ai-cap" in low or "ai-service.js" in low or "ai-settings.js" in low or "xt-aiusage.js" in low or "xt-update.js" in low or "ai-config.js" in low:
            lines.append("[%4d] %s" % (i + 1, ln))
    lines.append("")

# 也 dump ai-settings.html 的 ai-cap 引用 (只读)
p = os.path.join(ROOT, "ai-settings.html")
with open(p, "rb") as f:
    text = f.read().decode("utf-8", "replace")
lines.append("========== ai-settings.html (只读) ==========")
for i, ln in enumerate(text.split("\n")):
    low = ln.lower()
    if "ai-cap" in low or "ai-service.js" in low or "ai-settings.js" in low or "xt-aiusage.js" in low:
        lines.append("[%4d] %s" % (i + 1, ln))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("OK")
