# -*- coding: utf-8 -*-
"""读取 xt-moments.js 的 xtmTakeRegionPick / xtmSaveDraft / xtmNav / inputSheet，供断言设计"""
import os
ROOT = r"D:\下载的文件\学习工作台"
s = open(os.path.join(ROOT, "assets", "xt-moments.js"), "r", encoding="utf-8", errors="replace").read()
lines = s.split("\n")
import re
for name in ["xtmTakeRegionPick", "xtmApplyLocation", "xtmNav", "function inputSheet", "XTM_REGION_PICK_KEY", "XTM_REGION_PICK_TTL", "xtmSaveDraft", "function xtmWriteRegionPick", "window.XTM", "window.xtm"]:
    print("=== %s ===" % name)
    for i, l in enumerate(lines):
        if name in l:
            print("%5d| %s" % (i + 1, l.rstrip()))
    print()
