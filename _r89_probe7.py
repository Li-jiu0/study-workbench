# -*- coding: utf-8 -*-
import os
ROOT = r"D:\下载的文件\学习工作台"
out = []

def lines_of(rel):
    return open(os.path.join(ROOT, rel), "rb").read().decode("utf-8", "replace").split("\n")

L = lines_of("私聊.html")
out.append("=== 私聊.html L1015-1065 (imPlusCss injection) ===")
for i in range(1014, 1065):
    if i < len(L): out.append("%5d| %s" % (i+1, L[i][:260]))

out.append("")
out.append("=== 私聊.html L878-935 (imTogglePlusMenu etc) ===")
for i in range(877, 935):
    if i < len(L): out.append("%5d| %s" % (i+1, L[i][:260]))

out.append("")
out.append("=== 地区选择.html FULL (1-120) ===")
L2 = lines_of("地区选择.html")
for i in range(0, 120):
    if i < len(L2): out.append("%5d| %s" % (i+1, L2[i][:200]))

open(os.path.join(ROOT, "_r89_probe7_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
