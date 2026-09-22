# -*- coding: utf-8 -*-
"""R165 上线前探针：比对线上 vs 本地，产出精确发布清单（只读，不改任何东西）。

输出 tools/_r165_probe_live_out.txt
"""
import os, re, io, json, time, hashlib, urllib.request, urllib.parse, urllib.error

ROOT = r'D:\下载的文件\学习工作台'
assert ROOT == r'D:\下载的文件\学习工作台'
HOST = '110.42.134.62'
OUT = os.path.join(ROOT, 'tools', '_r165_probe_live_out.txt')
LOG = []


def log(s=''):
    LOG.append(str(s)); print(s)


def http(path, timeout=30):
    url = 'http://' + HOST + path
    try:
        rq = urllib.request.Request(url, headers={'Accept-Encoding': 'identity',
                                                  'Cache-Control': 'no-cache',
                                                  'User-Agent': 'r165-probe'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


def lmd5(rel):
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        return None
    return hashlib.md5(open(p, 'rb').read()).hexdigest()


# ---- 0) 版本接口 ----
st, b = http('/api/app/version')
log('===== 线上 /api/app/version  HTTP %s =====' % st)
try:
    log(json.dumps(json.loads(b.decode('utf-8')), ensure_ascii=False, indent=2)[:900])
except Exception:
    log(b[:300].decode('utf-8', 'replace'))

# ---- 1) 本批 4 个文件：本地 vs 线上 ----
BATCH = [
    'assets/voiceplayer.js',
    'assets/data/listening-ext.json',
    '英语.html',
    '学途.html',
]
log('\n===== 本批 4 件：本地 md5 vs 线上 md5 =====')
batch_rows = []
for rel in BATCH:
    lh = lmd5(rel)
    lp = '/' + urllib.parse.quote(rel)
    st, body = http(lp + '?cb=%d' % time.time())
    rh = hashlib.md5(body).hexdigest() if isinstance(body, bytes) and st == 200 else '-'
    same = (lh == rh)
    log('  %-32s HTTP=%-4s local=%s live=%s  %s' % (rel, st, (lh or 'MISS')[:12], rh[:12],
                                                   'SAME' if same else '*** DIFF ***'))
    batch_rows.append((rel, st, lh, rh, same))

# ---- 2) 线上 英语.html / 学途.html 引用的 assets 戳 vs 本地 ----
log('\n===== 线上页引用戳 vs 本地页引用戳 =====')
for pg in ('英语.html', '学途.html'):
    st, body = http('/' + urllib.parse.quote(pg) + '?cb=%d' % time.time())
    live = {}
    if isinstance(body, bytes):
        t = body.decode('utf-8', 'replace')
        for m in re.finditer(r'assets/([A-Za-z0-9._-]+)\?v=([0-9a-zA-Z]+)', t):
            live[m.group(1)] = m.group(2)
    loc = {}
    s = io.open(os.path.join(ROOT, pg), encoding='utf-8').read()
    for m in re.finditer(r'assets/([A-Za-z0-9._-]+)\?v=([0-9a-zA-Z]+)', s):
        loc[m.group(1)] = m.group(2)
    log('  --- %s (live HTTP %s, %d refs) ---' % (pg, st, len(live)))
    for k in sorted(set(list(live.keys()) + list(loc.keys()))):
        a, c = live.get(k, '(缺)'), loc.get(k, '(缺)')
        flag = '' if a == c else '   <<< 戳不同'
        if a != c:
            log('      %-26s live=%-12s local=%-12s%s' % (k, a, c, flag))
    if live and loc and set(live) == set(loc) and all(live[k] == loc[k] for k in live):
        log('      （全部一致）')

# ---- 3) 两页引用的每个 asset：线上内容 md5 vs 本地内容 md5 ----
log('\n===== 两页所引用 assets 的内容一致性（线上 vs 本地）=====')
refs = set()
for pg in ('英语.html', '学途.html'):
    s = io.open(os.path.join(ROOT, pg), encoding='utf-8').read()
    for m in re.finditer(r'assets/([A-Za-z0-9._-]+)', s):
        refs.add('assets/' + m.group(1))
refs.add('assets/voiceplayer.js')
refs.add('assets/data/listening-ext.json')
bad = []
for rel in sorted(refs):
    lh = lmd5(rel)
    st, body = http('/' + urllib.parse.quote(rel) + '?cb=%d' % time.time())
    rh = hashlib.md5(body).hexdigest() if isinstance(body, bytes) and st == 200 else '-'
    ok = (lh == rh)
    if not ok:
        bad.append((rel, st, lh, rh))
    log('  %-34s HTTP=%-4s %s' % (rel, st, 'SAME' if ok else '*** DIFF ***'))
log('  差异文件数 = %d' % len(bad))
for rel, st, lh, rh in bad:
    log('    DIFF %-30s HTTP=%s local=%s live=%s' % (rel, st, (lh or 'MISS')[:12], rh[:12]))

# ---- 4) 结论 ----
log('\n===== 结论 =====')
must = [r for r in batch_rows if not r[4]]
log('本批必须上传：' + (', '.join(r[0] for r in must) if must else '无（线上已是最新）'))
if bad:
    log('⚠ 两页引用但线上内容仍不同的 assets（需一并纳入闭包）：')
    for rel, st, lh, rh in bad:
        log('   - %s (HTTP %s)' % (rel, st))
else:
    log('两页引用的其它 assets 线上与本地内容一致 → 闭包安全')
log('\n[written] ' + OUT)
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
