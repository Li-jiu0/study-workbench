# -*- coding: utf-8 -*-
import json, io, sys, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TB  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JX  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"

line = None
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'var INLINE_JUDGE_BANK' in ln:
            line = ln; break
bank = json.loads(line[line.index('['):line.rindex(']')+1])
tb = json.load(open(TB, encoding='utf-8'))['questions']
jx = json.load(open(JX, encoding='utf-8'))['items']

print("app sub:", collections.Counter(b['sub'] for b in bank).most_common())
print("app diff:", collections.Counter(b['diff'] for b in bank).most_common())
IMG = re.compile(r'\[IMG:([^\]]+)\]')

def imgs(txt):
    return tuple(m.strip() for m in IMG.findall(txt or ''))

n_app_img = sum(1 for b in bank if imgs(b['q']))
print("app 含IMG:", n_app_img, "/", len(bank))
print("app 含IMG by sub:", collections.Counter(b['sub'] for b in bank if imgs(b['q'])).most_common())
n_tb_img = sum(1 for q in tb if q.get('images'))
print("tb 含images:", n_tb_img, "/", len(tb))
print("tb 含images by chapter_name:", collections.Counter(q['chapter_name'] for q in tb if q.get('images')).most_common())

# TB 文件顺序校验
pages = [q.get('page') or 0 for q in tb]
print("\nTB page 非降序:", all(pages[i] <= pages[i+1] for i in range(len(pages)-1)), "range", min(pages), max(pages))
jpages = [x.get('page') or 0 for x in jx]
print("JX page 非降序:", all(jpages[i] <= jpages[i+1] for i in range(len(jpages)-1)), "range", min(jpages), max(jpages))

# JX 分块（按 section_key 连续段）
def blocks(seq, keyf):
    out = []
    prev = None
    for it in seq:
        k = keyf(it)
        if k != prev:
            out.append([k, 0, []])
            prev = k
        out[-1][1] += 1
        out[-1][2].append(it)
    return out

for ch, name in [(1,'图形推理'),(2,'定义判断'),(3,'类比推理'),(4,'逻辑判断')]:
    tsub = [q for q in tb if q['chapter'] == ch]
    jsub = [x for x in jx if x['chapter'].startswith('第' + '一二三四'[ch-1] + '章')]
    print(f"\n===== 第{ch}章 {name}  TB {len(tsub)}  JX {len(jsub)} =====")
    bt = blocks(tsub, lambda q: q['section_key'])
    bj = blocks(jsub, lambda x: x['section_key'])
    print(" TB blocks:", [(k, n) for k, n, _ in bt])
    print("       sum:", sum(n for _, n, _ in bt))
    print(" JX blocks:", [(k, n) for k, n, _ in bj])
    print("       sum:", sum(n for _, n, _ in bj))

# 指纹碰撞检查
def fp(txt):
    s = re.sub(r'\[IMG:[^\]]*\]', '', txt or '')
    s = re.sub(r'\s+', '', s)
    return s[:60]

afp = collections.Counter(fp(b['q']) for b in bank)
tfp = collections.Counter(fp(''.join(q['stem'])) for q in tb)
print("\napp 指纹重复数:", sum(1 for k, v in afp.items() if v > 1), "涉及题数:", sum(v for k, v in afp.items() if v > 1))
print("tb  指纹重复数:", sum(1 for k, v in tfp.items() if v > 1), "涉及题数:", sum(v for k, v in tfp.items() if v > 1))
print("app top dup:", afp.most_common(5))
