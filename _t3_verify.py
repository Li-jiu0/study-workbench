# -*- coding: utf-8 -*-
import os, re, io, subprocess

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_t3_verify.txt")
L = []
def w(s=""): L.append(s)
def rd(rel): return io.open(os.path.join(ROOT, rel), "r", encoding="utf-8", errors="replace").read()

app = rd("assets/app.js")
home = rd("学习工作台.html")

w("=== 1. homeModuleCardHtml 是否为首页唯一调用方 ===")
for kw in ["homeModuleCardHtml", "renderModuleProgress", "moduleProgressGrid"]:
    n = len(re.findall(kw, app))
    w("  app.js  %-24s x%d" % (kw, n))
# 全站是否别处引用
others = []
for n_ in sorted(os.listdir(ROOT)):
    if n_ in ("assets",) or not os.path.isdir(os.path.join(ROOT, n_)):
        pass
for dirpath, dirnames, filenames in os.walk(ROOT):
    if ".git" in dirpath or "备份" in dirpath or "node_modules" in dirpath:
        continue
    for fn in filenames:
        if not fn.lower().endswith((".html", ".js")):
            continue
        fp = os.path.join(dirpath, fn)
        if os.path.abspath(fp) == os.path.join(ROOT, "assets", "app.js"):
            continue
        try:
            t = io.open(fp, "r", encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        for kw in ["homeModuleCardHtml", "moduleProgressGrid"]:
            if kw in t:
                others.append("  %s  ->  %s" % (os.path.relpath(fp, ROOT), kw))
if others:
    w("  外部引用：")
    for o in others[:20]: w(o)
else:
    w("  外部引用：(none) —— homeModuleCardHtml / moduleProgressGrid 仅 app.js + 首页")

w("")
w("=== 2. 新产出元素是否在渲染函数里 ===")
i = app.find("function homeModuleCardHtml")
if i < 0:
    w("  !! 找不到 homeModuleCardHtml")
else:
    body = app[i:i+2600]
    for kw in ["module-meta-item", "module-card-head", "module-wrong", "display:block"]:
        w("  %-20s x%d" % (kw, len(re.findall(re.escape(kw), body))))

w("")
w("=== 3. 首页 CSS 关键改动 ===")
for kw in ["module-meta-item", "module-card-head", "white-space: nowrap", "text-overflow: ellipsis",
           "display: block", "minmax(180px"]:
    w("  %-24s x%d" % (kw, len(re.findall(re.escape(kw), home))))

w("")
w("=== 4. 禁用语法（两个改动文件）===")
bans = [r"\?\.", r"\?\?", r"replaceAll\s*\(", r"Object\.fromEntries", r"\.at\s*\(",
        r"\(\?<=", r"\(\?<!", r"\bfetch\s*\(", r"\basync\b", r"\bawait\b", r"=>"]
tot = 0
for name, txt in [("assets/app.js", app), ("学习工作台.html", home)]:
    hit = []
    for b in bans:
        n = len(re.findall(b, txt))
        tot += n
        if n:
            hit.append("%s x%d" % (b, n))
    w("  %-20s %s" % (name, ", ".join(hit) if hit else "0 命中"))
w("  TOTAL=%d" % tot)

w("")
w("=== 5. node --check ===")
node = r"D:\noodejs\node.exe"
r = subprocess.run([node, "--check", os.path.join(ROOT, "assets", "app.js")],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
w("  app.js rc=%d" % r.returncode)
if r.stderr.strip(): w("  " + r.stderr.strip()[:300])

w("")
w("=== 6. 配对 ===")
for name, txt in [("学习工作台.html", home), ("assets/app.js", app)]:
    r1 = [("<!--", "-->"), ("<div", "</div"), ("<style", "</style>"), ("<script", "</script>"), ("<span", "</span>")]
    parts = []
    for a, b in r1:
        ca, cb = txt.count(a), txt.count(b)
        parts.append("%s %d/%d%s" % (a, ca, cb, "" if ca == cb else " FAIL"))
    w("  %-20s %s" % (name, " | ".join(parts)))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("ok")
