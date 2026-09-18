import os, re

base = r"D:\下载的文件\学习工作台"

def read(rel):
    with open(os.path.join(base, rel), "rb") as f:
        return f.read().decode("utf-8", "replace")

def strip_and_depth(src):
    """Return list of (line, depth, text) with strings/comments blanked out,
    depth = brace depth BEFORE the char."""
    res = []
    i = 0
    n = len(src)
    depth = 0
    line = 1
    buf = []
    out_lines = []
    while i < n:
        c = src[i]
        if c == "\n":
            out_lines.append(("".join(buf), depth))
            buf = []
            line += 1
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            if j < 0:
                break
            i = j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                break
            seg = src[i:j + 2]
            nl = seg.count("\n")
            for _ in range(nl):
                out_lines.append(("".join(buf), depth))
                buf = []
            line += nl
            i = j + 2
            continue
        if c in "\"'`":
            q = c
            i += 1
            while i < n and src[i] != q:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == "\n":
                    out_lines.append(("".join(buf), depth))
                    buf = []
                i += 1
            i += 1
            buf.append("S")  # placeholder for string
            continue
        if c == "{":
            buf.append("{")
            depth += 1
            i += 1
            continue
        if c == "}":
            depth -= 1
            buf.append("}")
            i += 1
            continue
        buf.append(c)
        i += 1
    out_lines.append(("".join(buf), depth))
    return out_lines

out = []

for label, rel in [("assets/notify.js", "assets\\notify.js"),
                   ("学习概括.html", "学习概括.html")]:
    src = read(rel)
    if label.endswith(".html"):
        # only analyze inline scripts
        blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", src, re.S)
        src = "\n".join(blocks)
    ls = strip_and_depth(src)
    out.append("=== %s : top-level (depth==0) declarations ===" % label)
    decls = []
    for idx, (txt, dep) in enumerate(ls, 1):
        if dep == 0:
            m = re.match(r"\s*(var|let|const|class)\s+([A-Za-z_$][\w$]*)", txt)
            if m:
                decls.append((idx, m.group(1), m.group(2)))
    out.append("count = %d" % len(decls))
    for idx, kw, name in decls:
        out.append("   line %-5d %-6s %s" % (idx, kw, name))
    out.append("")

with open(os.path.join(base, "_a8_scope2.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
