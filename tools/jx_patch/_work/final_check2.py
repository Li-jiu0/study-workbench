# -*- coding: utf-8 -*-
"""入/人 复合词的歧义排查：打印全部上下文。"""
import json, io, os, re

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))
alltext = []
for t in texts:
    alltext.append(("q", t["id"], t["q"]))
    for k, o in enumerate(t["o"] or []):
        alltext.append(("o%d" % k, t["id"], str(o)))

CHECK = ["加人","注人","导人","流人","陷人","放人","嵌人","写人","转人","插人","存人",
         "装人","归人","并人","编人","渗人","迁人","汇人","送人","引人","收人"]

for w in CHECK:
    hits = []
    for f, tid, txt in alltext:
        p = 0
        while True:
            p = txt.find(w, p)
            if p < 0: break
            hits.append("id=%s %s |%s|" % (tid, f, txt[max(0,p-9):p+len(w)+9].replace("\n","\\n")))
            p += 1
    print("\n===== %s  共 %d 处 =====" % (w, len(hits)))
    for h in hits[:14]:
        print("   ", h)

# 于部 的 "对于部" 碰撞检查
print("\n===== 碰撞检查 =====")
for w in ["对于部","百年未有","年未"]:
    n = sum(txt.count(w) for f, i, txt in alltext)
    print("%s : %d" % (w, n))
