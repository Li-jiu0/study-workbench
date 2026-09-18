import os, re, json
base = r"D:\下载的文件\学习工作台"
out = []

# ---- icon map: which data-icon names are supported ----
cands = ["assets\\icon-map.js", "assets\\icons.js", "assets\\nav-icon.js", "assets\\icon.js"]
found = None
for c in cands:
    p = os.path.join(base, c)
    if os.path.exists(p):
        found = c
        break
if not found:
    # search assets dir
    ad = os.path.join(base, "assets")
    for n in sorted(os.listdir(ad)):
        if "icon" in n.lower():
            out.append("assets icon file: " + n)
    out.append("icon-map not at expected path; scanned assets above")
else:
    with open(os.path.join(base, found), "rb") as f:
        s = f.read().decode("utf-8", "replace")
    out.append("icon map file = %s bytes=%d" % (found, len(s.encode("utf-8"))))
    names = sorted(set(re.findall(r'["\']([a-z0-9-]{2,30})["\']\s*:', s)))
    out.append("names(%d): %s" % (len(names), ", ".join(names)))

# ---- 学习概括.html script tag list (for notify injection plan) ----
with open(os.path.join(base, "学习概括.html"), "rb") as f:
    h = f.read().decode("utf-8", "replace")
out.append("")
out.append("=== 学习概括.html <script> tags ===")
for m in re.finditer(r"<script[^>]*>", h):
    ln = h[:m.start()].count("\n") + 1
    out.append("  L%-5d %s" % (ln, m.group(0).strip()[:150]))
out.append("")
out.append("=== 学习概括.html 尾部 30 行 ===")
hl = h.split("\n")
tail_start = max(0, len(hl) - 32)
for i in range(tail_start, len(hl)):
    out.append("  L%-5d %s" % (i + 1, hl[i][:160]))

# ---- notify.js load tag search across pages --
out.append("")
out.append("=== 全站 notify.js 引用现状 ===")
n = 0
for fn in sorted(os.listdir(base)):
    if not fn.endswith(".html"):
        continue
    with open(os.path.join(base, fn), "rb") as f:
        s = f.read().decode("utf-8", "replace")
    if "notify.js" in s:
        n += 1
        out.append("  REF %s" % fn)
out.append("pages referencing notify.js = %d" % n)

# count total html pages
pages = [fn for fn in sorted(os.listdir(base)) if fn.endswith(".html") and ".bak" not in fn]
out.append("total .html (non-bak) = %d" % len(pages))

with open(os.path.join(base, "_a8_icons.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
