# -*- coding: utf-8 -*-
"""判定旧名残留归属：哪些 HTML 仍在用这些 class / 互动广场 在哪"""
import io
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
htmls = [x for x in os.listdir(ROOT) if x.lower().endswith('.html')]
out = []

CLASSES = ['sprint-card', 'typeacc-card', 'qtab-card', 'pptpath-card', 'ed-actions-bar']
out.append('===== class 使用页面 =====')
for c in CLASSES:
    used = []
    for h in htmls:
        t = io.open(os.path.join(ROOT, h), encoding='utf-8', errors='ignore').read()
        if c in t:
            used.append(h)
    # 也在 js 里找
    for j in os.listdir(os.path.join(ROOT, 'assets')):
        if not j.lower().endswith('.js'):
            continue
        t = io.open(os.path.join(ROOT, 'assets', j), encoding='utf-8', errors='ignore').read()
        if c in t:
            used.append('assets/' + j)
    out.append('  %-16s -> %s' % (c, used if used else '(未使用/已废弃)'))

out.append('\n===== 互动广场 出现位置（全项目）=====')
pat = '互动广场'
for h in htmls:
    t = io.open(os.path.join(ROOT, h), encoding='utf-8', errors='ignore').read()
    n = t.count(pat)
    if n:
        out.append('  %s x%d' % (h, n))
for j in sorted(os.listdir(os.path.join(ROOT, 'assets'))):
    if not j.lower().endswith(('.js', '.css')):
        continue
    t = io.open(os.path.join(ROOT, 'assets', j), encoding='utf-8', errors='ignore').read()
    n = t.count(pat)
    if n:
        out.append('  assets/%s x%d' % (j, n))

out.append('\n===== 社区.html 的 title / 主标题 =====')
t = io.open(os.path.join(ROOT, '社区.html'), encoding='utf-8', errors='ignore').read()
for m in re.findall(r'<title>(.*?)</title>', t)[:3]:
    out.append('  title: ' + m.strip())
for m in re.findall(r'(学习博客|社区|互动广场)', t)[:0]:
    pass
out.append('  学习博客 出现 %d 次；社区 出现 %d 次；互动广场 出现 %d 次' % (
    t.count('学习博客'), t.count('社区'), t.count('互动广场')))

out.append('\n===== 各 HTML 的 <title> =====')
for h in sorted(htmls):
    t = io.open(os.path.join(ROOT, h), encoding='utf-8', errors='ignore').read()
    m = re.search(r'<title>(.*?)</title>', t)
    out.append('  %-22s %s' % (h, (m.group(1).strip() if m else '(无)')))

io.open(os.path.join(ROOT, '_scan_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
