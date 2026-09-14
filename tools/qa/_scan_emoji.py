# -*- coding: utf-8 -*-
# 扫描仍以 emoji 呈现的图标位置（重点 商务礼仪/面试页 = 需求06，及其它页需求02 遗留）
import io, os, re

ROOT = r"D:\下载的文件\学习工作台"
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️←-⇿⌀-⏿]")
ICON_CLS = re.compile(r'class="[^"]*(?:bn-icon|bm-icon|mpc-icon|title-icon|nav-icon|hq-ic|pp-ic|fd-ic|ec-ic|vt-ic|ct-ic|tg-ic|mini-ic|mod-ic|card-ic|stat-ic|sec-ic|list-ic|tab-ic|pj-ic|ai-ic|news-ic|btn-ic|key-ic|ti-ic|home-ic|set-ic|icon)[^"]*"', re.I)

skip_dirs = {"备份", "node_modules", ".git", "tools", "assets"}
out = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs]
    for fn in filenames:
        if not fn.endswith(".html"):
            continue
        p = os.path.join(dirpath, fn)
        try:
            lines = io.open(p, encoding="utf-8", errors="replace").read().split("\n")
        except OSError:
            continue
        hits = []
        for i, ln in enumerate(lines):
            if EMOJI.search(ln) and ICON_CLS.search(ln):
                em = sorted(set(EMOJI.findall(ln)))
                hits.append((i + 1, "".join(em), ICON_CLS.search(ln).group(0)[:40], ln.strip()[:110]))
        if hits:
            out.append("=== %s : %d 处 ===" % (os.path.relpath(p, ROOT), len(hits)))
            for lno, em, cls, txt in hits[:40]:
                out.append("  :%-5d %-8s | %-32s | %s" % (lno, em, cls, txt))
            if len(hits) > 40:
                out.append("  ...(+%d)" % (len(hits) - 40))

io.open(os.path.join(ROOT, "tools", "qa", "_icons_emoji.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("done")
