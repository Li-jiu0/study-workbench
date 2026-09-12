# -*- coding: utf-8 -*-
import os, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_dir = os.path.join(root, 'assets', 'data')

problems = []
# 1) vocab
vp = os.path.join(data_dir, 'vocab-cet4-ext.json')
v = json.load(open(vp, encoding='utf-8'))
words = [w['word'] for w in v['words']]
if len(words) != len(set(words)):
    problems.append('vocab 内部有重复 word')
# 与内置 466 去重
existing = set(w.strip() for w in open(os.path.join(root, '_existing_words.txt'), encoding='utf-8') if w.strip())
overlap = set(words) & existing
if overlap:
    problems.append('vocab 与内置重复: %s' % list(overlap)[:10])
# 字段结构检查
need = {'word', 'phonetic', 'meaning', 'root', 'collocation', 'synonym', 'antonym', 'example', 'example2'}
for w in v['words']:
    miss = need - set(w.keys())
    if miss:
        problems.append('vocab 字段缺失 %s in %s' % (miss, w.get('word')))
        break

# 2) exam 分片
exam_files = sorted(fn for fn in os.listdir(data_dir) if fn.startswith('exam-bank-ext-') and fn.endswith('.json'))
all_ids = []
all_qcount = 0
for fn in exam_files:
    d = json.load(open(os.path.join(data_dir, fn), encoding='utf-8'))
    qs = d['questions']
    all_qcount += len(qs)
    for q in qs:
        all_ids.append(q['id'])
        # a 必须是合法索引
        if not (isinstance(q.get('a'), int) and 0 <= q['a'] < len(q.get('o', []))):
            problems.append('%s id=%s 答案索引非法' % (fn, q.get('id')))
        # 必含字段
        for f in ('id', 'type', 'sub', 'diff', 'q', 'o', 'a', 'x', 'tip'):
            if f not in q:
                problems.append('%s id=%s 缺字段 %s' % (fn, q.get('id'), f))
if len(all_ids) != len(set(all_ids)):
    problems.append('exam id 跨文件重复: %s' % [i for i in all_ids if all_ids.count(i) > 1][:10])
if min(all_ids) < 101:
    problems.append('exam 存在 id<101')

# 3) listening
lp = os.path.join(data_dir, 'listening-ext.json')
l = json.load(open(lp, encoding='utf-8'))
scenes = l.get('scenes', {})
for k, sc in scenes.items():
    if 't' not in sc or 'lines' not in sc:
        problems.append('listening 场景 %s 结构异常' % k)
    for ln in sc['lines']:
        if 'en' not in ln or 'zh' not in ln:
            problems.append('listening 场景 %s 行缺 en/zh' % k)
            break

# 4) 所有 JSON 合法性（重新 load 一次）
for fn in ['vocab-cet4-ext.json'] + exam_files + ['listening-ext.json']:
    json.load(open(os.path.join(data_dir, fn), encoding='utf-8'))

# 5) 再跑一次 scan（仅看 ext 是否零命中）
import subprocess
r = subprocess.run(['python', os.path.join(root, 'tools', 'qa', 'scan_question_leak.py')],
                   capture_output=True, text=True)
scan_lines = [l for l in r.stdout.splitlines() if 'exam-bank-ext-图形推理' in l or '结果' in l]
ext_pass = all('通过' in l for l in scan_lines if '图形推理' in l)

summary = {
    'vocab_words': len(words),
    'vocab_overlap_with_existing': len(overlap),
    'exam_files': len(exam_files),
    'exam_questions': all_qcount,
    'exam_id_range': '%d-%d' % (min(all_ids), max(all_ids)),
    'listening_scenes': len(scenes),
    'listening_lines': sum(len(s['lines']) for s in scenes.values()),
    'ext_graph_leak_pass': ext_pass,
    'problems': problems,
}
open(os.path.join(root, '_verify.log'), 'w', encoding='utf-8').write(
    'SUMMARY=' + json.dumps(summary, ensure_ascii=False) + '\n')
