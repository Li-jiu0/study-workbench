# -*- coding: utf-8 -*-
"""R11f 附带核对：前端可选模型的 provider 分布 vs 限额表覆盖率。"""
import json, io, re, collections

ROOT = r'D:\下载的文件\学习工作台'
q = json.load(io.open(ROOT + r'\server\data\model_quota.json', encoding='utf-8'))
cfg = io.open(ROOT + r'\assets\ai-config.js', encoding='utf-8').read()

items = re.findall(r'\{\s*id:\s*"([^"]+)"[^}]*?provider:\s*"([^"]+)"', cfg, re.S)
prov = dict(items)
print('解析到 builtinModels 条目 =', len(items))

have = [k for k in prov if k in q]
miss = [k for k in prov if k not in q]
print('有额度登记 =', len(have), ' 无登记 =', len(miss))
print()
print('【无额度登记】按 provider 分组：')
for p, n in sorted(collections.Counter(prov[k] for k in miss).items()):
    print('  %-14s %2d  个：%s' % (p, n, '、'.join(sorted(k for k in miss if prov[k] == p))))
print()
print('【有额度登记】按 provider 分组：')
for p, n in sorted(collections.Counter(prov[k] for k in have).items()):
    print('  %-14s %2d' % (p, n))
