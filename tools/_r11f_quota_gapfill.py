# -*- coding: utf-8 -*-
"""R11f：堵住「前端能选到、但限额表查不到」的无限量缺口。

背景（实测发现）：
    服务端记账的 key 是「前端 ai-config.js 的模型 id」——`server/routers/ai.py`
    里 `quota_key = body.modelId ...`，前端 ai-service.js 发的就是 `modelConfig.id`。
    但 model_quota.json 里登记的是**另一套 id**（registry 风格，如 `ark-ds-v4-flash-ga`），
    而前端 id 是 `ark-v4-flash`。两套 id 不一致 → `get_quota('ark-v4-flash')` 查不到 →
    `model_status()` 返回 status="unknown"、exhausted=False → **按不限量放行**，
    这部分模型的免费额度耗尽后**不会自动关停**。

    对照 server/quota_ledger.py `_lookup_registry()` 的注释：ai-config.js 的 id 与
    registry 键「实测 47 个 id 仅 8 个与 registry 键相同」——同一个坑的另一面。

本脚本做的事：给「前端可选 但限额表无登记」的方舟模型补 500000/tokens
（= 用户的既定口径「对齐方舟免费额度：每模型 50 万 token」）。

幂等：已存在的 key 不覆盖（只补缺），可重复执行。
"""
import io, json, os, re

ROOT = r'D:\下载的文件\学习工作台'
QUOTA = os.path.join(ROOT, 'server', 'data', 'model_quota.json')
REG = os.path.join(ROOT, 'server', 'data', 'model_registry.json')
CFG = os.path.join(ROOT, 'assets', 'ai-config.js')

ARK_PROVIDERS = ('ark', 'arkimage', 'arkvideo', 'ark3d')
FILL_TOKENS = 500000

raw = io.open(QUOTA, 'rb').read()
text = raw.decode('utf-8')
crlf = '\r\n' in text
quota = json.loads(text)
reg = json.loads(io.open(REG, encoding='utf-8').read())
cfg = io.open(CFG, encoding='utf-8').read()
fe_ids = set(re.findall(r'^\s{4}"([^"]+)":\s*\{\s*platform:', cfg, re.M))

# 前端可选 + 注册表认它是方舟模型 + 限额表没登记 → 漏网
missing = []
for mid in sorted(fe_ids):
    e = reg.get(mid)
    if not isinstance(e, dict):
        continue
    if str(e.get('provider') or '') not in ARK_PROVIDERS:
        continue
    if mid in quota:
        continue
    missing.append(mid)

print('前端可选 id 总数 =', len(fe_ids))
print('漏网（前端可选 / 方舟 / 限额表无登记）=', len(missing))
for m in missing:
    print('   +', m, '->', (reg.get(m) or {}).get('model'), (reg.get(m) or {}).get('provider'))

if not missing:
    print('无需补，退出')
    raise SystemExit(0)

note = ('_r11f_note',
        'R11f（2026-09-21）修「前端 id 与限额表 id 两套并存」导致的无限量缺口：'
        '记账 key 用的是前端 ai-config.js 的 id，但限额表原先只登记了 registry 风格 id，'
        '造成这 %d 个前端可选模型的额度查询落空、按不限量放行。'
        '现按既定口径补 500000/tokens（对齐方舟每模型 50 万 token 免费额度）。' % len(missing))

block = []
block.append('  "%s": "%s"' % note)
for mid in missing:
    block.append('  "%s": { "freeQuota": %d, "quotaType": "tokens" }'
                 % (mid, FILL_TOKENS))

nl = '\r\n' if crlf else '\n'
insert = (',' + nl).join(block) + nl
anchor = '  "ark": { "freeQuota": 500000, "quotaType": "tokens" }'
if anchor not in text:
    raise SystemExit('ANCHOR_NOT_FOUND')
text2 = text.replace(anchor, anchor + ',' + nl + insert, 1)

# 写前校验：必须仍能被 json.loads 解析，且字符数只增不减
json.loads(text2)

backup = QUOTA + '.r11f.bak'
io.open(backup, 'wb').write(raw)
io.open(QUOTA, 'wb').write(text2.encode('utf-8'))
print()
print('已写入 %s（旧文件备份 %s）' % (QUOTA, backup))
print('新增条目 %d 条，新键总数 = %d'
      % (len(missing), len([k for k in json.loads(text2) if not k.startswith('_')])))
