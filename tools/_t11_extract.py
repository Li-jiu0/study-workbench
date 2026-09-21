# -*- coding: utf-8 -*-
"""抽取 错题本.html 的内联 <script> 到临时 js 文件，供 node --check 校验。"""
import io
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
PAGE = os.path.join(ROOT, '错题本.html')
OUTDIR = os.path.join(ROOT, 'tools', '_t11_out')

if not os.path.isdir(OUTDIR):
    os.makedirs(OUTDIR)

with io.open(PAGE, 'r', encoding='utf-8', newline='') as f:
    s = f.read()

s = s.replace('\r\n', '\n')
re_scr = re.compile(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>')
found = 0
names = []
for i, m in enumerate(re_scr.finditer(s)):
    body = m.group(1)
    if len(body.strip()) < 20:
        continue
    found += 1
    name = 'inline_%d.js' % found
    p = os.path.join(OUTDIR, name)
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(body)
    names.append(p)

with io.open(os.path.join(ROOT, 'tools', '_t11_extract_log.txt'), 'w', encoding='utf-8') as f:
    f.write('extracted=%d\n' % found)
    f.write('\n'.join(names))
print('done')
