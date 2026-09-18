# -*- coding: utf-8 -*-
import os, io, re

ROOT = 'D:/下载的文件/学习工作台'
out = []
p = os.path.join(ROOT, 'assets', 'cet-read.js')
b = open(p, 'rb').read()
out.append('cet-read.js size=%d crlf=%d lf=%d' % (len(b), b.count(b'\r\n'), b.count(b'\n')))

p2 = os.path.join(ROOT, 'assets', 'data-cet-read.js')
s = io.open(p2, encoding='utf-8').read()
out.append('data-cet-read.js size=%d' % len(s))
# extract type + id + counts
for m in re.finditer(r"\{\s*id\s*:\s*'([^']+)'", s):
    start = m.start()
    seg = s[start:start + 400]
    tid = re.search(r"type\s*:\s*'([^']+)'", seg)
    out.append('ID=%s type=%s' % (m.group(1), tid.group(1) if tid else '?'))

io.open(os.path.join(ROOT, '_probe5_out2.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
