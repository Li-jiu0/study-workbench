# -*- coding: utf-8 -*-
import traceback, sys
out = r'D:\下载的文件\学习工作台\tools\qa\_r91e_runner.txt'
try:
    exec(compile(open(r'D:\下载的文件\学习工作台\tools\qa\r91e_edit.py', 'rb').read(),
                 r'r91e_edit.py', 'exec'))
    with open(out, 'w', encoding='utf-8') as f:
        f.write('RUNNER: ok\n')
except BaseException:
    with open(out, 'w', encoding='utf-8') as f:
        f.write('RUNNER: EXCEPTION\n' + traceback.format_exc())
