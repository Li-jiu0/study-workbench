# -*- coding: utf-8 -*-
import json, os, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
OCR = r'D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work'
BOOKS = [
    ('言语理解', r'2027言语理解（解析）'),
    ('判断推理', r'2027判断推理（解析）'),
    ('常识判断', r'2027政治理论与常识判断（解析）'),
    ('资料分析', r'2027资料分析（解析）'),
]
for mod, name in BOOKS:
    p = os.path.join(OCR, name, name + '_解析.json')
    d = json.load(open(p, encoding='utf-8'))
    it = d['items']
    print('\n===== %s  total=%d  keys=%s' % (mod, d['total'], ','.join(it[0].keys())))
    for i in (0, 1, len(it)//2, len(it)-1):
        x = dict(it[i]); a = x.pop('analysis', '')
        print('  #%d %s' % (i, json.dumps(x, ensure_ascii=False)[:320]))
        print('      analysis[:260]= %s' % a[:260].replace('\n', ' | '))
