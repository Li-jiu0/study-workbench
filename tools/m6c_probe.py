# -*- coding: utf-8 -*-
import os, sys
ROOT = r"D:\下载的文件\学习工作台"
log = open(os.path.join(ROOT, 'tools', 'm6c_probe.txt'), 'w', encoding='utf-8')
log.write('start\n'); log.flush()

skip_dirs = {'.git', 'tools', 'node_modules', 'assets'}
n = 0
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs]
    for fn in filenames:
        if fn.lower().endswith('.html'):
            n += 1
log.write('html count=%d\n' % n); log.flush()

adir = os.path.join(ROOT, 'assets')
js = [f for f in os.listdir(adir) if f.lower().endswith('.js')]
log.write('assets js count=%d\n' % len(js)); log.flush()
log.write('done\n'); log.flush()
log.close()
