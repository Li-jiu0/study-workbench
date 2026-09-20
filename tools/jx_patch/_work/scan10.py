# -*- coding: utf-8 -*-
"""全量混淆字扫描(不设频率上限) + 标点/结构异常扫描。"""
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
c1 = collections.Counter(); c2 = collections.Counter()
for seg in segs:
    for ch in seg: c1[ch] += 1
    for i in range(len(seg)-1): c2[seg[i:i+2]] += 1

P = collections.defaultdict(set)
for a, b in pairs():
    P[a].add(b)

rows = []
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0); base = m.start()
            for i, ch in enumerate(seg):
                if ch not in P: continue
                L = seg[i-1] if i-1 >= 0 else None
                R = seg[i+1] if i+1 < len(seg) else None
                if L is None and R is None: continue
                o = max(c2.get(L+ch, 0) if L else 0, c2.get(ch+R, 0) if R else 0)
                if o > 2: continue
                best = (0, None)
                for r in P[ch]:
                    s = max(c2.get(L+r, 0) if L else 0, c2.get(r+R, 0) if R else 0)
                    if s > best[0]: best = (s, r)
                if best[1] and best[0] >= 8 and best[0] >= 5*(o+1):
                    rows.append((o, best[0], ch, best[1], t["id"], field,
                                 txt[max(0,base+i-14):base+i+15]))
rows.sort(key=lambda r: (r[0], -r[1]))
print("rows:", len(rows))
agg = collections.OrderedDict()
for o, s, ch, r, tid, field, ctx in rows:
    agg.setdefault((ch, r), []).append((o, s, tid, field, ctx))

with io.open(os.path.join(OUT, "curated2.txt"), "w", encoding="utf-8") as f:
    for (ch, r), lst in sorted(agg.items(), key=lambda kv: -len(kv[1])):
        f.write("="*70 + "\n%s -> %s   %d 处\n" % (ch, r, len(lst)))
        for o, s, tid, field, ctx in lst[:8]:
            f.write("   id=%s %s | %d->%d | %s\n" % (tid, field, o, s, ctx.replace("\n","\\n")))
print("pairs:", len(agg))
