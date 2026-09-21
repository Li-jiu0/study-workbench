# -*- coding: utf-8 -*-
import json, io, sys, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
exec(open('build.py', encoding='utf-8').read().split('# ---------- 校验 ----------')[0].replace(
    "OUTD + r'\\patch_judge.json'", "r'__x.json'"))

# 统计每章配对
print("\n--- 每章配对核验 ---")
tot = 0
for ch in (1, 2, 3, 4):
    T = [q for q in tb if q['chapter'] == ch]
    J = [x for x in jx if x['_ch'] == ch]
    c = sum(1 for q in T if id(q) in tb2jx)
    tot += c
    print(f" 第{ch}章 TB {len(T)} -> 配对 {c} (JX {len(J)})")
print(" 合计配对:", tot)

# 未配对 JX
used = set(id(v) for v in tb2jx.values())
un = [x for x in jx if id(x) not in used]
print("\n未配对 JX 条目:", len(un))
for x in un[:30]:
    print("   ", x['section_key'], '| qid', x['qid'], '| page', x['page'], '| ans', jx_ans(x))

# 未配对 TB
unt = [q for q in tb if id(q) not in tb2jx]
print("\n未配对 TB 题:", len(unt))
print(collections.Counter(q['section_key'] for q in unt).most_common(20))
