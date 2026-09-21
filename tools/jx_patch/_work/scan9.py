# -*- coding: utf-8 -*-
"""用人工混淆组在语料中做定向扫描：低频字 -> 组内候选 -> bigram 支持度验证。"""
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

PAIRS = pairs()
P = collections.defaultdict(set)
for a, b in PAIRS:
    P[a].add(b)
print("groups pairs", len(PAIRS), "chars", len(P))

MAXFREQ = 12
targets = [c for c, n in c1.items() if n <= MAXFREQ and c in P]
print("targets:", len(targets))

occ = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0); base = m.start()
            for i, ch in enumerate(seg):
                if c1[ch] <= MAXFREQ:
                    occ[ch].append((t["id"], field, txt[max(0,base+i-14):base+i+15], i, seg))

rows = []
for c in targets:
    for tid, field, ctx, i, seg in occ.get(c, []):
        L = seg[i-1] if i-1 >= 0 else None
        R = seg[i+1] if i+1 < len(seg) else None
        if L is None and R is None: continue
        o = max(c2.get(L+c, 0) if L else 0, c2.get(c+R, 0) if R else 0)
        best = []
        for r in P[c]:
            s = max(c2.get(L+r, 0) if L else 0, c2.get(r+R, 0) if R else 0)
            if s > 0:
                best.append((s, r))
        best.sort(reverse=True)
        if best and (best[0][0] >= 5 or best[0][0] >= 3*o + 3):
            rows.append((c1[c], c, best[0][1], best[0][0], o, tid, field, ctx,
                         [x[1] for x in best[:3]]))

rows.sort(key=lambda r: (r[0], -r[3]))
print("rows:", len(rows))

agg = collections.OrderedDict()
for f, c, r, s, o, tid, field, ctx, alt in rows:
    agg.setdefault((c, r), []).append((f, s, o, tid, field, ctx, alt))

with io.open(os.path.join(OUT, "curated.txt"), "w", encoding="utf-8") as f:
    for (c, r), lst in sorted(agg.items(), key=lambda kv: (kv[1][0][0], -len(kv[1]))):
        f.write("="*70 + "\n%s -> %s   %d 处 (原字频 %d)\n" % (c, r, len(lst), lst[0][0]))
        for fq, s, o, tid, field, ctx, alt in lst[:6]:
            f.write("   id=%s %s | 支持 %d->%d (原 %d) alt=%s | %s\n"
                    % (tid, field, o, s, o, "".join(alt), ctx.replace("\n","\\n")))
print("pairs:", len(agg))
