# -*- coding: utf-8 -*-
"""L7 前置检查 v2：只输出安全文本（剔除不可打印字符）。"""
import os
import re
import zlib

ROOT = r'D:\下载的文件\学习工作台'
OUT = r'D:\下载的文件\学习工作台\_tmp_l7_probe.txt'
buf = []


def w(s):
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', str(s))
    buf.append(s)


for name in ['AI模拟面试.html', os.path.join('assets', 'iv-prep.js')]:
    p = os.path.join(ROOT, name)
    b = open(p, 'rb').read()
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n')
    w('[EOL] %s : CRLF=%d LF=%d size=%d BOM=%s' % (name, crlf, lf, len(b), b[:3] == b'\xef\xbb\xbf'))

w('')
pdf_path = os.path.join(ROOT, '_w2t1_design.pdf')
w('[PDF] exists=%s size=%s' % (os.path.exists(pdf_path), os.path.getsize(pdf_path)))
try:
    raw = open(pdf_path, 'rb').read()
    w('[PDF] pages hint count=%d' % len(re.findall(rb'/Type\s*/Page[^s]', raw)))
    w('[PDF] has /Font: %s' % ('/Font' in raw.decode('latin-1')))
    # 列出对象里的图片/字体概况
    fonts = sorted(set(re.findall(rb'/BaseFont\s*/([A-Za-z0-9+#\-]+)', raw)))
    w('[PDF] BaseFonts=%s' % ', '.join([f.decode('latin-1') for f in fonts][:20]))
    imgs = re.findall(rb'/Subtype\s*/Image', raw)
    w('[PDF] image objects=%d' % len(imgs))
except Exception as e:
    w('[PDF] err %s' % e)

w('')
refs = {'AI模拟面试.html': [], 'openInterviewDemo': [], 'iv-prep.js': [], 'IvPrep': []}
pats = {
    'AI模拟面试.html': re.compile(r'AI模拟面试\.html'),
    'openInterviewDemo': re.compile(r'openInterviewDemo'),
    'iv-prep.js': re.compile(r'iv-prep\.js'),
    'IvPrep': re.compile(r'IvPrep'),
}
for dirpath, dirnames, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith(('.html', '.js', '.css')):
            continue
        fp = os.path.join(dirpath, fn)
        rel = os.path.relpath(fp, ROOT)
        if rel.startswith('_tmp_'):
            continue
        try:
            t = open(fp, 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for k, p in pats.items():
            if p.search(t):
                refs[k].append(rel)
for k, v in refs.items():
    w('[REF] %s -> %s' % (k, ', '.join(sorted(set(v))) if v else '(none)'))

open(OUT, 'w', encoding='utf-8').write('\n'.join(buf))
print('OK')
