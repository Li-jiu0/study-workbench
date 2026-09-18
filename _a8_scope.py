import os, re

base = r"D:\下载的文件\学习工作台"
out = []

def read(rel):
    with open(os.path.join(base, rel), "rb") as f:
        return f.read().decode("utf-8", "replace")

# ---------- 1. notify.js structure ----------
nj = read("assets\\notify.js")
lines = nj.split("\n")
out.append("=== assets/notify.js 结构 ===")
out.append("total lines=%d bytes=%d" % (len(lines), len(nj.encode("utf-8"))))

# top-level declaration scan (depth 0 only, ignoring strings/comments roughly)
# We compute brace depth outside of strings.
def top_level_decls(src):
    decls = []
    i = 0
    n = len(src)
    depth = 0
    line = 1
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        # skip line comments
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            # count newlines inside
            line += src[i - (j + 2) if j >= 0 else 0:i].count("\n") if False else 0
            continue
        if c in "\"'`":
            q = c
            i += 1
            while i < n and src[i] != q:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == "\n":
                    line += 1
                i += 1
            i += 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        else:
            if depth == 0:
                m = re.match(r"(var|let|const|function|class)\b", src[i:])
                if m and (i == 0 or src[i - 1] in "\n;{}() \t"):
                    # capture to end of statement heuristically
                    decls.append((line, m.group(1), src[i:i + 90].replace("\n", " ")))
            i += 1
            continue
        i += 1
    return decls

tl = top_level_decls(nj)
out.append("TOP-LEVEL decls (depth0, string/comment-aware) = %d" % len(tl))
for ln, kw, txt in tl:
    out.append("   L%-5d %-9s %s" % (ln, kw, txt))

# IIFE check
out.append("")
out.append("IIFE headline: %s" % lines[0][:120].strip())
out.append("last non-empty line: %s" % [l for l in lines if l.strip()][-1][:120].strip())

# ---------- 2. 学习概括.html top-level var check ----------
h = read("学习概括.html")
hl = h.split("\n")
out.append("")
out.append("=== 学习概括.html top-level 声明检查 ===")
# only look inside <script> blocks, compute depth
scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", h, re.S)
out.append("inline <script> blocks = %d" % len(scripts))
tot = 0
for si, s in enumerate(scripts):
    d = top_level_decls(s)
    tot += len(d)
    if d:
        out.append("  script#%d top-level decls=%d" % (si, len(d)))
        for ln, kw, txt in d[:10]:
            out.append("     %-9s %s" % (kw, txt[:100]))
out.append("TOTAL inline top-level decls = %d" % tot)

with open(os.path.join(base, "_a8_scope.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
