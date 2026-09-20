# -*- coding: utf-8 -*-
import io, re, os

ROOT = 'D:/下载的文件/学习工作台'
out = []

p = os.path.join(ROOT, 'assets/ai-settings.js')
s = io.open(p, encoding='utf-8', errors='replace').read()
lines = s.split('\n')
out.append('ai-settings.js size=%d lines=%d' % (len(s), len(lines)))

# 契约字面量
literals = [
    'BUILTIN_CATS', 'CAT_OF_TYPE', 'ALL_TYPE_KEYS', 'RESERVED_KEYS', 'FAMILY_OF_ORDER',
    'FAMILY_ORDER', 'FAMILY_OF_CAT', 'catSchema', 'hideUnavailable', 'lastSort',
    'xt:health-changed', 'setSortCat', 'setSortCatInner', 'setUsageRoot',
    'setPanelAbout', 'probeNoAuto', 'aiHealthCheckBatch', 'skipped',
    'unsupported_probe', 'soleCategoryOfModel', 'migrateCatSchema',
    'usableIds', 'visibleModels', 'mapToAiList', 'availableIds',
    'translate', 'three_d', 'video',
]
out.append('')
out.append('=== 契约/关键符号命中数 ===')
for k in literals:
    out.append('  %-24s x%d' % (k, s.count(k)))

# BUILTIN_CATS 内容
out.append('')
out.append('=== BUILTIN_CATS 定义 ===')
i = s.find('BUILTIN_CATS')
while i != -1:
    seg = s[i:i + 1400]
    if 'key:' in seg:
        out.append(seg[:1400])
        out.append('---')
        break
    i = s.find('BUILTIN_CATS', i + 1)

# 五个常量表的定义块
for name in ['CAT_OF_TYPE', 'ALL_TYPE_KEYS', 'RESERVED_KEYS', 'FAMILY_OF_CAT', 'FAMILY_ORDER']:
    out.append('')
    out.append('=== %s ===' % name)
    for m in re.finditer(r'(?:var|const|let)\s+' + name + r'\s*=', s):
        out.append(s[m.start():m.start() + 900])
        break

# 迁移算法
out.append('')
out.append('=== migrateCatSchema / soleCategoryOfModel ===')
for name in ['migrateCatSchema', 'soleCategoryOfModel']:
    for m in re.finditer(r'function\s+' + name, s):
        out.append(s[max(0, m.start() - 200):m.start() + 1400])
        out.append('---')
        break

io.open(os.path.join(ROOT, 'tools/_r87_t03_probe.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
