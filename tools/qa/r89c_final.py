# -*- coding: utf-8 -*-
import os
BASE = r"D:\下载的文件\学习工作台"
for rel in ["更新.html", "更多.html", "assets/xt-update.js", "assets/icon-map.js", "assets/common.css"]:
    p = os.path.join(BASE, rel)
    b = open(p, "rb").read()
    crlf = b.count(b"\r\n"); loneLF = b.count(b"\n") - crlf; loneCR = b.count(b"\r") - crlf
    print("%-24s size=%d crlf=%d loneLF=%d loneCR=%d" % (rel, len(b), crlf, loneLF, loneCR))

# check no forbidden ES2017 syntax accidentally introduced in the html
for rel in ["更新.html"]:
    t = open(os.path.join(BASE, rel), "rb").read().decode("utf-8")
    bad = ["?.", "??", "replaceAll", "Object.fromEntries",
           "clamp(", "min(", "max("]
    for s in bad:
        # crude check only on inline css/js we added; report occurrences
        c = t.count(s)
        if c:
            print("  NOTE %s contains %r x%d" % (rel, s, c))
