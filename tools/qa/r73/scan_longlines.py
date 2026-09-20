# -*- coding: utf-8 -*-
"""定位 app.js 中超长行（>20000 字符）及其内容片段。"""
import os, io
ROOT = r"D:/下载的文件/学习工作台"
p = os.path.join(ROOT, "assets/app.js")
out = []
with io.open(p, "r", encoding="utf-8", errors="replace") as f:
    for i, line in enumerate(f, 1):
        L = len(line)
        if L > 20000:
            head = line[:180].replace("\n", "\\n")
            tail = line[-120:].replace("\n", "\\n")
            out.append("line %d  len=%d\n   HEAD>> %s\n   TAIL>> %s" % (i, L, head, tail))
if not out:
    out.append("(无 >20000 的行)")
io.open(os.path.join(ROOT, "tools/qa/r73/out_longlines.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out[:4000]))
