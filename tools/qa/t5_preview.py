# -*- coding: utf-8 -*-
"""任务五：对若干可疑文件做「改前/改后」行级预览（只读）。"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('t5a', os.path.join(os.path.dirname(os.path.abspath(__file__)), 't5_apply.py'))
t5a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t5a)

ROOT = r'D:\下载的文件\学习工作台'
WATCH = ['assets/topic-express.js', 'assets/data-exam-company.js', 'assets/chat-local.js',
         'assets/mini-cet.js', 'assets/mini-comm.js', 'assets/mini-exam.js',
         'assets/mini-interview.js', 'assets/mini-ppt.js', 'assets/ai-page.js',
         'assets/ai-presets.js', 'assets/roleplay.js', 'assets/qbank.js',
         'assets/app.js', 'assets/api.js', '四级经验分享.html', '更多.html', '设置.html']

out = []
for rel in WATCH:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        out.append('!! MISSING %s' % rel)
        continue
    with io.open(p, 'r', encoding='utf-8', errors='replace', newline='') as f:
        src = f.read()
    orig = src
    for txt, name in t5a.PROTECT:
        src = src.replace(txt, t5a.TOK[name])
    for a, b in t5a.PRE_RULES:
        src = src.replace(a, b)
    for a, b in t5a.FILE_RULES:
        src = src.replace(a, b)
    for a, b in t5a.TEXT_RULES:
        src = src.replace(a, b)
    for txt, name in t5a.PROTECT:
        src = src.replace(t5a.TOK[name], txt)
    if src == orig:
        out.append('--- %s : (无变化)' % rel)
        continue
    ol = orig.split('\n')
    nl = src.split('\n')
    out.append('========== %s' % rel)
    if len(ol) != len(nl):
        out.append('   !! 行数变化 %d -> %d' % (len(ol), len(nl)))
    n = 0
    for i in range(min(len(ol), len(nl))):
        if ol[i] != nl[i]:
            n += 1
            if n > 12:
                out.append('   ...(其余省略，共 %d 行变化)' % sum(1 for j in range(min(len(ol), len(nl))) if ol[j] != nl[j]))
                break
            a = ol[i].strip()
            b = nl[i].strip()
            if len(a) > 200:
                idx = 0
                while idx < min(len(a), len(b)) and a[idx] == b[idx]:
                    idx += 1
                a = '…' + a[max(0, idx - 90):idx + 90]
                b = '…' + b[max(0, idx - 90):idx + 90]
            out.append('   L%d - %s' % (i + 1, a))
            out.append('   L%d + %s' % (i + 1, b))
    out.append('')

with io.open(os.path.join(ROOT, 'tools', 'qa', 't5_preview.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE')
