# -*- coding: utf-8 -*-
import os
import subprocess
ROOT = r"D:\下载的文件\学习工作台"
tools = os.path.join(ROOT, "tools")
L = []
p = subprocess.run(["git", "ls-files", "--", "tools/"], cwd=ROOT,
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
tracked = set(l for l in p.stdout.splitlines() if l.strip())
for name in sorted(os.listdir(tools)):
    fp = os.path.join(tools, name)
    if not os.path.isfile(fp):
        continue
    rel = "tools/" + name
    if name.endswith(".tar.gz") or name.startswith("_"):
        L.append("%-42s %8.1f MB  tracked=%s" % (
            name, os.path.getsize(fp) / 1024.0 / 1024.0, rel in tracked))
with open(os.path.join(tools, "_chk_tar_out.txt"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(L) if L else "无匹配")
