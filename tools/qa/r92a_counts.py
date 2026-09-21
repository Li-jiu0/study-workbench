# -*- coding: utf-8 -*-
import os
ROOT = r'D:\下载的文件\学习工作台'
out = os.path.join(ROOT, 'tools', 'qa', '_r92a_counts.txt')
res = []
with open(os.path.join(ROOT, 'assets', 'ai-page.js'), 'rb') as f:
    a1 = f.read()
with open(os.path.join(ROOT, 'assets', 'ai-service.js'), 'rb') as f:
    s1 = f.read()
for name, d in [('ai-page.js', a1), ('ai-service.js', s1)]:
    res.append(name)
    for s in [b'routeCapabilityModel', b'CAP_MODEL_TYPES', b'xtRunCapability', b'window.xtRunCapability',
              b'cap.run', b'isCapabilityModel', b'capModelKind', b'i2v', b'i23d', b'createElement']:
        res.append('  %s = %d' % (s.decode('utf-8'), d.count(s)))
with open(out, 'w', encoding='utf-8') as f:
    f.write('\n'.join(res))
print('ok')
