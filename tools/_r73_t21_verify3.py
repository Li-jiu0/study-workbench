# -*- coding: utf-8 -*-
"""抽验 ai-page.js 容错修复落盘"""
import io, os, time, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t21_verify3.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
p = os.path.join(ROOT, 'assets', 'ai-page.js')
b = io.open(p, 'rb').read()
s = io.open(p, encoding='utf-8').read()
res = []
res.append('ai-page.js mtime=%s size=%d CR=%d LF_only=%d' % (
    time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p))), len(b),
    b.count(b'\r'), b.count(b'\n') - b.count(b'\r\n')))
res.append('parseJsonOrFriendly=%d  非 JSON 内容=%d  return r.json()=%d' % (
    s.count('parseJsonOrFriendly'), s.count('非 JSON 内容'), s.count('return r.json()')))
r = subprocess.run([NODE, '--check', p], capture_output=True)
res.append('node --check rc=%d' % r.returncode)
lines = s.splitlines()
res.append('--- 1516-1522 ---')
for i in range(1515, min(1522, len(lines))):
    res.append('%d: %s' % (i + 1, lines[i].strip()))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
