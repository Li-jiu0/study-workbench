# -*- coding: utf-8 -*-
# 全站 emoji 分布统计（按文件计数 + 列出具体 emoji），定位需求06 目标页与需求02 遗留
import io, os, re, collections

ROOT = r"D:\下载的文件\学习工作台"
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️←-⇿⌀-⏿]")
skip_dirs = {"备份", "node_modules", ".git", "tools", "assets", ".qa", "server", "data"}

per = []
detail = {}
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs]
    for fn in filenames:
        if not fn.endswith((".html", ".js")):
            continue
        p = os.path.join(dirpath, fn)
        try:
            lines = io.open(p, encoding="utf-8", errors="replace").read().split("\n")
        except OSError:
            continue
        cnt = 0
        ems = collections.Counter()
        spots = []
        for i, ln in enumerate(lines):
            found = EMOJI.findall(ln)
            if found:
                cnt += len(found)
                for e in found:
                    ems[e] += 1
                if len(spots) < 25:
                    spots.append("  :%-5d %s | %s" % (i + 1, "".join(sorted(set(found))), ln.strip()[:100]))
        if cnt:
            rel = os.path.relpath(p, ROOT)
            per.append((cnt, rel))
            detail[rel] = (ems, spots)

per.sort(reverse=True)
out = ["== 每文件 emoji 出现次数（降序）==",
       "TOTAL files=%d, occurrences=%d" % (len(per), sum(c for c, _ in per)),
       ""]
for cnt, rel in per[:20]:
    ems, spots = detail[rel]
    out.append("### %s : %d 处，%d 种" % (rel, cnt, len(ems)))
    top = ", ".join("%s x%d" % (e, n) for e, n in ems.most_common(24))
    out.append("  emoji: " + top)
    out.extend(spots)
    out.append("")

io.open(os.path.join(ROOT, "tools", "qa", "_icons_emoji2.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("done")
