# -*- coding: utf-8 -*-
import traceback
out = r'D:\下载的文件\学习工作台\tools\qa\_r92a_runner.txt'
try:
    exec(compile(open(r'D:\下载的文件\学习工作台\tools\qa\r92a_fix.py', 'rb').read(),
                 r'r92a_fix.py', 'exec'))
    with open(out, 'w', encoding='utf-8') as f:
        f.write('RUNNER: ok\n')
except BaseException:
    with open(out, 'w', encoding='utf-8') as f:
        f.write('RUNNER: EXCEPTION\n' + traceback.format_exc())
