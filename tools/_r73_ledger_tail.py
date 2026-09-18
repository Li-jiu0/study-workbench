import os
p = r"D:\下载的文件\学习工作台\用户需求与决策总账.md"
raw = open(p, "rb").read()
crlf = raw.count(b"\r\n")
lf = raw.count(b"\n")
out = []
out.append("CRLF=%d LF_total=%d bareLF=%d" % (crlf, lf, lf - crlf))
t = raw.decode("utf-8", "replace").replace("\r\n", "\n")
lines = t.split("\n")
out.append("total lines %d" % len(lines))
out.append("===== TAIL 110 =====")
out.extend(lines[-110:])
open(r"D:\下载的文件\学习工作台\tools\_r73_ledger_tail.txt", "w", encoding="utf-8").write("\n".join(out))
print("OK")
