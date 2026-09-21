# -*- coding: utf-8 -*-
"""R89-C: probe actual file sizes / line endings / line numbers."""
import os

BASE = r"D:\下载的文件\学习工作台"

files = [
    "更多.html",
    "更新.html",
    "assets/xt-update.js",
    "assets/icon-map.js",
    "assets/common.css",
]

for rel in files:
    p = os.path.join(BASE, rel)
    if not os.path.exists(p):
        print("MISSING:", rel)
        continue
    b = open(p, "rb").read()
    crlf = b.count(b"\r\n")
    loneLF = b.count(b"\n") - crlf
    loneCR = b.count(b"\r") - crlf
    print(rel, "size=", len(b), "crlf=", crlf, "loneLF=", loneLF, "loneCR=", loneCR)

print("-" * 60)

# inspect 更新.html lines
def show(rel, nums):
    p = os.path.join(BASE, rel)
    raw = open(p, "rb").read()
    text = raw.decode("utf-8")
    lines = text.split("\n")
    for n in nums:
        idx = n - 1
        if 0 <= idx < len(lines):
            print("%s:%d| %s" % (rel, n, lines[idx].rstrip("\r")))
    print("-" * 40)

show("更新.html", list(range(1, 70)))
