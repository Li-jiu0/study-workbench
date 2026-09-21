# -*- coding: utf-8 -*-
"""R88-A: 改动前探测目标文件行尾与字节数（只读，不改）。"""
import os

ROOT = r"D:\下载的文件\学习工作台"
FILES = [
    os.path.join(ROOT, "assets", "xt-aiusage.js"),
    os.path.join(ROOT, "ai-settings.html"),
]

for p in FILES:
    with open(p, "rb") as f:
        b = f.read()
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    cr = b.count(b"\r")
    print(p)
    print("  bytes =", len(b))
    print("  LF    =", lf, " CRLF =", crlf, " CR =", cr, " lone_CR =", cr - crlf)
    print("  EOL   =", "LF" if cr == 0 else ("CRLF" if cr == crlf else "MIXED"))
    print()
