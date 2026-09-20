# -*- coding: utf-8 -*-
import os, shutil
base = r'D:\下载的文件\学习工作台'
pairs = [
    (r'assets\ai-settings.js', r'assets\ai-settings.js.bak-pre-r87-20260918'),
    (r'ai-settings.html',      r'ai-settings.html.bak-pre-r87-20260918'),
]
for src, dst in pairs:
    s = os.path.join(base, src)
    d = os.path.join(base, dst)
    shutil.copy2(s, d)
    print('backup', dst, os.path.getsize(d))
