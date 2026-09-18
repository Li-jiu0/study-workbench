# -*- coding: utf-8 -*-
import json, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"
APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'INLINE_ZILIAO_BANK' in ln: line = ln; break
app = json.loads(line[line.find('['):line.rfind(']')+1])
appmap = {q['id']: q for q in app}
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
patch = json.load(open(rf'{OUT}\patch_ziliao.json', encoding='utf-8'))
a2t = {int(k): v for k, v in json.load(open(rf'{OUT}\_app2tb.json', encoding='utf-8')).items()}
AL = {int(k): v for k, v in json.load(open(rf'{OUT}\_tb2jx.json', encoding='utf-8')).items()}
items = patch['items']

missing = [q['id'] for q in app if str(q['id']) not in items]
print('missing app ids:', missing)
for i in missing:
    ti = a2t[i]; print(' tiben idx', ti, 'stem:', ''.join(tb[ti]['stem'])[:80])
    js = [AL[k] for k in sorted(AL) if abs(k-ti) < 6]
    print('  nearby jiexi:', js)

print()
print('=== shortest items ===')
short = sorted(items.items(), key=lambda kv: len(kv[1]))[:8]
for k, v in short:
    print('---', k, 'len', len(v))
    print(repr(v[:200]))

print()
print('=== evidence samples ===')
sample_ids = ['3905', '4405', '4563', '4838']
for sid in sample_ids:
    if sid not in items: continue
    q = appmap[int(sid)]
    stem = re.sub(r'\[IMG:[^\]]*\]', '', q['q'].split('\n', 1)[1] if '\n' in q['q'] else q['q']).replace('\n', '')
    print('ID', sid, '| 问题句:', stem[:40])
    print('   解析:', items[sid].replace('\n', '')[:80])
    print('   app答案', ['A','B','C','D'][q['a']])
