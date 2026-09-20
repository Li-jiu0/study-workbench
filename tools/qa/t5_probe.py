# -*- coding: utf-8 -*-
"""任务五：核查广场复合词与题库正文命中。"""
import os
import re
import io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_probe.txt')

def list_files():
    res = []
    for name in os.listdir(ROOT):
        p = os.path.join(ROOT, name)
        if os.path.isfile(p) and name.lower().endswith('.html'):
            res.append(p)
    adir = os.path.join(ROOT, 'assets')
    if os.path.isdir(adir):
        for name in os.listdir(adir):
            p = os.path.join(adir, name)
            if os.path.isfile(p) and name.lower().endswith('.js'):
                res.append(p)
    return sorted(res)

out = []

# 1) 所有「X广场」复合词统计
comp = {}
for p in list_files():
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        c = f.read()
    for m in re.finditer(r'([\u4e00-\u9fa5A-Za-z0-9]{1,4})广场', c):
        w = m.group(1) + '广场'
        comp[w] = comp.get(w, 0) + 1
out.append('=== 广场复合词统计 ===')
for k, v in sorted(comp.items(), key=lambda x: -x[1]):
    out.append('  %s : %d' % (k, v))
out.append('')

# 2) app.js 题库正文中的「广场」上下文
appjs = os.path.join(ROOT, 'assets', 'app.js')
with io.open(appjs, 'r', encoding='utf-8', errors='replace') as f:
    lines = f.read().split('\n')
out.append('=== app.js 包含广场的行（截断 600 字符，定位关键词附近） ===')
for i, ln in enumerate(lines):
    if '广场' not in ln:
        continue
    if '互动' in ln and '互动广场' in ln and ln.count('广场') == ln.count('互动广场'):
        continue
    out.append('--- app.js:%d (len=%d)' % (i + 1, len(ln)))
    for m in re.finditer(r'广场', ln):
        s = max(0, m.start() - 120)
        e = min(len(ln), m.end() + 120)
        out.append('    ...%s...' % ln[s:e])
out.append('')

# 3) 其他文件里 广场 出现在 题库/题目Json 里的可疑处（同行含 "q":" 或 "o":[ 或 type":"）
out.append('=== 疑似题库正文中的广场（同行含 "q": 或 "o":[ ） ===')
for p in list_files():
    rel = os.path.relpath(p, ROOT)
    if rel == os.path.join('assets', 'app.js'):
        continue
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        c = f.read()
    for m in re.finditer(r'广场', c):
        ls = c.rfind('\n', 0, m.start()) + 1
        le = c.find('\n', m.start())
        if le == -1:
            le = len(c)
        ln = c[ls:le]
        if '"q":' in ln or '"o":[' in ln or '"x":' in ln:
            out.append('  %s | ...%s...' % (rel, ln[max(0, m.start()-ls-100):m.start()-ls+100]))

# 4) 检查 6 个旧文件名是否存在 + 6 个新文件名是否存在
out.append('')
out.append('=== 文件存在性检查 ===')
pairs = [('学习博客.html', '社区.html'), ('四级备考.html', '英语.html'),
         ('央国企笔试.html', '行测.html'), ('高情商表达.html', '表达.html'),
         ('商务礼仪面试.html', '面测.html'), ('PPT训练.html', '演示.html')]
for old, new in pairs:
    out.append('  old %s = %s | new %s = %s' % (old, os.path.exists(os.path.join(ROOT, old)),
                                                new, os.path.exists(os.path.join(ROOT, new))))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
