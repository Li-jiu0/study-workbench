import os, shutil, io

base = r"D:\下载的文件\学习工作台"
log = []

def info(rel):
    p = os.path.join(base, rel)
    with open(p, "rb") as f:
        b = f.read()
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    return len(b), crlf, lf - crlf, os.path.getmtime(p)

# ---------- 0. snapshot BEFORE ----------
tgt = "学习概括.html"
rel_notify = "assets\\notify.js"
b0, c0, l0, m0 = info(tgt)
log.append("[BEFORE] %s bytes=%d CRLF=%d bareLF=%d" % (tgt, b0, c0, l0))
bn, cn, ln, mn = info(rel_notify)
log.append("[BEFORE] notify.js bytes=%d CRLF=%d bareLF=%d" % (bn, cn, ln))

# ---------- 1. backup ----------
bak = tgt + ".bak-a8-lf2crlf"
shutil.copy2(os.path.join(base, tgt), os.path.join(base, bak))
log.append("[BAK] " + bak)

# ---------- 2. LF -> CRLF (normalize all first, then convert) ----------
src = os.path.join(base, tgt)
with open(src, "rb") as f:
    raw = f.read()
# normalize any existing CRLF to LF, then LF->CRLF (idempotent safe)
norm = raw.replace(b"\r\n", b"\n")
conv = norm.replace(b"\n", b"\r\n")
with open(src, "wb") as f:
    f.write(conv)

b1, c1, l1, m1 = info(tgt)
log.append("[AFTER ] %s bytes=%d CRLF=%d bareLF=%d" % (tgt, b1, c1, l1))
log.append("[ASSERT] CRLF>0 and bareLF==0 -> %s" % ("PASS" if (c1 > 0 and l1 == 0) else "FAIL"))

# notify.js must remain LF
bn2, cn2, ln2, mn2 = info(rel_notify)
log.append("[ASSERT] notify.js still pure LF -> %s (CRLF=%d bareLF=%d)" % (
    "PASS" if (cn2 == 0 and ln2 > 0) else "FAIL", cn2, ln2))

with open(os.path.join(base, "_a8_conv.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(log))
print("ok")
