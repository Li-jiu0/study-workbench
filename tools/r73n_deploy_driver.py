# -*- coding: utf-8 -*-
"""R73n 部署驱动：traceback 落盘"""
import subprocess, io
r = subprocess.run(
    [r'C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe',
     r'D:\下载的文件\学习工作台\tools\r73n_deploy.py'],
    capture_output=True, timeout=420)
txt = 'rc=%d\nSTDOUT:\n%s\nSTDERR:\n%s' % (r.returncode,
                                           r.stdout.decode('utf-8', 'ignore'),
                                           r.stderr.decode('utf-8', 'ignore'))
try:
    txt += '\nDEPLOY_LOG:\n' + open(r'C:\Users\ATM\_r73n_deploy_out.txt', encoding='utf-8').read()
except Exception as e:
    txt += '\nDEPLOY_LOG 未生成: %s' % e
io.open(r'C:\Users\ATM\_r73n_deploy_trace.txt', 'w', encoding='utf-8').write(txt)
