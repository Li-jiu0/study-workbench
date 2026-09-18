# -*- coding: utf-8 -*-
import json, sys, io, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tbj = json.load(open(TIBEN, encoding='utf-8'))
tb = tbj['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
ak = tbj['answer_key']
print('answer_key structure:', {k: (type(v), len(v)) for k, v in ak.items()})
for k, v in ak.items():
    print(' ', k, repr(v)[:300])
