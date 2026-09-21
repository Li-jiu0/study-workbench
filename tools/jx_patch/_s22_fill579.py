# -*- coding: utf-8 -*-
import json, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
AL = {int(k): v for k, v in json.load(open(rf'{OUT}\_tb2jx.json', encoding='utf-8')).items()}
used_j = set(AL.values())
ti = 579
mat = tb[ti]['material']
grp = [i for i, t in enumerate(tb) if t['material'] == mat]
print('material', mat, 'members', grp)
for i in grp:
    print(' T', i, tb[i]['answer'], ''.join(tb[i]['stem'])[:40].replace('\n',''), '-> J', AL.get(i))
lo = min(v for i in grp if i in AL for v in [AL[i]])
hi = max(AL[i] for i in grp if i in AL)
print('J range used', lo, hi)
for j in range(lo-2, hi+3):
    print(' J', j, 'used' if j in used_j else 'FREE', jx[j]['answer'], jx[j]['analysis'].replace('\n','')[:70])
