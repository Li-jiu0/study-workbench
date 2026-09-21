# -*- coding: utf-8 -*-
# R72 打戳：独立复核 v2（标签解析；裸路径只看 assets/；幂等看真实变更）
import os, re, glob

BASE = r'D:\下载的文件\学习工作台'
NEW = '20260916S'
BUMP = ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']
BAK = '.bak-pre-r72-20260917'

files = sorted(glob.glob(os.path.join(BASE, '*.html')))
out = []
out.append('root html count = %d' % len(files))

def rb(p):
    with open(p, 'rb') as f:
        return f.read()
def rd(p):
    return rb(p).decode('utf-8')

TAG = re.compile(r'<(?:script|link)\b[^>]*>', re.I)
ATTR = re.compile(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
RX_ASSET = re.compile(r'^assets/([^"\'?]+)\?v=(.+)$')
RX_ANYSTAMP = re.compile(r'^(.+?)\?v=(.+)$')

dist = {}          # 所有带 ?v= 的引用（任意路径）的戳分布
per_asset = {}     # 7 目标资产 戳 -> 次数
bare_assets = []   # assets/ 路径且无 ?v=（违规）
other_stamped = [] # 非 assets/ 路径但带 ?v=（如 data/xxx.js）

for p in files:
    t = rd(p)
    for tg in TAG.findall(t):
        for u in ATTR.findall(tg):
            ma = RX_ASSET.match(u)
            if ma:
                a, s = ma.group(1), ma.group(2)
                dist[s] = dist.get(s, 0) + 1
                if a in BUMP:
                    per_asset.setdefault(a, {})
                    per_asset[a][s] = per_asset[a].get(s, 0) + 1
            elif '?v=' in u:
                ms = RX_ANYSTAMP.match(u)
                if ms:
                    dist[ms.group(2)] = dist.get(ms.group(2), 0) + 1
                    other_stamped.append((os.path.basename(p), u))
            else:
                if u.startswith('assets/'):
                    bare_assets.append((os.path.basename(p), u))

out.append('S_AFTER stamp dist = %s  (total=%d)' % (dict(sorted(dist.items())), sum(dist.values())))
out.append('')
out.append('-- 7 目标资产 独立复核 --')
bad = []
for a in BUMP:
    d = per_asset.get(a, {})
    if a == 'notify.js':
        ok = (len(d) == 0)
        if not ok: bad.append('notify.js has refs %s' % d)
        out.append('%-16s %-24s -> %s' % (a, (d if d else 'NO-REFS'), 'PASS(应无引用)' if ok else 'FAIL'))
    else:
        ok = (list(d.keys()) == [NEW])
        if not ok: bad.append('%s stamps=%s' % (a, d))
        out.append('%-16s %-24s -> %s' % (a, d, 'PASS(全 S)' if ok else 'FAIL'))
out.append('asset-level bad = %s' % (bad if bad else 'NONE'))

out.append('')
acc = 0
for p in files:
    t = rd(p)
    n = t.count('.js.js?v=') + t.count('.css.css?v=')
    if n:
        out.append('ACCIDENT %s x%d' % (os.path.basename(p), n)); acc += n
out.append('accidental .js.js?v=/.css.css?v= count = %d' % acc)

# 追加：原始正则（非标签解析）裸 assets 扫描，双保险
raw_bare = []
for p in files:
    t = rd(p)
    for m in re.finditer(r'(?:src|href)=["\'](assets/[^"\']+)["\']', t):
        if '?v=' not in m.group(1):
            raw_bare.append((os.path.basename(p), m.group(1)))
out.append('raw-regex bare assets count = %d' % len(raw_bare))
for x in raw_bare[:40]:
    out.append('   %s  %s' % x)
out.append('tag-parse bare assets count = %d' % len(bare_assets))
for x in bare_assets[:40]:
    out.append('   %s  %s' % x)
out.append('non-assets stamped refs (data/ 等) = %d' % len(other_stamped))
for x in other_stamped[:10]:
    out.append('   %s  %s' % x)

out.append('')
out.append('-- 行尾 profile --')
lone_files = []
for p in files:
    b = rb(p)
    crlf = b.count(b'\r\n'); lf = b.count(b'\n'); lone = lf - crlf
    if lone != 0:
        lone_files.append((os.path.basename(p), crlf, lone))
out.append('files with loneLF != 0 : %d' % len(lone_files))
for x in lone_files:
    out.append('   %-26s CRLF=%d loneLF=%d' % x)

out.append('')
out.append('-- ai-settings.html 行尾溯源（与 pre-r72 备份对比）--')
target = os.path.join(BASE, 'ai-settings.html'); bkp = target + BAK
b = rb(target)
out.append('current : bytes=%d CRLF=%d loneLF=%d' % (len(b), b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n')))
if os.path.exists(bkp):
    bb = rb(bkp)
    out.append('backup  : bytes=%d CRLF=%d loneLF=%d' % (len(bb), bb.count(b'\r\n'), bb.count(b'\n') - bb.count(b'\r\n')))

# 幂等性：只统计「真实内容变化」
out.append('')
out.append('-- 幂等性（真实变更应为 0）--')
def make_rx(asset):
    return re.compile(r'(?P<attr>(?:src|href)=)(?P<q>["\'])assets/' + re.escape(asset) + r'\?v=[^"\']+(?P=q)')
rxs = [(a, make_rx(a)) for a in BUMP]
real_changes = 0
for p in files:
    t = rd(p)
    for a, rx in rxs:
        t2, n = rx.subn(lambda m, a=a: m.group('attr') + m.group('q') + 'assets/' + a + '?v=' + NEW + m.group('q'), t)
        if t2 != t:
            real_changes += 1
out.append('real content changes on re-run = %d (期望 0)' % real_changes)

with open(os.path.join(BASE, 'tools', 'r72_bump_verify_out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')
print('VERIFY DONE')
