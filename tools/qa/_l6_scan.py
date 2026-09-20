# -*- coding: utf-8 -*-
import os, io, time

ROOT = r'D:/下载的文件/学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_l6_scan.txt')
lines = []


def w(s):
    lines.append(str(s))


for name in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, name)
    if os.path.isfile(p):
        b = open(p, 'rb').read()
        w('%s | size=%d | crlf=%d | lf=%d | mtime=%s' % (
            name, len(b), b.count(b'\r\n'), b.count(b'\n'), time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(p)))))

w('--- assets ---')
ap = os.path.join(ROOT, 'assets')
for name in sorted(os.listdir(ap)):
    p = os.path.join(ap, name)
    if os.path.isfile(p):
        b = open(p, 'rb').read()
        w('%s | size=%d | crlf=%d | lf=%d | mtime=%s' % (
            name, len(b), b.count(b'\r\n'), b.count(b'\n'), time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(p)))))

w('--- tools/qa ---')
qp = os.path.join(ROOT, 'tools', 'qa')
if os.path.isdir(qp):
    for name in sorted(os.listdir(qp)):
        w(name)

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(lines))
