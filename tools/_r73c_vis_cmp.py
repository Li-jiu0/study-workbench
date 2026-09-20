# -*- coding: utf-8 -*-
import os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r73c_pre'
lt = open(os.path.join(ROOT, 'server', 'routers', 'moments.py'), 'rb').read().decode('utf-8', 'replace')
st = open(os.path.join(TMP, 'server__routers__moments.py.srv'), 'rb').read().decode('utf-8', 'replace')

def show(t, name):
    m = re.search(r'def %s\(.*?(?=\ndef |\Z)' % name, t, re.S)
    print('===== %s =====' % name)
    print(m.group(0)[:1500] if m else '(未找到)')

show(lt, '_moment_visible')
show(st, '_visibility_allows')
