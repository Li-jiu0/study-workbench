# -*- coding: utf-8 -*-
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"
tb = json.load(open(r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json", encoding='utf-8'))['questions']
jx = json.load(open(r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json", encoding='utf-8'))['items']
AL = {int(k): v for k, v in json.load(open(rf'{OUT}\_tb2jx.json', encoding='utf-8')).items()}
JT = {v: k for k, v in AL.items()}
for ti in range(574, 596):
    print('T', ti, tb[ti]['material'], tb[ti]['answer'], ''.join(tb[ti]['stem'])[:38].replace('\n',''), '-> J', AL.get(ti))
print()
free = [j for j in range(575, 615) if j not in JT]
print('FREE J in 575..614:', free)
for j in free:
    print('  J', j, jx[j]['answer'], jx[j]['analysis'].replace('\n','')[:130])
