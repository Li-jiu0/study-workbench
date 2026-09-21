# -*- coding: utf-8 -*-
import io, re, os

ROOT = 'D:/下载的文件/学习工作台'
out = []

# 1) ai-settings.html 的完整 script 引用
p = os.path.join(ROOT, 'ai-settings.html')
s = io.open(p, encoding='utf-8', errors='replace').read()
out.append('===== ai-settings.html script refs =====')
for i, l in enumerate(s.split('\n'), 1):
    if '<script' in l:
        out.append('  L%-6d %s' % (i, l.strip()[:190]))

# 2) ai-settings.js 里 xt:health-changed 派发点 + 上下文
p2 = os.path.join(ROOT, 'assets/ai-settings.js')
s2 = io.open(p2, encoding='utf-8', errors='replace').read()
lines = s2.split('\n')
out.append('')
out.append('===== ai-settings.js: xt:health-changed / recordHealth / probeNoAuto =====')
for i, l in enumerate(lines, 1):
    if ('xt:health-changed' in l) or ('recordHealth' in l) or ('probeNoAuto' in l) or ('aiHealthCheckBatch' in l) or ('unsupported_probe' in l) or ('skipped' in l):
        out.append('  L%-6d %s' % (i, l.strip()[:190]))

# 3) 找 recordHealth 的函数定义，打印函数体
out.append('')
out.append('===== recordHealth 函数体 =====')
for i, l in enumerate(lines, 1):
    if re.search(r'function\s+recordHealth', l):
        for j in range(i - 1, min(i + 30, len(lines))):
            out.append('  L%-6d %s' % (j + 1, lines[j][:190]))
        out.append('  ...')
        break

# 4) 找 batchHealthCheck 函数定义
out.append('')
out.append('===== batchHealthCheck 函数体 =====')
for i, l in enumerate(lines, 1):
    if re.search(r'function\s+batchHealthCheck', l):
        for j in range(i - 1, min(i + 60, len(lines))):
            out.append('  L%-6d %s' % (j + 1, lines[j][:190]))
        break

# 5) pumpHealth 函数体
out.append('')
out.append('===== pumpHealth 函数体 =====')
for i, l in enumerate(lines, 1):
    if re.search(r'function\s+pumpHealth', l):
        for j in range(i - 1, min(i + 40, len(lines))):
            out.append('  L%-6d %s' % (j + 1, lines[j][:190]))
        break

# 6) pendingHealthIds 函数体
out.append('')
out.append('===== pendingHealthIds 函数体 =====')
for i, l in enumerate(lines, 1):
    if re.search(r'function\s+pendingHealthIds', l):
        for j in range(i - 1, min(i + 30, len(lines))):
            out.append('  L%-6d %s' % (j + 1, lines[j][:190]))
        break

io.open(os.path.join(ROOT, 'tools/_r87_health_wiring.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
