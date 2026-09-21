# -*- coding: utf-8 -*-
import os
BASE = r"D:\下载的文件\学习工作台"

def show(rel, a, b):
    p = os.path.join(BASE, rel)
    text = open(p, "rb").read().decode("utf-8")
    lines = text.split("\n")
    for n in range(a, b + 1):
        idx = n - 1
        if 0 <= idx < len(lines):
            print("%s:%d| %s" % (rel, n, lines[idx].rstrip("\r")))
    print()

show("更新.html", 96, 130)
show("更新.html", 205, 235)

# structural pairing
for rel in ["更新.html", "更多.html"]:
    text = open(os.path.join(BASE, rel), "rb").read().decode("utf-8")
    print("==== %s structural ====" % rel)
    print("<!--", text.count("<!--"), "-->", text.count("-->"))
    print("<div", text.count("<div"), "</div", text.count("</div"))
    print("<style", text.count("<style"), "</style", text.count("</style"))
    print("<script", text.count("<script"), "</script", text.count("</script"))
    print("head-tag(regex)", text.count("<head>") + text.count('<head '))
    print()
