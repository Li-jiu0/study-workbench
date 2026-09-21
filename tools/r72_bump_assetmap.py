# -*- coding: utf-8 -*-
# R72 打戳：全资产 -> 戳分布 一览（确认未误 bump 的文件仍为 O/R）
import os, re, glob

BASE = r'D:\下载的文件\学习工作台'
files = sorted(glob.glob(os.path.join(BASE, '*.html')))
TAG = re.compile(r'<(?:script|link)\b[^>]*>', re.I)
ATTR = re.compile(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
RX = re.compile(r'^assets/([^"\'?]+)\?v=(.+)$')

asset = {}
for p in files:
    t = open(p, 'rb').read().decode('utf-8')
    for tg in TAG.findall(t):
        for u in ATTR.findall(tg):
            m = RX.match(u)
            if m:
                asset.setdefault(m.group(1), {})
                asset[m.group(1)][m.group(2)] = asset[m.group(1)].get(m.group(2), 0) + 1

out = []
for a in sorted(asset):
    out.append('%-26s %s' % (a, dict(sorted(asset[a].items()))))
with open(os.path.join(BASE, 'tools', 'r72_bump_assetmap_out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')
print('MAP DONE')
