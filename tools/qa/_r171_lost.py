# -*- coding: utf-8 -*-
"""R171 预检深化：对被标「生产有本地无」的 5 个 server 文件，产出真实 unified diff，
并只抽出「会从生产消失的行」（- 行），逐条判定是否属功能删除。

判定法：若某条 prod-only 行在**本地文件里整行等价存在**（忽略缩进），则只是行被挪位/重排；
若本地确实没有等价行，则标记 LOST 让人复核。
"""
import difflib
import io
import os
import re

ROOT = r"D:\下载的文件\学习工作台"
LIVE = os.path.join(ROOT, 'tools', '_r171_srv_live')

FILES = ['server/main.py', 'server/routers/admin.py', 'server/routers/auth.py',
         'server/routers/friends.py', 'server/routers/moments.py',
         'server/routers/social.py', 'server/routers/users.py', 'server/routers/chat.py',
         'server/routers/groups.py', 'server/database.py', 'server/security.py']


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


out = []
lost_total = 0
for rel in FILES:
    lp = os.path.join(ROOT, rel.replace('/', os.sep))
    rp = os.path.join(LIVE, rel[len('server/'):].replace('/', os.sep))
    if not os.path.exists(rp):
        out.append('== %s : 生产侧文件缺失，跳过' % rel)
        continue
    L = io.open(lp, encoding='utf-8', errors='replace').read().splitlines()
    R = io.open(rp, encoding='utf-8', errors='replace').read().splitlines()
    d = list(difflib.unified_diff(R, L, fromfile='PROD', tofile='LOCAL', lineterm='', n=1))
    removed = [l[1:] for l in d if l.startswith('-') and not l.startswith('---')]
    added = [l[1:] for l in d if l.startswith('+') and not l.startswith('+++')]
    Ln = {norm(x) for x in L}
    An = {norm(x) for x in added}
    LOST, MOVED = [], []
    for r in removed:
        n = norm(r)
        if not n:
            continue
        if n in Ln:
            MOVED.append(r)
        else:
            LOST.append(r)
    out.append('== %s : prod %d 行 / local %d 行 ; 移除 %d / 新增 %d ; 等价挪位 %d ; **真丢失 %d**'
               % (rel, len(R), len(L), len(removed), len(added), len(MOVED), len(LOST)))
    for x in LOST:
        out.append('   LOST: ' + x.strip()[:190])
    lost_total += len(LOST)
out.append('')
out.append('LOS T_TOTAL=%d' % lost_total)
io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_lost_lines.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
print('LOST_TOTAL=%d' % lost_total)
