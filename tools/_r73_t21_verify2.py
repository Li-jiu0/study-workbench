# -*- coding: utf-8 -*-
"""抽验 ai-service.js 落盘 + 核实 ai-page.js:1496-1512 残留点"""
import io, os, time, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t21_verify2.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []
for f in [r'assets\ai-service.js', r'assets\ai-page.js']:
    p = os.path.join(ROOT, f)
    b = io.open(p, 'rb').read()
    res.append('%s mtime=%s size=%d CR=%d LF_only=%d safeRespJson=%d' % (
        f, time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p))), len(b),
        b.count(b'\r'), b.count(b'\n') - b.count(b'\r\n'), b.count(b'safeRespJson')))
r = subprocess.run([NODE, '--check', os.path.join(ROOT, 'assets', 'ai-service.js')], capture_output=True)
res.append('node --check ai-service.js rc=%d' % r.returncode)
pg = io.open(os.path.join(ROOT, 'assets', 'ai-page.js'), encoding='utf-8').read().splitlines()
res.append('--- ai-page.js 1490-1515 ---')
for i in range(1489, min(1515, len(pg))):
    res.append('%d: %s' % (i + 1, pg[i]))
res.append('ai-page.js .json() 次数=%d  readResponseText=%d  looksLikeHtml=%d' % (
    pg.__len__() and '\n'.join(pg).count('.json()'), '\n'.join(pg).count('readResponseText'), '\n'.join(pg).count('looksLikeHtml')))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
