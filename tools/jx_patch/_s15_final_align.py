# -*- coding: utf-8 -*-
"""最终对齐：题本 <-> 解析（Needleman-Wunsch，纯内容打分，不含答案信息）"""
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']

IMG = re.compile(r'\[IMG:[^\]]*\]')
PUNCT = set('·…～-—_ \t,，。、？?：:；;()（）""\'\'“”.*#/\\|+')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))
def strip_noise(s): return ''.join(c for c in s if c not in PUNCT)

def bg(s): return collections.Counter(s[i:i+2] for i in range(len(s)-1))
def cov(a, b):
    if not a: return 0.0
    return sum(min(v, b.get(k, 0)) for k, v in a.items()) / sum(a.values())

def extract_quote(ana):
    a = ana.replace('\n', '')
    best = ''
    for trig in ('题干', '题于', '题千', '题日'):
        p = a.find(trig)
        if 0 <= p < 60:
            q1 = a.find('“', p)
            q2 = a.find('”', q1 + 1) if q1 >= 0 else -1
            if q1 >= 0 and q2 > q1 and q2 - q1 <= 70:
                cand = strip_noise(a[q1+1:q2])
                if len(cand) > len(best): best = cand
    return best

def lcs_ratio(q, t):
    if not q: return 0.0
    prev = [0] * (len(t) + 1)
    for c in q:
        cur = [0]
        for k in range(1, len(t) + 1):
            cur.append(prev[k-1] + 1 if c == t[k-1] else max(prev[k], cur[k-1]))
        prev = cur
    return prev[-1] / len(q)

TB_TEXT = []; TB_BG = []
for t in tb:
    s = clean(''.join(t['stem']))
    o = ''.join((t.get('options') or {}).values())
    comb = clean(s + ''.join((t.get('options') or {}).values()))
    TB_TEXT.append(s)
    TB_BG.append(bg(comb))
JX_BG = [bg(clean(j['analysis'])) for j in jx]
JQ = [strip_noise(extract_quote(j['analysis'])) for j in jx]
print('quotes>=5:', sum(1 for q in JQ if len(q) >= 5))

gt = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
gj = collections.OrderedDict()
for i, j in enumerate(jx): gj.setdefault(j['chapter'].replace(' ', ''), []).append(i)

BASE = 0.30
GAP = -2.0
ALIGN = {}
REPORT = {}
for ch in gt:
    T = gt[ch]; J = gj[ch]
    n, m = len(T), len(J)
    NEG = -1e18
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bt = [[''] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for j in range(1, m + 1): dp[0][j] = dp[0][j-1] + GAP; bt[0][j] = 'L'
    for i in range(1, n + 1): dp[i][0] = dp[i-1][0] + GAP; bt[i][0] = 'U'
    cache = {}
    for i in range(1, n + 1):
        ti = T[i-1]
        for j in range(1, m + 1):
            jj = J[j-1]
            if (ti, jj) in cache:
                s = cache[(ti, jj)]
            else:
                c = cov(TB_BG[ti], JX_BG[jj])
                q = JQ[jj]
                s = (c - BASE) * 8.0
                if len(q) >= 5:
                    s += (lcs_ratio(q, TB_TEXT[ti]) - 0.5) * 14.0
                cache[(ti, jj)] = s
            take = dp[i-1][j-1] + s
            up = dp[i-1][j] + GAP
            left = dp[i][j-1] + GAP
            if take >= up and take >= left: dp[i][j] = take; bt[i][j] = 'D'
            elif up >= left: dp[i][j] = up; bt[i][j] = 'U'
            else: dp[i][j] = left; bt[i][j] = 'L'
    i, j = n, m
    pairs = []; skipT = 0; skipJ = 0
    while i > 0 or j > 0:
        b = bt[i][j]
        if b == 'D': pairs.append((T[i-1], J[j-1])); i -= 1; j -= 1
        elif b == 'U': skipT += 1; i -= 1
        else: skipJ += 1; j -= 1
    pairs.reverse()
    ALIGN.update({a: b for a, b in pairs})
    ag = sum(1 for a, b in pairs if tb[a]['answer'] == jx[b]['answer'])
    cs = [cov(TB_BG[a], JX_BG[b]) for a, b in pairs]
    REPORT[ch] = dict(T=n, J=m, matched=len(pairs), skipT=skipT, skipJ=skipJ,
                      agree=ag, rate=round(ag/len(pairs), 4),
                      cov_mean=round(sum(cs)/len(cs), 3),
                      low35=sum(1 for c in cs if c < 0.35))
    print(ch, REPORT[ch])

tm = sum(r['matched'] for r in REPORT.values())
ta = sum(r['agree'] for r in REPORT.values())
print('TOTAL matched', tm, 'agree', ta, round(ta/tm, 4))
json.dump({str(a): b for a, b in ALIGN.items()}, open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('saved _tb2jx.json')
