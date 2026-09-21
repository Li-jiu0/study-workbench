# -*- coding: utf-8 -*-
import os
ROOT = r'D:\下载的文件\学习工作台'
out = os.path.join(ROOT, 'tools', 'qa', '_r92a_eol.txt')
lines = []
for rel in ['assets\\ai-page.js', 'assets\\ai-service.js', 'AI.html']:
    p = os.path.join(ROOT, rel)
    with open(p, 'rb') as f:
        d = f.read()
    crlf = d.count(b'\r\n')
    lone_cr = 0
    idx = 0
    while True:
        i = d.find(b'\r', idx)
        if i < 0:
            break
        if d[i+1:i+2] != b'\n':
            lone_cr += 1
        idx += 1
    lines.append('%s size=%d crlf=%d loneCR=%d askAIAnchor=%d' % (rel, len(d), crlf, lone_cr, d.count(b'  function askAI(text, image) {')))
with open(out, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('ok')
