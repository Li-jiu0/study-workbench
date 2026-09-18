import os

base = r"D:\下载的文件\学习工作台"
files = [
    "学习概括.html",
    "assets\\notify.js",
]
out = []
for rel in files:
    p = os.path.join(base, rel)
    if not os.path.exists(p):
        out.append("MISSING: " + rel)
        continue
    with open(p, "rb") as f:
        b = f.read()
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    bare_lf = lf - crlf
    out.append("%s | bytes=%d | CRLF=%d | bareLF=%d | mtime=%s" % (
        rel, len(b), crlf, bare_lf, os.path.getmtime(p)))

# dir listing
try:
    names = sorted(os.listdir(base))
    out.append("--- DIR (%d items) ---" % len(names))
    for n in names:
        fp = os.path.join(base, n)
        out.append(("D " if os.path.isdir(fp) else "F ") + n)
except Exception as e:
    out.append("listdir err " + str(e))

qdir = os.path.join(base, "tools", "qa")
if os.path.isdir(qdir):
    out.append("--- tools/qa ---")
    for n in sorted(os.listdir(qdir)):
        out.append("  " + n)
else:
    out.append("--- tools/qa MISSING ---")

with open(os.path.join(base, "_a8_probe.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
