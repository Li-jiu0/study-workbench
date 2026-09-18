# -*- coding: utf-8 -*-
import os, re, io

ROOT = r'D:\下载的文件\学习工作台'
out = io.StringIO()

# 1) app.js / assets: how bottom-nav active is set
for root, dirs, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith('.js'):
            p = os.path.join(root, f)
            if os.path.getsize(p) > 3_000_000:
                out.write('SKIP-BIG %s (%d)\n' % (p, os.path.getsize(p)))
                continue
            try:
                s = open(p, encoding='utf-8', errors='replace').read()
            except Exception as e:
                continue
            for kw in ['bottom-nav', 'data-page', 'bottom-nav-item', 'bn-icon', 'nav-icon', 'gotoChat', 'openBlogProfile']:
                for m in re.finditer(re.escape(kw), s):
                    ln = s.count('\n', 0, m.start()) + 1
                    out.write('%s:%d [%s]\n' % (os.path.relpath(p, ROOT), ln, kw))

open(r'D:\下载的文件\学习工作台\_navscan3.txt','w',encoding='utf-8').write(out.getvalue())
print('ok')
