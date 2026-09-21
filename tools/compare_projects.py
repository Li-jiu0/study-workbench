# -*- coding: utf-8 -*-
"""对比两个项目的关键文件（排除 .venv/backups/uploads/缓存/工具）"""
import os, hashlib

A = r'D:\下载的文件\学习工作台'
B = r'D:\下载的文件\学习工作台(2)'

SKIP_DIRS = {'.venv', 'node_modules', '__pycache__', '.git', '.vs',
             'backups', 'uploads', '.codebuddy', '.workbuddy', 'tools',
             '备份', 'ai-server', 'server\\.venv'}
SKIP_EXTS = {'.pyc', '.pyo', '.log', '.tmp', '.bak', '.db', '.db-journal',
             '.db-wal', '.db-shm', '.keystore', '.aar', '.jar', '.png', '.jpg',
             '.jpeg', '.gif', '.ico', '.webp', '.apk', '.mp3', '.wav', '.zip'}

def collect(root):
    out = {}
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            ext = os.path.splitext(fn)[1].lower()
            if ext in SKIP_EXTS:
                continue
            fp = os.path.join(dp, fn)
            rel = os.path.relpath(fp, root).replace('\\', '/')
            try:
                with open(fp, 'rb') as f:
                    data = f.read()
                out[rel] = (len(data), hashlib.md5(data).hexdigest())
            except Exception as e:
                out[rel] = (-1, 'ERR:' + str(e))
    return out

fa = collect(A)
fb = collect(B)

only_a = sorted(set(fa) - set(fb))
only_b = sorted(set(fb) - set(fa))
both = sorted(set(fa) & set(fb))
diff = [f for f in both if fa[f][1] != fb[f][1]]
same = [f for f in both if fa[f][1] == fb[f][1]]

print('===== 当前项目独有 (only in 学习工作台) =====')
for f in only_a:
    print('  ', f, fa[f][0])
print()
print('===== (2) 独有 (only in 学习工作台(2)) —— 需要合并 =====')
for f in only_b:
    print('  ', f, fb[f][0])
print()
print('===== 同名但内容不同 (diff) =====')
for f in diff:
    print('  ', f, 'A=%d B=%d' % (fa[f][0], fb[f][0]))
print()
print('===== 同名且相同 (same) =====', len(same), '个文件')
print()
print('统计: 当前独有=%d, (2)独有=%d, 同名不同=%d, 同名相同=%d' % (len(only_a), len(only_b), len(diff), len(same)))
