# -*- coding: utf-8 -*-
"""R90 QA 侦察：文件清单 / 字节数 / 行尾 / git 状态"""
import os, subprocess, json

ROOT = r"D:\下载的文件\学习工作台"
TARGETS = [
    "assets/xt-profile.js", "assets/xt-profile.css",
    "私聊.html", "assets/xt-region.js",
    "assets/xt-moments.js", "朋友圈发布.html",
    "assets/xt-aiusage.js", "AI.html",
    "assets/common.css",
    "个人资料.html", "地区选择.html", "个人中心.html",
    "server/routers/ai.py",
]

out = []
out.append("=== FILE SIZE / EOL ===")
for rel in TARGETS:
    p = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.exists(p):
        out.append("%-32s MISSING" % rel)
        continue
    b = open(p, "rb").read()
    crlf = b.count(b"\r\n")
    loneLF = b.count(b"\n") - crlf
    loneCR = b.count(b"\r") - crlf
    eol = "CRLF" if (loneLF == 0 and crlf > 0) else ("LF" if (crlf == 0 and loneLF > 0) else "MIXED")
    out.append("%-32s size=%-8d crlf=%-7d loneLF=%-6d loneCR=%-6d %s" % (rel, len(b), crlf, loneLF, loneCR, eol))

out.append("")
out.append("=== tools/qa listing ===")
qd = os.path.join(ROOT, "tools", "qa")
if os.path.isdir(qd):
    for f in sorted(os.listdir(qd)):
        fp = os.path.join(qd, f)
        out.append("  %-40s %d" % (f, os.path.getsize(fp) if os.path.isfile(fp) else -1))
else:
    out.append("  MISSING tools/qa")

out.append("")
out.append("=== git status (porcelain) ===")
try:
    r = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out.append(r.stdout or "(clean)")
    out.append("rc=%d" % r.returncode)
except Exception as e:
    out.append("git failed: %r" % (e,))

out.append("")
out.append("=== git log -3 ===")
try:
    r = subprocess.run(["git", "log", "--oneline", "-3"], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out.append(r.stdout or "(none)")
except Exception as e:
    out.append("git failed: %r" % (e,))

txt = "\n".join(out)
open(os.path.join(ROOT, "tools", "qa", "r90_qa_recon.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
