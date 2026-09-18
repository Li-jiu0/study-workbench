# -*- coding: utf-8 -*-
"""L1：列出所有引用 assets/app.js 的线上 HTML 及其 ?v= 版本戳，供波末统一 bump 使用（本脚本不修改任何文件）。"""
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
EXCLUDE_DIRS = {'备份', 'tools', 'node_modules', '.git', 'ai-server'}
RE = re.compile(r'src="assets/app\.js\?v=([^"]+)"')

rows = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
    for fn in filenames:
        if not fn.endswith('.html'):
            continue
        if '.bak' in fn or '.backup' in fn:
            continue
        p = os.path.join(dirpath, fn)
        with open(p, 'r', encoding='utf-8', errors='ignore') as f:
            src = f.read()
        m = RE.search(src)
        if m:
            rows.append((fn, m.group(1)))

rows.sort()
out = ['引用 assets/app.js 的线上页面：%d 个' % len(rows), '']
vers = {}
for fn, v in rows:
    vers[v] = vers.get(v, 0) + 1
    out.append('  %-28s ?v=%s' % (fn, v))
out.append('')
for v, c in vers.items():
    out.append('版本戳 %s -> %d 个页面' % (v, c))

with open(os.path.join(ROOT, 'tools', 'qa', '_l1_bumplist.out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
