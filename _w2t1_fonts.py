import re, zlib

p = r'C:/Users/ATM/Documents/模拟面试页面重构.pdf'
data = open(p, 'rb').read()
out = []
out.append('ToUnicode count=%d' % len(re.findall(rb'ToUnicode', data)))
out.append('Font count=%d' % len(re.findall(rb'/Type\s*/Font', data)))
out.append('Image XObj count=%d' % len(re.findall(rb'/Subtype\s*/Image', data)))

objs = {}
for m in re.finditer(rb'(\d+)\s+0\s+obj(.*?)endobj', data, re.S):
    objs[int(m.group(1))] = m.group(2)

fonts = []
touni = {}
for k in sorted(objs):
    b = objs[k]
    if re.search(rb'/Type\s*/Font', b):
        sub = re.search(rb'/Subtype\s*/(\w+)', b)
        bf = re.search(rb'/BaseFont\s*/([#\w+-]+)', b)
        fonts.append('obj %d %s %s' % (k, sub.group(1).decode() if sub else '?', bf.group(1).decode('latin-1') if bf else '?'))
    if b'ToUnicode' in b:
        m = re.search(rb'/ToUnicode\s+(\d+)\s+0\s+R', b)
        fonts.append('  obj %d ToUnicode -> %s' % (k, m.group(1).decode() if m else '?'))

out.extend(fonts)
open(r'D:/下载的文件/学习工作台/_w2t1_fonts.txt', 'w', encoding='utf-8').write('\n'.join(out))
