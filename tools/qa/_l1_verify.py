# -*- coding: utf-8 -*-
"""L1 自检：1) app.js 换行符一致性  2) 老内核禁用语法扫描  3) 调 node --check  4) 调 escheck_es2017.js
结果写入 UTF-8 文件（中文路径下 print 会 GBK 崩溃，故一律落文件）。
"""
import os
import re
import subprocess

ROOT = r'D:\下载的文件\学习工作台'
PY = r'C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe'
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
APP = os.path.join(ROOT, 'assets', 'app.js')

out = []

# 1) 换行符
with open(APP, 'rb') as f:
    b = f.read()
crlf = b.count(b'\r\n')
lf = b.count(b'\n')
out.append('EOL: CRLF=%d LF=%d  (LF-only=%d) -> %s' % (crlf, lf, lf - crlf, 'CRLF-OK' if crlf == lf else 'MIXED!!'))
out.append('SIZE: %d bytes' % len(b))

# 2) 禁用语法扫描（ES2017 老内核）
src = b.decode('utf-8', 'ignore')
# 去掉行注释再扫，避免把注释里的示例算进来
lines = src.split('\n')
code_lines = []
for ln in lines:
    s = ln.strip()
    if s.startswith('//') or s.startswith('*') or s.startswith('/*'):
        continue
    code_lines.append(ln)
code = '\n'.join(code_lines)

checks = [
    ('可选链 ?.', r'\?\.'),
    ('空值合并 ??', r'\?\?'),
    ('replaceAll', r'\.replaceAll\s*\('),
    ('Object.fromEntries', r'Object\.fromEntries'),
    ('Array.prototype.at(', r'\.at\s*\('),
    ('正则后行断言', r'\(\?<[=!]'),
    ('对象展开 {...', r'\{\s*\.\.\.'),
    ('对象剩余解构', r'\{\s*[^}]*,\s*\.\.\.[A-Za-z_$]'),
    ('指数 **', r'\*\*'),
    ('可选catch绑定 catch {', r'catch\s*\{'),
    ('顶层 await', r'^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*await\b'),
    ('原生 alert', r'(?<![.\w])alert\s*\('),
    ('原生 confirm', r'(?<![.\w])confirm\s*\('),
    ('原生 prompt', r'(?<![.\w])prompt\s*\('),
]
for name, pat in checks:
    ms = re.findall(pat, code, re.M)
    out.append('SYNTAX %-22s : %d' % (name, len(ms)))
    if ms:
        for m in re.finditer(pat, code, re.M):
            line = code.count('\n', 0, m.start()) + 1
            out.append('    hit@code-line %d : %s' % (line, code.split('\n')[line - 1].strip()[:120]))

# 3) node --check
p = subprocess.run([NODE, '--check', APP], capture_output=True, text=True, encoding='utf-8', errors='ignore')
out.append('')
out.append('NODE --CHECK rc=%d' % p.returncode)
if p.stdout:
    out.append('stdout: ' + p.stdout[:2000])
if p.stderr:
    out.append('stderr: ' + p.stderr[:2000])

# 4) escheck
es = os.path.join(ROOT, 'tools', 'qa', 'escheck_es2017.js')
p2 = subprocess.run([NODE, es], capture_output=True, text=True, encoding='utf-8', errors='ignore', cwd=ROOT)
out.append('')
out.append('ESCHECK rc=%d' % p2.returncode)
tail = (p2.stdout or '') + (p2.stderr or '')
out.append(tail[-4000:])

with open(os.path.join(ROOT, 'tools', 'qa', '_l1_verify.out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
