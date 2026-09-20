"""扫描 app.js 中的 5 个 INLINE_*_BANK，提取题干/选项文本，统计字符频次。"""
import json, re, sys, collections, io, os

APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch\_work"

BANKS = ["INLINE_QUANT_BANK", "INLINE_JUDGE_BANK", "INLINE_ZILIAO_BANK",
         "INLINE_YANYU_BANK", "INLINE_CHANGSHI_BANK"]

def load():
    banks = {}
    with io.open(APP, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if "var INLINE_" not in line:
                continue
            m = re.match(r"\s*var\s+(INLINE_[A-Z]+_BANK)\s*=", line)
            if not m:
                continue
            name = m.group(1)
            i = line.find("[", m.end())
            j = line.rfind("]")
            if i < 0 or j < 0:
                print("NO BRACKET", name); continue
            raw = line[i:j+1]
            try:
                data = json.loads(raw)
            except Exception as e:
                print("PARSE FAIL", name, e); continue
            banks[name] = data
    return banks

banks = load()
total = 0
for k, v in banks.items():
    print(k, len(v))
    total += len(v)
print("TOTAL", total)
print("missing banks:", [b for b in BANKS if b not in banks])

items = []
for k in BANKS:
    for it in banks.get(k, []):
        items.append(it)

if not os.path.isdir(OUT):
    os.makedirs(OUT)

# 保存全部条目（含 id/type/sub/q/o/a/x），供后续分析
with io.open(os.path.join(OUT, "items.json"), "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False)

# 拼接待清洗文本
texts = []
for it in items:
    q = it.get("q") or ""
    o = it.get("o") or []
    texts.append({"id": it.get("id"), "type": it.get("type"), "sub": it.get("sub"),
                  "q": q, "o": o})

with io.open(os.path.join(OUT, "texts.json"), "w", encoding="utf-8") as f:
    json.dump(texts, f, ensure_ascii=False)

CJK = re.compile(r"[一-鿿]")
cnt = collections.Counter()
for t in texts:
    s = t["q"] + "".join(t["o"])
    for ch in s:
        if CJK.match(ch):
            cnt[ch] += 1

print("unique CJK:", len(cnt), "total CJK:", sum(cnt.values()))

with io.open(os.path.join(OUT, "charfreq.txt"), "w", encoding="utf-8") as f:
    for ch, c in cnt.most_common():
        f.write("%s\t%d\n" % (ch, c))

low = [(ch, c) for ch, c in cnt.items() if c <= 5]
low.sort(key=lambda x: (x[1], x[0]))
print("chars with freq<=5:", len(low))
