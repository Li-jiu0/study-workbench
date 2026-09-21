# -*- coding: utf-8 -*-
"""R93-2：更新.html xt-update.js 引用版本号 +1 强刷缓存。
现值 v=20260918d（L384）→ v=20260918e。字节级替换，CRLF 保持。
"""
import io

P = r"D:\下载的文件\学习工作台\更新.html"
LOG = r"D:\下载的文件\学习工作台\tools\qa\r93b_patch_log.txt"

with io.open(P, "rb") as f:
    data = f.read()

crlf0 = data.count(b"\r\n"); lf0 = data.count(b"\n")
old = b'assets/xt-update.js?v=20260918d'
new = b'assets/xt-update.js?v=20260918e'
c_old = data.count(old)
c_new = data.count(new)

lines = []
lines.append("R93-B patch log for 更新.html")
lines.append("before: size=%d CRLF=%d LF=%d pureLF=%d" % (len(data), crlf0, lf0, lf0 - crlf0))
lines.append("old hit=%d (expect 1)  new-already hit=%d" % (c_old, c_new))

if c_old == 1:
    data = data.replace(old, new, 1)
    with io.open(P, "wb") as f:
        f.write(data)
    with io.open(P, "rb") as f:
        chk = f.read()
    crlf1 = chk.count(b"\r\n"); lf1 = chk.count(b"\n")
    lines.append("after: size=%d CRLF=%d LF=%d pureLF=%d" % (len(chk), crlf1, lf1, lf1 - crlf1))
    lines.append("[VERIFY] new hit=%d (expect 1)  old hit=%d (expect 0)"
                 % (chk.count(new), chk.count(old)))
    lines.append("RESULT=%s" % ("PASS" if chk.count(new) == 1 and chk.count(old) == 0 and crlf1 == crlf0 else "CHECK"))
elif c_new > 0 and c_old == 0:
    lines.append("[SKIP] already patched")
    lines.append("RESULT=PASS")
else:
    lines.append("[ABORT] unexpected occurrence; file NOT modified")
    lines.append("RESULT=CHECK")

with io.open(LOG, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
