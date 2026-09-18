# -*- coding: utf-8 -*-
import io, os, sys

p = r'D:\下载的文件\学习工作台\错题本.html'
with open(p, 'rb') as f:
    data = f.read()

crlf = data.count(b'\r\n')
lf = data.count(b'\n')
bom = data[:3] == b'\xef\xbb\xbf'

out = []
out.append('file: ' + p)
out.append('size: ' + str(len(data)))
out.append('BOM: ' + str(bom))
out.append('CRLF count: ' + str(crlf))
out.append('LF total : ' + str(lf))
out.append('lone LF  : ' + str(lf - crlf))

with io.open(r'D:\下载的文件\学习工作台\tools\_t11_eol.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('ok')
