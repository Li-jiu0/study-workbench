# -*- coding: utf-8 -*-
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r"D:\下载的文件\学习工作台"
out = []
# list assets dir
ad = os.path.join(ROOT, "assets")
out.append("=== assets/ ===")
if os.path.isdir(ad):
    for name in sorted(os.listdir(ad)):
        if name.startswith("ai"):
            p = os.path.join(ad, name)
            out.append("  %s  (%d bytes)" % (name, os.path.getsize(p)))
else:
    out.append("  <no assets dir>")

out.append("")
out.append("=== root files mentioning ai-cap ===")
out.append("ai-cap-registry.js exists: %s" % os.path.exists(os.path.join(ad, "ai-cap-registry.js")))

# search all js for XT_AI_CAPS.register
out.append("")
out.append("=== grep XT_AI_CAPS in assets ===")
if os.path.isdir(ad):
    for name in sorted(os.listdir(ad)):
        if not name.endswith(".js"):
            continue
        p = os.path.join(ad, name)
        try:
            with open(p, "rb") as fh:
                data = fh.read()
            if b"XT_AI_CAPS" in data:
                out.append("  %s : %d hits" % (name, data.count(b"XT_AI_CAPS")))
        except Exception as e:
            out.append("  %s : ERR %s" % (name, e))

with open(os.path.join(ROOT, "tools", "_t02_scan_out.txt"), "w", encoding="utf-8") as fo:
    fo.write("\n".join(out))
print("done")
