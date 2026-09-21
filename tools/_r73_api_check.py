# -*- coding: utf-8 -*-
"""核查 api.js 双写是否互相覆盖 + 行尾 + 关键文案/删除项在位情况"""
import os, re, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
PY = r'C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe'
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'

out = []

def log(s=''):
    out.append(str(s))

# ---------- 1) api.js 行尾 + 关键词 ----------
p = os.path.join(ROOT, 'assets', 'api.js')
raw = open(p, 'rb').read()
crlf = raw.count(b'\r\n'); lf = raw.count(b'\n')
log('== assets/api.js ==')
log('  size=%d  CRLF=%d  LF_total=%d  bare_LF=%d  CR=%d' % (len(raw), crlf, lf, lf - crlf, raw.count(b'\r')))
txt = raw.decode('utf-8-sig', 'replace')

kws = ['帖子数据统计', '博客数据统计',
       '多人在线：资料保存在服务器数据库', '打开任意页面即开始计时',
       '私聊.html', '学习工作台.html']
for k in kws:
    n = txt.count(k)
    hits = []
    if n:
        for m in re.finditer(re.escape(k), txt):
            ln = txt.count('\n', 0, m.start()) + 1
            hits.append(ln)
    log('  [%s] count=%d lines=%s' % (k, n, hits[:12]))

# ---------- 2) 其它被多线写过的文件行尾 ----------
log('')
log('== 其它关键文件行尾 ==')
for rel in ['assets/chat-local.js', 'assets/admin-contact.js', 'assets/app.js',
            'assets/importer.js', 'assets/xt-profile.js', 'assets/xt-profile.css',
            'assets/xt-moments.js', 'assets/xt-moments.css', 'assets/voiceplayer.js',
            'assets/xt-android.js', 'assets/ai-page.js', 'assets/ai-service.js',
            'server/routers/moments.py', 'server/routers/friends.py', 'server/routers/auth.py',
            'server/rate_limit.py', 'server/routers/admin.py']:
    fp = os.path.join(ROOT, rel)
    if not os.path.exists(fp):
        log('  %-34s MISSING' % rel); continue
    b = open(fp, 'rb').read()
    c = b.count(b'\r\n'); l = b.count(b'\n')
    bom = b[:3] == b'\xef\xbb\xbf'
    kind = 'CRLF' if (l and c == l) else ('LF' if c == 0 else 'MIXED')
    log('  %-34s %-6s CR=%-6d LF=%-6d bare=%-4d BOM=%s' % (rel, kind, b.count(b'\r'), l, l - c, bom))

# ---------- 3) 新增文件是否存在 ----------
log('')
log('== 新增页面/资源清单 ==')
for rel in ['朋友圈.html', '我的朋友圈.html', '朋友圈发布.html', '发布.html', '赞助.html',
            '个人资料.html', '好友.html', '私聊.html', '动态.html',
            'assets/xt-moments.js', 'assets/xt-moments.css', 'assets/xt-sponsor.js',
            'assets/xt-profile.js', 'assets/xt-profile.css', 'assets/xt-android.js',
            '需求20-移动端适配规格与验收标准-20260917.md', '学习工作台-安卓App.apk']:
    fp = os.path.join(ROOT, rel)
    log('  %-46s %s' % (rel, ('OK %d B' % os.path.getsize(fp)) if os.path.exists(fp) else 'MISSING'))

# ---------- 4) node --check ----------
log('')
log('== node --check ==')
for rel in ['assets/app.js', 'assets/api.js', 'assets/chat-local.js', 'assets/admin-contact.js',
            'assets/importer.js', 'assets/xt-profile.js', 'assets/xt-moments.js',
            'assets/voiceplayer.js', 'assets/xt-android.js', 'assets/ai-page.js', 'assets/ai-service.js']:
    fp = os.path.join(ROOT, rel)
    if not os.path.exists(fp):
        log('  %-32s MISSING' % rel); continue
    r = subprocess.run([NODE, '--check', fp], capture_output=True)
    err = (r.stderr or b'').decode('utf-8', 'replace').strip().splitlines()
    log('  %-32s rc=%d %s' % (rel, r.returncode, (err[0][:110] if err else '')))

# ---------- 5) git status 概览 ----------
log('')
log('== git status --porcelain 概览 ==')
r = subprocess.run(['git', '-C', ROOT, 'status', '--porcelain'], capture_output=True)
lines = (r.stdout or b'').decode('utf-8', 'replace').splitlines()
log('  改动条目数 = %d' % len(lines))
for ln in lines:
    if ln.strip().endswith('.bak-pre-r73-20260917') or '.bak' in ln:
        continue
    log('  ' + ln)

open(os.path.join(ROOT, 'tools', '_r73_api_check.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_api_check.txt lines=%d' % len(out))
