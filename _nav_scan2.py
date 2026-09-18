# -*- coding: utf-8 -*-
import os, re, io

ROOT = r'D:\下载的文件\学习工作台'
EXCLUDE = {'AI.html', '学习工作台.html', '登录.html'}
files = sorted([f for f in os.listdir(ROOT) if f.endswith('.html') and f not in EXCLUDE])
out = io.StringIO()

for f in ['更多.html', '设置.html', 'AI模拟面试.html', 'PPT素材库.html', '好友申请.html', '学途.html', '四级经验分享.html', 'mock_exam.html', 'mock_exam_result.html', 'mock_exam_run.html']:
    p = os.path.join(ROOT, f)
    s = open(p, encoding='utf-8', errors='replace').read()
    out.write('\n########## %s\n' % f)
    for m in re.finditer(r'<nav[^>]*>', s):
        out.write('NAVOPEN: %s\n' % m.group(0)[:300])
    for m in re.finditer(r'bottom-nav\w*', s):
        out.write('  hit bottom-nav token at %d\n' % m.start())
    for m in re.finditer(r'bn-label', s):
        out.write('  bn-label at %d\n' % m.start())
    for m in re.finditer(r'bn-icon', s):
        out.write('  bn-icon at %d\n' % m.start())

# full nav of 更多.html and 设置.html
for f in ['更多.html', '设置.html']:
    s = open(os.path.join(ROOT, f), encoding='utf-8', errors='replace').read()
    m = re.search(r'<nav[^>]*bottom-nav[^>]*>', s)
    if m:
        e = s.find('</nav>', m.start())
        out.write('\n==== FULL NAV %s ====\n%s\n' % (f, s[m.start():e+6]))

open(r'D:\下载的文件\学习工作台\_navscan2.txt','w',encoding='utf-8').write(out.getvalue())
print('ok')
