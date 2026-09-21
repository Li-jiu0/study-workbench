# -*- coding: utf-8 -*-
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"
TBJ = json.load(open(r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json", encoding='utf-8'))
tb = TBJ['questions']
jx = json.load(open(r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json", encoding='utf-8'))['items']
mats = {m['id']: m for m in TBJ['materials']}
for mi in ('mat117', 'mat118', 'mat119', 'mat120'):
    if mi in mats: print(mi, '->', repr(' | '.join(mats[mi]['text'])[:200]))
print()
for ti in (576, 577, 578, 579, 580, 581):
    print('T', ti, tb[ti]['answer'], tb[ti]['material'], ''.join(tb[ti]['stem'])[:45].replace('\n',''))
    print('    opts:', tb[ti]['options'])
print()
for ji in (587, 588, 589, 590):
    print('J', ji, jx[ji]['answer'], repr(jx[ji]['analysis'].replace('\n','')[:500]))
