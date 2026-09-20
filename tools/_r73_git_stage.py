# -*- coding: utf-8 -*-
# R73b git 步骤1：状态盘点 + 暂存（含 git rm --cached apk）
import subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"

def run(args):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True)
    return p.returncode, p.stdout.decode('utf-8', 'replace'), p.stderr.decode('utf-8', 'replace')

rc, out, err = run(["status", "--short"])
print("=== status --short (rc=%d) ===" % rc)
print(out[:6000])
if err.strip():
    print("STDERR:", err[:2000])

rc, out, err = run(["ls-files", "--cached", "*.apk"])
print("=== cached apk files ===")
print(out if out.strip() else "(none)")

rc, out, err = run(["remote", "-v"])
print("=== remotes ===")
print(out)
