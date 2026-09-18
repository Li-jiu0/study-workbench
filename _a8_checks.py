import os, re, io

base = r"D:\下载的文件\学习工作台"
out = []

def read(rel):
    p = os.path.join(base, rel)
    with open(p, "rb") as f:
        return f.read().decode("utf-8", "replace")

# ============ A. 学习概括.html structure pairing ============
h = read("学习概括.html")
def cnt(s, needle):
    return s.count(needle)

out.append("=== 学习概括.html 结构配对 ===")
pairs = [
    ("<!--", s.count("<!--") if False else h.count("<!--"), h.count("-->")),
    ("<div", len(re.findall(r"<div[\s>]", h)), h.count("</div>")),
    ("<script", len(re.findall(r"<script[\s>]", h)), h.count("</script>")),
    ("<head", len(re.findall(r"<head[\s>]", h)), h.count("</head>")),
    ("<body", len(re.findall(r"<body[\s>]", h)), h.count("</body>")),
    ("<html", len(re.findall(r"<html[\s>]", h)), h.count("</html>")),
]
for name, a, b in pairs:
    out.append("%-8s open=%d close=%d %s" % (name, a, b, "PASS" if a == b else "FAIL"))

# ============ B. 共用 DOM 七件核验 ============
out.append("")
out.append("=== 学习概括.html 共用 DOM 七件核验 ===")
seven = [
    ("#aiFab", [r'id\s*=\s*["\']aiFab["\']']),
    ("#aiPanel", [r'id\s*=\s*["\']aiPanel["\']']),
    ("#morePanel", [r'id\s*=\s*["\']morePanel["\']']),
    ("#toolsPanel", [r'id\s*=\s*["\']toolsPanel["\']']),
    ("#toast", [r'id\s*=\s*["\']toast["\']']),
    ("#countdownModal", [r'id\s*=\s*["\']countdownModal["\']']),
    (".more-overlay", [r'class\s*=\s*["\'][^"\']*\bmore-overlay\b']),
]
for label, pats in seven:
    hit = False
    detail = ""
    for pat in pats:
        ms = list(re.finditer(pat, h))
        if ms:
            hit = True
            # capture the matched tag context
            m = ms[0]
            st = h.rfind("<", 0, m.start() + 1)
            en = h.find(">", m.end())
            snip = h[max(0, m.start() - 40):min(len(h), m.end() + 60)].replace("\r", " ").replace("\n", " ")
            detail = snip
            break
    out.append("%-18s %s %s" % (label, "FOUND" if hit else "MISSING", detail))

# ============ C. 禁用语法扫描 ============
out.append("")
out.append("=== 学习概括.html / notify.js 禁用语法扫描 ===")

def scan_syntax(label, s):
    lines = s.split("\n")
    bans = [
        (r"\?\.", "optional-chaining ?."),
        (r"\?\?", "nullish ??"),
        (r"\.replaceAll\s*\(", ".replaceAll("),
        (r"Object\.fromEntries", "Object.fromEntries"),
        (r"\.at\s*\(", ".at("),
        (r"\(\?<=", "regex lookbehind (?<="),
        (r"\(\?<!", "regex lookbehind (?<!"),
        (r"\{\s*\.\.\.", "obj spread {..."),
        (r"catch\s*\{", "optional catch binding"),
        (r"(?<![*])\*\*(?![*])", "exponent **"),
        (r"\balert\s*\(", "native alert("),
        (r"\bconfirm\s*\(", "native confirm("),
        (r"\bprompt\s*\(", "native prompt("),
        (r"\bvar\s+", "var decl"),
    ]
    out.append("--- %s ---" % label)
    for pat, name in bans:
        hits = []
        for i, ln in enumerate(lines):
            if re.search(pat, ln):
                hits.append("L%d: %s" % (i + 1, ln.strip()[:110]))
        if hits:
            out.append("  HIT %-32s x%d" % (name, len(hits)))
            for hh in hits[:8]:
                out.append("      " + hh)
        else:
            out.append("  ok  %-32s 0" % name)

scan_syntax("学习概括.html", h)
scan_syntax("assets/notify.js", read("assets\\notify.js"))

with open(os.path.join(base, "_a8_checks.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
