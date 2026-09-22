# -*- coding: utf-8 -*-
"""R165 服务端 3 文件：本地 vs 线上原文 差异速览（只读，不改任何东西）。

用途：决定是否随本轮同步 server/quota_ledger.py、server/routers/ai.py、
server/data/model_quota.json 到线上。
"""
import difflib
import json
import os

LOCAL = r'D:\下载的文件\学习工作台\server'
LIVE = r'D:\下载的文件\学习工作台\tools\_r165_srv_live\server'

PAIRS = [
    ('quota_ledger.py', os.path.join('quota_ledger.py')),
    ('routers/ai.py', os.path.join('routers', 'ai.py')),
    ('data/model_quota.json', os.path.join('data', 'model_quota.json')),
]


def read(p):
    with open(p, 'rb') as f:
        return f.read().decode('utf-8', 'replace').splitlines()


for rel, sub in PAIRS:
    lp = os.path.join(LOCAL, sub)
    rp = os.path.join(LIVE, sub)
    if not os.path.exists(rp):
        print('== %s : 线上原文缺失（未拉取），跳过' % rel)
        continue
    a, b = read(lp), read(rp)
    d = list(difflib.unified_diff(b, a, fromfile='LIVE/' + rel, tofile='LOCAL/' + rel, lineterm='', n=0))
    print('== %s : 本地 %d 行 / 线上 %d 行，diff 段 %d' % (rel, len(a), len(b), len(d)))
    shown = 0
    for line in d:
        if line.startswith('@@'):
            shown += 1
            if shown > 25:
                print('  ...（差异段过多，仅列前 25 段）')
                break
        print('  ' + line[:200])
    print()

# model_quota.json 额外做键级对比
try:
    lo = json.load(open(os.path.join(LOCAL, 'data', 'model_quota.json'), encoding='utf-8'))
    li = json.load(open(os.path.join(LIVE, 'data', 'model_quota.json'), encoding='utf-8'))
    lk = {k for k in lo if not str(k).startswith('_')}
    ik = {k for k in li if not str(k).startswith('_')}
    print('== model_quota.json 键级 ==')
    print('  仅本地有：', sorted(lk - ik))
    print('  仅线上有：', sorted(ik - lk))
    diff_vals = [k for k in sorted(lk & ik) if lo[k] != li[k]]
    print('  同键不同值：', diff_vals)
    for k in diff_vals[:10]:
        print('    %s\n      LOCAL=%s\n      LIVE =%s' % (k, lo[k], li[k]))
except Exception as exc:  # noqa: BLE001
    print('键级对比失败：%s' % exc)

print('\nRESULT: R165_SRV_DIFF_DONE')
