import os
os.chdir(r"D:/下载的文件/学习工作台")
for p in ["设置.html", "更多.html", "更新.html", "assets/xt-update.js", "assets/config.js"]:
    b = open(p, "rb").read()
    cr = b.count(b"\r")
    lf = b.count(b"\n")
    crlf = b.count(b"\r\n")
    print("%s: bytes=%d LF=%d CR=%d CRLF=%d" % (p, len(b), lf, cr, crlf))
