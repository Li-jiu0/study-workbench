# -*- coding: utf-8 -*-
import os
BASE = r"D:\下载的文件\学习工作台"
text = open(os.path.join(BASE, "更新.html"), "rb").read().decode("utf-8")
lines = text.split("\n")
for n in range(211, 226):
    print("%d| %s" % (n, lines[n-1].rstrip("\r")))
print()
print("morepage-title count:", text.count("morepage-title"))
print("检测更新 count:", text.count("检测更新"))
