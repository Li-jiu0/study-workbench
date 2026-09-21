"""字形约束(码位邻近)的低频 n-gram 变体对照 + 标点/结构异常扫描。"""
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

c1 = collections.Counter(); c2 = collections.Counter(); c3 = collections.Counter()
for seg in segs:
    for ch in seg: c1[ch] += 1
    for i in range(len(seg)-1): c2[seg[i:i+2]] += 1
    for i in range(len(seg)-2): c3[seg[i:i+3]] += 1
print("uniq2", len(c2), "uniq3", len(c3))

SHAPE = 1500          # 码位邻近阈值
MIN_HI = 15           # 变体最低出现次数
MAX_LO = 3            # 被替换 n-gram 最高出现次数

def near(a, b):
    return a != b and abs(ord(a) - ord(b)) <= SHAPE

# ---------- 2-gram ----------
prev = collections.defaultdict(collections.Counter)   # y -> Counter(x)
nextc = collections.defaultdict(collections.Counter)  # x -> Counter(y)
for (a, b), n in c2.items():
    prev[b][a] += n
    nextc[a][b] += n

hits2 = []
for (a, b), n in c2.items():
    if n > MAX_LO:
        continue
    for x, xn in prev[b].items():
        if near(x, a) and xn >= MIN_HI and xn >= 5*n:
            hits2.append((a + b, n, 0, x, xn))
    for y, yn in nextc[a].items():
        if near(y, b) and yn >= MIN_HI and yn >= 5*n:
            hits2.append((a + b, n, 1, y, yn))

# ---------- 3-gram ----------
# 洞索引
H = collections.defaultdict(collections.Counter)
for t, n in c3.items():
    H[(0, t[1], t[2])][t[0]] += n
    H[(1, t[0], t[2])][t[1]] += n
    H[(2, t[0], t[1])][t[2]] += n

hits3 = []
for t, n in c3.items():
    if n > MAX_LO:
        continue
    for pos in range(3):
        others = tuple(x for k, x in enumerate(t) if k != pos)
        for ch, cn in H[(pos, others[0], others[1])].items():
            if near(ch, t[pos]) and cn >= 8 and cn >= 5*n:
                hits3.append((t, n, pos, ch, cn))

print("hits2", len(hits2), "hits3", len(hits3))

# ---------- 上下文索引 ----------
occ2 = collections.defaultdict(list); occ3 = collections.defaultdict(list)
for t in texts:
    parts = [("q", t["q"])] + [("o%d" % k, str(o)) for k, o in enumerate(t["o"] or [])]
    for field, txt in parts:
        for m in re.finditer(r"[一-鿿]+", txt):
            seg = m.group(0); base = m.start()
            for i in range(len(seg)-1):
                occ2[seg[i:i+2]].append((t["id"], field, txt[max(0,base+i-9):base+i+11]))
            for i in range(len(seg)-2):
                occ3[seg[i:i+3]].append((t["id"], field, txt[max(0,base+i-9):base+i+12]))

def dump(f, hits, occ, N):
    agg = collections.OrderedDict()
    for t, n, pos, ch, cn in hits:
        agg.setdefault((t[pos], ch, t, cn), 0)
    seen = set(); rows = []
    for t, n, pos, ch, cn in sorted(hits, key=lambda x: -x[4]):
        k = (t, pos, ch)
        if k in seen: continue
        seen.add(k)
        rows.append((t, n, pos, ch, cn))
    for t, n, pos, ch, cn in sorted(rows, key=lambda x: (x[1], -x[4])):
        f.write("%s -> %s | %s x%d  ==>  %s x%d\n"
                % (t[pos], ch, t, n, t[:pos] + ch + t[pos+1:], cn))
        for tid, field, c in occ.get(t, [])[:4]:
            f.write("     id=%s %s | %s\n" % (tid, field, c.replace("\n","\\n")))
    return len(rows)

with io.open(os.path.join(OUT, "shape_var.txt"), "w", encoding="utf-8") as f:
    f.write("########## 2-gram 变体 ##########\n")
    a = dump(f, hits2, occ2, 2)
    f.write("\n\n########## 3-gram 变体 ##########\n")
    b = dump(f, hits3, occ3, 3)
    print("rows2", a, "rows3", b)
