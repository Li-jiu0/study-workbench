# -*- coding: utf-8 -*-
import os

ROOT = r"D:\下载的文件\学习工作台"
out = []
L = open(os.path.join(ROOT, "assets/xt-profile.js"), "rb").read().decode("utf-8", "replace").split("\n")

out.append("=== xt-profile.js L1885-1975 (m5PanelHtml / m5ClearAll / m5DelOne / m5DelSelected) ===")
for i in range(1884, 1975):
    if i < len(L):
        out.append("%5d| %s" % (i + 1, L[i][:190]))

out.append("")
out.append("=== xt-profile.js L2120-2215 (m5Bind) ===")
for i in range(2119, 2215):
    if i < len(L):
        out.append("%5d| %s" % (i + 1, L[i][:190]))

open(os.path.join(ROOT, "_r89_probe4_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
