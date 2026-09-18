# -*- coding: utf-8 -*-
import json, sys, io, collections, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"

tb = json.load(open(TIBEN, encoding='utf-8'))
items = tb['questions']
print('materials:', type(tb['materials']), len(tb['materials']))
for m in tb['materials'][:3]:
    print(' ', repr(m)[:600])
print('\nanswer_key type', type(tb['answer_key']), len(tb['answer_key']) if hasattr(tb['answer_key'],'__len__') else '')
print(list(tb['answer_key'])[:5] if isinstance(tb['answer_key'], dict) else tb['answer_key'][:5])

print('\nsection dist:', collections.Counter(i['section'] for i in items).most_common(8))
print('difficulty dist:', collections.Counter(i['difficulty'] for i in items))
print('chapter dist:', collections.Counter(i['chapter'] for i in items))
print('point dist sample:', collections.Counter(i['point'] for i in items).most_common(8))
print('answer missing:', sum(1 for i in items if not i.get('answer')))

jx = json.load(open(JIEXI, encoding='utf-8'))
print('\njiexi top keys', list(jx.keys()) if isinstance(jx, dict) else len(jx))
for k in ('book','module','total'):
    print(' ', k, '=', jx.get(k))
its = jx['items']
print('jiexi items', len(its))
print('jiexi item keys', list(its[0].keys()))
for it in its[:2]:
    print('======')
    for k,v in it.items():
        print('  ',k,'=',repr(v)[:400])
print('\njiexi chapter dist', collections.Counter(i.get('chapter') for i in its))
print('jiexi difficulty dist', collections.Counter(i.get('difficulty') for i in its))
print('jiexi section dist cnt', collections.Counter(i.get('section') for i in its).most_common(6))
print('jiexi point dist cnt', collections.Counter(i.get('point') for i in its).most_common(6))
print('jiexi material dist cnt', collections.Counter(i.get('material') for i in its).most_common(6))
print('jiexi answer empty', sum(1 for i in its if not (i.get('answer') or '').strip()))
print('jiexi analysis empty', sum(1 for i in its if not (i.get('analysis') or '').strip()))
