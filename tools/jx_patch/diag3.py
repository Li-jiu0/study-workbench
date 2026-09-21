# -*- coding: utf-8 -*-
import json, io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TBF = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JXF = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"
tb = json.load(open(TBF, encoding='utf-8'))['questions']
jx = json.load(open(JXF, encoding='utf-8'))['items']
CN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
def jch(x):
    m = re.match(r'^第([一二三四五六七八九十]+)章', x.get('chapter') or '')
    return CN[m.group(1)] if m else 0

J1 = [x for x in jx if jch(x) == 1]
print("JX ch1 专项集训 qid:", [x['qid'] for x in J1 if '专项集训' in x['section_key']])
T1 = [q for q in tb if q['chapter'] == 1]
print("TB ch1 S8 qid:", [q['qid'] for q in T1 if q['section_key'].startswith('C1_S8')])
J4 = [x for x in jx if jch(x) == 4]
print("\nJX ch4 专项集训 qid:", [x['qid'] for x in J4 if '专项集训' in x['section_key']])
T4 = [q for q in tb if q['chapter'] == 4]
print("TB ch4 S8 qid:", [q['qid'] for q in T4 if q['section_key'].startswith('C4_S8')])
print("\nJX ch3 首块 qid:", [x['qid'] for x in jx if jch(x)==3][:16])
print("TB ch3 首块 qid:", [q['qid'] for q in tb if q['chapter']==3][:16])
