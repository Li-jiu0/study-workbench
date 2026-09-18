# -*- coding: utf-8 -*-
import os
ROOT = r"D:\下载的文件\学习工作台"
out = []

def lines_of(rel):
    return open(os.path.join(ROOT, rel), "rb").read().decode("utf-8", "replace").split("\n")

# ---- ITEM 4: 朋友圈发布.html location buttons ----
L = lines_of("朋友圈发布.html")
out.append("=== ITEM4: 朋友圈发布.html L40-75 (buttons) ===")
for i in range(39, 75):
    if i < len(L): out.append("%5d| %s" % (i+1, L[i][:230]))
out.append("")
out.append("=== ITEM4: 朋友圈发布.html  script refs ===")
for i, line in enumerate(L, 1):
    if "<script" in line:
        out.append("%5d| %s" % (i, line[:190]))

# ---- ITEM 5: 更多.html / 更新.html icons ----
out.append("")
out.append("=== ITEM5: 更多.html FULL L140-175 ===")
L3 = lines_of("更多.html")
for i in range(139, 175):
    if i < len(L3): out.append("%5d| %s" % (i+1, L3[i][:230]))

out.append("")
out.append("=== ITEM5: 更新.html  head/L1-60 ===")
L4 = lines_of("更新.html")
for i in range(0, 60):
    if i < len(L4): out.append("%5d| %s" % (i+1, L4[i][:230]))

out.append("")
out.append("=== ITEM5: 更新.html  refs to icon / logo / app icon ===")
for i, line in enumerate(L4, 1):
    lw = line.lower()
    if any(k in lw for k in ["icon", "logo", "app-", ".png", ".svg", "img "]):
        out.append("%5d| %s" % (i, line[:230]))

open(os.path.join(ROOT, "_r89_probe8_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
