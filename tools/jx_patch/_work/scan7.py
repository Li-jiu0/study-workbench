"""高精度：强对比 + 字形约束 + 按 (from,to) 聚合。"""
import json, re, collections, io, os

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))
segs = []
for t in texts:
    s = t["q"]
    for o in (t["o"] or []): s += "\n" + str(o)
    for seg in re.findall(r"[一-鿿]+", s): segs.append(seg)
c2 = collections.Counter(); c3 = collections.Counter()
for seg in segs:
    for i in range(len(seg)-1): c2[seg[i:i+2]] += 1
    for i in range(len(seg)-2): c3[seg[i:i+3]] += 1

SHAPE = 900
def near(a, b): return a != b and abs(ord(a)-ord(b)) <= SHAPE

prev = collections.defaultdict(collections.Counter)
nextc = collections.defaultdict(collections.Counter)
for (a, b), n in c2.items():
    prev[b][a] += n; nextc[a][b] += n

MIN_HI, MAX_LO, RATIO = 30, 3, 8
hits = []
for (a, b), n in c2.items():
    if n > MAX_LO: continue
    for x, xn in prev[b].items():
        if near(x, a) and xn >= MIN_HI and xn >= RATIO*n:
            hits.append((a, x, a+b, n, x+b, xn))
    for y, yn in nextc[a].items():
        if near(y, b) and yn >= MIN_HI and yn >= RATIO*n:
            hits.append((b, y, a+b, n, a+y, yn))

agg = collections.defaultdict(list)
for a, x, lo, n, hi, xn in hits:
    agg[(a, x)].append((lo, n, hi, xn))
print("2gram pairs:", len(agg))

occ = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0); base = m.start()
            for i in range(len(seg)-1):
                occ[seg[i:i+2]].append((t["id"], field, txt[max(0,base+i-10):base+i+12]))

with io.open(os.path.join(OUT, "hi2.txt"), "w", encoding="utf-8") as f:
    for (a, x), lst in sorted(agg.items(), key=lambda kv: -max(v[3] for v in kv[1])):
        f.write("="*66 + "\n%s -> %s  (%d 组证据)\n" % (a, x, len(lst)))
        for lo, n, hi, xn in sorted(lst, key=lambda v: -v[3])[:5]:
            f.write("   %s x%d  ==>  %s x%d\n" % (lo, n, hi, xn))
            for tid, field, c in occ.get(lo, [])[:4]:
                f.write("       id=%s %s | %s\n" % (tid, field, c.replace("\n","\\n")))
