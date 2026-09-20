# -*- coding: utf-8 -*-
"""R88-J 侦察：记录待改文件的字节数 + 行尾统计。"""
import os
BASE = r"D:\下载的文件\学习工作台"
FILES = [
    r"assets\xt-profile.js",
    r"assets\xt-region.js",
    r"地区选择.html",
    r"私聊.html",
    r"朋友圈发布.html",
    r"assets\xt-moments.js",
    r"个人资料.html",
    r"个人中心.html",
    r"assets\common.css",
]
for rel in FILES:
    p = os.path.join(BASE, rel)
    if not os.path.exists(p):
        print("MISSING %s" % rel); continue
    with open(p, "rb") as f:
        data = f.read()
    size = len(data)
    crlf = data.count(b"\r\n")
    lone_lf = data.count(b"\n") - crlf
    lone_cr = data.count(b"\r") - crlf
    lines = data.count(b"\n") + (0 if len(data) == 0 or data[-1:] == b"\n" else 1)
    eol = "CRLF" if lone_lf == 0 and crlf > 0 else ("LF" if crlf == 0 else "MIXED")
    print("%-28s bytes=%7d  CRLF=%5d loneLF=%d loneCR=%d  lines=%d  EOL=%s" %
          (rel, size, crlf, lone_lf, lone_cr, lines, eol))
