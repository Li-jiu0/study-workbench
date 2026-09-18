# -*- coding: utf-8 -*-
"""任务五：旧名命中清单扫描（只读，不改文件）。"""
import os
import re
import io

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_hits.txt')

OLD_TERMS = [
    '商务礼仪面试',
    '商务礼仪',
    '高情商表达',
    '表达',
    '四级备考',
    '央国企笔试',
    'PPT训练',
    '广场',
]

# 需要排除的目录
SKIP_DIRS = {'node_modules', '.git', 'tools', 'assets_bak'}

def list_files():
    res = []
    # 根目录 html
    for name in os.listdir(ROOT):
        p = os.path.join(ROOT, name)
        if os.path.isfile(p) and name.lower().endswith('.html'):
            res.append(p)
    # assets js
    adir = os.path.join(ROOT, 'assets')
    if os.path.isdir(adir):
        for name in os.listdir(adir):
            p = os.path.join(adir, name)
            if os.path.isfile(p) and name.lower().endswith('.js'):
                res.append(p)
    return sorted(res)

def main():
    lines = []
    files = list_files()
    lines.append('FILES_SCANNED=%d' % len(files))
    lines.append('')
    for term in OLD_TERMS:
        total = 0
        kept = 0
        per_file = []
        for p in files:
            with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            rel = os.path.relpath(p, ROOT)
            hits = []
            for m in re.finditer(re.escape(term), content):
                start = m.start()
                line_no = content.count('\n', 0, start) + 1
                line_start = content.rfind('\n', 0, start) + 1
                line_end = content.find('\n', start)
                if line_end == -1:
                    line_end = len(content)
                ctx = content[line_start:line_end].strip()
                if len(ctx) > 220:
                    ctx = ctx[:220] + '...'
                prefix = content[max(0, start - 6):start]
                hits.append((line_no, ctx, prefix))
            if not hits:
                continue
            for (ln, ctx, prefix) in hits:
                total += 1
                flag = ''
                if term == '广场' and prefix.endswith('互动'):
                    flag = 'KEEP-互动'
                    kept += 1
                elif term == '广场' and prefix.endswith('笔记'):
                    flag = 'KEEP-笔记'
                    kept += 1
                per_file.append('  %s:%d  %s | %s' % (rel, ln, flag, ctx))
        lines.append('==== TERM: %s | TOTAL=%d KEEP=%d WILL_CHANGE=%d' % (term, total, kept, total - kept))
        lines.extend(per_file)
        lines.append('')
    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('WROTE', OUT)

if __name__ == '__main__':
    main()
