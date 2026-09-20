# -*- coding: utf-8 -*-
import os
BASE = r'D:\下载的文件\学习工作台'
for f in ['演示.html']:
    p = os.path.join(BASE, f)
    b = open(p, 'rb').read()
    if b.startswith(b'\xef\xbb\xbf'):
        b = b[3:]
    b = b.replace(b'\r\n', b'\n').replace(b'\r', b'\n').replace(b'\n', b'\r\n')
    b = b'\xef\xbb\xbf' + b
    open(p, 'wb').write(b)
    print('%s bytes=%d loneLF=%d' % (f, len(b), b.count(b'\n') - b.count(b'\r\n')))
