# -*- coding: utf-8 -*-
"""blog_wechat.html 版本戳对齐：把过期/畸形戳改成全站当前值（只改这一个文件）"""
import io, os, re, glob as _g

ROOT = r'D:\下载的文件\学习工作台'
TARGET = 'blog_wechat.html'
OUT = os.path.join(ROOT, 'tools', 'qa', '_wechat_stamp_out.txt')

def rd(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8', errors='replace').read()

# 1) 全站各资源的最新戳（取出现次数最多的那个值）
latest = {}
for f in os.listdir(ROOT):
    if not f.lower().endswith('.html') or f == TARGET:
        continue
    s = rd(f)
    for asset, st in re.findall(r'assets/([A-Za-z0-9_\-]+\.(?:js|css))\?v=([0-9a-zA-Z]+)', s):
        latest.setdefault(asset, {}).setdefault(st, 0)
        latest[asset][st] += 1
best = {}
for a, d in latest.items():
    best[a] = max(d.items(), key=lambda kv: (kv[1], len(kv[0])))[0]

s = rd(TARGET)
pairs = re.findall(r'(assets/[A-Za-z0-9_\-]+\.(?:js|css))\?v=([0-9a-zA-Z]+)', s)
L = ['== %s 版本戳对齐 ==' % TARGET]
changes = []
for path, st in pairs:
    asset = path.split('/')[-1]
    cur = best.get(asset)
    if cur is None:
        L.append('  - %-26s %-14s (全站无对照，保持不动)' % (asset, st))
        continue
    if st == cur:
        L.append('  = %-26s %-14s 已是最新' % (asset, st))
    else:
        changes.append((path, st, cur))
        L.append('  x %-26s %-14s -> %s' % (asset, st, cur))

if changes:
    new = s
    for path, old, cur in changes:
        new = new.replace('%s?v=%s' % (path, old), '%s?v=%s' % (path, cur))
    io.open(os.path.join(ROOT, TARGET), 'w', encoding='utf-8', newline='') .write(new)
    L.append('')
    L.append('已写回 %s，替换 %d 处' % (TARGET, len(changes)))
else:
    L.append('')
    L.append('无需改动')

# 复核
s2 = rd(TARGET)
L.append('')
L.append('== 复核（残留非最新戳）==')
rest = []
for asset, st in sorted(set(re.findall(r'assets/([A-Za-z0-9_\-]+\.(?:js|css))\?v=([0-9a-zA-Z]+)', s2))):
    cur = best.get(asset)
    if cur and st != cur:
        rest.append('%s=%s(最新%s)' % (asset, st, cur))
L.append('  ' + (', '.join(rest) if rest else '无'))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('STAMP_FIX_DONE')
