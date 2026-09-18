# -*- coding: utf-8 -*-
"""从 _w2t1_design.pdf 里抽取内嵌图片资源，落盘到 _tmp_l7_img/。"""
import os
import re
import zlib

ROOT = r'D:\下载的文件\学习工作台'
SRC = os.path.join(ROOT, '_w2t1_design.pdf')
DST = os.path.join(ROOT, '_tmp_l7_img')
os.makedirs(DST, exist_ok=True)

raw = open(SRC, 'rb').read()
out = []

# ---- 1) 直接抽取 JPEG (DCTDecode) ----
n_jpg = 0
for m in re.finditer(rb'<<(.*?)>>\s*stream\r?\n', raw, re.S):
    hdr = m.group(1)
    if b'DCTDecode' not in hdr:
        continue
    start = m.end()
    end = raw.find(b'endstream', start)
    if end < 0:
        continue
    blob = raw[start:end].rstrip(b'\r\n')
    if blob[:2] != b'\xff\xd8':
        continue
    n_jpg += 1
    fp = os.path.join(DST, 'page_img_%02d.jpg' % n_jpg)
    open(fp, 'wb').write(blob)
    out.append('JPEG %d -> %d bytes' % (n_jpg, len(blob)))

# ---- 2) FlateDecode 的原始位图 (/FlateDecode + Image) ----
n_raw = 0
for m in re.finditer(rb'<<(.*?)>>\s*stream\r?\n', raw, re.S):
    hdr = m.group(1)
    if b'/Image' not in hdr or b'FlateDecode' not in hdr or b'DCTDecode' in hdr:
        continue
    start = m.end()
    end = raw.find(b'endstream', start)
    if end < 0:
        continue
    blob = raw[start:end].rstrip(b'\r\n')
    try:
        dec = zlib.decompress(blob)
    except Exception:
        continue
    wmo = re.search(rb'/Width\s+(\d+)', hdr)
    hmo = re.search(rb'/Height\s+(\d+)', hdr)
    if not (wmo and hmo):
        continue
    W = int(wmo.group(1))
    H = int(hmo.group(1))
    n_raw += 1
    fp = os.path.join(DST, 'raw_img_%02d.bin' % n_raw)
    open(fp, 'wb').write(dec)
    out.append('RAW %d -> W=%d H=%d raw=%d bytes' % (n_raw, W, H, len(dec)))

out.insert(0, 'total jpg=%d raw=%d' % (n_jpg, n_raw))
open(os.path.join(ROOT, '_tmp_l7_pdfimg.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
