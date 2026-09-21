# -*- coding: utf-8 -*-
import os, io, sys, datetime

ROOT = r'D:\下载的文件\学习工作台'
out = []

def stat(p):
    try:
        st = os.stat(p)
        return st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
    except Exception as e:
        return -1, str(e)

def nl(p):
    try:
        b = open(p, 'rb').read()
        crlf = b.count(b'\r\n')
        lf = b.count(b'\n') - crlf
        return crlf, lf, len(b)
    except Exception as e:
        return -1, -1, str(e)

targets = [
    r'AI模拟面试.html',
    r'assets\iv-prep.js',
    r'AI模拟面试.html.bak-pre-l7-20260916',
    r'assets\iv-prep.js.bak-pre-l7-20260916',
    r'tools\qa\page_check.js',
    r'tools\qa\escheck_es2017.js',
]
for t in targets:
    p = os.path.join(ROOT, t)
    sz, mt = stat(p)
    c, l, tot = nl(p)
    out.append('%-46s size=%s mtime=%s CRLF=%s BARE_LF=%s' % (t, sz, mt, c, l))

# list dir
out.append('--- tools/qa dir ---')
d = os.path.join(ROOT, 'tools', 'qa')
try:
    for f in sorted(os.listdir(d)):
        fp = os.path.join(d, f)
        out.append('  %s  %s' % (f, os.path.getsize(fp)))
except Exception as e:
    out.append('  ERR ' + str(e))

out.append('--- root html/js count ---')
try:
    files = sorted(os.listdir(ROOT))
    out.append('  root entries=%d' % len(files))
except Exception as e:
    out.append('  ERR ' + str(e))

open(os.path.join(ROOT, 'tools', 'qa', '_a4_probe_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
