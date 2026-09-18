import re, os, zlib

p = r'C:/Users/ATM/Documents/模拟面试页面重构.pdf'
data = open(p, 'rb').read()
outdir = r'D:/下载的文件/学习工作台/_w2t1_img'

objs = {}
for m in re.finditer(rb'(\d+)\s+0\s+obj(.*?)endobj', data, re.S):
    objs[int(m.group(1))] = m.group(2)

res = []
for k in sorted(objs):
    body = objs[k]
    if b'/Image' not in body:
        continue
    w = re.search(rb'/Width\s+(\d+)', body)
    h = re.search(rb'/Height\s+(\d+)', body)
    if not w or not h:
        continue
    W, H = int(w.group(1)), int(h.group(1))
    f = re.search(rb'/Filter\s*/(\w+)', body)
    filt = f.group(1).decode() if f else 'none'
    L = re.search(rb'/Length\s+(\d+)', body)
    sm = re.search(rb'/SMask\s+(\d+)\s+0\s+R', body)
    # find stream start
    si = body.find(b'stream')
    if si < 0:
        continue
    start = si + len(b'stream')
    if body[start:start+2] == b'\r\n':
        start += 2
    elif body[start:start+1] in (b'\n', b'\r'):
        start += 1
    if L:
        raw = body[start:start+int(L.group(1))]
    else:
        ei = body.rfind(b'endstream')
        raw = body[start:ei]
    res.append('obj %d W=%d H=%d F=%s len=%d smask=%s' % (k, W, H, filt, len(raw), sm.group(1).decode() if sm else '-'))
    if filt == 'DCTDecode':
        open(os.path.join(outdir, 'c_obj%d_%dx%d.jpg' % (k, W, H)), 'wb').write(raw)
    elif filt == 'FlateDecode':
        try:
            d = zlib.decompress(raw)
            res.append('  decomp=%d expect_gray=%d expect_rgb=%d' % (len(d), W*H, W*H*3))
            if len(d) == W*H:
                # gray alpha -> make png-like pgm
                open(os.path.join(outdir, 'a_obj%d_%dx%d.pgm' % (k, W, H)), 'wb').write(b'P5\n%d %d\n255\n' % (W, H) + d)
            elif len(d) == W*H*3:
                open(os.path.join(outdir, 'c_obj%d_%dx%d.ppm' % (k, W, H)), 'wb').write(b'P6\n%d %d\n255\n' % (W, H) + d)
            elif len(d) == W*H*4:
                open(os.path.join(outdir, 'c_obj%d_%dx%d_rgba.bin' % (k, W, H)), 'wb').write(d)
        except Exception as e:
            res.append('  zlib err %s' % e)

open(r'D:/下载的文件/学习工作台/_w2t1_pdfimg2.txt', 'w', encoding='utf-8').write('\n'.join(res))
