# -*- coding: utf-8 -*-
# R72 打戳：执行（二进制读写保 CRLF / BOM；锚定 src=/href= 属性）
import os, re, glob, shutil

BASE = r'D:\下载的文件\学习工作台'
NEW = '20260916S'
BUMP = ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']
BAK = '.bak-pre-r72-20260917'
STAMP = re.compile(r'\?v=([^"\'\s>]+)')

files = sorted(glob.glob(os.path.join(BASE, '*.html')))
out = []
out.append('root html count = %d' % len(files))
out.append('NEW stamp = %s' % NEW)

def stampdist(paths):
    d = {}
    for p in paths:
        with open(p, 'rb') as f:
            t = f.read().decode('utf-8').replace('\r\n', '\n')
        for m in STAMP.finditer(t):
            d[m.group(1)] = d.get(m.group(1), 0) + 1
    return dict(sorted(d.items()))

out.append('BEFORE stamp dist = %s' % stampdist(files))

def make_rx(asset):
    # 锚定 (src|href)= + 引号 + assets/<asset>?v=... + 同款收尾引号
    return re.compile(
        r'(?P<attr>(?:src|href)=)(?P<q>["\'])assets/' + re.escape(asset) + r'\?v=[^"\']+(?P=q)'
    )

rxs = [(a, make_rx(a)) for a in BUMP]

total_hits = {}
per_file = {}
changed = 0
for p in files:
    with open(p, 'rb') as f:
        raw = f.read()
    txt = raw.decode('utf-8')
    orig = txt
    fh = {}
    for a, rx in rxs:
        def repl(m, a=a):
            return m.group('attr') + m.group('q') + 'assets/' + a + '?v=' + NEW + m.group('q')
        txt, n = rx.subn(repl, txt)
        if n:
            total_hits[a] = total_hits.get(a, 0) + n
            fh[a] = n
    if txt != orig:
        bkp = p + BAK
        if not os.path.exists(bkp):
            shutil.copy2(p, bkp)
            bak_state = 'NEW-BKP'
        else:
            bak_state = 'REUSED'
        with open(p, 'wb') as f:
            f.write(txt.encode('utf-8'))
        changed += 1
        per_file[os.path.basename(p)] = (fh, bak_state)

out.append('changed files = %d' % changed)
out.append('per-asset hits = %s' % dict(sorted(total_hits.items())))

# 逐资产期望断言
EXPECT_POS = {'app.js', 'api.js', 'chat-local.js', 'importer.js', 'ai-service.js', 'ai-settings.js'}
bad = []
for a in BUMP:
    h = total_hits.get(a, 0)
    if a in EXPECT_POS and h <= 0:
        bad.append('MISSING refs for %s' % a)
    if a == 'notify.js' and h != 0:
        bad.append('UNEXPECTED refs for notify.js = %d' % h)
out.append('assertion bad = %s' % (bad if bad else 'NONE'))

# loneLF 校验
out.append('')
out.append('-- loneLF check --')
lone_bad = []
for p in files:
    with open(p, 'rb') as f:
        b = f.read()
    lone = b.count(b'\n') - b.count(b'\r\n')
    if lone != 0:
        lone_bad.append('%s loneLF=%d' % (os.path.basename(p), lone))
out.append('files with loneLF!=0 = %s' % (lone_bad if lone_bad else 'NONE'))

out.append('')
out.append('AFTER stamp dist = %s' % stampdist(files))

out.append('')
out.append('-- per-file change detail --')
for k in sorted(per_file):
    out.append('   %-28s %s %s' % (k, per_file[k][0], per_file[k][1]))

with open(os.path.join(BASE, 'tools', 'r72_bump_out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')
print('DONE')
