# -*- coding: utf-8 -*-
import json, sys, io, collections, itertools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']

def runs(seq):
    return [(k, sum(1 for _ in g)) for k, g in itertools.groupby(seq)]

print('=== TIBEN per chapter: material runs ===')
for ch, grp in itertools.groupby(tb, key=lambda x: x['chapter']):
    g = list(grp)
    print(ch, 'n=', len(g))
    print('   mat runs:', runs([x['material'] for x in g])[:25])
    print('   diff:', collections.Counter(x['difficulty'] for x in g))
    print('   point:', collections.Counter(x['point'] for x in g).most_common(6))

print()
print('=== JIEXI per chapter: block runs / qid ===')
for ch, grp in itertools.groupby(jx, key=lambda x: x['chapter']):
    g = list(grp)
    print(ch, 'n=', len(g))
    print('   block runs:', runs([x['block'] for x in g])[:30])
    print('   qid:', g[0]['qid'], '...', g[-1]['qid'], 'qid_raw:', g[0]['qid_raw'], g[-1]['qid_raw'])
    print('   diff:', collections.Counter(x['difficulty'] for x in g).most_common(6))
    print('   pages:', g[0]['page'], '-', g[-1]['page'])
    print('   match_keys sample:', [x['match_key'] for x in g[:3]])
