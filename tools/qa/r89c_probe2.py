# -*- coding: utf-8 -*-
import os
BASE = r"D:\下载的文件\学习工作台"

def show(rel, a, b):
    p = os.path.join(BASE, rel)
    text = open(p, "rb").read().decode("utf-8")
    lines = text.split("\n")
    print("==== %s  lines %d..%d ====" % (rel, a, b))
    for n in range(a, b + 1):
        idx = n - 1
        if 0 <= idx < len(lines):
            print("%d| %s" % (n, lines[idx].rstrip("\r")))
    print()

show("更新.html", 90, 260)
show("更多.html", 130, 175)
