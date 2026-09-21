# -*- coding: utf-8 -*-
# R72 任务三：把新页面规范为 CRLF + BOM（二进制读写，绝不用文本模式写）
import os, sys

BASE = r'D:\下载的文件\学习工作台'
FILES = ['我的文件.html', '导入题库.html']

for f in FILES:
    p = os.path.join(BASE, f)
    b = open(p, 'rb').read()
    if b.startswith(b'\xef\xbb\xbf'):
        b = b[3:]
    b = b.replace(b'\r\n', b'\n').replace(b'\r', b'\n').replace(b'\n', b'\r\n')
    b = b'\xef\xbb\xbf' + b
    open(p, 'wb').write(b)
    lone = b.count(b'\n') - b.count(b'\r\n')
    print('%s bytes=%d loneLF=%d' % (f, len(b), lone))
