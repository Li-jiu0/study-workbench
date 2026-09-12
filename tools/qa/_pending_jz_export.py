#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批次五字段线：导出 j-z 待补词表（从 8 分片取全量，剔除 patch 已有）。"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'assets', 'data')

idx = json.load(io.open(os.path.join(DATA, 'vocab-cet4-ext-index.json'), encoding='utf-8'))
words = []
for sh in idx['shards']:
    f = sh['file'].split('?')[0]
    p = os.path.join(ROOT, *f.split('/'))
    obj = json.load(io.open(p, encoding='utf-8'))
    arr = obj['words'] if isinstance(obj, dict) else obj
    for w in arr:
        words.append(w['word'])

patch = json.load(io.open(os.path.join(DATA, 'vocab-ext-fields-patch.json'), encoding='utf-8'))
done = set(e['word'] for e in patch['entries'])

pending = [w for w in words if w not in done]
jz = [w for w in pending if w and w[0].lower() >= 'j']

out = [
    '分片总词数: %d' % len(words),
    'patch 已覆盖: %d' % len(done),
    '待补总数: %d' % len(pending),
    '其中 j-z: %d' % len(jz),
    '',
]
cur = None
for w in sorted(jz, key=lambda s: s.lower()):
    c = w[0].lower()
    if c != cur:
        out.append('=== %s ===' % c)
        cur = c
    out.append(w)
io.open(os.path.join(ROOT, 'tools', 'qa', '_pending_jz.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out[:6]))
