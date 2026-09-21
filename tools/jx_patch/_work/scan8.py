"""三字窗口中字替换：要求替换后左右两个 bigram 都已在语料中稳固出现。"""
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

prev = collections.defaultdict(collections.Counter)
nextc = collections.defaultdict(collections.Counter)
for (a, b), n in c2.items():
    prev[b][a] += n; nextc[a][b] += n
STRONG = 20
A_of = {k: set(x for x, n in v.items() if n >= STRONG) for k, v in nextc.items()}
B_of = {k: set(x for x, n in v.items() if n >= STRONG) for k, v in prev.items()}

SHAPE = 900
def near(a, b): return a != b and abs(ord(a)-ord(b)) <= SHAPE

hits = []
for t, n in c3.items():
    if n > 2: continue
    A = A_of.get(t[0], set()); B = B_of.get(t[2], set())
    if not A or not B: continue
    for r in A & B:
        if near(r, t[1]):
            hits.append((t, n, r, c2[t[0]+r], c2[r+t[2]]))
print("hits:", len(hits))

agg = collections.defaultdict(list)
for t, n, r, x, y in hits:
    agg[(t[1], r)].append((t, n, x, y))

occ = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0); base = m.start()
            for i in range(len(seg)-2):
                occ[seg[i:i+3]].append((t["id"], field, txt[max(0,base+i-10):base+i+13]))

with io.open(os.path.join(OUT, "mid3.txt"), "w", encoding="utf-8") as f:
    for (a, r), lst in sorted(agg.items(), key=lambda kv: -len(kv[1])):
        f.write("="*66 + "\n%s -> %s  (%d 组证据)\n" % (a, r, len(lst)))
        for t, n, x, y in sorted(lst, key=lambda v: -(v[2]+v[3]))[:6]:
            f.write("   [%s] x%d  ==> [%s]  (%s%s x%d, %s%s x%d)\n"
                    % (t, n, t[0]+r+t[2], t[0], r, x, r, t[2], y))
            for tid, field, c in occ.get(t, [])[:4]:
                f.write("       id=%s %s | %s\n" % (tid, field, c.replace("\n","\\n")))
print("pairs:", len(agg))
