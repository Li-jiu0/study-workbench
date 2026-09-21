# -*- coding: utf-8 -*-
import os, re, io, subprocess

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/w1_predeploy.txt")
L = []
def w(s=""): L.append(s)

def read(rel):
    with io.open(os.path.join(ROOT, rel), "r", encoding="utf-8", errors="replace") as f:
        return f.read()
def write(rel, txt):
    with io.open(os.path.join(ROOT, rel), "w", encoding="utf-8", newline="") as f:
        f.write(txt)

# ---- 1. 去掉私聊.html 注释里的字面 <style>（误报源）----
p = "私聊.html"
t = read(p)
before = len(re.findall(r"<style\b", t))
t2 = re.sub(r"（布局样式见页首\s*<style>）", "（布局样式见页首样式块）", t)
if t2 != t:
    write(p, t2)
    w("[1] 私聊.html 注释清理: <style> 计数 %d -> %d" % (before, len(re.findall(r"<style\b", t2))))
else:
    w("[1] 私聊.html 未命中注释模式，<style> 计数仍为 %d" % before)

# ---- 2. bump cet-read.js 版本戳 ----
p = "四级备考.html"
t = read(p)
NEW = "20260915f"
cnt = 0
out_lines = []
for ln in t.split("\n"):
    if "<script src=" in ln and "cet-read.js?v=" in ln:
        newln = re.sub(r"(cet-read\.js\?v=)[0-9A-Za-z]+", r"\g<1>" + NEW, ln)
        if newln != ln:
            cnt += 1
        out_lines.append(newln)
    else:
        out_lines.append(ln)
t2 = "\n".join(out_lines)
if cnt:
    write(p, t2)
w("[2] 四级备考.html cet-read.js 版本戳 bump -> %s (改动 %d 行)" % (NEW, cnt))
for ln in t2.split("\n"):
    if "cet-read.js" in ln:
        w("      " + ln.strip()[:140])

# ---- 3. 终校配对 ----
w("")
w("[3] 配对终校")
for rel in ["商务礼仪面试.html", "私聊.html", "工具.html", "更多.html", "四级备考.html", "assets/cet-read.js"]:
    t = read(rel)
    o, oc = len(re.findall(r"<!--", t)), len(re.findall(r"-->", t))
    d, dc = len(re.findall(r"<div\b", t)), len(re.findall(r"</div", t))
    s, sc = len(re.findall(r"<style\b", t)), len(re.findall(r"</style", t))
    j, jc = len(re.findall(r"<script\b", t)), len(re.findall(r"</script", t))
    bad = []
    if o != oc: bad.append("注释%d/%d" % (o, oc))
    if d != dc: bad.append("div%d/%d" % (d, dc))
    if s != sc: bad.append("style%d/%d" % (s, sc))
    if j != jc: bad.append("script%d/%d" % (j, jc))
    w(("  [FAIL] %-22s %s" % (rel, " | ".join(bad))) if bad else ("  [OK]   %-22s" % rel))

# ---- 4. node --check ----
w("")
w("[4] node --check")
node = r"D:\noodejs\node.exe"
for f in ["assets/cet-read.js", "assets/app.js", "assets/api.js"]:
    fp = os.path.join(ROOT, f)
    if not os.path.exists(fp):
        w("  missing " + f); continue
    r = subprocess.run([node, "--check", fp], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    w("  rc=%d  %s" % (r.returncode, f))
    if r.stderr.strip(): w("     " + r.stderr.strip()[:200])

# ---- 5. git diff 统计 ----
w("")
w("[5] git diff --stat")
r = subprocess.run(["git", "diff", "--stat"], cwd=ROOT, capture_output=True,
                   text=True, encoding="utf-8", errors="replace")
w(r.stdout.strip()[:1500] if r.stdout.strip() else "(empty)")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with io.open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(L))
print("ok")
