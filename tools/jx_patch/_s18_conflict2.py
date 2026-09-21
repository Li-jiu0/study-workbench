# -*- coding: utf-8 -*-
"""在高置信(ref=题干引用被解析正文逐字引用)配对上检验答案一致性，判断是"对齐错"还是"答案本身冲突"。"""
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
AL = {int(k): v for k, v in json.load(open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json', encoding='utf-8')).items()}

PUNCT = set('·…～-—_ \t,，。、？?：:；;()（）""\'\'“”.*#/\\|+')
def strip_noise(s): return ''.join(c for c in s if c not in PUNCT)
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

IMGr = re.compile(r'\[IMG:[^\]]*\]')
def clean(s): return re.sub(r'\s+', '', IMGr.sub('', s or ''))

rows = []
for ti, ji in sorted(AL.items()):
    q = extract_quote(jx[ji]['analysis'])
    t = strip_noise(clean(''.join(tb[ti]['stem'])))
    r = lcs_ratio(q, t) if len(q) >= 5 else 0.0
    rows.append((r, ti, ji, tb[ti]['answer'], jx[ji]['answer']))

strong = [x for x in rows if x[0] >= 0.85]
print('pairs total', len(rows), 'high-confidence (quote>=0.85):', len(strong))
ag = sum(1 for _, _, _, a, b in strong if a == b)
print('high-conf answer agree:', ag, '/', len(strong), round(ag/len(strong), 4))

per90 = [x for x in rows if x[0] >= 0.95]
ag90 = sum(1 for _, _, _, a, b in per90 if a == b)
print('quote>=0.95:', len(per90), 'agree', ag90, round(ag90/max(1,len(per90)), 4))

print('\nconfusion matrix (rows=tiben answer, cols=jiexi answer) on quote>=0.85:')
cm = collections.Counter((a, b) for _, _, _, a, b in strong)
print('      ' + '  '.join('ABCD'))
for r in 'ABCD':
    print(f'  {r}   ' + '   '.join(str(cm.get((r, c), 0)) for c in 'ABCD'))

# 选项顺序错配假设：若存在某个固定置换能把大部分不一致变成一致，则为标答/选项错位
import itertools
best = None
for perm in itertools.permutations('ABCD'):
    # map jiexi ans -> permuted label compared to tiben
    m = {c: p for c, p in zip('ABCD', perm)}
    ok = sum(1 for _, _, _, a, b in strong if a == m.get(b))
    if best is None or ok > best[0]: best = (ok, perm)
print('best fixed-permutation agreement:', best[0], '/', len(strong), round(best[0]/len(strong), 4), 'perm', best[1])
