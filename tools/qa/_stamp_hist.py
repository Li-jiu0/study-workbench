# -*- coding: utf-8 -*-
"""查 blog_wechat.html 的版本戳历史：本轮改动前后各是什么"""
import io, os, subprocess

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_stamp_hist.txt')
L = []

def git(a):
    p = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false'] + a, capture_output=True)
    try: return p.stdout.decode('utf-8')
    except Exception: return p.stdout.decode('gbk', errors='replace')

# HEAD 版本里的戳
old = git(['show', 'HEAD:blog_wechat.html'])
L.append('== HEAD (a60c42f) 里的 blog_wechat.html 戳 ==')
for line in old.splitlines():
    if '?v=' in line and 'assets/' in line:
        L.append('  ' + line.strip())

# 历史各版本
L.append('')
L.append('== 该文件最近 5 次提交 ==')
L.append(git(['log', '--oneline', '-5', '--', 'blog_wechat.html']))

# 当前磁盘
L.append('')
L.append('== 当前磁盘 worktree ==')
cur = io.open(os.path.join(ROOT, 'blog_wechat.html'), encoding='utf-8', errors='replace').read()
for line in cur.splitlines():
    if '?v=' in line and 'assets/' in line:
        L.append('  ' + line.strip())

# 全站 aaa 畸形戳普查
L.append('')
L.append('== 全站畸形戳普查（?v= 值里含 aaa 或长度异常）==')
import re
bad = []
for f in sorted(os.listdir(ROOT)):
    if not f.lower().endswith('.html'):
        continue
    s = io.open(os.path.join(ROOT, f), encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'assets/([A-Za-z0-9_\-\.]+)\?v=([0-9a-zA-Z]+)', s):
        st = m.group(2)
        if 'aaa' in st or not re.match(r'^2026\d{4}[a-z]?$', st):
            bad.append('%s :: %s -> %s' % (f, m.group(1), st))
L.append('  ' + ('\n  '.join(bad) if bad else '无'))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('HIST_OK')
