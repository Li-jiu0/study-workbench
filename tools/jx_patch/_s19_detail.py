# -*- coding: utf-8 -*-
import json, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
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
a2t = {int(k): v for k, v in json.load(open(r'D:\下载的文件\学习工作台\tools\jx_patch\_app2tb.json', encoding='utf-8')).items()}
AL = {int(k): v for k, v in json.load(open(r'D:\下载的文件\学习工作台\tools\jx_patch\_tb2jx.json', encoding='utf-8')).items()}

# verify app options == tiben options order
L = ['A','B','C','D']
mism = 0
for aid, ti in a2t.items():
    q = appmap[aid]; o = q['o']
    to = tb[ti]['options']
    exp = [to.get(k, '') for k in L]
    if o != exp: mism += 1
print('app options mismatch vs tiben options:', mism, '/', len(a2t))

cases = [176, 179, 669, 689, 531, 610]
for ti in cases:
    ji = AL.get(ti)
    aid = next((a for a, t in a2t.items() if t == ti), None)
    print('=' * 70)
    print('tiben idx', ti, 'app id', aid, 'jiexi idx', ji)
    print('STEM:', ''.join(tb[ti]['stem'])[:100])
    print('TB options:', tb[ti]['options'])
    if aid: print('APP options:', appmap[aid]['o'], 'app ans idx', appmap[aid]['a'], '->', L[appmap[aid]['a']])
    print('TB answer:', tb[ti]['answer'], '| JX answer:', jx[ji]['answer'] if ji is not None else None)
    print('ANALYSIS:', jx[ji]['analysis'].replace('\n', ' ')[:600])
