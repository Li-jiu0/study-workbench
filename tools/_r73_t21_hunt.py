# -*- coding: utf-8 -*-
"""定位 任务二十一 实际把 safeRespJson 写到了哪里"""
import io, os, time
OUT = r'D:\下载的文件\学习工作台\tools\_r73_t21_hunt.txt'
res = []
targets = [
    r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2d763cd8\assets\ai-service.js',
    r'D:\下载的文件\学习工作台\assets\ai-service.js',
]
for p in targets:
    if not os.path.exists(p):
        res.append('不存在: %s' % p)
        continue
    b = io.open(p, 'rb').read()
    res.append('%s\n  mtime=%s size=%d CRLF=%d bareLF=%d safeRespJson=%d 非(%s)=%d' % (
        p, time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p))), len(b),
        b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n'),
        b.count(b'safeRespJson'), '非JSON'.encode('utf-8').decode('utf-8'), b.count('非 JSON 内容'.encode('utf-8'))))
# 全盘搜索（限定常见根）哪些 ai-service.js 含 safeRespJson
import subprocess
roots = [r'D:\下载的文件', r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台', r'C:\Users\ATM\WorkBuddy\Worktrees']
seen = set()
for root in roots:
    if root in seen:
        continue
    seen.add(root)
    for dirpath, dirnames, filenames in os.walk(root):
        if '.git' in dirpath or 'node_modules' in dirpath:
            continue
        if fn_match := [f for f in filenames if f == 'ai-service.js']:
            for f in fn_match:
                p2 = os.path.join(dirpath, f)
                try:
                    bb = io.open(p2, 'rb').read()
                    res.append('FOUND %s mtime=%s size=%d safe=%d' % (
                        p2, time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p2))), len(bb), bb.count(b'safeRespJson')))
                except Exception as e:
                    res.append('READFAIL %s %r' % (p2, e))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
