# -*- coding: utf-8 -*-
import os

ROOT = r"D:\下载的文件\学习工作台"
out = []


def lines_of(rel):
    return open(os.path.join(ROOT, rel), "rb").read().decode("utf-8", "replace").split("\n")


# --- xt-profile.js: chat body / view wiring ---
L = lines_of("assets/xt-profile.js")
out.append("=== xt-profile.js L1495-1600 (chat view body + bind) ===")
for i in range(1494, 1600):
    if i < len(L):
        out.append("%5d| %s" % (i + 1, L[i][:190]))

out.append("")
out.append("=== xt-profile.js L1600-1760 (M5 header) ===")
for i in range(1599, 1760):
    if i < len(L):
        out.append("%5d| %s" % (i + 1, L[i][:190]))

open(os.path.join(ROOT, "_r89_probe3_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
