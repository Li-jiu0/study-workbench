# -*- coding: utf-8 -*-
import io
import subprocess
import os

R = r'D:\下载的文件\学习工作台'
OUT = os.path.join(R, 'tools', 'qa', 't5_check2.txt')
o = []
c = io.open(os.path.join(R, 'assets', 'app.js'), encoding='utf-8', errors='replace').read()
L = c.split('\n')

o.append('--- 剩余 listen 出现处 ---')
for i, l in enumerate(L):
    if 'listen' in l:
        o.append('  %d: %s' % (i + 1, l.rstrip()[:170]))

o.append('')
o.append('--- recentMap 现状 ---')
for i, l in enumerate(L):
    if 'var recentMap' in l:
        for j in range(i, i + 5):
            o.append('  %d: %s' % (j + 1, L[j].rstrip()))
        break

o.append('')
r = subprocess.run('node --check assets/app.js', cwd=R, capture_output=True,
                   text=True, encoding='utf-8', errors='replace', shell=True)
o.append('node --check exit = %d' % r.returncode)
o.append('stdout+stderr: %s' % ((r.stdout or '') + (r.stderr or '')).strip())

r2 = subprocess.run('node tools/qa/escheck_es2017.js', cwd=R, capture_output=True,
                    text=True, encoding='utf-8', errors='replace', shell=True)
o.append('escheck exit = %d | %s' % (r2.returncode, ((r2.stdout or '') + (r2.stderr or '')).strip()[-500:]))

b = io.open(os.path.join(R, 'assets', 'app.js'), 'rb').read()
o.append('app.js 行数(\\n) = %d | CRLF=%d 纯LF=%d' % (b.count(b'\n'), b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n')))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(o))
print('ok')
