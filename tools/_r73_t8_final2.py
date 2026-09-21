# -*- coding: utf-8 -*-
"""按无空格格式核验 ai-settings.html 的断点与规则"""
import io, os, re
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t8_final2.txt')
h = io.open(os.path.join(ROOT, 'ai-settings.html'), encoding='utf-8').read()
res = []
for pat in [r'@media\s*\(max-width:\s*\d+px\)', r'flex:\s*1\s+1\s+0', r'justify-content:\s*flex-end']:
    res.append('PATTERN %s' % pat)
    for m in re.finditer(pat, h):
        seg = h[max(0, m.start()-60):m.start()+160].replace('\n', '\\n')
        res.append('  @%d ...%s...' % (m.start(), seg))
res.append('--- @media 全列表 ---')
for m in re.finditer(r'@media[^{]*', h):
    res.append('  @%d %s' % (m.start(), m.group(0).strip()))
res.append('--- xt-set-row-right 全部规则 ---')
for m in re.finditer(r'\.xt-set-row-right\{[^}]*\}', h):
    res.append('  @%d %s' % (m.start(), m.group(0)))
res.append('--- xt-set-row-main 全部规则 ---')
for m in re.finditer(r'\.xt-set-row-main\{[^}]*\}', h):
    res.append('  @%d %s' % (m.start(), m.group(0)))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
