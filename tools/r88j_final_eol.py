# -*- coding: utf-8 -*-
"""R88-J 最终字节/行尾校验（对照改前基线）。"""
import os
BASE = r"D:\下载的文件\学习工作台"
ROWS = [
    (r"assets\xt-profile.js",  138548),  # 原始基线（改前）
    (r"assets\xt-region.js",    31620),
    (r"地区选择.html",           15925),
    (r"私聊.html",              71537),
    (r"朋友圈发布.html",         12521),
    (r"assets\xt-moments.js",   54595),
]
print("%-24s %10s %10s %8s  %5s %7s %7s  EOL" % ("file", "before", "after", "delta", "CRLF", "loneLF", "loneCR"))
for rel, before in ROWS:
    p = os.path.join(BASE, rel)
    d = open(p, "rb").read()
    crlf = d.count(b"\r\n"); lf = d.count(b"\n") - crlf; cr = d.count(b"\r") - crlf
    eol = "CRLF" if lf == 0 and crlf > 0 else ("LF" if crlf == 0 else "MIXED")
    ok = "OK" if lf == 0 and cr == 0 else "!!BAD!!"
    print("%-24s %10d %10d %+8d  %5d %7d %7d  %s %s" % (rel, before, len(d), len(d) - before, crlf, lf, cr, eol, ok))
