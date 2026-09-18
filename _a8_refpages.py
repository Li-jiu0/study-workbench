import os, re
base = r"D:\下载的文件\学习工作台"
out = []
for rel in ["工具.html", "更多.html"]:
    p = os.path.join(base, rel)
    with open(p, "rb") as f:
        b = f.read()
    s = b.decode("utf-8", "replace")
    crlf = b.count(b"\r\n"); lf = b.count(b"\n")
    out.append("===== %s | bytes=%d CRLF=%d bareLF=%d =====" % (rel, len(b), crlf, lf - crlf))
    lines = s.split("\n")
    out.append("total lines=%d" % len(lines))
    # stamp survey
    st = sorted(set(re.findall(r"\?v=[0-9A-Za-z_.-]+", s)))
    out.append("?v= stamps: " + (", ".join(st) if st else "NONE"))
    out.append("-- lines mentioning 学习概括 / 数据概括 / 学习数据 --")
    for i, ln in enumerate(lines, 1):
        if "学习概括" in ln or "数据概括" in ln or "学习数据" in ln:
            out.append("  L%d: %s" % (i, ln.strip()[:170]))
    out.append("-- structural markers (tool cards / grids) --")
    for i, ln in enumerate(lines, 1):
        if re.search(r'class="[^"]*(tl-|tool-|util-|card|grid|tile)[^"]*"', ln) or ".html'" in ln or '.html"' in ln or "id=\"" in ln and "Panel" in ln:
            out.append("  L%d: %s" % (i, ln.strip()[:170]))
    out.append("")

with open(os.path.join(base, "_a8_refpages.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
