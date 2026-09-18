# -*- coding: utf-8 -*-
import os, io

ROOT = 'D:/下载的文件/学习工作台'
out = []

out.append('== root exists: %s' % os.path.isdir(ROOT))
for dirpath, dirnames, filenames in os.walk(ROOT):
    rel = os.path.relpath(dirpath, ROOT)
    if rel == '.':
        rel = ''
    fn = sorted(filenames)
    out.append('--- %s (%d files)' % (rel or './', len(fn)))
    for f in fn:
        if rel == '' or rel.startswith('assets') or rel.startswith('tools'):
            fp = os.path.join(dirpath, f)
            out.append('    %s  %d' % (f, os.path.getsize(fp)))
    if rel and not (rel.startswith('assets') or rel.startswith('tools')):
        pass

# newline style of cet-read.js
p = os.path.join(ROOT, 'assets', 'cet-read.js')
b = open(p, 'rb').read()
out.append('')
out.append('cet-read.js size=%d crlf=%d lf_total=%d' % (len(b), b.count(b'\r\n'), b.count(b'\n')))

# does data-cet-read.js exist here?
p2 = os.path.join(ROOT, 'assets', 'data-cet-read.js')
out.append('data-cet-read.js exists: %s' % os.path.exists(p2))

io.open(os.path.join(ROOT, '_probe5_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
