# -*- coding: utf-8 -*-
import os
ROOT = r"D:\下载的文件\学习工作台"
out = []

# server ai router: history endpoints
p = os.path.join(ROOT, "server/routers/ai.py")
b = open(p, "rb").read().decode("utf-8", "replace")
lines = b.split("\n")
out.append("=== server/routers/ai.py : all @router decorators + history refs (%d lines) ===" % len(lines))
for i, line in enumerate(lines, 1):
    s = line.strip()
    if s.startswith("@router.") or "history" in s.lower() or "DELETE" in line:
        out.append("%5d| %s" % (i, line[:190]))

# search whole server dir for history model / delete
out.append("")
out.append("=== server/: files mentioning 'ai_history' or 'AiHistory' ===")
for dp, dn, fn in os.walk(os.path.join(ROOT, "server")):
    if "__pycache__" in dp: continue
    for f in fn:
        if not f.endswith(".py"): continue
        q = os.path.join(dp, f)
        t = open(q, "rb").read().decode("utf-8", "replace")
        if "history" in t.lower():
            out.append("  %s (%d B)" % (os.path.relpath(q, ROOT), len(t.encode())))

open(os.path.join(ROOT, "_r89_probe5_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
