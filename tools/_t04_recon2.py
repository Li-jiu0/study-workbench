# -*- coding: utf-8 -*-
import io, re, os
ROOT = r"D:\下载的文件\学习工作台"
out = []

def readt(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    with open(p, "rb") as f:
        return f.read().decode("utf-8", "replace")

api = readt(r"assets\api.js")
out.append("=== api.js token/user/session globals ===")
if api:
    for pat in ["localStorage", "token", "TOKEN", "currentUser", "window.XT_", "getCurrentUser", "auth"]:
        idxs = [m.start() for m in re.finditer(re.escape(pat), api)]
        out.append("%r -> %d" % (pat, len(idxs)))
    # print lines containing token/localStorage
    for m in re.finditer(r".*(?:localStorage|window\.XT_|getCurrentUser|user\b).*", api):
        s = m.group(0).strip()
        if len(s) > 0 and len(s) < 200:
            out.append("   | " + s)

# ai-settings.html read-only: find script includes near ai-page / ai-service ordering & setUsageRoot
ash = readt("ai-settings.html")
out.append("\n=== ai-settings.html: script srcs + setUsageRoot ===")
if ash:
    for m in re.finditer(r"<script[^>]*src=\"([^\"]+)\"", ash):
        out.append("   script: " + m.group(1))
    for m in re.finditer(r"setUsageRoot", ash):
        ln = ash[:m.start()].count("\n") + 1
        out.append("   setUsageRoot at L%d" % ln)
else:
    out.append("NOT FOUND")

# find which HTML includes xt-aiusage.js
out.append("\n=== pages including xt-aiusage.js ===")
for fn in os.listdir(ROOT):
    if fn.lower().endswith(".html"):
        t = readt(fn)
        if t and "xt-aiusage.js" in t:
            out.append("   " + fn)

with io.open(os.path.join(ROOT, r"tools\_t04_recon2_out.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
