# -*- coding: utf-8 -*-
"""把闸2 的 9 个新增符号映射到「本地哪个文件含它」（证据）。"""
import os
R = r"D:\下载的文件\学习工作台"
OUT = os.path.join(R, "tools", "_t05_symmap.txt")
TOK = ["probeNoAuto", "aiHealthCheckBatch", "unsupported_probe", "three_d",
       "hideUnavailable", "xt:health-changed", "setSortCat", "displayNameOf",
       "ark-seedance-1-0-pro"]
SCAN = [os.path.join(R, "assets"), R]
lines = []
for t in TOK:
    hb = t.encode("utf-8")
    hits = []
    for base in SCAN:
        for dp, dn, fn in os.walk(base):
            dn[:] = [d for d in dn if d not in ("node_modules", "__pycache__", ".git", "备份", ".workbuddy", "tools")]
            for f in fn:
                if not f.lower().endswith((".js", ".html", ".css")):
                    continue
                p = os.path.join(dp, f)
                try:
                    if hb in open(p, "rb").read():
                        hits.append(os.path.relpath(p, R))
                except OSError:
                    pass
        if base == R:
            break
    lines.append("%-24s -> %d 个文件: %s" % (t, len(hits), hits[:6]))
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("done")
