# -*- coding: utf-8 -*-
"""提取每个 live html 的 <script src> 加载顺序（仅 assets/*.js），并汇总
哪些页面同时加载 api.js 与 app.js 及其相对顺序。"""
import os, re, io, glob

ROOT = r"D:/下载的文件/学习工作台"
RE_SCRIPT = re.compile(r'<script[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', re.I)

def is_live_html(fn):
    b = os.path.basename(fn)
    return b.endswith(".html") and ".bak" not in b and ".backup" not in b

def main():
    pages = {}
    for fn in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        if not is_live_html(fn):
            continue
        with io.open(fn, "r", encoding="utf-8", errors="replace") as f:
            txt = f.read()
        srcs = [s for s in RE_SCRIPT.findall(txt)]
        # 保留 assets/*.js
        js = [s for s in srcs if re.search(r'assets/[\w\-]+\.js', s)]
        pages[os.path.basename(fn)] = js

    out = []
    out.append("== 各页面 assets/*.js 加载顺序（live html）==")
    for b, js in pages.items():
        def short(s):
            return s.split("/")[-1].split("?")[0]
        out.append("-- %s (%d)" % (b, len(js)))
        out.append("   " + " -> ".join(short(s) for s in js))
    out.append("")
    out.append("== 同时含 api.js 与 app.js 的页面及其顺序 ==")
    both = []
    for b, js in pages.items():
        names = [s.split("/")[-1].split("?")[0] for s in js]
        if "api.js" in names and "app.js" in names:
            ia = names.index("api.js"); ib = names.index("app.js")
            who = "app.js 后加载(覆盖 api.js)" if ib > ia else "api.js 后加载(覆盖 app.js)"
            both.append((b, ia, ib, who))
    for b, ia, ib, who in both:
        out.append("   %-24s api@%d app@%d  -> %s" % (b, ia, ib, who))
    out.append("")
    out.append("== 含 api.js 的页面 ==")
    onlyapi = [b for b, js in pages.items() if any(s.endswith("api.js") for s in js)]
    out.append("   " + ", ".join(onlyapi))
    out.append("== 含 app.js 的页面 ==")
    onlyapp = [b for b, js in pages.items() if any(s.endswith("app.js") for s in js)]
    out.append("   " + ", ".join(onlyapp))

    with io.open(os.path.join(ROOT, "tools/qa/r73/out_loadorder.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("done")

if __name__ == "__main__":
    main()
