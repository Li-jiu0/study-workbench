# -*- coding: utf-8 -*-
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TB  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JX  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"
tb = json.load(open(TB, encoding='utf-8'))
print("TB type:", type(tb))
if isinstance(tb, dict):
    for k, v in tb.items():
        print(" ", repr(k), type(v), (len(v) if hasattr(v, '__len__') else ''))

jx = json.load(open(JX, encoding='utf-8'))
print("\nJX type:", type(jx))
if isinstance(jx, dict):
    for k, v in jx.items():
        print(" ", repr(k), type(v), (len(v) if hasattr(v, '__len__') else ''))
    it = jx['items'][0] if 'items' in jx else None
    print("\nJX item0:", json.dumps(it, ensure_ascii=False)[:1500])
