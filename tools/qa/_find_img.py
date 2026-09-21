# -*- coding: utf-8 -*-
import os, io, time
roots = [r'C:\Users\ATM\Downloads', r'C:\Users\ATM\Pictures', r'C:\Users\ATM\Desktop',
         r'C:\Users\ATM', r'D:\下载的文件\学习工作台', r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-88ed6fb3']
now = time.time()
hits = []
for rt in roots:
    if not os.path.isdir(rt):
        continue
    for dp, dn, fn in os.walk(rt):
        depth = dp[len(rt):].count(os.sep)
        if depth > 2:
            dn[:] = []
            continue
        if any(x in dp for x in ('node_modules', '.git', 'AppData')):
            continue
        for f in fn:
            low = f.lower()
            if low.endswith(('.png', '.jpg', '.jpeg')):
                p = os.path.join(dp, f)
                try:
                    m = os.path.getmtime(p)
                except Exception:
                    continue
                hits.append((m, p))
hits.sort(reverse=True)
out = ['近 24h 内（按修改时间倒序，最多 40 条）:']
cnt = 0
for m, p in hits:
    if time.time() - m > 86400 * 3:
        continue
    out.append('%s  %s' % (time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(m)), p))
    cnt += 1
    if cnt >= 40:
        break
if cnt == 0:
    out.append('（无）')
io.open(r'D:\下载的文件\学习工作台\tools\qa\_find_img_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
