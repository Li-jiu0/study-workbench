# -*- coding: utf-8 -*-
import json, io, sys, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TBF = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JXF = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"
tb = json.load(open(TBF, encoding='utf-8'))['questions']
jx = json.load(open(JXF, encoding='utf-8'))['items']
CN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
def jch(x):
    m = re.match(r'^第([一二三四五六七八九十]+)章', x.get('chapter') or '')
    return CN[m.group(1)] if m else 0

print("=== TB 第1章 前 36 条 ===")
for i, q in enumerate([q for q in tb if q['chapter'] == 1][:36]):
    st = re.sub(r'\s+', '', ''.join(q['stem']))[:28]
    print(f" {i:2d} qid={q['qid']:<3} pg={q['page']:<4} ans={q['answer']} src={q.get('source')} sk={q['section_key']:<22} {st}")

print("\n=== JX 第1章 前 20 条 ===")
for i, x in enumerate([x for x in jx if jch(x) == 1][:20]):
    a = re.sub(r'\s+', '', (x.get('analysis') or ''))[:46]
    print(f" {i:2d} qid={x['qid']:<3} raw={x['qid_raw']:<3} blk={x['block']} pg={x['page']:<4} ans={x['answer']} sk={x['section_key'][:34]:<36} {a}")

# 用第2/3/4章的 1:1 段估计 page 偏移曲线
print("\n=== 章节首尾 page 对照（按 1:1 位置配对，粗略） ===")
for ch in (1, 2, 3, 4):
    T = [q for q in tb if q['chapter'] == ch]
    J = [x for x in jx if jch(x) == ch]
    print(f" 第{ch}章 TB page {T[0]['page']}..{T[-1]['page']}   JX page {J[0]['page']}..{J[-1]['page']}")
