# -*- coding: utf-8 -*-
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
gt = collections.OrderedDict(); gj = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
for i, j in enumerate(jx): gj.setdefault(j['chapter'].replace(' ', ''), []).append(i)
T = gt['第一章表格资料']; J = gj['第一章表格资料']
d = [k for k in range(min(len(T), len(J))) if tb[T[k]]['answer'] != jx[J[k]]['answer']]
print('first diffs', d[:12], 'count', len(d))
k = d[0]
print('=== around k =', k)
for x in range(max(0, k-2), min(len(T), k+5)):
    print('T', x, tb[T[x]]['answer'], tb[T[x]]['material'], repr(''.join(tb[T[x]]['stem'])[:60]))
print('---')
for x in range(max(0, k-2), min(len(J), k+6)):
    a = jx[J[x]]['analysis'].replace('\n', '')
    print('J', x, jx[J[x]]['answer'], 'p', jx[J[x]]['page'], repr(a[:80]))
