# -*- coding: utf-8 -*-
"""改名/删页前置侦察：
① 动态.html / 朋友圈.html / 我的朋友圈.html / 朋友圈发布.html 的全站引用
② app.js 里的页面注册表（PAGE_FILES / nav）
③ 「查看其他用户个人资料」的落点
④ 个人中心.html 的「我的动态」入口
"""
import os, re

ROOT = r'D:\下载的文件\学习工作台'
out = []
def log(s=''):
    out.append(str(s))

SKIP_DIRS = {'.git', '.venv', 'node_modules', '__pycache__', '.tmp_eng', '_tmp_l3_qa',
             '_w2t1_img', '备份', '.page', 'android/libs', 'tools'}
SKIP_MARK = ('.bak', '.backup', '.orig', '~')

def walk(exts=('.html', '.js', '.py', '.css', '.json')):
    for dp, dns, fns in os.walk(ROOT):
        dns[:] = [d for d in dns if d not in SKIP_DIRS and not d.startswith('.')]
        for fn in fns:
            if any(m in fn for m in SKIP_MARK):
                continue
            if fn.endswith(exts):
                yield os.path.join(dp, fn)

FILES = list(walk())
log('扫描文件数 = %d' % len(FILES))
log('')

def scan(term, label):
    log('== %s  「%s」==' % (label, term))
    total = 0
    for fp in FILES:
        try:
            t = open(fp, 'rb').read().decode('utf-8', 'ignore')
        except Exception:
            continue
        if term in t:
            rel = os.path.relpath(fp, ROOT)
            # 硬引用 = 出现在 href/src/location 上下文
            hard = 0
            for m in re.finditer(re.escape(term), t):
                ctx = t[max(0, m.start() - 70): m.start() + 40]
                if re.search(r"href\s*=|src\s*=|location(\.href)?\s*=|location\.replace|\.assign|window\.open|['\"]" + re.escape(term), ctx):
                    hard += 1
            n = t.count(term)
            total += n
            log('  %-34s x%d (疑似硬引用 %d)' % (rel, n, hard))
    if total == 0:
        log('  ** 全站 0 命中 **')
    log('')

scan('动态.html', 'A1')
scan('朋友圈.html', 'A2')
scan('我的朋友圈.html', 'A3')
scan('朋友圈发布.html', 'A4')

# ---------- B) app.js 页面注册表 ----------
log('== B) app.js 里的页面注册条目（含"动态/朋友圈/moments"）==')
app = open(os.path.join(ROOT, 'assets', 'app.js'), 'rb').read().decode('utf-8', 'ignore')
for m in re.finditer(r"(page|file|url|href|path)\s*:\s*['\"]([^'\"]{0,40}(?:动态|朋友圈|moments)[^'\"]{0,40})['\"]", app):
    ln = app.count('\n', 0, m.start()) + 1
    seg = app[max(0, m.start() - 160): m.start() + 180].replace('\r', '')
    log('  :%d  %s' % (ln, seg.replace('\n', ' / ')[:330]))
log('')

log('== B2) app.js 内 PAGE_FILES 区块（前后 12 行）==')
m = re.search(r'PAGE_FILES', app)
if m:
    ln0 = app.count('\n', 0, m.start()) + 1
    lines = app.split('\n')
    for i in range(max(0, ln0 - 3), min(len(lines), ln0 + 40)):
        log('  %d: %s' % (i + 1, lines[i][:200]))
log('')

# ---------- C) 「查看其他用户个人资料」落点 ----------
log('== C) 「查看其他用户个人资料」的落点 ==')
PATS = ['用户资料', '个人资料', 'userProfile', 'UserProfile', 'showUserProfile',
        'imShowUserProfile', 'viewProfile', 'userInfo', '资料页', 'ta的主页', 'TA的主页']
for pat in PATS:
    hits = []
    for fp in FILES:
        try:
            t = open(fp, 'rb').read().decode('utf-8', 'ignore')
        except Exception:
            continue
        if pat in t:
            rel = os.path.relpath(fp, ROOT)
            hits.append('%s x%d' % (rel, t.count(pat)))
    log('  %-18s %s' % (pat, ' | '.join(hits[:8]) if hits else '**0**'))
log('')

log('== C2) 个人资料.html 相关独立页是否存在（好友资料页等）==')
for f in sorted(os.listdir(ROOT)):
    if f.endswith('.html') and re.search(r'资料|主页|profile', f, re.I):
        log('  %-30s %d B' % (f, os.path.getsize(os.path.join(ROOT, f))))
log('')

# ---------- D) 个人中心.html 的「我的动态」入口 ----------
log('== D) 个人中心.html 内「动态」相关行 ==')
pc = open(os.path.join(ROOT, '个人中心.html'), 'rb').read().decode('utf-8', 'ignore')
for m in re.finditer(r'动态', pc):
    ln = pc.count('\n', 0, m.start()) + 1
    seg = pc[max(0, m.start() - 170): m.start() + 150].replace('\r', '')
    log('  :%d  %s' % (ln, seg.replace('\n', ' / ')[:320]))
log('')

# ---------- E) xt-moments.js 内页面跳转 ----------
log('== E) assets/xt-moments.js 内 .html 引用 ==')
xm = open(os.path.join(ROOT, 'assets', 'xt-moments.js'), 'rb').read().decode('utf-8', 'ignore')
for h in sorted(set(re.findall(r"['\"]([^'\"]{1,30}\.html)", xm))):
    log('  %s  exists=%s' % (h, os.path.exists(os.path.join(ROOT, h))))
log('')

# ---------- F) 四个页面的 title / 面包屑 ----------
log('== F) 四个页面的 <title> 与 h1 标题 ==')
for f in ['动态.html', '朋友圈.html', '我的朋友圈.html', '朋友圈发布.html']:
    fp = os.path.join(ROOT, f)
    if not os.path.exists(fp):
        log('  %s MISSING' % f); continue
    t = open(fp, 'rb').read().decode('utf-8', 'ignore')
    ti = re.search(r'<title>([^<]{0,60})</title>', t)
    log('  %-18s title=%s' % (f, ti.group(1) if ti else '?'))

open(os.path.join(ROOT, 'tools', '_r73_rename2.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_rename2.txt')
