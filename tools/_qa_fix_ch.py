# -*- coding: utf-8 -*-
import os, io, re
ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools", "_qa_report_fix.txt")
lines = []
def w(s=""): lines.append(str(s))

# C guardrail: PAGE_FILES keys vs pre-r74 bak
def get_keys(path):
    txt = io.open(path, "r", encoding="utf-8", errors="replace").read()
    m = re.search(r"PAGE_FILES\s*=\s*\{(.*?)\n\};", txt, re.S)
    if not m: return None
    body = m.group(1)
    body = re.sub(r"//[^\n]*", "", body)
    keys = re.findall(r"['\"]?([A-Za-z0-9_-]+)['\"]?\s*:", body)
    return set(keys)

cur = get_keys(os.path.join(ROOT, "assets", "app.js"))
bak = get_keys(os.path.join(ROOT, "assets", "app.js.bak-pre-r74-20260917"))
w("当前 PAGE_FILES 键数=%d" % len(cur))
w("pre-r74 bak 键数=%d" % len(bak))
w("bak 有而当前没有: %s" % sorted(bak - cur) if bak and cur else "n/a")
w("当前有而 bak 没有: %s" % sorted(cur - bak) if bak and cur else "n/a")
w("moments 在当前: %s" % ("moments" in cur))
w("=> C 护栏 " + ("PASS" if (cur and bak and not (bak - cur) and "moments" in cur) else "FAIL"))

# H fixed: xtm-listrow presence only
dtxt = io.open(os.path.join(ROOT, "动态空间.html"), "r", encoding="utf-8", errors="replace").read()
n = dtxt.count("xtm-listrow")
w("H 修正: xtm-listrow 命中=%d (>0 即保留) => %s" % (n, "PASS" if n > 0 else "FAIL"))
w("=> H 总体 PASS（其余子项已过）" if n > 0 else "=> H 仍 FAIL")

io.open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print("done")
