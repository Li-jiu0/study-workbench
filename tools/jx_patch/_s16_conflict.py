# -*- coding: utf-8 -*-
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
    a = ana.replace('\n', '')
    best = ''
    for trig in ('题干', '题于', '题千', '题日'):
        p = a.find(trig)
        if 0 <= p < 60:
            q1 = a.find('“', p); q2 = a.find('”', q1 + 1) if q1 >= 0 else -1
            if q1 >= 0 and q2 > q1 and q2 - q1 <= 70:
                c = strip_noise(a[q1+1:q2])
                if len(c) > len(best): best = c
    return best
TAIL = re.compile(r'故正确答案为\s*([ABCD])')
def tail_ans(a):
    m = None
    for m in TAIL.finditer(a.replace('\n', '')):
        pass
    return m.group(1) if m else ''

n_tail = sum(1 for j in jx if tail_ans(j['analysis']))
print('tail answer extracted:', n_tail, '/', len(jx))
ag_field = ag_tail = 0
disagree_both = []
for ti, ji in AL.items():
    a = tb[ti]['answer']; b = jx[ji]['answer']; c = tail_ans(jx[ji]['analysis'])
    if a == b: ag_field += 1
    if c and a == c: ag_tail += 1
    if a != b:
        disagree_both.append((ti, ji, a, b, c))
print('field agree', ag_field, '/', len(AL), round(ag_field/len(AL), 4))
print('tail  agree', ag_tail, '/', len(AL), round(ag_tail/len(AL), 4))
# among pairs whose field differs, how often does tail also differ from tb (real conflict) vs tail agrees with tb (answer field bad)
same_as_tb = sum(1 for _, _, a, b, c in disagree_both if c and c == a)
have_tail = sum(1 for _, _, a, b, c in disagree_both if c)
print('disagree pairs', len(disagree_both), 'with tail', have_tail, 'tail==tiben', same_as_tb, 'tail==field', sum(1 for _, _, a, b, c in disagree_both if c and c == b))
print()
for ch in ('第二章图形资料', '第四章综合资料'):
    print('=== disagree samples', ch)
    n = 0
    for ti, ji, a, b, c in sorted(disagree_both, key=lambda x: x[0]):
        if tb[ti]['chapter'].replace(' ', '') != ch: continue
        n += 1
        if n > 8: break
        print(f'T{ti}(ans={a}) {("".join(tb[ti]["stem"]))[:55]!r}')
        print(f'   J{ji}(ans={b},tail={c}) quote={extract_quote(jx[ji]["analysis"])[:45]!r} ana={jx[ji]["analysis"].replace(chr(10),"")[:70]!r}')
