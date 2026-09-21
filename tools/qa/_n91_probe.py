# -*- coding: utf-8 -*-
"""N9-1/N9-2 复现：抽取 app.js 里各 INLINE_*_BANK 与内置 EXAM_BANK 的 type / sub 取值分布，
并对比 行测刷题.html 下拉框里实际提供的筛选项。结果落 UTF-8 文件。
"""
import os
import re
import json
import glob

ROOT = r'D:\下载的文件\学习工作台'
APP = os.path.join(ROOT, 'assets', 'app.js')

with open(APP, 'r', encoding='utf-8') as f:
    src = f.read()

out = []

# ---------- 1. 各 INLINE_*_BANK 的 type/sub 分布 ----------
banks = ['INLINE_QUANT_BANK', 'INLINE_JUDGE_BANK', 'INLINE_ZILIAO_BANK',
         'INLINE_YANYU_BANK', 'INLINE_CHANGSHI_BANK']
for b in banks:
    m = re.search(r'var\s+' + b + r'\s*=\s*(\[.*?\])\s*;', src, re.S)
    if not m:
        out.append('%s : NOT FOUND' % b)
        continue
    raw = m.group(1)
    try:
        data = json.loads(raw)
    except Exception as e:
        out.append('%s : JSON parse fail %s' % (b, e))
        continue
    types = {}
    subs = {}
    for q in data:
        types[q.get('type')] = types.get(q.get('type'), 0) + 1
        subs[q.get('sub')] = subs.get(q.get('sub'), 0) + 1
    out.append('%s : 共 %d 题' % (b, len(data)))
    out.append('   type 取值: %s' % json.dumps(types, ensure_ascii=False))
    out.append('   sub  取值(%d 种): %s' % (len(subs), json.dumps(subs, ensure_ascii=False)[:600]))

# ---------- 2. 内置 EXAM_BANK 的 type 分布（取 var EXAM_BANK = [ ... ]; 第一段） ----------
m = re.search(r'var\s+EXAM_BANK\s*=\s*(\[.*?\])\s*;', src, re.S)
if m:
    try:
        eb = json.loads(m.group(1))
        t = {}
        s = {}
        for q in eb:
            t[q.get('type')] = t.get(q.get('type'), 0) + 1
            s[q.get('sub')] = s.get(q.get('sub'), 0) + 1
        out.append('')
        out.append('内置 EXAM_BANK : 共 %d 题' % len(eb))
        out.append('   type 取值: %s' % json.dumps(t, ensure_ascii=False))
        out.append('   sub  取值: %s' % json.dumps(s, ensure_ascii=False))
    except Exception as e:
        out.append('内置 EXAM_BANK parse fail: %s' % e)
else:
    out.append('内置 EXAM_BANK : NOT FOUND')

# ---------- 3. 全文件所有 "type":"xxx" 取值（含异步分片兜底等） ----------
allt = {}
for mm in re.finditer(r'"type"\s*:\s*"([^"]*)"', src):
    k = mm.group(1)
    allt[k] = allt.get(k, 0) + 1
out.append('')
out.append('app.js 全文所有 "type":"..." 取值（前 40）:')
for k, v in sorted(allt.items(), key=lambda x: -x[1])[:40]:
    out.append('   %-16s %d' % (k, v))

# ---------- 4. 异步分片 json ----------
out.append('')
for p in sorted(glob.glob(os.path.join(ROOT, 'assets', 'data', 'exam-bank*.json'))):
    try:
        with open(p, 'r', encoding='utf-8') as f:
            d = json.load(f)
        items = d if isinstance(d, list) else d.get('questions', [])
        t = {}
        s = {}
        for q in items:
            t[q.get('type')] = t.get(q.get('type'), 0) + 1
            s[q.get('sub')] = s.get(q.get('sub'), 0) + 1
        out.append('%s : %d 题' % (os.path.basename(p), len(items)))
        out.append('   type: %s' % json.dumps(t, ensure_ascii=False))
    except Exception as e:
        out.append('%s : read fail %s' % (os.path.basename(p), e))

# ---------- 5. 行测刷题.html 下拉筛选项 ----------
out.append('')
p = os.path.join(ROOT, '行测刷题.html')
with open(p, 'r', encoding='utf-8') as f:
    h = f.read()
opts = re.findall(r'<option value="([^"]+)"', h)
out.append('行测刷题.html 下拉筛选项: %s' % json.dumps(opts, ensure_ascii=False))

with open(os.path.join(ROOT, 'tools', 'qa', '_n91_probe.out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
