import re, zlib, struct, os

p = r'C:/Users/ATM/Documents/模拟面试页面重构.pdf'
data = open(p, 'rb').read()
out = []

objs = {}
for m in re.finditer(rb'(\d+)\s+0\s+obj(.*?)endobj', data, re.S):
    objs[int(m.group(1))] = m.group(2)

for k in sorted(objs):
    body = objs[k]
    if b'/Image' in body:
        w = re.search(rb'/Width\s+(\d+)', body)
        h = re.search(rb'/(?:Height|H)\s+(\d+)', body)
        f = re.search(rb'/Filter\s*/(\w+)', body)
        bpc = re.search(rb'/BitsPerComponent\s+(\d+)', body)
        out.append('obj %d: W=%s H=%s F=%s BPC=%s' % (
            k,
            w.group(1).decode() if w else '?',
            h.group(1).decode() if h else '?',
            f.group(1).decode() if f else 'none',
            bpc.group(1).decode() if bpc else '?'))

open(r'D:/下载的文件/学习工作台/_w2t1_pdfimg.txt', 'w', encoding='utf-8').write('\n'.join(out))
