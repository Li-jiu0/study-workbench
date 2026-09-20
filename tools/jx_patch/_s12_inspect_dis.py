# -*- coding: utf-8 -*-
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
AL = {int(k): v for k, v in json.load(open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json', encoding='utf-8')).items()}
IMG = re.compile(r'\[IMG:[^\]]*\]')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))
def bg(s): return collections.Counter(s[i:i+2] for i in range(len(s)-1))
def cov(a, b):
    if not a: return 0.0
    return sum(min(v, b.get(k, 0)) for k, v in a.items()) / sum(a.values())

gt = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)

for ch in ('第三章文字资料', '第四章综合资料'):
    print('======', ch)
    T = gt[ch]
    shown = 0
    for k, ti in enumerate(T):
        ji = AL[ti]
        c = cov(bg(clean(''.join(tb[ti]['stem']))), bg(clean(jx[ji]['analysis'])))
        if tb[ti]['answer'] != jx[ji]['answer']:
            print(f'-- pos {k} T:{tb[ti]["answer"]} J:{jx[ji]["answer"]} cov={c:.2f} mat={tb[ti]["material"]} drift={ji-sum(1 for x in T[:k]) }')
            print('   STEM:', ''.join(tb[ti]['stem'])[:70].replace('\n',''))
            print('   ANA :', jx[ji]['analysis'].replace('\n','')[:120])
            shown += 1
            if shown >= 6: break
