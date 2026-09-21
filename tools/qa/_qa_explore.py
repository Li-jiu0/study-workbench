# -*- coding: utf-8 -*-
import os, sys, io
ROOT = r"D:\下载的文件\学习工作台"
out = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    depth = dirpath[len(ROOT):].count(os.sep)
    if depth > 3:
        dirnames[:] = []
        continue
    rel = os.path.relpath(dirpath, ROOT)
    out.append("DIR " + rel)
    for f in sorted(filenames):
        out.append("  " + os.path.join(rel, f))
p = os.path.join(ROOT, "tools", "qa", "_explore_out.txt")
os.makedirs(os.path.dirname(p), exist_ok=True)
with io.open(p, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
print("WROTE", p, len(out))
