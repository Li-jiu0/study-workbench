# -*- coding: utf-8 -*-
import os
os.chdir(r"D:/下载的文件/学习工作台")
b = open("assets/xt-update.js", "rb").read()
lines = b.split(b"\n")
for i, l in enumerate(lines):
    if b"\\u" in l:
        print("%d: %s" % (i + 1, l.decode("utf-8", "replace")))
