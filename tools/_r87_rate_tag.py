# -*- coding: utf-8 -*-
import io, re, os

ROOT = 'D:/下载的文件/学习工作台'
FILES = ['assets/ai-settings.js', 'assets/ai-page.js', 'assets/ai-config.js',
         'assets/ai-service.js', 'assets/ai-selector.js', 'assets/ai.js']

out = []
for f in FILES:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        out.append('== %s : NOT FOUND' % f)
        continue
    s = io.open(p, encoding='utf-8', errors='replace').read()
    out.append('===== %s (len=%d) =====' % (f, len(s)))
    for kw in ['m.rate', '.rate', 'rate:', "'rate'", '"rate"', 'm.tag', '.tag', 'tag:', "'tag'", '"tag"']:
        n = s.count(kw)
        if n:
            out.append('  %-10s x%d' % (kw, n))
    # dump context lines containing rate/tag usage
    lines = s.split('\n')
    hits = []
    for i, l in enumerate(lines, 1):
        if re.search(r'(m\.rate|\.rate\b|m\.tag|\.tag\b)', l) and not re.search(r'rateLimit|generate|separate|accurate|rate_?lim', l):
            hits.append('   L%-6d %s' % (i, l.strip()[:220]))
    out.append('  --- 命中行 (%d) ---' % len(hits))
    out.extend(hits[:60])

io.open(os.path.join(ROOT, 'tools/_r87_rate_tag.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
