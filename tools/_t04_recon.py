# -*- coding: utf-8 -*-
import io, re, os

ROOT = r"D:\下载的文件\学习工作台"
FILES = [
    r"assets\ai-page.js",
    r"assets\xt-aiusage.js",
]

out = []

def readb(p):
    with open(p, "rb") as f:
        return f.read()

for rel in FILES:
    p = os.path.join(ROOT, rel)
    b = readb(p)
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    total_lf_only = lf - crlf
    out.append("%s  size=%d  crlf=%d  lf_total=%d  lf_only=%d" % (rel, len(b), crlf, lf, total_lf_only))

# ai-page.js anchors
ap = os.path.join(ROOT, r"assets\ai-page.js")
txt = readb(ap).decode("utf-8")

out.append("\n=== ai-page.js anchors ===")
for pat in [r"applyListSettings", r"renderModelList", r"xt:health-changed", r"hideUnavailable",
            r"health", r"AI_BASE", r"API_BASE", r"\.ai-model-list"]:
    idxs = [m.start() for m in re.finditer(re.escape(pat), txt)]
    # line numbers
    lines = []
    for i in idxs:
        ln = txt[:i].count("\n") + 1
        lines.append(ln)
    out.append("%r -> %d hits: %s" % (pat, len(idxs), lines[:40]))

# check JS_AI_USAGE / globals defining to avoid dup decl
out.append("\n=== ai-page.js top-level var decls (first 120) ===")
for m in re.finditer(r"^\s{2}var\s+([A-Za-z_$][\w$]*)", txt, re.M):
    out.append(m.group(1))

# xt-aiusage.js
xu = os.path.join(ROOT, r"assets\xt-aiusage.js")
xt = readb(xu).decode("utf-8")
out.append("\n=== xt-aiusage.js: fetch count = %d ; serverSnapshot = %d ; API_BASE = %d ===" % (
    xt.count("fetch"), xt.count("serverSnapshot"), xt.count("API_BASE")))

# API_BASE definition search in assets/api.js
apijs = os.path.join(ROOT, r"assets\api.js")
if os.path.exists(apijs):
    t2 = readb(apijs).decode("utf-8", "replace")
    out.append("\n=== assets/api.js API_BASE hits ===")
    for m in re.finditer(r"API_BASE", t2):
        ln = t2[:m.start()].count("\n") + 1
        # print the line
        ls = t2.rfind("\n", 0, m.start()) + 1
        le = t2.find("\n", m.start())
        out.append("L%d: %s" % (ln, t2[ls:le].strip()[:160]))
else:
    out.append("\nassets/api.js NOT FOUND")

with io.open(os.path.join(ROOT, r"tools\_t04_recon_out.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("written")
