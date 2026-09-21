# -*- coding: utf-8 -*-
"""任务五：核查 动态广场 / 设置.html 857-860 / 更多.html / 侧栏结构。"""
import os
import re
import io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_probe2.txt')
out = []

def rd(p):
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()

# 1) 动态广场
out.append('=== 动态广场 出现处 ===')
for name in os.listdir(ROOT):
    p = os.path.join(ROOT, name)
    if os.path.isfile(p) and name.lower().endswith('.html'):
        c = rd(p)
        if '动态广场' in c:
            out.append('  ROOT/%s' % name)
ad = os.path.join(ROOT, 'assets')
for name in os.listdir(ad):
    p = os.path.join(ad, name)
    if os.path.isfile(p) and name.lower().endswith('.js'):
        c = rd(p)
        for m in re.finditer('动态广场', c):
            ls = c.rfind('\n', 0, m.start()) + 1
            le = c.find('\n', m.start())
            out.append('  assets/%s | ...%s...' % (name, c[ls:le][max(0, m.start()-ls-150):m.start()-ls+60]))
out.append('')

# 2) 动态.html 的页面标题
out.append('=== 动态.html 标题/侧栏 ===')
c = rd(os.path.join(ROOT, '动态.html')).split('\n')
for i, ln in enumerate(c[:80]):
    s = ln.strip()
    if ('<title' in s or 'topbar-title' in s or 'module-hero' in s or 'bn-label' in s):
        out.append('  %d: %s' % (i + 1, s[:200]))
out.append('')

# 3) 设置.html 855-900
out.append('=== 设置.html 855-862 ===')
c = rd(os.path.join(ROOT, '设置.html')).split('\n')
for i in range(854, min(865, len(c))):
    out.append('  %d: %s' % (i + 1, c[i][:400]))
out.append('')

# 4) 更多.html 60-75 / 125-140 / 230-245
out.append('=== 更多.html 相关片段 ===')
c = rd(os.path.join(ROOT, '更多.html')).split('\n')
for i in [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 235, 236, 237, 238]:
    if i - 1 < len(c):
        out.append('  %d: %s' % (i, c[i - 1][:300]))
out.append('')

# 5) 学习博客.html 首页卡片相关 & 6 个待改名页面的 title/topbar
out.append('=== 6 个待改名页面 title/topbar/nav ===')
for nm in ['学习博客.html', '四级备考.html', '央国企笔试.html', '高情商表达.html', '商务礼仪面试.html', 'PPT训练.html']:
    c = rd(os.path.join(ROOT, nm)).split('\n')
    out.append('--- %s' % nm)
    for i, ln in enumerate(c[:260]):
        s = ln.strip()
        if '<title' in s or 'topbar-title' in s or 'module-hero-title' in s:
            out.append('   %d: %s' % (i + 1, s[:220]))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
