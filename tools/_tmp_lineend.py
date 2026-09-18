# -*- coding: utf-8 -*-
import os
base = r"D:\下载的文件\学习工作台"
files = [
    "assets/ai-service.js", "assets/ai-cap-video.js", "assets/ai-cap-3d.js",
    "assets/ai-cap-image.js", "assets/ai-cap-audio.js", "assets/ai-cap-embed.js",
    "assets/ai-cap-vision.js", "assets/ai-cap-translate.js", "assets/ai-cap-registry.js",
    "server/routers/ai.py", "server/main.py", "server/config.py",
    "server/schemas.py", "server/quota_ledger.py", "server/rate_limit.py",
    "server/security.py", "server/database.py", "assets/ai-page.js",
    "assets/ai-config.js", "assets/ai-settings.js", "server/routers/update.py",
    "server/requirements.txt",
]
for f in files:
    p = os.path.join(base, f.replace("/", os.sep))
    try:
        b = open(p, "rb").read()
    except Exception as e:
        print(f"{f}: MISSING ({e})")
        continue
    cr = b.count(b"\r")
    lf = b.count(b"\n")
    eb = "LF" if cr == 0 and lf > 0 else ("CRLF" if cr == lf and cr > 0 else "MIXED")
    print(f"{f}\tsize={len(b)}\tCR={cr}\tLF={lf}\t{eb}")
