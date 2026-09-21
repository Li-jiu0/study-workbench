# -*- coding: utf-8 -*-
# R72 打戳：侦察（只读统计）
import os, re, glob, io

BASE = r'D:\下载的文件\学习工作台'
files = sorted(glob.glob(os.path.join(BASE, '*.html')))
print('root html count =', len(files))

def rd(p):
    return io.open(p, 'r', encoding='utf-8-sig', newline='').read().replace('\r\n', '\n')

# 全站 ?v= 戳分布（戳 token = ?v= 之后到引号/空白前的整串）
STAMP = re.compile(r'\?v=([^"\'\s>]+)')
dist = {}
for p in files:
    t = rd(p)
    for m in STAMP.finditer(t):
        dist[m.group(1)] = dist.get(m.group(1), 0) + 1
print('stamp dist:', dict(sorted(dist.items())))
print('total ?v= refs =', sum(dist.values()))

BUMP = ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']
print('\n-- per-asset anchored refs (src/href="assets/<a>?v=<stamp>") --')
for a in BUMP:
    rx = re.compile(r'(?:src|href)="assets/' + re.escape(a) + r'\?v=([^"]+)"')
    tot = {}
    fl = 0
    for p in files:
        t = rd(p)
        mm = rx.findall(t)
        if mm:
            fl += 1
            for v in mm:
                tot[v] = tot.get(v, 0) + 1
    print('%-16s refs=%s files=%d' % (a, dict(tot), fl))

print('\n-- per-asset LOOSE refs (any ?v= token containing the asset name) --')
for a in BUMP:
    rx = re.compile(re.escape(a) + r'\?v=([^"\'\s>]+)')
    tot = {}
    for p in files:
        t = rd(p)
        for v in rx.findall(t):
            tot[v] = tot.get(v, 0) + 1
    print('%-16s %s' % (a, dict(tot)))

print('\n-- accidental .js.js?v= / .css.css?v= --')
hit = 0
for p in files:
    t = rd(p)
    if '.js.js?v=' in t or '.css.css?v=' in t:
        print('HIT', os.path.basename(p)); hit += 1
print('accidental count =', hit)

print('\n-- bare asset refs (no ?v=) --')
bare = []
for p in files:
    t = rd(p)
    for m in re.finditer(r'(?:src|href)="(assets/[^"]+\.(?:js|css))"', t):
        bare.append((os.path.basename(p), m.group(1)))
print('bare count =', len(bare))
for x in bare[:60]:
    print('   ', x)
