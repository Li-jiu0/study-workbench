# -*- coding: utf-8 -*-
import json, sys, io, re, collections, itertools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.setrecursionlimit(10000)
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']

IMG = re.compile(r'\[IMG:[^\]]*\]')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))

def cjk(s):
    return set(re.findall(r'[\u4e00-\u9fff]{2}', s))
def nums(s):
    return set(re.findall(r'\d+(?:\.\d+)?', s))

def cont_score(stem, ana):
    # fraction of stem content tokens that appear in analysis
    sc = cjk(stem)
    if not sc: return 0.0
    hits = sum(1 for t in sc if t in ana)
    cov = hits / len(sc)
    return cov

def bi_sim(a, b):
    A = set(a[i:i+2] for i in range(len(a)-1))
    B = set(b[i:i+2] for i in range(len(b)-1))
    if not A: return 0.0
    return len(A & B) / len(A)

# quick diagnostic: identity mapping per chapter
groups_t = collections.OrderedDict()
for i, t in enumerate(tb):
    groups_t.setdefault(t['chapter'].replace(' ', ''), []).append(i)
groups_j = collections.OrderedDict()
for i, j in enumerate(jx):
    groups_j.setdefault(j['chapter'].replace(' ', ''), []).append(i)

print('=== identity mapping diagnostics (first N min points) ===')
for ch in groups_t:
    T = groups_t[ch]; J = groups_j[ch]
    n = min(len(T), len(J))
    ag = sum(1 for k in range(n) if tb[T[k]]['answer'] == jx[J[k]]['answer'])
    cs = []
    for k in range(0, n, max(1, n // 40)):
        stem = clean(''.join(tb[T[k]]['stem']))
        ana = clean(jx[J[k]]['analysis'])
        cs.append(bi_sim(stem, ana))
    print(f'{ch}: T={len(T)} J={len(J)} n={n} ansAgree={ag}/{n}={ag/n:.3f} bigramCov avg={sum(cs)/len(cs):.3f} max={max(cs):.3f}')

# baseline: random pair bigram coverage for comparison
import random
random.seed(0)
base = []
for ch in groups_t:
    T = groups_t[ch]; J = groups_j[ch]
    for _ in range(30):
        t = tb[random.choice(T)]; j = jx[random.choice(J)]
        base.append(bi_sim(clean(''.join(t['stem'])), clean(j['analysis'])))
print('random pair bigramCov avg =', round(sum(base)/len(base), 3))
