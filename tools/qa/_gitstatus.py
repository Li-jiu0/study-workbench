# -*- coding: utf-8 -*-
import subprocess, io, os

REPO = r"D:\下载的文件\学习工作台"

def run(args):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True)
    def dec(b):
        try:
            return b.decode("utf-8")
        except Exception:
            return b.decode("gbk", errors="replace")
    return p.returncode, dec(p.stdout), dec(p.stderr)

out = []
for args in (["status", "--short"], ["log", "--oneline", "-8"], ["diff", "--stat", "HEAD"]):
    rc, o, e = run(args)
    out.append("=== git %s (rc=%d) ===" % (" ".join(args), rc))
    out.append(o)
    if e.strip():
        out.append("[stderr] " + e)
    out.append("")

with io.open(r"D:\下载的文件\学习工作台\tools\qa\_gitstatus.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("done")
