# -*- coding: utf-8 -*-
"""R88-M5: verify CRLF preserved and record final byte sizes for touched files."""
import os

BASE = r"D:\下载的文件\学习工作台"
FILES = [
    (r"assets\xt-profile.js", 108663),
    (r"assets\xt-profile.css", 33569),
]

for rel, orig in FILES:
    p = os.path.join(BASE, rel)
    with open(p, "rb") as f:
        data = f.read()
    size = len(data)
    crlf = data.count(b"\r\n")
    lone_lf = data.count(b"\n") - crlf
    lone_cr = data.count(b"\r") - crlf
    print("FILE %s" % rel)
    print("  bytes        : %d  (was %d, delta %+d)" % (size, orig, size - orig))
    print("  CRLF pairs   : %d" % crlf)
    print("  lone LF      : %d" % lone_lf)
    print("  lone CR      : %d" % lone_cr)
    print("  CRLF_OK      : %s" % ("YES" if lone_lf == 0 and lone_cr == 0 else "NO"))
