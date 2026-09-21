# -*- coding: utf-8 -*-
"""在 v1 全局对齐之上做「材料组内部最优重排」：只在本材料组的候选解析窗口内重排，打分仍为纯内容。"""
import json, sys, io, re, collections, functools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
V1 = {int(k): v for k, v in json.load(open(rf'{OUT}\_tb2jx_v1.json', encoding='utf-8')).items()}

IMG = re.compile(r'\[IMG:[^\]]*\]')
PUNCT = set('·…～-—_ \t,，。、？?：:；;()（）""\'\'“”.*#/\\|+')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))
def strip_noise(s): return ''.join(c for c in s if c not in PUNCT)
def bg(s): return collections.Counter(s[i:i+2] for i in range(len(s)-1))
def cov(a, b):
    if not a: return 0.0
    return sum(min(v, b.get(k, 0)) for k, v in a.items()) / sum(a.values())
def extract_quote(ana):
    a = ana.replace('\n', ''); best = ''
    for trig in ('题干', '题于', '题千', '题日'):
        p = a.find(trig)
        if 0 <= p < 60:
            q1 = a.find('“', p); q2 = a.find('”', q1+1) if q1 >= 0 else -1
            if q1 >= 0 and q2 > q1 and q2 - q1 <= 70:
                c = strip_noise(a[q1+1:q2])
                if len(c) > len(best): best = c
    return best
def lcs_ratio(q, t):
    if not q: return 0.0
    prev = [0]*(len(t)+1)
    for c in q:
        cur = [0]
        for k in range(1, len(t)+1):
            cur.append(prev[k-1]+1 if c == t[k-1] else max(prev[k], cur[k-1]))
        prev = cur
    return prev[-1]/len(q)

TB_TEXT = [strip_noise(clean(''.join(t['stem']))) for t in tb]
TB_BG = [bg(clean(''.join(t['stem']) + ''.join((t.get('options') or {}).values()))) for t in tb]
JX_BG = [bg(clean(j['analysis'])) for j in jx]
JQ = [strip_noise(extract_quote(j['analysis'])) for j in jx]

@functools.lru_cache(maxsize=None)
def score(ti, jj):
    c = cov(TB_BG[ti], JX_BG[jj]); q = JQ[jj]
    qr = lcs_ratio(q, TB_TEXT[ti]) if len(q) >= 6 else 0.0
    ok = (c >= 0.42) or (qr >= 0.70)
    s = max(c - 0.30, 0.0) * 8.0 + (qr - 0.5) * 14.0
    return (s if ok else -1e9)

gt = collections.OrderedDict(); gj = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
for i, j in enumerate(jx): gj.setdefault(j['chapter'].replace(' ', ''), []).append(i)

NEW = dict(V1)
changed = 0
for ch in gt:
    T = gt[ch]; J = gj[ch]
    jset = set(J); jlo = J[0]; jhi = J[-1]
    grps = []
    prev = None
    for ti in T:
        m_ = tb[ti]['material']
        if m_ != prev: grps.append([]); prev = m_
        grps[-1].append(ti)
    for gi, g in enumerate(grps):
        # 候选窗口：本组已占用的 J 及相邻未占用的 J，且不跨相邻组边界
        cur = [V1[x] for x in g if x in V1]
        lo = max(jlo, (max([V1[x] for x in grps[gi-1] if x in V1]) + 1) if gi > 0 else jlo)
        hi = min(jhi, (min([V1[x] for x in grps[gi+1] if x in V1]) - 1) if gi < len(grps)-1 else jhi)
        if cur:
            lo = min(lo, min(cur) - 3); hi = max(hi, max(cur) + 3)
            lo = max(lo, jlo); hi = min(hi, jhi)
        used_elsewhere = {V1[x] for x in T if x not in g and x in V1}
        cand = [j for j in range(lo, hi+1) if j in jset and j not in used_elsewhere]
        if not cand or len(cand) > 14:
            continue
        k = len(g); c = len(cand)
        full = 1 << c
        NEG = -1e18
        dp = [[NEG]*full for _ in range(k+1)]
        parent = [[None]*full for _ in range(k+1)]
        dp[0][0] = 0.0
        for i in range(k):
            ti = g[i]
            for mask in range(full):
                if dp[i][mask] == NEG: continue
                base = dp[i][mask]
                # skip this T
                if base > dp[i+1][mask]:
                    dp[i+1][mask] = base; parent[i+1][mask] = (mask, None)
                for cj in range(c):
                    if mask & (1 << cj): continue
                    s = score(ti, cand[cj])
                    if s <= -1e8: continue
                    nm = mask | (1 << cj)
                    v = base + s
                    if v > dp[i+1][nm]:
                        dp[i+1][nm] = v; parent[i+1][nm] = (mask, cj)
        bestmask = max(range(full), key=lambda mm: dp[k][mm])
        if dp[k][bestmask] == NEG: continue
        # backtrack
        assign = {}
        mask = bestmask
        for i in range(k, 0, -1):
            pm, cj = parent[i][mask]
            if cj is not None:
                assign[g[i-1]] = cand[cj]
            mask = pm
        for x in g:
            old = V1.get(x); new = assign.get(x)
            if old != new:
                NEW[x] = new if new is not None else None
                NEW.pop(x, None) if new is None else None
                changed += 1
        for x in g:
            if x in assign: NEW[x] = assign[x]
            else: NEW.pop(x, None)

print('pairs changed by refinement:', changed)
matched = {a: b for a, b in NEW.items() if b is not None}
print('matched after refine:', len(matched), '(v1:', len(V1), ')')
ag = sum(1 for a, b in matched.items() if tb[a]['answer'] == jx[b]['answer'])
print('answer agree:', ag, '/', len(matched), round(ag/len(matched), 4))
print('spot check T576..580 ->', [matched.get(x) for x in range(576, 581)], '(期望 585,586,587,588,None)')
json.dump({str(a): b for a, b in matched.items()}, open(rf'{OUT}\_tb2jx.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('saved _tb2jx.json (v3 refine)')
