# -*- coding: utf-8 -*-
"""修正 xt-update.js 中误写成字面量 \\uffXX 的注释/字符串。"""
import os
os.chdir(r"D:/下载的文件/学习工作台")
p = "assets/xt-update.js"
b = open(p, "rb").read()

# 字面量 -> 正确 UTF-8
fixes = [
    (b"\\uff0c", "，".encode("utf-8")),
    (b"\\uff08", "（".encode("utf-8")),
    (b"\\uff09", "）".encode("utf-8")),
    (b"\\uff1a", "：".encode("utf-8")),
]
for old, new in fixes:
    n = b.count(old)
    if n:
        b = b.replace(old, new)
        print("replaced %r x%d" % (old, n))

# 复查
assert b.count(b"\\u") == 0, "still has backslash-u: %d" % b.count(b"\\u")
open(p, "wb").write(b)
nb = open(p, "rb").read()
print("bytes=%d CR=%d LF=%d CRLF=%d" % (len(nb), nb.count(b"\r"), nb.count(b"\n"), nb.count(b"\r\n")))
