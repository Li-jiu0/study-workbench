# -*- coding: utf-8 -*-
"""R73 静态风险面统计（live assets/*.js）。输出 out_static.txt。"""
import os, re, io, json

ROOT = r"D:/下载的文件/学习工作台"
ASSETS = os.path.join(ROOT, "assets")

def live_js():
    out = []
    for fn in sorted(os.listdir(ASSETS)):
        if not fn.endswith(".js"): continue
        if ".bak" in fn or ".backup" in fn or fn.endswith(".min.js"): continue
        out.append(fn)
    return out

PATTERNS = {
    "fetch(": re.compile(r'\bfetch\s*\('),
    ".then(": re.compile(r'\.then\s*\('),
    ".catch(": re.compile(r'\.catch\s*\('),
    "JSON.parse(": re.compile(r'\bJSON\.parse\s*\('),
    "JSON.stringify(": re.compile(r'\bJSON\.stringify\s*\('),
    "parseInt(": re.compile(r'\bparseInt\s*\('),
    "parseInt_no_radix": re.compile(r'\bparseInt\s*\(\s*[^,()]+\)'),
    "localStorage.setItem(": re.compile(r'\blocalStorage\.setItem\s*\('),
    "localStorage.getItem(": re.compile(r'\blocalStorage\.getItem\s*\('),
    "setInterval(": re.compile(r'\bsetInterval\s*\('),
    "clearInterval(": re.compile(r'\bclearInterval\s*\('),
    "setTimeout(": re.compile(r'\bsetTimeout\s*\('),
    "clearTimeout(": re.compile(r'\bclearTimeout\s*\('),
    "addEventListener(": re.compile(r'\baddEventListener\s*\('),
    "removeEventListener(": re.compile(r'\bremoveEventListener\s*\('),
    "innerHTML": re.compile(r'\.innerHTML\s*='),
    "eval(": re.compile(r'(?<![\w.])eval\s*\('),
    "new Function(": re.compile(r'\bnew\s+Function\s*\('),
    "document.write(": re.compile(r'\bdocument\.write\s*\('),
    "setInterval_leak?": re.compile(r'\bsetInterval\s*\('),
}

def main():
    files = live_js()
    totals = {k: 0 for k in PATTERNS}
    per_file = {}
    # 收集具体行，便于抽样
    samples = {k: [] for k in PATTERNS}
    for base in files:
        p = os.path.join(ASSETS, base)
        t = {k: 0 for k in PATTERNS}
        with io.open(p, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f, 1):
                for k, rx in PATTERNS.items():
                    if rx.search(line):
                        t[k] += 1
        for k in PATTERNS:
            totals[k] += t[k]
        per_file[base] = t
        # samples for selected
        with io.open(p, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f, 1):
                for k in ("parseInt_no_radix", "eval(", "new Function(", "document.write(", "fetch("):
                    if PATTERNS[k].search(line) and len(samples[k]) < 200:
                        samples[k].append("%s:%d | %s" % (base, i, line.strip()[:160]))

    lines = []
    lines.append("== 全站 live assets/*.js 风险面计数（%d 文件）==" % len(files))
    for k in PATTERNS:
        lines.append("%-26s %d" % (k, totals[k]))
    lines.append("")
    lines.append("== 每文件明细（fetch/JSON.parse/parseInt/setInterval/setTimeout/innerHTML/eval）==")
    keys = ["fetch(", "JSON.parse(", "parseInt(", "parseInt_no_radix", "setInterval(", "setTimeout(", "innerHTML", "eval(", "new Function(", "localStorage.setItem("]
    lines.append("%-26s %s" % ("file", " | ".join(k for k in keys)))
    for base in files:
        t = per_file[base]
        if any(t[k] for k in keys):
            lines.append("%-26s %s" % (base, " | ".join(str(t[k]) for k in keys)))
    lines.append("")
    for k in ("parseInt_no_radix", "eval(", "new Function(", "document.write("):
        lines.append("== 样例: %s (最多30) ==" % k)
        for s in samples[k][:30]:
            lines.append("   " + s)
        lines.append("")

    with io.open(os.path.join(ROOT, "tools/qa/r73/out_static.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("done")

if __name__ == "__main__":
    main()
