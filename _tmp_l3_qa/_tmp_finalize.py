# -*- coding: utf-8 -*-
"""L3 收尾：把临时件收进一个目录 + 复验（换行符 / 只改了两个文件）"""
import os, io, shutil, time, glob

ROOT = 'D:\\下载的文件\\学习工作台\\'
KEEP = ROOT + '_tmp_l3_qa\\'
OUT = []

os.makedirs(KEEP, exist_ok=True)
# 1) 收集所有 _tmp_* 临时件（除目标目录本身）
for p in glob.glob(ROOT + '_tmp_*'):
    if os.path.normcase(os.path.abspath(p)) == os.path.normcase(os.path.abspath(KEEP.rstrip('\\'))):
        continue
    if p.endswith('.py') or p.endswith('.js') or p.endswith('.txt') or p.endswith('.json') or os.path.isdir(p):
        try:
            dst = os.path.join(KEEP, os.path.basename(p))
            if os.path.exists(dst):
                shutil.rmtree(dst) if os.path.isdir(dst) else os.remove(dst)
            shutil.move(p, dst)
            OUT.append('moved  ' + os.path.basename(p))
        except Exception as e:
            OUT.append('SKIP   %s (%s)' % (p, e))

# 2) 换行符复验
for rel, exp in [('AI.html', 'CRLF'), (r'assets\\ai-page.js', 'LF')]:
    b = open(ROOT + rel, 'rb').read()
    crlf, lf = b.count(b'\r\n'), b.count(b'\n')
    ok = (crlf == lf) if exp == 'CRLF' else (crlf == 0)
    OUT.append('EOL    %-18s crlf=%-5d lf=%-5d expect=%s -> %s' % (rel, crlf, lf, exp, 'OK' if ok else 'FAIL'))
    # BOM 保留检查
    OUT.append('       BOM=%s size=%d' % (b[:3] == b'\xef\xbb\xbf', len(b)))

# 3) 只改了两个文件？扫全树 mtime（近 3 小时）
now = time.time()
touched = []
for dp, dn, fn in os.walk(ROOT):
    if '_tmp_l3_qa' in dp or '.git' in dp:
        continue
    for f in fn:
        fp = os.path.join(dp, f)
        try:
            if now - os.path.getmtime(fp) < 3 * 3600:
                touched.append(os.path.relpath(fp, ROOT))
        except Exception:
            pass
OUT.append('')
OUT.append('=== files modified in last 3h (excluding _tmp_l3_qa) ===')
for t in sorted(touched):
    OUT.append('  ' + t)

io.open(KEEP + 'final-report.txt', 'w', encoding='utf-8').write('\n'.join(OUT) + '\n')
print('done')
