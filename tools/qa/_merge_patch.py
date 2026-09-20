#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批次五字段线：把 _pb*.json 批次合并进 vocab-ext-fields-patch.json。

校验（任一不通过即拒绝落盘）：
  1. word 必须存在于 8 分片词库（2236 词）
  2. collocation 必须是非空字符串数组
  3. root 必须是字符串
  4. 同词不重复写入（patch 里已有则跳过，批次内重复也只取首条）
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'assets', 'data')
QADIR = os.path.join(ROOT, 'tools', 'qa')

# ---- 词库白名单 ----
idx = json.load(io.open(os.path.join(DATA, 'vocab-cet4-ext-index.json'), encoding='utf-8'))
valid = set()
for sh in idx['shards']:
    p = os.path.join(ROOT, *sh['file'].split('?')[0].split('/'))
    obj = json.load(io.open(p, encoding='utf-8'))
    for w in (obj['words'] if isinstance(obj, dict) else obj):
        valid.add(w['word'])

patch_path = os.path.join(DATA, 'vocab-ext-fields-patch.json')
patch = json.load(io.open(patch_path, encoding='utf-8'))
entries = patch['entries']
have = set(e['word'] for e in entries)

batches = sorted(f for f in os.listdir(QADIR) if re.fullmatch(r'_pb\d+\.json', f))
added, skipped_dup, bad = 0, 0, []
for fn in batches:
    arr = json.load(io.open(os.path.join(QADIR, fn), encoding='utf-8'))
    for e in arr:
        w = e.get('word', '')
        if w not in valid:
            bad.append('%s: 词不在词库内 -> %s' % (fn, w))
            continue
        if w in have:
            skipped_dup += 1
            continue
        if not isinstance(e.get('root', ''), str):
            bad.append('%s: root 非字符串 -> %s' % (fn, w))
            continue
        c = e.get('collocation')
        if not isinstance(c, list) or not c or not all(isinstance(x, str) and x.strip() for x in c):
            bad.append('%s: collocation 非法 -> %s' % (fn, w))
            continue
        entries.append({'word': w, 'root': e['root'], 'collocation': c})
        have.add(w)
        added += 1

if bad:
    sys.stdout.write('拒绝落盘，共 %d 处问题：\n  %s\n' % (len(bad), '\n  '.join(bad[:20])))
    sys.exit(2)

patch['entries'] = entries
patch['comment'] = '批次五 root/collocation 补丁，共 %d 条（a–i 930 条 + j–z 续补），剩余待补 %d 条' % (
    len(entries), 2236 - len(entries))
io.open(patch_path, 'w', encoding='utf-8').write(
    json.dumps(patch, ensure_ascii=False, indent=2))

print('合并批次: %s' % ','.join(batches))
print('新增 %d 条，重复跳过 %d 条，当前 patch 合计 %d 条，剩余待补 %d 条'
      % (added, skipped_dup, len(entries), 2236 - len(entries)))
