# -*- coding: utf-8 -*-
# R72 任务三：批量导航改名 dry-run（只统计，不写盘）
import os, re, io

BASE = r'D:\下载的文件\学习工作台'

EXPECT = {
    'AI.html': 1, 'blog_wechat.html': 2, 'PPT案例拆解.html': 1, 'PPT版式库.html': 1,
    '万能金句库.html': 1, '企业定向库.html': 1, '动态.html': 1, '商务礼仪.html': 1,
    '四级词汇.html': 1, '场景话术库.html': 1, '时政热点.html': 1, '工具.html': 1,
    '私聊.html': 1, '申论刷题.html': 1, '社区.html': 1, '英语.html': 1,
    '行测刷题.html': 1, '管理员.html': 1, '行测.html': 1, '面试题库.html': 1,
    '设置.html': 1, '错题本.html': 1, '面测.html': 1, '表达.html': 1, '更多.html': 1,
}

pat = re.compile(r'<div class="nav-item"([^>]*?)data-page="ppt"([^>]*?)>(.*?)</div>', re.S)

lines = []
for f, exp in EXPECT.items():
    p = os.path.join(BASE, f)
    txt = io.open(p, 'r', encoding='utf-8-sig', newline='').read()
    ms = pat.findall(txt)
    n = len(ms)
    has_yanshi = sum(1 for m in ms if '演示' in m[2])
    detail = ''
    if ms:
        detail = ms[0][2].strip().replace('\r', '').replace('\n', ' ')
    ok = (n == exp and has_yanshi == exp)
    lines.append('%s -> match=%d expect=%d with演示=%d %s' % (f, n, exp, has_yanshi, 'OK' if ok else 'FAIL'))
    if n:
        lines.append('    sample_inner=%r' % detail[:160])

open(os.path.join(BASE, 'tools', 'r72_nav_dryrun_out.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
print('\n'.join(lines))
