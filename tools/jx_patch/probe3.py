# -*- coding: utf-8 -*-
import json, io, sys, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TB  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JX  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"
tb = json.load(open(TB, encoding='utf-8'))['questions']
jx = json.load(open(JX, encoding='utf-8'))['items']

print("TB0:", json.dumps(tb[0], ensure_ascii=False)[:900])
print("\nTB fields:", list(tb[0].keys()))
print("\nTB section_key distribution:")
for k, c in collections.Counter(q.get('section_key') for q in tb).most_common():
    print("   ", k, c)
print("\nTB chapter:", collections.Counter(q.get('chapter') for q in tb).most_common())
print("TB chapter_name:", collections.Counter(q.get('chapter_name') for q in tb).most_common())
print("TB group:", collections.Counter(q.get('group') for q in tb).most_common())
print("TB difficulty:", collections.Counter(q.get('difficulty') for q in tb).most_common())
print("TB kdian count:", len(set(q.get('kdian') for q in tb)))
print("TB kdian sample:", list(collections.Counter(q.get('kdian') for q in tb).most_common(15)))
print("TB answer sample:", collections.Counter(q.get('answer') for q in tb).most_common(10))
print("TB qid sample:", [q.get('qid') for q in tb[:20]])

print("\n\nJX fields:", list(jx[0].keys()))
print("JX chapter:", collections.Counter(x.get('chapter') for x in jx).most_common())
print("JX section_key:", collections.Counter(x.get('section_key') for x in jx).most_common(20))
print("JX tb_key:", collections.Counter(x.get('tb_key') for x in jx).most_common(20))
print("JX point:", collections.Counter(x.get('point') for x in jx).most_common(10))
print("JX difficulty:", collections.Counter(x.get('difficulty') for x in jx).most_common(10))
print("JX block:", collections.Counter(x.get('block') for x in jx).most_common(10))
print("JX match_key sample:", [x.get('match_key') for x in jx[:10]])
print("JX qid sample:", [x.get('qid') for x in jx[:20]])
print("JX page sample:", [x.get('page') for x in jx[:20]])
print("JX answer:", collections.Counter(x.get('answer') for x in jx).most_common(10))
