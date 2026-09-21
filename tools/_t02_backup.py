# -*- coding: utf-8 -*-
"""T02 backup + EOL inspect (binary)."""
import os, sys, io, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r"D:\下载的文件\学习工作台"
src = os.path.join(ROOT, "assets", "ai-service.js")
bak = os.path.join(ROOT, "assets", "ai-service.js.bak-pre-r87-20260918")

with open(src, "rb") as f:
    data = f.read()

# backup (binary copy)
with open(bak, "wb") as f:
    f.write(data)

crlf = data.count(b"\r\n")
lf_total = data.count(b"\n")
lone_lf = lf_total - crlf

lines = [
    "backup -> %s (%d bytes)" % (os.path.basename(bak), os.path.getsize(bak)),
    "source size = %d" % len(data),
    "CRLF count  = %d" % crlf,
    "LF total    = %d" % lf_total,
    "lone LF     = %d  (== LF_total means pure LF)" % lone_lf,
]

with open(os.path.join(ROOT, "tools", "_t02_eol_out.txt"), "w", encoding="utf-8") as fo:
    fo.write("\n".join(lines))
print("done")
