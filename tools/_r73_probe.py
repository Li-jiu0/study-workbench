# -*- coding: utf-8 -*-
import io
OUT = r'D:\下载的文件\学习工作台\tools\_r73_probe.txt'
res = []
src = io.open(r'D:\下载的文件\学习工作台\assets\app.js', encoding='utf-8').read()
for kw in ['moments', '朋友圈', '动态.html', '成就', '徽章']:
    res.append('whole-file count [%s] = %d' % (kw, src.count(kw)))
lines = src.splitlines()
l665 = lines[664]
res.append('line665 len=%d' % len(l665))
for kw in ['moments', '朋友圈', '成就', '徽章']:
    res.append('line665 count [%s] = %d' % (kw, l665.count(kw)))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
