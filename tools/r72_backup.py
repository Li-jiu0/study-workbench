# -*- coding: utf-8 -*-
# R72 任务三：改动前备份（xxx.bak-pre-r72-20260917）
import os, shutil

BASE = r'D:\下载的文件\学习工作台'
SUF = '.bak-pre-r72-20260917'

FILES = [
    '学习工作台.html', '演示.html', '个人中心.html', '更多.html', '关于.html',
    '学习概括.html',
    'assets/app.js', 'assets/importer.js',
    # 批量改名覆盖的根 HTML
    'AI.html', 'blog_wechat.html', 'PPT案例拆解.html', 'PPT版式库.html',
    '万能金句库.html', '企业定向库.html', '动态.html', '商务礼仪.html',
    '四级词汇.html', '场景话术库.html', '时政热点.html', '工具.html',
    '私聊.html', '申论刷题.html', '社区.html', '英语.html', '行测刷题.html',
    '管理员.html', '行测.html', '面试题库.html', '设置.html', '错题本.html',
    '面测.html', '表达.html',
]

made = []
skipped = []
missing = []
for f in FILES:
    src = os.path.join(BASE, f)
    dst = src + SUF
    if not os.path.exists(src):
        missing.append(f); continue
    if os.path.exists(dst):
        skipped.append(f); continue
    shutil.copy2(src, dst)
    made.append(f)

out = []
out.append('made=%d' % len(made))
out.append('skipped=%d' % len(skipped))
out.append('missing=%s' % ','.join(missing))
out.append('MADE: ' + ','.join(made))
open(os.path.join(BASE, 'tools', 'r72_backup_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
