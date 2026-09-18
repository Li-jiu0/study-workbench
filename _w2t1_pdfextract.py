import re, zlib, os

p = r'C:/Users/ATM/Documents/模拟面试页面重构.pdf'
data = open(p, 'rb').read()
out = []
out.append('size=%d' % len(data))
out.append('head=%r' % data[:200])

# count pages
pages = len(re.findall(rb'/Type\s*/Page[^s]', data))
out.append('pages~%d' % pages)

streams = re.findall(rb'stream\r?\n(.*?)endstream', data, re.S)
out.append('streams=%d' % len(streams))

texts = []
for i, s in enumerate(streams):
    try:
        d = zlib.decompress(s)
    except Exception:
        try:
            d = zlib.decompress(s.strip(b'\r\n'))
        except Exception:
            d = s
    if b'Tj' in d or b'TJ' in d or b'/Image' in d:
        # extract text show ops
        for m in re.findall(rb'\((?:[^()\\]|\\.)*\)', d):
            texts.append(m[1:-1])
        if b'/Image' in d:
            out.append('stream %d: IMAGE' % i)
    out.append('stream %d len=%d decomp=%d' % (i, len(s), len(d)))

out.append('--- text tokens ---')
for t in texts[:400]:
    try:
        out.append(t.decode('utf-8', 'ignore'))
    except Exception:
        pass

open(r'D:/下载的文件/学习工作台/_w2t1_pdftext.txt', 'w', encoding='utf-8').write('\n'.join(out))
