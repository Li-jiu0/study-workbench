# -*- coding: utf-8 -*-
import os, sys, io

ROOT = r"D:\下载的文件\学习工作台"
out = []

def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # skip node_modules / .git
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.git', '.worktrees')]
        for f in filenames:
            yield os.path.join(dirpath, f)

htmls = []
jss = []
csss = []
n = 0
for p in walk():
    n += 1
    low = p.lower()
    if low.endswith('.html'):
        htmls.append(p)
    elif low.endswith('.js'):
        jss.append(p)
    elif low.endswith('.css'):
        csss.append(p)

out.append("TOTAL_FILES=%d" % n)
out.append("HTML=%d JS=%d CSS=%d" % (len(htmls), len(jss), len(csss)))
out.append("")
out.append("=== HTML files (root + all) ===")
for p in sorted(htmls):
    out.append(os.path.relpath(p, ROOT))
out.append("")
out.append("=== CSS files ===")
for p in sorted(csss):
    out.append(os.path.relpath(p, ROOT))

with io.open(r"D:\下载的文件\学习工作台\tools\qa\_qaled_list.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("OK")
