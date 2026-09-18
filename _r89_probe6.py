# -*- coding: utf-8 -*-
import os
ROOT = r"D:\下载的文件\学习工作台"
out = []

def lines_of(rel):
    return open(os.path.join(ROOT, rel), "rb").read().decode("utf-8", "replace").split("\n")

# ---- ITEM 1: plus popup responsive ----
L = lines_of("私聊.html")
out.append("=== ITEM1: 私聊.html  #imPlusMenu / #imPlusMask / imPlusCss ===")
for i, line in enumerate(L, 1):
    if any(k in line for k in ["imPlusMask", "imPlusMenu", "imPlusBtn", "imPlusCss", "imPlusPick", "imPlusItem"]):
        out.append("%5d| %s" % (i, line[:190]))

out.append("")
out.append("=== ITEM1: full <style> blocks in 私聊.html mentioning imPlus- ===")
instyle = False
for i, line in enumerate(L, 1):
    if "<style" in line: instyle = True
    if instyle and "implus" in line.lower():
        out.append("%5d| %s" % (i, line[:190]))
    if "</style>" in line: instyle = False

# ---- ITEM 3: 地区选择.html scroll ----
L2 = lines_of("地区选择.html")
out.append("")
out.append("=== ITEM3: 地区选择.html  scroll containers ===")
for i, line in enumerate(L2, 1):
    lw = line.lower()
    if any(k in lw for k in ["overflow", "scroll", "max-height", "height:", "xtr-list", "xtr-body", "xtr-wrap", "xtr-sheet", "position: fixed", "position:fixed"]):
        out.append("%5d| %s" % (i, line[:190]))

open(os.path.join(ROOT, "_r89_probe6_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
