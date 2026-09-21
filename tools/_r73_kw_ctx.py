# -*- coding: utf-8 -*-
import io, sys, os
OUT = r'D:\下载的文件\学习工作台\tools\_r73_smoke.txt'
try:
    src = io.open(r'D:\下载的文件\学习工作台\assets\app.js', encoding='utf-8').read()
    lines = src.splitlines()
    out = ['TOTAL_LINES=%d' % len(lines), 'TOTAL_CHARS=%d' % len(src)]
    for i, l in enumerate(lines, 1):
        for kw in ['moments', '动态.html', '朋友圈.html', '我的朋友圈', '动态空间']:
            p = 0
            while True:
                p = l.find(kw, p)
                if p < 0:
                    break
                out.append('%d [%s] ...%s...' % (i, kw, l[max(0, p-80):p+80].strip()))
                p += len(kw)
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(out))
except Exception as e:
    io.open(OUT, 'w', encoding='utf-8').write('ERROR: %r' % e)
