# -*- coding: utf-8 -*-
"""词级规则生成：对每个混淆对 (a,b)，找出 a 参与的低频 bigram，其 b 版本显著高频。"""
import json, re, collections, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from confuse import pairs

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))
segs = []
for t in texts:
    s = t["q"]
    for o in (t["o"] or []): s += "\n" + str(o)
    for seg in re.findall(r"[一-鿿]+", s): segs.append(seg)
c2 = collections.Counter()
for seg in segs:
    for i in range(len(seg)-1): c2[seg[i:i+2]] += 1

P = pairs()
MAXLO, MINHI, RATIO = 3, 25, 8
cand = {}
for a, b in P:
    for (x, y), n in c2.items():
        if n > MAXLO: continue
        if x == a:
            hi = c2.get(b+y, 0)
            if hi >= MINHI and hi >= RATIO*n:
                cand.setdefault((x+y, b+y), [n, hi])
        if y == a:
            hi = c2.get(x+b, 0)
            if hi >= MINHI and hi >= RATIO*n:
                cand.setdefault((x+y, x+b), [n, hi])

rows = sorted(cand.items(), key=lambda kv: (kv[1][0], -kv[1][1]))
print("candidate rules:", len(rows))

occ = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0); base = m.start()
            for i in range(len(seg)-1):
                occ[seg[i:i+2]].append((t["id"], field, txt[max(0,base+i-16):base+i+18]))

with io.open(os.path.join(OUT, "wordrules.txt"), "w", encoding="utf-8") as f:
    for (lo, hi), (n,hn) in rows:
        f.write("="*70 + "\n%s -> %s   低频 %d 次 | 高频对照 %d 次\n" % (lo, hi, n, hn))
        for tid, field, ctx in occ.get(lo, [])[:4]:
            f.write("   id=%s %s | %s\n" % (tid, field, ctx.replace("\n","\\n")))
