# -*- coding: utf-8 -*-
"""T05 全站 AI 冒烟：cap 引用数对齐 / 无重复 / 加载顺序正确 / ai-settings.html 未被动。"""
import os
import re

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools", "_t05_smoke_out.txt")

CAPS = ["ai-cap-registry.js", "ai-cap-translate.js", "ai-cap-video.js", "ai-cap-3d.js",
        "ai-cap-image.js", "ai-cap-vision.js", "ai-cap-audio.js", "ai-cap-embed.js"]
SERVICE = "ai-service.js"
SETTINGS = "ai-settings.js"
USAGE = "xt-aiusage.js"


def eol(data):
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n") - crlf
    return "CRLF" if (crlf and lf == 0) else ("LF" if (lf and crlf == 0) else "MIXED")


def main():
    L = []
    L.append("=== T05 全站 AI 冒烟 ===")
    pages = sorted([n for n in os.listdir(ROOT)
                    if n.endswith(".html") and n != "ai-settings.html"])
    cnt = {c: 0 for c in CAPS}
    problems = []
    order_ok = 0
    order_bad = []
    dup_pages = []
    mixed = []

    for n in pages:
        p = os.path.join(ROOT, n)
        with open(p, "rb") as f:
            data = f.read()
        t = data.decode("utf-8", "replace")
        ec = eol(data)
        if ec != "CRLF":
            mixed.append("%s (%s)" % (n, ec))
        for c in CAPS:
            cnt[c] += t.count('src="assets/%s"' % c)
        # 重复检测
        for c in CAPS:
            if t.count('src="assets/%s"' % c) > 1:
                dup_pages.append("%s: %s x%d" % (n, c, t.count('src="assets/%s"' % c)))
        # 顺序检测：service < registry < 各 cap < settings < usage
        if SERVICE in t and "ai-cap-registry.js" in t:
            i_svc = t.find('src="assets/%s"' % SERVICE)
            i_reg = t.find('src="assets/ai-cap-registry.js"')
            i_set = t.find('src="assets/%s"' % SETTINGS)
            i_use = t.find('src="assets/%s"' % USAGE)
            ok = True
            if i_reg < i_svc:
                ok = False
            for c in ["ai-cap-image.js", "ai-cap-vision.js", "ai-cap-audio.js",
                      "ai-cap-embed.js", "ai-cap-translate.js", "ai-cap-video.js",
                      "ai-cap-3d.js"]:
                if c in t and t.find('src="assets/%s"' % c) < i_reg:
                    ok = False
            if i_set > 0 and i_set < i_reg:
                ok = False
            if i_use > 0 and (i_use < i_reg or (i_set > 0 and i_use < i_set)):
                ok = False
            if ok:
                order_ok += 1
            else:
                order_bad.append(n)

    L.append("根 HTML（不含 ai-settings.html）: %d 个" % len(pages))
    L.append("")
    L.append("--- 各 cap 被引用页数（改后）---")
    for c in CAPS:
        L.append("  %-26s %d" % (c, cnt[c]))
    L.append("")
    L.append("--- 顺序检查 ---")
    L.append("  顺序正确页数: %d" % order_ok)
    L.append("  顺序异常页: %s" % (order_bad if order_bad else "无"))
    L.append("")
    L.append("--- 重复引用页 ---")
    L.append("  %s" % (dup_pages if dup_pages else "无重复 ✅"))
    L.append("")
    L.append("--- 非 CRLF 页（应为空）---")
    L.append("  %s" % (mixed if mixed else "全部 CRLF ✅"))

    # ai-settings.html 未被动校验：不应出现 translate/video/3d
    p = os.path.join(ROOT, "ai-settings.html")
    with open(p, "rb") as f:
        s = f.read().decode("utf-8", "replace")
    added = [c for c in ["ai-cap-translate.js", "ai-cap-video.js", "ai-cap-3d.js"] if c in s]
    L.append("")
    L.append("--- ai-settings.html 未被触碰校验（应为空）---")
    L.append("  额外引用: %s" % (added if added else "无 ✅"))

    txt = "\n".join(L)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
