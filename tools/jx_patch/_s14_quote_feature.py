# -*- coding: utf-8 -*-
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']

NOISE = set('·…～-—_ \t,，。、？?：:；;()（）""\'\'“”·')
def strip_noise(s): return ''.join(c for c in s if c not in NOISE and c != '·')

def extract_quote(ana):
    a = ana.replace('\n', '')
    for trig in ('题干', '题于', '题千', '题日'):
        p = a.find(trig)
        if 0 <= p < 60:
            q1 = a.find('“', p)
            q2 = a.find('”', q1 + 1) if q1 >= 0 else -1
            if q1 >= 0 and q2 > q1 and q2 - q1 <= 60:
                return a[q1+1:q2]
    return ''

def sub_ratio(q, t):
    if not q: return 0.0
    i = 0; hit = 0
    for c in t:
        if i < len(q) and c == q[i]:
            i += 1; hit += 1
            if i >= len(q): break
    return hit / len(q)

qs = {i: strip_noise(extract_quote(j['analysis'])) for i, j in enumerate(jx)}
usable = {i: q for i, q in qs.items() if len(q) >= 5}
print('jiexi items with usable quote:', len(usable), '/', len(jx))
print('sample quotes:', [repr(v[:30]) for v in list(usable.values())[:6]])

AL = {int(k): v for k, v in json.load(open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json', encoding='utf-8')).items()}
JT = {v: k for k, v in AL.items()}
gt = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)

TB_TEXT = {}
for i, t in enumerate(tb):
    TB_TEXT[i] = strip_noise(''.join(t['stem']))

# For every J item in ch4 with a quote, rank all T in same chapter by quote coverage
ch = '第四章综合资料'
T = gt[ch]
gjT = None
JTset = set(T)
# find J range for this chapter from alignment
jidx = sorted(AL[i] for i in T if i in AL)
print('ch4 J range', jidx[0], jidx[-1])
SAMPLE = [j for j in range(jidx[0], jidx[-1]+1) if j in usable][:300]
top1_right = 0; top1_sameans = 0; tot = 0
top1_is_current = 0
for j in SAMPLE:
    cands = [(round(sub_ratio(usable[j], TB_TEXT[i]), 3), i) for i in T]
    cands.sort(reverse=True)
    best = cands[0]; second = cands[1]
    cur = JT.get(j)
    tot += 1
    if best[1] == cur: top1_is_current += 1
    # does the best candidate's answer equal J's answer?
    if tb[best[1]]['answer'] == jx[j]['answer']: top1_sameans += 1
print('ch4 quote-based: N=', tot, 'best==current ', top1_is_current, 'bestans==Jans', top1_sameans, round(top1_sameans/tot, 3))
print()
print('=== examples where quote-best differs from current alignment ===')
n = 0
for j in SAMPLE:
    cands = sorted(((round(sub_ratio(usable[j], TB_TEXT[i]), 3), i) for i in T), reverse=True)
    cur = JT.get(j)
    if cands[0][1] != cur and n < 8:
        n += 1
        print(f'J{j} ans={jx[j]["answer"]} quote={usable[j][:40]!r}')
        print(f'   cur T{cur} ans={tb[cur]["answer"] if cur is not None else "-"} score={sub_ratio(usable[j], TB_TEXT[cur]) if cur is not None else 0:.2f} stem={ "".join(tb[cur]["stem"])[:45]!r}')
        print(f'   best T{cands[0][1]} s={cands[0][0]} ans={tb[cands[0][1]]["answer"]} stem={"".join(tb[cands[0][1]]["stem"])[:45]!r}')
        print(f'   2nd  T{cands[1][1]} s={cands[1][0]} ans={tb[cands[1][1]]["answer"]} stem={"".join(tb[cands[1][1]]["stem"])[:45]!r}')
