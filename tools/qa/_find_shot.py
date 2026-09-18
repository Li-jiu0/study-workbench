# -*- coding: utf-8 -*-
"""在常见临时目录里找用户刚粘贴的截图（近 90 分钟内修改过的图片）"""
import os, time, io

ROOTS = [
    os.path.expanduser('~'),
    r'C:\Users\ATM\AppData\Local\Temp',
    r'C:\Users\ATM\Downloads',
    r'C:\Users\ATM\Pictures',
    r'C:\Users\ATM\Desktop',
    r'C:\Users\ATM\.workbuddy',
    r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-88ed6fb3',
    r'D:\下载的文件\学习工作台',
]
now = time.time()
LIMIT = 90 * 60
hits = []
for root in ROOTS:
    if not os.path.isdir(root):
        continue
    for dp, dn, fn in os.walk(root):
        depth = dp[len(root):].count(os.sep)
        if depth >= 3:
            dn[:] = []
            continue
        if 'node_modules' in dp or os.sep + '.git' in dp:
            continue
        for f in fn:
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                p = os.path.join(dp, f)
                try:
                    m = os.path.getmtime(p)
                except Exception:
                    continue
                if now - m <= LIMIT:
                    hits.append((m, p, os.path.getsize(p)))
hits.sort(reverse=True)
out = ['近 90 分钟内修改的图片（按时间倒序，前 30 条）：']
for m, p, sz in hits[:30]:
    out.append('%s  %8d bytes  %s' % (time.strftime('%H:%M:%S', time.localtime(m)), sz, p))
if len(out) == 1:
    out.append('（未找到）')
io.open(r'D:\下载的文件\学习工作台\tools\qa\_find_shot_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('FIND_OK')
