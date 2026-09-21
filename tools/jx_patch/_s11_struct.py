# -*- coding: utf-8 -*-
import json, sys, io, re, collections, itertools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
gt = collections.OrderedDict(); gj = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
for i, j in enumerate(jx): gj.setdefault(j['chapter'].replace(' ', ''), []).append(i)

for ch in gt:
    T = gt[ch]
    seq = []
    for x in T:
        x2 = tb[x]
        key = (x2['difficulty'], x2['point'], x2['section'])
        if not seq or seq[-1][0] != key: seq.append((key, 1))
        else: seq[-1] = (key, seq[-1][1]+1)
    print('==', ch)
    print('   tb (diff,point) runs:', [(f'{k[0]}|{k[1]}', c) for k, c in seq])
