# -*- coding: utf-8 -*-
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']

IMG = re.compile(r'\[IMG:[^\]]*\]')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))
def bg(s): return collections.Counter(s[i:i+2] for i in range(len(s)-1))
def cov(a, b):
    if not a: return 0.0
    return sum(min(v, b.get(k, 0)) for k, v in a.items()) / sum(a.values())

TB_BG = [bg(clean(''.join(t['stem']))) for t in tb]
JX_BG = [bg(clean(j['analysis'])) for j in jx]

gt = collections.OrderedDict(); gj = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
for i, j in enumerate(jx): gj.setdefault(j['chapter'].replace(' ', ''), []).append(i)

ALIGN = {}   # tiben index -> jiexi index
STATS = {}
NEG = -1e9
for ch in gt:
    T = gt[ch]; J = gj[ch]
    n, m = len(T), len(J)
    # dp[i][j]: best total score, T[0..i-1] all matched using J[0..j-1]
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bt = [[0] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        dp[0][j] = 0.0
    for i in range(1, n + 1):
        dp[i][0] = NEG
    for i in range(1, n + 1):
        ti = T[i-1]
        rowp = dp[i-1]; row = dp[i]; rowb = bt[i]
        for j in range(1, m + 1):
            skip = row[j-1]
            take = rowp[j-1] + cov(TB_BG[ti], JX_BG[J[j-1]])
            if take >= skip:
                row[j] = take; rowb[j] = 1
            else:
                row[j] = skip; rowb[j] = 0
    # backtrack
    i, j = n, m
    pairs = []
    while i > 0 and j > 0:
        if bt[i][j] == 1:
            pairs.append((T[i-1], J[j-1], cov(TB_BG[T[i-1]], JX_BG[J[j-1]])))
            i -= 1; j -= 1
        else:
            j -= 1
    pairs.reverse()
    ALIGN.update({a: b for a, b, _ in pairs})
    ag = sum(1 for a, b, _ in pairs if tb[a]['answer'] == jx[b]['answer'])
    cs = [c for _, _, c in pairs]
    unused_j = m - len(pairs)
    STATS[ch] = dict(T=n, J=m, matched=len(pairs), gaps=unused_j,
                     agree=ag, rate=round(ag/len(pairs), 4),
                     cov_mean=round(sum(cs)/len(cs), 3),
                     cov_lt35=sum(1 for c in cs if c < 0.35),
                     cov_lt20=sum(1 for c in cs if c < 0.20))
    print(ch, STATS[ch])

print()
tot_m = sum(s['matched'] for s in STATS.values())
tot_a = sum(s['agree'] for s in STATS.values())
print('TOTAL matched', tot_m, '/ tiben', len(tb), 'jiexi unused', len(jx) - tot_m)
print('TOTAL answer agree', tot_a, round(tot_a / tot_m, 4))

# material-group contiguity check (tiben consecutive same-material -> consecutive jiexi idx)
bad = 0; groups = 0
for ch in gt:
    T = gt[ch]
    grp = []
    prev = None
    for ti in T:
        m_ = tb[ti]['material']
        if m_ != prev:
            grp.append([]); prev = m_
        grp[-1].append(ti)
    for g in grp:
        js = [ALIGN[x] for x in g if x in ALIGN]
        if not js: continue
        groups += 1
        if js != list(range(js[0], js[0] + len(js))):
            bad += 1
print('material groups checked', groups, 'non-contiguous', bad)

json.dump({str(a): b for a, b in ALIGN.items()}, open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json','w',encoding='utf-8'), ensure_ascii=False)
print('saved _tb2jx.json', len(ALIGN))
