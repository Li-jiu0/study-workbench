# -*- coding: utf-8 -*-
"""R165 全站差异盘点（只读）：本地站点文件 vs 线上 md5。产出 tools/_r165_probe_all_out.txt"""
import os, re, io, time, hashlib, urllib.request, urllib.parse, urllib.error

ROOT = r'D:\下载的文件\学习工作台'
HOST = '110.42.134.62'
OUT = os.path.join(ROOT, 'tools', '_r165_probe_all_out.txt')
LOG = []


def log(s=''):
    LOG.append(str(s)); print(s)


def http(path, timeout=25):
    try:
        rq = urllib.request.Request('http://' + HOST + path,
                                    headers={'Accept-Encoding': 'identity',
                                             'Cache-Control': 'no-cache',
                                             'User-Agent': 'r165-all'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


def md5f(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()


TARGETS = []
for f in sorted(os.listdir(ROOT)):
    if f.lower().endswith('.html'):
        TARGETS.append(f)
for base, _dirs, files in os.walk(os.path.join(ROOT, 'assets')):
    for f in files:
        if f.endswith(('.js', '.css', '.json')):
            rel = os.path.relpath(os.path.join(base, f), ROOT).replace(os.sep, '/')
            TARGETS.append(rel)

diff, same, missing = [], [], []
for rel in TARGETS:
    lp = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(lp):
        continue
    lh = md5f(lp)
    st, body = http('/' + urllib.parse.quote(rel) + '?cb=%d' % time.time())
    rh = hashlib.md5(body).hexdigest() if isinstance(body, bytes) and st == 200 else None
    if lh == rh:
        same.append(rel)
    elif rh is None:
        missing.append((rel, st))
    else:
        diff.append(rel)

log('本地站点文件总数（html + assets） = %d' % len(TARGETS))
log('线上一致 = %d   内容不同 = %d   线上缺失/异常 = %d' % (len(same), len(diff), len(missing)))
log('\n===== 内容不同（本地新，待发）=====')
for r in diff:
    log('  DIFF  ' + r)
log('\n===== 线上缺失/异常 =====')
for r, st in missing:
    log('  MISS  %-46s HTTP=%s' % (r, st))
log('\n[written] ' + OUT)
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
