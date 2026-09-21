"""低频嫌疑字 -> 形近候选 -> 语料 n-gram 增益排序。"""
import json, re, collections, io, os

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))

CJK = re.compile(r"[一-鿿]")

# ---------- 1. 切分纯 CJK 段 ----------
segments = []          # 每段的纯汉字串
for t in texts:
    s = t["q"]
    for o in (t["o"] or []):
        s += "\n" + str(o)
    for seg in re.findall(r"[一-鿿]+", s):
        segments.append(seg)

chfreq = collections.Counter()
bi = collections.Counter()
tri = collections.Counter()
for seg in segments:
    for ch in seg:
        chfreq[ch] += 1
    for i in range(len(seg) - 1):
        bi[seg[i:i+2]] += 1
    for i in range(len(seg) - 2):
        tri[seg[i:i+3]] += 1

print("segments", len(segments), "chars", sum(chfreq.values()), "uniq", len(chfreq))

# 高频字作为“正确字形”候选池
CANDS = [c for c, n in chfreq.items() if n >= 25]
print("candidate pool", len(CANDS))

RARE_MAX = 6
rares = [c for c, n in chfreq.items() if n <= RARE_MAX]
print("rare chars (<=%d):" % RARE_MAX, len(rares))

def ctx_score(seg, i, r):
    """把 seg[i] 换成 r 后的 n-gram 支持度"""
    n = len(seg)
    s = 0
    if i - 1 >= 0:
        s += bi.get(seg[i-1] + r, 0)
    if i + 1 < n:
        s += bi.get(r + seg[i+1], 0)
    if i - 2 >= 0:
        s += tri.get(seg[i-2] + seg[i-1] + r, 0)
    if i - 1 >= 0 and i + 1 < n:
        s += tri.get(seg[i-1] + r + seg[i+1], 0)
    if i + 2 < n:
        s += tri.get(r + seg[i+1] + seg[i+2], 0)
    return s

results = []
for c in rares:
    occ = []
    for t in texts:
        s = t["q"]
        parts = [("q", t["q"])]
        for k, o in enumerate(t["o"] or []):
            parts.append(("o%d" % k, str(o)))
        for field, txt in parts:
            for m in re.finditer(re.escape(c), txt):
                a = max(0, m.start() - 10)
                b = min(len(txt), m.end() + 10)
                occ.append((t["id"], field, txt[a:b]))
    # 对每次出现算候选
    for tid, field, ctx in occ:
        seg = re.findall(r"[一-鿿]+", ctx)
        if not seg:
            continue
        # 找包含 c 的段
        target = None
        for sg in seg:
            if c in sg:
                target = sg
        if target is None:
            continue
        i = target.index(c)
        orig = ctx_score(target, i, c)
        scored = []
        for r in CANDS:
            if r == c:
                continue
            sc = ctx_score(target, i, r)
            if sc > 0:
                scored.append((sc, r))
        scored.sort(reverse=True)
        if not scored:
            continue
        best = scored[0]
        second = scored[1][0] if len(scored) > 1 else 0
        results.append({
            "char": c, "freq": chfreq[c], "id": tid, "field": field,
            "ctx": ctx, "orig": orig, "best": best[1], "best_score": best[0],
            "second": second, "top": [x[1] for x in scored[:5]]})

# 只保留增益大的
strong = [r for r in results if r["best_score"] >= 15 and r["best_score"] >= 3 * r["orig"] + 8]
strong.sort(key=lambda r: (r["freq"], -r["best_score"]))
print("strong candidates:", len(strong))

with io.open(os.path.join(OUT, "rare_cands.txt"), "w", encoding="utf-8") as f:
    for r in strong:
        f.write("%s(f%d)\tid=%s\t%s\t[%s]->%s\tscore %d->%d (2nd %d)\tctx: %s\n"
                % (r["char"], r["freq"], r["id"], r["field"], r["char"], r["best"],
                   r["orig"], r["best_score"], r["second"], r["ctx"]))

# 汇总：按 (char->best) 聚合
agg = collections.Counter()
aggctx = {}
for r in strong:
    key = (r["char"], r["best"])
    agg[key] += 1
    aggctx.setdefault(key, []).append((r["id"], r["ctx"], r["freq"]))

with io.open(os.path.join(OUT, "rare_agg.txt"), "w", encoding="utf-8") as f:
    for (a, b), n in agg.most_common():
        f.write("%s -> %s : %d 次 (原字频 %d)\n" % (a, b, n, aggctx[(a, b)][0][2]))
        for tid, ctx, _ in aggctx[(a, b)][:6]:
            f.write("      id=%s  %s\n" % (tid, ctx))
