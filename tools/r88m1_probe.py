# -*- coding: utf-8 -*-
import os

ROOT = r"D:\下载的文件\学习工作台"
out = []
out.append("root exists: %s" % os.path.isdir(ROOT))
ad = os.path.join(ROOT, "assets")
out.append("assets exists: %s" % os.path.isdir(ad))
if os.path.isdir(ad):
    for f in sorted(os.listdir(ad)):
        out.append("   assets/" + f)
out.append("--- root files ---")
if os.path.isdir(ROOT):
    for f in sorted(os.listdir(ROOT)):
        out.append("   " + f)

with open(r"C:\Users\ATM\_r88m1_probe.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
