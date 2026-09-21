"""低频嫌疑字 -> 候选 -> lift(点互信息) 增益排序 + 标点/结构异常扫描。"""
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
N1 = sum(c1.values()); N2 = sum(c2.values())

CANDS = [c for c, n in c1.items() if n >= 20]
print("pool", len(CANDS), "N1", N1)

def lift(x, y):
    n = c2.get(x+y, 0)
    if n < 3: return 0.0, 0
    return (n * N1) / (c1[x] * c1[y]), n

results = []
RARE_MAX = 8
for c in [x for x, n in c1.items() if n <= RARE_MAX]:
    for t in texts:
        parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
        for field, txt in parts:
            for m in re.finditer(re.escape(c), txt):
                a = max(0, m.start()-9); b = min(len(txt), m.end()+9)
                ctx = txt[a:b]
                segs = re.findall(r"[一-鿿]+", ctx)
                tgt = next((s for s in segs if c in s), None)
                if tgt is None: continue
                i = tgt.index(c)
                L = tgt[i-1] if i-1 >= 0 else None
                R = tgt[i+1] if i+1 < len(tgt) else None
                o_lift = 0; o_n = 0
                if L: 
                    v, n = lift(L, c); o_lift = max(o_lift, v); o_n = max(o_n, n)
                if R:
                    v, n = lift(c, R); o_lift = max(o_lift, v); o_n = max(o_n, n)
                best = (0.0, None, 0); second = 0.0
                for r in CANDS:
                    if r == c: continue
                    s = 0; n = 0
                    if L:
                        v, k = lift(L, r); s = max(s, v); n = max(n, k)
                    if R:
                        v, k = lift(r, R); s = max(s, v); n = max(n, k)
                    if s > best[0]:
                        second = best[0]; best = (s, r, n)
                    elif s > second:
                        second = s
                if best[1] is None: continue
                if best[0] >= 8 and best[0] >= 3.0*o_lift and best[2] >= 3:
                    results.append({"char": c, "freq": c1[c], "id": t["id"], "field": field,
                                    "ctx": ctx, "cand": best[1], "lift": round(best[0],1),
                                    "olift": round(o_lift,1), "n": best[2],
                                    "ratio": round(best[0]/max(second,0.01),1)})

print("candidates:", len(results))
results.sort(key=lambda r: (r["freq"], -r["lift"]))

agg = collections.OrderedDict()
for r in results:
    k = (r["char"], r["cand"])
    agg.setdefault(k, []).append(r)

with io.open(os.path.join(OUT, "lift_agg.txt"), "w", encoding="utf-8") as f:
    for (a, b), lst in sorted(agg.items(), key=lambda kv: (kv[1][0]["freq"], -len(kv[1]))):
        f.write("=" * 70 + "\n")
        f.write("%s -> %s  x%d  (原字频%d, lift %.1f)\n" % (a, b, len(lst), lst[0]["freq"], lst[0]["lift"]))
        for r in lst[:6]:
            f.write("   id=%s %s | %s | lift %s->%s n=%s ratio=%s\n"
                    % (r["id"], r["field"], r["ctx"].replace("\n", "\\n"), r["olift"], r["lift"], r["n"], r["ratio"]))
print("agg pairs:", len(agg))
