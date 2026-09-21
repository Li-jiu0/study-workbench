# -*- coding: utf-8 -*-
import os, re

ROOT = r'D:\下载的文件\学习工作台'
FILES = [
    os.path.join(ROOT, 'AI模拟面试.html'),
    os.path.join(ROOT, 'assets', 'iv-prep.js'),
]

FORBID = [
    (r'\?\.', 'optional-chain ?.'),
    (r'\?\?', 'nullish ??'),
    (r'\.replaceAll\s*\(', 'replaceAll'),
    (r'Object\.fromEntries', 'Object.fromEntries'),
    (r'\.at\s*\(', '.at('),
    (r'\(\?<=', 'lookbehind (?<='),
    (r'\(\?<!', 'lookbehind (?<!'),
    (r'\*\*', 'exponent **'),
    (r'catch\s*\{', 'optional catch binding'),
    (r'\balert\s*\(', 'native alert('),
    (r'\bconfirm\s*\(', 'native confirm('),
    (r'\bprompt\s*\(', 'native prompt('),
]

out = []
for p in FILES:
    txt = open(p, 'r', encoding='utf-8').read()
    lines = txt.split('\n')
    out.append('===== %s (lines=%d, bytes=%d) =====' % (os.path.basename(p), len(lines), len(txt.encode('utf-8'))))
    for pat, name in FORBID:
        hits = []
        rx = re.compile(pat)
        for i, ln in enumerate(lines, 1):
            if rx.search(ln):
                hits.append('%d: %s' % (i, ln.strip()[:150]))
        if hits:
            out.append('  [HIT] %s x%d' % (name, len(hits)))
            for h in hits[:20]:
                out.append('        ' + h)

# object spread {...  detection (rough): occurrence of '{...' is not spread; check for "{ ..." pattern
out.append('')
out.append('===== top-level var/const/let declarations =====')
for p in FILES:
    txt = open(p, 'r', encoding='utf-8').read()
    out.append('--- %s ---' % os.path.basename(p))

open(os.path.join(ROOT, 'tools', 'qa', '_a4_grep_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
