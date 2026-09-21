# -*- coding: utf-8 -*-
import io, re, os
ROOT = r"D:\下载的文件\学习工作台"
FILES = [r"assets\ai-page.js", r"assets\xt-aiusage.js"]

CHECKS = [
    ("replaceAll(.", r"\.replaceAll\("),
    ("optional-chain ?.", r"\?\."),
    ("nullish ??", r"\?\?"),
    ("Object.fromEntries", r"Object\.fromEntries"),
    (".at(", r"\.at\("),
    ("lookbehind (?<= (?<!", r"\(\?<[=!]"),
    ("exponent **", r"[A-Za-z0-9_\)\]]\s*\*\*\s*[A-Za-z0-9_\(]"),
    ("spread {...", r"\{\s*\.\.\."),
    ("rest/spread ...", r"\.\.\."),
    ("optional catch binding", r"catch\s*\{"),
    ("alert/confirm/prompt", r"\b(alert|confirm|prompt)\s*\("),
]

out = []
for rel in FILES:
    p = os.path.join(ROOT, rel)
    with open(p, "rb") as f:
        b = f.read()
    txt = b.decode("utf-8")
    out.append("=== %s  crlf=%d  lf=%d ===" % (rel, b.count(b"\r\n"), b.count(b"\n")))
    for label, pat in CHECKS:
        hits = []
        for m in re.finditer(pat, txt):
            ln = txt[:m.start()].count("\n") + 1
            ls = txt.rfind("\n", 0, m.start()) + 1
            le = txt.find("\n", m.start())
            hits.append("L%d: %s" % (ln, txt[ls:le].strip()[:110]))
        out.append("  [%s] %d hit" % (label, len(hits)))
        for h in hits[:12]:
            out.append("      " + h)

with io.open(os.path.join(ROOT, r"tools\_t04_es2017_out.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
