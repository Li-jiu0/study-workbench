# -*- coding: utf-8 -*-
import json, io, sys, os, re

APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"

def find_bank(path, varname):
    with io.open(path, 'r', encoding='utf-8') as f:
        for line in f:
            i = line.find('var ' + varname + ' =')
            if i >= 0:
                s = line.index('[', i)
                e = line.rindex(']')
                return json.loads(line[s:e+1])
    return None

bank = find_bank(APP, 'INLINE_YANYU_BANK')
print('APP bank count:', None if bank is None else len(bank))
if bank:
    print('APP keys:', list(bank[0].keys()))
    print('APP first:', json.dumps(bank[0], ensure_ascii=False)[:600])
    ids = [b['id'] for b in bank]
    print('APP id range:', min(ids), max(ids), 'unique', len(set(ids)))
    empty_x = sum(1 for b in bank if not (b.get('x') or '').strip())
    print('APP empty x:', empty_x)

tb = json.load(io.open(TIBEN, encoding='utf-8'))
print('\nTIBEN count:', len(tb), 'keys:', list(tb[0].keys()))
print('TIBEN first:', json.dumps(tb[0], ensure_ascii=False)[:900])

jx = json.load(io.open(JIEXI, encoding='utf-8'))
print('\nJIEXI top keys:', list(jx.keys()), 'total', jx.get('total'), 'items', len(jx.get('items', [])))
it0 = jx['items'][0]
print('JIEXI item keys:', list(it0.keys()))
print('JIEXI first:', json.dumps(it0, ensure_ascii=False)[:1200])

# section_key / block 分布
from collections import Counter
print('\nJIEXI section_key sample:', Counter(str(i.get('section_key'))[:60] for i in jx['items']).most_common(8))
print('JIEXI block sample:', Counter(str(i.get('block'))[:60] for i in jx['items']).most_common(8))
print('JIEXI answer empty:', sum(1 for i in jx['items'] if not str(i.get('answer') or '').strip()))
print('TIBEN chapter sample:', Counter(str(i.get('chapter'))[:40] for i in tb).most_common(8))
print('TIBEN node sample:', Counter(str(i.get('node'))[:40] for i in tb).most_common(8))
print('TIBEN section sample:', Counter(str(i.get('section'))[:40] for i in tb).most_common(8))
print('TIBEN answer sample:', Counter(str(i.get('answer'))[:10] for i in tb).most_common(12))
print('JIEXI answer sample:', Counter(str(i.get('answer'))[:10] for i in jx['items']).most_common(12))
