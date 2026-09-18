import re, os

p = r'C:/Users/ATM/Documents/模拟面试页面重构.pdf'
data = open(p, 'rb').read()
outdir = r'D:/下载的文件/学习工作台/_w2t1_img'
if not os.path.isdir(outdir):
    os.makedirs(outdir)

objs = {}
for m in re.finditer(rb'(\d+)\s+0\s+obj(.*?)endobj', data, re.S):
    objs[int(m.group(1))] = m.group(2)

res = []
for k in sorted(objs):
    body = objs[k]
    if b'/Image' not in body:
        continue
    f = re.search(rb'/Filter\s*/(\w+)', body)
    if not f or f.group(1) != b'DCTDecode':
        continue
    m = re.search(rb'stream\r?\n(.*?)endstream', body, re.S)
    if not m:
        continue
    raw = m.group(1)
    if raw.endswith(b'\n'):
        raw = raw[:-1]
    if raw.endswith(b'\r'):
        raw = raw[:-1]
    w = re.search(rb'/Width\s+(\d+)', body).group(1).decode()
    h = re.search(rb'/Height\s+(\d+)', body).group(1).decode()
    fn = os.path.join(outdir, 'img%02d_%sx%s.jpg' % (k, w, h))
    open(fn, 'wb').write(raw)
    res.append('%s bytes=%d head=%r' % (fn, len(raw), raw[:4]))

open(r'D:/下载的文件/学习工作台/_w2t1_pdfjpg.txt', 'w', encoding='utf-8').write('\n'.join(res))
