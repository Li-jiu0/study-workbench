# -*- coding: utf-8 -*-
import os, io
ROOT = r"D:\下载的文件\学习工作台"
out = []
# root html files
out.append("=== ROOT HTML / files ===")
for f in sorted(os.listdir(ROOT)):
    if os.path.isfile(os.path.join(ROOT, f)):
        out.append("  " + f)
out.append("")
out.append("=== tools tree ===")
t = os.path.join(ROOT, "tools")
for dirpath, dirnames, filenames in os.walk(t):
    rel = os.path.relpath(dirpath, t)
    out.append("DIR " + rel)
    for f in sorted(filenames):
        out.append("  " + os.path.join(rel, f))
p = os.path.join(ROOT, "tools", "qa", "_explore2_out.txt")
with io.open(p, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
print("WROTE", p, len(out))
