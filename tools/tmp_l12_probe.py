# -*- coding: utf-8 -*-
import io, os

root = 'D:/下载的文件/学习工作台'
targets = ['个人中心.html', '演示.html']
res = []
for t in targets:
    p = os.path.join(root, t)
    raw = io.open(p, 'rb').read()
    txt = raw.decode('utf-8', 'replace')
    crlf = raw.count(b'\r\n')
    lf = raw.count(b'\n') - crlf
    res.append(u'%s | bytes=%d | lines=%d | CRLF=%d | LF=%d' % (t, len(raw), txt.count(u'\n') + 1, crlf, lf))

# also find ppt-works.js
js = []
for dirpath, dirnames, filenames in os.walk(os.path.join(root, 'assets')):
    for f in filenames:
        js.append(os.path.relpath(os.path.join(dirpath, f), root).replace('\\', '/'))
js.sort()
res.append(u'--- assets ---')
res.extend(js)

io.open('D:/下载的文件/学习工作台/tools/tmp_l12_probe.txt', 'w', encoding='utf-8').write(u'\n'.join(res))
print('OK')
