# -*- coding: utf-8 -*-
import json, io, sys, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TB  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JX  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"
tb = json.load(open(TB, encoding='utf-8'))['questions']
jx = json.load(open(JX, encoding='utf-8'))['items']

CN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}

def parse_jx_key(k):
    ch = sec = kd = 0
    diff = ''
    parts = k.split('_')
    head = parts[0]
    m = re.match(r'^第([一二三四五六七八九十]+)章', head)
    if m: ch = CN[m.group(1)]
    for p in parts[1:]:
        m = re.match(r'^第([一二三四五六七八九十]+)节', p)
        if m: sec = CN[m.group(1)]; continue
        m = re.match(r'^考点(\d+)', p)
        if m: kd = int(m.group(1)); continue
        if p in ('夯实基础','高难进阶','新考法'): diff = p
        elif p.startswith('卷'): diff = ''
    return ch, sec, kd, diff

def tb_key(q):
    g = q.get('group') or ''
    if g.startswith('卷'): g = ''
    kd = q.get('kdian') or 0
    return (q['chapter'], q.get('section') or 0, kd, g)

tbc = collections.Counter(tb_key(q) for q in tb)
jxc = collections.Counter(parse_jx_key(x['section_key']) for x in jx)

allk = sorted(set(tbc) | set(jxc))
print(f"{'key':<28}{'TB':>5}{'JX':>5}")
bad = 0
for k in allk:
    a, b = tbc.get(k, 0), jxc.get(k, 0)
    flag = '' if a == b else '  <<<'
    if a != b: bad += 1
    print(f"{str(k):<28}{a:>5}{b:>5}{flag}")
print("\nmismatch keys:", bad, "/", len(allk))
print("TB total", sum(tbc.values()), "JX total", sum(jxc.values()))

# check JX raw section_key variety for chapter1
print("\n--- JX chapter1 section_key 明细 ---")
for k, c in collections.Counter(x['section_key'] for x in jx if x['chapter']=='第一章图形推理').most_common():
    print("   ", k, c, parse_jx_key(k))
print("\n--- JX chapter1 pian/section/point 分布 ---")
sub = [x for x in jx if x['chapter']=='第一章图形推理']
print("pian:", collections.Counter(x['pian'] for x in sub).most_common())
print("section:", collections.Counter(x['section'] for x in sub).most_common())
print("point:", collections.Counter(x['point'] for x in sub).most_common())
print("tb_key:", collections.Counter(x['tb_key'] for x in sub).most_common())
