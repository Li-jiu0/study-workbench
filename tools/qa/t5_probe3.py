# -*- coding: utf-8 -*-
"""任务五：变体 + mock_exam + recentMap + pageTitles + 根目录 html 清单。"""
import os
import re
import io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_probe3.txt')
out = []

def rd(p):
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()

def allfiles():
    res = []
    for name in os.listdir(ROOT):
        p = os.path.join(ROOT, name)
        if os.path.isfile(p) and name.lower().endswith('.html'):
            res.append(p)
    ad = os.path.join(ROOT, 'assets')
    for name in os.listdir(ad):
        p = os.path.join(ad, name)
        if os.path.isfile(p) and name.lower().endswith('.js'):
            res.append(p)
    return sorted(res)

# 1) 变体统计
VARIANTS = ['商务礼仪及面试', '商务礼仪面试', '商务礼仪', '央国企笔试备考', '央国企笔试',
            '高情商表达', 'PPT 训练', 'PPT训练', '四级备考', '表达']
out.append('=== 变体计数（全站） ===')
counts = {}
for p in allfiles():
    c = rd(p)
    for v in VARIANTS:
        n = c.count(v)
        if n:
            counts[v] = counts.get(v, 0) + n
for v in VARIANTS:
    out.append('  %s : %d' % (v, counts.get(v, 0)))
out.append('')

# 2) 文件名引用计数（带 .html）
FILEREF = ['学习博客.html', '四级备考.html', '央国企笔试.html', '高情商表达.html',
           '商务礼仪面试.html', 'PPT训练.html', '行测刷题.html', '商务礼仪.html',
           '行测.html', '英语.html', '社区.html', '表达.html', '演示.html', '面测.html']
out.append('=== 文件名引用计数 ===')
fc = {}
for p in allfiles():
    c = rd(p)
    for v in FILEREF:
        n = c.count(v)
        if n:
            fc[v] = fc.get(v, 0) + n
for v in FILEREF:
    out.append('  %s : %d' % (v, fc.get(v, 0)))
out.append('')

# 3) mock_exam.html 相关行
out.append('=== mock_exam.html 含旧名的行 ===')
c = rd(os.path.join(ROOT, 'mock_exam.html')).split('\n')
for i, ln in enumerate(c):
    if any(k in ln for k in ['四级备考', '央国企笔试', '商务礼仪面试', '高情商表达', 'PPT训练', '广场']):
        out.append('  %d: %s' % (i + 1, ln.strip()[:300]))
out.append('')

# 4) app.js recentMap / pageTitles / HOME_DEF
app = rd(os.path.join(ROOT, 'assets', 'app.js')).split('\n')
out.append('=== app.js 6715-6800 ===')
for i in range(6714, min(6800, len(app))):
    out.append('  %d: %s' % (i + 1, app[i][:260]))
out.append('')
out.append('=== app.js 1448-1456 ===')
for i in range(1447, min(1456, len(app))):
    out.append('  %d: %s' % (i + 1, app[i][:300]))
out.append('')

# 5) 根目录 html 名清单
out.append('=== 根目录 html ===')
out.append('  ' + ' | '.join(sorted(n for n in os.listdir(ROOT) if n.lower().endswith('.html'))))
out.append('')
out.append('=== assets js ===')
out.append('  ' + ' | '.join(sorted(n for n in os.listdir(os.path.join(ROOT, 'assets')) if n.lower().endswith('.js'))))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
