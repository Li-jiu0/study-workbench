# -*- coding: utf-8 -*-
import os
d = r'D:\下载的文件\学习工作台'
removed = []
for f in ['_r96_probe2.py', '_r96_state2.txt', '_r96_apply2.py', '_r96_apply2_out.txt',
          '_r96_check2.py', '_r96_safecut_test.js']:
    p = os.path.join(d, f)
    if os.path.exists(p):
        os.remove(p); removed.append(f)
open(os.path.join(d, '_r96_cleanup2.txt'), 'w', encoding='utf-8').write(
    'removed: ' + ', '.join(removed) + '\nleft: ' +
    ', '.join(sorted([x for x in os.listdir(d) if x.startswith('_r96')])) + '\n')
