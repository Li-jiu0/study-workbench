# -*- coding: utf-8 -*-
"""任务五：相邻冲突扫描（会产出重复/语义损坏的组合）。"""
import os
import re
import io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_probe5.txt')
out = []

def rd(p):
    with io.open(p, 'r', encoding='utf-8', errors='replace', newline='') as f:
        return f.read()

def allfiles():
    res = []
    for n in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, n)
        if os.path.isfile(p) and n.lower().endswith('.html'):
            res.append(p)
    ad = os.path.join(ROOT, 'assets')
    for n in sorted(os.listdir(ad)):
        p = os.path.join(ad, n)
        if os.path.isfile(p) and n.lower().endswith('.js'):
            res.append(p)
    return res

PATTERNS = [
    (r'.{0,14}英语四级备考.{0,14}', '英语四级备考（博/帖标题）'),
    (r'.{0,16}行测.{0,6}央国企笔试.{0,16}', '行测…央国企笔试（会重复）'),
    (r'.{0,16}央国企笔试.{0,6}行测.{0,16}', '央国企笔试…行测（会重复）'),
    (r'.{0,16}英语.{0,4}四级备考.{0,16}', '英语…四级备考（会重复）'),
    (r'.{0,16}表达.{0,4}高情商表达.{0,16}', '表达…高情商表达'),
    (r'.{0,16}演示.{0,4}PPT训练.{0,16}', '演示…PPT训练'),
    (r'.{0,18}四级备考.{0,18}', '全部 四级备考 上下文'),
]

for pat, desc in PATTERNS:
    out.append('====== %s' % desc)
    seen = 0
    for p in allfiles():
        rel = os.path.relpath(p, ROOT)
        c = rd(p)
        for m in re.finditer(pat, c):
            s = m.group(0).replace('\n', ' ').replace('\r', '')
            # 仅打印含目标词的
            out.append('  %s | %s' % (rel, s[:230]))
            seen += 1
            if seen > 60:
                out.append('  ...(截断)')
                break
        if seen > 60:
            break
    out.append('')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
