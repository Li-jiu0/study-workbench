# -*- coding: utf-8 -*-
import os, glob

roots = [
    r'C:\Users\ATM\.workbuddy',
    r'C:\Users\ATM\AppData\Local\Temp',
    r'C:\Users\ATM\WorkBuddy',
    r'D:\下载的文件\学习工作台',
    r'C:\Users\ATM\Downloads',
    r'C:\Users\ATM\Desktop',
    r'C:\Users\ATM\Pictures',
]
pat_words = ['clipboard', 'screenshot', 'image', 'paste', '截图', 'clip_']
found = []
for r in roots:
    if not os.path.isdir(r):
        continue
    for dp, dns, fns in os.walk(r):
        # 限制深度，避免全盘
        depth = dp[len(r):].count(os.sep)
        if depth > 5:
            dns[:] = []
            continue
        dns[:] = [d for d in dns if d not in ('node_modules', '.git', 'binaries')]
        for fn in fns:
            low = fn.lower()
            if low.endswith(('.png', '.jpg', '.jpeg', '.webp')):
                if any(w in low for w in pat_words):
                    p = os.path.join(dp, fn)
                    try:
                        st = os.stat(p)
                    except OSError:
                        continue
                    found.append((st.st_mtime, st.st_size, p))

found.sort(reverse=True)
print('found %d' % len(found))
for mt, sz, p in found[:40]:
    import datetime
    print('%s  %9d  %s' % (datetime.datetime.fromtimestamp(mt).strftime('%m-%d %H:%M:%S'), sz, p))
