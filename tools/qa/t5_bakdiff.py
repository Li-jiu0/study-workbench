# -*- coding: utf-8 -*-
"""任务五：与 batch2 前备份逐文件比对，确认改动仅为预期替换、且更多.html 注释失衡是否既有。"""
import io
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_bakdiff.txt')
out = []

PAIRS = [('更多.html', '更多.html.bak-pre-batch2-20260916'),
         ('设置.html', '设置.html.bak-pre-batch2-20260916'),
         ('学习工作台.html', '学习工作台.html.bak-pre-batch2-20260916')]

for cur, bak in PAIRS:
    pc = os.path.join(ROOT, cur)
    pb = os.path.join(ROOT, bak)
    out.append('=========== %s' % cur)
    if not os.path.exists(pb):
        out.append('  (无备份 %s)' % bak)
        continue
    c = io.open(pc, encoding='utf-8', errors='replace', newline='').read()
    b = io.open(pb, encoding='utf-8', errors='replace', newline='').read()
    out.append('  当前 <!--=%d -->=%d | 备份 <!--=%d -->=%d'
               % (len(re.findall('<!--', c)), len(re.findall('-->', c)),
                  len(re.findall('<!--', b)), len(re.findall('-->', b))))
    ol = b.split('\n')
    nl = c.split('\n')
    out.append('  行数 备份=%d 当前=%d' % (len(ol), len(nl)))
    if len(ol) != len(nl):
        out.append('  !! 行数不一致')
    diff = 0
    for i in range(min(len(ol), len(nl))):
        if ol[i] != nl[i]:
            diff += 1
            if diff <= 40:
                out.append('   L%d - %s' % (i + 1, ol[i].strip()[:180]))
                out.append('   L%d + %s' % (i + 1, nl[i].strip()[:180]))
    out.append('  变化行数 = %d' % diff)
    out.append('')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
