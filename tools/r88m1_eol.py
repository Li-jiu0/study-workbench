# -*- coding: utf-8 -*-
import os

ROOT = r"D:\下载的文件\学习工作台"
rels = [
    "assets/ai-service.js",
    "assets/ai-settings.js",
    "assets/ai-config.js",
    "assets/xt-aiusage.js",
    "ai-settings.html",
    "AI.html",
    "server/routers/ai.py",
]
out = []
for rel in rels:
    p = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.exists(p):
        out.append("%s MISSING" % rel)
        continue
    b = open(p, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    eol = "LF" if cr == 0 else ("CRLF" if cr == crlf else "MIXED")
    out.append("%-26s bytes=%-8d LF=%-6d CRLF=%-6d CR=%-6d EOL=%s" % (rel, len(b), lf, crlf, cr, eol))

# also check mtimes for ai-service.js (shared file)
p = os.path.join(ROOT, "assets", "ai-service.js")
st = os.stat(p)
import datetime
out.append("ai-service.js mtime: %s" % datetime.datetime.fromtimestamp(st.st_mtime))

with open(r"C:\Users\ATM\_r88m1_eol.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
