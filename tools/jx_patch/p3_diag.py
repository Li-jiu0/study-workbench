# -*- coding: utf-8 -*-
import json, io, re
from collections import Counter

APP    = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"

IMG = re.compile(r'\[IMG:[^\]]*\]'); WS = re.compile(r'\s+')
def fp(s, n=60):
    return WS.sub('', IMG.sub('', str(s or '')))[:n]

def find_bank(path, varname):
    with io.open(path, 'r', encoding='utf-8') as f:
        for line in f:
            i = line.find('var ' + varname + ' =')
            if i >= 0:
                s = line.index('[', i); e = line.rindex(']')
                return json.loads(line[s:e+1])
bank = find_bank(APP, 'INLINE_YANYU_BANK')
tb = json.load(io.open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(io.open(JIEXI, encoding='utf-8'))['items']

# ---- A. qid 序列 ----
tq = [int(t['qid']) for t in tb]
jq = [int(i['qid']) for i in jx]
print('题本 qid: min', min(tq), 'max', max(tq), 'unique', len(set(tq)), '严格递增:', all(tq[i] < tq[i+1] for i in range(len(tq)-1)))
print('解析 qid: min', min(jq), 'max', max(jq), 'unique', len(set(jq)), '严格递增:', all(jq[i] < jq[i+1] for i in range(len(jq)-1)))
print('解析 qid_raw 严格递增:', all(int(i['qid_raw']) <= int(jx[i+1]['qid_raw']) for i in range(len(jx)-1)))

def jx_ans(it):
    a = str(it.get('answer') or '').strip().upper()
    if a: return a[0]
    m = re.findall(r'故正确答案为\s*([A-D])', str(it.get('analysis') or ''))
    return m[-1] if m else ''

# ---- B. qid==qid 直接映射的 answer 一致率 ----
jmap = {int(i['qid']): i for i in jx}
agree = 0; tot = 0
for t in tb:
    it = jmap.get(int(t['qid']))
    if it is None: continue
    ta = str(t.get('answer') or '').strip().upper()[:1]; ja = jx_ans(it)
    if not ta or not ja: continue
    tot += 1; agree += (ta == ja)
print('\nqid==qid 映射 一致率: %d/%d = %.4f' % (agree, tot, agree/max(tot,1)))

# 分章节看一致率(找断点)
CN = {'一':1,'二':2,'三':3,'四':4}
def cnum(n):
    m = re.match(r'\s*第([一二三四])章', str(n or '')); return CN.get(m.group(1)) if m else None
per = {}
for t in tb:
    it = jmap.get(int(t['qid']))
    if it is None: continue
    ta = str(t.get('answer') or '').strip().upper()[:1]; ja = jx_ans(it)
    if not ta or not ja: continue
    k = int(t.get('chapter') or 0)
    a_, b_ = per.get(k, (0,0)); per[k] = (a_ + (ta == ja), b_ + 1)
print('分章一致率:', {k: '%d/%d=%.2f' % (v[0], v[1], v[0]/v[1]) for k, v in sorted(per.items())})

# 滑动窗口一致率,找断点
win = 50
lows = []
for s in range(0, len(tb) - win, 25):
    a_ = 0; b_ = 0
    for t in tb[s:s+win]:
        it = jmap.get(int(t['qid']))
        if it is None: continue
        ta = str(t.get('answer') or '').strip().upper()[:1]; ja = jx_ans(it)
        if not ta or not ja: continue
        b_ += 1; a_ += (ta == ja)
    if b_: lows.append((s, round(a_/b_, 2)))
print('滑动窗口(起点,一致率):', lows[:60])

# ---- C. app 未匹配样本 ----
pool = {}
for i, t in enumerate(tb): pool.setdefault(fp(''.join(t.get('stem') or [])), []).append(i)
used = set(); un = []
for b in bank:
    c = [i for i in pool.get(fp(b['q']), []) if i not in used]
    if c: used.add(c[0])
    else: un.append(b)
print('\napp 未匹配数:', len(un))
for b in un[:3] + un[-2:]:
    print('--- app id', b['id'], 'sub', b.get('sub'), 'a', b.get('a'))
    print('   q[:120]:', repr(b['q'][:120]))
print('未匹配 id 段:', un[0]['id'], '-', un[-1]['id'])
print('题本未被使用 idx 段(前10):', [i for i in range(len(tb)) if i not in used][:10],
      '共', len(tb) - len(used))
for i in [i for i in range(len(tb)) if i not in used][:3]:
    print('--- tb idx', i, 'chap', tb[i].get('chapter'), 'node', tb[i].get('node'), 'sec', tb[i].get('section'))
    print('   stem[:120]:', repr(''.join(tb[i].get('stem') or [])[:120]))
