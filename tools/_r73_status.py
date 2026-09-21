import subprocess, os, sys

REPO = r"D:\下载的文件\学习工作台"
out = []

def run(args):
    p = subprocess.run(args, cwd=REPO, capture_output=True)
    return p.returncode, p.stdout.decode("utf-8", "replace"), p.stderr.decode("utf-8", "replace")

rc, so, se = run(["git", "-c", "core.quotepath=false", "status", "--porcelain"])
out.append("=== git status --porcelain (rc=%d) ===" % rc)
out.append(so or "(clean)")
if se:
    out.append("stderr: " + se[:500])

rc, so, se = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
out.append("\n=== branch ===\n" + so.strip())

rc, so, se = run(["git", "log", "--oneline", "-5"])
out.append("\n=== log -5 ===\n" + so.strip())

# count porcelain lines
rc, so, se = run(["git", "status", "--porcelain"])
lines = [l for l in so.splitlines() if l.strip()]
out.append("\n=== changed files count: %d ===" % len(lines))

with open(os.path.join(REPO, "tools", "_r73_status.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("OK")
