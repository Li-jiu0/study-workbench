# -*- coding: utf-8 -*-
import io, re, os

ROOT = 'D:/下载的文件/学习工作台'
out = []

targets = ['设置.html', 'AI.html', 'ai-settings.html', '关于.html', '更新.html']
for f in targets:
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        out.append('== %s : NOT FOUND' % f)
        continue
    s = io.open(p, encoding='utf-8', errors='replace').read()
    out.append('===== %s =====' % f)
    for i, l in enumerate(s.split('\n'), 1):
        if 'ai-cap-' in l or 'ai-service.js' in l or 'ai-settings.js' in l or 'xt-aiusage.js' in l or 'ai-page.js' in l:
            out.append('  L%-6d %s' % (i, l.strip()[:200]))
    out.append('')

io.open(os.path.join(ROOT, 'tools/_r87_scriptrefs.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
