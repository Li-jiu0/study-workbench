# -*- coding: utf-8 -*-
import json, io
from collections import Counter

TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"

tb = json.load(io.open(TIBEN, encoding='utf-8'))
print('TIBEN type:', type(tb).__name__)
if isinstance(tb, dict):
    print('TIBEN keys:', list(tb.keys())[:20])
    for k in tb:
        v = tb[k]
        print(' ', k, type(v).__name__, (len(v) if hasattr(v, '__len__') else ''))
    # 猜测 questions 列表
    for k in tb:
        if isinstance(tb[k], list) and tb[k] and isinstance(tb[k][0], dict):
            lst = tb[k]
            print('\nLIST field:', k, 'len', len(lst), 'keys', list(lst[0].keys()))
            print('sample:', json.dumps(lst[0], ensure_ascii=False)[:900])
            if 'chapter' in lst[0]:
                print('chapter:', Counter(str(i.get('chapter'))[:40] for i in lst).most_common(10))
                print('node:', Counter(str(i.get('node'))[:40] for i in lst).most_common(10))
                print('section:', Counter(str(i.get('section'))[:40] for i in lst).most_common(10))
                print('answer:', Counter(str(i.get('answer'))[:8] for i in lst).most_common(12))
            break

jx = json.load(io.open(JIEXI, encoding='utf-8'))
print('\nJIEXI top keys:', list(jx.keys()), 'total', jx.get('total'), 'items', len(jx.get('items', [])))
it0 = jx['items'][0]
print('JIEXI item keys:', list(it0.keys()))
print('JIEXI first:', json.dumps(it0, ensure_ascii=False)[:1500])
print('\nsection_key:', Counter(str(i.get('section_key'))[:50] for i in jx['items']).most_common(10))
print('block:', Counter(str(i.get('block'))[:50] for i in jx['items']).most_common(10))
print('point:', Counter(str(i.get('point'))[:50] for i in jx['items']).most_common(10))
print('difficulty:', Counter(str(i.get('difficulty'))[:20] for i in jx['items']).most_common(10))
print('answer:', Counter(str(i.get('answer'))[:8] for i in jx['items']).most_common(12))
print('qid sample:', [str(i.get('qid'))[:20] for i in jx['items'][:10]])
print('qid_raw sample:', [str(i.get('qid_raw'))[:20] for i in jx['items'][:10]])
print('match_key sample:', [str(i.get('match_key'))[:40] for i in jx['items'][:10]])
print('pian:', Counter(str(i.get('pian'))[:40] for i in jx['items']).most_common(10))
print('chapter:', Counter(str(i.get('chapter'))[:40] for i in jx['items']).most_common(10))
