# -*- coding: utf-8 -*-
import json, io, re
from collections import Counter, OrderedDict

APP    = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"

IMG = re.compile(r'\[IMG:[^\]]*\]'); WS = re.compile(r'\s+')
def fp(s, n=60): return WS.sub('', IMG.sub('', str(s or '')))[:n]
def find_bank(p, v):
    for line in io.open(p, encoding='utf-8'):
        i = line.find('var ' + v + ' =')
        if i >= 0:
            s = line.index('[', i); e = line.rindex(']')
            return json.loads(line[s:e+1])
bank = find_bank(APP, 'INLINE_YANYU_BANK')
tb = json.load(io.open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(io.open(JIEXI, encoding='utf-8'))['items']

print('### 题本 分组(按出现顺序) ###')
TG = []
for i, t in enumerate(tb):
    k = (t.get('chapter'), t.get('node'), str(t.get('node_title') or '').strip(), str(t.get('difficulty') or '').strip())
    if TG and TG[-1][0] == k: TG[-1][1].append(i)
    else: TG.append((k, [i]))
for n, (k, v) in enumerate(TG):
    print('%2d  C%s N%-3s %-28s %-8s  n=%-4d idx %d-%d' % (n, k[0], k[1], k[2][:28], k[3], len(v), v[0], v[-1]))

print('\n### 解析 分组(按出现顺序) ###')
JG = []
for i, t in enumerate(jx):
    k = (str(t.get('chapter') or ''), str(t.get('point') or ''), str(t.get('difficulty') or ''))
    if JG and JG[-1][0] == k: JG[-1][1].append(i)
    else: JG.append((k, [i]))
for n, (k, v) in enumerate(JG):
    print('%2d  %-14s %-28s %-8s  n=%-4d idx %d-%d' % (n, k[0][:14], k[1][:28], k[2], len(v), v[0], v[-1]))

print('\n### 题本 全部 distinct (chapter,node,node_title) ###')
for k, c in sorted(Counter((t.get('chapter'), t.get('node'), str(t.get('node_title') or '').strip()) for t in tb).items(), key=lambda x: (int(x[0][0]), int(x[0][1]))):
    print('  C%s N%-3s %-34s n=%d' % (k[0], k[1], k[2][:34], c))
print('\n### 解析 全部 distinct (chapter,point) ###')
for k, c in sorted(Counter((str(t.get('chapter') or ''), str(t.get('point') or '')) for t in jx).items(), key=lambda x: -x[1]):
    print('  %-14s %-34s n=%d' % (k[0][:14], k[1][:34], c))

# app 未匹配样本
pool = {}
for i, t in enumerate(tb): pool.setdefault(fp(''.join(t.get('stem') or [])), []).append(i)
used = set(); un = []
for b in bank:
    c = [i for i in pool.get(fp(b['q']), []) if i not in used]
    if c: used.add(c[0])
    else: un.append(b)
print('\n### app 未匹配:', len(un), 'id 段', un[0]['id'] if un else '-', '-', un[-1]['id'] if un else '-')
for b in un[:2]:
    print('--- app id', b['id'], 'sub', b.get('sub'), repr(b['q'][:150]))
free = [i for i in range(len(tb)) if i not in used]
print('题本空闲 idx 数:', len(free), '前10:', free[:10])
for i in free[:2]:
    print('--- tb idx', i, 'C%s N%s' % (tb[i].get('chapter'), tb[i].get('node')), repr(''.join(tb[i].get('stem') or [])[:150]))
print('未匹配 app sub 分布:', Counter(b.get('sub') for b in un))
print('空闲题本 chapter 分布:', Counter(tb[i].get('chapter') for i in free))
