# -*- coding: utf-8 -*-
import os, re, io, subprocess

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_sigcheck.txt")
L = []
def w(s=""): L.append(s)
def rd(p): return io.open(p, "r", encoding="utf-8", errors="replace").read()

w("=== 1. 「损坏签名」正则的实际命中样本（判断是不是我正则写错）===")
pat = re.compile(r'\.js\?v=[0-9A-Za-z]+"[^>]')
shown = 0
for fn in sorted(os.listdir(ROOT)):
    if not fn.lower().endswith(".html"):
        continue
    t = rd(os.path.join(ROOT, fn))
    for m in pat.finditer(t):
        a = max(0, m.start() - 45)
        w("  %-22s ...%s..." % (fn, t[a:m.end()+25].replace("\n", "\\n")))
        shown += 1
        if shown >= 8:
            break
    if shown >= 8:
        break
w("  --> 共 %d 条样本（见上，若引号后是空格/属性名则属正常 HTML，非损坏）" % shown)

w("")
w("=== 2. 真正的跨行污染检查：?v= 后的版本号是否包含换行/注释符 ===")
bad = 0
for fn in sorted(os.listdir(ROOT)):
    if not fn.lower().endswith(".html"):
        continue
    t = rd(os.path.join(ROOT, fn))
    for m in re.finditer(r'src="[^"]*?\.js\?v=([^"]*)"', t):
        v = m.group(1)
        if "\n" in v or "--" in v or "<" in v or ">" in v:
            bad += 1
            w("  [BAD] %s  v=%r" % (fn, v[:60]))
w("  跨行/吞注释的版本号 = %d  (必须 0)" % bad)

w("")
w("=== 3. style 计数失衡的两页：是本次引入还是既有？ ===")
for fn in ["PPT训练.html", "个人中心.html"]:
    t = rd(os.path.join(ROOT, fn))
    hits = []
    for i, ln in enumerate(t.split("\n")):
        if re.search(r"<style\b", ln) or "</style" in ln:
            hits.append("  L%-5d %s" % (i+1, ln.strip()[:120]))
    w("  -- %s : <style x%d / </style x%d --" % (fn, len(re.findall(r"<style\b", t)), t.count("</style")))
    for h in hits[:10]:
        w(h)
    # git 基线
    r = subprocess.run(["git", "show", "HEAD:" + fn], cwd=ROOT, capture_output=True)
    try:
        o = r.stdout.decode("utf-8", errors="replace")
        w("     HEAD 基线: <style x%d / </style x%d" % (len(re.findall(r"<style\b", o)), o.count("</style")))
    except Exception as e:
        w("     HEAD 基线读取失败: %s" % e)
    w("")

w("=== 4. 确认 PPT训练.html 本次是否被改动（git diff）===")
r = subprocess.run(["git", "diff", "--stat", "--", "PPT训练.html"], cwd=ROOT,
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
w(r.stdout.strip() if r.stdout.strip() else "(无代码改动，仅版本戳)")
r2 = subprocess.run(["git", "diff", "--", "PPT训练.html"], cwd=ROOT,
                    capture_output=True, text=True, encoding="utf-8", errors="replace")
d = r2.stdout
keep = [l for l in d.split("\n") if l.startswith(("+", "-")) and not l.startswith(("+++", "---"))]
w("  本次 diff 行：%d 条" % len(keep))
for l in keep[:6]:
    w("     " + l.strip()[:140])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("ok")
