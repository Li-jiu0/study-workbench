# -*- coding: utf-8 -*-
"""Wave 2 整批统一 QA：语法 / 禁用语法 / ADR-3 / 版本戳清单"""
import subprocess, os, re, io

ROOT = r"D:\下载的文件\学习工作台"
os.chdir(ROOT)
OUT = []

NODE = r"D:\noodejs\node.exe"
if not os.path.exists(NODE):
    NODE = "node"

FILES = [
    "AI模拟面试.html", "PPT训练.html", "私聊.html", "工具.html", "blog_wechat.html",
    "assets/chat-local.js", "assets/voiceplayer.js",
    "assets/data-ppt-class.js", "assets/design-class.js",
    "assets/data-ppt-tips.js", "assets/ppt-tips.js",
]

# ---------- 1. 提取内联 script 并 node --check ----------
def extract_scripts(html_path):
    src = io.open(html_path, encoding="utf-8").read()
    blocks = []
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", src, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        if "src=" in attrs.lower():
            continue
        body = body.strip()
        if not body:
            continue
        blocks.append(body)
    return blocks

OUT.append("=" * 72)
OUT.append("### 1. node --check")
OUT.append("=" * 72)
tmpdir = os.path.join(ROOT, "tools", "qa", "_tmpchk")
os.makedirs(tmpdir, exist_ok=True)
targets = []
for f in FILES:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        OUT.append("[MISSING] " + f)
        continue
    if f.endswith(".js"):
        targets.append((f, p))
    else:
        blocks = extract_scripts(p)
        for i, b in enumerate(blocks):
            tp = os.path.join(tmpdir, re.sub(r"[^\w]", "_", f) + "_%d.js" % i)
            io.open(tp, "w", encoding="utf-8").write(b)
            targets.append(("%s [inline#%d]" % (f, i), tp))

bad = 0
for name, tp in targets:
    pr = subprocess.run([NODE, "--check", tp], capture_output=True)
    ok = (pr.returncode == 0)
    if not ok:
        bad += 1
    msg = pr.stderr.decode("utf-8", "replace").strip()[:300]
    OUT.append(("  OK   " if ok else "  FAIL ") + name + ("" if ok else "\n        " + msg.replace("\n", "\n        ")))
OUT.append("--> 小计: %d 个脚本, FAIL %d" % (len(targets), bad))

# ---------- 2. 禁用语法（老 WebView）----------
PATTERNS = [
    ("可选链 ?.",        r"\?\."),
    ("空值合并 ??",      r"\?\?"),
    ("replaceAll",       r"\.replaceAll\s*\("),
    ("Object.fromEntries", r"Object\.fromEntries"),
    ("Array.at()",       r"\.at\s*\(\s*-?\d"),
    ("lookbehind (?<=",  r"\(\?<="),
    ("lookbehind (?<!",  r"\(\?<!"),
]
OUT.append("")
OUT.append("=" * 72)
OUT.append("### 2. 老 WebView 禁用语法扫描")
OUT.append("=" * 72)
total_banned = 0
for f in FILES:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        continue
    src = io.open(p, encoding="utf-8").read()
    lines = src.split("\n")
    hits = []
    for label, pat in PATTERNS:
        rx = re.compile(pat)
        for i, ln in enumerate(lines, 1):
            if rx.search(ln):
                hits.append("    L%-5d [%s] %s" % (i, label, ln.strip()[:110]))
    total_banned += len(hits)
    OUT.append("  %-32s %s" % (f, ("0 命中" if not hits else "%d 命中" % len(hits))))
    OUT.extend(hits[:20])
OUT.append("--> 合计禁用语法命中: %d %s" % (total_banned, "(OK)" if total_banned == 0 else "(!! 必须清零)"))

# ---------- 3. ADR-3 原生弹窗 ----------
OUT.append("")
OUT.append("=" * 72)
OUT.append("### 3. ADR-3 原生 alert/confirm/prompt")
OUT.append("=" * 72)
rx = re.compile(r"(?<![.\w])(alert|confirm|prompt)\s*\(")
total_native = 0
for f in FILES:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        continue
    lines = io.open(p, encoding="utf-8").read().split("\n")
    hits = []
    for i, ln in enumerate(lines, 1):
        # 排除 window.alert 定义性/注释行
        if rx.search(ln) and not ln.strip().startswith(("//", "*", "/*")):
            hits.append("    L%-5d %s" % (i, ln.strip()[:110]))
    total_native += len(hits)
    OUT.append("  %-32s %s" % (f, ("0 命中" if not hits else "%d 命中" % len(hits))))
    OUT.extend(hits[:10])
OUT.append("--> 合计原生弹窗命中: %d %s" % (total_native, "(OK)" if total_native == 0 else "(!! 违反 ADR-3)"))

# ---------- 4. 版本戳引用清单（找需 bump 的宿主）----------
OUT.append("")
OUT.append("=" * 72)
OUT.append("### 4. Wave 2 资产的版本戳引用（待统一 bump → 20260915g）")
OUT.append("=" * 72)
ASSETS = ["chat-local.js", "voiceplayer.js", "data-ppt-class.js",
          "design-class.js", "data-ppt-tips.js", "ppt-tips.js"]
rx_stamp = re.compile(r"((?:%s)\?v=([0-9a-zA-Z_]+))" % "|".join(ASSETS))
import glob as _g
hosts = {}
for hp in _g.glob(os.path.join(ROOT, "*.html")):
    name = os.path.basename(hp)
    lines = io.open(hp, encoding="utf-8").read().split("\n")
    for i, ln in enumerate(lines, 1):
        for m in rx_stamp.finditer(ln):
            key = "%s  L%d  %s" % (name, i, m.group(1).split("?v=")[0])
            hosts.setdefault(key, []).append(m.group(2))
if not hosts:
    OUT.append("  (未在根目录 HTML 中发现引用)")
for k in sorted(hosts):
    OUT.append("  %-46s v=%s" % (k, ",".join(sorted(set(hosts[k])))))

# ---------- 5. 当前这批资产的最新可用戳 ----------
OUT.append("")
OUT.append("=" * 72)
OUT.append("### 5. 全站版本戳高频值（确认统一目标）")
OUT.append("=" * 72)
rx_any = re.compile(r"\?v=([0-9a-zA-Z_]+)")
from collections import Counter
c = Counter()
for hp in _g.glob(os.path.join(ROOT, "*.html")):
    src = io.open(hp, encoding="utf-8").read()
    for m in rx_any.finditer(src):
        c[m.group(1)] += 1
for k, v in c.most_common(12):
    OUT.append("  %-20s %d 次" % (k, v))

io.open(os.path.join(ROOT, "tools", "qa", "_w2_qa_out.txt"), "w", encoding="utf-8").write("\n".join(OUT))
print("DONE")
