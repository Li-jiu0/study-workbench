# -*- coding: utf-8 -*-
import re

p = r"D:\下载的文件\学习工作台\server\config.py"
t = open(p, "rb").read().decode("utf-8")
out = []
i = t.find("def configured_providers")
if i < 0:
    i = t.find("configured_providers")
seg = t[max(0, i - 200): i + 2200]
out.append(seg)

with open(r"C:\Users\ATM\_r88m1_prov.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
