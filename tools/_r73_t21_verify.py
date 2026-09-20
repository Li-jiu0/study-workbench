# -*- coding: utf-8 -*-
"""抽验 任务二十一 的 ai-service.js 容错修复落盘"""
import io, os, time, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t21_verify.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []
p = os.path.join(ROOT, 'assets', 'ai-service.js')
b = io.open(p, 'rb').read()
res.append('ai-service.js mtime=%s size=%d CRLF=%d bareLF=%d BOM=%s' % (
    time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p))), len(b),
    b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n'), b[:3] == b'\xef\xbb\xbf'))
s = io.open(p, encoding='utf-8').read()
for kw in ['safeRespJson', '非 JSON 内容', 'Unexpected token']:
    res.append('%-18s count=%d' % (kw, s.count(kw)))
import re
m = re.search(r'function safeRespJson[\s\S]{0,700}', s)
if m:
    res.append('--- safeRespJson 定义 ---')
    res.append(m.group(0)[:600].replace('\n', '\\n'))
r = subprocess.run([NODE, '--check', p], capture_output=True)
res.append('node --check rc=%d %s' % (r.returncode, (r.stderr or b'').decode('utf-8', 'replace')[:200]))
# 确认没误伤别的文件：列出 assets 近 10 分钟内改动的文件
recent = []
for fn in os.listdir(os.path.join(ROOT, 'assets')):
    fp = os.path.join(ROOT, 'assets', fn)
    if os.path.isfile(fp) and time.time() - os.path.getmtime(fp) < 900:
        recent.append('%s %s' % (fn, time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(fp)))))
res.append('assets 近15分钟改动: ' + '; '.join(recent))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
