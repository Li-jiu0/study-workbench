# -*- coding: utf-8 -*-
import os, io, sys
ROOT = r"D:\下载的文件\学习工作台"
out = io.open(r"D:\下载的文件\学习工作台\tools\_struct.txt", "w", encoding="utf-8")
def w(s=""):
    out.write(s + "\n")
for root, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '__pycache__', '.idea', 'dist', 'build')]
    rel = os.path.relpath(root, ROOT)
    depth = 0 if rel == '.' else rel.count(os.sep) + 1
    if depth > 2:
        dirs[:] = []
        continue
    w("[DIR] " + rel)
    for f in sorted(files):
        p = os.path.join(root, f)
        try:
            sz = os.path.getsize(p)
        except Exception:
            sz = -1
        w("   %-50s %8d" % (f, sz))
out.close()
print("done")
