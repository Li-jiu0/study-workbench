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

BASE = 0.30
GAP = -2.0
W_ANS = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0   # weight of answer bonus

ALIGN = {}
report = {}
for ch in gt:
    T = gt[ch]; J = gj[ch]
    n, m = len(T), len(J)
    NEG = -1e18
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bt = [[''] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for j in range(1, m + 1):
        dp[0][j] = dp[0][j-1] + GAP; bt[0][j] = 'L'
    for i in range(1, n + 1):
        dp[i][0] = dp[i-1][0] + GAP; bt[i][0] = 'U'
    for i in range(1, n + 1):
        ti = T[i-1]
        for j in range(1, m + 1):
            jj = J[j-1]
            s = (cov(TB_BG[ti], JX_BG[jj]) - BASE) * 10.0
            if W_ANS: s += W_ANS * (1.0 if tb[ti]['answer'] == jx[jj]['answer'] else 0.0)
            take = dp[i-1][j-1] + s
            up = dp[i-1][j] + GAP
            left = dp[i][j-1] + GAP
            if take >= up and take >= left:
                dp[i][j] = take; bt[i][j] = 'D'
            elif up >= left:
                dp[i][j] = up; bt[i][j] = 'U'
            else:
                dp[i][j] = left; bt[i][j] = 'L'
    i, j = n, m
    pairs = []; skipT = []; skipJ = []
    while i > 0 or j > 0:
        b = bt[i][j]
        if b == 'D':
            pairs.append((T[i-1], J[j-1]))
            i -= 1; j -= 1
        elif b == 'U':
            skipT.append(T[i-1]); i -= 1
        else:
            skipJ.append(J[j-1]); j -= 1
    pairs.reverse()
    ALIGN.update({a: b for a, b in pairs})
    ag = sum(1 for a, b in pairs if tb[a]['answer'] == jx[b]['answer'])
    cs = [cov(TB_BG[a], JX_BG[b]) for a, b in pairs]
    report[ch] = dict(T=n, J=m, matched=len(pairs), skipT=len(skipT), skipJ=len(skipJ),
                      agree=ag, rate=round(ag/len(pairs), 4),
                      cov_mean=round(sum(cs)/len(cs), 3),
                      low35=sum(1 for c in cs if c < 0.35))
    print(ch, report[ch])

tm = sum(r['matched'] for r in report.values())
ta = sum(r['agree'] for r in report.values())
print('TOTAL matched', tm, 'agree', ta, round(ta/tm, 4))
json.dump({str(a): b for a, b in ALIGN.items()}, open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json','w',encoding='utf-8'), ensure_ascii=False)
print('saved')
