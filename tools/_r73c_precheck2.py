# -*- coding: utf-8 -*-
# R73c 阶段二-2：打印「仅服务器存在」的实质行内容，判断是否为服务器侧热修
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r73c_pre'

def norm(t):
    keep = []
    for ln in t.splitlines():
        s = ln.strip()
        if s and not s.startswith('#'):
            keep.append(s)
    return keep

FILES = ['server/database.py', 'server/rate_limit.py', 'server/routers/admin.py',
         'server/routers/auth.py', 'server/routers/moments.py', 'server/schemas.py']
for f in FILES:
    lt = open(os.path.join(ROOT, f), 'rb').read().decode('utf-8', 'replace')
    st = open(os.path.join(TMP, f.replace('/', '__') + '.srv'), 'rb').read().decode('utf-8', 'replace')
    lset, sset = set(norm(lt)), set(norm(st))
    only_srv = [ln for ln in norm(st) if ln not in lset]
    print('===== %s  仅服务器 %d 行 =====' % (f, len(only_srv)))
    for ln in only_srv[:40]:
        print('   |', ln[:150])
