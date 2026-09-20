"""一致性过滤：一个错字应在其全部出现处都能被同一个候选字替换。+ 标点/结构异常扫描。"""
import json, re, collections, io, os

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))

segments = []
for t in texts:
    s = t["q"]
    for o in (t["o"] or []):
        s += "\n" + str(o)
    for seg in re.findall(r"[一-鿿]+", s):
        segments.append(seg)
c1 = collections.Counter(); c2 = collections.Counter()
for seg in segments:
    for ch in seg: c1[ch] += 1
    for i in range(len(seg)-1): c2[seg[i:i+2]] += 1
N1 = sum(c1.values())
CANDS = [c for c, n in c1.items() if n >= 20]

def lift(x, y):
    n = c2.get(x+y, 0)
    if n < 3: return 0.0, 0
    return (n*N1)/(c1[x]*c1[y]), n

RARE_MAX = 8
rares = [x for x, n in c1.items() if n <= RARE_MAX]
occ_of = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]", txt):
            pass
    for field, txt in parts:
        idx = 0
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0)
            base = m.start()
            for i, ch in enumerate(seg):
                if c1[ch] <= RARE_MAX:
                    a = max(0, base+i-9); b = min(len(txt), base+i+10)
                    occ_of[ch].append((t["id"], field, txt[a:b], i, seg))

out = []
for c in rares:
    occ = occ_of.get(c, [])
    if not occ: continue
    votes = collections.Counter(); detail = collections.defaultdict(list)
    for tid, field, ctx, i, seg in occ:
        L = seg[i-1] if i-1 >= 0 else None
        R = seg[i+1] if i+1 < len(seg) else None
        ol = 0.0
        if L: ol = max(ol, lift(L, c)[0])
        if R: ol = max(ol, lift(c, R)[0])
        best = (0.0, None, 0)
        for r in CANDS:
            if r == c: continue
            s = 0; n = 0
            if L:
                v, k = lift(L, r); s = max(s, v); n = max(n, k)
            if R:
                v, k = lift(r, R); s = max(s, v); n = max(n, k)
            if s > best[0]: best = (s, r, n)
        if best[1] and best[0] >= 8 and best[0] >= 3.0*ol and best[2] >= 3:
            votes[best[1]] += 1
            detail[best[1]].append((tid, field, ctx, round(ol,1), round(best[0],1), best[2]))
    for r, v in votes.items():
        if v >= max(2, int(len(occ)*0.8)):
            out.append((c, r, v, len(occ), c1[c], detail[r]))

out.sort(key=lambda x: (x[4], -x[2]))
print("consistent pairs:", len(out))

with io.open(os.path.join(OUT, "consistent.txt"), "w", encoding="utf-8") as f:
    for c, r, v, tot, freq, det in out:
        f.write("="*72 + "\n")
        f.write("%s -> %s   一致 %d/%d 次   原字频 %d\n" % (c, r, v, tot, freq))
        for tid, field, ctx, ol, nl, n in det[:6]:
            f.write("   id=%s %s | lift %s->%s n=%s | %s\n" % (tid, field, ol, nl, n, ctx.replace("\n","\\n")))
