# -*- coding: utf-8 -*-
import os, re, io

ROOT = r'D:\下载的文件\学习工作台'
p = os.path.join(ROOT, 'assets', 'app.js')
s = open(p, encoding='utf-8', errors='replace').read()
out = io.StringIO()
out.write('len=%d\n' % len(s))
kws = ['function gotoChat', 'gotoChat=', 'gotoChat =', 'function openBlogProfile', 'bottom-nav-item', 'data-page', 'nav-icon', 'function toggleMorePanel', 'toggleMorePanel=']
for kw in kws:
    idxs = [m.start() for m in re.finditer(re.escape(kw), s)]
    out.write('\n### %s -> %d hits\n' % (kw, len(idxs)))
    for i in idxs[:8]:
        ln = s.count('\n', 0, i) + 1
        seg = s[max(0, i-260):i+320].replace('\n', ' | ')
        out.write('  L%d: %s\n' % (ln, seg))

open(r'D:\下载的文件\学习工作台\_navscan4.txt','w',encoding='utf-8').write(out.getvalue())
print('ok')
