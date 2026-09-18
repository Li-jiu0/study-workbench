# -*- coding: utf-8 -*-
"""任务五：交付前全量校验。"""
import io
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_verify.txt')
out = []

def rd(p, mode=''):
    with io.open(p, 'r', encoding='utf-8', errors='replace', newline=mode) as f:
        return f.read()


def allfiles():
    res = []
    for n in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, n)
        if os.path.isfile(p) and n.lower().endswith('.html'):
            res.append(p)
    ad = os.path.join(ROOT, 'assets')
    for n in sorted(os.listdir(ad)):
        p = os.path.join(ad, n)
        if os.path.isfile(p) and n.lower().endswith('.js'):
            res.append(p)
    return res


files = allfiles()

# ---------- 1. 文件重命名结果 ----------
out.append('=== 1. 文件重命名结果 ===')
for old, new in [('学习博客.html', '社区.html'), ('四级备考.html', '英语.html'),
                 ('央国企笔试.html', '行测.html'), ('高情商表达.html', '表达.html'),
                 ('商务礼仪面试.html', '面测.html'), ('PPT训练.html', '演示.html')]:
    out.append('  旧 %-16s 存在=%-5s | 新 %-10s 存在=%s'
               % (old, os.path.exists(os.path.join(ROOT, old)),
                  new, os.path.exists(os.path.join(ROOT, new))))
for keep in ['行测刷题.html', '商务礼仪.html', '四级词汇.html', '面试题库.html']:
    out.append('  保留 %-16s 存在=%s' % (keep, os.path.exists(os.path.join(ROOT, keep))))
out.append('')

# ---------- 2. 旧文件名残留 ----------
out.append('=== 2. 旧文件名残留（文件名引用，目标=0）===')
OLD_FILES = ['学习博客.html', '四级备考.html', '央国企笔试.html', '高情商表达.html',
             '商务礼仪面试.html', 'PPT训练.html']
tot = 0
for of in OLD_FILES:
    for p in files:
        c = rd(p)
        if of in c:
            n = c.count(of)
            tot += n
            out.append('  !! %s : %s x%d' % (of, os.path.relpath(p, ROOT), n))
out.append('  旧文件名残留合计 = %d' % tot)
out.append('')

# ---------- 3. 旧展示名残留（排除保护项） ----------
out.append('=== 3. 旧展示名残留（不含受保护项）===')
PROTECTED = ['互动广场', '笔记广场', '文化广场', '现沿广场', '社区广场',
             '某市中心广场', '文旅项目大广场', '四级备考四步法', '英语四级备考']
OLD_TEXT = ['商务礼仪及面试', '商务礼仪面试', '高情商表达', '四级备考', '央国企笔试', 'PPT 训练', 'PPT训练']
tot2 = 0
for ot in OLD_TEXT:
    for p in files:
        c = rd(p)
        for m in re.finditer(re.escape(ot), c):
            ls = c.rfind('\n', 0, m.start()) + 1
            le = c.find('\n', m.start())
            if le == -1:
                le = len(c)
            ln = c[ls:le]
            if any(pk in ln for pk in PROTECTED):
                continue
            tot2 += 1
            out.append('  !! [%s] %s:%d | %s' % (ot, os.path.relpath(p, ROOT),
                                                 c.count('\n', 0, m.start()) + 1, ln.strip()[:160]))
out.append('  旧展示名残留合计 = %d' % tot2)
out.append('')

# 广场残留（应只剩受保护的）
out.append('=== 3b. 「广场」残存（应均为受保护项）===')
cnt = {}
for p in files:
    c = rd(p)
    for m in re.finditer('广场', c):
        ls = c.rfind('\n', 0, m.start()) + 1
        le = c.find('\n', m.start())
        if le == -1:
            le = len(c)
        ln = c[ls:le]
        ok = any(pk in ln for pk in PROTECTED)
        key = 'OK-受保护' if ok else '!!未受保护'
        cnt[key] = cnt.get(key, 0) + 1
        if not ok:
            out.append('  !! %s:%d | %s' % (os.path.relpath(p, ROOT),
                                            c.count('\n', 0, m.start()) + 1, ln.strip()[:160]))
for k in sorted(cnt):
    out.append('  %s : %d' % (k, cnt[k]))
out.append('')

# ---------- 4. 死链扫描 ----------
out.append('=== 4. 死链扫描（站内 .html 引用 -> 文件不存在）===')
existing = set(n for n in os.listdir(ROOT) if n.lower().endswith('.html'))
dead = 0
checked = 0
for p in files:
    c = rd(p)
    for m in re.finditer(r'''['"(\s]([\u4e00-\u9fa5A-Za-z0-9_\-]+\.html)''', c):
        name = m.group(1)
        checked += 1
        if name not in existing:
            dead += 1
            out.append('  !! %s 引用不存在文件 %s' % (os.path.relpath(p, ROOT), name))
out.append('  检查引用 %d 条，死链 = %d' % (checked, dead))
out.append('')

# ---------- 5. 换行符复核 ----------
out.append('=== 5. 换行符复核（CRLF/LF 不得混变）===')
bad = []
saw = {}
for p in files:
    with io.open(p, 'rb') as f:
        b = f.read()
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n') - crlf
    k = 'CRLF' if lf == 0 and crlf > 0 else ('LF' if crlf == 0 and lf > 0 else 'MIXED')
    saw.setdefault(k, []).append(os.path.relpath(p, ROOT))
    if k == 'MIXED':
        bad.append(os.path.relpath(p, ROOT))
for k in sorted(saw):
    out.append('  %s : %d 个文件' % (k, len(saw[k])))
out.append('  MIXED 文件: %s' % (', '.join(bad) if bad else '无'))
out.append('')

# ---------- 6. recentMap / HOME_DEF ----------
out.append('=== 6. app.js HOME_DEF 与 recentMap ===')
app = rd(os.path.join(ROOT, 'assets', 'app.js')).split('\n')
for i, ln in enumerate(app):
    if 'var HOME_DEF' in ln:
        for j in range(i, min(i + 9, len(app))):
            out.append('  %d: %s' % (j + 1, app[j][:200]))
        break
for i, ln in enumerate(app):
    if 'var recentMap' in ln:
        for j in range(i, min(i + 6, len(app))):
            out.append('  %d: %s' % (j + 1, app[j][:200]))
        break
out.append('')

# ---------- 7. 新名出现次数 ----------
out.append('=== 7. 新名统计 ===')
for nt in ['社区.html', '英语.html', '行测.html', '表达.html', '面测.html', '演示.html']:
    c = sum(rd(p).count(nt) for p in files)
    out.append('  %-12s : %d' % (nt, c))
for nt in ['社区', '英语', '行测', '面测', '演示']:
    c = sum(rd(p).count(nt) for p in files)
    out.append('  文案 %-8s : %d' % (nt, c))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
