# -*- coding: utf-8 -*-
"""任务五：ai-presets.js / roleplay.js 语料核查 + 换行符统计。"""
import os
import re
import io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_probe4.txt')
out = []

def rd(p):
    with io.open(p, 'r', encoding='utf-8', errors='replace', newline='') as f:
        return f.read()

for nm in ['ai-presets.js', 'roleplay.js']:
    p = os.path.join(ROOT, 'assets', nm)
    c = rd(p)
    out.append('=== %s ===' % nm)
    for kw in ['四级备考', '高情商表达', '商务礼仪面试', '央国企笔试', 'PPT训练', '广场']:
        for m in re.finditer(re.escape(kw), c):
            ls = c.rfind('\n', 0, m.start()) + 1
            le = c.find('\n', m.start())
            if le == -1:
                le = len(c)
            line_no = c.count('\n', 0, m.start()) + 1
            ln = c[ls:le]
            s = max(0, m.start() - ls - 130)
            e = min(len(ln), m.start() - ls + 90)
            out.append('  :%d [%s] ...%s...' % (line_no, kw, ln[s:e]))
    out.append('')

# 换行符统计（所有将要处理的文件）
out.append('=== 换行符统计 ===')
cands = []
for n in os.listdir(ROOT):
    p = os.path.join(ROOT, n)
    if os.path.isfile(p) and n.lower().endswith('.html'):
        cands.append(p)
ad = os.path.join(ROOT, 'assets')
for n in os.listdir(ad):
    p = os.path.join(ad, n)
    if os.path.isfile(p) and n.lower().endswith('.js'):
        cands.append(p)
stat = {}
for p in sorted(cands):
    with io.open(p, 'rb') as f:
        b = f.read()
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n') - crlf
    if lf == 0 and crlf > 0:
        k = 'CRLF'
    elif crlf == 0 and lf > 0:
        k = 'LF'
    else:
        k = 'MIXED(crlf=%d,lf=%d)' % (crlf, lf)
    stat.setdefault(k, []).append(os.path.relpath(p, ROOT))
for k in sorted(stat):
    out.append('  %s (%d): %s' % (k, len(stat[k]), ', '.join(stat[k])))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
