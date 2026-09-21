# -*- coding: utf-8 -*-
"""批次八：把 worktree 的前端改动同步到部署源，并统一 bump 版本戳到 20260915c。
只同步 *.html 与 assets/，绝不碰部署源的 server/ 与 tools/。
"""
import os, re, io, sys, glob, shutil

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SRC = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
DST = r'D:\下载的文件\学习工作台'
NEW_V = '20260915c'
OLD_VS = ('20260915b', '20260915a', '20260914f', '20260914e', '20260914d')

if os.path.abspath(SRC) == os.path.abspath(DST):
    raise SystemExit('SRC 与 DST 相同，拒绝执行')

# ---------- 1. 同步 html ----------
htmls = [p for p in glob.glob(os.path.join(SRC, '*.html'))]
copied_h = 0
for p in htmls:
    fn = os.path.basename(p)
    if fn in ('blog_wechat.html',):     # 不上线
        continue
    shutil.copy2(p, os.path.join(DST, fn))
    copied_h += 1
print('同步 html: %d 个' % copied_h)

# ---------- 2. 同步 assets ----------
src_a = os.path.join(SRC, 'assets')
dst_a = os.path.join(DST, 'assets')
n_a = 0
for root, dirs, files in os.walk(src_a):
    rel = os.path.relpath(root, src_a)
    out = dst_a if rel == '.' else os.path.join(dst_a, rel)
    os.makedirs(out, exist_ok=True)
    for fn in files:
        if not fn.endswith(('.js', '.css', '.json', '.png')):
            continue
        shutil.copy2(os.path.join(root, fn), os.path.join(out, fn))
        n_a += 1
print('同步 assets: %d 个文件' % n_a)

# ---------- 3. bump 版本戳 ----------
pat = re.compile(r'\?v=(%s)' % '|'.join(OLD_VS))
total = 0
files_hit = []
for p in glob.glob(os.path.join(DST, '*.html')):
    with open(p, encoding='utf-8') as f:
        s = f.read()
    s2, n = pat.subn('?v=' + NEW_V, s)
    if n:
        with open(p, 'w', encoding='utf-8') as f:
            f.write(s2)
        total += n
        files_hit.append((os.path.basename(p), n))
print('\nbump 版本戳 -> %s：共 %d 处，涉及 %d 个文件' % (NEW_V, total, len(files_hit)))
for fn, n in sorted(files_hit, key=lambda x: -x[1])[:15]:
    print('   %-24s %d' % (fn, n))

# ---------- 4. 残留旧版本号检查 ----------
leftover = {}
for v in OLD_VS:
    c = 0
    for p in glob.glob(os.path.join(DST, '*.html')):
        with open(p, encoding='utf-8') as f:
            c += f.read().count('?v=' + v)
    if c:
        leftover[v] = c
print('\n旧版本戳残留:', leftover or '无（0 处）✅')

# ---------- 5. 关键文件存在性 ----------
must = [
    os.path.join(DST, '申论刷题.html'),
    os.path.join(DST, 'assets', 'data', 'shenlun-inline.js'),
    os.path.join(DST, 'assets', 'data', 'shenlun-questions.json'),
    os.path.join(DST, 'assets', 'app.js'),
    os.path.join(DST, 'assets', 'chat-local.js'),
    os.path.join(DST, 'assets', 'icon-map.js'),
    os.path.join(DST, 'assets', 'subpage-router.js'),
    os.path.join(DST, 'data', 'mock-papers.js'),
]
print('\n关键文件校验:')
for m in must:
    print('   %-52s %s' % (os.path.relpath(m, DST), 'OK' if os.path.exists(m) else '缺失 ❌'))
print('\nDONE')
