# -*- coding: utf-8 -*-
import io, re, os, collections

ROOT = 'D:/下载的文件/学习工作台'
out = []

htmls = [f for f in os.listdir(ROOT) if f.lower().endswith('.html')]
out.append('根 HTML 总数 = %d' % len(htmls))

pat = re.compile(r'<script[^>]*src=["\'](assets/[^"\']+)["\']')
stat = collections.OrderedDict()
for f in sorted(htmls):
    s = io.open(os.path.join(ROOT, f), encoding='utf-8', errors='replace').read()
    for m in pat.finditer(s):
        raw = m.group(1)
        path = raw.split('?')[0]
        has_v = ('?v=' in raw)
        d = stat.setdefault(path, {'n': 0, 'stamped': 0, 'files': []})
        d['n'] += 1
        if has_v:
            d['stamped'] += 1
        d['files'].append(f)

out.append('')
out.append('%-34s %6s %8s' % ('asset', 'refs', 'with?v'))
out.append('-' * 54)
for k in sorted(stat, key=lambda x: -stat[x]['n']):
    d = stat[k]
    out.append('%-34s %6d %8d' % (k, d['n'], d['stamped']))

io.open(os.path.join(ROOT, 'tools/_r87_assetrefs.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
