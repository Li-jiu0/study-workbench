# -*- coding: utf-8 -*-
"""R165 页面差异分类（只读）：判断每个差异页面是「仅版本戳不同」还是「有实质改动」。
产出 tools/_r165_page_diff_out.txt
"""
import os, re, io, time, difflib, urllib.request, urllib.parse, urllib.error

ROOT = r'D:\下载的文件\学习工作台'
HOST = '110.42.134.62'
OUT = os.path.join(ROOT, 'tools', '_r165_page_diff_out.txt')
LOG = []
STAMP = re.compile(r'\?v=[0-9A-Za-z]+')


def log(s=''):
    LOG.append(str(s)); print(s)


def http(path, timeout=25):
    try:
        rq = urllib.request.Request('http://' + HOST + path,
                                    headers={'Accept-Encoding': 'identity',
                                             'Cache-Control': 'no-cache',
                                             'User-Agent': 'r165-pagediff'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


PAGES = [f for f in sorted(os.listdir(ROOT)) if f.lower().endswith('.html')
         and not f.startswith('_')]

stamp_only, real = [], []
log('%-26s %-8s %-8s %s' % ('页面', '行数差', '戳差异', '分类'))
log('-' * 78)
for f in PAGES:
    lp = os.path.join(ROOT, f)
    loc = io.open(lp, encoding='utf-8', errors='replace').read()
    st, body = http('/' + urllib.parse.quote(f) + '?cb=%d' % time.time())
    if st != 200 or not isinstance(body, bytes):
        continue
    live = body.decode('utf-8', 'replace')
    if live == loc:
        continue
    locn = STAMP.sub('?v=', loc)
    liven = STAMP.sub('?v=', live)
    if locn == liven:
        stamp_only.append(f)
        log('%-26s %-8s %-8s %s' % (f, '-', '是', '仅版本戳'))
        continue
    # 实质差异：统计 changed lines
    dl = list(difflib.unified_diff(live.splitlines(), loc.splitlines(), lineterm='', n=0))
    changed = [x for x in dl if x[:1] in '+-' and not x.startswith(('+++', '---'))]
    real.append((f, len(changed)))
    log('%-26s %-8d %-8s %s' % (f, len(changed), '否', '有实质改动'))
    shown = 0
    for x in changed:
        if shown >= 5:
            break
        t = x.strip()
        if not t or t in ('+', '-'):
            continue
        if STAMP.sub('?v=', t[1:]) == STAMP.sub('?v=', '') and len(t) < 8:
            continue
        log('        %s' % t[:150])
        shown += 1

log('\n===== 汇总 =====')
log('仅版本戳差异页面 = %d：%s' % (len(stamp_only), '、'.join(stamp_only) if stamp_only else '无'))
log('有实质改动页面 = %d' % len(real))
for f, n in sorted(real, key=lambda x: -x[1]):
    log('   %-26s changed=%d' % (f, n))
log('\n[written] ' + OUT)
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
