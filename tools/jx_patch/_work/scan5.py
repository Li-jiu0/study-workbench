"""n-gram 变体对照：低频 n-gram vs 仅差一字的高频 n-gram。+ 标点/结构异常扫描。"""
import json, re, collections, io, os

OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"
texts = json.load(io.open(os.path.join(OUT, "texts.json"), encoding="utf-8"))

segs = []
for t in texts:
    s = t["q"]
    for o in (t["o"] or []):
        s += "\n" + str(o)
    for seg in re.findall(r"[一-鿿]+", s):
        segs.append(seg)

N = 3
g = collections.Counter()
for seg in segs:
    for i in range(len(seg) - N + 1):
        g[seg[i:i+N]] += 1
print("uniq %d-gram:" % N, len(g))

# 洞索引 (pos, other_chars) -> Counter(missing char)
H = collections.defaultdict(collections.Counter)
for t, n in g.items():
    H[(0, t[1], t[2])][t[0]] += n
    H[(1, t[0], t[2])][t[1]] += n
    H[(2, t[0], t[1])][t[2]] += n

MIN_VAR = 6
res = []
for t, n in g.items():
    if n > 2:
        continue
    for pos in range(3):
        others = tuple(x for k, x in enumerate(t) if k != pos)
        counter = H[(pos, others[0], others[1])]
        for ch, cn in counter.items():
            if ch == t[pos]:
                continue
            if cn >= MIN_VAR and cn >= 4 * n:
                res.append((t, n, pos, ch, cn))
res.sort(key=lambda x: -(x[4] / max(x[1], 1)))
print("variant hits:", len(res))

# 聚合到 (from_char, to_char) 并附上下文
agg = collections.defaultdict(list)
occ = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0)
            for i in range(len(seg) - N + 1):
                occ[seg[i:i+N]].append((t["id"], field, txt[max(0, m.start()+i-8):m.start()+i+N+8]))

seen = set()
lines = []
for t, n, pos, ch, cn in res:
    key = (t[pos], ch)
    if key in seen:
        continue
    seen.add(key)
    ctx = occ.get(t, [])[:4]
    lines.append((key, n, cn, t, pos, ctx))

with io.open(os.path.join(OUT, "variants.txt"), "w", encoding="utf-8") as f:
    for (a, b), n, cn, t, pos, ctx in lines:
        f.write("%s -> %s   [低频ngram %s x%d | 高频变体 %s x%d]\n"
                % (a, b, t, n, t[:pos] + b + t[pos+1:], cn))
        for tid, field, c in ctx:
            f.write("      id=%s %s | %s\n" % (tid, field, c.replace("\n", "\\n")))
print("pairs:", len(lines))
