#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批次五字段线：把 patch 的 root/collocation 合并进 8 个分片。

流程：备份 → 按 word 填字段 → 校验（词数 2236 / 无重复 / 字段齐全 /
与备份逐条比对：除 root·collocation 外一律不变）→ 写回（每条词单行紧凑格式）。
"""
import io
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'assets', 'data')
BAK = os.path.join(DATA, '_bak_shard_0913e')

idx_path = os.path.join(DATA, 'vocab-cet4-ext-index.json')
idx = json.load(io.open(idx_path, encoding='utf-8'))
shard_files = [sh['file'].split('?')[0] for sh in idx['shards']]

patch = json.load(io.open(os.path.join(DATA, 'vocab-ext-fields-patch.json'), encoding='utf-8'))
pmap = {e['word']: e for e in patch['entries']}

os.makedirs(BAK, exist_ok=True)

total = 0
problems = []
for rel in shard_files:
    name = os.path.basename(rel)
    path = os.path.join(ROOT, *rel.split('/'))
    raw = open(path, 'rb').read().decode('utf-8-sig')
    obj = json.loads(raw)
    words = obj['words']

    bak_path = os.path.join(BAK, name)
    if not os.path.exists(bak_path):          # 已存在备份不覆盖
        shutil.copy2(path, bak_path)
    old = json.load(io.open(bak_path, encoding='utf-8'))['words']
    if len(old) != len(words):
        problems.append('%s: 词数与备份不一致' % name)

    seen = set()
    for i, w in enumerate(words):
        wd = w['word']
        if wd in seen:
            problems.append('%s: 重复词 %s' % (name, wd))
        seen.add(wd)
        e = pmap.get(wd)
        if not e:
            problems.append('%s: patch 缺词 %s' % (name, wd))
            continue
        w['root'] = e['root']
        w['collocation'] = e['collocation']
        # 除 root/collocation 外必须与备份完全一致
        for k in ('word', 'phonetic', 'meaning', 'synonym', 'antonym', 'example', 'example2'):
            if w.get(k) != old[i].get(k):
                problems.append('%s: %s 第 %d 条字段 %s 被改动' % (name, wd, i, k))

    total += len(words)
    body = ',\n'.join('    ' + json.dumps(w, ensure_ascii=False, separators=(',', ':')) for w in words)
    out = '{\n  "version": %s,\n  "comment": %s,\n  "words": [\n%s\n  ]\n}\n' % (
        json.dumps(obj['version'], ensure_ascii=False),
        json.dumps(obj['comment'], ensure_ascii=False), body)
    # 写回前再解析一次，坏了拒绝落盘
    if len(json.loads(out)['words']) != len(words):
        problems.append('%s: 写回前解析词数不符' % name)
        continue
    open(path, 'wb').write(out.encode('utf-8'))

# 全局校验
allw = []
for rel in shard_files:
    obj = json.load(io.open(os.path.join(ROOT, *rel.split('/')), encoding='utf-8'))
    allw += obj['words']
empty_root = [w['word'] for w in allw if not w.get('root')]
empty_coll = [w['word'] for w in allw if not w.get('collocation')]
dups = len(allw) - len(set(w['word'] for w in allw))

msg = [
    '合并分片: %d 个，词条合计 %d' % (len(shard_files), len(allw)),
    'root 空: %d 条  collocation 空: %d 条  重复 word: %d' % (len(empty_root), len(empty_coll), dups),
    '问题: ' + ('无 ✅' if not problems else ''),
]
msg += ['  - ' + p for p in problems[:20]]
print('\n'.join(msg))
io.open(os.path.join(ROOT, 'tools', 'qa', '_merge_shards_report.txt'), 'w', encoding='utf-8').write('\n'.join(msg))
sys.exit(2 if (problems or empty_root or empty_coll or dups or len(allw) != 2236) else 0)
