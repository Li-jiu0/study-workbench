# -*- coding: utf-8 -*-
"""R73 性能画像：app.js 体积/行数/最长行/gzip 体积。"""
import os, io, gzip

ROOT = r"D:/下载的文件/学习工作台"
files = ["assets/app.js", "assets/chat-local.js", "assets/api.js", "assets/ai-settings.js",
         "assets/ai-page.js", "assets/i-partner.js", "assets/quest.js", "assets/tpl-preview.js",
         "assets/voiceplayer.js", "assets/ai-service.js"]
out = []
tot = 0
for rel in files:
    p = os.path.join(ROOT, rel)
    raw = io.open(p, "rb").read()
    gz = gzip.compress(raw, 6)
    txt = raw.decode("utf-8", "replace")
    lines = txt.split("\n")
    longest = max((len(l) for l in lines), default=0)
    tot += len(raw)
    out.append("%-24s raw=%9d  gzip=%8d  lines=%7d  maxLineLen=%8d" % (
        rel, len(raw), len(gz), len(lines), longest))
out.append("")
out.append("合计(10 文件) raw=%d  (%.1f MB)" % (tot, tot/1024.0/1024.0))
out.append("单页 app.js 占全部业务脚本体积比例估算：app.js=%d" % os.path.getsize(os.path.join(ROOT, "assets/app.js")))
io.open(os.path.join(ROOT, "tools/qa/r73/out_perf.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
