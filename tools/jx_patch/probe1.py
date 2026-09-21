# -*- coding: utf-8 -*-
import json, io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TB  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JX  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"

# ---- step1: read INLINE_JUDGE_BANK ----
line = None
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'var INLINE_JUDGE_BANK' in ln:
            line = ln
            break
print("found line:", line is not None, "len:", len(line) if line else 0)
i = line.index('[')
j = line.rindex(']')
bank = json.loads(line[i:j+1])
print("bank len:", len(bank))
print("first:", json.dumps(bank[0], ensure_ascii=False)[:600])
print("last:", json.dumps(bank[-1], ensure_ascii=False)[:600])
ids = [b.get('id') for b in bank]
print("id min/max:", min(ids), max(ids), "unique:", len(set(ids)))
keys = set()
for b in bank[:50]:
    keys |= set(b.keys())
print("keys sample:", keys)

# ---- step2: 题本 ----
tb = json.load(open(TB, encoding='utf-8'))
print("\nTB len:", len(tb))
print("TB0:", json.dumps(tb[0], ensure_ascii=False)[:800])

# ---- step3: 解析 ----
jx = json.load(open(JX, encoding='utf-8'))
print("\nJX type:", type(jx), list(jx.keys()) if isinstance(jx, dict) else len(jx))
if isinstance(jx, dict):
    print("book/module/total:", jx.get('book'), jx.get('module'), jx.get('total'), "items:", len(jx.get('items', [])))
    it = jx['items'][0]
    print("JX item0:", json.dumps(it, ensure_ascii=False)[:1200])
