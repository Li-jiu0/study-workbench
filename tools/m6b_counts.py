import re
from collections import Counter
t = open(r'D:\下载的文件\学习工作台\tools\m6b3.txt', encoding='utf-8').read()
res = []
for hdr in ['FUNCTIONAL-UI', 'UNSURE', 'DECORATIVE']:
    m = re.search(r'===== ' + hdr + r'[^\n]*\((\d+)\) =====', t)
    res.append('%s = %s' % (hdr, m.group(1) if m else '?'))
# parse functional section
m = re.search(r'===== FUNCTIONAL-UI[^\n]*=====\n(.*?)\n\n=====', t, re.S)
func = m.group(1) if m else ''
c = Counter()
for line in func.split('\n'):
    mm = re.match(r'([^:]+):(\d+)', line)
    if mm:
        c[mm.group(1)] += 1
res.append('--- FUNCTIONAL per-file ---')
for k, v in c.most_common():
    res.append('%3d  %s' % (v, k))
# unsure per-file
m2 = re.search(r'===== UNSURE[^\n]*=====\n(.*?)\n\n=====', t, re.S)
un = m2.group(1) if m2 else ''
c2 = Counter()
for line in un.split('\n'):
    mm = re.match(r'([^:]+):(\d+)', line)
    if mm:
        c2[mm.group(1)] += 1
res.append('--- UNSURE per-file ---')
for k, v in c2.most_common():
    res.append('%3d  %s' % (v, k))
open(r'D:\下载的文件\学习工作台\tools\m6b3_counts.txt', 'w', encoding='utf-8').write('\n'.join(res) + '\n')
