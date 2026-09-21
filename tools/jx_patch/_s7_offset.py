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

for ch in gt:
    T = gt[ch]; J = gj[ch]
    res = []
    for off in range(-6, 7):
        pairs = [(T[k], J[k+off]) for k in range(len(T)) if 0 <= k+off < len(J)]
        if len(pairs) < 50: continue
        ag = sum(1 for a, b in pairs if tb[a]['answer'] == jx[b]['answer'])
        res.append((round(ag/len(pairs), 3), off, len(pairs)))
    res.sort(reverse=True)
    print(ch, 'T', len(T), 'J', len(J), 'best offsets:', res[:4])
print()
# print answer sequences head for ch1
T = gt['第一章表格资料']; J = gj['第一章表格资料']
print('T ans:', ''.join(tb[i]['answer'] for i in T)[:80])
print('J ans:', ''.join(jx[i]['answer'] for i in J)[:80])
print('T ans:', ''.join(tb[i]['answer'] for i in T)[80:160])
print('J ans:', ''.join(jx[i]['answer'] for i in J)[80:160])
print()
print('--- top of ch1 ---')
for k in range(12):
    print('T', k, tb[T[k]]['answer'], repr(''.join(tb[T[k]]['stem'])[:50]), '| mat', tb[T[k]]['material'])
for k in range(12):
    a = jx[J[k]]['analysis'].replace('\n', '')
    print('J', k, jx[J[k]]['answer'], repr(a[:90]))
