# -*- coding: utf-8 -*-
import os, re, json
base = r'D:\下载的文件\学习工作台'
targets = [r'assets\ai-settings.js']
pats = [
    ('optional_chain', re.compile(r'\?\.')),
    ('nullish', re.compile(r'\?\?')),
    ('spread_rest', re.compile(r'\.\.\.')),
    ('replaceAll', re.compile(r'\.replaceAll\(')),
    ('fromEntries', re.compile(r'Object\.fromEntries')),
    ('arr_at', re.compile(r'\.at\(')),
    ('lookbehind', re.compile(r'\(\?<[=!]')),
    ('exponent', re.compile(r'\*\*')),
    ('catch_optional', re.compile(r'catch\s*\{')),
]
report = []
for f in targets:
    p = os.path.join(base, f)
    with open(p, 'rb') as fh:
        txt = fh.read().decode('utf-8', 'replace')
    lines = txt.split('\n')
    for name, rx in pats:
        hits = []
        for i, ln in enumerate(lines, 1):
            if rx.search(ln):
                hits.append([i, ln.strip()[:120]])
        report.append({'file': f, 'pattern': name, 'count': len(hits), 'hits': hits[:25]})
with open(os.path.join(base, 'tools', '_t03_es2017_out.json'), 'w', encoding='utf-8') as w:
    w.write(json.dumps(report, ensure_ascii=False, indent=1))
print('done')
