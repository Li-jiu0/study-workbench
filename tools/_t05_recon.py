# -*- coding: utf-8 -*-
"""T05 recon: 扫描根目录 HTML 的 cap script 引用 / 行尾 / 版本文件行尾。

只读，不写任何业务文件。结果写 tools/_t05_recon_out.txt。
"""
import glob
import os
import sys

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools", "_t05_recon_out.txt")

CAP_FILES = [
    "assets/ai-service.js",
    "assets/ai-cap-registry.js",
    "assets/ai-cap-translate.js",
    "assets/ai-cap-video.js",
    "assets/ai-cap-3d.js",
    "assets/ai-cap-image.js",
    "assets/ai-cap-vision.js",
    "assets/ai-cap-audio.js",
    "assets/ai-cap-embed.js",
    "assets/ai-settings.js",
    "assets/xt-aiusage.js",
]


def eol_of(path):
    with open(path, "rb") as f:
        data = f.read()
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n") - crlf
    cr = data.count(b"\r") - crlf
    if crlf and lf == 0 and cr == 0:
        return "CRLF"
    if lf and crlf == 0 and cr == 0:
        return "LF"
    return "MIXED(crlf=%d,lf=%d,cr=%d)" % (crlf, lf, cr)


def main():
    lines = []

    def w(s=""):
        lines.append(s)

    w("=== 版本/关键文件行尾 ===")
    for rel in [
        "server/routers/version.json",
        "server/routers/update.py",
        "server/routers/ai.py",
        "android/AndroidManifest.xml",
        "assets/xt-update.js",
        "assets/ai-config.js",
        "ai-settings.html",
    ]:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            w("  %-40s %s" % (rel, eol_of(p)))
        else:
            w("  %-40s <NOT FOUND>" % rel)

    htmls = sorted(glob.glob(os.path.join(ROOT, "*.html")))
    w("")
    w("=== 根目录 HTML 总数: %d ===" % len(htmls))

    cnt = {}
    for cf in CAP_FILES:
        cnt[cf] = 0
    registry_pages = []
    missing_any = []
    eol_report = {}
    per_page = {}

    for h in htmls:
        name = os.path.basename(h)
        try:
            with open(h, "rb") as f:
                raw = f.read()
        except OSError as e:
            w("  [ERR] %s: %s" % (name, e))
            continue
        text = raw.decode("utf-8", "replace")
        eol = eol_of(h)
        eol_report[eol] = eol_report.get(eol, 0) + 1
        refs = {}
        for cf in CAP_FILES:
            r = ("src=\"%s" % cf)
            r2 = ("src='%s" % cf)
            r3 = ("src=%s" % cf)
            refs[cf] = (r in text) or (r2 in text) or (r3 in text)
            if refs[cf]:
                cnt[cf] += 1
        has_reg = refs["assets/ai-cap-registry.js"]
        if has_reg:
            registry_pages.append(name)
        per_page[name] = refs
        need = []
        for cf in ["assets/ai-cap-translate.js", "assets/ai-cap-video.js", "assets/ai-cap-3d.js"]:
            if has_reg and not refs[cf]:
                need.append(os.path.basename(cf))
        if need:
            missing_any.append((name, need))

    w("")
    w("=== 各 cap 文件被引用页数 ===")
    for cf in CAP_FILES:
        w("  %-32s %d" % (cf, cnt[cf]))

    w("")
    w("=== HTML 行尾分布 ===")
    for k, v in sorted(eol_report.items()):
        w("  %-24s %d 个文件" % (k, v))

    w("")
    w("=== 引了 registry 的页面 (%d) ===" % len(registry_pages))
    for n in registry_pages:
        w("  " + n)

    w("")
    w("=== 需补 translate/video/3d 的页面 (%d) ===" % len(missing_any))
    for n, need in missing_any:
        w("  %-28s 缺: %s" % (n, ", ".join(need)))

    w("")
    w("=== 每页 script 顺序抽验（关键 5 个）===")
    kr = ["assets/ai-service.js", "assets/ai-cap-registry.js",
          "assets/ai-settings.js", "assets/xt-aiusage.js"]
    for h in htmls:
        name = os.path.basename(h)
        refs = per_page.get(name)
        if not refs:
            continue
        order = []
        try:
            with open(h, "rb") as f:
                text = f.read().decode("utf-8", "replace")
        except OSError:
            continue
        for cf in kr:
            idx = text.find(cf)
            if idx >= 0:
                order.append((idx, cf))
        if len(order) >= 2:
            order.sort()
            seq = " > ".join(os.path.basename(c[1]) for c in order)
            # 检测顺序违规: registry 早于 service
            bad = ""
            names = [os.path.basename(c[1]) for c in order]
            if "ai-cap-registry.js" in names and "ai-service.js" in names:
                if names.index("ai-cap-registry.js") < names.index("ai-service.js"):
                    bad = "  <<< 顺序违规: registry 早于 service"
            w("  %-28s %s%s" % (name, seq, bad))

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
