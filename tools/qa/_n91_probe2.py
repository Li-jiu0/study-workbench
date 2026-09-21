# -*- coding: utf-8 -*-
"""N9-1/N9-2 复现（第二轮）：内置 EXAM_BANK 的 type 口径 + 站内对题型名的硬编码依赖。"""
import os
import re
import json

ROOT = r'D:\下载的文件\学习工作台'
APP = os.path.join(ROOT, 'assets', 'app.js')
with open(APP, 'r', encoding='utf-8') as f:
    src = f.read()

out = []

# 内置 EXAM_BANK（type: 'xxx' 单引号写法）
m = re.search(r'const\s+EXAM_BANK\s*=\s*(\[.*?\n\];)', src, re.S)
if m:
    block = m.group(1)
    types = {}
    for mm in re.finditer(r"type\s*:\s*'([^']*)'", block):
        types[mm.group(1)] = types.get(mm.group(1), 0) + 1
    out.append('内置 EXAM_BANK type 取值（口径 A）: %s' % json.dumps(types, ensure_ascii=False))
    subs = {}
    for mm in re.finditer(r"sub\s*:\s*'([^']*)'", block):
        subs[mm.group(1)] = subs.get(mm.group(1), 0) + 1
    out.append('内置 EXAM_BANK sub 取值: %s' % json.dumps(subs, ensure_ascii=False))
else:
    out.append('内置 EXAM_BANK 未匹配')

out.append('')
out.append('=== app.js 里出现硬编码题型名的地方（前 60 处，看是否依赖 type 字面量）===')
names = ['判断推理', '常识判断', '图形推理', '定义判断', '类比推理', '逻辑判断', '言语理解', '数量关系', '资料分析']
cnt = 0
for ln_no, ln in enumerate(src.split('\n'), 1):
    if 'EXAM_BANK = [' in ln or 'INLINE_' in ln:
        continue
    for n in names:
        if n in ln:
            s = ln.strip()
            if len(s) > 160:
                s = s[:160] + ' …'
            out.append('  L%-5d [%s] %s' % (ln_no, n, s))
            cnt += 1
            break
    if cnt >= 60:
        break

with open(os.path.join(ROOT, 'tools', 'qa', '_n91_probe2.out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
