# -*- coding: utf-8 -*-
import os, re, io, subprocess, glob

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_diffcheck.txt")
L = []
def w(s=""): L.append(s)
def rd(p): return io.open(p, "r", encoding="utf-8", errors="replace").read()

bans = [r"\?\.", r"\?\?", r"replaceAll\s*\(", r"Object\.fromEntries", r"\.at\s*\(",
        r"\(\?<=", r"\(\?<!", r"\bfetch\s*\(", r"\basync\b", r"\bawait\b", r"=>",
        r"\blet\b", r"\bconst\b", r"`"]

def counts(txt):
    return dict((b, len(re.findall(b, txt))) for b in bans)

pairs = [
    ("assets/app.js",
     os.path.join(ROOT, "备份", "app.js.backup-20260915-listcard.html")),
    ("学习工作台.html",
     os.path.join(ROOT, "备份", "学习工作台.backup-20260915-listcard.html")),
]

for cur_rel, bak in pairs:
    w("=== %s ===" % cur_rel)
    if not os.path.exists(bak):
        w("  !! 备份不存在: %s" % bak)
        continue
    cur = rd(os.path.join(ROOT, cur_rel))
    old = rd(bak)
    cc, oc = counts(cur), counts(old)
    new_total = 0
    for b in bans:
        d = cc[b] - oc[b]
        flag = ""
        if d > 0:
            flag = "   <<< 新增 %d" % d
            new_total += d
        elif oc[b] or cc[b]:
            flag = "   (存量 %d)" % oc[b]
        if oc[b] or cc[b] or d:
            w("  %-24s before=%-5d after=%-5d%s" % (b, oc[b], cc[b], flag))
    w("  --> 新增违规合计 = %d" % new_total)
    w("")

# 也列出本批次所有改动文件的 git diff 概况
w("=== git diff --stat ===")
r = subprocess.run(["git", "diff", "--stat"], cwd=ROOT, capture_output=True,
                   text=True, encoding="utf-8", errors="replace")
w(r.stdout.strip()[:2000] if r.stdout.strip() else "(empty)")

w("")
w("=== 备份目录最新文件（本批次）===")
bdir = os.path.join(ROOT, "备份")
fs = [f for f in os.listdir(bdir) if "20260915" in f]
for f in sorted(fs):
    w("  %s  (%d bytes)" % (f, os.path.getsize(os.path.join(bdir, f))))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("ok")
