# -*- coding: utf-8 -*-
import io, re, os

ROOT = 'D:/下载的文件/学习工作台'
out = []

for f in ['assets/ai-settings.js', 'assets/ai-page.js']:
    p = os.path.join(ROOT, f)
    s = io.open(p, encoding='utf-8', errors='replace').read()
    lines = s.split('\n')
    out.append('===== %s =====' % f)
    # find lines that reference tag as a badge/label
    for i, l in enumerate(lines, 1):
        if re.search(r'\btag\b', l) and not re.search(r'target|TagName|tagName', l):
            out.append('  L%-6d %s' % (i, l.strip()[:240]))
    out.append('  --- 含「免费」的行 ---')
    for i, l in enumerate(lines, 1):
        if '免费' in l:
            out.append('  L%-6d %s' % (i, l.strip()[:240]))
    out.append('  --- 含「倍率」或 rate 展示文案的行 ---')
    for i, l in enumerate(lines, 1):
        if '倍率' in l:
            out.append('  L%-6d %s' % (i, l.strip()[:240]))

io.open(os.path.join(ROOT, 'tools/_r87_tag_render.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
