# -*- coding: utf-8 -*-
import subprocess, os, sys

ROOT = r"D:\下载的文件\学习工作台"
os.chdir(ROOT)

def run(args):
    p = subprocess.run(args, capture_output=True, cwd=ROOT)
    def dec(b):
        try:
            return b.decode("utf-8")
        except Exception:
            return b.decode("gbk", errors="replace")
    return p.returncode, dec(p.stdout), dec(p.stderr)

out = []
out.append("=== git status --porcelain (full) ===")
rc, so, se = run(["git", "status", "--porcelain"])
out.append(so if so.strip() else "(clean)")
if se.strip():
    out.append("[stderr] " + se)

out.append("\n=== git log --oneline -8 ===")
rc, so, se = run(["git", "log", "--oneline", "-8"])
out.append(so)

out.append("\n=== diff --stat vs HEAD ===")
rc, so, se = run(["git", "diff", "--stat", "HEAD"])
out.append(so if so.strip() else "(none)")

open(os.path.join(ROOT, "tools", "qa", "_status_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("OK")
