# -*- coding: utf-8 -*-
import subprocess, os

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
for f in ["工具.html", "blog_wechat.html", "私聊.html", "PPT训练.html"]:
    out.append("=" * 70)
    out.append("### DIFF: " + f)
    out.append("=" * 70)
    rc, so, se = run(["git", "diff", "--unified=2", "HEAD", "--", f])
    out.append(so if so.strip() else "(no diff)")

open(os.path.join(ROOT, "tools", "qa", "_diff_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("OK")
