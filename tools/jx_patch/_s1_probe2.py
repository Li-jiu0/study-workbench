# -*- coding: utf-8 -*-
import json, sys, io, collections, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"

with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'INLINE_ZILIAO_BANK' in ln:
            line = ln; break
arr = json.loads(line[line.find('['):line.rfind(']')+1])
print('app', len(arr))
print('sub dist', collections.Counter(q['sub'] for q in arr))
# first-line distribution
c = collections.Counter()
long_q = 0
for q in arr:
    qs = q['q']
    first = qs.split('\n')[0][:20]
    c[first] += 1
    if len(qs) > 200: long_q += 1
print('q len>200:', long_q)
print('top first-lines:', c.most_common(12))
print('=== samples with long q ===')
n = 0
for q in arr:
    if len(q['q']) > 200:
        print('---id', q['id'], 'sub', q['sub'], 'len', len(q['q']))
        print(repr(q['q'][:400]))
        print('  o=', q['o'], 'a=', q['a'])
        n += 1
        if n >= 3: break
print()
print('=== random samples ===')
for q in arr[100:104] + arr[500:503]:
    print('---id', q['id'], 'sub', q['sub'], 'diff', q['diff'])
    print(repr(q['q'][:300]))
    print('  o=', q['o'], 'a=', q['a'])

# tiben
tb = json.load(open(TIBEN, encoding='utf-8'))
print('\ntiben type', type(tb), list(tb.keys())[:10] if isinstance(tb, dict) else len(tb))
items = tb['questions'] if isinstance(tb, dict) and 'questions' in tb else tb
print('tiben items', len(items))
it = items[0]
for k, v in it.items():
    print(' ', k, '=', repr(v)[:300])
print('\nmaterials sample:')
mats = tb.get('materials') if isinstance(tb, dict) else None
if mats:
    print(type(mats), len(mats))
    ks = list(mats)[:3] if isinstance(mats, dict) else None
    if ks:
        for k in ks:
            print(' ', k, '=>', repr(mats[k])[:400])
