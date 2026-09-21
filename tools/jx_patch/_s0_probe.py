# -*- coding: utf-8 -*-
import json, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"

# ---- app.js : find INLINE_ZILIAO_BANK line ----
line = None
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for i, ln in enumerate(f, 1):
        if 'INLINE_ZILIAO_BANK' in ln:
            print('hit line', i, 'len', len(ln), 'head:', repr(ln[:200]))
            line = ln
            break

s = line.find('[')
e = line.rfind(']')
arr = json.loads(line[s:e+1])
print('app count', len(arr))
print('keys sample', list(arr[0].keys()))
ids = [q['id'] for q in arr]
print('id min/max', min(ids), max(ids))
for q in arr[:2]:
    print('-----', q['id'])
    for k, v in q.items():
        r = repr(v)
        print(' ', k, '=', r[:300])
