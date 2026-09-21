# -*- coding: utf-8 -*-
import os
BASE = r"D:\下载的文件\学习工作台"
lines = []
for rel in ["assets/xt-profile.js", "assets/xt-profile.css", "个人资料.html"]:
    p = os.path.join(BASE, rel)
    b = open(p, "rb").read()
    crlf = b.count(b"\r\n"); lf = b.count(b"\n")
    lines.append(rel + " bytes=" + str(len(b)) + " lines=" + str(lf) + " CRLF=" + str(crlf) + " loneLF=" + str(lf-crlf) + " loneCR=" + str(b.count(b"\r")-crlf))
open(os.path.join(BASE, "tools", "_m5_probe_out.txt"), "w", encoding="utf-8").write("\n".join(lines))
