# -*- coding: utf-8 -*-
"""列出 deploy/stamp/plink/upload 相关文件（写文件后读）。"""
import os
R = r"D:\下载的文件\学习工作台"
OUT = os.path.join(R, "tools", "_t05_prep_ls.txt")
L = []
def w(s=""): L.append(str(s))

w("--- tools 下 deploy/stamp/plink/upload/r72/r87 相关 ---")
td = os.path.join(R, "tools")
for n in sorted(os.listdir(td)):
    low = n.lower()
    if any(k in low for k in ("deploy", "stamp", "plink", "upload", "r87", "r72", "verif")):
        p = os.path.join(td, n)
        w("  %-52s %s" % (n, os.path.getsize(p) if os.path.isfile(p) else "<dir>"))

w("")
w("--- 根目录 .ps1 / deploy / upload 相关 ---")
for n in sorted(os.listdir(R)):
    low = n.lower()
    if low.endswith(".ps1") or "deploy" in low or "upload" in low:
        p = os.path.join(R, n)
        w("  %-52s %s" % (n, os.path.getsize(p) if os.path.isfile(p) else "<dir>"))

w("")
w("--- tools/verifier 下 ---")
vd = os.path.join(td, "verifier")
if os.path.isdir(vd):
    for n in sorted(os.listdir(vd)):
        w("  " + n)
else:
    w("  (无)")

w("")
w("--- 是否存在 plink.exe ---")
for cand in [os.path.join(td, "plink.exe"), os.path.join(R, "plink.exe")]:
    w("  %s -> %s" % (cand, os.path.exists(cand)))

w("")
w("--- 技能文档 ---")
sk = r"C:\Users\ATM\.workbuddy\skills\study-workbench-deploy\SKILL.md"
w("  %s -> %s" % (sk, os.path.exists(sk)))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(L))
print("done")
