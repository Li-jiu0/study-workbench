# -*- coding: utf-8 -*-
import os, re, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'AI.html', '工具.html', '学习工作台.html', '登录.html'}
out = []
for name in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, name)
    if not os.path.isfile(p) or not name.endswith('.html') or name in SKIP:
        continue
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()
    he = html.find('</head>')
    head = html[:he] if he != -1 else html
    fs = None
    for m in re.finditer(r'<script', head, re.I):
        if '__XT_PROD__' in head[m.start():m.start() + 40]:
            continue
        fs = m
        break
    pi = head.find('window.__XT_PROD__=true')
    if fs is None:
        out.append(u'%-22s head内无script, prod@%d' % (name, pi))
    elif pi < fs.start():
        out.append(u'%-22s OK prod@%d < firstScript@%d' % (name, pi, fs.start()))
    else:
        out.append(u'%-22s !!! prod在script之后 prod@%d script@%d' % (name, pi, fs.start()))
with io.open(os.path.join(ROOT, 'tools', '_prod_pos_check.txt'), 'w', encoding='utf-8') as f:
    f.write(u'\n'.join(out))
