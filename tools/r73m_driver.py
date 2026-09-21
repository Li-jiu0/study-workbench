# -*- coding: utf-8 -*-
"""驱动：找可用 python 跑本地闸门，输出全部落盘"""
import subprocess, sys, io

cands = [
    r'C:\Users\ATM\.workbuddy\binaries\python\envs\default\python.exe',
    r'C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe',
    r'C:\Users\ATM\AppData\Local\Programs\Python\Python313\python.exe',
]
py = None
for c in cands:
    try:
        r = subprocess.run([c, '--version'], capture_output=True)
        if r.returncode == 0:
            py = c
            break
    except Exception:
        pass

lines = ['interpreter: %s' % py]
if py:
    r = subprocess.run([py, r'D:\下载的文件\学习工作台\tools\r73m_local_check.py'],
                       capture_output=True)
    lines.append('rc=%d' % r.returncode)
    lines.append('STDOUT>>>')
    lines.append(r.stdout.decode('utf-8', 'ignore'))
    lines.append('STDERR>>>')
    lines.append(r.stderr.decode('utf-8', 'ignore'))
try:
    lines.append('CHECKFILE>>>')
    lines.append(open(r'C:\Users\ATM\_r73m_local_check.txt', encoding='utf-8').read())
except Exception as e:
    lines.append('checkfile err: %s' % e)
io.open(r'C:\Users\ATM\_r73m_driver_out.txt', 'w', encoding='utf-8').write('\n'.join(lines))
