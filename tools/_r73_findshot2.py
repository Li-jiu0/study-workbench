# -*- coding: utf-8 -*-
"""找用户刚粘贴的截图：全盘按 mtime 过滤，只看今天 14:00 之后新增的图片"""
import os, datetime

CUT = datetime.datetime(2026, 9, 17, 14, 0, 0).timestamp()

roots = [
    r'C:\Users\ATM\.workbuddy',
    r'C:\Users\ATM\AppData\Roaming',
    r'C:\Users\ATM\AppData\Local',
    r'C:\Users\ATM\WorkBuddy',
    r'C:\Users\ATM\Documents',
    r'C:\Users\ATM\Pictures',
    r'C:\Users\ATM\Desktop',
    r'C:\Users\ATM\Downloads',
    r'D:\\',
]
EXCL = ('node_modules', '.git', 'PortableGit', 'binaries', 'Cache', 'Code Cache',
        'GPUCache', 'Service Worker', 'fonts', 'resources', 'locales')
hits = []
seen = 0
for r in roots:
    if not os.path.isdir(r):
        continue
    for dp, dns, fns in os.walk(r):
        dns[:] = [d for d in dns if d not in EXCL and not d.startswith('$')]
        if dp.count(os.sep) - r.count(os.sep) > 7:
            dns[:] = []
            continue
        for fn in fns:
            low = fn.lower()
            if not low.endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp')):
                continue
            seen += 1
            p = os.path.join(dp, fn)
            try:
                st = os.stat(p)
            except OSError:
                continue
            if st.st_mtime >= CUT:
                hits.append((st.st_mtime, st.st_size, p))

hits.sort(reverse=True)
print('scanned %d images; found %d newer than 2026-09-17 14:00' % (seen, len(hits)))
for mt, sz, p in hits[:60]:
    print('%s  %9d  %s' % (datetime.datetime.fromtimestamp(mt).strftime('%m-%d %H:%M:%S'), sz, p))
