# -*- coding: utf-8 -*-
# HTML structural pairing self-check for 私聊.html
import re
P = r'D:/下载的文件/学习工作台/私聊.html'
raw = open(P, 'rb').read().decode('utf-8')
def cnt(a): return raw.count(a)
pairs = [
    ('<!--', '-->'),
    ('<div', '</div'),
    ('<style', '</style'),
    ('<script', '</script'),
]
ok = True
for a, b in pairs:
    ca, cb = cnt(a), cnt(b)
    status = 'OK' if ca == cb else 'MISMATCH'
    if ca != cb: ok = False
    print('%-8s = %-4d  %-8s = %-4d  %s' % (a, ca, b, cb, status))
print('HTML_STRUCT_OK' if ok else 'HTML_STRUCT_FAIL')
